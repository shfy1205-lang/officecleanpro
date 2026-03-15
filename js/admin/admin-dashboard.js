/**
 * admin-dashboard.js - 대시보드 탭
 * 오늘 청소 현황 + 월간 요약 + 자동 일정 생성 (일별 / 월별)
 * 빈도 지원: weekly(매주), biweekly(격주) — anchor_date 기반
 */

// ─── 오늘 청소 현황 상태 ───
let todayDate = '';
let todayWorkerFilter = '';
let todayStatusFilter = 'all';
let todayCleaningCache = null;

// ─── 자동 일정 생성 상태 ───
let autoGenResult = null;        // 일별 생성 결과
let monthGenResult = null;       // 월별 생성 결과
let monthGenMonth = '';           // 월별 생성 선택 월
let monthGenBusy = false;         // 월별 생성 진행 중

// ═══════════════════════════════════════════════════════
//  빈도 관련 유틸리티
// ═══════════════════════════════════════════════════════

/**
 * 격주(biweekly) 스케줄이 해당 날짜에 해당하는지 판단.
 * anchor_date를 기준으로 주 차이가 짝수이면 '활성 주'.
 * anchor_date가 없으면 항상 활성(fallback).
 */
function isBiweeklyMatch(anchorDate, targetDateStr) {
  if (!anchorDate) return true; // anchor 미설정 시 매주 취급
  const anchor = new Date(anchorDate + 'T00:00:00');
  const target = new Date(targetDateStr + 'T00:00:00');
  const diffMs = target.getTime() - anchor.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  return (Math.abs(diffWeeks) % 2) === 0;
}

/**
 * 주어진 날짜에 해당 스케줄이 활성인지 판단.
 * - weekly: 요일만 매칭되면 항상 활성
 * - biweekly: 요일 매칭 + anchor_date 기반 격주 체크
 */
function isScheduleActiveOnDate(schedule, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();

  // 요일 불일치
  if (schedule.weekday !== weekday) return false;
  // 비활성 스케줄
  if (!schedule.is_active) return false;

  const freq = schedule.frequency || 'weekly';

  if (freq === 'biweekly') {
    return isBiweeklyMatch(schedule.anchor_date, dateStr);
  }

  // weekly (기본)
  return true;
}

// ─── 오늘 청소 데이터 로드 (선택된 날짜 기준) ───
async function loadTodayCleaning(dateStr) {
  const { data: tasks, error } = await sb.from('tasks')
    .select('*')
    .eq('task_date', dateStr);

  if (error) {
    console.error('loadTodayCleaning error:', error);
  }

  // 빈도 기반으로 해당 날짜에 활성인 스케줄만 필터링
  const matchedSchedules = adminData.schedules.filter(s => isScheduleActiveOnDate(s, dateStr));
  const scheduledCompanyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

  const month = dateStr.substring(0, 7); // YYYY-MM

  const result = scheduledCompanyIds.map(companyId => {
    const company = adminData.companies.find(c => c.id === companyId);
    if (!company || company.status !== 'active') return null;

    // 이번 달 배정 직원
    const assigns = adminData.assignments.filter(
      a => a.company_id === companyId && a.month === month
    );

    // 해당 날짜의 task
    const companyTasks = (tasks || []).filter(t => t.company_id === companyId);
    const completedTask = companyTasks.find(t => t.status === 'completed');

    // 미해결 요청
    const unresolvedReqs = adminData.requests.filter(
      r => r.company_id === companyId && !r.is_resolved && !isExpired(r.expires_at)
    );

    return {
      companyId,
      companyName: company.name,
      address: company.address || '',
      areaName: company.area_name || '',
      workers: assigns.map(a => getWorkerName(a.worker_id)),
      workerIds: assigns.map(a => a.worker_id),
      status: completedTask ? 'completed' : 'incomplete',
      hasProblem: unresolvedReqs.length > 0,
      completedAt: completedTask ? (completedTask.updated_at || completedTask.created_at) : null,
      requestCount: unresolvedReqs.length,
    };
  }).filter(Boolean);

  todayCleaningCache = result;
  return result;
}

// ─── 필터 적용 ───
function getFilteredCleaning() {
  if (!todayCleaningCache) return [];
  let data = todayCleaningCache;

  if (todayWorkerFilter) {
    data = data.filter(d => d.workerIds.includes(todayWorkerFilter));
  }

  if (todayStatusFilter === 'completed') {
    data = data.filter(d => d.status === 'completed');
  } else if (todayStatusFilter === 'incomplete') {
    data = data.filter(d => d.status === 'incomplete');
  } else if (todayStatusFilter === 'problem') {
    data = data.filter(d => d.hasProblem);
  }

  return data;
}

// ═══════════════════════════════════════════════════════
//  일별 자동 청소 일정 생성 (빈도 지원)
// ═══════════════════════════════════════════════════════

async function generateTodayTasks() {
  const dateStr = todayDate || today();
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  const month = dateStr.substring(0, 7);
  const dayName = WEEKDAY_NAMES[weekday];

  let created = 0;
  let duplicated = 0;
  let inactiveSkipped = 0;
  let noWorkerSkipped = 0;
  const createdList = [];

  // 빈도 기반으로 해당 날짜에 활성인 스케줄만 필터링
  const matchedSchedules = adminData.schedules.filter(s => isScheduleActiveOnDate(s, dateStr));

  if (matchedSchedules.length === 0) {
    autoGenResult = { created: 0, duplicated: 0, inactiveSkipped: 0, noWorkerSkipped: 0, list: [], dateStr, dayName };
    renderDashboardHTML();
    toast(`${dayName}요일에 예정된 스케줄이 없습니다`, 'info');
    return;
  }

  const companyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

  const { data: existingTasks, error: taskErr } = await sb.from('tasks')
    .select('company_id, worker_id')
    .eq('task_date', dateStr);

  if (taskErr) {
    toast('기존 일정 조회 실패: ' + taskErr.message, 'error');
    return;
  }

  const existingSet = new Set(
    (existingTasks || []).map(t => `${t.company_id}|${t.worker_id}`)
  );

  const toInsert = [];

  for (const companyId of companyIds) {
    const company = adminData.companies.find(c => c.id === companyId);

    if (!company || company.status !== 'active') {
      inactiveSkipped++;
      continue;
    }

    const assigns = adminData.assignments.filter(
      a => a.company_id === companyId && a.month === month
    );

    if (assigns.length === 0) {
      noWorkerSkipped++;
      continue;
    }

    for (const assign of assigns) {
      const key = `${companyId}|${assign.worker_id}`;

      if (existingSet.has(key)) {
        duplicated++;
        continue;
      }

      toInsert.push({
        company_id: companyId,
        worker_id: assign.worker_id,
        task_date: dateStr,
        status: 'scheduled',
        task_source: 'auto',
        memo: null,
      });

      createdList.push({
        companyName: company.name,
        workerName: getWorkerName(assign.worker_id),
        date: dateStr,
        status: 'scheduled',
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await sb.from('tasks').insert(toInsert);
    if (insertErr) {
      toast('일정 생성 실패: ' + insertErr.message, 'error');
      return;
    }
    created = toInsert.length;
  }

  // 생성 로그 기록
  await saveGenerationLog({
    action_type: 'today_generate',
    target_month: month,
    created_count: created,
    skipped_count: duplicated,
    excluded_inactive: inactiveSkipped,
    excluded_no_worker: noWorkerSkipped,
  });

  autoGenResult = { created, duplicated, inactiveSkipped, noWorkerSkipped, list: createdList, dateStr, dayName };

  await loadTodayCleaning(dateStr);
  renderDashboardHTML();

  if (created > 0) {
    toast(`${created}건 일정 생성 완료!`);
  } else {
    toast('새로 생성할 일정이 없습니다', 'info');
  }
}

// ─── 일별 생성 결과 HTML ───
function buildAutoGenResultHTML() {
  if (!autoGenResult) return '';

  const r = autoGenResult;
  const hasResult = r.created > 0 || r.duplicated > 0 || r.inactiveSkipped > 0 || r.noWorkerSkipped > 0;
  if (!hasResult) return '';

  let html = `
    <div class="ag-result-box">
      <div class="ag-result-header">
        <span class="ag-result-title">일정 생성 결과</span>
        <span class="text-muted" style="font-size:11px">${r.dateStr} (${r.dayName})</span>
        <button class="btn-sm btn-gray" onclick="closeAutoGenResult()" style="margin-left:auto;font-size:10px;padding:3px 8px">닫기</button>
      </div>
      <div class="ag-result-stats">
        <div class="ag-stat">
          <span class="ag-stat-num green">${r.created}</span>
          <span class="ag-stat-label">생성</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num yellow">${r.duplicated}</span>
          <span class="ag-stat-label">중복 제외</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num" style="color:var(--text2)">${r.inactiveSkipped}</span>
          <span class="ag-stat-label">비활성 제외</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num red">${r.noWorkerSkipped}</span>
          <span class="ag-stat-label">담당자 없음</span>
        </div>
      </div>`;

  if (r.list.length > 0) {
    html += `
      <div class="ag-preview">
        <div class="ag-preview-title">생성된 일정 (${r.list.length}건)</div>
        <div class="ag-preview-table-pc">
          <table>
            <thead><tr><th>업체명</th><th>담당직원</th><th>날짜</th><th>상태</th></tr></thead>
            <tbody>${r.list.map(item => `
              <tr>
                <td style="font-weight:600">${item.companyName}</td>
                <td>${item.workerName}</td>
                <td>${item.date}</td>
                <td><span class="badge badge-today">예정</span></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
        <div class="ag-preview-cards-mobile">
          ${r.list.map(item => `
            <div class="ag-preview-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600">${item.companyName}</span>
                <span class="badge badge-today">예정</span>
              </div>
              <div class="text-muted" style="font-size:12px;margin-top:4px">${item.workerName} · ${item.date}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function closeAutoGenResult() {
  autoGenResult = null;
  renderDashboardHTML();
}


// ═══════════════════════════════════════════════════════
//  월 전체 청소 일정 생성 (빈도 지원)
// ═══════════════════════════════════════════════════════

/**
 * 선택한 월의 모든 날짜에 대해 스케줄 기반 tasks를 일괄 생성한다.
 *
 * 로직:
 * 1) 해당 월의 1일~말일 날짜 배열 생성
 * 2) company_schedule의 is_active=true 스케줄 조회
 * 3) 각 날짜의 요일과 스케줄 weekday 매칭 + 빈도(frequency) 체크
 *    - weekly: 매주 해당 요일
 *    - biweekly: anchor_date 기준 격주 체크
 * 4) companies.status='active' + company_workers 담당직원 확인
 * 5) tasks에서 해당 월 전체 기존 데이터 조회 → 중복 체크 Set
 * 6) 중복 아닌 건만 일괄 INSERT (200건 배치)
 */
async function generateMonthlyTasks() {
  if (monthGenBusy) return;

  const monthInput = $('monthGenInput');
  if (!monthInput) return;
  const month = monthInput.value;  // "2026-04"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    toast('올바른 월을 선택하세요', 'error');
    return;
  }

  monthGenBusy = true;
  monthGenMonth = month;
  monthGenResult = null;

  // 버튼 로딩 상태
  const btn = $('monthGenBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="ag-gen-icon">⏳</span> 생성 중...';
  }

  try {
    await _doGenerateMonthlyTasks(month);
  } catch (e) {
    console.error('generateMonthlyTasks error:', e);
    toast('월 일정 생성 중 오류 발생', 'error');
  } finally {
    monthGenBusy = false;
    renderDashboardHTML();
  }
}

async function _doGenerateMonthlyTasks(month) {
  // 1) 해당 월의 모든 날짜 생성
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();  // 말일
  const allDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, '0');
    const mm = String(mon).padStart(2, '0');
    allDates.push(`${year}-${mm}-${dd}`);
  }

  // 2) 활성 스케줄 가져오기
  const activeSchedules = adminData.schedules.filter(s => s.is_active);
  if (activeSchedules.length === 0) {
    monthGenResult = { month, created: 0, duplicated: 0, inactiveSkipped: 0, noWorkerSkipped: 0, totalDates: daysInMonth, list: [] };
    toast('활성 스케줄이 없습니다', 'info');
    return;
  }

  // 요일별 스케줄 맵: weekday → [schedule objects]
  const schedByWeekday = {};
  for (const s of activeSchedules) {
    if (!schedByWeekday[s.weekday]) schedByWeekday[s.weekday] = [];
    schedByWeekday[s.weekday].push(s);
  }

  // 3) 해당 월의 담당 직원 데이터 확보
  await ensureMonthData(month);
  const monthAssigns = adminData.assignments.filter(a => a.month === month);

  // 업체별 직원 맵
  const assignMap = {};
  for (const a of monthAssigns) {
    if (!assignMap[a.company_id]) assignMap[a.company_id] = [];
    assignMap[a.company_id].push(a);
  }

  // 4) 해당 월 기존 tasks 조회 (DB 직접)
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const { data: existingTasks, error: taskErr } = await sb.from('tasks')
    .select('company_id, worker_id, task_date')
    .gte('task_date', firstDay)
    .lte('task_date', lastDay);

  if (taskErr) {
    toast('기존 일정 조회 실패: ' + taskErr.message, 'error');
    return;
  }

  // 중복 체크 Set: "companyId|workerId|date"
  const existingSet = new Set(
    (existingTasks || []).map(t => `${t.company_id}|${t.worker_id}|${t.task_date}`)
  );

  // 5) 날짜별 순회하며 INSERT 대상 수집 (빈도 체크 포함)
  let created = 0;
  let duplicated = 0;
  let inactiveSkipped = 0;
  let noWorkerSkipped = 0;
  const toInsert = [];
  const createdList = [];
  const inactiveChecked = new Set();   // 중복 카운트 방지
  const noWorkerChecked = new Set();

  for (const dateStr of allDates) {
    const d = new Date(dateStr + 'T00:00:00');
    const weekday = d.getDay();

    const daySchedules = schedByWeekday[weekday];
    if (!daySchedules) continue;

    // 빈도 체크를 통과한 스케줄만 필터링
    const matchedSchedules = daySchedules.filter(s => isScheduleActiveOnDate(s, dateStr));
    if (matchedSchedules.length === 0) continue;

    const companyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

    for (const companyId of companyIds) {
      const company = adminData.companies.find(c => c.id === companyId);

      // 비활성 업체 제외
      if (!company || company.status !== 'active') {
        if (!inactiveChecked.has(companyId)) {
          inactiveSkipped++;
          inactiveChecked.add(companyId);
        }
        continue;
      }

      // 담당 직원
      const assigns = assignMap[companyId];
      if (!assigns || assigns.length === 0) {
        if (!noWorkerChecked.has(companyId)) {
          noWorkerSkipped++;
          noWorkerChecked.add(companyId);
        }
        continue;
      }

      for (const assign of assigns) {
        const key = `${companyId}|${assign.worker_id}|${dateStr}`;

        if (existingSet.has(key)) {
          duplicated++;
          continue;
        }

        toInsert.push({
          company_id: companyId,
          worker_id: assign.worker_id,
          task_date: dateStr,
          status: 'scheduled',
          task_source: 'auto',
          memo: null,
        });

        // 미리보기 리스트 (최대 50건만 수집 — UI 성능)
        if (createdList.length < 50) {
          createdList.push({
            companyName: company.name,
            workerName: getWorkerName(assign.worker_id),
            date: dateStr,
            status: 'scheduled',
          });
        }
      }
    }
  }

  // 6) 배치 INSERT (200건씩)
  const BATCH_SIZE = 200;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await sb.from('tasks').insert(batch);
    if (insertErr) {
      toast(`일정 생성 실패 (${i}~${i + batch.length}): ` + insertErr.message, 'error');
      // 이미 생성된 분까지는 카운트
      created += i;
      monthGenResult = { month, created, duplicated, inactiveSkipped, noWorkerSkipped, totalDates: daysInMonth, list: createdList, totalCreated: toInsert.length, error: true };
      return;
    }
  }
  created = toInsert.length;

  // 7) 생성 로그 기록
  await saveGenerationLog({
    action_type: 'month_generate',
    target_month: month,
    created_count: created,
    skipped_count: duplicated,
    excluded_inactive: inactiveSkipped,
    excluded_no_worker: noWorkerSkipped,
  });

  // 8) 결과 저장
  monthGenResult = {
    month,
    created,
    duplicated,
    inactiveSkipped,
    noWorkerSkipped,
    totalDates: daysInMonth,
    list: createdList,
    totalCreated: created,
    error: false,
  };

  if (created > 0) {
    toast(`${month} 월 일정 ${created}건 생성 완료!`);
  } else {
    toast('새로 생성할 일정이 없습니다', 'info');
  }

  // 오늘 데이터 새로고침 (오늘이 생성 월에 속하는 경우)
  if (todayDate && todayDate.startsWith(month)) {
    await loadTodayCleaning(todayDate);
  }
}

// ─── 월 생성 결과 HTML ───
function buildMonthGenResultHTML() {
  if (!monthGenResult) return '';

  const r = monthGenResult;
  const hasResult = r.created > 0 || r.duplicated > 0 || r.inactiveSkipped > 0 || r.noWorkerSkipped > 0;
  if (!hasResult) return '';

  let html = `
    <div class="ag-result-box mg-result-box">
      <div class="ag-result-header">
        <span class="ag-result-title">월 일정 생성 결과</span>
        <span class="text-muted" style="font-size:11px">${r.month} (${r.totalDates}일)</span>
        <button class="btn-sm btn-gray" onclick="closeMonthGenResult()" style="margin-left:auto;font-size:10px;padding:3px 8px">닫기</button>
      </div>
      <div class="ag-result-stats">
        <div class="ag-stat">
          <span class="ag-stat-num green">${r.created}</span>
          <span class="ag-stat-label">생성</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num yellow">${r.duplicated}</span>
          <span class="ag-stat-label">중복 제외</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num" style="color:var(--text2)">${r.inactiveSkipped}</span>
          <span class="ag-stat-label">비활성 업체</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-num red">${r.noWorkerSkipped}</span>
          <span class="ag-stat-label">담당자 없음</span>
        </div>
      </div>`;

  if (r.list.length > 0) {
    const showMore = r.totalCreated > r.list.length;
    html += `
      <div class="ag-preview">
        <div class="ag-preview-title">생성된 일정 미리보기 (${showMore ? r.list.length + '/' + r.totalCreated + '건' : r.list.length + '건'})</div>
        <div class="ag-preview-table-pc" style="max-height:320px;overflow-y:auto">
          <table>
            <thead><tr><th>업체명</th><th>담당직원</th><th>날짜</th><th>상태</th></tr></thead>
            <tbody>${r.list.map(item => `
              <tr>
                <td style="font-weight:600">${item.companyName}</td>
                <td>${item.workerName}</td>
                <td>${item.date}</td>
                <td><span class="badge badge-today">예정</span></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
        <div class="ag-preview-cards-mobile" style="max-height:320px;overflow-y:auto">
          ${r.list.map(item => `
            <div class="ag-preview-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600">${item.companyName}</span>
                <span class="badge badge-today">예정</span>
              </div>
              <div class="text-muted" style="font-size:12px;margin-top:4px">${item.workerName} · ${item.date}</div>
            </div>
          `).join('')}
        </div>
        ${showMore ? `<p class="text-muted" style="margin-top:6px;font-size:11px;text-align:center">외 ${r.totalCreated - r.list.length}건 더 있음</p>` : ''}
      </div>`;
  }

  html += '</div>';
  return html;
}

function closeMonthGenResult() {
  monthGenResult = null;
  renderDashboardHTML();
}


// ═══════════════════════════════════════════════════════
//  대시보드 렌더링
// ═══════════════════════════════════════════════════════

async function renderDashboard() {
  if (!todayDate) todayDate = today();
  if (!monthGenMonth) monthGenMonth = currentMonth();
  await loadTodayCleaning(todayDate);
  renderDashboardHTML();
}

function renderDashboardHTML() {
  const mc = $('mainContent');
  const filtered = getFilteredCleaning();
  const all = todayCleaningCache || [];

  // 오늘 청소 통계
  const cntTotal = all.length;
  const cntDone = all.filter(d => d.status === 'completed').length;
  const cntTodo = all.filter(d => d.status === 'incomplete').length;
  const cntProblem = all.filter(d => d.hasProblem).length;

  // 월간 통계 (기존)
  const activeCompanies = adminData.companies.filter(c => c.status === 'active').length;
  const activeWorkers = adminData.workers.filter(w => w.status === 'active' && w.role === 'staff').length;
  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);
  const totalPay = monthAssigns.reduce((s, a) => s + (a.pay_amount || 0), 0);
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);
  const totalContract = monthFin.reduce((s, f) => s + (f.contract_amount || 0), 0);

  const pendingRequests = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;
  const unpaidBillings = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidBillings.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);
  const activeLeads = adminData.leads.filter(l => !['won','lost'].includes(l.status)).length;

  // 직원 필터 옵션
  const staffList = getActiveWorkers();
  const workerOpts = staffList.map(w =>
    `<option value="${w.id}" ${todayWorkerFilter === w.id ? 'selected' : ''}>${w.name}</option>`
  ).join('');

  // 날짜 표시 텍스트
  const dateObj = new Date(todayDate + 'T00:00:00');
  const dayName = WEEKDAY_NAMES[dateObj.getDay()];
  const isToday = todayDate === today();
  const dateLabel = isToday ? `오늘 (${dayName})` : `${todayDate.substring(5).replace('-','/')} (${dayName})`;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      대시보드
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-gray" onclick="exportWorkers()" style="font-size:11px;padding:6px 10px">📥 직원</button>
        <button class="btn-sm btn-blue" onclick="exportAll()" style="font-size:11px;padding:6px 10px">📥 전체</button>
      </div>
    </div>

    <!-- ═══ 오늘 청소 현황 ═══ -->
    <div class="today-section">
      <div class="today-header">
        <span class="today-header-title">청소 현황</span>
        <span class="today-header-date">${dateLabel}</span>
      </div>

      <div class="stats-grid stats-grid-4">
        <div class="stat-card today-stat${todayStatusFilter === 'all' ? ' active' : ''}" onclick="filterTodayStatus('all')">
          <div class="stat-label">청소 예정</div>
          <div class="stat-value blue">${cntTotal}</div>
        </div>
        <div class="stat-card today-stat${todayStatusFilter === 'completed' ? ' active' : ''}" onclick="filterTodayStatus('completed')">
          <div class="stat-label">완료</div>
          <div class="stat-value green">${cntDone}</div>
        </div>
        <div class="stat-card today-stat${todayStatusFilter === 'incomplete' ? ' active' : ''}" onclick="filterTodayStatus('incomplete')">
          <div class="stat-label">미완료</div>
          <div class="stat-value yellow">${cntTodo}</div>
        </div>
        <div class="stat-card today-stat${todayStatusFilter === 'problem' ? ' active' : ''}" onclick="filterTodayStatus('problem')">
          <div class="stat-label">문제발생</div>
          <div class="stat-value red">${cntProblem}</div>
        </div>
      </div>

      <div class="today-filter-bar">
        <input type="date" class="today-date-input" value="${todayDate}" onchange="changeTodayDate(this.value)">
        <select class="today-filter-select" onchange="changeTodayWorker(this.value)">
          <option value="">전체 직원</option>
          ${workerOpts}
        </select>
        <select class="today-filter-select" id="todayStatusSelect" onchange="changeTodayStatusSelect(this.value)">
          <option value="all"${todayStatusFilter === 'all' ? ' selected' : ''}>전체 상태</option>
          <option value="completed"${todayStatusFilter === 'completed' ? ' selected' : ''}>완료</option>
          <option value="incomplete"${todayStatusFilter === 'incomplete' ? ' selected' : ''}>미완료</option>
          <option value="problem"${todayStatusFilter === 'problem' ? ' selected' : ''}>문제발생</option>
        </select>
        <button class="btn-sm btn-green ag-gen-btn" onclick="generateTodayTasks()">
          <span class="ag-gen-icon">⚡</span> 오늘 일정 생성
        </button>
      </div>

      ${buildAutoGenResultHTML()}

      ${filtered.length > 0 ? buildTodayTable(filtered) + buildTodayCards(filtered) : `
        <div class="empty-state" style="padding:32px 20px">
          <div class="empty-icon">📋</div>
          <p>${todayStatusFilter !== 'all' ? '해당 조건의 업체가 없습니다.' : '이 날짜에 예정된 청소가 없습니다.'}</p>
        </div>
      `}
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:28px 0">

    <!-- ═══ 월 전체 일정 생성 ═══ -->
    <div class="mg-section">
      <div class="section-title" style="font-size:15px;margin-bottom:12px">월 전체 청소 일정 생성</div>
      <div class="mg-control-bar">
        <input type="month" id="monthGenInput" class="mg-month-input" value="${monthGenMonth}">
        <button id="monthGenBtn" class="btn-sm btn-green ag-gen-btn" onclick="generateMonthlyTasks()" ${monthGenBusy ? 'disabled' : ''}>
          <span class="ag-gen-icon">📅</span> 월 일정 생성
        </button>
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:6px">선택한 월의 모든 스케줄 요일에 대해 청소 일정을 일괄 생성합니다. 격주 스케줄은 기준일(anchor) 기반으로 격주 판별됩니다.</p>
      ${buildMonthGenResultHTML()}
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:28px 0">

    <!-- ═══ 월간 현황 ═══ -->
    <div class="section-title" style="font-size:15px">월간 현황</div>
    ${monthSelectorHTML(selectedMonth, 'changeDashMonth')}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">활성 업체</div>
        <div class="stat-value blue">${activeCompanies}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">활성 직원</div>
        <div class="stat-value green">${activeWorkers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 계약 총액</div>
        <div class="stat-value yellow">${fmt(totalContract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 인건비 총액</div>
        <div class="stat-value red">${fmt(totalPay)}</div>
      </div>
    </div>

    ${pendingRequests > 0 ? `
      <div class="admin-alert" onclick="document.querySelector('.tab:nth-child(3)').click()">
        <span class="admin-alert-icon">!</span>
        <span>미처리 요청 <strong>${pendingRequests}건</strong>이 있습니다</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${totalUnpaid > 0 ? `
      <div class="admin-alert" style="border-color:rgba(239,68,68,0.3);background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))"
           onclick="document.querySelector('.tab:nth-child(6)').click()">
        <span class="admin-alert-icon" style="background:var(--red)">!</span>
        <span>미수금 <strong>${fmt(totalUnpaid)}원</strong> (${unpaidBillings.length}건)</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${activeLeads > 0 ? `
      <div class="admin-alert" style="border-color:rgba(59,130,246,0.3);background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.05))"
           onclick="document.querySelector('.tab:nth-child(5)').click()">
        <span class="admin-alert-icon" style="background:var(--accent)">!</span>
        <span>진행중 견적 <strong>${activeLeads}건</strong></span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    <div class="section-title" style="font-size:15px">최근 배정 현황</div>
    ${monthAssigns.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체</th><th>담당자</th><th>지급액</th></tr></thead>
          <tbody>${monthAssigns.slice(0, 20).map(a => {
            const comp = adminData.companies.find(c => c.id === a.company_id);
            return `<tr>
              <td>${comp?.name || '-'}</td>
              <td>${getWorkerName(a.worker_id)}</td>
              <td class="admin-pay-cell">${fmt(a.pay_amount)}원</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${monthAssigns.length > 20 ? `<p class="text-muted" style="margin-top:8px">외 ${monthAssigns.length - 20}건...</p>` : ''}
    ` : '<p class="text-muted">이 달의 배정 데이터가 없습니다.</p>'}
  `;
}

// ─── PC용 테이블 HTML ───
function buildTodayTable(data) {
  const rows = data.map(d => {
    const statusBadge = d.status === 'completed'
      ? '<span class="badge badge-done">완료</span>'
      : '<span class="badge badge-today">미완료</span>';
    const problemBadge = d.hasProblem
      ? `<span class="badge badge-warn">문제 ${d.requestCount}건</span>`
      : '<span class="text-muted">-</span>';
    const time = d.completedAt ? formatDate(d.completedAt) : '-';

    return `<tr class="today-row" onclick="openCompanyDetail('${d.companyId}')">
      <td><strong>${d.companyName}</strong></td>
      <td class="text-muted" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address}</td>
      <td>${d.workers.join(', ') || '-'}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px">${time}</td>
      <td>${problemBadge}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap today-table-pc">
    <table>
      <thead><tr>
        <th>업체명</th><th>주소</th><th>담당직원</th><th>상태</th><th>완료시간</th><th>요청</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ─── 모바일용 카드 HTML ───
function buildTodayCards(data) {
  const cards = data.map(d => {
    const statusBadge = d.status === 'completed'
      ? '<span class="badge badge-done">완료</span>'
      : '<span class="badge badge-today">미완료</span>';
    const problemBadge = d.hasProblem
      ? `<span class="badge badge-warn">문제 ${d.requestCount}건</span>`
      : '';
    const time = d.completedAt ? formatDate(d.completedAt) : '';

    return `<div class="card today-card" onclick="openCompanyDetail('${d.companyId}')">
      <div class="card-header">
        <div style="min-width:0;flex:1">
          <div class="card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.companyName}</div>
          <div class="card-subtitle">${d.address}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0">${statusBadge}${problemBadge}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-top:4px">
        <span>담당: ${d.workers.join(', ') || '-'}</span>
        ${time ? `<span>완료: ${time}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="today-cards-mobile">${cards}</div>`;
}

// ─── 필터 이벤트 핸들러 ───
async function changeTodayDate(dateStr) {
  todayDate = dateStr;
  todayWorkerFilter = '';
  todayStatusFilter = 'all';
  autoGenResult = null;
  await loadTodayCleaning(todayDate);
  renderDashboardHTML();
}

function changeTodayWorker(workerId) {
  todayWorkerFilter = workerId;
  renderDashboardHTML();
}

function changeTodayStatusSelect(status) {
  todayStatusFilter = status;
  renderDashboardHTML();
}

function filterTodayStatus(status) {
  todayStatusFilter = (todayStatusFilter === status && status !== 'all') ? 'all' : status;
  renderDashboardHTML();
}

// ─── 월 변경 (기존) ───
async function changeDashMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderDashboardHTML();
}


// ═══════════════════════════════════════════════════════
//  일정 생성 로그 기록 / 조회 / UI
// ═══════════════════════════════════════════════════════

/** 생성 로그를 schedule_generation_log 테이블에 저장 */
async function saveGenerationLog(info) {
  try {
    const row = {
      action_type:       info.action_type,
      target_month:      info.target_month,
      created_count:     info.created_count || 0,
      skipped_count:     info.skipped_count || 0,
      excluded_inactive: info.excluded_inactive || 0,
      excluded_no_worker: info.excluded_no_worker || 0,
      created_by:        currentWorker?.id || null,
    };
    const { error } = await sb.from('schedule_generation_log').insert(row);
    if (error) console.error('saveGenerationLog error:', error);
    // 로컬 캐시 갱신
    if (adminData.generationLogs) {
      adminData.generationLogs.unshift({ ...row, created_at: new Date().toISOString() });
    }
  } catch (e) {
    console.error('saveGenerationLog exception:', e);
  }
}

/** 일정 생성 로그 탭 렌더링 */
async function renderScheduleLog() {
  const mc = $('mainContent');
  mc.innerHTML = '<div class="empty-state"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div><p>로그를 불러오는 중...</p></div>';

  // DB에서 최신 로그 가져오기
  const { data, error } = await sb.from('schedule_generation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    mc.innerHTML = '<div class="empty-state"><p>로그 조회 실패: ' + error.message + '</p></div>';
    return;
  }

  const logs = data || [];
  adminData.generationLogs = logs;

  if (logs.length === 0) {
    mc.innerHTML = `
      <div class="section-title">일정 생성 로그</div>
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-icon">📋</div>
        <p>기록된 일정 생성 로그가 없습니다.</p>
      </div>
    `;
    return;
  }

  // 통계
  const totalCreated = logs.reduce((s, l) => s + (l.created_count || 0), 0);
  const totalSkipped = logs.reduce((s, l) => s + (l.skipped_count || 0), 0);
  const todayLogs = logs.filter(l => l.created_at && l.created_at.startsWith(today()));

  mc.innerHTML = `
    <div class="section-title">일정 생성 로그</div>

    <div class="stats-grid stats-grid-4" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">총 실행 횟수</div>
        <div class="stat-value blue">${logs.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 생성 건수</div>
        <div class="stat-value green">${totalCreated.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 중복 제외</div>
        <div class="stat-value yellow">${totalSkipped.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 실행</div>
        <div class="stat-value">${todayLogs.length}</div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>생성 일시</th>
            <th>방식</th>
            <th>대상 월</th>
            <th>생성</th>
            <th>중복 제외</th>
            <th>비활성 제외</th>
            <th>담당자 없음</th>
            <th>실행자</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => {
            const typeLabel = l.action_type === 'today_generate'
              ? '<span class="badge badge-today" style="font-size:10px">일별</span>'
              : '<span class="badge badge-done" style="font-size:10px">월별</span>';
            const createdBy = l.created_by ? getWorkerName(l.created_by) : '-';
            const dateStr = l.created_at ? formatDate(l.created_at) : '-';
            return `<tr>
              <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
              <td>${typeLabel}</td>
              <td>${l.target_month || '-'}</td>
              <td><strong class="green">${l.created_count || 0}</strong></td>
              <td class="yellow">${l.skipped_count || 0}</td>
              <td style="color:var(--text2)">${l.excluded_inactive || 0}</td>
              <td class="red">${l.excluded_no_worker || 0}</td>
              <td>${createdBy}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <p class="text-muted" style="margin-top:8px;font-size:11px">최근 50건까지 표시됩니다.</p>
  `;
}

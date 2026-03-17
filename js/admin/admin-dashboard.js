/**
 * admin-dashboard.js - 운영 대시보드
 * 오늘 청소 현황 + 미확인 요청 + 미입금/미발행 + 최근 변경 + 월간 요약 + 자동 일정 생성
 * 빈도 지원: weekly(매주), biweekly(격주) — anchor_date 기반
 */

// ─── 오늘 청소 현황 상태 ───
let todayDate = '';
let todayWorkerFilter = '';
let todayStatusFilter = 'all';
let todayCleaningCache = null;

// ─── 자동 일정 생성 상태 ───
let autoGenResult = null;
let monthGenResult = null;
let monthGenMonth = '';
let monthGenBusy = false;

// ─── 대시보드 추가 캐시 ───
let _dashRecentLogs = [];

// ─── 미입금/미발행 체크 시작월 ───
const DASH_BILLING_START = '2026-03';

// ═══════════════════════════════════════════════════════
//  빈도 관련 유틸리티
// ═══════════════════════════════════════════════════════

// isBiweeklyMatch()는 utils.js로 이동됨 (공통 함수)

function isScheduleActiveOnDate(schedule, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  if (schedule.weekday !== weekday) return false;
  if (!schedule.is_active) return false;
  const freq = schedule.frequency || 'weekly';
  if (freq === 'biweekly') return isBiweeklyMatch(schedule.anchor_date, dateStr);
  return true;
}

// ─── 오늘 청소 데이터 로드 ───
async function loadTodayCleaning(dateStr) {
  const { data: tasks, error } = await sb.from('tasks')
    .select('*')
    .eq('task_date', dateStr);

  if (error) console.error('loadTodayCleaning error:', error);

  const matchedSchedules = adminData.schedules.filter(s => isScheduleActiveOnDate(s, dateStr));
  const scheduledCompanyIds = [...new Set(matchedSchedules.map(s => s.company_id))];
  const month = dateStr.substring(0, 7);

  const result = scheduledCompanyIds.map(companyId => {
    const company = adminData.companies.find(c => c.id === companyId);
    if (!company || company.status !== 'active') return null;

    const assigns = adminData.assignments.filter(
      a => a.company_id === companyId && a.month === month
    );

    const companyTasks = (tasks || []).filter(t => t.company_id === companyId);
    const completedTask = companyTasks.find(t => t.status === 'completed');

    const unresolvedReqs = adminData.requests.filter(
      r => r.company_id === companyId && !r.is_resolved && !isExpired(r.expires_at)
    );

    return {
      companyId,
      companyName: company.name,
      address: company.location || '',
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

// ─── 최근 변경이력 로드 (대시보드용) ───
async function loadDashRecentLogs() {
  try {
    const { data, error } = await sb.from('change_logs')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(5);
    if (!error && data) _dashRecentLogs = data;
  } catch (e) {
    console.error('loadDashRecentLogs error:', e);
  }
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

// ─── 미입금/미발행 데이터 집계 (3월~) ───
function getDashBillingAlerts() {
  const records = adminData.billings.filter(b => b.month >= DASH_BILLING_START);

  const unpaid = records.filter(b => !b.paid_at);
  const unissued = records.filter(b => !b.billed_at);

  // 상세 리스트 (최대 5건)
  const alertList = records
    .filter(b => !b.paid_at || !b.billed_at)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 5)
    .map(b => ({
      id: b.id,
      companyName: getCompanyName(b.company_id),
      month: b.month,
      billedAmount: b.billed_amount || 0,
      hasBilled: !!b.billed_at,
      hasPaid: !!b.paid_at,
      paidAmount: b.paid_amount || 0,
    }));

  return { unpaidCount: unpaid.length, unissuedCount: unissued.length, alertList };
}

// ─── 미확인 요청 집계 ───
function getDashPendingRequests() {
  const pending = adminData.requests
    .filter(r => !r.is_resolved && !isExpired(r.expires_at))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    count: pending.length,
    list: pending.slice(0, 5).map(r => ({
      id: r.id,
      companyName: getCompanyName(r.company_id),
      title: r.title || '(제목 없음)',
      createdBy: r.worker_id ? getWorkerName(r.worker_id) : '-',
      createdAt: r.created_at,
      status: r.is_resolved ? '처리완료' : '미확인',
    })),
  };
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

  const matchedSchedules = adminData.schedules.filter(s => isScheduleActiveOnDate(s, dateStr));

  if (matchedSchedules.length === 0) {
    autoGenResult = { created: 0, duplicated: 0, inactiveSkipped: 0, noWorkerSkipped: 0, list: [], dateStr, dayName };
    renderDashboardHTML();
    toast(`${dayName}요일에 예정된 스케줄이 없습니다`, 'info');
    return;
  }

  const companyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

  // 업체당 1개 task (중복 체크는 company_id 기준)
  const { data: existingTasks, error: taskErr } = await sb.from('tasks')
    .select('company_id')
    .eq('task_date', dateStr);

  if (taskErr) {
    toast('기존 일정 조회 실패: ' + taskErr.message, 'error');
    return;
  }

  const existingCompanySet = new Set(
    (existingTasks || []).map(t => t.company_id)
  );

  const toInsert = [];

  for (const companyId of companyIds) {
    const company = adminData.companies.find(c => c.id === companyId);
    if (!company || company.status !== 'active') { inactiveSkipped++; continue; }

    // 계약기간 체크: 시작일 이전 또는 종료일 이후면 스킵
    if (company.contract_start_date && dateStr < company.contract_start_date) { inactiveSkipped++; continue; }
    if (company.contract_end_date && dateStr > company.contract_end_date) { inactiveSkipped++; continue; }

    // 업체에 이미 해당 날짜 task가 있으면 스킵
    if (existingCompanySet.has(companyId)) { duplicated++; continue; }

    const assigns = adminData.assignments.filter(
      a => a.company_id === companyId && a.month === month
    );
    if (assigns.length === 0) { noWorkerSkipped++; continue; }

    // 메인 담당자 (첫 번째 배정자)로 task 1개만 생성
    const mainAssign = assigns[0];

    toInsert.push({
      company_id: companyId,
      worker_id: mainAssign.worker_id,
      task_date: dateStr,
      status: 'scheduled',
      task_source: 'auto',
      memo: null,
    });

    createdList.push({
      companyName: company.name,
      workerName: getWorkerName(mainAssign.worker_id),
      date: dateStr,
      status: 'scheduled',
    });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await sb.from('tasks').insert(toInsert);
    if (insertErr) {
      toast('일정 생성 실패: ' + insertErr.message, 'error');
      return;
    }
    created = toInsert.length;
  }

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
        <div class="ag-stat"><span class="ag-stat-num green">${r.created}</span><span class="ag-stat-label">생성</span></div>
        <div class="ag-stat"><span class="ag-stat-num yellow">${r.duplicated}</span><span class="ag-stat-label">중복 제외</span></div>
        <div class="ag-stat"><span class="ag-stat-num" style="color:var(--text2)">${r.inactiveSkipped}</span><span class="ag-stat-label">비활성 제외</span></div>
        <div class="ag-stat"><span class="ag-stat-num red">${r.noWorkerSkipped}</span><span class="ag-stat-label">담당자 없음</span></div>
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

async function generateMonthlyTasks() {
  if (monthGenBusy) return;

  const monthInput = $('monthGenInput');
  if (!monthInput) return;
  const month = monthInput.value;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    toast('올바른 월을 선택하세요', 'error');
    return;
  }

  monthGenBusy = true;
  monthGenMonth = month;
  monthGenResult = null;

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
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const allDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, '0');
    const mm = String(mon).padStart(2, '0');
    allDates.push(`${year}-${mm}-${dd}`);
  }

  const activeSchedules = adminData.schedules.filter(s => s.is_active);
  if (activeSchedules.length === 0) {
    monthGenResult = { month, created: 0, duplicated: 0, inactiveSkipped: 0, noWorkerSkipped: 0, totalDates: daysInMonth, list: [] };
    toast('활성 스케줄이 없습니다', 'info');
    return;
  }

  const schedByWeekday = {};
  for (const s of activeSchedules) {
    if (!schedByWeekday[s.weekday]) schedByWeekday[s.weekday] = [];
    schedByWeekday[s.weekday].push(s);
  }

  await ensureMonthData(month);
  const monthAssigns = adminData.assignments.filter(a => a.month === month);

  const assignMap = {};
  for (const a of monthAssigns) {
    if (!assignMap[a.company_id]) assignMap[a.company_id] = [];
    assignMap[a.company_id].push(a);
  }

  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  // 업체+날짜 기준으로 중복 체크
  const { data: existingTasks, error: taskErr } = await sb.from('tasks')
    .select('company_id, task_date')
    .gte('task_date', firstDay)
    .lte('task_date', lastDay);

  if (taskErr) {
    toast('기존 일정 조회 실패: ' + taskErr.message, 'error');
    return;
  }

  const existingSet = new Set(
    (existingTasks || []).map(t => `${t.company_id}|${t.task_date}`)
  );

  let created = 0;
  let duplicated = 0;
  let inactiveSkipped = 0;
  let noWorkerSkipped = 0;
  const toInsert = [];
  const createdList = [];
  const inactiveChecked = new Set();
  const noWorkerChecked = new Set();

  for (const dateStr of allDates) {
    const d = new Date(dateStr + 'T00:00:00');
    const weekday = d.getDay();
    const daySchedules = schedByWeekday[weekday];
    if (!daySchedules) continue;

    const matchedSchedules = daySchedules.filter(s => isScheduleActiveOnDate(s, dateStr));
    if (matchedSchedules.length === 0) continue;

    const companyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

    for (const companyId of companyIds) {
      const company = adminData.companies.find(c => c.id === companyId);
      if (!company || company.status !== 'active') {
        if (!inactiveChecked.has(companyId)) { inactiveSkipped++; inactiveChecked.add(companyId); }
        continue;
      }

      // 업체+날짜에 이미 task가 있으면 스킵
      const key = `${companyId}|${dateStr}`;
      if (existingSet.has(key)) { duplicated++; continue; }

      const assigns = assignMap[companyId];
      if (!assigns || assigns.length === 0) {
        if (!noWorkerChecked.has(companyId)) { noWorkerSkipped++; noWorkerChecked.add(companyId); }
        continue;
      }

      // 메인 담당자 (첫 번째 배정자)로 task 1개만 생성
      const mainAssign = assigns[0];

      toInsert.push({
        company_id: companyId,
        worker_id: mainAssign.worker_id,
        task_date: dateStr,
        status: 'scheduled',
        task_source: 'auto',
        memo: null,
      });

      if (createdList.length < 50) {
        createdList.push({
          companyName: company.name,
          workerName: getWorkerName(mainAssign.worker_id),
          date: dateStr,
          status: 'scheduled',
        });
      }
    }
  }

  const BATCH_SIZE = 200;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await sb.from('tasks').insert(batch);
    if (insertErr) {
      toast(`일정 생성 실패 (${i}~${i + batch.length}): ` + insertErr.message, 'error');
      created += i;
      monthGenResult = { month, created, duplicated, inactiveSkipped, noWorkerSkipped, totalDates: daysInMonth, list: createdList, totalCreated: toInsert.length, error: true };
      return;
    }
  }
  created = toInsert.length;

  await saveGenerationLog({
    action_type: 'month_generate',
    target_month: month,
    created_count: created,
    skipped_count: duplicated,
    excluded_inactive: inactiveSkipped,
    excluded_no_worker: noWorkerSkipped,
  });

  monthGenResult = {
    month, created, duplicated, inactiveSkipped, noWorkerSkipped,
    totalDates: daysInMonth, list: createdList, totalCreated: created, error: false,
  };

  // ── billing_records 자동 생성 (financials 기반) ──
  const billingCreated = await _generateMonthlyBillings(month);

  if (created > 0 || billingCreated > 0) {
    const parts = [];
    if (created > 0) parts.push(`일정 ${created}건`);
    if (billingCreated > 0) parts.push(`정산 ${billingCreated}건`);
    toast(`${month} 월 ${parts.join(', ')} 생성 완료!`);
  } else {
    toast('새로 생성할 일정이 없습니다', 'info');
  }

  if (todayDate && todayDate.startsWith(month)) {
    await loadTodayCleaning(todayDate);
  }
}

async function _generateMonthlyBillings(month) {
  const monthFin = adminData.financials.filter(f => f.month === month);
  if (monthFin.length === 0) return 0;

  const existingBillIds = new Set(
    adminData.billings.filter(b => b.month === month).map(b => b.company_id)
  );

  const toInsert = [];
  for (const f of monthFin) {
    if (existingBillIds.has(f.company_id)) continue;
    const c = adminData.companies.find(x => x.id === f.company_id);
    if (!c || c.status !== 'active') continue;
    // 에코 도급업체만 제외 (광고비 업체는 세금계산서 발행하므로 포함)
    if (c.subcontract_from === '에코오피스클린') continue;

    toInsert.push({
      company_id: f.company_id,
      month,
      billed_amount: f.contract_amount || 0,
      paid_amount: 0,
      status: 'pending',
    });
  }

  if (toInsert.length === 0) return 0;

  const { data, error } = await sb.from('billing_records').insert(toInsert).select();
  if (error) {
    console.error('billing auto-generate error:', error);
    return 0;
  }

  if (data) adminData.billings.push(...data);
  return data?.length || 0;
}

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
        <div class="ag-stat"><span class="ag-stat-num green">${r.created}</span><span class="ag-stat-label">생성</span></div>
        <div class="ag-stat"><span class="ag-stat-num yellow">${r.duplicated}</span><span class="ag-stat-label">중복 제외</span></div>
        <div class="ag-stat"><span class="ag-stat-num" style="color:var(--text2)">${r.inactiveSkipped}</span><span class="ag-stat-label">비활성 업체</span></div>
        <div class="ag-stat"><span class="ag-stat-num red">${r.noWorkerSkipped}</span><span class="ag-stat-label">담당자 없음</span></div>
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
  await Promise.all([
    loadTodayCleaning(todayDate),
    loadDashRecentLogs(),
  ]);
  renderDashboardHTML();
}

function renderDashboardHTML() {
  const mc = $('mainContent');
  const filtered = getFilteredCleaning();
  const all = todayCleaningCache || [];

  // ── 오늘 청소 통계 ──
  const cntTotal = all.length;
  const cntDone = all.filter(d => d.status === 'completed').length;
  const cntTodo = all.filter(d => d.status === 'incomplete').length;

  // ── 미확인 요청 ──
  const pendingReqs = getDashPendingRequests();

  // ── 미입금/미발행 ──
  const billingAlerts = getDashBillingAlerts();

  // ── 날짜 레이블 ──
  const dateObj = new Date(todayDate + 'T00:00:00');
  const dayName = WEEKDAY_NAMES[dateObj.getDay()];
  const isToday = todayDate === today();
  const dateLabel = isToday ? `오늘 (${dayName})` : `${todayDate.substring(5).replace('-','/')} (${dayName})`;

  // ── 직원 필터 옵션 ──
  const staffList = getActiveWorkers();
  const workerOpts = staffList.map(w =>
    `<option value="${w.id}" ${todayWorkerFilter === w.id ? 'selected' : ''}>${w.name}</option>`
  ).join('');

  // ── 월간 금액 통계 ──
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);
  // 에코 도급 업체 제외한 직영+광고비 업체의 계약 총액
  const totalContract = monthFin.reduce((s, f) => s + (f.contract_amount || 0), 0);
  const totalEcoFee = monthFin.reduce((s, f) => s + (f.eco_amount || 0), 0);
  const totalOcpFee = monthFin.reduce((s, f) => s + (f.ocp_amount || 0), 0);
  const totalWorkerPay = monthFin.reduce((s, f) => s + (f.worker_pay_total || 0), 0);

  // ── 신규 계약 업체 (이번 달에 계약 시작) ──
  const newContracts = adminData.companies.filter(c => {
    if (!c.contract_start_date) return false;
    return c.contract_start_date.substring(0, 7) === selectedMonth;
  });

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      대시보드
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-gray" onclick="exportWorkers()" style="font-size:11px;padding:6px 10px">📥 직원</button>
        <button class="btn-sm btn-blue" onclick="exportAll()" style="font-size:11px;padding:6px 10px">📥 전체</button>
      </div>
    </div>

    <!-- ═══ 1) 상단 요약 카드 6개 ═══ -->
    <div class="stats-grid dash-summary-grid">
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
      <div class="stat-card" onclick="switchTab('requests', document.querySelectorAll('.tab')[2])" style="cursor:pointer">
        <div class="stat-label">미확인 요청</div>
        <div class="stat-value${pendingReqs.count > 0 ? ' red' : ''}">${pendingReqs.count}</div>
      </div>
      <div class="stat-card" onclick="switchTab('billingAlert', document.querySelectorAll('.tab')[6])" style="cursor:pointer">
        <div class="stat-label">미입금</div>
        <div class="stat-value${billingAlerts.unpaidCount > 0 ? ' red' : ''}">${billingAlerts.unpaidCount}</div>
      </div>
      <div class="stat-card" onclick="switchTab('billingAlert', document.querySelectorAll('.tab')[6])" style="cursor:pointer">
        <div class="stat-label">미발행</div>
        <div class="stat-value${billingAlerts.unissuedCount > 0 ? ' orange' : ''}">${billingAlerts.unissuedCount}</div>
      </div>
    </div>

    <!-- ═══ 2) 오늘 일정 요약 표 ═══ -->
    <div class="today-section" style="margin-top:20px">
      <div class="today-header">
        <span class="today-header-title">오늘 일정</span>
        <span class="today-header-date">${dateLabel}</span>
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

    <!-- ═══ 3) 미확인 요청 요약 ═══ -->
    ${pendingReqs.count > 0 ? `
    <div class="dash-summary-box" style="margin-top:24px">
      <div class="dash-box-header">
        <span class="dash-box-title">미확인 요청</span>
        <span class="badge badge-warn" style="font-size:11px">${pendingReqs.count}건</span>
        <button class="btn-sm btn-gray" style="margin-left:auto;font-size:11px;padding:4px 10px"
                onclick="switchTab('requests', document.querySelectorAll('.tab')[2])">전체보기</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체명</th><th>요청 제목</th><th>작성자</th><th>작성시간</th><th>상태</th></tr></thead>
          <tbody>
            ${pendingReqs.list.map(r => `
              <tr>
                <td style="font-weight:600">${r.companyName}</td>
                <td>${r.title}</td>
                <td>${r.createdBy}</td>
                <td style="font-size:12px;white-space:nowrap">${formatDate(r.createdAt)}</td>
                <td><span class="badge badge-warn">미확인</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="dash-box-cards-mobile">
        ${pendingReqs.list.map(r => `
          <div class="card" style="padding:10px 12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:13px">${r.companyName}</span>
              <span class="badge badge-warn" style="font-size:10px">미확인</span>
            </div>
            <div style="font-size:12px;margin-top:4px">${r.title}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${r.createdBy} · ${formatDate(r.createdAt)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- ═══ 4) 미입금 / 미발행 요약 ═══ -->
    ${billingAlerts.alertList.length > 0 ? `
    <div class="dash-summary-box" style="margin-top:24px">
      <div class="dash-box-header">
        <span class="dash-box-title">미입금 / 미발행</span>
        <span class="badge badge-warn" style="font-size:11px">${billingAlerts.unpaidCount + billingAlerts.unissuedCount}건</span>
        <button class="btn-sm btn-gray" style="margin-left:auto;font-size:11px;padding:4px 10px"
                onclick="switchTab('billingAlert', document.querySelectorAll('.tab')[6])">전체보기</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체명</th><th>대상월</th><th>청구금액</th><th>발행여부</th><th>입금여부</th></tr></thead>
          <tbody>
            ${billingAlerts.alertList.map(b => `
              <tr>
                <td style="font-weight:600">${b.companyName}</td>
                <td>${b.month}</td>
                <td>${fmt(b.billedAmount)}원</td>
                <td>${b.hasBilled
                  ? '<span class="badge badge-done">발행</span>'
                  : '<span class="badge badge-today">미발행</span>'
                }</td>
                <td>${b.hasPaid
                  ? (b.paidAmount < b.billedAmount
                    ? '<span class="badge badge-area">부분</span>'
                    : '<span class="badge badge-done">입금</span>')
                  : '<span class="badge badge-warn">미입금</span>'
                }</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="dash-box-cards-mobile">
        ${billingAlerts.alertList.map(b => `
          <div class="card" style="padding:10px 12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:13px">${b.companyName}</span>
              <span style="font-size:12px;color:var(--text2)">${b.month}</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:6px;font-size:12px">
              <span>청구: ${fmt(b.billedAmount)}원</span>
              <span>${b.hasBilled ? '✅발행' : '❌미발행'}</span>
              <span>${b.hasPaid ? '✅입금' : '❌미입금'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- ═══ 5) 월간 금액 요약 ═══ -->
    <div class="dash-summary-box" style="margin-top:24px">
      <div class="dash-box-header">
        <span class="dash-box-title">💰 ${selectedMonth.split('-')[1]}월 금액 현황</span>
        ${monthSelectorHTML(selectedMonth, 'changeDashMonth')}
      </div>
      <div class="stats-grid" style="margin-top:12px">
        <div class="stat-card">
          <div class="stat-label">계약금액 합계</div>
          <div class="stat-value blue" style="font-size:22px">${fmt(totalContract)}원</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">에코 수수료</div>
          <div class="stat-value orange" style="font-size:22px">${fmt(totalEcoFee)}원</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">OCP 수수료</div>
          <div class="stat-value" style="font-size:22px;color:var(--primary)">${fmt(totalOcpFee)}원</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">작업자 지급액 (3.3% 공제 전)</div>
          <div class="stat-value green" style="font-size:22px">${fmt(totalWorkerPay)}원</div>
        </div>
      </div>
    </div>

    <!-- ═══ 6) 신규 계약 업체 ═══ -->
    ${newContracts.length > 0 ? `
    <div class="dash-summary-box" style="margin-top:24px">
      <div class="dash-box-header">
        <span class="dash-box-title">🆕 ${selectedMonth.split('-')[1]}월 신규 계약 업체</span>
        <span class="badge badge-done" style="font-size:11px">${newContracts.length}개</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체명</th><th>구역</th><th>계약 시작일</th><th>에코 관계</th><th>상태</th></tr></thead>
          <tbody>
            ${newContracts.map(c => {
              const ecoLabel = c.subcontract_from === '에코오피스클린'
                ? '<span style="font-size:10px;background:var(--orange);color:#fff;padding:2px 6px;border-radius:4px">도급</span>'
                : c.subcontract_from === '에코광고비'
                  ? '<span style="font-size:10px;background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px">광고비</span>'
                  : '<span style="font-size:10px;background:var(--green);color:#fff;padding:2px 6px;border-radius:4px">직영</span>';
              const statusBadge = c.status === 'active'
                ? '<span class="badge badge-done">활성</span>'
                : c.status === 'paused'
                  ? '<span class="badge badge-today">중지</span>'
                  : '<span class="badge badge-warn">해지</span>';
              return `<tr style="cursor:pointer" onclick="openCompanyDetail('${c.id}')">
                <td style="font-weight:600">${c.name}</td>
                <td>${c.area_name || '-'}</td>
                <td>${c.contract_start_date}</td>
                <td>${ecoLabel}</td>
                <td>${statusBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="dash-box-cards-mobile">
        ${newContracts.map(c => {
          const ecoLabel = c.subcontract_from === '에코오피스클린' ? '도급'
            : c.subcontract_from === '에코광고비' ? '광고비' : '직영';
          return `
            <div class="card" style="padding:10px 12px;cursor:pointer" onclick="openCompanyDetail('${c.id}')">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:13px">${c.name}</span>
                <span class="badge badge-done" style="font-size:10px">${ecoLabel}</span>
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:4px">
                ${c.area_name || ''} · 시작: ${c.contract_start_date}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

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

    return `<tr class="today-row">
      <td><strong>${d.companyName}</strong></td>
      <td class="text-muted" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address}</td>
      <td>${d.workers.join(', ') || '-'}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px">${time}</td>
      <td>${problemBadge}</td>
      <td><button class="btn-sm btn-blue" style="font-size:11px;padding:3px 8px" onclick="openCompanyDetail('${d.companyId}')">상세</button></td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap today-table-pc">
    <table>
      <thead><tr>
        <th>업체명</th><th>주소</th><th>담당직원</th><th>상태</th><th>완료시간</th><th>요청여부</th><th>상세보기</th>
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

async function changeDashMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderDashboardHTML();
}


// ═══════════════════════════════════════════════════════
//  일정 생성 로그 기록 / 조회 / UI
// ═══════════════════════════════════════════════════════

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
    if (adminData.generationLogs) {
      adminData.generationLogs.unshift({ ...row, created_at: new Date().toISOString() });
    }
  } catch (e) {
    console.error('saveGenerationLog exception:', e);
  }
}

async function renderScheduleLog() {
  const mc = $('mainContent');
  mc.innerHTML = '<div class="empty-state"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div><p>로그를 불러오는 중...</p></div>';

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

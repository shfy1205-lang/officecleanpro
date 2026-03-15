/**
 * admin-dashboard.js - 대시보드 탭
 * 오늘 청소 현황 + 월간 요약 + 자동 일정 생성
 */

// ─── 오늘 청소 현황 상태 ───
let todayDate = '';
let todayWorkerFilter = '';
let todayStatusFilter = 'all';
let todayCleaningCache = null;

// ─── 자동 일정 생성 상태 ───
let autoGenResult = null;   // 마지막 생성 결과

// ─── 오늘 청소 데이터 로드 (선택된 날짜 기준) ───
async function loadTodayCleaning(dateStr) {
  const { data: tasks, error } = await sb.from('tasks')
    .select('*')
    .eq('task_date', dateStr);

  if (error) {
    console.error('loadTodayCleaning error:', error);
  }

  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay(); // 0=일 ~ 6=토

  // 해당 요일에 스케줄이 잡힌 업체 목록
  const scheduledCompanyIds = [...new Set(
    adminData.schedules
      .filter(s => s.weekday === weekday && s.is_active)
      .map(s => s.company_id)
  )];

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
//  자동 청소 일정 생성
// ═══════════════════════════════════════════════════════

/**
 * 오늘(또는 선택된 날짜)의 청소 일정을 자동 생성한다.
 *
 * 로직:
 * 1) company_schedule에서 해당 요일 + is_active=true 필터
 * 2) 각 업체 status='active' 확인
 * 3) company_workers에서 해당 월 담당 직원 확인
 * 4) tasks에서 같은 날짜 기존 데이터 조회 → 중복 방지
 * 5) 신규 tasks INSERT (status='scheduled')
 */
async function generateTodayTasks() {
  const dateStr = todayDate || today();
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  const month = dateStr.substring(0, 7);
  const dayName = WEEKDAY_NAMES[weekday];

  // 결과 카운터
  let created = 0;
  let duplicated = 0;
  let inactiveSkipped = 0;
  let noWorkerSkipped = 0;
  const createdList = [];  // 생성된 일정 미리보기 데이터

  // 1) 해당 요일 스케줄 조회 (adminData에서)
  const matchedSchedules = adminData.schedules.filter(
    s => s.weekday === weekday && s.is_active
  );

  if (matchedSchedules.length === 0) {
    autoGenResult = { created: 0, duplicated: 0, inactiveSkipped: 0, noWorkerSkipped: 0, list: [], dateStr, dayName };
    renderDashboardHTML();
    toast(`${dayName}요일에 예정된 스케줄이 없습니다`, 'info');
    return;
  }

  // 고유 업체 ID 추출
  const companyIds = [...new Set(matchedSchedules.map(s => s.company_id))];

  // 2) 해당 날짜의 기존 tasks 조회 (DB에서 직접 - 최신 데이터)
  const { data: existingTasks, error: taskErr } = await sb.from('tasks')
    .select('company_id, worker_id')
    .eq('task_date', dateStr);

  if (taskErr) {
    toast('기존 일정 조회 실패: ' + taskErr.message, 'error');
    return;
  }

  // 중복 체크용 Set: "companyId|workerId"
  const existingSet = new Set(
    (existingTasks || []).map(t => `${t.company_id}|${t.worker_id}`)
  );

  // 3) 업체별 처리
  const toInsert = [];

  for (const companyId of companyIds) {
    const company = adminData.companies.find(c => c.id === companyId);

    // 비활성 업체 제외
    if (!company || company.status !== 'active') {
      inactiveSkipped++;
      continue;
    }

    // 담당 직원 조회
    const assigns = adminData.assignments.filter(
      a => a.company_id === companyId && a.month === month
    );

    if (assigns.length === 0) {
      noWorkerSkipped++;
      continue;
    }

    // 각 직원별로 task 생성
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

  // 4) 일괄 INSERT
  if (toInsert.length > 0) {
    const { error: insertErr } = await sb.from('tasks').insert(toInsert);
    if (insertErr) {
      toast('일정 생성 실패: ' + insertErr.message, 'error');
      return;
    }
    created = toInsert.length;
  }

  // 5) 결과 저장 & 다시 렌더
  autoGenResult = { created, duplicated, inactiveSkipped, noWorkerSkipped, list: createdList, dateStr, dayName };

  // 대시보드 데이터 새로고침
  await loadTodayCleaning(dateStr);
  renderDashboardHTML();

  if (created > 0) {
    toast(`${created}건 일정 생성 완료!`);
  } else {
    toast('새로 생성할 일정이 없습니다', 'info');
  }
}

// ─── 생성 결과 HTML ───
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

  // 생성된 일정 미리보기 테이블
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

// ─── 대시보드 렌더링 (진입점) ───
async function renderDashboard() {
  if (!todayDate) todayDate = today();
  await loadTodayCleaning(todayDate);
  renderDashboardHTML();
}

// ─── 대시보드 HTML 렌더링 (캐시 기반, 동기) ───
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
  autoGenResult = null;  // 날짜 변경 시 결과 초기화
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

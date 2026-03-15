/**
 * admin-dashboard.js - 대시보드 탭
 * 오늘 청소 현황 + 월간 요약
 */

// ─── 오늘 청소 현황 상태 ───
let todayDate = '';
let todayWorkerFilter = '';
let todayStatusFilter = 'all';
let todayCleaningCache = null;

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
      </div>

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

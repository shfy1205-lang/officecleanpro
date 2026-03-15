/**
 * admin-calendar.js - 월간 캘린더 일정 보기
 * tasks.task_date 기준 월별 업체 청소 일정 표시
 * 날짜별 상태 집계, 필터, 날짜 클릭 상세 모달
 */

// ─── 캘린더 전용 상태 ───
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based
let calTasks = [];
let calFilterWorker = '';
let calFilterArea = '';
let calFilterStatus = '';

// ─── 데이터 로드 ───

async function loadCalendarTasks() {
  const startDate = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const endDate = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await sb.from('tasks')
    .select('*')
    .gte('task_date', startDate)
    .lte('task_date', endDate)
    .order('task_date');

  if (error) {
    toast('일정 데이터를 불러올 수 없습니다: ' + error.message, 'error');
    calTasks = [];
    return;
  }
  calTasks = data || [];
}

// ─── 상태 판별 ───

function getTaskDisplayStatus(task) {
  // 문제발생: 해당 업체에 미해결 requests가 있는 경우
  const hasIssue = adminData.requests.some(
    r => r.company_id === task.company_id && !r.is_resolved && !isExpired(r.expires_at)
  );
  if (hasIssue) return 'issue';

  if (task.status === 'completed') return 'completed';
  if (task.status === 'cancelled') return 'cancelled';
  return 'scheduled'; // scheduled 또는 기타
}

// ─── 필터 적용 ───

function getFilteredCalTasks() {
  let filtered = [...calTasks];

  if (calFilterWorker) {
    filtered = filtered.filter(t => t.worker_id === calFilterWorker);
  }
  if (calFilterArea) {
    filtered = filtered.filter(t => {
      const comp = adminData.companies.find(c => c.id === t.company_id);
      return comp && comp.area_name === calFilterArea;
    });
  }
  if (calFilterStatus) {
    filtered = filtered.filter(t => {
      const st = getTaskDisplayStatus(t);
      return st === calFilterStatus;
    });
  }

  return filtered;
}

// ─── 날짜별 집계 ───

function aggregateByDate(tasks) {
  const map = {};
  tasks.forEach(t => {
    const d = t.task_date;
    if (!map[d]) map[d] = { scheduled: 0, completed: 0, issue: 0, cancelled: 0, tasks: [] };
    const st = getTaskDisplayStatus(t);
    if (st === 'scheduled') map[d].scheduled++;
    else if (st === 'completed') map[d].completed++;
    else if (st === 'issue') map[d].issue++;
    else if (st === 'cancelled') map[d].cancelled++;
    map[d].tasks.push(t);
  });
  return map;
}

// ─── 캘린더 렌더링 ───

async function renderCalendar() {
  const mc = $('mainContent');
  mc.innerHTML = '<div class="empty-state"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div><p>일정을 불러오는 중...</p></div>';

  await loadCalendarTasks();

  const tasks = getFilteredCalTasks();
  const dateMap = aggregateByDate(tasks);

  const monthLabel = `${calYear}년 ${calMonth + 1}월`;
  const todayStr = today();

  // 해당 월의 1일 요일 (0=일 ~ 6=토)
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // 직원 목록, 구역 목록
  const workers = getActiveWorkers();
  const areas = getUniqueAreas();

  // 요약 통계
  const totalTasks = tasks.length;
  const totalCompleted = tasks.filter(t => getTaskDisplayStatus(t) === 'completed').length;
  const totalScheduled = tasks.filter(t => getTaskDisplayStatus(t) === 'scheduled').length;
  const totalIssue = tasks.filter(t => getTaskDisplayStatus(t) === 'issue').length;

  mc.innerHTML = `
    <div class="section-title">월간 캘린더</div>

    <!-- 네비게이션 바 -->
    <div class="cal-nav">
      <div class="cal-nav-left">
        <button class="btn-sm" onclick="calPrevMonth()" style="background:var(--bg3);color:var(--text);padding:6px 12px">◀ 이전달</button>
        <span class="cal-month-title">${monthLabel}</span>
        <button class="btn-sm" onclick="calNextMonth()" style="background:var(--bg3);color:var(--text);padding:6px 12px">다음달 ▶</button>
      </div>
      <button class="btn-sm btn-blue" onclick="calGoToday()" style="font-size:11px;padding:6px 12px">오늘</button>
    </div>

    <!-- 필터 바 -->
    <div class="cal-filters">
      <select class="cal-filter-select" onchange="calFilterWorker=this.value;renderCalendar()">
        <option value="">전체 직원</option>
        ${workers.map(w => `<option value="${w.id}" ${calFilterWorker === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
      </select>
      <select class="cal-filter-select" onchange="calFilterArea=this.value;renderCalendar()">
        <option value="">전체 구역</option>
        ${areas.map(a => `<option value="${a}" ${calFilterArea === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
      <select class="cal-filter-select" onchange="calFilterStatus=this.value;renderCalendar()">
        <option value="">전체 상태</option>
        <option value="scheduled" ${calFilterStatus === 'scheduled' ? 'selected' : ''}>예정</option>
        <option value="completed" ${calFilterStatus === 'completed' ? 'selected' : ''}>완료</option>
        <option value="issue" ${calFilterStatus === 'issue' ? 'selected' : ''}>문제발생</option>
      </select>
    </div>

    <!-- 요약 통계 -->
    <div class="cal-stats">
      <div class="cal-stat"><span class="cal-stat-num">${totalTasks}</span><span class="cal-stat-label">전체</span></div>
      <div class="cal-stat cal-stat-blue"><span class="cal-stat-num">${totalScheduled}</span><span class="cal-stat-label">예정</span></div>
      <div class="cal-stat cal-stat-green"><span class="cal-stat-num">${totalCompleted}</span><span class="cal-stat-label">완료</span></div>
      <div class="cal-stat cal-stat-red"><span class="cal-stat-num">${totalIssue}</span><span class="cal-stat-label">문제</span></div>
    </div>

    <!-- 캘린더 그리드 -->
    <div class="cal-grid">
      <div class="cal-header">
        <div class="cal-dow cal-dow-sun">일</div>
        <div class="cal-dow">월</div>
        <div class="cal-dow">화</div>
        <div class="cal-dow">수</div>
        <div class="cal-dow">목</div>
        <div class="cal-dow">금</div>
        <div class="cal-dow cal-dow-sat">토</div>
      </div>
      <div class="cal-body">
        ${buildCalendarCells(firstDow, daysInMonth, dateMap, todayStr)}
      </div>
    </div>
  `;
}

function buildCalendarCells(firstDow, daysInMonth, dateMap, todayStr) {
  let html = '';
  let dayCount = 1;
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    if (i < firstDow || dayCount > daysInMonth) {
      // 빈 셀
      html += '<div class="cal-cell cal-cell-empty"></div>';
    } else {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dow = i % 7;
      const isSun = dow === 0;
      const isSat = dow === 6;
      const info = dateMap[dateStr];

      let cellClass = 'cal-cell';
      if (isToday) cellClass += ' cal-cell-today';
      if (info && info.tasks.length > 0) cellClass += ' cal-cell-has-tasks';

      let cellContent = `<div class="cal-day-num ${isSun ? 'cal-sun' : ''} ${isSat ? 'cal-sat' : ''}">${dayCount}</div>`;

      if (info && info.tasks.length > 0) {
        // 상태 뱃지
        const badges = [];
        if (info.completed > 0) badges.push(`<span class="cal-badge cal-badge-done">${info.completed}</span>`);
        if (info.scheduled > 0) badges.push(`<span class="cal-badge cal-badge-sched">${info.scheduled}</span>`);
        if (info.issue > 0) badges.push(`<span class="cal-badge cal-badge-issue">${info.issue}</span>`);

        cellContent += `<div class="cal-badges">${badges.join('')}</div>`;

        // 업체명 미리보기 (최대 2개 + 나머지)
        const companyNames = info.tasks.slice(0, 2).map(t => {
          const comp = adminData.companies.find(c => c.id === t.company_id);
          const name = comp ? comp.name : '?';
          // 긴 이름은 축약
          return name.length > 6 ? name.substring(0, 5) + '..' : name;
        });
        const remaining = info.tasks.length - 2;

        cellContent += '<div class="cal-companies">';
        companyNames.forEach(n => {
          cellContent += `<div class="cal-company-name">${n}</div>`;
        });
        if (remaining > 0) {
          cellContent += `<div class="cal-company-more">+${remaining}</div>`;
        }
        cellContent += '</div>';
      }

      html += `<div class="${cellClass}" onclick="openCalendarDayDetail('${dateStr}')">${cellContent}</div>`;
      dayCount++;
    }
  }
  return html;
}

// ─── 날짜 클릭 상세 모달 ───

function openCalendarDayDetail(dateStr) {
  const tasks = getFilteredCalTasks().filter(t => t.task_date === dateStr);
  if (tasks.length === 0) return;

  const [y, m, d] = dateStr.split('-');
  const dow = WEEKDAY_NAMES[new Date(dateStr).getDay()];
  const dateLabel = `${parseInt(m)}월 ${parseInt(d)}일 (${dow})`;

  // 상태 집계
  let scheduled = 0, completed = 0, issue = 0;
  tasks.forEach(t => {
    const st = getTaskDisplayStatus(t);
    if (st === 'completed') completed++;
    else if (st === 'issue') issue++;
    else scheduled++;
  });

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>📅 ${dateLabel} 일정</h3>

    <div class="cal-detail-summary">
      <span class="cal-detail-stat">전체 <strong>${tasks.length}</strong></span>
      ${scheduled > 0 ? `<span class="cal-detail-stat cal-detail-blue">예정 <strong>${scheduled}</strong></span>` : ''}
      ${completed > 0 ? `<span class="cal-detail-stat cal-detail-green">완료 <strong>${completed}</strong></span>` : ''}
      ${issue > 0 ? `<span class="cal-detail-stat cal-detail-red">문제 <strong>${issue}</strong></span>` : ''}
    </div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead>
          <tr>
            <th>업체명</th>
            <th>주소</th>
            <th>담당직원</th>
            <th>상태</th>
            <th>예정일</th>
            <th>완료일</th>
            <th>요청</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map(t => {
            const comp = adminData.companies.find(c => c.id === t.company_id);
            const compName = comp ? comp.name : '알 수 없음';
            const compAddr = comp ? (comp.location || '-') : '-';
            const workerName = getWorkerName(t.worker_id);
            const st = getTaskDisplayStatus(t);

            let statusBadge = '';
            if (st === 'completed') statusBadge = '<span class="badge badge-done">완료</span>';
            else if (st === 'issue') statusBadge = '<span class="badge badge-warn">문제발생</span>';
            else if (st === 'cancelled') statusBadge = '<span class="badge" style="background:var(--bg3);color:var(--text2)">취소</span>';
            else statusBadge = '<span class="badge badge-today">예정</span>';

            const completedAt = t.status === 'completed' && t.updated_at
              ? formatDateShort(t.updated_at) : '-';

            // 해당 업체 미해결 요청 수
            const openReqs = adminData.requests.filter(
              r => r.company_id === t.company_id && !r.is_resolved && !isExpired(r.expires_at)
            ).length;
            const reqBadge = openReqs > 0
              ? `<span class="badge badge-warn" style="font-size:10px">${openReqs}건</span>`
              : '<span style="color:var(--text2);font-size:11px">없음</span>';

            return `<tr>
              <td style="font-weight:600">${compName}</td>
              <td style="font-size:11px;color:var(--text2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${compAddr}</td>
              <td>${workerName}</td>
              <td>${statusBadge}</td>
              <td style="font-size:11px">${t.task_date}</td>
              <td style="font-size:11px">${completedAt}</td>
              <td>${reqBadge}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

// ─── 네비게이션 ───

function calPrevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function calNextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function calGoToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

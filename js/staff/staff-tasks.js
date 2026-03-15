/**
 * staff-tasks.js - 청소 완료 체크 + 완료 기록 탭
 */

// ════════════════════════════════════════════════════
// 청소 완료 체크
// ════════════════════════════════════════════════════

async function toggleTask(companyId) {
  const btn = event.target.closest('button');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

  const { error } = await sb.from('tasks').insert({
    company_id: companyId,
    worker_id:  currentWorker.id,
    task_date:  today(),
    status:     'completed',
  });

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = '청소 완료 체크'; }
    if (error.message.includes('duplicate') || error.code === '23505') {
      toast('이미 완료 처리되었습니다', 'error');
    } else {
      toast(error.message, 'error');
    }
    return;
  }

  toast('청소 완료!');

  // 로컬 데이터 갱신
  staffData.tasks.push({
    company_id: companyId,
    worker_id: currentWorker.id,
    task_date: today(),
    status: 'completed',
    created_at: new Date().toISOString(),
  });

  // 모달 & 리스트 갱신
  await openCompanyDetail(companyId);
  renderMyCompanies();
}


// ════════════════════════════════════════════════════
// 완료 기록 탭 (달력형 / 리스트형 토글)
// ════════════════════════════════════════════════════

function renderTaskHistory() {
  const mc = $('mainContent');

  // 현재 월 기준 전체 업체의 완료 기록
  const assigns = getMonthAssignments(selectedMonth);
  const assignedCompanyIds = new Set(assigns.map(a => a.company_id));

  // 해당 월의 모든 tasks
  const [y, m] = selectedMonth.split('-').map(Number);
  const monthTasks = staffData.tasks.filter(t => {
    const d = new Date(t.task_date);
    return d.getFullYear() === y && (d.getMonth() + 1) === m && t.status === 'completed';
  }).sort((a, b) => new Date(b.task_date) - new Date(a.task_date));

  // 통계
  const totalDays = monthTasks.length;
  const uniqueCompanies = new Set(monthTasks.map(t => t.company_id)).size;

  let html = `
    <div class="section-title">완료 기록</div>
    ${monthSelectorHTML(selectedMonth, 'changeHistoryMonth')}

    <!-- 통계 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">이번 달 완료</div>
        <div class="stat-value green">${totalDays}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">담당 업체</div>
        <div class="stat-value blue">${uniqueCompanies}곳</div>
      </div>
    </div>

    <!-- 보기 전환 토글 -->
    <div class="view-toggle">
      <button class="view-toggle-btn${taskHistoryView === 'calendar' ? ' active' : ''}"
              onclick="switchHistoryView('calendar')">📆 달력</button>
      <button class="view-toggle-btn${taskHistoryView === 'list' ? ' active' : ''}"
              onclick="switchHistoryView('list')">📋 리스트</button>
    </div>
  `;

  if (taskHistoryView === 'calendar') {
    html += buildFullCalendar(selectedMonth, monthTasks, assigns);
  } else {
    html += buildTaskList(monthTasks);
  }

  mc.innerHTML = html;
}

function changeHistoryMonth(month) {
  selectedMonth = month;
  renderTaskHistory();
}

function switchHistoryView(view) {
  taskHistoryView = view;
  renderTaskHistory();
}

/** 전체 달력 (모든 업체 합산) */
function buildFullCalendar(month, monthTasks, assigns) {
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const lastDate = new Date(y, m, 0).getDate();
  const todayStr = today();

  // 날짜별 완료 건수 집계
  const dateCountMap = {};
  monthTasks.forEach(t => {
    dateCountMap[t.task_date] = (dateCountMap[t.task_date] || 0) + 1;
  });

  // 배정된 업체들의 전체 스케줄 요일 집합
  const allScheduledDays = new Set();
  assigns.forEach(a => {
    const scheds = getCompanySchedules(a.company_id);
    scheds.forEach(s => allScheduledDays.add(s.weekday));
  });

  let html = '<div class="cal-grid">';
  WEEKDAY_NAMES.forEach(d => { html += `<div class="cal-header">${d}</div>`; });

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    const count = dateCountMap[dateStr] || 0;
    const isScheduled = allScheduledDays.has(dow);
    const isToday = dateStr === todayStr;

    let cls = 'cal-day';
    if (count > 0) cls += ' completed';
    else if (isScheduled) cls += ' scheduled';
    if (isToday) cls += ' today';

    html += `<div class="${cls}">
      <span>${d}</span>
      ${count > 0 ? `<span class="cal-count">${count}</span>` : ''}
    </div>`;
  }

  html += '</div>';

  html += `
    <div class="cal-legend">
      <span><span class="legend-dot scheduled"></span>청소일</span>
      <span><span class="legend-dot completed"></span>완료</span>
      <span><span class="legend-dot today-dot"></span>오늘</span>
    </div>
  `;

  return html;
}

/** 리스트형 보기 */
function buildTaskList(monthTasks) {
  if (monthTasks.length === 0) {
    return `<div class="empty-state">
      <div class="empty-icon">✅</div>
      <p>이 달의 완료 기록이 없습니다.</p>
    </div>`;
  }

  // 날짜별 그룹
  const dateGroups = {};
  monthTasks.forEach(t => {
    if (!dateGroups[t.task_date]) dateGroups[t.task_date] = [];
    dateGroups[t.task_date].push(t);
  });

  let html = '<div class="task-list">';

  Object.keys(dateGroups).sort((a, b) => b.localeCompare(a)).forEach(dateStr => {
    const tasks = dateGroups[dateStr];
    const d = new Date(dateStr);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${dayName})`;
    const isToday = dateStr === today();

    html += `
      <div class="task-date-group">
        <div class="task-date-label">
          ${dateLabel}
          ${isToday ? '<span class="badge badge-today">오늘</span>' : ''}
        </div>
        ${tasks.map(t => {
          const comp = getCompanyById(t.company_id);
          return `<div class="task-list-item">
            <span class="task-list-check">✓</span>
            <div class="task-list-info">
              <div class="task-list-name">${comp?.name || '알 수 없는 업체'}</div>
              <div class="task-list-sub">${comp?.area_name || ''} ${comp?.location || ''}</div>
            </div>
            ${t.memo ? `<div class="task-list-memo">${t.memo}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    `;
  });

  html += '</div>';
  return html;
}

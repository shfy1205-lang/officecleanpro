/**
 * staff.js - 직원 전용 페이지 로직
 *
 * 기능:
 * 1. 내 구역 목록 조회 (renderMyCompanies)
 * 2. 내 지급 금액 조회 (renderMyPay)
 * 3. 주차 가능 여부 조회 (업체 상세 모달)
 * 4. 분리수거장 위치 조회 (업체 상세 모달)
 * 5. 특이사항 조회 (업체 상세 모달)
 * 6. 관리자에게 요청사항 작성 (openRequestModal → submitRequest)
 * 7. 청소 완료 체크 (toggleTask)
 * 8. 특이사항 사진 보기 (업체 상세 모달 내 photo gallery)
 * 9. 특이사항 사진 업로드 (uploadPhoto → Supabase Storage)
 * 10. 청소 완료 기록 리스트형 보기 (renderTaskHistory - list)
 * 11. 청소 완료 기록 달력형 보기 (renderTaskHistory - calendar)
 * 12. 공지사항 대상 필터링 (renderNotices - 전체/직원/구역 대상별 필터)
 *
 * 참조 테이블:
 * - companies, company_workers, company_schedule
 * - company_notes, company_note_photos
 * - tasks, requests, notices
 */

let staffData = {};
let selectedMonth = '';
let taskHistoryView = 'calendar'; // 'calendar' | 'list'
let pendingPhotoCompanyId = null;
let pendingPhotoNoteId = null;

// ─── 초기화 ───

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await requireAuth('staff');
  if (!ok) return;

  selectedMonth = currentMonth();
  $('userName').textContent = currentWorker.name;

  $('loading').classList.add('hidden');
  $('app').style.display = 'block';

  await loadStaffData();
  renderMyCompanies();
});

// ─── 데이터 로드 (RLS가 자동으로 본인 데이터만 반환) ───

async function loadStaffData() {
  const [assignments, companies, schedules, notes, photos, tasks, requests] = await Promise.all([
    sb.from('company_workers').select('*'),
    sb.from('companies').select('*'),
    sb.from('company_schedule').select('*'),
    sb.from('company_notes').select('*'),
    sb.from('company_note_photos').select('*'),
    sb.from('tasks').select('*'),
    sb.from('requests').select('*'),
  ]);

  staffData.assignments = assignments.data || [];
  staffData.companies   = companies.data || [];
  staffData.schedules   = schedules.data || [];
  staffData.notes       = notes.data || [];
  staffData.photos      = photos.data || [];
  staffData.tasks       = tasks.data || [];
  staffData.requests    = requests.data || [];
}

// ─── 탭 전환 ───

function switchTab(tabName, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const renderers = {
    myCompanies:  renderMyCompanies,
    myPay:        renderMyPay,
    taskHistory:  renderTaskHistory,
    notices:      renderNotices,
  };

  if (renderers[tabName]) renderers[tabName]();
}

// ─── 유틸 ───

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function getMonthAssignments(month) {
  return staffData.assignments.filter(a => a.month === month);
}

function getCompanyById(id) {
  return staffData.companies.find(c => c.id === id);
}

function getCompanySchedules(companyId) {
  return staffData.schedules
    .filter(s => s.company_id === companyId && s.is_active)
    .sort((a, b) => a.weekday - b.weekday);
}

function getCompanyNote(companyId) {
  return staffData.notes.find(n => n.company_id === companyId);
}

function getCompanyPhotos(companyId) {
  return staffData.photos
    .filter(p => p.company_id === companyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getCompanyTasks(companyId, month) {
  const [y, m] = month.split('-').map(Number);
  return staffData.tasks.filter(t => {
    if (t.company_id !== companyId) return false;
    const d = new Date(t.task_date);
    return d.getFullYear() === y && (d.getMonth() + 1) === m;
  });
}

function getCompanyRequests(companyId) {
  return staffData.requests
    .filter(r => r.company_id === companyId && !r.is_resolved)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** Supabase Storage 공개 URL 생성 */
function getStorageUrl(path) {
  const base = localStorage.getItem('supa_url');
  return `${base}/storage/v1/object/public/note-photos/${path}`;
}

/** 월 선택 버튼 HTML */
function monthSelectorHTML(current, onChange) {
  const now = new Date();
  const months = [];
  for (let i = -2; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}월`;
    months.push({ val, label });
  }
  return `<div class="month-selector">${months.map(m =>
    `<button class="month-btn${m.val === current ? ' active' : ''}"
       onclick="${onChange}('${m.val}')">${m.label}</button>`
  ).join('')}</div>`;
}

/**
 * 공지 제목에서 대상 접두사를 파싱
 * 접두사 규칙: [전체], [직원:이름], [구역:구역명]
 * 접두사가 없으면 type='all' (전체 대상)
 *
 * @param {string} title - 공지 제목
 * @returns {{ type: string, target: string, cleanTitle: string }}
 */
function parseNoticeTarget(title) {
  if (!title) return { type: 'all', target: '', cleanTitle: '' };

  const match = title.match(/^\[(전체|직원|구역):?([^\]]*)\]\s*/);
  if (!match) return { type: 'all', target: '', cleanTitle: title };

  const prefix = match[1];
  const target = match[2] || '';
  const cleanTitle = title.slice(match[0].length);

  if (prefix === '전체') return { type: 'all', target: '', cleanTitle };
  if (prefix === '직원') return { type: 'worker', target, cleanTitle };
  if (prefix === '구역') return { type: 'area', target, cleanTitle };

  return { type: 'all', target: '', cleanTitle };
}

/**
 * 현재 직원이 볼 수 있는 공지인지 필터링
 * - [전체] → 모든 직원에게 표시
 * - [직원:이름] → 현재 직원 이름이 일치하면 표시
 * - [구역:구역명] → 현재 직원이 배정된 업체의 구역과 일치하면 표시
 * - 접두사 없음 → 전체 대상으로 간주
 *
 * @param {object} notice - 공지 객체 (title 필드 포함)
 * @returns {boolean}
 */
function isNoticeVisibleToMe(notice) {
  const { type, target } = parseNoticeTarget(notice.title);

  // [전체] 또는 접두사 없음 → 모든 직원에게 표시
  if (type === 'all') return true;

  // [직원:이름] → 현재 직원 이름과 일치
  if (type === 'worker') {
    return target === currentWorker.name;
  }

  // [구역:구역명] → 현재 월 배정된 업체의 구역 중 일치하는 것이 있으면 표시
  if (type === 'area') {
    const assigns = getMonthAssignments(selectedMonth || currentMonth());
    return assigns.some(a => {
      const comp = getCompanyById(a.company_id);
      return comp && comp.area_name === target;
    });
  }

  return false;
}


// ════════════════════════════════════════════════════
// 1. 내 업체 목록 (renderMyCompanies)
// ════════════════════════════════════════════════════

function renderMyCompanies() {
  const mc = $('mainContent');
  const assigns = getMonthAssignments(selectedMonth);

  let html = `
    <div class="section-title">내 업체</div>
    ${monthSelectorHTML(selectedMonth, 'changeCompanyMonth')}
  `;

  if (assigns.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>${selectedMonth} 배정된 업체가 없습니다.</p>
    </div>`;
    mc.innerHTML = html;
    return;
  }

  // 구역별 그룹핑
  const groups = {};
  assigns.forEach(a => {
    const comp = getCompanyById(a.company_id);
    if (!comp) return;
    const area = comp.area_name || '기타';
    if (!groups[area]) groups[area] = [];
    groups[area].push({ assign: a, company: comp });
  });

  Object.keys(groups).sort().forEach(area => {
    html += `<div class="area-group-label">${area}</div>`;
    groups[area].forEach(({ assign, company }) => {
      const scheds = getCompanySchedules(company.id);
      const days = scheds.map(s => WEEKDAY_NAMES[s.weekday]).join(', ') || '-';
      const note = getCompanyNote(company.id);
      const todayTasks = staffData.tasks.filter(
        t => t.company_id === company.id && t.task_date === today() && t.status === 'completed'
      );
      const isDoneToday = todayTasks.length > 0;
      const isScheduledToday = scheds.some(s => s.weekday === new Date().getDay());

      html += `
        <div class="card company-card" onclick="openCompanyDetail('${company.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${company.name}</div>
              <div class="card-subtitle">${company.location || ''}</div>
            </div>
            ${isScheduledToday
              ? (isDoneToday
                ? '<span class="badge badge-done">완료</span>'
                : '<span class="badge badge-today">오늘</span>')
              : ''}
          </div>
          <div class="company-card-info">
            <span class="info-chip">📅 ${days}</span>
            ${note?.parking_info ? '<span class="info-chip">🅿️ 주차가능</span>' : ''}
            ${scheds.length > 0 && scheds[0].start_time
              ? `<span class="info-chip">⏰ ${scheds[0].start_time.slice(0,5)}`
                + (scheds[0].end_time ? `~${scheds[0].end_time.slice(0,5)}` : '')
                + '</span>'
              : ''}
          </div>
        </div>
      `;
    });
  });

  mc.innerHTML = html;
}

function changeCompanyMonth(month) {
  selectedMonth = month;
  renderMyCompanies();
}


// ════════════════════════════════════════════════════
// 2. 내 급여 조회 (renderMyPay)
// ════════════════════════════════════════════════════

function renderMyPay() {
  const mc = $('mainContent');
  const assigns = getMonthAssignments(selectedMonth);

  const totalPay = assigns.reduce((sum, a) => sum + (a.pay_amount || 0), 0);
  const companyCount = assigns.length;

  let html = `
    <div class="section-title">내 급여</div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <div class="pay-summary-card">
      <div class="pay-total-label">${selectedMonth.split('-')[1]}월 총 급여</div>
      <div class="pay-total-amount">${fmt(totalPay)}원</div>
      <div class="pay-total-sub">총 ${companyCount}개 업체</div>
    </div>
  `;

  if (assigns.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-icon">💰</div>
      <p>${selectedMonth} 급여 데이터가 없습니다.</p>
    </div>`;
    mc.innerHTML = html;
    return;
  }

  // 업체별 급여 목록 (금액 내림차순)
  const sorted = [...assigns].sort((a, b) => (b.pay_amount || 0) - (a.pay_amount || 0));

  html += `<div class="pay-list">`;
  sorted.forEach(a => {
    const comp = getCompanyById(a.company_id);
    if (!comp) return;
    const pct = totalPay > 0 ? ((a.pay_amount || 0) / totalPay * 100).toFixed(1) : 0;

    html += `
      <div class="card pay-card">
        <div class="card-header">
          <div>
            <div class="card-title">${comp.name}</div>
            <div class="card-subtitle">${comp.area_name || '기타'}</div>
          </div>
          <div class="card-amount">${fmt(a.pay_amount)}원</div>
        </div>
        <div class="pay-bar-wrap">
          <div class="pay-bar" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  mc.innerHTML = html;
}

function changePayMonth(month) {
  selectedMonth = month;
  renderMyPay();
}


// ════════════════════════════════════════════════════
// 3. 공지사항 (renderNotices) — 대상 필터링 적용
// ════════════════════════════════════════════════════

async function renderNotices() {
  const mc = $('mainContent');
  mc.innerHTML = '<div class="section-title">공지사항</div><p class="text-muted">불러오는 중...</p>';

  const { data: notices, error } = await sb.from('notices')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    mc.innerHTML = '<div class="section-title">공지사항</div><p class="text-muted">불러오기 실패</p>';
    return;
  }

  // ── 대상 필터링: 본인에게 해당하는 공지만 표시 ──
  const filtered = (notices || []).filter(n => isNoticeVisibleToMe(n));

  let html = '<div class="section-title">공지사항</div>';

  if (filtered.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-icon">📢</div>
      <p>등록된 공지사항이 없습니다.</p>
    </div>`;
    mc.innerHTML = html;
    return;
  }

  filtered.forEach(n => {
    const date = new Date(n.created_at).toLocaleDateString('ko-KR');
    // ── 접두사를 제거한 깨끗한 제목 표시 ──
    const { cleanTitle } = parseNoticeTarget(n.title);
    const displayTitle = cleanTitle || n.title;

    html += `
      <div class="card notice-card${n.is_pinned ? ' pinned' : ''}">
        <div class="card-header">
          <div class="card-title">
            ${n.is_pinned ? '<span class="pin-icon">📌</span> ' : ''}${displayTitle}
          </div>
          <div class="card-subtitle">${date}</div>
        </div>
        <div class="notice-content">${n.content.replace(/\n/g, '<br>')}</div>
      </div>
    `;
  });

  mc.innerHTML = html;
}


// ════════════════════════════════════════════════════
// 4. 업체 상세 모달 (특이사항, 주차, 분리수거, 완료체크, 요청, 사진)
// ════════════════════════════════════════════════════

async function openCompanyDetail(companyId) {
  const company = getCompanyById(companyId);
  if (!company) return;

  const note = getCompanyNote(companyId);
  const photos = getCompanyPhotos(companyId);
  const scheds = getCompanySchedules(companyId);
  const tasks = getCompanyTasks(companyId, selectedMonth);
  const reqs = getCompanyRequests(companyId);
  const todayDone = staffData.tasks.some(
    t => t.company_id === companyId && t.task_date === today() && t.status === 'completed'
  );
  const isScheduledToday = scheds.some(s => s.weekday === new Date().getDay());

  // 달력 데이터
  const calendarHTML = buildCalendar(companyId, selectedMonth, scheds, tasks);

  let html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${company.name}</h3>
    <div class="detail-location">${company.location || ''} ${company.area_name ? '· ' + company.area_name : ''}</div>

    <!-- 청소 완료 버튼 -->
    ${isScheduledToday ? `
      <div class="task-check-section">
        ${todayDone
          ? `<button class="btn-task-done" disabled>
               <span class="check-icon">✓</span> 오늘 청소 완료됨
             </button>`
          : `<button class="btn-task-check" onclick="toggleTask('${companyId}')">
               청소 완료 체크
             </button>`
        }
      </div>
    ` : ''}

    <!-- 스케줄 -->
    <div class="detail-section">
      <div class="detail-section-title">📅 청소 스케줄</div>
      ${scheds.length > 0
        ? `<div class="schedule-chips">${scheds.map(s =>
            `<span class="schedule-chip">
              <strong>${WEEKDAY_NAMES[s.weekday]}</strong>
              ${s.start_time ? s.start_time.slice(0,5) : ''}${s.end_time ? '~' + s.end_time.slice(0,5) : ''}
            </span>`
          ).join('')}</div>`
        : '<p class="text-muted">등록된 스케줄 없음</p>'
      }
    </div>

    <!-- 달력 -->
    <div class="detail-section">
      <div class="detail-section-title">📆 ${selectedMonth.split('-')[1]}월 달력</div>
      ${calendarHTML}
    </div>

    <!-- 업체 정보 카드들 (수정 가능) -->
    <div class="info-cards-grid">
      <div class="info-mini-card">
        <div class="info-mini-icon">🅿️</div>
        <div class="info-mini-title">주차 정보</div>
        <textarea id="edit_parking_${companyId}" class="info-edit-textarea" placeholder="주차 정보 입력">${note?.parking_info || ''}</textarea>
      </div>
      <div class="info-mini-card">
        <div class="info-mini-icon">♻️</div>
        <div class="info-mini-title">분리수거장</div>
        <textarea id="edit_recycling_${companyId}" class="info-edit-textarea" placeholder="분리수거장 위치 입력">${note?.recycling_location || ''}</textarea>
      </div>
    </div>
    <button class="btn btn-blue" style="width:100%;margin-bottom:16px" onclick="saveNoteInfo('${companyId}', '${note?.id || ''}')">주차/분리수거 정보 저장</button>

    <!-- 특이사항 -->
    <div class="detail-section">
      <div class="detail-section-title">📝 특이사항</div>
      <div class="special-notes-box">
        ${note?.special_notes
          ? note.special_notes.replace(/\n/g, '<br>')
          : '<span class="text-muted">등록된 특이사항 없음</span>'
        }
      </div>
    </div>

    ${note?.office_password ? `
    <div class="detail-section">
      <div class="detail-section-title">🔑 사무실 비밀번호</div>
      <div class="password-box" onclick="this.classList.toggle('revealed')">
        <span class="pw-hidden">탭하여 확인</span>
        <span class="pw-text">${note.office_password}</span>
      </div>
    </div>
    ` : ''}

    <!-- 사진 갤러리 -->
    <div class="detail-section">
      <div class="detail-section-title">
        📷 현장 사진
        <button class="btn-sm btn-green" onclick="triggerPhotoUpload('${companyId}', '${note?.id || ''}')">업로드</button>
      </div>
      ${photos.length > 0
        ? `<div class="photo-grid">${photos.map(p =>
            `<div class="photo-thumb" onclick="openLightbox('${getStorageUrl(p.storage_path)}', '${(p.caption || '').replace(/'/g, "\\'")}')">
              <img src="${getStorageUrl(p.storage_path)}" alt="${p.caption || '사진'}" loading="lazy">
              ${p.caption ? `<div class="photo-thumb-caption">${p.caption}</div>` : ''}
            </div>`
          ).join('')}</div>`
        : '<p class="text-muted">등록된 사진이 없습니다.</p>'
      }
    </div>

    <!-- 요청사항 -->
    <div class="detail-section">
      <div class="detail-section-title">
        💬 요청사항
        <button class="btn-sm btn-blue" onclick="openRequestModal('${companyId}', '${company.name}')">작성</button>
      </div>
      ${reqs.length > 0
        ? reqs.map(r => {
            const rDate = new Date(r.created_at).toLocaleDateString('ko-KR');
            const expDate = new Date(r.expires_at).toLocaleDateString('ko-KR');
            return `<div class="request-item">
              <div class="request-content">${r.content}</div>
              <div class="request-meta">${rDate} · 만료: ${expDate}</div>
            </div>`;
          }).join('')
        : '<p class="text-muted">등록된 요청 없음</p>'
      }
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function closeModal() {
  $('detailModal').classList.remove('show');
}

async function saveNoteInfo(companyId, noteId) {
  const parking = $('edit_parking_' + companyId)?.value?.trim() || '';
  const recycling = $('edit_recycling_' + companyId)?.value?.trim() || '';
  const payload = { parking_info: parking, recycling_location: recycling };

  if (noteId) {
    const { error } = await sb.from('company_notes').update(payload).eq('id', noteId);
    if (error) return toast(error.message, 'error');
  } else {
    payload.company_id = companyId;
    const { error } = await sb.from('company_notes').insert(payload);
    if (error) return toast(error.message, 'error');
  }
  toast('저장 완료');
  await loadStaffData();
}


// ════════════════════════════════════════════════════
// 5. 달력 빌드
// ════════════════════════════════════════════════════

function buildCalendar(companyId, month, scheds, tasks) {
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const lastDate = new Date(y, m, 0).getDate();
  const todayStr = today();

  const scheduledDays = new Set(scheds.map(s => s.weekday));
  const completedDates = new Set(
    tasks.filter(t => t.status === 'completed').map(t => t.task_date)
  );

  let html = '<div class="cal-grid">';
  WEEKDAY_NAMES.forEach(d => { html += `<div class="cal-header">${d}</div>`; });

  // 빈 칸
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    const isScheduled = scheduledDays.has(dow);
    const isCompleted = completedDates.has(dateStr);
    const isToday = dateStr === todayStr;

    let cls = 'cal-day';
    if (isCompleted) cls += ' completed';
    else if (isScheduled) cls += ' scheduled';
    if (isToday) cls += ' today';

    html += `<div class="${cls}">${d}</div>`;
  }

  html += '</div>';

  // 범례
  html += `
    <div class="cal-legend">
      <span><span class="legend-dot scheduled"></span>청소일</span>
      <span><span class="legend-dot completed"></span>완료</span>
      <span><span class="legend-dot today-dot"></span>오늘</span>
    </div>
  `;

  return html;
}


// ════════════════════════════════════════════════════
// 6. 청소 완료 체크
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
// 7. 관리자에게 요청사항 작성
// ════════════════════════════════════════════════════

function openRequestModal(companyId, companyName) {
  const html = `
    <button class="modal-close" onclick="closeRequestModal()">&times;</button>
    <h3>요청사항 작성</h3>
    <div class="detail-location">${companyName}</div>

    <div class="field" style="margin-top:16px">
      <label for="requestInput">요청 내용</label>
      <textarea id="requestInput" rows="4" placeholder="관리자에게 전달할 요청사항을 입력하세요.&#10;(예: 청소 용품 보충 필요, 열쇠 교체 요청 등)"></textarea>
    </div>

    <button class="btn" onclick="submitRequest('${companyId}')">요청 보내기</button>
    <p class="text-muted" style="margin-top:12px; text-align:center">요청은 7일 후 자동 만료됩니다.</p>
  `;

  $('requestModalBody').innerHTML = html;
  $('requestModal').classList.add('show');

  setTimeout(() => $('requestInput')?.focus(), 200);
}

function closeRequestModal() {
  $('requestModal').classList.remove('show');
}

async function submitRequest(companyId) {
  const input = $('requestInput');
  const content = input?.value?.trim();
  if (!content) return toast('내용을 입력하세요', 'error');

  const { data, error } = await sb.from('requests').insert({
    company_id: companyId,
    content:    content,
    created_by: currentWorker.id,
  }).select();

  if (error) return toast(error.message, 'error');

  if (data && data[0]) staffData.requests.push(data[0]);

  toast('요청이 등록되었습니다');
  closeRequestModal();

  await openCompanyDetail(companyId);
}


// ════════════════════════════════════════════════════
// 8. 특이사항 사진 보기 (라이트박스)
// ════════════════════════════════════════════════════

function openLightbox(url, caption) {
  $('lightboxImg').src = url;
  $('lightboxCaption').textContent = caption || '';
  $('lightbox').classList.add('show');
}

function closeLightbox() {
  $('lightbox').classList.remove('show');
  $('lightboxImg').src = '';
}


// ════════════════════════════════════════════════════
// 9. 특이사항 사진 업로드
// ════════════════════════════════════════════════════

function triggerPhotoUpload(companyId, noteId) {
  pendingPhotoCompanyId = companyId;
  pendingPhotoNoteId = noteId || null;
  $('photoFileInput').value = '';
  $('photoFileInput').click();
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const companyId = pendingPhotoCompanyId;
  if (!companyId) return;

  // 파일 크기 체크 (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return toast('파일 크기는 10MB 이하여야 합니다.', 'error');
  }

  // 이미지 타입 체크
  if (!file.type.startsWith('image/')) {
    return toast('이미지 파일만 업로드 가능합니다.', 'error');
  }

  toast('업로드 중...');

  try {
    // 1) company_notes 레코드 확인/생성
    let noteId = pendingPhotoNoteId;
    if (!noteId) {
      // 노트가 없으면 새로 생성
      const { data: newNote, error: noteErr } = await sb.from('company_notes').insert({
        company_id: companyId,
        updated_by: currentWorker.id,
      }).select().single();

      if (noteErr) {
        // 이미 존재할 수 있으므로 조회 시도
        const { data: existing } = await sb.from('company_notes')
          .select('id')
          .eq('company_id', companyId)
          .single();
        if (existing) {
          noteId = existing.id;
        } else {
          return toast('메모 생성 실패: ' + noteErr.message, 'error');
        }
      } else {
        noteId = newNote.id;
        // 로컬 데이터에도 추가
        staffData.notes.push(newNote);
      }
    }

    // 2) Supabase Storage 업로드
    const ext = file.name.split('.').pop().toLowerCase();
    const timestamp = Date.now();
    const storagePath = `${companyId}/${timestamp}.${ext}`;

    const { error: uploadErr } = await sb.storage
      .from('note-photos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      return toast('업로드 실패: ' + uploadErr.message, 'error');
    }

    // 3) company_note_photos 레코드 INSERT
    const caption = '';
    const { data: photoRow, error: insertErr } = await sb.from('company_note_photos').insert({
      note_id:      noteId,
      company_id:   companyId,
      storage_path: storagePath,
      caption:      caption,
      uploaded_by:  currentWorker.id,
    }).select().single();

    if (insertErr) {
      return toast('사진 기록 저장 실패: ' + insertErr.message, 'error');
    }

    // 4) 로컬 데이터 갱신
    if (photoRow) staffData.photos.push(photoRow);

    toast('사진이 업로드되었습니다');

    // 5) 모달 갱신
    await openCompanyDetail(companyId);

  } catch (e) {
    console.error('Photo upload error:', e);
    toast('업로드 중 오류가 발생했습니다.', 'error');
  }
}


// ════════════════════════════════════════════════════
// 10. 청소 완료 기록 (renderTaskHistory)
//     - 리스트형 / 달력형 토글
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

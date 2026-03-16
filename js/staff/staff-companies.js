/**
 * staff-companies.js - 내 업체 탭 + 업체 상세 모달
 */

// ════════════════════════════════════════════════════
// 내 업체 목록
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
// 업체 상세 모달
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

    ${note?.id ? `
    <div class="detail-section">
      <div class="detail-section-title">🔑 사무실 비밀번호</div>
      <div id="pwBox_${companyId}" data-revealed="false">
        <button class="btn-pw-view" onclick="viewOfficePassword('${companyId}', '${note.id}')">🔑 비밀번호 보기</button>
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
// 달력 빌드
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

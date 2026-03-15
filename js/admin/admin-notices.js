/**
 * admin-notices.js - 공지관리 탭
 */

function renderNotices(listOnly) {
  const mc = $('mainContent');

  let list = adminData.notices;
  if (noticeSearch) {
    const q = noticeSearch.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  }

  list = [...list].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // 목록 HTML 생성
  const listHTML = `
    <p class="text-muted" style="margin-bottom:12px">총 ${list.length}개 공지</p>
    ${list.length > 0 ? list.map(n => {
      const parsed = parseNoticeTarget(n.title);
      const targetBadge = parsed.type === 'worker'
        ? `<span class="badge badge-area">👤 ${parsed.target}</span>`
        : parsed.type === 'area'
          ? `<span class="badge badge-day">📍 ${parsed.target}</span>`
          : '<span class="badge badge-done">전체</span>';

      return `
        <div class="card notice-card ${n.is_pinned ? 'pinned' : ''}" onclick="openNoticeDetail('${n.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">
                ${n.is_pinned ? '<span class="pin-icon">📌</span> ' : ''}${parsed.cleanTitle}
              </div>
              <div class="card-subtitle">
                ${getWorkerName(n.created_by)} · ${formatDate(n.created_at)}
              </div>
            </div>
            ${targetBadge}
          </div>
          <div class="notice-content">${n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}</div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📢</div>
        <p>공지사항이 없습니다</p>
      </div>
    `}
  `;

  // 검색 시: 목록 컨테이너만 갱신 (input 보존 → IME 유지)
  if (listOnly) {
    const lc = document.getElementById('noticeListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // 전체 렌더
  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      공지관리
      <button class="btn-sm btn-green" onclick="openNoticeForm()">+ 공지 작성</button>
    </div>

    <div class="search-box" style="margin-bottom:16px">
      <input id="noticeSearchInput" placeholder="공지 검색 (제목, 내용)" value="${noticeSearch}">
    </div>

    <div id="noticeListContainer">${listHTML}</div>
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('noticeSearchInput', (val) => {
    noticeSearch = val;
    renderNotices(true);
  });
}

function openNoticeForm(noticeId) {
  const isEdit = !!noticeId;
  const n = isEdit ? adminData.notices.find(x => x.id === noticeId) : {};

  let targetType = 'all';
  let targetValue = '';
  let cleanTitle = n.title || '';

  if (isEdit) {
    const parsed = parseNoticeTarget(n.title);
    targetType = parsed.type;
    targetValue = parsed.target;
    cleanTitle = parsed.cleanTitle;
  }

  const workers = getActiveWorkers();
  const areas = getUniqueAreas();

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '공지 수정' : '공지 작성'}</h3>

    <div class="field">
      <label>공지 대상 *</label>
      <select id="nTargetType" onchange="onNoticeTargetChange()">
        <option value="all"${targetType === 'all' ? ' selected' : ''}>전체 공지</option>
        <option value="worker"${targetType === 'worker' ? ' selected' : ''}>특정 직원 대상</option>
        <option value="area"${targetType === 'area' ? ' selected' : ''}>특정 구역 대상</option>
      </select>
    </div>

    <div class="field" id="workerTargetField" style="display:${targetType === 'worker' ? 'block' : 'none'}">
      <label>대상 직원 선택 *</label>
      <select id="nTargetWorker" class="admin-worker-select" style="width:100%">
        <option value="">직원 선택</option>
        ${workers.map(w => `<option value="${w.name}"${w.name === targetValue ? ' selected' : ''}>${w.name}</option>`).join('')}
      </select>
    </div>

    <div class="field" id="areaTargetField" style="display:${targetType === 'area' ? 'block' : 'none'}">
      <label>대상 구역 선택 *</label>
      <select id="nTargetArea" class="admin-area-select" style="width:100%">
        <option value="">구역 선택</option>
        ${areas.map(a => `<option value="${a}"${a === targetValue ? ' selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>제목 *</label>
      <input id="nTitle" value="${cleanTitle}" placeholder="공지 제목">
    </div>
    <div class="field">
      <label>내용 *</label>
      <textarea id="nContent" rows="5" placeholder="공지 내용을 입력하세요">${n.content || ''}</textarea>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="nPinned" ${n.is_pinned ? 'checked' : ''} style="width:auto">
      <label for="nPinned" style="margin-bottom:0">📌 상단 고정</label>
    </div>

    <button class="btn" onclick="saveNotice('${noticeId || ''}')">${isEdit ? '수정 저장' : '공지 등록'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteNotice('${noticeId}')">공지 삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onNoticeTargetChange() {
  const type = $('nTargetType').value;
  $('workerTargetField').style.display = type === 'worker' ? 'block' : 'none';
  $('areaTargetField').style.display = type === 'area' ? 'block' : 'none';
}

async function saveNotice(noticeId) {
  const targetType = $('nTargetType').value;
  let titleRaw = $('nTitle').value.trim();
  const content = $('nContent').value.trim();
  const isPinned = $('nPinned').checked;

  if (!titleRaw) return toast('제목을 입력하세요', 'error');
  if (!content) return toast('내용을 입력하세요', 'error');

  let prefix = '';
  if (targetType === 'worker') {
    const workerName = $('nTargetWorker').value;
    if (!workerName) return toast('대상 직원을 선택하세요', 'error');
    prefix = `[직원:${workerName}] `;
  } else if (targetType === 'area') {
    const areaName = $('nTargetArea').value;
    if (!areaName) return toast('대상 구역을 선택하세요', 'error');
    prefix = `[구역:${areaName}] `;
  } else {
    prefix = '[전체] ';
  }

  const title = prefix + titleRaw;

  const payload = {
    title,
    content,
    is_pinned: isPinned,
    created_by: currentWorker.id,
  };

  let error;
  if (noticeId) {
    ({ error } = await sb.from('notices').update(payload).eq('id', noticeId));
  } else {
    ({ error } = await sb.from('notices').insert(payload));
  }

  if (error) return toast(error.message, 'error');

  toast(noticeId ? '공지 수정 완료' : '공지 등록 완료');
  closeModal();
  await loadAdminData();
  renderNotices();
}

function openNoticeDetail(noticeId) {
  const n = adminData.notices.find(x => x.id === noticeId);
  if (!n) return;

  const parsed = parseNoticeTarget(n.title);
  const targetLabel = parsed.type === 'worker'
    ? `👤 직원: ${parsed.target}`
    : parsed.type === 'area'
      ? `📍 구역: ${parsed.target}`
      : '전체 대상';

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${parsed.cleanTitle}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">대상</div>
          <p style="font-size:13px">${targetLabel}</p>
        </div>
        <div>
          <div class="stat-label">작성일</div>
          <p class="text-muted">${formatDate(n.created_at)}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">작성자</div>
      <p class="text-muted">${getWorkerName(n.created_by)}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">내용</div>
      <div class="special-notes-box">${n.content.replace(/\n/g, '<br>')}</div>
    </div>

    ${n.is_pinned ? '<p style="margin-top:8px"><span class="badge badge-today">📌 상단 고정</span></p>' : ''}

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn" style="flex:1" onclick="openNoticeForm('${n.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteNotice('${n.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function deleteNotice(noticeId) {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;

  const { error } = await sb.from('notices').delete().eq('id', noticeId);
  if (error) return toast(error.message, 'error');

  toast('공지 삭제됨');
  closeModal();
  await loadAdminData();
  renderNotices();
}

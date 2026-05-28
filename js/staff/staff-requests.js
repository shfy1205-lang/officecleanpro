/**
 * staff-requests.js - 요청사항 작성 + 내 요청 탭
 */

let staffRequestFilter = 'all';

// ─── 내 요청 탭 렌더링 ───

function renderMyRequests() {
  const mc = $('mainContent');
  const myReqs = staffData.requests
    .filter(r => r.created_by === currentWorker.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let list = myReqs;
  if (staffRequestFilter === 'pending') {
    list = myReqs.filter(r => !r.is_resolved && !isExpired(r.expires_at));
  } else if (staffRequestFilter === 'resolved') {
    list = myReqs.filter(r => r.is_resolved);
  }

  const pendingCount = myReqs.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;
  const resolvedCount = myReqs.filter(r => r.is_resolved).length;

  // 내 업체 목록 (새 요청 작성용)
  const myAssigns = getMonthAssignments(currentMonth());
  const myCompanyIds = [...new Set(myAssigns.map(a => a.company_id))];
  const myCompanies = myCompanyIds.map(id => getCompanyById(id)).filter(Boolean);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      내 요청사항
      <button class="btn-sm btn-blue" onclick="openNewRequestSelector()">+ 새 요청</button>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">전체</div>
        <div class="stat-value blue">${myReqs.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">대기중</div>
        <div class="stat-value yellow">${pendingCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">처리완료</div>
        <div class="stat-value green">${resolvedCount}</div>
      </div>
    </div>

    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${staffRequestFilter === 'all' ? ' active' : ''}"
              onclick="staffRequestFilter='all';renderMyRequests()">전체 (${myReqs.length})</button>
      <button class="view-toggle-btn${staffRequestFilter === 'pending' ? ' active' : ''}"
              onclick="staffRequestFilter='pending';renderMyRequests()">대기중 (${pendingCount})</button>
      <button class="view-toggle-btn${staffRequestFilter === 'resolved' ? ' active' : ''}"
              onclick="staffRequestFilter='resolved';renderMyRequests()">처리완료 (${resolvedCount})</button>
    </div>

    ${list.length > 0 ? list.map(r => {
      const expired = isExpired(r.expires_at);
      const company = getCompanyById(r.company_id);
      const statusBadge = r.is_resolved
        ? '<span class="badge badge-done">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn">만료</span>'
          : '<span class="badge badge-today">대기중</span>';

      return `
        <div class="card request-card ${r.is_resolved ? 'resolved' : ''}" onclick="openMyRequestDetail('${r.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(company?.name || '알 수 없음')}</div>
              <div class="card-subtitle">${formatDate(r.created_at)}</div>
            </div>
            ${statusBadge}
          </div>
          <div class="request-content">${escapeHtml(r.content)}</div>
          ${r.photo_path ? `<div style="margin-top:4px;font-size:11px;color:var(--accent2)">📷 사진 ${r.photo_path.split(',').filter(Boolean).length}장 첨부</div>` : ''}
          ${!r.is_resolved && !expired ? `
            <div class="request-card-footer">
              <span class="text-muted">만료: ${formatDateShort(r.expires_at)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>등록한 요청사항이 없습니다</p>
        <p class="text-muted" style="margin-top:4px">위의 '새 요청' 버튼으로 관리자에게 요청을 보내세요</p>
      </div>
    `}
  `;
}

// ─── 내 요청 상세 보기 ───

function openMyRequestDetail(requestId) {
  const r = staffData.requests.find(x => x.id === requestId);
  if (!r) return;

  const expired = isExpired(r.expires_at);
  const company = getCompanyById(r.company_id);

  // 첨부 사진 HTML 생성
  let photoHtml = '';
  if (r.photo_path) {
    const paths = r.photo_path.split(',').filter(Boolean);
    if (paths.length > 0) {
      const baseUrl = (localStorage.getItem('supa_url') || 'https://gcbgzfrffekgcaktspyj.supabase.co') + '/storage/v1/object/public/qr-photos/';
      photoHtml = `
        <div class="detail-section">
          <div class="detail-section-title">📷 첨부 사진</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${paths.map(p => `
              <div style="width:80px;height:80px;border-radius:8px;overflow:hidden;cursor:pointer"
                   onclick="openLightbox('${baseUrl}${p}', '첨부 사진')">
                <img src="${baseUrl}${p}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>요청사항 상세</h3>

    <div class="detail-section">
      <div class="detail-section-title">📍 업체</div>
      <p style="font-size:14px;font-weight:600">${escapeHtml(company?.name || '알 수 없음')}</p>
      <p class="text-muted">${escapeHtml(company?.location || '')}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📝 요청 내용</div>
      <div class="special-notes-box">${escapeHtml(r.content).replace(/\n/g, '<br>')}</div>
    </div>

    ${photoHtml}

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">요청일</div>
          <p class="text-muted">${formatDate(r.created_at)}</p>
        </div>
        <div>
          <div class="stat-label">만료일</div>
          <p class="text-muted">${formatDateShort(r.expires_at)} ${expired ? '(만료됨)' : ''}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">처리 상태</div>
      <p>${r.is_resolved
        ? '<span class="badge badge-done" style="font-size:13px;padding:4px 12px">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn" style="font-size:13px;padding:4px 12px">만료됨</span>'
          : '<span class="badge badge-today" style="font-size:13px;padding:4px 12px">대기중</span>'
      }</p>
    </div>

    ${!r.is_resolved && !expired ? `
      <button class="btn" style="background:var(--red);margin-top:12px"
              onclick="deleteMyRequest('${r.id}')">요청 취소</button>
    ` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

// ─── 요청 취소 (삭제) ───

async function deleteMyRequest(requestId) {
  if (!confirm('이 요청을 취소하시겠습니까?')) return;

  const { error } = await sb.from('requests').delete().eq('id', requestId);
  if (error) return toast(error.message, 'error');

  staffData.requests = staffData.requests.filter(r => r.id !== requestId);
  toast('요청이 취소되었습니다');
  closeModal();
  renderMyRequests();
}

// ─── 새 요청 작성 (업체 선택) ───

function openNewRequestSelector() {
  const myAssigns = getMonthAssignments(currentMonth());
  const myCompanyIds = [...new Set(myAssigns.map(a => a.company_id))];
  const myCompanies = myCompanyIds.map(id => getCompanyById(id)).filter(Boolean);

  if (myCompanies.length === 0) {
    return toast('배정된 업체가 없습니다', 'error');
  }

  if (myCompanies.length === 1) {
    openRequestModal(myCompanies[0].id, myCompanies[0].name);
    return;
  }

  // 여러 업체: 선택 모달
  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>업체 선택</h3>
    <p class="text-muted" style="margin-bottom:12px">요청을 보낼 업체를 선택하세요</p>
    ${myCompanies.map(c => `
      <div class="card" style="cursor:pointer;margin-bottom:8px"
           onclick="closeModal();openRequestModal('${c.id}', '${escapeHtml(c.name)}')">
        <div class="card-title">${escapeHtml(c.name)}</div>
        <div class="card-subtitle">${escapeHtml(c.location || '')}</div>
      </div>
    `).join('')}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

// ─── 요청 작성 모달 (기존 기능) ───

function openRequestModal(companyId, companyName) {
  const html = `
    <button class="modal-close" onclick="closeRequestModal()">&times;</button>
    <h3>요청사항 작성</h3>
    <div class="detail-location">${escapeHtml(companyName)}</div>

    <div class="field" style="margin-top:16px">
      <label for="requestInput">요청 내용</label>
      <textarea id="requestInput" rows="4" placeholder="관리자에게 전달할 요청사항을 입력하세요.&#10;(예: 청소 용품 보충 필요, 열쇀 교체 요청 등)"></textarea>
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

  toast('요청읈 등록되었습니다');
  closeRequestModal();

  // 내 요청 탭이 활성화되어 있으면 갱신
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.textContent.includes('내 요청')) {
    renderMyRequests();
  } else {
    await openCompanyDetail(companyId);
  }
}

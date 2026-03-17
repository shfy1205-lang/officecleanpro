/**
 * admin-requests.js - 요청관리 탭
 */

function renderRequests() {
  const mc = $('mainContent');

  let list = adminData.requests;
  if (requestFilter === 'pending') {
    list = list.filter(r => !r.is_resolved && !isExpired(r.expires_at));
  } else if (requestFilter === 'resolved') {
    list = list.filter(r => r.is_resolved);
  }

  const pendingCount = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;
  const resolvedCount = adminData.requests.filter(r => r.is_resolved).length;
  const qrCount = adminData.requests.filter(r => r.request_source === 'client_qr' && !r.is_resolved && !isExpired(r.expires_at)).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      요청관리
      <button class="btn-sm btn-blue" onclick="exportRequests()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미처리</div>
        <div class="stat-value yellow">${pendingCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">처리완료</div>
        <div class="stat-value green">${resolvedCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">업체(QR)</div>
        <div class="stat-value" style="color:var(--orange)">${qrCount}</div>
      </div>
    </div>

    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${requestFilter === 'all' ? ' active' : ''}"
              onclick="requestFilter='all';renderRequests()">전체 (${adminData.requests.length})</button>
      <button class="view-toggle-btn${requestFilter === 'pending' ? ' active' : ''}"
              onclick="requestFilter='pending';renderRequests()">미처리 (${pendingCount})</button>
      <button class="view-toggle-btn${requestFilter === 'resolved' ? ' active' : ''}"
              onclick="requestFilter='resolved';renderRequests()">처리완료 (${resolvedCount})</button>
    </div>

    ${list.length > 0 ? list.map(r => {
      const expired = isExpired(r.expires_at);
      const isQr = r.request_source === 'client_qr';
      const statusBadge = r.is_resolved
        ? '<span class="badge badge-done">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn">만료</span>'
          : '<span class="badge badge-today">대기중</span>';

      const sourceBadge = isQr
        ? '<span class="badge" style="background:#f97316;color:#fff;font-size:10px;padding:2px 6px;margin-left:4px">업체(QR)</span>'
        : '';

      const requesterText = isQr
        ? '업체 직접 요청'
        : getWorkerName(r.created_by);

      return `
        <div class="card request-card ${r.is_resolved ? 'resolved' : ''}" onclick="openRequestDetail('${r.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${getCompanyName(r.company_id)}${sourceBadge}</div>
              <div class="card-subtitle">
                ${requesterText} · ${formatDate(r.created_at)}
              </div>
            </div>
            ${statusBadge}
          </div>
          <div class="request-content">${r.content}</div>
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
        <p>요청사항이 없습니다</p>
      </div>
    `}
  `;
}

function openRequestDetail(requestId) {
  const r = adminData.requests.find(x => x.id === requestId);
  if (!r) return;

  const expired = isExpired(r.expires_at);
  const company = adminData.companies.find(c => c.id === r.company_id);
  const isQr = r.request_source === 'client_qr';

  // QR 사진 표시
  let photoHtml = '';
  if (r.photo_path) {
    const paths = r.photo_path.split(',').filter(Boolean);
    if (paths.length > 0) {
      const baseUrl = `${localStorage.getItem('supa_url') || 'https://gcbgzfrffekgcaktspyj.supabase.co'}/storage/v1/object/public/qr-photos/`;
      photoHtml = `
        <div class="detail-section">
          <div class="detail-section-title">📷 첨부 사진</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${paths.map(p => `
              <div style="width:80px;height:80px;border-radius:8px;overflow:hidden;cursor:pointer"
                   onclick="window.open('${baseUrl}${p}', '_blank')">
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
      <p style="font-size:14px;font-weight:600">${company?.name || '알 수 없음'}</p>
      <p class="text-muted">${company?.location || ''}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">👤 요청자</div>
      <p class="text-muted">
        ${isQr
          ? '<span class="badge" style="background:#f97316;color:#fff;font-size:11px;padding:2px 8px">업체 직접 요청(QR)</span>'
          : getWorkerName(r.created_by)
        }
      </p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📝 요청 내용</div>
      <div class="special-notes-box">${r.content.replace(/\n/g, '<br>')}</div>
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
      <div class="detail-section-title">상태</div>
      <p>${r.is_resolved
        ? '<span class="badge badge-done" style="font-size:13px;padding:4px 12px">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn" style="font-size:13px;padding:4px 12px">만료됨</span>'
          : '<span class="badge badge-today" style="font-size:13px;padding:4px 12px">대기중</span>'
      }</p>
    </div>

    ${!r.is_resolved ? `
      <button class="btn" style="background:var(--green);margin-top:12px"
              onclick="resolveRequest('${r.id}')">처리 완료로 변경</button>
    ` : `
      <button class="btn" style="background:var(--bg3);color:var(--text2);margin-top:12px"
              onclick="unresolveRequest('${r.id}')">미처리로 되돌리기</button>
    `}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function resolveRequest(requestId) {
  const { error } = await sb.from('requests')
    .update({ is_resolved: true })
    .eq('id', requestId);

  if (error) return toast(error.message, 'error');

  const local = adminData.requests.find(r => r.id === requestId);
  if (local) local.is_resolved = true;

  toast('처리 완료');
  closeModal();
  renderRequests();
}

async function unresolveRequest(requestId) {
  const { error } = await sb.from('requests')
    .update({ is_resolved: false })
    .eq('id', requestId);

  if (error) return toast(error.message, 'error');

  const local = adminData.requests.find(r => r.id === requestId);
  if (local) local.is_resolved = false;

  toast('미처리로 변경됨');
  closeModal();
  renderRequests();
}

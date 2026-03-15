/**
 * admin-leads.js - 견적관리 탭
 */

function renderLeads() {
  const mc = $('mainContent');

  let list = adminData.leads;

  // 필터
  if (leadFilter !== 'all') {
    list = list.filter(l => l.status === leadFilter);
  }
  if (leadSearch) {
    const q = leadSearch.toLowerCase();
    list = list.filter(l =>
      l.company_name.toLowerCase().includes(q) ||
      (l.contact_name || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q)
    );
  }

  const statusCounts = {};
  adminData.leads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  const totalEstimate = adminData.leads
    .filter(l => !['lost'].includes(l.status))
    .reduce((s, l) => s + (l.estimated_amount || 0), 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      견적관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportLeads()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openLeadForm()">+ 견적 등록</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">전체 견적</div>
        <div class="stat-value blue">${adminData.leads.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 총액 (실패 제외)</div>
        <div class="stat-value green">${fmt(totalEstimate)}</div>
      </div>
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input id="leadSearchInput" placeholder="업체명, 담당자, 위치 검색" value="${leadSearch}">
      </div>
      <select class="admin-area-select" onchange="leadFilter=this.value;renderLeads()">
        <option value="all"${leadFilter === 'all' ? ' selected' : ''}>전체 상태</option>
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${leadFilter === k ? ' selected' : ''}>${v.label} (${statusCounts[k] || 0})</option>`
        ).join('')}
      </select>
    </div>

    <p class="text-muted" style="margin-bottom:12px">총 ${list.length}건</p>

    ${list.length > 0 ? list.map(l => {
      const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
      return `
        <div class="card lead-card" onclick="openLeadDetail('${l.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${l.company_name}</div>
              <div class="card-subtitle">
                ${l.contact_name || ''} ${l.contact_phone ? '· ' + l.contact_phone : ''} · ${formatDate(l.created_at)}
              </div>
            </div>
            <span class="badge ${st.badge}">${st.label}</span>
          </div>
          <div class="lead-card-info">
            ${l.estimated_amount ? `<span class="info-chip">💰 ${fmt(l.estimated_amount)}원</span>` : ''}
            ${l.location ? `<span class="info-chip">📍 ${l.location}</span>` : ''}
            ${l.assigned_to ? `<span class="info-chip">👤 ${getWorkerName(l.assigned_to)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>견적 데이터가 없습니다</p>
      </div>
    `}
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('leadSearchInput', (val) => {
    leadSearch = val;
    renderLeads();
  });
}

function openLeadForm(leadId) {
  const isEdit = !!leadId;
  const l = isEdit ? adminData.leads.find(x => x.id === leadId) : {};
  const workers = getActiveWorkers();

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '견적 수정' : '견적 업체 등록'}</h3>

    <div class="field">
      <label>업체명 *</label>
      <input id="lCompanyName" value="${l.company_name || ''}" placeholder="업체명 입력">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>담당자명</label>
        <input id="lContact" value="${l.contact_name || ''}" placeholder="담당자명">
      </div>
      <div class="field">
        <label>연락처</label>
        <input id="lPhone" value="${l.contact_phone || ''}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="field">
      <label>위치</label>
      <input id="lLocation" value="${l.location || ''}" placeholder="주소 입력">
    </div>
    <div class="field">
      <label>견적 금액 (원)</label>
      <input id="lAmount" type="number" value="${l.estimated_amount || ''}" placeholder="예: 500000">
    </div>
    <div class="field">
      <label>진행 상태</label>
      <select id="lStatus">
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${(l.status || 'new') === k ? ' selected' : ''}>${v.label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>담당 직원</label>
      <select id="lAssigned">
        <option value="">미지정</option>
        ${workers.map(w => `<option value="${w.id}"${w.id === l.assigned_to ? ' selected' : ''}>${w.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="lNotes" rows="3" placeholder="메모">${l.notes || ''}</textarea>
    </div>

    <button class="btn" onclick="saveLead('${leadId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteLead('${leadId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function saveLead(leadId) {
  const companyName = $('lCompanyName').value.trim();
  if (!companyName) return toast('업체명을 입력하세요', 'error');

  const payload = {
    company_name:    companyName,
    contact_name:    $('lContact').value.trim(),
    contact_phone:   $('lPhone').value.trim(),
    location:        $('lLocation').value.trim(),
    estimated_amount: parseInt($('lAmount').value) || null,
    status:          $('lStatus').value,
    assigned_to:     $('lAssigned').value || null,
    notes:           $('lNotes').value.trim(),
  };

  let error;
  if (leadId) {
    ({ error } = await sb.from('leads').update(payload).eq('id', leadId));
  } else {
    ({ error } = await sb.from('leads').insert(payload));
  }

  if (error) return toast(error.message, 'error');

  toast(leadId ? '견적 수정 완료' : '견적 등록 완료');
  closeModal();
  await loadAdminData();
  renderLeads();
}

function openLeadDetail(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${l.company_name}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">담당자</div>
          <p class="text-muted">${l.contact_name || '-'} ${l.contact_phone || ''}</p>
        </div>
        <div>
          <div class="stat-label">위치</div>
          <p class="text-muted">${l.location || '-'}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">견적 금액</div>
          <p style="font-size:18px;font-weight:700;color:var(--green)">${l.estimated_amount ? fmt(l.estimated_amount) + '원' : '미입력'}</p>
        </div>
        <div>
          <div class="stat-label">진행 상태</div>
          <p><span class="badge ${st.badge}" style="font-size:13px;padding:4px 12px">${st.label}</span></p>
        </div>
      </div>
    </div>

    <!-- 상태 빠른 변경 -->
    <div class="detail-section">
      <div class="detail-section-title">상태 변경</div>
      <div class="lead-status-grid">
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<button class="btn-sm ${k === l.status ? 'btn-blue' : 'btn-gray'}"
                   style="font-size:12px;padding:6px 12px"
                   onclick="updateLeadStatus('${l.id}', '${k}')">${v.label}</button>`
        ).join('')}
      </div>
    </div>

    ${l.assigned_to ? `
    <div class="detail-section">
      <div class="detail-section-title">담당 직원</div>
      <p class="text-muted">${getWorkerName(l.assigned_to)}</p>
    </div>
    ` : ''}

    ${l.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">메모</div>
      <div class="special-notes-box">${l.notes.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div class="detail-section">
      <p class="text-muted">등록일: ${formatDate(l.created_at)}</p>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" style="flex:1" onclick="openLeadForm('${l.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteLead('${l.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function updateLeadStatus(leadId, status) {
  const { error } = await sb.from('leads')
    .update({ status })
    .eq('id', leadId);

  if (error) return toast(error.message, 'error');

  const local = adminData.leads.find(l => l.id === leadId);
  if (local) local.status = status;

  toast(`상태: ${LEAD_STATUS_MAP[status].label}`);
  openLeadDetail(leadId);
}

async function deleteLead(leadId) {
  if (!confirm('이 견적을 삭제하시겠습니까?')) return;

  const { error } = await sb.from('leads').delete().eq('id', leadId);
  if (error) return toast(error.message, 'error');

  toast('견적 삭제됨');
  closeModal();
  await loadAdminData();
  renderLeads();
}

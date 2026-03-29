/**
 * admin-leads.js - 견적관리 탭
 */

// 작업내용 임시 저장 배열
let leadWorkItems = [];
let _leadSearchDebounce = null; // 검색 debounce 타이머
let leadDisplayCount = 20; // 페이지네이션 표시 개수

function renderLeads(listOnly) {
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

  // 페이지네이션
  const totalCount = list.length;
  const displayList = list.slice(0, leadDisplayCount);
  const hasMore = totalCount > leadDisplayCount;

  // 목록 HTML 생성
  const listHTML = `
    <p class="text-muted" style="margin-bottom:12px">총 ${totalCount}건${hasMore ? ` (표시 ${displayList.length}건)` : ""}</p>
    ${list.length > 0 ? displayList.map(l => {
      const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
      const wi = l.work_items || [];
      const wiTotal = wi.reduce((s, item) => s + (item.amount || 0), 0);
      const displayAmount = wiTotal > 0 ? wiTotal : l.estimated_amount;
      return `
        <div class="card lead-card" onclick="openLeadDetail('${l.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(l.company_name)}</div>
              <div class="card-subtitle">
                ${escapeHtml(l.contact_name || '')} ${l.contact_phone ? '· ' + escapeHtml(l.contact_phone) : ''} · ${formatDate(l.created_at)}
              </div>
            </div>
            <span class="badge ${st.badge}">${st.label}</span>
          </div>
          <div class="lead-card-info">
            ${displayAmount ? `<span class="info-chip">💰 ${fmt(displayAmount)}원</span>` : ''}
            ${wi.length > 0 ? `<span class="info-chip">📋 작업 ${wi.length}건</span>` : ''}
            ${l.location ? `<span class="info-chip">📍 ${escapeHtml(l.location)}</span>` : ''}
            ${l.assigned_to ? `<span class="info-chip">👤 ${escapeHtml(getWorkerName(l.assigned_to))}</span>` : ''}
            ${l.quote_date ? `<span class="info-chip" style="background:var(--green);color:#fff">📄 견적서 작성됨</span>` : ''}
          </div>
        </div>
      `;
    }).join('') + (hasMore ? `\n      <div style="text-align:center;padding:16px 0"><button class="btn" onclick="loadMoreLeads()" style="background:transparent;border:1px solid var(--primary);color:var(--primary);width:100%;padding:10px;border-radius:8px;font-size:13px;cursor:pointer">더보기 (${displayList.length}/${totalCount})</button></div>` : '') : `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>견적 데이터가 없습니다</p>
      </div>
    `}
  `;

  // 검색 시: 목록 컨테이너만 갱신 (input 보존 → IME 유지)
  if (listOnly) {
    const lc = document.getElementById('leadListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // 전체 렌더
  const statusCounts = {};
  adminData.leads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  const totalEstimate = adminData.leads
    .filter(l => !['lost'].includes(l.status))
    .reduce((s, l) => {
      const wi = l.work_items || [];
      const wiTotal = wi.reduce((sum, item) => sum + (item.amount || 0), 0);
      return s + (wiTotal > 0 ? wiTotal : (l.estimated_amount || 0));
    }, 0);

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
        <input id="leadSearchInput" placeholder="업체명, 담당자, 위치 검색" value="${escapeHtml(leadSearch)}">
      </div>
      <select class="admin-area-select" onchange="leadFilter=this.value;leadDisplayCount=20;renderLeads()">
        <option value="all"${leadFilter === 'all' ? ' selected' : ''}>전체 상태</option>
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${leadFilter === k ? ' selected' : ''}>${v.label} (${statusCounts[k] || 0})</option>`
        ).join('')}
      </select>
    </div>

    <div id="leadListContainer">${listHTML}</div>
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('leadSearchInput', (val) => {
    clearTimeout(_leadSearchDebounce);
    _leadSearchDebounce = setTimeout(() => {
      leadSearch = val;
      leadDisplayCount = 20;
      renderLeads(true);
    }, 200);
  });
}

function loadMoreLeads() {
  leadDisplayCount += 20;
  renderLeads(true);
}

function openLeadForm(leadId) {
  const isEdit = !!leadId;
  const l = isEdit ? adminData.leads.find(x => x.id === leadId) : {};
  const workers = getActiveWorkers();

  // 작업내용 초기화
  leadWorkItems = (l.work_items && l.work_items.length > 0)
    ? JSON.parse(JSON.stringify(l.work_items))
    : [];

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '견적 수정' : '견적 업체 등록'}</h3>

    <div class="field">
      <label>업체명 *</label>
      <input id="lCompanyName" value="${escapeHtml(l.company_name || '')}" placeholder="업체명 입력">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>담당자명</label>
        <input id="lContact" value="${escapeHtml(l.contact_name || '')}" placeholder="담당자명">
      </div>
      <div class="field">
        <label>연락처</label>
        <input id="lPhone" value="${escapeHtml(l.contact_phone || '')}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="field">
      <label>위치</label>
      <input id="lLocation" value="${escapeHtml(l.location || '')}" placeholder="주소 입력">
    </div>

    <!-- 작업내용 섹션 -->
    <div class="field" style="margin-top:16px">
      <label style="display:flex;justify-content:space-between;align-items:center">
        <span>작업내용 및 금액</span>
        <button type="button" class="btn-sm btn-green" onclick="addLeadWorkItem()" style="font-size:11px;padding:4px 10px">+ 항목 추가</button>
      </label>
      <div id="leadWorkItemsList" style="margin-top:8px"></div>
      <div id="leadWorkItemsTotal" style="text-align:right;font-weight:600;color:var(--green);margin-top:8px;font-size:14px"></div>
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
        ${workers.map(w => `<option value="${w.id}"${w.id === l.assigned_to ? ' selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="lNotes" rows="3" placeholder="메모">${escapeHtml(l.notes || '')}</textarea>
    </div>

    <button class="btn" onclick="saveLead('${leadId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteLead('${leadId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
  renderLeadWorkItems();
}

function addLeadWorkItem() {
  leadWorkItems.push({ description: '', amount: 0 });
  renderLeadWorkItems();
  // 새로 추가된 항목의 작업내용 input에 포커스
  setTimeout(() => {
    const inputs = document.querySelectorAll('.lwi-desc');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  }, 50);
}

function removeLeadWorkItem(idx) {
  leadWorkItems.splice(idx, 1);
  renderLeadWorkItems();
}

function updateLeadWorkItem(idx, field, value) {
  if (!leadWorkItems[idx]) return;
  if (field === 'amount') {
    leadWorkItems[idx].amount = parseInt(value) || 0;
  } else {
    leadWorkItems[idx].description = value;
  }
  updateLeadWorkItemsTotal();
}

function updateLeadWorkItemsTotal() {
  const totalEl = document.getElementById('leadWorkItemsTotal');
  if (!totalEl) return;
  const total = leadWorkItems.reduce((s, item) => s + (item.amount || 0), 0);
  totalEl.textContent = total > 0 ? `합계: ${fmt(total)}원` : '';
}

function renderLeadWorkItems() {
  const container = document.getElementById('leadWorkItemsList');
  if (!container) return;

  if (leadWorkItems.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:12px;text-align:center;padding:12px 0">항목 추가 버튼을 눌러 작업내용을 입력하세요</p>';
    updateLeadWorkItemsTotal();
    return;
  }

  container.innerHTML = leadWorkItems.map((item, idx) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px">
      <span style="font-size:11px;color:var(--text-muted);min-width:20px">${idx + 1}</span>
      <input class="lwi-desc" value="${escapeHtml(item.description || '')}" placeholder="작업내용"
             oninput="updateLeadWorkItem(${idx}, 'description', this.value)"
             style="flex:2;padding:6px 8px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:13px">
      <input type="number" value="${item.amount || ''}" placeholder="금액"
             oninput="updateLeadWorkItem(${idx}, 'amount', this.value)"
             style="flex:1;max-width:120px;padding:6px 8px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:13px;text-align:right">
      <span style="font-size:12px;color:var(--text-muted)">원</span>
      <button type="button" onclick="removeLeadWorkItem(${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:2px 6px" title="삭제">&times;</button>
    </div>
  `).join('');

  updateLeadWorkItemsTotal();
}

async function saveLead(leadId) {
  try {
  const companyName = $('lCompanyName').value.trim();
  if (!companyName) return toast('업체명을 입력하세요', 'error');

  // 작업내용에서 빈 항목 제거 후 합계 계산
  const validWorkItems = leadWorkItems.filter(item => item.description.trim() || item.amount > 0);
  const wiTotal = validWorkItems.reduce((s, item) => s + (item.amount || 0), 0);

  const payload = {
    company_name:    companyName,
    contact_name:    $('lContact').value.trim(),
    contact_phone:   $('lPhone').value.trim(),
    location:        $('lLocation').value.trim(),
    estimated_amount: wiTotal > 0 ? wiTotal : null,
    status:          $('lStatus').value,
    assigned_to:     $('lAssigned').value || null,
    notes:           $('lNotes').value.trim(),
    work_items:      validWorkItems.length > 0 ? validWorkItems : [],
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

  } catch (e) {
    console.error('saveLead error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

function openLeadDetail(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
  const wi = l.work_items || [];
  const wiTotal = wi.reduce((s, item) => s + (item.amount || 0), 0);
  const displayAmount = wiTotal > 0 ? wiTotal : l.estimated_amount;

  // 작업내용 테이블
  const workItemsHTML = wi.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">작업내용</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
            <th style="text-align:left;padding:6px 8px;color:var(--text-muted);font-weight:500">No</th>
            <th style="text-align:left;padding:6px 8px;color:var(--text-muted);font-weight:500">작업내용</th>
            <th style="text-align:right;padding:6px 8px;color:var(--text-muted);font-weight:500">금액</th>
          </tr>
        </thead>
        <tbody>
          ${wi.map((item, idx) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
              <td style="padding:8px;color:var(--text-muted)">${idx + 1}</td>
              <td style="padding:8px">${escapeHtml(item.description) || '-'}</td>
              <td style="padding:8px;text-align:right;font-weight:500">${item.amount ? fmt(item.amount) + '원' : '-'}</td>
            </tr>
          `).join('')}
          <tr style="border-top:2px solid rgba(255,255,255,0.15)">
            <td colspan="2" style="padding:8px;text-align:right;font-weight:600">합계</td>
            <td style="padding:8px;text-align:right;font-weight:700;color:var(--green);font-size:15px">${fmt(wiTotal)}원</td>
          </tr>
        </tbody>
      </table>
    </div>
  ` : '';

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHtml(l.company_name)}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">담당자</div>
          <p class="text-muted">${escapeHtml(l.contact_name || '-')} ${escapeHtml(l.contact_phone || '')}</p>
        </div>
        <div>
          <div class="stat-label">위치</div>
          <p class="text-muted">${escapeHtml(l.location || '-')}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">견적 금액</div>
          <p style="font-size:18px;font-weight:700;color:var(--green)">${displayAmount ? fmt(displayAmount) + '원' : '미입력'}</p>
        </div>
        <div>
          <div class="stat-label">진행 상태</div>
          <p><span class="badge ${st.badge}" style="font-size:13px;padding:4px 12px">${st.label}</span></p>
        </div>
      </div>
    </div>

    ${workItemsHTML}

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
      <p class="text-muted">${escapeHtml(getWorkerName(l.assigned_to))}</p>
    </div>
    ` : ''}

    ${l.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">메모</div>
      <div class="special-notes-box">${escapeHtml(l.notes).replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div class="detail-section">
      <p class="text-muted">등록일: ${formatDate(l.created_at)}</p>
    </div>

    ${l.quote_date ? `
    <div class="detail-section" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:12px">
      <div class="detail-section-title" style="color:var(--green)">📄 견적서 정보</div>
      <div class="admin-row-2">
        <div>
          <div class="stat-label">견적서 작성일</div>
          <p class="text-muted">${l.quote_date}</p>
        </div>
        <div>
          <div class="stat-label">견적 금액 (VAT포함)</div>
          <p style="font-weight:700;color:var(--green)">${l.quote_amount ? fmt(l.quote_amount) + '원' : '-'}</p>
        </div>
      </div>
      ${l.quote_frequency ? `<p class="text-muted" style="font-size:12px;margin-top:4px">규격: ${escapeHtml(l.quote_spec || '-')} / 횟수: ${escapeHtml(l.quote_frequency)}</p>` : ''}
    </div>
    ` : ''}

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" style="flex:1;background:var(--primary)" onclick="goToQuoteFromLead('${l.id}')">
        ${l.quote_date ? '📄 견적서 수정' : '📝 견적서 작성'}
      </button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn" style="flex:1" onclick="openLeadForm('${l.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteLead('${l.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function updateLeadStatus(leadId, status) {
  try {
  const { error } = await sb.from('leads')
    .update({ status })
    .eq('id', leadId);

  if (error) return toast(error.message, 'error');

  const local = adminData.leads.find(l => l.id === leadId);
  if (local) local.status = status;

  toast(`상태: ${LEAD_STATUS_MAP[status].label}`);
  openLeadDetail(leadId);

  } catch (e) {
    console.error('updateLeadStatus error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function deleteLead(leadId) {
  try {
  if (!confirm('이 견적을 삭제하시겠습니까?')) return;

  const { error } = await sb.from('leads').delete().eq('id', leadId);
  if (error) return toast(error.message, 'error');

  toast('견적 삭제됨');
  closeModal();
  await loadAdminData();
  renderLeads();

  } catch (e) {
    console.error('deleteLead error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

// ═══ 견적관리 → 견적서 연동 ═══
function goToQuoteFromLead(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  // 글로벌 변수에 lead 데이터 저장
  pendingQuoteLead = {
    id:        l.id,
    clientName: l.company_name,
    address:   l.location || '',
    amount:    0,
    frequency: l.quote_frequency || '주1회',
    spec:      l.quote_spec || '사무실전체',
    workItems: l.work_items || [],
    quoteWorkItems: l.quote_work_items || null,
  };

  // work_items에서 금액 합계 계산 → 공급가액으로
  const wi = l.work_items || [];
  const wiTotal = wi.reduce((s, item) => s + (item.amount || 0), 0);
  if (l.quote_amount) {
    // 기존 견적서 금액이 있으면 VAT 역산하여 공급가액 계산
    pendingQuoteLead.amount = Math.round(l.quote_amount / 1.1);
  } else if (wiTotal > 0) {
    pendingQuoteLead.amount = wiTotal;
  } else if (l.estimated_amount) {
    pendingQuoteLead.amount = l.estimated_amount;
  }

  // 모달 닫고 견적서 탭으로 전환
  closeModal();
  const quoteTab = [...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === '견적서');
  if (quoteTab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    quoteTab.classList.add('active');
  }
  renderQuote();
}

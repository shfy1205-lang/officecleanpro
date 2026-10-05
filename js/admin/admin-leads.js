/**
 * admin-leads.js - 견적관리 탭 (목록 + 통계)
 *
 * 금액 기준 (r46 정리)
 *  - quote_amount     : 견적서 합계금액 (VAT 포함)
 *  - estimated_amount : 예상 금액 (VAT 별도, 공급가액)
 *  - work_items       : 작업내용별 금액 (VAT 별도)
 *  화면/통계에 쓰는 "견적 금액"은 모두 leadSupplyAmount() = VAT 별도 공급가액으로 통일.
 */

// ─── 견적관리 모듈 상태 (전역 오염 방지) ───
const _lead = {
  workItems: [],
  searchDebounce: null,
  displayCount: 20,
  view: 'list',        // 'list' | 'stats'
  statsPeriod: 'all',  // 'all' | '3m' | '6m' | '12m' | 'year'
  saving: false,
};

// 견적서 제출 이전 단계 (견적서 저장 시 '견적제출'로 올려도 되는 상태)
const LEAD_PRE_PROPOSAL = ['new', 'contacted', 'visit_plan', 'visit_done'];

// ════════════════════════════════════════════════════
// 금액/상태 헬퍼 (export.js, admin-quote.js 에서도 사용)
// ════════════════════════════════════════════════════

/** 견적서 세액: 원 단위 미만 절상 (엑셀 양식 R1 '절상'과 동일) */
function quoteTaxOf(amount) {
  return Math.ceil((amount || 0) / 10);
}

/** VAT 포함 합계 → 공급가액 (total = a + ceil(a/10) 의 정확한 역산) */
function quoteSupplyFromTotal(total) {
  total = Math.round(Number(total) || 0);
  if (total <= 0) return 0;
  const base = Math.floor(total * 10 / 11);
  for (const a of [base, base + 1, base - 1, base + 2]) {
    if (a >= 0 && a + quoteTaxOf(a) === total) return a;
  }
  return Math.round(total / 1.1); // 직접 입력된 값 등 역산 불가 시 근사
}

function leadWorkItemsTotal(l) {
  return (l.work_items || []).reduce((s, item) => s + (Number(item && item.amount) || 0), 0);
}

/** 견적 금액 (VAT 별도). 견적서가 있으면 견적서 기준, 없으면 작업내용 합계, 없으면 예상금액 */
function leadSupplyAmount(l) {
  if (!l) return 0;
  if (l.quote_amount) return quoteSupplyFromTotal(l.quote_amount);
  const wi = leadWorkItemsTotal(l);
  if (wi > 0) return wi;
  return Number(l.estimated_amount) || 0;
}

function leadStatusInfo(status) {
  return LEAD_STATUS_MAP[status] || LEAD_STATUS_MAP.new;
}

/** 견적서를 실제로 제출한 건인지 */
function leadIsQuoted(l) {
  return !!l.quote_date || l.status === 'proposal' || l.status === 'won' || (l.status === 'lost' && !!l.quote_amount);
}

/** 'YYYY-MM' (브라우저 로컬=KST 기준) */
function leadMonthKey(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 유입경로 추정 (leads.source 컬럼이 없어 접수 형태로 추정) */
function leadSourceOf(l) {
  const notes = l.notes || '';
  if (notes.startsWith('[QR 견적문의]')) return 'QR 견적문의';
  // 홈페이지(index.html) 양식은 contact_name 을 보내지 않음(null) + 평수/상주인원 메모
  if (l.contact_name == null && (/^(평수|상주인원):/.test(notes) || l.quote_spec)) return '홈페이지 문의';
  return '직접 등록';
}

// ════════════════════════════════════════════════════
// 목록
// ════════════════════════════════════════════════════

function setLeadView(view) {
  _lead.view = view === 'stats' ? 'stats' : 'list';
  renderLeads();
}

function renderLeads(listOnly) {
  if (_lead.view === 'stats' && !listOnly) return renderLeadStats();

  const mc = $('mainContent');
  const leads = adminData.leads || [];

  let list = leads;
  if (leadFilter !== 'all') {
    list = list.filter(l => l.status === leadFilter);
  }
  if (leadSearch) {
    const q = leadSearch.toLowerCase();
    const qDigits = leadSearch.replace(/\D/g, '');
    list = list.filter(l =>
      (l.company_name || '').toLowerCase().includes(q) ||
      (l.contact_name || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q) ||
      (qDigits.length >= 3 && (l.contact_phone || '').replace(/\D/g, '').includes(qDigits))
    );
  }

  const totalCount = list.length;
  const displayList = list.slice(0, _lead.displayCount);
  const hasMore = totalCount > _lead.displayCount;

  const listHTML = `
    <p class="text-muted lead-list-count">총 ${totalCount}건${hasMore ? ` (표시 ${displayList.length}건)` : ''}</p>
    ${totalCount > 0 ? displayList.map(l => {
      const st = leadStatusInfo(l.status);
      const wi = l.work_items || [];
      const amount = leadSupplyAmount(l);
      return `
        <div class="card lead-card" onclick="openLeadDetail('${l.id}')">
          <div class="card-header">
            <div style="min-width:0">
              <div class="card-title">${escapeHtml(l.company_name || '(업체명 없음)')}</div>
              <div class="card-subtitle">
                ${[escapeHtml(l.contact_name || ''), escapeHtml(l.contact_phone || ''), formatDateShort(l.created_at)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span class="badge ${st.badge}">${st.label}</span>
          </div>
          <div class="lead-card-info">
            ${amount ? `<span class="info-chip">💰 ${fmt(amount)}원 <small>(VAT별도)</small></span>` : ''}
            ${wi.length > 0 ? `<span class="info-chip">📋 작업 ${wi.length}건</span>` : ''}
            ${l.location ? `<span class="info-chip">📍 ${escapeHtml(l.location)}</span>` : ''}
            ${l.assigned_to ? `<span class="info-chip">👤 ${escapeHtml(getWorkerName(l.assigned_to))}</span>` : ''}
            ${l.quote_date ? `<span class="info-chip lead-chip-quoted">📄 견적서 ${escapeHtml(l.quote_date)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('') + (hasMore ? `
      <div class="lead-more-wrap"><button class="lead-more-btn" onclick="loadMoreLeads()">더보기 (${displayList.length}/${totalCount})</button></div>` : '') : `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>${leads.length ? '조건에 맞는 견적이 없습니다' : '견적 데이터가 없습니다'}</p>
      </div>
    `}
  `;

  // 검색 시: 목록 컨테이너만 갱신 (input 보존 → IME 유지)
  if (listOnly) {
    const lc = document.getElementById('leadListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  const statusCounts = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  const won = statusCounts.won || 0;
  const lost = statusCounts.lost || 0;
  const active = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
  const activeAmount = active.reduce((s, l) => s + leadSupplyAmount(l), 0);
  const winRate = (won + lost) > 0 ? Math.round(won / (won + lost) * 100) : null;

  mc.innerHTML = `
    ${leadHeaderHTML()}

    <div class="stats-grid lead-kpis">
      <div class="stat-card">
        <div class="stat-label">전체 견적</div>
        <div class="stat-value blue">${leads.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">진행중</div>
        <div class="stat-value">${active.length}</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="setLeadView('stats')" title="견적 통계 보기">
        <div class="stat-label">성공률 (성공/결정)</div>
        <div class="stat-value green">${winRate === null ? '-' : winRate + '%'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">진행중 예상액 (VAT별도)</div>
        <div class="stat-value green">${fmt(activeAmount)}</div>
      </div>
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input id="leadSearchInput" placeholder="업체명, 담당자, 위치, 연락처 검색" value="${escapeHtml(leadSearch)}">
      </div>
      <select class="admin-area-select" onchange="leadFilter=this.value;_lead.displayCount=20;renderLeads()">
        <option value="all"${leadFilter === 'all' ? ' selected' : ''}>전체 상태 (${leads.length})</option>
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${leadFilter === k ? ' selected' : ''}>${v.label} (${statusCounts[k] || 0})</option>`
        ).join('')}
      </select>
    </div>

    <div id="leadListContainer">${listHTML}</div>
  `;

  bindSearchInput('leadSearchInput', (val) => {
    clearTimeout(_lead.searchDebounce);
    _lead.searchDebounce = setTimeout(() => {
      leadSearch = val;
      _lead.displayCount = 20;
      renderLeads(true);
    }, 200);
  });
}

function leadHeaderHTML() {
  return `
    <div class="section-title lead-header">
      <span>견적관리</span>
      <div class="lead-header-actions">
        <div class="lead-view-toggle" role="tablist">
          <button class="${_lead.view === 'list' ? 'active' : ''}" onclick="setLeadView('list')">📋 목록</button>
          <button class="${_lead.view === 'stats' ? 'active' : ''}" onclick="setLeadView('stats')">📈 통계</button>
        </div>
        <button class="btn-sm btn-blue" onclick="exportLeads()">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openLeadForm()">+ 견적 등록</button>
      </div>
    </div>
  `;
}

function loadMoreLeads() {
  _lead.displayCount += 20;
  renderLeads(true);
}

// ════════════════════════════════════════════════════
// 등록/수정 폼
// ════════════════════════════════════════════════════

function openLeadForm(leadId) {
  const isEdit = !!leadId;
  const l = isEdit ? (adminData.leads.find(x => x.id === leadId) || {}) : {};
  const workers = getActiveWorkers();

  _lead.workItems = (l.work_items && l.work_items.length > 0)
    ? JSON.parse(JSON.stringify(l.work_items)).map(it => ({ description: (it && it.description) || '', amount: Number(it && it.amount) || 0 }))
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
        <input id="lPhone" type="tel" value="${escapeHtml(l.contact_phone || '')}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="field">
      <label>위치</label>
      <input id="lLocation" value="${escapeHtml(l.location || '')}" placeholder="주소 입력">
    </div>

    <div class="field lead-wi-field">
      <label class="lead-wi-label">
        <span>작업내용 및 금액 <small class="text-muted">(VAT 별도)</small></span>
        <button type="button" class="btn-sm btn-green" onclick="addLeadWorkItem()">+ 항목 추가</button>
      </label>
      <div id="leadWorkItemsList"></div>
      <div id="leadWorkItemsTotal" class="lead-wi-total"></div>
    </div>

    <div class="admin-row-2">
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
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="lNotes" rows="3" placeholder="메모">${escapeHtml(l.notes || '')}</textarea>
    </div>

    <button class="btn" id="saveLeadBtn" onclick="saveLead('${leadId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn lead-btn-danger" onclick="deleteLead('${leadId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
  renderLeadWorkItems();
}

function addLeadWorkItem() {
  _lead.workItems.push({ description: '', amount: 0 });
  renderLeadWorkItems();
  const inputs = document.querySelectorAll('.lwi-desc');
  if (inputs.length > 0) inputs[inputs.length - 1].focus();
}

function removeLeadWorkItem(idx) {
  _lead.workItems.splice(idx, 1);
  renderLeadWorkItems();
}

function updateLeadWorkItem(idx, field, value) {
  if (!_lead.workItems[idx]) return;
  if (field === 'amount') {
    _lead.workItems[idx].amount = parseMoney(String(value));
  } else {
    _lead.workItems[idx].description = value;
  }
  updateLeadWorkItemsTotal();
}

function updateLeadWorkItemsTotal() {
  const totalEl = document.getElementById('leadWorkItemsTotal');
  if (!totalEl) return;
  const total = _lead.workItems.reduce((s, item) => s + (item.amount || 0), 0);
  totalEl.textContent = total > 0 ? `합계: ${fmt(total)}원 (VAT 별도)` : '';
}

function renderLeadWorkItems() {
  const container = document.getElementById('leadWorkItemsList');
  if (!container) return;

  if (_lead.workItems.length === 0) {
    container.innerHTML = '<p class="text-muted lead-wi-empty">항목 추가 버튼을 눌러 작업내용을 입력하세요</p>';
    updateLeadWorkItemsTotal();
    return;
  }

  container.innerHTML = _lead.workItems.map((item, idx) => `
    <div class="lead-wi-row">
      <span class="lead-wi-no">${idx + 1}</span>
      <input class="lwi-desc" value="${escapeHtml(item.description || '')}" placeholder="작업내용"
             oninput="updateLeadWorkItem(${idx}, 'description', this.value)">
      <input class="lwi-amount" inputmode="numeric" value="${item.amount ? fmt(item.amount) : ''}" placeholder="금액"
             oninput="fmtInput(this);updateLeadWorkItem(${idx}, 'amount', this.value)">
      <span class="lead-wi-unit">원</span>
      <button type="button" class="lead-wi-del" onclick="removeLeadWorkItem(${idx})" title="삭제">&times;</button>
    </div>
  `).join('');

  updateLeadWorkItemsTotal();
}

async function saveLead(leadId) {
  if (_lead.saving) return;
  const btn = $('saveLeadBtn');
  try {
    const companyName = $('lCompanyName').value.trim();
    if (!companyName) return toast('업체명을 입력하세요', 'error');

    const validWorkItems = _lead.workItems
      .map(item => ({ description: (item.description || '').trim(), amount: item.amount || 0 }))
      .filter(item => item.description || item.amount > 0);
    const wiTotal = validWorkItems.reduce((s, item) => s + item.amount, 0);

    const payload = {
      company_name:  companyName,
      contact_name:  $('lContact').value.trim(),
      contact_phone: $('lPhone').value.trim(),
      location:      $('lLocation').value.trim(),
      status:        $('lStatus').value,
      assigned_to:   $('lAssigned').value || null,
      notes:         $('lNotes').value.trim(),
      work_items:    validWorkItems,
    };
    // 작업내용 합계가 있을 때만 예상금액 갱신 (없으면 기존 값 유지 — 수정 시 금액이 지워지던 문제)
    if (wiTotal > 0) payload.estimated_amount = wiTotal;
    else if (!leadId) payload.estimated_amount = null;

    _lead.saving = true;
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    let error;
    if (leadId) {
      ({ error } = await sb.from('leads').update(payload).eq('id', leadId));
    } else {
      ({ error } = await sb.from('leads').insert(payload));
    }
    if (error) return toast('저장 실패: ' + error.message, 'error');

    toast(leadId ? '견적 수정 완료' : '견적 등록 완료');
    closeModal();
    await loadAdminData();
    renderLeads();
  } catch (e) {
    console.error('saveLead error:', e);
    toast('오류가 발생했습니다', 'error');
  } finally {
    _lead.saving = false;
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = leadId ? '수정 저장' : '등록하기'; }
  }
}

// ════════════════════════════════════════════════════
// 상세
// ════════════════════════════════════════════════════

function openLeadDetail(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  const st = leadStatusInfo(l.status);
  const wi = l.work_items || [];
  const wiTotal = leadWorkItemsTotal(l);
  const amount = leadSupplyAmount(l);

  const workItemsHTML = wi.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">작업내용</div>
      <table class="lead-wi-table">
        <thead><tr><th>No</th><th>작업내용</th><th class="num">금액</th></tr></thead>
        <tbody>
          ${wi.map((item, idx) => `
            <tr>
              <td class="muted">${idx + 1}</td>
              <td>${escapeHtml(item && item.description) || '-'}</td>
              <td class="num">${item && item.amount ? fmt(item.amount) + '원' : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot><tr><td colspan="2" class="num">합계 (VAT 별도)</td><td class="num total">${fmt(wiTotal)}원</td></tr></tfoot>
      </table>
    </div>
  ` : '';

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHtml(l.company_name || '(업체명 없음)')}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">담당자</div>
          <p class="text-muted">${escapeHtml(l.contact_name || '-')} ${l.contact_phone ? `<a href="tel:${escapeHtml(l.contact_phone)}">${escapeHtml(l.contact_phone)}</a>` : ''}</p>
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
          <div class="stat-label">견적 금액 (VAT 별도)</div>
          <p class="lead-detail-amount">${amount ? fmt(amount) + '원' : '미입력'}</p>
        </div>
        <div>
          <div class="stat-label">진행 상태</div>
          <p><span class="badge ${st.badge}" style="font-size:13px;padding:4px 12px">${st.label}</span></p>
        </div>
      </div>
    </div>

    ${workItemsHTML}

    <div class="detail-section">
      <div class="detail-section-title">상태 변경</div>
      <div class="lead-status-grid">
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<button class="btn-sm ${k === l.status ? 'btn-blue' : 'btn-gray'}"
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
      <p class="text-muted">등록일: ${formatDateShort(l.created_at)} ${formatDate(l.created_at).split(' ')[1] || ''} · 유입: ${leadSourceOf(l)}</p>
    </div>

    ${l.quote_date ? `
    <div class="detail-section lead-quote-box">
      <div class="detail-section-title">📄 견적서 정보</div>
      <div class="admin-row-2">
        <div>
          <div class="stat-label">견적서 작성일</div>
          <p class="text-muted">${escapeHtml(l.quote_date)}</p>
        </div>
        <div>
          <div class="stat-label">견적 금액</div>
          <p class="lead-quote-amount">${l.quote_amount ? `${fmt(l.quote_amount)}원 <small>(VAT포함)</small><br><small class="text-muted">공급가 ${fmt(quoteSupplyFromTotal(l.quote_amount))}원</small>` : '-'}</p>
        </div>
      </div>
      ${(l.quote_spec || l.quote_frequency) ? `<p class="text-muted" style="font-size:12px;margin-top:4px">규격: ${escapeHtml(l.quote_spec || '-')} / 횟수: ${escapeHtml(l.quote_frequency || '-')}</p>` : ''}
    </div>
    ` : ''}

    <button class="btn lead-btn-primary" onclick="goToQuoteFromLead('${l.id}')">
      ${l.quote_date ? '📄 견적서 수정' : '📝 견적서 작성'}
    </button>
    ${l.status === 'won' ? `
    <button class="btn lead-btn-success" onclick="registerCompanyFromLead('${l.id}')">🏢 업체 등록하기</button>
    ` : ''}
    <div class="lead-btn-row">
      <button class="btn" onclick="openLeadForm('${l.id}')">수정</button>
      <button class="btn lead-btn-danger" onclick="deleteLead('${l.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function updateLeadStatus(leadId, status) {
  if (!LEAD_STATUS_MAP[status]) return;
  try {
    const { error } = await sb.from('leads').update({ status }).eq('id', leadId);
    if (error) return toast('상태 변경 실패: ' + error.message, 'error');

    const local = adminData.leads.find(l => l.id === leadId);
    if (local) local.status = status;

    toast(`상태: ${LEAD_STATUS_MAP[status].label}`);
    openLeadDetail(leadId);
    // 모달 뒤 목록/통계도 즉시 갱신 (이전엔 새로고침 전까지 옛 상태가 보였음)
    if (currentTab === 'leads') renderLeads();

    if (status === 'won') {
      setTimeout(() => {
        if (confirm('견적이 성공으로 전환되었습니다.\n업체로 등록하시겠습니까?')) {
          registerCompanyFromLead(leadId);
        }
      }, 300);
    }
  } catch (e) {
    console.error('updateLeadStatus error:', e);
    toast('오류가 발생했습니다', 'error');
  }
}

async function deleteLead(leadId) {
  try {
    if (!confirm('이 견적을 삭제하시겠습니까?')) return;

    const { error } = await sb.from('leads').delete().eq('id', leadId);
    if (error) return toast('삭제 실패: ' + error.message, 'error');

    toast('견적 삭제됨');
    closeModal();
    await loadAdminData();
    renderLeads();
  } catch (e) {
    console.error('deleteLead error:', e);
    toast('오류가 발생했습니다', 'error');
  }
}

// ═══ 견적관리 → 견적서 연동 ═══
function goToQuoteFromLead(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  pendingQuoteLead = {
    id:             l.id,
    status:         l.status,
    clientName:     l.company_name || '',
    address:        l.location || '',
    amount:         leadSupplyAmount(l),
    quoteDate:      l.quote_date || '',
    frequency:      l.quote_frequency || '주1회',
    spec:           l.quote_spec || '사무실전체',
    workItems:      l.work_items || [],
    quoteWorkItems: l.quote_work_items || null,
  };

  closeModal();
  // 사이드바 활성/제목/URL 해시까지 함께 전환 (이전: 숨겨진 .tab 만 찾아서 제목이 '견적관리'로 남았음)
  switchTab('quote');
}

// ═══ 견적관리 → 업체 등록 연동 ═══
function registerCompanyFromLead(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  pendingLeadForCompany = {
    company_name:    l.company_name || '',
    location:        l.location || '',
    contact_name:    l.contact_name || '',
    contact_phone:   l.contact_phone || '',
    contract_amount: leadSupplyAmount(l),
    memo:            l.notes || '',
  };

  closeModal();
  switchTab('allClients');
  setTimeout(() => openCompanyForm(), 200);
}

// ════════════════════════════════════════════════════
// 견적 통계 (클라이언트 계산, 추가 쿼리 없음)
// ════════════════════════════════════════════════════

const LEAD_STATS_PERIODS = {
  all:  '전체 기간',
  '3m': '최근 3개월',
  '6m': '최근 6개월',
  '12m': '최근 12개월',
  year: '올해',
};

function setLeadStatsPeriod(p) {
  _lead.statsPeriod = LEAD_STATS_PERIODS[p] ? p : 'all';
  renderLeadStats();
}

function leadStatsFilter(leads, period) {
  if (period === 'all') return leads;
  const now = new Date();
  let from;
  if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
  else from = new Date(now.getFullYear(), now.getMonth() - (parseInt(period) - 1), 1);
  return leads.filter(l => l.created_at && new Date(l.created_at) >= from);
}

function leadPct(n, d) {
  return d > 0 ? Math.round(n / d * 1000) / 10 : null;
}
function leadPctStr(n, d) {
  const p = leadPct(n, d);
  return p === null ? '-' : p + '%';
}

/** 집계 (테스트/재사용 가능하도록 DOM 과 분리) */
function computeLeadStats(leads) {
  const s = {
    total: leads.length, quoted: 0, won: 0, lost: 0, active: 0,
    byStatus: {}, quotedAmountSum: 0, quotedAmountCnt: 0, wonAmountSum: 0, wonAmountCnt: 0,
    months: {}, workers: {}, sources: {},
  };
  Object.keys(LEAD_STATUS_MAP).forEach(k => s.byStatus[k] = 0);

  leads.forEach(l => {
    const status = LEAD_STATUS_MAP[l.status] ? l.status : 'new';
    s.byStatus[status]++;
    const quoted = leadIsQuoted(l);
    const amt = leadSupplyAmount(l);
    if (quoted) {
      s.quoted++;
      if (amt > 0) { s.quotedAmountSum += amt; s.quotedAmountCnt++; }
    }
    if (status === 'won') { s.won++; if (amt > 0) { s.wonAmountSum += amt; s.wonAmountCnt++; } }
    else if (status === 'lost') s.lost++;
    else s.active++;

    const mk = leadMonthKey(l.created_at) || '미상';
    const m = s.months[mk] || (s.months[mk] = { total: 0, quoted: 0, won: 0, lost: 0, quotedAmount: 0, wonAmount: 0 });
    m.total++;
    if (quoted) { m.quoted++; m.quotedAmount += amt; }
    if (status === 'won') { m.won++; m.wonAmount += amt; }
    if (status === 'lost') m.lost++;

    const wk = l.assigned_to || '_none';
    const w = s.workers[wk] || (s.workers[wk] = { total: 0, quoted: 0, won: 0, lost: 0 });
    w.total++; if (quoted) w.quoted++; if (status === 'won') w.won++; if (status === 'lost') w.lost++;

    const src = leadSourceOf(l);
    const so = s.sources[src] || (s.sources[src] = { total: 0, quoted: 0, won: 0, lost: 0 });
    so.total++; if (quoted) so.quoted++; if (status === 'won') so.won++; if (status === 'lost') so.lost++;
  });

  s.winRate = leadPct(s.won, s.won + s.lost);          // 성공 / (성공+실패)
  s.quoteWinRate = leadPct(s.won, s.quoted);           // 성공 / 견적제출
  s.quoteRate = leadPct(s.quoted, s.total);            // 견적제출 / 전체 문의
  s.avgQuoted = s.quotedAmountCnt ? Math.round(s.quotedAmountSum / s.quotedAmountCnt) : 0;
  s.avgWon = s.wonAmountCnt ? Math.round(s.wonAmountSum / s.wonAmountCnt) : 0;
  return s;
}

function renderLeadStats() {
  const mc = $('mainContent');
  const all = adminData.leads || [];
  const leads = leadStatsFilter(all, _lead.statsPeriod);
  const s = computeLeadStats(leads);

  // 월별: 기간 내 최근 12개월 (데이터 없는 달도 0으로 표시)
  const now = new Date();
  const monthKeys = [];
  const span = _lead.statsPeriod === 'all' || _lead.statsPeriod === '12m' ? 12
    : _lead.statsPeriod === 'year' ? now.getMonth() + 1 : parseInt(_lead.statsPeriod);
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const maxMonth = Math.max(1, ...monthKeys.map(k => (s.months[k] || {}).total || 0));

  const funnel = [
    { label: '문의 접수', n: s.total, cls: 'f1' },
    { label: '견적 제출', n: s.quoted, cls: 'f2' },
    { label: '계약 성공', n: s.won, cls: 'f3' },
  ];

  const rowsFor = (obj, nameFn) => Object.entries(obj)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => `
      <tr>
        <td>${escapeHtml(nameFn(k))}</td>
        <td class="num">${v.total}</td>
        <td class="num">${v.quoted}</td>
        <td class="num">${v.won}</td>
        <td class="num">${v.lost}</td>
        <td class="num strong">${leadPctStr(v.won, v.won + v.lost)}</td>
      </tr>`).join('');

  mc.innerHTML = `
    ${leadHeaderHTML()}

    <div class="lead-stats-toolbar">
      <div class="lead-period">
        ${Object.entries(LEAD_STATS_PERIODS).map(([k, v]) =>
          `<button class="${_lead.statsPeriod === k ? 'active' : ''}" onclick="setLeadStatsPeriod('${k}')">${v}</button>`).join('')}
      </div>
      <span class="text-muted lead-stats-note">문의 등록일 기준 · 금액은 VAT 별도</span>
    </div>

    <div class="stats-grid lead-kpis lead-stats-kpis">
      <div class="stat-card">
        <div class="stat-label">견적 성공률</div>
        <div class="stat-value green">${s.winRate === null ? '-' : s.winRate + '%'}</div>
        <div class="lead-kpi-sub">성공 ${s.won} / 결정 ${s.won + s.lost}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">제출 견적 대비 성공</div>
        <div class="stat-value blue">${leadPctStr(s.won, s.quoted)}</div>
        <div class="lead-kpi-sub">성공 ${s.won} / 제출 ${s.quoted}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">문의 → 견적 전환율</div>
        <div class="stat-value">${leadPctStr(s.quoted, s.total)}</div>
        <div class="lead-kpi-sub">제출 ${s.quoted} / 문의 ${s.total}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">진행중</div>
        <div class="stat-value">${s.active}</div>
        <div class="lead-kpi-sub">실패 ${s.lost}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 견적 금액</div>
        <div class="stat-value">${s.avgQuoted ? fmt(s.avgQuoted) : '-'}</div>
        <div class="lead-kpi-sub">제출 견적 ${s.quotedAmountCnt}건 평균</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">성공 계약 금액 합계</div>
        <div class="stat-value green">${fmt(s.wonAmountSum)}</div>
        <div class="lead-kpi-sub">평균 ${s.avgWon ? fmt(s.avgWon) : '-'}원</div>
      </div>
    </div>

    ${s.total === 0 ? `
      <div class="empty-state"><div class="empty-icon">📈</div><p>${LEAD_STATS_PERIODS[_lead.statsPeriod]}에 등록된 견적이 없습니다</p></div>
    ` : `
    <div class="lead-stats-grid">
      <div class="card lead-stats-card">
        <h4>전환 퍼널</h4>
        ${funnel.map((f, i) => `
          <div class="lead-funnel-row">
            <div class="lead-funnel-label">${f.label}</div>
            <div class="lead-bar"><div class="lead-bar-fill ${f.cls}" style="width:${s.total ? Math.max(2, f.n / s.total * 100) : 0}%"></div></div>
            <div class="lead-funnel-num">${f.n}건 ${i > 0 ? `<small>(${leadPctStr(f.n, funnel[i - 1].n)})</small>` : ''}</div>
          </div>`).join('')}
      </div>

      <div class="card lead-stats-card">
        <h4>상태별 현황</h4>
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) => `
          <div class="lead-funnel-row clickable" onclick="leadFilter='${k}';_lead.displayCount=20;setLeadView('list')" title="${v.label} 목록 보기">
            <div class="lead-funnel-label"><span class="badge ${v.badge}">${v.label}</span></div>
            <div class="lead-bar"><div class="lead-bar-fill s-${k}" style="width:${s.total ? (s.byStatus[k] / s.total * 100) : 0}%"></div></div>
            <div class="lead-funnel-num">${s.byStatus[k]}건 <small>(${leadPctStr(s.byStatus[k], s.total)})</small></div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card lead-stats-card">
      <h4>월별 추이 <small class="text-muted">(문의 등록월 기준)</small></h4>
      <div class="lead-month-chart">
        ${monthKeys.map(k => {
          const m = s.months[k] || { total: 0, quoted: 0, won: 0 };
          const h = v => (v / maxMonth * 100).toFixed(1);
          return `
          <div class="lead-month-col" title="${k} · 문의 ${m.total} / 견적 ${m.quoted} / 성공 ${m.won}">
            <div class="lead-month-bars">
              <div class="b total" style="height:${h(m.total)}%"></div>
              <div class="b quoted" style="height:${h(m.quoted)}%"></div>
              <div class="b won" style="height:${h(m.won)}%"></div>
            </div>
            <div class="lead-month-label">${parseInt(k.slice(5))}월</div>
          </div>`;
        }).join('')}
      </div>
      <div class="lead-legend"><span class="total">문의</span><span class="quoted">견적제출</span><span class="won">성공</span></div>
      <div class="table-wrap lead-table-wrap">
        <table class="lead-stats-table">
          <thead><tr><th>월</th><th class="num">문의</th><th class="num">견적제출</th><th class="num">성공</th><th class="num">실패</th><th class="num">성공률</th><th class="num">견적금액 합계</th></tr></thead>
          <tbody>
            ${monthKeys.slice().reverse().map(k => {
              const m = s.months[k] || { total: 0, quoted: 0, won: 0, lost: 0, quotedAmount: 0 };
              return `<tr${m.total ? '' : ' class="muted"'}>
                <td>${k}</td><td class="num">${m.total}</td><td class="num">${m.quoted}</td>
                <td class="num">${m.won}</td><td class="num">${m.lost}</td>
                <td class="num strong">${leadPctStr(m.won, m.won + m.lost)}</td>
                <td class="num">${m.quotedAmount ? fmt(m.quotedAmount) : '-'}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="lead-stats-grid">
      <div class="card lead-stats-card">
        <h4>담당 직원별</h4>
        <div class="table-wrap lead-table-wrap">
          <table class="lead-stats-table">
            <thead><tr><th>담당</th><th class="num">전체</th><th class="num">견적</th><th class="num">성공</th><th class="num">실패</th><th class="num">성공률</th></tr></thead>
            <tbody>${rowsFor(s.workers, k => k === '_none' ? '미지정' : getWorkerName(k))}</tbody>
          </table>
        </div>
      </div>
      <div class="card lead-stats-card">
        <h4>유입 경로별 <small class="text-muted">(추정)</small></h4>
        <div class="table-wrap lead-table-wrap">
          <table class="lead-stats-table">
            <thead><tr><th>경로</th><th class="num">전체</th><th class="num">견적</th><th class="num">성공</th><th class="num">실패</th><th class="num">성공률</th></tr></thead>
            <tbody>${rowsFor(s.sources, k => k)}</tbody>
          </table>
        </div>
        <p class="text-muted lead-stats-foot">유입 경로 컬럼이 없어 접수 메모 형태로 추정한 값입니다.</p>
      </div>
    </div>
    `}

    <p class="text-muted lead-stats-foot">
      · 성공률 = 성공 ÷ (성공 + 실패). 진행중인 견적은 제외합니다.<br>
      · 견적 제출 = 견적서를 저장했거나 상태가 견적제출/성공인 건.<br>
      · 성공·실패 날짜가 따로 기록되지 않아 월별 성공은 문의 등록월에 집계됩니다.
    </p>
  `;
}

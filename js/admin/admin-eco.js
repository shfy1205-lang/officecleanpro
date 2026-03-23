/**
 * admin-eco.js - 에코오피스 (본사) 관리
 * 에코 도급업체 체크리스트 + 에코 금액 현황
 */

/* ─── 상태 ─── */
let ecoMonth = '';
let ecoSearch = '';
let ecoCheckFilter = ''; // '' | 'incomplete' | 'complete'

/* ─── 체크리스트 항목 정의 ─── */
const ECO_CHECKLIST_ITEMS = [
  { key: 'contract_confirmed',  label: '계약서 확인',     desc: '에코 도급 계약서 서명 및 보관 확인' },
  { key: 'invoice_issued',      label: '세금계산서 발행',  desc: '해당 월 세금계산서 발행 여부' },
  { key: 'payment_received',    label: '입금 확인',       desc: '에코에서 계약금액 입금 확인' },
  { key: 'eco_fee_deducted',    label: '에코 수수료 정산', desc: '에코 수수료 차감 금액 확인' },
  { key: 'worker_dispatched',   label: '인력 배치 확인',   desc: '해당 업체 담당자 배치 완료' },
  { key: 'quality_checked',     label: '품질 점검',       desc: '청소 품질 점검 완료 여부' },
  { key: 'report_submitted',    label: '월간 보고서 제출', desc: '에코 본사에 월간 실적 보고서 제출' },
  { key: 'issue_resolved',      label: '이슈 처리 완료',   desc: '해당 월 발생 이슈 처리 완료 여부' },
];

/* ─── 로컬 체크 데이터 (Supabase에 eco_checklist 테이블 없으면 localStorage 사용) ─── */
function getEcoCheckData() {
  try {
    return JSON.parse(localStorage.getItem('eco_checklist') || '{}');
  } catch { return {}; }
}

function setEcoCheckData(data) {
  localStorage.setItem('eco_checklist', JSON.stringify(data));
}

function getCheckKey(companyId, month, itemKey) {
  return `${companyId}__${month}__${itemKey}`;
}

function isItemChecked(companyId, month, itemKey) {
  const data = getEcoCheckData();
  return !!data[getCheckKey(companyId, month, itemKey)];
}

function toggleCheckItem(companyId, month, itemKey) {
  const data = getEcoCheckData();
  const key = getCheckKey(companyId, month, itemKey);
  if (data[key]) {
    delete data[key];
  } else {
    data[key] = { checked: true, at: new Date().toISOString() };
  }
  setEcoCheckData(data);
  renderEcoHTML(true);
}

/* ─── 에코 업체 데이터 가공 ─── */
function getEcoCompanies(month) {
  const m = month || ecoMonth || selectedMonth;
  const ecoCompanies = adminData.companies.filter(c =>
    c.subcontract_from === '에코오피스클린' && c.status !== 'terminated'
  );
  const finMap = buildFinMap(adminData.financials, m);
  return ecoCompanies.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const eco = fin?.eco_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const workerPay = fin?.worker_pay_total || 0;
    const checkedCount = ECO_CHECKLIST_ITEMS.filter(item =>
      isItemChecked(c.id, m, item.key)
    ).length;
    const assigns = adminData.assignments.filter(a => a.company_id === c.id && a.month === m);
    const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';
    return {
      id: c.id, name: c.name,
      areaCode: c.area_code || '', areaName: c.area_name || '',
      contract, eco, ocp, workerPay, checkedCount,
      totalChecks: ECO_CHECKLIST_ITEMS.length, workerNames, fin,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function getFilteredEcoCompanies() {
  let list = getEcoCompanies();
  if (ecoSearch) {
    const q = ecoSearch.toLowerCase();
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.areaCode.toLowerCase().includes(q));
  }
  if (ecoCheckFilter === 'incomplete') list = list.filter(d => d.checkedCount < d.totalChecks);
  else if (ecoCheckFilter === 'complete') list = list.filter(d => d.checkedCount === d.totalChecks);
  return list;
}

function getEcoSummary() {
  const all = getEcoCompanies();
  return {
    totalEcoFee: all.reduce((s, d) => s + d.eco, 0),
    totalContract: all.reduce((s, d) => s + d.contract, 0),
    totalComplete: all.filter(d => d.checkedCount === d.totalChecks).length,
    totalIncomplete: all.filter(d => d.checkedCount < d.totalChecks).length,
    total: all.length,
  };
}

function renderEco() {
  ecoMonth = ecoMonth || selectedMonth;
  renderEcoHTML();
}

function renderEcoHTML(listOnly) {
  const mc = $('mainContent');
  const filtered = getFilteredEcoCompanies();
  const m = ecoMonth || selectedMonth;
  const listHTML = buildEcoListHTML(filtered);
  if (listOnly) {
    const lc = document.getElementById('ecoListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }
  const summary = getEcoSummary();
  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();
  mc.innerHTML = `
    <div class="section-title">에코오피스 관리 (본사)</div>
    <div class="stats-grid-4 eco-stats">
      <div class="stat-card"><div class="stat-label">에코 도급 업체</div><div class="stat-value">${summary.total}<span class="eco-unit">개</span></div></div>
      <div class="stat-card"><div class="stat-label">에코 수수료 합계</div><div class="stat-value orange">${fmt(summary.totalEcoFee)}<span class="eco-unit">원</span></div></div>
      <div class="stat-card eco-stat-clickable${ecoCheckFilter==='complete'?' active':''}" onclick="filterEcoByStatus('complete')"><div class="stat-label">체크 완료</div><div class="stat-value green">${summary.totalComplete}<span class="eco-unit">개</span></div></div>
      <div class="stat-card eco-stat-clickable${ecoCheckFilter==='incomplete'?' active':''}" onclick="filterEcoByStatus('incomplete')"><div class="stat-label">체크 미완료</div><div class="stat-value red">${summary.totalIncomplete}<span class="eco-unit">개</span></div></div>
    </div>
    <div class="card eco-fee-summary">
      <div class="eco-fee-title">💰 ${m} 에코 금액 현황</div>
      <div class="eco-fee-grid">
        <div class="eco-fee-item"><div class="eco-fee-label">총 계약금액</div><div class="eco-fee-value">${fmt(summary.totalContract)}원</div></div>
        <div class="eco-fee-item"><div class="eco-fee-label">에코 수수료 합계</div><div class="eco-fee-value orange">${fmt(summary.totalEcoFee)}원</div></div>
        <div class="eco-fee-item"><div class="eco-fee-label">에코 정산 예정</div><div class="eco-fee-value accent">${fmt(summary.totalContract - summary.totalEcoFee)}원</div></div>
      </div>
    </div>
    <div class="eco-filter-bar">
      <select class="eco-filter-select" onchange="changeEcoMonth(this.value)">
        ${allMonths.map(mm=>`<option value="${mm}"${mm===m?' selected':''}>${mm.split('-')[1]}월 (${mm})</option>`).join('')}
      </select>
      <select class="eco-filter-select" onchange="changeEcoCheckFilter(this.value)">
        <option value="">전체 상태</option>
        <option value="incomplete"${ecoCheckFilter==='incomplete'?' selected':''}>미완료</option>
        <option value="complete"${ecoCheckFilter==='complete'?' selected':''}>완료</option>
      </select>
      <div class="eco-search-wrap"><input id="ecoSearchInput" class="eco-search-input" type="text" placeholder="업체명 검색" value="${ecoSearch}"></div>
    </div>
    <div id="ecoListContainer">${listHTML}</div>
  `;
  bindSearchInput('ecoSearchInput', (val) => { ecoSearch = val.trim(); renderEcoHTML(true); });
}

function buildEcoListHTML(filtered) {
  if (filtered.length === 0) return `<div class="empty-state"><div class="empty-icon">🏢</div><p>${ecoSearch||ecoCheckFilter?'해당 조건의 업체가 없습니다':'에코 도급 업체가 없습니다'}</p></div>`;
  return `
    <div class="eco-result-count">${filtered.length}개 업체 ${ecoSearch||ecoCheckFilter?'(필터 적용됨)':''}</div>
    <div class="eco-table-pc"><div class="table-wrap"><table>
      <thead><tr><th>업체명</th><th>구역</th><th>계약금액</th><th>에코 수수료</th><th>담당자</th><th>체크리스트</th><th>상태</th><th>상세</th></tr></thead>
      <tbody>${filtered.map(d => {
        const pct = d.totalChecks>0?Math.round(d.checkedCount/d.totalChecks*100):0;
        const sb = pct===100?'<span class="badge badge-done">완료</span>':pct>=50?'<span class="badge badge-today">진행중</span>':'<span class="badge badge-warn">미완료</span>';
        return `<tr><td style="font-weight:600">${escapeHtml(d.name)}</td><td>${escapeHtml(d.areaCode)}</td><td>${fmt(d.contract)}원</td><td style="color:var(--orange);font-weight:600">${fmt(d.eco)}원</td><td style="font-size:12px">${escapeHtml(d.workerNames)}</td><td><div class="eco-progress-bar"><div class="eco-progress-fill" style="width:${pct}%"></div></div><span style="font-size:11px;color:var(--text2)">${d.checkedCount}/${d.totalChecks}</span></td><td>${sb}</td><td><button class="btn-sm btn-blue" style="font-size:11px;padding:4px 10px" onclick="openEcoDetail('${d.id}')">체크</button></td></tr>`;
      }).join('')}</tbody>
    </table></div></div>
    <div class="eco-cards-mobile">${filtered.map(d => {
      const pct = d.totalChecks>0?Math.round(d.checkedCount/d.totalChecks*100):0;
      const sb = pct===100?'<span class="badge badge-done">완료</span>':pct>=50?'<span class="badge badge-today">진행중</span>':'<span class="badge badge-warn">미완료</span>';
      return `<div class="card eco-card" onclick="openEcoDetail('${d.id}')"><div class="eco-card-header"><div><div class="eco-card-name">${escapeHtml(d.name)}</div><div class="eco-card-area">${escapeHtml(d.areaCode)}</div></div>${sb}</div><div class="eco-card-body"><div class="eco-card-row"><span class="eco-card-label">계약금액</span><span>${fmt(d.contract)}원</span></div><div class="eco-card-row"><span class="eco-card-label">에코 수수료</span><span style="color:var(--orange);font-weight:600">${fmt(d.eco)}원</span></div><div class="eco-card-row"><span class="eco-card-label">담당자</span><span>${escapeHtml(d.workerNames)}</span></div><div class="eco-card-row"><span class="eco-card-label">체크리스트</span><span>${d.checkedCount}/${d.totalChecks}</span></div><div class="eco-progress-bar" style="margin-top:8px"><div class="eco-progress-fill" style="width:${pct}%"></div></div></div></div>`;
    }).join('')}</div>
  `;
}

function changeEcoMonth(month) { ecoMonth = month; renderEcoHTML(); }
function changeEcoCheckFilter(val) { ecoCheckFilter = val; renderEcoHTML(true); }
function filterEcoByStatus(status) { ecoCheckFilter = (ecoCheckFilter === status) ? '' : status; renderEcoHTML(); }

function openEcoDetail(companyId) {
  const m = ecoMonth || selectedMonth;
  const c = adminData.companies.find(co => co.id === companyId);
  if (!c) return;
  const fin = buildFinMap(adminData.financials, m)[companyId];
  const contract = fin?.contract_amount || 0;
  const eco = fin?.eco_amount || 0;
  const ocp = fin?.ocp_amount || 0;
  const assigns = adminData.assignments.filter(a => a.company_id === companyId && a.month === m);
  const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';
  const checkedCount = ECO_CHECKLIST_ITEMS.filter(item => isItemChecked(companyId, m, item.key)).length;
  const pct = ECO_CHECKLIST_ITEMS.length > 0 ? Math.round(checkedCount / ECO_CHECKLIST_ITEMS.length * 100) : 0;
  const checklistHTML = ECO_CHECKLIST_ITEMS.map(item => {
    const checked = isItemChecked(companyId, m, item.key);
    return `<div class="eco-check-item ${checked?'eco-check-done':''}" onclick="toggleCheckItem('${companyId}','${m}','${item.key}');openEcoDetail('${companyId}')"><div class="eco-check-box">${checked?'✅':'⬜'}</div><div class="eco-check-info"><div class="eco-check-label">${item.label}</div><div class="eco-check-desc">${item.desc}</div></div></div>`;
  }).join('');
  $('modalBody').innerHTML = `
    <div class="modal-header"><h3>${escapeHtml(c.name)} — 에코 체크리스트</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-content">
      <div class="eco-detail-info">
        <div class="eco-detail-row"><span class="eco-detail-label">대상 월</span><span>${m}</span></div>
        <div class="eco-detail-row"><span class="eco-detail-label">구역</span><span>${escapeHtml(c.area_code||'-')}</span></div>
        <div class="eco-detail-row"><span class="eco-detail-label">계약금액</span><span>${fmt(contract)}원</span></div>
        <div class="eco-detail-row"><span class="eco-detail-label">에코 수수료</span><span style="color:var(--orange);font-weight:700">${fmt(eco)}원</span></div>
        <div class="eco-detail-row"><span class="eco-detail-label">OCP 수수료</span><span>${fmt(ocp)}원</span></div>
        <div class="eco-detail-row"><span class="eco-detail-label">담당자</span><span>${escapeHtml(workerNames)}</span></div>
      </div>
      <div class="eco-detail-progress">
        <div class="eco-detail-progress-label">완료율 ${pct}% (${checkedCount}/${ECO_CHECKLIST_ITEMS.length})</div>
        <div class="eco-progress-bar eco-progress-bar-lg"><div class="eco-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="eco-checklist">${checklistHTML}</div>
    </div>
  `;
  $('detailModal').classList.add('active');
}

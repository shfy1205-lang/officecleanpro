/**
 * admin-eco.js - 에코오피스 관리
 * 에코 관련 업체 현황 + 에코 금액 관리
 * 표시 대상: eco_amount가 있는 업체 OR subcontract_from이 에코 관련인 업체
 */
let ecoMonth = '';
let ecoSearch = '';
let ecoTypeFilter = '';

function isEcoRelated(company, fin) {
  const sf = company.subcontract_from || '';
  const isEcoSub = sf === '에코오피스클린' || sf === '에코광고비';
  const hasEcoFee = (fin?.eco_amount || 0) > 0;
  return isEcoSub || hasEcoFee;
}

function getEcoTag(company, fin) {
  const sf = company.subcontract_from || '';
  const hasEcoFee = (fin?.eco_amount || 0) > 0;
  if (sf === '에코오피스클린' && hasEcoFee) return { label: '도급+수수료', cls: 'badge-warn' };
  if (sf === '에코오피스클린') return { label: '에코도급', cls: 'badge-today' };
  if (sf === '에코광고비') return { label: '에코광고비', cls: 'badge-purple' };
  if (hasEcoFee) return { label: '에코수수료', cls: 'badge-orange' };
  return { label: '-', cls: '' };
}

function isOcpInvoice(company) {
  const sf = company.subcontract_from || '';
  return sf !== '에코오피스클린' && sf !== '에코광고비';
}

function getEcoCompanies(month) {
  const m = month || ecoMonth || selectedMonth;
  const finMap = buildFinMap(adminData.financials, m);
  const list = adminData.companies.filter(c => {
    if (c.status === 'terminated') return false;
    return isEcoRelated(c, finMap[c.id]);
  });
  return list.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const eco = fin?.eco_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const tag = getEcoTag(c, fin);
    const ocpInvoice = isOcpInvoice(c);
    const assigns = adminData.assignments.filter(a => a.company_id === c.id && a.month === m);
    const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';
    return { id: c.id, name: c.name, areaCode: c.area_code || '',
      subcontractFrom: c.subcontract_from || '',
      contract, eco, ocp, tag, ocpInvoice, workerNames };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function getFilteredEcoCompanies() {
  let list = getEcoCompanies();
  if (ecoSearch) {
    const q = ecoSearch.toLowerCase();
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.areaCode.toLowerCase().includes(q));
  }
  if (ecoTypeFilter === 'subcontract') list = list.filter(d => d.subcontractFrom === '에코오피스클린');
  else if (ecoTypeFilter === 'eco_fee') list = list.filter(d => d.eco > 0);
  else if (ecoTypeFilter === 'no_invoice') list = list.filter(d => !d.ocpInvoice);
  return list;
}

function getEcoSummary() {
  const all = getEcoCompanies();
  return {
    total: all.length,
    totalEcoFee: all.reduce((s, d) => s + d.eco, 0),
    totalContract: all.reduce((s, d) => s + d.contract, 0),
    totalOcp: all.reduce((s, d) => s + d.ocp, 0),
    noInvoiceCount: all.filter(d => !d.ocpInvoice).length,
    ecoFeeCount: all.filter(d => d.eco > 0).length
  };
}

function renderEco() { ecoMonth = ecoMonth || selectedMonth; renderEcoHTML(); }

function renderEcoHTML(listOnly) {
  const mc = $('mainContent');
  const filtered = getFilteredEcoCompanies();
  const m = ecoMonth || selectedMonth;
  const listHTML = `<div class="eco-result-count">${filtered.length}개 업체 ${ecoSearch || ecoTypeFilter ? '(필터 적용됨)' : ''}</div>
${filtered.length > 0 ? `<div class="eco-table-pc"><div class="table-wrap"><table>
<thead><tr><th>업체명</th><th>구역</th><th>구분</th><th>계약금액</th><th>에코 수수료</th><th>OCP 수수료</th><th>세금계산서</th><th>담당자</th></tr></thead>
<tbody>${filtered.map(d => {
  const inv = d.ocpInvoice ? '<span class="badge badge-done">OCP발행</span>' : '<span class="badge badge-warn">미발행</span>';
  return \`<tr>
    <td style="font-weight:600">${escapeHtml(d.name)}</td>
    <td>${escapeHtml(d.areaCode)}</td>
    <td><span class="badge ${d.tag.cls}">${d.tag.label}</span></td>
    <td>${fmt(d.contract)}원</td>
    <td style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco)+'원' : '-'}</td>
    <td>${fmt(d.ocp)}원</td>
    <td>${inv}</td>
    <td style="font-size:12px">${escapeHtml(d.workerNames)}</td>
  </tr>\`}).join('')}</tbody></table></div></div>
<div class="eco-cards-mobile">${filtered.map(d => {
  const inv = d.ocpInvoice ? '<span class="badge badge-done">OCP발행</span>' : '<span class="badge badge-warn">미발행</span>';
  return \`<div class="card eco-card">
    <div class="eco-card-header"><div><div class="eco-card-name">${escapeHtml(d.name)}</div><div class="eco-card-area">${escapeHtml(d.areaCode)}</div></div><span class="badge ${d.tag.cls}">${d.tag.label}</span></div>
    <div class="eco-card-body">
      <div class="eco-card-row"><span class="eco-card-label">계약금액</span><span>${fmt(d.contract)}원</span></div>
      <div class="eco-card-row"><span class="eco-card-label">에코 수수료</span><span style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco)+'원' : '-'}</span></div>
      <div class="eco-card-row"><span class="eco-card-label">OCP 수수료</span><span>${fmt(d.ocp)}원</span></div>
      <div class="eco-card-row"><span class="eco-card-label">세금계산서</span>${inv}</div>
      <div class="eco-card-row"><span class="eco-card-label">담당자</span><span>${escapeHtml(d.workerNames)}</span></div>
    </div></div>\`}).join('')}</div>
` : `<div class="empty-state"><div class="empty-icon">🏢</div><p>${ecoSearch || ecoTypeFilter ? '해당 조건의 업체가 없습니다' : '에코 관련 업체가 없습니다'}</p></div>`}`;
  if (listOnly) { const lc = document.getElementById('ecoListContainer'); if (lc) { lc.innerHTML = listHTML; return; } }
  const summary = getEcoSummary();
  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();
  mc.innerHTML = `<div class="section-title">에코오피스 관리</div>
<div class="stats-grid-4 eco-stats">
  <div class="stat-card"><div class="stat-label">에코 관련 업체</div><div class="stat-value">${summary.total}<span class="eco-unit">개</span></div></div>
  <div class="stat-card"><div class="stat-label">에코 수수료 합계</div><div class="stat-value orange">${fmt(summary.totalEcoFee)}<span class="eco-unit">원</span></div></div>
  <div class="stat-card eco-stat-clickable${ecoTypeFilter==='eco_fee'?' active':''}" onclick="filterEcoByType('eco_fee')"><div class="stat-label">수수료 지급 업체</div><div class="stat-value">${summary.ecoFeeCount}<span class="eco-unit">개</span></div></div>
  <div class="stat-card eco-stat-clickable${ecoTypeFilter==='no_invoice'?' active':''}" onclick="filterEcoByType('no_invoice')"><div class="stat-label">세금계산서 미발행</div><div class="stat-value red">${summary.noInvoiceCount}<span class="eco-unit">개</span></div></div>
</div>
<div class="card eco-fee-summary">
  <div class="eco-fee-title">${m} 에코 금액 현황</div>
  <div class="eco-fee-grid">
    <div class="eco-fee-item"><div class="eco-fee-label">총 계약금액</div><div class="eco-fee-value">${fmt(summary.totalContract)}원</div></div>
    <div class="eco-fee-item"><div class="eco-fee-label">에코 수수료 합계</div><div class="eco-fee-value orange">${fmt(summary.totalEcoFee)}원</div></div>
    <div class="eco-fee-item"><div class="eco-fee-label">OCP 수수료 합계</div><div class="eco-fee-value accent">${fmt(summary.totalOcp)}원</div></div>
  </div>
</div>
<div class="eco-filter-bar">
  <select class="eco-filter-select" onchange="changeEcoMonth(this.value)">${allMonths.map(mm => `<option value="${mm}"${mm===m?' selected':''}>${mm.split('-')[1]}월 (${mm})</option>`).join('')}</select>
  <select class="eco-filter-select" onchange="changeEcoTypeFilter(this.value)">
    <option value="">전체</option>
    <option value="subcontract"${ecoTypeFilter==='subcontract'?' selected':''}>에코도급</option>
    <option value="eco_fee"${ecoTypeFilter==='eco_fee'?' selected':''}>수수료 지급</option>
    <option value="no_invoice"${ecoTypeFilter==='no_invoice'?' selected':''}>세금계산서 미발행</option>
  </select>
  <div class="eco-search-wrap"><input id="ecoSearchInput" class="eco-search-input" type="text" placeholder="업체명 검색" value="${ecoSearch}"></div>
</div>
<div id="ecoListContainer">${listHTML}</div>`;
  bindSearchInput('ecoSearchInput', (val) => { ecoSearch = val.trim(); renderEcoHTML(true); });
}
function changeEcoMonth(month) { ecoMonth = month; renderEcoHTML(); }
function changeEcoTypeFilter(val) { ecoTypeFilter = val; renderEcoHTML(true); }
function filterEcoByType(type) { ecoTypeFilter = (ecoTypeFilter === type) ? '' : type; renderEcoHTML(); }


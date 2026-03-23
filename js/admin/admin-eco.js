/**
 * admin-eco.js - ìì½ì¤í¼ì¤ ê´ë¦¬
 * ìì½ ê´ë ¨ ìì²´ íí© + ìì½ ê¸ì¡ ê´ë¦¬
 * íì ëì: eco_amountê° ìë ìì²´ OR subcontract_fromì´ ìì½ ê´ë ¨ì¸ ìì²´
 */

/* âââ ìí âââ */
let ecoMonth = '';
let ecoSearch = '';
let ecoTypeFilter = ''; // '' | 'subcontract' | 'eco_fee' | 'no_invoice'

/* âââ ìì½ ê´ë ¨ ìì²´ì¸ì§ íë³ âââ */
function isEcoRelated(company, fin) {
  // 1) subcontract_fromì´ ìì½ ê´ë ¨
  const sf = company.subcontract_from || '';
  const isEcoSubcontract = sf === 'ìì½ì¤í¼ì¤í´ë¦°' || sf === 'ìì½ê´ê³ ë¹';
  // 2) eco_amountê° ìì
  const hasEcoFee = (fin?.eco_amount || 0) > 0;
  return isEcoSubcontract || hasEcoFee;
}

/* ìì²´ ë¶ë¥ íê·¸ */
function getEcoTag(company, fin) {
  const sf = company.subcontract_from || '';
  const hasEcoFee = (fin?.eco_amount || 0) > 0;

  if (sf === 'ìì½ì¤í¼ì¤í´ë¦°' && hasEcoFee) return { label: 'ëê¸+ììë£', cls: 'badge-warn' };
  if (sf === 'ìì½ì¤í¼ì¤í´ë¦°') return { label: 'ìì½ëê¸', cls: 'badge-today' };
  if (sf === 'ìì½ê´ê³ ë¹') return { label: 'ìì½ê´ê³ ë¹', cls: 'badge-purple' };
  if (hasEcoFee) return { label: 'ìì½ììë£', cls: 'badge-orange' };
  return { label: '-', cls: '' };
}

/* ì¸ê¸ê³ì°ì ë°í ì¬ë¶ */
function isOcpInvoice(company) {
  const sf = company.subcontract_from || '';
  // ìì½ì¤í¼ì¤í´ë¦°/ìì½ê´ê³ ë¹ ëê¸ì´ë©´ OCPìì ì¸ê¸ê³ì°ìë¥¼ ì ëì
  return sf !== 'ìì½ì¤í¼ì¤í´ë¦°' && sf !== 'ìì½ê´ê³ ë¹';
}

/* âââ ìì½ ìì²´ ë°ì´í° ê°ê³µ âââ */
function getEcoCompanies(month) {
  const m = month || ecoMonth || selectedMonth;
  const finMap = buildFinMap(adminData.financials, m);

  // ìì½ ê´ë ¨ ìì²´ë§ íí° (í´ì§ ì ì¸)
  const ecoCompanies = adminData.companies.filter(c => {
    if (c.status === 'terminated') return false;
    const fin = finMap[c.id];
    return isEcoRelated(c, fin);
  });

  return ecoCompanies.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const eco = fin?.eco_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const workerPay = fin?.worker_pay_total || 0;
    const tag = getEcoTag(c, fin);
    const ocpInvoice = isOcpInvoice(c);

    // ë°°ì  ì§ì
    const assigns = adminData.assignments.filter(a => a.company_id === c.id && a.month === m);
    const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';

    return {
      id: c.id,
      name: c.name,
      areaCode: c.area_code || '',
      areaName: c.area_name || '',
      subcontractFrom: c.subcontract_from || '',
      contract, eco, ocp, workerPay,
      tag, ocpInvoice, workerNames, fin,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/* âââ íí° ì ì© âââ */
function getFilteredEcoCompanies() {
  let list = getEcoCompanies();

  if (ecoSearch) {
    const q = ecoSearch.toLowerCase();
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.areaCode.toLowerCase().includes(q));
  }

  if (ecoTypeFilter === 'subcontract') {
    list = list.filter(d => d.subcontractFrom === 'ìì½ì¤í¼ì¤í´ë¦°');
  } else if (ecoTypeFilter === 'eco_fee') {
    list = list.filter(d => d.eco > 0);
  } else if (ecoTypeFilter === 'no_invoice') {
    list = list.filter(d => !d.ocpInvoice);
  }

  return list;
}

/* âââ ìì½ íµê³ âââ */
function getEcoSummary() {
  const all = getEcoCompanies();
  const totalEcoFee = all.reduce((s, d) => s + d.eco, 0);
  const totalContract = all.reduce((s, d) => s + d.contract, 0);
  const totalOcp = all.reduce((s, d) => s + d.ocp, 0);
  const noInvoiceCount = all.filter(d => !d.ocpInvoice).length;
  const ecoFeeCount = all.filter(d => d.eco > 0).length;

  return { totalEcoFee, totalContract, totalOcp, noInvoiceCount, ecoFeeCount, total: all.length };
}

/* âââ ë©ì¸ ë ë âââ */
function renderEco() {
  ecoMonth = ecoMonth || selectedMonth;
  renderEcoHTML();
}

function renderEcoHTML(listOnly) {
  const mc = $('mainContent');
  const filtered = getFilteredEcoCompanies();
  const m = ecoMonth || selectedMonth;

  // ëª©ë¡ HTML
  const listHTML = `
    <div class="eco-result-count">${filtered.length}ê° ìì²´ ${ecoSearch || ecoTypeFilter ? '(íí° ì ì©ë¨)' : ''}</div>

    ${filtered.length > 0 ? `
      <!-- PC íì´ë¸ -->
      <div class="eco-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ìì²´ëª</th>
                <th>êµ¬ì­</th>
                <th>êµ¬ë¶</th>
                <th>ê³ì½ê¸ì¡</th>
                <th>ìì½ ììë£</th>
                <th>OCP ììë£</th>
                <th>ì¸ê¸ê³ì°ì</th>
                <th>ë´ë¹ì</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(d => {
                const invoiceBadge = d.ocpInvoice
                  ? '<span class="badge badge-done">OCPë°í</span>'
                  : '<span class="badge badge-warn">ë¯¸ë°í</span>';
                return `<tr>
                  <td style="font-weight:600">${escapeHtml(d.name)}</td>
                  <td>${escapeHtml(d.areaCode)}</td>
                  <td><span class="badge ${d.tag.cls}">${d.tag.label}</span></td>
                  <td>${fmt(d.contract)}ì</td>
                  <td style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco) + 'ì' : '-'}</td>
                  <td>${fmt(d.ocp)}ì</td>
                  <td>${invoiceBadge}</td>
                  <td style="font-size:12px">${escapeHtml(d.workerNames)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ëª¨ë°ì¼ ì¹´ë -->
      <div class="eco-cards-mobile">
        ${filtered.map(d => {
          const invoiceBadge = d.ocpInvoice
            ? '<span class="badge badge-done">OCPë°í</span>'
            : '<span class="badge badge-warn">ë¯¸ë°í</span>';
          return `<div class="card eco-card">
            <div class="eco-card-header">
              <div>
                <div class="eco-card-name">${escapeHtml(d.name)}</div>
                <div class="eco-card-area">${escapeHtml(d.areaCode)}</div>
              </div>
              <span class="badge ${d.tag.cls}">${d.tag.label}</span>
            </div>
            <div class="eco-card-body">
              <div class="eco-card-row">
                <span class="eco-card-label">ê³ì½ê¸ì¡</span>
                <span>${fmt(d.contract)}ì</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">ìì½ ììë£</span>
                <span style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco) + 'ì' : '-'}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">OCP ììë£</span>
                <span>${fmt(d.ocp)}ì</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">ì¸ê¸ê³ì°ì</span>
                ${invoiceBadge}
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">ë´ë¹ì</span>
                <span>${escapeHtml(d.workerNames)}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">ð¢</div>
        <p>${ecoSearch || ecoTypeFilter ? 'í´ë¹ ì¡°ê±´ì ìì²´ê° ììµëë¤' : 'ìì½ ê´ë ¨ ìì²´ê° ììµëë¤'}</p>
      </div>
    `}
  `;

  // ê²ì ì: ëª©ë¡ë§ ê°±ì 
  if (listOnly) {
    const lc = document.getElementById('ecoListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // ì ì²´ ë ë
  const summary = getEcoSummary();

  // ì¬ì© ê°ë¥í ì ëª©ë¡
  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();

  mc.innerHTML = `
    <div class="section-title">ìì½ì¤í¼ì¤ ê´ë¦¬</div>

    <!-- ìì½ ì¹´ë -->
    <div class="stats-grid-4 eco-stats">
      <div class="stat-card">
        <div class="stat-label">ìì½ ê´ë ¨ ìì²´</div>
        <div class="stat-value">${summary.total}<span class="eco-unit">ê°</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">ìì½ ììë£ í©ê³</div>
        <div class="stat-value orange">${fmt(summary.totalEcoFee)}<span class="eco-unit">ì</span></div>
      </div>
      <div class="stat-card eco-stat-clickable${ecoTypeFilter === 'eco_fee' ? ' active' : ''}"
           onclick="filterEcoByType('eco_fee')">
        <div class="stat-label">ììë£ ì§ê¸ ìì²´</div>
        <div class="stat-value">${summary.ecoFeeCount}<span class="eco-unit">ê°</span></div>
      </div>
      <div class="stat-card eco-stat-clickable${ecoTypeFilter === 'no_invoice' ? ' active' : ''}"
           onclick="filterEcoByType('no_invoice')">
        <div class="stat-label">ì¸ê¸ê³ì°ì ë¯¸ë°í</div>
        <div class="stat-value red">${summary.noInvoiceCount}<span class="eco-unit">ê°</span></div>
      </div>
    </div>

    <!-- ìì½ ê¸ì¡ ìì½ -->
    <div class="card eco-fee-summary">
      <div class="eco-fee-title">${m} ìì½ ê¸ì¡ íí©</div>
      <div class="eco-fee-grid">
        <div class="eco-fee-item">
          <div class="eco-fee-label">ì´ ê³ì½ê¸ì¡</div>
          <div class="eco-fee-value">${fmt(summary.totalContract)}ì</div>
        </div>
        <div class="eco-fee-item">
          <div class="eco-fee-label">ìì½ ììë£ í©ê³</div>
          <div class="eco-fee-value orange">${fmt(summary.totalEcoFee)}ì</div>
        </div>
        <div class="eco-fee-item">
          <div class="eco-fee-label">OCP ììë£ í©ê³</div>
          <div class="eco-fee-value accent">${fmt(summary.totalOcp)}ì</div>
        </div>
      </div>
    </div>

    <!-- íí° -->
    <div class="eco-filter-bar">
      <select class="eco-filter-select" onchange="changeEcoMonth(this.value)">
        ${allMonths.map(mm => `<option value="${mm}"${mm === m ? ' selected' : ''}>${mm.split('-')[1]}ì (${mm})</option>`).join('')}
      </select>
      <select class="eco-filter-select" onchange="changeEcoTypeFilter(this.value)">
        <option value="">ì ì²´</option>
        <option value="subcontract"${ecoTypeFilter === 'subcontract' ? ' selected' : ''}>ìì½ëê¸</option>
        <option value="eco_fee"${ecoTypeFilter === 'eco_fee' ? ' selected' : ''}>ììë£ ì§ê¸</option>
        <option value="no_invoice"${ecoTypeFilter === 'no_invoice' ? ' selected' : ''}>ì¸ê¸ê³ì°ì ë¯¸ë°í</option>
      </select>
      <div class="eco-search-wrap">
        <input id="ecoSearchInput" class="eco-search-input" type="text" placeholder="ìì²´ëª ê²ì"
               value="${ecoSearch}">
      </div>
    </div>

    <div id="ecoListContainer">${listHTML}</div>
  `;

  bindSearchInput('ecoSearchInput', (val) => {
    ecoSearch = val.trim();
    renderEcoHTML(true);
  });
}

/* âââ íí° í¸ë¤ë¬ âââ */
function changeEcoMonth(month) {
  ecoMonth = month;
  renderEcoHTML();
}

function changeEcoTypeFilter(val) {
  ecoTypeFilter = val;
  renderEcoHTML(true);
}

function filterEcoByType(type) {
  ecoTypeFilter = (ecoTypeFilter === type) ? '' : type;
  renderEcoHTML();
}


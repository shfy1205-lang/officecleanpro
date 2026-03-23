/**
 * admin-eco.js - 에코오피스 관리
 * 에코 관련 업체 현황 + 에코 금액 관리
 * 표시 대상: eco_amount가 있는 업체 OR subcontract_from이 에코 관련인 업체
 *
 * 금액 계산:
 *  - 에코도급/에코광고비: 에코→OCP 송금 = 계약금액 - 에코수수료
 *  - 에코수수료만: OCP→에코 지급 = 에코수수료
 */

/* ─── 상태 ─── */
let ecoMonth = '';
let ecoSearch = '';
let ecoTypeFilter = ''; // '' | 'subcontract' | 'eco_fee' | 'no_invoice'

/* ─── 에코 관련 업체인지 판별 ─── */
function isEcoRelated(company, fin) {
  const sf = company.subcontract_from || '';
  const isEcoSubcontract = sf === '에코오피스클린' || sf === '에코광고비';
  const hasEcoFee = (fin?.eco_amount || 0) > 0;
  return isEcoSubcontract || hasEcoFee;
}

/* 업체 분류 태그 */
function getEcoTag(company, fin) {
  const sf = company.subcontract_from || '';
  const hasEcoFee = (fin?.eco_amount || 0) > 0;

  if (sf === '에코오피스클린' && hasEcoFee) return { label: '도급+수수료', cls: 'badge-warn' };
  if (sf === '에코오피스클린') return { label: '에코도급', cls: 'badge-today' };
  if (sf === '에코광고비') return { label: '에코광고비', cls: 'badge-purple' };
  if (hasEcoFee) return { label: '에코수수료', cls: 'badge-orange' };
  return { label: '-', cls: '' };
}

/* 에코 도급 여부 (에코오피스클린 / 에코광고비) */
function isEcoSubcontracted(company) {
  const sf = company.subcontract_from || '';
  return sf === '에코오피스클린' || sf === '에코광고비';
}

/* 세금계산서 발행 여부 */
function isOcpInvoice(company) {
  const sf = company.subcontract_from || '';
  return sf !== '에코오피스클린' && sf !== '에코광고비';
}

/* ─── 에코 업체 데이터 가공 ─── */
function getEcoCompanies(month) {
  const m = month || ecoMonth || selectedMonth;
  const finMap = buildFinMap(adminData.financials, m);

  const ecoCompanies = adminData.companies.filter(c => {
    if (c.status === 'terminated') return false;
    const fin = finMap[c.id];
    return isEcoRelated(c, fin);
  });

  return ecoCompanies.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const eco = fin?.eco_amount || 0;
    const tag = getEcoTag(c, fin);
    const ocpInvoice = isOcpInvoice(c);
    const subcontracted = isEcoSubcontracted(c);

    // 에코→OCP 송금액: 도급업체만 (계약금액 - 에코수수료)
    const ecoToOcp = subcontracted ? (contract - eco) : 0;
    // OCP→에코 지급액: 비도급 + 에코수수료 있는 업체
    const ocpToEco = (!subcontracted && eco > 0) ? eco : 0;

    // 배정 직원
    const assigns = adminData.assignments.filter(a => a.company_id === c.id && a.month === m);
    const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';

    return {
      id: c.id,
      name: c.name,
      areaCode: c.area_code || '',
      areaName: c.area_name || '',
      subcontractFrom: c.subcontract_from || '',
      contract, eco, subcontracted,
      ecoToOcp, ocpToEco,
      tag, ocpInvoice, workerNames, fin,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/* ─── 필터 적용 ─── */
function getFilteredEcoCompanies() {
  let list = getEcoCompanies();

  if (ecoSearch) {
    const q = ecoSearch.toLowerCase();
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.areaCode.toLowerCase().includes(q));
  }

  if (ecoTypeFilter === 'subcontract') {
    list = list.filter(d => d.subcontracted);
  } else if (ecoTypeFilter === 'eco_fee') {
    list = list.filter(d => d.eco > 0);
  } else if (ecoTypeFilter === 'no_invoice') {
    list = list.filter(d => !d.ocpInvoice);
  }

  return list;
}

/* ─── 요약 통계 ─── */
function getEcoSummary() {
  const all = getEcoCompanies();
  const totalEcoFee = all.reduce((s, d) => s + d.eco, 0);
  const totalContract = all.reduce((s, d) => s + d.contract, 0);
  const totalEcoToOcp = all.reduce((s, d) => s + d.ecoToOcp, 0);
  const totalOcpToEco = all.reduce((s, d) => s + d.ocpToEco, 0);
  const noInvoiceCount = all.filter(d => !d.ocpInvoice).length;
  const ecoFeeCount = all.filter(d => d.eco > 0).length;
  const subcontractCount = all.filter(d => d.subcontracted).length;

  return { totalEcoFee, totalContract, totalEcoToOcp, totalOcpToEco, noInvoiceCount, ecoFeeCount, subcontractCount, total: all.length };
}

/* ─── 메인 렌더 ─── */
function renderEco() {
  ecoMonth = ecoMonth || selectedMonth;
  renderEcoHTML();
}

function renderEcoHTML(listOnly) {
  const mc = $('mainContent');
  const filtered = getFilteredEcoCompanies();
  const m = ecoMonth || selectedMonth;

  const listHTML = `
    <div class="eco-result-count">${filtered.length}개 업체 ${ecoSearch || ecoTypeFilter ? '(필터 적용됨)' : ''}</div>

    ${filtered.length > 0 ? `
      <!-- PC 테이블 -->
      <div class="eco-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>업체명</th>
                <th>구역</th>
                <th>구분</th>
                <th>계약금액</th>
                <th>에코수수료</th>
                <th>에코→OCP</th>
                <th>OCP→에코</th>
                <th>세금계산서</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(d => {
                const invoiceBadge = d.ocpInvoice
                  ? '<span class="badge badge-done">OCP발행</span>'
                  : '<span class="badge badge-warn">미발행</span>';
                return `<tr>
                  <td style="font-weight:600">${escapeHtml(d.name)}</td>
                  <td>${escapeHtml(d.areaCode)}</td>
                  <td><span class="badge ${d.tag.cls}">${d.tag.label}</span></td>
                  <td>${fmt(d.contract)}원</td>
                  <td style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco) + '원' : '-'}</td>
                  <td style="color:#4fc3f7;font-weight:600">${d.ecoToOcp > 0 ? fmt(d.ecoToOcp) + '원' : '-'}</td>
                  <td style="color:#ef5350;font-weight:600">${d.ocpToEco > 0 ? fmt(d.ocpToEco) + '원' : '-'}</td>
                  <td>${invoiceBadge}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="eco-cards-mobile">
        ${filtered.map(d => {
          const invoiceBadge = d.ocpInvoice
            ? '<span class="badge badge-done">OCP발행</span>'
            : '<span class="badge badge-warn">미발행</span>';
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
                <span class="eco-card-label">계약금액</span>
                <span>${fmt(d.contract)}원</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">에코수수료</span>
                <span style="color:var(--orange);font-weight:600">${d.eco > 0 ? fmt(d.eco) + '원' : '-'}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">에코→OCP 송금</span>
                <span style="color:#4fc3f7;font-weight:600">${d.ecoToOcp > 0 ? fmt(d.ecoToOcp) + '원' : '-'}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">OCP→에코 지급</span>
                <span style="color:#ef5350;font-weight:600">${d.ocpToEco > 0 ? fmt(d.ocpToEco) + '원' : '-'}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">세금계산서</span>
                ${invoiceBadge}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">🏢</div>
        <p>${ecoSearch || ecoTypeFilter ? '해당 조건의 업체가 없습니다' : '에코 관련 업체가 없습니다'}</p>
      </div>
    `}
  `;

  // 검색 시: 목록만 갱신
  if (listOnly) {
    const lc = document.getElementById('ecoListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // 전체 렌더
  const summary = getEcoSummary();
  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();

  mc.innerHTML = `
    <div class="section-title">에코오피스 관리</div>

    <!-- 요약 카드 -->
    <div class="stats-grid-4 eco-stats">
      <div class="stat-card">
        <div class="stat-label">에코 관련 업체</div>
        <div class="stat-value">${summary.total}<span class="eco-unit">개</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">에코→OCP 송금 합계</div>
        <div class="stat-value" style="color:#4fc3f7">${fmt(summary.totalEcoToOcp)}<span class="eco-unit">원</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">OCP→에코 지급 합계</div>
        <div class="stat-value red">${fmt(summary.totalOcpToEco)}<span class="eco-unit">원</span></div>
      </div>
      <div class="stat-card eco-stat-clickable${ecoTypeFilter === 'no_invoice' ? ' active' : ''}"
           onclick="filterEcoByType('no_invoice')">
        <div class="stat-label">세금계산서 미발행</div>
        <div class="stat-value red">${summary.noInvoiceCount}<span class="eco-unit">개</span></div>
      </div>
    </div>

    <!-- 에코 금액 요약 -->
    <div class="card eco-fee-summary">
      <div class="eco-fee-title">${m} 에코 금액 현황</div>
      <div class="eco-fee-grid">
        <div class="eco-fee-item">
          <div class="eco-fee-label">총 계약금액</div>
          <div class="eco-fee-value">${fmt(summary.totalContract)}원</div>
        </div>
        <div class="eco-fee-item">
          <div class="eco-fee-label">에코→OCP 송금</div>
          <div class="eco-fee-value" style="color:#4fc3f7">${fmt(summary.totalEcoToOcp)}원</div>
        </div>
        <div class="eco-fee-item">
          <div class="eco-fee-label">OCP→에코 지급</div>
          <div class="eco-fee-value red">${fmt(summary.totalOcpToEco)}원</div>
        </div>
      </div>
    </div>

    <!-- 필터 -->
    <div class="eco-filter-bar">
      <select class="eco-filter-select" onchange="changeEcoMonth(this.value)">
        ${allMonths.map(mm => `<option value="${mm}"${mm === m ? ' selected' : ''}>${mm.split('-')[1]}월 (${mm})</option>`).join('')}
      </select>
      <select class="eco-filter-select" onchange="changeEcoTypeFilter(this.value)">
        <option value="">전체</option>
        <option value="subcontract"${ecoTypeFilter === 'subcontract' ? ' selected' : ''}>에코도급</option>
        <option value="eco_fee"${ecoTypeFilter === 'eco_fee' ? ' selected' : ''}>수수료 지급</option>
        <option value="no_invoice"${ecoTypeFilter === 'no_invoice' ? ' selected' : ''}>세금계산서 미발행</option>
      </select>
      <div class="eco-search-wrap">
        <input id="ecoSearchInput" class="eco-search-input" type="text" placeholder="업체명 검색"
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

/* ─── 필터 핸들러 ─── */
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

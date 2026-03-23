/**
 * admin-eco.js - 에코오피스 관리
 * 에코 관련 업체 현황 + 에코 금액 관리
 * 표시 대상: eco_amount가 있는 업체 OR subcontract_from이 에코 관련인 업체
 *
 * 금액 계산:
 *  - 에코도급/에코광고비: 에코→OCP 송금 = 계약금액 - 에코수수료
 *  - 에코수수료만: OCP→에코 지급 = 에코수수료
 *
 * override 컬럼:
 *  - eco_contract_override: 에코탭 전용 계약금액 (NULL이면 원본 사용)
 *  - eco_fee_override: 에코탭 전용 수수료 (NULL이면 원본 사용)
 *  - 다른 탭에는 영향 없음
 */

/* ─── 상태 ─── */
let ecoMonth = '';
let ecoSearch = '';
let ecoTypeFilter = ''; // '' | 'subcontract' | 'eco_fee'
let ecoEditingCell = null; // 현재 편집 중인 셀 정보

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

/* 에코 도급 여부 (에코오피스클린만 — 에코가 직접 청소하고 OCP에 송금) */
function isEcoSubcontracted(company) {
  return (company.subcontract_from || '') === '에코오피스클린';
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
    const origContract = fin?.contract_amount || 0;
    const origEco = fin?.eco_amount || 0;

    // override가 있으면 에코탭 전용 값 사용
    const contract = (fin?.eco_contract_override != null) ? fin.eco_contract_override : origContract;
    const eco = (fin?.eco_fee_override != null) ? fin.eco_fee_override : origEco;

    const tag = getEcoTag(c, fin);
    const subcontracted = isEcoSubcontracted(c);

    // 에코→OCP 송금액: 에코도급(에코오피스클린)만 — 계약금액 - 에코수수료
    const ecoToOcp = subcontracted ? (contract - eco) : 0;
    // OCP→에코 지급액: 에코광고비 + 에코수수료만 있는 업체
    const ocpToEco = (!subcontracted && eco > 0) ? eco : 0;

    // override 여부 표시용
    const hasContractOverride = fin?.eco_contract_override != null;
    const hasFeeOverride = fin?.eco_fee_override != null;

    // 배정 직원
    const assigns = adminData.assignments.filter(a => a.company_id === c.id && a.month === m);
    const workerNames = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '-';

    return {
      id: c.id,
      name: c.name,
      areaCode: c.area_code || '',
      areaName: c.area_name || '',
      subcontractFrom: c.subcontract_from || '',
      contract, eco, origContract, origEco,
      subcontracted, ecoToOcp, ocpToEco,
      hasContractOverride, hasFeeOverride,
      tag, workerNames, fin,
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
  const ecoFeeCount = all.filter(d => d.eco > 0).length;
  const subcontractCount = all.filter(d => d.subcontracted).length;

  return { totalEcoFee, totalContract, totalEcoToOcp, totalOcpToEco, ecoFeeCount, subcontractCount, total: all.length };
}

/* ─── 인라인 수정: 셀 클릭 → 입력 모드 ─── */
function startEcoEdit(companyId, field, currentVal, cellEl) {
  if (ecoEditingCell) return; // 이미 편집 중이면 무시
  ecoEditingCell = { companyId, field, cellEl };

  const raw = currentVal || 0;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'eco-inline-input';
  input.value = raw;
  input.setAttribute('data-company', companyId);
  input.setAttribute('data-field', field);

  cellEl.innerHTML = '';
  cellEl.appendChild(input);
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { saveEcoEdit(input); }
    if (e.key === 'Escape') { cancelEcoEdit(); }
  });
  input.addEventListener('blur', () => {
    // 약간의 지연으로 버튼 클릭 등 처리
    setTimeout(() => { if (ecoEditingCell) saveEcoEdit(input); }, 150);
  });
}

/* ─── 인라인 수정: 저장 ─── */
async function saveEcoEdit(input) {
  if (!ecoEditingCell) return;
  const { companyId, field } = ecoEditingCell;
  const newVal = parseInt(input.value) || 0;
  ecoEditingCell = null;

  const m = ecoMonth || selectedMonth;

  // DB에서 해당 월 financial 레코드 찾기
  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === m);
  if (!fin) {
    alert('해당 월의 금액 데이터가 없습니다.');
    renderEcoHTML(true);
    return;
  }

  // override 컬럼 업데이트
  const colName = field === 'contract' ? 'eco_contract_override' : 'eco_fee_override';
  const updateData = {};
  updateData[colName] = newVal;

  try {
    const { error } = await sb.from('company_financials').update(updateData).eq('id', fin.id);
    if (error) throw error;

    // 로컬 데이터도 업데이트
    fin[colName] = newVal;

    // 전체 다시 렌더 (요약 카드 값도 갱신)
    renderEcoHTML();
  } catch (err) {
    alert('저장 실패: ' + (err.message || err));
    renderEcoHTML(true);
  }
}

/* ─── 인라인 수정: 취소 ─── */
function cancelEcoEdit() {
  ecoEditingCell = null;
  renderEcoHTML(true);
}

/* ─── override 초기화 (원본 값으로 되돌리기) ─── */
async function resetEcoOverride(companyId, field) {
  const m = ecoMonth || selectedMonth;
  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === m);
  if (!fin) return;

  const colName = field === 'contract' ? 'eco_contract_override' : 'eco_fee_override';
  const updateData = {};
  updateData[colName] = null;

  try {
    const { error } = await sb.from('company_financials').update(updateData).eq('id', fin.id);
    if (error) throw error;
    fin[colName] = null;
    renderEcoHTML();
  } catch (err) {
    alert('초기화 실패: ' + (err.message || err));
  }
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
                <th>계약금액 ✏️</th>
                <th>에코수수료 ✏️</th>
                <th>에코→OCP</th>
                <th>OCP→에코</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(d => {
                const contractCls = d.hasContractOverride ? ' eco-override' : '';
                const feeCls = d.hasFeeOverride ? ' eco-override' : '';
                return `<tr>
                  <td style="font-weight:600">${escapeHtml(d.name)}</td>
                  <td>${escapeHtml(d.areaCode)}</td>
                  <td><span class="badge ${d.tag.cls}">${d.tag.label}</span></td>
                  <td class="eco-editable${contractCls}" onclick="startEcoEdit('${d.id}','contract',${d.contract},this)">
                    ${fmt(d.contract)}원${d.hasContractOverride ? '<span class="eco-reset" onclick="event.stopPropagation();resetEcoOverride(\'' + d.id + '\',\'contract\')" title="원본으로 되돌리기">↩</span>' : ''}
                  </td>
                  <td class="eco-editable${feeCls}" style="color:var(--orange);font-weight:600" onclick="startEcoEdit('${d.id}','fee',${d.eco},this)">
                    ${d.eco > 0 ? fmt(d.eco) + '원' : '-'}${d.hasFeeOverride ? '<span class="eco-reset" onclick="event.stopPropagation();resetEcoOverride(\'' + d.id + '\',\'fee\')" title="원본으로 되돌리기">↩</span>' : ''}
                  </td>
                  <td style="color:#4fc3f7;font-weight:600">${d.ecoToOcp > 0 ? fmt(d.ecoToOcp) + '원' : '-'}</td>
                  <td style="color:#ef5350;font-weight:600">${d.ocpToEco > 0 ? fmt(d.ocpToEco) + '원' : '-'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="eco-cards-mobile">
        ${filtered.map(d => {
          const contractCls = d.hasContractOverride ? ' eco-override' : '';
          const feeCls = d.hasFeeOverride ? ' eco-override' : '';
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
                <span class="eco-editable-m${contractCls}" onclick="startEcoEditMobile('${d.id}','contract',${d.contract})">${fmt(d.contract)}원${d.hasContractOverride ? ' <span class="eco-reset-m" onclick="event.stopPropagation();resetEcoOverride(\'' + d.id + '\',\'contract\')">↩</span>' : ''}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">에코수수료</span>
                <span class="eco-editable-m${feeCls}" style="color:var(--orange);font-weight:600" onclick="startEcoEditMobile('${d.id}','fee',${d.eco})">${d.eco > 0 ? fmt(d.eco) + '원' : '-'}${d.hasFeeOverride ? ' <span class="eco-reset-m" onclick="event.stopPropagation();resetEcoOverride(\'' + d.id + '\',\'fee\')">↩</span>' : ''}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">에코→OCP 송금</span>
                <span style="color:#4fc3f7;font-weight:600">${d.ecoToOcp > 0 ? fmt(d.ecoToOcp) + '원' : '-'}</span>
              </div>
              <div class="eco-card-row">
                <span class="eco-card-label">OCP→에코 지급</span>
                <span style="color:#ef5350;font-weight:600">${d.ocpToEco > 0 ? fmt(d.ocpToEco) + '원' : '-'}</span>
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
      <div class="stat-card">
        <div class="stat-label">에코수수료 업체</div>
        <div class="stat-value">${summary.ecoFeeCount}<span class="eco-unit">개</span></div>
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
      </select>
      <div class="eco-search-wrap">
        <input id="ecoSearchInput" class="eco-search-input" type="text" placeholder="업체명 검색"
               value="${ecoSearch}">
      </div>
    </div>

    <div class="eco-edit-hint">계약금액, 에코수수료를 클릭하면 수정할 수 있습니다 (에코탭 전용, 다른 탭에 영향 없음)</div>

    <div id="ecoListContainer">${listHTML}</div>
  `;

  bindSearchInput('ecoSearchInput', (val) => {
    ecoSearch = val.trim();
    renderEcoHTML(true);
  });
}

/* ─── 모바일 인라인 수정 (프롬프트 방식) ─── */
function startEcoEditMobile(companyId, field, currentVal) {
  const label = field === 'contract' ? '계약금액' : '에코수수료';
  const newVal = prompt(label + ' 수정 (숫자만 입력):', currentVal || 0);
  if (newVal === null) return; // 취소

  const parsed = parseInt(newVal);
  if (isNaN(parsed) || parsed < 0) {
    alert('올바른 금액을 입력해주세요.');
    return;
  }

  // 가짜 input 객체로 saveEcoEdit 재활용
  ecoEditingCell = { companyId, field, cellEl: null };
  const fakeInput = { value: String(parsed) };
  saveEcoEdit(fakeInput);
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

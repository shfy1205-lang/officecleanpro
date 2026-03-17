/**
 * admin-revenue.js - 수익관리 탭
 * 핵심 개념: 오피스클린프로 수수료(ocp_amount) = 오피스클린프로 순수익
 */

function calcFee(contractAmount, type, value) {
  if (!type || type === 'none') return 0;
  if (type === 'fixed') return parseInt(value) || 0;
  if (type === 'percent') return Math.round((contractAmount * (parseFloat(value) || 0)) / 100);
  return 0;
}

function parseFeeMetadata(memo) {
  try {
    if (!memo) return {};
    const parsed = JSON.parse(memo);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

function getWorkerPayTotal(companyId, month) {
  const assigns = adminData.assignments.filter(
    a => a.company_id === companyId && a.month === month
  );
  const finMap = buildFinMap(adminData.financials, month);
  return assigns.reduce((s, a) => s + calcAssignmentFinalPay(a, finMap), 0);
}

/* ─── 계약 형태 판별 ─── */
function getContractType(meta) {
  const parts = [];
  if (meta.ocp_type === 'percent') parts.push('OCP 정률');
  else if (meta.ocp_type === 'fixed') parts.push('OCP 정액');
  if (meta.eco_type === 'percent') parts.push('에코 정률');
  else if (meta.eco_type === 'fixed') parts.push('에코 정액');
  return parts.length > 0 ? parts.join(' / ') : '-';
}

/* ─── 메인 렌더 ─── */
function renderRevenue() {
  const mc = $('mainContent');

  const activeCompanies = adminData.companies.filter(c => c.status === 'active');

  // 월별 재무 데이터 매핑
  const finMap = {};
  adminData.financials
    .filter(f => f.month === revenueMonth)
    .forEach(f => { finMap[f.company_id] = f; });

  // 요약 계산
  let totalContract = 0;
  let totalWorkerPay = 0;
  let totalEco = 0;
  let totalOcp = 0; // = 총 순수익

  const rows = activeCompanies.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const ocp = fin?.ocp_amount || 0;       // 오피스클린프로 수수료 = 순수익
    const eco = fin?.eco_amount || 0;
    const workerPay = fin?.worker_pay_total || getWorkerPayTotal(c.id, revenueMonth);

    totalContract += contract;
    totalWorkerPay += workerPay;
    totalEco += eco;
    totalOcp += ocp;

    const meta = parseFeeMetadata(fin?.memo);

    return { company: c, contract, ocp, eco, workerPay, meta, fin };
  });

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      수익관리
      <button class="btn-sm btn-blue" onclick="exportRevenue()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>
    ${monthSelectorHTML(revenueMonth, 'changeRevenueMonth')}

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">총 계약금액</div>
        <div class="stat-value blue">${fmt(totalContract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 직원 지급액</div>
        <div class="stat-value red">${fmt(totalWorkerPay)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 에코 수수료</div>
        <div class="stat-value yellow">${fmt(totalEco)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 OCP 순수익</div>
        <div class="stat-value ${totalOcp >= 0 ? 'green' : 'red'}">${fmt(totalOcp)}</div>
      </div>
    </div>

    <div class="revenue-summary-bar">
      <div class="revenue-bar-section revenue-bar-worker" style="width:${totalContract > 0 ? ((totalWorkerPay / totalContract) * 100).toFixed(1) : 0}%" title="직원 지급"></div>
      <div class="revenue-bar-section revenue-bar-eco" style="width:${totalContract > 0 ? ((totalEco / totalContract) * 100).toFixed(1) : 0}%" title="에코 수수료"></div>
      <div class="revenue-bar-section revenue-bar-net" style="width:${totalContract > 0 ? ((totalOcp / totalContract) * 100).toFixed(1) : 0}%" title="OCP 순수익"></div>
    </div>
    <div class="revenue-legend">
      <span><span class="legend-dot" style="background:var(--red)"></span> 직원 지급</span>
      <span><span class="legend-dot" style="background:var(--orange)"></span> 에코 수수료</span>
      <span><span class="legend-dot" style="background:var(--green)"></span> OCP 순수익</span>
    </div>

    <p class="text-muted" style="margin:16px 0 12px">총 ${rows.length}개 업체</p>

    ${rows.length > 0 ? `
      <!-- PC 테이블 -->
      <div class="rv-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>업체명</th>
                <th>총 계약금액</th>
                <th>직원 지급 총액</th>
                <th>에코 수수료</th>
                <th>OCP 수수료</th>
                <th>계약형태</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>${rows.map(r => {
              const contractType = getContractType(r.meta);
              const memoText = r.meta.ocp_rate ? r.meta.ocp_rate + '%' : (r.meta.eco_rate ? r.meta.eco_rate + '%' : '');

              return `<tr class="revenue-row" onclick="openRevenueForm('${r.company.id}')" style="cursor:pointer">
                <td>
                  <div style="font-weight:600">${r.company.name}</div>
                  <div class="text-muted" style="font-size:11px">${r.company.area_name || ''}</div>
                </td>
                <td>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</td>
                <td>${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</td>
                <td>${r.eco > 0 ? fmt(r.eco) + '원' : '-'}</td>
                <td style="font-weight:700;color:${r.ocp > 0 ? 'var(--green)' : 'var(--text2)'}">
                  ${r.ocp > 0 ? fmt(r.ocp) + '원' : '-'}
                </td>
                <td style="font-size:12px">${contractType}</td>
                <td style="font-size:12px;color:var(--text2)">${memoText}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="rv-cards-mobile">
        ${rows.map(r => {
          const contractType = getContractType(r.meta);
          return `<div class="card rv-card" onclick="openRevenueForm('${r.company.id}')" style="cursor:pointer">
            <div class="rv-card-header">
              <div>
                <div style="font-weight:600;font-size:14px">${r.company.name}</div>
                <div class="text-muted" style="font-size:11px">${r.company.area_name || ''} · ${contractType}</div>
              </div>
              <span style="font-weight:700;color:${r.ocp > 0 ? 'var(--green)' : 'var(--text2)'};font-size:14px">
                ${r.ocp > 0 ? fmt(r.ocp) + '원' : '-'}
              </span>
            </div>
            <div class="rv-card-body">
              <div class="rv-card-row">
                <span class="rv-card-label">계약금액</span>
                <span>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</span>
              </div>
              <div class="rv-card-row">
                <span class="rv-card-label">직원 지급</span>
                <span style="color:var(--red)">${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</span>
              </div>
              <div class="rv-card-row">
                <span class="rv-card-label">에코 수수료</span>
                <span>${r.eco > 0 ? fmt(r.eco) + '원' : '-'}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💰</div>
        <p>활성 업체가 없습니다</p>
      </div>
    `}
  `;
}

async function changeRevenueMonth(month) {
  revenueMonth = month;
  await ensureMonthData(month);
  renderRevenue();
}

function openRevenueForm(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  const fin = adminData.financials.find(
    f => f.company_id === companyId && f.month === revenueMonth
  );

  const meta = parseFeeMetadata(fin?.memo);
  const contractAmount = fin?.contract_amount || 0;
  const ocpType = meta.ocp_type || 'none';
  const ocpRate = meta.ocp_rate || 0;
  const ecoType = meta.eco_type || 'none';
  const ecoRate = meta.eco_rate || 0;
  const ocpAmount = fin?.ocp_amount || 0;
  const ecoAmount = fin?.eco_amount || 0;

  // 직원 지급 총액 계산
  const workerPayCalc = getWorkerPayTotal(companyId, revenueMonth);
  const workerPayStored = fin?.worker_pay_total || 0;
  const workerPay = workerPayStored > 0 ? workerPayStored : workerPayCalc;

  // 해당 월 배정 직원 목록
  const assigns = adminData.assignments.filter(
    a => a.company_id === companyId && a.month === revenueMonth
  );

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${c.name} - 수익설정</h3>
    <p class="text-muted" style="margin-bottom:16px">${revenueMonth} · ${c.area_name || ''}</p>

    <div class="field">
      <label>계약 금액 (원) *</label>
      <input id="rvContract" type="number" value="${contractAmount}" placeholder="월 계약 금액"
             oninput="previewRevenue()">
    </div>

    <div class="detail-section" style="margin-top:16px">
      <div class="detail-section-title">오피스클린프로 수수료 (= 순수익)</div>
      <div class="admin-row-2">
        <div class="field">
          <label>수수료 방식</label>
          <select id="rvOcpType" onchange="onFeeTypeChange('ocp');previewRevenue()">
            <option value="none"${ocpType === 'none' ? ' selected' : ''}>없음</option>
            <option value="fixed"${ocpType === 'fixed' ? ' selected' : ''}>정액</option>
            <option value="percent"${ocpType === 'percent' ? ' selected' : ''}>정률 (%)</option>
          </select>
        </div>
        <div class="field" id="ocpValueField" style="display:${ocpType !== 'none' ? 'block' : 'none'}">
          <label id="ocpValueLabel">${ocpType === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)'}</label>
          <input id="rvOcpValue" type="number" value="${ocpType === 'percent' ? ocpRate : (ocpType === 'fixed' ? ocpAmount : 0)}"
                 placeholder="${ocpType === 'percent' ? '예: 10' : '예: 100000'}"
                 oninput="previewRevenue()">
        </div>
      </div>
      <p class="text-muted" id="ocpPreview" style="margin-top:4px;font-size:12px">
        ${ocpAmount > 0 ? '→ ' + fmt(ocpAmount) + '원 (순수익)' : ''}
      </p>
    </div>

    <div class="detail-section" style="margin-top:12px">
      <div class="detail-section-title">에코오피스클린 수수료</div>
      <div class="admin-row-2">
        <div class="field">
          <label>수수료 방식</label>
          <select id="rvEcoType" onchange="onFeeTypeChange('eco');previewRevenue()">
            <option value="none"${ecoType === 'none' ? ' selected' : ''}>없음</option>
            <option value="fixed"${ecoType === 'fixed' ? ' selected' : ''}>정액</option>
            <option value="percent"${ecoType === 'percent' ? ' selected' : ''}>정률 (%)</option>
          </select>
        </div>
        <div class="field" id="ecoValueField" style="display:${ecoType !== 'none' ? 'block' : 'none'}">
          <label id="ecoValueLabel">${ecoType === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)'}</label>
          <input id="rvEcoValue" type="number" value="${ecoType === 'percent' ? ecoRate : (ecoType === 'fixed' ? ecoAmount : 0)}"
                 placeholder="${ecoType === 'percent' ? '예: 5' : '예: 50000'}"
                 oninput="previewRevenue()">
        </div>
      </div>
      <p class="text-muted" id="ecoPreview" style="margin-top:4px;font-size:12px">
        ${ecoAmount > 0 ? '→ ' + fmt(ecoAmount) + '원' : ''}
      </p>
    </div>

    <div class="detail-section" style="margin-top:16px">
      <div class="detail-section-title">직원 지급 총액</div>
      ${assigns.length > 0 ? `
        <div style="margin-bottom:8px">
          ${assigns.map(a => `
            <div class="assign-row" style="margin-bottom:4px">
              <span class="assign-name">${getWorkerName(a.worker_id)}</span>
              <span class="admin-pay-cell">${fmt(a.pay_amount)}원</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="text-muted" style="margin-bottom:8px">배정된 직원이 없습니다.</p>'}
      <div class="billing-info-item" style="background:var(--bg3)">
        <span class="billing-info-label">합계</span>
        <span class="billing-info-value" id="rvWorkerPay" style="color:var(--red)">${fmt(workerPay)}원</span>
      </div>
    </div>

    <div class="revenue-result-card" id="rvResultCard">
      <div class="revenue-result-title">수익 구조</div>
      <div class="rv-result-grid">
        <div class="rv-result-item">
          <div class="rv-result-label">계약금액</div>
          <div class="rv-result-value" id="rvResContract">${fmt(contractAmount)}원</div>
        </div>
        <div class="rv-result-item">
          <div class="rv-result-label">직원 지급</div>
          <div class="rv-result-value" style="color:var(--red)">${fmt(workerPay)}원</div>
        </div>
        <div class="rv-result-item">
          <div class="rv-result-label">에코 수수료</div>
          <div class="rv-result-value" id="rvResEco" style="color:var(--orange)">${fmt(ecoAmount)}원</div>
        </div>
        <div class="rv-result-item rv-result-highlight">
          <div class="rv-result-label">OCP 순수익</div>
          <div class="rv-result-value" id="rvResOcp" style="color:var(--green);font-weight:700;font-size:18px">${fmt(ocpAmount)}원</div>
        </div>
      </div>
    </div>

    <button class="btn" style="margin-top:16px" onclick="saveRevenue('${companyId}')">저장하기</button>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onFeeTypeChange(prefix) {
  const type = $(`rv${prefix === 'ocp' ? 'Ocp' : 'Eco'}Type`).value;
  const fieldId = `${prefix}ValueField`;
  const labelId = `${prefix}ValueLabel`;

  if (type === 'none') {
    $(fieldId).style.display = 'none';
  } else {
    $(fieldId).style.display = 'block';
    $(labelId).textContent = type === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)';
    $(`rv${prefix === 'ocp' ? 'Ocp' : 'Eco'}Value`).placeholder = type === 'percent' ? '예: 10' : '예: 100000';
  }
}

function previewRevenue() {
  const contract = parseInt($('rvContract').value) || 0;

  const ocpType = $('rvOcpType').value;
  const ocpVal = parseFloat($('rvOcpValue')?.value) || 0;
  const ocpAmt = calcFee(contract, ocpType, ocpVal);

  const ecoType = $('rvEcoType').value;
  const ecoVal = parseFloat($('rvEcoValue')?.value) || 0;
  const ecoAmt = calcFee(contract, ecoType, ecoVal);

  // 미리보기 업데이트
  const ocpPre = $('ocpPreview');
  if (ocpPre) ocpPre.textContent = ocpAmt > 0 ? '→ ' + fmt(ocpAmt) + '원 (순수익)' : '';

  const ecoPre = $('ecoPreview');
  if (ecoPre) ecoPre.textContent = ecoAmt > 0 ? '→ ' + fmt(ecoAmt) + '원' : '';

  // 결과 카드 업데이트
  const resContract = $('rvResContract');
  const resEco = $('rvResEco');
  const resOcp = $('rvResOcp');
  if (resContract) resContract.textContent = fmt(contract) + '원';
  if (resEco) resEco.textContent = fmt(ecoAmt) + '원';
  if (resOcp) resOcp.textContent = fmt(ocpAmt) + '원';
}

async function saveRevenue(companyId) {
  const btn = event?.target;
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    await _saveRevenueInner(companyId);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}

async function _saveRevenueInner(companyId) {
  const contract = parseInt($('rvContract').value, 10) || 0;
  if (contract <= 0) return toast('계약 금액을 입력하세요', 'error');
  if (contract > 999999999) return toast('계약 금액이 너무 큽니다 (최대 9억)', 'error');

  const ocpType = $('rvOcpType').value;
  const ocpVal = parseFloat($('rvOcpValue')?.value) || 0;
  if (ocpType === 'percent' && (ocpVal < 0 || ocpVal > 100)) return toast('OCP 수수료율은 0~100% 사이여야 합니다', 'error');
  if (ocpType === 'fixed' && ocpVal < 0) return toast('OCP 수수료 금액은 0 이상이어야 합니다', 'error');
  const ocpAmount = calcFee(contract, ocpType, ocpVal);

  const ecoType = $('rvEcoType').value;
  const ecoVal = parseFloat($('rvEcoValue')?.value) || 0;
  if (ecoType === 'percent' && (ecoVal < 0 || ecoVal > 100)) return toast('에코 수수료율은 0~100% 사이여야 합니다', 'error');
  if (ecoType === 'fixed' && ecoVal < 0) return toast('에코 수수료 금액은 0 이상이어야 합니다', 'error');
  const ecoAmount = calcFee(contract, ecoType, ecoVal);

  // 직원 지급 총액 자동 계산
  const workerPayTotal = getWorkerPayTotal(companyId, revenueMonth);

  // 수수료 메타데이터 (JSON)
  const feeMeta = {};
  if (ocpType !== 'none') {
    feeMeta.ocp_type = ocpType;
    if (ocpType === 'percent') feeMeta.ocp_rate = ocpVal;
  }
  if (ecoType !== 'none') {
    feeMeta.eco_type = ecoType;
    if (ecoType === 'percent') feeMeta.eco_rate = ecoVal;
  }

  const memoStr = Object.keys(feeMeta).length > 0 ? JSON.stringify(feeMeta) : null;

  const payload = {
    company_id:      companyId,
    month:           revenueMonth,
    contract_amount: contract,
    ocp_amount:      ocpAmount,
    eco_amount:      ecoAmount,
    worker_pay_total: workerPayTotal,
    memo:            memoStr,
  };

  // upsert: 기존 데이터가 있으면 업데이트, 없으면 삽입
  const existing = adminData.financials.find(
    f => f.company_id === companyId && f.month === revenueMonth
  );

  let error;
  if (existing) {
    ({ error } = await sb.from('company_financials').update(payload).eq('id', existing.id));
  } else {
    ({ error } = await sb.from('company_financials').insert(payload));
  }

  if (error) {
    if (error.code === '23505') {
      // UNIQUE 제약 충돌 → update로 재시도
      const { error: err2 } = await sb.from('company_financials')
        .update(payload)
        .eq('company_id', companyId)
        .eq('month', revenueMonth);
      if (err2) return toast(err2.message, 'error');
    } else {
      return toast(error.message, 'error');
    }
  }

  toast('수익 정보 저장 완료');
  closeModal();
  await loadAdminData();
  renderRevenue();
}

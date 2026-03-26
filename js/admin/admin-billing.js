/**
 * admin-billing.js - 정산관리 탭
 * 3개 뷰: 정산 현황(overview) | 월별 정산(all) | 미수금 목록(unpaid)
 */

function renderBilling() {
  const mc = $('mainContent');

  // ── 미수금 통계 (뷰 공통) ──
  const unpaidAll = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidAll.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      정산관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportBilling()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openBillingForm()">+ 정산 등록</button>
      </div>
    </div>

    <!-- 보기 전환: 정산 현황 / 월별 정산 / 미수금 -->
    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${billingView === 'overview' ? ' active' : ''}"
              onclick="billingView='overview';renderBilling()">정산 현황</button>
      <button class="view-toggle-btn${billingView === 'all' ? ' active' : ''}"
              onclick="billingView='all';renderBilling()">월별 정산</button>
      <button class="view-toggle-btn${billingView === 'unpaid' ? ' active' : ''}"
              onclick="billingView='unpaid';renderBilling()">미수금 (${unpaidAll.length})</button>
    </div>

    <div id="billingContent"></div>
  `;

  if (billingView === 'overview') {
    renderBillingOverview();
  } else if (billingView === 'unpaid') {
    renderBillingUnpaid(unpaidAll, totalUnpaid);
  } else {
    renderBillingMonthly(unpaidAll, totalUnpaid);
  }
}

/* ═══════════════════════════════════════════════════
   정산 현황 뷰 (도급/직영 구분 + 수수료 + 합산)
   ═══════════════════════════════════════════════════ */

function renderBillingOverview() {
  const container = document.getElementById('billingContent');
  if (!container) return;

  const activeCompanies = adminData.companies.filter(c => {
    if (c.status === 'active') return true;
    if (c.status === 'terminated' && c.terminated_at) {
      const termMonth = c.terminated_at.substring(0, 7);
      return billingMonth <= termMonth;
    }
    return false;
  });
  const finMap = {};
  adminData.financials
    .filter(f => f.month === billingMonth)
    .forEach(f => { finMap[f.company_id] = f; });

  // 도급 / 직영 분류
  const subCompanies = [];   // 에코 도급
  const directCompanies = []; // 직영

  activeCompanies.forEach(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const eco = fin?.eco_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const workerPay = fin?.worker_pay_total || 0;
    const meta = parseFeeMetadata(fin?.memo);
    const isSub = c.subcontract_from === '에코오피스클린';

    const row = { company: c, contract, eco, ocp, workerPay, meta, isSub };
    if (isSub) subCompanies.push(row);
    else directCompanies.push(row);
  });

  // 합산 계산
  const sumContract = (arr) => arr.reduce((s, r) => s + r.contract, 0);
  const sumEco     = (arr) => arr.reduce((s, r) => s + r.eco, 0);
  const sumOcp     = (arr) => arr.reduce((s, r) => s + r.ocp, 0);
  const sumWorker  = (arr) => arr.reduce((s, r) => s + r.workerPay, 0);

  const subContractTotal   = sumContract(subCompanies);
  const subEcoTotal        = sumEco(subCompanies);
  const subOcpTotal        = sumOcp(subCompanies);
  const subWorkerTotal     = sumWorker(subCompanies);

  const directContractTotal = sumContract(directCompanies);
  const directOcpTotal      = sumOcp(directCompanies);
  const directWorkerTotal   = sumWorker(directCompanies);

  const allContractTotal = subContractTotal + directContractTotal;
  const allEcoTotal      = subEcoTotal;
  const allOcpTotal      = subOcpTotal + directOcpTotal;
  const allWorkerTotal   = subWorkerTotal + directWorkerTotal;

  // 에코에서 받는 금액 = 도급 계약총액 - 에코수수료
  const ecoReceivable = subContractTotal - subEcoTotal;

  container.innerHTML = `
    ${monthSelectorHTML(billingMonth, 'changeBillingMonth')}

    <!-- ── 전체 합산 카드 ── -->
    <div class="billing-overview-section">
      <div class="bo-section-header">
        <span class="bo-section-icon">📊</span>
        <span>전체 합산 (${billingMonth.split('-')[1]}월)</span>
      </div>
      <div class="stats-grid stats-grid-4" style="margin-bottom:0">
        <div class="stat-card">
          <div class="stat-label">전체 계약금액</div>
          <div class="stat-value blue">${fmt(allContractTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">전체 직원지급</div>
          <div class="stat-value red">${fmt(allWorkerTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">에코 수수료 합계</div>
          <div class="stat-value" style="color:var(--orange)">${fmt(allEcoTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">OCP 수수료 합계</div>
          <div class="stat-value green">${fmt(allOcpTotal)}</div>
        </div>
      </div>
    </div>

    <!-- ── 도급 vs 직영 요약 ── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="bo-summary-card bo-sub">
        <div class="bo-summary-title">🏢 에코 도급</div>
        <div class="bo-summary-count">${subCompanies.length}개 업체</div>
        <div class="bo-summary-row">
          <span>계약총액</span>
          <strong>${fmt(subContractTotal)}원</strong>
        </div>
        <div class="bo-summary-row">
          <span>에코 수수료</span>
          <strong style="color:var(--orange)">−${fmt(subEcoTotal)}원</strong>
        </div>
        <div class="bo-summary-row">
          <span>에코에서 받는 금액</span>
          <strong style="color:var(--green)">${fmt(ecoReceivable)}원</strong>
        </div>
        <div class="bo-summary-row">
          <span>OCP 수수료</span>
          <strong style="color:var(--primary)">${fmt(subOcpTotal)}원</strong>
        </div>
      </div>
      <div class="bo-summary-card bo-direct">
        <div class="bo-summary-title">🏠 오피스클린프로 직영</div>
        <div class="bo-summary-count">${directCompanies.length}개 업체</div>
        <div class="bo-summary-row">
          <span>계약총액</span>
          <strong>${fmt(directContractTotal)}원</strong>
        </div>
        <div class="bo-summary-row">
          <span>에코 수수료</span>
          <span class="text-muted">해당없음</span>
        </div>
        <div class="bo-summary-row">
          <span>OCP 수수료</span>
          <strong style="color:var(--primary)">${fmt(directOcpTotal)}원</strong>
        </div>
        <div class="bo-summary-row">
          <span>직원 지급 합계</span>
          <strong style="color:var(--red)">${fmt(directWorkerTotal)}원</strong>
        </div>
      </div>
    </div>

    <!-- ── 에코 도급 업체 테이블 ── -->
    <div class="billing-overview-section">
      <div class="bo-section-header">
        <span class="bo-section-icon">🏢</span>
        <span>에코 도급 업체 (${subCompanies.length}개)</span>
      </div>
      ${subCompanies.length > 0 ? `
        <!-- PC 테이블 -->
        <div class="bo-table-pc">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>업체명</th>
                  <th>구분</th>
                  <th>계약금액</th>
                  <th>에코 수수료</th>
                  <th>OCP 수수료</th>
                  <th>직원 지급</th>
                  <th>수수료 방식</th>
                </tr>
              </thead>
              <tbody>${subCompanies.map(r => {
                const feeInfo = getFeeInfoText(r.meta);
                return `<tr onclick="openCompanyDetail('${r.company.id}')" style="cursor:pointer">
                  <td>
                    <div style="font-weight:600">${r.company.name}</div>
                    <div class="text-muted" style="font-size:11px">${r.company.area_name || ''}</div>
                  </td>
                  <td><span class="badge bo-badge-sub">도급</span></td>
                  <td>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</td>
                  <td style="color:var(--orange);font-weight:600">${r.eco > 0 ? fmt(r.eco) + '원' : '-'}</td>
                  <td style="color:var(--primary);font-weight:600">${r.ocp > 0 ? fmt(r.ocp) + '원' : '-'}</td>
                  <td>${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</td>
                  <td style="font-size:12px">${feeInfo}</td>
                </tr>`;
              }).join('')}</tbody>
              <tfoot>
                <tr style="font-weight:700;background:rgba(167,139,250,0.06)">
                  <td colspan="2">합계</td>
                  <td>${fmt(subContractTotal)}원</td>
                  <td style="color:var(--orange)">${fmt(subEcoTotal)}원</td>
                  <td style="color:var(--primary)">${fmt(subOcpTotal)}원</td>
                  <td>${fmt(subWorkerTotal)}원</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <!-- 모바일 카드 -->
        <div class="bo-cards-mobile">
          ${subCompanies.map(r => renderBillingOverviewCard(r, 'sub')).join('')}
          <div class="bo-mobile-total">
            <span>도급 합계</span>
            <div>계약: <strong>${fmt(subContractTotal)}</strong> / 에코수수료: <strong style="color:var(--orange)">${fmt(subEcoTotal)}</strong> / OCP: <strong style="color:var(--primary)">${fmt(subOcpTotal)}</strong></div>
          </div>
        </div>
      ` : '<p class="text-muted" style="padding:8px 0">에코 도급 업체가 없습니다.</p>'}
    </div>

    <!-- ── 직영 업체 테이블 ── -->
    <div class="billing-overview-section" style="margin-top:20px">
      <div class="bo-section-header">
        <span class="bo-section-icon">🏠</span>
        <span>오피스클린프로 직영 업체 (${directCompanies.length}개)</span>
      </div>
      ${directCompanies.length > 0 ? `
        <div class="bo-table-pc">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>업체명</th>
                  <th>구분</th>
                  <th>계약금액</th>
                  <th>OCP 수수료</th>
                  <th>직원 지급</th>
                  <th>순수익</th>
                  <th>수수료 방식</th>
                </tr>
              </thead>
              <tbody>${directCompanies.map(r => {
                const feeInfo = getFeeInfoText(r.meta);
                const net = r.contract - r.workerPay - r.ocp;
                return `<tr onclick="openCompanyDetail('${r.company.id}')" style="cursor:pointer">
                  <td>
                    <div style="font-weight:600">${r.company.name}</div>
                    <div class="text-muted" style="font-size:11px">${r.company.area_name || ''}</div>
                  </td>
                  <td><span class="badge bo-badge-direct">직영</span></td>
                  <td>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</td>
                  <td style="color:var(--primary);font-weight:600">${r.ocp > 0 ? fmt(r.ocp) + '원' : '-'}</td>
                  <td>${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</td>
                  <td style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${fmt(net)}원</td>
                  <td style="font-size:12px">${feeInfo}</td>
                </tr>`;
              }).join('')}</tbody>
              <tfoot>
                <tr style="font-weight:700;background:rgba(96,165,250,0.06)">
                  <td colspan="2">합계</td>
                  <td>${fmt(directContractTotal)}원</td>
                  <td style="color:var(--primary)">${fmt(directOcpTotal)}원</td>
                  <td>${fmt(directWorkerTotal)}원</td>
                  <td style="color:var(--green)">${fmt(directContractTotal - directWorkerTotal - directOcpTotal)}원</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div class="bo-cards-mobile">
          ${directCompanies.map(r => renderBillingOverviewCard(r, 'direct')).join('')}
          <div class="bo-mobile-total">
            <span>직영 합계</span>
            <div>계약: <strong>${fmt(directContractTotal)}</strong> / OCP: <strong style="color:var(--primary)">${fmt(directOcpTotal)}</strong></div>
          </div>
        </div>
      ` : '<p class="text-muted" style="padding:8px 0">직영 업체가 없습니다.</p>'}
    </div>
  `;
}

/** 수수료 방식 텍스트 */
function getFeeInfoText(meta) {
  const parts = [];
  if (meta.ocp_type === 'percent') parts.push('OCP ' + (meta.ocp_rate || 0) + '%');
  else if (meta.ocp_type === 'fixed') parts.push('OCP 정액');
  if (meta.eco_type === 'percent') parts.push('에코 ' + (meta.eco_rate || 0) + '%');
  else if (meta.eco_type === 'fixed') parts.push('에코 정액');
  return parts.length > 0 ? parts.join(' / ') : '-';
}

/** 모바일 카드 (정산 현황용) */
function renderBillingOverviewCard(r, type) {
  const badgeClass = type === 'sub' ? 'bo-badge-sub' : 'bo-badge-direct';
  const badgeText = type === 'sub' ? '도급' : '직영';
  return `
    <div class="card bo-card" onclick="openCompanyDetail('${r.company.id}')" style="cursor:pointer">
      <div class="bo-card-header">
        <div>
          <span class="badge ${badgeClass}" style="margin-right:6px">${badgeText}</span>
          <strong>${r.company.name}</strong>
        </div>
        <span class="text-muted" style="font-size:11px">${r.company.area_name || ''}</span>
      </div>
      <div class="bo-card-body">
        <div class="bo-card-row">
          <span>계약금액</span>
          <span>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</span>
        </div>
        ${type === 'sub' ? `
        <div class="bo-card-row">
          <span>에코 수수료</span>
          <span style="color:var(--orange);font-weight:600">${r.eco > 0 ? fmt(r.eco) + '원' : '-'}</span>
        </div>` : ''}
        <div class="bo-card-row">
          <span>OCP 수수료</span>
          <span style="color:var(--primary);font-weight:600">${r.ocp > 0 ? fmt(r.ocp) + '원' : '-'}</span>
        </div>
        <div class="bo-card-row">
          <span>직원 지급</span>
          <span>${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</span>
        </div>
      </div>
    </div>
  `;
}


/* ═══════════════════════════════════════════════════
   월별 정산 뷰 (기존)
   ═══════════════════════════════════════════════════ */

function renderBillingMonthly(unpaidAll, totalUnpaid) {
  const container = document.getElementById('billingContent');
  if (!container) return;

  let list = adminData.billings.filter(b => b.month === billingMonth);

  const monthTotal = list.reduce((s, b) => s + (b.billed_amount || 0), 0);
  const monthPaid = list.reduce((s, b) => s + (b.paid_amount || 0), 0);

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 총액</div>
        <div class="stat-value red">${fmt(totalUnpaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수건수</div>
        <div class="stat-value yellow">${unpaidAll.length}</div>
      </div>
    </div>

    ${monthSelectorHTML(billingMonth, 'changeBillingMonth')}

    <div class="admin-row-2" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">${billingMonth.split('-')[1]}월 청구 총액</div>
        <div class="stat-value blue">${fmt(monthTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${billingMonth.split('-')[1]}월 입금 총액</div>
        <div class="stat-value green">${fmt(monthPaid)}</div>
      </div>
    </div>

    ${list.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>업체</th>
              <th>상태</th>
              <th>청구액</th>
              <th>입금액</th>
              <th>미수금</th>
            </tr>
          </thead>
          <tbody>${list.map(b => {
            const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
            const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `<tr class="billing-row" onclick="openBillingDetail('${b.id}')" style="cursor:pointer">
              <td>${getCompanyName(b.company_id)}</td>
              <td><span class="badge ${bst.badge}">${bst.label}</span></td>
              <td>${fmt(b.billed_amount)}원</td>
              <td class="admin-pay-cell">${fmt(b.paid_amount)}원</td>
              <td style="color:${unpaid > 0 ? 'var(--red)' : 'var(--text2)'}; font-weight:${unpaid > 0 ? '600' : '400'}">
                ${unpaid > 0 ? fmt(unpaid) + '원' : '-'}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>이 달의 정산 데이터가 없습니다</p>
      </div>
    `}
  `;
}


/* ═══════════════════════════════════════════════════
   미수금 목록 뷰 (기존)
   ═══════════════════════════════════════════════════ */

function renderBillingUnpaid(unpaidAll, totalUnpaid) {
  const container = document.getElementById('billingContent');
  if (!container) return;

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 총액</div>
        <div class="stat-value red">${fmt(totalUnpaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수건수</div>
        <div class="stat-value yellow">${unpaidAll.length}</div>
      </div>
    </div>

    <p class="text-muted" style="margin-bottom:12px">입금 완료되지 않은 모든 정산 건을 표시합니다.</p>

    ${unpaidAll.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>업체</th>
              <th>월</th>
              <th>청구액</th>
              <th>입금액</th>
              <th>미수금</th>
            </tr>
          </thead>
          <tbody>${unpaidAll.map(b => {
            const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `<tr class="billing-row" onclick="openBillingDetail('${b.id}')" style="cursor:pointer">
              <td>${getCompanyName(b.company_id)}</td>
              <td>${b.month}</td>
              <td>${fmt(b.billed_amount)}원</td>
              <td class="admin-pay-cell">${fmt(b.paid_amount)}원</td>
              <td style="color:var(--red); font-weight:600">
                ${unpaid > 0 ? fmt(unpaid) + '원' : '-'}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>미수금이 없습니다</p>
      </div>
    `}
  `;
}


/* ═══════════════════════════════════════════════════
   월 변경
   ═══════════════════════════════════════════════════ */

async function changeBillingMonth(month) {
  billingMonth = month;
  await ensureMonthData(month);
  renderBilling();
}


/* ═══════════════════════════════════════════════════
   정산 등록/수정/상세/삭제 (기존 기능 유지)
   ═══════════════════════════════════════════════════ */

function openBillingForm(billingId) {
  const isEdit = !!billingId;
  const b = isEdit ? adminData.billings.find(x => x.id === billingId) : {};

  const activeCompanies = adminData.companies.filter(c => {
    if (c.status === 'active') return true;
    if (c.status === 'terminated' && c.terminated_at) {
      const termMonth = c.terminated_at.substring(0, 7);
      return billingMonth <= termMonth;
    }
    return false;
  });

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '정산 수정' : '정산 등록'}</h3>

    <div class="field">
      <label>업체 *</label>
      <select id="bCompany" ${isEdit ? 'disabled' : ''} onchange="onBillingCompanyChange()">
        <option value="">업체 선택</option>
        ${activeCompanies.map(c =>
          `<option value="${c.id}"${c.id === b.company_id ? ' selected' : ''}>${c.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>정산 월 *</label>
      <input id="bMonth" type="month" value="${b.month || billingMonth}" ${isEdit ? 'disabled' : ''} onchange="onBillingCompanyChange()">
    </div>
    <div class="field">
      <label>청구 금액 (원) * <span id="bAmountHint" class="text-muted" style="font-size:11px"></span></label>
      <input id="bBilledAmount" type="number" value="${b.billed_amount || 0}" placeholder="청구 금액">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>세금계산서 발행 여부</label>
        <select id="bBilledStatus">
          <option value="no"${!b.billed_at ? ' selected' : ''}>미발행</option>
          <option value="yes"${b.billed_at ? ' selected' : ''}>발행완료</option>
        </select>
      </div>
      <div class="field">
        <label>발행일</label>
        <input id="bBilledAt" type="date" value="${b.billed_at || ''}">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>입금 여부</label>
        <select id="bPaidStatus">
          <option value="no"${!b.paid_at ? ' selected' : ''}>미입금</option>
          <option value="yes"${b.paid_at ? ' selected' : ''}>입금완료</option>
        </select>
      </div>
      <div class="field">
        <label>입금일</label>
        <input id="bPaidAt" type="date" value="${b.paid_at || ''}">
      </div>
    </div>
    <div class="field">
      <label>입금 금액 (원)</label>
      <input id="bPaidAmount" type="number" value="${b.paid_amount || 0}" placeholder="입금 금액">
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="bMemo" rows="2" placeholder="메모">${b.memo || ''}</textarea>
    </div>

    <button class="btn" id="saveBillingBtn" onclick="saveBilling('${billingId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteBilling('${billingId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onBillingCompanyChange() {
  const companyId = $('bCompany')?.value;
  const month = $('bMonth')?.value;
  const hint = $('bAmountHint');
  if (!companyId || !month || !hint) return;

  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === month);
  if (fin && fin.contract_amount) {
    hint.textContent = `(계약금액: ${fmt(fin.contract_amount)}원)`;
    const amountInput = $('bBilledAmount');
    if (amountInput && (!amountInput.value || amountInput.value === '0')) {
      amountInput.value = fin.contract_amount;
    }
  } else {
    hint.textContent = '';
  }
}

async function saveBilling(billingId) {
  const btn = $('saveBillingBtn');
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    await _saveBillingInner(billingId);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = billingId ? '수정 저장' : '등록하기'; }
  }
}

async function _saveBillingInner(billingId) {
  const companyId = $('bCompany').value;
  const month = $('bMonth').value;

  if (!companyId && !billingId) return toast('업체를 선택하세요', 'error');
  if (!month && !billingId) return toast('정산 월을 선택하세요', 'error');

  const oldBilling = billingId ? adminData.billings.find(x => x.id === billingId) : null;

  const billedAt = $('bBilledAt').value || null;
  const paidAt = $('bPaidAt').value || null;
  const billedAmount = parseInt($('bBilledAmount').value, 10) || 0;
  const paidAmount = parseInt($('bPaidAmount').value, 10) || 0;
  const billedStatus = $('bBilledStatus').value;
  const paidStatus = $('bPaidStatus').value;

  // ─── 금액 검증 ───
  if (billedAmount < 0) return toast('청구 금액은 0 이상이어야 합니다', 'error');
  if (paidAmount < 0) return toast('입금 금액은 0 이상이어야 합니다', 'error');
  if (billedAmount > 999999999) return toast('청구 금액이 너무 큽니다 (최대 9억)', 'error');
  if (paidAmount > 999999999) return toast('입금 금액이 너무 큽니다 (최대 9억)', 'error');
  if (paidAmount > billedAmount && billedAmount > 0) {
    if (!confirm(`입금액(${fmt(paidAmount)}원)이 청구액(${fmt(billedAmount)}원)보다 큽니다. 계속하시겠습니까?`)) return;
  }

  let status = 'pending';
  if (paidStatus === 'yes' || paidAt) {
    status = 'paid';
  } else if (billedStatus === 'yes' || billedAt) {
    status = 'billed';
  }

  if (status === 'billed' && billedAt) {
    const daysSince = (new Date() - new Date(billedAt)) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) status = 'overdue';
  }

  const payload = {
    billed_amount: billedAmount,
    paid_amount:   paidAmount,
    billed_at:     billedAt,
    paid_at:       paidAt,
    status,
    memo:          $('bMemo').value.trim(),
  };

  let error;
  if (billingId) {
    ({ error } = await sb.from('billing_records').update(payload).eq('id', billingId));
  } else {
    payload.company_id = companyId;
    payload.month = month;
    ({ error } = await sb.from('billing_records').insert(payload));
  }

  if (error) {
    if (error.code === '23505') return toast('해당 업체의 해당 월 정산이 이미 존재합니다', 'error');
    return toast(error.message, 'error');
  }

  if (billingId && oldBilling) {
    const changes = [];
    const cName = getCompanyName(oldBilling.company_id);
    const bst = BILLING_STATUS_MAP;

    if ((oldBilling.billed_amount || 0) !== billedAmount) changes.push({ field: 'billed_amount', oldVal: oldBilling.billed_amount || 0, newVal: billedAmount });
    if ((oldBilling.paid_amount || 0) !== paidAmount) changes.push({ field: 'paid_amount', oldVal: oldBilling.paid_amount || 0, newVal: paidAmount });
    if ((oldBilling.status || 'pending') !== status) changes.push({ field: 'status', oldVal: (bst[oldBilling.status] || bst.pending).label, newVal: (bst[status] || bst.pending).label });
    if ((oldBilling.billed_at || '') !== (billedAt || '')) changes.push({ field: 'billed_at', oldVal: oldBilling.billed_at || '없음', newVal: billedAt || '없음' });
    if ((oldBilling.paid_at || '') !== (paidAt || '')) changes.push({ field: 'paid_at', oldVal: oldBilling.paid_at || '없음', newVal: paidAt || '없음' });

    if (changes.length > 0) {
      await logChange('billing_records', billingId, 'update', changes,
        `${cName} (${oldBilling.month}) 정산 수정`
      );
    }
  }

  toast(billingId ? '정산 수정 완료' : '정산 등록 완료');
  closeModal();
  await loadAdminData();
  renderBilling();
}

function openBillingDetail(billingId) {
  const b = adminData.billings.find(x => x.id === billingId);
  if (!b) return;

  const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
  const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${getCompanyName(b.company_id)} - ${b.month}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">상태</div>
          <p><span class="badge ${bst.badge}" style="font-size:13px;padding:4px 12px">${bst.label}</span></p>
        </div>
        <div>
          <div class="stat-label">미수금</div>
          <p style="font-size:18px;font-weight:700;color:${unpaid > 0 ? 'var(--red)' : 'var(--green)'}">
            ${unpaid > 0 ? fmt(unpaid) + '원' : '없음'}
          </p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">💰 금액 정보</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">청구 금액</span>
          <span class="billing-info-value">${fmt(b.billed_amount)}원</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금 금액</span>
          <span class="billing-info-value" style="color:var(--green)">${fmt(b.paid_amount)}원</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📄 세금계산서</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">발행 여부</span>
          <span class="billing-info-value">${b.billed_at
            ? '<span class="badge badge-done">발행완료</span>'
            : '<span class="badge badge-warn">미발행</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">발행일</span>
          <span class="billing-info-value">${b.billed_at || '-'}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏦 입금</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">입금 여부</span>
          <span class="billing-info-value">${b.paid_at
            ? '<span class="badge badge-done">입금완료</span>'
            : '<span class="badge badge-warn">미입금</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금일</span>
          <span class="billing-info-value">${b.paid_at || '-'}</span>
        </div>
      </div>
    </div>

    ${b.memo ? `
    <div class="detail-section">
      <div class="detail-section-title">📝 메모</div>
      <div class="special-notes-box">${escapeHtml(b.memo).replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn" style="flex:1" onclick="openBillingForm('${b.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteBilling('${b.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function deleteBilling(billingId) {
  if (!confirm('이 정산 기록을 삭제하시겠습니까?')) return;

  const oldBilling = adminData.billings.find(x => x.id === billingId);
  const cName = oldBilling ? getCompanyName(oldBilling.company_id) : '';

  const { error } = await sb.from('billing_records').delete().eq('id', billingId);
  if (error) return toast(error.message, 'error');

  if (oldBilling) {
    await logChange('billing_records', billingId, 'delete',
      [{ field: 'billed_amount', oldVal: oldBilling.billed_amount || 0, newVal: null },
       { field: 'status', oldVal: (BILLING_STATUS_MAP[oldBilling.status] || BILLING_STATUS_MAP.pending).label, newVal: '삭제됨' }],
      `${cName} (${oldBilling.month}) 정산 삭제`
    );
  }

  toast('정산 삭제됨');
  closeModal();
  await loadAdminData();
  renderBilling();
}

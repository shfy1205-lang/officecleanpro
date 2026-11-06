/**
 * admin-billing.js - 정산관리 탭
 * 3개 뷰: 정산 현황(overview) | 월별 정산(all) | 미수금 목록(unpaid)
 */

/**
 * 청구월의 입금 기한 = 다음 달 10일
 * 업체 입금 주기가 '청구월 말 ~ 익월 10일'이므로,
 * 그 전까지는 연체가 아니라 정상 진행 상태다.
 */
function billingDueDate(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return '9999-12-31';
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-10`;
}

/** 미납 잔액 */
function billingUnpaidAmount(b) {
  return (b.billed_amount || 0) - (b.paid_amount || 0);
}

/** 입금 기한이 지난 미납 건 = 실제 미수금(연체) */
function isOverdueBilling(b) {
  return b.status !== 'paid'
    && billingUnpaidAmount(b) > 0
    && billingDueDate(b.month) < today();
}

/** 아직 입금 기한 전인 미납 건 = 정상 진행 (당월 이하만) */
function isAwaitingBilling(b) {
  return b.status !== 'paid'
    && billingUnpaidAmount(b) > 0
    && billingDueDate(b.month) >= today()
    && String(b.month || '') <= currentMonth();
}

/**
 * 에코 도급 업체 여부.
 * 도급은 에코가 업체에서 수금해 한 번에 정산해 주므로
 * 업체별 세금계산서를 발행하지 않는다 → 청구/미수금 집계에서 제외한다.
 */
function isSubcontractCompanyId(companyId) {
  const c = (adminData.companies || []).find(x => x.id === companyId);
  return !!c && c.subcontract_from === '에코오피스클린';
}

/** 청구/미수금 집계 대상 = 직영 건만 */
function isDirectBilling(b) {
  return !isSubcontractCompanyId(b.company_id);
}

/** 업체 화면에서 '미수금 제외'로 표시한 업체 (예: 별도 정산하는 곳) */
function isReceivableExcluded(companyId) {
  const c = (adminData.companies || []).find(x => x.id === companyId);
  return !!c && !!c.exclude_from_receivables;
}

/** 연체 일수 = 오늘 - 입금 기한(청구월 다음 달 10일) */
function billingOverdueDays(b) {
  const due = new Date(billingDueDate(b.month) + 'T00:00:00');
  const now = new Date(today() + 'T00:00:00');
  return Math.max(0, Math.round((now - due) / 86400000));
}

/** 미수 건을 업체별로 묶기: [{company_id, items, total, maxDays}] 금액 큰 순 */
function groupUnpaidByCompany(list) {
  const map = {};
  list.forEach(b => {
    const g = map[b.company_id] || (map[b.company_id] = { company_id: b.company_id, items: [], total: 0, maxDays: 0 });
    g.items.push(b);
    g.total += billingUnpaidAmount(b);
    g.maxDays = Math.max(g.maxDays, billingOverdueDays(b));
  });
  return Object.values(map)
    .map(g => (g.items.sort((a, b) => a.month.localeCompare(b.month)), g))
    .sort((a, b) => b.total - a.total);
}

function renderBilling() {
  const mc = $('mainContent');

  // ── 미수금 통계 (뷰 공통) ──
  // 입금 기한(청구월 다음 달 10일)이 지난 건만 미수금으로 집계한다.
  // 도급(에코 일괄 정산) 건은 제외한다.
  const unpaidAll = adminData.billings.filter(b => isDirectBilling(b) && !isReceivableExcluded(b.company_id) && isOverdueBilling(b))
    .sort((a, b) => billingUnpaidAmount(b) - billingUnpaidAmount(a)); // 미수금 큰 순
  const totalUnpaid = unpaidAll.reduce((s, b) => s + billingUnpaidAmount(b), 0);

  // 아직 기한 전인 건 (연체 아님)
  const awaitingAll = adminData.billings.filter(b => isDirectBilling(b) && !isReceivableExcluded(b.company_id) && isAwaitingBilling(b))
    .sort((a, b) => billingUnpaidAmount(b) - billingUnpaidAmount(a));
  const totalAwaiting = awaitingAll.reduce((s, b) => s + billingUnpaidAmount(b), 0);

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
    renderBillingUnpaid(unpaidAll, totalUnpaid, awaitingAll, totalAwaiting);
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

  // 해지 당월 0원 업체(레코드 이관 잔재)는 제외 — isCompanyInMonth() 참고
  const activeCompanies = adminData.companies.filter(c => isCompanyInMonth(c, billingMonth));
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

    ${cashSummaryHTML(billingMonth)}

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
                    <div style="font-weight:600">${escapeHtml(r.company.name)}</div>
                    <div class="text-muted" style="font-size:11px">${escapeHtml(r.company.area_name || '')}</div>
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
                    <div style="font-weight:600">${escapeHtml(r.company.name)}</div>
                    <div class="text-muted" style="font-size:11px">${escapeHtml(r.company.area_name || '')}</div>
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
          <strong>${escapeHtml(r.company.name)}</strong>
        </div>
        <span class="text-muted" style="font-size:11px">${escapeHtml(r.company.area_name || '')}</span>
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

/**
 * 에코 도급 일괄 정산 섹션.
 * 도급 업체는 에코가 업체에서 수금해 한 번에 보내주므로
 * 업체별 청구가 아니라 ‘에코 → OCP’ 한 건으로 본다.
 * 에코 수령액 = 도급 계약 합계 − 에코 수수료 합계
 */
function renderEcoLumpHTML(month) {
  const subs = (adminData.companies || []).filter(c => c.subcontract_from === '에코오피스클린');
  if (!subs.length) return '';

  const subMap = {};
  subs.forEach(c => { subMap[c.id] = c; });

  const fins = (adminData.financials || []).filter(f => f.month === month && subMap[f.company_id]);
  if (!fins.length) return '';

  let contract = 0, eco = 0, ocp = 0, worker = 0;
  fins.forEach(f => {
    contract += f.contract_amount || 0;
    eco += f.eco_amount || 0;
    ocp += f.ocp_amount || 0;
    worker += f.worker_pay_total || 0;
  });
  const receive = contract - eco;

  const rows = fins
    .slice()
    .sort((a, b) => (b.contract_amount || 0) - (a.contract_amount || 0))
    .map(f => `<tr>
      <td>${escapeHtml((subMap[f.company_id] || {}).name || '-')}</td>
      <td>${fmt(f.contract_amount || 0)}원</td>
      <td>${fmt(f.eco_amount || 0)}원</td>
      <td>${fmt(f.worker_pay_total || 0)}원</td>
      <td>${fmt(f.ocp_amount || 0)}원</td>
    </tr>`)
    .join('');

  return `
    <div class="section-title" style="margin-top:24px">에코 도급 일괄 정산 (${month})</div>
    <p class="text-muted" style="margin-bottom:12px">
      도급 업체는 업체에 세금계산서를 발행하지 않고 에코가 일괄 정산합니다.
      아래 ‘에코 입금 예정액’이 에코에서 통으로 받는 금액이며, 위 업체별 청구 목록과 미수금에는 포함되지 않습니다.
    </p>

    <div class="admin-row-2" style="margin-bottom:12px">
      <div class="stat-card">
        <div class="stat-label">에코 입금 예정액</div>
        <div class="stat-value green">${fmt(receive)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">도급 업체 수</div>
        <div class="stat-value">${fins.length}</div>
      </div>
    </div>

    <div class="admin-row-2" style="margin-bottom:12px">
      <div class="stat-card">
        <div class="stat-label">도급 계약 합계</div>
        <div class="stat-value blue">${fmt(contract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">에코 수수료</div>
        <div class="stat-value yellow">${fmt(eco)}</div>
      </div>
    </div>

    <div class="admin-row-2" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">직원 지급</div>
        <div class="stat-value">${fmt(worker)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">OCP 수수료</div>
        <div class="stat-value green">${fmt(ocp)}</div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>업체</th>
            <th>계약금액</th>
            <th>에코 수수료</th>
            <th>직원 지급</th>
            <th>OCP 수수료</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderBillingMonthly(unpaidAll, totalUnpaid) {
  const container = document.getElementById('billingContent');
  if (!container) return;

  // 도급은 에코가 일괄 정산하므로 업체별 청구 목록에서 제외하고
  // 아래 ‘에코 도급 일괄 정산’ 섹션에서 따로 보여준다.
  let list = adminData.billings.filter(b => b.month === billingMonth && isDirectBilling(b))
    .sort((a, b) => getCompanyName(a.company_id).localeCompare(getCompanyName(b.company_id), 'ko')); // 업체명순

  const monthTotal = list.reduce((s, b) => s + (b.billed_amount || 0), 0);
  const monthPaid = list.reduce((s, b) => s + (b.paid_amount || 0), 0);

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 총액 (기한 경과)</div>
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
        <div class="stat-label">${billingMonth.split('-')[1]}월 직영 청구 총액</div>
        <div class="stat-value blue">${fmt(monthTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${billingMonth.split('-')[1]}월 직영 입금 총액</div>
        <div class="stat-value green">${fmt(monthPaid)}</div>
      </div>
    </div>

    ${list.length > 0 ? `
      <div class="bm-table-pc">
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
              <td>${escapeHtml(getCompanyName(b.company_id))}</td>
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
      </div>
      <div class="bm-cards-mobile">
        ${list.map(b => {
          const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
          const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
          return `<div class="card bo-card" onclick="openBillingDetail('${b.id}')" style="cursor:pointer">
            <div class="bo-card-header">
              <strong>${escapeHtml(getCompanyName(b.company_id))}</strong>
              <span class="badge ${bst.badge}">${bst.label}</span>
            </div>
            <div class="bo-card-body">
              <div class="bo-card-row"><span>청구액</span><span>${fmt(b.billed_amount)}원</span></div>
              <div class="bo-card-row"><span>입금액</span><span style="color:var(--green)">${fmt(b.paid_amount)}원</span></div>
              <div class="bo-card-row"><span>미수금</span><span style="color:${unpaid > 0 ? 'var(--red)' : 'var(--text2)'};font-weight:${unpaid > 0 ? '600' : '400'}">${unpaid > 0 ? fmt(unpaid) + '원' : '-'}</span></div>
            </div>
          </div>`;
        }).join('')}
      </div>

    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>이 달의 직영 정산 데이터가 없습니다</p>
      </div>
    `}

    ${renderEcoLumpHTML(billingMonth)}
  `;
}


/* ═══════════════════════════════════════════════════
   미수금 목록 뷰 (기존)
   ═══════════════════════════════════════════════════ */

function renderBillingUnpaid(unpaidAll, totalUnpaid, awaitingAll, totalAwaiting) {
  const container = document.getElementById('billingContent');
  if (!container) return;

  awaitingAll = awaitingAll || [];
  totalAwaiting = totalAwaiting || 0;
  const groups = groupUnpaidByCompany(unpaidAll);
  const excludedGroups = groupUnpaidByCompany(
    adminData.billings.filter(b => isDirectBilling(b) && isReceivableExcluded(b.company_id) && isOverdueBilling(b)));
  const excludedTotal = excludedGroups.reduce((s, g) => s + g.total, 0);
  const daysBadge = d => `<span class="badge" style="font-weight:600;color:${d >= 30 ? 'var(--red)' : d >= 14 ? 'var(--yellow)' : 'var(--text2)'}">${d}일</span>`;
  const monthsText = g => g.items.map(b => Number(b.month.slice(5)) + '월').join('·');

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 (기한 경과)</div>
        <div class="stat-value red">${fmt(totalUnpaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수 업체</div>
        <div class="stat-value">${groups.length}곳 · ${unpaidAll.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">입금 대기 (기한 전)</div>
        <div class="stat-value">${fmt(totalAwaiting)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수금 제외 업체</div>
        <div class="stat-value">${excludedGroups.length}곳 · ${fmt(excludedTotal)}</div>
      </div>
    </div>

    <p class="text-muted" style="margin-bottom:12px">기준: 입금 기한(청구월 다음 달 10일)이 지난 미납 건. 에코 도급과 '미수금 제외'로 표시한 업체는 빠집니다. 연체 일수는 입금 기한부터 셉니다.</p>

    ${groups.length > 0 ? `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;cursor:pointer">
          <input type="checkbox" id="ruAll" onchange="document.querySelectorAll('.ru-check').forEach(x=>x.checked=this.checked)"> 전체 선택
        </label>
        <button class="btn-sm btn-blue" onclick="openReminderMessages()">선택한 업체 입금 요청 문자 만들기</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th style="width:32px"></th><th>업체</th><th>미납 월</th><th>미수금</th><th>연체</th><th>연락처</th><th></th></tr>
          </thead>
          <tbody>${groups.map(g => {
            const c = (adminData.companies || []).find(x => x.id === g.company_id) || {};
            return `<tr>
              <td><input type="checkbox" class="ru-check" value="${g.company_id}"></td>
              <td><a href="#" onclick="event.preventDefault();openBillingDetail('${g.items[0].id}')">${escapeHtml(getCompanyName(g.company_id))}</a></td>
              <td>${monthsText(g)}</td>
              <td style="font-weight:600">${fmt(g.total)}원</td>
              <td>${daysBadge(g.maxDays)}</td>
              <td class="text-muted" style="font-size:12px">${escapeHtml(c.contact_phone || '-')}</td>
              <td><button class="btn-sm" style="font-size:11px;border:1px solid var(--border);color:var(--text2);background:transparent" onclick="toggleReceivableExclude('${g.company_id}', true)">미수금 제외</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>기한이 지난 미수금이 없습니다</p>
      </div>
    `}

    ${excludedGroups.length > 0 ? `
      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-size:13px">미수금 제외 업체 ${excludedGroups.length}곳 (${fmt(excludedTotal)}원)</summary>
        <div class="table-wrap" style="margin-top:8px">
          <table>
            <thead><tr><th>업체</th><th>미납 월</th><th>금액</th><th>연체</th><th></th></tr></thead>
            <tbody>${excludedGroups.map(g => `<tr>
              <td>${escapeHtml(getCompanyName(g.company_id))}</td>
              <td>${monthsText(g)}</td>
              <td>${fmt(g.total)}원</td>
              <td>${daysBadge(g.maxDays)}</td>
              <td><button class="btn-sm" style="font-size:11px" onclick="toggleReceivableExclude('${g.company_id}', false)">다시 포함</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </details>
    ` : ''}
  `;
}

/** 업체를 미수금 집계에서 빼거나 다시 넣기 */
async function toggleReceivableExclude(companyId, exclude) {
  const { error } = await sb.from('companies').update({ exclude_from_receivables: exclude }).eq('id', companyId);
  if (error) return toast('저장 실패: ' + error.message, 'error');
  const c = adminData.companies.find(x => x.id === companyId);
  if (c) c.exclude_from_receivables = exclude;
  toast(exclude ? '미수금에서 제외했어요' : '미수금에 다시 포함했어요');
  renderBilling();
}

/** 선택한 업체의 입금 요청 문자 (복사해서 직접 보내기) */
async function openReminderMessages() {
  const ids = [...document.querySelectorAll('.ru-check:checked')].map(x => x.value);
  if (!ids.length) return toast('업체를 선택하세요', 'error');
  const { data: cfg } = await sb.from('tax_config').select('*').limit(1).maybeSingle();
  const acct = cfg || {};
  const overdue = adminData.billings.filter(b => ids.includes(b.company_id) && isDirectBilling(b) && isOverdueBilling(b));
  const groups = groupUnpaidByCompany(overdue);
  const account = (acct.bank_name || acct.bank_account)
    ? `${acct.bank_name || ''} ${acct.bank_account || ''}${acct.account_holder ? ' (예금주: ' + acct.account_holder + ')' : ''}`.trim()
    : '(위에서 계좌를 입력하세요)';
  const msg = g => {
    const months = g.items.map(b => Number(b.month.slice(5)) + '월').join('·');
    const lines = g.items.length > 1
      ? g.items.map(b => `- ${Number(b.month.slice(5))}월분 ${fmt(billingUnpaidAmount(b))}원`).join('\n') + '\n'
      : '';
    return `안녕하세요, 오피스클린프로입니다.\n${months} 청소용역 대금 ${fmt(g.total)}원이 아직 확인되지 않아 연락드립니다.\n${lines}이미 입금하셨다면 양해 부탁드리고, 아직이시면 확인 후 입금 부탁드립니다.\n계좌: ${account}\n감사합니다.`;
  };
  window._reminderTexts = groups.map(msg);
  $('modalBody').innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>입금 요청 문자 ${groups.length}건</h3>
    <p class="text-muted" style="font-size:12px;margin-bottom:12px">복사해서 문자·카톡으로 직접 보내세요. 자동으로 보내지 않습니다.</p>
    ${(!acct.bank_account) ? `
      <div class="admin-row-2" style="margin-bottom:12px">
        <div class="field"><label>은행</label><input id="rmBank" placeholder="예: 국민은행"></div>
        <div class="field"><label>계좌번호</label><input id="rmAcct" placeholder="000-0000-0000"></div>
      </div>
      <div class="field" style="margin-bottom:12px"><label>예금주</label><input id="rmHolder" placeholder="오피스클린프로"></div>
      <button class="btn-sm btn-green" style="margin-bottom:16px" onclick="saveReminderAccount()">계좌 저장 후 다시 만들기</button>
    ` : ''}
    ${groups.map((g, i) => {
      const c = (adminData.companies || []).find(x => x.id === g.company_id) || {};
      return `<div class="card" style="margin-bottom:10px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong>${escapeHtml(getCompanyName(g.company_id))}</strong>
          <span class="text-muted" style="font-size:12px">${escapeHtml(c.contact_phone || '')}</span>
        </div>
        <textarea id="rmText${i}" rows="6" style="width:100%;font-size:13px">${escapeHtml(window._reminderTexts[i])}</textarea>
        <button class="btn-sm btn-blue" style="margin-top:6px" onclick="copyReminder(${i})">복사</button>
      </div>`;
    }).join('')}
  `;
  $('detailModal').classList.add('show');
}

async function copyReminder(i) {
  const el = $('rmText' + i);
  try { await navigator.clipboard.writeText(el.value); toast('복사했어요'); }
  catch (e) { el.select(); document.execCommand('copy'); toast('복사했어요'); }
}

async function saveReminderAccount() {
  const payload = { bank_name: $('rmBank').value.trim(), bank_account: $('rmAcct').value.trim(), account_holder: $('rmHolder').value.trim() };
  if (!payload.bank_account) return toast('계좌번호를 입력하세요', 'error');
  const { data: cfg } = await sb.from('tax_config').select('id').limit(1).maybeSingle();
  const { error } = cfg
    ? await sb.from('tax_config').update(payload).eq('id', cfg.id)
    : await sb.from('tax_config').insert(payload);
  if (error) return toast('저장 실패: ' + error.message, 'error');
  toast('계좌를 저장했어요');
  openReminderMessages();
}


/* ═══════════════════════════════════════════════════
   월 변경
   ═══════════════════════════════════════════════════ */

async function changeBillingMonth(month) {
  try {
  billingMonth = month;
  window._financeMonth = month;
  await ensureMonthData(month);
  renderBilling();

  } catch (e) {
    console.error('changeBillingMonth error:', e);
    toast('오류가 발생했습니다', 'error');
  }}


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
          `<option value="${c.id}"${c.id === b.company_id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`
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
      <textarea id="bMemo" rows="2" placeholder="메모">${escapeHtml(b.memo || '')}</textarea>
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
  try {
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

  // 연체 판정: 대상월 말일 기준 30일 경과 (billing-alert와 동일 로직)
  if (status === 'billed') {
    const billingMonth = month || (oldBilling && oldBilling.month);
    if (billingMonth) {
      const monthEnd = new Date(billingMonth + '-01');
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      const daysSince = (new Date() - monthEnd) / (1000 * 60 * 60 * 24);
      if (daysSince >= 30) status = 'overdue';
    }
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

  } catch (e) {
    console.error('_saveBillingInner error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

function openBillingDetail(billingId) {
  const b = adminData.billings.find(x => x.id === billingId);
  if (!b) return;

  const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
  const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHtml(getCompanyName(b.company_id))} - ${b.month}</h3>

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
  try {
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

  } catch (e) {
    console.error('deleteBilling error:', e);
    toast('오류가 발생했습니다', 'error');
  }}


/* ═══════════════════════════════════════════════════
   월 자금 요약: 잔고 + 받을 돈 − 줄 돈 = 남는 돈
   ═══════════════════════════════════════════════════ */

function calcCashSummary(month) {
  const cash = (adminData.monthlyCash || []).find(x => x.month === month) || {};
  // 받을 돈: 이 달 청구 중 미입금 (에코 도급·미수금 제외 업체 빼고)
  const unpaidBills = adminData.billings.filter(b => b.month === month && b.status !== 'paid'
    && billingUnpaidAmount(b) > 0 && isDirectBilling(b) && !isReceivableExcluded(b.company_id));
  const receivable = unpaidBills.reduce((s, b) => s + billingUnpaidAmount(b), 0);
  // 에코: 도급은 에코에서 받고(계약 − 수수료, 도급 청구가 입금 전일 때), 광고비·수수료는 에코에 준다
  const eco = getEcoCompanies(month);
  const subPaid = cid => adminData.billings.some(b => b.month === month && b.company_id === cid && b.status === 'paid');
  const ecoIn = eco.filter(d => d.subcontracted && !subPaid(d.id)).reduce((s, d) => s + d.ecoToOcp, 0);
  const ecoOut = eco.reduce((s, d) => s + d.ocpToEco, 0);
  // 남은 직원 지급: 지급 완료 표시가 없는 직원의 실지급액
  const { rows } = calcStaffPayData(month);
  const unpaidWorkers = rows.filter(r => !isPayPaid(r.workerId, month));
  const payLeft = unpaidWorkers.reduce((s, r) => s + calcDeduction(r.totalPay, month, r.isBusiness).netPay, 0);
  const balance = cash.bank_balance;
  const left = (balance || 0) + receivable + ecoIn - ecoOut - payLeft;
  return { balance, receivable, unpaidCount: unpaidBills.length, ecoIn, ecoOut, payLeft, unpaidWorkers, left };
}

function cashSummaryHTML(month) {
  const r = calcCashSummary(month);
  const m = Number(month.slice(5));
  const line = (label, v, sign, sub) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span>${label}${sub ? ` <span class="text-muted" style="font-size:11px">${sub}</span>` : ''}</span>
      <span style="font-variant-numeric:tabular-nums">${sign}${fmt(v)}원</span></div>`;
  return `
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <strong>${m}월 자금 요약</strong>
        <span style="display:flex;gap:6px;align-items:center;font-size:13px">통장 잔고
          <input id="cashBalance" type="text" inputmode="numeric" value="${r.balance != null ? fmt(r.balance) : ''}" placeholder="입력" style="width:130px;text-align:right">
          <button class="btn-sm btn-blue" onclick="saveCashBalance('${month}')">저장</button></span>
      </div>
      ${line('통장 잔고', r.balance || 0, '', r.balance == null ? '아직 입력 안 함' : '')}
      ${line('+ 받을 청구', r.receivable, '+', `${m}월분 미입금 ${r.unpaidCount}건`)}
      ${line('+ 에코에서 받을 돈', r.ecoIn, '+', '도급 계약 − 에코 수수료')}
      ${line('− 에코에 줄 돈', r.ecoOut, '−', '광고비·수수료')}
      ${line('− 남은 직원 지급', r.payLeft, '−', r.unpaidWorkers.length ? r.unpaidWorkers.map(w => escapeHtml(w.name)).join(', ') : '모두 지급 완료')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:700;font-size:15px">
        <span>= 다 받고 다 주면 남는 돈</span><span style="font-variant-numeric:tabular-nums">${fmt(r.left)}원</span></div>
      <p class="text-muted" style="font-size:11px;margin-top:6px">직원 지급은 담당자급여에서 '지급 ✓'로 표시하면 빠져요. 부가세 적립분은 빼지 않은 금액이에요.</p>
    </div>`;
}

async function saveCashBalance(month) {
  const v = parseInt(String($('cashBalance').value).replace(/[^0-9-]/g, ''), 10);
  if (isNaN(v)) return toast('잔고를 숫자로 입력하세요', 'error');
  const { data, error } = await sb.from('monthly_cash').upsert({ month, bank_balance: v, updated_at: new Date().toISOString() }, { onConflict: 'month' }).select();
  if (error) return toast('저장 실패: ' + error.message, 'error');
  adminData.monthlyCash = (adminData.monthlyCash || []).filter(x => x.month !== month).concat(data || [{ month, bank_balance: v }]);
  toast('잔고를 저장했어요');
  renderBilling();
}

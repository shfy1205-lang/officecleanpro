/**
 * staff-pay.js - 내 급여 탭
 * 총급여, 3.3% 공제액, 실지급액 표시
 * 업체별 지급금액 목록
 * 급여 확정 상태 표시
 */

function isMyPayConfirmed(month) {
  const pc = staffData.payConfirmations.find(
    p => p.month === month
  );
  return pc && pc.confirmed;
}

function renderMyPay() {
  const mc = $('mainContent');
  const assigns = getMonthAssignments(selectedMonth);

  const totalPay = assigns.reduce((sum, a) => sum + (a.pay_amount || 0), 0);
  const companyCount = assigns.length;
  const deduction = Math.round(totalPay * 0.033);
  const netPay = totalPay - deduction;
  const monthLabel = selectedMonth.split('-')[1];
  const confirmed = isMyPayConfirmed(selectedMonth);

  let html = `
    <div class="section-title">내 급여</div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <!-- 확정 상태 배너 -->
    ${confirmed
      ? `<div class="sp-staff-confirm-banner sp-staff-confirmed">
           <span>✅ ${monthLabel}월 급여가 확정되었습니다</span>
         </div>`
      : `<div class="sp-staff-confirm-banner sp-staff-pending">
           <span>⏳ ${monthLabel}월 급여 미확정 (예상 금액)</span>
         </div>`
    }

    <!-- 급여 요약 카드: 총급여 / 공제 / 실지급 -->
    <div class="pay-summary-card">
      <div class="pay-total-label">${monthLabel}월 ${confirmed ? '확정' : '예상'} 실지급액</div>
      <div class="pay-total-amount">${fmt(netPay)}원</div>
      <div class="pay-total-sub">총 ${companyCount}개 업체</div>
    </div>

    <div class="sp-pay-breakdown">
      <div class="sp-pay-breakdown-item">
        <span class="sp-pay-breakdown-label">총급여</span>
        <span class="sp-pay-breakdown-value">${fmt(totalPay)}원</span>
      </div>
      <div class="sp-pay-breakdown-item sp-pay-minus">
        <span class="sp-pay-breakdown-label">3.3% 공제액</span>
        <span class="sp-pay-breakdown-value">-${fmt(deduction)}원</span>
      </div>
      <div class="sp-pay-breakdown-item sp-pay-result">
        <span class="sp-pay-breakdown-label">실지급액</span>
        <span class="sp-pay-breakdown-value">${fmt(netPay)}원</span>
      </div>
    </div>
  `;

  if (assigns.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-icon">💰</div>
      <p>${selectedMonth} 급여 데이터가 없습니다.</p>
    </div>`;
    mc.innerHTML = html;
    return;
  }

  // 업체별 급여 목록 (금액 내림차순)
  const sorted = [...assigns].sort((a, b) => (b.pay_amount || 0) - (a.pay_amount || 0));

  html += `
    <div class="section-title" style="font-size:14px;margin-top:20px">업체별 지급금액</div>
    <div class="pay-list">
  `;
  sorted.forEach(a => {
    const comp = getCompanyById(a.company_id);
    if (!comp) return;
    const pct = totalPay > 0 ? ((a.pay_amount || 0) / totalPay * 100).toFixed(1) : 0;

    html += `
      <div class="card pay-card">
        <div class="card-header">
          <div>
            <div class="card-title">${comp.name}</div>
            <div class="card-subtitle">${comp.area_name || '기타'}</div>
          </div>
          <div class="card-amount">${fmt(a.pay_amount)}원</div>
        </div>
        <div class="pay-bar-wrap">
          <div class="pay-bar" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  mc.innerHTML = html;
}

function changePayMonth(month) {
  selectedMonth = month;
  renderMyPay();
}

/**
 * staff-pay.js - 내 급여 탭
 */

function renderMyPay() {
  const mc = $('mainContent');
  const assigns = getMonthAssignments(selectedMonth);

  const totalPay = assigns.reduce((sum, a) => sum + (a.pay_amount || 0), 0);
  const companyCount = assigns.length;

  let html = `
    <div class="section-title">내 급여</div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <div class="pay-summary-card">
      <div class="pay-total-label">${selectedMonth.split('-')[1]}월 총 급여</div>
      <div class="pay-total-amount">${fmt(totalPay)}원</div>
      <div class="pay-total-sub">총 ${companyCount}개 업체</div>
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

  html += `<div class="pay-list">`;
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

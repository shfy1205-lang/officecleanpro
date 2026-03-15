/**
 * admin-dashboard.js - 대시보드 탭
 */

function renderDashboard() {
  const mc = $('mainContent');

  const activeCompanies = adminData.companies.filter(c => c.status === 'active').length;
  const activeWorkers = adminData.workers.filter(w => w.status === 'active' && w.role === 'staff').length;
  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);
  const totalPay = monthAssigns.reduce((s, a) => s + (a.pay_amount || 0), 0);
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);
  const totalContract = monthFin.reduce((s, f) => s + (f.contract_amount || 0), 0);

  const pendingRequests = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;

  // 미수금 현황
  const unpaidBillings = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidBillings.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);

  // 진행중 견적
  const activeLeads = adminData.leads.filter(l => !['won','lost'].includes(l.status)).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      대시보드
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-gray" onclick="exportWorkers()" style="font-size:11px;padding:6px 10px">📥 직원</button>
        <button class="btn-sm btn-blue" onclick="exportAll()" style="font-size:11px;padding:6px 10px">📥 전체</button>
      </div>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changeDashMonth')}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">활성 업체</div>
        <div class="stat-value blue">${activeCompanies}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">활성 직원</div>
        <div class="stat-value green">${activeWorkers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 계약 총액</div>
        <div class="stat-value yellow">${fmt(totalContract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 인건비 총액</div>
        <div class="stat-value red">${fmt(totalPay)}</div>
      </div>
    </div>

    ${pendingRequests > 0 ? `
      <div class="admin-alert" onclick="document.querySelector('.tab:nth-child(3)').click()">
        <span class="admin-alert-icon">!</span>
        <span>미처리 요청 <strong>${pendingRequests}건</strong>이 있습니다</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${totalUnpaid > 0 ? `
      <div class="admin-alert" style="border-color:rgba(239,68,68,0.3);background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))"
           onclick="document.querySelector('.tab:nth-child(6)').click()">
        <span class="admin-alert-icon" style="background:var(--red)">!</span>
        <span>미수금 <strong>${fmt(totalUnpaid)}원</strong> (${unpaidBillings.length}건)</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${activeLeads > 0 ? `
      <div class="admin-alert" style="border-color:rgba(59,130,246,0.3);background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.05))"
           onclick="document.querySelector('.tab:nth-child(5)').click()">
        <span class="admin-alert-icon" style="background:var(--accent)">!</span>
        <span>진행중 견적 <strong>${activeLeads}건</strong></span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    <div class="section-title" style="font-size:15px">최근 배정 현황</div>
    ${monthAssigns.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체</th><th>담당자</th><th>지급액</th></tr></thead>
          <tbody>${monthAssigns.slice(0, 20).map(a => {
            const comp = adminData.companies.find(c => c.id === a.company_id);
            return `<tr>
              <td>${comp?.name || '-'}</td>
              <td>${getWorkerName(a.worker_id)}</td>
              <td class="admin-pay-cell">${fmt(a.pay_amount)}원</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${monthAssigns.length > 20 ? `<p class="text-muted" style="margin-top:8px">외 ${monthAssigns.length - 20}건...</p>` : ''}
    ` : '<p class="text-muted">이 달의 배정 데이터가 없습니다.</p>'}
  `;
}

async function changeDashMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderDashboard();
}

/**
 * admin-staffpay.js - 담당자급여, 구역별 현황, AI분석 탭
 */

// ════════════════════════════════════════════════════
// 담당자급여 탭
// ════════════════════════════════════════════════════

function renderStaffPay() {
  const mc = $('mainContent');

  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);

  const payMap = {};
  monthAssigns.forEach(a => {
    if (!payMap[a.worker_id]) payMap[a.worker_id] = { total: 0, companies: 0 };
    payMap[a.worker_id].total += (a.pay_amount || 0);
    payMap[a.worker_id].companies += 1;
  });

  const rows = Object.entries(payMap)
    .map(([wid, info]) => ({ wid, name: getWorkerName(wid), ...info }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      담당자급여
      <button class="btn-sm btn-blue" onclick="exportStaffPay()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <div class="pay-summary-card">
      <div class="pay-total-label">${selectedMonth.split('-')[1]}월 인건비 합계</div>
      <div class="pay-total-amount">${fmt(grandTotal)}원</div>
      <div class="pay-total-sub">총 ${rows.length}명</div>
    </div>

    ${rows.length > 0 ? rows.map(r => {
      const pct = grandTotal > 0 ? (r.total / grandTotal * 100).toFixed(1) : 0;
      return `
        <div class="card pay-card">
          <div class="card-header">
            <div>
              <div class="card-title">${r.name}</div>
              <div class="card-subtitle">${r.companies}개 업체</div>
            </div>
            <div class="card-amount">${fmt(r.total)}원</div>
          </div>
          <div class="pay-bar-wrap">
            <div class="pay-bar" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('') : '<p class="text-muted">이 달의 급여 데이터가 없습니다.</p>'}
  `;
}

async function changePayMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderStaffPay();
}


// ════════════════════════════════════════════════════
// 구역별 현황
// ════════════════════════════════════════════════════

function renderAreaSummary() {
  const mc = $('mainContent');

  const areaMap = {};
  adminData.companies.forEach(c => {
    const area = c.area_name || '기타';
    if (!areaMap[area]) areaMap[area] = { companies: 0, totalPay: 0 };
    areaMap[area].companies += 1;

    const assigns = adminData.assignments.filter(
      a => a.company_id === c.id && a.month === selectedMonth
    );
    assigns.forEach(a => { areaMap[area].totalPay += (a.pay_amount || 0); });
  });

  const rows = Object.entries(areaMap)
    .map(([area, info]) => ({ area, ...info }))
    .sort((a, b) => b.totalPay - a.totalPay);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      구역별 현황
      <button class="btn-sm btn-blue" onclick="exportTasks()" style="font-size:11px;padding:6px 10px">📥 청소기록</button>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changeAreaMonth')}

    ${rows.map(r => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${r.area}</div>
            <div class="card-subtitle">${r.companies}개 업체</div>
          </div>
          <div class="card-amount small">${fmt(r.totalPay)}원</div>
        </div>
      </div>
    `).join('')}
  `;
}

function changeAreaMonth(month) {
  selectedMonth = month;
  renderAreaSummary();
}


// ════════════════════════════════════════════════════
// AI분석 (규칙 기반)
// ════════════════════════════════════════════════════

function renderAnalysis() {
  const mc = $('mainContent');

  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);

  const assignedCompanyIds = new Set(monthAssigns.map(a => a.company_id));
  const unassigned = adminData.companies.filter(
    c => c.status === 'active' && !assignedCompanyIds.has(c.id)
  );

  const companyPayMap = {};
  monthAssigns.forEach(a => {
    companyPayMap[a.company_id] = (companyPayMap[a.company_id] || 0) + (a.pay_amount || 0);
  });
  const highPay = Object.entries(companyPayMap)
    .filter(([, pay]) => pay > 500000)
    .map(([cid, pay]) => {
      const comp = adminData.companies.find(c => c.id === cid);
      return { name: comp?.name || '?', pay };
    })
    .sort((a, b) => b.pay - a.pay);

  const workerLoadMap = {};
  monthAssigns.forEach(a => {
    workerLoadMap[a.worker_id] = (workerLoadMap[a.worker_id] || 0) + 1;
  });
  const heavy = Object.entries(workerLoadMap)
    .filter(([, cnt]) => cnt >= 8)
    .map(([wid, cnt]) => ({ name: getWorkerName(wid), cnt }))
    .sort((a, b) => b.cnt - a.cnt);

  const pendingRequests = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at));

  const unpaidBillings = adminData.billings.filter(b => b.status !== 'paid');
  const overdueCount = adminData.billings.filter(b => b.status === 'overdue').length;

  const activeLeads = adminData.leads.filter(l => !['won','lost'].includes(l.status));
  const wonLeads = adminData.leads.filter(l => l.status === 'won');

  mc.innerHTML = `
    <div class="section-title">AI 분석</div>
    ${monthSelectorHTML(selectedMonth, 'changeAnalysisMonth')}

    <div class="analysis-card">
      <h4>⚠️ 미배정 업체 (${unassigned.length}곳)</h4>
      <p>${unassigned.length > 0
        ? unassigned.map(c => c.name).join(', ')
        : '모든 활성 업체에 직원이 배정되어 있습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💰 고액 지급 업체 (50만원 이상)</h4>
      <p>${highPay.length > 0
        ? highPay.map(h => `${h.name}: ${fmt(h.pay)}원`).join(', ')
        : '50만원 이상 지급 업체가 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>🔥 업무 과부하 직원 (8곳 이상)</h4>
      <p>${heavy.length > 0
        ? heavy.map(h => `${h.name}: ${h.cnt}곳`).join(', ')
        : '과부하 직원이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📋 미처리 요청 (${pendingRequests.length}건)</h4>
      <p>${pendingRequests.length > 0
        ? pendingRequests.slice(0, 5).map(r =>
            `${getCompanyName(r.company_id)}: ${r.content.slice(0, 30)}${r.content.length > 30 ? '...' : ''}`
          ).join(', ') + (pendingRequests.length > 5 ? ` 외 ${pendingRequests.length - 5}건` : '')
        : '모든 요청이 처리되었습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💳 미수금 현황 (${unpaidBillings.length}건${overdueCount > 0 ? ', 연체 ' + overdueCount + '건' : ''})</h4>
      <p>${unpaidBillings.length > 0
        ? unpaidBillings.slice(0, 5).map(b => {
            const amt = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `${getCompanyName(b.company_id)}(${b.month}): ${fmt(amt)}원`;
          }).join(', ') + (unpaidBillings.length > 5 ? ` 외 ${unpaidBillings.length - 5}건` : '')
        : '미수금이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📊 견적 현황 (진행중 ${activeLeads.length}건, 성공 ${wonLeads.length}건)</h4>
      <p>${activeLeads.length > 0
        ? activeLeads.slice(0, 5).map(l => {
            const st = LEAD_STATUS_MAP[l.status];
            return `${l.company_name}(${st.label})`;
          }).join(', ') + (activeLeads.length > 5 ? ` 외 ${activeLeads.length - 5}건` : '')
        : '진행중인 견적이 없습니다.'}</p>
    </div>
  `;
}

function changeAnalysisMonth(month) {
  selectedMonth = month;
  renderAnalysis();
}

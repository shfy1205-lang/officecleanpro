/**
 * admin-staffpay.js - 담당자급여, 구역별 현황, AI분석 탭
 * 3.3% 공제 계산 및 업체별 금액 수정 기능 포함
 */

// ════════════════════════════════════════════════════
// 담당자급여 탭 - 자동 계산 + 3.3% 공제
// ════════════════════════════════════════════════════

/**
 * 급여 자동 계산:
 *  1) company_financials에서 contract_amount - ocp_amount - eco_amount = workerPool
 *  2) company_workers의 share(배분율 %)로 각 작업자 급여 산출
 *     workerPool × (share / 100) = 자동 계산 급여
 *  3) share가 없으면 기존 pay_amount 사용 (fallback)
 *  4) 관리자가 수정한 pay_amount가 있으면 최종 반영값으로 사용
 */
function calcStaffPayData(month) {
  const monthAssigns = adminData.assignments.filter(a => a.month === month);
  const monthFins    = adminData.financials.filter(f => f.month === month);

  // 업체별 financial 맵
  const finMap = {};
  monthFins.forEach(f => { finMap[f.company_id] = f; });

  // 직원별 급여 집계
  const workerMap = {};

  monthAssigns.forEach(a => {
    const wid = a.worker_id;
    if (!workerMap[wid]) {
      workerMap[wid] = {
        workerId: wid,
        name: getWorkerName(wid),
        totalPay: 0,
        companies: [],
      };
    }

    const fin = finMap[a.company_id];
    const companyName = getCompanyName(a.company_id);
    let calcPay = 0;
    let method = 'manual';

    if (fin) {
      const contract = fin.contract_amount || 0;
      const ocp      = fin.ocp_amount || 0;
      const eco      = fin.eco_amount || 0;
      const workerPool = contract - ocp - eco;

      if (a.share && a.share > 0) {
        calcPay = Math.round(workerPool * a.share / 100);
        method = 'auto';
      } else {
        calcPay = a.pay_amount || 0;
        method = 'manual';
      }
    } else {
      calcPay = a.pay_amount || 0;
      method = 'manual';
    }

    // pay_amount가 직접 수정된 경우 최종 반영값으로 사용
    const finalPay = a.pay_amount || calcPay;

    workerMap[wid].totalPay += finalPay;
    workerMap[wid].companies.push({
      assignId: a.id,
      companyId: a.company_id,
      companyName: companyName,
      contract: fin ? (fin.contract_amount || 0) : 0,
      ocp: fin ? (fin.ocp_amount || 0) : 0,
      eco: fin ? (fin.eco_amount || 0) : 0,
      share: a.share || 0,
      calcPay: calcPay,
      manualPay: a.pay_amount || 0,
      finalPay: finalPay,
      method: method,
    });
  });

  const rows = Object.values(workerMap).sort((a, b) => b.totalPay - a.totalPay);
  const grandTotal = rows.reduce((s, r) => s + r.totalPay, 0);
  const avgPay = rows.length > 0 ? Math.round(grandTotal / rows.length) : 0;

  return { rows, grandTotal, avgPay };
}

/**
 * 3.3% 공제 계산
 */
function calcDeduction(totalPay) {
  const deduction = Math.round(totalPay * 0.033);
  const netPay = totalPay - deduction;
  return { deduction, netPay };
}

function renderStaffPay() {
  const mc = $('mainContent');
  const month = selectedMonth;
  const { rows, grandTotal, avgPay } = calcStaffPayData(month);
  const monthLabel = month.split('-')[1];

  // 전체 3.3% 공제 합계
  const totalDeduction = Math.round(grandTotal * 0.033);
  const totalNetPay = grandTotal - totalDeduction;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      담당자급여
      <button class="btn-sm btn-blue" onclick="exportStaffPay()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <!-- 요약 카드 5개 -->
    <div class="sp-summary-grid sp-summary-grid-5">
      <div class="stat-card">
        <div class="stat-label">${monthLabel}월 총 인건비</div>
        <div class="stat-value green">${fmt(grandTotal)}<span class="sp-unit">원</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">3.3% 공제 합계</div>
        <div class="stat-value red">${fmt(totalDeduction)}<span class="sp-unit">원</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">실지급 합계</div>
        <div class="stat-value blue">${fmt(totalNetPay)}<span class="sp-unit">원</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">직원 수</div>
        <div class="stat-value yellow">${rows.length}<span class="sp-unit">명</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 급여</div>
        <div class="stat-value" style="color:var(--text1)">${fmt(avgPay)}<span class="sp-unit">원</span></div>
      </div>
    </div>

    ${rows.length > 0 ? `
      <!-- PC 테이블 -->
      <div class="sp-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>직원명</th>
                <th>담당업체수</th>
                <th>총급여</th>
                <th>3.3% 공제액</th>
                <th>실지급액</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const { deduction, netPay } = calcDeduction(r.totalPay);
                return `<tr class="sp-row">
                  <td style="font-weight:600">${r.name}</td>
                  <td>${r.companies.length}개</td>
                  <td class="admin-pay-cell">${fmt(r.totalPay)}원</td>
                  <td style="color:var(--red)">${fmt(deduction)}원</td>
                  <td class="admin-pay-cell" style="font-weight:700">${fmt(netPay)}원</td>
                  <td>
                    <button class="btn-sm btn-blue" style="font-size:11px;padding:4px 10px"
                            onclick="openStaffPayDetail('${r.workerId}')">상세</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;background:var(--bg3)">
                <td>합계</td>
                <td>${rows.reduce((s,r) => s + r.companies.length, 0)}개</td>
                <td class="admin-pay-cell">${fmt(grandTotal)}원</td>
                <td style="color:var(--red)">${fmt(totalDeduction)}원</td>
                <td class="admin-pay-cell">${fmt(totalNetPay)}원</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="sp-cards-mobile">
        ${rows.map(r => {
          const { deduction, netPay } = calcDeduction(r.totalPay);
          return `
            <div class="card pay-card" onclick="openStaffPayDetail('${r.workerId}')" style="cursor:pointer">
              <div class="card-header">
                <div>
                  <div class="card-title">${r.name}</div>
                  <div class="card-subtitle">${r.companies.length}개 업체</div>
                </div>
                <div class="card-amount">${fmt(netPay)}원</div>
              </div>
              <div class="sp-deduction-info">
                <span>총급여 ${fmt(r.totalPay)}원</span>
                <span style="color:var(--red)">공제 ${fmt(deduction)}원</span>
              </div>
              <div class="pay-bar-wrap">
                <div class="pay-bar" style="width:${grandTotal > 0 ? (r.totalPay / grandTotal * 100).toFixed(1) : 0}%"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '<div class="empty-state"><div class="empty-icon">💰</div><p>이 달의 급여 데이터가 없습니다.</p></div>'}
  `;
}

/** 직원별 상세 모달: 업체별 급여 내역 + 3.3% + 금액 수정 */
function openStaffPayDetail(workerId) {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const worker = rows.find(r => r.workerId === workerId);
  if (!worker) return;

  const monthLabel = month.split('-')[1];
  const { deduction, netPay } = calcDeduction(worker.totalPay);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${worker.name} - ${monthLabel}월 급여 상세</h3>

    <!-- 급여 요약 카드 (3.3% 포함) -->
    <div class="sp-detail-summary">
      <div class="sp-detail-card">
        <div class="sp-detail-label">총급여</div>
        <div class="sp-detail-value">${fmt(worker.totalPay)}원</div>
      </div>
      <div class="sp-detail-card sp-detail-red">
        <div class="sp-detail-label">3.3% 공제</div>
        <div class="sp-detail-value">-${fmt(deduction)}원</div>
      </div>
      <div class="sp-detail-card sp-detail-green">
        <div class="sp-detail-label">실지급액</div>
        <div class="sp-detail-value">${fmt(netPay)}원</div>
      </div>
    </div>

    <!-- 업체별 내역 (금액 수정 가능) -->
    <div class="section-title" style="font-size:14px;margin:16px 0 8px">업체별 지급금액</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>업체명</th>
            <th>계약금액</th>
            <th>수수료</th>
            <th>배분율</th>
            <th>지급금액</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          ${worker.companies.map(c => {
            const fees = c.ocp + c.eco;
            return `<tr>
              <td style="font-weight:600">${c.companyName}</td>
              <td>${fmt(c.contract)}원</td>
              <td style="color:var(--red)">${fmt(fees)}원</td>
              <td>${c.method === 'auto'
                ? `<span class="badge badge-done">${c.share}%</span>`
                : '<span class="badge badge-area">수동</span>'
              }</td>
              <td class="admin-pay-cell">${fmt(c.finalPay)}원</td>
              <td>
                <div style="display:flex;gap:4px;align-items:center">
                  <input type="number" id="editPay_${c.assignId}" class="sp-edit-input"
                         value="${c.finalPay}" placeholder="금액">
                  <button class="btn-sm btn-green" style="font-size:10px;padding:4px 8px;white-space:nowrap"
                          onclick="savePayAmount('${c.assignId}', '${workerId}')">저장</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;background:var(--bg3)">
            <td>합계</td>
            <td></td>
            <td></td>
            <td></td>
            <td class="admin-pay-cell">${fmt(worker.totalPay)}원</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="margin-top:12px;font-size:11px;color:var(--text2);line-height:1.6">
      <strong>계산 방식:</strong> 계약금액 - 오피스수수료 - 에코수수료 = 작업자풀 → 작업자풀 × 배분율(%) = 급여<br>
      배분율 미설정 시 수동 입력 금액(pay_amount)을 사용합니다.<br>
      <strong>3.3% 공제:</strong> 총급여 × 3.3% = 공제액, 실지급액 = 총급여 - 공제액
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

/** 업체별 지급금액 저장 */
async function savePayAmount(assignId, workerId) {
  const input = $('editPay_' + assignId);
  if (!input) return;
  const newPay = parseInt(input.value) || 0;

  const { error } = await sb.from('company_workers')
    .update({ pay_amount: newPay })
    .eq('id', assignId);

  if (error) return toast(error.message, 'error');

  // 로컬 데이터 업데이트
  const local = adminData.assignments.find(a => a.id === assignId);
  if (local) local.pay_amount = newPay;

  toast('지급금액 수정됨');

  // 모달 갱신 (새 합계 반영)
  openStaffPayDetail(workerId);
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

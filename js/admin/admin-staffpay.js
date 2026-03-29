/**
 * admin-staffpay.js - 담당자급여, 구역별 현황, AI분석 탭
 * 3.3% 공제 계산, 업체별 금액 수정, 급여 확정/해제, 급여명세서 보기/다운로드 기능 포함
 */

// ════════════════════════════════════════════════════
// 담당자급여 탭 - 자동 계산 + 3.3% 공제 + 급여 확정 + 급여명세서
// ════════════════════════════════════════════════════

/**
 * 급여 자동 계산:
 *  1) company_financials에서 contract_amount - ocp_amount - eco_amount = workerPool
 *  2) company_workers의 share(배분율 %)로 각 작업자 급여 산출
 *     workerPool × (share / 100) = 자동 계산 급여
 *  3) share가 없으면 기존 pay_amount 사용 (fallback)
 *  4) 관리자가 수정한 pay_amount가 있으면 최종 반영값으로 사용
 *
 * ★ calcAssignmentFinalPay() (utils.js) 공통 함수 사용
 * ★ calcDeduction() (utils.js) 공통 함수 사용
 */
function calcStaffPayData(month) {
  const monthAssigns = adminData.assignments.filter(a => a.month === month);
  const finMap = buildFinMap(adminData.financials, month);

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

    // 공통 함수로 최종 지급액 계산 (pay_amount override 또는 auto 계산값)
    const finalPay = calcAssignmentFinalPay(a, finMap);

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

// ★ calcDeduction()은 utils.js에 공통 함수로 정의됨
// 모든 화면에서 동일한 3.3% 공제 계산을 사용

/**
 * 해당 직원의 해당 월 확정 여부 조회
 */
function isPayConfirmed(workerId, month) {
  const pc = adminData.payConfirmations.find(
    p => p.worker_id === workerId && p.month === month
  );
  return pc && pc.confirmed;
}

/**
 * 해당 월의 확정 현황 카운트
 */
function getConfirmationCounts(month, rows) {
  let confirmed = 0;
  rows.forEach(r => {
    if (isPayConfirmed(r.workerId, month)) confirmed++;
  });
  return { confirmed, total: rows.length };
}

function renderStaffPay() {
  const mc = $('mainContent');
  const month = selectedMonth;
  const { rows, grandTotal, avgPay } = calcStaffPayData(month);
  const monthLabel = month.split('-')[1];

  // 전체 3.3% 공제 합계
  const totalDeduction = Math.round(grandTotal * 0.033);
  const totalNetPay = grandTotal - totalDeduction;

  // 확정 현황
  const { confirmed: confirmedCount, total: totalWorkers } = getConfirmationCounts(month, rows);
  const allConfirmed = totalWorkers > 0 && confirmedCount === totalWorkers;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      담당자급여
      <div style="display:flex;gap:6px;align-items:center">
        ${allConfirmed ? `<button class="btn-sm btn-green" onclick="downloadAllPayslips()" style="font-size:11px;padding:6px 10px">📄 전체명세서</button>` : ''}
        <button class="btn-sm btn-blue" onclick="exportStaffPay()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
      </div>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <!-- 확정 현황 바 -->
    ${rows.length > 0 ? `
      <div class="sp-confirm-bar">
        <div class="sp-confirm-info">
          <span class="sp-confirm-status ${allConfirmed ? 'sp-confirmed' : ''}">
            ${allConfirmed ? '✅ 전체 확정 완료' : `📋 확정 ${confirmedCount}/${totalWorkers}명`}
          </span>
          ${!allConfirmed
            ? `<button class="btn-sm btn-green sp-confirm-all-btn" onclick="confirmAllPay()">전체 확정</button>`
            : `<button class="btn-sm btn-red sp-confirm-all-btn" onclick="unconfirmAllPay()">전체 해제</button>`
          }
        </div>
        <div class="sp-confirm-progress">
          <div class="sp-confirm-progress-bar" style="width:${totalWorkers > 0 ? (confirmedCount / totalWorkers * 100) : 0}%"></div>
        </div>
      </div>
    ` : ''}

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
                <th>상태</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const { deduction, netPay } = calcDeduction(r.totalPay);
                const confirmed = isPayConfirmed(r.workerId, month);
                return `<tr class="sp-row">
                  <td style="font-weight:600">${escapeHtml(r.name)}</td>
                  <td>${r.companies.length}개</td>
                  <td class="admin-pay-cell">${fmt(r.totalPay)}원</td>
                  <td style="color:var(--red)">${fmt(deduction)}원</td>
                  <td class="admin-pay-cell" style="font-weight:700">${fmt(netPay)}원</td>
                  <td>
                    ${confirmed
                      ? `<span class="badge badge-done sp-badge-confirmed" onclick="event.stopPropagation();togglePayConfirm('${r.workerId}')" style="cursor:pointer">확정됨</span>`
                      : `<span class="badge badge-warn sp-badge-pending" onclick="event.stopPropagation();togglePayConfirm('${r.workerId}')" style="cursor:pointer">미확정</span>`
                    }
                  </td>
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
          const confirmed = isPayConfirmed(r.workerId, month);
          return `
            <div class="card pay-card" onclick="openStaffPayDetail('${r.workerId}')" style="cursor:pointer">
              <div class="card-header">
                <div>
                  <div class="card-title">
                    ${escapeHtml(r.name)}
                    ${confirmed
                      ? '<span class="badge badge-done" style="margin-left:6px;font-size:10px">확정</span>'
                      : '<span class="badge badge-warn" style="margin-left:6px;font-size:10px">미확정</span>'
                    }
                  </div>
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

/** 개별 직원 급여 확정/해제 토글 */
async function togglePayConfirm(workerId) {
  try {
  const month = selectedMonth;
  const current = isPayConfirmed(workerId, month);

  if (current) {
    // 확정 해제
    const { error } = await sb.from('pay_confirmations')
      .update({ confirmed: false, confirmed_at: null })
      .eq('worker_id', workerId)
      .eq('month', month);
    if (error) return toast(error.message, 'error');

    const local = adminData.payConfirmations.find(p => p.worker_id === workerId && p.month === month);
    if (local) { local.confirmed = false; local.confirmed_at = null; }

    toast(getWorkerName(workerId) + ' 급여 확정 해제');
  } else {
    // 확정 처리 (upsert)
    const { data, error } = await sb.from('pay_confirmations')
      .upsert({
        month: month,
        worker_id: workerId,
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: currentWorker.id,
      }, { onConflict: 'month,worker_id' })
      .select();
    if (error) return toast(error.message, 'error');

    // 로컬 데이터 업데이트
    const idx = adminData.payConfirmations.findIndex(p => p.worker_id === workerId && p.month === month);
    if (idx >= 0) {
      adminData.payConfirmations[idx] = data[0];
    } else {
      adminData.payConfirmations.push(data[0]);
    }

    toast(getWorkerName(workerId) + ' 급여 확정됨');
  }

  renderStaffPay();

  } catch (e) {
    console.error('togglePayConfirm error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

/** 전체 확정 */
async function confirmAllPay() {
  try {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const unconfirmed = rows.filter(r => !isPayConfirmed(r.workerId, month));

  if (unconfirmed.length === 0) return toast('이미 전체 확정됨');

  const upsertData = unconfirmed.map(r => ({
    month: month,
    worker_id: r.workerId,
    confirmed: true,
    confirmed_at: new Date().toISOString(),
    confirmed_by: currentWorker.id,
  }));

  const { data, error } = await sb.from('pay_confirmations')
    .upsert(upsertData, { onConflict: 'month,worker_id' })
    .select();
  if (error) return toast(error.message, 'error');

  // 로컬 데이터 업데이트
  (data || []).forEach(d => {
    const idx = adminData.payConfirmations.findIndex(p => p.worker_id === d.worker_id && p.month === d.month);
    if (idx >= 0) {
      adminData.payConfirmations[idx] = d;
    } else {
      adminData.payConfirmations.push(d);
    }
  });

  toast(`${unconfirmed.length}명 급여 전체 확정됨`);
  renderStaffPay();

  } catch (e) {
    console.error('confirmAllPay error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

/** 전체 해제 */
async function unconfirmAllPay() {
  try {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const confirmedRows = rows.filter(r => isPayConfirmed(r.workerId, month));

  if (confirmedRows.length === 0) return toast('확정된 항목 없음');

  const workerIds = confirmedRows.map(r => r.workerId);

  const { error } = await sb.from('pay_confirmations')
    .update({ confirmed: false, confirmed_at: null })
    .eq('month', month)
    .in('worker_id', workerIds);
  if (error) return toast(error.message, 'error');

  // 로컬 데이터 업데이트
  adminData.payConfirmations.forEach(p => {
    if (p.month === month && workerIds.includes(p.worker_id)) {
      p.confirmed = false;
      p.confirmed_at = null;
    }
  });

  toast(`${confirmedRows.length}명 급여 확정 해제됨`);
  renderStaffPay();

  } catch (e) {
    console.error('unconfirmAllPay error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

/** 직원별 상세 모달: 업체별 급여 내역 + 3.3% + 금액 수정 + 확정 상태 + 명세서 다운로드 */
function openStaffPayDetail(workerId) {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const worker = rows.find(r => r.workerId === workerId);
  if (!worker) return;

  const monthLabel = month.split('-')[1];
  const { deduction, netPay } = calcDeduction(worker.totalPay);
  const confirmed = isPayConfirmed(workerId, month);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHtml(worker.name)} - ${monthLabel}월 급여 상세</h3>

    <!-- 확정 상태 표시 + 토글 버튼 + 다운로드 -->
    <div class="sp-confirm-detail-bar">
      ${confirmed
        ? `<span class="sp-confirm-badge sp-confirmed">✅ 급여 확정됨</span>
           <div style="display:flex;gap:6px;align-items:center">
             <button class="btn-sm btn-blue" style="font-size:11px;padding:4px 10px" onclick="downloadPayslipExcel('${workerId}')">📥 엑셀</button>
             <button class="btn-sm" style="font-size:11px;padding:4px 10px;background:var(--bg3);color:var(--text)" onclick="downloadPayslipPDF('${workerId}')">📄 PDF</button>
             <button class="btn-sm btn-red" style="font-size:11px;padding:4px 10px" onclick="togglePayConfirm('${workerId}');closeModal();">확정 해제</button>
           </div>`
        : `<span class="sp-confirm-badge sp-pending">⏳ 미확정</span>
           <button class="btn-sm btn-green" style="font-size:11px;padding:4px 10px" onclick="togglePayConfirm('${workerId}');closeModal();">급여 확정</button>`
      }
    </div>

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

    <!-- 업체별 내역 (확정 시 수정 불가) -->
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
            ${!confirmed ? '<th>수정</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${worker.companies.map(c => {
            const fees = c.ocp + c.eco;
            return `<tr>
              <td style="font-weight:600">${escapeHtml(c.companyName)}</td>
              <td>${fmt(c.contract)}원</td>
              <td style="color:var(--red)">${fmt(fees)}원</td>
              <td>${c.method === 'auto'
                ? `<span class="badge badge-done">${c.share}%</span>`
                : '<span class="badge badge-area">수동</span>'
              }</td>
              <td class="admin-pay-cell">${fmt(c.finalPay)}원</td>
              ${!confirmed ? `<td>
                <div style="display:flex;gap:4px;align-items:center">
                  <input type="number" id="editPay_${c.assignId}" class="sp-edit-input"
                         value="${c.finalPay}" placeholder="금액">
                  <button class="btn-sm btn-green" style="font-size:10px;padding:4px 8px;white-space:nowrap"
                          onclick="savePayAmount('${c.assignId}', '${workerId}')">저장</button>
                </div>
              </td>` : ''}
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
            ${!confirmed ? '<td></td>' : ''}
          </tr>
        </tfoot>
      </table>
    </div>

    ${confirmed ? `
      <div style="margin-top:12px;padding:10px 14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px;color:var(--green)">
        🔒 급여가 확정되어 금액을 수정할 수 없습니다. 수정하려면 확정을 해제하세요.
      </div>
    ` : ''}

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
  try {
  const input = $('editPay_' + assignId);
  if (!input) return;
  const newPay = parseInt(input.value, 10) || 0;
  if (newPay < 0) return toast('지급금액은 0 이상이어야 합니다', 'error');
  if (newPay > 99999999) return toast('지급금액이 너무 큽니다', 'error');

  // 변경 이력용 이전값 저장
  const local = adminData.assignments.find(a => a.id === assignId);
  const oldPay = local ? (local.pay_amount || 0) : 0;

  const { error } = await sb.from('company_workers')
    .update({ pay_amount: newPay })
    .eq('id', assignId);

  if (error) return toast(error.message, 'error');

  // 변경 이력 로그
  if (oldPay !== newPay) {
    const companyName = local ? getCompanyName(local.company_id) : '';
    const workerName = getWorkerName(workerId);
    await logChange('company_workers', assignId, 'update',
      [{ field: 'pay_amount', oldVal: oldPay, newVal: newPay }],
      `${workerName} - ${companyName} (${selectedMonth}) 지급금액 수정`
    );
  }

  // 로컬 데이터 업데이트
  if (local) local.pay_amount = newPay;

  toast('지급금액 수정됨');

  // 모달 갱신 (새 합계 반영)
  openStaffPayDetail(workerId);

  } catch (e) {
    console.error('savePayAmount error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function changePayMonth(month) {
  try {
  selectedMonth = month;
  await ensureMonthData(month);
  renderStaffPay();

  } catch (e) {
    console.error('changePayMonth error:', e);
    toast('오류가 발생했습니다', 'error');
  }}


// ════════════════════════════════════════════════════
// 급여명세서 다운로드 (관리자)
// ════════════════════════════════════════════════════

/** 개별 직원 급여명세서 엑셀 다운로드 */
function downloadPayslipExcel(workerId) {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const worker = rows.find(r => r.workerId === workerId);
  if (!worker) return toast('급여 데이터를 찾을 수 없습니다', 'error');

  if (!isPayConfirmed(workerId, month)) {
    return toast('급여가 확정된 후에만 명세서를 다운로드할 수 있습니다', 'error');
  }

  const { deduction, netPay } = calcDeduction(worker.totalPay);

  // 시트1: 급여 요약
  const summaryHeaders = ['항목', '금액'];
  const summaryRows = [
    ['직원명', worker.name],
    ['대상 월', month],
    ['담당 업체 수', worker.companies.length + '개'],
    ['총급여', worker.totalPay],
    ['3.3% 공제액', deduction],
    ['실지급액', netPay],
  ];

  // 시트2: 업체별 지급내역
  const detailHeaders = ['업체명', '지급금액(원)'];
  const detailRows = worker.companies.map(c => [c.companyName, c.finalPay]);
  detailRows.push(['합계', worker.totalPay]);

  downloadExcelMultiSheet(
    `급여명세_${worker.name}_${month}.xlsx`,
    [
      { name: '급여요약', headers: summaryHeaders, rows: summaryRows, colWidths: [16, 16] },
      { name: '업체별내역', headers: detailHeaders, rows: detailRows, colWidths: [20, 16] },
    ]
  );
}

/** 개별 직원 급여명세서 PDF 다운로드 */
function downloadPayslipPDF(workerId) {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const worker = rows.find(r => r.workerId === workerId);
  if (!worker) return toast('급여 데이터를 찾을 수 없습니다', 'error');

  if (!isPayConfirmed(workerId, month)) {
    return toast('급여가 확정된 후에만 명세서를 다운로드할 수 있습니다', 'error');
  }

  const { deduction, netPay } = calcDeduction(worker.totalPay);

  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    toast('PDF 라이브러리를 불러오지 못했습니다. 엑셀 다운로드를 이용해주세요.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 한글 폰트 미지원 시 기본 폰트 사용 → 한글 깨짐 방지를 위해 유니코드 지원
  // jsPDF 기본 폰트는 한글 미지원이므로, HTML 캔버스 방식 대신 텍스트 기반으로 생성
  // 한글 깨짐 이슈를 최소화하기 위해 표 형태의 간결한 레이아웃 사용

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // 제목
  doc.setFontSize(16);
  doc.text(`Pay Statement - ${month}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // 기본 정보
  doc.setFontSize(11);
  doc.text(`Employee: ${worker.name}`, 20, y); y += 7;
  doc.text(`Period: ${month}`, 20, y); y += 7;
  doc.text(`Companies: ${worker.companies.length}`, 20, y); y += 10;

  // 급여 요약
  doc.setFontSize(12);
  doc.text('Payment Summary', 20, y); y += 8;

  doc.setFontSize(10);
  doc.text(`Total Pay: ${fmt(worker.totalPay)} KRW`, 25, y); y += 6;
  doc.text(`Tax (3.3%): -${fmt(deduction)} KRW`, 25, y); y += 6;
  doc.text(`Net Pay: ${fmt(netPay)} KRW`, 25, y); y += 10;

  // 업체별 내역 테이블
  doc.setFontSize(12);
  doc.text('Company Details', 20, y); y += 8;

  // 테이블 헤더
  doc.setFontSize(9);
  doc.setDrawColor(100);
  doc.line(20, y, pageWidth - 20, y);
  y += 5;
  doc.text('Company', 25, y);
  doc.text('Amount (KRW)', pageWidth - 55, y, { align: 'right' });
  y += 3;
  doc.line(20, y, pageWidth - 20, y);
  y += 5;

  // 테이블 행
  worker.companies.forEach(c => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(c.companyName, 25, y);
    doc.text(fmt(c.finalPay), pageWidth - 55, y, { align: 'right' });
    y += 6;
  });

  // 합계
  doc.line(20, y, pageWidth - 20, y);
  y += 5;
  doc.setFontSize(10);
  doc.text('Total', 25, y);
  doc.text(fmt(worker.totalPay), pageWidth - 55, y, { align: 'right' });

  doc.save(`급여명세_${worker.name}_${month}.pdf`);
  toast(`급여명세_${worker.name}_${month}.pdf 다운로드 완료`);
}

/** 전체 직원 급여명세서 일괄 엑셀 다운로드 (확정된 직원만) */
function downloadAllPayslips() {
  const month = selectedMonth;
  const { rows } = calcStaffPayData(month);
  const confirmedRows = rows.filter(r => isPayConfirmed(r.workerId, month));

  if (confirmedRows.length === 0) {
    return toast('확정된 급여가 없습니다', 'error');
  }

  const sheets = confirmedRows.map(worker => {
    const { deduction, netPay } = calcDeduction(worker.totalPay);

    const headers = ['항목', '내용'];
    const dataRows = [
      ['직원명', worker.name],
      ['대상 월', month],
      ['담당 업체 수', worker.companies.length + '개'],
      ['', ''],
      ['── 업체별 지급내역 ──', ''],
    ];

    worker.companies.forEach(c => {
      dataRows.push([c.companyName, c.finalPay]);
    });

    dataRows.push(['', '']);
    dataRows.push(['총급여', worker.totalPay]);
    dataRows.push(['3.3% 공제액', deduction]);
    dataRows.push(['실지급액', netPay]);

    return {
      name: worker.name,
      headers: headers,
      rows: dataRows,
      colWidths: [20, 16],
    };
  });

  downloadExcelMultiSheet(`급여명세_전체_${month}.xlsx`, sheets);
}


// ════════════════════════════════════════════════════
// 구역별 현황
// ════════════════════════════════════════════════════

function renderAreaSummary() {
  const mc = $('mainContent');
  const finMap = buildFinMap(adminData.financials, selectedMonth);

  const areaMap = {};
  adminData.companies.forEach(c => {
            if (c.status === 'paused') return;
                    if (c.status === 'terminated') {
                                  if (!c.terminated_at) return;
                                              const termMonth = c.terminated_at.substring(0, 7);
                                                          if (selectedMonth > termMonth) return;
                    }
    const area = c.area_name || '기타';
    if (!areaMap[area]) areaMap[area] = { companies: 0, totalPay: 0 };
    areaMap[area].companies += 1;

    const assigns = adminData.assignments.filter(
      a => a.company_id === c.id && a.month === selectedMonth
    );
    assigns.forEach(a => { areaMap[area].totalPay += calcAssignmentFinalPay(a, finMap); });
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
            <div class="card-title">${escapeHtml(r.area)}</div>
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

  const finMap = buildFinMap(adminData.financials, selectedMonth);
  const companyPayMap = {};
  monthAssigns.forEach(a => {
    companyPayMap[a.company_id] = (companyPayMap[a.company_id] || 0) + calcAssignmentFinalPay(a, finMap);
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
        ? unassigned.map(c => escapeHtml(c.name)).join(', ')
        : '모든 활성 업체에 직원이 배정되어 있습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💰 고액 지급 업체 (50만원 이상)</h4>
      <p>${highPay.length > 0
        ? highPay.map(h => `${escapeHtml(h.name)}: ${fmt(h.pay)}원`).join(', ')
        : '50만원 이상 지급 업체가 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>🔥 업무 과부하 직원 (8곳 이상)</h4>
      <p>${heavy.length > 0
        ? heavy.map(h => `${escapeHtml(h.name)}: ${h.cnt}곳`).join(', ')
        : '과부하 직원이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📋 미처리 요청 (${pendingRequests.length}건)</h4>
      <p>${pendingRequests.length > 0
        ? pendingRequests.slice(0, 5).map(r =>
            `${escapeHtml(getCompanyName(r.company_id))}: ${escapeHtml(r.content.slice(0, 30))}${r.content.length > 30 ? '...' : ''}`
          ).join(', ') + (pendingRequests.length > 5 ? ` 외 ${pendingRequests.length - 5}건` : '')
        : '모든 요청이 처리되었습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💳 미수금 현황 (${unpaidBillings.length}건${overdueCount > 0 ? ', 연체 ' + overdueCount + '건' : ''})</h4>
      <p>${unpaidBillings.length > 0
        ? unpaidBillings.slice(0, 5).map(b => {
            const amt = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `${escapeHtml(getCompanyName(b.company_id))}(${b.month}): ${fmt(amt)}원`;
          }).join(', ') + (unpaidBillings.length > 5 ? ` 외 ${unpaidBillings.length - 5}건` : '')
        : '미수금이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📊 견적 현황 (진행중 ${activeLeads.length}건, 성공 ${wonLeads.length}건)</h4>
      <p>${activeLeads.length > 0
        ? activeLeads.slice(0, 5).map(l => {
            const st = LEAD_STATUS_MAP[l.status];
            return `${escapeHtml(l.company_name)}(${st.label})`;
          }).join(', ') + (activeLeads.length > 5 ? ` 외 ${activeLeads.length - 5}건` : '')
        : '진행중인 견적이 없습니다.'}</p>
    </div>
  `;
}

function changeAnalysisMonth(month) {
  selectedMonth = month;
  renderAnalysis();
}

/**
 * staff-pay.js - 내 급여 탭
 * 총급여, 3.3% 공제액, 실지급액 표시
 * 업체별 지급금액 목록
 * 급여 확정 상태 표시
 * 급여명세서 다운로드 (엑셀/PDF)
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
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      내 급여
      ${confirmed ? `
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn-sm btn-blue" onclick="downloadMyPayslipExcel()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
          <button class="btn-sm" onclick="downloadMyPayslipPDF()" style="font-size:11px;padding:6px 10px;background:var(--bg3);color:var(--text)">📄 PDF</button>
        </div>
      ` : ''}
    </div>
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


// ════════════════════════════════════════════════════
// 직원 급여명세서 다운로드
// ════════════════════════════════════════════════════

/** 내 급여명세서 엑셀 다운로드 */
function downloadMyPayslipExcel() {
  const month = selectedMonth;
  if (!isMyPayConfirmed(month)) {
    return toast('급여가 확정된 후에만 명세서를 다운로드할 수 있습니다', 'error');
  }

  const assigns = getMonthAssignments(month);
  const totalPay = assigns.reduce((sum, a) => sum + (a.pay_amount || 0), 0);
  const deduction = Math.round(totalPay * 0.033);
  const netPay = totalPay - deduction;

  if (typeof XLSX === 'undefined') {
    toast('엑셀 라이브러리를 불러오지 못했습니다', 'error');
    return;
  }

  // 시트1: 급여 요약
  const summaryHeaders = ['항목', '금액'];
  const summaryRows = [
    ['직원명', currentWorker.name],
    ['대상 월', month],
    ['담당 업체 수', assigns.length + '개'],
    ['총급여', totalPay],
    ['3.3% 공제액', deduction],
    ['실지급액', netPay],
  ];

  // 시트2: 업체별 지급내역
  const detailHeaders = ['업체명', '구역', '지급금액(원)'];
  const detailRows = assigns
    .sort((a, b) => (b.pay_amount || 0) - (a.pay_amount || 0))
    .map(a => {
      const comp = getCompanyById(a.company_id);
      return [comp?.name || '-', comp?.area_name || '', a.pay_amount || 0];
    });
  detailRows.push(['합계', '', totalPay]);

  // 엑셀 생성
  const wb = XLSX.utils.book_new();

  const sumData = [summaryHeaders, ...summaryRows];
  const ws1 = XLSX.utils.aoa_to_sheet(sumData);
  ws1['!cols'] = [{ wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, '급여요약');

  const detData = [detailHeaders, ...detailRows];
  const ws2 = XLSX.utils.aoa_to_sheet(detData);
  ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, '업체별내역');

  const filename = `급여명세_${currentWorker.name}_${month}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`${filename} 다운로드 완료`);
}

/** 내 급여명세서 PDF 다운로드 */
function downloadMyPayslipPDF() {
  const month = selectedMonth;
  if (!isMyPayConfirmed(month)) {
    return toast('급여가 확정된 후에만 명세서를 다운로드할 수 있습니다', 'error');
  }

  const assigns = getMonthAssignments(month);
  const totalPay = assigns.reduce((sum, a) => sum + (a.pay_amount || 0), 0);
  const deduction = Math.round(totalPay * 0.033);
  const netPay = totalPay - deduction;

  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    toast('PDF 라이브러리를 불러오지 못했습니다. 엑셀 다운로드를 이용해주세요.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // 제목
  doc.setFontSize(16);
  doc.text(`Pay Statement - ${month}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // 기본 정보
  doc.setFontSize(11);
  doc.text(`Employee: ${currentWorker.name}`, 20, y); y += 7;
  doc.text(`Period: ${month}`, 20, y); y += 7;
  doc.text(`Companies: ${assigns.length}`, 20, y); y += 10;

  // 급여 요약
  doc.setFontSize(12);
  doc.text('Payment Summary', 20, y); y += 8;

  doc.setFontSize(10);
  doc.text(`Total Pay: ${fmt(totalPay)} KRW`, 25, y); y += 6;
  doc.text(`Tax (3.3%): -${fmt(deduction)} KRW`, 25, y); y += 6;
  doc.text(`Net Pay: ${fmt(netPay)} KRW`, 25, y); y += 10;

  // 업체별 내역 테이블
  doc.setFontSize(12);
  doc.text('Company Details', 20, y); y += 8;

  doc.setFontSize(9);
  doc.setDrawColor(100);
  doc.line(20, y, pageWidth - 20, y);
  y += 5;
  doc.text('Company', 25, y);
  doc.text('Amount (KRW)', pageWidth - 55, y, { align: 'right' });
  y += 3;
  doc.line(20, y, pageWidth - 20, y);
  y += 5;

  const sorted = [...assigns].sort((a, b) => (b.pay_amount || 0) - (a.pay_amount || 0));
  sorted.forEach(a => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const comp = getCompanyById(a.company_id);
    doc.text(comp?.name || '-', 25, y);
    doc.text(fmt(a.pay_amount || 0), pageWidth - 55, y, { align: 'right' });
    y += 6;
  });

  // 합계
  doc.line(20, y, pageWidth - 20, y);
  y += 5;
  doc.setFontSize(10);
  doc.text('Total', 25, y);
  doc.text(fmt(totalPay), pageWidth - 55, y, { align: 'right' });

  const filename = `급여명세_${currentWorker.name}_${month}.pdf`;
  doc.save(filename);
  toast(`${filename} 다운로드 완료`);
}

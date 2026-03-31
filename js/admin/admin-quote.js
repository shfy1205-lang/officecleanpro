/**
 * admin-quote.js - 견적서 생성기
 * 양식 기반으로 견적서를 작성하고 엑셀/이미지/PDF로 내보내기
 */

const QUOTE_WORK_ITEMS = [
  '실내 내부바닥 기본청소 진행 후 약품청소_친환경세제(바닥코딩보호) 도포',
  '종량제,재활용 쓰레기 분리수거',
  '회의실 탁자 및 청소',
  '탕비실 청소',
  '개인쓰레기통 비우기',
  '개인사무실 탁자 및 바닥 청소',
  '벌레 제거',
  '선반 먼지 제거',
  '문 유리 닦기',
  '식물 물주기',
  '파쇄기 비우기',
  '창틀 먼지 제거',
];

const SUPPLIER_INFO = {
  bizNum: '812-05-03268',
  companyName: '오피스클린프로',
  ceo: '이경운',
  bizType: '사업시설 관리 서비스업',
  bizItem: '건축물 일반 청소업',
  phone: '010-8158-7873',
  manager: '김준희',
};

let _quotePreviewDebounce = null; // 미리보기 debounce 타이머

function debouncedQuotePreview() {
  clearTimeout(_quotePreviewDebounce);
  _quotePreviewDebounce = setTimeout(() => updateQuotePreview(), 150);
}

function renderQuote() {
  const mc = $('mainContent');
  const lead = pendingQuoteLead;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      견적서 생성
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${lead ? `<button class="btn-sm" onclick="saveQuoteToLead()" style="font-size:11px;padding:6px 12px;background:var(--orange);color:#fff">💾 견적 저장</button>` : ''}
        <button class="btn-sm btn-blue" onclick="exportQuoteExcel()" style="font-size:11px;padding:6px 10px">📊 엑셀</button>
        <button class="btn-sm btn-green" onclick="exportQuoteImage()" style="font-size:11px;padding:6px 10px">🖼️ 이미지</button>
        <button class="btn-sm" onclick="exportQuotePDF()" style="font-size:11px;padding:6px 10px;background:var(--red);color:#fff">📄 PDF</button>
      </div>
    </div>

    ${lead ? `
    <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;color:var(--primary)">📋 <strong>${escapeHtml(lead.clientName)}</strong> 견적서 작성 중</span>
      <button class="btn-sm" style="font-size:11px;padding:4px 10px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)" onclick="clearQuoteLead()">✕ 연동 해제</button>
    </div>
    ` : ''}

    <!-- 입력 폼 -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <h3 style="margin:0 0 12px;font-size:14px;color:var(--primary)">기본 정보</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:12px;color:var(--text-muted)">수신 업체명 (님 귀하)</label>
          <input id="qClientName" class="input" placeholder="예: 법무법인 마스트" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">주소</label>
          <input id="qAddress" class="input" placeholder="업체 주소" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">견적 날짜</label>
          <input id="qDate" type="date" class="input" value="${today()}" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">횟수</label>
          <input id="qFrequency" class="input" placeholder="예: 주1회" value="주1회" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">규격</label>
          <input id="qSpec" class="input" placeholder="예: 사무실전체" value="사무실전체" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">공급가액 (VAT 별도)</label>
          <input id="qAmount" type="number" class="input" placeholder="예: 272727" style="margin-top:4px" oninput="debouncedQuotePreview()">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">견적유효기간 (일)</label>
          <input id="qValidDays" class="input" placeholder="예: 30" value="30" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">기타사항</label>
          <input id="qEtcNote" class="input" placeholder="기타사항 입력" style="margin-top:4px">
        </div>
      </div>
    </div>

    <!-- 작업내용 체크 -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <h3 style="margin:0 0 12px;font-size:14px;color:var(--primary)">작업내용 선택</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="qWorkItems">
        ${QUOTE_WORK_ITEMS.map((item, i) => `
          <label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;cursor:pointer;padding:4px 0">
            <input type="checkbox" class="qWorkCheck" data-index="${i}" checked style="margin-top:2px">
            <span>${i + 1}. ${escapeHtml(item)}</span>
          </label>
        `).join('')}
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px;margin-top:4px">
          <span style="font-size:12px;white-space:nowrap">13. 기타:</span>
          <input id="qWorkEtc1" class="input" placeholder="직접 입력" style="font-size:12px;flex:1">
        </div>
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;white-space:nowrap">14. 기타:</span>
          <input id="qWorkEtc2" class="input" placeholder="직접 입력" style="font-size:12px;flex:1">
        </div>
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;white-space:nowrap">15. 기타:</span>
          <input id="qWorkEtc3" class="input" placeholder="직접 입력" style="font-size:12px;flex:1">
        </div>
      </div>
    </div>

    <!-- 미리보기 -->
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <h3 style="margin:0;padding:12px 16px;font-size:14px;color:var(--primary);border-bottom:1px solid var(--border)">미리보기</h3>
      <div style="padding:16px;overflow-x:auto">
        <div id="quotePreview"></div>
      </div>
    </div>
  `;

  updateQuotePreview();

  // 견적관리 연동: lead 데이터 자동 입력
  if (lead) {
    setTimeout(() => {
      if ($('qClientName')) $('qClientName').value = lead.clientName || '';
      if ($('qAddress')) $('qAddress').value = lead.address || '';
      if ($('qFrequency')) $('qFrequency').value = lead.frequency || '주1회';
      if ($('qSpec')) $('qSpec').value = lead.spec || '사무실전체';
      if ($('qAmount') && lead.amount) $('qAmount').value = lead.amount;

      // 작업내용 체크박스 매칭
      if (lead.quoteWorkItems && lead.quoteWorkItems.length > 0) {
        // 저장된 견적서 작업내용이 있으면 그것 사용
        document.querySelectorAll('.qWorkCheck').forEach(cb => cb.checked = false);
        lead.quoteWorkItems.forEach(savedItem => {
          const idx = QUOTE_WORK_ITEMS.findIndex(q => q === savedItem);
          if (idx >= 0) {
            const cb = document.querySelector(`.qWorkCheck[data-index="${idx}"]`);
            if (cb) cb.checked = true;
          }
        });
      }

      updateQuotePreview();
    }, 50);
  }
}

function getQuoteFormData() {
  const amount = parseInt($('qAmount')?.value) || 0;
  const tax = Math.ceil(amount * 0.1);
  const total = amount + tax;

  const checkedItems = [];
  document.querySelectorAll('.qWorkCheck:checked').forEach(cb => {
    checkedItems.push(QUOTE_WORK_ITEMS[parseInt(cb.dataset.index)]);
  });
  for (let i = 1; i <= 3; i++) {
    const etcVal = ($('qWorkEtc' + i)?.value || '').trim();
    if (etcVal) checkedItems.push(etcVal);
  }

  return {
    clientName: $('qClientName')?.value || '',
    address: $('qAddress')?.value || '',
    date: $('qDate')?.value || today(),
    frequency: $('qFrequency')?.value || '주1회',
    spec: $('qSpec')?.value || '사무실전체',
    amount,
    tax,
    total,
    validDays: $('qValidDays')?.value || '30',
    etcNote: $('qEtcNote')?.value || '',
    workItems: checkedItems,
  };
}

function numberToKorean(num) {
  if (!num || num === 0) return '영';
  const units = ['', '만', '억', '조'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const subUnits = ['', '십', '백', '천'];
  let result = '';
  let unitIdx = 0;
  while (num > 0) {
    let part = num % 10000;
    if (part > 0) {
      let partStr = '';
      let subIdx = 0;
      while (part > 0) {
        const d = part % 10;
        if (d > 0) {
          partStr = digits[d] + subUnits[subIdx] + partStr;
        }
        part = Math.floor(part / 10);
        subIdx++;
      }
      result = partStr + units[unitIdx] + result;
    }
    num = Math.floor(num / 10000);
    unitIdx++;
  }
  return result;
}

function updateQuotePreview() {
  const d = getQuoteFormData();
  const koreanAmount = numberToKorean(d.total);

  const workContent = d.workItems.length > 0
    ? d.workItems.map((item, i) => `- ${item}`).join('\n')
    : '';

  const previewEl = document.getElementById('quotePreview');
  if (!previewEl) return;

  previewEl.innerHTML = `
    <div id="quotePrintArea" style="
      width:720px;
      background:#fff;
      color:#000;
      font-family:'맑은 고딕','Noto Sans KR',sans-serif;
      font-size:12px;
      padding:40px 36px;
      box-sizing:border-box;
    ">
      <!-- 제목 -->
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="font-size:28px;font-weight:700;letter-spacing:12px;margin:0;color:#000">견 적 서</h1>
      </div>

      <!-- 상단: 날짜+수신 / 공급자 -->
      <div style="display:flex;gap:16px;margin-bottom:16px">
        <!-- 왼쪽: 수신 -->
        <div style="flex:1">
          <div style="font-size:12px;color:#666;margin-bottom:8px">${escapeHtml(d.date)}</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:2px">
            ${escapeHtml(d.clientName || '(업체명)')}
            <span style="font-size:12px;font-weight:400;color:#666"> 님 귀하</span>
          </div>
          ${d.address ? `<div style="font-size:11px;color:#666">${escapeHtml(d.address)}</div>` : ''}
          <div style="font-size:12px;margin-top:12px">아래와 같이 견적합니다.</div>
        </div>
        <!-- 오른쪽: 공급자 -->
        <div style="flex:1">
          <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed">
            <colgroup>
              <col style="width:28px">
              <col style="width:52px">
              <col style="width:auto">
              <col style="width:42px">
              <col style="width:90px">
            </colgroup>
            <tr>
              <td rowspan="4" style="border:1px solid #333;text-align:center;padding:4px 2px;font-size:11px;background:#f8f8f8;vertical-align:middle;letter-spacing:6px;word-break:keep-all">공<br>급<br>자</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">등록번호</td>
              <td colspan="3" style="border:1px solid #333;padding:4px 6px">${SUPPLIER_INFO.bizNum}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">상호</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap">${SUPPLIER_INFO.companyName}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">성명</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap;position:relative">${SUPPLIER_INFO.ceo} ${getStampHTML()}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">업태</td>
              <td style="border:1px solid #333;padding:4px 6px;font-size:10px">${SUPPLIER_INFO.bizType}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">종목</td>
              <td style="border:1px solid #333;padding:4px 6px;font-size:10px">${SUPPLIER_INFO.bizItem}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">연락처</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap">${SUPPLIER_INFO.phone}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">담당자</td>
              <td style="border:1px solid #333;padding:4px 6px">${SUPPLIER_INFO.manager}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 합계 금액 -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px">
        <tr style="border:2px solid #333;background:#f0f0f0">
          <td style="border:2px solid #333;padding:10px;text-align:center;font-weight:700;width:100px">합 계 금 액</td>
          <td style="border:2px solid #333;padding:10px;text-align:center;font-weight:700;width:50px">일금</td>
          <td style="border:2px solid #333;padding:10px;text-align:center;font-size:11px">${koreanAmount}원정</td>
          <td style="border:2px solid #333;padding:10px;text-align:right;font-weight:700;font-size:16px;width:160px">${fmt(d.total)}원</td>
        </tr>
      </table>

      <!-- 품목 테이블 -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:12px">
        <thead>
          <tr style="border:1px solid #333;background:#f8f8f8">
            <th style="border:1px solid #333;padding:6px;width:15%">품명</th>
            <th style="border:1px solid #333;padding:6px;width:15%">규격</th>
            <th style="border:1px solid #333;padding:6px;width:12%">횟수</th>
            <th style="border:1px solid #333;padding:6px;width:20%">공급가액</th>
            <th style="border:1px solid #333;padding:6px;width:18%">세액</th>
            <th style="border:1px solid #333;padding:6px;width:20%">비고</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border:1px solid #333">
            <td style="border:1px solid #333;padding:6px;text-align:center">정기청소</td>
            <td style="border:1px solid #333;padding:6px;text-align:center">${escapeHtml(d.spec)}</td>
            <td style="border:1px solid #333;padding:6px;text-align:center">${escapeHtml(d.frequency)}</td>
            <td style="border:1px solid #333;padding:6px;text-align:right">${fmt(d.amount)}</td>
            <td style="border:1px solid #333;padding:6px;text-align:right">${fmt(d.tax)}</td>
            <td style="border:1px solid #333;padding:6px;text-align:center"></td>
          </tr>
          <tr style="border:1px solid #333;background:#f8f8f8">
            <td colspan="3" style="border:1px solid #333;padding:6px;text-align:center;font-weight:700">합 계</td>
            <td style="border:1px solid #333;padding:6px;text-align:right;font-weight:700">${fmt(d.amount)}</td>
            <td style="border:1px solid #333;padding:6px;text-align:right;font-weight:700">${fmt(d.tax)}</td>
            <td style="border:1px solid #333;padding:6px"></td>
          </tr>
        </tbody>
      </table>

      <!-- 상세사항 -->
      <div style="border:1px solid #333;border-top:none;padding:14px;min-height:200px;white-space:pre-line;font-size:11px;line-height:1.7">
<strong>상세사항</strong>

<strong>청소 범위</strong>
1. 작업일정
- ${escapeHtml(d.frequency)} 사무실 내부청소

2. 작업내용
${workContent ? workContent.split('\n').map(l => escapeHtml(l)).join('\n') : '(선택된 작업내용 없음)'}
      </div>
    </div>
  `;
}


// ════════════════════════════════════════════════════
// 도장 이미지 (실제 인감 이미지 사용)
// ════════════════════════════════════════════════════

function getStampHTML() {
  return `<img src="assets/stamp.png" alt="인감" style="width:40px;height:40px;opacity:0.85;vertical-align:middle;position:absolute;top:50%;right:2px;transform:translateY(-50%)">`;
}

// ════════════════════════════════════════════════════
// 엑셀 내보내기 (원본 양식 템플릿 기반, ExcelJS)
// ════════════════════════════════════════════════════

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function exportQuoteExcel() {
  const d = getQuoteFormData();
  if (!d.clientName) return toast('업체명을 입력해주세요', 'error');
  if (!d.amount) return toast('금액을 입력해주세요', 'error');

  toast('엑셀 생성 중...', 'info');

  try {
    if (typeof ExcelJS === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
    }

    const resp = await fetch('assets/quote-template.xlsx');
    if (!resp.ok) throw new Error('템플릿 로드 실패');
    const buf = await resp.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);

    const workContent = buildWorkContentText(d);

    // A5: 날짜
    ws.getCell('A5').value = d.date;
    // A7: 업체명
    ws.getCell('A7').value = d.clientName;

    // I14: 공급가액
    ws.getCell('I14').value = d.amount;
    // L14: 세액 (formula preserved or set)
    ws.getCell('L14').value = { formula: 'I14*0.1' };

    // C14: 규격
    ws.getCell('C14').value = d.spec;
    // E14: 횟수
    ws.getCell('E14').value = d.frequency;

    // E11: 합계 (formula)
    ws.getCell('E11').value = { formula: 'L11' };
    // L11: 합계 (formula)
    ws.getCell('L11').value = { formula: 'I31+L31' };
    // I31: 공급가액 합계
    ws.getCell('I31').value = { formula: 'SUM(I14:K30)' };
    // L31: 세액 합계
    ws.getCell('L31').value = { formula: 'SUM(L14:M30)' };

    // A16: 작업 상세내용
    ws.getCell('A16').value = workContent;
    ws.getCell('A16').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    // A33-A35: 하단 참고사항 제거
    ws.getCell('A33').value = '';
    ws.getCell('A34').value = '';
    ws.getCell('A35').value = '';

    const outBuf = await wb.xlsx.writeBuffer();
    const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `견적서_${d.clientName}_${d.date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    toast('엑셀 견적서 다운로드 완료');
  } catch (err) {
    console.error('Excel export error:', err);
    toast('엑셀 생성 실패: ' + err.message, 'error');
  }
}


// ════════════════════════════════════════════════════
// 이미지 내보내기 (html2canvas)
// ════════════════════════════════════════════════════

async function exportQuoteImage() {
  const d = getQuoteFormData();
  if (!d.clientName) return toast('업체명을 입력해주세요', 'error');
  if (!d.amount) return toast('금액을 입력해주세요', 'error');

  const el = document.getElementById('quotePrintArea');
  if (!el) return toast('미리보기를 먼저 확인해주세요', 'error');

  toast('이미지 생성 중...', 'info');

  try {
    if (typeof html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const link = document.createElement('a');
    link.download = `견적서_${d.clientName}_${d.date}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    toast('이미지 다운로드 완료');
  } catch (err) {
    console.error('Image export error:', err);
    toast('이미지 생성 실패: ' + err.message, 'error');
  }
}


// ════════════════════════════════════════════════════
// PDF 내보내기 (jsPDF + html2canvas)
// ════════════════════════════════════════════════════

async function exportQuotePDF() {
  const d = getQuoteFormData();
  if (!d.clientName) return toast('업체명을 입력해주세요', 'error');
  if (!d.amount) return toast('금액을 입력해주세요', 'error');

  const el = document.getElementById('quotePrintArea');
  if (!el) return toast('미리보기를 먼저 확인해주세요', 'error');

  toast('PDF 생성 중...', 'info');

  try {
    if (typeof html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }

    // jsPDF 로드 확인
    if (!window.jspdf && !window.jsPDF) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const imgData = canvas.toDataURL('image/png');

    // jsPDF UMD: window.jspdf.jsPDF
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) throw new Error('jsPDF 라이브러리를 불러올 수 없습니다');

    const pdf = new jsPDFClass('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const yOffset = imgHeight > pdfHeight - 20 ? 10 : (pdfHeight - imgHeight) / 2;

    pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, Math.min(imgHeight, pdfHeight - 20));
    pdf.save(`견적서_${d.clientName}_${d.date}.pdf`);

    toast('PDF 다운로드 완료');
  } catch (err) {
    console.error('PDF export error:', err);
    toast('PDF 생성 실패: ' + err.message, 'error');
  }
}


// ════════════════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════════════════

function buildWorkContentText(d) {
  let text = '상세사항\n\n\n';
  text += '청소 범위\n';
  text += `1. 작업일정 \n- ${d.frequency} 사무실 내부청소\n \n`;
  text += '2. 작업내용\n';
  d.workItems.forEach(item => {
    text += `- ${item}\n`;
  });
  return text;
}


// ════════════════════════════════════════════════════
// 견적관리 연동: 저장/해제
// ════════════════════════════════════════════════════

async function saveQuoteToLead() {
  if (!pendingQuoteLead || !pendingQuoteLead.id) {
    return toast('연동된 견적 정보가 없습니다', 'error');
  }

  const d = getQuoteFormData();
  if (!d.clientName) return toast('업체명을 입력해주세요', 'error');
  if (!d.amount) return toast('금액을 입력해주세요', 'error');

  const payload = {
    quote_date:       d.date,
    quote_amount:     d.total,
    quote_spec:       d.spec,
    quote_frequency:  d.frequency,
    quote_work_items: d.workItems,
    status:           'proposal', // 견적서 작성 → 견적제출 상태로
  };

  const { error } = await sb.from('leads')
    .update(payload)
    .eq('id', pendingQuoteLead.id);

  if (error) return toast('저장 실패: ' + error.message, 'error');

  // 로컬 데이터도 업데이트
  const local = adminData.leads.find(l => l.id === pendingQuoteLead.id);
  if (local) {
    Object.assign(local, payload);
  }

  toast('견적서가 저장되었습니다 ✓');
}

function clearQuoteLead() {
  pendingQuoteLead = null;
  renderQuote();
}

/**
 * admin-quote.js - 견적서 생성기
 * 양식 기반으로 견적서를 작성하고 엑셀/이미지/PDF로 내보내기
 */

// 작업내용 항목 (체크 선택)
const QUOTE_WORK_ITEMS = [
  '실내 내부바닥 기본청소 진행 후 약품청소_친환경세제(바닥코딩보호) 도포',
  '종량제,재활용 쓰레기 분리수거',
  '회의실 탁자 및 청소',
  '탕비실 청소',
  '개인쓰레기통 비우기',
  '개인사무실 탁자 및 바닥 청소',
  '벌레 제거',
  '선반 먼지 제거',
  '문 유리 닦기 여부',
  '화물 물주기',
  '파쇄기 비우기',
  '창틀 먼지 제거',
];

// 공급자 정보 (고정)
const SUPPLIER_INFO = {
  bizNum: '812-05-03268',
  companyName: '오피스클린프로',
  ceo: '이경운',
  bizType: '사업시설 관리 서비스업',
  bizItem: '건축물 일반 청소업',
  phone: '010-8158-7873',
  manager: '김준희',
};

function renderQuote() {
  const mc = $('mainContent');

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      견적서 생성
      <div>
        <button class="btn-sm btn-blue" onclick="exportQuoteExcel()" style="font-size:11px;padding:6px 10px;margin-right:4px">📊 엑셀</button>
        <button class="btn-sm btn-green" onclick="exportQuoteImage()" style="font-size:11px;padding:6px 10px;margin-right:4px">🖼️ 이미지</button>
        <button class="btn-sm" onclick="exportQuotePDF()" style="font-size:11px;padding:6px 10px;background:var(--red);color:#fff">📄 PDF</button>
      </div>
    </div>

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
          <input id="qAmount" type="number" class="input" placeholder="예: 272727" style="margin-top:4px" oninput="updateQuotePreview()">
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
    const etcText = ($('qWorkEtc' + i)?.value || '').trim();
    if (etcText) checkedItems.push(etcText);
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
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr style="border:1px solid #333">
              <td rowspan="4" style="border:1px solid #333;text-align:center;padding:4px 8px;font-size:11px;writing-mode:vertical-lr;letter-spacing:8px;background:#f8f8f8;width:28px">공급자</td>
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8;width:60px">등록번호</td>
              <td colspan="3" style="border:1px solid #333;padding:4px 8px">${SUPPLIER_INFO.bizNum}</td>
            </tr>
            <tr style="border:1px solid #333">
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8">상호</td>
              <td style="border:1px solid #333;padding:4px 8px">${SUPPLIER_INFO.companyName}</td>
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8;width:40px">성명</td>
              <td style="border:1px solid #333;padding:4px 8px;position:relative">${SUPPLIER_INFO.ceo} <span style="display:inline-block;position:relative;top:-2px;margin-left:2px">${getStampSVG()}</span></td>
            </tr>
            <tr style="border:1px solid #333">
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8">업태</td>
              <td style="border:1px solid #333;padding:4px 8px">${SUPPLIER_INFO.bizType}</td>
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8">종목</td>
              <td style="border:1px solid #333;padding:4px 8px;font-size:9px">${SUPPLIER_INFO.bizItem}</td>
            </tr>
            <tr style="border:1px solid #333">
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8">연락처</td>
              <td style="border:1px solid #333;padding:4px 8px">${SUPPLIER_INFO.phone}</td>
              <td style="border:1px solid #333;padding:4px 8px;background:#f8f8f8">담당자</td>
              <td style="border:1px solid #333;padding:4px 8px">${SUPPLIER_INFO.manager}</td>
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

      <!-- 하단 참고사항 -->
      <div style="margin-top:12px;font-size:11px;color:#333;line-height:1.8">
        1. 견적금액은 부가가치세 별도입니다.<br>
        2. 견적유효기간: ${escapeHtml(d.validDays)}일<br>
        ${d.etcNote ? `3. 기타사항: ${escapeHtml(d.etcNote)}` : '3. 기타사항:'}
      </div>
    </div>
  `;
}


// ════════════════════════════════════════════════════
// 도장 SVG 생성
// ════════════════════════════════════════════════════

function getStampSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 100 100" style="vertical-align:middle">
    <circle cx="50" cy="50" r="46" fill="none" stroke="#cc2200" stroke-width="5"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#cc2200" stroke-width="2"/>
    <text x="50" y="38" text-anchor="middle" font-size="16" font-weight="700" fill="#cc2200" font-family="맑은 고딕,Noto Sans KR,sans-serif">오피스</text>
    <text x="50" y="56" text-anchor="middle" font-size="16" font-weight="700" fill="#cc2200" font-family="맑은 고딕,Noto Sans KR,sans-serif">클린</text>
    <text x="50" y="74" text-anchor="middle" font-size="16" font-weight="700" fill="#cc2200" font-family="맑은 고딕,Noto Sans KR,sans-serif">프로</text>
  </svg>`;
}

// ════════════════════════════════════════════════════
// 엑셀 내보내기 (원본 양식 기반)
// ════════════════════════════════════════════════════

function exportQuoteExcel() {
  const d = getQuoteFormData();
  if (!d.clientName) return toast('업체명을 입력해주세요', 'error');
  if (!d.amount) return toast('금액을 입력해주세요', 'error');

  const workContent = buildWorkContentText(d);

  const wb = XLSX.utils.book_new();
  const wsData = [];

  // Row 1: NO / 세액 계산 (hidden helper)
  wsData.push(['NO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '세액 계산:', '절상']);
  // Row 2: empty
  wsData.push([]);
  // Row 3: title
  wsData.push([' 견   적   서 ']);
  // Row 4: empty
  wsData.push([]);
  // Row 5: date / supplier header
  wsData.push([d.date, '', '', '', '', '공\n급\n자', '', '등록번호', '', SUPPLIER_INFO.bizNum]);
  // Row 6: client / supplier
  wsData.push(['', '', '', '', '', '', '', '상호', '', SUPPLIER_INFO.companyName, '', '', '성명', '', SUPPLIER_INFO.ceo, '(인)']);
  // Row 7: client name
  wsData.push([d.clientName, '', '', '님 귀하']);
  // Row 8: biz type
  wsData.push(['', '', '', '', '', '', '', '업태', '', SUPPLIER_INFO.bizType, '', '', '종목', '', SUPPLIER_INFO.bizItem]);
  // Row 9: greeting / contact
  wsData.push(['아래와 같이 견적합니다.', '', '', '', '', '', '', '연락처', '', SUPPLIER_INFO.phone, '', '', '담당자', '', SUPPLIER_INFO.manager]);
  // Row 10: empty
  wsData.push([]);
  // Row 11: total amount
  wsData.push(['합 계 금 액', '', '일금', '', d.total, '', '', '', '', '', '', d.total]);
  // Row 12: empty
  wsData.push([]);
  // Row 13: header
  wsData.push(['품  명', '', '규  격', '', '횟수', '', '', '', '공 급 가 액', '', '', '세  액', '', '비  고']);
  // Row 14: item
  wsData.push(['정기청소', '', d.spec, '', d.frequency, '', '', '', d.amount, '', '', d.tax]);
  // Row 15: empty (originally A15 merged)
  wsData.push([]);
  // Row 16: work details
  wsData.push([workContent]);

  // Rows 17-30: empty
  for (let i = 0; i < 14; i++) wsData.push([]);

  // Row 31: total row
  wsData.push(['합    계', '', '', '', '', '', '', '', d.amount, '', '', d.tax]);
  // Row 32: empty
  wsData.push([]);
  // Row 33-35: notes
  wsData.push(['1. 견적금액은 부가가치세 별도입니다.']);
  wsData.push([`2. 견적유효기간: ${d.validDays}일`]);
  wsData.push([`3. 기타사항: ${d.etcNote}`]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Merge cells (matching original template)
  ws['!merges'] = [
    { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } },   // A3:P3 title
    { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },     // A5:C5 date
    { s: { r: 4, c: 5 }, e: { r: 8, c: 5 } },     // F5:F9 공급자
    { s: { r: 4, c: 9 }, e: { r: 4, c: 15 } },    // J5:P5 biz num
    { s: { r: 6, c: 0 }, e: { r: 6, c: 2 } },     // A7:C7 client name
    { s: { r: 10, c: 0 }, e: { r: 10, c: 1 } },   // A11:B11
    { s: { r: 10, c: 2 }, e: { r: 10, c: 3 } },   // C11:D11
    { s: { r: 10, c: 4 }, e: { r: 10, c: 9 } },   // E11:J11
    { s: { r: 10, c: 11 }, e: { r: 10, c: 15 } }, // L11:P11
    { s: { r: 12, c: 0 }, e: { r: 12, c: 1 } },   // A13:B13
    { s: { r: 12, c: 2 }, e: { r: 12, c: 3 } },   // C13:D13
    { s: { r: 12, c: 4 }, e: { r: 12, c: 7 } },   // E13:H13
    { s: { r: 12, c: 8 }, e: { r: 12, c: 10 } },  // I13:K13
    { s: { r: 12, c: 11 }, e: { r: 12, c: 12 } }, // L13:M13
    { s: { r: 12, c: 13 }, e: { r: 12, c: 15 } }, // N13:P13
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },   // A14:B14
    { s: { r: 13, c: 2 }, e: { r: 13, c: 3 } },   // C14:D14
    { s: { r: 13, c: 4 }, e: { r: 13, c: 7 } },   // E14:H14
    { s: { r: 13, c: 8 }, e: { r: 13, c: 10 } },  // I14:K14
    { s: { r: 13, c: 11 }, e: { r: 13, c: 12 } }, // L14:M14
    { s: { r: 13, c: 13 }, e: { r: 13, c: 15 } }, // N14:P14
    { s: { r: 14, c: 0 }, e: { r: 14, c: 15 } },  // A15:P15
    { s: { r: 15, c: 0 }, e: { r: 29, c: 15 } },  // A16:P30 work details
    { s: { r: 30, c: 0 }, e: { r: 30, c: 7 } },   // A31:H31
    { s: { r: 30, c: 8 }, e: { r: 30, c: 10 } },  // I31:K31
    { s: { r: 30, c: 11 }, e: { r: 30, c: 12 } }, // L31:M31
    { s: { r: 30, c: 13 }, e: { r: 30, c: 15 } }, // N31:P31
  ];

  // Column widths
  ws['!cols'] = [
    { wch: 8 }, { wch: 4 }, { wch: 6 }, { wch: 6 }, { wch: 8 },
    { wch: 4 }, { wch: 3 }, { wch: 6 }, { wch: 10 }, { wch: 8 },
    { wch: 4 }, { wch: 8 }, { wch: 5 }, { wch: 6 }, { wch: 8 }, { wch: 4 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, '견적서');
  XLSX.writeFile(wb, `견적서_${d.clientName || '미입력'}_${d.date}.xlsx`);
  toast('엑셀 견적서 다운로드 완료');
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
      // 동적 로드
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
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
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 20; // 10mm margins
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
  let text = '상세사항\n\n';
  text += '청소 범위\n';
  text += `1. 작업일정\n- ${d.frequency} 사무실 내부청소\n\n`;
  text += '2. 작업내용\n';
  d.workItems.forEach(item => {
    text += `- ${item}\n`;
  });
  return text;
}

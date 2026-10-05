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

  const field = (id, label, attrs) => `
        <div class="qf-field">
          <label for="${id}">${label}</label>
          <input id="${id}" class="input" ${attrs}>
        </div>`;

  mc.innerHTML = `
    <div class="section-title qf-header">
      <span>견적서 생성</span>
      <div class="qf-actions">
        ${lead ? `<button class="btn-sm qf-btn-save" id="qSaveBtn" onclick="saveQuoteToLead()">💾 견적 저장</button>` : ''}
        <button class="btn-sm btn-blue" onclick="exportQuoteExcel()">📊 엑셀</button>
        <button class="btn-sm btn-green" onclick="exportQuoteImage()">🖼️ 이미지</button>
        <button class="btn-sm qf-btn-pdf" onclick="exportQuotePDF()">📄 PDF</button>
      </div>
    </div>

    ${lead ? `
    <div class="qf-lead-banner">
      <span>📋 <strong>${escapeHtml(lead.clientName)}</strong> 견적서 작성 중</span>
      <button class="btn-sm btn-gray" onclick="clearQuoteLead()">✕ 연동 해제</button>
    </div>
    ` : ''}

    <!-- 입력 폼 -->
    <div class="card qf-card">
      <h3 class="qf-card-title">기본 정보</h3>
      <div class="qf-grid">
        ${field('qClientName', '수신 업체명 (님 귀하)', 'placeholder="예: 법무법인 마스트" oninput="debouncedQuotePreview()"')}
        ${field('qAddress', '주소', 'placeholder="업체 주소" oninput="debouncedQuotePreview()"')}
        ${field('qDate', '견적 날짜', `type="date" value="${today()}" onchange="debouncedQuotePreview()"`)}
        ${field('qFrequency', '횟수', 'placeholder="예: 주1회" value="주1회" oninput="debouncedQuotePreview()"')}
        ${field('qSpec', '규격', 'placeholder="예: 사무실전체" value="사무실전체" oninput="debouncedQuotePreview()"')}
        <div class="qf-field">
          <label for="qAmount">공급가액 (VAT 별도)</label>
          <input id="qAmount" class="input qf-money" type="text" inputmode="numeric" placeholder="예: 272,727" oninput="fmtInput(this);debouncedQuotePreview()">
          <div class="qf-hint" id="qAmountHint"></div>
        </div>
        ${field('qValidDays', '견적유효기간 (일)', 'type="number" min="1" max="365" inputmode="numeric" placeholder="예: 30" value="30" oninput="debouncedQuotePreview()"')}
        ${field('qEtcNote', '기타사항', 'placeholder="기타사항 입력" oninput="debouncedQuotePreview()"')}
      </div>
    </div>

    <!-- 작업내용 체크 -->
    <div class="card qf-card">
      <h3 class="qf-card-title qf-card-title-row">
        <span>작업내용 선택</span>
        <span class="qf-check-actions">
          <button type="button" class="btn-sm btn-gray" onclick="setAllQuoteWorkItems(true)">전체선택</button>
          <button type="button" class="btn-sm btn-gray" onclick="setAllQuoteWorkItems(false)">전체해제</button>
        </span>
      </h3>
      <div class="qf-work-grid" id="qWorkItems">
        ${QUOTE_WORK_ITEMS.map((item, i) => `
          <label class="qf-check">
            <input type="checkbox" class="qWorkCheck" data-index="${i}" checked onchange="debouncedQuotePreview()">
            <span>${i + 1}. ${escapeHtml(item)}</span>
          </label>
        `).join('')}
        ${[1, 2, 3].map(n => `
        <div class="qf-etc">
          <span>${QUOTE_WORK_ITEMS.length + n}. 기타:</span>
          <input id="qWorkEtc${n}" class="input" placeholder="직접 입력" oninput="debouncedQuotePreview()">
        </div>`).join('')}
      </div>
    </div>

    <!-- 미리보기 -->
    <div class="card qf-card qf-preview-card">
      <h3 class="qf-card-title qf-preview-title">미리보기</h3>
      <div class="qf-preview-scroll">
        <div id="quotePreview"></div>
      </div>
    </div>
  `;

  // 견적관리 연동: lead 데이터 자동 입력 (DOM 이 이미 만들어졌으므로 바로 채움)
  if (lead) {
    $('qClientName').value = lead.clientName || '';
    $('qAddress').value = lead.address || '';
    $('qFrequency').value = lead.frequency || '주1회';
    $('qSpec').value = lead.spec || '사무실전체';
    if (lead.quoteDate) $('qDate').value = lead.quoteDate;
    if (lead.amount) $('qAmount').value = Number(lead.amount).toLocaleString('ko-KR');

    // 저장된 견적서 작업내용 복원 (표준 항목은 체크, 나머지는 기타 칸으로 — 이전엔 기타 항목이 사라졌음)
    if (lead.quoteWorkItems && lead.quoteWorkItems.length > 0) {
      document.querySelectorAll('.qWorkCheck').forEach(cb => cb.checked = false);
      const extras = [];
      lead.quoteWorkItems.forEach(savedItem => {
        const idx = QUOTE_WORK_ITEMS.indexOf(savedItem);
        if (idx >= 0) {
          const cb = document.querySelector(`.qWorkCheck[data-index="${idx}"]`);
          if (cb) cb.checked = true;
        } else if (savedItem) {
          extras.push(savedItem);
        }
      });
      extras.slice(0, 3).forEach((txt, i) => { $('qWorkEtc' + (i + 1)).value = txt; });
      if (extras.length > 3) $('qWorkEtc3').value = extras.slice(2).join(', ');
    }
  }

  updateQuotePreview();
}

function setAllQuoteWorkItems(checked) {
  document.querySelectorAll('.qWorkCheck').forEach(cb => cb.checked = checked);
  updateQuotePreview();
}

function getQuoteFormData() {
  const amount = parseMoney($('qAmount')?.value);
  const tax = quoteTaxOf(amount); // 원 단위 미만 절상 (엑셀 양식과 동일)
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
    validDays: String(parseInt($('qValidDays')?.value) || 30),
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
    ? d.workItems.map(item => `- ${item}`).join('\n')
    : '';

  const hintEl = document.getElementById('qAmountHint');
  if (hintEl) hintEl.textContent = d.amount ? `세액 ${fmt(d.tax)}원 · 합계 ${fmt(d.total)}원 (VAT 포함)` : '';

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
        <div style="flex:0.8">
          <div style="font-size:12px;color:#666;margin-bottom:8px">${escapeHtml(d.date)}</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:2px">
            ${escapeHtml(d.clientName || '(업체명)')}
            <span style="font-size:12px;font-weight:400;color:#666"> 님 귀하</span>
          </div>
          ${d.address ? `<div style="font-size:11px;color:#666">${escapeHtml(d.address)}</div>` : ''}
          <div style="font-size:12px;margin-top:12px">아래와 같이 견적합니다.</div>
        </div>
        <!-- 오른쪽: 공급자 -->
        <div style="flex:1.2">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr>
              <td rowspan="4" style="border:1px solid #333;text-align:center;padding:4px 4px;font-size:12px;background:#f8f8f8;vertical-align:middle;width:24px;line-height:1.8">공<br>급<br>자</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap;width:56px">등록번호</td>
              <td colspan="3" style="border:1px solid #333;padding:4px 6px">${SUPPLIER_INFO.bizNum}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">상호</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap">${SUPPLIER_INFO.companyName}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap;width:36px">성명</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap;min-width:80px">${SUPPLIER_INFO.ceo} ${getStampHTML()}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">업태</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap;font-size:10px">${SUPPLIER_INFO.bizType}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">종목</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap;font-size:10px">${SUPPLIER_INFO.bizItem}</td>
            </tr>
            <tr>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">연락처</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap">${SUPPLIER_INFO.phone}</td>
              <td style="border:1px solid #333;padding:4px 6px;background:#f8f8f8;white-space:nowrap">담당자</td>
              <td style="border:1px solid #333;padding:4px 6px;white-space:nowrap">${SUPPLIER_INFO.manager}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 합계 금액 -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px">
        <tr style="border:2px solid #333;background:#f0f0f0">
          <td style="border:2px solid #333;padding:10px;text-align:center;font-weight:700;width:100px">합 계 금 액</td>
          <td style="border:2px solid #333;padding:10px;text-align:center;font-weight:700;width:64px;white-space:nowrap">일금</td>
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

      <!-- 유효기간 · 기타사항 -->
      <div style="border:1px solid #333;border-top:none;padding:10px 14px;font-size:11px;line-height:1.7">
        <div><strong>견적 유효기간</strong> : 견적일로부터 ${escapeHtml(d.validDays)}일${quoteExpiryStr(d)}</div>
        ${d.etcNote ? `<div><strong>기타사항</strong> : ${escapeHtml(d.etcNote)}</div>` : ''}
      </div>
    </div>
  `;
}

/** 유효기간 만료일 문자열 (날짜 계산 가능할 때만 " (YYYY-MM-DD까지)" 붙임) */
function quoteExpiryStr(d) {
  const days = parseInt(d.validDays);
  // 'YYYY-MM-DD' 를 로컬 날짜로 해석 (new Date('YYYY-MM-DD') 는 UTC 자정이라 시간대에 따라 하루 밀림)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date || '');
  if (!days || !m) return '';
  const base = new Date(+m[1], +m[2] - 1, +m[3]);
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return ` (${y}-${mm}-${dd}까지)`;
}


// ════════════════════════════════════════════════════
// 도장 이미지 (실제 인감 이미지 사용)
// ════════════════════════════════════════════════════

function getStampHTML() {
  return `<img src="assets/stamp.png" alt="인감" style="width:36px;height:36px;opacity:0.85;vertical-align:middle;margin-left:2px">`;
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
      // L14: 세액 — 원 단위 미만 절상 (양식 R1 '절상', 화면/PDF 와 동일).
      //   이전 'I14*0.1' 은 27,272.7 처럼 소수가 남아 합계·한글금액이 화면과 달랐음.
      //   result 를 함께 넣어 수식 미계산 뷰어(모바일 미리보기 등)에서도 금액이 보이게 함.
      ws.getCell('L14').value = { formula: 'ROUNDUP(I14*0.1,0)', result: d.tax };

      // C14: 규격
      ws.getCell('C14').value = d.spec;
      // E14: 횟수
      ws.getCell('E14').value = d.frequency;

      // E11: 합계 (한글 표기 셀)
      ws.getCell('E11').value = { formula: 'L11', result: d.total };
      // L11: 합계
      ws.getCell('L11').value = { formula: 'I31+L31', result: d.total };
      // I31: 공급가액 합계
      ws.getCell('I31').value = { formula: 'SUM(I14:K30)', result: d.amount };
      // L31: 세액 합계
      ws.getCell('L31').value = { formula: 'SUM(L14:M30)', result: d.tax };

      // A16: 작업 상세내용
      ws.getCell('A16').value = workContent;
      ws.getCell('A16').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

      // A33-A35: 하단 참고사항 → 유효기간·기타사항 기입
      ws.getCell('A33').value = `견적 유효기간 : 견적일로부터 ${d.validDays}일${quoteExpiryStr(d)}`;
      ws.getCell('A34').value = d.etcNote ? `기타사항 : ${d.etcNote}` : '';
      ws.getCell('A35').value = '';

      const outBuf = await wb.xlsx.writeBuffer();
      const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `견적서_${d.clientName}_${d.date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); // 즉시 해제하면 일부 브라우저(사파리 등)에서 다운로드 실패

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

    const btn = $('qSaveBtn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    try {
      const local = adminData.leads.find(l => l.id === pendingQuoteLead.id);
      const curStatus = local ? local.status : pendingQuoteLead.status;

      const payload = {
        quote_date:       d.date,
        quote_amount:     d.total,     // VAT 포함 합계
        estimated_amount: d.amount,    // 예상금액은 VAT 별도 공급가로 통일
        quote_spec:       d.spec,
        quote_frequency:  d.frequency,
        quote_work_items: d.workItems,
      };
      // 견적 제출 전 단계일 때만 '견적제출'로 변경 (이전엔 성공/실패 건도 견적제출로 되돌려 통계가 틀어졌음)
      if (!curStatus || LEAD_PRE_PROPOSAL.includes(curStatus)) payload.status = 'proposal';

      const { error } = await sb.from('leads')
        .update(payload)
        .eq('id', pendingQuoteLead.id);

      if (error) return toast('저장 실패: ' + error.message, 'error');

      if (local) Object.assign(local, payload);
      Object.assign(pendingQuoteLead, {
        amount: d.amount, quoteDate: d.date, quoteWorkItems: d.workItems,
        status: payload.status || curStatus,
      });

      toast('견적서가 저장되었습니다 ✓');
    } catch (e) {
      console.error('saveQuoteToLead error:', e);
      toast('견적 저장 중 오류가 발생했습니다', 'error');
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = '💾 견적 저장'; }
    }
  }

function clearQuoteLead() {
  pendingQuoteLead = null;
  renderQuote();
}

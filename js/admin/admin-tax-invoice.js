/**
 * admin-tax-invoice.js - 세금계산서 관리
 * 홈택스 일괄발급용 엑셀 자동 생성 + 업체별 세금계산서 정보 관리
 */

// ─── 모듈 상태 ───
const _tax = {
  month: '',
  supplierInfo: null,
  vatInclusive: false,   // false = 계약금액이 부가세 별도 (기본)
  itemName: '청소용역',
};


// ═══════════════════════════════════════════════════════
//  공급자(우리 회사) 정보
// ═══════════════════════════════════════════════════════

async function loadTaxSupplierInfo() {
  if (_tax.supplierInfo) return _tax.supplierInfo;
  try {
    const { data, error } = await sb
      .from('tax_config').select('*').limit(1).maybeSingle();
    if (!error && data) {
      _tax.supplierInfo = data;
    } else {
      _tax.supplierInfo = _defaultSupplier();
    }
  } catch (e) {
    console.error('loadTaxSupplierInfo:', e);
    _tax.supplierInfo = _defaultSupplier();
  }
  return _tax.supplierInfo;
}

function _defaultSupplier() {
  return {
    supplier_biz_no: '', supplier_name: '오피스클린프로', supplier_ceo: '',
    supplier_address: '', supplier_biz_type: '', supplier_biz_item: '',
    supplier_email: ''
  };
}

async function saveTaxSupplierForm() {
  const info = {
    supplier_biz_no:   $('taxSupBizNo').value.trim(),
    supplier_name:     $('taxSupName').value.trim(),
    supplier_ceo:      $('taxSupCeo').value.trim(),
    supplier_address:  $('taxSupAddr').value.trim(),
    supplier_biz_type: $('taxSupBizType').value.trim(),
    supplier_biz_item: $('taxSupBizItem').value.trim(),
    supplier_email:    $('taxSupEmail').value.trim(),
    updated_at:        new Date().toISOString(),
  };
  try {
    if (_tax.supplierInfo && _tax.supplierInfo.id) {
      const { error } = await sb.from('tax_config')
        .update(info).eq('id', _tax.supplierInfo.id);
      if (error) throw error;
      Object.assign(_tax.supplierInfo, info);
    } else {
      const { data, error } = await sb.from('tax_config')
        .insert(info).select().single();
      if (error) throw error;
      _tax.supplierInfo = data;
    }
    toast('공급자 정보가 저장되었습니다');
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('saveTaxSupplierForm:', e);
    toast('저장 실패: ' + (e.message || ''), 'error');
  }
}

function toggleSupplierEdit() {
  const f = $('taxSupplierEditForm');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}


// ═══════════════════════════════════════════════════════
//  업체별 세금정보 모달
// ═══════════════════════════════════════════════════════

function openTaxInfoModal(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  $('modalBody').innerHTML = `
    <div class="modal-header">
      <h3 style="margin:0">세금계산서 정보 — ${escapeHtml(c.name)}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="padding:20px">
      <div class="form-group">
        <label>사업자등록번호 *</label>
        <input type="text" id="txBizNo" class="form-input"
               value="${escapeHtml(c.biz_no || '')}" placeholder="000-00-00000" maxlength="12">
      </div>
      <div class="form-group">
        <label>대표자명 *</label>
        <input type="text" id="txCeoName" class="form-input"
               value="${escapeHtml(c.ceo_name || '')}" placeholder="홍길동">
      </div>
      <div class="form-group">
        <label>업태</label>
        <input type="text" id="txBizType" class="form-input"
               value="${escapeHtml(c.biz_type || '')}" placeholder="서비스업">
      </div>
      <div class="form-group">
        <label>종목</label>
        <input type="text" id="txBizItem" class="form-input"
               value="${escapeHtml(c.biz_item || '')}" placeholder="사무실임대">
      </div>
      <div class="form-group">
        <label>세금계산서 이메일</label>
        <input type="email" id="txEmail" class="form-input"
               value="${escapeHtml(c.tax_email || '')}" placeholder="tax@example.com">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn-sm btn-gray" onclick="closeModal()">취소</button>
        <button class="btn-sm btn-blue" onclick="submitTaxInfoModal('${companyId}')">저장</button>
      </div>
    </div>`;
  $('detailModal').classList.add('show');
}

async function submitTaxInfoModal(companyId) {
  const info = {
    biz_no:    $('txBizNo').value.trim(),
    ceo_name:  $('txCeoName').value.trim(),
    biz_type:  $('txBizType').value.trim(),
    biz_item:  $('txBizItem').value.trim(),
    tax_email: $('txEmail').value.trim(),
  };

  if (!info.biz_no || !info.ceo_name) {
    toast('사업자등록번호와 대표자명은 필수입니다', 'error');
    return;
  }
  const clean = info.biz_no.replace(/-/g, '');
  if (!/^\d{10}$/.test(clean)) {
    toast('사업자등록번호는 10자리 숫자여야 합니다', 'error');
    return;
  }

  try {
    const { error } = await sb.from('companies')
      .update(info).eq('id', companyId);
    if (error) throw error;

    const comp = adminData.companies.find(c => c.id === companyId);
    if (comp) Object.assign(comp, info);

    toast('세금정보가 저장되었습니다');
    closeModal();
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('submitTaxInfoModal:', e);
    toast('저장 실패: ' + (e.message || ''), 'error');
  }
}


// ═══════════════════════════════════════════════════════
//  발행 대상 데이터
// ═══════════════════════════════════════════════════════

function getTaxTargets(month) {
  const records = adminData.billings
    .filter(b => b.month === month && (b.billed_amount || 0) > 0);

  return records.map(b => {
    const c = adminData.companies.find(x => x.id === b.company_id);
    if (!c) return null;
    if (c.subcontract_from === '에코오피스클린') return null;

    const amt = b.billed_amount || 0;
    let supply, tax;
    if (_tax.vatInclusive) {
      supply = Math.round(amt / 1.1);
      tax    = amt - supply;
    } else {
      supply = amt;
      tax    = Math.round(amt * 0.1);
    }

    return {
      companyId:   c.id,
      companyName: c.name,
      bizNo:       c.biz_no || '',
      ceoName:     c.ceo_name || '',
      bizType:     c.biz_type || '',
      bizItem:     c.biz_item || '',
      taxEmail:    c.tax_email || '',
      address:     c.location || '',
      billedAmount: amt,
      supply: supply,
      tax: tax,
      total: supply + tax,
      hasTaxInfo: !!(c.biz_no && c.ceo_name),
    };
  }).filter(Boolean);
}


// ═══════════════════════════════════════════════════════
//  홈택스 일괄발급 엑셀 다운로드
// ═══════════════════════════════════════════════════════

function downloadTaxExcel() {
  const month   = _tax.month;
  const targets = getTaxTargets(month);
  const sup     = _tax.supplierInfo;

  if (targets.length === 0) { toast('발행 대상이 없습니다', 'error'); return; }

  const missing = targets.filter(t => !t.hasTaxInfo);
  if (missing.length > 0) {
    const nm = missing.slice(0, 3).map(m => m.companyName).join(', ');
    toast('세금정보 미등록: ' + nm + (missing.length > 3 ? ' 외 ' + (missing.length - 3) + '건' : ''), 'error');
    return;
  }
  if (!sup || !sup.supplier_biz_no) {
    toast('공급자(우리 회사) 정보를 먼저 등록해주세요', 'error');
    return;
  }

  // 작성일자 = 해당 월 마지막 날
  const [yr, mn] = month.split('-').map(Number);
  const lastDay  = new Date(yr, mn, 0).getDate();
  const wDate    = yr + String(mn).padStart(2, '0') + String(lastDay).padStart(2, '0');

  // ── Sheet 1: 홈택스 일괄발급 양식 ──
  const h1 = [
    '작성일자','공급받는자구분','공급받는자등록번호','종사업장번호',
    '상호','성명','주소','업태','종목','이메일1','이메일2',
    '품목일자1','품목명1','품목규격1','품목수량1','품목단가1','품목공급가액1','품목세액1',
    '품목일자2','품목명2','품목규격2','품목수량2','품목단가2','품목공급가액2','품목세액2',
    '품목일자3','품목명3','품목규격3','품목수량3','품목단가3','품목공급가액3','품목세액3',
    '품목일자4','품목명4','품목규격4','품목수량4','품목단가4','품목공급가액4','품목세액4',
    '합계공급가액','합계세액','비고','현금','수표','어음','외상미수금','영수/청구'
  ];

  const d1 = targets.map(t => [
    wDate, '01', t.bizNo.replace(/-/g, ''), '',
    t.companyName, t.ceoName, t.address, t.bizType, t.bizItem, t.taxEmail, '',
    wDate, _tax.itemName, '', 1, t.supply, t.supply, t.tax,
    '','','','','','','',
    '','','','','','','',
    '','','','','','','',
    t.supply, t.tax, month + ' ' + _tax.itemName,
    '', '', '', t.total, '02'
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet([h1, ...d1]);
  ws1['!cols'] = [
    {wch:10},{wch:6},{wch:14},{wch:6},
    {wch:20},{wch:10},{wch:30},{wch:10},{wch:10},{wch:24},{wch:24},
    {wch:10},{wch:12},{wch:8},{wch:6},{wch:12},{wch:12},{wch:12}
  ];

  // ── Sheet 2: 확인용 요약 ──
  const h2 = ['No','업체명','사업자등록번호','대표자','계약금액','공급가액','세액','합계','이메일'];
  const d2 = targets.map((t, i) => [
    i + 1, t.companyName, t.bizNo, t.ceoName,
    t.billedAmount, t.supply, t.tax, t.total, t.taxEmail
  ]);
  const totB = targets.reduce((s, t) => s + t.billedAmount, 0);
  const totS = targets.reduce((s, t) => s + t.supply, 0);
  const totT = targets.reduce((s, t) => s + t.tax, 0);
  const totA = targets.reduce((s, t) => s + t.total, 0);
  d2.push(['', '합계', '', '', totB, totS, totT, totA, '']);

  const ws2 = XLSX.utils.aoa_to_sheet([h2, ...d2]);
  ws2['!cols'] = [
    {wch:4},{wch:20},{wch:14},{wch:10},
    {wch:14},{wch:14},{wch:14},{wch:14},{wch:24}
  ];

  // ── 워크북 ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, '홈택스_일괄발급');
  XLSX.utils.book_append_sheet(wb, ws2, '확인용');
  XLSX.writeFile(wb, '세금계산서_' + month + '.xlsx');

  toast(targets.length + '건 엑셀 다운로드 완료');
}


// ═══════════════════════════════════════════════════════
//  렌더링
// ═══════════════════════════════════════════════════════

async function renderTaxInvoice() {
  try {
    const mc = $('mainContent');
    mc.innerHTML = '<div class="empty-state"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div><p>세금계산서 정보 로딩 중...</p></div>';
    if (!_tax.month) _tax.month = selectedMonth || currentMonth();
    await loadTaxSupplierInfo();
    await ensureMonthData(_tax.month);
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('renderTaxInvoice:', e);
    toast('오류가 발생했습니다', 'error');
  }
}

function renderTaxInvoiceHTML() {
  const mc      = $('mainContent');
  const month   = _tax.month;
  const targets = getTaxTargets(month);
  const sup     = _tax.supplierInfo || {};

  const cnt      = targets.length;
  const regCnt   = targets.filter(t => t.hasTaxInfo).length;
  const missCnt  = cnt - regCnt;
  const sumS     = targets.reduce((s, t) => s + t.supply, 0);
  const sumT     = targets.reduce((s, t) => s + t.tax, 0);
  const sumA     = targets.reduce((s, t) => s + t.total, 0);
  const supOk    = !!(sup.supplier_biz_no && sup.supplier_ceo);
  const canDL    = cnt > 0 && missCnt === 0 && supOk;

  // 전체 업체 세금정보 현황
  const allCo = adminData.companies
    .filter(c => c.status === 'active' && c.subcontract_from !== '에코오피스클린')
    .sort((a, b) => (a.biz_no ? 0 : 1) - (b.biz_no ? 0 : 1) || a.name.localeCompare(b.name));
  const allReg = allCo.filter(c => c.biz_no && c.ceo_name).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      세금계산서 관리
      <button class="btn-sm btn-blue" onclick="downloadTaxExcel()" ${canDL ? '' : 'disabled'}
              style="font-size:12px;padding:8px 14px">
        📥 홈택스 엑셀 다운로드
      </button>
    </div>

    <!-- 통계 -->
    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-label">${month.split('-')[1]}월 발행 대상</div>
        <div class="stat-value blue">${cnt}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">공급가액 합계</div>
        <div class="stat-value" style="font-size:20px">${fmt(sumS)}원</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">세액 합계</div>
        <div class="stat-value orange" style="font-size:20px">${fmt(sumT)}원</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">합계 (공급가액+세액)</div>
        <div class="stat-value green" style="font-size:20px">${fmt(sumA)}원</div>
      </div>
    </div>

    <!-- 공급자 정보 -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">🏢 공급자 (우리 회사) 정보</span>
        ${supOk
          ? '<span class="badge badge-done" style="font-size:11px">등록완료</span>'
          : '<span class="badge badge-warn" style="font-size:11px">미등록</span>'}
        <button class="btn-sm btn-gray" style="margin-left:auto;font-size:11px;padding:4px 10px"
                onclick="toggleSupplierEdit()">수정</button>
      </div>
      <div style="padding:12px 16px;font-size:13px;line-height:1.8">
        <div><strong>사업자번호:</strong> ${escapeHtml(sup.supplier_biz_no || '-')}</div>
        <div><strong>상호:</strong> ${escapeHtml(sup.supplier_name || '-')} &nbsp;|&nbsp; <strong>대표자:</strong> ${escapeHtml(sup.supplier_ceo || '-')}</div>
        <div><strong>주소:</strong> ${escapeHtml(sup.supplier_address || '-')}</div>
        <div><strong>업태:</strong> ${escapeHtml(sup.supplier_biz_type || '-')} &nbsp;|&nbsp; <strong>종목:</strong> ${escapeHtml(sup.supplier_biz_item || '-')}</div>
        <div><strong>이메일:</strong> ${escapeHtml(sup.supplier_email || '-')}</div>
      </div>
      <div id="taxSupplierEditForm" style="display:none;padding:0 16px 16px">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">사업자등록번호 *</label>
            <input type="text" id="taxSupBizNo" class="form-input" value="${escapeHtml(sup.supplier_biz_no || '')}" placeholder="000-00-00000">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">상호 *</label>
            <input type="text" id="taxSupName" class="form-input" value="${escapeHtml(sup.supplier_name || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">대표자 *</label>
            <input type="text" id="taxSupCeo" class="form-input" value="${escapeHtml(sup.supplier_ceo || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">이메일</label>
            <input type="email" id="taxSupEmail" class="form-input" value="${escapeHtml(sup.supplier_email || '')}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:10px">
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label style="font-size:12px">주소</label>
            <input type="text" id="taxSupAddr" class="form-input" value="${escapeHtml(sup.supplier_address || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">업태</label>
            <input type="text" id="taxSupBizType" class="form-input" value="${escapeHtml(sup.supplier_biz_type || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">종목</label>
            <input type="text" id="taxSupBizItem" class="form-input" value="${escapeHtml(sup.supplier_biz_item || '')}">
          </div>
        </div>
        <div style="text-align:right;margin-top:12px">
          <button class="btn-sm btn-gray" onclick="toggleSupplierEdit()">취소</button>
          <button class="btn-sm btn-blue" onclick="saveTaxSupplierForm()" style="margin-left:6px">저장</button>
        </div>
      </div>
    </div>

    <!-- 월별 발행 대상 -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">📋 ${month.split('-')[1]}월 세금계산서 발행 대상</span>
        ${monthSelectorHTML(month, 'changeTaxMonth')}
      </div>

      <div style="padding:8px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;border-bottom:1px solid var(--border,#e5e7eb)">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" ${_tax.vatInclusive ? 'checked' : ''} onchange="toggleTaxVat(this.checked)">
          계약금액 부가세 포함
        </label>
        <label style="display:flex;align-items:center;gap:4px">
          품목명:
          <input type="text" value="${escapeHtml(_tax.itemName)}" class="form-input"
                 style="width:120px;padding:3px 8px;font-size:12px"
                 onchange="changeTaxItemName(this.value)">
        </label>
        ${missCnt > 0 ? '<span style="color:var(--red,#ef4444);font-weight:600">⚠️ 세금정보 미등록 ' + missCnt + '건</span>' : ''}
      </div>

      ${cnt > 0 ? _buildTaxTargetTable(targets, sumS, sumT, sumA) : `
      <div class="empty-state" style="padding:32px 20px">
        <div class="empty-icon">📄</div>
        <p>${month}월 정산 데이터가 없습니다.<br>대시보드에서 월 일정을 먼저 생성해주세요.</p>
      </div>`}
    </div>

    <!-- 전체 업체 세금정보 현황 -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">📝 업체별 세금정보 현황</span>
        <span class="text-muted" style="font-size:12px">${allReg}/${allCo.length} 등록</span>
      </div>
      ${_buildTaxStatusTable(allCo)}
    </div>

    ${!canDL ? _buildTaxWarning(supOk, missCnt, cnt) : ''}
  `;
}

// ── PC 테이블 + 모바일 카드 (발행 대상) ──

function _buildTaxTargetTable(targets, sumS, sumT, sumA) {
  // PC 테이블
  const rows = targets.map(t => `<tr>
    <td style="font-weight:600">${escapeHtml(t.companyName)}</td>
    <td style="font-size:12px;font-family:monospace">${escapeHtml(t.bizNo || '-')}</td>
    <td>${escapeHtml(t.ceoName || '-')}</td>
    <td style="text-align:right;font-size:12px">${fmt(t.billedAmount)}</td>
    <td style="text-align:right;font-weight:600">${fmt(t.supply)}</td>
    <td style="text-align:right;color:var(--orange,#f59e0b)">${fmt(t.tax)}</td>
    <td style="text-align:right;font-weight:600;color:var(--primary,#3b82f6)">${fmt(t.total)}</td>
    <td>${t.hasTaxInfo
      ? '<span class="badge badge-done">등록</span>'
      : '<span class="badge badge-warn">미등록</span>'}</td>
    <td><button class="btn-sm btn-gray" style="font-size:10px;padding:3px 8px"
                onclick="openTaxInfoModal('${t.companyId}')">수정</button></td>
  </tr>`).join('');

  const footer = `<tr style="font-weight:700;background:var(--bg2,#f9fafb)">
    <td colspan="3">합계 (${targets.length}건)</td>
    <td style="text-align:right">${fmt(targets.reduce((s, t) => s + t.billedAmount, 0))}</td>
    <td style="text-align:right">${fmt(sumS)}</td>
    <td style="text-align:right;color:var(--orange,#f59e0b)">${fmt(sumT)}</td>
    <td style="text-align:right;color:var(--primary,#3b82f6)">${fmt(sumA)}</td>
    <td colspan="2"></td>
  </tr>`;

  const table = `<div class="table-wrap">
    <table>
      <thead><tr>
        <th>업체명</th><th>사업자번호</th><th>대표자</th><th>계약금액</th>
        <th>공급가액</th><th>세액</th><th>합계</th><th>상태</th><th></th>
      </tr></thead>
      <tbody>${rows}${footer}</tbody>
    </table>
  </div>`;

  // 모바일 카드
  const cards = `<div class="dash-box-cards-mobile">
    ${targets.map(t => `
    <div class="card" style="padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:13px">${escapeHtml(t.companyName)}</span>
        ${t.hasTaxInfo
          ? '<span class="badge badge-done" style="font-size:10px">등록</span>'
          : '<span class="badge badge-warn" style="font-size:10px">미등록</span>'}
      </div>
      <div style="font-size:12px;color:var(--text2,#6b7280);margin-top:4px">
        ${escapeHtml(t.bizNo || '사업자번호 미등록')} · ${escapeHtml(t.ceoName || '-')}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
        <span>공급가액 <strong>${fmt(t.supply)}</strong></span>
        <span style="color:var(--orange,#f59e0b)">세액 <strong>${fmt(t.tax)}</strong></span>
        <span style="color:var(--primary,#3b82f6);font-weight:600">${fmt(t.total)}원</span>
      </div>
      <div style="text-align:right;margin-top:6px">
        <button class="btn-sm btn-gray" style="font-size:10px;padding:3px 8px"
                onclick="openTaxInfoModal('${t.companyId}')">수정</button>
      </div>
    </div>`).join('')}
  </div>`;

  return table + cards;
}

// ── 전체 업체 세금정보 현황 테이블 ──

function _buildTaxStatusTable(allCo) {
  if (allCo.length === 0) {
    return '<div class="empty-state" style="padding:20px"><p>활성 업체가 없습니다.</p></div>';
  }

  return `<div class="table-wrap" style="max-height:400px;overflow-y:auto">
    <table>
      <thead><tr>
        <th>업체명</th><th>사업자번호</th><th>대표자</th><th>업태</th><th>종목</th><th>이메일</th><th></th>
      </tr></thead>
      <tbody>
        ${allCo.map(c => `<tr>
          <td style="font-weight:600">${escapeHtml(c.name)}</td>
          <td style="font-size:12px;font-family:monospace">${escapeHtml(c.biz_no || '')}</td>
          <td>${escapeHtml(c.ceo_name || '')}</td>
          <td style="font-size:12px">${escapeHtml(c.biz_type || '')}</td>
          <td style="font-size:12px">${escapeHtml(c.biz_item || '')}</td>
          <td style="font-size:12px">${escapeHtml(c.tax_email || '')}</td>
          <td><button class="btn-sm ${c.biz_no ? 'btn-gray' : 'btn-blue'}" style="font-size:10px;padding:3px 8px"
                      onclick="openTaxInfoModal('${c.id}')">${c.biz_no ? '수정' : '등록'}</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── 경고 박스 ──

function _buildTaxWarning(supOk, missCnt, cnt) {
  const items = [];
  if (!supOk) items.push('공급자(우리 회사) 사업자번호와 대표자를 등록해주세요');
  if (missCnt > 0) items.push('세금정보 미등록 업체 ' + missCnt + '건을 등록해주세요');
  if (cnt === 0) items.push('이 달의 정산 데이터가 없습니다');
  if (items.length === 0) return '';

  return `<div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;font-size:13px">
    <strong>⚠️ 엑셀 다운로드 조건:</strong>
    <div style="margin-top:6px">${items.map(i => '• ' + i).join('<br>')}</div>
  </div>`;
}


// ─── 이벤트 핸들러 ───

async function changeTaxMonth(month) {
  _tax.month = month;
  try {
    await ensureMonthData(month);
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('changeTaxMonth:', e);
    toast('오류가 발생했습니다', 'error');
  }
}

function toggleTaxVat(checked) {
  _tax.vatInclusive = checked;
  renderTaxInvoiceHTML();
}

function changeTaxItemName(name) {
  _tax.itemName = name || '청소용역';
}

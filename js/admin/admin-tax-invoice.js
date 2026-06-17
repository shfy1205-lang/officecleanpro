/**
 * admin-tax-invoice.js - ì¸ê¸ê³ì°ì ê´ë¦¬
 * ííì¤ ì¼ê´ë°ê¸ì© ìì ìë ìì± + ìì²´ë³ ì¸ê¸ê³ì°ì ì ë³´ ê´ë¦¬
 */

// âââ ëª¨ë ìí âââ
const _tax = {
  month: '',
  supplierInfo: null,
  vatInclusive: false,   // false = ê³ì½ê¸ì¡ì´ ë¶ê°ì¸ ë³ë (ê¸°ë³¸)
  itemName: 'ì²­ìì©ì­',
};


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  ê³µê¸ì(ì°ë¦¬ íì¬) ì ë³´
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
    supplier_biz_no: '', supplier_name: 'ì¤í¼ì¤í´ë¦°íë¡', supplier_ceo: '',
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
    toast('ê³µê¸ì ì ë³´ê° ì ì¥ëììµëë¤');
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('saveTaxSupplierForm:', e);
    toast('ì ì¥ ì¤í¨: ' + (e.message || ''), 'error');
  }
}

function toggleSupplierEdit() {
  const f = $('taxSupplierEditForm');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  ìì²´ë³ ì¸ê¸ì ë³´ ëª¨ë¬
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function openTaxInfoModal(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  $('modalBody').innerHTML = `
    <div class="modal-header">
      <h3 style="margin:0">ì¸ê¸ê³ì°ì ì ë³´ â ${escapeHtml(c.name)}</h3>
      <button class="modal-close" onclick="closeModal()">â</button>
    </div>
    <div style="padding:20px">
      <div class="form-group">
        <label>ì¬ììë±ë¡ë²í¸ *</label>
        <input type="text" id="txBizNo" class="form-input"
               value="${escapeHtml(c.biz_no || '')}" placeholder="000-00-00000" maxlength="12">
      </div>
      <div class="form-group">
        <label>ëíìëª *</label>
        <input type="text" id="txCeoName" class="form-input"
               value="${escapeHtml(c.ceo_name || '')}" placeholder="íê¸¸ë">
      </div>
      <div class="form-group">
        <label>ìí</label>
        <input type="text" id="txBizType" class="form-input"
               value="${escapeHtml(c.biz_type || '')}" placeholder="ìë¹ì¤ì">
      </div>
      <div class="form-group">
        <label>ì¢ëª©</label>
        <input type="text" id="txBizItem" class="form-input"
               value="${escapeHtml(c.biz_item || '')}" placeholder="ì¬ë¬´ì¤ìë">
      </div>
      <div class="form-group">
        <label>ì¸ê¸ê³ì°ì ì´ë©ì¼</label>
        <input type="email" id="txEmail" class="form-input"
               value="${escapeHtml(c.tax_email || '')}" placeholder="tax@example.com">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn-sm btn-gray" onclick="closeModal()">ì·¨ì</button>
        <button class="btn-sm btn-blue" onclick="submitTaxInfoModal('${companyId}')">ì ì¥</button>
      </div>
    </div>`;
  $('detailModal').classList.add('active');
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
    toast('ì¬ììë±ë¡ë²í¸ì ëíìëªì íììëë¤', 'error');
    return;
  }
  const clean = info.biz_no.replace(/-/g, '');
  if (!/^\d{10}$/.test(clean)) {
    toast('ì¬ììë±ë¡ë²í¸ë 10ìë¦¬ ì«ìì¬ì¼ í©ëë¤', 'error');
    return;
  }

  try {
    const { error } = await sb.from('companies')
      .update(info).eq('id', companyId);
    if (error) throw error;

    const comp = adminData.companies.find(c => c.id === companyId);
    if (comp) Object.assign(comp, info);

    toast('ì¸ê¸ì ë³´ê° ì ì¥ëììµëë¤');
    closeModal();
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('submitTaxInfoModal:', e);
    toast('ì ì¥ ì¤í¨: ' + (e.message || ''), 'error');
  }
}


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  ë°í ëì ë°ì´í°
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function getTaxTargets(month) {
  const records = adminData.billings
    .filter(b => b.month === month && (b.billed_amount || 0) > 0);

  return records.map(b => {
    const c = adminData.companies.find(x => x.id === b.company_id);
    if (!c) return null;
    if (c.subcontract_from === 'ìì½ì¤í¼ì¤í´ë¦°') return null;

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


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  ííì¤ ì¼ê´ë°ê¸ ìì ë¤ì´ë¡ë
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function downloadTaxExcel() {
  const month   = _tax.month;
  const targets = getTaxTargets(month);
  const sup     = _tax.supplierInfo;

  if (targets.length === 0) { toast('ë°í ëìì´ ììµëë¤', 'error'); return; }

  const missing = targets.filter(t => !t.hasTaxInfo);
  if (missing.length > 0) {
    const nm = missing.slice(0, 3).map(m => m.companyName).join(', ');
    toast('ì¸ê¸ì ë³´ ë¯¸ë±ë¡: ' + nm + (missing.length > 3 ? ' ì¸ ' + (missing.length - 3) + 'ê±´' : ''), 'error');
    return;
  }
  if (!sup || !sup.supplier_biz_no) {
    toast('ê³µê¸ì(ì°ë¦¬ íì¬) ì ë³´ë¥¼ ë¨¼ì  ë±ë¡í´ì£¼ì¸ì', 'error');
    return;
  }

  // ìì±ì¼ì = í´ë¹ ì ë§ì§ë§ ë 
  const [yr, mn] = month.split('-').map(Number);
  const lastDay  = new Date(yr, mn, 0).getDate();
  const wDate    = yr + String(mn).padStart(2, '0') + String(lastDay).padStart(2, '0');

  // ââ Sheet 1: ííì¤ ì¼ê´ë°ê¸ ìì ââ
  const h1 = [
    'ìì±ì¼ì','ê³µê¸ë°ëìêµ¬ë¶','ê³µê¸ë°ëìë±ë¡ë²í¸','ì¢ì¬ìì¥ë²í¸',
    'ìí¸','ì±ëª','ì£¼ì','ìí','ì¢ëª©','ì´ë©ì¼1','ì´ë©ì¼2',
    'íëª©ì¼ì1','íëª©ëª1','íëª©ê·ê²©1','íëª©ìë1','íëª©ë¨ê°1','íëª©ê³µê¸ê°ì¡1','íëª©ì¸ì¡1',
    'íëª©ì¼ì2','íëª©ëª2','íëª©ê·ê²©2','íëª©ìë2','íëª©ë¨ê°2','íëª©ê³µê¸ê°ì¡2','íëª©ì¸ì¡2',
    'íëª©ì¼ì3','íëª©ëª3','íëª©ê·ê²©3','íëª©ìë3','íëª©ë¨ê°3','íëª©ê³µê¸ê°ì¡3','íëª©ì¸ì¡3',
    'íëª©ì¼ì4','íëª©ëª4','íëª©ê·ê²©4','íëª©ìë4','íëª©ë¨ê°4','íëª©ê³µê¸ê°ì¡4','íëª©ì¸ì¡4',
    'í©ê³ê³µê¸ê°ì¡','í©ê³ì¸ì¡','ë¹ê³ ','íê¸','ìí','ì´ì','ì¸ìë¯¸ìê¸','ìì/ì²­êµ¬'
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

  // ââ Sheet 2: íì¸ì© ìì½ ââ
  const h2 = ['No','ìì²´ëª','ì¬ììë±ë¡ë²í¸','ëíì','ê³ì½ê¸ì¡','ê³µê¸ê°ì¡','ì¸ì¡','í©ê³','ì´ë©ì¼'];
  const d2 = targets.map((t, i) => [
    i + 1, t.companyName, t.bizNo, t.ceoName,
    t.billedAmount, t.supply, t.tax, t.total, t.taxEmail
  ]);
  const totB = targets.reduce((s, t) => s + t.billedAmount, 0);
  const totS = targets.reduce((s, t) => s + t.supply, 0);
  const totT = targets.reduce((s, t) => s + t.tax, 0);
  const totA = targets.reduce((s, t) => s + t.total, 0);
  d2.push(['', 'í©ê³', '', '', totB, totS, totT, totA, '']);

  const ws2 = XLSX.utils.aoa_to_sheet([h2, ...d2]);
  ws2['!cols'] = [
    {wch:4},{wch:20},{wch:14},{wch:10},
    {wch:14},{wch:14},{wch:14},{wch:14},{wch:24}
  ];

  // ââ ìí¬ë¶ ââ
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'ííì¤_ì¼ê´ë°ê¸');
  XLSX.utils.book_append_sheet(wb, ws2, 'íì¸ì©');
  XLSX.writeFile(wb, 'ì¸ê¸ê³ì°ì_' + month + '.xlsx');

  toast(targets.length + 'ê±´ ìì ë¤ì´ë¡ë ìë£');
}


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  ë ëë§
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function renderTaxInvoice() {
  try {
    const mc = $('mainContent');
    mc.innerHTML = '<div class="empty-state"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div><p>ì¸ê¸ê³ì°ì ì ë³´ ë¡ë© ì¤...</p></div>';
    if (!_tax.month) _tax.month = selectedMonth || currentMonth();
    await loadTaxSupplierInfo();
    await ensureMonthData(_tax.month);
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('renderTaxInvoice:', e);
    toast('ì¤ë¥ê° ë°ìíìµëë¤', 'error');
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

  // ì ì²´ ìì²´ ì¸ê¸ì ë³´ íí©
  const allCo = adminData.companies
    .filter(c => c.status === 'active' && c.subcontract_from !== 'ìì½ì¤í¼ì¤í´ë¦°')
    .sort((a, b) => (a.biz_no ? 0 : 1) - (b.biz_no ? 0 : 1) || a.name.localeCompare(b.name));
  const allReg = allCo.filter(c => c.biz_no && c.ceo_name).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      ì¸ê¸ê³ì°ì ê´ë¦¬
      <button class="btn-sm btn-blue" onclick="downloadTaxExcel()" ${canDL ? '' : 'disabled'}
              style="font-size:12px;padding:8px 14px">
        ð¥ ííì¤ ìì ë¤ì´ë¡ë
      </button>
    </div>

    <!-- íµê³ -->
    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-label">${month.split('-')[1]}ì ë°í ëì</div>
        <div class="stat-value blue">${cnt}ê±´</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">ê³µê¸ê°ì¡ í©ê³</div>
        <div class="stat-value" style="font-size:20px">${fmt(sumS)}ì</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">ì¸ì¡ í©ê³</div>
        <div class="stat-value orange" style="font-size:20px">${fmt(sumT)}ì</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">í©ê³ (ê³µê¸ê°ì¡+ì¸ì¡)</div>
        <div class="stat-value green" style="font-size:20px">${fmt(sumA)}ì</div>
      </div>
    </div>

    <!-- ê³µê¸ì ì ë³´ -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">ð¢ ê³µê¸ì (ì°ë¦¬ íì¬) ì ë³´</span>
        ${supOk
          ? '<span class="badge badge-done" style="font-size:11px">ë±ë¡ìë£</span>'
          : '<span class="badge badge-warn" style="font-size:11px">ë¯¸ë±ë¡</span>'}
        <button class="btn-sm btn-gray" style="margin-left:auto;font-size:11px;padding:4px 10px"
                onclick="toggleSupplierEdit()">ìì </button>
      </div>
      <div style="padding:12px 16px;font-size:13px;line-height:1.8">
        <div><strong>ì¬ììë²í¸:</strong> ${escapeHtml(sup.supplier_biz_no || '-')}</div>
        <div><strong>ìí¸:</strong> ${escapeHtml(sup.supplier_name || '-')} &nbsp;|&nbsp; <strong>ëíì:</strong> ${escapeHtml(sup.supplier_ceo || '-')}</div>
        <div><strong>ì£¼ì:</strong> ${escapeHtml(sup.supplier_address || '-')}</div>
        <div><strong>ìí:</strong> ${escapeHtml(sup.supplier_biz_type || '-')} &nbsp;|&nbsp; <strong>ì¢ëª©:</strong> ${escapeHtml(sup.supplier_biz_item || '-')}</div>
        <div><strong>ì´ë©ì¼:</strong> ${escapeHtml(sup.supplier_email || '-')}</div>
      </div>
      <div id="taxSupplierEditForm" style="display:none;padding:0 16px 16px">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ì¬ììë±ë¡ë²í¸ *</label>
            <input type="text" id="taxSupBizNo" class="form-input" value="${escapeHtml(sup.supplier_biz_no || '')}" placeholder="000-00-00000">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ìí¸ *</label>
            <input type="text" id="taxSupName" class="form-input" value="${escapeHtml(sup.supplier_name || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ëíì *</label>
            <input type="text" id="taxSupCeo" class="form-input" value="${escapeHtml(sup.supplier_ceo || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ì´ë©ì¼</label>
            <input type="email" id="taxSupEmail" class="form-input" value="${escapeHtml(sup.supplier_email || '')}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:10px">
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label style="font-size:12px">ì£¼ì</label>
            <input type="text" id="taxSupAddr" class="form-input" value="${escapeHtml(sup.supplier_address || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ìí</label>
            <input type="text" id="taxSupBizType" class="form-input" value="${escapeHtml(sup.supplier_biz_type || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">ì¢ëª©</label>
            <input type="text" id="taxSupBizItem" class="form-input" value="${escapeHtml(sup.supplier_biz_item || '')}">
          </div>
        </div>
        <div style="text-align:right;margin-top:12px">
          <button class="btn-sm btn-gray" onclick="toggleSupplierEdit()">ì·¨ì</button>
          <button class="btn-sm btn-blue" onclick="saveTaxSupplierForm()" style="margin-left:6px">ì ì¥</button>
        </div>
      </div>
    </div>

    <!-- ìë³ ë°í ëì -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">ð ${month.split('-')[1]}ì ì¸ê¸ê³ì°ì ë°í ëì</span>
        ${monthSelectorHTML(month, 'changeTaxMonth')}
      </div>

      <div style="padding:8px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;border-bottom:1px solid var(--border,#e5e7eb)">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" ${_tax.vatInclusive ? 'checked' : ''} onchange="toggleTaxVat(this.checked)">
          ê³ì½ê¸ì¡ ë¶ê°ì¸ í¬í¨
        </label>
        <label style="display:flex;align-items:center;gap:4px">
          íëª©ëª:
          <input type="text" value="${escapeHtml(_tax.itemName)}" class="form-input"
                 style="width:120px;padding:3px 8px;font-size:12px"
                 onchange="changeTaxItemName(this.value)">
        </label>
        ${missCnt > 0 ? '<span style="color:var(--red,#ef4444);font-weight:600">â ï¸ ì¸ê¸ì ë³´ ë¯¸ë±ë¡ ' + missCnt + 'ê±´</span>' : ''}
      </div>

      ${cnt > 0 ? _buildTaxTargetTable(targets, sumS, sumT, sumA) : `
      <div class="empty-state" style="padding:32px 20px">
        <div class="empty-icon">ð</div>
        <p>${month}ì ì ì° ë°ì´í°ê° ììµëë¤.<br>ëìë³´ëìì ì ì¼ì ì ë¨¼à  ìì±í´ì£¼ì¸ì.</p>
      </div>`}
    </div>

    <!-- ì ì²´ ìì²´ ì¸ê¸ì ë³´ íí© -->
    <div class="dash-summary-box" style="margin-top:20px">
      <div class="dash-box-header">
        <span class="dash-box-title">ð ìì²´ë³ ì¸ê¸ì ë³´ íí©</span>
        <span class="text-muted" style="font-size:12px">${allReg}/${allCo.length} ë±ë¡</span>
      </div>
      ${_buildTaxStatusTable(allCo)}
    </div>

    ${!canDL ? _buildTaxWarning(supOk, missCnt, cnt) : ''}
  `;
}

// ââ PC íì´ë¸ + ëª¨ë°ì¼ ì¹´ë (ë°í ëì) ââ

function _buildTaxTargetTable(targets, sumS, sumT, sumA) {
  // PC íì´ë¸
  const rows = targets.map(t => `<tr>
    <td style="font-weight:600">${escapeHtml(t.companyName)}</td>
    <td style="font-size:12px;font-family:monospace">${escapeHtml(t.bizNo || '-')}</td>
    <td>${escapeHtml(t.ceoName || '-')}</td>
    <td style="text-align:right;font-size:12px">${fmt(t.billedAmount)}</td>
    <td style="text-align:right;font-weight:600">${fmt(t.supply)}</td>
    <td style="text-align:right;color:var(--orange,#f59e0b)">${fmt(t.tax)}</td>
    <td style="text-align:right;font-weight:600;color:var(--primary,#3b82f6)">${fmt(t.total)}</td>
    <td>${t.hasTaxInfo
      ? '<span class="badge badge-done">ë±ë¡</span>'
      : '<span class="badge badge-warn">ë¯¸ë±ë¡</span>'}</td>
    <td><button class="btn-sm btn-gray" style="font-size:10px;padding:3px 8px"
                onclick="openTaxInfoModal('${t.companyId}')">ìì </button></td>
  </tr>`).join('');

  const footer = `<tr style="font-weight:700;background:var(--bg2,#f9fafb)">
    <td colspan="3">í©ê³ (${targets.length}ê±´)</td>
    <td style="text-align:right">${fmt(targets.reduce((s, t) => s + t.billedAmount, 0))}</td>
    <td style="text-align:right">${fmt(sumS)}</td>
    <td style="text-align:right;color:var(--orange,#f59e0b)">${fmt(sumT)}</td>
    <td style="text-align:right;color:var(--primary,#3b82f6)">${fmt(sumA)}</td>
    <td colspan="2"></td>
  </tr>`;

  const table = `<div class="table-wrap">
    <table>
      <thead><tr>
        <th>ìì²´ëª</th><th>ì¬ììë²í¸</th><th>ëíì</th><th>ê³ì½ê¸ì¡</th>
        <th>ê³µê¸ê°ì¡</th><th>ì¸ì¡</th><th>í¨
ê³</th><th>ìí</th><th></th>
      </tr></thead>
      <tbody>${rows}${footer}</tbody>
    </table>
  </div>`;

  // ëª¨ë°ì¼ ì¹´ë
  const cards = `<div class="dash-box-cards-mobile">
    ${targets.map(t => `
  <div class="card" style="padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:13px">${escapeHtml(t.companyName)}</span>
        ${t.hasTaxInfo
          ? '<span class="badge badge-done" style="font-size:10px">ë±ë¡</span>'
          : '<span class="badge badge-warn" style="font-size:10px">ë¯¸ë±ë¡</span>'}
      </div>
      <div style="font-size:12px;color:var(--text2,#6b7280);margin-top:4px">
        ${escapeHtml(t.bizNo || 'ì¬ììë²í¸ ë¯¸ë±ë¡')} Â· ${escapeHtml(t.ceoName || '-')}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
        <span>ê³µê¸ê°ì¡ <strong>${fmt(t.suupply)}</strong></span>
        <span style="color:var(--orange,#f59e0b)">ì¸ì¡ <strong>${fmt(t.tax)}</strong></span>
        <span style="color:var(--primary,#3b82f6);font-weight:600">${fmt(t.total)}ì</span>
      </div>
      <div style="text-align:right;margin-top:6px">
        <button class="btn-sm btn-gray" style="font-size:10px;padding:3px 8px"
                onclick="openTaxInfoModal('${t.companyId}')">ìì </button>
      </div>
    </div>`).join('')}
  </div>`;

  return table + cards;
}

// ââ ì ì²´ ìì²´ ì¸ê¸ì ë³´ íí© íì´ë¸ ââ

function _buildTaxStatusTable(allCo) {
  if (allCo.length === 0) {
    return '<div class="empty-state" style="padding:20px"><p>íì± ìì²´ê° ììµëë¤.</p></div>';
  }

  return `<div class="table-wrap" style="max-height:400px;overflow-y:auto">
    <table>
      <thead><tr>
        <th>ìì²´ëª</th><th>ì¬ììë²í¸</th><th>ëíì</th><th>ìí</th><th>ì¢ëª©</th><th>ì´ë©ì¼</th><th></th>
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
                      onclick="openTaxInfoModal('${c.id}')">${c.biz_no ? 'ìì ' : 'ë±ë¡'}</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ââ ê²½ê³  ë°ì¤ ââ

function _buildTaxWarning(supOk, missCnt, cnt) {
  const items = [];
  if (!supOk) items.push('ê³µê¸ì(ì°ë¦¬ íì¬) ì¬ììë²í¸ì ëíìë¥¼ ë±ë¡í´ì£¼ì¸ì');
  if (missCnt > 0) items.push('ì¸ê¸ì ë³´ ë¯¸ë±ë¡ ìì²´ ' + missCnt + 'ê±´ì ë±ë¡í´ì£¼ì¸ì');
  if (cnt === 0) items.push('ì´ ë¬ì ì ì° ë°ì´í°ê° ììµëë¤');
  if (items.length === 0) return '';

  return `<div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;font-size:13px">
    <strong>â ï¸ ìì ë¤ì´ë¡ë ì¡°ê±´:</strong>
    <div style="margin-top:6px">${items.map(i => 'â¢ ' + i).join('<br>')}</div>
  </div>`;
}


// âââ ì´ë²¤í¸ í¸ë¤ë¬ âââ

async function changeTaxMonth(month) {
  _tax.month = month;
  try {
    await ensureMonthData(month);
    renderTaxInvoiceHTML();
  } catch (e) {
    console.error('changeTaxMonth:', e);
    toast('ì¤ë¥ê° ë°ìíìµëë¤', 'error');
  }
}

function toggleTaxVat(checked) {
  _tax.vatInclusive = checked;
  renderTaxInvoiceHTML();
}

function changeTaxItemName(name) {
  _tax.itemName = name || 'ì²­ìì©ì­';
}

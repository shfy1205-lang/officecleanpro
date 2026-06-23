/**
 * staff-supplies.js - ì§ì ë¬¼íìì²­ ëª¨ë
 * íì¥ë³ ë¬¼í ìì²­(ì²´í¬ë°ì¤) + ë©ëª¨ + ìì²­ ë´ì­ ì¡°í
 */

var staffSupplyRequests = [];

// âââ CSS ì£¼ì âââ

function injectStaffSupplyStyles() {
  if (document.getElementById('staffSupplyStyleTag')) return;
  var style = document.createElement('style');
  style.id = 'staffSupplyStyleTag';
  style.textContent = ''
    + '.supply-form{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}'
    + '.supply-form h3{margin:0 0 16px;font-size:16px;font-weight:600}'
    + '.supply-select{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:16px;background:#fff}'
    + '.supply-items{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}'
    + '.supply-check{display:flex;align-items:center;gap:10px;padding:12px;background:#f8fafc;border-radius:8px;cursor:pointer}'
    + '.supply-check input[type="checkbox"]{width:20px;height:20px;accent-color:#3b82f6;cursor:pointer}'
    + '.supply-check label{font-size:14px;cursor:pointer;flex:1}'
    + '.supply-memo{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:vertical;min-height:60px;box-sizing:border-box}'
    + '.supply-submit{width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}'
    + '.supply-submit:disabled{background:#94a3b8;cursor:not-allowed}'
    + '.supply-history{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}'
    + '.supply-history h3{margin:0 0 16px;font-size:16px;font-weight:600}'
    + '.supply-card{padding:14px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px}'
    + '.supply-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}'
    + '.supply-card-company{font-weight:600;font-size:14px}'
    + '.supply-card-date{font-size:12px;color:#64748b}'
    + '.supply-card-items{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}'
    + '.supply-tag{background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:500}'
    + '.supply-card-memo{font-size:13px;color:#475569;background:#f8fafc;padding:8px 10px;border-radius:6px;margin-top:6px}'
    + '.supply-status{font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px}'
    + '.supply-status.pending{background:#fef3c7;color:#d97706}'
    + '.supply-status.completed{background:#dcfce7;color:#16a34a}'
    + '.supply-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}';
  document.head.appendChild(style);
}

// âââ ë ë âââ

async function renderStaffSupplies() {
  injectStaffSupplyStyles();
  await loadStaffSupplyRequests();

  var month = selectedMonth || currentMonth();
  var assigns = staffData.assignments.filter(function(a) { return a.month === month; });

  // ë°°ì  ìì²´ ëª©ë¡ (ì¤ë³µ ì ê±°)
  var seen = {};
  var companyOptions = [];
  assigns.forEach(function(a) {
    if (seen[a.company_id]) return;
    seen[a.company_id] = true;
    var comp = getCompanyById(a.company_id);
    if (comp) companyOptions.push({ id: comp.id, name: comp.name });
  });

  var html = '<div class="supply-form">';
  html += '<h3>ë¬¼í ìì²­</h3>';

  // ìì²´ ì í
  html += '<select class="supply-select" id="supplyCompany">';
  html += '<option value="">íì¥ì ì ííì¸ì</option>';
  companyOptions.forEach(function(c) {
    html += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
  });
  html += '</select>';

  // ì²´í¬ë°ì¤ ë¬¼í
  html += '<div class="supply-items">';
  html += '<div class="supply-check"><input type="checkbox" id="supItem1" value="ì¼ë°ì°ë ê¸°ë´í¬"><label for="supItem1">ì¼ë°ì°ë ê¸°ë´í¬</label></div>';
  html += '<div class="supply-check"><input type="checkbox" id="supItem2" value="ììë¬¼ì°ë ê¸°ë´í¬"><label for="supItem2">ììë¬¼ì°ë ê¸°ë´í¬</label></div>';
  html += '<div class="supply-check"><input type="checkbox" id="supItem3" value="ì¬íì© ë¹ëë´í¬"><label for="supItem3">ì¬íì© ë¹ëë´í¬</label></div>';
  html += '</div>';

  // ê¸°í ë©ëª¨
  html += '<textarea class="supply-memo" id="supplyMemo" placeholder="ê¸°í ìì²­ì¬í­ì ìë ¥íì¸ì (ì í)"></textarea>';

  // ì ì¶ ë²í¼
  html += '<button class="supply-submit" onclick="submitSupplyRequest()">ìì²­íê¸°</button>';
  html += '</div>';

  // ìì²­ ë´ì­
  html += '<div class="supply-history">';
  html += '<h3>ìì²­ ë´ì­</h3>';

  if (staffSupplyRequests.length === 0) {
    html += '<div class="supply-empty">ìì²­ ë´ì­ì´ ììµëë¤</div>';
  } else {
    staffSupplyRequests.forEach(function(req) {
      var comp = getCompanyById(req.company_id);
      var compName = comp ? escapeHtml(comp.name) : 'ì ì ìì';
      var statusClass = req.status === 'completed' ? 'completed' : 'pending';
      var statusText = req.status === 'completed' ? 'ì²ë¦¬ìë£' : 'ëê¸°ì¤';
      var date = new Date(req.created_at);
      var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + ' '
        + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');

      html += '<div class="supply-card">';
      html += '<div class="supply-card-header">';
      html += '<span class="supply-card-company">' + compName + '</span>';
      html += '<span class="supply-status ' + statusClass + '">' + statusText + '</span>';
      html += '</div>';

      if (req.items && req.items.length > 0) {
        html += '<div class="supply-card-items">';
        req.items.forEach(function(item) {
          html += '<span class="supply-tag">' + escapeHtml(item) + '</span>';
        });
        html += '</div>';
      }

      if (req.memo && req.memo.trim()) {
        html += '<div class="supply-card-memo">' + escapeHtml(req.memo) + '</div>';
      }

      html += '<div class="supply-card-date" style="margin-top:6px">' + dateStr + '</div>';
      html += '</div>';
    });
  }
  html += '</div>';

  $('mainContent').innerHTML = html;
}

// âââ ë°ì´í° ë¡ë âââ

async function loadStaffSupplyRequests() {
  try {
    var res = await sb.from('supply_requests')
      .select('*')
      .eq('worker_id', currentWorker.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (res.error) throw res.error;
    staffSupplyRequests = res.data || [];
  } catch (e) {
    console.error('loadStaffSupplyRequests error:', e);
    staffSupplyRequests = [];
  }
}

// âââ ìì²­ ì ì¶ âââ

async function submitSupplyRequest() {
  var companyId = document.getElementById('supplyCompany').value;
  if (!companyId) { alert('íì¥ì ì ííì¸ì'); return; }

  var items = [];
  var checks = document.querySelectorAll('.supply-check input[type="checkbox"]');
  checks.forEach(function(cb) { if (cb.checked) items.push(cb.value); });

  var memo = (document.getElementById('supplyMemo').value || '').trim();

  if (items.length === 0 && !memo) {
    alert('ìì²­í  ë¬¼íì ì ííê±°ë ê¸°í ìì²­ì í­ì ìë ¥íì¸ì');
    return;
  }

  var btn = document.querySelector('.supply-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'ìì²­ ì¤...'; }

  try {
    var res = await sb.from('supply_requests').insert({
      worker_id: currentWorker.id,
      company_id: companyId,
      items: items,
      memo: memo
    });
    if (res.error) throw res.error;

    alert('ë¬¼í ìì²­ì´ ìë£ëììµëë¤');
    renderStaffSupplies();
  } catch (e) {
    console.error('submitSupplyRequest error:', e);
    alert('ìì²­ ì¤í¨: ' + (e.message || 'ì ì ìë ì¤ë¥'));
    if (btn) { btn.disabled = false; btn.textContent = 'ìì²­íê¸°'; }
  }
}

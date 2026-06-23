/**
 * admin-supplies.js - ê´ë¦¬ì ë¬¼íìì²­ ê´ë¦¬ ëª¨ë
 * ìì²­ ëª©ë¡ ì¡°í + ì²ë¦¬ ìë£ + ìì½ ì¹´ë
 */

var supplyRequests = [];
var supplyFilter = 'all';

// âââ CSS ì£¼ì âââ

function injectSupplyStyles() {
  if (document.getElementById('supplyStyleTag')) return;
  var style = document.createElement('style');
  style.id = 'supplyStyleTag';
  style.textContent = ''
    + '.supply-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}'
    + '.supply-stat{background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1)}'
    + '.supply-stat-num{font-size:28px;font-weight:700}'
    + '.supply-stat-num.pending{color:#d97706}'
    + '.supply-stat-num.done{color:#16a34a}'
    + '.supply-stat-num.total{color:#3b82f6}'
    + '.supply-stat-label{font-size:13px;color:#64748b;margin-top:4px}'
    + '.supply-filters{display:flex;gap:8px;margin-bottom:16px}'
    + '.supply-filter-btn{padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;font-size:13px;cursor:pointer}'
    + '.supply-filter-btn.active{background:#3b82f6;color:#fff;border-color:#3b82f6}'
    + '.supply-list{display:flex;flex-direction:column;gap:10px}'
    + '.supply-admin-card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}'
    + '.supply-admin-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}'
    + '.supply-admin-info{flex:1}'
    + '.supply-admin-worker{font-weight:600;font-size:15px;margin-bottom:2px}'
    + '.supply-admin-company{font-size:13px;color:#64748b}'
    + '.supply-admin-date{font-size:12px;color:#94a3b8}'
    + '.supply-admin-items{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}'
    + '.supply-admin-tag{background:#eff6ff;color:#2563eb;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:500}'
    + '.supply-admin-memo{font-size:13px;color:#475569;background:#f8fafc;padding:8px 12px;border-radius:6px;margin-top:8px}'
    + '.supply-complete-btn{padding:8px 16px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}'
    + '.supply-complete-btn:hover{background:#15803d}'
    + '.supply-done-badge{padding:4px 12px;background:#dcfce7;color:#16a34a;border-radius:12px;font-size:12px;font-weight:600}'
    + '.supply-admin-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}'
    + '@media(max-width:640px){.supply-summary{gap:8px}.supply-stat{padding:12px 8px}.supply-stat-num{font-size:22px}}';
  document.head.appendChild(style);
}

// âââ ë ë âââ

async function renderSupplies() {
  injectSupplyStyles();
  await loadSupplyRequests();

  var pending = supplyRequests.filter(function(r) { return r.status === 'pending'; });
  var completed = supplyRequests.filter(function(r) { return r.status === 'completed'; });

  var html = '';

  // ìì½ ì¹´ë
  html += '<div class="supply-summary">';
  html += '<div class="supply-stat"><div class="supply-stat-num pending">' + pending.length + '</div><div class="supply-stat-label">ëê¸° ì¤</div></div>';
  html += '<div class="supply-stat"><div class="supply-stat-num done">' + completed.length + '</div><div class="supply-stat-label">ì²ë¦¬ ìë£</div></div>';
  html += '<div class="supply-stat"><div class="supply-stat-num total">' + supplyRequests.length + '</div><div class="supply-stat-label">ì ì²´</div></div>';
  html += '</div>';

  // íí° ë²í¼
  html += '<div class="supply-filters">';
  html += '<button class="supply-filter-btn' + (supplyFilter === 'all' ? ' active' : '') + '" onclick="filterSupplies(\'all\')">ì ì²´</button>';
  html += '<button class="supply-filter-btn' + (supplyFilter === 'pending' ? ' active' : '') + '" onclick="filterSupplies(\'pending\')">ëê¸° ì¤</button>';
  html += '<button class="supply-filter-btn' + (supplyFilter === 'completed' ? ' active' : '') + '" onclick="filterSupplies(\'completed\')">ì²ë¦¬ ìë£</button>';
  html += '</div>';

  // íí° ì ì©
  var filtered = supplyRequests;
  if (supplyFilter !== 'all') {
    filtered = supplyRequests.filter(function(r) { return r.status === supplyFilter; });
  }

  // ìì²­ ëª©ë¡
  html += '<div class="supply-list">';
  if (filtered.length === 0) {
    html += '<div class="supply-admin-empty">ìì²­ì´ ììµëë¤</div>';
  } else {
    filtered.forEach(function(req) {
      var workerName = getWorkerName(req.worker_id);
      var companyName = getCompanyName(req.company_id);
      var date = new Date(req.created_at);
      var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + ' '
        + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');

      html += '<div class="supply-admin-card">';
      html += '<div class="supply-admin-header">';
      html += '<div class="supply-admin-info">';
      html += '<div class="supply-admin-worker">' + escapeHtml(workerName) + '</div>';
      html += '<div class="supply-admin-company">' + escapeHtml(companyName) + '</div>';
      html += '<div class="supply-admin-date">' + dateStr + '</div>';
      html += '</div>';

      if (req.status === 'pending') {
        html += '<button class="supply-complete-btn" onclick="completeSupplyRequest(\'' + req.id + '\')">ì²ë¦¬ ìë£</button>';
      } else {
        html += '<span class="supply-done-badge">ì²ë¦¬ìë£</span>';
      }
      html += '</div>';

      if (req.items && req.items.length > 0) {
        html += '<div class="supply-admin-items">';
        req.items.forEach(function(item) {
          html += '<span class="supply-admin-tag">' + escapeHtml(item) + '</span>';
        });
        html += '</div>';
      }

      if (req.memo && req.memo.trim()) {
        html += '<div class="supply-admin-memo">' + escapeHtml(req.memo) + '</div>';
      }

      html += '</div>';
    });
  }
  html += '</div>';

  $('mainContent').innerHTML = html;
}

// âââ ë°ì´í° ë¡ë âââ

async function loadSupplyRequests() {
  try {
    var res = await sb.from('supply_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) throw res.error;
    supplyRequests = res.data || [];
  } catch (e) {
    console.error('loadSupplyRequests error:', e);
    supplyRequests = [];
  }
}

// âââ íí° ë³ê²½ âââ

function filterSupplies(filter) {
  supplyFilter = filter;
  renderSupplies();
}

// âââ ì²ë¦¬ ìë£ âââ

async function completeSupplyRequest(requestId) {
  if (!confirm('ì´ ìì²­ì ì²ë¦¬ ìë£ë¡ ë³ê²½íìê² ìµëê¹?')) return;

  try {
    var res = await sb.from('supply_requests')
      .update({
        status: 'completed',
        processed_by: currentWorker.id,
        processed_at: new Date().toISOString()
      })
      .eq('id', requestId);
    if (res.error) throw res.error;

    renderSupplies();
  } catch (e) {
    console.error('completeSupplyRequest error:', e);
    alert('ì²ë¦¬ ì¤í¨: ' + (e.message || 'ì ì ìë ì¤ë¥'));
  }
}

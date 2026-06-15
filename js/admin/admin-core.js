/**
 * admin-core.js - ê´ë¦¬ì íµì¬ ë¡ì§
 * ì ì­ ë³ì, ì´ê¸°í, ë°ì´í° ë¡ë, í­ ì í, ê´ë¦¬ì ì í¸
 * v2 - ì¹´íê³ ë¦¬ ë¤ë¹ê²ì´ì + ê¸ë¡ë² ê²ì + URL í´ì ë¼ì°í
 */

let adminData = {};
let _workerMap = null;
let _companyMap = null;
let selectedMonth = '';
let clientSearch = '';
let clientAreaFilter = '';
let requestFilter = 'all';
let noticeSearch = '';
let leadFilter = 'all';
let leadSearch = '';
let billingMonth = '';
let billingView = 'overview';
let revenueMonth = '';
let pendingQuoteLead = null;
let pendingLeadForCompany = null;
currentTab = 'dashboard';
let currentGroup = 'home';

// âââ ë¤ë¹ê²ì´ì ê·¸ë£¹ ì ì âââ

const NAV_GROUPS = {
  home:    { label: 'í',   icon: 'ð ', tabs: ['dashboard'] },
  ops:     { label: 'ì´ì', icon: 'ð', tabs: ['allClients', 'requests', 'notices', 'calendar'] },
  finance: { label: 'ì¬ë¬´', icon: 'ð°', tabs: ['billing', 'billingAlert', 'staffPay', 'revenue', 'prorate'] },
  sales:   { label: 'ìì', icon: 'ð', tabs: ['leads', 'quote', 'eco'] },
  mgmt:    { label: 'ê´ë¦¬', icon: 'âï¸', tabs: ['analysis', 'areaSummary', 'contacts', 'scheduleLog', 'changeLog'] },
};

const TAB_LABELS = {
  dashboard: 'ëìë³´ë', allClients: 'ìì²´ê´ë¦¬', requests: 'ìì²­ê´ë¦¬',
  notices: 'ê³µì§ê´ë¦¬', leads: 'ê²¬ì ê´ë¦¬', billing: 'ì ì°ê´ë¦¬',
  billingAlert: 'ë¯¸ìê²½ê³ ', staffPay: 'ë´ë¹ìê¸ì¬', areaSummary: 'êµ¬ì­ë³',
  revenue: 'ììµê´ë¦¬', analysis: 'AIë¶ì', calendar: 'ìºë¦°ë',
  scheduleLog: 'ìì±ë¡ê·¸', changeLog: 'ë³ê²½ì´ë ¥', contacts: 'ì°ë½ì²',
  quote: 'ê²¬ì ì', prorate: 'ì¼í ê³ì°', eco: 'ìì½ê´ë¦¬',
};

// í­ â ê·¸ë£¹ ì­ë§¤í (ìë ìì±)
const TAB_TO_GROUP = {};
Object.entries(NAV_GROUPS).forEach(([g, v]) => v.tabs.forEach(t => TAB_TO_GROUP[t] = g));

// âââ ì´ê¸°í âââ

async function initAdmin() {
  const msgEl = document.getElementById('loadingMsg');
  try {
    if (msgEl) msgEl.textContent = 'ì¸ì¦ íì¸ ì¤...';
    const ok = await requireAuth('admin');
    if (!ok) return;

    if (msgEl) msgEl.textContent = 'ë°ì´í° ë¡ë© ì¤...';
    selectedMonth = currentMonth();
    billingMonth = currentMonth();
    revenueMonth = currentMonth();
    $('userName').textContent = currentWorker.name;

    await Promise.race([
      loadAdminData(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ë°ì´í° ë¡ë© ìê° ì´ê³¼')), 10000))
    ]);

    $('loading').classList.add('hidden');
    $('app').style.display = 'block';

    // ìì½ ì¬ì©ì: ìì½ê´ë¦¬ í­ë§ íì
    if (isEcoUser()) {
      setupEcoOnlyView();
      return;
    }

    // URL í´ì ê¸°ë° ì´ê¸° í­ ê²°ì 
    handleHashRoute();
  } catch (e) {
    console.error('Admin init error:', e);
    if (msgEl) {
      msgEl.innerHTML = 'ì´ê¸°í ì¤ë¥: ' + escapeHtml(e.message || 'ì ì ìì')
        + '<br><a href="login.html" style="color:#60a5fa">ë¡ê·¸ì¸ íì´ì§ë¡ ì´ë</a>';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}

// âââ ë°ì´í° ë¡ë âââ

async function loadAdminData() {
  const results = await Promise.allSettled([
    sb.from('companies').select('*').order('name'),
    sb.from('company_financials').select('*'),
    sb.from('company_workers').select('*'),
    sb.from('workers').select('*').order('name'),
    sb.from('company_schedule').select('*'),
    sb.from('requests').select('*').order('created_at', { ascending: false }),
    sb.from('notices').select('*').order('created_at', { ascending: false }),
    sb.from('leads').select('*').order('created_at', { ascending: false }),
    sb.from('billing_records').select('*').order('month', { ascending: false }),
    sb.from('company_notes').select('id, company_id, special_notes, parking_info, recycling_location, staff_message'),
    sb.from('pay_confirmations').select('*'),
  ]);

  const get = (i) => results[i].status === 'fulfilled' ? (results[i].value.data || []) : [];

  adminData.companies        = get(0);
  adminData.financials       = get(1);
  adminData.assignments      = get(2);
  adminData.workers          = get(3);
  adminData.schedules        = get(4);
  adminData.requests         = get(5);
  adminData.notices          = get(6);
  adminData.leads            = get(7);
  adminData.billings         = get(8);
  adminData.notes            = get(9);
  adminData.payConfirmations = get(10);
  _workerMap = null; _companyMap = null;

  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`loadAdminData query[${i}] failed:`, r.reason);
  });
}

// âââ ìë³ ë°ì´í° ìë ìì± âââ

async function ensureMonthData(month) {
  const hasFinancials = adminData.financials.some(f => f.month === month);
  const hasAssignments = adminData.assignments.some(a => a.month === month);
  if (hasFinancials && hasAssignments) return;

  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();
  const prevMonth = allMonths.find(m => m < month);
  if (!prevMonth) return;

  let inserted = false;

  const excludeCompanyIds = new Set(
    adminData.companies
      .filter(c => {
        if (c.status === 'paused' && c.paused_at) {
          return month > c.paused_at.substring(0, 7);
        }
        if (c.status === 'paused') return true;
        if (c.status === 'terminated' && c.terminated_at) {
          return month > c.terminated_at.substring(0, 7);
        }
        return false;
      })
      .map(c => c.id)
  );

  if (!hasFinancials) {
    const prevFins = adminData.financials.filter(f => f.month === prevMonth && !excludeCompanyIds.has(f.company_id));
    if (prevFins.length > 0) {
      const newFins = prevFins.map(f => ({
        company_id: f.company_id, month: month,
        contract_amount: f.contract_amount, ocp_amount: f.ocp_amount,
        eco_amount: f.eco_amount, worker_pay_total: f.worker_pay_total, memo: f.memo,
      }));
      const { error } = await sb.from('company_financials').insert(newFins);
      if (error && error.code !== '23505') console.error('ensureMonthData financials error:', error);
      else inserted = true;
    }
  }

  if (!hasAssignments) {
    const prevAssigns = adminData.assignments.filter(a => a.month === prevMonth && !excludeCompanyIds.has(a.company_id));
    if (prevAssigns.length > 0) {
      const newAssigns = prevAssigns.map(a => ({
        company_id: a.company_id, worker_id: a.worker_id,
        month: month, pay_amount: a.pay_amount, share: a.share,
      }));
      const { error } = await sb.from('company_workers').insert(newAssigns);
      if (error && error.code !== '23505') console.error('ensureMonthData assignments error:', error);
      else inserted = true;
    }
  }

  if (inserted) await loadAdminData();
}

// âââ ìì½ ì ì© ë·° âââ

function setupEcoOnlyView() {
  var navCat = document.getElementById('navCategories');
  if (navCat) navCat.style.display = 'none';
  var subTabs = document.getElementById('subTabs');
  if (subTabs) subTabs.style.display = 'none';

  var h2 = document.querySelector('.navbar h2');
  if (h2) h2.textContent = 'ìì½ì¤í¼ì¤í´ë¦°';

  if (typeof ecoMonth !== 'undefined') { ecoMonth = ecoMonth || selectedMonth; }
  else { window.ecoMonth = selectedMonth; }
  renderEco();
}

// âââ ì¹´íê³ ë¦¬ ì í âââ

function switchGroup(groupName, el) {
  var group = NAV_GROUPS[groupName];
  if (!group) return;
  var targetTab = group.tabs.includes(currentTab) ? currentTab : group.tabs[0];
  switchTab(targetTab);
}

// âââ í­ ì í (íµì¬ ë¤ë¹ê²ì´ì í¨ì) âââ

function switchTab(tabName, el) {
  var groupName = TAB_TO_GROUP[tabName];
  if (!groupName) return;
  var group = NAV_GROUPS[groupName];
  var subTabsEl = document.getElementById('subTabs');
  var groupChanged = (groupName !== currentGroup);

  // 1. ì¹´íê³ ë¦¬ íì± ìí ìë°ì´í¸
  if (groupChanged) {
    document.querySelectorAll('.nav-cat').forEach(function(c) { c.classList.remove('active'); });
    var catBtn = document.querySelector('.nav-cat[data-group="' + groupName + '"]');
    if (catBtn) catBtn.classList.add('active');
    currentGroup = groupName;
  }

  // 2. ìë¸í­ ìë°ì´í¸
  if (group.tabs.length === 1) {
    // ë¨ì¼ í­ ê·¸ë£¹ (í) â ìë¸í­ ì¨ê¹
    subTabsEl.style.display = 'none';
  } else {
    subTabsEl.style.display = 'flex';
    if (groupChanged) {
      // ê·¸ë£¹ì´ ë°ëë©´ ìë¸í­ ë¤ì ë¹ë
      subTabsEl.innerHTML = group.tabs.map(function(t) {
        return '<button class="tab' + (t === tabName ? ' active' : '') + '" onclick="switchTab(\'' + t + '\',this)">' + TAB_LABELS[t] + '</button>';
      }).join('');
    } else {
      // ê°ì ê·¸ë£¹ ë´ â íì± ìíë§ ë³ê²½
      if (el && subTabsEl.contains(el)) {
        subTabsEl.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        el.classList.add('active');
      } else {
        var idx = group.tabs.indexOf(tabName);
        subTabsEl.querySelectorAll('.tab').forEach(function(t, i) {
          t.classList.toggle('active', i === idx);
        });
      }
    }
  }

  // 3. ìí + URL í´ì ìë°ì´í¸
  currentTab = tabName;
  if (location.hash !== '#' + tabName) {
    history.pushState(null, '', '#' + tabName);
  }

  // 4. ë ëë§
  var renderers = {
    dashboard:    renderDashboard,
    allClients:   renderAllClients,
    requests:     renderRequests,
    notices:      renderNotices,
    leads:        renderLeads,
    billing:      renderBilling,
    billingAlert: renderBillingAlert,
    staffPay:     renderStaffPay,
    areaSummary:  renderAreaSummary,
    revenue:      renderRevenue,
    analysis:     renderAnalysis,
    calendar:     renderCalendar,
    scheduleLog:  renderScheduleLog,
    changeLog:    renderChangeLog,
    contacts:     renderContacts,
    quote:        renderQuote,
    prorate:      renderProrate,
    eco:          renderEco,
  };
  if (renderers[tabName]) renderers[tabName]();
}

// âââ URL í´ì ë¼ì°í âââ

function handleHashRoute() {
  var hash = location.hash.replace('#', '') || 'dashboard';
  var tabName = TAB_LABELS[hash] ? hash : 'dashboard';
  // switchTabì´ ê·¸ë£¹ ì í + ìë¸í­ ë¹ë + ë ëë§ ëª¨ë ì²ë¦¬
  switchTab(tabName);
}

window.addEventListener('popstate', handleHashRoute);

// âââ ê¸ë¡ë² ê²ì âââ

var _searchFocusIdx = 0;

function openSearch() {
  document.getElementById('searchOverlay').classList.add('show');
  var input = document.getElementById('searchInput');
  input.value = '';
  input.focus();
  _searchFocusIdx = 0;
  renderSearchResults('');
}

function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('show');
}

function renderSearchResults(query) {
  var container = document.getElementById('searchResults');
  var q = query.toLowerCase().trim();
  var items = [];

  // í­/ë©ë´ ê²ì
  Object.keys(TAB_LABELS).forEach(function(key) {
    var label = TAB_LABELS[key];
    if (!q || label.toLowerCase().indexOf(q) !== -1 || key.toLowerCase().indexOf(q) !== -1) {
      var group = NAV_GROUPS[TAB_TO_GROUP[key]];
      items.push({ type: 'tab', key: key, icon: group ? group.icon : 'ð', label: label, sub: group ? group.label : '', pri: q ? 1 : 0 });
    }
  });

  if (q) {
    // ìì²´ ê²ì
    (adminData.companies || []).forEach(function(c) {
      if (c.name && c.name.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: 'company', key: c.id, icon: 'ð¢', label: c.name, sub: c.area_name || '', pri: 2 });
      }
    });
    // ì§ì ê²ì
    (adminData.workers || []).forEach(function(w) {
      if (w.name && w.name.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: 'worker', key: w.id, icon: 'ð¤', label: w.name, sub: w.role === 'admin' ? 'ê´ë¦¬ì' : 'ì§ì', pri: 2 });
      }
    });
  }

  items.sort(function(a, b) { return a.pri - b.pri; });

  if (items.length === 0) {
    container.innerHTML = '<div class="search-empty">ê²ì ê²°ê³¼ ìì</div>';
    return;
  }

  _searchFocusIdx = 0;
  container.innerHTML = items.slice(0, 20).map(function(item, i) {
    return '<div class="search-item' + (i === 0 ? ' focused' : '') + '" data-type="' + item.type + '" data-key="' + item.key + '" data-idx="' + i + '" onclick="searchGo(this)" onmouseenter="focusSearchItem(' + i + ')">'
      + '<span class="search-item-icon">' + item.icon + '</span>'
      + '<span class="search-item-label">' + escapeHtml(item.label) + '</span>'
      + '<span class="search-item-sub">' + escapeHtml(item.sub) + '</span>'
      + '</div>';
  }).join('');
}

function focusSearchItem(idx) {
  _searchFocusIdx = idx;
  document.querySelectorAll('.search-item').forEach(function(el, i) {
    el.classList.toggle('focused', i === idx);
  });
}

function searchGo(el) {
  var type = el.getAttribute('data-type');
  var key = el.getAttribute('data-key');
  closeSearch();

  if (type === 'tab') {
    location.hash = key;
  } else if (type === 'company') {
    // ìì²´ê´ë¦¬ í­ì¼ë¡ ì´ë í í´ë¹ ìì²´ ê²ì
    clientSearch = getCompanyName(key);
    location.hash = 'allClients';
  } else if (type === 'worker') {
    location.hash = 'staffPay';
  }
}

// í¤ë³´ë ë¨ì¶í¤
document.addEventListener('keydown', function(e) {
  // Ctrl+K / Cmd+K â ê²ì ì´ê¸°
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }

  var overlay = document.getElementById('searchOverlay');
  if (!overlay || !overlay.classList.contains('show')) return;

  if (e.key === 'Escape') {
    closeSearch();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    var allItems = document.querySelectorAll('.search-item');
    if (!allItems.length) return;
    _searchFocusIdx += (e.key === 'ArrowDown' ? 1 : -1);
    _searchFocusIdx = Math.max(0, Math.min(allItems.length - 1, _searchFocusIdx));
    focusSearchItem(_searchFocusIdx);
    allItems[_searchFocusIdx].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    var focused = document.querySelector('.search-item.focused');
    if (focused) searchGo(focused);
  }
});

// âââ ê´ë¦¬ì ì í¸ âââ

function getWorkerName(workerId) {
  if (!_workerMap) {
    _workerMap = {};
    adminData.workers.forEach(function(w) { _workerMap[w.id] = w.name; });
  }
  return _workerMap[workerId] || 'ì ì ìì';
}

function getCompanyName(companyId) {
  if (!_companyMap) {
    _companyMap = {};
    adminData.companies.forEach(function(c) { _companyMap[c.id] = c.name; });
  }
  return _companyMap[companyId] || 'ì ì ìì';
}

function getActiveWorkers() {
  return adminData.workers.filter(function(w) { return w.status === 'active' && w.role === 'staff'; });
}

function getCompanySchedules(companyId) {
  return adminData.schedules
    .filter(function(s) { return s.company_id === companyId && s.is_active; })
    .sort(function(a, b) { return a.weekday - b.weekday; });
}

function getCompanyAssignments(companyId, month) {
  return adminData.assignments.filter(function(a) {
    return a.company_id === companyId && a.month === month;
  });
}

function getUniqueAreas() {
  var areas = new Set();
  adminData.companies.forEach(function(c) { if (c.area_name) areas.add(c.area_name); });
  return [...areas].sort();
}

/**
 * admin-core.js - 관리자 핵심 로직
 * 전역 변수, 초기화, 데이터 로드, 탭 전환, 관리자 유틸
 * v2 - 카테고리 네비게이션 + 글로벌 검색 + URL 해시 라우팅
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

// ─── 네비게이션 그룹 정의 ───

const NAV_GROUPS = {
  home:    { label: '홈',   icon: '🏠', tabs: ['dashboard'] },
  ops:     { label: '운영', icon: '📋', tabs: ['allClients', 'requests', 'notices', 'calendar'] },
  finance: { label: '재무', icon: '💰', tabs: ['billing', 'billingAlert', 'staffPay', 'revenue', 'prorate'] },
  sales:   { label: '영업', icon: '📊', tabs: ['leads', 'quote', 'eco'] },
  mgmt:    { label: '관리', icon: '⚙️', tabs: ['analysis', 'areaSummary', 'contacts', 'scheduleLog', 'changeLog'] },
};

const TAB_LABELS = {
  dashboard: '대시보드', allClients: '업체관리', requests: '요청관리',
  notices: '공지관리', leads: '견적관리', billing: '정산관리',
  billingAlert: '미수경고', staffPay: '담당자급여', areaSummary: '구역별',
  revenue: '수익관리', analysis: 'AI분석', calendar: '캘린더',
  scheduleLog: '생성로그', changeLog: '변경이력', contacts: '연락처',
  quote: '견적서', prorate: '일할계산', eco: '에코관리',
};

// 탭 → 그룹 역매핑 (자동 생성)
const TAB_TO_GROUP = {};
Object.entries(NAV_GROUPS).forEach(([g, v]) => v.tabs.forEach(t => TAB_TO_GROUP[t] = g));

// ─── 초기화 ───

async function initAdmin() {
  const msgEl = document.getElementById('loadingMsg');
  try {
    if (msgEl) msgEl.textContent = '인증 확인 중...';
    const ok = await requireAuth('admin');
    if (!ok) return;

    if (msgEl) msgEl.textContent = '데이터 로딩 중...';
    selectedMonth = currentMonth();
    billingMonth = currentMonth();
    revenueMonth = currentMonth();
    $('userName').textContent = currentWorker.name;

    await Promise.race([
      loadAdminData(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('데이터 로딩 시간 초과')), 10000))
    ]);

    $('loading').classList.add('hidden');
    $('app').style.display = 'block';

    // 에코 사용자: 에코관리 탭만 표시
    if (isEcoUser()) {
      setupEcoOnlyView();
      return;
    }

    // URL 해시 기반 초기 탭 결정
    handleHashRoute();
  } catch (e) {
    console.error('Admin init error:', e);
    if (msgEl) {
      msgEl.innerHTML = '초기화 오류: ' + escapeHtml(e.message || '알 수 없음')
        + '<br><a href="login.html" style="color:#60a5fa">로그인 페이지로 이동</a>';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}

// ─── 데이터 로드 ───

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

// ─── 월별 데이터 자동 생성 ───

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

// ─── 에코 전용 뷰 ───

function setupEcoOnlyView() {
  var navCat = document.getElementById('navCategories');
  if (navCat) navCat.style.display = 'none';
  var subTabs = document.getElementById('subTabs');
  if (subTabs) subTabs.style.display = 'none';

  var h2 = document.querySelector('.navbar h2');
  if (h2) h2.textContent = '에코오피스클린';

  if (typeof ecoMonth !== 'undefined') { ecoMonth = ecoMonth || selectedMonth; }
  else { window.ecoMonth = selectedMonth; }
  renderEco();
}

// ─── 카테고리 전환 ───

function switchGroup(groupName, el) {
  var group = NAV_GROUPS[groupName];
  if (!group) return;
  var targetTab = group.tabs.includes(currentTab) ? currentTab : group.tabs[0];
  switchTab(targetTab);
}

// ─── 탭 전환 (핵심 네비게이션 함수) ───

function switchTab(tabName, el) {
  var groupName = TAB_TO_GROUP[tabName];
  if (!groupName) return;
  var group = NAV_GROUPS[groupName];
  var subTabsEl = document.getElementById('subTabs');
  var groupChanged = (groupName !== currentGroup);

  // 1. 카테고리 활성 상태 업데이트
  if (groupChanged) {
    document.querySelectorAll('.nav-cat').forEach(function(c) { c.classList.remove('active'); });
    var catBtn = document.querySelector('.nav-cat[data-group="' + groupName + '"]');
    if (catBtn) catBtn.classList.add('active');
    currentGroup = groupName;
  }

  // 2. 서브탭 업데이트
  if (group.tabs.length === 1) {
    // 단일 탭 그룹 (홈) — 서브탭 숨김
    subTabsEl.style.display = 'none';
  } else {
    subTabsEl.style.display = 'flex';
    if (groupChanged) {
      // 그룹이 바뀌면 서브탭 다시 빌드
      subTabsEl.innerHTML = group.tabs.map(function(t) {
        return '<button class="tab' + (t === tabName ? ' active' : '') + '" onclick="switchTab(\'' + t + '\',this)">' + TAB_LABELS[t] + '</button>';
      }).join('');
    } else {
      // 같은 그룹 내 — 활성 상태만 변경
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

  // 3. 상태 + URL 해시 업데이트
  currentTab = tabName;
  if (location.hash !== '#' + tabName) {
    history.pushState(null, '', '#' + tabName);
  }

  // 4. 렌더링
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

// ─── URL 해시 라우팅 ───

function handleHashRoute() {
  var hash = location.hash.replace('#', '') || 'dashboard';
  var tabName = TAB_LABELS[hash] ? hash : 'dashboard';
  // switchTab이 그룹 전환 + 서브탭 빌드 + 렌더링 모두 처리
  switchTab(tabName);
}

window.addEventListener('popstate', handleHashRoute);

// ─── 글로벌 검색 ───

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

  // 탭/메뉴 검색
  Object.keys(TAB_LABELS).forEach(function(key) {
    var label = TAB_LABELS[key];
    if (!q || label.toLowerCase().indexOf(q) !== -1 || key.toLowerCase().indexOf(q) !== -1) {
      var group = NAV_GROUPS[TAB_TO_GROUP[key]];
      items.push({ type: 'tab', key: key, icon: group ? group.icon : '📑', label: label, sub: group ? group.label : '', pri: q ? 1 : 0 });
    }
  });

  if (q) {
    // 업체 검색
    (adminData.companies || []).forEach(function(c) {
      if (c.name && c.name.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: 'company', key: c.id, icon: '🏢', label: c.name, sub: c.area_name || '', pri: 2 });
      }
    });
    // 직원 검색
    (adminData.workers || []).forEach(function(w) {
      if (w.name && w.name.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: 'worker', key: w.id, icon: '👤', label: w.name, sub: w.role === 'admin' ? '관리자' : '직원', pri: 2 });
      }
    });
  }

  items.sort(function(a, b) { return a.pri - b.pri; });

  if (items.length === 0) {
    container.innerHTML = '<div class="search-empty">검색 결과 없음</div>';
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
    // 업체관리 탭으로 이동 후 해당 업체 검색
    clientSearch = getCompanyName(key);
    location.hash = 'allClients';
  } else if (type === 'worker') {
    location.hash = 'staffPay';
  }
}

// 키보드 단축키
document.addEventListener('keydown', function(e) {
  // Ctrl+K / Cmd+K → 검색 열기
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

// ─── 관리자 유틸 ───

function getWorkerName(workerId) {
  if (!_workerMap) {
    _workerMap = {};
    adminData.workers.forEach(function(w) { _workerMap[w.id] = w.name; });
  }
  return _workerMap[workerId] || '알 수 없음';
}

function getCompanyName(companyId) {
  if (!_companyMap) {
    _companyMap = {};
    adminData.companies.forEach(function(c) { _companyMap[c.id] = c.name; });
  }
  return _companyMap[companyId] || '알 수 없음';
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

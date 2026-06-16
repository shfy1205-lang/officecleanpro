/**
 * admin-workers.js - 직원 관리 탭
 * 직원 목록/구역별 뷰, 직원 상세 (담당 업체 확장 카드), 주소→지도 연동
 */

let _workersView = 'list';       // 'list' | 'detail'
let _workersListMode = 'all';    // 'all' | 'area'
let _workersDetailId = null;
let _workersExpandedCo = {};
let _workersExpandedWorker = {};  // 구역별 뷰에서 직원 펼침
let _workersSearch = '';
let _workersStatusFilter = '';
let _workersSortBy = 'name';
let _workersSelectedArea = '';    // 구역별 뷰 선택된 구역
let _mapPopupOpen = null;        // 열린 지도 팝업 companyId

// ─── 지도 연동 ───

function getDefaultMapApp() {
  try { return localStorage.getItem('ocp_default_map') || ''; } catch(e) { return ''; }
}

function setDefaultMapApp(app) {
  try { localStorage.setItem('ocp_default_map', app); } catch(e) {}
}

function openMapForAddress(address, companyId) {
  if (!address) return;
  var defaultApp = getDefaultMapApp();
  if (defaultApp) {
    launchMapApp(defaultApp, address);
    return;
  }
  if (_mapPopupOpen === companyId) {
    _mapPopupOpen = null;
  } else {
    _mapPopupOpen = companyId;
  }
  if (_workersView === 'detail') {
    renderWorkerDetail();
  } else {
    renderWorkersList();
  }
}

function launchMapApp(app, address) {
  var encoded = encodeURIComponent(address);
  var url = '';
  if (app === 'naver') {
    url = 'https://map.naver.com/v5/search/' + encoded;
  } else if (app === 'kakao') {
    url = 'https://map.kakao.com/?q=' + encoded;
  } else {
    url = 'https://www.google.com/maps/search/?api=1&query=' + encoded;
  }
  window.open(url, '_blank');
  _mapPopupOpen = null;
}

function selectMapApp(app, address, setDefault) {
  if (setDefault) setDefaultMapApp(app);
  launchMapApp(app, address);
  if (_workersView === 'detail') {
    renderWorkerDetail();
  } else {
    renderWorkersList();
  }
}

function resetDefaultMap() {
  try { localStorage.removeItem('ocp_default_map'); } catch(e) {}
  toast('기본 지도 앱 설정이 초기화되었습니다');
}

function renderMapPopup(address, companyId) {
  if (_mapPopupOpen !== companyId) return '';
  var escaped = escapeHtml(address).replace(/'/g, '&#39;');
  return '<div class="wk-map-popup" onclick="event.stopPropagation()">'
    + '<div class="wk-map-popup-title">지도에서 열기</div>'
    + '<button class="wk-map-option naver" onclick="selectMapApp(\'naver\',\'' + escaped + '\',false)">'
    + '<span class="wk-map-option-icon">N</span>'
    + '<span class="wk-map-option-info"><span class="wk-map-option-name">네이버 지도</span><span class="wk-map-option-sub">앱 또는 웹</span></span>'
    + '</button>'
    + '<button class="wk-map-option kakao" onclick="selectMapApp(\'kakao\',\'' + escaped + '\',false)">'
    + '<span class="wk-map-option-icon">K</span>'
    + '<span class="wk-map-option-info"><span class="wk-map-option-name">카카오맵</span><span class="wk-map-option-sub">앱 또는 웹</span></span>'
    + '</button>'
    + '<button class="wk-map-option google" onclick="selectMapApp(\'google\',\'' + escaped + '\',false)">'
    + '<span class="wk-map-option-icon">G</span>'
    + '<span class="wk-map-option-info"><span class="wk-map-option-name">구글 지도</span><span class="wk-map-option-sub">웹에서 열기</span></span>'
    + '</button>'
    + '<div class="wk-map-popup-footer">'
    + '<label class="wk-map-default-label">'
    + '<input type="checkbox" id="mapDefaultChk_' + companyId + '"> 선택한 앱을 기본으로 설정'
    + '</label>'
    + '</div>'
    + '</div>';
}

function renderAddressLink(address, companyId) {
  if (!address) return '<span class="wk-dv">-</span>';
  var escaped = escapeHtml(address).replace(/'/g, '&#39;');
  return '<span class="wk-addr-wrap">'
    + '<a class="wk-addr-link" onclick="event.stopPropagation();openMapForAddress(\'' + escaped + '\',\'' + companyId + '\')">'
    + '📍 ' + escapeHtml(address) + ' ↗'
    + '</a>'
    + renderMapPopup(address, companyId)
    + '</span>';
}

// ─── 데이터 계산 ───

function calcWorkersData() {
  var month = selectedMonth;
  var workers = (adminData.workers || []).filter(function(w) { return w.role === 'staff'; });
  var assignments = (adminData.assignments || []).filter(function(a) { return a.month === month; });
  var finMap = buildFinMap(adminData.financials, month);

  var rows = workers.map(function(w) {
    var wAssigns = assignments.filter(function(a) { return a.worker_id === w.id; });
    var totalPay = 0;
    var totalContract = 0;
    var weeklyCount = 0;
    var areas = new Set();

    var companies = wAssigns.map(function(a) {
      var co = (adminData.companies || []).find(function(c) { return c.id === a.company_id; });
      var fin = finMap[a.company_id] || {};
      var schedules = getCompanySchedules(a.company_id);
      var note = (adminData.notes || []).find(function(n) { return n.company_id === a.company_id; });
      var pay = a.pay_amount || 0;
      var contract = fin.contract_amount || 0;
      var ocp = fin.ocp_amount || 0;

      totalPay += pay;
      totalContract += contract;
      weeklyCount += schedules.length;
      if (co && co.area_name) areas.add(co.area_name);

      return {
        assignId: a.id,
        companyId: a.company_id,
        companyName: co ? co.name : '알 수 없음',
        companyStatus: co ? co.status : '',
        address: co ? (co.address || '') : '',
        areaName: co ? (co.area_name || '') : '',
        phone: co ? (co.phone || '') : '',
        contractType: co ? (co.contract_type || '') : '',
        cleaningType: co ? (co.cleaning_type || '') : '',
        contractAmount: contract,
        ocpAmount: ocp,
        payAmount: pay,
        share: a.share || 0,
        schedules: schedules,
        specialNotes: note ? (note.special_notes || '') : '',
        parkingInfo: note ? (note.parking_info || '') : '',
        recyclingLocation: note ? (note.recycling_location || '') : '',
        staffMessage: note ? (note.staff_message || '') : '',
        hasBillingIssue: checkBillingIssue(a.company_id, month)
      };
    });

    companies.sort(function(a, b) { return b.payAmount - a.payAmount; });

    return {
      id: w.id,
      name: w.name || '',
      phone: w.phone || '',
      status: w.status || 'active',
      areas: [...areas],
      companyCount: companies.length,
      totalPay: totalPay,
      totalContract: totalContract,
      payRatio: totalContract > 0 ? (totalPay / totalContract * 100) : 0,
      weeklyCount: weeklyCount,
      companies: companies
    };
  });

  return rows;
}

function checkBillingIssue(companyId, month) {
  var billings = adminData.billings || [];
  return billings.some(function(b) {
    return b.company_id === companyId && b.month === month && b.status !== 'paid';
  });
}

function calcAreaData(allRows) {
  var areaMap = {};
  allRows.forEach(function(r) {
    if (r.status !== 'active') return;
    r.companies.forEach(function(co) {
      var area = co.areaName || '미지정';
      if (!areaMap[area]) {
        areaMap[area] = { name: area, workers: new Set(), companyCount: 0, totalPay: 0 };
      }
      areaMap[area].workers.add(r.id);
      areaMap[area].companyCount++;
      areaMap[area].totalPay += co.payAmount;
    });
  });
  var areas = Object.values(areaMap).map(function(a) {
    return { name: a.name, workerCount: a.workers.size, companyCount: a.companyCount, totalPay: a.totalPay };
  });
  areas.sort(function(a, b) { return b.totalPay - a.totalPay; });
  return areas;
}

// ─── 렌더: 진입점 ───

function renderWorkers() {
  _workersView = 'list';
  _workersDetailId = null;
  _workersExpandedCo = {};
  _workersExpandedWorker = {};
  _mapPopupOpen = null;
  renderWorkersList();
}

// ─── 렌더: 직원 목록 (전체 + 구역별 통합) ───

function renderWorkersList() {
  var mc = document.getElementById('mainContent');
  var allRows = calcWorkersData();

  // 요약 지표
  var activeCount = allRows.filter(function(r) { return r.status === 'active'; }).length;
  var totalPaySum = allRows.reduce(function(s, r) { return s + r.totalPay; }, 0);
  var avgPay = activeCount > 0 ? Math.round(totalPaySum / activeCount) : 0;

  var defaultMap = getDefaultMapApp();
  var defaultMapLabel = defaultMap === 'naver' ? '네이버 지도' : defaultMap === 'kakao' ? '카카오맵' : defaultMap === 'google' ? '구글 지도' : '';

  var html = '<div class="wk-page">'
    // 요약
    + '<div class="wk-summary">'
    + '<div class="wk-stat"><div class="wk-stat-icon">👥</div><div class="wk-stat-body"><div class="wk-stat-label">전체 직원</div><div class="wk-stat-value">' + allRows.length + '<span class="wk-stat-unit">명</span></div></div></div>'
    + '<div class="wk-stat"><div class="wk-stat-icon active">✅</div><div class="wk-stat-body"><div class="wk-stat-label">활성 직원</div><div class="wk-stat-value">' + activeCount + '<span class="wk-stat-unit">명</span></div></div></div>'
    + '<div class="wk-stat"><div class="wk-stat-icon pay">💰</div><div class="wk-stat-body"><div class="wk-stat-label">' + escapeHtml(selectedMonth) + ' 총급여</div><div class="wk-stat-value purple">' + fmt(totalPaySum) + '</div></div></div>'
    + '<div class="wk-stat"><div class="wk-stat-icon avg">📊</div><div class="wk-stat-body"><div class="wk-stat-label">인당 평균</div><div class="wk-stat-value">' + fmt(avgPay) + '</div></div></div>'
    + '</div>'

    // 뷰 전환 탭 + 기본 지도 설정
    + '<div class="wk-view-tabs">'
    + '<div class="wk-view-tabs-left">'
    + '<button class="wk-view-tab' + (_workersListMode === 'all' ? ' active' : '') + '" onclick="switchWorkersMode(\'all\')">📋 전체 목록</button>'
    + '<button class="wk-view-tab' + (_workersListMode === 'area' ? ' active' : '') + '" onclick="switchWorkersMode(\'area\')">📍 구역별</button>'
    + '</div>'
    + (defaultMap ? '<div class="wk-default-map">기본 지도: ' + escapeHtml(defaultMapLabel) + ' <button class="wk-btn-xs" onclick="resetDefaultMap()">초기화</button></div>' : '')
    + '</div>';

  if (_workersListMode === 'area') {
    html += renderAreaView(allRows);
  } else {
    html += renderAllView(allRows);
  }

  html += '</div>';
  mc.innerHTML = html;
}

// ─── 전체 목록 뷰 ───

function renderAllView(allRows) {
  var rows = allRows;
  if (_workersStatusFilter) {
    rows = rows.filter(function(r) { return r.status === _workersStatusFilter; });
  }
  if (_workersSearch) {
    var q = _workersSearch.toLowerCase();
    rows = rows.filter(function(r) {
      return r.name.toLowerCase().indexOf(q) !== -1 ||
             r.areas.join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }
  if (_workersSortBy === 'pay') {
    rows.sort(function(a, b) { return b.totalPay - a.totalPay; });
  } else if (_workersSortBy === 'companies') {
    rows.sort(function(a, b) { return b.companyCount - a.companyCount; });
  } else {
    rows.sort(function(a, b) { return a.name.localeCompare(b.name, 'ko'); });
  }

  var html = '<div class="wk-toolbar">'
    + '<div class="wk-toolbar-left">'
    + '<input type="text" class="wk-search" placeholder="직원명 / 구역 검색..." value="' + escapeHtml(_workersSearch) + '" oninput="workerSearchInput(this.value)">'
    + '<select class="wk-filter-select" onchange="workerStatusFilter(this.value)">'
    + '<option value=""' + (!_workersStatusFilter ? ' selected' : '') + '>전체 상태</option>'
    + '<option value="active"' + (_workersStatusFilter === 'active' ? ' selected' : '') + '>활성</option>'
    + '<option value="inactive"' + (_workersStatusFilter === 'inactive' ? ' selected' : '') + '>비활성</option>'
    + '<option value="terminated"' + (_workersStatusFilter === 'terminated' ? ' selected' : '') + '>퇴사</option>'
    + '</select>'
    + '</div>'
    + '<div class="wk-toolbar-right">'
    + '<select class="wk-filter-select" onchange="workerSortChange(this.value)">'
    + '<option value="name"' + (_workersSortBy === 'name' ? ' selected' : '') + '>이름순</option>'
    + '<option value="pay"' + (_workersSortBy === 'pay' ? ' selected' : '') + '>급여순</option>'
    + '<option value="companies"' + (_workersSortBy === 'companies' ? ' selected' : '') + '>업체수순</option>'
    + '</select>'
    + '</div>'
    + '</div>'
    + '<div class="wk-grid">'
    + rows.map(function(r) {
        var statusBadge = r.status === 'active' ? '<span class="wk-badge active">활성</span>'
          : r.status === 'inactive' ? '<span class="wk-badge inactive">비활성</span>'
          : '<span class="wk-badge terminated">퇴사</span>';
        var areaText = r.areas.length > 0 ? escapeHtml(r.areas.join(', ')) : '-';
        var payRatioClass = r.payRatio > 85 ? 'high' : r.payRatio > 70 ? 'mid' : 'low';
        return '<div class="wk-card" onclick="openWorkerDetail(\'' + r.id + '\')">'
          + '<div class="wk-card-top">'
          + '<div class="wk-avatar">' + escapeHtml(r.name.charAt(0)) + '</div>'
          + '<div class="wk-card-info">'
          + '<div class="wk-card-name">' + escapeHtml(r.name) + ' ' + statusBadge + '</div>'
          + '<div class="wk-card-meta">📍 ' + areaText + '</div>'
          + '</div></div>'
          + '<div class="wk-card-stats">'
          + '<div class="wk-card-stat"><div class="wk-card-stat-label">담당 업체</div><div class="wk-card-stat-val">' + r.companyCount + '</div></div>'
          + '<div class="wk-card-stat"><div class="wk-card-stat-label">월 급여</div><div class="wk-card-stat-val purple">' + fmt(r.totalPay) + '</div></div>'
          + '<div class="wk-card-stat"><div class="wk-card-stat-label">급여율</div><div class="wk-card-stat-val ' + payRatioClass + '">' + r.payRatio.toFixed(1) + '%</div></div>'
          + '<div class="wk-card-stat"><div class="wk-card-stat-label">주간 근무</div><div class="wk-card-stat-val">' + r.weeklyCount + '회</div></div>'
          + '</div></div>';
    }).join('')
    + '</div>'
    + (rows.length === 0 ? '<div class="wk-empty">조건에 맞는 직원이 없습니다</div>' : '');
  return html;
}

// ─── 구역별 뷰 ───

function renderAreaView(allRows) {
  var areas = calcAreaData(allRows);
  var maxPay = areas.length > 0 ? areas[0].totalPay : 1;

  var html = '<div class="wk-area-grid">'
    + areas.map(function(a) {
        var isSelected = _workersSelectedArea === a.name;
        var barPct = maxPay > 0 ? Math.round(a.totalPay / maxPay * 100) : 0;
        return '<div class="wk-area-card' + (isSelected ? ' selected' : '') + '" onclick="selectWorkerArea(\'' + escapeHtml(a.name).replace(/'/g, '&#39;') + '\')">'
          + '<div class="wk-area-name">📍 ' + escapeHtml(a.name) + '</div>'
          + '<div class="wk-area-stats">'
          + '<span>👥 ' + a.workerCount + '명</span>'
          + '<span>🏢 ' + a.companyCount + '개</span>'
          + '<span>💰 ' + fmt(a.totalPay) + '</span>'
          + '</div>'
          + '<div class="wk-area-bar"><div style="width:' + barPct + '%"></div></div>'
          + '</div>';
    }).join('')
    + '</div>';

  // 선택된 구역의 직원/업체
  var selectedArea = _workersSelectedArea;
  if (!selectedArea && areas.length > 0) {
    selectedArea = areas[0].name;
    _workersSelectedArea = selectedArea;
  }

  if (selectedArea) {
    var areaInfo = areas.find(function(a) { return a.name === selectedArea; });
    html += '<div class="wk-area-detail-header">'
      + '<div class="wk-area-detail-title">📍 ' + escapeHtml(selectedArea) + '</div>'
      + (areaInfo ? '<div class="wk-area-detail-sub">직원 ' + areaInfo.workerCount + '명, 업체 ' + areaInfo.companyCount + '개</div>' : '')
      + '</div>';

    // 해당 구역 직원 필터
    var areaWorkers = allRows.filter(function(r) {
      return r.status === 'active' && r.companies.some(function(co) { return co.areaName === selectedArea; });
    });
    areaWorkers.sort(function(a, b) { return b.totalPay - a.totalPay; });

    html += '<div class="wk-area-workers">';
    areaWorkers.forEach(function(r) {
      var areaCos = r.companies.filter(function(co) { return co.areaName === selectedArea; });
      var areaPay = areaCos.reduce(function(s, co) { return s + co.payAmount; }, 0);
      var isExpanded = _workersExpandedWorker[r.id] === true;

      html += '<div class="wk-area-worker-card">'
        + '<div class="wk-area-worker-header" onclick="toggleAreaWorker(\'' + r.id + '\')">'
        + '<div class="wk-avatar sm">' + escapeHtml(r.name.charAt(0)) + '</div>'
        + '<div class="wk-area-worker-info">'
        + '<div class="wk-area-worker-name">' + escapeHtml(r.name) + '</div>'
        + '<div class="wk-area-worker-sub">' + escapeHtml(selectedArea) + ' ' + areaCos.length + '개 업체 담당</div>'
        + '</div>'
        + '<div class="wk-area-worker-right">'
        + '<div class="wk-area-worker-pay">' + fmt(areaPay) + '원</div>'
        + '<div class="wk-area-worker-freq">주 ' + areaCos.reduce(function(s, co) { return s + co.schedules.length; }, 0) + '회</div>'
        + '</div>'
        + '<div class="wk-co-chevron">' + (isExpanded ? '▲' : '▼') + '</div>'
        + '</div>';

      if (isExpanded) {
        html += '<div class="wk-area-co-list">';
        areaCos.forEach(function(co) {
          html += '<div class="wk-area-co-row">'
            + '<div class="wk-area-co-icon">🏢</div>'
            + '<div class="wk-area-co-body">'
            + '<div class="wk-area-co-name">' + escapeHtml(co.companyName) + '</div>'
            + renderAddressLink(co.address, co.companyId)
            + '</div>'
            + '<div class="wk-area-co-right">'
            + '<div class="wk-area-co-pay">' + fmt(co.payAmount) + '원</div>'
            + '</div>'
            + '</div>';
        });
        html += '<div class="wk-area-co-row-action">'
          + '<button class="wk-btn-sm" onclick="openWorkerDetail(\'' + r.id + '\')">상세 보기 →</button>'
          + '</div>';
        html += '</div>';
      }

      html += '</div>';
    });
    html += '</div>';

    if (areaWorkers.length === 0) {
      html += '<div class="wk-empty">해당 구역에 활성 직원이 없습니다</div>';
    }
  }

  return html;
}

// ─── 렌더: 직원 상세 ───

function openWorkerDetail(workerId) {
  _workersView = 'detail';
  _workersDetailId = workerId;
  _workersExpandedCo = {};
  _mapPopupOpen = null;
  renderWorkerDetail();
}

function renderWorkerDetail() {
  var mc = document.getElementById('mainContent');
  var allRows = calcWorkersData();
  var row = allRows.find(function(r) { return r.id === _workersDetailId; });
  if (!row) {
    mc.innerHTML = '<div class="wk-empty">직원 정보를 찾을 수 없습니다</div>';
    return;
  }

  var worker = (adminData.workers || []).find(function(w) { return w.id === _workersDetailId; });
  var statusBadge = row.status === 'active' ? '<span class="wk-badge active">활성</span>'
    : row.status === 'inactive' ? '<span class="wk-badge inactive">비활성</span>'
    : '<span class="wk-badge terminated">퇴사</span>';

  var dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  mc.innerHTML = '<div class="wk-page">'
    + '<div class="wk-detail-header">'
    + '<button class="wk-back-btn" onclick="renderWorkers()">← 목록으로</button>'
    + '</div>'

    // 프로필
    + '<div class="wk-profile-card">'
    + '<div class="wk-profile-top">'
    + '<div class="wk-avatar lg">' + escapeHtml(row.name.charAt(0)) + '</div>'
    + '<div class="wk-profile-info">'
    + '<div class="wk-profile-name">' + escapeHtml(row.name) + ' ' + statusBadge + '</div>'
    + '<div class="wk-profile-meta">'
    + (row.areas.length > 0 ? '📍 ' + escapeHtml(row.areas.join(', ')) : '')
    + (worker && worker.phone ? ' &nbsp;📞 ' + escapeHtml(worker.phone) : '')
    + '</div>'
    + '</div>'
    + '<div class="wk-profile-actions">'
    + '<button class="wk-btn" onclick="switchTab(\'staffPay\')">💰 급여 상세</button>'
    + '</div>'
    + '</div>'
    + '<div class="wk-detail-stats">'
    + '<div class="wk-dstat"><div class="wk-dstat-label">담당 업체</div><div class="wk-dstat-value">' + row.companyCount + '</div></div>'
    + '<div class="wk-dstat"><div class="wk-dstat-label">' + escapeHtml(selectedMonth) + ' 급여 합계</div><div class="wk-dstat-value purple">' + fmt(row.totalPay) + '</div></div>'
    + '<div class="wk-dstat"><div class="wk-dstat-label">계약 대비 급여율</div><div class="wk-dstat-value">' + row.payRatio.toFixed(1) + '%</div></div>'
    + '<div class="wk-dstat"><div class="wk-dstat-label">주간 근무</div><div class="wk-dstat-value">' + row.weeklyCount + '회</div></div>'
    + '</div>'
    + '</div>'

    // 업체 섹션
    + '<div class="wk-co-section">'
    + '<div class="wk-co-header">'
    + '<div class="wk-co-title">🏢 담당 업체 (' + row.companies.length + ')</div>'
    + '<div class="wk-co-actions">'
    + '<button class="wk-btn-sm" onclick="workerExpandAll()">📂 모두 펼치기</button>'
    + '<button class="wk-btn-sm" onclick="workerCollapseAll()">📁 모두 접기</button>'
    + '</div>'
    + '</div>'

    + row.companies.map(function(co) {
        var isExpanded = _workersExpandedCo[co.companyId] === true;
        var chevron = isExpanded ? '▲' : '▼';
        var cardClass = 'wk-co-card' + (isExpanded ? ' expanded' : '') + (co.hasBillingIssue ? ' warning' : '');
        var weeklyCountCo = co.schedules.length;
        var payPct = co.contractAmount > 0 ? (co.payAmount / co.contractAmount * 100).toFixed(1) : '0.0';

        var h = '<div class="' + cardClass + '">'
          + '<div class="wk-co-card-header" onclick="toggleWorkerCo(\'' + co.companyId + '\')">'
          + '<div class="wk-co-icon">' + (co.hasBillingIssue ? '⚠️' : '🏢') + '</div>'
          + '<div class="wk-co-info">'
          + '<div class="wk-co-name">' + escapeHtml(co.companyName)
          + (co.companyStatus === 'active' ? ' <span class="wk-badge-sm active">계약중</span>' : ' <span class="wk-badge-sm inactive">비활성</span>')
          + (co.hasBillingIssue ? ' <span class="wk-badge-sm warning">미수</span>' : '')
          + '</div>'
          + '<div class="wk-co-meta">'
          + '<span>📍 ' + escapeHtml(co.areaName || '-') + '</span>'
          + '<span>📅 주 ' + weeklyCountCo + '회</span>'
          + '</div>'
          + '</div>'
          + '<div class="wk-co-pay">'
          + '<div class="wk-co-pay-amt">' + fmt(co.payAmount) + '원</div>'
          + '<div class="wk-co-pay-sub">계약 ' + fmt(co.contractAmount) + ' 중</div>'
          + '</div>'
          + '<div class="wk-co-chevron">' + chevron + '</div>'
          + '</div>';

        if (isExpanded) {
          h += '<div class="wk-co-detail">'
            + '<div class="wk-co-detail-grid">'
            + '<div class="wk-co-detail-col">'
            + '<div class="wk-co-detail-title">ℹ️ 업체 정보</div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">주소</span>' + renderAddressLink(co.address, co.companyId) + '</div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">연락처</span><span class="wk-dv">' + escapeHtml(co.phone || '-') + '</span></div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">주차</span><span class="wk-dv">' + escapeHtml(co.parkingInfo || '-') + '</span></div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">청소유형</span><span class="wk-dv">' + escapeHtml(co.cleaningType || '-') + '</span></div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">계약유형</span><span class="wk-dv">' + escapeHtml(co.contractType || '-') + '</span></div>'
            + '</div>'
            + '<div class="wk-co-detail-col">'
            + '<div class="wk-co-detail-title">📅 스케줄</div>'
            + '<div class="wk-day-pills">'
            + dayNames.map(function(d, i) {
                var isOn = co.schedules.some(function(s) { return s.weekday === i; });
                return '<div class="wk-day-pill' + (isOn ? ' on' : '') + '">' + d + '</div>';
              }).join('')
            + '</div>'
            + (co.schedules.length > 0
              ? '<div class="wk-schedule-time">' + co.schedules.map(function(s) { return dayNames[s.weekday] + ' ' + (s.start_time || '').substring(0, 5) + '~' + (s.end_time || '').substring(0, 5); }).join(' / ') + '</div>'
              : '<div class="wk-schedule-time">스케줄 없음</div>')
            + '</div>'
            + '</div>'
            + '<div class="wk-co-detail-grid">'
            + '<div class="wk-co-detail-col">'
            + '<div class="wk-co-detail-title">💰 금액 내역</div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">계약금액</span><span class="wk-dv">' + fmt(co.contractAmount) + '원</span></div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">OCP 수수료</span><span class="wk-dv blue">' + fmt(co.ocpAmount) + '원</span></div>'
            + '<div class="wk-co-detail-row"><span class="wk-dl">직원 급여</span><span class="wk-dv purple">' + fmt(co.payAmount) + '원</span></div>'
            + '<div class="wk-fin-bar"><div class="wk-fin-bar-fill" style="width:' + Math.min(parseFloat(payPct), 100) + '%"></div></div>'
            + '<div class="wk-fin-pct">급여율 ' + payPct + '% (계약 대비)</div>'
            + '</div>'
            + '<div class="wk-co-detail-col">'
            + '<div class="wk-co-detail-title">📝 현장 메모</div>'
            + '<div class="wk-note-box">'
            + (co.specialNotes ? '<div>' + escapeHtml(co.specialNotes) + '</div>' : '')
            + (co.parkingInfo ? '<div>🅿️ ' + escapeHtml(co.parkingInfo) + '</div>' : '')
            + (co.recyclingLocation ? '<div>♻️ ' + escapeHtml(co.recyclingLocation) + '</div>' : '')
            + (co.staffMessage ? '<div>💬 ' + escapeHtml(co.staffMessage) + '</div>' : '')
            + (!co.specialNotes && !co.parkingInfo && !co.recyclingLocation && !co.staffMessage ? '<div class="wk-note-empty">등록된 메모 없음</div>' : '')
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="wk-co-detail-actions">'
            + '<button class="wk-btn-sm" onclick="event.stopPropagation();goToCompany(\'' + co.companyId + '\')">🏢 업체 상세</button>'
            + '<button class="wk-btn-sm" onclick="event.stopPropagation();goToCompanySchedule(\'' + co.companyId + '\')">📅 스케줄 수정</button>'
            + '</div>'
            + '</div>';
        }

        h += '</div>';
        return h;
    }).join('')

    + (row.companies.length === 0 ? '<div class="wk-empty">배정된 업체가 없습니다</div>' : '')
    + '</div>'
    + '</div>';
}

// ─── 인터랙션 핸들러 ───

function switchWorkersMode(mode) {
  _workersListMode = mode;
  _workersSearch = '';
  _mapPopupOpen = null;
  renderWorkersList();
}

function selectWorkerArea(areaName) {
  _workersSelectedArea = areaName;
  _workersExpandedWorker = {};
  _mapPopupOpen = null;
  renderWorkersList();
}

function toggleAreaWorker(workerId) {
  _workersExpandedWorker[workerId] = !_workersExpandedWorker[workerId];
  renderWorkersList();
}

function workerSearchInput(val) {
  _workersSearch = val;
  renderWorkersList();
}

function workerStatusFilter(val) {
  _workersStatusFilter = val;
  renderWorkersList();
}

function workerSortChange(val) {
  _workersSortBy = val;
  renderWorkersList();
}

function toggleWorkerCo(companyId) {
  _workersExpandedCo[companyId] = !_workersExpandedCo[companyId];
  _mapPopupOpen = null;
  renderWorkerDetail();
}

function workerExpandAll() {
  var allRows = calcWorkersData();
  var row = allRows.find(function(r) { return r.id === _workersDetailId; });
  if (!row) return;
  row.companies.forEach(function(co) { _workersExpandedCo[co.companyId] = true; });
  renderWorkerDetail();
}

function workerCollapseAll() {
  _workersExpandedCo = {};
  _mapPopupOpen = null;
  renderWorkerDetail();
}

function goToCompany(companyId) {
  switchTab('allClients');
  if (typeof openCompanyDetail === 'function') {
    setTimeout(function() { openCompanyDetail(companyId); }, 100);
  }
}

function goToCompanySchedule(companyId) {
  switchTab('calendar');
}

// 팝업 외부 클릭시 닫기
document.addEventListener('click', function(e) {
  if (_mapPopupOpen && !e.target.closest('.wk-map-popup') && !e.target.closest('.wk-addr-link')) {
    _mapPopupOpen = null;
    if (_workersView === 'detail') {
      renderWorkerDetail();
    } else if (_workersView === 'list') {
      renderWorkersList();
    }
  }
});

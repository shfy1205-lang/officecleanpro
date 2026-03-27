/**
 * admin-core.js - 관리자 핵시 로직
 * 전역 변수, 초기화, 데이터 로드, 탭 전환, 관리자 유틸
 */

let adminData = {};
let selectedMonth = '';
let clientSearch = '';
let clientAreaFilter = '';
let requestFilter = 'all';
let noticeSearch = '';
let leadFilter = 'all';
let leadSearch = '';
let billingMonth = '';
let billingView = 'overview'; // overview | all | unpaid
let revenueMonth = '';
let pendingQuoteLead = null; // 견적관리 → 견적서 연동용

// ─── 초기화 ───

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await requireAuth('admin');
  if (!ok) return;

  selectedMonth = currentMonth();
  billingMonth = currentMonth();
  revenueMonth = currentMonth();
  $('userName').textContent = currentWorker.name;

  $('loading').classList.add('hidden');
  $('app').style.display = 'block';

  await loadAdminData();

  // 에코 사용자: 에코관리 탭만 표시
  if (isEcoUser()) {
    setupEcoOnlyView();
    return;
  }

  renderDashboard();
});

// ─── 데이터 로드 ───

async function loadAdminData() {
  const [companies, financials, assignments, workers, schedules, requests, notices, leads, billings, notes, payConfirmations] = await Promise.all([
    sb.from('companies').select('*').order('name'),
    sb.from('company_financials').select('*'),
    sb.from('company_workers').select('*'),
    sb.from('workers').select('*').order('name'),
    sb.from('company_schedule').select('*'),
    sb.from('requests').select('*').order('created_at', { ascending: false }),
    sb.from('notices').select('*').order('created_at', { ascending: false }),
    sb.from('leads').select('*').order('created_at', { ascending: false }),
    sb.from('billing_records').select('*').order('month', { ascending: false }),
    sb.from('company_notes').select('id, company_id, special_notes, parking_info, recycling_location'),
    sb.from('pay_confirmations').select('*'),
  ]);

  adminData.companies        = companies.data || [];
  adminData.financials       = financials.data || [];
  adminData.assignments      = assignments.data || [];
  adminData.workers          = workers.data || [];
  adminData.schedules        = schedules.data || [];
  adminData.requests         = requests.data || [];
  adminData.notices          = notices.data || [];
  adminData.leads            = leads.data || [];
  adminData.billings         = billings.data || [];
  adminData.notes            = notes?.data || [];
  adminData.payConfirmations = payConfirmations?.data || [];
}

// ─── 월별 데이터 자동 생성 ───

/**
 * 특정 월에 financials/assignments 데이터가 없으면
 * 가장 최근 이전 달 데이터를 복사하여 자동 생성
 */
async function ensureMonthData(month) {
  const hasFinancials = adminData.financials.some(f => f.month === month);
  const hasAssignments = adminData.assignments.some(a => a.month === month);

  if (hasFinancials && hasAssignments) return; // 이미 데이터 있음

  // 이전 달 중 데이터가 있는 가장 최근 달 찾기
  const allMonths = [...new Set(adminData.financials.map(f => f.month))].sort().reverse();
  const prevMonth = allMonths.find(m => m < month);

  if (!prevMonth) return; // 이전 데이터 자체가 없으면 스킵

  let inserted = false;

  // 1) company_financials 복사
  if (!hasFinancials) {
    const prevFins = adminData.financials.filter(f => f.month === prevMonth);
    if (prevFins.length > 0) {
      const newFins = prevFins.map(f => ({
        company_id:      f.company_id,
        month:           month,
        contract_amount: Math.max(f.contract_amount || 0, ...adminData.financials.filter(x => x.company_id === f.company_id && x.contract_amount > 0).map(x => x.contract_amount)),
        ocp_amount:      f.ocp_amount,
        eco_amount:      f.eco_amount,
        worker_pay_total: f.worker_pay_total,
        memo:            f.memo,
      }));

      const { error } = await sb.from('company_financials').insert(newFins);
      if (error && error.code !== '23505') {
        console.error('ensureMonthData financials error:', error);
      } else {
        inserted = true;
      }
    }
  }

  // 2) company_workers 복사
  if (!hasAssignments) {
    const prevAssigns = adminData.assignments.filter(a => a.month === prevMonth);
    if (prevAssigns.length > 0) {
      const newAssigns = prevAssigns.map(a => ({
        company_id: a.company_id,
        worker_id:  a.worker_id,
        month:      month,
        pay_amount: a.pay_amount,
        share:      a.share,
      }));

      const { error } = await sb.from('company_workers').insert(newAssigns);
      if (error && error.code !== '23505') {
        console.error('ensureMonthData assignments error:', error);
      } else {
        inserted = true;
      }
    }
  }

  // 데이터 새로고침
  if (inserted) {
    await loadAdminData();
  }
}

// ─── 에코 전용 뷰 ───

function setupEcoOnlyView() {
  // 탭 바에서 에코관리 탭만 남기고 숨김
  const tabs = document.querySelectorAll('.tabs .tab');
  tabs.forEach(t => {
    if (t.textContent.trim() === '에코관리') {
      t.classList.add('active');
    } else {
      t.style.display = 'none';
    }
  });

  // 네비바 제목 변경
  const h2 = document.querySelector('.navbar h2');
  if (h2) h2.textContent = '에코오피스클린';

  // 에코관리 렌더
  ecoMonth = ecoMonth || selectedMonth;
  renderEco();
}

// ─── 탭 전환 ───

function switchTab(tabName, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const renderers = {
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

// ─── 관리자 유틸 ───

function getWorkerName(workerId) {
  const w = adminData.workers.find(w => w.id === workerId);
  return w ? w.name : '알 수 없음';
}

function getCompanyName(companyId) {
  const c = adminData.companies.find(c => c.id === companyId);
  return c ? c.name : '알 수 없음';
}

function getActiveWorkers() {
  return adminData.workers.filter(w => w.status === 'active' && w.role === 'staff');
}

function getCompanySchedules(companyId) {
  return adminData.schedules
    .filter(s => s.company_id === companyId && s.is_active)
    .sort((a, b) => a.weekday - b.weekday);
}

function getCompanyAssignments(companyId, month) {
  return adminData.assignments.filter(
    a => a.company_id === companyId && a.month === month
  );
}

function getUniqueAreas() {
  const areas = new Set();
  adminData.companies.forEach(c => { if (c.area_name) areas.add(c.area_name); });
  return [...areas].sort();
}

/**
 * staff-core.js - 직원 핵심 로직
 * 전역 변수, 초기화, 데이터 로드, 탭 전환, 직원 유틸
 */

let staffData = {};
let selectedMonth = '';
let taskHistoryView = 'calendar'; // 'calendar' | 'list'
let pendingPhotoCompanyId = null;
let pendingPhotoNoteId = null;

// ─── 초기화 ───

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await requireAuth('staff');
  if (!ok) return;

  selectedMonth = currentMonth();
  $('userName').textContent = currentWorker.name;

  $('loading').classList.add('hidden');
  $('app').style.display = 'block';

  await loadStaffData();
  renderTodayTasks();
});

// ─── 데이터 로드 (RLS가 자동으로 본인 데이터만 반환) ───

async function loadStaffData() {
  const [assignments, companies, schedules, notes, photos, tasks, requests, payConfirmations, financials] = await Promise.all([
    sb.from('company_workers').select('*'),
    sb.from('companies').select('*'),
    sb.from('company_schedule').select('*'),
    sb.from('company_notes').select('id, company_id, special_notes, parking_info, recycling_location'),
    sb.from('company_note_photos').select('*'),
    sb.from('tasks').select('*'),
    sb.from('requests').select('*'),
    sb.from('pay_confirmations').select('*'),
    sb.from('company_financials').select('*'),
  ]);

  staffData.assignments      = assignments.data || [];
  staffData.companies        = companies.data || [];
  staffData.schedules        = schedules.data || [];
  staffData.notes            = notes.data || [];
  staffData.photos           = photos.data || [];
  staffData.tasks            = tasks.data || [];
  staffData.requests         = requests.data || [];
  staffData.payConfirmations = payConfirmations?.data || [];
  staffData.financials       = financials?.data || [];
}

// ─── 탭 전환 ───

function switchTab(tabName, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const renderers = {
    todayTasks:   renderTodayTasks,
    myCompanies:  renderMyCompanies,
    myPay:        renderMyPay,
    taskHistory:  renderTaskHistory,
    notices:      renderNotices,
  };

  if (renderers[tabName]) renderers[tabName]();
}

// ─── 직원 유틸 ───

function getMonthAssignments(month) {
  return staffData.assignments.filter(a => a.month === month);
}

function getCompanyById(id) {
  return staffData.companies.find(c => c.id === id);
}

function getCompanySchedules(companyId) {
  return staffData.schedules
    .filter(s => s.company_id === companyId && s.is_active)
    .sort((a, b) => a.weekday - b.weekday);
}

function getCompanyNote(companyId) {
  return staffData.notes.find(n => n.company_id === companyId);
}

function getCompanyPhotos(companyId) {
  return staffData.photos
    .filter(p => p.company_id === companyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getCompanyTasks(companyId, month) {
  const [y, m] = month.split('-').map(Number);
  return staffData.tasks.filter(t => {
    if (t.company_id !== companyId) return false;
    const d = new Date(t.task_date);
    return d.getFullYear() === y && (d.getMonth() + 1) === m;
  });
}

function getCompanyRequests(companyId) {
  return staffData.requests
    .filter(r => r.company_id === companyId && !r.is_resolved)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** Supabase Storage 공개 URL 생성 */
function getStorageUrl(path) {
  const base = localStorage.getItem('supa_url');
  return `${base}/storage/v1/object/public/note-photos/${path}`;
}

/**
 * 현재 직원이 볼 수 있는 공지인지 필터링
 */
function isNoticeVisibleToMe(notice) {
  const { type, target } = parseNoticeTarget(notice.title);

  if (type === 'all') return true;

  if (type === 'worker') {
    return target === currentWorker.name;
  }

  if (type === 'area') {
    const assigns = getMonthAssignments(selectedMonth || currentMonth());
    return assigns.some(a => {
      const comp = getCompanyById(a.company_id);
      return comp && comp.area_name === target;
    });
  }

  return false;
}

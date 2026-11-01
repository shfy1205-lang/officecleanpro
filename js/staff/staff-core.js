/**
 * staff-core.js - 직원 핵심 로직
 * 전역 변수, 초기화, 데이터 로드, 탭 전환, 직원 유틸
 */

let staffData = {};
let selectedMonth = '';
let staffSelectedDate = ''; // 오늘 할 일 탭 날짜 (빈 문자열이면 today())
let taskHistoryView = 'calendar'; // 'calendar' | 'list'
let pendingPhotoCompanyId = null;
let pendingPhotoNoteId = null;

// ─── 초기화 ───

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await requireAuth('staff');
  if (!ok) return;

  selectedMonth = currentMonth();
  $('userName').textContent = currentWorker.name;
    if ($('profileName')) $('profileName').textContent = currentWorker.name;

  $('loading').classList.add('hidden');
  $('app').style.display = 'block';

  await loadStaffData();
  renderTodayTasks();
  subscribeQrRequests();
});

// ─── 데이터 로드 (RLS가 자동으로 본인 데이터만 반환) ───

async function loadStaffData() {
  const results = await Promise.allSettled([
    sb.from('company_workers').select('*'),
    sb.from('companies').select('*'),
    sb.from('company_schedule').select('*'),
    sb.from('company_notes').select('id, company_id, special_notes, parking_info, recycling_location, staff_message, office_password'),
    sb.from('company_note_photos').select('*'),
    sb.from('tasks').select('*'),
    sb.from('requests').select('*'),
    sb.from('pay_confirmations').select('*'),
    sb.from('company_financials').select('*'),
  ]);

  const get = (i) => results[i].status === 'fulfilled' ? (results[i].value.data || []) : [];

  staffData.assignments      = get(0);
  staffData.companies        = get(1);
  staffData.schedules        = get(2);
  staffData.notes            = get(3);
  staffData.photos           = get(4);
  staffData.tasks            = get(5);
  staffData.requests         = get(6);
  staffData.payConfirmations = get(7);
  staffData.financials       = get(8);

  // 실패한 쿼리 로그
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`loadStaffData query[${i}] failed:`, r.reason);
  });
}

// ─── 탭 전환 ───

function switchTab(tabName, el) {
  currentTab = tabName;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  const renderers = {
    todayTasks:   renderTodayTasks,
    myCompanies:  renderMyCompanies,
    myPay:        renderMyPay,
    taskHistory:  renderTaskHistory,
    myRequests:   renderMyRequests,
    notices:      renderNotices,
    chat:         renderStaffChat,
    supplies: renderStaffSupplies,
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

// ════════════════════════════════════════════════════
// 업체(QR) 요청 — 작업자 확인/처리/알림
// ════════════════════════════════════════════════════

/** 내 담당 업체에서 들어온 미처리 QR 요청 (RLS가 담당 업체만 내려줌) */
function getPendingQrRequests(companyId) {
  return staffData.requests
    .filter(r => r.request_source === 'client_qr' && !r.is_resolved && !isExpired(r.expires_at)
              && (!companyId || r.company_id === companyId))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** 미처리 업체 요청 배너 HTML (오늘 할 일·내 업체 상단) */
function qrPendingBannerHtml() {
  const list = getPendingQrRequests();
  if (list.length === 0) return '';
  const names = [...new Set(list.map(r => getCompanyById(r.company_id)?.name).filter(Boolean))];
  const label = names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}곳` : names.join(', ');
  return `
    <div class="qr-pending-banner" onclick="staffRequestFilter='qr';switchFromAnywhere('myRequests')"
         style="display:flex;align-items:center;gap:10px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 12px;margin-bottom:12px;cursor:pointer">
      <span style="font-size:20px">🏢</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:#9a3412">업체 요청 ${list.length}건이 기다리고 있어요</div>
        <div style="font-size:12px;color:#c2410c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</div>
      </div>
      <span style="font-size:12px;color:#9a3412;white-space:nowrap">확인 ›</span>
    </div>`;
}

/** 탭 전환 (하단 네비 active까지 맞춤) */
function switchFromAnywhere(tabName) {
  const overlay = document.getElementById('moreOverlay');
  if (overlay) overlay.classList.remove('open');
  const items = document.querySelectorAll('.bnav-item');
  items.forEach(i => i.classList.remove('active'));
  const map = { todayTasks: 0, myCompanies: 1, myPay: 2, chat: 3 };
  const idx = tabName in map ? map[tabName] : items.length - 1;
  if (items[idx]) items[idx].classList.add('active');
  switchTab(tabName);
}

/** QR 요청 처리 완료 (RPC: 담당 업체 요청만, 완료 플래그만 변경) */
async function resolveQrRequest(requestId, afterRender) {
  const r = staffData.requests.find(x => x.id === requestId);
  if (!r) return;
  if (!confirm('이 업체 요청을 처리 완료로 표시할까요?\n(업체 QR 페이지에서도 완료로 바뀝니다)')) return;
  const btns = document.querySelectorAll(`[data-qr-resolve="${requestId}"]`);
  btns.forEach(b => { b.disabled = true; b.textContent = '처리 중...'; });
  try {
    const { error } = await sb.rpc('resolve_qr_request', { p_request_id: requestId, p_resolved: true });
    if (error) throw error;
    r.is_resolved = true;
    r.updated_at = new Date().toISOString();
    toast('처리 완료로 표시했습니다 ✓');
    updateQrBadge();
    if (typeof afterRender === 'function') afterRender();
  } catch (e) {
    console.error('resolveQrRequest error:', e);
    btns.forEach(b => { b.disabled = false; b.textContent = '✓ 처리 완료'; });
    toast('처리 실패: ' + (e.message || e), 'error');
  }
}

/** 하단 네비 '더보기'와 상단 '내 요청' 탭에 미처리 업체 요청 수 배지 */
function updateQrBadge() {
  const n = getPendingQrRequests().length;
  document.querySelectorAll('.tab').forEach(t => {
    if (!/내 요청/.test(t.textContent)) return;
    t.textContent = n > 0 ? `내 요청 (${n})` : '내 요청';
  });
  const more = document.querySelector('.more-item[onclick*="myRequests"]');
  if (more) {
    let b = more.querySelector('.qr-more-badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'qr-more-badge'; b.style.cssText = 'margin-left:6px;background:#f97316;color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:700'; more.appendChild(b); }
      b.textContent = n;
    } else if (b) b.remove();
  }
}

/** 실시간: 업체 QR 요청이 새로 오면 바로 목록에 넣고 알림 */
let _qrChannel = null;
function subscribeQrRequests() {
  updateQrBadge();
  if (_qrChannel || typeof sb === 'undefined' || !sb.channel) return;
  try {
    _qrChannel = sb.channel('qr-requests-staff')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        const r = payload.new;
        if (!r || r.request_source !== 'client_qr') return;
        if (!staffData.requests.some(x => x.id === r.id)) staffData.requests.push(r);
        const name = getCompanyById(r.company_id)?.name || '업체';
        toast(`🏢 ${name} 새 요청: ${String(r.content || '').slice(0, 40)}`);
        notifyQrRequest(name, r.content);
        updateQrBadge();
        if (['todayTasks', 'myCompanies', 'myRequests'].includes(currentTab)) switchTab(currentTab);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        const r = payload.new; if (!r) return;
        const local = staffData.requests.find(x => x.id === r.id);
        if (local) Object.assign(local, r);
        updateQrBadge();
      })
      .subscribe();
  } catch (e) { console.warn('qr realtime subscribe failed', e); }
}

function notifyQrRequest(companyName, content) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // 앱 보고 있으면 토스트로 충분
  try {
    const n = new Notification('업체 요청 · ' + companyName, { body: String(content || '').slice(0, 80), tag: 'qr-request' });
    n.onclick = () => { window.focus(); staffRequestFilter = 'qr'; switchFromAnywhere('myRequests'); n.close(); };
  } catch (e) {}
}

/** Supabase Storage 공개 URL 생성 */
function getStorageUrl(path) {
  if (!path) return '';
  const stored = localStorage.getItem('supa_url');
  const base = (stored || (typeof DEFAULT_SUPA_URL !== 'undefined' ? DEFAULT_SUPA_URL : '')).replace(/\/+$/, '');
  if (!base) return '';
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


// --- 하단 네비게이션 ---

function switchBottomNav(tabName, el) {
  // 하단 네비 active 업데이트
  var items = document.querySelectorAll('.bnav-item');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
  if (el) el.classList.add('active');

  // 기존 switchTab 호출
  switchTab(tabName);
}

function switchFromMore(tabName) {
  // 더보기 메뉴 닫기
  toggleMoreMenu();

  // 하단 네비에서 더보기 활성화
  var items = document.querySelectorAll('.bnav-item');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
  var lastItem = items[items.length - 1];
  if (lastItem) lastItem.classList.add('active');

  switchTab(tabName);
}

function toggleMoreMenu() {
  var overlay = document.getElementById('moreOverlay');
  if (overlay) overlay.classList.toggle('open');
}

function toggleProfileMenu() {
  var menu = document.getElementById('profileMenu');
  if (menu) menu.classList.toggle('open');
}

// 프로필 메뉴 외부 클릭 닫기
document.addEventListener('click', function(e) {
  var menu = document.getElementById('profileMenu');
  var btn = document.querySelector('.profile-btn');
  if (menu && menu.classList.contains('open')) {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.classList.remove('open');
    }
  }
});

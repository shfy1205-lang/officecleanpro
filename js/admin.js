/**
 * admin.js - 관리자 전용 페이지 로직
 *
 * 기능:
 * 1. 대시보드 (업체수, 직원수, 월별 요약)
 * 2. 업체 목록 조회 (검색, 구역 필터)
 * 3. 업체 등록
 * 4. 업체 수정 (기본정보 + 주소)
 * 5. 청소 요일 설정 (company_schedule CRUD)
 * 6. 직원 배정 (company_workers CRUD)
 * 7. 직원별 지급 금액 설정
 * 8. 직원 요청사항 목록 조회
 * 9. 요청사항 답변(처리) 작성
 * 10. 공지 작성
 * 11. 특정 직원 대상 공지
 * 12. 특정 구역 대상 공지
 * 13. 전체 공지
 * 14. 견적 업체 등록
 * 15. 견적 금액 입력
 * 16. 견적 성공 여부 수정
 * 17. 월별 세금계산서 발행 여부 체크 / 발행일 입력
 * 18. 입금 여부 체크 / 입금일 입력 / 입금 금액 입력
 * 19. 미수금 확인 목록
 * 20. 업체별 계약 형태 설정 (수수료 방식: none/fixed/percent)
 * 21. 오피스클린프로 수수료 입력
 * 22. 에코오피스클린 수수료 입력
 * 23. 직원 지급 총액 표시
 * 24. 최종 남는 금액 자동 계산
 * 25. 업체별 수익 구조 표 출력
 *
 * 참조 테이블:
 * - companies, company_schedule, company_workers
 * - company_financials, workers, tasks
 * - requests, notices, leads, billing_records
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
let billingView = 'all'; // all | unpaid
let revenueMonth = '';

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const LEAD_STATUS_MAP = {
  new:       { label: '신규', badge: 'badge-area' },
  contacted: { label: '연락중', badge: 'badge-today' },
  proposal:  { label: '견적제출', badge: 'badge-day' },
  won:       { label: '성공', badge: 'badge-done' },
  lost:      { label: '실패', badge: 'badge-warn' },
};

const BILLING_STATUS_MAP = {
  pending: { label: '대기', badge: 'badge-area' },
  billed:  { label: '발행완료', badge: 'badge-today' },
  paid:    { label: '입금완료', badge: 'badge-done' },
  overdue: { label: '연체', badge: 'badge-warn' },
};

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
  renderDashboard();
});

// ─── 데이터 로드 ───

async function loadAdminData() {
  const [companies, financials, assignments, workers, schedules, requests, notices, leads, billings] = await Promise.all([
    sb.from('companies').select('*').order('name'),
    sb.from('company_financials').select('*'),
    sb.from('company_workers').select('*'),
    sb.from('workers').select('*').order('name'),
    sb.from('company_schedule').select('*'),
    sb.from('requests').select('*').order('created_at', { ascending: false }),
    sb.from('notices').select('*').order('created_at', { ascending: false }),
    sb.from('leads').select('*').order('created_at', { ascending: false }),
    sb.from('billing_records').select('*').order('month', { ascending: false }),
  ]);

  adminData.companies   = companies.data || [];
  adminData.financials  = financials.data || [];
  adminData.assignments = assignments.data || [];
  adminData.workers     = workers.data || [];
  adminData.schedules   = schedules.data || [];
  adminData.requests    = requests.data || [];
  adminData.notices     = notices.data || [];
  adminData.leads       = leads.data || [];
  adminData.billings    = billings.data || [];
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
        contract_amount: f.contract_amount,
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
    staffPay:     renderStaffPay,
    areaSummary:  renderAreaSummary,
    revenue:      renderRevenue,
    analysis:     renderAnalysis,
  };

  if (renderers[tabName]) renderers[tabName]();
}

// ─── 유틸 ───

function monthSelectorHTML(current, onChange) {
  const now = new Date();
  const months = [];
  for (let i = -2; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}월`;
    months.push({ val, label });
  }
  return `<div class="month-selector">${months.map(m =>
    `<button class="month-btn${m.val === current ? ' active' : ''}"
       onclick="${onChange}('${m.val}')">${m.label}</button>`
  ).join('')}</div>`;
}

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

function closeModal() {
  $('detailModal').classList.remove('show');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function parseNoticeTarget(title) {
  const matchWorker = title.match(/^\[직원:(.+?)\]\s*/);
  if (matchWorker) return { type: 'worker', target: matchWorker[1], cleanTitle: title.replace(matchWorker[0], '') };

  const matchArea = title.match(/^\[구역:(.+?)\]\s*/);
  if (matchArea) return { type: 'area', target: matchArea[1], cleanTitle: title.replace(matchArea[0], '') };

  const matchAll = title.match(/^\[전체\]\s*/);
  if (matchAll) return { type: 'all', target: '', cleanTitle: title.replace(matchAll[0], '') };

  return { type: 'all', target: '', cleanTitle: title };
}


// ════════════════════════════════════════════════════
// 1. 대시보드
// ════════════════════════════════════════════════════

function renderDashboard() {
  const mc = $('mainContent');

  const activeCompanies = adminData.companies.filter(c => c.status === 'active').length;
  const activeWorkers = adminData.workers.filter(w => w.status === 'active' && w.role === 'staff').length;
  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);
  const totalPay = monthAssigns.reduce((s, a) => s + (a.pay_amount || 0), 0);
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);
  const totalContract = monthFin.reduce((s, f) => s + (f.contract_amount || 0), 0);

  const pendingRequests = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;

  // 미수금 현황
  const unpaidBillings = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidBillings.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);

  // 진행중 견적
  const activeLeads = adminData.leads.filter(l => !['won','lost'].includes(l.status)).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      대시보드
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-gray" onclick="exportWorkers()" style="font-size:11px;padding:6px 10px">📥 직원</button>
        <button class="btn-sm btn-blue" onclick="exportAll()" style="font-size:11px;padding:6px 10px">📥 전체</button>
      </div>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changeDashMonth')}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">활성 업체</div>
        <div class="stat-value blue">${activeCompanies}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">활성 직원</div>
        <div class="stat-value green">${activeWorkers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 계약 총액</div>
        <div class="stat-value yellow">${fmt(totalContract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${selectedMonth.split('-')[1]}월 인건비 총액</div>
        <div class="stat-value red">${fmt(totalPay)}</div>
      </div>
    </div>

    ${pendingRequests > 0 ? `
      <div class="admin-alert" onclick="document.querySelector('.tab:nth-child(3)').click()">
        <span class="admin-alert-icon">!</span>
        <span>미처리 요청 <strong>${pendingRequests}건</strong>이 있습니다</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${totalUnpaid > 0 ? `
      <div class="admin-alert" style="border-color:rgba(239,68,68,0.3);background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))"
           onclick="document.querySelector('.tab:nth-child(6)').click()">
        <span class="admin-alert-icon" style="background:var(--red)">!</span>
        <span>미수금 <strong>${fmt(totalUnpaid)}원</strong> (${unpaidBillings.length}건)</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    ${activeLeads > 0 ? `
      <div class="admin-alert" style="border-color:rgba(59,130,246,0.3);background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.05))"
           onclick="document.querySelector('.tab:nth-child(5)').click()">
        <span class="admin-alert-icon" style="background:var(--accent)">!</span>
        <span>진행중 견적 <strong>${activeLeads}건</strong></span>
        <span style="margin-left:auto;font-size:12px;color:var(--text2)">보기 &rarr;</span>
      </div>
    ` : ''}

    <div class="section-title" style="font-size:15px">최근 배정 현황</div>
    ${monthAssigns.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>업체</th><th>담당자</th><th>지급액</th></tr></thead>
          <tbody>${monthAssigns.slice(0, 20).map(a => {
            const comp = adminData.companies.find(c => c.id === a.company_id);
            return `<tr>
              <td>${comp?.name || '-'}</td>
              <td>${getWorkerName(a.worker_id)}</td>
              <td class="admin-pay-cell">${fmt(a.pay_amount)}원</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${monthAssigns.length > 20 ? `<p class="text-muted" style="margin-top:8px">외 ${monthAssigns.length - 20}건...</p>` : ''}
    ` : '<p class="text-muted">이 달의 배정 데이터가 없습니다.</p>'}
  `;
}

async function changeDashMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderDashboard();
}


// ════════════════════════════════════════════════════
// 2. 업체 목록 조회 + 3. 업체 등록
// ════════════════════════════════════════════════════

function renderAllClients() {
  const mc = $('mainContent');
  const areas = getUniqueAreas();

  let filtered = adminData.companies;
  if (clientSearch) {
    const q = clientSearch.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.area_name || '').toLowerCase().includes(q)
    );
  }
  if (clientAreaFilter) {
    filtered = filtered.filter(c => c.area_name === clientAreaFilter);
  }

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      업체관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportCompanies()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openCompanyForm()">+ 업체 등록</button>
      </div>
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input placeholder="업체명, 주소, 구역 검색" value="${clientSearch}"
               oninput="clientSearch=this.value;renderAllClients()">
      </div>
      <select class="admin-area-select" onchange="clientAreaFilter=this.value;renderAllClients()">
        <option value="">전체 구역</option>
        ${areas.map(a => `<option value="${a}"${a === clientAreaFilter ? ' selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>

    <p class="text-muted" style="margin-bottom:12px">총 ${filtered.length}개 업체</p>

    ${filtered.map(c => {
      const scheds = getCompanySchedules(c.id);
      const days = scheds.map(s => WEEKDAY_NAMES[s.weekday]).join(', ') || '-';
      const assigns = getCompanyAssignments(c.id, selectedMonth);
      const workers = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '미배정';

      const statusBadge = c.status === 'active'
        ? '<span class="badge badge-done">활성</span>'
        : c.status === 'paused'
          ? '<span class="badge badge-today">중지</span>'
          : '<span class="badge badge-warn">해지</span>';

      return `
        <div class="card company-card" onclick="openCompanyDetail('${c.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${c.name}</div>
              <div class="card-subtitle">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}</div>
            </div>
            ${statusBadge}
          </div>
          <div class="company-card-info">
            <span class="info-chip">📅 ${days}</span>
            <span class="info-chip">👤 ${workers}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;
}


// ════════════════════════════════════════════════════
// 업체 등록 폼
// ════════════════════════════════════════════════════

function openCompanyForm(companyId) {
  const isEdit = !!companyId;
  const c = isEdit ? adminData.companies.find(x => x.id === companyId) : {};

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '업체 수정' : '업체 등록'}</h3>

    <div class="field">
      <label>업체명 *</label>
      <input id="fName" value="${c.name || ''}" placeholder="업체명 입력">
    </div>
    <div class="field">
      <label>주소 (위치)</label>
      <input id="fLocation" value="${c.location || ''}" placeholder="주소 입력">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>구역 코드</label>
        <input id="fAreaCode" value="${c.area_code || ''}" placeholder="예: ACE21">
      </div>
      <div class="field">
        <label>구역명</label>
        <input id="fAreaName" value="${c.area_name || ''}" placeholder="예: 에이스하이테크21">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>담당자명</label>
        <input id="fContact" value="${c.contact_name || ''}" placeholder="담당자명">
      </div>
      <div class="field">
        <label>담당자 연락처</label>
        <input id="fPhone" value="${c.contact_phone || ''}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="field">
      <label>상태</label>
      <select id="fStatus">
        <option value="active"${c.status === 'active' ? ' selected' : ''}>활성</option>
        <option value="paused"${c.status === 'paused' ? ' selected' : ''}>중지</option>
        <option value="terminated"${c.status === 'terminated' ? ' selected' : ''}>해지</option>
      </select>
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="fMemo" rows="2" placeholder="메모">${c.memo || ''}</textarea>
    </div>

    <button class="btn" onclick="saveCompany('${companyId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteCompany('${companyId}')">업체 삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function saveCompany(companyId) {
  const name = $('fName').value.trim();
  if (!name) return toast('업체명을 입력하세요', 'error');

  const payload = {
    name,
    location:      $('fLocation').value.trim(),
    area_code:     $('fAreaCode').value.trim(),
    area_name:     $('fAreaName').value.trim(),
    contact_name:  $('fContact').value.trim(),
    contact_phone: $('fPhone').value.trim(),
    status:        $('fStatus').value,
    memo:          $('fMemo').value.trim(),
  };

  let error;
  if (companyId) {
    ({ error } = await sb.from('companies').update(payload).eq('id', companyId));
  } else {
    const { data: newCompany, error: insertErr } = await sb.from('companies').insert(payload).select().single();
    error = insertErr;

    // 신규 업체: 현재 선택된 월에 빈 financials 레코드 자동 생성
    if (!error && newCompany) {
      await sb.from('company_financials').insert({
        company_id:      newCompany.id,
        month:           selectedMonth || currentMonth(),
        contract_amount: 0,
        ocp_amount:      0,
        eco_amount:      0,
        worker_pay_total: 0,
      });
    }
  }

  if (error) return toast(error.message, 'error');

  toast(companyId ? '수정 완료' : '등록 완료');
  closeModal();
  await loadAdminData();
  renderAllClients();
}

async function deleteCompany(companyId) {
  if (!confirm('이 업체를 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return;

  // 관련 데이터 먼저 삭제 (FK cascade가 없을 수 있으므로)
  await sb.from('company_financials').delete().eq('company_id', companyId);
  await sb.from('company_workers').delete().eq('company_id', companyId);
  await sb.from('company_schedule').delete().eq('company_id', companyId);
  await sb.from('company_notes').delete().eq('company_id', companyId);
  await sb.from('billing_records').delete().eq('company_id', companyId);

  const { error } = await sb.from('companies').delete().eq('id', companyId);
  if (error) return toast(error.message, 'error');

  toast('삭제 완료');
  closeModal();
  await loadAdminData();
  renderAllClients();
}


// ════════════════════════════════════════════════════
// 업체 상세 (수정 + 스케줄 + 배정 + 급여)
// ════════════════════════════════════════════════════

async function openCompanyDetail(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  const scheds = getCompanySchedules(companyId);
  const assigns = getCompanyAssignments(companyId, selectedMonth);
  const allWorkers = getActiveWorkers();

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${c.name}</h3>
    <div class="detail-location">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}</div>

    <div class="detail-section">
      <button class="btn-sm btn-blue" onclick="openCompanyForm('${companyId}')">기본정보 수정</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📅 청소 요일 설정</div>
      <div class="weekday-grid" id="weekdayGrid_${companyId}">
        ${WEEKDAY_NAMES.map((name, idx) => {
          const active = scheds.some(s => s.weekday === idx);
          return `<button class="weekday-btn${active ? ' active' : ''}"
                    onclick="toggleWeekday('${companyId}', ${idx}, this)">${name}</button>`;
        }).join('')}
      </div>
      <div class="admin-time-row" style="margin-top:10px">
        <div class="field" style="margin-bottom:0">
          <label>시작</label>
          <input type="time" id="schedStart_${companyId}" value="${scheds[0]?.start_time?.slice(0,5) || ''}">
        </div>
        <div class="field" style="margin-bottom:0">
          <label>종료</label>
          <input type="time" id="schedEnd_${companyId}" value="${scheds[0]?.end_time?.slice(0,5) || ''}">
        </div>
        <button class="btn-sm btn-blue" style="align-self:flex-end"
                onclick="saveScheduleTimes('${companyId}')">시간 저장</button>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        👤 ${selectedMonth.split('-')[1]}월 직원 배정
      </div>

      <div id="assignList_${companyId}">
        ${assigns.length > 0 ? assigns.map(a => `
          <div class="assign-row">
            <div class="assign-info">
              <span class="assign-name">${getWorkerName(a.worker_id)}</span>
              ${a.is_primary ? '<span class="badge badge-area">주담당</span>' : ''}
            </div>
            <div class="assign-actions">
              <input type="number" class="assign-pay-input" value="${a.pay_amount || 0}"
                     onchange="updatePayAmount('${a.id}', this.value)" placeholder="지급액">
              <span class="assign-pay-unit">원</span>
              <button class="btn-sm btn-red" style="padding:4px 10px;font-size:11px"
                      onclick="removeAssignment('${a.id}', '${companyId}')">삭제</button>
            </div>
          </div>
        `).join('') : '<p class="text-muted">배정된 직원이 없습니다.</p>'}
      </div>

      <div class="admin-add-assign" style="margin-top:12px">
        <select id="newWorker_${companyId}" class="admin-worker-select">
          <option value="">직원 선택</option>
          ${allWorkers.filter(w => !assigns.some(a => a.worker_id === w.id)).map(w =>
            `<option value="${w.id}">${w.name}</option>`
          ).join('')}
        </select>
        <input type="number" id="newPay_${companyId}" class="assign-pay-input" placeholder="지급액" value="0">
        <button class="btn-sm btn-green" onclick="addAssignment('${companyId}')">배정</button>
      </div>
    </div>

    ${c.contact_name || c.contact_phone ? `
    <div class="detail-section">
      <div class="detail-section-title">📞 담당자</div>
      <p class="text-muted">${c.contact_name || ''} ${c.contact_phone || ''}</p>
    </div>
    ` : ''}

    ${c.memo ? `
    <div class="detail-section">
      <div class="detail-section-title">📝 메모</div>
      <div class="special-notes-box">${c.memo.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}


// ════════════════════════════════════════════════════
// 5. 청소 요일 설정
// ════════════════════════════════════════════════════

async function toggleWeekday(companyId, weekday, btn) {
  const isActive = btn.classList.contains('active');

  if (isActive) {
    const existing = adminData.schedules.find(
      s => s.company_id === companyId && s.weekday === weekday
    );
    if (existing) {
      const { error } = await sb.from('company_schedule')
        .update({ is_active: false })
        .eq('id', existing.id);
      if (error) return toast(error.message, 'error');
      existing.is_active = false;
    }
    btn.classList.remove('active');
  } else {
    const existing = adminData.schedules.find(
      s => s.company_id === companyId && s.weekday === weekday
    );
    if (existing) {
      const { error } = await sb.from('company_schedule')
        .update({ is_active: true })
        .eq('id', existing.id);
      if (error) return toast(error.message, 'error');
      existing.is_active = true;
    } else {
      const { data, error } = await sb.from('company_schedule')
        .insert({ company_id: companyId, weekday, is_active: true })
        .select().single();
      if (error) return toast(error.message, 'error');
      adminData.schedules.push(data);
    }
    btn.classList.add('active');
  }

  toast('요일 변경됨');
}

async function saveScheduleTimes(companyId) {
  const startTime = $(`schedStart_${companyId}`).value || null;
  const endTime = $(`schedEnd_${companyId}`).value || null;

  const activeScheds = adminData.schedules.filter(
    s => s.company_id === companyId && s.is_active
  );

  if (activeScheds.length === 0) return toast('먼저 요일을 선택하세요', 'error');

  for (const s of activeScheds) {
    const { error } = await sb.from('company_schedule')
      .update({ start_time: startTime, end_time: endTime })
      .eq('id', s.id);
    if (error) { toast(error.message, 'error'); return; }
    s.start_time = startTime;
    s.end_time = endTime;
  }

  toast('시간 저장됨');
}


// ════════════════════════════════════════════════════
// 6. 직원 배정
// ════════════════════════════════════════════════════

async function addAssignment(companyId) {
  const workerId = $(`newWorker_${companyId}`).value;
  const payAmount = parseInt($(`newPay_${companyId}`).value) || 0;

  if (!workerId) return toast('직원을 선택하세요', 'error');

  const { data, error } = await sb.from('company_workers').insert({
    company_id: companyId,
    worker_id:  workerId,
    month:      selectedMonth,
    pay_amount: payAmount,
  }).select().single();

  if (error) {
    if (error.code === '23505') return toast('이미 배정된 직원입니다', 'error');
    return toast(error.message, 'error');
  }

  adminData.assignments.push(data);
  toast('배정 완료');
  await openCompanyDetail(companyId);
}

async function removeAssignment(assignId, companyId) {
  if (!confirm('이 배정을 삭제하시겠습니까?')) return;

  const { error } = await sb.from('company_workers').delete().eq('id', assignId);
  if (error) return toast(error.message, 'error');

  adminData.assignments = adminData.assignments.filter(a => a.id !== assignId);
  toast('배정 삭제됨');
  await openCompanyDetail(companyId);
}


// ════════════════════════════════════════════════════
// 7. 직원별 지급 금액 설정
// ════════════════════════════════════════════════════

async function updatePayAmount(assignId, value) {
  const payAmount = parseInt(value) || 0;

  const { error } = await sb.from('company_workers')
    .update({ pay_amount: payAmount })
    .eq('id', assignId);

  if (error) return toast(error.message, 'error');

  const local = adminData.assignments.find(a => a.id === assignId);
  if (local) local.pay_amount = payAmount;

  toast('지급액 수정됨');
}


// ════════════════════════════════════════════════════
// 8~9. 요청사항 관리
// ════════════════════════════════════════════════════

function renderRequests() {
  const mc = $('mainContent');

  let list = adminData.requests;
  if (requestFilter === 'pending') {
    list = list.filter(r => !r.is_resolved && !isExpired(r.expires_at));
  } else if (requestFilter === 'resolved') {
    list = list.filter(r => r.is_resolved);
  }

  const pendingCount = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at)).length;
  const resolvedCount = adminData.requests.filter(r => r.is_resolved).length;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      요청관리
      <button class="btn-sm btn-blue" onclick="exportRequests()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미처리</div>
        <div class="stat-value yellow">${pendingCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">처리완료</div>
        <div class="stat-value green">${resolvedCount}</div>
      </div>
    </div>

    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${requestFilter === 'all' ? ' active' : ''}"
              onclick="requestFilter='all';renderRequests()">전체 (${adminData.requests.length})</button>
      <button class="view-toggle-btn${requestFilter === 'pending' ? ' active' : ''}"
              onclick="requestFilter='pending';renderRequests()">미처리 (${pendingCount})</button>
      <button class="view-toggle-btn${requestFilter === 'resolved' ? ' active' : ''}"
              onclick="requestFilter='resolved';renderRequests()">처리완료 (${resolvedCount})</button>
    </div>

    ${list.length > 0 ? list.map(r => {
      const expired = isExpired(r.expires_at);
      const statusBadge = r.is_resolved
        ? '<span class="badge badge-done">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn">만료</span>'
          : '<span class="badge badge-today">대기중</span>';

      return `
        <div class="card request-card ${r.is_resolved ? 'resolved' : ''}" onclick="openRequestDetail('${r.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${getCompanyName(r.company_id)}</div>
              <div class="card-subtitle">
                ${getWorkerName(r.created_by)} · ${formatDate(r.created_at)}
              </div>
            </div>
            ${statusBadge}
          </div>
          <div class="request-content">${r.content}</div>
          ${!r.is_resolved && !expired ? `
            <div class="request-card-footer">
              <span class="text-muted">만료: ${formatDateShort(r.expires_at)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>요청사항이 없습니다</p>
      </div>
    `}
  `;
}

function openRequestDetail(requestId) {
  const r = adminData.requests.find(x => x.id === requestId);
  if (!r) return;

  const expired = isExpired(r.expires_at);
  const company = adminData.companies.find(c => c.id === r.company_id);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>요청사항 상세</h3>

    <div class="detail-section">
      <div class="detail-section-title">📍 업체</div>
      <p style="font-size:14px;font-weight:600">${company?.name || '알 수 없음'}</p>
      <p class="text-muted">${company?.location || ''}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">👤 요청자</div>
      <p class="text-muted">${getWorkerName(r.created_by)}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📝 요청 내용</div>
      <div class="special-notes-box">${r.content.replace(/\n/g, '<br>')}</div>
    </div>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">요청일</div>
          <p class="text-muted">${formatDate(r.created_at)}</p>
        </div>
        <div>
          <div class="stat-label">만료일</div>
          <p class="text-muted">${formatDateShort(r.expires_at)} ${expired ? '(만료됨)' : ''}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">상태</div>
      <p>${r.is_resolved
        ? '<span class="badge badge-done" style="font-size:13px;padding:4px 12px">처리완료</span>'
        : expired
          ? '<span class="badge badge-warn" style="font-size:13px;padding:4px 12px">만료됨</span>'
          : '<span class="badge badge-today" style="font-size:13px;padding:4px 12px">대기중</span>'
      }</p>
    </div>

    ${!r.is_resolved ? `
      <button class="btn" style="background:var(--green);margin-top:12px"
              onclick="resolveRequest('${r.id}')">처리 완료로 변경</button>
    ` : `
      <button class="btn" style="background:var(--bg3);color:var(--text2);margin-top:12px"
              onclick="unresolveRequest('${r.id}')">미처리로 되돌리기</button>
    `}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function resolveRequest(requestId) {
  const { error } = await sb.from('requests')
    .update({ is_resolved: true })
    .eq('id', requestId);

  if (error) return toast(error.message, 'error');

  const local = adminData.requests.find(r => r.id === requestId);
  if (local) local.is_resolved = true;

  toast('처리 완료');
  closeModal();
  renderRequests();
}

async function unresolveRequest(requestId) {
  const { error } = await sb.from('requests')
    .update({ is_resolved: false })
    .eq('id', requestId);

  if (error) return toast(error.message, 'error');

  const local = adminData.requests.find(r => r.id === requestId);
  if (local) local.is_resolved = false;

  toast('미처리로 변경됨');
  closeModal();
  renderRequests();
}


// ════════════════════════════════════════════════════
// 10~13. 공지 관리
// ════════════════════════════════════════════════════

function renderNotices() {
  const mc = $('mainContent');

  let list = adminData.notices;
  if (noticeSearch) {
    const q = noticeSearch.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  }

  list = [...list].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      공지관리
      <button class="btn-sm btn-green" onclick="openNoticeForm()">+ 공지 작성</button>
    </div>

    <div class="search-box" style="margin-bottom:16px">
      <input placeholder="공지 검색 (제목, 내용)" value="${noticeSearch}"
             oninput="noticeSearch=this.value;renderNotices()">
    </div>

    <p class="text-muted" style="margin-bottom:12px">총 ${list.length}개 공지</p>

    ${list.length > 0 ? list.map(n => {
      const parsed = parseNoticeTarget(n.title);
      const targetBadge = parsed.type === 'worker'
        ? `<span class="badge badge-area">👤 ${parsed.target}</span>`
        : parsed.type === 'area'
          ? `<span class="badge badge-day">📍 ${parsed.target}</span>`
          : '<span class="badge badge-done">전체</span>';

      return `
        <div class="card notice-card ${n.is_pinned ? 'pinned' : ''}" onclick="openNoticeDetail('${n.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">
                ${n.is_pinned ? '<span class="pin-icon">📌</span> ' : ''}${parsed.cleanTitle}
              </div>
              <div class="card-subtitle">
                ${getWorkerName(n.created_by)} · ${formatDate(n.created_at)}
              </div>
            </div>
            ${targetBadge}
          </div>
          <div class="notice-content">${n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}</div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📢</div>
        <p>공지사항이 없습니다</p>
      </div>
    `}
  `;
}

function openNoticeForm(noticeId) {
  const isEdit = !!noticeId;
  const n = isEdit ? adminData.notices.find(x => x.id === noticeId) : {};

  let targetType = 'all';
  let targetValue = '';
  let cleanTitle = n.title || '';

  if (isEdit) {
    const parsed = parseNoticeTarget(n.title);
    targetType = parsed.type;
    targetValue = parsed.target;
    cleanTitle = parsed.cleanTitle;
  }

  const workers = getActiveWorkers();
  const areas = getUniqueAreas();

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '공지 수정' : '공지 작성'}</h3>

    <div class="field">
      <label>공지 대상 *</label>
      <select id="nTargetType" onchange="onNoticeTargetChange()">
        <option value="all"${targetType === 'all' ? ' selected' : ''}>전체 공지</option>
        <option value="worker"${targetType === 'worker' ? ' selected' : ''}>특정 직원 대상</option>
        <option value="area"${targetType === 'area' ? ' selected' : ''}>특정 구역 대상</option>
      </select>
    </div>

    <div class="field" id="workerTargetField" style="display:${targetType === 'worker' ? 'block' : 'none'}">
      <label>대상 직원 선택 *</label>
      <select id="nTargetWorker" class="admin-worker-select" style="width:100%">
        <option value="">직원 선택</option>
        ${workers.map(w => `<option value="${w.name}"${w.name === targetValue ? ' selected' : ''}>${w.name}</option>`).join('')}
      </select>
    </div>

    <div class="field" id="areaTargetField" style="display:${targetType === 'area' ? 'block' : 'none'}">
      <label>대상 구역 선택 *</label>
      <select id="nTargetArea" class="admin-area-select" style="width:100%">
        <option value="">구역 선택</option>
        ${areas.map(a => `<option value="${a}"${a === targetValue ? ' selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>제목 *</label>
      <input id="nTitle" value="${cleanTitle}" placeholder="공지 제목">
    </div>
    <div class="field">
      <label>내용 *</label>
      <textarea id="nContent" rows="5" placeholder="공지 내용을 입력하세요">${n.content || ''}</textarea>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="nPinned" ${n.is_pinned ? 'checked' : ''} style="width:auto">
      <label for="nPinned" style="margin-bottom:0">📌 상단 고정</label>
    </div>

    <button class="btn" onclick="saveNotice('${noticeId || ''}')">${isEdit ? '수정 저장' : '공지 등록'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteNotice('${noticeId}')">공지 삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onNoticeTargetChange() {
  const type = $('nTargetType').value;
  $('workerTargetField').style.display = type === 'worker' ? 'block' : 'none';
  $('areaTargetField').style.display = type === 'area' ? 'block' : 'none';
}

async function saveNotice(noticeId) {
  const targetType = $('nTargetType').value;
  let titleRaw = $('nTitle').value.trim();
  const content = $('nContent').value.trim();
  const isPinned = $('nPinned').checked;

  if (!titleRaw) return toast('제목을 입력하세요', 'error');
  if (!content) return toast('내용을 입력하세요', 'error');

  let prefix = '';
  if (targetType === 'worker') {
    const workerName = $('nTargetWorker').value;
    if (!workerName) return toast('대상 직원을 선택하세요', 'error');
    prefix = `[직원:${workerName}] `;
  } else if (targetType === 'area') {
    const areaName = $('nTargetArea').value;
    if (!areaName) return toast('대상 구역을 선택하세요', 'error');
    prefix = `[구역:${areaName}] `;
  } else {
    prefix = '[전체] ';
  }

  const title = prefix + titleRaw;

  const payload = {
    title,
    content,
    is_pinned: isPinned,
    created_by: currentWorker.id,
  };

  let error;
  if (noticeId) {
    ({ error } = await sb.from('notices').update(payload).eq('id', noticeId));
  } else {
    ({ error } = await sb.from('notices').insert(payload));
  }

  if (error) return toast(error.message, 'error');

  toast(noticeId ? '공지 수정 완료' : '공지 등록 완료');
  closeModal();
  await loadAdminData();
  renderNotices();
}

function openNoticeDetail(noticeId) {
  const n = adminData.notices.find(x => x.id === noticeId);
  if (!n) return;

  const parsed = parseNoticeTarget(n.title);
  const targetLabel = parsed.type === 'worker'
    ? `👤 직원: ${parsed.target}`
    : parsed.type === 'area'
      ? `📍 구역: ${parsed.target}`
      : '전체 대상';

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${parsed.cleanTitle}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">대상</div>
          <p style="font-size:13px">${targetLabel}</p>
        </div>
        <div>
          <div class="stat-label">작성일</div>
          <p class="text-muted">${formatDate(n.created_at)}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">작성자</div>
      <p class="text-muted">${getWorkerName(n.created_by)}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">내용</div>
      <div class="special-notes-box">${n.content.replace(/\n/g, '<br>')}</div>
    </div>

    ${n.is_pinned ? '<p style="margin-top:8px"><span class="badge badge-today">📌 상단 고정</span></p>' : ''}

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn" style="flex:1" onclick="openNoticeForm('${n.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteNotice('${n.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function deleteNotice(noticeId) {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;

  const { error } = await sb.from('notices').delete().eq('id', noticeId);
  if (error) return toast(error.message, 'error');

  toast('공지 삭제됨');
  closeModal();
  await loadAdminData();
  renderNotices();
}


// ════════════════════════════════════════════════════
// 14~16. 견적 관리 (leads)
// ════════════════════════════════════════════════════

function renderLeads() {
  const mc = $('mainContent');

  let list = adminData.leads;

  // 필터
  if (leadFilter !== 'all') {
    list = list.filter(l => l.status === leadFilter);
  }
  if (leadSearch) {
    const q = leadSearch.toLowerCase();
    list = list.filter(l =>
      l.company_name.toLowerCase().includes(q) ||
      (l.contact_name || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q)
    );
  }

  const statusCounts = {};
  adminData.leads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  const totalEstimate = adminData.leads
    .filter(l => !['lost'].includes(l.status))
    .reduce((s, l) => s + (l.estimated_amount || 0), 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      견적관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportLeads()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openLeadForm()">+ 견적 등록</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">전체 견적</div>
        <div class="stat-value blue">${adminData.leads.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 총액 (실패 제외)</div>
        <div class="stat-value green">${fmt(totalEstimate)}</div>
      </div>
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input placeholder="업체명, 담당자, 위치 검색" value="${leadSearch}"
               oninput="leadSearch=this.value;renderLeads()">
      </div>
      <select class="admin-area-select" onchange="leadFilter=this.value;renderLeads()">
        <option value="all"${leadFilter === 'all' ? ' selected' : ''}>전체 상태</option>
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${leadFilter === k ? ' selected' : ''}>${v.label} (${statusCounts[k] || 0})</option>`
        ).join('')}
      </select>
    </div>

    <p class="text-muted" style="margin-bottom:12px">총 ${list.length}건</p>

    ${list.length > 0 ? list.map(l => {
      const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
      return `
        <div class="card lead-card" onclick="openLeadDetail('${l.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${l.company_name}</div>
              <div class="card-subtitle">
                ${l.contact_name || ''} ${l.contact_phone ? '· ' + l.contact_phone : ''} · ${formatDate(l.created_at)}
              </div>
            </div>
            <span class="badge ${st.badge}">${st.label}</span>
          </div>
          <div class="lead-card-info">
            ${l.estimated_amount ? `<span class="info-chip">💰 ${fmt(l.estimated_amount)}원</span>` : ''}
            ${l.location ? `<span class="info-chip">📍 ${l.location}</span>` : ''}
            ${l.assigned_to ? `<span class="info-chip">👤 ${getWorkerName(l.assigned_to)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>견적 데이터가 없습니다</p>
      </div>
    `}
  `;
}

function openLeadForm(leadId) {
  const isEdit = !!leadId;
  const l = isEdit ? adminData.leads.find(x => x.id === leadId) : {};
  const workers = getActiveWorkers();

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '견적 수정' : '견적 업체 등록'}</h3>

    <div class="field">
      <label>업체명 *</label>
      <input id="lCompanyName" value="${l.company_name || ''}" placeholder="업체명 입력">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>담당자명</label>
        <input id="lContact" value="${l.contact_name || ''}" placeholder="담당자명">
      </div>
      <div class="field">
        <label>연락처</label>
        <input id="lPhone" value="${l.contact_phone || ''}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="field">
      <label>위치</label>
      <input id="lLocation" value="${l.location || ''}" placeholder="주소 입력">
    </div>
    <div class="field">
      <label>견적 금액 (원)</label>
      <input id="lAmount" type="number" value="${l.estimated_amount || ''}" placeholder="예: 500000">
    </div>
    <div class="field">
      <label>진행 상태</label>
      <select id="lStatus">
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<option value="${k}"${(l.status || 'new') === k ? ' selected' : ''}>${v.label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>담당 직원</label>
      <select id="lAssigned">
        <option value="">미지정</option>
        ${workers.map(w => `<option value="${w.id}"${w.id === l.assigned_to ? ' selected' : ''}>${w.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="lNotes" rows="3" placeholder="메모">${l.notes || ''}</textarea>
    </div>

    <button class="btn" onclick="saveLead('${leadId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteLead('${leadId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function saveLead(leadId) {
  const companyName = $('lCompanyName').value.trim();
  if (!companyName) return toast('업체명을 입력하세요', 'error');

  const payload = {
    company_name:    companyName,
    contact_name:    $('lContact').value.trim(),
    contact_phone:   $('lPhone').value.trim(),
    location:        $('lLocation').value.trim(),
    estimated_amount: parseInt($('lAmount').value) || null,
    status:          $('lStatus').value,
    assigned_to:     $('lAssigned').value || null,
    notes:           $('lNotes').value.trim(),
  };

  let error;
  if (leadId) {
    ({ error } = await sb.from('leads').update(payload).eq('id', leadId));
  } else {
    ({ error } = await sb.from('leads').insert(payload));
  }

  if (error) return toast(error.message, 'error');

  toast(leadId ? '견적 수정 완료' : '견적 등록 완료');
  closeModal();
  await loadAdminData();
  renderLeads();
}

function openLeadDetail(leadId) {
  const l = adminData.leads.find(x => x.id === leadId);
  if (!l) return;

  const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${l.company_name}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">담당자</div>
          <p class="text-muted">${l.contact_name || '-'} ${l.contact_phone || ''}</p>
        </div>
        <div>
          <div class="stat-label">위치</div>
          <p class="text-muted">${l.location || '-'}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">견적 금액</div>
          <p style="font-size:18px;font-weight:700;color:var(--green)">${l.estimated_amount ? fmt(l.estimated_amount) + '원' : '미입력'}</p>
        </div>
        <div>
          <div class="stat-label">진행 상태</div>
          <p><span class="badge ${st.badge}" style="font-size:13px;padding:4px 12px">${st.label}</span></p>
        </div>
      </div>
    </div>

    <!-- 상태 빠른 변경 -->
    <div class="detail-section">
      <div class="detail-section-title">상태 변경</div>
      <div class="lead-status-grid">
        ${Object.entries(LEAD_STATUS_MAP).map(([k, v]) =>
          `<button class="btn-sm ${k === l.status ? 'btn-blue' : 'btn-gray'}"
                   style="font-size:12px;padding:6px 12px"
                   onclick="updateLeadStatus('${l.id}', '${k}')">${v.label}</button>`
        ).join('')}
      </div>
    </div>

    ${l.assigned_to ? `
    <div class="detail-section">
      <div class="detail-section-title">담당 직원</div>
      <p class="text-muted">${getWorkerName(l.assigned_to)}</p>
    </div>
    ` : ''}

    ${l.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">메모</div>
      <div class="special-notes-box">${l.notes.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div class="detail-section">
      <p class="text-muted">등록일: ${formatDate(l.created_at)}</p>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" style="flex:1" onclick="openLeadForm('${l.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteLead('${l.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function updateLeadStatus(leadId, status) {
  const { error } = await sb.from('leads')
    .update({ status })
    .eq('id', leadId);

  if (error) return toast(error.message, 'error');

  const local = adminData.leads.find(l => l.id === leadId);
  if (local) local.status = status;

  toast(`상태: ${LEAD_STATUS_MAP[status].label}`);
  openLeadDetail(leadId);
}

async function deleteLead(leadId) {
  if (!confirm('이 견적을 삭제하시겠습니까?')) return;

  const { error } = await sb.from('leads').delete().eq('id', leadId);
  if (error) return toast(error.message, 'error');

  toast('견적 삭제됨');
  closeModal();
  await loadAdminData();
  renderLeads();
}


// ════════════════════════════════════════════════════
// 17~19. 정산 관리 (billing_records)
// ════════════════════════════════════════════════════

function renderBilling() {
  const mc = $('mainContent');

  let list = adminData.billings;

  if (billingView === 'unpaid') {
    list = list.filter(b => b.status !== 'paid');
  } else {
    list = list.filter(b => b.month === billingMonth);
  }

  const unpaidAll = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidAll.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);

  const monthBillings = adminData.billings.filter(b => b.month === billingMonth);
  const monthTotal = monthBillings.reduce((s, b) => s + (b.billed_amount || 0), 0);
  const monthPaid = monthBillings.reduce((s, b) => s + (b.paid_amount || 0), 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      정산관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportBilling()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openBillingForm()">+ 정산 등록</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 총액</div>
        <div class="stat-value red">${fmt(totalUnpaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수건수</div>
        <div class="stat-value yellow">${unpaidAll.length}</div>
      </div>
    </div>

    <!-- 보기 전환: 월별 / 미수금 -->
    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${billingView === 'all' ? ' active' : ''}"
              onclick="billingView='all';renderBilling()">월별 정산</button>
      <button class="view-toggle-btn${billingView === 'unpaid' ? ' active' : ''}"
              onclick="billingView='unpaid';renderBilling()">미수금 목록 (${unpaidAll.length})</button>
    </div>

    ${billingView === 'all' ? `
      ${monthSelectorHTML(billingMonth, 'changeBillingMonth')}

      <div class="admin-row-2" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">${billingMonth.split('-')[1]}월 청구 총액</div>
          <div class="stat-value blue">${fmt(monthTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${billingMonth.split('-')[1]}월 입금 총액</div>
          <div class="stat-value green">${fmt(monthPaid)}</div>
        </div>
      </div>
    ` : ''}

    ${billingView === 'unpaid' ? '<p class="text-muted" style="margin-bottom:12px">입금 완료되지 않은 모든 정산 건을 표시합니다.</p>' : ''}

    ${list.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>업체</th>
              <th>${billingView === 'unpaid' ? '월' : '상태'}</th>
              <th>청구액</th>
              <th>입금액</th>
              <th>미수금</th>
            </tr>
          </thead>
          <tbody>${list.map(b => {
            const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
            const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `<tr class="billing-row" onclick="openBillingDetail('${b.id}')" style="cursor:pointer">
              <td>${getCompanyName(b.company_id)}</td>
              <td>${billingView === 'unpaid'
                ? b.month
                : `<span class="badge ${bst.badge}">${bst.label}</span>`
              }</td>
              <td>${fmt(b.billed_amount)}원</td>
              <td class="admin-pay-cell">${fmt(b.paid_amount)}원</td>
              <td style="color:${unpaid > 0 ? 'var(--red)' : 'var(--text2)'}; font-weight:${unpaid > 0 ? '600' : '400'}">
                ${unpaid > 0 ? fmt(unpaid) + '원' : '-'}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>${billingView === 'unpaid' ? '미수금이 없습니다' : '이 달의 정산 데이터가 없습니다'}</p>
      </div>
    `}
  `;
}

async function changeBillingMonth(month) {
  billingMonth = month;
  renderBilling();
}

function openBillingForm(billingId) {
  const isEdit = !!billingId;
  const b = isEdit ? adminData.billings.find(x => x.id === billingId) : {};

  const activeCompanies = adminData.companies.filter(c => c.status === 'active');

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '정산 수정' : '정산 등록'}</h3>

    <div class="field">
      <label>업체 *</label>
      <select id="bCompany" ${isEdit ? 'disabled' : ''}>
        <option value="">업체 선택</option>
        ${activeCompanies.map(c =>
          `<option value="${c.id}"${c.id === b.company_id ? ' selected' : ''}>${c.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>정산 월 *</label>
      <input id="bMonth" type="month" value="${b.month || billingMonth}" ${isEdit ? 'disabled' : ''}>
    </div>
    <div class="field">
      <label>청구 금액 (원) *</label>
      <input id="bBilledAmount" type="number" value="${b.billed_amount || 0}" placeholder="청구 금액">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>세금계산서 발행 여부</label>
        <select id="bBilledStatus">
          <option value="no"${!b.billed_at ? ' selected' : ''}>미발행</option>
          <option value="yes"${b.billed_at ? ' selected' : ''}>발행완료</option>
        </select>
      </div>
      <div class="field">
        <label>발행일</label>
        <input id="bBilledAt" type="date" value="${b.billed_at || ''}">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>입금 여부</label>
        <select id="bPaidStatus">
          <option value="no"${!b.paid_at ? ' selected' : ''}>미입금</option>
          <option value="yes"${b.paid_at ? ' selected' : ''}>입금완료</option>
        </select>
      </div>
      <div class="field">
        <label>입금일</label>
        <input id="bPaidAt" type="date" value="${b.paid_at || ''}">
      </div>
    </div>
    <div class="field">
      <label>입금 금액 (원)</label>
      <input id="bPaidAmount" type="number" value="${b.paid_amount || 0}" placeholder="입금 금액">
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="bMemo" rows="2" placeholder="메모">${b.memo || ''}</textarea>
    </div>

    <button class="btn" onclick="saveBilling('${billingId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteBilling('${billingId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function saveBilling(billingId) {
  const companyId = $('bCompany').value;
  const month = $('bMonth').value;

  if (!companyId && !billingId) return toast('업체를 선택하세요', 'error');
  if (!month && !billingId) return toast('정산 월을 선택하세요', 'error');

  const billedAt = $('bBilledAt').value || null;
  const paidAt = $('bPaidAt').value || null;
  const billedAmount = parseInt($('bBilledAmount').value) || 0;
  const paidAmount = parseInt($('bPaidAmount').value) || 0;
  const billedStatus = $('bBilledStatus').value;
  const paidStatus = $('bPaidStatus').value;

  // 상태 자동 결정
  let status = 'pending';
  if (paidStatus === 'yes' || paidAt) {
    status = 'paid';
  } else if (billedStatus === 'yes' || billedAt) {
    status = 'billed';
  }

  // 연체 판정: 발행했지만 입금 안됐고, 발행일이 30일 이상 경과
  if (status === 'billed' && billedAt) {
    const daysSince = (new Date() - new Date(billedAt)) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) status = 'overdue';
  }

  const payload = {
    billed_amount: billedAmount,
    paid_amount:   paidAmount,
    billed_at:     billedAt,
    paid_at:       paidAt,
    status,
    memo:          $('bMemo').value.trim(),
  };

  let error;
  if (billingId) {
    ({ error } = await sb.from('billing_records').update(payload).eq('id', billingId));
  } else {
    payload.company_id = companyId;
    payload.month = month;
    ({ error } = await sb.from('billing_records').insert(payload));
  }

  if (error) {
    if (error.code === '23505') return toast('해당 업체의 해당 월 정산이 이미 존재합니다', 'error');
    return toast(error.message, 'error');
  }

  toast(billingId ? '정산 수정 완료' : '정산 등록 완료');
  closeModal();
  await loadAdminData();
  renderBilling();
}

function openBillingDetail(billingId) {
  const b = adminData.billings.find(x => x.id === billingId);
  if (!b) return;

  const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
  const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${getCompanyName(b.company_id)} - ${b.month}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">상태</div>
          <p><span class="badge ${bst.badge}" style="font-size:13px;padding:4px 12px">${bst.label}</span></p>
        </div>
        <div>
          <div class="stat-label">미수금</div>
          <p style="font-size:18px;font-weight:700;color:${unpaid > 0 ? 'var(--red)' : 'var(--green)'}">
            ${unpaid > 0 ? fmt(unpaid) + '원' : '없음'}
          </p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">💰 금액 정보</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">청구 금액</span>
          <span class="billing-info-value">${fmt(b.billed_amount)}원</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금 금액</span>
          <span class="billing-info-value" style="color:var(--green)">${fmt(b.paid_amount)}원</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📄 세금계산서</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">발행 여부</span>
          <span class="billing-info-value">${b.billed_at
            ? '<span class="badge badge-done">발행완료</span>'
            : '<span class="badge badge-warn">미발행</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">발행일</span>
          <span class="billing-info-value">${b.billed_at || '-'}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏦 입금</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">입금 여부</span>
          <span class="billing-info-value">${b.paid_at
            ? '<span class="badge badge-done">입금완료</span>'
            : '<span class="badge badge-warn">미입금</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금일</span>
          <span class="billing-info-value">${b.paid_at || '-'}</span>
        </div>
      </div>
    </div>

    ${b.memo ? `
    <div class="detail-section">
      <div class="detail-section-title">📝 메모</div>
      <div class="special-notes-box">${b.memo.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn" style="flex:1" onclick="openBillingForm('${b.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteBilling('${b.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function deleteBilling(billingId) {
  if (!confirm('이 정산 기록을 삭제하시겠습니까?')) return;

  const { error } = await sb.from('billing_records').delete().eq('id', billingId);
  if (error) return toast(error.message, 'error');

  toast('정산 삭제됨');
  closeModal();
  await loadAdminData();
  renderBilling();
}


// ════════════════════════════════════════════════════
// 담당자급여 탭
// ════════════════════════════════════════════════════

function renderStaffPay() {
  const mc = $('mainContent');

  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);

  const payMap = {};
  monthAssigns.forEach(a => {
    if (!payMap[a.worker_id]) payMap[a.worker_id] = { total: 0, companies: 0 };
    payMap[a.worker_id].total += (a.pay_amount || 0);
    payMap[a.worker_id].companies += 1;
  });

  const rows = Object.entries(payMap)
    .map(([wid, info]) => ({ wid, name: getWorkerName(wid), ...info }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      담당자급여
      <button class="btn-sm btn-blue" onclick="exportStaffPay()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changePayMonth')}

    <div class="pay-summary-card">
      <div class="pay-total-label">${selectedMonth.split('-')[1]}월 인건비 합계</div>
      <div class="pay-total-amount">${fmt(grandTotal)}원</div>
      <div class="pay-total-sub">총 ${rows.length}명</div>
    </div>

    ${rows.length > 0 ? rows.map(r => {
      const pct = grandTotal > 0 ? (r.total / grandTotal * 100).toFixed(1) : 0;
      return `
        <div class="card pay-card">
          <div class="card-header">
            <div>
              <div class="card-title">${r.name}</div>
              <div class="card-subtitle">${r.companies}개 업체</div>
            </div>
            <div class="card-amount">${fmt(r.total)}원</div>
          </div>
          <div class="pay-bar-wrap">
            <div class="pay-bar" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('') : '<p class="text-muted">이 달의 급여 데이터가 없습니다.</p>'}
  `;
}

async function changePayMonth(month) {
  selectedMonth = month;
  await ensureMonthData(month);
  renderStaffPay();
}


// ════════════════════════════════════════════════════
// 구역별 현황
// ════════════════════════════════════════════════════

function renderAreaSummary() {
  const mc = $('mainContent');

  const areaMap = {};
  adminData.companies.forEach(c => {
    const area = c.area_name || '기타';
    if (!areaMap[area]) areaMap[area] = { companies: 0, totalPay: 0 };
    areaMap[area].companies += 1;

    const assigns = adminData.assignments.filter(
      a => a.company_id === c.id && a.month === selectedMonth
    );
    assigns.forEach(a => { areaMap[area].totalPay += (a.pay_amount || 0); });
  });

  const rows = Object.entries(areaMap)
    .map(([area, info]) => ({ area, ...info }))
    .sort((a, b) => b.totalPay - a.totalPay);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      구역별 현황
      <button class="btn-sm btn-blue" onclick="exportTasks()" style="font-size:11px;padding:6px 10px">📥 청소기록</button>
    </div>
    ${monthSelectorHTML(selectedMonth, 'changeAreaMonth')}

    ${rows.map(r => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${r.area}</div>
            <div class="card-subtitle">${r.companies}개 업체</div>
          </div>
          <div class="card-amount small">${fmt(r.totalPay)}원</div>
        </div>
      </div>
    `).join('')}
  `;
}

function changeAreaMonth(month) {
  selectedMonth = month;
  renderAreaSummary();
}


// ════════════════════════════════════════════════════
// AI분석 (규칙 기반)
// ════════════════════════════════════════════════════

function renderAnalysis() {
  const mc = $('mainContent');

  const monthAssigns = adminData.assignments.filter(a => a.month === selectedMonth);
  const monthFin = adminData.financials.filter(f => f.month === selectedMonth);

  const assignedCompanyIds = new Set(monthAssigns.map(a => a.company_id));
  const unassigned = adminData.companies.filter(
    c => c.status === 'active' && !assignedCompanyIds.has(c.id)
  );

  const companyPayMap = {};
  monthAssigns.forEach(a => {
    companyPayMap[a.company_id] = (companyPayMap[a.company_id] || 0) + (a.pay_amount || 0);
  });
  const highPay = Object.entries(companyPayMap)
    .filter(([, pay]) => pay > 500000)
    .map(([cid, pay]) => {
      const comp = adminData.companies.find(c => c.id === cid);
      return { name: comp?.name || '?', pay };
    })
    .sort((a, b) => b.pay - a.pay);

  const workerLoadMap = {};
  monthAssigns.forEach(a => {
    workerLoadMap[a.worker_id] = (workerLoadMap[a.worker_id] || 0) + 1;
  });
  const heavy = Object.entries(workerLoadMap)
    .filter(([, cnt]) => cnt >= 8)
    .map(([wid, cnt]) => ({ name: getWorkerName(wid), cnt }))
    .sort((a, b) => b.cnt - a.cnt);

  const pendingRequests = adminData.requests.filter(r => !r.is_resolved && !isExpired(r.expires_at));

  const unpaidBillings = adminData.billings.filter(b => b.status !== 'paid');
  const overdueCount = adminData.billings.filter(b => b.status === 'overdue').length;

  const activeLeads = adminData.leads.filter(l => !['won','lost'].includes(l.status));
  const wonLeads = adminData.leads.filter(l => l.status === 'won');

  mc.innerHTML = `
    <div class="section-title">AI 분석</div>
    ${monthSelectorHTML(selectedMonth, 'changeAnalysisMonth')}

    <div class="analysis-card">
      <h4>⚠️ 미배정 업체 (${unassigned.length}곳)</h4>
      <p>${unassigned.length > 0
        ? unassigned.map(c => c.name).join(', ')
        : '모든 활성 업체에 직원이 배정되어 있습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💰 고액 지급 업체 (50만원 이상)</h4>
      <p>${highPay.length > 0
        ? highPay.map(h => `${h.name}: ${fmt(h.pay)}원`).join(', ')
        : '50만원 이상 지급 업체가 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>🔥 업무 과부하 직원 (8곳 이상)</h4>
      <p>${heavy.length > 0
        ? heavy.map(h => `${h.name}: ${h.cnt}곳`).join(', ')
        : '과부하 직원이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📋 미처리 요청 (${pendingRequests.length}건)</h4>
      <p>${pendingRequests.length > 0
        ? pendingRequests.slice(0, 5).map(r =>
            `${getCompanyName(r.company_id)}: ${r.content.slice(0, 30)}${r.content.length > 30 ? '...' : ''}`
          ).join(', ') + (pendingRequests.length > 5 ? ` 외 ${pendingRequests.length - 5}건` : '')
        : '모든 요청이 처리되었습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>💳 미수금 현황 (${unpaidBillings.length}건${overdueCount > 0 ? ', 연체 ' + overdueCount + '건' : ''})</h4>
      <p>${unpaidBillings.length > 0
        ? unpaidBillings.slice(0, 5).map(b => {
            const amt = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `${getCompanyName(b.company_id)}(${b.month}): ${fmt(amt)}원`;
          }).join(', ') + (unpaidBillings.length > 5 ? ` 외 ${unpaidBillings.length - 5}건` : '')
        : '미수금이 없습니다.'}</p>
    </div>

    <div class="analysis-card">
      <h4>📊 견적 현황 (진행중 ${activeLeads.length}건, 성공 ${wonLeads.length}건)</h4>
      <p>${activeLeads.length > 0
        ? activeLeads.slice(0, 5).map(l => {
            const st = LEAD_STATUS_MAP[l.status];
            return `${l.company_name}(${st.label})`;
          }).join(', ') + (activeLeads.length > 5 ? ` 외 ${activeLeads.length - 5}건` : '')
        : '진행중인 견적이 없습니다.'}</p>
    </div>
  `;
}

function changeAnalysisMonth(month) {
  selectedMonth = month;
  renderAnalysis();
}


// ════════════════════════════════════════════════════
// 20~25. 수익 관리 (company_financials)
// ════════════════════════════════════════════════════

function calcFee(contractAmount, type, value) {
  if (!type || type === 'none') return 0;
  if (type === 'fixed') return parseInt(value) || 0;
  if (type === 'percent') return Math.round((contractAmount * (parseFloat(value) || 0)) / 100);
  return 0;
}

function parseFeeMetadata(memo) {
  try {
    if (!memo) return {};
    const parsed = JSON.parse(memo);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

function getWorkerPayTotal(companyId, month) {
  const assigns = adminData.assignments.filter(
    a => a.company_id === companyId && a.month === month
  );
  return assigns.reduce((s, a) => s + (a.pay_amount || 0), 0);
}

function renderRevenue() {
  const mc = $('mainContent');

  const activeCompanies = adminData.companies.filter(c => c.status === 'active');

  // 월별 재무 데이터 매핑
  const finMap = {};
  adminData.financials
    .filter(f => f.month === revenueMonth)
    .forEach(f => { finMap[f.company_id] = f; });

  // 요약 계산
  let totalContract = 0;
  let totalOcp = 0;
  let totalEco = 0;
  let totalWorkerPay = 0;
  let totalNet = 0;

  const rows = activeCompanies.map(c => {
    const fin = finMap[c.id];
    const contract = fin?.contract_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const eco = fin?.eco_amount || 0;
    const workerPay = fin?.worker_pay_total || getWorkerPayTotal(c.id, revenueMonth);
    const net = contract - ocp - eco - workerPay;

    totalContract += contract;
    totalOcp += ocp;
    totalEco += eco;
    totalWorkerPay += workerPay;
    totalNet += net;

    const meta = parseFeeMetadata(fin?.memo);

    return { company: c, contract, ocp, eco, workerPay, net, meta, fin };
  });

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      수익관리
      <button class="btn-sm btn-blue" onclick="exportRevenue()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>
    ${monthSelectorHTML(revenueMonth, 'changeRevenueMonth')}

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">총 계약금액</div>
        <div class="stat-value blue">${fmt(totalContract)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">수수료 합계</div>
        <div class="stat-value yellow">${fmt(totalOcp + totalEco)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">인건비 합계</div>
        <div class="stat-value red">${fmt(totalWorkerPay)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">최종 수익</div>
        <div class="stat-value ${totalNet >= 0 ? 'green' : 'red'}">${fmt(totalNet)}</div>
      </div>
    </div>

    <div class="revenue-summary-bar">
      <div class="revenue-bar-section revenue-bar-ocp" style="width:${totalContract > 0 ? ((totalOcp / totalContract) * 100).toFixed(1) : 0}%" title="OCP 수수료"></div>
      <div class="revenue-bar-section revenue-bar-eco" style="width:${totalContract > 0 ? ((totalEco / totalContract) * 100).toFixed(1) : 0}%" title="에코 수수료"></div>
      <div class="revenue-bar-section revenue-bar-worker" style="width:${totalContract > 0 ? ((totalWorkerPay / totalContract) * 100).toFixed(1) : 0}%" title="인건비"></div>
      <div class="revenue-bar-section revenue-bar-net" style="width:${totalContract > 0 ? (Math.max(0, totalNet) / totalContract * 100).toFixed(1) : 0}%" title="순수익"></div>
    </div>
    <div class="revenue-legend">
      <span><span class="legend-dot" style="background:var(--accent)"></span> OCP 수수료</span>
      <span><span class="legend-dot" style="background:var(--orange)"></span> 에코 수수료</span>
      <span><span class="legend-dot" style="background:var(--red)"></span> 인건비</span>
      <span><span class="legend-dot" style="background:var(--green)"></span> 순수익</span>
    </div>

    <p class="text-muted" style="margin:16px 0 12px">총 ${rows.length}개 업체</p>

    ${rows.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>업체</th>
              <th>계약금액</th>
              <th>수수료</th>
              <th>인건비</th>
              <th>순수익</th>
            </tr>
          </thead>
          <tbody>${rows.map(r => {
            const feeLabel = [];
            if (r.ocp > 0) feeLabel.push('OCP ' + fmt(r.ocp));
            if (r.eco > 0) feeLabel.push('에코 ' + fmt(r.eco));
            const feeStr = feeLabel.length > 0 ? feeLabel.join('+') : '-';

            return `<tr class="revenue-row" onclick="openRevenueForm('${r.company.id}')" style="cursor:pointer">
              <td>
                <div style="font-weight:600">${r.company.name}</div>
                <div class="text-muted" style="font-size:11px">${r.company.area_name || ''}</div>
              </td>
              <td>${r.contract > 0 ? fmt(r.contract) + '원' : '-'}</td>
              <td style="font-size:12px">${feeStr}</td>
              <td>${r.workerPay > 0 ? fmt(r.workerPay) + '원' : '-'}</td>
              <td style="font-weight:700;color:${r.net >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${r.contract > 0 ? fmt(r.net) + '원' : '-'}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💰</div>
        <p>활성 업체가 없습니다</p>
      </div>
    `}
  `;
}

async function changeRevenueMonth(month) {
  revenueMonth = month;
  await ensureMonthData(month);
  renderRevenue();
}

function openRevenueForm(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  const fin = adminData.financials.find(
    f => f.company_id === companyId && f.month === revenueMonth
  );

  const meta = parseFeeMetadata(fin?.memo);
  const contractAmount = fin?.contract_amount || 0;
  const ocpType = meta.ocp_type || 'none';
  const ocpRate = meta.ocp_rate || 0;
  const ecoType = meta.eco_type || 'none';
  const ecoRate = meta.eco_rate || 0;
  const ocpAmount = fin?.ocp_amount || 0;
  const ecoAmount = fin?.eco_amount || 0;

  // 직원 지급 총액 계산
  const workerPayCalc = getWorkerPayTotal(companyId, revenueMonth);
  const workerPayStored = fin?.worker_pay_total || 0;
  const workerPay = workerPayStored > 0 ? workerPayStored : workerPayCalc;

  const net = contractAmount - ocpAmount - ecoAmount - workerPay;

  // 해당 월 배정 직원 목록
  const assigns = adminData.assignments.filter(
    a => a.company_id === companyId && a.month === revenueMonth
  );

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${c.name} - 수익설정</h3>
    <p class="text-muted" style="margin-bottom:16px">${revenueMonth} · ${c.area_name || ''}</p>

    <div class="field">
      <label>계약 금액 (원) *</label>
      <input id="rvContract" type="number" value="${contractAmount}" placeholder="월 계약 금액"
             oninput="previewRevenue()">
    </div>

    <div class="detail-section" style="margin-top:16px">
      <div class="detail-section-title">오피스클린프로 수수료</div>
      <div class="admin-row-2">
        <div class="field">
          <label>수수료 방식</label>
          <select id="rvOcpType" onchange="onFeeTypeChange('ocp');previewRevenue()">
            <option value="none"${ocpType === 'none' ? ' selected' : ''}>없음</option>
            <option value="fixed"${ocpType === 'fixed' ? ' selected' : ''}>정액</option>
            <option value="percent"${ocpType === 'percent' ? ' selected' : ''}>정률 (%)</option>
          </select>
        </div>
        <div class="field" id="ocpValueField" style="display:${ocpType !== 'none' ? 'block' : 'none'}">
          <label id="ocpValueLabel">${ocpType === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)'}</label>
          <input id="rvOcpValue" type="number" value="${ocpType === 'percent' ? ocpRate : (ocpType === 'fixed' ? ocpAmount : 0)}"
                 placeholder="${ocpType === 'percent' ? '예: 10' : '예: 100000'}"
                 oninput="previewRevenue()">
        </div>
      </div>
      <p class="text-muted" id="ocpPreview" style="margin-top:4px;font-size:12px">
        ${ocpAmount > 0 ? '→ ' + fmt(ocpAmount) + '원' : ''}
      </p>
    </div>

    <div class="detail-section" style="margin-top:12px">
      <div class="detail-section-title">에코오피스클린 수수료</div>
      <div class="admin-row-2">
        <div class="field">
          <label>수수료 방식</label>
          <select id="rvEcoType" onchange="onFeeTypeChange('eco');previewRevenue()">
            <option value="none"${ecoType === 'none' ? ' selected' : ''}>없음</option>
            <option value="fixed"${ecoType === 'fixed' ? ' selected' : ''}>정액</option>
            <option value="percent"${ecoType === 'percent' ? ' selected' : ''}>정률 (%)</option>
          </select>
        </div>
        <div class="field" id="ecoValueField" style="display:${ecoType !== 'none' ? 'block' : 'none'}">
          <label id="ecoValueLabel">${ecoType === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)'}</label>
          <input id="rvEcoValue" type="number" value="${ecoType === 'percent' ? ecoRate : (ecoType === 'fixed' ? ecoAmount : 0)}"
                 placeholder="${ecoType === 'percent' ? '예: 5' : '예: 50000'}"
                 oninput="previewRevenue()">
        </div>
      </div>
      <p class="text-muted" id="ecoPreview" style="margin-top:4px;font-size:12px">
        ${ecoAmount > 0 ? '→ ' + fmt(ecoAmount) + '원' : ''}
      </p>
    </div>

    <div class="detail-section" style="margin-top:16px">
      <div class="detail-section-title">👤 직원 지급 총액</div>
      ${assigns.length > 0 ? `
        <div style="margin-bottom:8px">
          ${assigns.map(a => `
            <div class="assign-row" style="margin-bottom:4px">
              <span class="assign-name">${getWorkerName(a.worker_id)}</span>
              <span class="admin-pay-cell">${fmt(a.pay_amount)}원</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="text-muted" style="margin-bottom:8px">배정된 직원이 없습니다.</p>'}
      <div class="billing-info-item" style="background:var(--bg3)">
        <span class="billing-info-label">합계</span>
        <span class="billing-info-value" id="rvWorkerPay" style="color:var(--red)">${fmt(workerPay)}원</span>
      </div>
    </div>

    <div class="revenue-result-card" id="rvResultCard">
      <div class="revenue-result-title">최종 수익</div>
      <div class="revenue-result-formula">
        <span>${fmt(contractAmount)}</span>
        <span>-</span>
        <span id="rvFormulaOcp">${fmt(ocpAmount)}</span>
        <span>-</span>
        <span id="rvFormulaEco">${fmt(ecoAmount)}</span>
        <span>-</span>
        <span>${fmt(workerPay)}</span>
        <span>=</span>
        <span id="rvFormulaNet" class="${net >= 0 ? 'positive' : 'negative'}">${fmt(net)}</span>
      </div>
      <div class="revenue-result-labels">
        <span>계약금액</span>
        <span></span>
        <span>OCP</span>
        <span></span>
        <span>에코</span>
        <span></span>
        <span>인건비</span>
        <span></span>
        <span>순수익</span>
      </div>
    </div>

    <button class="btn" style="margin-top:16px" onclick="saveRevenue('${companyId}')">저장하기</button>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onFeeTypeChange(prefix) {
  const type = $(`rv${prefix === 'ocp' ? 'Ocp' : 'Eco'}Type`).value;
  const fieldId = `${prefix}ValueField`;
  const labelId = `${prefix}ValueLabel`;

  if (type === 'none') {
    $(fieldId).style.display = 'none';
  } else {
    $(fieldId).style.display = 'block';
    $(labelId).textContent = type === 'percent' ? '수수료율 (%)' : '수수료 금액 (원)';
    $(`rv${prefix === 'ocp' ? 'Ocp' : 'Eco'}Value`).placeholder = type === 'percent' ? '예: 10' : '예: 100000';
  }
}

function previewRevenue() {
  const contract = parseInt($('rvContract').value) || 0;

  const ocpType = $('rvOcpType').value;
  const ocpVal = parseFloat($('rvOcpValue')?.value) || 0;
  const ocpAmt = calcFee(contract, ocpType, ocpVal);

  const ecoType = $('rvEcoType').value;
  const ecoVal = parseFloat($('rvEcoValue')?.value) || 0;
  const ecoAmt = calcFee(contract, ecoType, ecoVal);

  // 직원 지급 총액은 배정 데이터에서 가져옴 (고정값)
  const workerPayText = $('rvWorkerPay')?.textContent || '0';
  const workerPay = parseInt(workerPayText.replace(/[^0-9-]/g, '')) || 0;

  const net = contract - ocpAmt - ecoAmt - workerPay;

  // 미리보기 업데이트
  const ocpPre = $('ocpPreview');
  if (ocpPre) ocpPre.textContent = ocpAmt > 0 ? '→ ' + fmt(ocpAmt) + '원' : '';

  const ecoPre = $('ecoPreview');
  if (ecoPre) ecoPre.textContent = ecoAmt > 0 ? '→ ' + fmt(ecoAmt) + '원' : '';

  // 수식 업데이트
  const fOcp = $('rvFormulaOcp');
  const fEco = $('rvFormulaEco');
  const fNet = $('rvFormulaNet');
  if (fOcp) fOcp.textContent = fmt(ocpAmt);
  if (fEco) fEco.textContent = fmt(ecoAmt);
  if (fNet) {
    fNet.textContent = fmt(net);
    fNet.className = net >= 0 ? 'positive' : 'negative';
  }
}

async function saveRevenue(companyId) {
  const contract = parseInt($('rvContract').value) || 0;
  if (contract <= 0) return toast('계약 금액을 입력하세요', 'error');

  const ocpType = $('rvOcpType').value;
  const ocpVal = parseFloat($('rvOcpValue')?.value) || 0;
  const ocpAmount = calcFee(contract, ocpType, ocpVal);

  const ecoType = $('rvEcoType').value;
  const ecoVal = parseFloat($('rvEcoValue')?.value) || 0;
  const ecoAmount = calcFee(contract, ecoType, ecoVal);

  // 직원 지급 총액 자동 계산
  const workerPayTotal = getWorkerPayTotal(companyId, revenueMonth);

  // 수수료 메타데이터 (JSON)
  const feeMeta = {};
  if (ocpType !== 'none') {
    feeMeta.ocp_type = ocpType;
    if (ocpType === 'percent') feeMeta.ocp_rate = ocpVal;
  }
  if (ecoType !== 'none') {
    feeMeta.eco_type = ecoType;
    if (ecoType === 'percent') feeMeta.eco_rate = ecoVal;
  }

  const memoStr = Object.keys(feeMeta).length > 0 ? JSON.stringify(feeMeta) : null;

  const payload = {
    company_id:      companyId,
    month:           revenueMonth,
    contract_amount: contract,
    ocp_amount:      ocpAmount,
    eco_amount:      ecoAmount,
    worker_pay_total: workerPayTotal,
    memo:            memoStr,
  };

  // upsert: 기존 데이터가 있으면 업데이트, 없으면 삽입
  const existing = adminData.financials.find(
    f => f.company_id === companyId && f.month === revenueMonth
  );

  let error;
  if (existing) {
    ({ error } = await sb.from('company_financials').update(payload).eq('id', existing.id));
  } else {
    ({ error } = await sb.from('company_financials').insert(payload));
  }

  if (error) {
    if (error.code === '23505') {
      // UNIQUE 제약 충돌 → update로 재시도
      const { error: err2 } = await sb.from('company_financials')
        .update(payload)
        .eq('company_id', companyId)
        .eq('month', revenueMonth);
      if (err2) return toast(err2.message, 'error');
    } else {
      return toast(error.message, 'error');
    }
  }

  toast('수익 정보 저장 완료');
  closeModal();
  await loadAdminData();
  renderRevenue();
}

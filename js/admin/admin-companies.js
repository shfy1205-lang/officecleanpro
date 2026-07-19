/**
 * admin-companies.js - 업체관리 탭
 * 업체 목록, 등록/수정/삭제, 상세 모달, 스케줄(빈도 포함), 배정, 주차/분리수거
 */

// ─── 업체관리 모듈 상태 (전역 오염 방지) ───
const _comp = {
  openId: null,
  ecoFilter: '',
  searchDebounce: null
};

// ─── 빈도 라벨 매핑 ───
const FREQ_LABELS = {
  weekly:   '매주',
  biweekly: '격주',
};

function getFreqLabel(freq) {
  return FREQ_LABELS[freq] || '매주';
}

// 에코 분류 필터 변수

// ─── 업체 계약금액 조회 ───
function getCompanyContractAmount(companyId) {
    const company = adminData.companies.find(c => c.id === companyId);
    return company ? (company.contract_amount || 0) : 0;
}

// ════════════════════════════════════════════════════
// 업체 목록 조회
// ════════════════════════════════════════════════════

function renderAllClients(listOnly) {
  const mc = $('mainContent');

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
  // 해지/활성 분리
  if (_comp.ecoFilter === 'terminated') {
    filtered = filtered.filter(c => c.status === 'terminated');
  } else {
    // 해지 업체는 기본 목록에서 제외 (해지 탭에서만 표시)
    filtered = filtered.filter(c => c.status !== 'terminated');

    // 에코 분류 필터
    if (_comp.ecoFilter === 'direct') {
      filtered = filtered.filter(c => !c.subcontract_from);
    } else if (_comp.ecoFilter === 'eco_sub') {
      filtered = filtered.filter(c => c.subcontract_from === '에코오피스클린');
    } else if (_comp.ecoFilter === 'eco_ad') {
      filtered = filtered.filter(c => c.subcontract_from === '에코광고비');
    }
  }

  // 구역코드 순 정렬 (한글 지역명 → 숫자 순)
  filtered = [...filtered].sort((a, b) => {
    const codeA = (a.area_code || '').replace(/[0-9]/g, '');
    const codeB = (b.area_code || '').replace(/[0-9]/g, '');
    if (codeA !== codeB) return codeA.localeCompare(codeB, 'ko');
    const numA = parseInt((a.area_code || '0').replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt((b.area_code || '0').replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  // 분류별 합계 계산
  const allCompanies = adminData.companies;
  const activeCompanies = allCompanies.filter(c => c.status !== 'terminated');
  const terminatedCount = allCompanies.filter(c => c.status === 'terminated').length;
  const directCount = activeCompanies.filter(c => !c.subcontract_from).length;
  const ecoSubCount = activeCompanies.filter(c => c.subcontract_from === '에코오피스클린').length;
  const ecoAdCount = activeCompanies.filter(c => c.subcontract_from === '에코광고비').length;

  // 성능 최적화: lookup map 구축 (O(n) 1회 → O(1) 조회)
  const _schedMap = {};
  adminData.schedules.forEach(s => {
    if (!s.is_active) return;
    if (!_schedMap[s.company_id]) _schedMap[s.company_id] = [];
    _schedMap[s.company_id].push(s);
  });
  const _assignMap = {};
  adminData.assignments.forEach(a => {
    if (a.month !== selectedMonth) return;
    if (!_assignMap[a.company_id]) _assignMap[a.company_id] = [];
    _assignMap[a.company_id].push(a);
  });

  // 목록 HTML 생성
  const listHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <p class="text-muted" style="margin:0">총 ${filtered.length}개 업체</p>
    </div>
    ${filtered.map(c => {
      const scheds = _schedMap[c.id] || [];
      // 빈도 표시: 요일 + 빈도
      const daysWithFreq = scheds.map(s => {
        const freq = s.frequency || 'weekly';
        const label = WEEKDAY_NAMES[s.weekday];
        return freq === 'biweekly' ? label + '(격주)' : label;
      }).join(', ') || '-';
      const assigns = _assignMap[c.id] || [];
      const workers = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '미배정';

      const contractAmt = c.contract_amount || 0;

      const statusBadge = c.status === 'active'
        ? '<span class="badge badge-done">활성</span>'
        : c.status === 'paused'
          ? '<span class="badge badge-today">중지</span>'
          : '<span class="badge badge-warn">해지</span>';

      const ecoBadge = c.subcontract_from === '에코오피스클린'
        ? '<span style="font-size:10px;background:var(--orange);color:#fff;padding:2px 6px;border-radius:4px;margin-left:4px">도급</span>'
        : c.subcontract_from === '에코광고비'
          ? '<span style="font-size:10px;background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px;margin-left:4px">광고비</span>'
          : '';

      return `
        <div class="card company-card" onclick="openCompanyDetail('${c.id}')">
          <div class="card-header">
            <div style="flex:1;min-width:0">
              <div class="card-title">${escapeHtml(c.name)} ${c.area_code ? '<span style="font-size:11px;color:var(--primary);font-weight:500;margin-left:6px">[' + c.area_code + ']</span>' : ''}${ecoBadge}</div>
              <div class="card-subtitle">${escapeHtml(c.location || '')} ${c.area_name ? '· ' + escapeHtml(c.area_name) : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              ${statusBadge}
              <div style="font-size:16px;font-weight:700;color:var(--primary);white-space:nowrap">${contractAmt > 0 ? fmt(contractAmt) + '원' : ''}</div>
            </div>
          </div>
          <div class="company-card-info">
            <span class="info-chip">📅 ${daysWithFreq}</span>
            <span class="info-chip">👤 ${escapeHtml(workers)}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;

  // 검색 시: 목록 컨테이너만 갱신 (input 보존 → IME 유지)
  if (listOnly) {
    const lc = document.getElementById('clientListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // 전체 렌더
  const areas = getUniqueAreas();
  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      업체관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportCompanies()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openCompanyForm()">+ 업체 등록</button>
      </div>
    </div>

    <!-- 에코 분류 탭 -->
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <button class="btn-sm ${_comp.ecoFilter === '' ? 'btn-blue' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${_comp.ecoFilter === '' ? '' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="_comp.ecoFilter='';renderAllClients()">전체 (${activeCompanies.length})</button>
      <button class="btn-sm ${_comp.ecoFilter === 'direct' ? 'btn-green' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${_comp.ecoFilter === 'direct' ? '' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="_comp.ecoFilter='direct';renderAllClients()">직영 (${directCount})</button>
      <button class="btn-sm ${_comp.ecoFilter === 'eco_sub' ? '' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${_comp.ecoFilter === 'eco_sub' ? 'background:var(--orange);color:#fff' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="_comp.ecoFilter='eco_sub';renderAllClients()">에코 도급 (${ecoSubCount})</button>
      <button class="btn-sm ${_comp.ecoFilter === 'eco_ad' ? '' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${_comp.ecoFilter === 'eco_ad' ? 'background:#8b5cf6;color:#fff' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="_comp.ecoFilter='eco_ad';renderAllClients()">에코 광고비 (${ecoAdCount})</button>
      ${terminatedCount > 0 ? `<button class="btn-sm ${_comp.ecoFilter === 'terminated' ? '' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${_comp.ecoFilter === 'terminated' ? 'background:var(--red);color:#fff' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="_comp.ecoFilter='terminated';renderAllClients()">해지 (${terminatedCount})</button>` : ''}
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input id="clientSearchInput" placeholder="업체명, 주소, 구역 검색" value="${escapeHtml(clientSearch)}">
      </div>
      <select class="admin-area-select" onchange="clientAreaFilter=this.value;renderAllClients()">
        <option value="">전체 구역</option>
        ${areas.map(a => `<option value="${escapeHtml(a)}"${a === clientAreaFilter ? ' selected' : ''}>${escapeHtml(a)}</option>`).join('')}
      </select>
    </div>

    <div id="clientListContainer">${listHTML}</div>
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('clientSearchInput', (val) => {
    clearTimeout(_comp.searchDebounce);
    _comp.searchDebounce = setTimeout(() => {
      clientSearch = val;
      renderAllClients(true);
    }, 200);
  });
}


// ════════════════════════════════════════════════════
// 업체 등록/수정 폼
// ════════════════════════════════════════════════════

function openCompanyForm(companyId) {
  const isEdit = !!companyId;
  const c = isEdit ? adminData.companies.find(x => x.id === companyId) : {};

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '업체 수정' : '업체 등록'}</h3>

    <div class="field">
      <label>업체명 *</label>
      <input id="fName" value="${escapeHtml(c.name || '')}" placeholder="업체명 입력">
    </div>
    <div class="field">
      <label>주소 (위치)</label>
      <input id="fLocation" value="${escapeHtml(c.location || '')}" placeholder="주소 입력">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>구역 코드</label>
        <input id="fAreaCode" value="${escapeHtml(c.area_code || '')}" placeholder="예: ACE21">
      </div>
      <div class="field">
        <label>구역명</label>
        <input id="fAreaName" value="${escapeHtml(c.area_name || '')}" placeholder="예: 에이스하이테크21">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>담당자명</label>
        <input id="fContact" value="${escapeHtml(c.contact_name || '')}" placeholder="담당자명">
      </div>
      <div class="field">
        <label>담당자 연락처</label>
        <input id="fPhone" value="${escapeHtml(c.contact_phone || '')}" placeholder="010-0000-0000">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>상태</label>
        <select id="fStatus" onchange="document.getElementById('fTermWrap').style.display=this.value==='terminated'?'block':'none'">
          <option value="active"${c.status === 'active' ? ' selected' : ''}>활성</option>
          <option value="paused"${c.status === 'paused' ? ' selected' : ''}>중지</option>
          <option value="terminated"${c.status === 'terminated' ? ' selected' : ''}>해지</option>
        </select>
      </div>
      <div class="field" id="fTermWrap" style="display:${c.status === 'terminated' ? 'block' : 'none'}">
        <label>해지일</label>
        <input id="fTerminatedAt" type="date" value="${c.terminated_at || ''}">
      </div>
    </div>
    <div class="field">
      <label>에코 관계</label>
      <select id="fSubcontract">
        <option value=""${!c.subcontract_from ? ' selected' : ''}>직영 (오피스클린프로)</option>
        <option value="에코오피스클린"${c.subcontract_from === '에코오피스클린' ? ' selected' : ''}>에코 도급</option>
        <option value="에코광고비"${c.subcontract_from === '에코광고비' ? ' selected' : ''}>에코 광고비</option>
      </select>
    </div>
    <div class="admin-row-2">
            <div class="field">
                <label>계약금액 (원)</label>
                <input id="fContractAmount" type="text" value="${(c.contract_amount||0).toLocaleString()}" placeholder="0" oninput="fmtInput(this)">
            </div>
            <div class="field">
                <label>청소 시작일</label>
                <input id="fCleanStartDate" type="date" value="${c.clean_start_date || ''}">
            </div>
        </div>
        <div class="field">
      <label>메모</label>
      <textarea id="fMemo" rows="2" placeholder="메모">${escapeHtml(c.memo || '')}</textarea>
    </div>

    ${!isEdit ? `
    <div style="border-top:1px solid var(--border);margin:14px 0;padding-top:12px">
      <div style="font-weight:700;margin-bottom:8px">🗓️ 청소 일정·담당 <span style="font-weight:400;color:var(--text2);font-size:12px">(등록과 동시에 일정·정산·QR 자동 생성)</span></div>
      <div class="admin-row-2">
        <div class="field">
          <label>빈도</label>
          <select id="fRegFreq"><option value="weekly">매주</option><option value="biweekly">격주</option></select>
        </div>
        <div class="field">
          <label>청소 요일 (복수 선택)</label>
          <div id="fRegDays" style="display:flex;gap:6px;flex-wrap:wrap">
            ${['일','월','화','수','목','금','토'].map((d,i)=>`<button type="button" class="btn btn-sm btn-gray" data-wd="${i}" onclick="this.classList.toggle('btn-blue');this.classList.toggle('btn-gray')">${d}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="admin-row-2">
        <div class="field"><label>시작 시간</label><input id="fRegStart" type="time" value="06:00"></div>
        <div class="field"><label>종료 시간</label><input id="fRegEnd" type="time" value="08:00"></div>
      </div>
      <div class="admin-row-2">
        <div class="field">
          <label>담당 직원</label>
          <select id="fRegWorker"><option value="">선택 안함</option>${getActiveWorkers().map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>직원 월 급여 (원)</label><input id="fRegPay" type="text" value="0" oninput="fmtInput(this)"></div>
      </div>
    </div>` : ''}

    <button class="btn" id="saveCompanyBtn" onclick="saveCompany('${companyId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteCompany('${companyId}')">업체 삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');

  // 견적 → 업체등록 프리필
  if (!isEdit && pendingLeadForCompany) {
    const ld = pendingLeadForCompany;
    pendingLeadForCompany = null;
    if (ld.company_name) $('fName').value = ld.company_name;
    if (ld.location) $('fLocation').value = ld.location;
    if (ld.contact_name) $('fContact').value = ld.contact_name;
    if (ld.contact_phone) $('fPhone').value = ld.contact_phone;
    if (ld.contract_amount) $('fContractAmount').value = ld.contract_amount.toLocaleString();
    if (ld.memo) $('fMemo').value = ld.memo;
  }
}

async function saveCompany(companyId) {
  const btn = $('saveCompanyBtn');
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    await _saveCompanyInner(companyId);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = companyId ? '수정 저장' : '등록하기'; }
  }
}

async function _saveCompanyInner(companyId) {
  try {
  const name = $('fName').value.trim();
  if (!name) return toast('업체명을 입력하세요', 'error');

  const status = $('fStatus').value;
  const payload = {
    name,
    location:        $('fLocation').value.trim(),
    area_code:       $('fAreaCode').value.trim(),
    area_name:       $('fAreaName').value.trim(),
    contact_name:    $('fContact').value.trim(),
    contact_phone:   $('fPhone').value.trim(),
    status,
    terminated_at:   status === 'terminated' ? ($('fTerminatedAt').value || null) : null,
    subcontract_from: $('fSubcontract').value || null,
    contract_amount: parseInt(($('fContractAmount').value||'0').replace(/,/g,'')) || 0,
    clean_start_date: $('fCleanStartDate').value || null,
    memo:            $('fMemo').value.trim(),
  };

  let error;
  if (companyId) {
    ({ error } = await sb.from('companies').update(payload).eq('id', companyId));
  } else {
    // 신규 업체: register_company RPC 한 번으로 업체+계약+일정+담당+QR+당월 데이터 생성
    const wd = Array.from(document.querySelectorAll('#fRegDays [data-wd].btn-blue')).map(x => parseInt(x.dataset.wd));
    const { data: reg, error: regErr } = await sb.rpc('register_company', {
      p_name: name,
      p_location: payload.location || null,
      p_area_name: payload.area_name || null,
      p_contact_name: payload.contact_name || null,
      p_contact_phone: payload.contact_phone || null,
      p_start_date: payload.clean_start_date || new Date().toISOString().slice(0, 10),
      p_monthly_amount: payload.contract_amount || 0,
      p_weekdays: wd.length ? wd : null,
      p_start_time: ($('fRegStart') && $('fRegStart').value) || null,
      p_end_time: ($('fRegEnd') && $('fRegEnd').value) || null,
      p_worker_id: ($('fRegWorker') && $('fRegWorker').value) || null,
      p_pay_amount: $('fRegPay') ? (parseInt(($('fRegPay').value || '0').replace(/,/g, '')) || 0) : 0,
      p_frequency: ($('fRegFreq') && $('fRegFreq').value) || 'weekly',
      p_subcontract_from: payload.subcontract_from || null,
      p_memo: payload.memo || null,
    });
    error = regErr;
    // RPC가 다루지 않는 부가 필드 반영 (구역 코드 등)
    if (!error && reg && reg.company_id) {
      const extra = {};
      if (payload.area_code) extra.area_code = payload.area_code;
      if (payload.status && payload.status !== 'active') extra.status = payload.status;
      if (payload.terminated_at) extra.terminated_at = payload.terminated_at;
      if (Object.keys(extra).length) await sb.from('companies').update(extra).eq('id', reg.company_id);
    }
  }

    if (error) return toast(error.message, 'error');

  toast(companyId ? '수정 완료' : '등록 완료');
  closeModal();
  await loadAdminData();
  renderAllClients();

  } catch (e) {
    console.error('_saveCompanyInner error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function deleteCompany(companyId) {
  try {
  if (!confirm('이 업체를 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return;

  // 관련 데이터 먼저 삭제 (FK cascade가 없을 수 있으므로)
  const cascadeTables = [
    ['company_financials', 'company_id'],
    ['company_workers', 'company_id'],
    ['company_schedule', 'company_id'],
    ['company_note_photos', 'company_id'],
    ['company_notes', 'company_id'],
    ['billing_records', 'company_id'],
    ['tasks', 'company_id'],
    ['requests', 'company_id'],
    ['change_logs', 'entity_id'],
  ];
  for (const [table, col] of cascadeTables) {
    const val = col === 'entity_id' ? String(companyId) : companyId;
    const { error: delErr } = await sb.from(table).delete().eq(col, val);
    if (delErr) console.error(`deleteCompany cascade ${table}:`, delErr);
  }

  const { error } = await sb.from('companies').delete().eq('id', companyId);
  if (error) return toast(error.message, 'error');

  toast('삭제 완료');
  closeModal();
  await loadAdminData();
  renderAllClients();

  } catch (e) {
    console.error('deleteCompany error:', e);
    toast('오류가 발생했습니다', 'error');
  }}


// ════════════════════════════════════════════════════
// 업체 상세 (주차/분리수거 + 스케줄 + 배정 + 급여)
// ════════════════════════════════════════════════════

function getCompanyNote(companyId) {
  return (adminData.notes || []).find(n => n.company_id === companyId);
}

async function saveAdminNoteInfo(companyId, noteId) {
  try {
  const parking = document.getElementById('admin_parking_' + companyId)?.value?.trim() || '';
  const recycling = document.getElementById('admin_recycling_' + companyId)?.value?.trim() || '';
  const payload = { parking_info: parking, recycling_location: recycling };

  if (noteId) {
    const { error } = await sb.from('company_notes').update(payload).eq('id', noteId);
    if (error) return toast(error.message, 'error');
  } else {
    payload.company_id = companyId;
    const { error } = await sb.from('company_notes').insert(payload);
    if (error) return toast(error.message, 'error');
  }
  toast('저장 완료');
  await loadAdminData();

  } catch (e) {
    console.error('saveAdminNoteInfo error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function openCompanyDetail(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;
  _comp.openId = companyId;

  const scheds = getCompanySchedules(companyId);
  const assigns = getCompanyAssignments(companyId, selectedMonth);
  const allWorkers = getActiveWorkers();
  const note = getCompanyNote(companyId);

  // 현재 빈도 결정 (활성 스케줄 중 첫 번째 기준, 없으면 weekly)
  const currentFreq = scheds.length > 0 ? (scheds[0].frequency || 'weekly') : 'weekly';
  const currentAnchor = scheds.length > 0 ? (scheds[0].anchor_date || '') : '';

  // 수수료 계산
  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === selectedMonth);
  const contractAmt = c.contract_amount || 0;
  const ocpAmt = fin?.ocp_amount || 0;
  const ecoAmt = fin?.eco_amount || 0;
  const finMap = buildFinMap(adminData.financials, selectedMonth);
  const workerPay = assigns.reduce((s, a) => s + calcAssignmentFinalPay(a, finMap), 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHtml(c.name)}${c.terminated_at ? ' <span style="color:var(--red);font-size:13px">(해지: ' + c.terminated_at + ')</span>' : ''}</h3>
    <div class="detail-location">${escapeHtml(c.location || '')} ${c.area_name ? '· ' + escapeHtml(c.area_name) : ''}
      ${c.subcontract_from ? '<span style="font-size:11px;margin-left:6px;background:var(--orange);color:#fff;padding:2px 6px;border-radius:4px">' + (c.subcontract_from === '에코오피스클린' ? '에코 도급' : '에코 광고비') + '</span>' : ''}
    </div>

    <div id="companySummary_${companyId}" class="company-summary"><div style="color:var(--text3);font-size:12px;padding:10px 0">📊 이번 달 현황 불러오는 중...</div></div>

    <div class="detail-section">
      <button class="btn-sm btn-blue" onclick="openCompanyForm('${companyId}')">기본정보 수정</button>
    </div>

    <!-- 💰 수수료 현황 (수정 가능) -->
    <div class="detail-section">
      <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center"><span>💰 ${selectedMonth.split('-')[1]}월 수수료 현황</span><div>${monthSelectorHTML(selectedMonth, 'changeCompanyDetailMonth')}</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">계약금액</div>
          <div style="font-size:15px;font-weight:700;color:var(--primary);padding:5px 8px;text-align:right">${fmt(contractAmt)}원</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">직원 지급 합계</div>
          <div style="font-size:15px;font-weight:700;color:var(--text1);padding:5px 8px;text-align:right">${fmt(workerPay)}원</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">OCP 수수료</div>
          <input type="text" id="feeOcp_${companyId}" value="${ocpAmt.toLocaleString()}" oninput="fmtInput(this)"
                 style="width:100%;font-size:15px;font-weight:700;color:var(--green);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;text-align:right">
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">에코 수수료</div>
          <input type="text" id="feeEco_${companyId}" value="${ecoAmt.toLocaleString()}" oninput="fmtInput(this)"
                 style="width:100%;font-size:15px;font-weight:700;color:var(--orange);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;text-align:right">
        </div>
      </div>
      ${contractAmt > 0 ? `<p style="font-size:12px;color:var(--text2);margin-top:6px;text-align:right">잔여 배분가능: <strong style="color:${(contractAmt - ocpAmt - ecoAmt - workerPay) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(contractAmt - ocpAmt - ecoAmt - workerPay)}원</strong> <span style="font-size:10px">(계약 - OCP - 에코 - 직원)</span></p>` : ''}
      <button class="btn-sm btn-blue" style="width:100%;margin-top:8px" onclick="saveFeeInfo('${companyId}')">수수료 저장</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🅿️ 주차 / ♻️ 분리수거 정보</div>
      <div class="info-cards-grid">
        <div class="info-mini-card">
          <div class="info-mini-icon">🅿️</div>
          <div class="info-mini-title">주차 정보</div>
          <textarea id="admin_parking_${companyId}" class="info-edit-textarea" placeholder="주차 정보 입력">${escapeHtml(note?.parking_info || '')}</textarea>
        </div>
        <div class="info-mini-card">
          <div class="info-mini-icon">♻️</div>
          <div class="info-mini-title">분리수거장</div>
          <textarea id="admin_recycling_${companyId}" class="info-edit-textarea" placeholder="분리수거장 위치 입력">${escapeHtml(note?.recycling_location || '')}</textarea>
        </div>
      </div>
      <button class="btn-sm btn-blue" style="width:100%;margin-top:8px" onclick="saveAdminNoteInfo('${companyId}', '${note?.id || ''}')">주차/분리수거 정보 저장</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📅 청소 요일 및 빈도 설정</div>

      <!-- 빈도 선택 -->
      <div class="freq-setting" style="margin-bottom:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="font-size:13px;font-weight:600;color:var(--text1);min-width:50px">빈도</label>
          <select id="freqSelect_${companyId}" class="today-filter-select" style="min-width:100px" onchange="onFreqChange('${companyId}', this.value)">
            <option value="weekly"${currentFreq === 'weekly' ? ' selected' : ''}>매주</option>
            <option value="biweekly"${currentFreq === 'biweekly' ? ' selected' : ''}>격주</option>
          </select>
          <div id="anchorWrap_${companyId}" style="display:${currentFreq === 'biweekly' ? 'flex' : 'none'};gap:6px;align-items:center">
            <label style="font-size:12px;color:var(--text2);white-space:nowrap">기준일</label>
            <input type="date" id="anchorDate_${companyId}" class="today-date-input" style="width:140px" value="${currentAnchor}">
          </div>
        </div>
        <p class="text-muted" style="font-size:11px;margin-top:4px" id="freqHint_${companyId}">
          ${currentFreq === 'biweekly' ? '기준일로부터 격주(2주 간격)로 청소 일정이 생성됩니다.' : '선택한 요일마다 매주 청소 일정이 생성됩니다.'}
        </p>
      </div>

      <!-- 요일 그리드 -->
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
                onclick="saveScheduleSettings('${companyId}')">저장</button>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📄 계약 <span style="font-weight:400;font-size:11px;color:var(--text2)">(원본 — 변경 시 이력 보존·자동 반영)</span></div>
      <div id="contractBox_${companyId}"><p class="text-muted">불러오는 중...</p></div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">👤 담당 배정 <span style="font-weight:400;font-size:11px;color:var(--text2)">(원본 — 바꾸면 적용 월부터 매달 자동 반영)</span></div>
      <div id="originAssignBox_${companyId}"><p class="text-muted">불러오는 중...</p></div>
    </div>

    ${c.contact_name || c.contact_phone ? `
    <div class="detail-section">
      <div class="detail-section-title">📞 담당자</div>
      <p class="text-muted">${escapeHtml(c.contact_name || '')} ${escapeHtml(c.contact_phone || '')}</p>
    </div>
    ` : ''}

    ${c.memo ? `
    <div class="detail-section">
      <div class="detail-section-title">📝 메모</div>
      <div class="special-notes-box">${escapeHtml(c.memo).replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <!-- QR 코드 관리 -->
    <div class="detail-section">
      <div class="detail-section-title">📱 업체 QR 페이지</div>
      ${c.qr_token ? `
        <div style="display:flex;gap:16px;align-items:flex-start;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
          <div style="flex-shrink:0;background:#fff;padding:8px;border-radius:8px">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getQrUrl(companyId, c.qr_token))}"
                 alt="QR Code" style="display:block;width:160px;height:160px" />
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text2);margin-bottom:4px">QR 링크:</div>
            <div id="qrUrl_${companyId}" style="font-size:12px;color:var(--accent2);word-break:break-all;margin-bottom:8px">${getQrUrl(companyId, c.qr_token)}</div>
            <div style="font-size:11px;color:var(--text2)">이 QR 코드를 스캔하면 업체 전용 페이지로 이동합니다.<br>QR 이미지를 우클릭하여 저장하거나 인쇄하세요.</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-sm btn-blue" onclick="copyQrUrl('${companyId}', '${c.qr_token}')">📋 링크 복사</button>
          <button class="btn-sm" style="background:var(--bg3);color:var(--text2);border:1px solid var(--border)"
                  onclick="regenerateQrToken('${companyId}')">🔄 토큰 재생성</button>
          <button class="btn-sm" style="background:var(--bg3);color:var(--text2);border:1px solid var(--border)"
                  onclick="downloadQrCode('${companyId}', '${c.qr_token}')">📥 QR 이미지 저장</button>
        </div>
      ` : `
        <p class="text-muted" style="margin-bottom:8px">QR 토큰이 아직 생성되지 않았습니다.</p>
        <button class="btn-sm btn-green" onclick="generateQrToken('${companyId}')">QR 토큰 생성</button>
      `}
    </div>
  `;

  $('modalBody').innerHTML = html + `<div style="position:sticky;bottom:-26px;margin:16px -28px -26px;padding:12px 28px;background:var(--card);border-top:1px solid var(--border);display:flex;justify-content:flex-end;z-index:5"><button class="btn saveall-btn" style="width:auto;padding:10px 26px" onclick="saveAllCompanyDetail('${companyId}')">💾 모두 저장</button></div>`;
  $('detailModal').classList.add('show');
  loadCompanySummary(companyId);
  loadOriginSections(companyId);
}


// ════════════════════════════════════════════════════
// 빈도 변경 UI 핸들러
// ════════════════════════════════════════════════════

function onFreqChange(companyId, freq) {
  const anchorWrap = $(`anchorWrap_${companyId}`);
  const hint = $(`freqHint_${companyId}`);

  if (freq === 'biweekly') {
    if (anchorWrap) anchorWrap.style.display = 'flex';
    if (hint) hint.textContent = '기준일로부터 격주(2주 간격)로 청소 일정이 생성됩니다.';
  } else {
    if (anchorWrap) anchorWrap.style.display = 'none';
    if (hint) hint.textContent = '선택한 요일마다 매주 청소 일정이 생성됩니다.';
  }
}


// ════════════════════════════════════════════════════
// 청소 요일 설정 (빈도 + 시간 통합 저장)
// ════════════════════════════════════════════════════

async function toggleWeekday(companyId, weekday, btn) {
  try {
  const isActive = btn.classList.contains('active');
  const companyName = getCompanyName(companyId);
  const dayName = WEEKDAY_NAMES[weekday];

  if (isActive) {
    const existing = adminData.schedules.find(
      s => s.company_id === companyId && s.weekday === weekday
    );
    if (existing) {
      const { error } = await sb.from('company_schedule')
        .update({ is_active: false })
        .eq('id', existing.id);
      if (error) return toast(error.message, 'error');

      // 변경 이력 로그
      await logChange('company_schedule', existing.id, 'update',
        [{ field: 'is_active', oldVal: 'true', newVal: 'false' }],
        `${companyName} - ${dayName}요일 비활성화`
      );

      existing.is_active = false;
    }
    btn.classList.remove('active');
  } else {
    // 현재 선택된 빈도 가져오기
    const freqSelect = $(`freqSelect_${companyId}`);
    const freq = freqSelect ? freqSelect.value : 'weekly';
    const anchorInput = $(`anchorDate_${companyId}`);
    const anchorDate = (freq === 'biweekly' && anchorInput) ? (anchorInput.value || null) : null;

    const existing = adminData.schedules.find(
      s => s.company_id === companyId && s.weekday === weekday
    );
    if (existing) {
      const { error } = await sb.from('company_schedule')
        .update({ is_active: true, frequency: freq, anchor_date: anchorDate })
        .eq('id', existing.id);
      if (error) return toast(error.message, 'error');

      // 변경 이력 로그
      await logChange('company_schedule', existing.id, 'update',
        [{ field: 'is_active', oldVal: 'false', newVal: 'true' }],
        `${companyName} - ${dayName}요일 활성화 (${getFreqLabel(freq)})`
      );

      existing.is_active = true;
      existing.frequency = freq;
      existing.anchor_date = anchorDate;
    } else {
      const { data, error } = await sb.from('company_schedule')
        .insert({ company_id: companyId, weekday, is_active: true, frequency: freq, anchor_date: anchorDate })
        .select().single();
      if (error) return toast(error.message, 'error');

      // 변경 이력 로그
      await logChange('company_schedule', data.id, 'insert',
        [{ field: 'weekday', oldVal: null, newVal: `${dayName}요일 (${getFreqLabel(freq)})` }],
        `${companyName} - ${dayName}요일 스케줄 추가`
      );

      adminData.schedules.push(data);
    }
    btn.classList.add('active');
  }

  toast('요일 변경됨');

  } catch (e) {
    console.error('toggleWeekday error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

/**
 * 시간 + 빈도 + anchor_date를 모든 활성 스케줄에 일괄 저장
 */
async function saveScheduleSettings(companyId) {
  try {
  const startTime = $(`schedStart_${companyId}`).value || null;
  const endTime = $(`schedEnd_${companyId}`).value || null;
  const freqSelect = $(`freqSelect_${companyId}`);
  const freq = freqSelect ? freqSelect.value : 'weekly';
  const anchorInput = $(`anchorDate_${companyId}`);
  const anchorDate = (freq === 'biweekly' && anchorInput) ? (anchorInput.value || null) : null;

  const activeScheds = adminData.schedules.filter(
    s => s.company_id === companyId && s.is_active
  );

  if (activeScheds.length === 0) return toast('먼저 요일을 선택하세요', 'error');

  const companyName = getCompanyName(companyId);

  for (const s of activeScheds) {
    // 변경 이력용 이전값
    const changes = [];
    if (s.start_time !== startTime) changes.push({ field: 'start_time', oldVal: s.start_time || '없음', newVal: startTime || '없음' });
    if (s.end_time !== endTime) changes.push({ field: 'end_time', oldVal: s.end_time || '없음', newVal: endTime || '없음' });
    if ((s.frequency || 'weekly') !== freq) changes.push({ field: 'frequency', oldVal: getFreqLabel(s.frequency || 'weekly'), newVal: getFreqLabel(freq) });
    if (s.anchor_date !== anchorDate) changes.push({ field: 'anchor_date', oldVal: s.anchor_date || '없음', newVal: anchorDate || '없음' });

    const { error } = await sb.from('company_schedule')
      .update({
        start_time: startTime,
        end_time: endTime,
        frequency: freq,
        anchor_date: anchorDate,
      })
      .eq('id', s.id);
    if (error) { toast(error.message, 'error'); return; }

    // 변경 이력 로그
    if (changes.length > 0) {
      const dayName = WEEKDAY_NAMES[s.weekday];
      await logChange('company_schedule', s.id, 'update', changes,
        `${companyName} - ${dayName}요일 스케줄 설정 변경`
      );
    }

    s.start_time = startTime;
    s.end_time = endTime;
    s.frequency = freq;
    s.anchor_date = anchorDate;
  }

  toast('스케줄 설정 저장됨');

  } catch (e) {
    console.error('saveScheduleSettings error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

// 기존 saveScheduleTimes는 saveScheduleSettings로 대체
async function saveScheduleTimes(companyId) {
  return saveScheduleSettings(companyId);
}


// ════════════════════════════════════════════════════
// 직원 배정
// ════════════════════════════════════════════════════

async function addAssignment(companyId) {
  try {
  const workerId = $(`newWorker_${companyId}`).value;
  const payAmount = parseInt(($(`newPay_${companyId}`).value||'0').replace(/,/g,''), 10) || 0;
  const shareEl = $(`newShare_${companyId}`);
  const share = shareEl ? (parseInt(shareEl.value, 10) || 0) : 0;

  if (!workerId) return toast('직원을 선택하세요', 'error');
  if (payAmount < 0) return toast('지급액은 0 이상이어야 합니다', 'error');
  if (payAmount > 99999999) return toast('지급액이 너무 큽니다', 'error');
  if (share < 0 || share > 100) return toast('share 비율은 0~100 사이여야 합니다', 'error');

  // 계약금액 초과 검증
  const cost = getCompanyTotalCost(companyId, selectedMonth);
  if (cost.contract > 0 && (cost.total + payAmount) > cost.contract) {
    return toast(`배정 시 합계(${fmt(cost.total + payAmount)}원)가 계약금액(${fmt(cost.contract)}원)을 초과합니다`, 'error');
  }

  const insertData = {
    company_id: companyId,
    worker_id:  workerId,
    month:      selectedMonth,
    pay_amount: payAmount,
  };
  if (share > 0) insertData.share = share;

  const { data, error } = await sb.from('company_workers').insert(insertData).select().single();

  if (error) {
    if (error.code === '23505') return toast('이미 배정된 직원입니다', 'error');
    return toast(error.message, 'error');
  }

  adminData.assignments.push(data);
  toast('배정 완료');
  await openCompanyDetail(companyId);

  } catch (e) {
    console.error('addAssignment error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function removeAssignment(assignId, companyId) {
  try {
  if (!confirm('이 배정을 삭제하시겠습니까?')) return;

  // 변경 이력용 이전 데이터
  const local = adminData.assignments.find(a => a.id === assignId);
  const workerName = local ? getWorkerName(local.worker_id) : '';
  const companyName = getCompanyName(companyId);

  const { error } = await sb.from('company_workers').delete().eq('id', assignId);
  if (error) return toast(error.message, 'error');

  // 변경 이력 로그
  await logChange('company_workers', assignId, 'delete',
    [{ field: 'worker_id', oldVal: workerName, newVal: null }],
    `${companyName} (${selectedMonth}) - ${workerName} 배정 삭제`
  );

  adminData.assignments = adminData.assignments.filter(a => a.id !== assignId);
  toast('배정 삭제됨');
  await openCompanyDetail(companyId);

  } catch (e) {
    console.error('removeAssignment error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function updatePayAmount(assignId, value) {
  try {
  const payAmount = parseInt((value||'0').replace(/,/g,''), 10) || 0;
  if (payAmount < 0) return toast('지급액은 0 이상이어야 합니다', 'error');
  if (payAmount > 99999999) return toast('지급액이 너무 큽니다', 'error');

  // 변경 이력용 이전값
  const local = adminData.assignments.find(a => a.id === assignId);
  const oldPay = local ? (local.pay_amount || 0) : 0;

  // 계약금액 초과 검증
  if (local) {
    const cost = getCompanyTotalCost(local.company_id, selectedMonth);
    const newTotal = cost.total - oldPay + payAmount;
    if (cost.contract > 0 && newTotal > cost.contract) {
      return toast(`합계(${fmt(newTotal)}원)가 계약금액(${fmt(cost.contract)}원)을 초과합니다`, 'error');
    }
  }

  const { error } = await sb.from('company_workers')
    .update({ pay_amount: payAmount })
    .eq('id', assignId);

  if (error) return toast(error.message, 'error');

  // 변경 이력 로그
  if (oldPay !== payAmount && local) {
    const companyName = getCompanyName(local.company_id);
    const workerName = getWorkerName(local.worker_id);
    await logChange('company_workers', assignId, 'update',
      [{ field: 'pay_amount', oldVal: oldPay, newVal: payAmount }],
      `${workerName} - ${companyName} (${selectedMonth}) 지급액 수정`
    );
  }

  if (local) local.pay_amount = payAmount;

  toast('지급액 수정됨');

  } catch (e) {
    console.error('updatePayAmount error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function updateShare(assignId, value) {
  try {
  const share = parseInt(value, 10) || 0;
  if (share < 0 || share > 100) return toast('share 비율은 0~100 사이여야 합니다', 'error');

  const local = adminData.assignments.find(a => a.id === assignId);
  const oldShare = local ? (local.share || 0) : 0;

  const { error } = await sb.from('company_workers')
    .update({ share: share || null })
    .eq('id', assignId);

  if (error) return toast(error.message, 'error');

  if (oldShare !== share && local) {
    const companyName = getCompanyName(local.company_id);
    const workerName = getWorkerName(local.worker_id);
    await logChange('company_workers', assignId, 'update',
      [{ field: 'share', oldVal: oldShare, newVal: share }],
      `${workerName} - ${companyName} (${selectedMonth}) share 비율 수정`
    );
  }

  if (local) local.share = share || null;
  toast('share 비율 수정됨');

  } catch (e) {
    console.error('updateShare error:', e);
    toast('오류가 발생했습니다', 'error');
  }}



// ════════════════════════════════════════════════════
// QR 토큰 관리
// ════════════════════════════════════════════════════

function getQrUrl(companyId, token) {
    return `https://officecleanpro.com/site-company.html?company=${companyId}&token=${token}`;
}

async function generateQrToken(companyId) {
  try {
  const token = crypto.randomUUID();
  const { error } = await sb.from('companies')
    .update({ qr_token: token })
    .eq('id', companyId);

  if (error) return toast(error.message, 'error');

  const local = adminData.companies.find(c => c.id === companyId);
  if (local) local.qr_token = token;

  toast('QR 토큰 생성 완료');
  await openCompanyDetail(companyId);

  } catch (e) {
    console.error('generateQrToken error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

async function regenerateQrToken(companyId) {
  try {
  if (!confirm('QR 토큰을 재생성하면 기존 QR 코드가 무효화됩니다. 계속하시겠습니까?')) return;
  await generateQrToken(companyId);

  } catch (e) {
    console.error('regenerateQrToken error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

function copyQrUrl(companyId, token) {
  const url = getQrUrl(companyId, token);
  navigator.clipboard.writeText(url).then(() => {
    toast('QR 링크가 복사되었습니다');
  }).catch(() => {
    // 클립보드 API 실패 시 fallback
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    toast('QR 링크가 복사되었습니다');
  });
}

function downloadQrCode(companyId, token) {
  const url = getQrUrl(companyId, token);
  const company = adminData.companies.find(c => c.id === companyId);
  const companyName = company ? company.name : '업체';
  const fileName = company ? company.name.replace(/[^가-힣a-zA-Z0-9]/g, '_') : 'company';

  // QR 이미지 로드 후 스티커 Canvas 생성
  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  qrImg.onload = function() {
    const W = 500, H = 620;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 배경 (흰색 라운드 사각형)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 16);
    ctx.fill();

    // 상단 파란 헤더 바
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, 80, [16, 16, 0, 0]);
    ctx.fill();

    // 헤더 텍스트: 오피스클린프로
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('오피스클린프로', W / 2, 52);

    // QR 코드 이미지 (중앙 배치)
    const qrSize = 320;
    const qrX = (W - qrSize) / 2;
    const qrY = 105;
    // QR 코드 배경 (약간의 패딩)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // 업체명
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    // 긴 이름 줄바꿈 처리
    const maxWidth = W - 60;
    if (ctx.measureText(companyName).width > maxWidth) {
      ctx.font = 'bold 22px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    }
    ctx.fillText(companyName, W / 2, qrY + qrSize + 40, maxWidth);

    // 하단 안내 문구
    ctx.fillStyle = '#64748b';
    ctx.font = '16px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillText('QR코드를 스캔하여 요청사항을 남겨주세요', W / 2, qrY + qrSize + 70);

    // 테두리
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, W - 2, H - 2, 16);
    ctx.stroke();

    // 다운로드
    const link = document.createElement('a');
    link.download = `QR스티커_${fileName}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('QR 스티커 이미지 다운로드 완료');
  };
  qrImg.onerror = function() {
    toast('QR 이미지 로드 실패. 다시 시도해주세요.', 'error');
  };
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`;
}

// ─── 업체 상세 월 전환 ───
async function changeCompanyDetailMonth(month) {
  try {
  selectedMonth = month;
  await ensureMonthData(month);
  if (_comp.openId) openCompanyDetail(_comp.openId);

  } catch (e) {
    console.error('changeCompanyDetailMonth error:', e);
    toast('오류가 발생했습니다', 'error');
  }}

// ─── 수수료 저장 ───
// ─── 계약금액 초과 검증 헬퍼 ───
function getCompanyTotalCost(companyId, month) {
    const company = adminData.companies.find(c => c.id === companyId);
  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === month);
  const assigns = adminData.assignments.filter(a => a.company_id === companyId && a.month === month);
  const contract = company?.contract_amount || 0;
  const ocp = fin?.ocp_amount || 0;
  const eco = fin?.eco_amount || 0;
  const workerPay = assigns.reduce((s, a) => s + (a.pay_amount || 0), 0);
  return { contract, ocp, eco, workerPay, total: ocp + eco + workerPay };
}

async function saveFeeInfo(companyId) {
  try {
  const contractAmt = getCompanyContractAmount(companyId);
  const ocpAmt = parseInt(($(`feeOcp_${companyId}`)?.value||'0').replace(/,/g,''), 10) || 0;
  const ecoAmt = parseInt(($(`feeEco_${companyId}`)?.value||'0').replace(/,/g,''), 10) || 0;

  if (contractAmt < 0 || ocpAmt < 0 || ecoAmt < 0) return toast('금액은 0 이상이어야 합니다', 'error');

  // 직원 지급 합계
  const assigns = adminData.assignments.filter(a => a.company_id === companyId && a.month === selectedMonth);
  const _sfFinMap = buildFinMap(adminData.financials, selectedMonth);
  const workerPay = assigns.reduce((s, a) => s + calcAssignmentFinalPay(a, _sfFinMap), 0);
  const totalCost = ocpAmt + ecoAmt + workerPay;

  if (contractAmt > 0 && totalCost > contractAmt) {
    return toast(`수수료+직원지급(${fmt(totalCost)}원)이 계약금액(${fmt(contractAmt)}원)을 초과합니다`, 'error');
  }

  const payload = {
    contract_amount: contractAmt,
    ocp_amount: ocpAmt,
    eco_amount: ecoAmt,
    worker_pay_total: workerPay,
  };

  const existing = adminData.financials.find(
    f => f.company_id === companyId && f.month === selectedMonth
  );

  let error;
  if (existing) {
    ({ error } = await sb.from('company_financials').update(payload).eq('id', existing.id));
  } else {
    payload.company_id = companyId;
    payload.month = selectedMonth;
    ({ error } = await sb.from('company_financials').insert(payload));
  }

  if (error) return toast('저장 실패: ' + error.message, 'error');

  toast('수수료 저장 완료');
  await loadAdminData();
  openCompanyDetail(companyId);

  } catch (e) {
    console.error('saveFeeInfo error:', e);
    toast('오류가 발생했습니다', 'error');
  }}


// ════════════════════════════════════════════════════
// P3: 원본(계약·배정) 관리 — contracts / worker_assignments 연동
// ════════════════════════════════════════════════════

async function loadOriginSections(companyId) {
  try {
    const [kRes, aRes] = await Promise.all([
      sb.from('contracts').select('*').eq('company_id', companyId).order('start_date', { ascending: false }),
      sb.from('worker_assignments').select('*').eq('company_id', companyId).order('effective_from', { ascending: false }),
    ]);
    renderContractBox(companyId, kRes.data || []);
    renderOriginAssignBox(companyId, aRes.data || []);
  } catch (e) { console.error('loadOriginSections error:', e); }
}

function fmtWon(n) { return (n || 0).toLocaleString('ko-KR'); }

function originMonthOptions() {
  const now = new Date();
  let html = '';
  for (let i = 0; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    html += `<option value="${v}"${i === 1 ? ' selected' : ''}>${d.getMonth() + 1}월부터</option>`;
  }
  return html;
}

function renderContractBox(companyId, contracts) {
  const el = document.getElementById('contractBox_' + companyId);
  if (!el) return;
  const cur = contracts.find(x => x.status === 'active') || contracts[0];
  const hist = contracts.filter(x => cur && x.id !== cur.id);
  el.innerHTML = `
    ${cur ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:800;font-size:16px">${fmtWon(cur.monthly_amount)}원/월</span>
      <span class="badge badge-area">${cur.start_date} ~ ${cur.end_date || '진행중'}</span>
    </div>` : '<p class="text-muted">계약 정보가 없습니다.</p>'}
    <div style="display:flex;gap:6px;margin-top:10px;align-items:center;flex-wrap:wrap">
      <input type="text" id="ctrNewAmt_${companyId}" class="assign-pay-input" placeholder="새 월 계약금액" style="width:130px" oninput="fmtInput(this)">
      <select id="ctrFromMonth_${companyId}" class="admin-worker-select" style="width:auto">${originMonthOptions()}</select>
      <button class="btn-sm btn-blue" onclick="applyContractChange('${companyId}')">금액 변경</button>
    </div>
    ${hist.length ? `<div style="margin-top:8px;font-size:12px;color:var(--text2)">이력: ${hist.map(h => `${h.start_date}~${h.end_date || ''} · ${fmtWon(h.monthly_amount)}원`).join(' / ')}</div>` : ''}
  `;
}

async function applyContractChange(companyId) {
  const amtEl = document.getElementById('ctrNewAmt_' + companyId);
  const amt = parseMoney(amtEl ? amtEl.value : '');
  const fromM = document.getElementById('ctrFromMonth_' + companyId).value;
  if (!amt) return toast('새 계약금액을 입력하세요', 'error');
  if (!confirm(fromM + '부터 월 ' + fmtWon(amt) + '원으로 변경할까요?\n(이전 계약은 이력으로 남고, 적용 월부터 재무·청구가 자동 재계산됩니다)')) return;
  const { error } = await sb.rpc('change_contract', { p_company_id: companyId, p_new_amount: amt, p_from_month: fromM });
  if (error) return toast('변경 실패: ' + error.message, 'error');
  toast('계약 변경 완료 — ' + fromM + '부터 자동 반영');
  await loadAdminData();
  openCompanyDetail(companyId);
}

function renderOriginAssignBox(companyId, assigns) {
  const el = document.getElementById('originAssignBox_' + companyId);
  if (!el) return;
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const cur = assigns.filter(a => !a.effective_to || a.effective_to >= todayStr);
  const allWorkers = getActiveWorkers();
  el.innerHTML = `
    ${cur.length ? cur.map(a => `
      <div class="assign-row">
        <div class="assign-info">
          <span class="assign-name">${escapeHtml(getWorkerName(a.worker_id))}</span>
          ${a.is_primary ? '<span class="badge badge-area">주담당</span>' : ''}
          ${a.effective_from > todayStr ? '<span class="badge badge-warn">' + a.effective_from + ' 시작 예정</span>' : '<span style="font-size:11px;color:var(--text2)">' + a.effective_from + '~</span>'}
        </div>
        <div class="assign-actions">
          <span style="font-weight:700">${fmtWon(a.pay_amount)}원</span>
          <button class="btn-sm btn-red" onclick="endOriginAssignment('${companyId}','${a.id}','${a.worker_id}')">다음달부터 종료</button>
        </div>
      </div>`).join('') : '<p class="text-muted">유효한 배정이 없습니다.</p>'}
    <div class="admin-add-assign" style="margin-top:12px;flex-wrap:wrap">
      <select id="oaWorker_${companyId}" class="admin-worker-select">
        <option value="">직원 선택</option>
        ${allWorkers.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')}
      </select>
      <input type="text" id="oaPay_${companyId}" class="assign-pay-input" placeholder="월 급여" value="0" oninput="fmtInput(this)">
      <select id="oaFrom_${companyId}" class="admin-worker-select" style="width:auto">${originMonthOptions()}</select>
      <button class="btn-sm btn-green" onclick="applyAssignChange('${companyId}')">배정/변경</button>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:6px">같은 직원 선택 = 급여 변경, 새 직원 = 추가 배정. 적용 월부터 매달 자동 반영됩니다.</div>
  `;
}

async function applyAssignChange(companyId) {
  const wid = document.getElementById('oaWorker_' + companyId).value;
  const pay = parseMoney(document.getElementById('oaPay_' + companyId).value);
  const fromM = document.getElementById('oaFrom_' + companyId).value;
  if (!wid) return toast('직원을 선택하세요', 'error');
  if (!pay) return toast('월 급여를 입력하세요', 'error');
  if (!confirm(getWorkerName(wid) + ' — ' + fromM + '부터 월 ' + fmtWon(pay) + '원으로 적용할까요?')) return;
  const { data: curA } = await sb.from('worker_assignments').select('id').eq('company_id', companyId).is('effective_to', null);
  const isPrimary = !curA || curA.length === 0;
  const { error } = await sb.rpc('change_assignment', { p_company_id: companyId, p_worker_id: wid, p_pay_amount: pay, p_from_month: fromM, p_is_primary: isPrimary });
  if (error) return toast('적용 실패: ' + error.message, 'error');
  toast('배정 적용 완료 — ' + fromM + '부터 자동 반영');
  await loadAdminData();
  openCompanyDetail(companyId);
}

async function endOriginAssignment(companyId, assignId, workerId) {
  if (!confirm('이 배정을 이번 달까지만 유지하고 다음 달부터 종료할까요?')) return;
  const now = new Date();
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const eomStr = eom.getFullYear() + '-' + String(eom.getMonth() + 1).padStart(2, '0') + '-' + String(eom.getDate()).padStart(2, '0');
  const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = nm.getFullYear() + '-' + String(nm.getMonth() + 1).padStart(2, '0');
  const { error } = await sb.from('worker_assignments').update({ effective_to: eomStr }).eq('id', assignId);
  if (error) return toast('종료 실패: ' + error.message, 'error');
  await sb.from('company_workers').delete().eq('company_id', companyId).eq('worker_id', workerId).gte('month', nextMonth);
  await sb.rpc('materialize_month', { p_month: nextMonth });
  toast('배정 종료 — 다음 달부터 제외됩니다');
  await loadAdminData();
  openCompanyDetail(companyId);
}


// ════════════════════════════════════════════════════
// P4: 통합 저장 — 입력을 먼저 다 읽는 순서(스케줄→노트→수수료)로 기존 함수 재사용
// ════════════════════════════════════════════════════
async function saveAllCompanyDetail(companyId) {
  try {
    document.querySelectorAll('.saveall-btn').forEach(b => { b.disabled = true; b.textContent = '저장 중...'; });
    const hasSched = adminData.schedules.some(s => s.company_id === companyId && s.is_active);
    if (hasSched) await saveScheduleSettings(companyId);
    const note = getCompanyNote(companyId);
    await saveAdminNoteInfo(companyId, note && note.id ? note.id : '');
    await saveFeeInfo(companyId);
    toast('모두 저장 완료');
  } catch (e) {
    console.error('saveAllCompanyDetail error:', e);
    toast('저장 중 오류가 발생했습니다', 'error');
    document.querySelectorAll('.saveall-btn').forEach(b => { b.disabled = false; b.textContent = '💾 모두 저장'; });
  }
}


// ════════════════════════════════════════════════════
// 업체 360° 뷰 — 이번 달 청소·수금·민원 한눈에 요약
// ════════════════════════════════════════════════════
async function loadCompanySummary(companyId) {
  try {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth();
    const mStr = y + '-' + String(m + 1).padStart(2, '0');
    const start = mStr + '-01';
    const end = new Date(y, m + 1, 0);
    const endStr = end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
    const [tRes, bRes, rRes] = await Promise.all([
      sb.from('tasks').select('status').eq('company_id', companyId).gte('task_date', start).lte('task_date', endStr),
      sb.from('billing_records').select('status, billed_amount, paid_amount').eq('company_id', companyId).eq('month', mStr).maybeSingle(),
      sb.from('requests').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_resolved', false),
    ]);
    const tasks = tRes.data || [];
    const done = tasks.filter(function(t){return t.status==='completed';}).length;
    const planned = tasks.filter(function(t){return t.status!=='cancelled';}).length;
    const bill = bRes.data;
    const billLabel = !bill ? { txt: '미생성', cls: 'gray' } : (bill.status === 'paid' ? { txt: '수금 완료', cls: 'good' } : (bill.status === 'billed' ? { txt: '청구됨', cls: 'warn' } : (bill.status === 'overdue' ? { txt: '연체', cls: 'bad' } : { txt: '미청구', cls: 'gray' })));
    const openReq = rRes.count || 0;
    renderCompanySummary(companyId, { mStr: mStr, done: done, planned: planned, billLabel: billLabel, openReq: openReq, billed: bill ? bill.billed_amount : 0 });
  } catch (e) { console.error('loadCompanySummary error:', e); }
}

function renderCompanySummary(companyId, s) {
  const el = document.getElementById('companySummary_' + companyId);
  if (!el) return;
  const cleanPct = s.planned > 0 ? Math.round(s.done / s.planned * 100) : 0;
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 14px">'
    + tile('🧹 이번 달 청소', s.done + ' / ' + s.planned + '회', cleanPct >= 100 ? 'good' : (cleanPct > 0 ? 'warn' : 'gray'), cleanPct + '% 완료')
    + tile('💰 수금', s.billLabel.txt, s.billLabel.cls, s.billed ? fmtWon(s.billed) + '원' : '')
    + tile('📩 미처리 민원', s.openReq + '건', s.openReq > 0 ? 'bad' : 'good', s.openReq > 0 ? '확인 필요' : '없음')
    + tile('📅 기준월', s.mStr.split('-')[1] + '월', 'gray', '')
    + '</div>';
}

function tile(label, value, cls, sub) {
  const colorMap = { good: 'var(--green)', warn: 'var(--yellow)', bad: 'var(--red)', gray: 'var(--text2)' };
  return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px">'
    + '<div style="font-size:11px;color:var(--text2);font-weight:600">' + label + '</div>'
    + '<div style="font-size:17px;font-weight:800;color:' + (colorMap[cls] || 'var(--text)') + ';margin-top:2px">' + value + '</div>'
    + (sub ? '<div style="font-size:11px;color:var(--text3);margin-top:1px">' + sub + '</div>' : '')
    + '</div>';
}

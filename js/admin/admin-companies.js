/**
 * admin-companies.js - 업체관리 탭
 * 업체 목록, 등록/수정/삭제, 상세 모달, 스케줄(빈도 포함), 배정, 주차/분리수거
 */

let _openCompanyId = null; // 현재 열린 업체 상세 ID

// ─── 빈도 라벨 매핑 ───
const FREQ_LABELS = {
  weekly:   '매주',
  biweekly: '격주',
};

function getFreqLabel(freq) {
  return FREQ_LABELS[freq] || '매주';
}

// 에코 분류 필터 변수
let clientEcoFilter = '';

// ─── 업체 계약금액 조회 ───
function getCompanyContractAmount(companyId) {
  const fin = (adminData.financials || []).find(f => f.company_id === companyId && f.month === selectedMonth);
  return fin ? (fin.contract_amount || 0) : 0;
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
  // 에코 분류 필터
  if (clientEcoFilter === 'direct') {
    filtered = filtered.filter(c => !c.subcontract_from);
  } else if (clientEcoFilter === 'eco_sub') {
    filtered = filtered.filter(c => c.subcontract_from === '에코오피스클린');
  } else if (clientEcoFilter === 'eco_ad') {
    filtered = filtered.filter(c => c.subcontract_from === '에코광고비');
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
  const directCount = allCompanies.filter(c => !c.subcontract_from).length;
  const ecoSubCount = allCompanies.filter(c => c.subcontract_from === '에코오피스클린').length;
  const ecoAdCount = allCompanies.filter(c => c.subcontract_from === '에코광고비').length;

  // 목록 HTML 생성
  const listHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <p class="text-muted" style="margin:0">총 ${filtered.length}개 업체</p>
    </div>
    ${filtered.map(c => {
      const scheds = getCompanySchedules(c.id);
      // 빈도 표시: 요일 + 빈도
      const daysWithFreq = scheds.map(s => {
        const freq = s.frequency || 'weekly';
        const label = WEEKDAY_NAMES[s.weekday];
        return freq === 'biweekly' ? label + '(격주)' : label;
      }).join(', ') || '-';
      const assigns = getCompanyAssignments(c.id, selectedMonth);
      const workers = assigns.map(a => getWorkerName(a.worker_id)).join(', ') || '미배정';

      const contractAmt = getCompanyContractAmount(c.id);

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
              <div class="card-title">${c.name} ${c.area_code ? '<span style="font-size:11px;color:var(--primary);font-weight:500;margin-left:6px">[' + c.area_code + ']</span>' : ''}${ecoBadge}</div>
              <div class="card-subtitle">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              ${statusBadge}
              <div style="font-size:16px;font-weight:700;color:var(--primary);white-space:nowrap">${contractAmt > 0 ? fmt(contractAmt) + '원' : ''}</div>
            </div>
          </div>
          <div class="company-card-info">
            <span class="info-chip">📅 ${daysWithFreq}</span>
            <span class="info-chip">👤 ${workers}</span>
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
      <button class="btn-sm ${clientEcoFilter === '' ? 'btn-blue' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${clientEcoFilter === '' ? '' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="clientEcoFilter='';renderAllClients()">전체 (${allCompanies.length})</button>
      <button class="btn-sm ${clientEcoFilter === 'direct' ? 'btn-green' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${clientEcoFilter === 'direct' ? '' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="clientEcoFilter='direct';renderAllClients()">직영 (${directCount})</button>
      <button class="btn-sm ${clientEcoFilter === 'eco_sub' ? '' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${clientEcoFilter === 'eco_sub' ? 'background:var(--orange);color:#fff' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="clientEcoFilter='eco_sub';renderAllClients()">에코 도급 (${ecoSubCount})</button>
      <button class="btn-sm ${clientEcoFilter === 'eco_ad' ? '' : ''}" style="font-size:12px;padding:6px 14px;border-radius:20px;${clientEcoFilter === 'eco_ad' ? 'background:#8b5cf6;color:#fff' : 'background:var(--bg2);color:var(--text1);border:1px solid var(--border)'}" onclick="clientEcoFilter='eco_ad';renderAllClients()">에코 광고비 (${ecoAdCount})</button>
    </div>

    <div class="admin-filter-bar">
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input id="clientSearchInput" placeholder="업체명, 주소, 구역 검색" value="${clientSearch}">
      </div>
      <select class="admin-area-select" onchange="clientAreaFilter=this.value;renderAllClients()">
        <option value="">전체 구역</option>
        ${areas.map(a => `<option value="${a}"${a === clientAreaFilter ? ' selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>

    <div id="clientListContainer">${listHTML}</div>
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('clientSearchInput', (val) => {
    clientSearch = val;
    renderAllClients(true);
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
    <div class="field">
      <label>메모</label>
      <textarea id="fMemo" rows="2" placeholder="메모">${c.memo || ''}</textarea>
    </div>

    <button class="btn" id="saveCompanyBtn" onclick="saveCompany('${companyId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteCompany('${companyId}')">업체 삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
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
    memo:            $('fMemo').value.trim(),
  };

  let error;
  if (companyId) {
    ({ error } = await sb.from('companies').update(payload).eq('id', companyId));
  } else {
    // 신규 업체: QR 토큰 자동 생성
    payload.qr_token = crypto.randomUUID();
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
// 업체 상세 (주차/분리수거 + 스케줄 + 배정 + 급여)
// ════════════════════════════════════════════════════

function getCompanyNote(companyId) {
  return (adminData.notes || []).find(n => n.company_id === companyId);
}

async function saveAdminNoteInfo(companyId, noteId) {
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
}

async function openCompanyDetail(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;
  _openCompanyId = companyId;

  const scheds = getCompanySchedules(companyId);
  const assigns = getCompanyAssignments(companyId, selectedMonth);
  const allWorkers = getActiveWorkers();
  const note = getCompanyNote(companyId);

  // 현재 빈도 결정 (활성 스케줄 중 첫 번째 기준, 없으면 weekly)
  const currentFreq = scheds.length > 0 ? (scheds[0].frequency || 'weekly') : 'weekly';
  const currentAnchor = scheds.length > 0 ? (scheds[0].anchor_date || '') : '';

  // 수수료 계산
  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === selectedMonth);
  const contractAmt = fin?.contract_amount || 0;
  const ocpAmt = fin?.ocp_amount || 0;
  const ecoAmt = fin?.eco_amount || 0;
  const workerPay = assigns.reduce((s, a) => s + (a.pay_amount || 0), 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${c.name}${c.terminated_at ? ' <span style="color:var(--red);font-size:13px">(해지: ' + c.terminated_at + ')</span>' : ''}</h3>
    <div class="detail-location">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}
      ${c.subcontract_from ? '<span style="font-size:11px;margin-left:6px;background:var(--orange);color:#fff;padding:2px 6px;border-radius:4px">' + (c.subcontract_from === '에코오피스클린' ? '에코 도급' : '에코 광고비') + '</span>' : ''}
    </div>

    <div class="detail-section">
      <button class="btn-sm btn-blue" onclick="openCompanyForm('${companyId}')">기본정보 수정</button>
    </div>

    <!-- 💰 수수료 현황 (수정 가능) -->
    <div class="detail-section">
      <div class="detail-section-title">💰 ${selectedMonth.split('-')[1]}월 수수료 현황</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">계약금액</div>
          <input type="number" id="feeContract_${companyId}" value="${contractAmt}"
                 style="width:100%;font-size:15px;font-weight:700;color:var(--primary);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;text-align:right">
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">직원 지급 합계</div>
          <div style="font-size:15px;font-weight:700;color:var(--text1);padding:5px 8px;text-align:right">${fmt(workerPay)}원</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">OCP 수수료</div>
          <input type="number" id="feeOcp_${companyId}" value="${ocpAmt}"
                 style="width:100%;font-size:15px;font-weight:700;color:var(--green);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;text-align:right">
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">에코 수수료</div>
          <input type="number" id="feeEco_${companyId}" value="${ecoAmt}"
                 style="width:100%;font-size:15px;font-weight:700;color:var(--orange);background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;text-align:right">
        </div>
      </div>
      <button class="btn-sm btn-blue" style="width:100%;margin-top:8px" onclick="saveFeeInfo('${companyId}')">수수료 저장</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🅿️ 주차 / ♻️ 분리수거 정보</div>
      <div class="info-cards-grid">
        <div class="info-mini-card">
          <div class="info-mini-icon">🅿️</div>
          <div class="info-mini-title">주차 정보</div>
          <textarea id="admin_parking_${companyId}" class="info-edit-textarea" placeholder="주차 정보 입력">${note?.parking_info || ''}</textarea>
        </div>
        <div class="info-mini-card">
          <div class="info-mini-icon">♻️</div>
          <div class="info-mini-title">분리수거장</div>
          <textarea id="admin_recycling_${companyId}" class="info-edit-textarea" placeholder="분리수거장 위치 입력">${note?.recycling_location || ''}</textarea>
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
      <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>👤 직원 배정</span>
        <div style="display:flex;gap:4px;align-items:center">
          ${monthSelectorHTML(selectedMonth, 'changeCompanyDetailMonth')}
        </div>
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

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
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
}

/**
 * 시간 + 빈도 + anchor_date를 모든 활성 스케줄에 일괄 저장
 */
async function saveScheduleSettings(companyId) {
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
}

// 기존 saveScheduleTimes는 saveScheduleSettings로 대체
async function saveScheduleTimes(companyId) {
  return saveScheduleSettings(companyId);
}


// ════════════════════════════════════════════════════
// 직원 배정
// ════════════════════════════════════════════════════

async function addAssignment(companyId) {
  const workerId = $(`newWorker_${companyId}`).value;
  const payAmount = parseInt($(`newPay_${companyId}`).value, 10) || 0;

  if (!workerId) return toast('직원을 선택하세요', 'error');
  if (payAmount < 0) return toast('지급액은 0 이상이어야 합니다', 'error');
  if (payAmount > 99999999) return toast('지급액이 너무 큽니다', 'error');

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
}

async function updatePayAmount(assignId, value) {
  const payAmount = parseInt(value, 10) || 0;
  if (payAmount < 0) return toast('지급액은 0 이상이어야 합니다', 'error');
  if (payAmount > 99999999) return toast('지급액이 너무 큽니다', 'error');

  // 변경 이력용 이전값
  const local = adminData.assignments.find(a => a.id === assignId);
  const oldPay = local ? (local.pay_amount || 0) : 0;

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
}


// ════════════════════════════════════════════════════
// QR 토큰 관리
// ════════════════════════════════════════════════════

function getQrUrl(companyId, token) {
  const base = window.location.origin + window.location.pathname.replace('admin.html', '');
  return `${base}site-company.html?company=${companyId}&token=${token}`;
}

async function generateQrToken(companyId) {
  const token = crypto.randomUUID();
  const { error } = await sb.from('companies')
    .update({ qr_token: token })
    .eq('id', companyId);

  if (error) return toast(error.message, 'error');

  const local = adminData.companies.find(c => c.id === companyId);
  if (local) local.qr_token = token;

  toast('QR 토큰 생성 완료');
  await openCompanyDetail(companyId);
}

async function regenerateQrToken(companyId) {
  if (!confirm('QR 토큰을 재생성하면 기존 QR 코드가 무효화됩니다. 계속하시겠습니까?')) return;
  await generateQrToken(companyId);
}

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
  selectedMonth = month;
  await ensureMonthData(month);
  if (_openCompanyId) openCompanyDetail(_openCompanyId);
}

// ─── 수수료 저장 ───
async function saveFeeInfo(companyId) {
  const contractAmt = parseInt($(`feeContract_${companyId}`)?.value, 10) || 0;
  const ocpAmt = parseInt($(`feeOcp_${companyId}`)?.value, 10) || 0;
  const ecoAmt = parseInt($(`feeEco_${companyId}`)?.value, 10) || 0;

  if (contractAmt < 0 || ocpAmt < 0 || ecoAmt < 0) return toast('금액은 0 이상이어야 합니다', 'error');

  const payload = {
    contract_amount: contractAmt,
    ocp_amount: ocpAmt,
    eco_amount: ecoAmt,
  };

  // 기존 financials 레코드가 있으면 update, 없으면 insert
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
}

/**
 * admin-companies.js - 업체관리 탭
 * 업체 목록, 등록/수정/삭제, 상세 모달, 스케줄(빈도 포함), 배정, 주차/분리수거
 */

// ─── 빈도 라벨 매핑 ───
const FREQ_LABELS = {
  weekly:   '매주',
  biweekly: '격주',
};

function getFreqLabel(freq) {
  return FREQ_LABELS[freq] || '매주';
}

// 상세 모달 전용 월 변수 (selectedMonth와 독립)
let detailMonth = '';

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

  // 목록 HTML 생성
  const listHTML = `
    <p class="text-muted" style="margin-bottom:12px">총 ${filtered.length}개 업체</p>
    ${filtered.map(c => {
      const scheds = getCompanySchedules(c.id);
      const daysWithFreq = scheds.map(s => {
        const freq = s.frequency || 'weekly';
        const label = WEEKDAY_NAMES[s.weekday];
        return freq === 'biweekly' ? label + '(격주)' : label;
      }).join(', ') || '-';
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
              <div class="card-title">${c.name} ${c.area_code ? '<span style="font-size:11px;color:var(--primary);font-weight:500;margin-left:6px">[' + c.area_code + ']</span>' : ''}</div>
              <div class="card-subtitle">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}</div>
            </div>
            ${statusBadge}
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
        <label>계약 시작일</label>
        <input type="date" id="fContractStart" value="${c.contract_start_date || ''}">
      </div>
      <div class="field">
        <label>계약 종료일</label>
        <input type="date" id="fContractEnd" value="${c.contract_end_date || ''}">
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
    location:            $('fLocation').value.trim(),
    area_code:           $('fAreaCode').value.trim(),
    area_name:           $('fAreaName').value.trim(),
    contact_name:        $('fContact').value.trim(),
    contact_phone:       $('fPhone').value.trim(),
    contract_start_date: $('fContractStart').value || null,
    contract_end_date:   $('fContractEnd').value || null,
    status:              $('fStatus').value,
    memo:                $('fMemo').value.trim(),
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

/** 상세 모달 전용 월 선택 HTML (6개월 범위: -2 ~ +3) */
function detailMonthSelectorHTML(current, companyId) {
  const now = new Date();
  const months = [];
  for (let i = -2; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}월`;
    months.push({ val, label });
  }
  return `<div class="month-selector" style="margin-bottom:10px">${months.map(m =>
    `<button class="month-btn${m.val === current ? ' active' : ''}"
       onclick="changeDetailMonth('${companyId}', '${m.val}')">${m.label}</button>`
  ).join('')}</div>`;
}

async function changeDetailMonth(companyId, month) {
  detailMonth = month;
  await ensureMonthData(month);
  await openCompanyDetail(companyId);
}

async function openCompanyDetail(companyId) {
  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return;

  // 상세 모달 월이 아직 설정되지 않았으면 selectedMonth 사용
  if (!detailMonth) detailMonth = selectedMonth;

  const scheds = getCompanySchedules(companyId);
  const assigns = getCompanyAssignments(companyId, detailMonth);
  const allWorkers = getActiveWorkers();
  const note = getCompanyNote(companyId);

  // 현재 빈도 결정 (활성 스케줄 중 첫 번째 기준, 없으면 weekly)
  const currentFreq = scheds.length > 0 ? (scheds[0].frequency || 'weekly') : 'weekly';
  const currentAnchor = scheds.length > 0 ? (scheds[0].anchor_date || '') : '';

  // 계약일 표시
  const contractInfo = [];
  if (c.contract_start_date) contractInfo.push(`시작: ${c.contract_start_date}`);
  if (c.contract_end_date) contractInfo.push(`종료: ${c.contract_end_date}`);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${c.name}</h3>
    <div class="detail-location">${c.location || ''} ${c.area_name ? '· ' + c.area_name : ''}</div>
    ${contractInfo.length > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">📋 계약기간: ${contractInfo.join(' / ')}</div>` : ''}

    <div class="detail-section">
      <button class="btn-sm btn-blue" onclick="openCompanyForm('${companyId}')">기본정보 수정</button>
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
      <div class="detail-section-title">
        👤 직원 배정
      </div>
      ${detailMonthSelectorHTML(detailMonth, companyId)}

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

    <div class="detail-section">
      <div class="detail-section-title">💰 정산 정보 (${detailMonth})</div>
      ${(() => {
        const fin = adminData.financials.find(f => f.company_id === companyId && f.month === detailMonth);
        const meta = typeof parseFeeMetadata === 'function' ? parseFeeMetadata(fin?.memo) : {};
        const contractAmt = fin?.contract_amount || 0;
        const ocpAmt = fin?.ocp_amount || 0;
        const ecoAmt = fin?.eco_amount || 0;
        const ocpRate = meta.ocp_rate || 0;
        const ecoRate = meta.eco_rate || 0;
        const workerPay = fin?.worker_pay_total || 0;
        const autoWorker = contractAmt - ocpAmt - ecoAmt;
        return `
          <!-- 계약금액 -->
          <div class="field" style="margin-bottom:10px">
            <label style="font-weight:700">계약금액 (월)</label>
            <input type="number" id="fin_contract_${companyId}" value="${contractAmt}" placeholder="0"
                   oninput="recalcFinancials('${companyId}')">
          </div>

          <!-- OCP 수수료 -->
          <div class="fin-fee-row">
            <div class="fin-fee-label" style="color:var(--primary)">오피스클린프로 수수료</div>
            <div class="fin-fee-inputs">
              <div class="fin-pct-wrap">
                <input type="number" id="fin_ocp_rate_${companyId}" value="${ocpRate}" placeholder="0"
                       step="0.1" min="0" max="100"
                       oninput="recalcFee('${companyId}','ocp')">
                <span class="fin-pct-unit">%</span>
              </div>
              <div class="fin-amt-wrap">
                <input type="number" id="fin_ocp_${companyId}" value="${ocpAmt}" placeholder="0"
                       oninput="onFeeAmtManual('${companyId}','ocp')">
                <span class="fin-amt-unit">원</span>
              </div>
            </div>
          </div>

          <!-- 에코 수수료 -->
          <div class="fin-fee-row">
            <div class="fin-fee-label" style="color:var(--orange)">에코 수수료</div>
            <div class="fin-fee-inputs">
              <div class="fin-pct-wrap">
                <input type="number" id="fin_eco_rate_${companyId}" value="${ecoRate}" placeholder="0"
                       step="0.1" min="0" max="100"
                       oninput="recalcFee('${companyId}','eco')">
                <span class="fin-pct-unit">%</span>
              </div>
              <div class="fin-amt-wrap">
                <input type="number" id="fin_eco_${companyId}" value="${ecoAmt}" placeholder="0"
                       oninput="onFeeAmtManual('${companyId}','eco')">
                <span class="fin-amt-unit">원</span>
              </div>
            </div>
          </div>

          <!-- 자동 계산 결과 -->
          <div class="fin-auto-result" id="fin_result_${companyId}">
            <div class="fin-result-row">
              <span>직원 지급액 (자동: 계약 − OCP − 에코)</span>
              <strong id="fin_worker_auto_${companyId}" style="color:var(--green)">${fmt(autoWorker)}원</strong>
            </div>
            <div class="fin-result-row" style="font-size:11px;color:var(--text2)">
              <span>에코에서 받는 금액 (계약 − 에코수수료)</span>
              <span id="fin_eco_recv_${companyId}">${fmt(contractAmt - ecoAmt)}원</span>
            </div>
          </div>

          <!-- 직원 지급 합계 (수정 가능) -->
          <div class="field" style="margin-top:8px;margin-bottom:0">
            <label>직원 지급 합계 <span class="text-muted" style="font-size:11px">(자동 계산됨, 직접 수정 가능)</span></label>
            <input type="number" id="fin_worker_${companyId}" value="${workerPay || autoWorker}" placeholder="0">
          </div>

          <button class="btn-sm btn-blue" style="width:100%;margin-top:10px"
                  onclick="saveFinancials('${companyId}', '${fin?.id || ''}')">정산 정보 저장</button>
        `;
      })()}
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

      // ── 미래 미완료 tasks 자동 삭제 ──
      await syncTasksOnScheduleChange(companyId, weekday, false);
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

      // ── 해당 요일 tasks 자동 생성 ──
      await syncTasksOnScheduleChange(companyId, weekday, true, freq, anchorDate);
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

      // ── 새 스케줄 tasks 자동 생성 ──
      await syncTasksOnScheduleChange(companyId, weekday, true, freq, anchorDate);
    }
    btn.classList.add('active');
  }

  toast('요일 변경됨');
}

/**
 * 스케줄 변경 시 미래 tasks 자동 동기화
 * - 비활성화: 오늘 이후 해당 업체+요일의 scheduled tasks 삭제
 * - 활성화/추가: 현재 월 + 다음 월에 해당 업체+요일 tasks 자동 생성
 */
async function syncTasksOnScheduleChange(companyId, weekday, activate, freq, anchorDate) {
  try {
    const todayStr = today();
    const companyName = getCompanyName(companyId);
    const dayNames = ['일','월','화','수','목','금','토'];

    if (!activate) {
      // ── 비활성화: 미래 미완료 tasks 삭제 ──
      const { data: futureTasks, error: fetchErr } = await sb.from('tasks')
        .select('id, task_date')
        .eq('company_id', companyId)
        .eq('status', 'scheduled')
        .gte('task_date', todayStr);

      if (fetchErr || !futureTasks) return;

      const toDelete = futureTasks.filter(t => {
        const d = new Date(t.task_date + 'T00:00:00');
        return d.getDay() === weekday;
      });

      if (toDelete.length > 0) {
        const ids = toDelete.map(t => t.id);
        await sb.from('tasks').delete().in('id', ids);
        toast(`${companyName} ${dayNames[weekday]}요일 미래 일정 ${toDelete.length}건 자동 삭제`, 'info');
      }
    } else {
      // ── 활성화: 현재 월 + 다음 월 tasks 자동 생성 ──
      const nowDate = new Date(todayStr + 'T00:00:00');
      const curMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
      const nextMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1);
      const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

      const months = [curMonth, nextMonth];
      let totalCreated = 0;

      for (const month of months) {
        const [y, m] = month.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();

        // 해당 월 배정 확인
        const assigns = adminData.assignments.filter(a => a.company_id === companyId && a.month === month);
        if (assigns.length === 0) continue;

        // 해당 월의 매칭 날짜 수집
        const dates = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (dateStr < todayStr) continue; // 과거 제외
          const d = new Date(dateStr + 'T00:00:00');
          if (d.getDay() !== weekday) continue;
          // 격주 체크
          if (freq === 'biweekly' && !isBiweeklyMatch(anchorDate, dateStr)) continue;
          dates.push(dateStr);
        }

        if (dates.length === 0) continue;

        // 기존 tasks 확인 (업체+날짜 기준)
        const { data: existing } = await sb.from('tasks')
          .select('task_date')
          .eq('company_id', companyId)
          .in('task_date', dates);

        const existingDateSet = new Set((existing || []).map(t => t.task_date));

        // 메인 담당자 (첫 번째 배정자)로 업체당 1개만 생성
        const mainAssign = assigns[0];
        const toInsert = [];
        for (const dateStr of dates) {
          if (!existingDateSet.has(dateStr)) {
            toInsert.push({
              company_id: companyId,
              worker_id: mainAssign.worker_id,
              task_date: dateStr,
              status: 'scheduled',
              task_source: 'auto',
              memo: null,
            });
          }
        }

        if (toInsert.length > 0) {
          const { error: insertErr } = await sb.from('tasks').insert(toInsert);
          if (!insertErr) totalCreated += toInsert.length;
        }
      }

      if (totalCreated > 0) {
        toast(`${companyName} ${dayNames[weekday]}요일 일정 ${totalCreated}건 자동 생성`, 'info');
      }
    }
  } catch (e) {
    console.error('syncTasksOnScheduleChange error:', e);
  }
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
  const payAmount = parseInt($(`newPay_${companyId}`).value) || 0;

  if (!workerId) return toast('직원을 선택하세요', 'error');

  const { data, error } = await sb.from('company_workers').insert({
    company_id: companyId,
    worker_id:  workerId,
    month:      detailMonth || selectedMonth,
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
    `${companyName} (${detailMonth || selectedMonth}) - ${workerName} 배정 삭제`
  );

  adminData.assignments = adminData.assignments.filter(a => a.id !== assignId);
  toast('배정 삭제됨');
  await openCompanyDetail(companyId);
}

async function updatePayAmount(assignId, value) {
  const payAmount = parseInt(value) || 0;

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
      `${workerName} - ${companyName} (${detailMonth || selectedMonth}) 지급액 수정`
    );
  }

  if (local) local.pay_amount = payAmount;

  toast('지급액 수정됨');
}


// ════════════════════════════════════════════════════
// 정산 정보: 수수료 자동 계산
// ════════════════════════════════════════════════════

/** %에서 금액 자동 계산 (계약금액 × rate%) */
function recalcFee(companyId, type) {
  const contract = parseInt($('fin_contract_' + companyId)?.value) || 0;
  const rate = parseFloat($(`fin_${type}_rate_${companyId}`)?.value) || 0;
  const amt = Math.round(contract * rate / 100);
  const amtInput = $(`fin_${type}_${companyId}`);
  if (amtInput) amtInput.value = amt;
  updateFinResult(companyId);
}

/** 금액 직접 입력 시 — %를 역산 */
function onFeeAmtManual(companyId, type) {
  const contract = parseInt($('fin_contract_' + companyId)?.value) || 0;
  const amt = parseInt($(`fin_${type}_${companyId}`)?.value) || 0;
  const rateInput = $(`fin_${type}_rate_${companyId}`);
  if (rateInput && contract > 0) {
    rateInput.value = Math.round((amt / contract) * 1000) / 10; // 소수점 1자리
  } else if (rateInput && contract === 0) {
    rateInput.value = 0;
  }
  updateFinResult(companyId);
}

/** 계약금액 변경 시 OCP + 에코 둘 다 재계산 */
function recalcFinancials(companyId) {
  recalcFee(companyId, 'ocp');
  recalcFee(companyId, 'eco');
}

/** 자동 결과 + 직원 지급액 업데이트 */
function updateFinResult(companyId) {
  const contract = parseInt($('fin_contract_' + companyId)?.value) || 0;
  const ocp = parseInt($('fin_ocp_' + companyId)?.value) || 0;
  const eco = parseInt($('fin_eco_' + companyId)?.value) || 0;
  const autoWorker = contract - ocp - eco;

  const workerAutoEl = $('fin_worker_auto_' + companyId);
  if (workerAutoEl) workerAutoEl.textContent = fmt(autoWorker) + '원';

  const ecoRecvEl = $('fin_eco_recv_' + companyId);
  if (ecoRecvEl) ecoRecvEl.textContent = fmt(contract - eco) + '원';

  // 직원 지급 합계 자동 세팅
  const workerInput = $('fin_worker_' + companyId);
  if (workerInput) workerInput.value = autoWorker;
}


// ════════════════════════════════════════════════════
// 정산 정보 저장 (financials)
// ════════════════════════════════════════════════════

async function saveFinancials(companyId, finId) {
  const month = detailMonth || selectedMonth;

  const contractAmount = parseInt($('fin_contract_' + companyId)?.value) || 0;
  const workerPayTotal = parseInt($('fin_worker_' + companyId)?.value) || 0;
  const ocpAmount = parseInt($('fin_ocp_' + companyId)?.value) || 0;
  const ecoAmount = parseInt($('fin_eco_' + companyId)?.value) || 0;
  const ocpRate = parseFloat($('fin_ocp_rate_' + companyId)?.value) || 0;
  const ecoRate = parseFloat($('fin_eco_rate_' + companyId)?.value) || 0;

  // 수수료 메타데이터 (JSON) — memo 필드에 저장
  const feeMeta = {};
  if (ocpRate > 0) { feeMeta.ocp_type = 'percent'; feeMeta.ocp_rate = ocpRate; }
  else if (ocpAmount > 0) { feeMeta.ocp_type = 'fixed'; }
  if (ecoRate > 0) { feeMeta.eco_type = 'percent'; feeMeta.eco_rate = ecoRate; }
  else if (ecoAmount > 0) { feeMeta.eco_type = 'fixed'; }
  const memoStr = Object.keys(feeMeta).length > 0 ? JSON.stringify(feeMeta) : null;

  const payload = {
    contract_amount: contractAmount,
    worker_pay_total: workerPayTotal,
    ocp_amount: ocpAmount,
    eco_amount: ecoAmount,
    memo: memoStr,
  };

  let error;
  if (finId) {
    ({ error } = await sb.from('company_financials').update(payload).eq('id', finId));
  } else {
    payload.company_id = companyId;
    payload.month = month;
    const { data, error: insertErr } = await sb.from('company_financials').insert(payload).select().single();
    error = insertErr;
    if (data) adminData.financials.push(data);
  }

  if (error) return toast(error.message, 'error');

  // 로컬 캐시 업데이트
  if (finId) {
    const local = adminData.financials.find(f => f.id === finId);
    if (local) Object.assign(local, payload);
  }

  const companyName = getCompanyName(companyId);
  await logChange('company_financials', finId || companyId, finId ? 'update' : 'insert',
    [{ field: 'contract_amount', oldVal: '-', newVal: contractAmount },
     { field: 'eco_amount', oldVal: '-', newVal: ecoAmount + (ecoRate > 0 ? ' (' + ecoRate + '%)' : '') },
     { field: 'ocp_amount', oldVal: '-', newVal: ocpAmount + (ocpRate > 0 ? ' (' + ocpRate + '%)' : '') }],
    `${companyName} (${month}) 정산 정보 ${finId ? '수정' : '등록'}`
  );

  toast('정산 정보 저장 완료');
  await openCompanyDetail(companyId);
}

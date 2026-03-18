/**
 * staff-today.js - 오늘 할 일 탭 (날짜 선택 가능)
 */

// ─── 날짜 변경 ───

function changeStaffDate(dateStr) {
  staffSelectedDate = dateStr;
  renderTodayTasks();
}

function getStaffDate() {
  return staffSelectedDate || today();
}

// ─── 오늘 할 일 렌더링 ───

function renderTodayTasks() {
  const mc = $('mainContent');

  const dateStr = getStaffDate();
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  const month = dateStr.substring(0, 7);
  const dayName = WEEKDAY_NAMES[weekday];
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const todayStr = today();
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;

  // 해당 월 배정 업체 중 선택 날짜 스케줄인 업체
  const assigns = getMonthAssignments(month);
  const taskItems = [];

  assigns.forEach(a => {
    const company = getCompanyById(a.company_id);
    if (!company || company.status !== 'active') return;

    const scheds = getCompanySchedules(company.id);
    const matchSched = scheds.find(s => s.weekday === weekday);
    if (!matchSched) return;

    const note = getCompanyNote(company.id);
    const doneTask = staffData.tasks.find(
      t => t.company_id === company.id && t.task_date === dateStr && t.status === 'completed'
    );
    const unresolvedReqs = staffData.requests.filter(
      r => r.company_id === company.id && !r.is_resolved && !isExpired(r.expires_at)
    );

    taskItems.push({
      company,
      note,
      todayTask: doneTask,
      isCompleted: !!doneTask,
      requestCount: unresolvedReqs.length,
    });
  });

  // 미완료 먼저, 완료는 아래로
  taskItems.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return 0;
  });

  const cntTotal = taskItems.length;
  const cntDone = taskItems.filter(i => i.isCompleted).length;
  const pct = cntTotal > 0 ? Math.round(cntDone / cntTotal * 100) : 0;

  // 날짜 이동 버튼 (어제/오늘/내일)
  const prevDate = new Date(d); prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(d); nextDate.setDate(nextDate.getDate() + 1);
  const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}-${String(prevDate.getDate()).padStart(2,'0')}`;
  const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;

  let html = `
    <div class="sttoday-date-nav">
      <button class="sttoday-nav-btn" onclick="changeStaffDate('${prevStr}')">◀</button>
      <div class="sttoday-date-center">
        <div class="sttoday-date">${mm}월 ${dd}일 ${dayName}요일</div>
        ${isToday ? '<span class="badge badge-today" style="font-size:10px">오늘</span>' : isPast ? '<span class="badge badge-warn" style="font-size:10px">지난 날</span>' : '<span class="badge badge-done" style="font-size:10px">예정</span>'}
      </div>
      <button class="sttoday-nav-btn" onclick="changeStaffDate('${nextStr}')">▶</button>
    </div>
    ${!isToday ? '<div style="text-align:center;margin-bottom:8px"><button class="btn-sm btn-blue" style="font-size:11px" onclick="changeStaffDate(today())">오늘로 돌아가기</button></div>' : ''}
    <div class="sttoday-header">
      <div class="sttoday-summary">
        <span class="sttoday-done">${cntDone}</span>
        <span class="sttoday-total">/ ${cntTotal}</span>
      </div>
    </div>
    <div class="sttoday-progress">
      <div class="sttoday-progress-bar" style="width:${pct}%"></div>
    </div>
  `;

  if (taskItems.length === 0) {
    html += `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-icon">🎉</div>
        <p>${isToday ? '오늘 예정된 청소가 없습니다.' : `${mm}/${dd} 예정된 청소가 없습니다.`}</p>
      </div>
    `;
  } else {
    taskItems.forEach(item => {
      html += buildTodayTaskCard(item, dateStr);
    });
  }

  mc.innerHTML = html;
}


// ─── 카드 빌드 ───

function buildTodayTaskCard(item, dateStr) {
  const { company, note, isCompleted, requestCount, todayTask } = item;
  const cid = company.id;
  const todayStr = today();
  const isToday = dateStr === todayStr;
  const isPastOrToday = dateStr <= todayStr;

  const parking = note?.parking_info || '정보 없음';
  const recycling = note?.recycling_location || '정보 없음';
  const specialNotes = note?.special_notes || '';

  let html = `<div class="sttoday-card ${isCompleted ? 'done' : ''}" id="stCard_${cid}">`;

  // 헤더
  html += `
    <div class="sttoday-card-top">
      <div style="min-width:0;flex:1">
        <div class="sttoday-card-name">${company.name}</div>
        <div class="sttoday-card-addr">${company.location || ''}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        ${isCompleted
          ? '<span class="badge badge-done">완료</span>'
          : (requestCount > 0 ? `<span class="badge badge-warn">요청 ${requestCount}건</span>` : '')
        }
      </div>
    </div>
  `;

  // 정보 그리드
  html += `
    <div class="sttoday-info-grid">
      <div class="sttoday-info-item">
        <span class="sttoday-info-label">🅿️ 주차</span>
        <span class="sttoday-info-value">${parking}</span>
      </div>
      <div class="sttoday-info-item">
        <span class="sttoday-info-label">♻️ 분리수거</span>
        <span class="sttoday-info-value">${recycling}</span>
      </div>
    </div>
  `;

  // 특이사항
  if (specialNotes) {
    html += `
      <div class="sttoday-special">
        <div class="sttoday-special-label">📝 특이사항</div>
        <div class="sttoday-special-text">${escapeHtml(specialNotes).replace(/\n/g, '<br>')}</div>
      </div>
    `;
  }

  // 완료 상태 or 액션 영역
  if (isCompleted) {
    html += `
      <div class="sttoday-done-bar">
        <span><span class="check-icon">✓</span> 완료됨</span>
        ${todayTask?.memo ? `<span class="sttoday-memo-text">${todayTask.memo}</span>` : ''}
      </div>
    `;
  } else if (isPastOrToday) {
    // 오늘 또는 과거 → 완료 처리 가능
    html += `
      <div class="sttoday-action" id="stAction_${cid}">
        <textarea class="sttoday-memo-input" id="stMemo_${cid}" placeholder="메모 입력 (선택사항)" rows="2"></textarea>
        <div class="sttoday-btn-row">
          <button class="btn-sm btn-gray" style="font-size:12px" onclick="triggerPhotoUpload('${cid}', '${note?.id || ''}')">📷 사진</button>
          <button class="sttoday-complete-btn" onclick="completeTodayTask('${cid}', '${dateStr}')">완료 체크 ✓</button>
        </div>
      </div>
    `;
  } else {
    // 미래 날짜 → 완료 불가
    html += `
      <div style="padding:10px;text-align:center;color:var(--text2);font-size:12px">
        아직 도래하지 않은 일정입니다.
      </div>
    `;
  }

  html += '</div>';
  return html;
}


// ─── 완료 처리 (날짜 파라미터 지원) ───

async function completeTodayTask(companyId, targetDate) {
  const memoEl = $('stMemo_' + companyId);
  const memo = memoEl ? memoEl.value.trim() : '';

  const btn = document.querySelector(`#stCard_${companyId} .sttoday-complete-btn`);
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

  const dateStr = targetDate || getStaffDate();

  // 기존 task 확인 (자동 생성된 scheduled task가 있을 수 있음)
  const existing = staffData.tasks.find(
    t => t.company_id === companyId && t.task_date === dateStr
  );

  let data, error;

  if (existing && existing.status === 'scheduled') {
    // 기존 예정 task → completed로 UPDATE
    const res = await sb.from('tasks')
      .update({
        status: 'completed',
        worker_id: currentWorker.id,
        memo: memo || null,
      })
      .eq('id', existing.id)
      .select()
      .single();
    data = res.data;
    error = res.error;
    if (!error) {
      // 로컬 데이터 갱신
      Object.assign(existing, {
        status: 'completed',
        worker_id: currentWorker.id,
        memo: memo || null,
        updated_at: new Date().toISOString(),
      });
    }
  } else if (existing && existing.status === 'completed') {
    if (btn) { btn.disabled = false; btn.textContent = '완료 체크 ✓'; }
    toast('이미 완료 처리되었습니다', 'error');
    return;
  } else {
    // task가 없으면 새로 INSERT
    const res = await sb.from('tasks').insert({
      company_id: companyId,
      worker_id:  currentWorker.id,
      task_date:  dateStr,
      status:     'completed',
      task_source: 'manual',
      memo:       memo || null,
    }).select().single();
    data = res.data;
    error = res.error;
    if (!error) {
      if (data) {
        staffData.tasks.push(data);
      } else {
        staffData.tasks.push({
          company_id: companyId,
          worker_id: currentWorker.id,
          task_date: dateStr,
          status: 'completed',
          memo: memo || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = '완료 체크 ✓'; }
    if (error.code === '23505') {
      toast('이미 완료 처리되었습니다', 'error');
    } else {
      toast(error.message, 'error');
    }
    return;
  }

  const isToday = dateStr === today();
  toast(isToday ? '청소 완료!' : `${dateStr} 청소 완료 처리!`);
  renderTodayTasks();
}

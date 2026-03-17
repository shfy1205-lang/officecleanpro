/**
 * admin-changelog.js - 변경이력 탭
 * change_logs 테이블을 조회하여 관리자에게 데이터 변경 이력을 보여줌
 */

let changeLogFilter = 'all';   // all | company_workers | company_schedule | billing_records
let changeLogPeriod = '30';    // 7 | 30 | all
let changeLogSearch = '';
let _changeLogCachedLogs = [];  // DB 조회 결과 캐시 (검색 시 재사용)

const ENTITY_TYPE_LABELS = {
  company_workers:    '지급금액/배정',
  company_financials: '업체 수수료',
  company_schedule:   '스케줄',
  billing_records:    '정산',
};

const ACTION_TYPE_LABELS = {
  update: '수정',
  delete: '삭제',
  insert: '추가',
};

const ACTION_TYPE_BADGES = {
  update: 'badge-today',
  delete: 'badge-warn',
  insert: 'badge-done',
};

async function renderChangeLog(listOnly) {
  const mc = $('mainContent');

  let logs;

  if (listOnly && _changeLogCachedLogs.length > 0) {
    // 검색만 변경된 경우: 캐시된 로그 재사용 (DB 재조회 안 함)
    logs = _changeLogCachedLogs;
  } else {
    // 전체 렌더 또는 캐시 없음: DB 조회
    if (!listOnly) {
      mc.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
    }

    let query = sb.from('change_logs')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200);

    if (changeLogPeriod !== 'all') {
      const days = parseInt(changeLogPeriod);
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte('changed_at', since.toISOString());
    }

    if (changeLogFilter !== 'all') {
      query = query.eq('entity_type', changeLogFilter);
    }

    const { data, error } = await query;

    if (error) {
      mc.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>로그 조회 오류: ${error.message}</p></div>`;
      return;
    }

    logs = data || [];
    _changeLogCachedLogs = logs;
  }

  // 검색어 필터 (클라이언트 사이드)
  let filtered = logs;
  if (changeLogSearch) {
    const q = changeLogSearch.toLowerCase();
    filtered = filtered.filter(l =>
      (l.note || '').toLowerCase().includes(q) ||
      (l.field_name || '').toLowerCase().includes(q) ||
      (l.old_value || '').toLowerCase().includes(q) ||
      (l.new_value || '').toLowerCase().includes(q)
    );
  }

  // 목록 HTML 생성
  const listHTML = `
    <p class="text-muted" style="margin-bottom:8px">총 ${filtered.length}건</p>

    ${filtered.length > 0 ? `
      <!-- PC 테이블 -->
      <div class="sp-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>변경일시</th>
                <th>관리자</th>
                <th>대상종류</th>
                <th>작업</th>
                <th>변경필드</th>
                <th>이전값</th>
                <th>변경값</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(l => {
                const entityLabel = ENTITY_TYPE_LABELS[l.entity_type] || l.entity_type;
                const actionLabel = ACTION_TYPE_LABELS[l.action_type] || l.action_type;
                const actionBadge = ACTION_TYPE_BADGES[l.action_type] || 'badge-area';
                const changerName = l.changed_by ? getWorkerName(l.changed_by) : '-';
                const oldVal = truncateValue(l.old_value);
                const newVal = truncateValue(l.new_value);

                return `<tr>
                  <td style="white-space:nowrap;font-size:12px">${formatDate(l.changed_at)}</td>
                  <td>${changerName}</td>
                  <td><span class="badge badge-area" style="font-size:10px">${entityLabel}</span></td>
                  <td><span class="badge ${actionBadge}" style="font-size:10px">${actionLabel}</span></td>
                  <td style="font-size:12px">${l.field_name || '-'}</td>
                  <td style="font-size:12px;color:var(--red)">${oldVal}</td>
                  <td style="font-size:12px;color:var(--green)">${newVal}</td>
                  <td style="font-size:11px;color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(l.note || '')}">${escapeHtml(l.note) || '-'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="sp-cards-mobile">
        ${filtered.map(l => {
          const entityLabel = ENTITY_TYPE_LABELS[l.entity_type] || l.entity_type;
          const actionLabel = ACTION_TYPE_LABELS[l.action_type] || l.action_type;
          const actionBadge = ACTION_TYPE_BADGES[l.action_type] || 'badge-area';
          const changerName = l.changed_by ? getWorkerName(l.changed_by) : '-';

          return `
            <div class="card" style="padding:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="display:flex;gap:4px;align-items:center">
                  <span class="badge badge-area" style="font-size:10px">${entityLabel}</span>
                  <span class="badge ${actionBadge}" style="font-size:10px">${actionLabel}</span>
                </div>
                <span style="font-size:11px;color:var(--text2)">${formatDate(l.changed_at)}</span>
              </div>
              ${l.note ? `<div style="font-size:12px;font-weight:500;margin-bottom:4px">${escapeHtml(l.note)}</div>` : ''}
              <div style="font-size:12px;color:var(--text2)">
                ${l.field_name ? `<span style="font-weight:500">${l.field_name}</span>: ` : ''}
                ${l.old_value ? `<span style="color:var(--red)">${truncateValue(l.old_value)}</span>` : ''}
                ${l.old_value && l.new_value ? ' → ' : ''}
                ${l.new_value ? `<span style="color:var(--green)">${truncateValue(l.new_value)}</span>` : ''}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">변경자: ${changerName}</div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>변경 이력이 없습니다.</p>
      </div>
    `}
  `;

  // 검색 시: 목록 컨테이너만 갱신 (input 보존 → IME 유지)
  if (listOnly) {
    const lc = document.getElementById('changeLogListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  // 전체 렌더
  const todayStr = today();
  const todayLogs = logs.filter(l => l.changed_at && l.changed_at.startsWith(todayStr));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekLogs = logs.filter(l => l.changed_at && new Date(l.changed_at) >= weekAgo);

  mc.innerHTML = `
    <div class="section-title">변경이력</div>

    <!-- 통계 카드 -->
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">오늘 변경</div>
        <div class="stat-value blue">${todayLogs.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">최근 7일</div>
        <div class="stat-value green">${weekLogs.length}건</div>
      </div>
    </div>

    <!-- 필터 바 -->
    <div class="admin-filter-bar" style="margin-bottom:16px">
      <select class="admin-area-select" onchange="changeLogFilter=this.value;renderChangeLog()">
        <option value="all"${changeLogFilter === 'all' ? ' selected' : ''}>전체 종류</option>
        <option value="company_workers"${changeLogFilter === 'company_workers' ? ' selected' : ''}>지급금액/배정</option>
        <option value="company_schedule"${changeLogFilter === 'company_schedule' ? ' selected' : ''}>스케줄</option>
        <option value="billing_records"${changeLogFilter === 'billing_records' ? ' selected' : ''}>정산</option>
        <option value="company_financials"${changeLogFilter === 'company_financials' ? ' selected' : ''}>업체 수수료</option>
      </select>
      <select class="admin-area-select" onchange="changeLogPeriod=this.value;renderChangeLog()">
        <option value="7"${changeLogPeriod === '7' ? ' selected' : ''}>최근 7일</option>
        <option value="30"${changeLogPeriod === '30' ? ' selected' : ''}>최근 30일</option>
        <option value="all"${changeLogPeriod === 'all' ? ' selected' : ''}>전체 기간</option>
      </select>
      <div class="search-box" style="flex:1;margin-bottom:0">
        <input id="changeLogSearchInput" placeholder="검색 (메모, 필드, 값)" value="${changeLogSearch}">
      </div>
    </div>

    <div id="changeLogListContainer">${listHTML}</div>
  `;

  // 한글 IME 조합 방지 검색 바인딩
  bindSearchInput('changeLogSearchInput', (val) => {
    changeLogSearch = val;
    renderChangeLog(true);
  });
}

/** 값 표시 (길면 잘라서) */
function truncateValue(val) {
  if (val == null || val === 'null') return '-';
  const str = String(val);
  // 숫자면 포맷
  if (/^\d+$/.test(str) && str.length >= 4) {
    return fmt(parseInt(str));
  }
  return str.length > 30 ? str.slice(0, 30) + '...' : str;
}

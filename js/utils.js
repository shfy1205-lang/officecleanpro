/**
 * utils.js - 공통 유틸리티 함수
 * admin.js와 staff.js에서 중복되던 함수들을 통합
 */

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const LEAD_STATUS_MAP = {
  new:        { label: '신규', badge: 'badge-area' },
  contacted:  { label: '연락중', badge: 'badge-today' },
  visit_plan: { label: '방문예정', badge: 'badge-day' },
  visit_done: { label: '방문완료', badge: 'badge-done' },
  proposal:   { label: '견적제출', badge: 'badge-day' },
  won:        { label: '성공', badge: 'badge-done' },
  lost:       { label: '실패', badge: 'badge-warn' },
};

const BILLING_STATUS_MAP = {
  pending: { label: '대기', badge: 'badge-area' },
  billed:  { label: '발행완료', badge: 'badge-today' },
  paid:    { label: '입금완료', badge: 'badge-done' },
  overdue: { label: '연체', badge: 'badge-warn' },
};

/** 월 선택 버튼 HTML 생성 (admin/staff 공통) */
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

/** 날짜 포맷 (MM/DD HH:MM) */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

/** 날짜 포맷 짧은 버전 (YYYY-MM-DD) */
function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 만료 여부 체크 */
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

/**
 * 공지 대상 파싱 ([직원:이름], [구역:이름], [전체])
 * @param {string} title - 공지 제목
 * @returns {{ type: string, target: string, cleanTitle: string }}
 */
function parseNoticeTarget(title) {
  if (!title) return { type: 'all', target: '', cleanTitle: '' };

  const match = title.match(/^\[(전체|직원|구역):?([^\]]*)\]\s*/);
  if (!match) return { type: 'all', target: '', cleanTitle: title };

  const prefix = match[1];
  const target = match[2] || '';
  const cleanTitle = title.slice(match[0].length);

  if (prefix === '전체') return { type: 'all', target: '', cleanTitle };
  if (prefix === '직원') return { type: 'worker', target, cleanTitle };
  if (prefix === '구역') return { type: 'area', target, cleanTitle };

  return { type: 'all', target: '', cleanTitle };
}

/** 모달 닫기 (공통) */
function closeModal() {
  $('detailModal').classList.remove('show');
  $('modalBody').classList.remove('modal-wide');
}

/**
 * 3.3% 공제 계산 (공통)
 * 모든 화면에서 동일한 공제 계산을 사용하도록 통일
 */
function calcDeduction(totalPay) {
  const deduction = Math.round(totalPay * 0.033);
  const netPay = totalPay - deduction;
  return { deduction, netPay };
}

/**
 * 단일 배정(assignment)의 최종 지급액 계산 (공통)
 * 관리자/직원/수익/엑셀 모든 화면에서 동일한 결과를 보장
 *
 * 계산 로직:
 *  1) company_financials 데이터가 있고, share(배분율)이 설정된 경우:
 *     workerPool = contract_amount - ocp_amount - eco_amount
 *     calcPay = workerPool × share / 100
 *  2) 그 외: calcPay = pay_amount
 *  3) 최종값: pay_amount가 있으면 pay_amount 사용(수동 override), 없으면 calcPay 사용
 *
 * @param {Object} a - company_workers row (assignment)
 * @param {Object} finMap - { company_id: company_financials row } (없으면 null)
 * @returns {number} 최종 지급액
 */
function calcAssignmentFinalPay(a, finMap) {
  const fin = finMap ? finMap[a.company_id] : null;
  let calcPay = 0;

  if (fin && a.share && a.share > 0) {
    const contract = fin.contract_amount || 0;
    const ocp = fin.ocp_amount || 0;
    const eco = fin.eco_amount || 0;
    const workerPool = contract - ocp - eco;
    calcPay = Math.round(workerPool * a.share / 100);
  } else {
    calcPay = a.pay_amount || 0;
  }

  return a.pay_amount || calcPay;
}

/**
 * 월별 financial 맵 생성 (공통)
 * @param {Array} financials - company_financials 배열
 * @param {string} month - 'YYYY-MM' 형식
 * @returns {Object} { company_id: financial_row }
 */
function buildFinMap(financials, month) {
  const map = {};
  if (!financials) return map;
  financials.filter(f => f.month === month).forEach(f => { map[f.company_id] = f; });
  return map;
}

// ════════════════════════════════════════════════════
// 격주 매칭 판별 (공통)
// ════════════════════════════════════════════════════

/**
 * 격주(biweekly) 스케줄에서 특정 날짜가 매칭되는지 판별
 * anchor 날짜 기준으로 2주 간격에 해당하는 주인지 계산
 *
 * @param {string} anchorDate - 기준일 ('YYYY-MM-DD')
 * @param {string} targetDateStr - 판별 대상일 ('YYYY-MM-DD')
 * @returns {boolean} 매칭 여부
 */
function isBiweeklyMatch(anchorDate, targetDateStr) {
  if (!anchorDate) return true;
  const anchor = new Date(anchorDate + 'T00:00:00');
  const target = new Date(targetDateStr + 'T00:00:00');
  const diffMs = target.getTime() - anchor.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  return (Math.abs(diffWeeks) % 2) === 0;
}

// ════════════════════════════════════════════════════
// 한글 IME 조합 방지 검색 헬퍼 (공통)
// ════════════════════════════════════════════════════

/**
 * 검색 입력란에 한글 IME 조합 방지 이벤트를 바인딩
 * compositionstart/compositionend로 조합 중 검색 실행을 방지하고
 * 조합 완료 후에만 콜백을 실행한다.
 *
 * @param {string} inputId - input 요소의 id
 * @param {Function} callback - 검색 실행 콜백 (value를 인자로 받음)
 */
function bindSearchInput(inputId, callback) {
  const el = document.getElementById(inputId);
  if (!el) return;

  let isComposing = false;

  el.addEventListener('compositionstart', () => { isComposing = true; });
  el.addEventListener('compositionend', () => {
    isComposing = false;
    // 조합 완료 후 즉시 콜백 실행
    callback(el.value);
  });
  el.addEventListener('input', () => {
    // IME 조합 중이면 무시 (영문/숫자는 isComposing=false이므로 즉시 실행)
    if (!isComposing) {
      callback(el.value);
    }
  });
}

// ════════════════════════════════════════════════════
// 변경 이력 로그 (공통)
// ════════════════════════════════════════════════════

/**
 * 변경 이력을 change_logs 테이블에 기록
 * @param {string} entityType - 대상 테이블명 (company_workers, billing_records 등)
 * @param {string} entityId   - 대상 레코드 ID
 * @param {string} actionType - 작업 유형 (update, delete, insert)
 * @param {Array}  changes    - [{field, oldVal, newVal}] 변경 필드 배열
 * @param {string} note       - 추가 참조 정보 (업체명, 직원명 등)
 */
async function logChange(entityType, entityId, actionType, changes, note) {
  try {
    const rows = changes.map(c => ({
      entity_type: entityType,
      entity_id:   String(entityId),
      action_type: actionType,
      field_name:  c.field,
      old_value:   c.oldVal != null ? String(c.oldVal) : null,
      new_value:   c.newVal != null ? String(c.newVal) : null,
      changed_by:  currentWorker?.id || null,
      note:        note || null,
    }));

    if (rows.length > 0) {
      await sb.from('change_logs').insert(rows);
    }
  } catch (e) {
    console.error('logChange error:', e);
  }
}

// ════════════════════════════════════════════════════
// 사무실 비밀번호 열람 (보안 강화: 별도 조회 + 로그)
// ════════════════════════════════════════════════════

/**
 * 사무실 비밀번호를 DB에서 별도 조회하고 열람 로그를 남긴 후 표시
 * 초기 로드 시 office_password를 가져오지 않고, 열람 시에만 가져옴
 *
 * @param {string} companyId - 업체 ID
 * @param {string} noteId - company_notes 레코드 ID
 */
async function viewOfficePassword(companyId, noteId) {
  const container = document.getElementById('pwBox_' + companyId);
  if (!container) return;

  // 이미 표시 중이면 토글 (숨기기)
  if (container.dataset.revealed === 'true') {
    container.innerHTML = `<button class="btn-pw-view" onclick="viewOfficePassword('${escapeHtml(companyId)}', '${escapeHtml(noteId)}')">🔑 비밀번호 보기</button>`;
    container.dataset.revealed = 'false';
    return;
  }

  container.innerHTML = '<span class="text-muted">조회 중...</span>';

  try {
    // DB에서 office_password만 별도 조회
    const { data, error } = await sb.from('company_notes')
      .select('office_password')
      .eq('id', noteId)
      .single();

    if (error || !data || !data.office_password) {
      container.innerHTML = '<span class="text-muted">비밀번호 없음</span>';
      return;
    }

    // 열람 로그 기록
    const workerName = typeof currentWorker !== 'undefined' ? currentWorker.name : 'unknown';
    const companyName = typeof getCompanyName === 'function' ? getCompanyName(companyId)
                      : (typeof getCompanyById === 'function' ? getCompanyById(companyId)?.name : companyId);

    await logChange('company_notes', noteId, 'view_password', [
      { field: 'office_password', oldVal: null, newVal: '열람' }
    ], `${workerName} → ${companyName}`);

    // 비밀번호 표시 (HTML 이스케이프 적용)
    const escaped = escapeHtml(data.office_password);
    container.innerHTML = `
      <div class="pw-revealed" onclick="viewOfficePassword('${escapeHtml(companyId)}', '${escapeHtml(noteId)}')">
        <span class="pw-text-visible">${escaped}</span>
        <span class="pw-tap-hint">탭하여 숨기기</span>
      </div>
    `;
    container.dataset.revealed = 'true';
  } catch (e) {
    console.error('viewOfficePassword error:', e);
    container.innerHTML = '<span class="text-muted">조회 실패</span>';
  }
}



// ════════════════════════════════════════════════════
// 레이아웃 헬퍼: PC/모바일 조건부 렌더링 (공통)
// ════════════════════════════════════════════════════

/** 현재 뷰포트가 모바일인지 판별 (768px 기준) */
function isMobileView() {
  return window.innerWidth < 768;
}

/**
 * PC 테이블과 모바일 카드 중 현재 뷰포트에 맞는 것만 렌더링
 * @param {string} pcHTML - PC용 테이블 HTML
 * @param {string} mobileHTML - 모바일용 카드 HTML
 * @returns {string} 현재 뷰포트에 맞는 HTML
 */
function dualLayout(pcHTML, mobileHTML) {
  return isMobileView() ? mobileHTML : pcHTML;
}

// 뷰포트 breakpoint(768px) 교차 시 현재 탭 재렌더
let _lastMobileState = typeof window !== 'undefined' && window.innerWidth < 768;
window.addEventListener('resize', function() {
  var nowMobile = window.innerWidth < 768;
  if (nowMobile !== _lastMobileState) {
    _lastMobileState = nowMobile;
    if (typeof currentTab !== 'undefined' && typeof switchTab === 'function') {
      var tabEl = document.querySelector('.tab.active');
      if (tabEl) switchTab(currentTab, tabEl);
    }
  }
});

/**
 * HTML 이스케이프 (XSS 방지)
 */
// ════════════════════════════════════════════════════
// 전역 비동기 에러 핸들러 (안전망)
// ════════════════════════════════════════════════════
/**
 * 모든 미처리 Promise rejection을 잡아서 에러 토스트를 표시
 * 개별 try/catch가 없는 async 함수에서 발생한 에러도 처리
 */
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled async error:', event.reason);
  if (typeof toast === 'function') {
    toast('오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
  }
  event.preventDefault();
});

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

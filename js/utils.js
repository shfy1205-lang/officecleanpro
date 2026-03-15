/**
 * utils.js - 공통 유틸리티 함수
 * admin.js와 staff.js에서 중복되던 함수들을 통합
 */

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
}

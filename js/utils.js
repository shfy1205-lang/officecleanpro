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

/**
 * admin-billing-alert.js - 미입금 / 미발행 경고
 * billing_records 기반 세금계산서·입금 상태 모니터링
 */

/* ─── 설정값 ─── */
const BILLING_CHECK_START_MONTH = '2026-03';

/* ─── 경고 탭 상태 ─── */
let alertMonth = '';        // '' = 전체
let alertStatusFilter = ''; // '' | 'unissued' | 'unpaid' | 'partial' | 'overdue' | 'done'
let alertCompanySearch = '';
let alertCache = [];        // 가공된 경고 목록 캐시

/* ─── 상태 판정 ─── */
function getAlertStatus(b) {
  const issued  = !!b.billed_at;
  const paid    = !!b.paid_at;
  const billedAmt = b.billed_amount || 0;
  const paidAmt   = b.paid_amount || 0;

  // 완료: 발행 + 입금 완료 + 전액 입금
  if (issued && paid && paidAmt >= billedAmt) return 'done';

  // 부분입금: 입금됐지만 금액이 부족
  if (paid && paidAmt > 0 && paidAmt < billedAmt) return 'partial';

  // 장기미수: 대상월 말일로부터 30일 이상 경과 + 미입금
  if (!paid) {
    const monthEnd = new Date(b.month + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0); // 해당 월 말일
    const daysSince = (new Date() - monthEnd) / (1000 * 60 * 60 * 24);
    if (daysSince >= 30) return 'overdue';
  }

  // 미발행: 세금계산서 미발행
  if (!issued) return 'unissued';

  // 미입금: 발행했지만 미입금
  if (issued && !paid) return 'unpaid';

  return 'done';
}

const ALERT_STATUS_MAP = {
  unissued: { label: '미발행', badge: 'badge-today', color: 'var(--yellow)' },
  unpaid:   { label: '미입금', badge: 'badge-warn',  color: 'var(--red)' },
  partial:  { label: '부분입금', badge: 'badge-area', color: 'var(--accent2)' },
  overdue:  { label: '장기미수', badge: 'badge-warn',  color: 'var(--orange)' },
  done:     { label: '완료',   badge: 'badge-done',  color: 'var(--green)' },
};

/* ─── 데이터 가공 ─── */
function buildAlertData() {
  // BILLING_CHECK_START_MONTH 이후 데이터만 필터
  const records = adminData.billings.filter(b => b.month >= BILLING_CHECK_START_MONTH);

  alertCache = records.map(b => {
    const status = getAlertStatus(b);
    const billedAmt = b.billed_amount || 0;
    const paidAmt   = b.paid_amount || 0;
    const outstanding = Math.max(billedAmt - paidAmt, 0);

    return {
      id: b.id,
      companyId: b.company_id,
      companyName: getCompanyName(b.company_id),
      month: b.month,
      billedAmount: billedAmt,
      paidAmount: paidAmt,
      outstanding: outstanding,
      billedAt: b.billed_at || null,
      paidAt: b.paid_at || null,
      alertStatus: status,
      memo: b.memo || '',
    };
  });

  // 정렬: 미발행/장기미수 우선, 그 다음 월 역순
  const order = { overdue: 0, unissued: 1, unpaid: 2, partial: 3, done: 4 };
  alertCache.sort((a, b) => {
    const diff = (order[a.alertStatus] ?? 9) - (order[b.alertStatus] ?? 9);
    if (diff !== 0) return diff;
    return b.month.localeCompare(a.month);
  });
}

/* ─── 필터 적용 ─── */
function getFilteredAlerts() {
  let list = alertCache;

  if (alertMonth) {
    list = list.filter(d => d.month === alertMonth);
  }

  if (alertStatusFilter) {
    list = list.filter(d => d.alertStatus === alertStatusFilter);
  }

  if (alertCompanySearch) {
    const q = alertCompanySearch.toLowerCase();
    list = list.filter(d => d.companyName.toLowerCase().includes(q));
  }

  return list;
}

/* ─── 요약 통계 (필터 무시, 전체 기준) ─── */
function getAlertSummary() {
  const all = alertCache;
  const unissued = all.filter(d => d.alertStatus === 'unissued').length;
  const unpaid = all.filter(d => d.alertStatus === 'unpaid' || d.alertStatus === 'partial').length;
  const totalOutstanding = all.filter(d => d.alertStatus !== 'done')
    .reduce((s, d) => s + d.outstanding, 0);
  const overdue = all.filter(d => d.alertStatus === 'overdue').length;

  return { unissued, unpaid, totalOutstanding, overdue };
}

/* ─── 메인 렌더 ─── */
function renderBillingAlert() {
  buildAlertData();
  renderBillingAlertHTML();
}

function renderBillingAlertHTML() {
  const mc = $('mainContent');
  const summary = getAlertSummary();
  const filtered = getFilteredAlerts();

  // 대상월 옵션 생성
  const months = [...new Set(alertCache.map(d => d.month))].sort().reverse();

  mc.innerHTML = `
    <div class="section-title">미입금 / 미발행 경고</div>

    <!-- 요약 카드 4개 -->
    <div class="stats-grid-4 ba-cards">
      <div class="stat-card ba-stat${alertStatusFilter === 'unissued' ? ' active' : ''}"
           onclick="filterAlertByCard('unissued')">
        <div class="stat-label">미발행 세금계산서</div>
        <div class="stat-value yellow">${summary.unissued}<span class="ba-unit">건</span></div>
      </div>
      <div class="stat-card ba-stat${alertStatusFilter === 'unpaid' ? ' active' : ''}"
           onclick="filterAlertByCard('unpaid')">
        <div class="stat-label">미입금 업체</div>
        <div class="stat-value red">${summary.unpaid}<span class="ba-unit">건</span></div>
      </div>
      <div class="stat-card ba-stat" style="cursor:default">
        <div class="stat-label">미수금 합계</div>
        <div class="stat-value red">${fmt(summary.totalOutstanding)}<span class="ba-unit">원</span></div>
      </div>
      <div class="stat-card ba-stat${alertStatusFilter === 'overdue' ? ' active' : ''}"
           onclick="filterAlertByCard('overdue')">
        <div class="stat-label">30일+ 장기미수</div>
        <div class="stat-value orange">${summary.overdue}<span class="ba-unit">건</span></div>
      </div>
    </div>

    <!-- 필터 영역 -->
    <div class="ba-filter-bar">
      <select class="ba-filter-select" onchange="changeAlertMonth(this.value)">
        <option value="">전체 월</option>
        ${months.map(m => `<option value="${m}"${m === alertMonth ? ' selected' : ''}>${m.split('-')[1]}월 (${m})</option>`).join('')}
      </select>
      <select class="ba-filter-select" onchange="changeAlertStatus(this.value)">
        <option value="">전체 상태</option>
        <option value="unissued"${alertStatusFilter === 'unissued' ? ' selected' : ''}>미발행</option>
        <option value="unpaid"${alertStatusFilter === 'unpaid' ? ' selected' : ''}>미입금</option>
        <option value="partial"${alertStatusFilter === 'partial' ? ' selected' : ''}>부분입금</option>
        <option value="overdue"${alertStatusFilter === 'overdue' ? ' selected' : ''}>장기미수</option>
        <option value="done"${alertStatusFilter === 'done' ? ' selected' : ''}>완료</option>
      </select>
      <div class="ba-search-wrap">
        <input class="ba-search-input" type="text" placeholder="업체명 검색"
               value="${alertCompanySearch}"
               oninput="changeAlertSearch(this.value)">
      </div>
    </div>

    <!-- 검색 결과 건수 -->
    <div class="ba-result-count">${filtered.length}건 ${alertMonth || alertStatusFilter || alertCompanySearch ? '(필터 적용됨)' : ''}</div>

    ${filtered.length > 0 ? `
      <!-- PC 테이블 -->
      <div class="ba-table-pc">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>업체명</th>
                <th>대상월</th>
                <th>청구금액</th>
                <th>발행여부</th>
                <th>입금여부</th>
                <th>입금일</th>
                <th>미수금</th>
                <th>상태</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(d => {
                const st = ALERT_STATUS_MAP[d.alertStatus];
                return `<tr class="ba-row">
                  <td style="font-weight:600">${d.companyName}</td>
                  <td>${d.month}</td>
                  <td>${fmt(d.billedAmount)}원</td>
                  <td>${d.billedAt
                    ? '<span class="badge badge-done">발행</span>'
                    : '<span class="badge badge-today">미발행</span>'
                  }</td>
                  <td>${d.paidAt
                    ? (d.paidAmount < d.billedAmount
                        ? '<span class="badge badge-area">부분</span>'
                        : '<span class="badge badge-done">입금</span>')
                    : '<span class="badge badge-warn">미입금</span>'
                  }</td>
                  <td>${d.paidAt || '-'}</td>
                  <td style="color:${d.outstanding > 0 ? 'var(--red)' : 'var(--text2)'};font-weight:${d.outstanding > 0 ? '600' : '400'}">
                    ${d.outstanding > 0 ? fmt(d.outstanding) + '원' : '-'}
                  </td>
                  <td><span class="badge ${st.badge}">${st.label}</span></td>
                  <td>
                    <button class="btn-sm btn-blue" style="font-size:11px;padding:4px 10px"
                            onclick="openBillingDetail('${d.id}')">상세</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 모바일 카드 -->
      <div class="ba-cards-mobile">
        ${filtered.map(d => {
          const st = ALERT_STATUS_MAP[d.alertStatus];
          return `<div class="card ba-card" onclick="openBillingDetail('${d.id}')">
            <div class="ba-card-header">
              <div>
                <div class="ba-card-name">${d.companyName}</div>
                <div class="ba-card-month">${d.month}</div>
              </div>
              <span class="badge ${st.badge}">${st.label}</span>
            </div>
            <div class="ba-card-body">
              <div class="ba-card-row">
                <span class="ba-card-label">청구</span>
                <span>${fmt(d.billedAmount)}원</span>
              </div>
              <div class="ba-card-row">
                <span class="ba-card-label">발행</span>
                <span>${d.billedAt ? '✅ ' + d.billedAt : '❌ 미발행'}</span>
              </div>
              <div class="ba-card-row">
                <span class="ba-card-label">입금</span>
                <span>${d.paidAt ? '✅ ' + d.paidAt : '❌ 미입금'}</span>
              </div>
              ${d.outstanding > 0 ? `
              <div class="ba-card-row ba-card-outstanding">
                <span class="ba-card-label">미수금</span>
                <span style="color:var(--red);font-weight:700">${fmt(d.outstanding)}원</span>
              </div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>${alertMonth || alertStatusFilter || alertCompanySearch
          ? '해당 조건의 경고가 없습니다'
          : '경고 대상 데이터가 없습니다'}</p>
      </div>
    `}
  `;
}

/* ─── 필터 핸들러 ─── */
function filterAlertByCard(status) {
  alertStatusFilter = (alertStatusFilter === status) ? '' : status;
  renderBillingAlertHTML();
}

function changeAlertMonth(month) {
  alertMonth = month;
  renderBillingAlertHTML();
}

function changeAlertStatus(status) {
  alertStatusFilter = status;
  renderBillingAlertHTML();
}

function changeAlertSearch(query) {
  alertCompanySearch = query.trim();
  renderBillingAlertHTML();
}

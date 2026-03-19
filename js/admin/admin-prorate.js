/**
 * admin-prorate.js - 일할계산 탭
 * 작업자 결근/빠진 날 기준으로 급여를 일할 재산정
 * ※ 읽기 전용 계산기 — 다른 탭 데이터에 영향 없음
 */

let prorateMonth = '';
let prorateWorkerId = '';
let prorateAbsences = {}; // { assignId: absenceDays }

function renderProrate() {
  const mc = $('mainContent');
  if (!prorateMonth) prorateMonth = selectedMonth || currentMonth();

  const workers = getActiveWorkers();
  const month = prorateMonth;
  const yr = parseInt(month.split('-')[0]);
  const mo = parseInt(month.split('-')[1]);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  // 선택된 직원의 배정 데이터
  let assignData = [];
  let workerName = '직원을 선택하세요';
  let totalOriginal = 0, totalProrated = 0;

  if (prorateWorkerId) {
    const assigns = adminData.assignments.filter(
      a => a.worker_id === prorateWorkerId && a.month === month
    );
    workerName = getWorkerName(prorateWorkerId);

    assignData = assigns.map(a => {
      const company = adminData.companies.find(c => c.id === a.company_id);
      const companyName = company ? company.name : '알 수 없음';
      const originalPay = a.pay_amount || 0;

      // 해당 업체의 월 근무일수 계산 (스케줄 기반)
      const scheds = getCompanySchedules(a.company_id);
      let workDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayOfWeek = new Date(yr, mo - 1, d).getDay();
        const hasSchedule = scheds.some(s => {
          if (s.weekday !== dayOfWeek) return false;
          if ((s.frequency || 'weekly') === 'biweekly') {
            return isBiweeklyMatch(s.anchor_date, dateStr);
          }
          return true;
        });
        if (hasSchedule) workDays++;
      }

      const absenceDays = prorateAbsences[a.id] || 0;
      const actualDays = Math.max(0, workDays - absenceDays);
      const proratedPay = workDays > 0 ? Math.round(originalPay * actualDays / workDays) : 0;

      totalOriginal += originalPay;
      totalProrated += proratedPay;

      return {
        assignId: a.id,
        companyId: a.company_id,
        companyName,
        originalPay,
        workDays,
        absenceDays,
        actualDays,
        proratedPay,
      };
    });
  }

  const deduction = Math.round(totalProrated * 0.033);
  const netPay = totalProrated - deduction;
  const origDeduction = Math.round(totalOriginal * 0.033);
  const origNet = totalOriginal - origDeduction;
  const diff = netPay - origNet;

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      일할계산
      <span class="badge badge-area" style="font-size:11px">계산 전용 (저장 안 됨)</span>
    </div>

    <p class="text-muted" style="margin-bottom:12px;font-size:12px">
      작업자가 빠진 날을 입력하면 급여를 일할 재산정합니다. 이 탭의 계산은 다른 탭에 영향을 주지 않습니다.
    </p>

    <!-- 필터 -->
    <div class="admin-filter-bar" style="margin-bottom:16px">
      ${monthSelectorHTML(prorateMonth, 'changeProrateMonth')}
      <select class="admin-area-select" style="min-width:140px" onchange="prorateWorkerId=this.value;prorateAbsences={};renderProrate()">
        <option value="">직원 선택</option>
        ${workers.map(w => `<option value="${w.id}"${w.id === prorateWorkerId ? ' selected' : ''}>${w.name}</option>`).join('')}
      </select>
    </div>

    ${prorateWorkerId ? `
    <!-- 요약 카드 -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">원래 지급액</div>
        <div class="stat-value">${fmt(totalOriginal)}</div>
        <div style="font-size:11px;color:var(--text2)">공제 후 ${fmt(origNet)}원</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">일할 계산 후</div>
        <div class="stat-value" style="color:var(--primary)">${fmt(totalProrated)}</div>
        <div style="font-size:11px;color:var(--text2)">공제 후 ${fmt(netPay)}원</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">차액</div>
        <div class="stat-value" style="color:${diff < 0 ? 'var(--red)' : 'var(--green)'}">${diff < 0 ? '' : '+'}${fmt(diff)}</div>
        <div style="font-size:11px;color:var(--text2)">3.3% 공제 포함</div>
      </div>
    </div>

    <!-- 업체별 상세 -->
    ${assignData.length > 0 ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>업체명</th>
            <th style="text-align:center">월 근무일</th>
            <th style="text-align:center">빠진 날</th>
            <th style="text-align:center">실 근무일</th>
            <th style="text-align:right">원래 금액</th>
            <th style="text-align:right">일할 금액</th>
          </tr>
        </thead>
        <tbody>
          ${assignData.map(d => `
          <tr>
            <td style="font-weight:600">${d.companyName}</td>
            <td style="text-align:center">${d.workDays}일</td>
            <td style="text-align:center">
              <input type="number" min="0" max="${d.workDays}" value="${d.absenceDays}"
                     style="width:50px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1);font-size:13px"
                     onchange="prorateAbsences['${d.assignId}']=parseInt(this.value)||0;renderProrate()">
            </td>
            <td style="text-align:center;font-weight:600;color:${d.actualDays < d.workDays ? 'var(--orange)' : 'var(--text1)'}">${d.actualDays}일</td>
            <td style="text-align:right">${fmt(d.originalPay)}원</td>
            <td style="text-align:right;font-weight:700;color:${d.proratedPay < d.originalPay ? 'var(--orange)' : 'var(--primary)'}">${fmt(d.proratedPay)}원</td>
          </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;background:rgba(255,255,255,0.03)">
            <td colspan="4" style="text-align:right">합계</td>
            <td style="text-align:right">${fmt(totalOriginal)}원</td>
            <td style="text-align:right;color:var(--primary)">${fmt(totalProrated)}원</td>
          </tr>
          <tr style="font-size:12px;color:var(--text2)">
            <td colspan="4" style="text-align:right">3.3% 공제</td>
            <td style="text-align:right">-${fmt(origDeduction)}원</td>
            <td style="text-align:right">-${fmt(deduction)}원</td>
          </tr>
          <tr style="font-weight:700;font-size:14px">
            <td colspan="4" style="text-align:right">실지급액</td>
            <td style="text-align:right">${fmt(origNet)}원</td>
            <td style="text-align:right;color:var(--green)">${fmt(netPay)}원</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p style="font-size:11px;color:var(--text2);margin-top:12px;text-align:center">
      * 월 근무일은 해당 업체의 청소 스케줄(요일/빈도) 기준으로 자동 계산됩니다.<br>
      * 일할 금액 = 원래 금액 ÷ 월 근무일 × 실 근무일 (반올림)
    </p>
    ` : '<div class="empty-state"><div class="empty-icon">📋</div><p>배정된 업체가 없습니다</p></div>'}
    ` : `
    <div class="empty-state">
      <div class="empty-icon">🧮</div>
      <p>직원을 선택하면 일할계산을 시작할 수 있습니다</p>
    </div>
    `}
  `;
}

function changeProrateMonth(month) {
  prorateMonth = month;
  prorateAbsences = {};
  renderProrate();
}

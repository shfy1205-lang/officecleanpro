/**
 * export.js - 데이터 내보내기 (CSV / 클립보드 / Excel)
 *
 * 역할:
 * - 테이블 데이터 → CSV 다운로드
 * - 테이블 데이터 → 클립보드 복사
 * - 테이블 데이터 → Excel(.xlsx) 다운로드 (SheetJS)
 * - admin.html에서 사용 (급여 내역, 업체 목록 등)
 *
 * 엑셀 다운로드 대상 (8종):
 * 1. 업체 목록 (exportCompanies)
 * 2. 직원 목록 (exportWorkers)
 * 3. 직원 급여 (exportStaffPay)
 * 4. 요청사항 (exportRequests)
 * 5. 견적 목록 (exportLeads)
 * 6. 세금계산서 / 입금 현황 (exportBilling)
 * 7. 청소 완료 기록 (exportTasks)
 * 8. 수익 구조 (exportRevenue)
 */

// ─── CSV 유틸 (기존) ───

/**
 * 2차원 배열 → CSV 문자열
 * @param {string[]} headers - 헤더 배열
 * @param {any[][]} rows - 데이터 2차원 배열
 * @returns {string} CSV 문자열
 */
function toCSV(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return '\uFEFF' + lines.join('\n'); // BOM for Excel 한글
}

/**
 * CSV 파일 다운로드
 * @param {string} filename - 파일명 (확장자 포함)
 * @param {string[]} headers
 * @param {any[][]} rows
 */
function downloadCSV(filename, headers, rows) {
  const csv = toCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${filename} 다운로드 완료`);
}

/**
 * 테이블 데이터 클립보드 복사 (탭 구분)
 * @param {string[]} headers
 * @param {any[][]} rows
 */
async function copyToClipboard(headers, rows) {
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(row.map(v => String(v ?? '')).join('\t'));
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('클립보드에 복사됨');
  } catch {
    toast('복사 실패', 'error');
  }
}


// ─── Excel 다운로드 공통 유틸 ───

/**
 * SheetJS를 이용한 엑셀 다운로드
 * @param {string} filename - 파일명 (확장자 포함)
 * @param {string} sheetName - 시트 이름
 * @param {string[]} headers - 한글 헤더 배열
 * @param {any[][]} rows - 데이터 2차원 배열
 * @param {number[]} [colWidths] - 컬럼 너비 배열 (wch 단위)
 */
function downloadExcel(filename, sheetName, headers, rows, colWidths) {
  if (typeof XLSX === 'undefined') {
    toast('엑셀 라이브러리를 불러오지 못했습니다', 'error');
    return;
  }

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // 컬럼 너비 설정
  if (colWidths && colWidths.length > 0) {
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  } else {
    // 자동 너비 추정
    ws['!cols'] = headers.map((h, i) => {
      let maxLen = h.length;
      rows.forEach(row => {
        const cellLen = String(row[i] ?? '').length;
        if (cellLen > maxLen) maxLen = cellLen;
      });
      return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  toast(`${filename} 다운로드 완료`);
}

/**
 * 멀티 시트 엑셀 다운로드
 * @param {string} filename
 * @param {Array<{name: string, headers: string[], rows: any[][], colWidths?: number[]}>} sheets
 */
function downloadExcelMultiSheet(filename, sheets) {
  if (typeof XLSX === 'undefined') {
    toast('엑셀 라이브러리를 불러오지 못했습니다', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    const data = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    if (sheet.colWidths && sheet.colWidths.length > 0) {
      ws['!cols'] = sheet.colWidths.map(w => ({ wch: w }));
    } else {
      ws['!cols'] = sheet.headers.map((h, i) => {
        let maxLen = h.length;
        sheet.rows.forEach(row => {
          const cellLen = String(row[i] ?? '').length;
          if (cellLen > maxLen) maxLen = cellLen;
        });
        return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
      });
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });

  XLSX.writeFile(wb, filename);
  toast(`${filename} 다운로드 완료`);
}


// ─── 1. 업체 목록 다운로드 ───

function exportCompanies() {
  const headers = [
    '업체명', '상태', '구역코드', '구역명', '주소',
    '담당자명', '담당자 연락처', '청소요일', '배정직원', '메모'
  ];

  const statusMap = { active: '활성', paused: '중지', terminated: '해지' };

  const rows = adminData.companies.map(c => {
    const scheds = adminData.schedules
      .filter(s => s.company_id === c.id && s.is_active)
      .sort((a, b) => a.weekday - b.weekday)
      .map(s => WEEKDAY_NAMES[s.weekday])
      .join(', ');

    const workers = adminData.assignments
      .filter(a => a.company_id === c.id && a.month === selectedMonth)
      .map(a => getWorkerName(a.worker_id))
      .join(', ');

    return [
      c.name,
      statusMap[c.status] || c.status,
      c.area_code || '',
      c.area_name || '',
      c.location || '',
      c.contact_name || '',
      c.contact_phone || '',
      scheds || '-',
      workers || '미배정',
      c.memo || '',
    ];
  });

  downloadExcel(
    `업체목록_${today()}.xlsx`,
    '업체목록',
    headers,
    rows,
    [16, 6, 10, 16, 24, 10, 14, 12, 16, 20]
  );
}


// ─── 2. 직원 목록 다운로드 ───

function exportWorkers() {
  const headers = [
    '이름', '역할', '상태', '연락처', '은행명',
    '계좌번호', '담당 업체수', '메모'
  ];

  const roleMap = { admin: '관리자', staff: '직원' };
  const statusMap = { active: '활성', inactive: '비활성' };

  const rows = adminData.workers.map(w => {
    const companyCount = adminData.assignments
      .filter(a => a.worker_id === w.id && a.month === selectedMonth)
      .length;

    return [
      w.name,
      roleMap[w.role] || w.role,
      statusMap[w.status] || w.status,
      w.phone || '',
      w.bank_name || '',
      w.bank_account || '',
      companyCount,
      w.memo || '',
    ];
  });

  downloadExcel(
    `직원목록_${today()}.xlsx`,
    '직원목록',
    headers,
    rows,
    [10, 8, 8, 14, 10, 16, 10, 20]
  );
}


// ─── 3. 직원 급여 다운로드 ───

function exportStaffPay() {
  const month = selectedMonth;
  const monthAssigns = adminData.assignments.filter(a => a.month === month);
  const finMap = buildFinMap(adminData.financials, month);

  const headers = [
    '직원명', '업체명', '구역명', '지급액(원)', '월'
  ];

  const rows = monthAssigns.map(a => {
    const comp = adminData.companies.find(c => c.id === a.company_id);
    return [
      getWorkerName(a.worker_id),
      comp?.name || '-',
      comp?.area_name || '',
      calcAssignmentFinalPay(a, finMap),
      month,
    ];
  });

  // 합계 행 추가
  const totalPay = rows.reduce((s, r) => s + (r[3] || 0), 0);
  rows.push(['합계', '', '', totalPay, month]);

  downloadExcel(
    `직원급여_${month}.xlsx`,
    '직원급여',
    headers,
    rows,
    [10, 16, 16, 14, 10]
  );
}


// ─── 4. 요청사항 다운로드 ───

function exportRequests() {
  const headers = [
    '업체명', '요청자', '내용', '상태', '요청일', '만료일'
  ];

  const rows = adminData.requests.map(r => {
    const status = r.is_resolved
      ? '처리완료'
      : isExpired(r.expires_at)
        ? '만료'
        : '대기중';

    return [
      getCompanyName(r.company_id),
      getWorkerName(r.created_by),
      r.content || '',
      status,
      formatDateShort(r.created_at),
      formatDateShort(r.expires_at),
    ];
  });

  downloadExcel(
    `요청사항_${today()}.xlsx`,
    '요청사항',
    headers,
    rows,
    [16, 10, 40, 10, 12, 12]
  );
}


// ─── 5. 견적 목록 다운로드 ───

function exportLeads() {
  const headers = [
    '업체명', '담당자명', '연락처', '위치',
    '견적금액(원)', '상태', '담당직원', '메모', '등록일'
  ];

  const rows = adminData.leads.map(l => {
    const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
    return [
      l.company_name,
      l.contact_name || '',
      l.contact_phone || '',
      l.location || '',
      l.estimated_amount || 0,
      st.label,
      l.assigned_to ? getWorkerName(l.assigned_to) : '미지정',
      l.notes || '',
      formatDateShort(l.created_at),
    ];
  });

  downloadExcel(
    `견적목록_${today()}.xlsx`,
    '견적목록',
    headers,
    rows,
    [16, 10, 14, 20, 14, 10, 10, 24, 12]
  );
}


// ─── 6. 세금계산서 / 입금 현황 다운로드 ───

function exportBilling() {
  const headers = [
    '업체명', '월', '청구금액(원)', '입금금액(원)', '미수금(원)',
    '상태', '발행일', '입금일', '메모'
  ];

  const rows = adminData.billings.map(b => {
    const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
    const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);

    return [
      getCompanyName(b.company_id),
      b.month,
      b.billed_amount || 0,
      b.paid_amount || 0,
      unpaid > 0 ? unpaid : 0,
      bst.label,
      b.billed_at || '-',
      b.paid_at || '-',
      b.memo || '',
    ];
  });

  // 합계 행
  const totalBilled = rows.reduce((s, r) => s + (r[2] || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r[3] || 0), 0);
  const totalUnpaid = rows.reduce((s, r) => s + (r[4] || 0), 0);
  rows.push(['합계', '', totalBilled, totalPaid, totalUnpaid, '', '', '', '']);

  downloadExcel(
    `정산현황_${today()}.xlsx`,
    '정산현황',
    headers,
    rows,
    [16, 10, 14, 14, 14, 10, 12, 12, 20]
  );
}


// ─── 7. 청소 완료 기록 다운로드 ───

async function exportTasks() {
  // tasks 테이블은 loadAdminData에서 안 가져오므로 직접 조회
  toast('청소 기록을 불러오는 중...');

  const { data: tasks, error } = await sb
    .from('tasks')
    .select('*')
    .order('task_date', { ascending: false })
    .limit(5000);

  if (error) {
    toast(error.message, 'error');
    return;
  }

  if (!tasks || tasks.length === 0) {
    toast('청소 완료 기록이 없습니다', 'error');
    return;
  }

  const headers = [
    '업체명', '구역명', '담당자', '청소일자', '상태', '메모'
  ];

  const statusMap = {
    scheduled: '예정',
    completed: '완료',
    cancelled: '취소',
  };

  const rows = tasks.map(t => {
    const comp = adminData.companies.find(c => c.id === t.company_id);
    return [
      comp?.name || '알 수 없음',
      comp?.area_name || '',
      getWorkerName(t.worker_id),
      t.task_date,
      statusMap[t.status] || t.status,
      t.memo || '',
    ];
  });

  downloadExcel(
    `청소완료기록_${today()}.xlsx`,
    '청소완료기록',
    headers,
    rows,
    [16, 16, 10, 12, 8, 24]
  );
}


// ─── 8. 수익 구조 다운로드 ───

function exportRevenue() {
  const month = revenueMonth;
  const activeCompanies = adminData.companies.filter(c => c.status === 'active');

  const finMap = {};
  adminData.financials
    .filter(f => f.month === month)
    .forEach(f => { finMap[f.company_id] = f; });

  const headers = [
    '업체명', '구역명', '계약금액(원)', 'OCP수수료 방식', 'OCP수수료(원)',
    '에코수수료 방식', '에코수수료(원)', '인건비(원)', '순수익(원)', '월'
  ];

  const feeTypeLabel = { none: '없음', fixed: '정액', percent: '정률(%)' };

  let totalContract = 0;
  let totalOcp = 0;
  let totalEco = 0;
  let totalWorkerPay = 0;
  let totalNet = 0;

  const rows = activeCompanies.map(c => {
    const fin = finMap[c.id];
    const meta = parseFeeMetadata(fin?.memo);
    const contract = fin?.contract_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const eco = fin?.eco_amount || 0;
    const workerPay = fin?.worker_pay_total || getWorkerPayTotal(c.id, month);
    const net = contract - ocp - eco - workerPay;

    totalContract += contract;
    totalOcp += ocp;
    totalEco += eco;
    totalWorkerPay += workerPay;
    totalNet += net;

    const ocpTypeStr = meta.ocp_type
      ? (feeTypeLabel[meta.ocp_type] || meta.ocp_type) + (meta.ocp_rate ? ` ${meta.ocp_rate}%` : '')
      : '없음';
    const ecoTypeStr = meta.eco_type
      ? (feeTypeLabel[meta.eco_type] || meta.eco_type) + (meta.eco_rate ? ` ${meta.eco_rate}%` : '')
      : '없음';

    return [
      c.name,
      c.area_name || '',
      contract,
      ocpTypeStr,
      ocp,
      ecoTypeStr,
      eco,
      workerPay,
      net,
      month,
    ];
  });

  // 합계 행
  rows.push(['합계', '', totalContract, '', totalOcp, '', totalEco, totalWorkerPay, totalNet, month]);

  downloadExcel(
    `수익구조_${month}.xlsx`,
    '수익구조',
    headers,
    rows,
    [16, 16, 14, 14, 14, 14, 14, 14, 14, 10]
  );
}


// ─── 전체 데이터 일괄 다운로드 ───

async function exportAll() {
  toast('전체 데이터를 준비하는 중...');

  // tasks 조회
  const { data: tasks } = await sb
    .from('tasks')
    .select('*')
    .order('task_date', { ascending: false })
    .limit(5000);

  const statusMapCompany = { active: '활성', paused: '중지', terminated: '해지' };
  const roleMap = { admin: '관리자', staff: '직원' };
  const statusMapWorker = { active: '활성', inactive: '비활성' };
  const taskStatusMap = { scheduled: '예정', completed: '완료', cancelled: '취소' };

  const month = selectedMonth;

  const sheets = [];

  // 1. 업체 목록
  sheets.push({
    name: '업체목록',
    headers: ['업체명', '상태', '구역코드', '구역명', '주소', '담당자명', '담당자 연락처', '청소요일', '배정직원', '메모'],
    rows: adminData.companies.map(c => {
      const scheds = adminData.schedules
        .filter(s => s.company_id === c.id && s.is_active)
        .sort((a, b) => a.weekday - b.weekday)
        .map(s => WEEKDAY_NAMES[s.weekday]).join(', ');
      const workers = adminData.assignments
        .filter(a => a.company_id === c.id && a.month === month)
        .map(a => getWorkerName(a.worker_id)).join(', ');
      return [c.name, statusMapCompany[c.status] || c.status, c.area_code || '', c.area_name || '',
        c.location || '', c.contact_name || '', c.contact_phone || '', scheds || '-', workers || '미배정', c.memo || ''];
    }),
  });

  // 2. 직원 목록
  sheets.push({
    name: '직원목록',
    headers: ['이름', '역할', '상태', '연락처', '은행명', '계좌번호', '담당 업체수', '메모'],
    rows: adminData.workers.map(w => {
      const cnt = adminData.assignments.filter(a => a.worker_id === w.id && a.month === month).length;
      return [w.name, roleMap[w.role] || w.role, statusMapWorker[w.status] || w.status,
        w.phone || '', w.bank_name || '', w.bank_account || '', cnt, w.memo || ''];
    }),
  });

  // 3. 직원 급여 (공통 함수 사용으로 관리자 급여 화면과 동일 결과 보장)
  const monthAssigns = adminData.assignments.filter(a => a.month === month);
  const allFinMap = buildFinMap(adminData.financials, month);
  const payRows = monthAssigns.map(a => {
    const comp = adminData.companies.find(c => c.id === a.company_id);
    return [getWorkerName(a.worker_id), comp?.name || '-', comp?.area_name || '', calcAssignmentFinalPay(a, allFinMap), month];
  });
  const totalPay = payRows.reduce((s, r) => s + (r[3] || 0), 0);
  payRows.push(['합계', '', '', totalPay, month]);
  sheets.push({
    name: '직원급여',
    headers: ['직원명', '업체명', '구역명', '지급액(원)', '월'],
    rows: payRows,
  });

  // 4. 요청사항
  sheets.push({
    name: '요청사항',
    headers: ['업체명', '요청자', '내용', '상태', '요청일', '만료일'],
    rows: adminData.requests.map(r => {
      const status = r.is_resolved ? '처리완료' : isExpired(r.expires_at) ? '만료' : '대기중';
      return [getCompanyName(r.company_id), getWorkerName(r.created_by), r.content || '',
        status, formatDateShort(r.created_at), formatDateShort(r.expires_at)];
    }),
  });

  // 5. 견적 목록
  sheets.push({
    name: '견적목록',
    headers: ['업체명', '담당자명', '연락처', '위치', '견적금액(원)', '상태', '담당직원', '메모', '등록일'],
    rows: adminData.leads.map(l => {
      const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.new;
      return [l.company_name, l.contact_name || '', l.contact_phone || '', l.location || '',
        l.estimated_amount || 0, st.label, l.assigned_to ? getWorkerName(l.assigned_to) : '미지정',
        l.notes || '', formatDateShort(l.created_at)];
    }),
  });

  // 6. 정산 현황
  const billingRows = adminData.billings.map(b => {
    const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
    const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
    return [getCompanyName(b.company_id), b.month, b.billed_amount || 0, b.paid_amount || 0,
      unpaid > 0 ? unpaid : 0, bst.label, b.billed_at || '-', b.paid_at || '-', b.memo || ''];
  });
  const tBilled = billingRows.reduce((s, r) => s + (r[2] || 0), 0);
  const tPaid = billingRows.reduce((s, r) => s + (r[3] || 0), 0);
  const tUnpaid = billingRows.reduce((s, r) => s + (r[4] || 0), 0);
  billingRows.push(['합계', '', tBilled, tPaid, tUnpaid, '', '', '', '']);
  sheets.push({
    name: '정산현황',
    headers: ['업체명', '월', '청구금액(원)', '입금금액(원)', '미수금(원)', '상태', '발행일', '입금일', '메모'],
    rows: billingRows,
  });

  // 7. 청소 완료 기록
  if (tasks && tasks.length > 0) {
    sheets.push({
      name: '청소완료기록',
      headers: ['업체명', '구역명', '담당자', '청소일자', '상태', '메모'],
      rows: tasks.map(t => {
        const comp = adminData.companies.find(c => c.id === t.company_id);
        return [comp?.name || '알 수 없음', comp?.area_name || '', getWorkerName(t.worker_id),
          t.task_date, taskStatusMap[t.status] || t.status, t.memo || ''];
      }),
    });
  }

  // 8. 수익 구조
  const revMonth = revenueMonth || month;
  const finMap = {};
  adminData.financials.filter(f => f.month === revMonth).forEach(f => { finMap[f.company_id] = f; });
  const feeTypeLabel = { none: '없음', fixed: '정액', percent: '정률(%)' };
  let rvTotalContract = 0, rvTotalOcp = 0, rvTotalEco = 0, rvTotalWorkerPay = 0, rvTotalNet = 0;
  const revRows = adminData.companies.filter(c => c.status === 'active').map(c => {
    const fin = finMap[c.id];
    const meta = parseFeeMetadata(fin?.memo);
    const contract = fin?.contract_amount || 0;
    const ocp = fin?.ocp_amount || 0;
    const eco = fin?.eco_amount || 0;
    const wp = fin?.worker_pay_total || getWorkerPayTotal(c.id, revMonth);
    const net = contract - ocp - eco - wp;
    rvTotalContract += contract; rvTotalOcp += ocp; rvTotalEco += eco; rvTotalWorkerPay += wp; rvTotalNet += net;
    const ocpStr = meta.ocp_type ? (feeTypeLabel[meta.ocp_type] || meta.ocp_type) + (meta.ocp_rate ? ` ${meta.ocp_rate}%` : '') : '없음';
    const ecoStr = meta.eco_type ? (feeTypeLabel[meta.eco_type] || meta.eco_type) + (meta.eco_rate ? ` ${meta.eco_rate}%` : '') : '없음';
    return [c.name, c.area_name || '', contract, ocpStr, ocp, ecoStr, eco, wp, net, revMonth];
  });
  revRows.push(['합계', '', rvTotalContract, '', rvTotalOcp, '', rvTotalEco, rvTotalWorkerPay, rvTotalNet, revMonth]);
  sheets.push({
    name: '수익구조',
    headers: ['업체명', '구역명', '계약금액(원)', 'OCP수수료 방식', 'OCP수수료(원)', '에코수수료 방식', '에코수수료(원)', '인건비(원)', '순수익(원)', '월'],
    rows: revRows,
  });

  downloadExcelMultiSheet(`오피스클린프로_전체데이터_${today()}.xlsx`, sheets);
}

/**
 * admin-contacts.js - 업체 연락처 + 월별 정산 체크 탭
 * 담당자 전화번호, 사업자등록번호, 세금계산서/입금 간편 체크
 */

let contactSearch = '';
let contactMonth = '';
let contactView = 'billing'; // 'info' | 'billing'

// ════════════════════════════════════════════════════
// 연락처 탭 렌더링
// ════════════════════════════════════════════════════

function renderContacts(listOnly) {
  const mc = $('mainContent');

  if (!contactMonth) contactMonth = currentMonth();

  let filtered = adminData.companies.filter(c => c.status === 'active');

  if (contactSearch) {
    const q = contactSearch.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.contact_name || '').toLowerCase().includes(q) ||
      (c.contact_phone || '').toLowerCase().includes(q) ||
      (c.business_number || '').toLowerCase().includes(q) ||
      (c.area_name || '').toLowerCase().includes(q)
    );
  }

  const listHTML = contactView === 'billing'
    ? renderBillingCheckList(filtered)
    : renderContactInfoList(filtered);

  if (listOnly) {
    const lc = document.getElementById('contactListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      업체 연락처
      <button class="btn-sm btn-blue" onclick="exportContacts()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>

    <div class="view-toggle" style="margin-bottom:12px">
      <button class="view-toggle-btn${contactView === 'billing' ? ' active' : ''}"
              onclick="contactView='billing';renderContacts()">세금계산서 / 입금</button>
      <button class="view-toggle-btn${contactView === 'info' ? ' active' : ''}"
              onclick="contactView='info';renderContacts()">연락처 정보</button>
    </div>

    <div class="search-box" style="margin-bottom:14px">
      <input id="contactSearchInput" placeholder="업체명, 담당자, 전화번호 검색" value="${contactSearch}">
    </div>

    <div id="contactListContainer">${listHTML}</div>
  `;

  bindSearchInput('contactSearchInput', (val) => {
    contactSearch = val;
    renderContacts(true);
  });
}


// ════════════════════════════════════════════════════
// 뷰 1: 세금계산서 / 입금 체크 (기본)
// ════════════════════════════════════════════════════

function renderBillingCheckList(filtered) {
  // 해당 월 billing 데이터 매핑
  const billingMap = {};
  adminData.billings.forEach(b => {
    if (b.month === contactMonth) billingMap[b.company_id] = b;
  });

  // 통계 (billed_at/paid_at 또는 status 기반)
  const total = filtered.length;
  const invoiced = filtered.filter(c => {
    const b = billingMap[c.id];
    return b && (b.billed_at || b.status === 'billed' || b.status === 'paid');
  }).length;
  const paid = filtered.filter(c => {
    const b = billingMap[c.id];
    return b && (b.paid_at || b.status === 'paid');
  }).length;

  return `
    ${monthSelectorHTML(contactMonth, 'changeContactMonth')}

    <div class="contact-stats">
      <div class="contact-stat-item">
        <span class="contact-stat-num">${total}</span>
        <span class="contact-stat-label">전체</span>
      </div>
      <div class="contact-stat-item">
        <span class="contact-stat-num" style="color:var(--yellow)">${invoiced}</span>
        <span class="contact-stat-label">계산서 발행</span>
      </div>
      <div class="contact-stat-item">
        <span class="contact-stat-num" style="color:var(--green)">${paid}</span>
        <span class="contact-stat-label">입금 완료</span>
      </div>
      <div class="contact-stat-item">
        <span class="contact-stat-num" style="color:var(--red)">${total - paid}</span>
        <span class="contact-stat-label">미입금</span>
      </div>
    </div>

    <!-- PC 테이블 -->
    <div class="table-wrap contact-pc-table">
      <table>
        <thead>
          <tr>
            <th style="width:20%">업체명</th>
            <th style="width:10%">구역</th>
            <th style="width:12%">담당자</th>
            <th style="width:13%">전화번호</th>
            <th style="width:12%">청구액</th>
            <th style="width:11%">계산서</th>
            <th style="width:11%">입금</th>
            <th style="width:11%">상태</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(c => {
            const b = billingMap[c.id];
            const hasInvoice = b ? (!!b.billed_at || b.status === 'billed' || b.status === 'paid') : false;
            const hasPaid = b ? (!!b.paid_at || b.status === 'paid') : false;
            const unpaid = b ? (b.billed_amount || 0) - (b.paid_amount || 0) : 0;
            const statusBadge = !b ? '<span class="badge badge-area">미등록</span>'
              : hasPaid ? '<span class="badge badge-done">완료</span>'
              : hasInvoice ? '<span class="badge badge-today">발행됨</span>'
              : '<span class="badge badge-warn">대기</span>';

            return `
              <tr>
                <td class="text-ellipsis" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.area_name || '-')}</td>
                <td>${escapeHtml(c.contact_name || '-')}</td>
                <td>${escapeHtml(c.contact_phone || '-')}</td>
                <td>${b ? fmt(b.billed_amount) + '원' : '-'}</td>
                <td>
                  <label class="billing-check">
                    <input type="checkbox" ${hasInvoice ? 'checked' : ''} ${!b ? 'disabled' : ''}
                           onchange="toggleInvoice('${c.id}', this.checked)">
                    <span class="billing-check-label">${hasInvoice ? (b.billed_at || '') : ''}</span>
                  </label>
                </td>
                <td>
                  <label class="billing-check">
                    <input type="checkbox" ${hasPaid ? 'checked' : ''} ${!b ? 'disabled' : ''}
                           onchange="togglePayment('${c.id}', this.checked)">
                    <span class="billing-check-label">${hasPaid ? (b.paid_at || '') : ''}</span>
                  </label>
                </td>
                <td>${statusBadge}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- 모바일 카드 -->
    <div class="contact-mobile-cards">
      ${filtered.map(c => {
        const b = billingMap[c.id];
        const hasInvoice = !!b?.billed_at;
        const hasPaid = !!b?.paid_at;
        const statusBadge = !b ? '<span class="badge badge-area">미등록</span>'
          : hasPaid ? '<span class="badge badge-done">완료</span>'
          : hasInvoice ? '<span class="badge badge-today">발행됨</span>'
          : '<span class="badge badge-warn">대기</span>';

        return `
          <div class="card contact-card">
            <div class="contact-card-header">
              <div>
                <strong>${escapeHtml(c.name)}</strong>
                <span class="text-muted" style="font-size:11px;margin-left:4px">${escapeHtml(c.contact_name || '')}</span>
              </div>
              ${statusBadge}
            </div>
            ${b ? `
              <div class="billing-card-amount">${fmt(b.billed_amount)}원</div>
              <div class="billing-card-checks">
                <label class="billing-check-card">
                  <input type="checkbox" ${hasInvoice ? 'checked' : ''}
                         onchange="toggleInvoice('${c.id}', this.checked)">
                  <span>계산서 ${hasInvoice ? '✓' : ''}</span>
                </label>
                <label class="billing-check-card">
                  <input type="checkbox" ${hasPaid ? 'checked' : ''}
                         onchange="togglePayment('${c.id}', this.checked)">
                  <span>입금 ${hasPaid ? '✓' : ''}</span>
                </label>
              </div>
            ` : '<p class="text-muted" style="font-size:12px">정산 미등록</p>'}
          </div>
        `;
      }).join('')}
    </div>
  `;
}


// ════════════════════════════════════════════════════
// 뷰 2: 연락처 정보
// ════════════════════════════════════════════════════

function renderContactInfoList(filtered) {
  const total = filtered.length;
  const hasPhone = filtered.filter(c => c.contact_phone && c.contact_phone.trim()).length;
  const hasBizNum = filtered.filter(c => c.business_number && c.business_number.trim()).length;

  return `
    <div class="contact-stats">
      <div class="contact-stat-item">
        <span class="contact-stat-num">${total}</span>
        <span class="contact-stat-label">전체 업체</span>
      </div>
      <div class="contact-stat-item">
        <span class="contact-stat-num">${hasPhone}</span>
        <span class="contact-stat-label">전화번호 등록</span>
      </div>
      <div class="contact-stat-item">
        <span class="contact-stat-num">${hasBizNum}</span>
        <span class="contact-stat-label">사업자번호 등록</span>
      </div>
    </div>

    <!-- PC 테이블 -->
    <div class="table-wrap contact-pc-table">
      <table>
        <thead>
          <tr>
            <th style="width:22%">업체명</th>
            <th style="width:12%">구역</th>
            <th style="width:12%">담당자명</th>
            <th style="width:18%">전화번호</th>
            <th style="width:22%">사업자등록번호</th>
            <th style="width:14%">저장</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(c => `
            <tr>
              <td class="text-ellipsis" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</td>
              <td>${escapeHtml(c.area_name || '-')}</td>
              <td>
                <input class="contact-inline-input" id="ct_name_${c.id}"
                       value="${escapeHtml(c.contact_name || '')}" placeholder="담당자명">
              </td>
              <td>
                <input class="contact-inline-input" id="ct_phone_${c.id}"
                       value="${escapeHtml(c.contact_phone || '')}" placeholder="010-0000-0000">
              </td>
              <td>
                <input class="contact-inline-input" id="ct_biz_${c.id}"
                       value="${escapeHtml(c.business_number || '')}" placeholder="000-00-00000">
              </td>
              <td>
                <button class="btn-sm btn-blue" style="font-size:11px;padding:4px 10px"
                        onclick="saveContact('${c.id}')">저장</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- 모바일 카드 -->
    <div class="contact-mobile-cards">
      ${filtered.map(c => `
        <div class="card contact-card">
          <div class="contact-card-header">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="badge badge-area">${escapeHtml(c.area_name || '-')}</span>
          </div>
          <div class="contact-card-fields">
            <div class="contact-field-row">
              <label>담당자</label>
              <input class="contact-inline-input" id="ct_name_m_${c.id}"
                     value="${escapeHtml(c.contact_name || '')}" placeholder="담당자명">
            </div>
            <div class="contact-field-row">
              <label>전화번호</label>
              <input class="contact-inline-input" id="ct_phone_m_${c.id}"
                     value="${escapeHtml(c.contact_phone || '')}" placeholder="010-0000-0000">
            </div>
            <div class="contact-field-row">
              <label>사업자번호</label>
              <input class="contact-inline-input" id="ct_biz_m_${c.id}"
                     value="${escapeHtml(c.business_number || '')}" placeholder="000-00-00000">
            </div>
          </div>
          <button class="btn-sm btn-blue" style="width:100%;margin-top:8px;font-size:12px"
                  onclick="saveContact('${c.id}', true)">저장</button>
        </div>
      `).join('')}
    </div>
  `;
}


// ════════════════════════════════════════════════════
// 월 변경
// ════════════════════════════════════════════════════

function changeContactMonth(month) {
  contactMonth = month;
  renderContacts();
}


// ════════════════════════════════════════════════════
// 세금계산서 토글
// ════════════════════════════════════════════════════

async function toggleInvoice(companyId, checked) {
  const b = adminData.billings.find(x => x.company_id === companyId && x.month === contactMonth);
  if (!b) return toast('정산 데이터가 없습니다', 'error');

  const todayStr = today();
  const newBilledAt = checked ? todayStr : null;

  // status 재계산
  let newStatus = 'pending';
  if (b.paid_at) {
    newStatus = 'paid';
  } else if (checked) {
    newStatus = 'billed';
  }

  const { error } = await sb.from('billing_records').update({
    billed_at: newBilledAt,
    status: newStatus,
  }).eq('id', b.id);

  if (error) return toast(error.message, 'error');

  const cName = getCompanyName(companyId);
  await logChange('billing_records', b.id, 'update',
    [{ field: 'billed_at', oldVal: b.billed_at || '없음', newVal: newBilledAt || '없음' }],
    `${cName} (${contactMonth}) 세금계산서 ${checked ? '발행' : '취소'}`
  );

  b.billed_at = newBilledAt;
  b.status = newStatus;

  toast(checked ? '계산서 발행 처리' : '계산서 발행 취소');
  renderContacts(true);
}


// ════════════════════════════════════════════════════
// 입금 토글
// ════════════════════════════════════════════════════

async function togglePayment(companyId, checked) {
  const b = adminData.billings.find(x => x.company_id === companyId && x.month === contactMonth);
  if (!b) return toast('정산 데이터가 없습니다', 'error');

  const todayStr = today();
  const newPaidAt = checked ? todayStr : null;
  const newPaidAmount = checked ? (b.billed_amount || 0) : 0;

  // status 재계산
  let newStatus = 'pending';
  if (checked) {
    newStatus = 'paid';
  } else if (b.billed_at) {
    newStatus = 'billed';
  }

  const { error } = await sb.from('billing_records').update({
    paid_at: newPaidAt,
    paid_amount: newPaidAmount,
    status: newStatus,
  }).eq('id', b.id);

  if (error) return toast(error.message, 'error');

  const cName = getCompanyName(companyId);
  await logChange('billing_records', b.id, 'update',
    [{ field: 'paid_at', oldVal: b.paid_at || '없음', newVal: newPaidAt || '없음' },
     { field: 'paid_amount', oldVal: b.paid_amount || 0, newVal: newPaidAmount }],
    `${cName} (${contactMonth}) 입금 ${checked ? '완료' : '취소'}`
  );

  b.paid_at = newPaidAt;
  b.paid_amount = newPaidAmount;
  b.status = newStatus;

  toast(checked ? '입금 완료 처리' : '입금 취소');
  renderContacts(true);
}


// ════════════════════════════════════════════════════
// 연락처 저장
// ════════════════════════════════════════════════════

async function saveContact(companyId, isMobile) {
  const prefix = isMobile ? '_m_' : '_';
  const contactName  = document.getElementById('ct_name' + prefix + companyId)?.value?.trim() || '';
  const contactPhone = document.getElementById('ct_phone' + prefix + companyId)?.value?.trim() || '';
  const bizNumber    = document.getElementById('ct_biz' + prefix + companyId)?.value?.trim() || '';

  const c = adminData.companies.find(x => x.id === companyId);
  if (!c) return toast('업체를 찾을 수 없습니다', 'error');

  const changes = [];
  if (c.contact_name !== contactName) changes.push({ field: 'contact_name', oldVal: c.contact_name || '', newVal: contactName });
  if (c.contact_phone !== contactPhone) changes.push({ field: 'contact_phone', oldVal: c.contact_phone || '', newVal: contactPhone });
  if ((c.business_number || '') !== bizNumber) changes.push({ field: 'business_number', oldVal: c.business_number || '', newVal: bizNumber });

  if (changes.length === 0) return toast('변경된 내용이 없습니다');

  const { error } = await sb.from('companies').update({
    contact_name: contactName,
    contact_phone: contactPhone,
    business_number: bizNumber,
  }).eq('id', companyId);

  if (error) return toast(error.message, 'error');

  await logChange('companies', companyId, 'update', changes, `${c.name} 연락처 수정`);

  c.contact_name = contactName;
  c.contact_phone = contactPhone;
  c.business_number = bizNumber;

  toast('저장 완료');
}


// ════════════════════════════════════════════════════
// 엑셀 내보내기
// ════════════════════════════════════════════════════

function exportContacts() {
  if (contactView === 'billing') {
    const billingMap = {};
    adminData.billings.forEach(b => {
      if (b.month === contactMonth) billingMap[b.company_id] = b;
    });

    const rows = adminData.companies
      .filter(c => c.status === 'active')
      .map(c => {
        const b = billingMap[c.id];
        return {
          '업체명': c.name,
          '구역': c.area_name || '',
          '담당자': c.contact_name || '',
          '전화번호': c.contact_phone || '',
          '청구액': b ? b.billed_amount : '',
          '계산서발행': b?.billed_at ? '발행(' + b.billed_at + ')' : '미발행',
          '입금': b?.paid_at ? '완료(' + b.paid_at + ')' : '미입금',
          '입금액': b ? b.paid_amount : '',
        };
      });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '정산체크');
    XLSX.writeFile(wb, `정산체크_${contactMonth}.xlsx`);
  } else {
    const rows = adminData.companies
      .filter(c => c.status === 'active')
      .map(c => ({
        '업체명': c.name,
        '구역': c.area_name || '',
        '담당자명': c.contact_name || '',
        '전화번호': c.contact_phone || '',
        '사업자등록번호': c.business_number || '',
      }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '연락처');
    XLSX.writeFile(wb, `업체연락처_${today()}.xlsx`);
  }
}

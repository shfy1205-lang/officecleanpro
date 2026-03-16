/**
 * admin-contacts.js - 업체 연락처 관리 탭
 * 담당자 전화번호, 사업자등록번호 조회 및 수정
 */

let contactSearch = '';

// ════════════════════════════════════════════════════
// 연락처 탭 렌더링
// ════════════════════════════════════════════════════

function renderContacts(listOnly) {
  const mc = $('mainContent');

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

  // 통계
  const total = filtered.length;
  const hasPhone = filtered.filter(c => c.contact_phone && c.contact_phone.trim()).length;
  const hasBizNum = filtered.filter(c => c.business_number && c.business_number.trim()).length;

  const listHTML = `
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

  if (listOnly) {
    const lc = document.getElementById('contactListContainer');
    if (lc) { lc.innerHTML = listHTML; return; }
  }

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      업체 연락처
      <button class="btn-sm btn-blue" onclick="exportContacts()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
    </div>

    <div class="search-box" style="margin-bottom:14px">
      <input id="contactSearchInput" placeholder="업체명, 담당자, 전화번호, 사업자번호 검색" value="${contactSearch}">
    </div>

    <div id="contactListContainer">${listHTML}</div>
  `;

  bindSearchInput('contactSearchInput', (val) => {
    contactSearch = val;
    renderContacts(true);
  });
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

  // 변경 이력 추적
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

  // 변경 이력 로그
  await logChange('companies', companyId, 'update', changes, `${c.name} 연락처 수정`);

  // 로컬 캐시 업데이트
  c.contact_name = contactName;
  c.contact_phone = contactPhone;
  c.business_number = bizNumber;

  toast('저장 완료');
}


// ════════════════════════════════════════════════════
// 연락처 엑셀 내보내기
// ════════════════════════════════════════════════════

function exportContacts() {
  const rows = adminData.companies
    .filter(c => c.status === 'active')
    .map(c => ({
      '업체명': c.name,
      '구역': c.area_name || '',
      '담당자명': c.contact_name || '',
      '전화번호': c.contact_phone || '',
      '사업자등록번호': c.business_number || '',
    }));

  if (typeof exportToExcel === 'function') {
    exportToExcel(rows, '업체연락처');
  } else {
    // fallback: SheetJS 직접 사용
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '연락처');
    XLSX.writeFile(wb, `업체연락처_${today()}.xlsx`);
  }
}

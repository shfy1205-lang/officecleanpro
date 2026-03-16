/**
 * admin-billing.js - 정산관리 탭
 */

function renderBilling() {
  const mc = $('mainContent');

  let list = adminData.billings;

  if (billingView === 'unpaid') {
    list = list.filter(b => b.status !== 'paid');
  } else {
    list = list.filter(b => b.month === billingMonth);
  }

  const unpaidAll = adminData.billings.filter(b => b.status !== 'paid');
  const totalUnpaid = unpaidAll.reduce((s, b) => s + ((b.billed_amount || 0) - (b.paid_amount || 0)), 0);

  const monthBillings = adminData.billings.filter(b => b.month === billingMonth);
  const monthTotal = monthBillings.reduce((s, b) => s + (b.billed_amount || 0), 0);
  const monthPaid = monthBillings.reduce((s, b) => s + (b.paid_amount || 0), 0);

  mc.innerHTML = `
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      정산관리
      <div style="display:flex;gap:6px">
        <button class="btn-sm btn-blue" onclick="exportBilling()" style="font-size:11px;padding:6px 10px">📥 엑셀</button>
        <button class="btn-sm btn-green" onclick="openBillingForm()">+ 정산 등록</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">미수금 총액</div>
        <div class="stat-value red">${fmt(totalUnpaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수건수</div>
        <div class="stat-value yellow">${unpaidAll.length}</div>
      </div>
    </div>

    <!-- 보기 전환: 월별 / 미수금 -->
    <div class="view-toggle" style="margin-bottom:16px">
      <button class="view-toggle-btn${billingView === 'all' ? ' active' : ''}"
              onclick="billingView='all';renderBilling()">월별 정산</button>
      <button class="view-toggle-btn${billingView === 'unpaid' ? ' active' : ''}"
              onclick="billingView='unpaid';renderBilling()">미수금 목록 (${unpaidAll.length})</button>
    </div>

    ${billingView === 'all' ? `
      ${monthSelectorHTML(billingMonth, 'changeBillingMonth')}

      <div class="admin-row-2" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">${billingMonth.split('-')[1]}월 청구 총액</div>
          <div class="stat-value blue">${fmt(monthTotal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${billingMonth.split('-')[1]}월 입금 총액</div>
          <div class="stat-value green">${fmt(monthPaid)}</div>
        </div>
      </div>
    ` : ''}

    ${billingView === 'unpaid' ? '<p class="text-muted" style="margin-bottom:12px">입금 완료되지 않은 모든 정산 건을 표시합니다.</p>' : ''}

    ${list.length > 0 ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>업체</th>
              <th>${billingView === 'unpaid' ? '월' : '상태'}</th>
              <th>청구액</th>
              <th>입금액</th>
              <th>미수금</th>
            </tr>
          </thead>
          <tbody>${list.map(b => {
            const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
            const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);
            return `<tr class="billing-row" onclick="openBillingDetail('${b.id}')" style="cursor:pointer">
              <td>${getCompanyName(b.company_id)}</td>
              <td>${billingView === 'unpaid'
                ? b.month
                : `<span class="badge ${bst.badge}">${bst.label}</span>`
              }</td>
              <td>${fmt(b.billed_amount)}원</td>
              <td class="admin-pay-cell">${fmt(b.paid_amount)}원</td>
              <td style="color:${unpaid > 0 ? 'var(--red)' : 'var(--text2)'}; font-weight:${unpaid > 0 ? '600' : '400'}">
                ${unpaid > 0 ? fmt(unpaid) + '원' : '-'}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>${billingView === 'unpaid' ? '미수금이 없습니다' : '이 달의 정산 데이터가 없습니다'}</p>
      </div>
    `}
  `;
}

async function changeBillingMonth(month) {
  billingMonth = month;
  renderBilling();
}

function openBillingForm(billingId) {
  const isEdit = !!billingId;
  const b = isEdit ? adminData.billings.find(x => x.id === billingId) : {};

  const activeCompanies = adminData.companies.filter(c => c.status === 'active');

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${isEdit ? '정산 수정' : '정산 등록'}</h3>

    <div class="field">
      <label>업체 *</label>
      <select id="bCompany" ${isEdit ? 'disabled' : ''} onchange="onBillingCompanyChange()">
        <option value="">업체 선택</option>
        ${activeCompanies.map(c =>
          `<option value="${c.id}"${c.id === b.company_id ? ' selected' : ''}>${c.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>정산 월 *</label>
      <input id="bMonth" type="month" value="${b.month || billingMonth}" ${isEdit ? 'disabled' : ''} onchange="onBillingCompanyChange()">
    </div>
    <div class="field">
      <label>청구 금액 (원) * <span id="bAmountHint" class="text-muted" style="font-size:11px"></span></label>
      <input id="bBilledAmount" type="number" value="${b.billed_amount || 0}" placeholder="청구 금액">
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>세금계산서 발행 여부</label>
        <select id="bBilledStatus">
          <option value="no"${!b.billed_at ? ' selected' : ''}>미발행</option>
          <option value="yes"${b.billed_at ? ' selected' : ''}>발행완료</option>
        </select>
      </div>
      <div class="field">
        <label>발행일</label>
        <input id="bBilledAt" type="date" value="${b.billed_at || ''}">
      </div>
    </div>
    <div class="admin-row-2">
      <div class="field">
        <label>입금 여부</label>
        <select id="bPaidStatus">
          <option value="no"${!b.paid_at ? ' selected' : ''}>미입금</option>
          <option value="yes"${b.paid_at ? ' selected' : ''}>입금완료</option>
        </select>
      </div>
      <div class="field">
        <label>입금일</label>
        <input id="bPaidAt" type="date" value="${b.paid_at || ''}">
      </div>
    </div>
    <div class="field">
      <label>입금 금액 (원)</label>
      <input id="bPaidAmount" type="number" value="${b.paid_amount || 0}" placeholder="입금 금액">
    </div>
    <div class="field">
      <label>메모</label>
      <textarea id="bMemo" rows="2" placeholder="메모">${b.memo || ''}</textarea>
    </div>

    <button class="btn" onclick="saveBilling('${billingId || ''}')">${isEdit ? '수정 저장' : '등록하기'}</button>
    ${isEdit ? `<button class="btn" style="background:var(--red);margin-top:8px" onclick="deleteBilling('${billingId}')">삭제</button>` : ''}
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

function onBillingCompanyChange() {
  const companyId = $('bCompany')?.value;
  const month = $('bMonth')?.value;
  const hint = $('bAmountHint');
  if (!companyId || !month || !hint) return;

  const fin = adminData.financials.find(f => f.company_id === companyId && f.month === month);
  if (fin && fin.contract_amount) {
    hint.textContent = `(계약금액: ${fmt(fin.contract_amount)}원)`;
    // 금액이 0이면 자동 입력
    const amountInput = $('bBilledAmount');
    if (amountInput && (!amountInput.value || amountInput.value === '0')) {
      amountInput.value = fin.contract_amount;
    }
  } else {
    hint.textContent = '';
  }
}

async function saveBilling(billingId) {
  const companyId = $('bCompany').value;
  const month = $('bMonth').value;

  if (!companyId && !billingId) return toast('업체를 선택하세요', 'error');
  if (!month && !billingId) return toast('정산 월을 선택하세요', 'error');

  // 변경 이력용 이전값 (수정 모드일 때)
  const oldBilling = billingId ? adminData.billings.find(x => x.id === billingId) : null;

  const billedAt = $('bBilledAt').value || null;
  const paidAt = $('bPaidAt').value || null;
  const billedAmount = parseInt($('bBilledAmount').value) || 0;
  const paidAmount = parseInt($('bPaidAmount').value) || 0;
  const billedStatus = $('bBilledStatus').value;
  const paidStatus = $('bPaidStatus').value;

  // 상태 자동 결정
  let status = 'pending';
  if (paidStatus === 'yes' || paidAt) {
    status = 'paid';
  } else if (billedStatus === 'yes' || billedAt) {
    status = 'billed';
  }

  // 연체 판정: 발행했지만 입금 안됐고, 발행일이 30일 이상 경과
  if (status === 'billed' && billedAt) {
    const daysSince = (new Date() - new Date(billedAt)) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) status = 'overdue';
  }

  const payload = {
    billed_amount: billedAmount,
    paid_amount:   paidAmount,
    billed_at:     billedAt,
    paid_at:       paidAt,
    status,
    memo:          $('bMemo').value.trim(),
  };

  let error;
  if (billingId) {
    ({ error } = await sb.from('billing_records').update(payload).eq('id', billingId));
  } else {
    payload.company_id = companyId;
    payload.month = month;
    ({ error } = await sb.from('billing_records').insert(payload));
  }

  if (error) {
    if (error.code === '23505') return toast('해당 업체의 해당 월 정산이 이미 존재합니다', 'error');
    return toast(error.message, 'error');
  }

  // 변경 이력 로그 (수정 모드)
  if (billingId && oldBilling) {
    const changes = [];
    const cName = getCompanyName(oldBilling.company_id);
    const bst = BILLING_STATUS_MAP;

    if ((oldBilling.billed_amount || 0) !== billedAmount) changes.push({ field: 'billed_amount', oldVal: oldBilling.billed_amount || 0, newVal: billedAmount });
    if ((oldBilling.paid_amount || 0) !== paidAmount) changes.push({ field: 'paid_amount', oldVal: oldBilling.paid_amount || 0, newVal: paidAmount });
    if ((oldBilling.status || 'pending') !== status) changes.push({ field: 'status', oldVal: (bst[oldBilling.status] || bst.pending).label, newVal: (bst[status] || bst.pending).label });
    if ((oldBilling.billed_at || '') !== (billedAt || '')) changes.push({ field: 'billed_at', oldVal: oldBilling.billed_at || '없음', newVal: billedAt || '없음' });
    if ((oldBilling.paid_at || '') !== (paidAt || '')) changes.push({ field: 'paid_at', oldVal: oldBilling.paid_at || '없음', newVal: paidAt || '없음' });

    if (changes.length > 0) {
      await logChange('billing_records', billingId, 'update', changes,
        `${cName} (${oldBilling.month}) 정산 수정`
      );
    }
  }

  toast(billingId ? '정산 수정 완료' : '정산 등록 완료');
  closeModal();
  await loadAdminData();
  renderBilling();
}

function openBillingDetail(billingId) {
  const b = adminData.billings.find(x => x.id === billingId);
  if (!b) return;

  const bst = BILLING_STATUS_MAP[b.status] || BILLING_STATUS_MAP.pending;
  const unpaid = (b.billed_amount || 0) - (b.paid_amount || 0);

  const html = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${getCompanyName(b.company_id)} - ${b.month}</h3>

    <div class="detail-section">
      <div class="admin-row-2">
        <div>
          <div class="stat-label">상태</div>
          <p><span class="badge ${bst.badge}" style="font-size:13px;padding:4px 12px">${bst.label}</span></p>
        </div>
        <div>
          <div class="stat-label">미수금</div>
          <p style="font-size:18px;font-weight:700;color:${unpaid > 0 ? 'var(--red)' : 'var(--green)'}">
            ${unpaid > 0 ? fmt(unpaid) + '원' : '없음'}
          </p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">💰 금액 정보</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">청구 금액</span>
          <span class="billing-info-value">${fmt(b.billed_amount)}원</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금 금액</span>
          <span class="billing-info-value" style="color:var(--green)">${fmt(b.paid_amount)}원</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📄 세금계산서</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">발행 여부</span>
          <span class="billing-info-value">${b.billed_at
            ? '<span class="badge badge-done">발행완료</span>'
            : '<span class="badge badge-warn">미발행</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">발행일</span>
          <span class="billing-info-value">${b.billed_at || '-'}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏦 입금</div>
      <div class="billing-info-grid">
        <div class="billing-info-item">
          <span class="billing-info-label">입금 여부</span>
          <span class="billing-info-value">${b.paid_at
            ? '<span class="badge badge-done">입금완료</span>'
            : '<span class="badge badge-warn">미입금</span>'
          }</span>
        </div>
        <div class="billing-info-item">
          <span class="billing-info-label">입금일</span>
          <span class="billing-info-value">${b.paid_at || '-'}</span>
        </div>
      </div>
    </div>

    ${b.memo ? `
    <div class="detail-section">
      <div class="detail-section-title">📝 메모</div>
      <div class="special-notes-box">${b.memo.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn" style="flex:1" onclick="openBillingForm('${b.id}')">수정</button>
      <button class="btn" style="flex:1;background:var(--red)" onclick="deleteBilling('${b.id}')">삭제</button>
    </div>
  `;

  $('modalBody').innerHTML = html;
  $('detailModal').classList.add('show');
}

async function deleteBilling(billingId) {
  if (!confirm('이 정산 기록을 삭제하시겠습니까?')) return;

  // 변경 이력용 이전 데이터
  const oldBilling = adminData.billings.find(x => x.id === billingId);
  const cName = oldBilling ? getCompanyName(oldBilling.company_id) : '';

  const { error } = await sb.from('billing_records').delete().eq('id', billingId);
  if (error) return toast(error.message, 'error');

  // 변경 이력 로그
  if (oldBilling) {
    await logChange('billing_records', billingId, 'delete',
      [{ field: 'billed_amount', oldVal: oldBilling.billed_amount || 0, newVal: null },
       { field: 'status', oldVal: (BILLING_STATUS_MAP[oldBilling.status] || BILLING_STATUS_MAP.pending).label, newVal: '삭제됨' }],
      `${cName} (${oldBilling.month}) 정산 삭제`
    );
  }

  toast('정산 삭제됨');
  closeModal();
  await loadAdminData();
  renderBilling();
}

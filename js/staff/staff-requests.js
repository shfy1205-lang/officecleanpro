/**
 * staff-requests.js - 요청사항 작성
 */

function openRequestModal(companyId, companyName) {
  const html = `
    <button class="modal-close" onclick="closeRequestModal()">&times;</button>
    <h3>요청사항 작성</h3>
    <div class="detail-location">${companyName}</div>

    <div class="field" style="margin-top:16px">
      <label for="requestInput">요청 내용</label>
      <textarea id="requestInput" rows="4" placeholder="관리자에게 전달할 요청사항을 입력하세요.&#10;(예: 청소 용품 보충 필요, 열쇠 교체 요청 등)"></textarea>
    </div>

    <button class="btn" onclick="submitRequest('${companyId}')">요청 보내기</button>
    <p class="text-muted" style="margin-top:12px; text-align:center">요청은 7일 후 자동 만료됩니다.</p>
  `;

  $('requestModalBody').innerHTML = html;
  $('requestModal').classList.add('show');

  setTimeout(() => $('requestInput')?.focus(), 200);
}

function closeRequestModal() {
  $('requestModal').classList.remove('show');
}

async function submitRequest(companyId) {
  const input = $('requestInput');
  const content = input?.value?.trim();
  if (!content) return toast('내용을 입력하세요', 'error');

  const { data, error } = await sb.from('requests').insert({
    company_id: companyId,
    content:    content,
    created_by: currentWorker.id,
  }).select();

  if (error) return toast(error.message, 'error');

  if (data && data[0]) staffData.requests.push(data[0]);

  toast('요청이 등록되었습니다');
  closeRequestModal();

  await openCompanyDetail(companyId);
}

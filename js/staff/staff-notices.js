/**
 * staff-notices.js - 공지사항 탭
 */

async function renderNotices() {
  const mc = $('mainContent');
  mc.innerHTML = '<div class="section-title">공지사항</div><p class="text-muted">불러오는 중...</p>';

  const { data: notices, error } = await sb.from('notices')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    mc.innerHTML = '<div class="section-title">공지사항</div><p class="text-muted">불러오기 실패</p>';
    return;
  }

  // ── 대상 필터링: 본인에게 해당하는 공지만 표시 ──
  const filtered = (notices || []).filter(n => isNoticeVisibleToMe(n));

  let html = '<div class="section-title">공지사항</div>';

  if (filtered.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-icon">📢</div>
      <p>등록된 공지사항이 없습니다.</p>
    </div>`;
    mc.innerHTML = html;
    return;
  }

  filtered.forEach(n => {
    const date = new Date(n.created_at).toLocaleDateString('ko-KR');
    // ── 접두사를 제거한 깨끗한 제목 표시 ──
    const { cleanTitle } = parseNoticeTarget(n.title);
    const displayTitle = cleanTitle || n.title;

    html += `
      <div class="card notice-card${n.is_pinned ? ' pinned' : ''}">
        <div class="card-header">
          <div class="card-title">
            ${n.is_pinned ? '<span class="pin-icon">📌</span> ' : ''}${displayTitle}
          </div>
          <div class="card-subtitle">${date}</div>
        </div>
        <div class="notice-content">${n.content.replace(/\n/g, '<br>')}</div>
      </div>
    `;
  });

  mc.innerHTML = html;
}

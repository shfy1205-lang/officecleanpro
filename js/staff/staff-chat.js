/**
 * staff-chat.js - 직원 1:1 채팅 모듈
 * 직원 포털 전용 — staffData 없이 독립 동작
 * 관리자/직원과 1:1 메시지, RLS가 본인 메시지만 반환
 */

let staffChatConversations = [];
let staffChatPartner = null;
let staffChatMessages = [];
let staffChatPollTimer = null;
let staffChatWorkerCache = {};   // { id: { name, role } }

// ─── CSS 주입 ───

function injectStaffChatStyles() {
  if (document.getElementById('staffChatStyleTag')) return;
  var s = document.createElement('style');
  s.id = 'staffChatStyleTag';
  s.textContent = [
    '.chat-wrap{display:flex;height:calc(100vh - 120px);background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.chat-sidebar-panel{width:100%;border-right:1px solid #e9ecef;display:flex;flex-direction:column;background:#fafbfc}',
    '.chat-sidebar-hd{padding:16px 20px;border-bottom:1px solid #e9ecef;display:flex;align-items:center;justify-content:space-between}',
    '.chat-sidebar-hd h3{margin:0;font-size:16px;font-weight:600}',
    '.chat-contacts{flex:1;overflow-y:auto}',
    '.chat-contact{display:flex;align-items:center;gap:12px;padding:14px 20px;cursor:pointer;border-bottom:1px solid #f1f3f5;transition:background .15s}',
    '.chat-contact:hover{background:#f0f2ff}',
    '.chat-contact.active{background:#eef0ff;border-left:3px solid #6c5ce7}',
    '.chat-avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;color:#fff;flex-shrink:0}',
    '.chat-avatar.admin-av{background:#e17055}',
    '.chat-avatar.staff-av{background:#6c5ce7}',
    '.chat-cinfo{flex:1;min-width:0}',
    '.chat-cname{font-weight:500;font-size:14px;display:flex;align-items:center;gap:6px}',
    '.chat-cpreview{font-size:12px;color:#868e96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
    '.chat-ctime{font-size:11px;color:#adb5bd;white-space:nowrap}',
    '.chat-unread{background:#e74c3c;color:#fff;font-size:11px;font-weight:600;padding:1px 7px;border-radius:10px;min-width:18px;text-align:center}',
    '.chat-main-panel{flex:1;display:none;flex-direction:column;min-width:0}',
    '.chat-empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#adb5bd}',
    '.chat-empty-state .icon{font-size:48px;margin-bottom:12px}',
    '.chat-hd{padding:14px 20px;border-bottom:1px solid #e9ecef;display:flex;align-items:center;gap:12px;background:#fafbfc}',
    '.chat-back{background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;color:#495057}',
    '.chat-hd-name{font-weight:600;font-size:15px}',
    '.chat-hd-role{font-size:12px;color:#868e96;margin-left:4px}',
    '.chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:6px;background:#f8f9fa}',
    '.chat-date-sep{text-align:center;font-size:12px;color:#868e96;margin:12px 0;position:relative}',
    '.chat-date-sep span{background:#f8f9fa;padding:0 12px;position:relative;z-index:1}',
    '.chat-date-sep::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px solid #dee2e6}',
    '.chat-msg{display:flex;flex-direction:column;max-width:85%}',
    '.chat-msg.mine{align-self:flex-end;align-items:flex-end}',
    '.chat-msg.theirs{align-self:flex-start;align-items:flex-start}',
    '.chat-bubble{padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap}',
    '.chat-msg.mine .chat-bubble{background:#6c5ce7;color:#fff;border-bottom-right-radius:4px}',
    '.chat-msg.theirs .chat-bubble{background:#fff;color:#212529;border:1px solid #e9ecef;border-bottom-left-radius:4px}',
    '.chat-meta{font-size:11px;color:#adb5bd;margin-top:2px;display:flex;gap:6px}',
    '.chat-meta .read{color:#6c5ce7}',
    '.chat-input-area{padding:12px 16px;border-top:1px solid #e9ecef;display:flex;gap:8px;background:#fff}',
    '.chat-input{flex:1;border:1px solid #dee2e6;border-radius:24px;padding:10px 16px;font-size:14px;outline:none;font-family:inherit}',
    '.chat-input:focus{border-color:#6c5ce7;box-shadow:0 0 0 2px rgba(108,92,231,.15)}',
    '.chat-send{background:#6c5ce7;color:#fff;border:none;border-radius:24px;padding:10px 16px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}',
    '.chat-send:hover{background:#5a4bd1}',
    '.chat-send:disabled{background:#adb5bd;cursor:not-allowed}',
    '.chat-new-item{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid #f1f3f5;transition:background .15s}',
    '.chat-new-item:hover{background:#f0f2ff}',
    '.chat-wrap.chat-open .chat-sidebar-panel{display:none}',
    '.chat-wrap.chat-open .chat-main-panel{display:flex}'
  ].join('\n');
  document.head.appendChild(s);
}

// ─── 메인 렌더 ───

async function renderStaffChat() {
  injectStaffChatStyles();
  var el = $('mainContent');
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#868e96">채팅 로딩 중...</div>';

  await loadStaffChatWorkers();
  await loadStaffChatConversations();

  el.innerHTML = '<div class="chat-wrap" id="chatWrap">'
    + '<div class="chat-sidebar-panel">'
    +   '<div class="chat-sidebar-hd">'
    +     '<h3>메시지</h3>'
    +     '<button style="background:#6c5ce7;color:#fff;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px" onclick="showStaffNewChatModal()">+ 새 대화</button>'
    +   '</div>'
    +   '<div class="chat-contacts" id="chatContacts"></div>'
    + '</div>'
    + '<div class="chat-main-panel" id="chatMainPanel">'
    +   '<div class="chat-empty-state"><div class="icon">💬</div><p>대화를 선택하세요</p></div>'
    + '</div>'
    + '</div>';

  renderStaffChatContacts();
  startStaffChatPolling();
}

// ─── 관리자 목록 로드 (직원용) ───

async function loadStaffChatWorkers() {
  try {
    // 관리자 목록 + 대화 상대 목록 로드
    var res = await sb.from('workers').select('id,name,role').in('role', ['admin', 'eco']);
    if (!res.error && res.data) {
      res.data.forEach(function(w) { staffChatWorkerCache[w.id] = w; });
    }
  } catch (e) { console.error('loadStaffChatWorkers error:', e); }
}

function getCachedWorker(id) {
  return staffChatWorkerCache[id] || null;
}

// ─── 대화 목록 로드 ───

async function loadStaffChatConversations() {
  try {
    var res = await sb.from('messages').select('*')
      .or('sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + currentWorker.id)
      .order('created_at', { ascending: false });

    if (res.error) { console.error('Staff chat load error:', res.error); return; }

    // 대화 상대 worker 정보 캐시
    var unknownIds = [];
    (res.data || []).forEach(function(m) {
      var pid = m.sender_id === currentWorker.id ? m.receiver_id : m.sender_id;
      if (!staffChatWorkerCache[pid]) unknownIds.push(pid);
    });

    // 캐시에 없는 상대 조회
    if (unknownIds.length > 0) {
      var unique = unknownIds.filter(function(v, i, a) { return a.indexOf(v) === i; });
      var wRes = await sb.from('workers').select('id,name,role').in('id', unique);
      if (!wRes.error && wRes.data) {
        wRes.data.forEach(function(w) { staffChatWorkerCache[w.id] = w; });
      }
    }

    var map = {};
    (res.data || []).forEach(function(m) {
      var pid = m.sender_id === currentWorker.id ? m.receiver_id : m.sender_id;
      if (!map[pid]) {
        map[pid] = { partnerId: pid, lastMessage: m, unreadCount: 0 };
      }
      if (m.receiver_id === currentWorker.id && !m.read_at) {
        map[pid].unreadCount++;
      }
    });

    staffChatConversations = Object.values(map).sort(function(a, b) {
      return new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at);
    });
  } catch (e) {
    console.error('loadStaffChatConversations error:', e);
  }
}

// ─── 연락처 렌더 ───

function renderStaffChatContacts() {
  var el = document.getElementById('chatContacts');
  if (!el) return;

  if (staffChatConversations.length === 0) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#adb5bd;font-size:14px">아직 대화가 없습니다<br><span style="font-size:12px">[+ 새 대화] 버튼으로 시작하세요</span></div>';
    return;
  }

  var html = '';
  for (var i = 0; i < staffChatConversations.length; i++) {
    var c = staffChatConversations[i];
    var w = getCachedWorker(c.partnerId);
    var nm = w ? escapeHtml(w.name) : '알 수 없음';
    var role = w ? (w.role === 'admin' ? '관리자' : '직원') : '';
    var avCls = w && w.role === 'admin' ? 'admin-av' : 'staff-av';
    var preview = escapeHtml(c.lastMessage.content.length > 25 ? c.lastMessage.content.substring(0, 25) + '…' : c.lastMessage.content);
    var time = fmtStaffChatTime(c.lastMessage.created_at);
    var isActive = staffChatPartner === c.partnerId ? ' active' : '';
    var badge = c.unreadCount > 0 ? '<span class="chat-unread">' + c.unreadCount + '</span>' : '';

    html += '<div class="chat-contact' + isActive + '" onclick="openStaffChat(\'' + c.partnerId + '\')">'
      + '<div class="chat-avatar ' + avCls + '">' + nm.charAt(0) + '</div>'
      + '<div class="chat-cinfo">'
      +   '<div class="chat-cname">' + nm + ' <span style="font-size:11px;color:#adb5bd">' + role + '</span> ' + badge + '</div>'
      +   '<div class="chat-cpreview">' + preview + '</div>'
      + '</div>'
      + '<div class="chat-ctime">' + time + '</div>'
      + '</div>';
  }
  el.innerHTML = html;
}

// ─── 채팅방 열기 ───

async function openStaffChat(partnerId) {
  staffChatPartner = partnerId;

  var wrap = document.getElementById('chatWrap');
  if (wrap) wrap.classList.add('chat-open');

  var panel = document.getElementById('chatMainPanel');
  if (panel) panel.innerHTML = '<div style="padding:40px;text-align:center;color:#868e96">로딩 중...</div>';

  try {
    var res = await sb.from('messages').select('*')
      .or(
        'and(sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + partnerId + '),'
        + 'and(sender_id.eq.' + partnerId + ',receiver_id.eq.' + currentWorker.id + ')'
      )
      .order('created_at', { ascending: true });

    staffChatMessages = res.data || [];

    var unreadIds = staffChatMessages
      .filter(function(m) { return m.receiver_id === currentWorker.id && !m.read_at; })
      .map(function(m) { return m.id; });

    if (unreadIds.length > 0) {
      await sb.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      staffChatMessages.forEach(function(m) {
        if (unreadIds.indexOf(m.id) !== -1) m.read_at = new Date().toISOString();
      });
    }
  } catch (e) {
    console.error('openStaffChat error:', e);
    staffChatMessages = [];
  }

  renderStaffChatPanel();
  renderStaffChatContacts();
}

// ─── 채팅 패널 ───

function renderStaffChatPanel() {
  var panel = document.getElementById('chatMainPanel');
  if (!panel) return;

  var w = getCachedWorker(staffChatPartner);
  var nm = w ? escapeHtml(w.name) : '알 수 없음';
  var role = w ? (w.role === 'admin' ? '관리자' : '직원') : '';
  var avCls = w && w.role === 'admin' ? 'admin-av' : 'staff-av';

  panel.innerHTML = '<div class="chat-hd">'
    + '<button class="chat-back" onclick="closeStaffChatPanel()">←</button>'
    + '<div class="chat-avatar ' + avCls + '" style="width:36px;height:36px;font-size:14px">' + nm.charAt(0) + '</div>'
    + '<div><span class="chat-hd-name">' + nm + '</span><span class="chat-hd-role">' + role + '</span></div>'
    + '</div>'
    + '<div class="chat-msgs" id="chatMsgs"></div>'
    + '<div class="chat-input-area">'
    +   '<input class="chat-input" id="chatInput" placeholder="메시지를 입력하세요…" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendStaffChatMessage()}">'
    +   '<button class="chat-send" id="chatSendBtn" onclick="sendStaffChatMessage()">전송</button>'
    + '</div>';

  renderStaffChatMessages();
  var inp = document.getElementById('chatInput');
  if (inp) inp.focus();
}

function renderStaffChatMessages() {
  var el = document.getElementById('chatMsgs');
  if (!el) return;

  if (staffChatMessages.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#adb5bd;margin-top:40px">아직 메시지가 없습니다.<br>첫 메시지를 보내보세요!</div>';
    return;
  }

  var html = '';
  var lastDate = '';
  for (var i = 0; i < staffChatMessages.length; i++) {
    var m = staffChatMessages[i];
    var d = new Date(m.created_at);
    var dateStr = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';

    if (dateStr !== lastDate) {
      html += '<div class="chat-date-sep"><span>' + dateStr + '</span></div>';
      lastDate = dateStr;
    }

    var isMine = m.sender_id === currentWorker.id;
    var timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var readMark = isMine && m.read_at ? '<span class="read">읽음</span>' : '';

    html += '<div class="chat-msg ' + (isMine ? 'mine' : 'theirs') + '">'
      + '<div class="chat-bubble">' + escapeHtml(m.content) + '</div>'
      + '<div class="chat-meta">' + timeStr + ' ' + readMark + '</div>'
      + '</div>';
  }

  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// ─── 메시지 전송 ───

async function sendStaffChatMessage() {
  var input = document.getElementById('chatInput');
  var btn = document.getElementById('chatSendBtn');
  if (!input || !staffChatPartner) return;

  var content = input.value.trim();
  if (!content) return;

  input.value = '';
  if (btn) btn.disabled = true;

  try {
    var res = await sb.from('messages')
      .insert({ sender_id: currentWorker.id, receiver_id: staffChatPartner, content: content })
      .select().single();

    if (res.error) {
      toast('전송 실패: ' + res.error.message, 'error');
      input.value = content;
      return;
    }

    staffChatMessages.push(res.data);
    renderStaffChatMessages();
    await loadStaffChatConversations();
    renderStaffChatContacts();
  } catch (e) {
    toast('전송 실패', 'error');
    input.value = content;
  } finally {
    if (btn) btn.disabled = false;
    if (input) input.focus();
  }
}

// ─── 새 대화 모달 ───

function showStaffNewChatModal() {
  // 관리자 목록 표시
  var admins = Object.values(staffChatWorkerCache).filter(function(w) {
    return w.id !== currentWorker.id && (w.role === 'admin' || w.role === 'eco');
  });

  var existing = {};
  staffChatConversations.forEach(function(c) { existing[c.partnerId] = true; });

  var html = '<h3 style="margin:0 0 16px">새 대화 시작</h3>';

  if (admins.length === 0) {
    html += '<div style="padding:20px;text-align:center;color:#868e96">대화 가능한 관리자가 없습니다</div>';
  } else {
    html += '<div style="max-height:400px;overflow-y:auto">';
    for (var i = 0; i < admins.length; i++) {
      var w = admins[i];
      var nm = escapeHtml(w.name);
      var extra = existing[w.id] ? ' · 대화 중' : '';
      html += '<div class="chat-new-item" onclick="startStaffNewChat(\'' + w.id + '\')">'
        + '<div class="chat-avatar admin-av" style="width:38px;height:38px;font-size:14px">' + nm.charAt(0) + '</div>'
        + '<div><div style="font-weight:500;font-size:14px">' + nm + '</div>'
        + '<div style="font-size:12px;color:#868e96">관리자' + extra + '</div></div>'
        + '</div>';
    }
    html += '</div>';
  }

  html += '<button onclick="closeModal()" style="margin-top:16px;width:100%;padding:10px;border-radius:8px;border:1px solid #dee2e6;background:#fff;cursor:pointer;font-size:14px">닫기</button>';

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('show');
}

function startStaffNewChat(workerId) {
  closeModal();
  openStaffChat(workerId);
}

// ─── 채팅 닫기 ───

function closeStaffChatPanel() {
  staffChatPartner = null;
  var wrap = document.getElementById('chatWrap');
  if (wrap) wrap.classList.remove('chat-open');

  var panel = document.getElementById('chatMainPanel');
  if (panel) panel.innerHTML = '<div class="chat-empty-state"><div class="icon">💬</div><p>대화를 선택하세요</p></div>';

  renderStaffChatContacts();
}

// ─── 폴링 (5초) ───

function startStaffChatPolling() {
  stopStaffChatPolling();
  staffChatPollTimer = setInterval(async function() {
    if (currentTab !== 'chat') { stopStaffChatPolling(); return; }

    await loadStaffChatConversations();
    renderStaffChatContacts();

    if (staffChatPartner) {
      try {
        var res = await sb.from('messages').select('*')
          .or(
            'and(sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + staffChatPartner + '),'
            + 'and(sender_id.eq.' + staffChatPartner + ',receiver_id.eq.' + currentWorker.id + ')'
          )
          .order('created_at', { ascending: true });

        var newData = res.data || [];
        if (newData.length !== staffChatMessages.length) {
          var unreadIds = newData
            .filter(function(m) { return m.receiver_id === currentWorker.id && !m.read_at; })
            .map(function(m) { return m.id; });
          if (unreadIds.length > 0) {
            await sb.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
            newData.forEach(function(m) {
              if (unreadIds.indexOf(m.id) !== -1) m.read_at = new Date().toISOString();
            });
          }
          staffChatMessages = newData;
          renderStaffChatMessages();
          await loadStaffChatConversations();
          renderStaffChatContacts();
        }
      } catch (e) { /* 무시 */ }
    }
  }, 5000);
}

function stopStaffChatPolling() {
  if (staffChatPollTimer) { clearInterval(staffChatPollTimer); staffChatPollTimer = null; }
}

// ─── 유틸 ───

function fmtStaffChatTime(iso) {
  var d = new Date(iso);
  var now = new Date();
  var diff = now - d;

  if (diff < 60000) return '방금';
  if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';

  var t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return t;

  var y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '어제 ' + t;

  return (d.getMonth() + 1) + '/' + d.getDate();
}

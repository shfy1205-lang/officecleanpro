/**
 * admin-chat.js - 관리자 1:1 채팅 모듈
 * 관리자별 격리: RLS가 자동으로 본인 메시지만 반환
 * adminData.workers 를 활용한 직원 조회
 */

let chatConversations = [];
let chatCurrentPartner = null;
let chatMessages = [];
let chatPollTimer = null;

// ─── CSS 주입 ───

function injectChatStyles() {
  if (document.getElementById('chatStyleTag')) return;
  var s = document.createElement('style');
  s.id = 'chatStyleTag';
  s.textContent = [
    '.chat-wrap{display:flex;height:calc(100vh - 130px);background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.chat-sidebar-panel{width:320px;min-width:280px;border-right:1px solid #e9ecef;display:flex;flex-direction:column;background:#fafbfc}',
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
    '.chat-main-panel{flex:1;display:flex;flex-direction:column;min-width:0}',
    '.chat-empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#adb5bd}',
    '.chat-empty-state .icon{font-size:48px;margin-bottom:12px}',
    '.chat-hd{padding:14px 20px;border-bottom:1px solid #e9ecef;display:flex;align-items:center;gap:12px;background:#fafbfc}',
    '.chat-back{display:none;background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;color:#495057}',
    '.chat-hd-name{font-weight:600;font-size:15px}',
    '.chat-hd-role{font-size:12px;color:#868e96;margin-left:4px}',
    '.chat-msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:6px;background:#f8f9fa}',
    '.chat-date-sep{text-align:center;font-size:12px;color:#868e96;margin:12px 0;position:relative}',
    '.chat-date-sep span{background:#f8f9fa;padding:0 12px;position:relative;z-index:1}',
    '.chat-date-sep::before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px solid #dee2e6}',
    '.chat-msg{display:flex;flex-direction:column;max-width:70%}',
    '.chat-msg.mine{align-self:flex-end;align-items:flex-end}',
    '.chat-msg.theirs{align-self:flex-start;align-items:flex-start}',
    '.chat-bubble{padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap}',
    '.chat-msg.mine .chat-bubble{background:#6c5ce7;color:#fff;border-bottom-right-radius:4px}',
    '.chat-msg.theirs .chat-bubble{background:#fff;color:#212529;border:1px solid #e9ecef;border-bottom-left-radius:4px}',
    '.chat-meta{font-size:11px;color:#adb5bd;margin-top:2px;display:flex;gap:6px}',
    '.chat-meta .read{color:#6c5ce7}',
    '.chat-input-area{padding:12px 20px;border-top:1px solid #e9ecef;display:flex;gap:8px;background:#fff}',
    '.chat-input{flex:1;border:1px solid #dee2e6;border-radius:24px;padding:10px 16px;font-size:14px;outline:none;font-family:inherit;resize:none}',
    '.chat-input:focus{border-color:#6c5ce7;box-shadow:0 0 0 2px rgba(108,92,231,.15)}',
    '.chat-send{background:#6c5ce7;color:#fff;border:none;border-radius:24px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap}',
    '.chat-send:hover{background:#5a4bd1}',
    '.chat-send:disabled{background:#adb5bd;cursor:not-allowed}',
    '.chat-new-item{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid #f1f3f5;transition:background .15s}',
    '.chat-new-item:hover{background:#f0f2ff}',
    '.chat-new-role{font-size:12px;color:#868e96}',
    '@media(max-width:768px){',
    '  .chat-sidebar-panel{width:100%}',
    '  .chat-wrap.chat-open .chat-sidebar-panel{display:none}',
    '  .chat-main-panel{display:none}',
    '  .chat-wrap.chat-open .chat-main-panel{display:flex}',
    '  .chat-back{display:block}',
    '  .chat-msg{max-width:85%}',
    '}'
  ].join('\n');
  document.head.appendChild(s);
}

// ─── 메인 렌더 ───

async function renderChat() {
  injectChatStyles();
  var el = $('mainContent');
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#868e96">채팅 로딩 중...</div>';

  await loadChatConversations();

  el.innerHTML = '<div class="chat-wrap" id="chatWrap">'
    + '<div class="chat-sidebar-panel">'
    +   '<div class="chat-sidebar-hd">'
    +     '<h3>메시지</h3>'
    +     '<button class="btn-sm" style="background:#6c5ce7;color:#fff;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px" onclick="showNewChatModal()">+ 새 대화</button>'
    +   '</div>'
    +   '<div class="chat-contacts" id="chatContacts"></div>'
    + '</div>'
    + '<div class="chat-main-panel" id="chatMainPanel">'
    +   '<div class="chat-empty-state"><div class="icon">💬</div><p>대화를 선택하세요</p></div>'
    + '</div>'
    + '</div>';

  renderChatContacts();
  startChatPolling();
}

// ─── 대화 목록 로드 ───

async function loadChatConversations() {
  try {
    var res = await sb.from('messages').select('*')
      .or('sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + currentWorker.id)
      .order('created_at', { ascending: false });

    if (res.error) { console.error('Chat load error:', res.error); return; }

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

    chatConversations = Object.values(map).sort(function(a, b) {
      return new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at);
    });
  } catch (e) {
    console.error('loadChatConversations error:', e);
  }
}

// ─── 연락처 목록 렌더 ───

function renderChatContacts() {
  var el = document.getElementById('chatContacts');
  if (!el) return;

  if (chatConversations.length === 0) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#adb5bd;font-size:14px">아직 대화가 없습니다<br><span style="font-size:12px">위 [+ 새 대화] 버튼으로 시작하세요</span></div>';
    return;
  }

  var html = '';
  for (var i = 0; i < chatConversations.length; i++) {
    var c = chatConversations[i];
    var w = findWorker(c.partnerId);
    var nm = w ? escapeHtml(w.name) : '알 수 없음';
    var role = w ? (w.role === 'admin' ? '관리자' : '직원') : '';
    var avCls = w && w.role === 'admin' ? 'admin-av' : 'staff-av';
    var preview = escapeHtml(c.lastMessage.content.length > 25 ? c.lastMessage.content.substring(0, 25) + '…' : c.lastMessage.content);
    var time = fmtChatTime(c.lastMessage.created_at);
    var isActive = chatCurrentPartner === c.partnerId ? ' active' : '';
    var badge = c.unreadCount > 0 ? '<span class="chat-unread">' + c.unreadCount + '</span>' : '';

    html += '<div class="chat-contact' + isActive + '" onclick="openChat(\'' + c.partnerId + '\')">'
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

async function openChat(partnerId) {
  chatCurrentPartner = partnerId;

  // 모바일: 사이드바 숨기고 채팅 표시
  var wrap = document.getElementById('chatWrap');
  if (wrap) wrap.classList.add('chat-open');

  var panel = document.getElementById('chatMainPanel');
  if (panel) panel.innerHTML = '<div style="padding:40px;text-align:center;color:#868e96">메시지 로딩 중...</div>';

  try {
    var res = await sb.from('messages').select('*')
      .or(
        'and(sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + partnerId + '),'
        + 'and(sender_id.eq.' + partnerId + ',receiver_id.eq.' + currentWorker.id + ')'
      )
      .order('created_at', { ascending: true });

    chatMessages = res.data || [];

    // 읽음 처리
    var unreadIds = chatMessages
      .filter(function(m) { return m.receiver_id === currentWorker.id && !m.read_at; })
      .map(function(m) { return m.id; });

    if (unreadIds.length > 0) {
      await sb.from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
      // 로컬 데이터도 업데이트
      chatMessages.forEach(function(m) {
        if (unreadIds.indexOf(m.id) !== -1) m.read_at = new Date().toISOString();
      });
    }
  } catch (e) {
    console.error('openChat error:', e);
    chatMessages = [];
  }

  renderChatPanel();
  renderChatContacts();
}

// ─── 채팅 패널 렌더 ───

function renderChatPanel() {
  var panel = document.getElementById('chatMainPanel');
  if (!panel) return;

  var w = findWorker(chatCurrentPartner);
  var nm = w ? escapeHtml(w.name) : '알 수 없음';
  var role = w ? (w.role === 'admin' ? '관리자' : '직원') : '';
  var avCls = w && w.role === 'admin' ? 'admin-av' : 'staff-av';

  panel.innerHTML = '<div class="chat-hd">'
    + '<button class="chat-back" onclick="closeChatPanel()">←</button>'
    + '<div class="chat-avatar ' + avCls + '" style="width:36px;height:36px;font-size:14px">' + nm.charAt(0) + '</div>'
    + '<div><span class="chat-hd-name">' + nm + '</span><span class="chat-hd-role">' + role + '</span></div>'
    + '</div>'
    + '<div class="chat-msgs" id="chatMsgs"></div>'
    + '<div class="chat-input-area">'
    +   '<input class="chat-input" id="chatInput" placeholder="메시지를 입력하세요…" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendChatMessage()}">'
    +   '<button class="chat-send" id="chatSendBtn" onclick="sendChatMessage()">전송</button>'
    + '</div>';

  renderChatMessages();
  var inp = document.getElementById('chatInput');
  if (inp) inp.focus();
}

function renderChatMessages() {
  var el = document.getElementById('chatMsgs');
  if (!el) return;

  if (chatMessages.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#adb5bd;margin-top:40px">아직 메시지가 없습니다.<br>첫 메시지를 보내보세요!</div>';
    return;
  }

  var html = '';
  var lastDate = '';
  for (var i = 0; i < chatMessages.length; i++) {
    var m = chatMessages[i];
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

async function sendChatMessage() {
  var input = document.getElementById('chatInput');
  var btn = document.getElementById('chatSendBtn');
  if (!input || !chatCurrentPartner) return;

  var content = input.value.trim();
  if (!content) return;

  input.value = '';
  if (btn) btn.disabled = true;

  try {
    var res = await sb.from('messages')
      .insert({ sender_id: currentWorker.id, receiver_id: chatCurrentPartner, content: content })
      .select().single();

    if (res.error) {
      toast('전송 실패: ' + res.error.message, 'error');
      input.value = content;
      return;
    }

    chatMessages.push(res.data);
    renderChatMessages();
    await loadChatConversations();
    renderChatContacts();
  } catch (e) {
    toast('전송 실패', 'error');
    input.value = content;
  } finally {
    if (btn) btn.disabled = false;
    if (input) input.focus();
  }
}

// ─── 새 대화 모달 ───

function showNewChatModal() {
  var workers = (adminData.workers || []).filter(function(w) {
    return w.id !== currentWorker.id && w.status === 'active';
  });

  var existing = {};
  chatConversations.forEach(function(c) { existing[c.partnerId] = true; });

  // 직원 먼저, 관리자 뒤
  workers.sort(function(a, b) {
    if (a.role === b.role) return a.name.localeCompare(b.name);
    if (a.role === 'admin') return 1;
    return -1;
  });

  var html = '<h3 style="margin:0 0 16px">새 대화 시작</h3>'
    + '<div style="max-height:400px;overflow-y:auto">';

  for (var i = 0; i < workers.length; i++) {
    var w = workers[i];
    var nm = escapeHtml(w.name);
    var roleLabel = w.role === 'admin' ? '관리자' : '직원';
    var avCls = w.role === 'admin' ? 'admin-av' : 'staff-av';
    var extra = existing[w.id] ? ' · 대화 중' : '';

    html += '<div class="chat-new-item" onclick="startNewChat(\'' + w.id + '\')">'
      + '<div class="chat-avatar ' + avCls + '" style="width:38px;height:38px;font-size:14px">' + nm.charAt(0) + '</div>'
      + '<div><div style="font-weight:500;font-size:14px">' + nm + '</div>'
      + '<div class="chat-new-role">' + roleLabel + extra + '</div></div>'
      + '</div>';
  }

  html += '</div><button class="btn-secondary" onclick="closeModal()" style="margin-top:16px;width:100%;padding:10px;border-radius:8px;border:1px solid #dee2e6;background:#fff;cursor:pointer;font-size:14px">닫기</button>';

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('show');
}

function startNewChat(workerId) {
  closeModal();
  openChat(workerId);
}

// ─── 채팅 닫기 (모바일) ───

function closeChatPanel() {
  chatCurrentPartner = null;
  var wrap = document.getElementById('chatWrap');
  if (wrap) wrap.classList.remove('chat-open');

  var panel = document.getElementById('chatMainPanel');
  if (panel) panel.innerHTML = '<div class="chat-empty-state"><div class="icon">💬</div><p>대화를 선택하세요</p></div>';

  renderChatContacts();
}

// ─── 폴링 (5초) ───

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(async function() {
    if (currentTab !== 'chat') { stopChatPolling(); return; }

    await loadChatConversations();
    renderChatContacts();

    if (chatCurrentPartner) {
      try {
        var res = await sb.from('messages').select('*')
          .or(
            'and(sender_id.eq.' + currentWorker.id + ',receiver_id.eq.' + chatCurrentPartner + '),'
            + 'and(sender_id.eq.' + chatCurrentPartner + ',receiver_id.eq.' + currentWorker.id + ')'
          )
          .order('created_at', { ascending: true });

        var newData = res.data || [];
        if (newData.length !== chatMessages.length) {
          // 새 메시지 읽음 처리
          var unreadIds = newData
            .filter(function(m) { return m.receiver_id === currentWorker.id && !m.read_at; })
            .map(function(m) { return m.id; });
          if (unreadIds.length > 0) {
            await sb.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
            newData.forEach(function(m) {
              if (unreadIds.indexOf(m.id) !== -1) m.read_at = new Date().toISOString();
            });
          }
          chatMessages = newData;
          renderChatMessages();
          await loadChatConversations();
          renderChatContacts();
        }
      } catch (e) { /* 무시 */ }
    }
  }, 5000);
}

function stopChatPolling() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
}

// ─── 유틸 ───

function findWorker(id) {
  return (adminData.workers || []).find(function(w) { return w.id === id; });
}

function fmtChatTime(iso) {
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

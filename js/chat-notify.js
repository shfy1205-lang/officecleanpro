/**
 * chat-notify.js - 채팅 알림 시스템
 * Supabase Realtime + 브라우저 알림 + 인앱 뱃지/알림음
 * admin.html, staff.html 양쪽에서 동작
 */

(function() {
  'use strict';

  var _channel = null;
  var _unread = 0;
  var _initDone = false;

  // ─── 초기화 ───

  function initNotify() {
    if (_initDone) return;
    if (typeof sb === 'undefined' || typeof currentWorker === 'undefined' || !currentWorker) {
      setTimeout(initNotify, 1500);
      return;
    }
    _initDone = true;

    // 브라우저 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Supabase Realtime 구독
    _subscribe();

    // 채팅 탭 클릭 감지 → 뱃지 초기화
    document.addEventListener('click', function(e) {
      if (e.target.classList && e.target.classList.contains('tab')) {
        var txt = e.target.textContent.replace(/\d+/g, '').trim();
        if (txt === '채팅') {
          setTimeout(function() { _unread = 0; _updateBadge(); }, 300);
        }
      }
    });
  }

  // ─── Realtime 구독 ───

  function _subscribe() {
    _channel = sb.channel('chat-notify')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'receiver_id=eq.' + currentWorker.id
      }, function(payload) {
        _onNewMessage(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: 'sender_id=eq.' + currentWorker.id
      }, function(payload) {
        _onReadReceipt(payload.new);
      })
      .subscribe();
  }

  // ─── 실시간 읽음 확인 ───

  function _onReadReceipt(msg) {
    if (!msg.read_at) return;

    // admin 페이지: 현재 열린 대화의 메시지면 즉시 반영
    if (typeof chatMessages !== 'undefined' && typeof chatCurrentPartner !== 'undefined'
        && chatCurrentPartner === msg.receiver_id) {
      for (var i = 0; i < chatMessages.length; i++) {
        if (chatMessages[i].id === msg.id) {
          chatMessages[i].read_at = msg.read_at;
          break;
        }
      }
      if (typeof renderChatMessages === 'function') renderChatMessages();
    }

    // staff 페이지: 현재 열린 대화의 메시지메 즉시 반영
    if (typeof staffChatMessages !== 'undefined' && typeof staffChatPartner !== 'undefined'
        && staffChatPartner === msg.receiver_id) {
      for (var i = 0; i < staffChatMessages.length; i++) {
        if (staffChatMessages[i].id === msg.id) {
          staffChatMessages[i].read_at = msg.read_at;
          break;
        }
      }
      if (typeof renderStaffChatMessages === 'function') renderStaffChatMessages();
    }
  }

  // ─── 새 메시지 수신 ───

  function _onNewMessage(msg) {
    // 현재 채팅 탭에서 해당 상대 대화를 보고 있으면 무시
    var onChat = (typeof currentTab !== 'undefined' && currentTab === 'chat');
    var partner = (typeof chatCurrentPartner !== 'undefined') ? chatCurrentPartner
                : (typeof staffChatPartner !== 'undefined') ? staffChatPartner
                : null;

    if (onChat && partner === msg.sender_id) return;

    _unread++;
    _updateBadge();
    _playSound();

    if (document.hidden || !document.hasFocus()) {
      _browserNotify(msg);
    }
  }

  // ─── 인앱 뱃지 ───

  function _updateBadge() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var old = tab.querySelector('.notify-badge');
      if (old) old.remove();

      var raw = tab.textContent.replace(/\d+/g, '').trim();
      if (raw === '채팅' && _unread > 0) {
        var b = document.createElement('span');
        b.className = 'notify-badge';
        b.textContent = _unread > 99 ? '99+' : _unread;
        b.style.cssText = 'background:#ef4444;color:#fff;font-size:10px;font-weight:700;'
          + 'padding:1px 6px;border-radius:10px;margin-left:4px;vertical-align:middle;'
          + 'display:inline-block;min-width:16px;text-align:center;line-height:16px;';
        tab.appendChild(b);
      }
    }

    // 타이틀 업데이트
    var base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = _unread > 0 ? '(' + _unread + ') ' + base : base;
  }

  // ─── 알림음 (Web Audio) ───

  function _playSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      setTimeout(function() { ctx.close(); }, 500);
    } catch (e) { /* 오디오 미지원 무시 */ }
  }

  // ─── 브라우저 알림 ───

  function _browserNotify(msg) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var sender = '새 메시지';
    try {
      if (typeof adminData !== 'undefined' && adminData.workers) {
        var w = adminData.workers.find(function(w) { return w.id === msg.sender_id; });
        if (w) sender = w.name;
      } else if (typeof staffChatWorkerCache !== 'undefined') {
        var sw = staffChatWorkerCache[msg.sender_id];
        if (sw) sender = sw.name;
      }
    } catch (e) {}

    var preview = (msg.content || '').substring(0, 50);
    var n = new Notification('오피스클린프로', {
      body: sender + ': ' + preview,
      tag: 'chat-' + msg.sender_id,
      requireInteraction: false
    });

    n.onclick = function() {
      window.focus();
      var chatBtn = null;
      var tabs = document.querySelectorAll('.tab');
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].textContent.replace(/\d+/g, '').trim() === '채팅') {
          chatBtn = tabs[j]; break;
        }
      }
      if (chatBtn && typeof switchTab === 'function') {
        switchTab('chat', chatBtn);
      }
      n.close();
    };

    setTimeout(function() { n.close(); }, 5000);
  }

  // ─── 시작 ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(initNotify, 2000); });
  } else {
    setTimeout(initNotify, 2000);
  }
})();

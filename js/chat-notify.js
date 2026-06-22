/**
 * chat-notify.js - ì±í ìë¦¼ ìì¤í
 * Supabase Realtime + ë¸ë¼ì°ì  ìë¦¼ + ì¸ì± ë±ì§/ìë¦¼ì
 * admin.html, staff.html ììª½ìì ëì
 */

(function() {
  'use strict';

  var _channel = null;
  var _unread = 0;
  var _initDone = false;

  // âââ ì´ê¸°í âââ

  function initNotify() {
    if (_initDone) return;
    if (typeof sb === 'undefined' || typeof currentWorker === 'undefined' || !currentWorker) {
      setTimeout(initNotify, 1500);
      return;
    }
    _initDone = true;

    // ë¸ë¼ì°ì  ìë¦¼ ê¶í ìì²­
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Supabase Realtime êµ¬ë
    _subscribe();

    // ì±í í­ í´ë¦­ ê°ì§ â ë±ì§ ì´ê¸°í
    document.addEventListener('click', function(e) {
      if (e.target.classList && e.target.classList.contains('tab')) {
        var txt = e.target.textContent.replace(/\d+/g, '').trim();
        if (txt === 'ì±í') {
          setTimeout(function() { _unread = 0; _updateBadge(); }, 300);
        }
      }
    });
  }

  // âââ Realtime êµ¬ë âââ

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

  // âââ ì¤ìê° ì½ì íì¸ âââ

  function _onReadReceipt(msg) {
    if (!msg.read_at) return;

    // admin íì´ì§: íì¬ ì´ë¦° ëíì ë©ìì§ë©´ ì¦ì ë°ì
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

    // staff íì´ì§: íì¬ ì´ë¦° ëíì ë©ìì§ë©´ ì¦ì ë°ì
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

  // âââ ì ë©ìì§ ìì  âââ

  function _onNewMessage(msg) {
    // íì¬ ì±í í­ìì í´ë¹ ìë ëíë¥¼ ë³´ê³  ìì¼ë©´ ë¬´ì
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

  // âââ ì¸ì± ë±ì§ âââ

  function _updateBadge() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var old = tab.querySelector('.notify-badge');
      if (old) old.remove();

      var raw = tab.textContent.replace(/\d+/g, '').trim();
      if (raw === 'ì±í' && _unread > 0) {
        var b = document.createElement('span');
        b.className = 'notify-badge';
        b.textContent = _unread > 99 ? '99+' : _unread;
        b.style.cssText = 'background:#ef4444;color:#fff;font-size:10px;font-weight:700;'
          + 'padding:1px 6px;border-radius:10px;margin-left:4px;vertical-align:middle;'
          + 'display:inline-block;min-width:16px;text-align:center;line-height:16px;';
        tab.appendChild(b);
      }
    }

    // íì´í ìë°ì´í¸
    var base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = _unread > 0 ? '(' + _unread + ') ' + base : base;
  }

  // âââ ìë¦¼ì (Web Audio) âââ

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
    } catch (e) { /* ì¤ëì¤ ë¯¸ì§ì ë¬´ì */ }
  }

  // âââ ë¸ë¼ì°ì  ìë¦¼ âââ

  function _browserNotify(msg) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var sender = 'ì ë©ìì§';
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
    var n = new Notification('ì¤í¼ì¤í´ë¦°íë¡', {
      body: sender + ': ' + preview,
      tag: 'chat-' + msg.sender_id,
      requireInteraction: false
    });

    n.onclick = function() {
      window.focus();
      var chatBtn = null;
      var tabs = document.querySelectorAll('.tab');
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].textContent.replace(/\d+/g, '').trim() === 'ì±í') {
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

  // âââ ìì âââ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(initNotify, 2000); });
  } else {
    setTimeout(initNotify, 2000);
  }
})();

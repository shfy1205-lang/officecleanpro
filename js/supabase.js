/**
 * supabase.js - Supabase í´ë¼ì´ì¸í¸ ì´ê¸°í ë° ê³µíµ ì í¸
 *
 * ì­í :
 * - Supabase í´ë¼ì´ì¸í¸ ìì± (ì ì­ sb ë³ì)
 * - ì¸ì ì²´í¬ / íì¬ ì ì  ì ë³´ ë¡ë
 * - ì¸ì¦ ê°ë (requireAuth)
 * - ê³µíµ í¬í¼ í¨ì (toast, fmt ë±)
 *
 * ì°¸ì¡° íì´ë¸: workers (auth_user_id, role, name, status)
 */

// âââ ê¸°ë³¸ ì¤ì  âââ
const DEFAULT_SUPA_URL = 'https://gcbgzfrffekgcaktspyj.supabase.co';
const DEFAULT_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYmd6ZnJmZmVrZ2Nha3RzcHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NDU2MjMsImV4cCI6MjA4OTAyMTYyM30.sdWUgFWhUXcumkfAYBF6sShkd9xICe77U-D2mEedCWM';

// âââ ì ì­ ë³ì âââ
let sb = null;
let currentUser = null;    // auth.users row
let currentWorker = null;  // workers row

// âââ Supabase ì´ê¸°í âââ

/**
 * Supabase í´ë¼ì´ì¸í¸ ìì±
 * @returns {boolean} ì±ê³µ ì¬ë¶
 */
function initSupabase(url, key) {
  if (!url || !key) return false;
  try {
    sb = window.supabase.createClient(url, key);
    return true;
  } catch (e) {
    console.error('Supabase init failed:', e);
    return false;
  }
}

/**
 * localStorageìì ì¤ì  ì½ì´ì ì´ê¸°í ìë (ê¸°ë³¸ê° í´ë°±)
 * @returns {boolean}
 */
function initFromStorage() {
  const url = localStorage.getItem('supa_url') || DEFAULT_SUPA_URL;
  const key = localStorage.getItem('supa_key') || DEFAULT_SUPA_KEY;
  return initSupabase(url, key);
}

// âââ ì¸ì / íë¡í âââ

/**
 * íì¬ ì¸ì íì¸ + workers íë¡í ë¡ë
 * @returns {Object|null} { user, worker } ëë null
 */
async function loadSession() {
  if (!sb) return null;

  try {
    const { data: { session }, error: sessionErr } = await sb.auth.getSession();
    if (sessionErr || !session) return null;

    currentUser = session.user;

    const { data: worker, error: workerErr } = await sb.from('workers')
      .select('*')
      .eq('auth_user_id', currentUser.id)
      .single();

    if (workerErr || !worker) {
      console.error('Worker profile not found:', workerErr?.message);
      return null;
    }

    currentWorker = worker;
    return { user: currentUser, worker: currentWorker };
  } catch (e) {
    console.error('loadSession error:', e);
    return null;
  }
}

/**
 * ì­í  ì²´í¬
 */
function isAdmin() {
  return currentWorker?.role === 'admin';
}

/**
 * ë¡ê·¸ìì
 */
async function logout() {
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
  }
  currentUser = null;
  currentWorker = null;
  location.href = 'index.html';
}

/**
 * ì¸ì¦ ê°ë â ë¡ê·¸ì¸ ì ëì´ ìì¼ë©´ index.htmlë¡ ë¦¬ë¤ì´ë í¸
 * @param {string} [requiredRole] - 'admin' ëë 'staff' (ì í)
 * @returns {Promise<boolean>}
 */
async function requireAuth(requiredRole) {
  // 1) Supabase í´ë¼ì´ì¸í¸ ì´ê¸°í
  if (!sb) {
    const ok = initFromStorage();
    if (!ok) {
      location.href = 'index.html';
      return false;
    }
  }

  // 2) ì¸ì + worker íë¡í ë¡ë
  const session = await loadSession();
  if (!session) {
    location.href = 'index.html';
    return false;
  }

  // 3) ì­í  ì²´í¬
  if (requiredRole && currentWorker.role !== requiredRole) {
    if (currentWorker.role === 'admin') {
      location.href = 'admin.html';
    } else {
      location.href = 'staff.html';
    }
    return false;
  }

  return true;
}

// âââ ê³µíµ ì í¸ âââ

/** ì«ì í¬ë§· (1,234,567) */
function fmt(n) {
  return (n || 0).toLocaleString('ko-KR');
}

/** í ì¤í¸ ë©ìì§ */
function toast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach(el => el.remove());

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 2700);
}

/** ì¤ë ë ì§ (YYYY-MM-DD) */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** íì¬ ì (YYYY-MM) */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** DOM í¬í¼ */
function $(id) {
  return document.getElementById(id);
}

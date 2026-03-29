/**
 * supabase.js - Supabase 클라이언트 초기화 및 공통 유틸
 *
 * 역할:
 * - Supabase 클라이언트 생성 (전역 sb 변수)
 * - 세션 체크 / 현재 유저 정보 로드
 * - 인증 가드 (requireAuth)
 * - 공통 헬퍼 함수 (toast, fmt 등)
 *
 * 참조 테이블: workers (auth_user_id, role, name, status)
 */

// ─── 기본 설정 ───
const DEFAULT_SUPA_URL = 'https://gcbgzfrffekgcaktspyj.supabase.co';
const DEFAULT_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYmd6ZnJmZmVrZ2Nha3RzcHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NDU2MjMsImV4cCI6MjA4OTAyMTYyM30.sdWUgFWhUXcumkfAYBF6sShkd9xICe77U-D2mEedCWM';

// ─── 전역 변수 ───
let sb = null;
let currentUser = null;    // auth.users row
let currentWorker = null;  // workers row

// ─── Supabase 초기화 ───

/**
 * Supabase 클라이언트 생성
 * @returns {boolean} 성공 여부
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
 * localStorage에서 설정 읽어서 초기화 시도 (기본값 폴백)
 * @returns {boolean}
 */
function initFromStorage() {
  const url = localStorage.getItem('supa_url') || DEFAULT_SUPA_URL;
  const key = localStorage.getItem('supa_key') || DEFAULT_SUPA_KEY;
  return initSupabase(url, key);
}

// ─── 세션 / 프로필 ───

/**
 * 현재 세션 확인 + workers 프로필 로드
 * @returns {Object|null} { user, worker } 또는 null
 */
async function loadSession() {
    if (!sb) return null;
    try {
        // 5초 타임아웃: getSession
        const sessionResult = await Promise.race([
            sb.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 5000))
        ]);
        const { data: { session }, error: sessionErr } = sessionResult;
        if (sessionErr || !session) return null;

        currentUser = session.user;

        // 5초 타임아웃: workers 쿼리
        const workerResult = await Promise.race([
            sb.from('workers').select('*').eq('auth_user_id', currentUser.id).single(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('worker query timeout')), 5000))
        ]);
        const { data: worker, error: workerErr } = workerResult;
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
 * 역할 체크
 */
function isAdmin() {
  return currentWorker?.role === 'admin';
}

function isEcoUser() {
  return currentWorker?.role === 'eco';
}

/**
 * 로그아웃
 */
async function logout() {
  if (sb) {
    try { await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
  }
  currentUser = null;
  currentWorker = null;
  localStorage.removeItem('ocp_remember');
  sessionStorage.removeItem('ocp_session_active');
  location.href = 'index.html';
}

/**
 * 인증 가드 — 로그인 안 되어 있으면 index.html로 리다이렉트
 * @param {string} [requiredRole] - 'admin' 또는 'staff' (선택)
 * @returns {Promise<boolean>}
 */
async function requireAuth(requiredRole) {
  // 1) Supabase 클라이언트 초기화
  if (!sb) {
    const ok = initFromStorage();
    if (!ok) {
      location.href = 'index.html';
      return false;
    }
  }

  // 1-1) "로그인 상태 유지" 안 한 경우: 브라우저 새로 열메 로그아웃
  const remember = localStorage.getItem('ocp_remember');
  const sessionActive = sessionStorage.getItem('ocp_session_active');
  if (remember !== 'true' && !sessionActive) {
    try { await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
    location.href = 'index.html';
    return false;
  }

  // 2) 세션 + worker 프로필 로드
  const session = await loadSession();
  if (!session) {
    location.href = 'index.html';
    return false;
  }

  // 세션 활성 표시
  sessionStorage.setItem('ocp_session_active', 'true');

  // 3) 역할 체크
  if (requiredRole && currentWorker.role !== requiredRole) {
    // eco 사용자도 admin 페이지 접근 허용 (에코관리 탭만 표시)
    if (requiredRole === 'admin' && currentWorker.role === 'eco') {
      return true;
    }
    if (currentWorker.role === 'admin' || currentWorker.role === 'eco') {
      location.href = 'admin.html';
    } else {
      location.href = 'staff.html';
    }
    return false;
  }

  return true;
}

// ─── 공통 유틸 ───

/** 숫자 포맷 (1,234,567) */
function fmt(n) {
  return (n || 0).toLocaleString('ko-KR');
}

/** 토스트 메시지 */
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

/** 오늘 날짜 (YYYY-MM-DD) - 한국 시간(로컬) 기준 */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 현재 월 (YYYY-MM) */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** DOM 헬퍼 */
function $(id) {
  return document.getElementById(id);
}

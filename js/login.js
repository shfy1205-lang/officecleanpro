/**
 * login.js - 로그인 / Supabase 설정 처리
 *
 * 역할:
 * - 이메일+비밀번호 로그인 (Supabase Auth)
 * - Supabase URL/Key 설정 (localStorage 저장)
 * - 로그인 성공 시 workers 테이블에서 role 확인
 * - role = admin → admin.html 이동
 * - role = staff → staff.html 이동
 * - workers에 프로필 없으면 에러 처리
 *
 * 참조 테이블: workers (auth_user_id, role, name, status)
 */

// ─── 페이지 초기화 ───

document.addEventListener('DOMContentLoaded', async () => {
  const loading = $('loading');
  const loginScreen = $('loginScreen');

  // 1) Supabase 초기화 시도
  const hasConfig = initFromStorage();

  if (hasConfig) {
    // 1-1) "로그인 상태 유지" 체크 안 했으면 브라우저 닫았다 열면 자동 로그아웃
    const remember = localStorage.getItem('ocp_remember');
    const sessionActive = sessionStorage.getItem('ocp_session_active');

    if (remember !== 'true' && !sessionActive) {
      // 브라우저가 새로 열렸고, remember가 꺼져 있음 → 세션 만료 처리
      try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
    }

    // 2) 이미 로그인 세션이 있으면 바로 리다이렉트
    const session = await loadSession();
    if (session) {
      // 세션 활성 표시 (탭/브라우저 닫히면 사라짐)
      sessionStorage.setItem('ocp_session_active', 'true');
      redirectByRole();
      return;
    }
  }

  // 3) 로그인 화면 표시
  loading.classList.add('hidden');
  loginScreen.style.display = 'flex';

  // 3-1) 이전 remember 설정 복원
  const rememberBox = $('rememberMe');
  if (rememberBox) {
    rememberBox.checked = localStorage.getItem('ocp_remember') === 'true';
  }

  // 4) 설정이 없으면 설정 패널 자동 오픈
  if (!hasConfig) {
    toggleSettings();
  }
});

// ─── 로그인 ───

/**
 * 로그인 실행
 * - Supabase Auth signInWithPassword
 * - 성공 시 workers 테이블에서 role 조회
 * - role에 따라 admin.html 또는 staff.html로 이동
 */
async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pw = $('loginPw').value.trim();

  // 입렕값 검증
  if (!email || !pw) {
    return toast('이메일과 비밀번호를 입력하세요', 'error');
  }

  // Supabase 클라이언트 확인
  if (!sb) {
    const ok = initFromStorage();
    if (!ok) {
      return toast('먼저 Supabase 설정으 해주세요', 'error');
    }
  }

  // 버튼 비활성화 (중복 클릭 방지)
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = '로그인 중...';

  try {
    // ── Step 1: Supabase Auth 로그인 ──
    const { data: authData, error: authError } =
      await sb.auth.signInWithPassword({ email, password: pw });

    if (authError) {
      btn.disabled = false;
      btn.textContent = '로그인';

      // 에러 메시지 한글화
      const msg = translateAuthError(authError.message);
      return toast(msg, 'error');
    }

    // ── Step 2: workers 테이블에서 프로필 조회 ──
    const { data: worker, error: workerError } = await sb.from('workers')
      .select('id, name, role, status')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (workerError || !worker) {
      btn.disabled = false;
      btn.textContent = '로그인';
      // 로그인은 됐지만 프로필이 없음 → 로그아웃 처리
      await sb.auth.signOut();
      return toast('직원 정보가 등록되지 않았습니다. 관리자에게 문의하세요.', 'error');
    }

    // ── Step 3: 비활성 계정 체크 ──
    if (worker.status === 'inactive') {
      btn.disabled = false;
      btn.textContent = '로그인';
      await sb.auth.signOut();
      return toast('비활성화된 계정입니다. 관리자에게 문의하세요.', 'error');
    }

    // ── Step 4: 전역 변수 설정 ──
    currentUser = authData.user;
    currentWorker = worker;

    // ── Step 4-1: 로그인 상태 유지 설정 저장 ──
    const rememberChecked = $('rememberMe')?.checked;
    if (rememberChecked) {
      localStorage.setItem('ocp_remember', 'true');
    } else {
      localStorage.removeItem('ocp_remember');
    }
    // 현재 세션 활성 표시 (브라우저 닫히메 sessionStorage는 자동 삭제됨)
    sessionStorage.setItem('ocp_session_active', 'true');

    // ── Step 5: 역할별 리다이렉트 ──
    toast(`${worker.name}님 환영합니다!`);
    setTimeout(() => redirectByRole(), 500);

  } catch (e) {
    btn.disabled = false;
    btn.textContent = '로그인';
    console.error('Login error:', e);
    toast('로그인 중 오류가 발생했습니다.', 'error');
  }
}

/**
 * 역할별 페이지 이동
 */
function redirectByRole() {
  if (isAdmin() || isEcoUser()) {
    location.href = 'admin.html';
  } else {
    location.href = 'staff.html';
  }
}

/**
 * Supabase Auth 에러 메시지 한글화
 */
function translateAuthError(msg) {
  const map = {
    'Invalid login credentials':          '이메일 또는 비밀번호가 올바르지 않습니다.',
    'Email not confirmed':                '이메일 인증이 완료되지 않았습니다.',
    'Database error querying schema':     '데이터베이스 오류입니다. 관리자에게 문의하세요.',
    'For security purposes, you can only request this after': '보안상 잠시 후 다시 시도해주세요.',
    'User already registered':            '이미 등록된 사용자입니다.',
  };

  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}

// ─── Supabase 설정 패널 ───

/**
 * 설정 패널 토글
 */
function toggleSettings() {
  const panel = $('settingsPanel');
  panel.classList.toggle('show');

  // 현재 저장된 값 표시
  $('supaUrl').value =
    localStorage.getItem('supa_url') || 'https://gcbgzfrffekgcaktspyj.supabase.co';
  $('supaKey').value =
    localStorage.getItem('supa_key') || '';
}

/**
 * Supabase 설정 저장
 */
function saveSettings() {
  const url = $('supaUrl').value.trim();
  const key = $('supaKey').value.trim();

  // 검증
  if (!url || !key) {
    return toast('URL과 Key를 모두 입력하세요', 'error');
  }
  if (!url.startsWith('https://')) {
    return toast('URL은 https://로 시작해야 합니다', 'error');
  }

  // 저장 + 초기화
  localStorage.setItem('supa_url', url);
  localStorage.setItem('supa_key', key);

  const ok = initSupabase(url, key);
  if (!ok) {
    return toast('연결에 실패했습니다. URL과 Key를 확인하세요', 'error');
  }

  toggleSettings();
  toast('설정이 저장되었습니다');
}

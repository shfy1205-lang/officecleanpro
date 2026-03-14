/**
 * login.js - ë¡ê·¸ì¸ / Supabase ì¤ì  ì²ë¦¬
 *
 * ì­í :
 * - ì´ë©ì¼+ë¹ë°ë²í¸ ë¡ê·¸ì¸ (Supabase Auth)
 * - Supabase URL/Key ì¤ì  (localStorage ì ì¥)
 * - ë¡ê·¸ì¸ ì±ê³µ ì workers íì´ë¸ìì role íì¸
 * - role = admin â admin.html ì´ë
 * - role = staff â staff.html ì´ë
 * - workersì íë¡í ìì¼ë©´ ìë¬ ì²ë¦¬
 *
 * ì°¸ì¡° íì´ë¸: workers (auth_user_id, role, name, status)
 */

// âââ íì´ì§ ì´ê¸°í âââ

document.addEventListener('DOMContentLoaded', async () => {
  const loading = $('loading');
  const loginScreen = $('loginScreen');

  // 1) Supabase ì´ê¸°í ìë
  const hasConfig = initFromStorage();

  if (hasConfig) {
    // 2) ì´ë¯¸ ë¡ê·¸ì¸ ì¸ìì´ ìì¼ë©´ ë°ë¡ ë¦¬ë¤ì´ë í¸
    const session = await loadSession();
    if (session) {
      redirectByRole();
      return;
    }
  }

  // 3) ë¡ê·¸ì¸ íë©´ íì
  loading.classList.add('hidden');
  loginScreen.style.display = 'flex';

  // 4) ì¤ì ì´ ìì¼ë©´ ì¤ì  í¨ë ìë ì¤í
  if (!hasConfig) {
    toggleSettings();
  }
});

// âââ ë¡ê·¸ì¸ âââ

/**
 * ë¡ê·¸ì¸ ì¤í
 * - Supabase Auth signInWithPassword
 * - ì±ê³µ ì workers íì´ë¸ìì role ì¡°í
 * - roleì ë°ë¼ admin.html ëë staff.htmlë¡ ì´ë
 */
async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pw = $('loginPw').value.trim();

  // ìë ¥ê° ê²ì¦
  if (!email || !pw) {
    return toast('ì´ë©ì¼ê³¼ ë¹ë°ë²í¸ë¥¼ ìë ¥íì¸ì', 'error');
  }

  // Supabase í´ë¼ì´ì¸í¸ íì¸
  if (!sb) {
    const ok = initFromStorage();
    if (!ok) {
      return toast('ë¨¼ì  Supabase ì¤ì ì í´ì£¼ì¸ì', 'error');
    }
  }

  // ë²í¼ ë¹íì±í (ì¤ë³µ í´ë¦­ ë°©ì§)
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'ë¡ê·¸ì¸ ì¤...';

  try {
    // ââ Step 1: Supabase Auth ë¡ê·¸ì¸ ââ
    const { data: authData, error: authError } =
      await sb.auth.signInWithPassword({ email, password: pw });

    if (authError) {
      btn.disabled = false;
      btn.textContent = 'ë¡ê·¸ì¸';

      // ìë¬ ë©ìì§ íê¸í
      const msg = translateAuthError(authError.message);
      return toast(msg, 'error');
    }

    // ââ Step 2: workers íì´ë¸ìì íë¡í ì¡°í ââ
    const { data: worker, error: workerError } = await sb.from('workers')
      .select('id, name, role, status')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (workerError || !worker) {
      btn.disabled = false;
      btn.textContent = 'ë¡ê·¸ì¸';
      // ë¡ê·¸ì¸ì ëì§ë§ íë¡íì´ ìì â ë¡ê·¸ìì ì²ë¦¬
      await sb.auth.signOut();
      return toast('ì§ì ì ë³´ê° ë±ë¡ëì§ ìììµëë¤. ê´ë¦¬ììê² ë¬¸ìíì¸ì.', 'error');
    }

    // ââ Step 3: ë¹íì± ê³ì  ì²´í¬ ââ
    if (worker.status === 'inactive') {
      btn.disabled = false;
      btn.textContent = 'ë¡ê·¸ì¸';
      await sb.auth.signOut();
      return toast('ë¹íì±íë ê³ì ìëë¤. ê´ë¦¬ììê² ë¬¸ìíì¸ì.', 'error');
    }

    // ââ Step 4: ì ì­ ë³ì ì¤ì  ââ
    currentUser = authData.user;
    currentWorker = worker;

    // ââ Step 5: ì­í ë³ ë¦¬ë¤ì´ë í¸ ââ
    toast(`${worker.name}ë íìí©ëë¤!`);
    setTimeout(() => redirectByRole(), 500);

  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'ë¡ê·¸ì¸';
    console.error('Login error:', e);
    toast('ë¡ê·¸ì¸ ì¤ ì¤ë¥ê° ë°ìíìµëë¤.', 'error');
  }
}

/**
 * ì­í ë³ íì´ì§ ì´ë
 */
function redirectByRole() {
  if (isAdmin()) {
    location.href = 'admin.html';
  } else {
    location.href = 'staff.html';
  }
}

/**
 * Supabase Auth ìë¬ ë©ìì§ íê¸í
 */
function translateAuthError(msg) {
  const map = {
    'Invalid login credentials':          'ì´ë©ì¼ ëë ë¹ë°ë²í¸ê° ì¬ë°ë¥´ì§ ììµëë¤.',
    'Email not confirmed':                'ì´ë©ì¼ ì¸ì¦ì´ ìë£ëì§ ìììµëë¤.',
    'Database error querying schema':     'ë°ì´í°ë² ì´ì¤ ì¤ë¥ìëë¤. ê´ë¦¬ììê² ë¬¸ìíì¸ì.',
    'For security purposes, you can only request this after': 'ë³´ìì ì ì í ë¤ì ìëí´ì£¼ì¸ì.',
    'User already registered':            'ì´ë¯¸ ë±ë¡ë ì¬ì©ììëë¤.',
  };

  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}

// âââ Supabase ì¤ì  í¨ë âââ

/**
 * ì¤ì  í¨ë í ê¸
 */
function toggleSettings() {
  const panel = $('settingsPanel');
  panel.classList.toggle('show');

  // íì¬ ì ì¥ë ê° íì
  $('supaUrl').value =
    localStorage.getItem('supa_url') || 'https://gcbgzfrffekgcaktspyj.supabase.co';
  $('supaKey').value =
    localStorage.getItem('supa_key') || '';
}

/**
 * Supabase ì¤ì  ì ì¥
 */
function saveSettings() {
  const url = $('supaUrl').value.trim();
  const key = $('supaKey').value.trim();

  // ê²ì¦
  if (!url || !key) {
    return toast('URLê³¼ Keyë¥¼ ëª¨ë ìë ¥íì¸ì', 'error');
  }
  if (!url.startsWith('https://')) {
    return toast('URLì https://ë¡ ììí´ì¼ í©ëë¤', 'error');
  }

  // ì ì¥ + ì´ê¸°í
  localStorage.setItem('supa_url', url);
  localStorage.setItem('supa_key', key);

  const ok = initSupabase(url, key);
  if (!ok) {
    return toast('ì°ê²°ì ì¤í¨íìµëë¤. URLê³¼ Keyë¥¼ íì¸íì¸ì', 'error');
  }

  toggleSettings();
  toast('ì¤ì ì´ ì ì¥ëììµëë¤');
}

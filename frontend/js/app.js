/* ══════════════════════════════════════════════
   MediMind — Core App: State, Routing, Auth
   js/app.js  (load this FIRST before triage.js)
══════════════════════════════════════════════ */

// Backend API base URL.
// Locally this auto-resolves to your local FastAPI server.
// In production, set window.MEDIMIND_API_BASE_URL in index.html (see config below)
// to your deployed backend's URL, e.g. https://medimind-backend.onrender.com/api
const API = window.MEDIMIND_API_BASE_URL || (
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000/api'
    : 'https://YOUR-BACKEND-URL.onrender.com/api' // <-- replace after deploying the backend
);

// ── Global state ───────────────────────────────────────────────
let token        = localStorage.getItem('mm_token');
let currentUser  = JSON.parse(localStorage.getItem('mm_user') || 'null');
let currentSessionId = null;
let authView = 'login';
let passwordResetState = { step: 'email', email: '', code: '' };
let firebaseAuth = null;

// Page shown right after sign-in (and when an already signed-in user reopens the site).
// Options: 'home' | 'triage' (Symptom Check) | 'history' | 'dashboard' (My Health)
const POST_LOGIN_PAGE = 'triage';

// ── Backend wake-up ────────────────────────────────────────────
// Free hosting puts the backend to sleep when idle. Ping /health until it answers
// so sign-in / sign-up don't fail with "Failed to fetch" while it is starting.
// "Awake" is only trusted for a few minutes: the free server can go back to sleep
// (or restart during a deploy) while this page stays open.
let _backendAwakeAt = 0;
const AWAKE_TTL_MS = 3 * 60 * 1000;
function serverRoot() { return String(API).replace(/\/api\/?$/, ''); }

// A sleeping SnapDeploy container is only started by its own "wake page" (it runs JavaScript),
// a plain fetch() does NOT wake it. So we load that page in a hidden frame, exactly like
// opening the /health link by hand — but automatically.
let _wakeFrame = null, _wakeFrameAt = 0;
function triggerWakePage() {
  if (!document.body || Date.now() - _wakeFrameAt < 90000) return;
  _wakeFrameAt = Date.now();
  try {
    if (_wakeFrame && _wakeFrame.remove) _wakeFrame.remove();
    const f = document.createElement('iframe');
    f.src = serverRoot() + '/health';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(f);
    _wakeFrame = f;
  } catch (e) { /* best effort */ }
}
function removeWakeFrame() {
  try { if (_wakeFrame && _wakeFrame.remove) _wakeFrame.remove(); } catch (e) {}
  _wakeFrame = null;
}

async function ensureBackendAwake(onStatus) {
  if (Date.now() - _backendAwakeAt < AWAKE_TTL_MS) return true;
  const started = Date.now();
  const LIMIT_MS = 180000;
  while (Date.now() - started < LIMIT_MS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(API + '/health', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (r.ok) { _backendAwakeAt = Date.now(); removeWakeFrame(); return true; }
    } catch (e) { /* still waking up (or blocked by CORS) */ }
    triggerWakePage();   // first failed ping => the server is probably asleep: wake it
    if (onStatus) onStatus(Math.round((Date.now() - started) / 1000));
    await new Promise(res => setTimeout(res, 3000));
  }
  return false;
}

// Friendly progress while the free server wakes up (neutral colour, not an error).
function styleAsInfo(el) {
  el.style.color = '#0f766e'; el.style.background = '#ecfdf5'; el.style.borderColor = '#a7f3d0';
}
function showAuthInfo(mode, msg) {
  const el = getAuthErrorElement(mode);
  if (!el) return;
  el.textContent = msg; styleAsInfo(el); el.style.display = 'block';
}
function showWakeHelp(mode) {
  const el = getAuthErrorElement(mode);
  if (!el) return;
  el.textContent = 'The free server is taking a while to wake up. This page keeps trying by itself. If nothing happens, tap here, wait until it shows "ok", then come back: ';
  const link = document.createElement('a');
  link.href = serverRoot() + '/health'; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = 'Wake the server';
  link.style.cssText = 'font-weight:700;text-decoration:underline';
  if (el.appendChild) el.appendChild(link);
  styleAsInfo(el); el.style.display = 'block';
}
// Returns the progress callback used while waiting for the server.
function wakeProgress(mode, btn) {
  let helped = false;
  return (s) => {
    if (btn) btn.textContent = `Waking up server… ${s}s`;
    if (s >= 25 && !helped) { helped = true; showWakeHelp(mode); }
    else if (!helped) showAuthInfo(mode, `Waking up the free server… ${s}s. This can take 1–2 minutes — please keep this page open.`);
  };
}

// Shown when the server never answered. Gives the user two quick checks instead of a dead end.
function serverUnreachableMessage() {
  const root = String(API).replace(/\/api\/?$/, '');
  return `The MediMind server did not respond. The free server sleeps when idle and can take 1–2 minutes to wake up, so please try again. ` +
         `If it keeps failing, open ${root}/health in a new tab: if it shows "ok" but this page still fails, the server's ALLOWED_ORIGINS must include ${location.origin}; ` +
         `if it does not load at all, check your internet connection (a VPN, ad-blocker or data-saver can block it).`;
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ensureBackendAwake();   // start waking the server as soon as the page opens
  initFirebaseAuth();
  updateNav();
  showPage(token ? POST_LOGIN_PAGE : 'login');
  // Silently request geolocation so it's ready when triage result shows
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => { window._userLat = pos.coords.latitude; window._userLng = pos.coords.longitude; },
      ()  => {},
      { timeout: 10000 }
    );
  }
});

// ── Navigation ─────────────────────────────────────────────────
function showPage(name, tabEl) {
  if ((name === 'triage' || name === 'dashboard' || name === 'history') && !token) {
    showPage('login');
    toast('Please sign in to continue', 'error');
    return;
  }

  const authPages = ['login', 'register', 'forgot'];
  const nav = document.getElementById('top-nav');
  if (nav) nav.classList.toggle('hidden', authPages.includes(name));

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
  const map = { home: 'nav-home', triage: 'nav-triage', history: 'nav-history', dashboard: 'nav-dashboard', login: 'nav-home', register: 'nav-home', forgot: 'nav-home' };
  if (tabEl) tabEl.classList.add('active');
  else document.getElementById(map[name])?.classList.add('active');
  if (name === 'history') loadHistory();
  if (name === 'dashboard') initDashboard();
  if (name === 'forgot') renderForgotPage();
  updateNav();
}

function initFirebaseAuth() {
  const cfg = window.MEDIMIND_FIREBASE_CONFIG || {};
  const hasConfig = cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId;
  if (!hasConfig || !window.firebase) return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    firebaseAuth = firebase.auth();
  } catch (e) {
    console.warn('Firebase Auth init failed', e);
  }
}

// ── Nav rendering ──────────────────────────────────────────────
function updateNav() {
  const nr = document.getElementById('nav-right');
  if (!nr) return;
  const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
  const isAuthPage = ['login', 'register', 'forgot'].includes(activePage);
  if (currentUser) {
    // Hide the top-right profile/logout buttons when the user is on the dashboard
    // since the dashboard already exposes Profile Settings and Logout there.
    if (activePage === 'dashboard') {
      nr.innerHTML = '';
    } else {
      const name = (currentUser.full_name || 'User').split(' ')[0];
      nr.innerHTML = `
        <button class="btn-outline" onclick="goToProfile()">⚙️ Profile</button>
        <button class="btn-solid" onclick="logout()">Logout</button>`;
    }
  } else if (isAuthPage) {
    nr.innerHTML = '';
  } else {
    nr.innerHTML = `
      <button class="btn-solid" onclick="showPage('register')">Get Started</button>`;
  }
}

function goToProfile() {
  showPage('dashboard');
  setTimeout(() => {
    const accountTab = document.querySelector('.dash-tab[data-tab="account"]');
    if (accountTab) {
      switchDashTab('account', accountTab);
    } else {
      const fallback = Array.from(document.querySelectorAll('.dash-tab')).find(btn => (btn.textContent || '').includes('Account'));
      if (fallback) switchDashTab('account', fallback);
    }
  }, 80);
}

// ── Auth Modal ─────────────────────────────────────────────────
function openModal(mode = 'login') {
  if (mode === 'forgot') {
    authView = 'forgot';
    passwordResetState = { step: 'email', email: '', code: '' };
    document.getElementById('auth-modal').classList.add('open');
    renderModal(authView);
    return;
  }
  showPage(mode === 'register' ? 'register' : 'login');
}

function renderModal(mode = 'login') {
  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const resetStep = passwordResetState.step || 'email';
  const resetEmail = passwordResetState.email || '';
  const resetCode = passwordResetState.code || '';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-logo">🧠</div>
    <div class="modal-h1">${isForgot ? 'Reset access' : (isLogin ? 'Welcome back' : 'Create account')}</div>
    <div class="modal-sub">${isForgot ? 'Verify your email and create a new password' : (isLogin ? 'Sign in to view your history and download PDF reports' : 'Free account — save triage history, download PDF reports')}</div>
    <div style="display:flex;justify-content:center;gap:8px;margin:16px 0 8px">
      <button class="${isLogin ? 'modal-submit' : 'btn-outline'}" style="padding:8px 14px;min-width:90px" onclick="renderModal('login')">Login</button>
      <button class="${isRegister ? 'modal-submit' : 'btn-outline'}" style="padding:8px 14px;min-width:100px" onclick="renderModal('register')">Register</button>
      <button class="${isForgot ? 'modal-submit' : 'btn-outline'}" style="padding:8px 14px;min-width:110px" onclick="renderModal('forgot')">Forgot</button>
    </div>
    <div id="modal-err" class="modal-err" style="display:none"></div>
    ${isForgot ? `
      ${resetStep === 'email' ? `
        <div class="modal-field">
          <div class="modal-field-label">Email Address</div>
          <input type="email" id="m-email" value="${resetEmail}" placeholder="you@example.com" autocomplete="email"/>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">We will create a temporary verification code for your account.</div>
      ` : `
        <div class="modal-field">
          <div class="modal-field-label">Verification Code</div>
          <input type="text" id="m-code" value="${resetCode}" placeholder="Enter the code" autocomplete="one-time-code"/>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">New Password</div>
          <input type="password" id="m-new-pass" placeholder="Minimum 6 characters" autocomplete="new-password"/>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Confirm Password</div>
          <input type="password" id="m-conf-pass" placeholder="Repeat your new password" autocomplete="new-password"/>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">Verification code is linked to ${resetEmail}</div>
      `}` : ''}
    ${!isForgot ? `
      ${!isLogin ? `
      <div class="modal-field">
        <div class="modal-field-label">Full Name</div>
        <input type="text" id="m-name" placeholder="Your full name" autocomplete="name"/>
      </div>` : ''}
      <div class="modal-field">
        <div class="modal-field-label">Email Address</div>
        <input type="email" id="m-email" placeholder="you@example.com" autocomplete="email"/>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Password</div>
        <input type="password" id="m-pass"
          placeholder="${isLogin ? 'Your password' : 'Minimum 6 characters'}"
          autocomplete="${isLogin ? 'current-password' : 'new-password'}"
          onkeydown="if(event.key==='Enter') submitAuth('${mode}')"/>
      </div>
    ` : ''}
    <button class="modal-submit" id="modal-btn" onclick="submitAuth('${mode}')">
      ${isForgot ? (resetStep === 'email' ? 'Send verification code →' : 'Update password →') : (isLogin ? 'Sign In →' : 'Create Account →')}
    </button>
    <div class="modal-divider">or</div>
    <div class="modal-switch">
      ${isLogin ? `No account? <a onclick="renderModal('register')">Sign up free</a>` : (isRegister ? `Already have one? <a onclick="renderModal('login')">Sign in</a>` : `Back to <a onclick="renderModal('login')">login</a>`)}
    </div>`;
}

async function submitAuth(mode) {
  const btn = mode === 'login'
    ? document.getElementById('login-submit-btn')
    : mode === 'register'
      ? document.getElementById('register-submit-btn')
      : (document.getElementById('forgot-submit-btn') || document.getElementById('modal-btn'));

  // First non-empty value among the given ids (works for both the full pages and the pop-up form).
  function getFieldValue(keys) {
    for (const k of keys) {
      const el = document.getElementById(k);
      const v = el && el.value !== undefined ? String(el.value).trim() : '';
      if (v) return v;
    }
    return '';
  }

  clearAuthError(mode);

  let email = '', pass = '', name = '';
  if (mode === 'register') {
    email = getFieldValue(['page-register-email', 'm-email']);
    pass  = getFieldValue(['page-register-pass', 'm-pass']);
    name  = getFieldValue(['page-register-name', 'm-name']);
  } else if (mode === 'login') {
    email = getFieldValue(['page-login-email', 'm-email']);
    pass  = getFieldValue(['page-login-pass', 'm-pass']);
  } else if (mode === 'forgot') {
    email = getFieldValue(['page-forgot-email', 'm-email']);
  }

  if (mode === 'forgot') { await sendPasswordResetLink(email, btn); return; }

  if (!email) { showAuthError(mode, 'Please enter your email'); return; }
  if (!pass)  { showAuthError(mode, 'Please enter your password'); return; }
  if (mode === 'register') {
    if (!name) { showAuthError(mode, 'Please enter your name'); return; }
    if (pass.length < 6) { showAuthError(mode, 'Password must be at least 6 characters'); return; }
  }
  email = email.toLowerCase();

  const idleLabel = mode === 'register' ? 'Create Account →' : 'Sign In →';
  const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = idleLabel; } };

  // The free backend sleeps when idle: wake it first so nothing half-finishes.
  if (btn) { btn.disabled = true; btn.textContent = 'Waking up server…'; }
  const awake = await ensureBackendAwake(wakeProgress(mode, btn));
  if (!awake) {
    showAuthError(mode, serverUnreachableMessage());
    restoreBtn();
    return;
  }
  clearAuthError(mode);
  if (btn) btn.textContent = 'Please wait…';

  try {
    let data;
    if (firebaseAuth) {
      // Firebase proves who the user is; the backend then verifies that proof and issues our own token.
      const cred = mode === 'register'
        ? await firebaseAuth.createUserWithEmailAndPassword(email, pass)
        : await firebaseAuth.signInWithEmailAndPassword(email, pass);
      const idToken = await cred.user.getIdToken();
      data = await exchangeFirebaseToken(idToken, mode === 'register' ? name : null);
    } else {
      data = await legacyPasswordAuth(mode, { email, password: pass, full_name: name });
    }
    finishLogin(data);
  } catch (e) {
    if (mode === 'register' && e && e.code === 'auth/email-already-in-use') {
      // Carry the email over so "Back to login" is already filled in.
      const le = document.getElementById('page-login-email');
      if (le) le.value = email;
    }
    showAuthError(mode, friendlyAuthError(e, mode));
  } finally {
    restoreBtn();
  }
}

// Turn Firebase / network errors into short, human messages.
function friendlyAuthError(e, mode) {
  const code = (e && e.code) || '';
  const msg  = (e && e.message) || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead. (If you signed up with Google, use "Continue with Google".)';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return mode === 'login'
        ? 'Incorrect email or password. (If you signed up with Google, use "Continue with Google".)'
        : 'Incorrect email or password.';
    case 'auth/invalid-email':        return 'Please enter a valid email address.';
    case 'auth/weak-password':        return 'Password must be at least 6 characters.';
    case 'auth/user-disabled':        return 'This account has been disabled.';
    case 'auth/too-many-requests':    return 'Too many attempts. Please wait a few minutes, or use "Forgot password".';
    case 'auth/network-request-failed': return 'Network problem. Please check your internet connection and try again.';
  }
  if (msg.includes('Failed to fetch')) {
    _backendAwakeAt = 0;   // don't trust the cached "awake" state after a network failure
    return 'Could not reach the MediMind server. It may still be waking up — wait a few seconds and try again.';
  }
  return msg.replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '').trim() || 'Something went wrong. Please try again.';
}

// Send the Firebase ID token to our backend; it verifies it and returns {access_token, user}.
async function exchangeFirebaseToken(idToken, fullName) {
  const res = await fetch(API + '/auth/firebase-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken, full_name: fullName || null, preferred_language: 'en' }),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : `Sign-in failed (${res.status})`);
  }
  return data;
}

// Only used when Firebase is not configured (local development).
async function legacyPasswordAuth(mode, body) {
  const payload = { email: body.email, password: body.password };
  if (mode === 'register') { payload.full_name = body.full_name; payload.preferred_language = 'en'; }
  const res = await fetch(API + (mode === 'register' ? '/auth/register' : '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) {
    if (res.status === 422 && Array.isArray(data.detail)) {
      const first = data.detail[0] || {};
      throw new Error(`${(first.loc || []).join(' → ') || 'field'}: ${first.msg || 'Validation error'}`);
    }
    throw new Error(typeof data.detail === 'string' ? data.detail : `${mode} failed (${res.status})`);
  }
  return data;
}

function finishLogin(data) {
  token       = data.access_token;
  currentUser = data.user;
  localStorage.setItem('mm_token', token);
  localStorage.setItem('mm_user', JSON.stringify(currentUser));
  closeModal();
  updateNav();
  showPage(POST_LOGIN_PAGE);
  toast(`Welcome, ${(currentUser.full_name || '').split(' ')[0]}! 🎉`, 'success');
}

// Forgot password: Firebase e-mails a secure reset link (no codes shown on screen).
async function sendPasswordResetLink(email, btn) {
  if (!email) { showAuthError('forgot', 'Please enter your email'); return; }
  if (!firebaseAuth) { showAuthError('forgot', 'Password reset is not available right now.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  let failed = null;
  try {
    await firebaseAuth.sendPasswordResetEmail(email.toLowerCase());
  } catch (e) {
    // "user-not-found" is treated like success so we never reveal which emails exist.
    if (!e || e.code !== 'auth/user-not-found') failed = e;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Resend link →'; }
  if (failed) { showAuthError('forgot', friendlyAuthError(failed, 'forgot')); return; }
  const stepText = document.getElementById('forgot-step-text');
  if (stepText) stepText.textContent = `If an account exists for ${email}, a reset link is on its way. Check your inbox (and spam folder), set a new password, then sign in.`;
  toast('Reset link sent — check your email', 'success');
}

function getAuthErrorElement(mode) {
  if (mode === 'login') return document.getElementById('login-err');
  if (mode === 'register') return document.getElementById('register-err');
  if (mode === 'forgot') return document.getElementById('forgot-err') || document.getElementById('modal-err');
  return document.getElementById('modal-err');
}

function showAuthError(mode, msg) {
  const el = getAuthErrorElement(mode);
  if (!el) return;
  el.textContent  = msg;
  el.style.display = 'block';
}

function clearAuthError(mode) {
  const el = getAuthErrorElement(mode);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
  el.style.color = ''; el.style.background = ''; el.style.borderColor = '';
}

function modalErr(msg) {
  showAuthError(authView, msg);
}

function closeModal() {
  document.getElementById('auth-modal')?.classList.remove('open');
  passwordResetState = { step: 'email', email: '', code: '' };
}
function overlayClick(e) { if (e.target.id === 'auth-modal') closeModal(); }

function renderForgotPage() {
  const emailField = document.getElementById('page-forgot-email');
  const codeWrap   = document.querySelector('.forgot-code-fields');
  const stepText   = document.getElementById('forgot-step-text');
  const btn        = document.getElementById('forgot-submit-btn');
  if (emailField) emailField.disabled = false;
  if (codeWrap)   codeWrap.style.display = 'none';   // no verification-code step any more
  if (stepText)   stepText.textContent = 'Enter your account email and we will send you a password reset link.';
  if (btn)        btn.textContent = 'Send reset link →';
  clearAuthError('forgot');
}

function logout() {
  token = null; currentUser = null;
  if (firebaseAuth) { firebaseAuth.signOut().catch(() => {}); }
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_user');
  updateNav();
  showPage('login');
  toast('Signed out successfully', 'success');
}

function openProfileSettings() {
  const accountTab = Array.from(document.querySelectorAll('.dash-tab'))
    .find(btn => (btn.getAttribute('onclick') || '').includes("'account'"));
  if (typeof switchDashTab === 'function' && accountTab) {
    switchDashTab('account', accountTab);
  }
}

async function googleSignIn() {
  if (!firebaseAuth) { toast('Google sign-in is not set up for this site.', 'error'); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    ensureBackendAwake();   // start waking the server while the user picks a Google account
    // Must be the first async step so the browser does not block the pop-up.
    const result = await firebaseAuth.signInWithPopup(provider);
    if (!result || !result.user) throw new Error('No user returned from Google');
    const idToken = await result.user.getIdToken();

    const onRegister = (document.querySelector('.page.active') || {}).id === 'page-register';
    const gm = onRegister ? 'register' : 'login';
    const awake = await ensureBackendAwake(wakeProgress(gm, null));
    if (!awake) { showAuthError(gm, serverUnreachableMessage()); return; }
    clearAuthError(gm);
    finishLogin(await exchangeFirebaseToken(idToken, result.user.displayName));
  } catch (e) {
    const code = (e && e.code) || '';
    let msg;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') msg = 'Google sign-in was cancelled.';
    else if (code === 'auth/popup-blocked') msg = 'Your browser blocked the Google pop-up. Please allow pop-ups for this site and try again.';
    else if (code === 'auth/unauthorized-domain') msg = 'This website is not authorised for Google sign-in yet (Firebase Console → Authentication → Settings → Authorized domains).';
    else msg = friendlyAuthError(e, 'login');
    toast(msg, 'error');
  }
}

// ── Toast ──────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'success') {
  const el  = document.getElementById('toast');
  const txt = document.getElementById('toast-msg');
  if (!el || !txt) return;
  txt.textContent = msg;
  el.className    = `toast ${type}`;
  el.style.display = 'flex';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.style.display = 'none', 4000);
}

// ── History page ───────────────────────────────────────────────
async function loadHistory() {
  const cont = document.getElementById('history-content');
  if (!cont) return;

  if (!token) {
    cont.innerHTML = `
      <div class="hist-empty">
        <div class="hist-empty-icon">🔐</div>
        <div class="hist-empty-title">Sign in to view history</div>
        <div class="hist-empty-sub">Your triage sessions are saved to your account</div>
        <button onclick="openModal('login')" style="margin-top:20px;padding:10px 24px;
          background:var(--ink);color:#fff;border:none;border-radius:10px;
          font-size:13px;font-weight:700;cursor:pointer;font-family:var(--sans)">
          Sign In
        </button>
      </div>`; return;
  }

  cont.innerHTML = [1,2,3].map(() =>
    `<div class="skel" style="height:72px;margin-bottom:10px;border-radius:18px"></div>`
  ).join('');

  try {
    const res = await fetch(`${API}/history/`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 401) { logout(); return; }
    const sessions = await res.json();

    if (!sessions.length) {
      cont.innerHTML = `
        <div class="hist-empty">
          <div class="hist-empty-icon">📋</div>
          <div class="hist-empty-title">No sessions yet</div>
          <div class="hist-empty-sub">Do your first symptom check and it will appear here</div>
        </div>`; return;
    }

    cont.innerHTML = `<div class="hist-list">${sessions.map(s => `
      <div class="hist-item" onclick="loadSession('${s.id}')">
        <div class="hist-lozenge ${s.triage_level}"></div>
        <div class="hist-complaint">${s.chief_complaint || 'Symptom assessment'}</div>
        <span class="hist-badge ${s.triage_level}">${(s.triage_level || '').replace('_', ' ')}</span>
        <div class="hist-date">${new Date(s.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}</div>
        <span class="hist-arrow">›</span>
      </div>`).join('')}</div>`;

  } catch(e) {
    cont.innerHTML = `
      <div class="hist-empty">
        <div class="hist-empty-icon">⚠️</div>
        <div class="hist-empty-title">Could not load history</div>
        <div class="hist-empty-sub">Make sure the backend is running at http://127.0.0.1:8000</div>
      </div>`;
  }
}

async function loadSession(id) {
  try {
    const res = await fetch(`${API}/history/${id}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Session not found');
    const s = await res.json();

    // Show a detail modal instead of navigating away
    showSessionModal(s);

  } catch(e) {
    toast('Could not load session', 'error');
  }
}

function showSessionModal(s) {
  const lv        = (s.triage_level || 'URGENT').toUpperCase();
  const colorMap  = { EMERGENCY: '#e63946', URGENT: '#f4a261', SELF_CARE: '#2a9d5c' };
  const bgMap     = { EMERGENCY: '#fdecea', URGENT: '#fef3e8', SELF_CARE: '#e8f7ee' };
  const icon      = lv === 'EMERGENCY' ? '🚨' : lv === 'URGENT' ? '⚠️' : '✅';
  const color     = colorMap[lv] || '#f4a261';
  const bg        = bgMap[lv]    || '#fef3e8';
  const date      = s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

  const sp        = s.symptoms_extracted || {};
  const symptoms  = sp.symptoms || [];
  const redFlags  = sp.red_flags || [];

  const sympRows  = symptoms.map(sym => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #dde8f0">${sym.name || '—'}</td>
      <td style="padding:6px 10px;border:1px solid #dde8f0">${sym.severity || '—'}</td>
      <td style="padding:6px 10px;border:1px solid #dde8f0">${sym.duration || '—'}</td>
      <td style="padding:6px 10px;border:1px solid #dde8f0">${sym.location || '—'}</td>
    </tr>`).join('');

  const qaList    = s.follow_up_qa || [];

  const modal = document.createElement('div');
  modal.id    = 'session-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(10,14,20,.6);backdrop-filter:blur(6px);
    z-index:600;display:flex;align-items:flex-start;justify-content:center;
    padding:20px;overflow-y:auto;`;

  modal.innerHTML = `
    <div style="background:white;border-radius:24px;width:100%;max-width:720px;
                margin:auto;box-shadow:0 24px 80px rgba(0,0,0,.25);overflow:hidden">

      <!-- Header -->
      <div style="background:${bg};border-bottom:2px solid ${color}30;padding:24px 28px;
                  display:flex;align-items:flex-start;gap:16px">
        <span style="font-size:36px;line-height:1">${icon}</span>
        <div style="flex:1">
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;
                      color:${color};margin-bottom:4px">${lv.replace('_',' ')} — Past Assessment</div>
          <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:22px;
                      color:#0a0e14;margin-bottom:4px">${s.chief_complaint || 'Symptom Assessment'}</div>
          <div style="font-size:12px;color:#7a9ab5">📅 ${date}</div>
        </div>
        <button onclick="document.getElementById('session-modal').remove()"
          style="width:32px;height:32px;border-radius:8px;background:#e2eaf2;border:none;
                 cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
      </div>

      <!-- Body -->
      <div style="padding:24px 28px;display:flex;flex-direction:column;gap:20px">

        <!-- AI Response -->
        ${s.triage_response ? `
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
                      color:#7a9ab5;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="width:14px;height:2px;background:#00b896;display:inline-block"></span>
            AI Assessment
          </div>
          <div style="background:#f0f4f8;border-radius:12px;padding:14px 16px;
                      font-size:13px;line-height:1.7;color:#3d5166">${s.triage_response}</div>
        </div>` : ''}

        <!-- AI Reasoning -->
        ${s.triage_reasoning ? `
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
                      color:#7a9ab5;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="width:14px;height:2px;background:#00b896;display:inline-block"></span>
            Clinical Reasoning
          </div>
          <div style="background:#f0f4f8;border-radius:12px;padding:14px 16px;
                      font-size:13px;line-height:1.7;color:#3d5166;font-style:italic">${s.triage_reasoning}</div>
        </div>` : ''}

        <!-- Symptoms -->
        ${sympRows ? `
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
                      color:#7a9ab5;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="width:14px;height:2px;background:#00b896;display:inline-block"></span>
            Extracted Symptoms
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#e2eaf2">
                <th style="padding:8px 10px;text-align:left;border:1px solid #dde8f0;font-size:10px;text-transform:uppercase;letter-spacing:.4px">Symptom</th>
                <th style="padding:8px 10px;text-align:left;border:1px solid #dde8f0;font-size:10px;text-transform:uppercase;letter-spacing:.4px">Severity</th>
                <th style="padding:8px 10px;text-align:left;border:1px solid #dde8f0;font-size:10px;text-transform:uppercase;letter-spacing:.4px">Duration</th>
                <th style="padding:8px 10px;text-align:left;border:1px solid #dde8f0;font-size:10px;text-transform:uppercase;letter-spacing:.4px">Location</th>
              </tr>
            </thead>
            <tbody>${sympRows}</tbody>
          </table>
        </div>` : ''}

        <!-- Red Flags -->
        ${redFlags.length ? `
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
                      color:#e63946;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="width:14px;height:2px;background:#e63946;display:inline-block"></span>
            Red Flags Detected
          </div>
          ${redFlags.map(f => `
            <div style="background:#fdecea;border:1px solid rgba(230,57,70,.2);border-radius:8px;
                        padding:8px 12px;font-size:13px;color:#e63946;font-weight:600;margin-bottom:6px">
              ⚠️ ${f}
            </div>`).join('')}
        </div>` : ''}

        <!-- Follow-up Q&A -->
        ${qaList.length ? `
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
                      color:#7a9ab5;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span style="width:14px;height:2px;background:#00b896;display:inline-block"></span>
            Follow-up Questions
          </div>
          ${qaList.map(qa => `
            <div style="margin-bottom:12px">
              <div style="font-size:12px;font-weight:700;color:#0a0e14;margin-bottom:4px">Q: ${qa.q}</div>
              <div style="font-size:12px;color:#3d5166;background:#f0f4f8;border-radius:8px;
                          padding:10px 12px;line-height:1.6">A: ${qa.a}</div>
            </div>`).join('')}
        </div>` : ''}

        <!-- Original symptoms -->
        <div style="border-top:1px solid #dde8f0;padding-top:16px">
          <div style="font-size:11px;font-weight:700;color:#7a9ab5;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Original Input</div>
          <div style="font-size:12px;color:#3d5166;line-height:1.6;font-style:italic">"${s.symptoms_raw || s.chief_complaint || ''}"</div>
        </div>

        <!-- Footer buttons -->
        <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px">
          <button onclick="document.getElementById('session-modal').remove()"
            style="padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;
                   cursor:pointer;background:transparent;border:1.5px solid #dde8f0;
                   color:#3d5166;font-family:'Cabinet Grotesk',sans-serif">
            Close
          </button>
          ${token ? `<button onclick="loadSessionToTriage('${s.id}');document.getElementById('session-modal').remove()"
            style="padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;
                   cursor:pointer;background:#0a0e14;border:none;color:#fff;
                   font-family:'Cabinet Grotesk',sans-serif">
            View Full Result →
          </button>` : ''}
        </div>
      </div>
    </div>`;

  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Load session into the triage page (full result view)
function loadSessionToTriage(id) {
  fetch(`${API}/history/${id}`, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(s => {
      currentSessionId = s.id;
      showPage('triage');
      const ta = document.getElementById('symptom-input');
      if (ta) ta.value = s.symptoms_raw || s.chief_complaint || '';
      renderResult({
        session_id:      s.id,
        session_token:   '',
        symptom_profile: s.symptoms_extracted || {
          chief_complaint: s.chief_complaint, symptoms: [], red_flags: [],
          duration_overall: '', severity_overall: '',
        },
        triage_result: {
          level: s.triage_level, color: s.triage_color, confidence: 0.9,
          headline: s.chief_complaint, reasoning: s.triage_reasoning || '',
          response: s.triage_response || '', actions: [], warning_signs: [], sources: [],
        },
        created_at: s.created_at,
      });
    })
    .catch(() => toast('Could not load session', 'error'));
}

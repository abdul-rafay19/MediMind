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

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFirebaseAuth();
  updateNav();
  showPage(token ? 'dashboard' : 'login');
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

  function getFieldValue(keys) {
    for (const k of keys) {
      const el = document.getElementById(k);
      if (el && el.value !== undefined) return el.value.trim();
    }
    return '';
  }

  function getActivePageValue(selector) {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return '';
    const el = activePage.querySelector(selector);
    return el?.value?.trim() || '';
  }

  clearAuthError(mode);

  let email = '';
  let pass = '';
  let name = '';

  if (mode === 'register') {
    email = getFieldValue(['page-register-email']) || getActivePageValue('input[type=email]');
    pass = getFieldValue(['page-register-pass']) || getActivePageValue('input[type=password]');
    name = getFieldValue(['page-register-name']) || getActivePageValue('input[type=text]');
    console.debug('register values', { email, passPresent: !!pass, name, mode, activePage: document.querySelector('.page.active')?.id });
  } else if (mode === 'login') {
    email = getFieldValue(['page-login-email']) || getActivePageValue('input[type=email]');
    pass = getFieldValue(['page-login-pass']) || getActivePageValue('input[type=password]');
  } else if (mode === 'forgot') {
    email = getFieldValue(['page-forgot-email']) || getActivePageValue('input[type=email]');
  }

  if (mode === 'forgot') {
    if (!email) { showAuthError(mode, 'Please enter your email'); return; }

    if (passwordResetState.step === 'email') {
      if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
      try {
        const res = await fetch(API + '/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Could not start password reset');
        passwordResetState.email = email;
        passwordResetState.step = 'code';
        passwordResetState.code = data.verification_code || '';
        renderForgotPage();
        toast('Verification code generated. Enter it below to continue.', 'success');
      } catch (e) {
        showAuthError(mode, e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send verification code →'; }
      }
      return;
    }

    const code = getFieldValue(['page-forgot-code', 'm-code']);
    const newPass = getFieldValue(['page-forgot-new-pass', 'm-new-pass']) || '';
    const confPass = getFieldValue(['page-forgot-conf-pass', 'm-conf-pass']) || '';
    if (!code) { showAuthError(mode, 'Please enter the verification code'); return; }
    if (!newPass || newPass.length < 6) { showAuthError(mode, 'Password must be at least 6 characters'); return; }
    if (newPass !== confPass) { showAuthError(mode, 'Passwords do not match'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
    try {
      const res = await fetch(API + '/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: passwordResetState.email,
          verification_code: code,
          new_password: newPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not reset password');
      passwordResetState = { step: 'email', email: '', code: '' };
      renderForgotPage();
      showPage('login');
      toast('Password updated successfully. Please sign in.', 'success');
    } catch (e) {
      showAuthError(mode, e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Update password →'; }
    }
    return;
  }

  if (!email) { showAuthError(mode, 'Please enter your email'); return; }
  if (mode !== 'forgot' && !pass)  { showAuthError(mode, 'Please enter your password'); return; }
  if (mode === 'register' && pass.length < 6) {
    showAuthError(mode, 'Password must be at least 6 characters'); return;
  }

  const body = { email: email.toLowerCase(), password: pass };

  if (mode === 'register') {
    if (!name) { showAuthError(mode, 'Please enter your name'); return; }
    body.full_name          = name;
    body.preferred_language = 'en';
  }

  let idToken = null;
  if (mode === 'register' && firebaseAuth) {
    try {
      const firebaseUser = await firebaseAuth.createUserWithEmailAndPassword(body.email, body.password);
      idToken = await firebaseUser.user.getIdToken();
    } catch (e) {
      const msg = e.message || 'Firebase signup failed';
      showAuthError(mode, msg.replace('Firebase:', '').trim());
      if (btn) { btn.disabled = false; btn.textContent = mode === 'register' ? 'Create Account →' : 'Sign In →'; }
      return;
    }
  }

  if (mode === 'login' && firebaseAuth) {
    try {
      const firebaseUser = await firebaseAuth.signInWithEmailAndPassword(body.email, body.password);
      idToken = await firebaseUser.user.getIdToken();
    } catch (e) {
      // Handle common Firebase sign-in errors explicitly to avoid confusing backend fallbacks.
      const code = e?.code || (e && e.message && e.message.split(':')[0]) || '';
      if (code === 'auth/wrong-password' || (e && e.message && e.message.includes('wrong-password'))) {
        showAuthError(mode, 'Incorrect password. Please try again or reset your password.');
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
        return;
      }
      if (code === 'auth/user-not-found' || (e && e.message && e.message.includes('user-not-found'))) {
        // Allow backend fallback — no Firebase user exists for this email.
        console.warn('Firebase user not found; falling back to backend auth');
      } else {
        // Other errors (network, popup blocked, etc.) — surface to the user
        const msg = e.message || 'Firebase sign-in failed';
        showAuthError(mode, msg.replace('Firebase:', '').trim());
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
        return;
      }
    }
  }

  if (idToken) {
    body.id_token = idToken;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }

  try {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const res = await fetch(API + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }

    if (!res.ok) {
      if (res.status === 422 && Array.isArray(data.detail)) {
        const firstErr = data.detail[0];
        const field    = firstErr.loc?.join(' → ') || 'field';
        const msg      = firstErr.msg || 'Validation error';
        throw new Error(`${field}: ${msg}`);
      }
      throw new Error(data.detail || `${mode} failed (${res.status})`);
    }

    token       = data.access_token;
    currentUser = data.user;
    localStorage.setItem('mm_token', token);
    localStorage.setItem('mm_user', JSON.stringify(currentUser));
    closeModal();
    updateNav();
    showPage('dashboard');
    toast(`Welcome, ${(currentUser.full_name || '').split(' ')[0]}! 🎉`, 'success');

  } catch(e) {
    const msg = e.message || 'Unexpected error';
    const friendly = msg.includes('Failed to fetch')
      ? 'The MediMind server is not reachable right now. Please start the backend server and refresh the page.'
      : msg;
    showAuthError(mode, friendly);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = mode === 'register' ? 'Create Account →' : 'Sign In →'; }
  }
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
  const isCodeStep = passwordResetState.step === 'code';
  const emailField = document.getElementById('page-forgot-email');
  const codeField = document.getElementById('page-forgot-code');
  const codeWrap = document.querySelector('.forgot-code-fields');
  const stepText = document.getElementById('forgot-step-text');
  const btn = document.getElementById('forgot-submit-btn');
  if (emailField && passwordResetState.email) emailField.value = passwordResetState.email;
  if (codeField && passwordResetState.code) codeField.value = passwordResetState.code;
  if (emailField) emailField.disabled = isCodeStep;
  if (codeWrap) codeWrap.style.display = isCodeStep ? 'block' : 'none';
  if (stepText) stepText.textContent = isCodeStep
    ? 'Enter the verification code and your new password'
    : 'Enter your account email to continue';
  if (btn) btn.textContent = isCodeStep ? 'Update Password' : 'Send Code';
  clearAuthError('forgot');
}

function logout() {
  token = null; currentUser = null;
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
  // If Firebase Auth is configured, prefer the popup flow and exchange the
  // Firebase ID token with our backend which will verify it and create/return
  // an application JWT. Otherwise fall back to the developer prompt flow.
  if (firebaseAuth) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebaseAuth.signInWithPopup(provider);
      const user = result.user;
      if (!user) throw new Error('No user returned from Firebase');
      const idToken = await user.getIdToken();

      const res = await fetch(API + '/auth/google-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken, preferred_language: 'en' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Google sign-in failed');

      token = data.access_token;
      currentUser = data.user;
      localStorage.setItem('mm_token', token);
      localStorage.setItem('mm_user', JSON.stringify(currentUser));
      updateNav();
      showPage('dashboard');
      toast(`Welcome, ${(currentUser.full_name || '').split(' ')[0]}!`, 'success');
    } catch (e) {
      const msg = e.message || 'Google sign-in could not be completed';
      toast(msg.includes('popup_closed_by_user') ? 'Google sign-in was cancelled.' : msg, 'error');
    }
    return;
  }

  // Fallback developer flow: ask for email/name and call backend (no ID token)
  const email = prompt('Enter the email you want to use for Google sign-in', currentUser?.email || '');
  if (!email) return;
  const name = prompt('Enter your display name', currentUser?.full_name || 'Google User');
  if (!name) return;

  try {
    const res = await fetch(API + '/auth/google-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase(), full_name: name, preferred_language: 'en' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Google sign-in failed');
    token = data.access_token;
    currentUser = data.user;
    localStorage.setItem('mm_token', token);
    localStorage.setItem('mm_user', JSON.stringify(currentUser));
    updateNav();
    showPage('dashboard');
    toast(`Welcome, ${(currentUser.full_name || '').split(' ')[0]}!`, 'success');
  } catch (e) {
    const msg = e.message || 'Google sign-in could not be completed';
    toast(msg.includes('Failed to fetch') ? 'The MediMind server is not reachable right now.' : msg, 'error');
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

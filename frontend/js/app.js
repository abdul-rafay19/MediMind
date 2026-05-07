/* ══════════════════════════════════════════════
   MediMind — Core App: State, Routing, Auth
   js/app.js  (load this FIRST before triage.js)
══════════════════════════════════════════════ */

const API = 'http://127.0.0.1:8000/api';

// ── Global state ───────────────────────────────────────────────
let token        = localStorage.getItem('mm_token');
let currentUser  = JSON.parse(localStorage.getItem('mm_user') || 'null');
let currentSessionId = null;

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateNav();
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
  const map = { home: 'nav-home', triage: 'nav-triage', history: 'nav-history' };
  if (tabEl) tabEl.classList.add('active');
  else document.getElementById(map[name])?.classList.add('active');
  if (name === 'history') loadHistory();
}

// ── Nav rendering ──────────────────────────────────────────────
function updateNav() {
  const nr = document.getElementById('nav-right');
  if (!nr) return;
  if (currentUser) {
    const ini = (currentUser.full_name || 'U')
      .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    nr.innerHTML = `
      <button class="user-pill" onclick="logout()">
        <div class="user-avatar">${ini}</div>
        ${(currentUser.full_name || '').split(' ')[0]}
        <span class="user-pill-logout">↩ logout</span>
      </button>`;
  } else {
    nr.innerHTML = `
      <button class="btn-outline" onclick="openModal('login')">Sign In</button>
      <button class="btn-solid"   onclick="openModal('register')">Get Started</button>`;
  }
}

// ── Auth Modal ─────────────────────────────────────────────────
function openModal(mode) {
  document.getElementById('auth-modal').classList.add('open');
  renderModal(mode);
}

function renderModal(mode) {
  const isLogin = mode === 'login';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-logo">🧠</div>
    <div class="modal-h1">${isLogin ? 'Welcome back' : 'Create account'}</div>
    <div class="modal-sub">${isLogin ? 'Sign in to view your history and download PDF reports' : 'Free account — save triage history, download PDF reports'}</div>
    <div id="modal-err" class="modal-err" style="display:none"></div>
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
    <button class="modal-submit" id="modal-btn" onclick="submitAuth('${mode}')">
      ${isLogin ? 'Sign In →' : 'Create Account →'}
    </button>
    <div class="modal-divider">or</div>
    <div class="modal-switch">
      ${isLogin
        ? `No account? <a onclick="renderModal('register')">Sign up free</a>`
        : `Already have one? <a onclick="renderModal('login')">Sign in</a>`}
    </div>`;
}

async function submitAuth(mode) {
  const emailEl = document.getElementById('m-email');
  const passEl  = document.getElementById('m-pass');
  const btn     = document.getElementById('modal-btn');

  const email = emailEl?.value.trim();
  const pass  = passEl?.value;

  if (!email) { modalErr('Please enter your email'); return; }
  if (!pass)  { modalErr('Please enter your password'); return; }
  if (mode === 'register' && pass.length < 6) {
    modalErr('Password must be at least 6 characters'); return;
  }

  // Build body — match backend schema exactly
  const body = { email, password: pass };

  if (mode === 'register') {
    const nameEl = document.getElementById('m-name');
    const name   = nameEl?.value.trim();
    if (!name) { modalErr('Please enter your name'); return; }
    body.full_name          = name;
    body.preferred_language = 'en';  // plain string
  }

  // Disable button to prevent double submit
  if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }

  try {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const res = await fetch(API + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      // FastAPI 422 gives a detail array — show useful message
      if (res.status === 422 && Array.isArray(data.detail)) {
        const firstErr = data.detail[0];
        const field    = firstErr.loc?.join(' → ') || 'field';
        const msg      = firstErr.msg || 'Validation error';
        throw new Error(`${field}: ${msg}`);
      }
      throw new Error(data.detail || `${mode} failed (${res.status})`);
    }

    // Success
    token       = data.access_token;
    currentUser = data.user;
    localStorage.setItem('mm_token', token);
    localStorage.setItem('mm_user', JSON.stringify(currentUser));
    closeModal();
    updateNav();
    toast(`Welcome, ${(currentUser.full_name || '').split(' ')[0]}! 🎉`, 'success');

  } catch(e) {
    modalErr(e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = mode === 'register' ? 'Create Account →' : 'Sign In →'; }
  }
}

function modalErr(msg) {
  const el = document.getElementById('modal-err');
  if (!el) return;
  el.textContent  = msg;
  el.style.display = 'block';
}

function closeModal()    { document.getElementById('auth-modal')?.classList.remove('open'); }
function overlayClick(e) { if (e.target.id === 'auth-modal') closeModal(); }

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_user');
  updateNav();
  toast('Signed out successfully', 'success');
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
      <div class="hist-item" onclick="loadSession(${s.id})">
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
    const s = await res.json();
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
        level:         s.triage_level,
        color:         s.triage_color,
        confidence:    0.9,
        headline:      s.chief_complaint,
        reasoning:     s.triage_reasoning || '',
        response:      s.triage_response  || '',
        actions:       [],
        warning_signs: [],
        sources:       [],
      },
      created_at: s.created_at,
    });
  } catch(e) {
    toast('Could not load session', 'error');
  }
}

/* ══════════════════════════════════════════════
   MediMind — CRUD Dashboard
   js/crud.js

   FIX: Edit/Delete used nested template literals with quotes
   inside ${}  which corrupts HTML in browsers.
   Solution: build HTML with plain string concatenation,
   store data in window._medData / window._noteData maps,
   and use data-id attributes instead of inline onclick strings.
══════════════════════════════════════════════ */

// ── Tab switching ──────────────────────────────────────────────
function switchDashTab(name, el) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  if (name === 'medications')    loadMedications();
  if (name === 'health-profile') loadHealthProfile();
  if (name === 'notes')          loadNotes();
  if (name === 'account')        loadAccount();
}

function initDashboard() {
  if (!token) {
    openModal('login');
    toast('Please sign in to access your dashboard', 'error');
    return;
  }
  loadDashStats();
  loadMedications();
}

function authHdr() {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// ── Dashboard stats ────────────────────────────────────────────
async function loadDashStats() {
  try {
    const [medsRes, notesRes, histRes] = await Promise.all([
      fetch(API + '/medications', { headers: authHdr() }),
      fetch(API + '/notes',       { headers: authHdr() }),
      fetch(API + '/history/',    { headers: authHdr() }),
    ]);
    const meds  = await medsRes.json();
    const notes = await notesRes.json();
    const hist  = await histRes.json();
    const activeMeds = Array.isArray(meds) ? meds.filter(function(m){ return m.is_active; }).length : 0;
    const strip = document.getElementById('dash-stats');
    if (!strip) return;
    strip.innerHTML =
      '<div class="stat-card"><div class="stat-icon icon-teal">💊</div>' +
      '<div><div class="stat-num">' + activeMeds + '</div><div class="stat-label">Active Meds</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon icon-purple">📝</div>' +
      '<div><div class="stat-num">' + (Array.isArray(notes) ? notes.length : 0) + '</div><div class="stat-label">Medical Notes</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon icon-blue">🩺</div>' +
      '<div><div class="stat-num">' + (Array.isArray(hist) ? hist.length : 0) + '</div><div class="stat-label">Triage Sessions</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon icon-amber">👤</div>' +
      '<div><div class="stat-num">' + ((currentUser && currentUser.full_name) ? currentUser.full_name.split(' ')[0] : '—') + '</div><div class="stat-label">Account</div></div></div>';
  } catch(e) {}
}

// ── HTML escape helpers ────────────────────────────────────────
function h(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ══════════════════════════════════════════════
//  MEDICATIONS
// ══════════════════════════════════════════════

window._medData = {};  // stores medication objects by ID for modal access

async function loadMedications() {
  var list = document.getElementById('med-list');
  if (!list) return;
  list.innerHTML = '<div class="skel" style="height:72px;border-radius:10px;margin-bottom:8px"></div>' +
                   '<div class="skel" style="height:72px;border-radius:10px"></div>';
  try {
    var res  = await fetch(API + '/medications', { headers: authHdr() });
    var meds = await res.json();

    if (!Array.isArray(meds) || !meds.length) {
      list.innerHTML = '<div class="crud-empty"><div class="crud-empty-icon">💊</div>' +
        '<div class="crud-empty-title">No medications yet</div>' +
        '<div class="crud-empty-sub">Click "+ Add Medication" to start tracking</div></div>';
      return;
    }

    // Store all meds in global map so modal can access them by ID
    window._medData = {};
    meds.forEach(function(m) { window._medData[m.id] = m; });

    // Build HTML with plain string concatenation — no nested template literals
    var html = '';
    meds.forEach(function(m) {
      var tagCls  = m.is_active ? 'tag-active' : 'tag-inactive';
      var tagTxt  = m.is_active ? 'Active' : 'Inactive';
      var meta    = '<span>💊 ' + h(m.dosage) + '</span> <span>⏰ ' + h(m.frequency) + '</span>';
      if (m.purpose)       meta += ' <span>🎯 ' + h(m.purpose) + '</span>';
      if (m.prescribed_by) meta += ' <span>👨‍⚕️ Dr. ' + h(m.prescribed_by) + '</span>';
      if (m.start_date)    meta += ' <span>📅 Since ' + h(m.start_date) + '</span>';

      html += '<div class="med-item" id="med-' + h(m.id) + '">';
      html +=   '<div class="med-item-body">';
      html +=     '<div class="med-item-name">' + h(m.name) +
                    ' <span class="med-item-tag ' + tagCls + '">' + tagTxt + '</span></div>';
      html +=     '<div class="med-item-meta">' + meta + '</div>';
      if (m.notes) html += '<div style="font-size:12px;color:var(--text3);margin-top:6px">📋 ' + h(m.notes) + '</div>';
      html +=   '</div>';
      // data-id attribute — no quotes inside onclick needed
      html +=   '<div class="med-item-actions">';
      html +=     '<button class="btn-edit" data-id="' + h(m.id) + '" onclick="openMedModal(this.dataset.id)">Edit</button>';
      html +=     '<button class="btn-del"  data-id="' + h(m.id) + '" onclick="deleteMedication(this.dataset.id)">Delete</button>';
      html +=   '</div>';
      html += '</div>';
    });
    list.innerHTML = html;

  } catch(e) {
    list.innerHTML = '<div class="crud-empty"><div class="crud-empty-icon">⚠️</div>' +
      '<div class="crud-empty-title">Failed to load medications</div></div>';
  }
}

function toggleAddMedForm() {
  var f = document.getElementById('add-med-form');
  if (f) f.classList.toggle('open');
}

async function addMedication() {
  var name = (document.getElementById('new-med-name')    || {}).value || '';
  var dose = (document.getElementById('new-med-dosage')  || {}).value || '';
  var freq = (document.getElementById('new-med-freq')    || {}).value || '';
  name = name.trim(); dose = dose.trim(); freq = freq.trim();
  if (!name || !dose || !freq) { toast('Name, dosage and frequency are required', 'error'); return; }
  try {
    var res = await fetch(API + '/medications', {
      method: 'POST', headers: authHdr(),
      body: JSON.stringify({
        name: name, dosage: dose, frequency: freq,
        purpose:       ((document.getElementById('new-med-purpose')    || {}).value || '').trim() || null,
        prescribed_by: ((document.getElementById('new-med-prescribed') || {}).value || '').trim() || null,
        start_date:    ((document.getElementById('new-med-start')      || {}).value || '').trim() || null,
        notes:         ((document.getElementById('new-med-notes')      || {}).value || '').trim() || null,
        is_active: true,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    toast('Medication added ✓', 'success');
    var form = document.getElementById('add-med-form');
    if (form) form.classList.remove('open');
    ['name','dosage','freq','purpose','prescribed','start','notes'].forEach(function(f) {
      var el = document.getElementById('new-med-' + f); if (el) el.value = '';
    });
    loadMedications(); loadDashStats();
  } catch(e) { toast(e.message || 'Failed to add', 'error'); }
}

// ── Medication EDIT MODAL ──────────────────────────────────────
function openMedModal(id) {
  var m = window._medData[id];
  if (!m) { toast('Could not find medication data', 'error'); return; }

  // Remove existing modal if any
  var old = document.getElementById('med-edit-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'med-edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,20,.55);backdrop-filter:blur(4px);' +
    'z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;';

  var activeSelected   = m.is_active  ? 'selected' : '';
  var inactiveSelected = !m.is_active ? 'selected' : '';

  modal.innerHTML =
    '<div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:540px;' +
               'box-shadow:0 24px 80px rgba(0,0,0,.2)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
        '<div style="font-family:var(--serif);font-style:italic;font-size:20px">Edit Medication</div>' +
        '<button onclick="document.getElementById(\'med-edit-modal\').remove()" ' +
          'style="width:30px;height:30px;border-radius:7px;background:var(--mist2);' +
          'border:1px solid var(--wire2);cursor:pointer;font-size:14px">✕</button>' +
      '</div>' +
      '<div class="form-grid">' +
        '<div class="form-field"><label class="form-label">Name</label>' +
          '<input type="text" id="em-name" value="' + h(m.name) + '"/></div>' +
        '<div class="form-field"><label class="form-label">Dosage</label>' +
          '<input type="text" id="em-dosage" value="' + h(m.dosage) + '"/></div>' +
        '<div class="form-field"><label class="form-label">Frequency</label>' +
          '<input type="text" id="em-freq" value="' + h(m.frequency) + '"/></div>' +
        '<div class="form-field"><label class="form-label">Purpose</label>' +
          '<input type="text" id="em-purpose" value="' + h(m.purpose || '') + '"/></div>' +
        '<div class="form-field"><label class="form-label">Prescribed By</label>' +
          '<input type="text" id="em-prescribed" value="' + h(m.prescribed_by || '') + '"/></div>' +
        '<div class="form-field"><label class="form-label">Status</label>' +
          '<select id="em-active">' +
            '<option value="true" '  + activeSelected   + '>Active</option>' +
            '<option value="false" ' + inactiveSelected + '>Inactive</option>' +
          '</select></div>' +
        '<div class="form-field form-full"><label class="form-label">Notes</label>' +
          '<input type="text" id="em-notes" value="' + h(m.notes || '') + '"/></div>' +
      '</div>' +
      '<div class="form-actions" style="margin-top:16px">' +
        '<button class="btn-cancel" onclick="document.getElementById(\'med-edit-modal\').remove()">Cancel</button>' +
        '<button class="btn-save" data-id="' + h(id) + '" onclick="saveMedModal(this.dataset.id)">Save Changes</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

async function saveMedModal(id) {
  var g = function(eid) {
    var el = document.getElementById(eid);
    return el ? el.value.trim() || null : null;
  };
  try {
    var res = await fetch(API + '/medications/' + id, {
      method: 'PUT', headers: authHdr(),
      body: JSON.stringify({
        name:          g('em-name'),
        dosage:        g('em-dosage'),
        frequency:     g('em-freq'),
        purpose:       g('em-purpose'),
        prescribed_by: g('em-prescribed'),
        notes:         g('em-notes'),
        is_active:     (document.getElementById('em-active') || {}).value === 'true',
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    var modal = document.getElementById('med-edit-modal');
    if (modal) modal.remove();
    toast('Medication updated ✓', 'success');
    loadMedications();
  } catch(e) { toast(e.message || 'Update failed', 'error'); }
}

async function deleteMedication(id) {
  if (!confirm('Delete this medication permanently?')) return;
  try {
    var res = await fetch(API + '/medications/' + id, { method: 'DELETE', headers: authHdr() });
    if (res.status !== 204) throw new Error('Delete failed');
    var el = document.getElementById('med-' + id);
    if (el) el.remove();
    toast('Medication deleted', 'success');
    loadDashStats();
    if (!document.querySelectorAll('[id^="med-"]').length) loadMedications();
  } catch(e) { toast(e.message || 'Delete failed', 'error'); }
}

// ══════════════════════════════════════════════
//  HEALTH PROFILE
// ══════════════════════════════════════════════

var _healthProfileData = null;

async function loadHealthProfile() {
  try {
    var res = await fetch(API + '/health-profile', { headers: authHdr() });
    if (res.status === 404) { showHealthProfileForm(null); return; }
    if (!res.ok) return;
    var p = await res.json();
    _healthProfileData = p;
    showHealthProfileView(p);
  } catch(e) {}
}

function profileRow(label, value) {
  return '<tr>' +
    '<td style="padding:8px 10px;font-weight:700;color:var(--text3);background:var(--mist2);' +
    'border:1px solid var(--wire2);width:42%;font-size:11px;text-transform:uppercase;letter-spacing:.4px">' + label + '</td>' +
    '<td style="padding:8px 12px;border:1px solid var(--wire2);color:var(--text);font-size:13px">' + (value || '—') + '</td>' +
    '</tr>';
}

function calcBMIStr(ht, wt) {
  var bmi = (wt / Math.pow(ht / 100, 2)).toFixed(1);
  var lbl = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  return bmi + ' (' + lbl + ')';
}

function showHealthProfileView(p) {
  var c = document.getElementById('health-profile-container');
  if (!c) return;
  var yn = function(v) { return v === true ? 'Yes' : v === false ? 'No' : '—'; };
  var v  = function(x) { return x || '—'; };
  var bmi = (p.height_cm && p.weight_kg) ? calcBMIStr(p.height_cm, p.weight_kg) : null;

  var html =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
      '<div style="font-size:14px;color:var(--text3)">Your saved health profile</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn-edit" onclick="showHealthProfileForm(_healthProfileData)">Edit Profile</button>' +
        '<button class="btn-del"  onclick="deleteHealthProfile()">Delete</button>' +
      '</div>' +
    '</div>' +
    '<div class="profile-grid">' +
      '<div>' +
        '<div class="profile-section-title">Basic Information</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          profileRow('Date of Birth', v(p.date_of_birth)) +
          profileRow('Blood Group',   v(p.blood_group)) +
          profileRow('Gender',        v(p.gender)) +
          profileRow('Height',        p.height_cm ? p.height_cm + ' cm' : null) +
          profileRow('Weight',        p.weight_kg ? p.weight_kg + ' kg' : null) +
          (bmi ? profileRow('BMI', bmi) : '') +
        '</table>' +
        '<div class="profile-section-title" style="margin-top:20px">Lifestyle</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          profileRow('Smoker',      yn(p.smoker)) +
          profileRow('Alcohol Use', yn(p.alcohol_use)) +
        '</table>' +
        '<div class="profile-section-title" style="margin-top:20px">Emergency Contact</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          profileRow('Name',  v(p.emergency_contact_name)) +
          profileRow('Phone', v(p.emergency_contact_phone)) +
        '</table>' +
      '</div>' +
      '<div>' +
        '<div class="profile-section-title">Medical History</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          profileRow('Allergies',          v(p.allergies)) +
          profileRow('Chronic Conditions', v(p.chronic_conditions)) +
          profileRow('Past Surgeries',     v(p.past_surgeries)) +
          profileRow('Family History',     v(p.family_history)) +
        '</table>' +
      '</div>' +
    '</div>';
  c.innerHTML = html;
}

function showHealthProfileForm(p) {
  var c = document.getElementById('health-profile-container');
  if (!c) return;

  var selBlood  = function(bg)  { return p && p.blood_group === bg ? ' selected' : ''; };
  var selGender = function(g)   { return p && p.gender === g ? ' selected' : ''; };
  var chk       = function(fld) { return (p && p[fld]) ? ' checked' : ''; };
  var val       = function(fld) { return h(p && p[fld] ? p[fld] : ''); };

  var html =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
      '<div style="font-size:14px;color:var(--text3)">' + (p ? 'Edit your health profile' : 'Create your health profile') + '</div>' +
      (p ? '<button class="btn-cancel" onclick="showHealthProfileView(_healthProfileData)">Cancel</button>' : '') +
    '</div>' +
    '<div class="profile-grid">' +
      '<div>' +
        '<div class="profile-section-title">Basic Information</div>' +
        '<div class="form-field" style="margin-bottom:12px"><label class="form-label">Date of Birth</label>' +
          '<input type="date" id="hp-dob" value="' + val('date_of_birth') + '"/></div>' +
        '<div class="form-grid">' +
          '<div class="form-field"><label class="form-label">Blood Group</label><select id="hp-blood">' +
            '<option value="">Select</option>' +
            ['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(function(bg) {
              return '<option' + selBlood(bg) + '>' + bg + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-field"><label class="form-label">Gender</label><select id="hp-gender">' +
            '<option value="">Select</option>' +
            ['Male','Female','Other'].map(function(g) {
              return '<option' + selGender(g) + '>' + g + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="form-field"><label class="form-label">Height (cm)</label>' +
            '<input type="number" id="hp-height" placeholder="170" value="' + val('height_cm') + '" oninput="updateBMI()"/></div>' +
          '<div class="form-field"><label class="form-label">Weight (kg)</label>' +
            '<input type="number" id="hp-weight" placeholder="70" value="' + val('weight_kg') + '" oninput="updateBMI()"/></div>' +
        '</div>' +
        '<div id="bmi-badge" class="bmi-badge" style="display:none"></div>' +
        '<div class="profile-section-title" style="margin-top:20px">Lifestyle</div>' +
        '<div style="display:flex;gap:24px;padding:12px 0">' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">' +
            '<input type="checkbox" id="hp-smoker" style="width:auto"' + chk('smoker') + '/> Smoker</label>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">' +
            '<input type="checkbox" id="hp-alcohol" style="width:auto"' + chk('alcohol_use') + '/> Alcohol use</label>' +
        '</div>' +
        '<div class="profile-section-title" style="margin-top:12px">Emergency Contact</div>' +
        '<div class="form-field" style="margin-bottom:10px"><label class="form-label">Contact Name</label>' +
          '<input type="text" id="hp-ec-name" value="' + val('emergency_contact_name') + '" placeholder="e.g. Ahmad Khan"/></div>' +
        '<div class="form-field"><label class="form-label">Contact Phone</label>' +
          '<input type="text" id="hp-ec-phone" value="' + val('emergency_contact_phone') + '" placeholder="e.g. +92 300 1234567"/></div>' +
      '</div>' +
      '<div>' +
        '<div class="profile-section-title">Medical History</div>' +
        '<div class="form-field" style="margin-bottom:12px"><label class="form-label">Allergies</label>' +
          '<textarea id="hp-allergies" style="min-height:70px" placeholder="e.g. Penicillin, Peanuts…">' + val('allergies') + '</textarea></div>' +
        '<div class="form-field" style="margin-bottom:12px"><label class="form-label">Chronic Conditions</label>' +
          '<textarea id="hp-conditions" style="min-height:70px" placeholder="e.g. Type 2 Diabetes…">' + val('chronic_conditions') + '</textarea></div>' +
        '<div class="form-field" style="margin-bottom:12px"><label class="form-label">Past Surgeries</label>' +
          '<textarea id="hp-surgeries" style="min-height:70px" placeholder="e.g. Appendectomy (2019)…">' + val('past_surgeries') + '</textarea></div>' +
        '<div class="form-field"><label class="form-label">Family Medical History</label>' +
          '<textarea id="hp-family" style="min-height:70px" placeholder="e.g. Father: Heart disease…">' + val('family_history') + '</textarea></div>' +
      '</div>' +
    '</div>' +
    '<div class="form-actions" style="margin-top:20px">' +
      '<button class="btn-save" onclick="saveHealthProfile()">' + (p ? 'Update Profile' : 'Save Profile') + '</button>' +
    '</div>';

  c.innerHTML = html;
  updateBMI();
}

function updateBMI() {
  var h_el = document.getElementById('hp-height');
  var w_el = document.getElementById('hp-weight');
  var badge = document.getElementById('bmi-badge');
  if (!badge) return;
  if (!h_el || !w_el) { badge.style.display = 'none'; return; }
  var ht = parseFloat(h_el.value);
  var wt = parseFloat(w_el.value);
  if (!ht || !wt) { badge.style.display = 'none'; return; }
  var bmi = (wt / Math.pow(ht / 100, 2)).toFixed(1);
  var cls = 'bmi-normal', lbl = 'Normal';
  if      (bmi < 18.5) { cls = 'bmi-underweight'; lbl = 'Underweight'; }
  else if (bmi < 25)   { cls = 'bmi-normal';       lbl = 'Normal'; }
  else if (bmi < 30)   { cls = 'bmi-overweight';   lbl = 'Overweight'; }
  else                 { cls = 'bmi-obese';         lbl = 'Obese'; }
  badge.className = 'bmi-badge ' + cls;
  badge.textContent = 'BMI: ' + bmi + ' — ' + lbl;
  badge.style.display = 'inline-flex';
}

async function saveHealthProfile() {
  var gv = function(id) { var el = document.getElementById(id); return (el && el.value.trim()) ? el.value.trim() : null; };
  var gc = function(id) { var el = document.getElementById(id); return el ? el.checked : null; };
  var gn = function(id) { var el = document.getElementById(id); var v = parseFloat(el && el.value); return isNaN(v) ? null : v; };
  try {
    var res = await fetch(API + '/health-profile', {
      method: 'PUT', headers: authHdr(),
      body: JSON.stringify({
        date_of_birth:           gv('hp-dob'),
        blood_group:             gv('hp-blood'),
        height_cm:               gn('hp-height'),
        weight_kg:               gn('hp-weight'),
        gender:                  gv('hp-gender'),
        allergies:               gv('hp-allergies'),
        chronic_conditions:      gv('hp-conditions'),
        past_surgeries:          gv('hp-surgeries'),
        family_history:          gv('hp-family'),
        emergency_contact_name:  gv('hp-ec-name'),
        emergency_contact_phone: gv('hp-ec-phone'),
        smoker:                  gc('hp-smoker'),
        alcohol_use:             gc('hp-alcohol'),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    var updated = await res.json();
    _healthProfileData = updated;
    toast('Health profile saved ✓', 'success');
    showHealthProfileView(updated);
  } catch(e) { toast(e.message || 'Save failed', 'error'); }
}

async function deleteHealthProfile() {
  if (!confirm('Delete your health profile permanently?')) return;
  try {
    var res = await fetch(API + '/health-profile', { method: 'DELETE', headers: authHdr() });
    if (res.status !== 204) throw new Error('Delete failed');
    _healthProfileData = null;
    toast('Health profile deleted', 'success');
    showHealthProfileForm(null);
  } catch(e) { toast(e.message || 'Delete failed', 'error'); }
}

// ══════════════════════════════════════════════
//  MEDICAL NOTES
// ══════════════════════════════════════════════

window._noteData = {};  // stores note objects by ID

async function loadNotes() {
  var list = document.getElementById('notes-list');
  if (!list) return;
  list.innerHTML = '<div class="skel" style="height:100px;border-radius:14px;margin-bottom:10px"></div>' +
                   '<div class="skel" style="height:100px;border-radius:14px"></div>';
  try {
    var res   = await fetch(API + '/notes', { headers: authHdr() });
    var notes = await res.json();

    if (!Array.isArray(notes) || !notes.length) {
      list.innerHTML = '<div class="crud-empty"><div class="crud-empty-icon">📝</div>' +
        '<div class="crud-empty-title">No medical notes yet</div>' +
        '<div class="crud-empty-sub">Keep a health journal — record doctor visits, lab results, symptoms</div></div>';
      return;
    }

    window._noteData = {};
    notes.forEach(function(n) { window._noteData[n.id] = n; });

    var html = '';
    notes.forEach(function(n) {
      var dateStr = n.note_date ? n.note_date : new Date(n.created_at).toLocaleDateString('en-GB');
      html += '<div class="note-item" id="note-' + h(n.id) + '">';
      html +=   '<div class="note-header">';
      html +=     '<div class="note-title">' + h(n.title) + '</div>';
      html +=     '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">';
      if (n.category) html += '<span class="note-cat">' + h(n.category) + '</span>';
      html +=       '<button class="btn-edit" data-id="' + h(n.id) + '" onclick="openNoteModal(this.dataset.id)">Edit</button>';
      html +=       '<button class="btn-del"  data-id="' + h(n.id) + '" onclick="deleteNote(this.dataset.id)">Delete</button>';
      html +=     '</div>';
      html +=   '</div>';
      html +=   '<div class="note-content">' + h(n.content) + '</div>';
      html +=   '<div class="note-footer"><span class="note-date">📅 ' + dateStr + '</span></div>';
      html += '</div>';
    });
    list.innerHTML = html;

  } catch(e) {
    list.innerHTML = '<div class="crud-empty"><div class="crud-empty-icon">⚠️</div>' +
      '<div class="crud-empty-title">Failed to load notes</div></div>';
  }
}

function toggleAddNoteForm() {
  var f = document.getElementById('add-note-form');
  if (f) f.classList.toggle('open');
}

async function addNote() {
  var title   = ((document.getElementById('new-note-title')   || {}).value || '').trim();
  var content = ((document.getElementById('new-note-content') || {}).value || '').trim();
  if (!title || !content) { toast('Title and content are required', 'error'); return; }
  try {
    var res = await fetch(API + '/notes', {
      method: 'POST', headers: authHdr(),
      body: JSON.stringify({
        title: title, content: content,
        category:  ((document.getElementById('new-note-cat')  || {}).value || '').trim() || null,
        note_date: ((document.getElementById('new-note-date') || {}).value || '') || null,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    toast('Note added ✓', 'success');
    var form = document.getElementById('add-note-form');
    if (form) form.classList.remove('open');
    ['title','content','cat','date'].forEach(function(f) {
      var el = document.getElementById('new-note-' + f); if (el) el.value = '';
    });
    loadNotes(); loadDashStats();
  } catch(e) { toast(e.message || 'Failed to add', 'error'); }
}

// ── Note EDIT MODAL ────────────────────────────────────────────
function openNoteModal(id) {
  var n = window._noteData[id];
  if (!n) { toast('Could not find note data', 'error'); return; }

  var old = document.getElementById('note-edit-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'note-edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,20,.55);backdrop-filter:blur(4px);' +
    'z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;';

  modal.innerHTML =
    '<div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:540px;' +
               'box-shadow:0 24px 80px rgba(0,0,0,.2)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
        '<div style="font-family:var(--serif);font-style:italic;font-size:20px">Edit Note</div>' +
        '<button onclick="document.getElementById(\'note-edit-modal\').remove()" ' +
          'style="width:30px;height:30px;border-radius:7px;background:var(--mist2);' +
          'border:1px solid var(--wire2);cursor:pointer;font-size:14px">✕</button>' +
      '</div>' +
      '<div class="form-field" style="margin-bottom:12px"><label class="form-label">Title</label>' +
        '<input type="text" id="en-title" value="' + h(n.title) + '"/></div>' +
      '<div class="form-grid" style="margin-bottom:12px">' +
        '<div class="form-field"><label class="form-label">Category</label>' +
          '<input type="text" id="en-cat" value="' + h(n.category || '') + '" placeholder="e.g. Lab Result"/></div>' +
        '<div class="form-field"><label class="form-label">Date</label>' +
          '<input type="date" id="en-date" value="' + h(n.note_date || '') + '"/></div>' +
      '</div>' +
      '<div class="form-field" style="margin-bottom:16px"><label class="form-label">Content</label>' +
        '<textarea id="en-content" style="min-height:100px">' + h(n.content) + '</textarea></div>' +
      '<div class="form-actions">' +
        '<button class="btn-cancel" onclick="document.getElementById(\'note-edit-modal\').remove()">Cancel</button>' +
        '<button class="btn-save" data-id="' + h(id) + '" onclick="saveNoteModal(this.dataset.id)">Save Note</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

async function saveNoteModal(id) {
  var g = function(eid) { var el = document.getElementById(eid); return el ? el.value.trim() || null : null; };
  try {
    var res = await fetch(API + '/notes/' + id, {
      method: 'PUT', headers: authHdr(),
      body: JSON.stringify({
        title:     g('en-title'),
        content:   g('en-content'),
        category:  g('en-cat'),
        note_date: g('en-date'),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    var modal = document.getElementById('note-edit-modal');
    if (modal) modal.remove();
    toast('Note updated ✓', 'success');
    loadNotes();
  } catch(e) { toast(e.message || 'Update failed', 'error'); }
}

async function deleteNote(id) {
  if (!confirm('Delete this note permanently?')) return;
  try {
    var res = await fetch(API + '/notes/' + id, { method: 'DELETE', headers: authHdr() });
    if (res.status !== 204) throw new Error('Delete failed');
    var el = document.getElementById('note-' + id);
    if (el) el.remove();
    toast('Note deleted', 'success');
    loadDashStats();
    if (!document.querySelectorAll('[id^="note-"]').length) loadNotes();
  } catch(e) { toast(e.message || 'Delete failed', 'error'); }
}

// ══════════════════════════════════════════════
//  ACCOUNT SETTINGS
// ══════════════════════════════════════════════

function loadAccount() {
  if (!currentUser) return;
  var nameEl  = document.getElementById('acc-name');
  var emailEl = document.getElementById('acc-email');
  if (nameEl)  nameEl.value  = currentUser.full_name || '';
  if (emailEl) emailEl.value = currentUser.email     || '';
}

async function saveAccountDetails() {
  var nameEl = document.getElementById('acc-name');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { toast('Name cannot be empty', 'error'); return; }
  try {
    var res = await fetch(API + '/profile', {
      method: 'PUT', headers: authHdr(),
      body: JSON.stringify({ full_name: name }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    var updated = await res.json();
    currentUser.full_name = updated.full_name;
    localStorage.setItem('mm_user', JSON.stringify(currentUser));
    updateNav();
    toast('Profile updated ✓', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function changePassword() {
  var curr = (document.getElementById('acc-curr-pass') || {}).value || '';
  var next = (document.getElementById('acc-new-pass')  || {}).value || '';
  var conf = (document.getElementById('acc-conf-pass') || {}).value || '';
  if (!curr || !next) { toast('Fill in both password fields', 'error'); return; }
  if (next !== conf)  { toast('New passwords do not match', 'error'); return; }
  if (next.length < 6){ toast('Minimum 6 characters', 'error'); return; }
  try {
    var res = await fetch(API + '/profile/password', {
      method: 'PUT', headers: authHdr(),
      body: JSON.stringify({ current_password: curr, new_password: next }),
    });
    if (res.status === 204) {
      toast('Password changed ✓', 'success');
      ['acc-curr-pass','acc-new-pass','acc-conf-pass'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
    } else {
      throw new Error((await res.json()).detail);
    }
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteAccount() {
  if (!confirm('DELETE your entire account and all data? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure?')) return;
  try {
    var res = await fetch(API + '/profile', { method: 'DELETE', headers: authHdr() });
    if (res.status === 204) { toast('Account deleted', 'success'); logout(); }
  } catch(e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════
   MediMind — Triage Logic, Hospitals, Advice
   js/triage.js
   Depends on: js/app.js (token, currentUser, API, toast)
══════════════════════════════════════════════ */

// ── Quick chips ────────────────────────────────────────────────
function addChip(el, sym) {
  el.classList.toggle('on');
  const ta = document.getElementById('symptom-input');
  if (el.classList.contains('on')) {
    ta.value = ta.value ? ta.value.trimEnd() + ', ' + sym : sym;
  } else {
    ta.value = ta.value
      .replace(new RegExp(',?\\s*' + sym, 'g'), '')
      .replace(/^,\s*/, '').trim();
  }
}

// ── Core triage call ───────────────────────────────────────────
async function runTriage() {
  const symptoms = document.getElementById('symptom-input').value.trim();
  if (!symptoms || symptoms.length < 10) {
    toast('Please describe your symptoms in more detail (at least a sentence)', 'error');
    return;
  }

  const btn = document.getElementById('analyze-btn');
  btn.classList.add('loading'); btn.disabled = true;

  // Show a "thinking" placeholder in results area
  document.getElementById('triage-empty').style.display = 'none';
  const rw = document.getElementById('result-wrap');
  rw.style.display = 'block';
  rw.innerHTML = `
    <div style="padding:40px 0;text-align:center">
      <div style="font-size:32px;margin-bottom:16px">🔬</div>
      <div style="font-family:var(--serif);font-style:italic;font-size:20px;color:var(--text);margin-bottom:8px">Analyzing your symptoms…</div>
      <div style="font-size:13px;color:var(--text3)">This can take 30–60 seconds on first run while the AI model loads.</div>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:center">
        ${[1,2,3].map(i=>`<div class="skel" style="width:200px;height:14px;animation-delay:${i*.15}s"></div>`).join('')}
      </div>
    </div>`;

  // Append duration & location to symptoms text for better AI context
  const duration  = document.getElementById('input-duration')?.value;
  const location  = document.getElementById('input-location')?.value;
  let symptomsEnriched = symptoms;
  if (duration) symptomsEnriched += `. Duration: ${duration}`;
  if (location) symptomsEnriched += `. Location: ${location}`;

  const body = {
    symptoms: symptomsEnriched,
    language: 'en',
    age:       parseInt(document.getElementById('input-age').value) || null,
    gender:    document.getElementById('input-gender').value || null,
    existing_conditions: document.getElementById('input-conditions').value || null,
  };

  try {
    const ep   = token ? '/triage/analyze' : '/triage/guest-analyze';
    const hdrs = { 'Content-Type': 'application/json' };
    if (token) hdrs['Authorization'] = 'Bearer ' + token;

    const res = await fetch(API + ep, { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.detail || 'Analysis failed');
    }
    const data = await res.json();
    currentSessionId = data.session_id;
    renderResult(data);

    // After result renders, find nearby hospitals
    findNearbyHospitals(data.triage_result.level);

  } catch(e) {
    rw.innerHTML = `
      <div style="padding:40px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-size:14px;color:var(--red);font-weight:600">${e.message}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">
          Make sure Ollama is running and a model is pulled.<br/>
          Check: <code style="background:var(--mist2);padding:2px 6px;border-radius:4px">http://localhost:11434/api/tags</code>
        </div>
      </div>`;
    toast(e.message || 'Analysis failed', 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ── Medical references — build real URLs ───────────────────────
const REFERENCE_URLS = {
  // Mapped by keyword in source name/title
  'who':          'https://www.who.int/health-topics/',
  'mayo':         'https://www.mayoclinic.org/symptoms',
  'medline':      'https://medlineplus.gov/',
  'nhs':          'https://www.nhs.uk/conditions/',
  'webmd':        'https://www.webmd.com/symptoms/',
  'cdc':          'https://www.cdc.gov/az/',
  'harvard':      'https://www.health.harvard.edu/',
  'cleveland':    'https://my.clevelandclinic.org/health/diseases',
  'hopkin':       'https://www.hopkinsmedicine.org/health/',
  'nih':          'https://www.ncbi.nlm.nih.gov/pmc/',
  'pubmed':       'https://pubmed.ncbi.nlm.nih.gov/?term=',
  'uptodate':     'https://www.uptodate.com/contents/search',
};

function buildReferenceUrl(source, chiefComplaint) {
  const src = (source.source || source.title || '').toLowerCase();
  const cc  = encodeURIComponent(chiefComplaint || '');

  for (const [key, url] of Object.entries(REFERENCE_URLS)) {
    if (src.includes(key)) {
      // Append search term where possible
      if (url.endsWith('/') || url.endsWith('=')) return url + cc;
      return url;
    }
  }
  // Generic fallback: Google Scholar search
  const query = encodeURIComponent((source.title || source.source || chiefComplaint || 'medical symptoms') + ' medical');
  return `https://scholar.google.com/scholar?q=${query}`;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return 'Reference'; }
}

// ── Advice generator (based on triage level + symptoms) ───────
function generateAdvice(triageLevel, symptoms, redFlags) {
  const general = [
    { icon: '💧', title: 'Stay Hydrated', text: 'Drink at least 8 glasses of water per day. Proper hydration supports recovery and immune function.' },
    { icon: '😴', title: 'Rest Adequately', text: 'Ensure 7–9 hours of sleep. Your body heals most effectively during rest.' },
    { icon: '🍎', title: 'Nutritious Diet', text: 'Eat light, nutritious foods. Avoid heavy, oily or processed foods while symptomatic.' },
    { icon: '🌡️', title: 'Monitor Symptoms', text: 'Track how your symptoms change. If they worsen significantly, seek medical attention promptly.' },
  ];

  const levelAdvice = {
    EMERGENCY: [
      { icon: '🚨', title: 'Seek Immediate Help', text: '<strong>Do not wait.</strong> Call emergency services (1122 / 115) or go to the nearest emergency room right now.' },
      { icon: '📵', title: 'Do Not Drive Yourself', text: 'Have someone else drive you or call an ambulance. You need immediate professional care.' },
    ],
    URGENT: [
      { icon: '🏥', title: 'See a Doctor Today', text: 'Schedule an appointment or visit a clinic within the next 24–48 hours. Do not delay.' },
      { icon: '💊', title: 'Avoid Self-Medication', text: 'Do not take prescription medications without guidance. Over-the-counter relief is okay for mild symptoms only.' },
    ],
    SELF_CARE: [
      { icon: '🏡', title: 'Home Rest', text: 'You can manage this at home. Stay comfortable, avoid strenuous activity, and monitor for any worsening.' },
      { icon: '📞', title: 'When to Call a Doctor', text: 'If symptoms persist beyond 3–5 days, worsen, or new symptoms appear — consult a healthcare professional.' },
    ],
  };

  // Symptom-specific tips
  const symNames = (symptoms || []).map(s => (s.name || '').toLowerCase());
  const specific = [];

  if (symNames.some(s => s.includes('fever')))
    specific.push({ icon: '🌡️', title: 'Managing Fever', text: 'Use a damp cool cloth on your forehead. Paracetamol can help reduce fever. Stay cool and hydrated.' });
  if (symNames.some(s => s.includes('headache')))
    specific.push({ icon: '🧊', title: 'Headache Relief', text: 'Rest in a quiet, dark room. A cold compress on the forehead can help. Avoid screens.' });
  if (symNames.some(s => s.includes('cough')))
    specific.push({ icon: '🍯', title: 'Soothing Cough', text: 'Honey in warm water soothes the throat. Steam inhalation can loosen mucus. Avoid cold drinks.' });
  if (symNames.some(s => s.includes('nausea') || s.includes('vomit')))
    specific.push({ icon: '🫚', title: 'Managing Nausea', text: 'Eat small, bland meals (toast, rice, bananas). Avoid strong smells and spicy foods. Ginger tea may help.' });
  if (symNames.some(s => s.includes('abdominal') || s.includes('stomach')))
    specific.push({ icon: '🛏️', title: 'Abdominal Comfort', text: 'Lie on your left side to ease digestion. A warm (not hot) compress on the abdomen can relieve cramping.' });
  if (symNames.some(s => s.includes('sore throat')))
    specific.push({ icon: '🧂', title: 'Sore Throat Relief', text: 'Gargle warm salt water (1/2 tsp salt in a cup of water) 3–4 times a day. Warm fluids and honey help.' });

  const base = (levelAdvice[triageLevel] || levelAdvice.SELF_CARE);
  return [...base, ...specific, ...general].slice(0, 6);
}

// ── Render Result ──────────────────────────────────────────────
function renderResult(data) {
  const { symptom_profile: sp, triage_result: tr } = data;
  const lv        = tr.level;
  const bannerCls = lv === 'EMERGENCY' ? 'red' : lv === 'URGENT' ? 'amber' : 'green';
  const icon      = lv === 'EMERGENCY' ? '🚨' : lv === 'URGENT' ? '⚠️' : '✅';
  const pct       = Math.round((tr.confidence || .85) * 100);

  // Actions
  const actionsHtml = (tr.actions || []).map((a, i) => `
    <div class="action-row">
      <div class="action-num">${i + 1}</div>
      <div class="action-text">${a}</div>
    </div>`).join('');

  // Warnings
  const warnsHtml = (tr.warning_signs || []).map(w => `
    <div class="warn-row"><div class="warn-dot"></div>${w}</div>`).join('');

  // Symptoms table
  const sympRows = (sp.symptoms || []).map(s => `
    <tr>
      <td>${s.name || '—'}</td>
      <td><span class="sev ${s.severity || 'moderate'}">${s.severity || '—'}</span></td>
      <td>${s.duration || '—'}</td>
      <td>${s.location || '—'}</td>
    </tr>`).join('');

  // Red flags
  const rfHtml = sp.red_flags?.length ? `
    <div class="result-card span2" style="border-color:rgba(230,57,70,.4);background:rgba(255,237,238,.4)">
      <div class="rc-title" style="color:var(--red)">🚩 Red Flags Detected</div>
      <div class="redflag-list">${sp.red_flags.map(f => `
        <div class="redflag-item">⚠️ ${f}</div>`).join('')}
      </div>
    </div>` : '';

  // Advice
  const advice     = generateAdvice(lv, sp.symptoms, sp.red_flags);
  const adviceHtml = advice.map(a => `
    <div class="advice-item">
      <span class="advice-icon">${a.icon}</span>
      <div class="advice-text"><strong>${a.title}:</strong> ${a.text}</div>
    </div>`).join('');

  // Medical references with real links
  const srcHtml = (tr.sources || []).slice(0, 4).map(s => {
    const url    = buildReferenceUrl(s, sp.chief_complaint);
    const domain = getDomain(url);
    return `
      <div class="source-card">
        <a class="source-link" href="${url}" target="_blank" rel="noopener noreferrer">
          <span class="source-icon">📚</span>
          <div class="source-body">
            <div class="source-name">
              ${s.title || s.source || 'Medical Reference'}
              <span class="source-name-ext">↗</span>
            </div>
            <div class="source-snippet">${(s.content || '').slice(0, 160)}…</div>
            <div class="source-footer">
              <span class="source-rel">Relevance: ${Math.round((s.relevance || 0) * 100)}%</span>
              <span class="source-domain">${domain}</span>
            </div>
          </div>
        </a>
      </div>`;
  }).join('');

  // PDF button
  const pdfBtn = currentUser
    ? `<button class="pdf-btn" onclick="downloadReport()">📄 &nbsp;Download PDF Medical Brief</button>`
    : `<button class="pdf-btn" onclick="openModal('register')">🔐 &nbsp;Sign in to Download PDF Report</button>`;

  const html = `
  <div class="result-wrap">

    <!-- Triage Banner -->
    <div class="result-banner ${bannerCls}">
      <div class="banner-icon">${icon}</div>
      <div class="banner-body">
        <div class="banner-eyebrow">${lv.replace('_', ' ')} — MediMind AI Assessment</div>
        <div class="banner-title">${tr.headline || sp.chief_complaint}</div>
        <div class="banner-sub">${tr.response || ''}</div>
        <div class="banner-conf">
          AI Confidence ${pct}%
          <div class="conf-bar"><div class="conf-fill" style="width:0%"></div></div>
        </div>
      </div>
    </div>

    <div class="result-grid">
      ${rfHtml}

      <!-- Actions -->
      <div class="result-card">
        <div class="rc-title">Recommended Actions</div>
        <div class="action-list">
          ${actionsHtml || '<span style="color:var(--text3);font-size:13px">No specific actions at this time</span>'}
        </div>
      </div>

      <!-- Warnings -->
      <div class="result-card">
        <div class="rc-title">Watch For These Signs</div>
        <div class="warn-list">
          ${warnsHtml || '<span style="color:var(--text3);font-size:13px">No specific warning signs</span>'}
        </div>
      </div>

      <!-- Advice -->
      <div class="result-card span2">
        <div class="rc-title" style="--teal:#7c3aed">💡 Health Advice & Suggestions</div>
        <div class="advice-list">${adviceHtml}</div>
      </div>

      <!-- Symptoms table -->
      ${sympRows ? `
      <div class="result-card span2">
        <div class="rc-title">Extracted Symptoms</div>
        <table class="sym-table">
          <thead><tr><th>Symptom</th><th>Severity</th><th>Duration</th><th>Location</th></tr></thead>
          <tbody>${sympRows}</tbody>
        </table>
      </div>` : ''}

      <!-- References as clickable links -->
      ${srcHtml ? `
      <div class="result-card span2">
        <div class="rc-title">Medical References</div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px">
          Click any reference to read the full article from the original source.
        </p>
        <div class="source-list">${srcHtml}</div>
      </div>` : ''}
    </div>

    <!-- Nearby hospitals (filled in after geolocation) -->
    <div id="hospitals-section"></div>

    <!-- Follow-up chat -->
    <div class="chat-card">
      <div class="rc-title">Ask a Follow-up Question</div>
      <div class="chat-messages" id="chat-msgs">
        <div class="msg">
          <div class="msg-av ai">MM</div>
          <div class="msg-bbl">Assessment complete. Do you have any follow-up questions about your symptoms or the recommendations above?</div>
        </div>
      </div>
      <div class="chat-input-row">
        <input class="chat-input" id="chat-input" type="text"
          placeholder="Ask anything about your symptoms…"
          onkeydown="if(event.key==='Enter') sendChat()"/>
        <button class="chat-send" id="chat-send" onclick="sendChat()">→</button>
      </div>
    </div>

    ${pdfBtn}
  </div>`;

  const rw = document.getElementById('result-wrap');
  rw.innerHTML = html;
  rw.style.display = 'block';
  document.getElementById('triage-empty').style.display = 'none';
  rw.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Animate confidence bar
  requestAnimationFrame(() => {
    const fill = document.querySelector('.conf-fill');
    if (fill) { fill.style.width = '0%'; setTimeout(() => fill.style.width = pct + '%', 80); }
  });
}

// ── Follow-up chat ─────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const q = input.value.trim();
  if (!q) return;

  const btn = document.getElementById('chat-send');
  btn.disabled = true; btn.textContent = '…';
  input.value = '';

  const msgs = document.getElementById('chat-msgs');
  msgs.innerHTML += `
    <div class="msg user">
      <div class="msg-av hu">👤</div>
      <div class="msg-bbl">${q}</div>
    </div>`;
  msgs.scrollTop = msgs.scrollHeight;

  try {
    if (token && currentSessionId) {
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
      const res = await fetch(API + '/triage/followup', {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ session_id: currentSessionId, question: q, language: 'en' }),
      });
      const d = await res.json();
      msgs.innerHTML += `
        <div class="msg">
          <div class="msg-av ai">MM</div>
          <div class="msg-bbl">${d.answer}</div>
        </div>`;
    } else {
      msgs.innerHTML += `
        <div class="msg">
          <div class="msg-av ai">MM</div>
          <div class="msg-bbl">Please sign in to ask follow-up questions with full session context saved.</div>
        </div>`;
    }
  } catch(e) {
    msgs.innerHTML += `
      <div class="msg">
        <div class="msg-av ai">MM</div>
        <div class="msg-bbl" style="color:var(--red)">Sorry, I could not process that. Please try again.</div>
      </div>`;
  } finally {
    btn.disabled = false; btn.textContent = '→';
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ── PDF report ─────────────────────────────────────────────────
async function downloadReport() {
  if (!currentSessionId || !token) return;
  toast('Generating your PDF report…', 'success');
  try {
    const res = await fetch(API + '/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ session_id: currentSessionId, patient_name: currentUser.full_name }),
    });
    if (!res.ok) throw new Error('Report generation failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `MediMind_Report_${currentSessionId}.pdf`;
    a.click(); URL.revokeObjectURL(url);
    toast('PDF downloaded! ✓', 'success');
  } catch(e) {
    toast('Could not generate PDF: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════
//  NEARBY HOSPITALS — Geolocation + Google Maps
// ══════════════════════════════════════════════

async function findNearbyHospitals(triageLevel) {
  const section = document.getElementById('hospitals-section');
  if (!section) return;

  // Show loading state
  section.innerHTML = `
    <div class="hospitals-card">
      <div class="location-header">
        <div class="rc-title">🏥 Nearest Medical Facilities</div>
        <div class="location-badge locating">
          <span class="loc-pulse"></span> Detecting your location…
        </div>
      </div>
      <div class="hospital-list">
        ${[1,2,3].map(() => `<div class="skel" style="height:80px;border-radius:10px"></div>`).join('')}
      </div>
    </div>`;

  // Get or request location
  let lat = window._userLat;
  let lng = window._userLng;

  if (!lat || !lng) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      window._userLat = lat; window._userLng = lng;
    } catch(e) {
      renderHospitalsManual(section, triageLevel);
      return;
    }
  }

  // Use Google Maps Places API (Nearby Search via public endpoint)
  // We use the embed approach with OSM Nominatim for reverse geocode + Google Maps link
  try {
    // Reverse geocode to get city name using free Nominatim
    const geoRes  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'MediMind/1.0' } }
    );
    const geoData = await geoRes.json();
    const city    = geoData.address?.city || geoData.address?.town || geoData.address?.state || 'your area';
    const country = geoData.address?.country || '';

    // Search for hospitals using Overpass API (free, no key needed)
    const overpassQuery = `
      [out:json][timeout:15];
      (
        node["amenity"="hospital"](around:10000,${lat},${lng});
        node["amenity"="clinic"](around:5000,${lat},${lng});
        node["amenity"="doctors"](around:3000,${lat},${lng});
        way["amenity"="hospital"](around:10000,${lat},${lng});
      );
      out center 8;
    `;
    const overpassRes = await fetch(
      'https://overpass-api.de/api/interpreter',
      { method: 'POST', body: overpassQuery }
    );
    const overpassData = await overpassRes.json();

    const facilities = (overpassData.elements || [])
      .filter(el => el.tags?.name)
      .map(el => {
        const elLat = el.lat || el.center?.lat || lat;
        const elLng = el.lon || el.center?.lon || lng;
        const dist  = haversine(lat, lng, elLat, elLng);
        return {
          name:    el.tags.name,
          type:    el.tags.amenity || 'hospital',
          phone:   el.tags.phone || el.tags['contact:phone'] || null,
          addr:    [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', ') || city,
          lat:     elLat, lng: elLng,
          dist,
          mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${elLat},${elLng}`,
        };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    renderHospitalsList(section, facilities, city, country, lat, lng, triageLevel);

  } catch(e) {
    renderHospitalsManual(section, triageLevel, lat, lng);
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

function typeLabel(type) {
  const map = { hospital: '🏥 Hospital', clinic: '🏨 Clinic', doctors: '👨‍⚕️ Doctor', pharmacy: '💊 Pharmacy' };
  return map[type] || '🏥 Medical Facility';
}

function renderHospitalsList(section, facilities, city, country, userLat, userLng, triageLevel) {
  const urgent = triageLevel === 'EMERGENCY';
  const gmapsSearch = `https://www.google.com/maps/search/hospitals+near+me/@${userLat},${userLng},14z`;

  if (!facilities.length) {
    renderHospitalsManual(section, triageLevel, userLat, userLng);
    return;
  }

  const listHtml = facilities.map(f => `
    <a class="hospital-item" href="${f.mapsUrl}" target="_blank" rel="noopener noreferrer">
      <span class="hosp-icon">${typeLabel(f.type).split(' ')[0]}</span>
      <div class="hosp-body">
        <div class="hosp-name">${f.name}</div>
        <div class="hosp-addr">📍 ${f.addr}${f.phone ? ` &nbsp;·&nbsp; 📞 ${f.phone}` : ''}</div>
        <div class="hosp-footer">
          <span class="hosp-dist">📏 ${f.dist} km away</span>
          <span class="hosp-open open">● Open</span>
          <span class="hosp-dir-btn">Get Directions ↗</span>
        </div>
      </div>
    </a>`).join('');

  section.innerHTML = `
    <div class="hospitals-card">
      <div class="location-header">
        <div class="rc-title">🏥 Nearest Medical Facilities</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="location-badge">
            📍 ${city}${country ? ', ' + country : ''}
          </div>
          <button class="refresh-loc-btn" onclick="findNearbyHospitals('${triageLevel}')">↻ Refresh</button>
        </div>
      </div>
      ${urgent ? `<div style="background:var(--red-lt);border:1px solid rgba(230,57,70,.25);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--red);font-weight:600;margin-bottom:14px">
        🚨 EMERGENCY detected — go to the nearest hospital immediately or call 1122 / 115
      </div>` : ''}
      <div class="hospital-list">${listHtml}</div>
      <a href="${gmapsSearch}" target="_blank" rel="noopener noreferrer"
        style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;
        padding:10px;border-radius:10px;border:1px solid var(--wire2);font-size:12px;
        font-weight:700;color:var(--blue);text-decoration:none;background:var(--blue-lt);">
        🗺️ View All Hospitals on Google Maps ↗
      </a>
    </div>`;
}

function renderHospitalsManual(section, triageLevel, lat, lng) {
  const gmapsUrl = lat && lng
    ? `https://www.google.com/maps/search/hospitals+near+me/@${lat},${lng},14z`
    : `https://www.google.com/maps/search/hospitals+near+me`;

  section.innerHTML = `
    <div class="hospitals-card">
      <div class="rc-title">🏥 Find Nearby Medical Facilities</div>
      <div class="hospitals-empty">
        <div class="hospitals-empty-icon">📍</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.6">
          ${lat ? 'Could not load hospital data from OpenStreetMap.' : 'Location access was denied.'}<br/>
          Use the links below to find hospitals near you.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer"
            style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;
            background:var(--ink);color:#fff;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">
            🗺️ Google Maps — Hospitals Near Me
          </a>
          <a href="https://www.google.com/search?q=hospital+near+me" target="_blank" rel="noopener noreferrer"
            style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;
            background:var(--blue-lt);color:var(--blue);border:1px solid var(--wire2);border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">
            🔍 Search Google
          </a>
        </div>
      </div>
    </div>`;
}

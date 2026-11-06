'use strict';
// ============================================================================================
// TIJDELIJK TRAININGSLOG NAAR GOOGLE SHEETS
// ============================================================================================
// Een vangnet zolang de app nog in ontwikkeling is: elke set van vandaag komt ook als regel in de
// Google Sheet "AI Fitness Co-Pilot - Trainingslog" in de Drive van het ingelogde account. Gaat er
// in de app iets mis (bv. per ongeluk Alles resetten), dan staan de trainingen van eerdere dagen nog
// in de spreadsheet.
//
// HELEMAAL VERWIJDEREN (alles staat in dit bestand, plus vier regels elders, allemaal gemarkeerd
// met "SHEETS-LOG"):
//   1. index.html: de regel <script src="sheets-log.js"></script>          (SHEETS-LOG)
//   2. app.js, persistWorkout(): de regel met SheetsLog.onWorkoutChange      (SHEETS-LOG)
//   3. app.js, Alles resetten: de regel met SheetsLog.onResetAll             (SHEETS-LOG)
//   4. app.js, menu van de Fitness Tracker: het item "Instellingen"         (SHEETS-LOG)
//   5. dit bestand en tests/sheets-log.test.js weggooien.
//   Zoek ter controle in de map op "SheetsLog" en "SHEETS-LOG": er mag niets meer staan.
//   Optioneel: het Firestore-document users/{uid}/meta/sheets_log verwijderen, en in de Google Cloud
//   Console de OAuth-client en de Sheets/Drive API weer uitzetten. De spreadsheet zelf blijft
//   gewoon in je Drive staan.
//   (Alleen stappen 1 en 2 tellen echt: zonder dit bestand doen de andere regels niets, want ze
//   kijken eerst of window.SheetsLog bestaat.)
//
// Hoe het werkt
//   - Toestemming: Google Identity Services (GIS), scope drive.file: de app kan alleen bij bestanden
//     die hij zelf heeft gemaakt. Er wordt alleen om toestemming gevraagd na een tik op Koppelen of
//     Vernieuwen in Instellingen, nooit vanzelf. Een toegangssleutel geldt een uur; daarna toont
//     Instellingen "Toegang verlopen" en blijven de wijzigingen bewaard tot je op Vernieuwen tikt
//     (zie renewSilently() waarom dat op de achtergrond niet kan).
//   - Dagregel: alleen een wijziging aan de dag die op het moment van de wijziging vandaag is
//     (todayStr(), Nederlandse tijd) komt in de wachtrij, als de volledige stand van die dag
//     (pending[datum]). Bij versturen worden alleen regels met precies die datum en een set-id
//     van die datum toegevoegd, gewijzigd of verwijderd; elke andere regel blijft onaangeroerd.
//     De wachtrij staat in localStorage, dus een set die om 23:50 offline is gelogd gaat na
//     middernacht nog met de datum van gisteren mee.
//   - Set-id: "datum|oefening-id|setnummer" (bij dezelfde oefening twee keer op een dag "#2" achter
//     het oefening-id). Wordt set 2 verwijderd, dan schuiven de regels mee zoals in de app.
//   - Nooit blokkerend: alle aanroepen vanuit de app zijn synchroon, kort en vangen elke fout af;
//     versturen gebeurt later, los van de app.
// ============================================================================================
(function () {
  // ── Instellingen die je zelf invult (zie de stappen in de commit / het antwoord van Claude) ──
  // De OAuth-client-id uit de Google Cloud Console, "….apps.googleusercontent.com".
  const CLIENT_ID = '';

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const SHEET_NAME = 'AI Fitness Co-Pilot - Trainingslog';
  const TAB = 'Log';
  const HEADERS = ['Datum', 'Oefening', 'Categorie', 'Subcategorie', 'Set', 'Gewicht (kg)', 'Reps', 'Duur', 'Afstand', 'Set-id'];
  const COLS = HEADERS.length; // A:J
  const ID_COL = COLS - 1;
  const FLUSH_DELAY_MS = 1500;
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

  // ── Toestand (per account in localStorage; koppeling ook in Firestore meta/sheets_log) ─────
  // { enabled, linked, spreadsheetId, sheetId, url, email, token: { value, exp }, pending: { datum:
  //   { rows } }, lastSync, error: null | 'expired' | tekst }
  let uid = null, email = '';
  let st = null;
  const fresh = () => ({ enabled: true, linked: false, spreadsheetId: '', sheetId: 0, url: '', email: '', token: null, pending: {}, lastSync: '', error: null });
  const lsKey = () => 'sheetsLog:' + uid;
  function load() {
    try { st = Object.assign(fresh(), JSON.parse(localStorage.getItem(lsKey()) || '{}')); } catch (e) { st = fresh(); }
    if (!st.pending || typeof st.pending !== 'object') st.pending = {};
  }
  function save() { try { if (uid && st) localStorage.setItem(lsKey(), JSON.stringify(st)); } catch (e) { /* vol of uit: niets aan te doen */ } }
  function remoteDoc() { return fStore.doc('users/' + uid + '/meta/sheets_log'); }
  function saveRemote() {
    try {
      const p = remoteDoc().set({ enabled: st.enabled, linked: st.linked, spreadsheetId: st.spreadsheetId, sheetId: st.sheetId, url: st.url, email: st.email }, { merge: true });
      if (p && p.catch) p.catch(e => console.warn('[SheetsLog] Firestore opslaan mislukt', e));
    } catch (e) { console.warn('[SheetsLog] Firestore opslaan mislukt', e); }
  }

  function setUser(user) {
    uid = user ? user.uid : null;
    email = user ? (user.email || '') : '';
    st = null;
    if (!uid) { render(); return; }
    load();
    render();
    // De koppeling (welke spreadsheet) staat per account in Firestore: ook na een nieuwe installatie.
    try {
      const myUid = uid;
      Promise.resolve(remoteDoc().get()).then(snap => {
        if (uid !== myUid || !snap || !snap.exists) return;
        const d = snap.data() || {};
        const types = { enabled: 'boolean', linked: 'boolean', spreadsheetId: 'string', sheetId: 'number', url: 'string', email: 'string' };
        Object.keys(types).forEach(k => { if (typeof d[k] === types[k]) st[k] = d[k]; });
        save(); render(); scheduleFlush(0);
      }).catch(e => console.warn('[SheetsLog] Firestore lezen mislukt', e));
    } catch (e) { console.warn('[SheetsLog] Firestore lezen mislukt', e); }
    scheduleFlush(0);
  }

  // ── Regels opbouwen ───────────────────────────────────────────────────────────────────────
  const cell = v => (v === undefined || v === null || v === '') ? '' : v;
  function buildRows(date, exercises) {
    const rows = [], seen = {};
    (exercises || []).forEach(entry => {
      if (!entry || !entry.exerciseId) return;
      const n = seen[entry.exerciseId] = (seen[entry.exerciseId] || 0) + 1;
      const ex = (typeof findExercise === 'function' && findExercise(entry.exerciseId)) || {};
      const sub = ex.subcategory && typeof exerciseSubcategory === 'function' ? exerciseSubcategory(ex) : null;
      const cat = ex.category && typeof categoryName === 'function' ? categoryName(ex.category) : '';
      (entry.sets || []).forEach((s, i) => {
        s = s || {};
        rows.push([date, ex.name || entry.exerciseId, cat || '', sub ? sub.name : '', i + 1,
          cell(s.weight), cell(s.reps), cell(s.duration), cell(s.distance),
          `${date}|${entry.exerciseId}${n > 1 ? '#' + n : ''}|${i + 1}`]);
      });
    });
    return rows;
  }

  // ── Haken vanuit de app (synchroon, nooit een fout naar buiten) ────────────────────────────
  // Elke wijziging van een trainingsdag (persistWorkout). Alleen vandaag telt, bepaald NU.
  function onWorkoutChange(date, exercises) {
    try {
      if (!st || !st.enabled || !st.linked) return;
      const today = todayStr();
      if (date !== today) return;
      st.pending[today] = { rows: buildRows(today, exercises) };
      save(); render(); scheduleFlush();
    } catch (e) { console.warn('[SheetsLog] onWorkoutChange', e); }
  }
  // Alles resetten: alleen de regels van vandaag weg. Eerdere dagen blijven staan.
  function onResetAll() { onWorkoutChange(todayStr(), []); }

  // ── Versturen ─────────────────────────────────────────────────────────────────────────────
  let flushTimer = null, flushing = false, again = false;
  function scheduleFlush(ms = FLUSH_DELAY_MS) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flush().catch(e => console.warn('[SheetsLog] flush', e)); }, ms);
  }
  const hasToken = () => !!(st && st.token && st.token.value && st.token.exp > Date.now() + 60000);
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + st.token.value, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      let msg = res.status + '';
      try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { /* geen json */ }
      throw new HttpError(res.status, msg);
    }
    return res.status === 204 ? {} : res.json();
  }

  // Past de gewenste stand van één dag toe op de gelezen regels. Raakt alleen regels met precies
  // deze datum én een set-id van deze datum.
  function planDay(date, wanted, values) {
    const updates = [], appends = [], deletes = [];
    const existing = new Map();
    values.forEach((row, i) => {
      if (i === 0 || !row) return; // kopregel
      const id = String(row[ID_COL] || '');
      if (String(row[0]) !== date || !id.startsWith(date + '|')) return;
      if (existing.has(id)) deletes.push(i); else existing.set(id, i); // dubbel: de tweede weg
    });
    const wantedIds = new Set();
    wanted.forEach(row => {
      if (row[0] !== date) return; // vangnet: nooit een andere datum schrijven
      const id = row[ID_COL];
      wantedIds.add(id);
      if (existing.has(id)) {
        const i = existing.get(id);
        const cur = values[i] || [];
        if (row.some((v, c) => String(v) !== String(cur[c] === undefined ? '' : cur[c]))) updates.push({ i, row });
      } else appends.push(row);
    });
    existing.forEach((i, id) => { if (!wantedIds.has(id)) deletes.push(i); });
    return { updates, appends, deletes };
  }

  async function flush() {
    if (!st || !st.linked || !st.spreadsheetId) return;
    const dates = Object.keys(st.pending).sort();
    if (!dates.length) return;
    if (flushing) { again = true; return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { render(); return; }
    if (!hasToken()) { st.error = 'expired'; save(); render(); return; }
    flushing = true;
    const myUid = uid;
    const sent = {}; dates.forEach(d => { sent[d] = st.pending[d]; });
    try {
      const range = encodeURIComponent(TAB + '!A:' + String.fromCharCode(64 + COLS));
      const got = await api(`${SHEETS}/${st.spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
      const values = got.values || [];
      const updates = [], appends = [], deletes = [];
      dates.forEach(d => {
        const p = planDay(d, sent[d].rows || [], values);
        updates.push(...p.updates); appends.push(...p.appends); deletes.push(...p.deletes);
      });
      // 1. wijzigen (rijnummers van vóór het verwijderen), 2. verwijderen van onder naar boven, 3. onderaan toevoegen
      if (updates.length) {
        await api(`${SHEETS}/${st.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: {
          valueInputOption: 'RAW',
          data: updates.map(u => ({ range: `${TAB}!A${u.i + 1}:${String.fromCharCode(64 + COLS)}${u.i + 1}`, values: [u.row] })),
        } });
      }
      if (deletes.length) {
        const rows = [...new Set(deletes)].sort((a, b) => b - a);
        await api(`${SHEETS}/${st.spreadsheetId}:batchUpdate`, { method: 'POST', body: {
          requests: rows.map(i => ({ deleteDimension: { range: { sheetId: st.sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })),
        } });
      }
      if (appends.length) {
        await api(`${SHEETS}/${st.spreadsheetId}/values/${encodeURIComponent(TAB + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values: appends } });
      }
      if (uid !== myUid) return;
      // Alleen weghalen wat verstuurd is: een nieuwere wijziging van intussen blijft staan.
      dates.forEach(d => { if (st.pending[d] === sent[d]) delete st.pending[d]; });
      st.lastSync = new Date().toISOString();
      st.error = null;
    } catch (e) {
      if (uid !== myUid) return;
      console.warn('[SheetsLog] versturen mislukt', e);
      if (e && e.status === 401) { st.token = null; st.error = 'expired'; }
      else if (e && e.status === 404) st.error = 'De spreadsheet is niet gevonden (verwijderd?). Ontkoppel en koppel opnieuw.';
      else if (e && e.status === 403) st.error = 'Geen toegang tot de spreadsheet (' + e.message + ').';
      else if (e instanceof HttpError) st.error = 'Google gaf een fout: ' + e.message;
      else st.error = typeof navigator !== 'undefined' && navigator.onLine === false ? null : 'Versturen mislukt, wordt later opnieuw geprobeerd.';
    } finally {
      flushing = false;
      save(); render();
      if (again) { again = false; scheduleFlush(0); }
    }
  }

  // ── Toegang (Google Identity Services) ────────────────────────────────────────────────────
  let gisPromise = null, tokenClient = null, tokenWaiter = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisPromise = null; reject(new Error('Google-inlogscript niet geladen')); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }
  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: email,
      callback: resp => {
        const w = tokenWaiter; tokenWaiter = null;
        if (!w) return;
        if (resp && resp.access_token) w.resolve(resp); else w.reject(new Error((resp && (resp.error_description || resp.error)) || 'Geen toegang gekregen'));
      },
      error_callback: err => {
        const w = tokenWaiter; tokenWaiter = null;
        if (w) w.reject(new Error(err && err.type === 'popup_closed' ? 'Venster gesloten' : (err && err.message) || 'Toestemming mislukt'));
      },
    });
    return tokenClient;
  }
  // Moet direct binnen een tik worden aangeroepen (anders blokkeert de browser het venster).
  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.accounts || !google.accounts.oauth2) { reject(new Error('Google-inlogscript nog niet geladen, probeer het zo opnieuw.')); loadGis().catch(() => {}); return; }
      tokenWaiter = { resolve, reject };
      ensureTokenClient().requestAccessToken({ prompt, login_hint: email });
    });
  }
  // Op de achtergrond vernieuwen: Google Identity Services kan een sleutel alleen geven via een
  // venster (pop-up), en een browser blokkeert dat zonder tik; dat venster mag volgens de opzet ook
  // nooit onverwacht tijdens een training verschijnen. Zonder eigen server (deze app is statisch
  // op GitHub Pages) bestaat er geen vernieuwing zonder venster. Daarom: de sleutel blijft een uur
  // geldig (ook na herstarten van de app, in localStorage), daarna wacht de wachtrij tot je in
  // Instellingen op Vernieuwen tikt. Er gaat niets verloren.
  function renewSilently() { return hasToken(); }

  async function verifyAccount() {
    const me = await api('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
    const got = ((me && me.user && me.user.emailAddress) || '').toLowerCase();
    if (email && got && got !== email.toLowerCase()) {
      throw new Error(`Je koos ${got}, maar je bent in de app ingelogd als ${email}. Koppel met hetzelfde account.`);
    }
  }
  async function ensureSpreadsheet() {
    if (st.spreadsheetId) {
      try {
        const s = await api(`${SHEETS}/${st.spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,sheets.properties`);
        const tab = (s.sheets || []).map(x => x.properties).find(p => p.title === TAB);
        if (tab) { st.sheetId = tab.sheetId; st.url = s.spreadsheetUrl || st.url; return; }
      } catch (e) {
        if (!(e && (e.status === 404 || e.status === 403))) throw e;
      }
    }
    const created = await api(SHEETS, { method: 'POST', body: {
      properties: { title: SHEET_NAME, locale: 'nl_NL', timeZone: 'Europe/Amsterdam' },
      sheets: [{
        properties: { title: TAB, gridProperties: { frozenRowCount: 1 } },
        data: [{ startRow: 0, startColumn: 0, rowData: [{ values: HEADERS.map(h => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }] }],
      }],
    } });
    st.spreadsheetId = created.spreadsheetId;
    st.url = created.spreadsheetUrl;
    st.sheetId = created.sheets && created.sheets[0] ? created.sheets[0].properties.sheetId : 0;
  }
  function takeToken(resp) {
    st.token = { value: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
  }
  function queueToday() {
    try { st.pending[todayStr()] = { rows: buildRows(todayStr(), typeof getWorkout === 'function' ? getWorkout(todayStr()) : []) }; } catch (e) { /* niets */ }
  }

  let busy = false;
  async function link({ renewOnly = false } = {}) {
    if (busy || !uid) return;
    if (!CLIENT_ID) { st.error = 'Nog geen OAuth-client-id ingevuld in sheets-log.js (CLIENT_ID).'; render(); return; }
    busy = true; st.error = null; render();
    try {
      // Eerst toestemming (meteen, binnen de tik); daarna pas de rest.
      const resp = await requestToken(renewOnly && st.linked ? '' : 'consent');
      takeToken(resp);
      await verifyAccount();
      await ensureSpreadsheet();
      const wasLinked = st.linked;
      st.linked = true; st.email = email;
      if (!wasLinked) queueToday(); // bij koppelen: de sets van vandaag tot nu toe
      save(); saveRemote();
      busy = false; render();
      await flush();
    } catch (e) {
      console.warn('[SheetsLog] koppelen mislukt', e);
      if (!renewOnly) st.token = null;
      st.error = (e && e.message) || 'Koppelen mislukt.';
      save();
    } finally { busy = false; render(); }
  }
  function unlink() {
    if (!st) return;
    try { if (st.token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(st.token.value, () => {}); } catch (e) { /* niets */ }
    // De spreadsheet-id blijft bewaard: opnieuw koppelen gebruikt dezelfde spreadsheet.
    st.linked = false; st.token = null; st.pending = {}; st.error = null;
    save(); saveRemote(); render();
  }
  function setEnabled(on) {
    if (!st) return;
    st.enabled = !!on;
    if (on && st.linked) { queueToday(); scheduleFlush(0); }
    if (!on) st.pending = {};
    save(); saveRemote(); render();
  }

  // ── Instellingen (eigen scherm, in de bestaande stijl) ─────────────────────────────────────
  const SCREEN_ID = 'screen-settings';
  function buildScreen() {
    if (document.getElementById(SCREEN_ID)) return;
    const el = document.createElement('div');
    el.id = SCREEN_ID;
    el.className = 'screen';
    el.innerHTML = `
  <div class="toolbar">
    <button class="toolbar-btn" id="btn-back-settings" aria-label="Terug">
      <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
    </button>
    <span class="toolbar-title">Instellingen</span>
  </div>
  <div class="plate-calc-scroll">
    <div class="plate-section" id="sheets-log-settings">
      <div class="section-label section-head">Trainingslog in Google Sheets</div>
      <div class="role-sub">Tijdelijk vangnet: elke set die je vandaag logt, komt ook als regel in een Google Sheet in je Drive. Eerdere dagen worden daar nooit meer aangepast.</div>
      <div class="plate-section">
        <label class="section-label" for="sheets-log-toggle">Bijhouden</label>
        <div class="info-toggle"><button type="button" class="extra-type-btn" id="sheets-log-toggle" aria-pressed="false">Nee</button></div>
      </div>
      <div class="plate-section">
        <div class="section-label">Status</div>
        <div class="role-row" id="sheets-log-status" role="status" aria-live="polite"></div>
        <div class="role-sub" id="sheets-log-account"></div>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="sheets-log-link">Koppelen</button>
      <button type="button" class="btn btn-primary btn-block hidden" id="sheets-log-renew">Vernieuwen</button>
      <button type="button" class="btn btn-secondary btn-block hidden" id="sheets-log-open">Spreadsheet openen</button>
      <button type="button" class="btn btn-secondary btn-block btn-danger-text hidden" id="sheets-log-unlink">Ontkoppelen</button>
    </div>
  </div>`;
    document.body.appendChild(el);
    el.querySelector('#btn-back-settings').addEventListener('click', () => goBack('screen-fitness-tracker'));
    el.querySelector('#sheets-log-toggle').addEventListener('click', () => { if (st) setEnabled(!st.enabled); });
    el.querySelector('#sheets-log-link').addEventListener('click', () => link());
    el.querySelector('#sheets-log-renew').addEventListener('click', () => link({ renewOnly: true }));
    el.querySelector('#sheets-log-unlink').addEventListener('click', unlink);
    el.querySelector('#sheets-log-open').addEventListener('click', () => { if (st && st.url) window.open(st.url, '_blank', 'noopener'); });
  }
  function whenText(iso) {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(d);
    const day = amsterdamDateFormat.format(d) === todayStr() ? 'vandaag' : formatDateStr(amsterdamDateFormat.format(d), 'noWeekday');
    return `${day} om ${time}`;
  }
  // De statusregel: altijd in woorden (niet alleen kleur).
  function statusText() {
    if (!uid || !st) return 'Niet ingelogd.';
    if (busy) return 'Bezig met koppelen…';
    if (!st.linked && !CLIENT_ID) return 'Nog niet ingesteld: vul de OAuth-client-id in (CLIENT_ID in sheets-log.js).';
    if (!st.linked) return st.error ? 'Niet gekoppeld. Fout: ' + st.error : 'Niet gekoppeld.';
    if (!st.enabled) return 'Uit: er wordt niets naar de spreadsheet gestuurd.';
    const waiting = Object.keys(st.pending).length;
    const last = st.lastSync ? 'Laatst bijgewerkt: ' + whenText(st.lastSync) + '.' : 'Nog niet bijgewerkt.';
    if (waiting && typeof navigator !== 'undefined' && navigator.onLine === false) return 'Offline: wijzigingen worden verstuurd zodra er internet is. ' + last;
    if (st.error === 'expired' || (waiting && !hasToken())) return 'Toegang verlopen. Tik op Vernieuwen; je wijzigingen blijven bewaard. ' + last;
    if (st.error) return 'Fout: ' + st.error + ' ' + last;
    if (waiting) return 'Bezig met bijwerken… ' + last;
    return 'In orde. ' + last;
  }
  function render() {
    const root = document.getElementById(SCREEN_ID);
    if (!root) return;
    const $ = id => root.querySelector('#' + id);
    const on = !!(st && st.enabled);
    const linked = !!(st && st.linked);
    const toggle = $('sheets-log-toggle');
    toggle.classList.toggle('active', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.textContent = on ? 'Ja' : 'Nee';
    toggle.disabled = !st;
    $('sheets-log-status').textContent = statusText();
    $('sheets-log-account').textContent = linked && st.email ? 'Account: ' + st.email : '';
    $('sheets-log-link').classList.toggle('hidden', linked);
    $('sheets-log-link').disabled = busy || !st;
    const needRenew = linked && on && (st.error === 'expired' || (Object.keys(st.pending).length > 0 && !hasToken()));
    $('sheets-log-renew').classList.toggle('hidden', !needRenew);
    $('sheets-log-renew').disabled = busy;
    $('sheets-log-unlink').classList.toggle('hidden', !linked);
    const open = $('sheets-log-open');
    open.classList.toggle('hidden', !(st && st.url));
    if (st && st.url) open.dataset.url = st.url;
  }
  function openSettings() {
    buildScreen();
    render();
    loadGis().catch(() => {}); // vooraf laden, zodat Koppelen meteen binnen de tik een venster kan openen
    showScreen(SCREEN_ID);
  }

  // ── Opstarten ─────────────────────────────────────────────────────────────────────────────
  try {
    buildScreen();
    if (typeof fAuth !== 'undefined' && fAuth && typeof fAuth.onAuthStateChanged === 'function') fAuth.onAuthStateChanged(u => { try { setUser(u); } catch (e) { console.warn('[SheetsLog]', e); } });
    window.addEventListener('online', () => scheduleFlush(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleFlush(0); });
  } catch (e) { console.warn('[SheetsLog] opstarten mislukt', e); }

  window.SheetsLog = {
    onWorkoutChange, onResetAll, openSettings,
    // Alleen voor tests/sheets-log.test.js.
    __test: { setUser, get state() { return st; }, set state(v) { st = v; save(); render(); }, flush, buildRows, planDay, renewSilently, statusText, CLIENT_ID },
  };
})();

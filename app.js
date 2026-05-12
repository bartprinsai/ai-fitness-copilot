'use strict';

// -- Firebase -------------------------------------------
firebase.initializeApp({
  apiKey: "AIzaSyDPIDW9H3HA63YWbm-xA0S-GZvST3wnuyA",
  authDomain: "ai-fitness-copilot.firebaseapp.com",
  projectId: "ai-fitness-copilot",
  storageBucket: "ai-fitness-copilot.firebasestorage.app",
  messagingSenderId: "41596366904",
  appId: "1:41596366904:web:420d738588d3157b4ef6cd"
});
const fAuth = firebase.auth();
const fStore = firebase.firestore();
let currentUser = null;

// -- In-memory state ------------------------------------
let db = { workouts: {}, custom_exercises: [], records: {} };
let googleAccessToken = null;
let driveFolderId = null;
let pendingVideoSetIndex = null;
let pendingAction = null;
let tokenClient = null;

// -- Splash coordination --------------------------------
let splashDone = false, authDone = false;
function checkAndReveal() {
  if (!splashDone || !authDone) return;
  const splash = document.getElementById('splash-screen');
  if (splash) splash.style.display = 'none';
}
setTimeout(() => { splashDone = true; checkAndReveal(); }, 1200);

// -- Helpers --------------------------------------------
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(str) {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (str === today) return 'TODAY';
  if (str === yesterday) return 'YESTERDAY';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' }).toUpperCase();
}
function formatDateShort(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }).toUpperCase();
}
function changeDate(delta) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  currentDate = d.toISOString().split('T')[0];
}
function getWorkout(date) { return db.workouts[date] || []; }
function setWorkout(date, exercises) {
  if (exercises.length === 0) delete db.workouts[date];
  else db.workouts[date] = exercises;
  persistWorkout(date, exercises);
}
function getCurrentExerciseData() { return getWorkout(currentDate).find(e => e.name === currentExercise) || null; }
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}
function allExercises() {
  return [...EXERCISE_DB, ...(db.custom_exercises || []).map(e => ({ ...e, custom: true }))];
}

// -- Firestore persistence ------------------------------
function uDoc(path) { return fStore.doc('users/' + currentUser.uid + '/' + path); }

async function persistWorkout(date, exercises) {
  if (!currentUser) return;
  if (!exercises || exercises.length === 0) {
    uDoc('workouts/' + date).delete().catch(() => {});
  } else {
    uDoc('workouts/' + date).set({ exercises }).catch(e => console.error(e));
  }
}
async function persistRecords() {
  if (!currentUser) return;
  uDoc('meta/records').set({ data: db.records }).catch(e => console.error(e));
}
async function persistCustomExercises() {
  if (!currentUser) return;
  uDoc('meta/custom_exercises').set({ list: db.custom_exercises || [] }).catch(e => console.error(e));
}
async function loadUserData(userUid) {
  try {
    const [workoutsSnap, recordsSnap, customSnap] = await Promise.all([
      fStore.collection('users/' + userUid + '/workouts').get(),
      fStore.doc('users/' + userUid + '/meta/records').get(),
      fStore.doc('users/' + userUid + '/meta/custom_exercises').get(),
    ]);
    db.workouts = {};
    workoutsSnap.forEach(doc => { db.workouts[doc.id] = doc.data().exercises || []; });
    db.records = recordsSnap.exists ? (recordsSnap.data().data || {}) : {};
    db.custom_exercises = customSnap.exists ? (customSnap.data().list || []) : [];
  } catch(e) {
    console.error('loadUserData', e);
  }
}

// -- Google Drive helpers -------------------------------
async function driveApiError(res) {
  let msg = res.statusText;
  try { const b = await res.json(); msg = b.error?.message || msg; } catch(_) {}
  console.error('[Drive] API error', res.status, msg);
  throw new Error(`${res.status}: ${msg}`);
}

async function ensureDriveFolder() {
  if (driveFolderId) return driveFolderId;
  const name = 'AI Fitness Co-Pilot';
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: 'Bearer ' + googleAccessToken }
  });
  if (!searchRes.ok) await driveApiError(searchRes);
  const data = await searchRes.json();
  if (data.files && data.files.length > 0) {
    driveFolderId = data.files[0].id;
    return driveFolderId;
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
  });
  if (!createRes.ok) await driveApiError(createRes);
  const folder = await createRes.json();
  driveFolderId = folder.id;
  return driveFolderId;
}

async function uploadToDrive(file, filename) {
  const folderId = await ensureDriveFolder();
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + googleAccessToken },
    body: form
  });
  if (!res.ok) await driveApiError(res);
  const data = await res.json();
  return data.id;
}

async function openVideoFrame(videoId) {
  const overlay = document.getElementById('video-overlay');
  const player = document.getElementById('video-player');
  player.src = '';
  overlay.classList.add('open');
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${videoId}?alt=media`, {
      headers: { Authorization: 'Bearer ' + googleAccessToken }
    });
    if (!res.ok) throw new Error('Failed to load video');
    const blob = await res.blob();
    player.src = URL.createObjectURL(blob);
    player.play();
  } catch (e) {
    toast('Could not load video: ' + e.message);
    overlay.classList.remove('open');
  }
}

function removeSetVideo(setIndex) {
  const workout = getWorkout(currentDate);
  const ex = workout.find(e => e.name === currentExercise);
  if (!ex || !ex.sets[setIndex]) return;
  const s = ex.sets[setIndex];
  if (s.idbKey) idbDelete(s.idbKey).catch(() => {});
  delete s.videoId;
  delete s.idbKey;
  setWorkout(currentDate, workout);
  renderSetList();
  toast('Video removed');
}

// -- GIS token client (Drive) ---------------------------
// Client ID: console.cloud.google.com ? APIs & Services ? Credentials
//            ? OAuth 2.0 Client IDs ? "Web client (auto created by Google Service)"
const GIS_CLIENT_ID = '41596366904-3h277tnkmavund1rc8l4rn3a5klu966k.apps.googleusercontent.com';

window.addEventListener('load', () => {
  if (typeof google !== 'undefined' && google.accounts) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GIS_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) {
          console.error('[GIS] token error:', response.error);
          toast('Drive access denied');
          pendingAction = null;
          return;
        }
        console.log('[GIS] access token obtained');
        googleAccessToken = response.access_token;
        if (pendingAction) {
          const action = pendingAction;
          pendingAction = null;
          action();
        }
      }
    });
    console.log('[GIS] token client initialized');
  } else {
    console.warn('[GIS] google.accounts not available - Drive upload disabled');
  }
});

function requestDriveToken(onSuccess) {
  if (googleAccessToken) { onSuccess(); return; }
  if (!tokenClient) { toast('Drive not available'); return; }
  console.log('[GIS] requesting access token...');
  pendingAction = onSuccess;
  tokenClient.requestAccessToken({ prompt: '' });
}

// -- State ----------------------------------------------
let currentDate = todayStr();
let currentExercise = null;
let selectedSetIndex = null;
let timerInterval = null;
let timerRemaining = 90;
let timerRunning = false;
let currentGraph = 'max-weight';
let currentTimeRange = 'all';
let calMonth = new Date();
let exerciseBrowserMode = 'categories';
let currentBrowseCategory = null;

// -- Screen Navigation ----------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// -- User bar -------------------------------------------
function updateUserBar() {
  const bar = document.getElementById('user-bar');
  if (!currentUser) { bar.textContent = ''; return; }
  const name = currentUser.displayName || currentUser.email || 'User';
  bar.textContent = 'Hi, ' + name.split(' ')[0];
}

// -- Auth -----------------------------------------------
async function initAuth() {
  console.log('[Auth] initAuth start');
  let redirectHandled = false;

  // Step 1: check for redirect result BEFORE registering onAuthStateChanged
  try {
    console.log('[Auth] calling getRedirectResult...');
    const result = await fAuth.getRedirectResult();
    if (result && result.user) {
      console.log('[Auth] redirect user:', result.user.email);
      redirectHandled = true;
      currentUser = result.user;
      await loadUserData(result.user.uid);
      updateUserBar();
      currentDate = todayStr();
      renderHome();
      showScreen('screen-home');
      authDone = true;
      checkAndReveal();
    } else {
      console.log('[Auth] no redirect result');
    }
  } catch (err) {
    console.error('[Auth] getRedirectResult error:', err);
    toast('Sign-in failed');
  }

  // Step 2: register onAuthStateChanged for normal visits and sign-out
  fAuth.onAuthStateChanged(async user => {
    console.log('[Auth] onAuthStateChanged user:', user ? user.email : 'null', '| redirectHandled:', redirectHandled);
    if (redirectHandled) {
      // Already handled via getRedirectResult - skip this first firing
      redirectHandled = false;
      console.log('[Auth] skipping (redirect already handled)');
      return;
    }
    currentUser = user;
    if (user) {
      console.log('[Auth] signing in via onAuthStateChanged');
      await loadUserData(user.uid);
      updateUserBar();
      currentDate = todayStr();
      renderHome();
      showScreen('screen-home');
    } else {
      console.log('[Auth] no user, showing login screen');
      db = { workouts: {}, custom_exercises: [], records: {} };
      showScreen('screen-login');
    }
    authDone = true;
    checkAndReveal();
  });
}

initAuth();

document.getElementById('btn-google-signin').addEventListener('click', async () => {
  console.log('[Auth] Google sign-in button clicked');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  try {
    console.log('[Auth] trying signInWithPopup...');
    const result = await fAuth.signInWithPopup(provider);
    console.log('[Auth] popup success:', result.user.email);
  } catch (err) {
    console.warn('[Auth] signInWithPopup error:', err.code, err.message);
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      console.log('[Auth] popup blocked/closed, falling back to signInWithRedirect...');
      try {
        await fAuth.signInWithRedirect(provider);
      } catch (redirectErr) {
        console.error('[Auth] signInWithRedirect error:', redirectErr);
        toast('Sign-in failed');
      }
    } else {
      console.error('[Auth] unhandled sign-in error:', err);
      toast('Sign-in failed');
    }
  }
});

function signOutUser() {
  if (googleAccessToken && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(googleAccessToken, () => console.log('[GIS] token revoked'));
  }
  googleAccessToken = null;
  driveFolderId = null;
  pendingAction = null;
  fAuth.signOut();
}

// -- Overflow / Dropdown Menu ---------------------------
function showOverflowMenu(items, anchorEl) {
  const menu = document.getElementById('overflow-menu');
  const panel = document.getElementById('overflow-panel');
  panel.innerHTML = '';
  const rect = anchorEl.getBoundingClientRect();
  const pw = 190;
  let left = rect.right - pw;
  if (left < 8) left = 8;
  panel.style.left = left + 'px';
  panel.style.top = (rect.bottom + 4) + 'px';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'dropdown-item';
    el.textContent = item.label;
    el.addEventListener('click', () => { closeOverflowMenu(); item.action(); });
    panel.appendChild(el);
  });
  menu.classList.add('open');
}
function closeOverflowMenu() { document.getElementById('overflow-menu').classList.remove('open'); }
document.getElementById('overflow-menu').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeOverflowMenu();
});
document.getElementById('btn-overflow-home').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Sign out', action: signOutUser }], e.currentTarget);
});
document.getElementById('btn-overflow-training').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Sign out', action: signOutUser }], e.currentTarget);
});
document.getElementById('btn-overflow-exercises').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Sign out', action: signOutUser }], e.currentTarget);
});

// -- Home Screen ----------------------------------------
function renderHome() {
  document.getElementById('day-nav-label').textContent = formatDate(currentDate);
  const exercises = getWorkout(currentDate);
  const container = document.getElementById('home-content');

  if (exercises.length === 0) {
    container.innerHTML = `
      <div class="home-empty">
        <div class="home-empty-middle">
          <span class="home-empty-title">Workout Log Empty</span>
        </div>
        <div class="home-empty-actions">
          <button class="home-empty-action" id="btn-start-new">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            <span>Start New Workout</span>
          </button>
          <button class="home-empty-action" id="btn-copy-prev">
            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span>Copy Previous Workout</span>
          </button>
        </div>
      </div>`;
    document.getElementById('btn-start-new').addEventListener('click', openExerciseList);
    document.getElementById('btn-copy-prev').addEventListener('click', copyPreviousWorkout);
    return;
  }

  container.innerHTML = '';
  const records = db.records || {};

  exercises.forEach(ex => {
    const sets = ex.sets || [];
    const exRecords = records[ex.name] || {};
    const card = document.createElement('div');
    card.className = 'exercise-card';

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.innerHTML = `<div class="exercise-card-name">${ex.name}</div>`;
    card.appendChild(header);
    card.appendChild(Object.assign(document.createElement('div'), { className: 'exercise-card-divider' }));

    const setsDiv = document.createElement('div');
    setsDiv.className = 'exercise-card-sets';
    if (sets.length === 0) {
      setsDiv.innerHTML = `<div class="exercise-card-empty">No sets</div>`;
    } else {
      sets.forEach(s => {
        const isPR = exRecords[String(s.reps)] && Number(s.weight) >= exRecords[String(s.reps)];
        const row = document.createElement('div');
        row.className = 'exercise-set-row';
        row.innerHTML = `
          ${isPR ? `<svg class="exercise-set-pr" viewBox="0 0 24 24"><path d="M12 1L9 9H1l6.5 4.7L5 21l7-5 7 5-2.5-7.3L23 9h-8z"/></svg>` : `<span class="exercise-set-spacer"></span>`}
          <span class="exercise-set-weight">${s.weight} kg</span>
          <span class="exercise-set-reps">${s.reps} reps</span>
        `;
        setsDiv.appendChild(row);
      });
    }
    card.appendChild(setsDiv);
    card.addEventListener('click', () => openTraining(ex.name));
    container.appendChild(card);
  });
}

function copyPreviousWorkout() {
  const dates = Object.keys(db.workouts).sort().reverse();
  const prev = dates.find(d => d < currentDate && db.workouts[d] && db.workouts[d].length > 0);
  if (!prev) { toast('No previous workout found'); return; }
  const copied = db.workouts[prev].map(ex => ({ name: ex.name, sets: [] }));
  setWorkout(currentDate, copied);
  renderHome();
  toast('Workout copied');
}

// -- Exercise Browser -----------------------------------
function openExerciseList() {
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  document.getElementById('exercise-search').value = '';
  document.getElementById('exercises-title').textContent = 'All Exercises';
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

function renderCategoryBrowser() {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const cats = [...new Set(allExercises().map(e => e.category))].sort();
  cats.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <span class="category-item-name">${cat}</span>
      <svg class="category-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
    `;
    item.querySelector('.category-item-name').addEventListener('click', () => {
      exerciseBrowserMode = 'exercises';
      currentBrowseCategory = cat;
      document.getElementById('exercises-title').textContent = cat;
      renderExercisesInCategory(cat);
    });
    item.querySelector('.category-item-dots').addEventListener('click', () => toast('Coming soon'));
    list.appendChild(item);
  });
}

function renderExercisesInCategory(cat) {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const exercises = allExercises().filter(e => e.category === cat);
  if (exercises.length === 0) {
    list.innerHTML = `<div class="exercise-empty">No exercises found</div>`;
    return;
  }
  exercises.forEach(ex => renderExerciseItem(list, ex));
}

function renderExerciseSearchResults(q) {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const filtered = allExercises().filter(e => e.name.toLowerCase().includes(q));
  if (filtered.length === 0) {
    list.innerHTML = `<div class="exercise-empty">No exercises found</div>`;
    return;
  }
  filtered.forEach(ex => renderExerciseItem(list, ex));
}

function renderExerciseItem(list, ex) {
  const item = document.createElement('div');
  item.className = 'exercise-item' + (ex.custom ? ' exercise-item-custom' : '');
  item.innerHTML = `
    <span class="exercise-item-name">${ex.name}</span>
    <svg class="exercise-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  `;
  item.querySelector('.exercise-item-name').addEventListener('click', () => {
    addExerciseToWorkout(ex.name);
    openTraining(ex.name);
  });
  item.querySelector('.exercise-item-dots').addEventListener('click', () => toast('Coming soon'));
  list.appendChild(item);
}

function addExerciseToWorkout(name) {
  const workout = getWorkout(currentDate);
  if (!workout.find(e => e.name === name)) {
    workout.push({ name, sets: [] });
    setWorkout(currentDate, workout);
  }
}

// -- Training Screen ------------------------------------
function openTraining(name) {
  currentExercise = name;
  selectedSetIndex = null;
  document.getElementById('training-title').textContent = name;
  prefillFromLastWorkout(name);
  switchTab('track');
  showScreen('screen-training');
  renderSetList();
}

function prefillFromLastWorkout(name) {
  const dates = Object.keys(db.workouts).sort().reverse();
  for (const date of dates) {
    if (date === currentDate) continue;
    const ex = db.workouts[date] && db.workouts[date].find(e => e.name === name);
    if (ex && ex.sets && ex.sets.length > 0) {
      document.getElementById('field-weight').value = ex.sets[0].weight || 0;
      document.getElementById('field-reps').value = ex.sets[0].reps || 0;
      return;
    }
  }
  document.getElementById('field-weight').value = 0;
  document.getElementById('field-reps').value = 0;
}

function renderSetList() {
  const list = document.getElementById('set-list');
  const ex = getCurrentExerciseData();
  const sets = ex ? ex.sets : [];

  if (sets.length === 0) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:#9e9e9e;font-size:14px">No sets yet. Enter weight and reps, then tap SAVE.</div>`;
    return;
  }

  const exRecords = (db.records || {})[currentExercise] || {};
  list.innerHTML = `
    <div class="set-list-header">
      <span></span><span></span><span>#</span><span>KG</span><span>REPS</span><span></span>
    </div>
  `;

  sets.forEach((s, i) => {
    const isPR = exRecords[String(s.reps)] && parseFloat(s.weight) >= exRecords[String(s.reps)];
    const hasVideo = !!(s.videoId || s.idbKey);
    const row = document.createElement('div');
    row.className = 'set-row' + (selectedSetIndex === i ? ' selected' : '');
    row.innerHTML = `
      <span class="set-comment"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></span>
      <span class="set-camera ${hasVideo ? 'has-video' : ''}"><svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></span>
      <span class="set-num">${i + 1}</span>
      <span class="set-weight">${s.weight}</span>
      <span class="set-reps">${s.reps}${isPR ? `<svg class="set-pr-icon" viewBox="0 0 24 24"><path d="M12 1L9 9H1l6.5 4.7L5 21l7-5 7 5-2.5-7.3L23 9h-8z"/></svg>` : ''}</span>
      <button class="set-delete" aria-label="Delete set ${i + 1}"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
    `;
    row.querySelector('.set-camera').addEventListener('click', e => { e.stopPropagation(); showVideoPopup(i, s.videoId || null, s.idbKey || null, e.currentTarget); });
    row.querySelector('.set-delete').addEventListener('click', e => { e.stopPropagation(); deleteSet(i); });
    row.addEventListener('click', () => selectSet(i));
    list.appendChild(row);
  });
}

function saveSet() {
  const weight = parseFloat(document.getElementById('field-weight').value) || 0;
  const reps = parseInt(document.getElementById('field-reps').value) || 0;
  if (reps === 0 && weight === 0) { toast('Enter weight or reps'); return; }

  const workout = getWorkout(currentDate);
  let ex = workout.find(e => e.name === currentExercise);
  if (!ex) { ex = { name: currentExercise, sets: [] }; workout.push(ex); }

  if (selectedSetIndex !== null) {
    const prevVideoId = ex.sets[selectedSetIndex].videoId;
    ex.sets[selectedSetIndex] = { weight, reps, ...(prevVideoId ? { videoId: prevVideoId } : {}) };
    selectedSetIndex = null;
    toast('Set updated');
  } else {
    ex.sets.push({ weight, reps });
    toast('Set saved');
  }

  setWorkout(currentDate, workout);
  updateRecords(currentExercise, weight, reps);
  renderSetList();
  renderHome();
  startTimerAuto();
}

function selectSet(i) {
  if (selectedSetIndex === i) {
    selectedSetIndex = null;
  } else {
    selectedSetIndex = i;
    const ex = getCurrentExerciseData();
    document.getElementById('field-weight').value = ex.sets[i].weight;
    document.getElementById('field-reps').value = ex.sets[i].reps;
  }
  renderSetList();
}

function clearFields() {
  selectedSetIndex = null;
  document.getElementById('field-weight').value = 0;
  document.getElementById('field-reps').value = 0;
  renderSetList();
}

function deleteSet(i) {
  const workout = getWorkout(currentDate);
  const ex = workout.find(e => e.name === currentExercise);
  if (!ex) return;
  ex.sets.splice(i, 1);
  if (ex.sets.length === 0) workout.splice(workout.indexOf(ex), 1);
  setWorkout(currentDate, workout);
  if (selectedSetIndex === i) clearFields();
  renderSetList();
  renderHome();
  toast('Set deleted');
}

function updateRecords(name, weight, reps) {
  if (!db.records) db.records = {};
  if (!db.records[name]) db.records[name] = {};
  const key = String(reps);
  if (!db.records[name][key] || weight > db.records[name][key]) {
    db.records[name][key] = weight;
    if (weight > 0) toast('?? Personal record!');
  }
  persistRecords();
}

// -- Field +/- Buttons ---------------------------------
document.querySelectorAll('.field-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    const dir = btn.dataset.dir;
    const input = document.getElementById('field-' + field);
    let val = parseFloat(input.value) || 0;
    const step = field === 'weight' ? 2.5 : 1;
    val = dir === '+' ? val + step : Math.max(0, val - step);
    input.value = field === 'weight' ? val.toFixed(1).replace('.0', '') : val;
  });
});

// -- Tabs -----------------------------------------------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
  if (tab === 'history') renderHistoryTab();
  if (tab === 'graph') renderGraph();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// -- History Tab ----------------------------------------
function renderHistoryTab() {
  const container = document.getElementById('history-content');
  container.innerHTML = '';

  const relevantDates = Object.keys(db.workouts).sort().reverse()
    .filter(d => db.workouts[d] && db.workouts[d].find(e => e.name === currentExercise))
    .slice(0, 20);

  if (relevantDates.length === 0) {
    container.innerHTML = `<div style="padding:32px;text-align:center;color:#9e9e9e">No previous sessions for ${currentExercise}</div>`;
    return;
  }

  const exRecords = (db.records || {})[currentExercise] || {};

  relevantDates.forEach(date => {
    const ex = db.workouts[date].find(e => e.name === currentExercise);
    if (!ex || !ex.sets.length) return;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'history-day-header';
    headerDiv.innerHTML = `<div class="history-day-date">${formatDateShort(date)}</div><div class="history-day-divider"></div>`;
    container.appendChild(headerDiv);

    ex.sets.forEach(s => {
      const isPR = exRecords[String(s.reps)] && parseFloat(s.weight) >= exRecords[String(s.reps)];
      const row = document.createElement('div');
      row.className = 'history-set-row';
      row.innerHTML = `
        ${isPR ? `<svg class="history-set-pr" viewBox="0 0 24 24"><path d="M12 1L9 9H1l6.5 4.7L5 21l7-5 7 5-2.5-7.3L23 9h-8z"/></svg>` : `<span class="history-set-spacer"></span>`}
        <span class="history-set-weight">${s.weight} kg</span>
        <span class="history-set-reps">${s.reps} reps</span>
      `;
      container.appendChild(row);
    });
  });
}

// -- Graph Tab ------------------------------------------
document.querySelectorAll('.graph-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.graph-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    currentGraph = t.dataset.graph;
    renderGraph();
  });
});

document.querySelectorAll('.time-filter').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.time-filter').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    currentTimeRange = t.dataset.range;
    renderGraph();
  });
});

function filterDataByRange(data) {
  if (currentTimeRange === 'all') return data;
  const cutoff = new Date();
  if (currentTimeRange === '1m') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (currentTimeRange === '3m') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (currentTimeRange === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (currentTimeRange === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter(d => d.date >= cutoffStr);
}

function renderGraph() {
  const canvas = document.getElementById('progress-chart');
  const emptyEl = document.getElementById('graph-empty');
  const hintEl = document.getElementById('graph-hint');
  const ctx = canvas.getContext('2d');

  let data = Object.keys(db.workouts).sort().reduce((acc, date) => {
    const ex = db.workouts[date] && db.workouts[date].find(e => e.name === currentExercise);
    if (!ex || !ex.sets.length) return acc;
    let val = 0;
    if (currentGraph === 'max-weight') val = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
    if (currentGraph === 'volume') val = ex.sets.reduce((sum, s) => sum + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0);
    if (currentGraph === 'max-reps') val = Math.max(...ex.sets.map(s => parseInt(s.reps) || 0));
    acc.push({ date, val });
    return acc;
  }, []);

  data = filterDataByRange(data);

  if (data.length < 2) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    hintEl.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';
  emptyEl.style.display = 'none';
  hintEl.style.display = 'block';

  const W = canvas.offsetWidth || 340;
  const H = 220;
  canvas.width = W; canvas.height = H;

  const vals = data.map(d => d.val);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pad = { top: 20, right: 16, bottom: 32, left: 48 };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (gH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + gW, y); ctx.stroke();
    const label = (maxV - (range / 4) * i).toFixed(currentGraph === 'volume' ? 0 : 1);
    ctx.fillStyle = '#9e9e9e'; ctx.font = '11px Roboto'; ctx.textAlign = 'right';
    ctx.fillText(label, pad.left - 4, y + 4);
  }

  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * gW,
    y: pad.top + gH - ((d.val - minV) / range) * gH
  }));

  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
  grad.addColorStop(0, 'rgba(41,182,246,0.35)');
  grad.addColorStop(1, 'rgba(41,182,246,0.02)');
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pad.top + gH);
  ctx.lineTo(pts[0].x, pad.top + gH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  ctx.fillStyle = '#29b6f6';
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });

  ctx.fillStyle = '#9e9e9e'; ctx.font = '11px Roboto';
  ctx.textAlign = 'left';
  ctx.fillText(new Date(data[0].date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }), pad.left, H - 8);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(data[data.length-1].date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }), pad.left + gW, H - 8);
}

// -- Timer ----------------------------------------------
function openTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerRemaining = parseInt(document.getElementById('timer-slider').value);
  updateTimerDisplay();
  document.getElementById('btn-timer-start').textContent = 'Start';
  openOverlay('timer-overlay');
}

function startTimerAuto() {
  timerRemaining = parseInt(document.getElementById('timer-slider').value);
  runTimer();
}

function runTimer() {
  clearInterval(timerInterval);
  timerRunning = true;
  document.getElementById('btn-timer-start').textContent = 'Stop';
  timerInterval = setInterval(() => {
    timerRemaining--;
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      document.getElementById('btn-timer-start').textContent = 'Start';
      playBeep();
      toast('? Rest done!');
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(Math.abs(timerRemaining) / 60);
  const s = Math.abs(timerRemaining) % 60;
  document.getElementById('timer-display').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(); osc.stop(ctx.currentTime + 0.8);
  } catch(e) {}
}

document.getElementById('timer-slider').addEventListener('input', () => {
  timerRemaining = parseInt(document.getElementById('timer-slider').value);
  updateTimerDisplay();
});
document.getElementById('btn-timer-start').addEventListener('click', () => {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('btn-timer-start').textContent = 'Start';
  } else {
    runTimer();
  }
});
document.getElementById('btn-timer-cancel').addEventListener('click', () => {
  clearInterval(timerInterval); timerRunning = false; closeOverlay('timer-overlay');
});

// -- Calendar -------------------------------------------
function openCalendar() {
  calMonth = new Date(currentDate + 'T12:00:00');
  calMonth.setDate(1);
  renderCalendar();
  openOverlay('calendar-overlay');
}

function renderCalendar() {
  const label = calMonth.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
  document.getElementById('cal-month-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  let startDow = new Date(year, month, 1).getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  for (let i = 0; i < startDow; i++) {
    const el = document.createElement('button');
    el.className = 'cal-day empty'; el.disabled = true;
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasWorkout = db.workouts[dateStr] && db.workouts[dateStr].length > 0;
    const el = document.createElement('button');
    el.className = 'cal-day' +
      (hasWorkout ? ' has-workout' : '') +
      (dateStr === today ? ' today' : '') +
      (dateStr === currentDate ? ' selected' : '');
    el.textContent = d;
    el.addEventListener('click', () => { currentDate = dateStr; renderHome(); closeOverlay('calendar-overlay'); });
    grid.appendChild(el);
  }
}

document.getElementById('cal-prev-month').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next-month').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
document.getElementById('cal-close').addEventListener('click', () => closeOverlay('calendar-overlay'));

// -- New Exercise ---------------------------------------
function openNewExercise() {
  const sel = document.getElementById('new-exercise-category');
  sel.innerHTML = '<option value="">Choose category...</option>';
  [...new Set(EXERCISE_DB.map(e => e.category))].sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  document.getElementById('new-exercise-name').value = '';
  openOverlay('new-exercise-overlay');
}

document.getElementById('btn-new-exercise-save').addEventListener('click', () => {
  const name = document.getElementById('new-exercise-name').value.trim();
  const cat = document.getElementById('new-exercise-category').value;
  if (!name) { toast('Enter a name'); return; }
  if (!cat) { toast('Choose a category'); return; }
  if (!db.custom_exercises) db.custom_exercises = [];
  if (allExercises().find(e => e.name.toLowerCase() === name.toLowerCase())) { toast('Exercise already exists'); return; }
  db.custom_exercises.push({ category: cat, name });
  persistCustomExercises();
  closeOverlay('new-exercise-overlay');
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  document.getElementById('exercises-title').textContent = 'All Exercises';
  renderCategoryBrowser();
  toast('Exercise created');
});
document.getElementById('btn-new-exercise-cancel').addEventListener('click', () => closeOverlay('new-exercise-overlay'));

// -- Overlay helpers ------------------------------------
function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

// -- Event Listeners ------------------------------------
document.getElementById('btn-prev-day').addEventListener('click', () => { changeDate(-1); renderHome(); });
document.getElementById('btn-next-day').addEventListener('click', () => { changeDate(1); renderHome(); });
document.getElementById('btn-calendar').addEventListener('click', openCalendar);
document.getElementById('btn-add-exercise').addEventListener('click', openExerciseList);

document.getElementById('btn-back-exercises').addEventListener('click', () => {
  if (exerciseBrowserMode === 'exercises') {
    exerciseBrowserMode = 'categories';
    currentBrowseCategory = null;
    document.getElementById('exercises-title').textContent = 'All Exercises';
    document.getElementById('exercise-search').value = '';
    renderCategoryBrowser();
  } else {
    showScreen('screen-home');
  }
});

document.getElementById('btn-new-exercise').addEventListener('click', openNewExercise);
document.getElementById('btn-back-training').addEventListener('click', () => { renderHome(); showScreen('screen-home'); });
document.getElementById('btn-save-set').addEventListener('click', saveSet);
document.getElementById('btn-clear').addEventListener('click', clearFields);
document.getElementById('btn-timer').addEventListener('click', openTimer);
document.getElementById('btn-training-pr').addEventListener('click', () => toast('Records coming soon'));
document.getElementById('btn-training-info').addEventListener('click', () => toast('Info coming soon'));
document.getElementById('btn-live-coach').addEventListener('click', () => openAICamera(null));
document.getElementById('btn-chat-coach').addEventListener('click', () => toast('Coming soon!'));

document.getElementById('exercise-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (q) {
    renderExerciseSearchResults(q);
    document.getElementById('exercises-title').textContent = 'All Exercises';
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory) {
    renderExercisesInCategory(currentBrowseCategory);
    document.getElementById('exercises-title').textContent = currentBrowseCategory;
  } else {
    exerciseBrowserMode = 'categories';
    renderCategoryBrowser();
    document.getElementById('exercises-title').textContent = 'All Exercises';
  }
});

['calendar-overlay', 'timer-overlay', 'new-exercise-overlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOverlay(id);
  });
});

// -- Video Popup ----------------------------------------
function showVideoPopup(setIndex, videoId, idbKey, anchorEl) {
  const popup = document.getElementById('video-popup');
  const panel = document.getElementById('video-popup-panel');

  const rect = anchorEl.getBoundingClientRect();
  const pw = 240;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + 160 > window.innerHeight) top = rect.top - 160 - 6;
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';

  if (videoId || idbKey) {
    panel.innerHTML = `
      <div class="video-popup-item" id="popup-view">?? View video</div>
      <div class="video-popup-item" id="popup-delete">??? Remove video</div>
      <div class="video-popup-item video-popup-cancel" id="popup-cancel">? Cancel</div>
    `;
    document.getElementById('popup-view').addEventListener('click', () => { closeVideoPopup(); viewSetVideo(setIndex); });
    document.getElementById('popup-delete').addEventListener('click', () => { closeVideoPopup(); removeSetVideo(setIndex); });
  } else {
    panel.innerHTML = `
      <div class="video-popup-item" id="popup-record">?? Record set</div>
      <div class="video-popup-item" id="popup-upload">?? Upload existing video</div>
      <div class="video-popup-item video-popup-cancel" id="popup-cancel">? Cancel</div>
    `;
    document.getElementById('popup-record').addEventListener('click', () => {
      closeVideoPopup();
      pendingVideoSetIndex = setIndex;
      openAICamera(setIndex);
    });
    document.getElementById('popup-upload').addEventListener('click', () => {
      closeVideoPopup();
      pendingVideoSetIndex = setIndex;
      requestDriveToken(() => {
        const inp = document.getElementById('video-input-file');
        inp.value = ''; inp.click();
      });
    });
  }
  document.getElementById('popup-cancel').addEventListener('click', closeVideoPopup);

  popup.classList.add('open');
}

function closeVideoPopup() {
  document.getElementById('video-popup').classList.remove('open');
}

document.getElementById('video-popup').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeVideoPopup();
});

async function handleVideoUpload(file) {
  if (!file || pendingVideoSetIndex === null) return;
  if (!googleAccessToken) {
           tokenClient.requestAccessToken({prompt: 'consent'});
           return;
  }
  const setNum = pendingVideoSetIndex + 1;
  const safeName = currentExercise.replace(/[^a-z0-9]/gi, '_');
  const filename = `${currentDate}_${safeName}_set${setNum}.mp4`;
  console.log('[Drive] uploading:', filename);
  toast('Uploading to Drive...');
  try {
    const videoId = await uploadToDrive(file, filename);
    console.log('[Drive] uploaded, id:', videoId);
    const workout = getWorkout(currentDate);
    const ex = workout.find(e => e.name === currentExercise);
    if (ex && ex.sets[pendingVideoSetIndex]) {
      ex.sets[pendingVideoSetIndex].videoId = videoId;
      setWorkout(currentDate, workout);
    }
    renderSetList();
    toast('Video saved to Drive');
  } catch(err) {
    console.error('[Drive] upload error:', err);
    const msg = err.message || '';
    if (msg.startsWith('401') || msg.startsWith('403')) {
      toast('Please sign out and sign in again to enable video upload');
    } else {
      toast('Upload failed: ' + msg);
    }
  }
  pendingVideoSetIndex = null;
}

document.getElementById('video-input-camera').addEventListener('change', async e => {
  await handleVideoUpload(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('video-input-file').addEventListener('change', async e => {
  await handleVideoUpload(e.target.files[0]);
  e.target.value = '';
});

document.getElementById('btn-video-close').addEventListener('click', () => {
  const player = document.getElementById('video-player');
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = '';
  document.getElementById('video-overlay').classList.remove('open');
});

// ── IndexedDB helpers ─────────────────────────────────
function openFitIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('FitnessCopilot', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('videos');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
async function idbPut(key, value) {
  const idb = await openFitIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('videos', 'readwrite');
    tx.objectStore('videos').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}
async function idbGet(key) {
  const idb = await openFitIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('videos', 'readonly');
    const req = tx.objectStore('videos').get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
async function idbDelete(key) {
  const idb = await openFitIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('videos', 'readwrite');
    tx.objectStore('videos').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}

// ── AI Camera state ───────────────────────────────────
let aiCamActive = false;
let aiCamStream = null;
let aiCamFacingFront = true;
let aiCamPose = null;
let aiCamReps = 0;
let aiCamRepState = 'up';
let aiCamSetIndex = null;
let aiCamRecording = false;
let aiCamMediaRecorder = null;
let aiCamChunks = [];
let aiCamAnimFrame = null;
let aiCamPoseProcessing = false;
let aiCamExerciseConfig = null;
let aiCamLastCoachMsg = '';
let aiCamLastSpeakTime = 0;

// ── Exercise config ───────────────────────────────────
function getExerciseConfig(name) {
  const n = (name || '').toLowerCase();
  if (/squat|deadlift|leg press|lunge/.test(n)) {
    return { joints: 'knee', downAngle: 90, upAngle: 160,
      coachDeep: 'Good depth!', coachShallow: 'Go deeper', coachUp: 'Drive up!' };
  }
  if (/curl|bicep|hammer/.test(n)) {
    return { joints: 'elbow', downAngle: 50, upAngle: 150,
      coachDeep: 'Full contraction!', coachShallow: 'Curl higher', coachUp: 'Lower slowly' };
  }
  if (/shoulder press|overhead|military|ohp/.test(n)) {
    return { joints: 'shoulder', downAngle: 80, upAngle: 160,
      coachDeep: 'Arms down!', coachShallow: 'Lower fully', coachUp: 'Lock out!' };
  }
  return { joints: 'elbow', downAngle: 50, upAngle: 150,
    coachDeep: 'Full range!', coachShallow: 'More range', coachUp: 'Good rep!' };
}

// ── Angle calculation ─────────────────────────────────
function calcPoseAngle(a, b, c) {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(rad * 180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function getJointAngle(landmarks) {
  const lm = landmarks;
  if (!lm || lm.length < 33 || !aiCamExerciseConfig) return null;
  try {
    if (aiCamExerciseConfig.joints === 'knee') {
      return (calcPoseAngle(lm[23], lm[25], lm[27]) + calcPoseAngle(lm[24], lm[26], lm[28])) / 2;
    }
    if (aiCamExerciseConfig.joints === 'shoulder') {
      return (calcPoseAngle(lm[23], lm[11], lm[13]) + calcPoseAngle(lm[24], lm[12], lm[14])) / 2;
    }
    return (calcPoseAngle(lm[11], lm[13], lm[15]) + calcPoseAngle(lm[12], lm[14], lm[16])) / 2;
  } catch(e) { return null; }
}

// ── Rep counting & coaching ───────────────────────────
function processJointAngle(angle) {
  const cfg = aiCamExerciseConfig;
  if (!cfg) return;
  let msg = '';
  if (aiCamRepState === 'up') {
    if (angle < cfg.downAngle) {
      aiCamRepState = 'down'; msg = cfg.coachDeep;
    } else if (angle < cfg.downAngle + 35) {
      msg = cfg.coachShallow;
    }
  } else if (aiCamRepState === 'down' && angle > cfg.upAngle) {
    aiCamRepState = 'up';
    aiCamReps++;
    document.getElementById('ai-cam-reps').textContent = aiCamReps;
    msg = cfg.coachUp;
  }
  if (msg && msg !== aiCamLastCoachMsg) {
    aiCamLastCoachMsg = msg;
    const el = document.getElementById('ai-cam-coaching');
    if (el) el.textContent = msg;
    const now = Date.now();
    if (window.speechSynthesis && now - aiCamLastSpeakTime > 2000) {
      aiCamLastSpeakTime = now;
      const utt = new SpeechSynthesisUtterance(msg);
      utt.rate = 1.1; utt.volume = 0.8;
      speechSynthesis.cancel();
      speechSynthesis.speak(utt);
    }
  }
}

// ── Skeleton drawing ──────────────────────────────────
const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[24,26],
  [25,27],[26,28],[27,29],[28,30],[29,31],[30,32]
];

function drawPoseSkeleton(landmarks, canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!landmarks) return;

  const video = document.getElementById('ai-cam-video');
  const vW = video.videoWidth || W, vH = video.videoHeight || H;
  const scale = Math.max(W / vW, H / vH);
  const ox = (W - vW * scale) / 2, oy = (H - vH * scale) / 2;
  const px = nx => nx * vW * scale + ox;
  const py = ny => ny * vH * scale + oy;

  ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = landmarks[a], pb = landmarks[b];
    if (!pa || !pb || pa.visibility < 0.4 || pb.visibility < 0.4) continue;
    ctx.beginPath(); ctx.moveTo(px(pa.x), py(pa.y)); ctx.lineTo(px(pb.x), py(pb.y)); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const lm of landmarks) {
    if (!lm || lm.visibility < 0.4) continue;
    ctx.beginPath(); ctx.arc(px(lm.x), py(lm.y), 5, 0, Math.PI * 2); ctx.fill();
  }
}

// ── MediaPipe Pose ────────────────────────────────────
function initAICamPose() {
  if (typeof Pose === 'undefined') { console.warn('[AICam] Pose CDN not loaded'); return null; }
  const pose = new Pose({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`
  });
  pose.setOptions({
    modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
    minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
  });
  pose.onResults(results => {
    aiCamPoseProcessing = false;
    const canvas = document.getElementById('ai-cam-canvas');
    if (!canvas || !aiCamActive) return;
    if (results.poseLandmarks) {
      drawPoseSkeleton(results.poseLandmarks, canvas);
      const angle = getJointAngle(results.poseLandmarks);
      if (angle !== null) processJointAngle(angle);
    } else {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  });
  return pose;
}

function aiCamPoseLoop() {
  if (!aiCamActive) return;
  const video = document.getElementById('ai-cam-video');
  if (video && video.readyState >= 2 && !aiCamPoseProcessing && aiCamPose) {
    aiCamPoseProcessing = true;
    aiCamPose.send({ image: video }).catch(() => { aiCamPoseProcessing = false; });
  }
  aiCamAnimFrame = requestAnimationFrame(aiCamPoseLoop);
}

// ── Camera stream ─────────────────────────────────────
async function startAICamStream(facingFront) {
  if (aiCamStream) { aiCamStream.getTracks().forEach(t => t.stop()); aiCamStream = null; }
  try {
    aiCamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    const video = document.getElementById('ai-cam-video');
    video.srcObject = aiCamStream;
    video.play().catch(e => console.warn('[AICam] play():', e));
  } catch(e) {
    console.error('[AICam] getUserMedia:', e);
    toast('Camera not available');
    closeAICamera();
  }
}

// ── Open / Close ──────────────────────────────────────
function openAICamera(setIndex) {
  aiCamSetIndex = setIndex;
  aiCamReps = 0; aiCamRepState = 'up';
  aiCamRecording = false; aiCamChunks = [];
  aiCamLastCoachMsg = ''; aiCamLastSpeakTime = 0;
  aiCamExerciseConfig = getExerciseConfig(currentExercise);
  aiCamFacingFront = true; aiCamActive = true;
  aiCamPoseProcessing = false;

  document.getElementById('ai-cam-exercise-name').textContent = currentExercise || '';
  document.getElementById('ai-cam-reps').textContent = '0';
  document.getElementById('ai-cam-coaching').textContent = '';
  document.getElementById('ai-cam-rec').style.display = 'none';
  document.getElementById('btn-ai-cam-record').classList.remove('recording');

  showScreen('screen-ai-camera');

  // Set canvas to viewport size — screen is position:fixed;inset:0 so it equals the viewport
  const canvas = document.getElementById('ai-cam-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  startAICamStream(true).then(() => {
    if (!aiCamActive) return;
    aiCamPose = initAICamPose();
    if (aiCamPose) aiCamPoseLoop();
  });
}

function closeAICamera() {
  aiCamActive = false;
  if (aiCamAnimFrame) { cancelAnimationFrame(aiCamAnimFrame); aiCamAnimFrame = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (aiCamPose) { try { aiCamPose.close(); } catch(e) {} aiCamPose = null; }
  if (aiCamMediaRecorder && aiCamMediaRecorder.state !== 'inactive') {
    aiCamMediaRecorder.ondataavailable = null;
    aiCamMediaRecorder.onstop = null;
    aiCamMediaRecorder.stop();
  }
  if (aiCamStream) { aiCamStream.getTracks().forEach(t => t.stop()); aiCamStream = null; }
  showScreen('screen-training');
}

// ── Recording ─────────────────────────────────────────
function toggleAICamRecording() {
  if (!aiCamRecording) startAICamRecording();
  else stopAndSaveRecording();
}

function startAICamRecording() {
  if (!aiCamStream) return;
  aiCamChunks = [];
  const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
  const mimeType = types.find(m => MediaRecorder.isTypeSupported(m)) || '';
  try {
    aiCamMediaRecorder = new MediaRecorder(aiCamStream, mimeType ? { mimeType } : {});
  } catch(e) { aiCamMediaRecorder = new MediaRecorder(aiCamStream); }
  aiCamMediaRecorder.ondataavailable = e => { if (e.data.size > 0) aiCamChunks.push(e.data); };
  aiCamMediaRecorder.onstop = onAICamRecordingStop;
  aiCamMediaRecorder.start(1000);
  aiCamRecording = true;
  document.getElementById('ai-cam-rec').style.display = 'flex';
  document.getElementById('btn-ai-cam-record').classList.add('recording');
}

function stopAndSaveRecording() {
  if (aiCamReps > 0) document.getElementById('field-reps').value = aiCamReps;
  aiCamActive = false;
  if (aiCamAnimFrame) { cancelAnimationFrame(aiCamAnimFrame); aiCamAnimFrame = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (aiCamPose) { try { aiCamPose.close(); } catch(e) {} aiCamPose = null; }
  document.getElementById('ai-cam-rec').style.display = 'none';
  document.getElementById('btn-ai-cam-record').classList.remove('recording');
  aiCamRecording = false;
  if (aiCamMediaRecorder && aiCamMediaRecorder.state !== 'inactive') {
    aiCamMediaRecorder.stop();
  } else {
    if (aiCamStream) { aiCamStream.getTracks().forEach(t => t.stop()); aiCamStream = null; }
    showScreen('screen-training');
  }
}

async function onAICamRecordingStop() {
  if (aiCamStream) { aiCamStream.getTracks().forEach(t => t.stop()); aiCamStream = null; }
  showScreen('screen-training');

  // AI Coach mode (no set): skip video save, reps already filled by stopAndSaveRecording
  if (aiCamSetIndex === null) { aiCamChunks = []; return; }

  if (aiCamChunks.length === 0) return;
  const blob = new Blob(aiCamChunks, { type: aiCamChunks[0].type || 'video/webm' });
  aiCamChunks = [];

  const safeName = (currentExercise || 'exercise').replace(/[^a-z0-9]/gi, '_');
  const setNum = aiCamSetIndex !== null ? aiCamSetIndex + 1 : 1;
  const idbKey = `video_${currentDate}_${safeName}_set${setNum}`;

  toast('Saving video...');
  try {
    await idbPut(idbKey, blob);
    const workout = getWorkout(currentDate);
    const ex = workout.find(e => e.name === currentExercise);
    if (ex && ex.sets[aiCamSetIndex] !== undefined) {
      ex.sets[aiCamSetIndex].idbKey = idbKey;
      setWorkout(currentDate, workout);
    }
    renderSetList();
    toast('Video saved locally');
    backgroundUploadVideo(idbKey, aiCamSetIndex, blob);
  } catch(e) {
    console.error('[AICam] save error:', e);
    toast('Could not save video');
  }
}

async function backgroundUploadVideo(idbKey, setIndex, blob) {
  if (!navigator.onLine) return;
  const doUpload = async () => {
    try {
      const safeName = (currentExercise || 'exercise').replace(/[^a-z0-9]/gi, '_');
      const setNum = setIndex !== null ? setIndex + 1 : 1;
      const filename = `${currentDate}_${safeName}_set${setNum}.mp4`;
      const file = new File([blob], filename, { type: blob.type });
      const videoId = await uploadToDrive(file, filename);
      const workout = getWorkout(currentDate);
      const ex = workout.find(e => e.name === currentExercise);
      if (ex && ex.sets[setIndex] !== undefined) {
        ex.sets[setIndex].videoId = videoId;
        delete ex.sets[setIndex].idbKey;
        setWorkout(currentDate, workout);
      }
      await idbDelete(idbKey);
      renderSetList();
      toast('Video uploaded to Drive');
    } catch(e) {
      console.error('[AICam] upload error:', e);
    }
  };
  if (googleAccessToken) {
    doUpload();
  } else if (tokenClient) {
    pendingAction = doUpload;
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

// ── View video: IDB first, then Drive ────────────────
async function viewSetVideo(setIndex) {
  const ex = getCurrentExerciseData();
  if (!ex || !ex.sets[setIndex]) return;
  const s = ex.sets[setIndex];
  if (s.idbKey) {
    try {
      const blob = await idbGet(s.idbKey);
      if (blob) {
        const overlay = document.getElementById('video-overlay');
        const player = document.getElementById('video-player');
        player.src = URL.createObjectURL(blob);
        overlay.classList.add('open');
        player.play();
        return;
      }
    } catch(e) {}
  }
  if (s.videoId) {
    openVideoFrame(s.videoId);
  } else {
    toast('No video found');
  }
}

// ── AI camera button listeners ────────────────────────
document.getElementById('btn-ai-cam-close').addEventListener('click', closeAICamera);
document.getElementById('btn-ai-cam-record').addEventListener('click', toggleAICamRecording);
document.getElementById('btn-ai-cam-flip').addEventListener('click', () => {
  if (aiCamRecording) { toast('Stop recording first'); return; }
  aiCamFacingFront = !aiCamFacingFront;
  // Restart pose loop for new stream
  if (aiCamPose) { try { aiCamPose.close(); } catch(e) {} aiCamPose = null; }
  if (aiCamAnimFrame) { cancelAnimationFrame(aiCamAnimFrame); aiCamAnimFrame = null; }
  aiCamPoseProcessing = false;
  startAICamStream(aiCamFacingFront).then(() => {
    if (!aiCamActive) return;
    aiCamPose = initAICamPose();
    if (aiCamPose) aiCamPoseLoop();
  });
});


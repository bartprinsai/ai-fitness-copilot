'use strict';

// -- Anthropic API key ----------------------------------
// Replace with your key from console.anthropic.com
const ANTHROPIC_API_KEY = 'sk-ant-YOUR_KEY_HERE';

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
let db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {}, exerciseInfo: {} };

// -- Home selection mode state --------------------------
let homeSelMode = false;
let homeSelCards = new Set();
let homeExDragItem = null;
let homeExDragStartY = 0;
let homeExDragDy = 0;

// -- Exercise browser extended state -------------------
let currentBrowsePlan = null;
const FAVORITES_CATEGORY = '__favorites__';

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
  const custom = db.custom_exercises || [];
  const customNames = new Set(custom.map(e => e.name));
  const hidden = db.hiddenBuiltins || {};
  const builtins = EXERCISE_DB.filter(e => !hidden[e.name] && !customNames.has(e.name));
  return [...builtins, ...custom.map(e => ({ ...e, custom: true }))];
}

// -- Firestore persistence ------------------------------
function uDoc(path) { return fStore.doc('users/' + currentUser.uid + '/' + path); }

async function persistWorkout(date, exercises) {
  if (!currentUser) return;
  if (!exercises || exercises.length === 0) {
    uDoc('workouts/' + date).delete().catch(() => {});
  } else {
    uDoc('workouts/' + date).set({ exercises }, { merge: true }).catch(e => console.error(e));
  }
}
function getSessionNote(date) { return (db.sessionNotes || {})[date] || ''; }
function saveSessionNote(date, note) {
  if (!db.sessionNotes) db.sessionNotes = {};
  const trimmed = (note || '').trim();
  if (trimmed) db.sessionNotes[date] = trimmed;
  else delete db.sessionNotes[date];
  if (!currentUser) return;
  uDoc('workouts/' + date).set({ sessionNote: trimmed }, { merge: true }).catch(e => console.error(e));
}
async function persistRecords() {
  if (!currentUser) return;
  uDoc('meta/records').set({ data: db.records }).catch(e => console.error(e));
}
async function persistCustomExercises() {
  if (!currentUser) return;
  uDoc('meta/custom_exercises').set({ list: db.custom_exercises || [] }).catch(e => console.error(e));
}
async function persistFavorites() {
  if (!currentUser) return;
  uDoc('meta/favorites').set({ names: Object.keys(db.favoriteExercises || {}) }).catch(e => console.error(e));
}
function isFavoriteExercise(name) { return !!(db.favoriteExercises || {})[name]; }
function toggleFavoriteExercise(name) {
  if (!db.favoriteExercises) db.favoriteExercises = {};
  const next = !db.favoriteExercises[name];
  if (next) db.favoriteExercises[name] = true;
  else delete db.favoriteExercises[name];
  persistFavorites();
  return next;
}
async function persistHiddenBuiltins() {
  if (!currentUser) return;
  uDoc('meta/hidden_builtins').set({ names: Object.keys(db.hiddenBuiltins || {}) }).catch(e => console.error(e));
}
async function persistExerciseInfo() {
  if (!currentUser) return;
  uDoc('meta/exercise_info').set({ data: db.exerciseInfo || {} }).catch(e => console.error(e));
}
function getExerciseInfo(name) { return (db.exerciseInfo || {})[name] || null; }
async function loadUserData(userUid) {
  console.log('[Load] loadUserData start, uid:', userUid);
  try {
    console.log('[Load] firing Promise.all for 8 Firestore reads...');
    const [workoutsSnap, recordsSnap, customSnap, plansSnap, activePlanSnap, favoritesSnap, hiddenBuiltinsSnap, exerciseInfoSnap] = await Promise.all([
      fStore.collection('users/' + userUid + '/workouts').get(),
      fStore.doc('users/' + userUid + '/meta/records').get(),
      fStore.doc('users/' + userUid + '/meta/custom_exercises').get(),
      fStore.collection('users/' + userUid + '/plans').get(),
      fStore.doc('users/' + userUid + '/meta/activeplan').get(),
      fStore.doc('users/' + userUid + '/meta/favorites').get(),
      fStore.doc('users/' + userUid + '/meta/hidden_builtins').get(),
      fStore.doc('users/' + userUid + '/meta/exercise_info').get(),
    ]);
    console.log('[Load] Promise.all resolved, exerciseInfoSnap.exists:', exerciseInfoSnap.exists);
    db.workouts = {};
    db.sessionNotes = {};
    workoutsSnap.forEach(doc => {
      const data = doc.data();
      db.workouts[doc.id] = data.exercises || [];
      if (data.sessionNote) db.sessionNotes[doc.id] = data.sessionNote;
    });
    db.records = recordsSnap.exists ? (recordsSnap.data().data || {}) : {};
    db.custom_exercises = customSnap.exists ? (customSnap.data().list || []) : [];
    db.plans = {};
    plansSnap.forEach(doc => { db.plans[doc.id] = { ...doc.data(), id: doc.id }; });
    db.activePlan = activePlanSnap.exists ? activePlanSnap.data() : null;
    db.favoriteExercises = {};
    if (favoritesSnap.exists) {
      (favoritesSnap.data().names || []).forEach(name => { db.favoriteExercises[name] = true; });
    }
    db.hiddenBuiltins = {};
    if (hiddenBuiltinsSnap.exists) {
      (hiddenBuiltinsSnap.data().names || []).forEach(name => { db.hiddenBuiltins[name] = true; });
    }
    db.exerciseInfo = exerciseInfoSnap.exists ? (exerciseInfoSnap.data().data || {}) : {};
    console.log('[Load] loadUserData finished OK');
  } catch(e) {
    console.error('[Load] loadUserData FAILED:', e && e.code, e && e.message, e);
  }
}

// -- State ----------------------------------------------
let currentDate = todayStr();
let currentExercise = null;

// -- Plan Builder state ---------------------------------
let currentPlanId = null;
let currentPlanData = null;
let currentLoadPlanId = null;
let currentLoadDayIndex = null;
let loadWorkoutReturnScreen = 'screen-plan-detail';
let bannerDismissed = false;
let bannerSuggestedDayIndex = null;
let loadWorkoutItems = [];
let selectedSetIndex = null;
let currentGraph = 'max-weight';
let currentTimeRange = 'all';
let calLoadedMonths = []; // ascending {year, month} entries currently rendered in the calendar scroller
let calSelectedDate = null;
let calWorkoutDates = []; // ascending date strings that have a logged workout, cached while the calendar screen is open
let calDetailDate = null;
let calScrollLock = false;
let exerciseBrowserMode = 'categories';
let currentBrowseCategory = null;
let currentEditDayIndex = null;
let pdeDragItem = null;
let pdeDragStartY = 0;
let pdeDragDy = 0;
let pdeActiveSwipeInner = null;
let pdeActiveSwipeReveal = null;

// -- Screen Navigation ------------------------------------
// Central place that both switches the visible .screen AND keeps the
// browser/Android history in sync, so the hardware back button steps back
// through the app's screens instead of closing the PWA.
//
// - Every call pushes a new history entry, except: (a) the very first
//   screen shown after boot (login or home), which replaces the initial
//   entry instead of adding one — so back from there falls through to the
//   platform's default behavior (backgrounding the PWA, per spec), and
//   (b) navigating to the screen that's already active, which is a no-op
//   for history (avoids duplicate back-taps landing on the same screen).
// - A small table of "on-enter" refreshers re-runs whenever its screen
//   becomes active, however it got there (forward navigation, an in-app
//   back button, or the hardware back button), so returning to a screen
//   never shows stale data. It's intentionally only for screens whose
//   content can change while you're away from them.
const SCREEN_ON_ENTER = {
  'screen-fitness-tracker': () => renderHome(),
  'screen-new-workout': () => renderNewWorkoutScreen(),
  'screen-workout-plan': () => renderPlanList(),
  'screen-plan-detail': () => renderPlanDetail(),
};

let historyInitialized = false;
let inPopstateNavigation = false;

function showScreen(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const wasActive = el.classList.contains('active');

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el.classList.add('active');

  if (SCREEN_ON_ENTER[id]) SCREEN_ON_ENTER[id]();

  if (inPopstateNavigation) return;
  if (!historyInitialized) {
    historyInitialized = true;
    history.replaceState({ screen: id }, '', '#' + id);
  } else if (!wasActive) {
    history.pushState({ screen: id }, '', '#' + id);
  }
}

// In-app "back" controls call this instead of showScreen() directly, so
// they walk the same history stack the hardware back button uses instead
// of pushing a redundant duplicate entry on top of it. `fallbackId` covers
// the (normally unreachable) case where there's no app history yet.
function goBack(fallbackId) {
  if (history.state && history.state.screen) {
    history.back();
  } else {
    showScreen(fallbackId);
  }
}

// -- Modal back-button handling --------------------------
// Any open .overlay popup pushes its own history entry, so the hardware/
// Android back button closes it (same as its own Cancel button) instead of
// letting the press fall through to screen navigation underneath it.
let openOverlayId = null;
let suppressNextPopstate = false;

function pushOverlayHistory(id) {
  openOverlayId = id;
  history.pushState({ overlay: id }, '', location.hash);
}

// Keeps the history stack in sync when an overlay is closed by anything
// OTHER than the back button (Cancel/Save/backdrop tap): those don't consume
// a history entry on their own, so without this, the next real back press
// would just pop that stale entry and land back on the same screen — a dead
// "nothing happened" press before the one that actually navigates.
function popOverlayHistoryIfNeeded(id) {
  if (openOverlayId !== id) return;
  openOverlayId = null;
  if (!inPopstateNavigation) {
    suppressNextPopstate = true;
    history.back();
  }
}

// Emulates the given overlay's own Cancel/Close button so a back-triggered
// dismissal runs exactly the same cleanup (no separate logic to keep in sync).
function dismissOverlayForBack(id) {
  if (id === 'comment-overlay') {
    const editing = !document.getElementById('comment-edit-mode').classList.contains('hidden');
    document.getElementById(editing ? 'btn-comment-cancel' : 'btn-comment-done').click();
    return;
  }
  if (id === 'exercise-info-overlay') {
    const editing = !document.getElementById('exercise-info-edit-mode').classList.contains('hidden');
    document.getElementById(editing ? 'btn-exercise-info-cancel' : 'btn-exercise-info-close').click();
    return;
  }
  const btnId = OVERLAY_CANCEL_BUTTON[id];
  if (btnId) document.getElementById(btnId).click();
  else closeOverlay(id);
}

window.addEventListener('popstate', e => {
  if (suppressNextPopstate) { suppressNextPopstate = false; return; }
  if (openOverlayId) {
    const id = openOverlayId;
    openOverlayId = null;
    dismissOverlayForBack(id);
    // Some overlays' Cancel only steps back an internal mode instead of
    // truly closing (comment-overlay's edit → view, when there's existing
    // text to fall back to) — if it's still open, keep intercepting back
    // presses for it instead of letting the next one fall through to screens.
    if (document.getElementById(id).classList.contains('open')) pushOverlayHistory(id);
    return;
  }
  const id = (e.state && e.state.screen) || 'screen-home';
  inPopstateNavigation = true;
  showScreen(id);
  inPopstateNavigation = false;
});

// -- TEMP DEBUG: catch anything that would otherwise fail silently --------
window.addEventListener('error', e => console.error('[GlobalError]', e.message, e.filename, e.lineno, e.error));
window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', e.reason));

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
      renderMenuUserBar();
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
      console.log('[Auth] loadUserData await returned, calling renderMenuUserBar');
      renderMenuUserBar();
      console.log('[Auth] renderMenuUserBar done, calling showScreen(screen-home)');
      showScreen('screen-home');
      console.log('[Auth] showScreen(screen-home) done');
    } else {
      console.log('[Auth] no user, showing login screen');
      db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
      currentPlanId = null; currentPlanData = null; bannerDismissed = false;
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
    el.className = 'dropdown-item' + (item.danger ? ' dropdown-item-danger' : '');
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
  showOverflowMenu([
    { label: 'Sign out', action: signOutUser },
    { label: 'Reset to default', action: openResetOverlay, danger: true },
  ], e.currentTarget);
});
document.getElementById('btn-overflow-training').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Sign out', action: signOutUser }], e.currentTarget);
});
document.getElementById('btn-overflow-exercises').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Sign out', action: signOutUser }], e.currentTarget);
});

// -- Reset to default ------------------------------------
// Deletes every piece of this user's data from Firestore and returns the
// app to its out-of-the-box state. Paths touched (all scoped under
// users/{uid}/ for the currently signed-in user):
//   - users/{uid}/workouts/*            (every logged workout/date)
//   - users/{uid}/plans/*                (every Workout Plan Builder plan)
//   - users/{uid}/coachingPhilosophies/* (if that collection exists)
//   - users/{uid}/meta/records           (PR records)
//   - users/{uid}/meta/custom_exercises  (self-added exercises)
//   - users/{uid}/meta/activeplan        (active plan pointer)
let resetInProgress = false;

function openResetOverlay() {
  if (!currentUser) return;
  document.getElementById('reset-confirm-input').value = '';
  document.getElementById('reset-error').textContent = '';
  document.getElementById('reset-error').classList.add('hidden');
  setResetBusy(false);
  updateResetConfirmEnabled();
  openOverlay('reset-overlay');
  setTimeout(() => document.getElementById('reset-confirm-input').focus(), 100);
}

function updateResetConfirmEnabled() {
  if (resetInProgress) return;
  const match = document.getElementById('reset-confirm-input').value === 'RESET';
  document.getElementById('btn-reset-confirm').disabled = !match;
}

function setResetBusy(busy) {
  resetInProgress = busy;
  document.getElementById('reset-confirm-input').disabled = busy;
  document.getElementById('btn-reset-cancel').disabled = busy;
  document.getElementById('btn-reset-confirm').disabled = busy || document.getElementById('reset-confirm-input').value !== 'RESET';
  document.getElementById('reset-btn-spinner').classList.toggle('hidden', !busy);
  document.getElementById('reset-confirm-label').textContent = busy ? 'Resetting...' : 'Reset';
}

function showResetError(msg) {
  const el = document.getElementById('reset-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('reset-confirm-input').addEventListener('input', updateResetConfirmEnabled);
document.getElementById('btn-reset-cancel').addEventListener('click', () => {
  if (resetInProgress) return;
  closeOverlay('reset-overlay');
});

document.getElementById('btn-reset-confirm').addEventListener('click', async () => {
  if (resetInProgress) return;
  if (document.getElementById('reset-confirm-input').value !== 'RESET') return;
  if (!currentUser) { showResetError('You are not signed in.'); return; }

  const uid = currentUser.uid;
  const userPrefix = `users/${uid}/`;
  document.getElementById('reset-error').classList.add('hidden');
  setResetBusy(true);

  try {
    const [workoutsSnap, plansSnap, philosophiesSnap] = await Promise.all([
      fStore.collection(userPrefix + 'workouts').get(),
      fStore.collection(userPrefix + 'plans').get(),
      fStore.collection(userPrefix + 'coachingPhilosophies').get(),
    ]);

    const refs = [
      ...workoutsSnap.docs.map(d => d.ref),
      ...plansSnap.docs.map(d => d.ref),
      ...philosophiesSnap.docs.map(d => d.ref),
      fStore.doc(userPrefix + 'meta/records'),
      fStore.doc(userPrefix + 'meta/custom_exercises'),
      fStore.doc(userPrefix + 'meta/activeplan'),
      fStore.doc(userPrefix + 'meta/favorites'),
      fStore.doc(userPrefix + 'meta/hidden_builtins'),
    ];

    // Explicit per-doc safety check: refuse to touch anything outside this user's own subtree.
    for (const ref of refs) {
      if (!ref.path.startsWith(userPrefix)) {
        throw new Error('Refused to delete out-of-scope path: ' + ref.path);
      }
    }

    // Firestore caps a single batch at 500 writes. Commit in chunks so each
    // chunk is atomic (all-or-nothing); this app's data realistically stays
    // well under one chunk, but this keeps larger accounts safe too.
    const BATCH_LIMIT = 400;
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = fStore.batch();
      refs.slice(i, i + BATCH_LIMIT).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
    currentPlanId = null;
    currentPlanData = null;

    closeOverlay('reset-overlay');
    toast('Reset complete');
    openFitnessTracker();
  } catch (err) {
    console.error('[Reset] failed:', err);
    showResetError((err && err.message) ? err.message : 'Reset failed. Please check your connection and try again.');
  } finally {
    setResetBusy(false);
  }
});

// -- Home Screen ----------------------------------------
// Returns a Set of "date#setIndex" keys marking, per exercise, only the very
// first chronological set that ever hit a given (reps, weight) PR combo —
// so repeats of an already-celebrated combo (same day or later) don't re-trophy.
function getFirstPRComboKeys(exerciseName) {
  const exRecords = (db.records || {})[exerciseName] || {};
  const dates = Object.keys(db.workouts).sort();
  const seenCombos = new Set();
  const result = new Set();
  dates.forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === exerciseName);
    if (!ex) return;
    (ex.sets || []).forEach((s, i) => {
      const isPR = exRecords[String(s.reps)] && parseFloat(s.weight) >= exRecords[String(s.reps)];
      if (!isPR) return;
      const combo = s.reps + '_' + s.weight;
      if (seenCombos.has(combo)) return;
      seenCombos.add(combo);
      result.add(date + '#' + i);
    });
  });
  return result;
}

function renderHome() {
  document.getElementById('day-nav-label').textContent = formatDate(currentDate);
  const exercises = getWorkout(currentDate);
  const container = document.getElementById('home-content');
  const screenEl = document.getElementById('screen-fitness-tracker');

  if (exercises.length === 0) {
    screenEl.classList.remove('has-day-actions');
    container.innerHTML = `
      <div class="home-empty">
        <div class="home-empty-title-wrap">
          <span class="home-empty-title">Workout Log Empty</span>
        </div>
        <button class="home-empty-action" id="btn-start-new">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          <span>Start New Workout</span>
        </button>
      </div>`;
    document.getElementById('btn-start-new').addEventListener('click', openNewWorkoutScreen);
    return;
  }

  screenEl.classList.add('has-day-actions');
  container.innerHTML = '';

  exercises.forEach((ex, idx) => {
    const sets = ex.sets || [];
    const firstPRKeys = getFirstPRComboKeys(ex.name);
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.exIdx = idx;

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.innerHTML = `
      <div class="exercise-card-name">${ex.name}</div>
      <div class="exercise-card-drag-handle" aria-label="Drag to reorder">
        <svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
      </div>`;
    card.appendChild(header);
    card.appendChild(Object.assign(document.createElement('div'), { className: 'exercise-card-divider' }));

    const setsDiv = document.createElement('div');
    setsDiv.className = 'exercise-card-sets';
    if (sets.length === 0) {
      setsDiv.innerHTML = `<div class="exercise-card-empty">No sets</div>`;
    } else {
      sets.forEach((s, setIdx) => {
        const isFirstPR = firstPRKeys.has(currentDate + '#' + setIdx);
        const hasNote = !!(s.note && s.note.trim());
        const row = document.createElement('div');
        row.className = 'exercise-set-row';
        row.innerHTML = `
          <span class="exercise-set-comment${hasNote ? ' has-note' : ''}" aria-label="Set comment">${hasNote ? `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>` : ''}</span>
          ${isFirstPR ? `<svg class="exercise-set-pr" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>` : `<span class="exercise-set-spacer"></span>`}
          <span class="exercise-set-weight"><span class="exercise-set-val">${s.weight}</span><span class="exercise-set-unit">kgs</span></span>
          <span class="exercise-set-reps"><span class="exercise-set-val">${s.reps}</span><span class="exercise-set-unit">reps</span></span>
        `;
        if (hasNote) {
          row.querySelector('.exercise-set-comment').addEventListener('click', e => {
            e.stopPropagation();
            openSetCommentPopup(idx, setIdx);
          });
        }
        setsDiv.appendChild(row);
      });
    }
    card.appendChild(setsDiv);

    // Long-press to enter selection mode
    let longPressTimer = null;
    card.addEventListener('touchstart', () => {
      if (homeSelMode) return;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (navigator.vibrate) navigator.vibrate(30);
        enterHomeSelMode(card);
      }, 500);
    }, { passive: true });
    const cancelLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    card.addEventListener('touchmove', cancelLongPress, { passive: true });
    card.addEventListener('touchend', cancelLongPress, { passive: true });
    card.addEventListener('touchcancel', cancelLongPress, { passive: true });

    card.addEventListener('click', () => {
      if (!homeSelMode) {
        openTraining(ex.name);
      } else {
        if (homeSelCards.has(card)) {
          homeSelCards.delete(card);
          card.classList.remove('exercise-card-selected');
          if (homeSelCards.size === 0) exitHomeSelMode();
          else updateHomeSelCount();
        } else {
          homeSelCards.add(card);
          card.classList.add('exercise-card-selected');
          updateHomeSelCount();
        }
      }
    });
    container.appendChild(card);
  });
}

// -- Comment popup (per-set and per-session) ------------
let commentPopupCtx = null;

function openCommentPopup(ctx) {
  commentPopupCtx = ctx;
  const text = ctx.getText();
  if (text && text.trim()) showCommentView(text);
  else showCommentEdit('');
  openOverlay('comment-overlay');
}

function showCommentView(text) {
  document.getElementById('comment-view-text').textContent = text;
  document.getElementById('comment-view-mode').classList.remove('hidden');
  document.getElementById('comment-edit-mode').classList.add('hidden');
}

function showCommentEdit(text) {
  document.getElementById('comment-edit-input').value = text;
  document.getElementById('comment-edit-mode').classList.remove('hidden');
  document.getElementById('comment-view-mode').classList.add('hidden');
}

function openSetCommentPopup(exIdx, setIdx) {
  openCommentPopup({
    getText: () => {
      const ex = getWorkout(currentDate)[exIdx];
      return (ex && ex.sets[setIdx] && ex.sets[setIdx].note) || '';
    },
    onSave: val => {
      const workout = getWorkout(currentDate);
      const ex = workout[exIdx];
      if (!ex || !ex.sets[setIdx]) return;
      if (val) ex.sets[setIdx].note = val; else delete ex.sets[setIdx].note;
      setWorkout(currentDate, workout);
      renderHome();
    },
    onDelete: () => {
      const workout = getWorkout(currentDate);
      const ex = workout[exIdx];
      if (!ex || !ex.sets[setIdx]) return;
      delete ex.sets[setIdx].note;
      setWorkout(currentDate, workout);
      renderHome();
    }
  });
}

function openSessionCommentPopup() {
  const date = currentDate;
  openCommentPopup({
    getText: () => getSessionNote(date),
    onSave: val => saveSessionNote(date, val),
    onDelete: () => saveSessionNote(date, '')
  });
}

function enterHomeSelMode(card) {
  homeSelMode = true;
  homeSelCards.add(card);
  card.classList.add('exercise-card-selected');
  document.getElementById('screen-fitness-tracker').classList.add('sel-mode');
  updateHomeSelCount();
}

function updateHomeSelCount() {
  const n = homeSelCards.size;
  document.getElementById('home-sel-count').textContent = n === 1 ? '1 exercise' : `${n} exercises`;
  document.getElementById('screen-fitness-tracker').classList.toggle('sel-single', n === 1);
}

function exitHomeSelMode() {
  homeSelMode = false;
  homeSelCards.forEach(card => card.classList.remove('exercise-card-selected'));
  homeSelCards.clear();
  document.getElementById('screen-fitness-tracker').classList.remove('sel-mode', 'sel-single');
}

function deleteHomeSelectedEx() {
  if (homeSelCards.size === 0) return;
  const container = document.getElementById('home-content');
  const allCards = [...container.querySelectorAll('.exercise-card')];
  const selectedIdxs = new Set([...homeSelCards].map(c => allCards.indexOf(c)).filter(i => i >= 0));
  const exercises = getWorkout(currentDate);
  const newExercises = exercises.filter((_, i) => !selectedIdxs.has(i));
  const n = homeSelCards.size;
  setWorkout(currentDate, newExercises);
  exitHomeSelMode();
  renderHome();
  toast(n === 1 ? 'Exercise removed' : `${n} exercises removed`);
}

function setupHomeExDragReorder() {
  const container = document.getElementById('home-content');

  container.addEventListener('touchstart', e => {
    if (!homeSelMode || homeSelCards.size !== 1) return;
    if (!e.target.closest('.exercise-card-drag-handle')) return;
    homeExDragItem = e.target.closest('.exercise-card');
    if (!homeExDragItem) return;
    homeExDragStartY = e.touches[0].clientY;
    homeExDragDy = 0;
    homeExDragItem.classList.add('exercise-card-dragging');
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!homeExDragItem) return;
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    homeExDragDy = touchY - homeExDragStartY;
    homeExDragItem.style.transform = `translateY(${homeExDragDy}px)`;

    const cards = [...container.querySelectorAll('.exercise-card')];
    const dragPos = cards.indexOf(homeExDragItem);
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] === homeExDragItem) continue;
      const sibRect = cards[i].getBoundingClientRect();
      const sibCenter = sibRect.top + sibRect.height / 2;
      if (dragPos < i && touchY > sibCenter) {
        cards[i].insertAdjacentElement('afterend', homeExDragItem);
        homeExDragStartY += sibRect.height;
        homeExDragDy -= sibRect.height;
        homeExDragItem.style.transform = `translateY(${homeExDragDy}px)`;
        break;
      } else if (dragPos > i && touchY < sibCenter) {
        cards[i].insertAdjacentElement('beforebegin', homeExDragItem);
        homeExDragStartY -= sibRect.height;
        homeExDragDy += sibRect.height;
        homeExDragItem.style.transform = `translateY(${homeExDragDy}px)`;
        break;
      }
    }
  }, { passive: false });

  const endDrag = () => {
    if (!homeExDragItem) return;
    homeExDragItem.classList.remove('exercise-card-dragging');
    homeExDragItem.style.transform = '';

    const exercises = getWorkout(currentDate);
    const cards = [...container.querySelectorAll('.exercise-card')];
    const newExercises = cards.map(card => exercises[parseInt(card.dataset.exIdx)]).filter(Boolean);

    if (JSON.stringify(newExercises.map(e => e.name)) !== JSON.stringify(exercises.map(e => e.name))) {
      setWorkout(currentDate, newExercises);
      cards.forEach((card, i) => { card.dataset.exIdx = i; });
      toast('Order saved');
    }
    homeExDragItem = null;
  };

  container.addEventListener('touchend', endDrag, { passive: true });
  container.addEventListener('touchcancel', endDrag, { passive: true });
}

// -- Set list drag reorder (long-press a set row to drag it) --
let setDragItem = null, setDragStartY = 0, setDragDy = 0;
let setLongPressTimer = null, setDragSuppressClick = false;

function startSetDrag(row, startY) {
  setDragItem = row;
  setDragStartY = startY;
  setDragDy = 0;
  row.classList.add('set-row-dragging');
}

function handleSetDragMove(touchY) {
  setDragDy = touchY - setDragStartY;
  setDragItem.style.transform = `translateY(${setDragDy}px)`;

  const list = document.getElementById('set-list');
  const rows = [...list.querySelectorAll('.set-row')];
  const dragPos = rows.indexOf(setDragItem);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] === setDragItem) continue;
    const sibRect = rows[i].getBoundingClientRect();
    const sibCenter = sibRect.top + sibRect.height / 2;
    if (dragPos < i && touchY > sibCenter) {
      rows[i].insertAdjacentElement('afterend', setDragItem);
      setDragStartY += sibRect.height;
      setDragDy -= sibRect.height;
      setDragItem.style.transform = `translateY(${setDragDy}px)`;
      break;
    } else if (dragPos > i && touchY < sibCenter) {
      rows[i].insertAdjacentElement('beforebegin', setDragItem);
      setDragStartY -= sibRect.height;
      setDragDy += sibRect.height;
      setDragItem.style.transform = `translateY(${setDragDy}px)`;
      break;
    }
  }
}

function endSetDrag() {
  if (!setDragItem) return;
  setDragItem.classList.remove('set-row-dragging');
  setDragItem.style.transform = '';

  const list = document.getElementById('set-list');
  const rows = [...list.querySelectorAll('.set-row')];
  const oldIdxOrder = rows.map(r => parseInt(r.dataset.setIdx, 10));
  const isReordered = oldIdxOrder.some((idx, pos) => idx !== pos);

  if (isReordered) {
    const workout = getWorkout(currentDate);
    const ex = workout.find(e => e.name === currentExercise);
    if (ex) {
      const newSets = oldIdxOrder.map(idx => ex.sets[idx]);
      if (selectedSetIndex !== null) selectedSetIndex = oldIdxOrder.indexOf(selectedSetIndex);
      ex.sets = newSets;
      setWorkout(currentDate, workout);
      toast('Order saved');
    }
  }
  setDragItem = null;
  renderSetList();
}

function setupSetListDragReorder() {
  const list = document.getElementById('set-list');

  const cancelLongPress = () => { if (setLongPressTimer) { clearTimeout(setLongPressTimer); setLongPressTimer = null; } };

  list.addEventListener('touchstart', e => {
    const row = e.target.closest('.set-row');
    if (!row || e.touches.length !== 1) return;
    const startY = e.touches[0].clientY;
    setLongPressTimer = setTimeout(() => {
      setLongPressTimer = null;
      setDragSuppressClick = true;
      if (navigator.vibrate) navigator.vibrate(30);
      startSetDrag(row, startY);
    }, 500);
  }, { passive: true });

  list.addEventListener('touchmove', e => {
    if (setDragItem) {
      e.preventDefault();
      handleSetDragMove(e.touches[0].clientY);
      return;
    }
    cancelLongPress();
  }, { passive: false });

  const endTouch = () => {
    cancelLongPress();
    if (setDragItem) endSetDrag();
  };
  list.addEventListener('touchend', endTouch, { passive: true });
  list.addEventListener('touchcancel', endTouch, { passive: true });

  // Swallow the click a long-press-triggered drag would otherwise leave behind,
  // so it never also fires selectSet() on the row.
  list.addEventListener('click', e => {
    if (setDragSuppressClick) {
      e.stopPropagation();
      e.preventDefault();
      setDragSuppressClick = false;
    }
  }, true);
}

// -- Exercise Browser -----------------------------------
function setExercisesTitle(text) {
  document.getElementById('exercises-title').textContent = text;
}

// -- New Workout intermediate screen --------------------
function openNewWorkoutScreen() {
  renderNewWorkoutScreen();
  showScreen('screen-new-workout');
}

// Reuses the same active-plan day-rotation logic as the smart day banner
// (db.activePlan.lastDayIndex -> next index in plan.days) to figure out
// what today's automatic pick would be.
function getTodaysScheduledDayName() {
  if (!db.activePlan) return null;
  const plan = db.plans[db.activePlan.planId];
  if (!plan || !plan.days || plan.days.length === 0) return null;
  const lastIdx = db.activePlan.lastDayIndex ?? -1;
  const nextIdx = (lastIdx + 1) % plan.days.length;
  return plan.days[nextIdx].name || ('Day ' + (nextIdx + 1));
}

function renderNewWorkoutScreen() {
  const dayName = getTodaysScheduledDayName();
  document.getElementById('nw-schema-auto-desc').textContent = dayName
    ? `Today you have ${dayName}.`
    : 'Automatic planning not set up yet';
}

function openExerciseList() {
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  currentBrowsePlan = null;
  document.getElementById('exercise-search').value = '';
  setExercisesTitle('All Exercises');
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

function renderCategoryBrowser() {
  setExercisesTitle('All Exercises');
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const hasFavorites = Object.keys(db.favoriteExercises || {}).length > 0;
  if (hasFavorites) {
    const item = document.createElement('div');
    item.className = 'category-item category-item-favorites list-row';
    item.innerHTML = `
      <svg class="category-item-fav-star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      <span class="category-item-name">Favorites</span>
    `;
    item.addEventListener('click', () => {
      exerciseBrowserMode = 'exercises';
      currentBrowseCategory = FAVORITES_CATEGORY;
      setExercisesTitle('Favorites');
      renderFavoriteExercises();
    });
    list.appendChild(item);
  }
  const cats = [...new Set(allExercises().map(e => e.category))].sort();
  cats.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item list-row';
    item.innerHTML = `
      <span class="category-item-name">${cat}</span>
      <svg class="category-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
    `;
    item.querySelector('.category-item-name').addEventListener('click', () => {
      exerciseBrowserMode = 'exercises';
      currentBrowseCategory = cat;
      setExercisesTitle(cat);
      renderExercisesInCategory(cat);
    });
    item.querySelector('.category-item-dots').addEventListener('click', e => {
      e.stopPropagation();
      showOverflowMenu([
        { label: 'Edit', action: () => editCategory(cat) },
        { label: 'Delete', action: () => deleteCategory(cat) }
      ], e.currentTarget);
    });
    list.appendChild(item);
  });
}

function renderPlanDayBrowser(planId) {
  const plan = db.plans[planId];
  if (!plan) return;
  exerciseBrowserMode = 'plan-days';
  currentBrowsePlan = planId;
  setExercisesTitle(plan.name);
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  (plan.days || []).forEach((day, idx) => {
    const item = document.createElement('div');
    item.className = 'category-item list-row';
    const count = (day.exercises || []).length;
    item.innerHTML = `
      <div class="plan-day-badge">${idx + 1}</div>
      <span class="category-item-name">${day.name}</span>
      <span class="category-item-sub">${count} exercise${count !== 1 ? 's' : ''}</span>
    `;
    item.addEventListener('click', () => {
      loadWorkoutReturnScreen = 'screen-exercises';
      openLoadWorkout(planId, idx);
    });
    list.appendChild(item);
  });
}

// -- Category edit/delete -------------------------------
let pendingEditCategory = null;
let pendingDeleteCategory = null;

function editCategory(cat) {
  pendingEditCategory = cat;
  document.getElementById('cat-edit-input').value = cat;
  openOverlay('cat-edit-overlay');
  setTimeout(() => document.getElementById('cat-edit-input').select(), 100);
}

function deleteCategory(cat) {
  pendingDeleteCategory = cat;
  const total = allExercises().filter(e => e.category === cat).length;
  const custom = (db.custom_exercises || []).filter(e => e.category === cat).length;
  let msg = `Delete "${cat}"`;
  if (total > 0) {
    msg += ` and its ${total} exercise${total !== 1 ? 's' : ''}?`;
    if (total > custom) msg += ` (${total - custom} built-in exercise${total - custom !== 1 ? 's' : ''} cannot be deleted)`;
  }
  document.getElementById('cat-delete-msg').textContent = msg;
  openOverlay('cat-delete-overlay');
}

document.getElementById('btn-cat-edit-cancel').addEventListener('click', () => closeOverlay('cat-edit-overlay'));
document.getElementById('btn-cat-edit-save').addEventListener('click', () => {
  const newName = document.getElementById('cat-edit-input').value.trim();
  if (!newName || !pendingEditCategory) return;
  if (db.custom_exercises) {
    db.custom_exercises.forEach(ex => { if (ex.category === pendingEditCategory) ex.category = newName; });
    persistCustomExercises();
  }
  closeOverlay('cat-edit-overlay');
  pendingEditCategory = null;
  renderCategoryBrowser();
  toast('Category renamed');
});
document.getElementById('btn-cat-delete-cancel').addEventListener('click', () => closeOverlay('cat-delete-overlay'));
document.getElementById('btn-cat-delete-confirm').addEventListener('click', () => {
  if (!pendingDeleteCategory) return;
  if (db.custom_exercises) {
    db.custom_exercises = db.custom_exercises.filter(e => e.category !== pendingDeleteCategory);
    persistCustomExercises();
  }
  closeOverlay('cat-delete-overlay');
  pendingDeleteCategory = null;
  renderCategoryBrowser();
  toast('Category deleted');
});

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

function renderFavoriteExercises() {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const favs = allExercises().filter(e => isFavoriteExercise(e.name));
  if (favs.length === 0) {
    list.innerHTML = `<div class="exercise-empty">No favorites yet</div>`;
    return;
  }
  favs.forEach(ex => renderExerciseItem(list, ex));
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

function refreshExerciseList() {
  const q = document.getElementById('exercise-search').value.toLowerCase().trim();
  if (q) { renderExerciseSearchResults(q); return; }
  if (exerciseBrowserMode === 'exercises' && currentBrowseCategory === FAVORITES_CATEGORY) {
    renderFavoriteExercises();
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory) {
    renderExercisesInCategory(currentBrowseCategory);
  } else {
    renderCategoryBrowser();
  }
}

function renderExerciseItem(list, ex) {
  const item = document.createElement('div');
  item.className = 'exercise-item list-row' + (ex.custom ? ' exercise-item-custom' : '');
  const isFav = isFavoriteExercise(ex.name);
  item.innerHTML = `
    <span class="exercise-item-name">${ex.name}</span>
    ${isFav ? `<svg class="exercise-item-fav-star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>` : ''}
    <svg class="exercise-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  `;
  item.querySelector('.exercise-item-name').addEventListener('click', () => {
    openTraining(ex.name);
  });
  item.querySelector('.exercise-item-dots').addEventListener('click', e => {
    e.stopPropagation();
    showOverflowMenu([
      { label: 'Edit', action: () => openEditExerciseScreen(ex) },
      { label: 'Delete', action: () => openDeleteExerciseConfirm(ex), danger: true },
      {
        label: isFav ? 'Unfavorite' : 'Favorite',
        action: () => { toggleFavoriteExercise(ex.name); refreshExerciseList(); }
      }
    ], e.currentTarget);
  });
  list.appendChild(item);
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

function updateActionButtonsUI() {
  const isEditing = selectedSetIndex !== null;
  const saveBtn = document.getElementById('btn-save-set');
  const clearBtn = document.getElementById('btn-clear');
  saveBtn.textContent = isEditing ? 'UPDATE' : 'SAVE';
  clearBtn.textContent = isEditing ? 'DELETE' : 'CLEAR';
  clearBtn.classList.toggle('btn-delete-mode', isEditing);
}

function renderSetList() {
  const list = document.getElementById('set-list');
  const ex = getCurrentExerciseData();
  const sets = ex ? ex.sets : [];
  updateActionButtonsUI();

  if (sets.length === 0) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:#9e9e9e;font-size:14px">No sets yet. Enter weight and reps, then tap SAVE.</div>`;
    return;
  }

  const firstPRKeys = getFirstPRComboKeys(currentExercise);
  list.innerHTML = '';

  sets.forEach((s, i) => {
    const isPR = firstPRKeys.has(currentDate + '#' + i);
    const hasNote = !!(s.note && s.note.trim());
    const isSelected = selectedSetIndex === i;
    const row = document.createElement('div');
    row.className = 'set-row' + (isSelected ? ' selected' : '');
    row.dataset.setIdx = i;
    row.innerHTML = `
      <span class="set-comment${hasNote ? ' has-note' : ''}" aria-label="Set note"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></span>
      <span class="set-row-pr">${isPR ? `<svg class="set-pr-icon" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>` : ''}</span>
      <span class="set-num">${i + 1}</span>
      <span class="set-weight"><span class="set-weight-val">${s.weight}</span><span class="set-weight-unit">kgs</span></span>
      <span class="set-reps"><span class="set-reps-val">${s.reps}</span><span class="set-reps-unit">reps</span></span>
    `;
    row.querySelector('.set-comment').addEventListener('click', e => { e.stopPropagation(); openSetNote(i); });
    row.addEventListener('click', () => selectSet(i));
    list.appendChild(row);
  });
}

let noteEditIndex = null;

function openSetNote(i) {
  const ex = getCurrentExerciseData();
  if (!ex || !ex.sets[i]) return;
  noteEditIndex = i;
  document.getElementById('set-note-input').value = ex.sets[i].note || '';
  openOverlay('set-note-overlay');
}

function saveSetNote() {
  if (noteEditIndex === null) return;
  const workout = getWorkout(currentDate);
  const ex = workout.find(e => e.name === currentExercise);
  if (!ex || !ex.sets[noteEditIndex]) { closeOverlay('set-note-overlay'); return; }
  const note = document.getElementById('set-note-input').value.trim();
  if (note) ex.sets[noteEditIndex].note = note;
  else delete ex.sets[noteEditIndex].note;
  setWorkout(currentDate, workout);
  noteEditIndex = null;
  closeOverlay('set-note-overlay');
  renderSetList();
}

function openExerciseRecords() {
  const list = document.getElementById('records-list');
  document.getElementById('records-title').textContent = 'Personal Records — ' + (currentExercise || '');
  const exRecords = (db.records || {})[currentExercise] || {};
  const reps = Object.keys(exRecords).map(Number).sort((a, b) => a - b);
  if (reps.length === 0) {
    list.innerHTML = `<div class="records-empty">No records yet for ${currentExercise}</div>`;
  } else {
    list.innerHTML = reps.map(r => `
      <div class="records-row">
        <span class="records-row-reps">${r} rep${r === 1 ? '' : 's'}</span>
        <span class="records-row-weight"><svg viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>${exRecords[r]} kgs</span>
      </div>
    `).join('');
  }
  openOverlay('records-overlay');
}

// -- Exercise info (muscle group / equipment setup) ------
// Exercise-own data, keyed by exercise name (same join key as favorites/
// hiddenBuiltins) — not tied to any session/set, so it's stored and loaded
// independently of db.workouts.
const MUSCLE_OPTIONS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quadriceps', 'Hamstrings', 'Glutes', 'Core', 'Calves'];
const EXERCISE_INFO_EQUIPMENT_FIELDS = [
  { key: 'benchSetting', label: 'Bench setting', inputId: 'info-bench-setting', type: 'int' },
  { key: 'benchHeight', label: 'Bench height', inputId: 'info-bench-height', type: 'float1' },
  { key: 'oldMachineCableHeight', label: 'Old machine cable height', inputId: 'info-old-cable-height', type: 'int' },
  { key: 'newMachineCableHeight', label: 'New machine cable height', inputId: 'info-new-cable-height', type: 'int' },
  { key: 'handPosition', label: 'Hand position', inputId: 'info-hand-position', type: 'text' },
  { key: 'footPosition', label: 'Foot position', inputId: 'info-foot-position', type: 'text' },
];

function renderExerciseInfoView() {
  const info = getExerciseInfo(currentExercise) || {};
  document.getElementById('exercise-info-view-title').textContent = currentExercise + ' info';
  const sections = [];
  if (info.primaryMuscle || info.secondaryMuscle) {
    sections.push(`<div class="info-section-label">Muscle group</div><div class="info-two-col">
      ${info.primaryMuscle ? `<div class="info-view-stat"><span class="info-view-stat-label">Primary</span><span class="info-view-stat-value">${info.primaryMuscle}</span></div>` : ''}
      ${info.secondaryMuscle ? `<div class="info-view-stat"><span class="info-view-stat-label">Secondary</span><span class="info-view-stat-value">${info.secondaryMuscle}</span></div>` : ''}
    </div>`);
  }
  const equipRows = EXERCISE_INFO_EQUIPMENT_FIELDS.filter(f => info[f.key] !== undefined && info[f.key] !== null && info[f.key] !== '');
  if (equipRows.length > 0) {
    sections.push('<div class="info-section-label">Equipment setup</div>' + equipRows.map(f =>
      `<div class="info-view-row"><span class="info-view-row-label">${f.label}</span><span class="info-view-row-value">${info[f.key]}</span></div>`
    ).join(''));
  }
  const content = document.getElementById('exercise-info-view-content');
  const closeBtn = document.getElementById('btn-exercise-info-close');
  if (sections.length === 0) {
    content.innerHTML = `<div class="exercise-info-empty">No info added yet</div>`;
    closeBtn.classList.add('hidden');
  } else {
    content.innerHTML = sections.join('');
    closeBtn.classList.remove('hidden');
  }
  document.getElementById('exercise-info-view-mode').classList.remove('hidden');
  document.getElementById('exercise-info-edit-mode').classList.add('hidden');
}

const MUSCLE_PRIMARY_OPTIONS = MUSCLE_OPTIONS.map(m => ({ value: m, label: m }));
const MUSCLE_SECONDARY_OPTIONS = [{ value: '', label: 'None' }, ...MUSCLE_PRIMARY_OPTIONS];

document.getElementById('info-primary-muscle').addEventListener('click', () => {
  openFieldPicker('Primary', MUSCLE_PRIMARY_OPTIONS, getFieldBtnValue('info-primary-muscle'), value => {
    setFieldBtnValue('info-primary-muscle', value, value);
  });
});
document.getElementById('info-secondary-muscle').addEventListener('click', () => {
  openFieldPicker('Secondary', MUSCLE_SECONDARY_OPTIONS, getFieldBtnValue('info-secondary-muscle'), value => {
    setFieldBtnValue('info-secondary-muscle', value, value || 'None');
  });
});

function showExerciseInfoEdit() {
  const info = getExerciseInfo(currentExercise) || {};
  document.getElementById('exercise-info-edit-title').textContent = currentExercise + ' info';
  const primary = info.primaryMuscle || MUSCLE_OPTIONS[0];
  setFieldBtnValue('info-primary-muscle', primary, primary);
  const secondary = info.secondaryMuscle || '';
  setFieldBtnValue('info-secondary-muscle', secondary, secondary || 'None');
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    document.getElementById(f.inputId).value = (info[f.key] !== undefined && info[f.key] !== null) ? info[f.key] : '';
  });
  document.getElementById('exercise-info-edit-mode').classList.remove('hidden');
  document.getElementById('exercise-info-view-mode').classList.add('hidden');
}

function openExerciseInfo() {
  renderExerciseInfoView();
  openOverlay('exercise-info-overlay');
}

function saveExerciseInfo() {
  const info = {};
  const primary = getFieldBtnValue('info-primary-muscle');
  const secondary = getFieldBtnValue('info-secondary-muscle');
  if (primary) info.primaryMuscle = primary;
  if (secondary) info.secondaryMuscle = secondary;
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const raw = document.getElementById(f.inputId).value.trim();
    if (raw === '') return;
    if (f.type === 'int') info[f.key] = parseInt(raw, 10);
    else if (f.type === 'float1') info[f.key] = Math.round(parseFloat(raw) * 10) / 10;
    else info[f.key] = raw;
  });
  if (!db.exerciseInfo) db.exerciseInfo = {};
  if (Object.keys(info).length === 0) delete db.exerciseInfo[currentExercise];
  else db.exerciseInfo[currentExercise] = info;
  persistExerciseInfo();
  renderExerciseInfoView();
}

function saveSet() {
  const weight = parseFloat(document.getElementById('field-weight').value) || 0;
  const reps = parseInt(document.getElementById('field-reps').value) || 0;
  if (reps === 0 && weight === 0) { toast('Enter weight or reps'); return; }

  const workout = getWorkout(currentDate);
  let ex = workout.find(e => e.name === currentExercise);
  if (!ex) { ex = { name: currentExercise, sets: [] }; workout.push(ex); }

  if (selectedSetIndex !== null) {
    const existingNote = ex.sets[selectedSetIndex] && ex.sets[selectedSetIndex].note;
    ex.sets[selectedSetIndex] = existingNote ? { weight, reps, note: existingNote } : { weight, reps };
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

// Tap a weight/reps number to select it all, so typing overwrites it
// instead of inserting a cursor at the tap position. The resulting selection
// would normally summon Android's native Cut/Copy/Translate action bar above
// it; preventDefault on contextmenu suppresses that bar while leaving the
// blue selection highlight itself alone.
['field-weight', 'field-reps'].forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => input.select());
  input.addEventListener('contextmenu', e => e.preventDefault());
});

// -- Tabs -----------------------------------------------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
  if (tab === 'history') renderHistoryTab();
  if (tab === 'graph') renderGraph();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// Swipe between Track/History/Graph, reusing the day-nav swipe's direction-
// lock pattern. No wrap-around: a swipe past either end is simply a no-op.
const TRAINING_TAB_ORDER = ['track', 'history', 'graph'];
function navigateTrainingTab(delta) {
  const current = document.querySelector('.tab.active').dataset.tab;
  const nextIdx = TRAINING_TAB_ORDER.indexOf(current) + delta;
  if (nextIdx < 0 || nextIdx >= TRAINING_TAB_ORDER.length) return;
  switchTab(TRAINING_TAB_ORDER[nextIdx]);
}

function setupTrainingSwipeNav() {
  const container = document.getElementById('training-content-wrap');
  const SWIPE_THRESHOLD = 50;
  const DIRECTION_LOCK = 10;
  let startX = 0, startY = 0, tracking = false, direction = null;

  container.addEventListener('touchstart', e => {
    // Defer entirely to the set-row long-press-drag once it's taken over this
    // gesture (see setupSetListDragReorder) so the two never fight over the
    // same touch sequence.
    if (e.touches.length !== 1 || setDragItem) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    direction = null;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!tracking) return;
    if (setDragItem) { tracking = false; direction = null; return; }
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!direction) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (direction === 'horizontal') e.preventDefault();
  }, { passive: false });

  const endSwipe = e => {
    if (!tracking) return;
    if (direction === 'horizontal' && !setDragItem) {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) navigateTrainingTab(dx < 0 ? 1 : -1);
    }
    tracking = false;
    direction = null;
  };
  container.addEventListener('touchend', endSwipe, { passive: true });
  container.addEventListener('touchcancel', () => { tracking = false; direction = null; }, { passive: true });
}

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

  const firstPRKeys = getFirstPRComboKeys(currentExercise);

  relevantDates.forEach(date => {
    const ex = db.workouts[date].find(e => e.name === currentExercise);
    if (!ex || !ex.sets.length) return;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'history-day-header clickable';
    headerDiv.innerHTML = `<div class="history-day-date">${formatDateShort(date)}</div><div class="history-day-divider"></div>`;
    headerDiv.addEventListener('click', () => openHistoryGotoDate(date));
    container.appendChild(headerDiv);

    ex.sets.forEach((s, i) => {
      const isPR = firstPRKeys.has(date + '#' + i);
      const row = document.createElement('div');
      row.className = 'history-set-row clickable';
      row.innerHTML = `
        ${isPR ? `<svg class="history-set-pr" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>` : `<span class="history-set-spacer"></span>`}
        <span class="history-set-weight">${s.weight} kg</span>
        <span class="history-set-reps">${s.reps} reps</span>
      `;
      row.addEventListener('click', () => openHistoryGotoExercise(currentExercise, date));
      container.appendChild(row);
    });
  });
}

// -- History "Go to..." popup (date header / set row taps) ----
let historyGotoAction = null;

function openHistoryGoto(title, action) {
  document.getElementById('history-goto-title').textContent = title;
  historyGotoAction = action;
  openOverlay('history-goto-overlay');
}

function openHistoryGotoDate(dateStr) {
  openHistoryGoto('Go to ' + formatDateShort(dateStr), () => {
    currentDate = dateStr;
    showScreen('screen-fitness-tracker');
  });
}

function openHistoryGotoExercise(exerciseName, dateStr) {
  openHistoryGoto(`Go to ${exerciseName} on ${formatDateShort(dateStr)}`, () => {
    currentDate = dateStr;
    openTraining(exerciseName);
  });
}

document.getElementById('history-goto-cancel').addEventListener('click', () => closeOverlay('history-goto-overlay'));
document.getElementById('history-goto-confirm').addEventListener('click', () => {
  const action = historyGotoAction;
  historyGotoAction = null;
  closeOverlay('history-goto-overlay');
  if (action) action();
});

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
    const label = (maxV - (range / 4) * i).toFixed(1);
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

// -- Calendar ---------------------------------------------
// A continuously scrollable list of months (screen-calendar). Months are
// lazy-loaded a few at a time as the user nears the top/bottom of the
// currently rendered range, so opening the screen never has to build more
// than a handful of months up front regardless of how much workout history
// exists.
const calScrollEl = () => document.getElementById('cal-scroll');
const CAL_BATCH = 3; // months to load per lazy-load step
const CAL_LOAD_THRESHOLD = 400; // px from an edge that triggers loading more

function calMonthKey(y, m) { return y * 12 + m; }
function calHasWorkout(dateStr) { return !!(db.workouts[dateStr] && db.workouts[dateStr].length > 0); }

function calBuildMonthEl(year, month) {
  const wrap = document.createElement('div');
  wrap.className = 'cal-month';
  wrap.dataset.ym = `${year}-${String(month + 1).padStart(2, '0')}`;

  const label = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const hdr = document.createElement('div');
  hdr.className = 'cal-month-header';
  hdr.textContent = label;
  wrap.appendChild(hdr);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

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
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const el = document.createElement('button');
    el.className = 'cal-day' +
      (calHasWorkout(dateStr) ? ' has-workout' : '') +
      (dateStr === today ? ' today' : '') +
      (dateStr === calSelectedDate ? ' selected' : '');
    el.textContent = d;
    el.dataset.date = dateStr;
    el.addEventListener('click', () => calDayClick(dateStr));
    grid.appendChild(el);
  }

  wrap.appendChild(grid);
  return wrap;
}

function calDayClick(dateStr) {
  calSetSelected(dateStr);
  openWorkoutDetail(dateStr);
}

function calSetSelected(dateStr) {
  if (calSelectedDate) {
    const prev = calScrollEl().querySelector(`.cal-day[data-date="${calSelectedDate}"]`);
    if (prev) prev.classList.remove('selected');
  }
  calSelectedDate = dateStr;
  const next = calScrollEl().querySelector(`.cal-day[data-date="${dateStr}"]`);
  if (next) next.classList.add('selected');
}

// Extends the loaded range (one month at a time) until it covers (y, m).
function calEnsureMonthLoaded(y, m) {
  const targetKey = calMonthKey(y, m);
  while (calLoadedMonths.length && targetKey < calMonthKey(calLoadedMonths[0].year, calLoadedMonths[0].month)) {
    const f = calLoadedMonths[0];
    const d = new Date(f.year, f.month - 1, 1);
    const nm = { year: d.getFullYear(), month: d.getMonth() };
    calScrollEl().insertBefore(calBuildMonthEl(nm.year, nm.month), calScrollEl().firstChild);
    calLoadedMonths.unshift(nm);
  }
  while (calLoadedMonths.length && targetKey > calMonthKey(calLoadedMonths[calLoadedMonths.length - 1].year, calLoadedMonths[calLoadedMonths.length - 1].month)) {
    const l = calLoadedMonths[calLoadedMonths.length - 1];
    const d = new Date(l.year, l.month + 1, 1);
    const nm = { year: d.getFullYear(), month: d.getMonth() };
    calScrollEl().appendChild(calBuildMonthEl(nm.year, nm.month));
    calLoadedMonths.push(nm);
  }
}

function calScrollToMonth(y, m) {
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const el = calScrollEl().querySelector(`.cal-month[data-ym="${key}"]`);
  if (el) el.scrollIntoView({ block: 'start' });
}

function calJumpTo(y, m, dateStr) {
  calEnsureMonthLoaded(y, m);
  calSetSelected(dateStr);
  calScrollToMonth(y, m);
}

function calUpdateWorkoutCount() {
  const n = calWorkoutDates.length;
  document.getElementById('cal-workout-count').textContent = `${n} WORKOUT${n === 1 ? '' : 'S'}`;
}

function calFindAdjacentWorkoutDate(dir) {
  if (!calWorkoutDates.length || !calSelectedDate) return null;
  if (dir < 0) {
    for (let i = calWorkoutDates.length - 1; i >= 0; i--) {
      if (calWorkoutDates[i] < calSelectedDate) return calWorkoutDates[i];
    }
  } else {
    for (let i = 0; i < calWorkoutDates.length; i++) {
      if (calWorkoutDates[i] > calSelectedDate) return calWorkoutDates[i];
    }
  }
  return null;
}

function calJumpToWorkoutDate(dir) {
  const target = calFindAdjacentWorkoutDate(dir);
  if (!target) return;
  const d = new Date(target + 'T12:00:00');
  calJumpTo(d.getFullYear(), d.getMonth(), target);
}

function calOnScroll() {
  if (calScrollLock) return;
  const el = calScrollEl();

  if (el.scrollTop < CAL_LOAD_THRESHOLD && calLoadedMonths.length) {
    calScrollLock = true;
    const first = calLoadedMonths[0];
    const newMonths = [];
    for (let i = CAL_BATCH; i >= 1; i--) {
      const d = new Date(first.year, first.month - i, 1);
      newMonths.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    const frag = document.createDocumentFragment();
    newMonths.forEach(mo => frag.appendChild(calBuildMonthEl(mo.year, mo.month)));
    const oldHeight = el.scrollHeight;
    el.insertBefore(frag, el.firstChild);
    el.scrollTop += (el.scrollHeight - oldHeight);
    calLoadedMonths = newMonths.concat(calLoadedMonths);
    calScrollLock = false;
  }

  if (el.scrollHeight - el.scrollTop - el.clientHeight < CAL_LOAD_THRESHOLD && calLoadedMonths.length) {
    calScrollLock = true;
    const last = calLoadedMonths[calLoadedMonths.length - 1];
    const newMonths = [];
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= CAL_BATCH; i++) {
      const d = new Date(last.year, last.month + i, 1);
      const nm = { year: d.getFullYear(), month: d.getMonth() };
      newMonths.push(nm);
      frag.appendChild(calBuildMonthEl(nm.year, nm.month));
    }
    el.appendChild(frag);
    calLoadedMonths = calLoadedMonths.concat(newMonths);
    calScrollLock = false;
  }
}

function openCalendar() {
  calWorkoutDates = Object.keys(db.workouts).filter(d => db.workouts[d] && db.workouts[d].length > 0).sort();

  const scroll = calScrollEl();
  scroll.innerHTML = '';
  calLoadedMonths = [];
  calSelectedDate = null;

  const base = new Date(currentDate + 'T12:00:00');
  const baseY = base.getFullYear(), baseM = base.getMonth();
  const frag = document.createDocumentFragment();
  for (let i = -CAL_BATCH; i <= CAL_BATCH; i++) {
    const d = new Date(baseY, baseM + i, 1);
    const nm = { year: d.getFullYear(), month: d.getMonth() };
    calLoadedMonths.push(nm);
    frag.appendChild(calBuildMonthEl(nm.year, nm.month));
  }
  scroll.appendChild(frag);
  calSetSelected(currentDate);
  calUpdateWorkoutCount();

  showScreen('screen-calendar');
  requestAnimationFrame(() => calScrollToMonth(baseY, baseM));
}

document.getElementById('cal-scroll').addEventListener('scroll', calOnScroll);
document.getElementById('btn-cal-back').addEventListener('click', () => goBack('screen-fitness-tracker'));
document.getElementById('btn-cal-today').addEventListener('click', () => {
  const t = todayStr();
  const d = new Date(t + 'T12:00:00');
  calJumpTo(d.getFullYear(), d.getMonth(), t);
});
document.getElementById('cal-prev-workout').addEventListener('click', () => calJumpToWorkoutDate(-1));
document.getElementById('cal-next-workout').addEventListener('click', () => calJumpToWorkoutDate(1));

// -- Calendar workout detail popup ------------------------
function formatDetailDate(str) {
  const d = new Date(str + 'T12:00:00');
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday}, ${month} ${d.getDate()} ${d.getFullYear()}`;
}

function openWorkoutDetail(dateStr) {
  calDetailDate = dateStr;
  document.getElementById('cal-detail-date').textContent = formatDetailDate(dateStr);

  const body = document.getElementById('cal-detail-body');
  body.innerHTML = '';
  const exercises = (db.workouts[dateStr] || []).filter(ex => (ex.sets || []).length > 0);

  if (exercises.length === 0) {
    body.innerHTML = `<div class="records-empty">There is no workout saved for this day.</div>`;
    openOverlay('cal-detail-overlay');
    return;
  }

  exercises.forEach(ex => {
    const firstPRKeys = getFirstPRComboKeys(ex.name);
    const exEl = document.createElement('div');
    exEl.className = 'cal-detail-ex';

    const nameEl = document.createElement('div');
    nameEl.className = 'cal-detail-ex-name';
    nameEl.textContent = ex.name;
    exEl.appendChild(nameEl);

    ex.sets.forEach((s, i) => {
      const isPR = firstPRKeys.has(dateStr + '#' + i);
      const row = document.createElement('div');
      row.className = 'history-set-row';
      row.innerHTML = `
        ${isPR ? `<svg class="history-set-pr" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>` : `<span class="history-set-spacer"></span>`}
        <span class="history-set-weight">${s.weight} kg</span>
        <span class="history-set-reps">${s.reps} reps</span>
      `;
      exEl.appendChild(row);
    });

    body.appendChild(exEl);
  });

  openOverlay('cal-detail-overlay');
}

document.getElementById('cal-detail-cancel').addEventListener('click', () => closeOverlay('cal-detail-overlay'));
document.getElementById('cal-detail-goto').addEventListener('click', () => {
  closeOverlay('cal-detail-overlay');
  currentDate = calDetailDate;
  goBack('screen-fitness-tracker');
});

let pendingEditExerciseOriginalName = null;

// -- Custom field picker (replaces native <select>/picker for Category/Type/Weight Unit) --
const EX_TYPE_OPTIONS = [
  { value: 'weight_reps', label: 'Weight and Reps' },
  { value: 'reps_only', label: 'Reps Only' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
];
const EX_WEIGHT_UNIT_OPTIONS = [
  { value: 'kg', label: 'Kilogram' },
  { value: 'lbs', label: 'Pounds' },
];

function setFieldBtnValue(id, value, label) {
  const btn = document.getElementById(id);
  btn.dataset.value = value;
  btn.textContent = label;
}
function getFieldBtnValue(id) { return document.getElementById(id).dataset.value || ''; }

let fieldPickerOnSelect = null;
function openFieldPicker(title, options, selectedValue, onSelect) {
  document.getElementById('field-picker-title').textContent = title;
  document.getElementById('field-picker-list').innerHTML = options.map(o => `
    <div class="field-picker-row${o.value === selectedValue ? ' selected' : ''}" data-value="${o.value}">
      <span class="field-picker-radio"><span class="field-picker-radio-dot"></span></span>
      <span class="field-picker-label">${o.label}</span>
    </div>
  `).join('');
  fieldPickerOnSelect = onSelect;
  openOverlay('field-picker-overlay');
}
document.getElementById('field-picker-list').addEventListener('click', e => {
  const row = e.target.closest('.field-picker-row');
  if (!row || !fieldPickerOnSelect) return;
  const cb = fieldPickerOnSelect;
  fieldPickerOnSelect = null;
  closeOverlay('field-picker-overlay');
  cb(row.dataset.value);
});
document.getElementById('new-ex-category').addEventListener('click', () => {
  const categories = [...new Set(allExercises().map(e => e.category))].sort();
  openFieldPicker('Category', categories.map(c => ({ value: c, label: c })), getFieldBtnValue('new-ex-category'), value => {
    setFieldBtnValue('new-ex-category', value, value);
  });
});
document.getElementById('new-ex-type').addEventListener('click', () => {
  openFieldPicker('Type', EX_TYPE_OPTIONS, getFieldBtnValue('new-ex-type'), value => {
    setFieldBtnValue('new-ex-type', value, EX_TYPE_OPTIONS.find(o => o.value === value).label);
  });
});
document.getElementById('new-ex-weight-unit').addEventListener('click', () => {
  openFieldPicker('Weight Unit', EX_WEIGHT_UNIT_OPTIONS, getFieldBtnValue('new-ex-weight-unit'), value => {
    setFieldBtnValue('new-ex-weight-unit', value, EX_WEIGHT_UNIT_OPTIONS.find(o => o.value === value).label);
  });
});

function populateNewExCategorySelect(selected) {
  setFieldBtnValue('new-ex-category', selected || '', selected || 'Choose category...');
}

function openNewExerciseScreen() {
  pendingEditExerciseOriginalName = null;
  document.getElementById('new-ex-title').textContent = 'New Exercise';
  document.getElementById('new-ex-name').value = '';
  setFieldBtnValue('new-ex-type', 'weight_reps', 'Weight and Reps');
  setFieldBtnValue('new-ex-weight-unit', 'kg', 'Kilogram');
  populateNewExCategorySelect();
  showScreen('screen-new-exercise');
  setTimeout(() => document.getElementById('new-ex-name').focus(), 300);
}

function openEditExerciseScreen(ex) {
  pendingEditExerciseOriginalName = ex.name;
  document.getElementById('new-ex-title').textContent = 'Update Exercise';
  document.getElementById('new-ex-name').value = ex.name;
  const typeOpt = EX_TYPE_OPTIONS.find(o => o.value === ex.type) || EX_TYPE_OPTIONS[0];
  setFieldBtnValue('new-ex-type', typeOpt.value, typeOpt.label);
  const wuOpt = ex.weightUnit === 'lbs' ? EX_WEIGHT_UNIT_OPTIONS[1] : EX_WEIGHT_UNIT_OPTIONS[0];
  setFieldBtnValue('new-ex-weight-unit', wuOpt.value, wuOpt.label);
  populateNewExCategorySelect(ex.category);
  showScreen('screen-new-exercise');
}

// Renames/updates an exercise across every place it's referenced by name: the
// custom-exercise definition itself, every logged workout, PR records and
// favorites — name is this app's only stable identifier for an exercise.
// originalName may belong to a built-in (no db.custom_exercises entry yet) —
// in that case editing converts it into a custom override and hides the
// built-in so it doesn't also keep showing up unedited.
function updateExistingExercise(originalName, updated) {
  if (!db.custom_exercises) db.custom_exercises = [];
  let entry = db.custom_exercises.find(e => e.name === originalName);
  if (!entry) {
    entry = { category: updated.category, name: updated.name, type: updated.type, weightUnit: updated.weightUnit };
    db.custom_exercises.push(entry);
    if (!db.hiddenBuiltins) db.hiddenBuiltins = {};
    db.hiddenBuiltins[originalName] = true;
    persistHiddenBuiltins();
  }
  const nameChanged = updated.name !== originalName;
  entry.category = updated.category;
  entry.name = updated.name;
  entry.type = updated.type;
  entry.weightUnit = updated.weightUnit;
  persistCustomExercises();

  if (nameChanged) {
    Object.keys(db.workouts).forEach(date => {
      const workout = db.workouts[date];
      const idx = workout.findIndex(e => e.name === originalName);
      if (idx === -1) return;
      workout[idx] = { ...workout[idx], name: updated.name };
      setWorkout(date, workout);
    });
    if (db.records && db.records[originalName]) {
      db.records[updated.name] = db.records[originalName];
      delete db.records[originalName];
      persistRecords();
    }
    if (db.favoriteExercises && db.favoriteExercises[originalName]) {
      db.favoriteExercises[updated.name] = true;
      delete db.favoriteExercises[originalName];
      persistFavorites();
    }
    if (db.exerciseInfo && db.exerciseInfo[originalName]) {
      db.exerciseInfo[updated.name] = db.exerciseInfo[originalName];
      delete db.exerciseInfo[originalName];
      persistExerciseInfo();
    }
  }
  toast('Exercise updated');
}

function saveNewExerciseFromScreen() {
  const name = document.getElementById('new-ex-name').value.trim();
  const cat = getFieldBtnValue('new-ex-category');
  const type = getFieldBtnValue('new-ex-type');
  const weightUnit = getFieldBtnValue('new-ex-weight-unit');
  if (!name) { toast('Enter a name'); return; }
  if (!cat) { toast('Choose a category'); return; }

  if (pendingEditExerciseOriginalName) {
    const nameTaken = name.toLowerCase() !== pendingEditExerciseOriginalName.toLowerCase()
      && allExercises().find(e => e.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) { toast('Exercise already exists'); return; }
    updateExistingExercise(pendingEditExerciseOriginalName, { category: cat, name, type, weightUnit });
    pendingEditExerciseOriginalName = null;
    exerciseBrowserMode = 'categories';
    currentBrowseCategory = null;
    setExercisesTitle('All Exercises');
    renderCategoryBrowser();
    showScreen('screen-exercises');
    return;
  }

  if (allExercises().find(e => e.name.toLowerCase() === name.toLowerCase())) { toast('Exercise already exists'); return; }
  if (!db.custom_exercises) db.custom_exercises = [];
  db.custom_exercises.push({ category: cat, name, type, weightUnit });
  persistCustomExercises();
  toast('Exercise created');
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  setExercisesTitle('All Exercises');
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

// -- Delete exercise (built-in or custom) ----------------
let pendingDeleteExercise = null;

function openDeleteExerciseConfirm(ex) {
  pendingDeleteExercise = ex;
  const workoutCount = Object.values(db.workouts).filter(exercises => exercises.some(e => e.name === ex.name)).length;
  document.getElementById('delete-ex-msg').innerHTML =
    `Are you sure you want to delete <strong>${ex.name}</strong>? <strong>${workoutCount} workout${workoutCount !== 1 ? 's' : ''}</strong> recorded for this exercise will also be permanently deleted.`;
  document.getElementById('delete-ex-confirm-check').checked = false;
  document.getElementById('btn-delete-ex-confirm').disabled = true;
  openOverlay('delete-exercise-overlay');
}

document.getElementById('delete-ex-confirm-check').addEventListener('change', e => {
  document.getElementById('btn-delete-ex-confirm').disabled = !e.target.checked;
});
document.getElementById('btn-delete-ex-cancel').addEventListener('click', () => {
  pendingDeleteExercise = null;
  closeOverlay('delete-exercise-overlay');
});
document.getElementById('btn-delete-ex-confirm').addEventListener('click', () => {
  if (!pendingDeleteExercise) return;
  const name = pendingDeleteExercise.name;
  if (pendingDeleteExercise.custom) {
    db.custom_exercises = (db.custom_exercises || []).filter(e => e.name !== name);
    persistCustomExercises();
  } else {
    if (!db.hiddenBuiltins) db.hiddenBuiltins = {};
    db.hiddenBuiltins[name] = true;
    persistHiddenBuiltins();
  }
  Object.keys(db.workouts).forEach(date => {
    const workout = db.workouts[date];
    if (!workout.some(e => e.name === name)) return;
    setWorkout(date, workout.filter(e => e.name !== name));
  });
  if (db.records && db.records[name]) { delete db.records[name]; persistRecords(); }
  if (db.favoriteExercises && db.favoriteExercises[name]) { delete db.favoriteExercises[name]; persistFavorites(); }
  if (db.exerciseInfo && db.exerciseInfo[name]) { delete db.exerciseInfo[name]; persistExerciseInfo(); }
  pendingDeleteExercise = null;
  closeOverlay('delete-exercise-overlay');
  refreshExerciseList();
  renderHome();
  toast('Exercise deleted');
});

document.getElementById('btn-new-ex-back').addEventListener('click', () => goBack('screen-exercises'));
document.getElementById('btn-new-ex-save').addEventListener('click', () => saveNewExerciseFromScreen());
document.getElementById('btn-new-ex-add-cat').addEventListener('click', () => {
  document.getElementById('new-category-input').value = '';
  openOverlay('new-category-overlay');
  setTimeout(() => document.getElementById('new-category-input').focus(), 100);
});
document.getElementById('btn-new-category-cancel').addEventListener('click', () => closeOverlay('new-category-overlay'));
document.getElementById('btn-new-category-save').addEventListener('click', () => {
  const newCat = document.getElementById('new-category-input').value.trim();
  if (!newCat) return;
  setFieldBtnValue('new-ex-category', newCat, newCat);
  closeOverlay('new-category-overlay');
});

// -- Overlay helpers ------------------------------------
// Which button-click reproduces each overlay's "Cancel" (no-save close) for
// the back-button handler above. null means "no dedicated button, just close"
// (matches that overlay's existing backdrop-tap behavior). comment-overlay is
// mode-dependent and handled separately in dismissOverlayForBack().
const OVERLAY_CANCEL_BUTTON = {
  'field-picker-overlay': null,
  'new-plan-overlay': 'btn-new-plan-cancel',
  'presets-overlay': 'btn-presets-close',
  'cal-detail-overlay': 'cal-detail-cancel',
  'set-note-overlay': 'btn-set-note-cancel',
  'records-overlay': 'btn-records-close',
  'new-category-overlay': 'btn-new-category-cancel',
  'cat-edit-overlay': 'btn-cat-edit-cancel',
  'delete-exercise-overlay': 'btn-delete-ex-cancel',
  'cat-delete-overlay': 'btn-cat-delete-cancel',
  'reset-overlay': 'btn-reset-cancel',
  'history-goto-overlay': 'history-goto-cancel',
};

function openOverlay(id) {
  document.getElementById(id).classList.add('open');
  pushOverlayHistory(id);
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  popOverlayHistoryIfNeeded(id);
}

// -- Day navigation (arrows + swipe share this) ----------
function navigateDay(delta) {
  exitHomeSelMode();
  changeDate(delta);
  renderHome();
  const content = document.getElementById('home-content');
  content.classList.remove('slide-in-next', 'slide-in-prev');
  void content.offsetWidth;
  content.classList.add(delta > 0 ? 'slide-in-next' : 'slide-in-prev');
}

function setupDaySwipeNav() {
  const container = document.getElementById('home-content');
  const SWIPE_THRESHOLD = 50;
  const DIRECTION_LOCK = 10;
  let startX = 0, startY = 0, tracking = false, direction = null;

  container.addEventListener('touchstart', e => {
    if (homeSelMode || e.touches.length !== 1) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    direction = null;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!direction) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (direction === 'horizontal') e.preventDefault();
  }, { passive: false });

  const endSwipe = e => {
    if (!tracking) return;
    if (direction === 'horizontal') {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) navigateDay(dx < 0 ? 1 : -1);
    }
    tracking = false;
    direction = null;
  };
  container.addEventListener('touchend', endSwipe, { passive: true });
  container.addEventListener('touchcancel', () => { tracking = false; direction = null; }, { passive: true });
}

// -- Event Listeners ------------------------------------
document.getElementById('btn-prev-day').addEventListener('click', () => navigateDay(-1));
document.getElementById('btn-next-day').addEventListener('click', () => navigateDay(1));
document.getElementById('btn-calendar').addEventListener('click', openCalendar);
document.getElementById('btn-add-exercise').addEventListener('click', openExerciseList);
document.getElementById('btn-home-sel-done').addEventListener('click', exitHomeSelMode);
document.getElementById('btn-home-sel-delete').addEventListener('click', deleteHomeSelectedEx);
setupHomeExDragReorder();
setupDaySwipeNav();
setupSetListDragReorder();
setupTrainingSwipeNav();
document.getElementById('btn-back-exercises').addEventListener('click', () => {
  if (exerciseBrowserMode === 'exercises' || exerciseBrowserMode === 'plan-days') {
    exerciseBrowserMode = 'categories';
    currentBrowseCategory = null;
    currentBrowsePlan = null;
    document.getElementById('exercise-search').value = '';
    setExercisesTitle('All Exercises');
    renderCategoryBrowser();
  } else {
    goBack('screen-fitness-tracker');
  }
});

document.getElementById('btn-new-exercise').addEventListener('click', openNewExerciseScreen);
document.getElementById('btn-back-training').addEventListener('click', () => goBack('screen-fitness-tracker'));
document.getElementById('btn-back-new-workout').addEventListener('click', () => goBack('screen-fitness-tracker'));
document.getElementById('btn-nw-manual').addEventListener('click', openExerciseList);
document.getElementById('btn-nw-schema-manual').addEventListener('click', () => {
  // TODO: navigeert later naar een lijst met opgeslagen schema's uit de Workout Plan Builder om handmatig te kiezen — nog niet gebouwd
});
document.getElementById('btn-nw-schema-auto').addEventListener('click', () => {
  // TODO: automatisch schema laden — nog niet gebouwd
});
document.getElementById('btn-save-set').addEventListener('click', saveSet);
document.getElementById('btn-clear').addEventListener('click', () => {
  if (selectedSetIndex !== null) deleteSet(selectedSetIndex);
  else clearFields();
});
document.getElementById('btn-training-pr').addEventListener('click', openExerciseRecords);
document.getElementById('btn-records-close').addEventListener('click', () => closeOverlay('records-overlay'));
document.getElementById('btn-training-info').addEventListener('click', openExerciseInfo);
document.getElementById('btn-exercise-info-edit').addEventListener('click', showExerciseInfoEdit);
document.getElementById('btn-exercise-info-close').addEventListener('click', () => closeOverlay('exercise-info-overlay'));
document.getElementById('btn-exercise-info-cancel').addEventListener('click', renderExerciseInfoView);
document.getElementById('btn-exercise-info-save').addEventListener('click', saveExerciseInfo);
document.getElementById('btn-set-note-cancel').addEventListener('click', () => { noteEditIndex = null; closeOverlay('set-note-overlay'); });
document.getElementById('btn-set-note-save').addEventListener('click', saveSetNote);
document.getElementById('btn-global-ai-coach').addEventListener('click', () => {
  // TODO: link to the Chat Coach screen once it's built
});
document.getElementById('btn-day-recap').addEventListener('click', () => {
  // TODO: recap-functionaliteit volgt later
});
document.getElementById('btn-day-comment').addEventListener('click', openSessionCommentPopup);
document.getElementById('btn-comment-edit').addEventListener('click', () => showCommentEdit(commentPopupCtx.getText()));
document.getElementById('btn-comment-done').addEventListener('click', () => closeOverlay('comment-overlay'));
document.getElementById('btn-comment-cancel').addEventListener('click', () => {
  const text = commentPopupCtx && commentPopupCtx.getText();
  if (text && text.trim()) showCommentView(text);
  else closeOverlay('comment-overlay');
});
document.getElementById('btn-comment-delete').addEventListener('click', () => {
  if (commentPopupCtx) commentPopupCtx.onDelete();
  closeOverlay('comment-overlay');
});
document.getElementById('btn-comment-save').addEventListener('click', () => {
  const val = document.getElementById('comment-edit-input').value.trim();
  if (commentPopupCtx) commentPopupCtx.onSave(val);
  closeOverlay('comment-overlay');
});

document.getElementById('exercise-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (q) {
    renderExerciseSearchResults(q);
    setExercisesTitle('All Exercises');
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory === FAVORITES_CATEGORY) {
    renderFavoriteExercises();
    setExercisesTitle('Favorites');
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory) {
    renderExercisesInCategory(currentBrowseCategory);
    setExercisesTitle(currentBrowseCategory);
  } else {
    exerciseBrowserMode = 'categories';
    renderCategoryBrowser();
  }
});

['cal-detail-overlay', 'field-picker-overlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOverlay(id);
  });
});

// ── Main Menu ─────────────────────────────────────────
function renderMenuUserBar() {
  const bar = document.getElementById('menu-user-bar');
  if (!currentUser) { bar.innerHTML = ''; return; }
  const name = currentUser.displayName || currentUser.email || 'User';
  const photo = currentUser.photoURL;
  bar.innerHTML = photo
    ? `<img src="${photo}" class="menu-user-photo" alt="${name}"/><span class="menu-user-name">${name}</span>`
    : `<span class="menu-user-name">${name}</span>`;
}

function openFitnessTracker() {
  currentDate = todayStr();
  bannerDismissed = false;
  renderSmartBanner();
  renderHome();
  showScreen('screen-fitness-tracker');
}

document.getElementById('menu-card-fitness').addEventListener('click', openFitnessTracker);
document.getElementById('menu-card-workout').addEventListener('click', openWorkoutPlan);
document.getElementById('menu-card-nutrition').addEventListener('click', () => showScreen('screen-nutrition'));
document.getElementById('menu-card-progress').addEventListener('click', () => showScreen('screen-progress'));

document.getElementById('btn-home-from-tracker').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-workout-plan').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-nutrition').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-progress').addEventListener('click', () => goBack('screen-home'));

// ── Anthropic API helper ──────────────────────────────
async function callClaude(userMessage, systemPrompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API error ' + resp.status);
  }
  const data = await resp.json();
  return data.content[0].text;
}

// ── Plan Firestore helpers ────────────────────────────
function plansCol() { return fStore.collection('users/' + currentUser.uid + '/plans'); }
function activePlanDoc() { return fStore.doc('users/' + currentUser.uid + '/meta/activeplan'); }

async function persistPlan(planId, planData) {
  if (!currentUser) return;
  await plansCol().doc(planId).set(planData);
}
async function deletePlanDoc(planId) {
  if (!currentUser) return;
  await plansCol().doc(planId).delete();
}
async function persistActivePlan(data) {
  if (!currentUser) return;
  if (!data) { await activePlanDoc().delete().catch(() => {}); return; }
  await activePlanDoc().set(data);
}

// ── Plan CRUD ─────────────────────────────────────────
function genPlanId() { return 'plan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

async function createPlan(name, days) {
  const planId = genPlanId();
  const planData = { id: planId, name, days, createdAt: Date.now() };
  db.plans[planId] = planData;
  await persistPlan(planId, planData);
  return planId;
}

async function duplicatePlan(planId) {
  const src = db.plans[planId];
  if (!src) return;
  const newId = genPlanId();
  const copy = { id: newId, name: 'Copy of ' + src.name, days: JSON.parse(JSON.stringify(src.days || [])), createdAt: Date.now() };
  db.plans[newId] = copy;
  await persistPlan(newId, copy);
  renderPlanList();
  toast('Plan duplicated');
}

async function deletePlan(planId) {
  delete db.plans[planId];
  await deletePlanDoc(planId);
  if (db.activePlan && db.activePlan.planId === planId) {
    db.activePlan = null;
    await persistActivePlan(null);
  }
  renderPlanList();
  toast('Plan deleted');
}

async function setActivePlan(planId) {
  const plan = db.plans[planId];
  if (!plan) return;
  const wasActive = db.activePlan && db.activePlan.planId === planId;
  if (wasActive) {
    db.activePlan = null;
    await persistActivePlan(null);
    toast('Active plan removed');
  } else {
    db.activePlan = { planId, planName: plan.name, lastDayIndex: -1 };
    await persistActivePlan(db.activePlan);
    bannerDismissed = false;
    toast('Set as active plan');
  }
}

// ── Plan List Screen ──────────────────────────────────
function openWorkoutPlan() {
  renderPlanList();
  showScreen('screen-workout-plan');
}

function renderPlanList() {
  const scroll = document.getElementById('plan-list-scroll');
  const plans = Object.values(db.plans).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (plans.length === 0) {
    scroll.innerHTML = '<div class="plan-list-empty">No plans yet. Create one above!</div>';
    return;
  }
  scroll.innerHTML = '';
  plans.forEach(plan => {
    const isActive = db.activePlan && db.activePlan.planId === plan.id;
    const item = document.createElement('div');
    item.className = 'plan-item';
    item.innerHTML = `
      <div class="plan-item-info">
        <div class="plan-item-name">${plan.name}</div>
        <div class="plan-item-meta">${(plan.days || []).length} day${(plan.days || []).length !== 1 ? 's' : ''}</div>
        ${isActive ? '<div class="plan-item-active-pill">★ ACTIVE</div>' : ''}
      </div>
      <button class="plan-item-dots" aria-label="Options"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
    `;
    item.querySelector('.plan-item-info').addEventListener('click', () => openPlanDetail(plan.id));
    item.querySelector('.plan-item-dots').addEventListener('click', e => {
      e.stopPropagation();
      const isAct = db.activePlan && db.activePlan.planId === plan.id;
      showOverflowMenu([
        { label: isAct ? '★ Remove active' : 'Set as Active', action: async () => { await setActivePlan(plan.id); renderPlanList(); } },
        { label: 'Duplicate', action: () => duplicatePlan(plan.id) },
        { label: 'Delete', action: () => { if (confirm('Delete "' + plan.name + '"?')) deletePlan(plan.id); } },
      ], e.currentTarget);
    });
    scroll.appendChild(item);
  });
}

// ── Plan Detail Screen ────────────────────────────────
function openPlanDetail(planId) {
  currentPlanId = planId;
  currentPlanData = db.plans[planId];
  if (!currentPlanData) return;
  document.getElementById('plan-detail-title').textContent = currentPlanData.name;
  const isActive = db.activePlan && db.activePlan.planId === planId;
  const ribbon = document.getElementById('plan-active-ribbon');
  ribbon.classList.toggle('show', isActive);
  const starBtn = document.getElementById('btn-plan-set-active');
  starBtn.classList.toggle('is-active', isActive);
  renderPlanDetail();
  showScreen('screen-plan-detail');
}

function renderPlanDetail() {
  const scroll = document.getElementById('plan-detail-scroll');
  if (!currentPlanData || !currentPlanData.days) { scroll.innerHTML = ''; return; }
  scroll.innerHTML = '';
  currentPlanData.days.forEach((day, idx) => {
    const card = document.createElement('div');
    card.className = 'plan-day-card';
    const exRows = (day.exercises || []).map(ex =>
      `<div class="plan-day-ex-row"><span class="plan-day-ex-name">${ex.name}</span><span class="plan-day-ex-sets">${ex.sets}×${ex.reps}</span></div>`
    ).join('');
    card.innerHTML = `
      <div class="plan-day-header">
        <div class="plan-day-num">${idx + 1}</div>
        <div class="plan-day-name">${day.name}</div>
        <button class="plan-day-load-btn" data-idx="${idx}">Load ▶</button>
      </div>
      <div class="plan-day-exercises">${exRows || '<div style="color:#444;font-size:13px;padding:0 0 4px">No exercises</div>'}</div>
    `;
    card.querySelector('.plan-day-load-btn').addEventListener('click', () => {
      loadWorkoutReturnScreen = 'screen-plan-detail';
      openLoadWorkout(currentPlanId, idx);
    });
    card.querySelector('.plan-day-header').addEventListener('click', e => {
      if (e.target.closest('.plan-day-load-btn')) return;
      openPlanDayEdit(idx);
    });
    scroll.appendChild(card);
  });
}

// ── Plan Day Edit Screen ──────────────────────────────
function openPlanDayEdit(dayIdx) {
  currentEditDayIndex = dayIdx;
  const day = currentPlanData.days[dayIdx];
  document.getElementById('plan-day-edit-title').textContent = day.name;
  renderPlanDayEdit();
  showScreen('screen-plan-day-edit');
}

function renderPlanDayEdit() {
  const list = document.getElementById('pde-list');
  const day = currentPlanData.days[currentEditDayIndex];
  const exercises = day.exercises || [];
  list.innerHTML = '';

  if (exercises.length === 0) {
    list.innerHTML = '<div class="pde-empty">No exercises. Load a workout to add exercises to this day.</div>';
    return;
  }

  exercises.forEach((ex, idx) => {
    const item = document.createElement('div');
    item.className = 'pde-item';
    item.dataset.exIdx = idx;
    item.innerHTML = `
      <div class="pde-delete-reveal"><button class="pde-delete-btn">DELETE</button></div>
      <div class="pde-item-inner">
        <div class="pde-ex-info">
          <span class="pde-ex-name">${ex.name}</span>
          <span class="pde-ex-meta">${ex.sets} sets × ${ex.reps} reps</span>
        </div>
        <div class="pde-drag-handle" aria-label="Drag to reorder">
          <svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
        </div>
      </div>
    `;
    setupPdeSwipeDelete(item);
    list.appendChild(item);
  });

  setupPdeDragReorder(list);
}

async function savePlanDayExercises(newExercises) {
  currentPlanData.days[currentEditDayIndex].exercises = newExercises;
  db.plans[currentPlanId] = currentPlanData;
  await persistPlan(currentPlanId, currentPlanData);
}

function setupPdeDragReorder(list) {
  list.addEventListener('touchstart', e => {
    if (!e.target.closest('.pde-drag-handle')) return;
    if (pdeActiveSwipeInner) {
      pdeActiveSwipeInner.style.transform = '';
      if (pdeActiveSwipeReveal) pdeActiveSwipeReveal.style.width = '0';
      pdeActiveSwipeInner = null;
      pdeActiveSwipeReveal = null;
    }
    pdeDragItem = e.target.closest('.pde-item');
    if (!pdeDragItem) return;
    pdeDragStartY = e.touches[0].clientY;
    pdeDragDy = 0;
    pdeDragItem.classList.add('pde-dragging');
  }, { passive: true });

  list.addEventListener('touchmove', e => {
    if (!pdeDragItem) return;
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    pdeDragDy = touchY - pdeDragStartY;
    pdeDragItem.querySelector('.pde-item-inner').style.transform = `translateY(${pdeDragDy}px)`;

    const items = [...list.querySelectorAll('.pde-item')];
    const dragPos = items.indexOf(pdeDragItem);

    for (let i = 0; i < items.length; i++) {
      if (items[i] === pdeDragItem) continue;
      const sibRect = items[i].getBoundingClientRect();
      const sibCenter = sibRect.top + sibRect.height / 2;
      if (dragPos < i && touchY > sibCenter) {
        items[i].insertAdjacentElement('afterend', pdeDragItem);
        pdeDragStartY += sibRect.height;
        pdeDragDy -= sibRect.height;
        pdeDragItem.querySelector('.pde-item-inner').style.transform = `translateY(${pdeDragDy}px)`;
        break;
      } else if (dragPos > i && touchY < sibCenter) {
        items[i].insertAdjacentElement('beforebegin', pdeDragItem);
        pdeDragStartY -= sibRect.height;
        pdeDragDy += sibRect.height;
        pdeDragItem.querySelector('.pde-item-inner').style.transform = `translateY(${pdeDragDy}px)`;
        break;
      }
    }
  }, { passive: false });

  const endDrag = async () => {
    if (!pdeDragItem) return;
    pdeDragItem.classList.remove('pde-dragging');
    pdeDragItem.querySelector('.pde-item-inner').style.transform = '';

    const day = currentPlanData.days[currentEditDayIndex];
    const oldExercises = day.exercises || [];
    const newItems = [...list.querySelectorAll('.pde-item')];
    const newExercises = newItems.map(el => oldExercises[parseInt(el.dataset.exIdx)]).filter(Boolean);

    if (JSON.stringify(newExercises.map(e => e.name)) !== JSON.stringify(oldExercises.map(e => e.name))) {
      await savePlanDayExercises(newExercises);
      newItems.forEach((el, i) => { el.dataset.exIdx = i; });
      toast('Order saved');
    }
    pdeDragItem = null;
  };

  list.addEventListener('touchend', endDrag, { passive: true });
  list.addEventListener('touchcancel', endDrag, { passive: true });
}

function setupPdeSwipeDelete(item) {
  const inner = item.querySelector('.pde-item-inner');
  const reveal = item.querySelector('.pde-delete-reveal');
  const deleteBtn = item.querySelector('.pde-delete-btn');
  let touchStartX = 0;
  let touchStartY = 0;
  let mode = null;
  let baseX = 0;
  let isOpen = false;

  inner.addEventListener('touchstart', e => {
    if (e.target.closest('.pde-drag-handle') || pdeDragItem) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    baseX = isOpen ? -80 : 0;
    mode = null;
    if (pdeActiveSwipeInner && pdeActiveSwipeInner !== inner) {
      pdeActiveSwipeInner.style.transition = 'transform 0.15s';
      pdeActiveSwipeInner.style.transform = '';
      if (pdeActiveSwipeReveal) { pdeActiveSwipeReveal.style.transition = 'width 0.15s'; pdeActiveSwipeReveal.style.width = '0'; }
      setTimeout(() => { if (pdeActiveSwipeInner) { pdeActiveSwipeInner.style.transition = ''; } if (pdeActiveSwipeReveal) pdeActiveSwipeReveal.style.transition = ''; }, 160);
      pdeActiveSwipeInner = null;
      pdeActiveSwipeReveal = null;
    }
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    if (e.target.closest('.pde-drag-handle') || pdeDragItem) return;
    if (mode === 'scroll') return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (mode === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
    }
    if (mode === 'swipe') {
      e.preventDefault();
      const target = Math.max(-80, Math.min(0, baseX + dx));
      inner.style.transform = `translateX(${target}px)`;
      reveal.style.width = `${Math.abs(target)}px`;
      pdeActiveSwipeInner = inner;
      pdeActiveSwipeReveal = reveal;
    }
  }, { passive: false });

  inner.addEventListener('touchend', e => {
    if (mode !== 'swipe') return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const finalX = baseX + dx;
    inner.style.transition = 'transform 0.15s';
    reveal.style.transition = 'width 0.15s';
    if (finalX < -40) {
      inner.style.transform = 'translateX(-80px)';
      reveal.style.width = '80px';
      isOpen = true;
    } else {
      inner.style.transform = '';
      reveal.style.width = '0';
      isOpen = false;
      pdeActiveSwipeInner = null;
      pdeActiveSwipeReveal = null;
    }
    setTimeout(() => { inner.style.transition = ''; reveal.style.transition = ''; }, 160);
    mode = null;
  }, { passive: true });

  deleteBtn.addEventListener('click', async () => {
    pdeActiveSwipeInner = null;
    pdeActiveSwipeReveal = null;
    const allItems = [...document.querySelectorAll('#pde-list .pde-item')];
    const currentPos = allItems.indexOf(item);
    item.style.transition = 'height 0.2s ease, opacity 0.2s ease, margin-bottom 0.2s ease';
    item.style.overflow = 'hidden';
    item.style.height = item.offsetHeight + 'px';
    requestAnimationFrame(() => { item.style.height = '0'; item.style.opacity = '0'; item.style.marginBottom = '0'; });
    await new Promise(r => setTimeout(r, 220));
    const day = currentPlanData.days[currentEditDayIndex];
    const exercises = [...(day.exercises || [])];
    if (currentPos >= 0 && currentPos < exercises.length) exercises.splice(currentPos, 1);
    await savePlanDayExercises(exercises);
    renderPlanDayEdit();
    toast('Exercise removed');
  });
}

document.getElementById('btn-back-plan-day-edit').addEventListener('click', () => goBack('screen-plan-detail'));

// ── Plan Set Active / Overflow ────────────────────────
document.getElementById('btn-plan-set-active').addEventListener('click', async () => {
  if (!currentPlanId) return;
  await setActivePlan(currentPlanId);
  const isActive = db.activePlan && db.activePlan.planId === currentPlanId;
  document.getElementById('plan-active-ribbon').classList.toggle('show', isActive);
  document.getElementById('btn-plan-set-active').classList.toggle('is-active', isActive);
});

document.getElementById('btn-overflow-plan-detail').addEventListener('click', e => {
  showOverflowMenu([
    { label: 'Duplicate', action: () => duplicatePlan(currentPlanId) },
    { label: 'Delete', action: () => {
      if (!currentPlanData) return;
      if (confirm('Delete "' + currentPlanData.name + '"?')) {
        deletePlan(currentPlanId).then(() => showScreen('screen-workout-plan'));
      }
    }},
  ], e.currentTarget);
});

document.getElementById('btn-back-plan-detail').addEventListener('click', () => goBack('screen-workout-plan'));

// ── AI Generate Screen ────────────────────────────────
function openAIGenerate() {
  document.getElementById('ai-gen-form').classList.remove('hidden');
  document.getElementById('ai-gen-loading').classList.add('hidden');
  document.getElementById('ai-gen-pref').value = '';
  showScreen('screen-ai-generate');
}

document.getElementById('btn-back-ai-generate').addEventListener('click', () => goBack('screen-workout-plan'));

document.getElementById('btn-ai-generate-submit').addEventListener('click', async () => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('YOUR_KEY')) {
    toast('Add your Anthropic API key in app.js');
    return;
  }
  const goal = document.querySelector('#chips-goal .chip.active')?.dataset.val || 'Muscle Growth';
  const level = document.querySelector('#chips-level .chip.active')?.dataset.val || 'Intermediate';
  const days = document.querySelector('#chips-days .chip.active')?.dataset.val || '4';
  const pref = document.getElementById('ai-gen-pref').value.trim();

  document.getElementById('ai-gen-form').classList.add('hidden');
  document.getElementById('ai-gen-loading').classList.remove('hidden');

  const systemPrompt = `You are a professional fitness coach. Generate a workout plan based on the user's input. Respond ONLY with a valid JSON object, no markdown, no explanation. Format:
{
  "name": "string",
  "days": [
    {
      "name": "string",
      "exercises": [
        { "name": "string", "sets": 3, "reps": 10 }
      ]
    }
  ]
}`;

  const userMsg = `Goal: ${goal}\nLevel: ${level}\nDays per week: ${days}${pref ? '\nPreference: ' + pref : ''}`;

  try {
    const raw = await callClaude(userMsg, systemPrompt);
    const plan = JSON.parse(raw);
    if (!plan.name || !Array.isArray(plan.days)) throw new Error('Invalid format');
    const planId = await createPlan(plan.name, plan.days);
    openPlanDetail(planId);
    toast('Plan generated!');
  } catch(e) {
    console.error('AI gen error', e);
    document.getElementById('ai-gen-form').classList.remove('hidden');
    document.getElementById('ai-gen-loading').classList.add('hidden');
    toast('Generation failed: ' + (e.message || 'try again'));
  }
});

// Chip group click delegation
document.querySelectorAll('.chip-group').forEach(group => {
  group.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ── Presets ───────────────────────────────────────────
const PLAN_PRESETS = [
  { name: 'Push / Pull / Legs', days: [
    { name: 'Push', exercises: [{ name:'Bench Press', sets:4, reps:8 }, { name:'Overhead Press', sets:3, reps:10 }, { name:'Incline Dumbbell Press', sets:3, reps:12 }, { name:'Tricep Dips', sets:3, reps:12 }] },
    { name: 'Pull', exercises: [{ name:'Deadlift', sets:4, reps:5 }, { name:'Pull-Ups', sets:4, reps:8 }, { name:'Barbell Row', sets:3, reps:10 }, { name:'Bicep Curl', sets:3, reps:12 }] },
    { name: 'Legs', exercises: [{ name:'Squat', sets:4, reps:8 }, { name:'Romanian Deadlift', sets:3, reps:10 }, { name:'Leg Press', sets:3, reps:12 }, { name:'Calf Raise', sets:4, reps:15 }] },
  ]},
  { name: 'Upper / Lower (4-day)', days: [
    { name: 'Upper A', exercises: [{ name:'Bench Press', sets:4, reps:6 }, { name:'Barbell Row', sets:4, reps:6 }, { name:'Overhead Press', sets:3, reps:8 }, { name:'Pull-Ups', sets:3, reps:8 }] },
    { name: 'Lower A', exercises: [{ name:'Squat', sets:4, reps:6 }, { name:'Romanian Deadlift', sets:3, reps:8 }, { name:'Leg Press', sets:3, reps:10 }, { name:'Leg Curl', sets:3, reps:12 }] },
    { name: 'Upper B', exercises: [{ name:'Incline Bench Press', sets:4, reps:8 }, { name:'Cable Row', sets:4, reps:10 }, { name:'Dumbbell Shoulder Press', sets:3, reps:10 }, { name:'Bicep Curl', sets:3, reps:12 }] },
    { name: 'Lower B', exercises: [{ name:'Deadlift', sets:4, reps:5 }, { name:'Hack Squat', sets:3, reps:10 }, { name:'Walking Lunge', sets:3, reps:12 }, { name:'Calf Raise', sets:4, reps:15 }] },
  ]},
  { name: 'Full Body (3-day)', days: [
    { name: 'Day A', exercises: [{ name:'Squat', sets:3, reps:8 }, { name:'Bench Press', sets:3, reps:8 }, { name:'Barbell Row', sets:3, reps:8 }, { name:'Overhead Press', sets:3, reps:8 }] },
    { name: 'Day B', exercises: [{ name:'Deadlift', sets:3, reps:5 }, { name:'Incline Bench Press', sets:3, reps:10 }, { name:'Pull-Ups', sets:3, reps:8 }, { name:'Bicep Curl', sets:3, reps:12 }] },
    { name: 'Day C', exercises: [{ name:'Front Squat', sets:3, reps:8 }, { name:'Dips', sets:3, reps:10 }, { name:'Chin-Ups', sets:3, reps:8 }, { name:'Lateral Raise', sets:3, reps:15 }] },
  ]},
  { name: 'Bro Split (5-day)', days: [
    { name: 'Chest', exercises: [{ name:'Bench Press', sets:4, reps:8 }, { name:'Incline Dumbbell Press', sets:3, reps:10 }, { name:'Cable Fly', sets:3, reps:12 }, { name:'Dips', sets:3, reps:12 }] },
    { name: 'Back', exercises: [{ name:'Deadlift', sets:4, reps:5 }, { name:'Pull-Ups', sets:4, reps:8 }, { name:'Barbell Row', sets:3, reps:10 }, { name:'Cable Row', sets:3, reps:12 }] },
    { name: 'Shoulders', exercises: [{ name:'Overhead Press', sets:4, reps:8 }, { name:'Lateral Raise', sets:4, reps:15 }, { name:'Front Raise', sets:3, reps:12 }, { name:'Shrugs', sets:3, reps:12 }] },
    { name: 'Arms', exercises: [{ name:'Barbell Curl', sets:4, reps:10 }, { name:'Hammer Curl', sets:3, reps:12 }, { name:'Skull Crushers', sets:4, reps:10 }, { name:'Tricep Pushdown', sets:3, reps:12 }] },
    { name: 'Legs', exercises: [{ name:'Squat', sets:4, reps:8 }, { name:'Romanian Deadlift', sets:3, reps:10 }, { name:'Leg Press', sets:3, reps:12 }, { name:'Calf Raise', sets:5, reps:15 }] },
  ]},
];

function openPresetsOverlay() {
  const list = document.getElementById('presets-list');
  list.innerHTML = '';
  PLAN_PRESETS.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <div class="preset-item-body">
        <div class="preset-item-name">${preset.name}</div>
        <div class="preset-item-meta">${preset.days.length} days</div>
      </div>
      <span class="preset-item-arrow">›</span>
    `;
    item.addEventListener('click', async () => {
      closeOverlay('presets-overlay');
      const planId = await createPlan(preset.name, JSON.parse(JSON.stringify(preset.days)));
      openPlanDetail(planId);
      toast('Preset added!');
    });
    list.appendChild(item);
  });
  openOverlay('presets-overlay');
}

// ── Make your own ─────────────────────────────────────
function openMakeYourOwn() {
  document.getElementById('new-plan-name').value = '';
  document.querySelectorAll('#chips-new-plan-days .chip').forEach(c => c.classList.remove('active'));
  document.querySelector('#chips-new-plan-days [data-val="3"]').classList.add('active');
  openOverlay('new-plan-overlay');
}

document.getElementById('btn-plan-make-own').addEventListener('click', openMakeYourOwn);
document.getElementById('btn-plan-presets').addEventListener('click', openPresetsOverlay);
document.getElementById('btn-plan-ai').addEventListener('click', openAIGenerate);
document.getElementById('btn-new-plan-cancel').addEventListener('click', () => closeOverlay('new-plan-overlay'));
document.getElementById('btn-presets-close').addEventListener('click', () => closeOverlay('presets-overlay'));

document.getElementById('btn-new-plan-save').addEventListener('click', async () => {
  const name = document.getElementById('new-plan-name').value.trim();
  if (!name) { toast('Enter a plan name'); return; }
  const daysCount = parseInt(document.querySelector('#chips-new-plan-days .chip.active')?.dataset.val || '3');
  const planDays = Array.from({ length: daysCount }, (_, i) => ({ name: 'Day ' + (i + 1), exercises: [] }));
  closeOverlay('new-plan-overlay');
  const planId = await createPlan(name, planDays);
  openPlanDetail(planId);
});

// ── Load Workout Screen ───────────────────────────────
function getLastSetForExercise(exName) {
  const dates = Object.keys(db.workouts).sort().reverse();
  for (const date of dates) {
    const ex = db.workouts[date]?.find(e => e.name === exName);
    if (ex && ex.sets && ex.sets.length > 0) {
      const s = ex.sets[ex.sets.length - 1];
      return { weight: s.weight, reps: s.reps, date };
    }
  }
  return null;
}

async function openLoadWorkout(planId, dayIndex) {
  currentLoadPlanId = planId;
  currentLoadDayIndex = dayIndex;
  const plan = db.plans[planId];
  if (!plan || !plan.days[dayIndex]) { toast('Could not load day'); return; }
  const day = plan.days[dayIndex];

  document.getElementById('load-workout-title').textContent = 'Load: ' + day.name;
  document.getElementById('lw-scroll').innerHTML = '<div style="padding:32px;text-align:center;color:#555">Loading...</div>';
  showScreen('screen-load-workout');

  loadWorkoutItems = (day.exercises || []).map(ex => {
    const prev = getLastSetForExercise(ex.name);
    return { name: ex.name, sets: ex.sets, reps: ex.reps, prevWeight: prev?.weight ?? null, prevReps: prev?.reps ?? null, selected: true, suggestion: '' };
  });

  renderLoadWorkoutList();

  if (ANTHROPIC_API_KEY && !ANTHROPIC_API_KEY.includes('YOUR_KEY') && loadWorkoutItems.some(i => i.prevWeight !== null)) {
    fetchProgressionSuggestions();
  }
}

function renderLoadWorkoutList() {
  const scroll = document.getElementById('lw-scroll');
  scroll.innerHTML = '';

  const allChecked = loadWorkoutItems.every(i => i.selected);
  const saRow = document.createElement('div');
  saRow.className = 'lw-select-all-row';
  saRow.innerHTML = `<div class="lw-checkbox ${allChecked ? 'checked' : ''}" id="lw-cb-all"></div><span>Select All</span>`;
  saRow.addEventListener('click', () => {
    const next = !loadWorkoutItems.every(i => i.selected);
    loadWorkoutItems.forEach(i => i.selected = next);
    renderLoadWorkoutList();
  });
  scroll.appendChild(saRow);

  loadWorkoutItems.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'lw-ex-card';
    const prevTxt = item.prevWeight !== null ? `Last: ${item.prevWeight}kg × ${item.prevReps} reps` : 'No previous data';
    const suggHtml = item.suggestion ? `<div class="lw-suggestion">🤖 ${item.suggestion}</div>` : '';
    card.innerHTML = `
      <div class="lw-ex-header">
        <div class="lw-checkbox ${item.selected ? 'checked' : ''}" data-idx="${idx}"></div>
        <div class="lw-ex-name">${item.name}</div>
        <div class="lw-ex-sets">${item.sets}×${item.reps}</div>
      </div>
      <div class="lw-prev">${prevTxt}</div>
      ${suggHtml}
    `;
    card.querySelector('[data-idx]').addEventListener('click', e => {
      e.stopPropagation();
      loadWorkoutItems[idx].selected = !loadWorkoutItems[idx].selected;
      renderLoadWorkoutList();
    });
    scroll.appendChild(card);
  });
}

async function fetchProgressionSuggestions() {
  const withPrev = loadWorkoutItems.filter(i => i.prevWeight !== null);
  if (withPrev.length === 0) return;
  const systemPrompt = `You are a fitness coach. Based on previous performance, suggest weight progression. Be brief, max 1 sentence per exercise. Respond ONLY in JSON: { "suggestions": [ { "exercise": "string", "suggestion": "string" } ] }`;
  const userMsg = withPrev.map(i => `${i.name}: last ${i.prevWeight}kg × ${i.prevReps} reps (plan: ${i.sets}×${i.reps})`).join('\n');
  try {
    const raw = await callClaude(userMsg, systemPrompt);
    const data = JSON.parse(raw);
    if (Array.isArray(data.suggestions)) {
      data.suggestions.forEach(s => {
        const item = loadWorkoutItems.find(i => i.name === s.exercise);
        if (item) item.suggestion = s.suggestion;
      });
      renderLoadWorkoutList();
    }
  } catch(e) { console.warn('Progression suggestions failed', e); }
}

document.getElementById('btn-confirm-load-workout').addEventListener('click', async () => {
  const selected = loadWorkoutItems.filter(i => i.selected);
  if (selected.length === 0) { toast('Select at least one exercise'); return; }
  const workout = getWorkout(currentDate);
  selected.forEach(item => {
    if (!workout.find(e => e.name === item.name)) workout.push({ name: item.name, sets: [] });
  });
  setWorkout(currentDate, workout);
  // Advance active plan day index
  if (db.activePlan && currentLoadPlanId === db.activePlan.planId && currentLoadDayIndex !== null) {
    db.activePlan.lastDayIndex = currentLoadDayIndex;
    await persistActivePlan(db.activePlan);
  }
  bannerDismissed = true;
  renderHome();
  toast('Workout loaded!');
  showScreen('screen-fitness-tracker');
});

document.getElementById('btn-back-load-workout').addEventListener('click', () => goBack(loadWorkoutReturnScreen));

// ── Smart Day Banner ──────────────────────────────────
function renderSmartBanner() {
  const banner = document.getElementById('smart-day-banner');
  if (!banner) return;
  if (bannerDismissed || !db.activePlan) { banner.classList.add('hidden'); return; }
  const plan = db.plans[db.activePlan.planId];
  if (!plan || !plan.days || plan.days.length === 0) { banner.classList.add('hidden'); return; }
  const lastIdx = db.activePlan.lastDayIndex ?? -1;
  const nextIdx = (lastIdx + 1) % plan.days.length;
  bannerSuggestedDayIndex = nextIdx;
  const dayName = plan.days[nextIdx].name || ('Day ' + (nextIdx + 1));
  document.getElementById('smart-banner-msg').textContent = `Based on your plan, today is ${dayName}. Load it?`;
  banner.classList.remove('hidden');
}

document.getElementById('btn-banner-skip').addEventListener('click', () => {
  bannerDismissed = true;
  document.getElementById('smart-day-banner').classList.add('hidden');
});

document.getElementById('btn-banner-load').addEventListener('click', () => {
  document.getElementById('smart-day-banner').classList.add('hidden');
  if (db.activePlan && bannerSuggestedDayIndex !== null) {
    loadWorkoutReturnScreen = 'screen-fitness-tracker';
    openLoadWorkout(db.activePlan.planId, bannerSuggestedDayIndex);
  }
});

// Add new overlays to backdrop-close listener
['new-plan-overlay', 'presets-overlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOverlay(id);
  });
});

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
let db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {}, exerciseInfo: {}, plateInventory: {}, plateOnBar: {} };

// -- Home selection mode state --------------------------
let homeSelMode = false;
let homeSelCards = new Set();
let homeExDragItem = null;
let homeExDragStartY = 0;
let homeExDragDy = 0;

// -- Exercise browser extended state -------------------
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

// Shared PR-trophy icon markup, reused everywhere a personal record is shown
// (home cards, set list, records overlay, history tab, calendar detail) —
// `className` is optional since some call sites render it without one.
function prTrophySvg(className) {
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V17H7v2h10v-2h-4v-1.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>`;
}

// Shared comment/note speech-bubble icon markup (set-row and exercise-card comment indicators).
const COMMENT_ICON_SVG = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

// Shared date-formatting helper — `format` selects which display variant to
// produce for a given YYYY-MM-DD `str`:
//   'long'   — day-nav label: "TODAY"/"YESTERDAY", else e.g. "SATURDAY, 20 SEPTEMBER"
//   'short'  — history/calendar-goto labels, e.g. "20 SEP 2026"
//   'detail' — calendar workout-detail popup title, e.g. "Saturday, Sep 20 2026" (not uppercased)
function formatDateStr(str, format) {
  const d = new Date(str + 'T12:00:00');
  if (format === 'long') {
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (str === today) return 'TODAY';
    if (str === yesterday) return 'YESTERDAY';
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  }
  if (format === 'short') {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  }
  if (format === 'detail') {
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    return `${weekday}, ${month} ${d.getDate()} ${d.getFullYear()}`;
  }
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
// Full-width banner under the header (see .toast in style.css). Optional 2nd
// argument: { type: 'success' | 'error' | 'pr', duration } picks the colour
// variant; no type = success, so every plain toast('text') call gets the
// success style. Errors stay longer. Only one timer runs at a time: a new
// toast cancels the previous one's hide timer, otherwise it would cut the new
// message short.
let toastTimer = null;
function toast(msg, { type = 'success', duration } = {}) {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.classList.toggle('toast-error', type === 'error');
  el.classList.toggle('toast-pr', type === 'pr');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration || (type === 'error' ? 4000 : 2000));
}
// Shared .catch() for every Firestore write: the UI has already updated
// optimistically, so a failed write must not stay silent.
function persistFailed(e) {
  console.error(e);
  toast('Couldn\u2019t save \u2014 check your connection', { type: 'error' });
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
    uDoc('workouts/' + date).delete().catch(persistFailed);
  } else {
    uDoc('workouts/' + date).set({ exercises }, { merge: true }).catch(persistFailed);
  }
}
function getSessionNote(date) { return (db.sessionNotes || {})[date] || ''; }
function saveSessionNote(date, note) {
  if (!db.sessionNotes) db.sessionNotes = {};
  const trimmed = (note || '').trim();
  if (trimmed) db.sessionNotes[date] = trimmed;
  else delete db.sessionNotes[date];
  if (!currentUser) return;
  uDoc('workouts/' + date).set({ sessionNote: trimmed }, { merge: true }).catch(persistFailed);
}
async function persistRecords() {
  if (!currentUser) return;
  uDoc('meta/records').set({ data: db.records }).catch(persistFailed);
}
async function persistCustomExercises() {
  if (!currentUser) return;
  uDoc('meta/custom_exercises').set({ list: db.custom_exercises || [] }).catch(persistFailed);
}
async function persistFavorites() {
  if (!currentUser) return;
  uDoc('meta/favorites').set({ names: Object.keys(db.favoriteExercises || {}) }).catch(persistFailed);
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
  uDoc('meta/hidden_builtins').set({ names: Object.keys(db.hiddenBuiltins || {}) }).catch(persistFailed);
}
async function persistExerciseInfo() {
  if (!currentUser) return;
  uDoc('meta/exercise_info').set({ data: db.exerciseInfo || {} }).catch(persistFailed);
}
function getExerciseInfo(name) { return (db.exerciseInfo || {})[name] || null; }
async function persistPlateInventory() {
  if (!currentUser) return;
  uDoc('meta/plate_inventory').set({ counts: db.plateInventory || {} }).catch(persistFailed);
}
async function persistPlateOnBar() {
  if (!currentUser) return;
  uDoc('meta/plate_on_bar').set({ counts: db.plateOnBar || {} }).catch(persistFailed);
}
async function loadUserData(userUid) {
  console.log('[Load] loadUserData start, uid:', userUid);
  try {
    console.log('[Load] firing Promise.all for 10 Firestore reads...');
    const [workoutsSnap, recordsSnap, customSnap, plansSnap, activePlanSnap, favoritesSnap, hiddenBuiltinsSnap, exerciseInfoSnap, plateInventorySnap, plateOnBarSnap] = await Promise.all([
      fStore.collection('users/' + userUid + '/workouts').get(),
      fStore.doc('users/' + userUid + '/meta/records').get(),
      fStore.doc('users/' + userUid + '/meta/custom_exercises').get(),
      fStore.collection('users/' + userUid + '/plans').get(),
      fStore.doc('users/' + userUid + '/meta/activeplan').get(),
      fStore.doc('users/' + userUid + '/meta/favorites').get(),
      fStore.doc('users/' + userUid + '/meta/hidden_builtins').get(),
      fStore.doc('users/' + userUid + '/meta/exercise_info').get(),
      fStore.doc('users/' + userUid + '/meta/plate_inventory').get(),
      fStore.doc('users/' + userUid + '/meta/plate_on_bar').get(),
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
    db.plateInventory = plateInventorySnap.exists ? (plateInventorySnap.data().counts || {}) : {};
    db.plateOnBar = plateOnBarSnap.exists ? (plateOnBarSnap.data().counts || {}) : {};
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

// Per-screen "does the CURRENTLY ACTIVE screen have unsaved input?" checks,
// keyed by the screen being navigated AWAY FROM (not the destination). Used
// by the popstate handler below to guard the hardware back button on
// full-screen forms — unlike .overlay popups (which already flow through
// dismissOverlayForBack), a full screen has no other interception point, so
// this table is checked directly in the screen-navigation fallthrough. Each
// entry's own snapshot/baseline functions and variables are defined next to
// that screen's own code further down in this file.
const SCREEN_HAS_CHANGES = {
  'screen-new-exercise': () => hasChanges(newExerciseBaseline, getNewExerciseFormSnapshot()),
  'screen-ai-generate': () => hasChanges(AI_GEN_DEFAULT_SNAPSHOT, getAiGenFormSnapshot()),
  'screen-training': () => hasChanges(trackFieldsBaseline, getTrackFieldsSnapshot()),
};

let historyInitialized = false;
let inPopstateNavigation = false;

// A history.back() we issued ourselves (closing an overlay, see
// popOverlayHistoryIfNeeded) is asynchronous: its popstate arrives later.
// Anything that pushes a history entry in between — e.g. the ⋮ menu closes and
// a popup/screen opens in the same tick — would land BEFORE that pending pop and
// be popped by it, silently losing one step of the back button. So while such a
// back is in flight (suppressNextPopstate), pushes are queued and replayed the
// moment its popstate arrives (see the popstate handler).
let deferredHistoryPushes = [];
function pushHistoryEntry(state, url) {
  if (suppressNextPopstate) deferredHistoryPushes.push([state, url]);
  else history.pushState(state, '', url);
}
function flushDeferredHistoryPushes() {
  const queued = deferredHistoryPushes;
  deferredHistoryPushes = [];
  queued.forEach(([state, url]) => history.pushState(state, '', url));
}

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
    pushHistoryEntry({ screen: id }, '#' + id);
  }
}

// In-app "back" controls call this instead of showScreen() directly, so
// they walk the same history stack the hardware back button uses instead
// of pushing a redundant duplicate entry on top of it. `fallbackId` covers
// the (normally unreachable) case where there's no app history yet.
//
// `hasChangedFn` is optional: when given, it guards the (normally
// unreachable) direct showScreen(fallbackId) path with the shared discard
// confirmation. The far more common `history.back()` path is deliberately
// NOT checked here — it triggers a real popstate event, which the handler
// below already guards via SCREEN_HAS_CHANGES (the same table hardware back
// must use, since it never calls goBack() at all). Checking here too would
// show the confirmation twice for the same tap.
function goBack(fallbackId, hasChangedFn) {
  if (history.state && history.state.screen) {
    history.back();
  } else if (hasChangedFn) {
    confirmDiscardIfChanged(hasChangedFn, () => showScreen(fallbackId));
  } else {
    showScreen(fallbackId);
  }
}

// -- Modal back-button handling --------------------------
// Any open .overlay popup pushes its own history entry, so the hardware/
// Android back button closes it (same as its own Cancel button) instead of
// letting the press fall through to screen navigation underneath it.
//
// This is a STACK, not a single id: the field-picker overlay can open on top
// of an already-open exercise-info-overlay (its Primary/Secondary muscle
// pickers), so closing the top one via back must restore tracking of the
// overlay still open underneath it instead of forgetting about it entirely.
// Every other overlay in the app only ever reaches a stack depth of 1, so
// this behaves exactly like the old single-id tracking for all of them.
let overlayStack = [];
let suppressNextPopstate = false;

function pushOverlayHistory(id) {
  overlayStack.push(id);
  pushHistoryEntry({ overlay: id }, location.hash);
}

// Keeps the history stack in sync when an overlay is closed by anything
// OTHER than the back button (Cancel/Save/backdrop tap): those don't consume
// a history entry on their own, so without this, the next real back press
// would just pop that stale entry and land back on the same screen — a dead
// "nothing happened" press before the one that actually navigates. Only pops
// when `id` is the current TOP of the stack — nothing in this app ever closes
// an overlay while another is stacked on top of it (the top one's scrim
// blocks all interaction with what's underneath), so this is never out of order.
function popOverlayHistoryIfNeeded(id) {
  if (overlayStack[overlayStack.length - 1] !== id) return;
  overlayStack.pop();
  if (!inPopstateNavigation) {
    suppressNextPopstate = true;
    history.back();
    // Safety net: if the pop never produces a popstate, don't stay blocked forever.
    setTimeout(() => {
      if (suppressNextPopstate) { suppressNextPopstate = false; flushDeferredHistoryPushes(); }
    }, 500);
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

// -- Unsaved-changes discard confirmation ----------------
// Shared by every editable overlay/screen that can lose in-progress input.
// Call this instead of performing the close/back action directly:
//   - if `hasChangedFn()` is false, `proceedFn()` runs immediately (nothing
//     to lose, no need to bother the user);
//   - if true, shows the shared "Discard changes?" confirmation and only
//     runs `proceedFn()` if the user picks Discard. "Keep editing" (or its
//     back-button equivalent, via OVERLAY_CANCEL_BUTTON below) leaves the
//     caller's screen/overlay exactly as it was, edit intact.
// `baseline`/`current` snapshots are plain objects (or strings) compared by
// value via JSON.stringify — each caller only needs to supply its own small
// snapshot-shaped baseline and a getter for the live, current shape.
function hasChanges(baseline, current) {
  return JSON.stringify(baseline) !== JSON.stringify(current);
}

let pendingDiscardAction = null;

function confirmDiscardIfChanged(hasChangedFn, proceedFn) {
  if (!hasChangedFn()) { proceedFn(); return; }
  pendingDiscardAction = proceedFn;
  openOverlay('discard-changes-overlay');
}

document.getElementById('btn-discard-changes-cancel').addEventListener('click', () => {
  pendingDiscardAction = null;
  closeOverlay('discard-changes-overlay');
});
document.getElementById('btn-discard-changes-confirm').addEventListener('click', () => {
  const action = pendingDiscardAction;
  pendingDiscardAction = null;
  closeOverlay('discard-changes-overlay');
  if (action) action();
});

window.addEventListener('popstate', e => {
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    flushDeferredHistoryPushes();
    return;
  }
  if (overlayStack.length > 0) {
    const id = overlayStack.pop();
    const stackLenBeforeDismiss = overlayStack.length;
    dismissOverlayForBack(id);
    // Some overlays' Cancel only steps back an internal mode instead of
    // truly closing (comment-overlay's edit → view, when there's existing
    // text to fall back to; exercise-info's edit → view) — if it's still
    // open, keep intercepting back presses for it instead of letting the
    // next one fall through to screens. Restore it at the position it was
    // popped from (not necessarily the new top): dismissing it may itself
    // have opened a NEW overlay on top of it (a "Discard changes?"
    // confirmation) — that overlay already pushed itself onto the end of
    // the stack, and `id` must go back UNDER it to keep the LIFO order
    // (and thus which overlay the next back press actually dismisses) correct.
    if (document.getElementById(id).classList.contains('open')) {
      overlayStack.splice(stackLenBeforeDismiss, 0, id);
      history.pushState({ overlay: id }, '', location.hash);
    }
    return;
  }
  const targetId = (e.state && e.state.screen) || 'screen-home';
  // Full-screen forms have no overlay to intercept back through, so guard
  // them here directly: if the screen we're navigating AWAY FROM (still the
  // active one — showScreen() hasn't run yet) has unsaved input, restore the
  // history entry the back press just consumed and show the same shared
  // discard confirmation on top of it, exactly like a nested overlay.
  const activeScreen = document.querySelector('.screen.active');
  const guard = activeScreen && SCREEN_HAS_CHANGES[activeScreen.id];
  if (guard && guard()) {
    history.pushState({ screen: activeScreen.id }, '', location.hash);
    confirmDiscardIfChanged(guard, () => {
      inPopstateNavigation = true;
      showScreen(targetId);
      inPopstateNavigation = false;
      if (targetId === 'screen-exercises') syncExerciseBrowseToHistory(e.state && e.state.browse);
    });
    return;
  }
  inPopstateNavigation = true;
  showScreen(targetId);
  inPopstateNavigation = false;
  if (targetId === 'screen-exercises') syncExerciseBrowseToHistory(e.state && e.state.browse);
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
// Wired into the same generic overlay history/back-button system as the
// .overlay bottom sheets (openOverlay/closeOverlay below) so the hardware
// back button closes this menu instead of navigating the screen under it.
function showOverflowMenu(items, anchorEl) {
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
  openOverlay('overflow-menu');
}
function closeOverflowMenu() { closeOverlay('overflow-menu'); }
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
// Returns a Set of "date#setIndex" keys for every set of `exerciseName` that was
// a personal record WHEN IT WAS LIFTED: walking all sets in chronological order
// (date, then position within the day), a set counts when it has at least 1 rep,
// a weight above 0 and is strictly heavier than every earlier set with exactly
// the same rep count — so the first-ever set for a rep count is always a PR, and
// equalling a record is not. Derived purely from the logged sets (no stored
// record table that could drift from them), so it always agrees with the
// Records screen / record history, which use the same rule.
function getPRSetKeys(exerciseName) {
  const best = {};
  const result = new Set();
  Object.keys(db.workouts).sort().forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === exerciseName);
    if (!ex) return;
    (ex.sets || []).forEach((s, i) => {
      const reps = parseInt(s.reps) || 0;
      const weight = parseFloat(s.weight) || 0;
      if (reps < 1 || weight <= 0) return;
      if (weight > (best[reps] || 0)) {
        best[reps] = weight;
        result.add(date + '#' + i);
      }
    });
  });
  return result;
}

function renderHome() {
  document.getElementById('day-nav-label').textContent = formatDateStr(currentDate, 'long');
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
    const firstPRKeys = getPRSetKeys(ex.name);
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
          <span class="exercise-set-comment${hasNote ? ' has-note' : ''}" aria-label="Set comment">${hasNote ? COMMENT_ICON_SVG : ''}</span>
          ${isFirstPR ? prTrophySvg('exercise-set-pr') : `<span class="exercise-set-spacer"></span>`}
          <span class="exercise-set-weight"><span class="exercise-set-val">${s.weight}</span><span class="exercise-set-unit">kgs</span></span>
          <span class="exercise-set-reps"><span class="exercise-set-val">${s.reps}</span><span class="exercise-set-unit">reps</span></span>
          ${rpeCellHtml(s)}
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
let commentEditBaseline = '';

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
  commentEditBaseline = text;
  document.getElementById('comment-edit-input').value = text;
  document.getElementById('comment-edit-mode').classList.remove('hidden');
  document.getElementById('comment-view-mode').classList.add('hidden');
}

// `date` defaults to the day shown on the Fitness Tracker; the History tab
// passes the (other) day its set row belongs to.
function openSetCommentPopup(exIdx, setIdx, date = currentDate) {
  const refresh = () => {
    renderHome();
    if (document.getElementById('tab-history').classList.contains('active')) renderHistoryTab();
  };
  openCommentPopup({
    getText: () => {
      const ex = getWorkout(date)[exIdx];
      return (ex && ex.sets[setIdx] && ex.sets[setIdx].note) || '';
    },
    onSave: val => {
      const workout = getWorkout(date);
      const ex = workout[exIdx];
      if (!ex || !ex.sets[setIdx]) return;
      if (val) ex.sets[setIdx].note = val; else delete ex.sets[setIdx].note;
      setWorkout(date, workout);
      refresh();
    },
    onDelete: () => {
      const workout = getWorkout(date);
      const ex = workout[exIdx];
      if (!ex || !ex.sets[setIdx]) return;
      delete ex.sets[setIdx].note;
      setWorkout(date, workout);
      refresh();
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

// Shared "follow the finger" swap loop for the app's three long-press/handle
// vertical drag-to-reorder lists (home exercise cards, TRACK-tab set rows,
// Plan Day Edit items). Each caller keeps its own trigger (selection-mode +
// handle, built-in long-press timer, always-on handle), its own drag-state
// variables (several of which — e.g. setDragItem/pdeDragItem — are also read
// by unrelated gesture guards elsewhere, so they stay as separate globals)
// and its own end-of-drag persistence; only the touch-Y-vs-sibling-midpoint
// comparison and the insertAdjacentElement swap are shared here. Returns the
// updated { startY, dy } for the caller to write back into its own state.
function dragReorderStep({ item, startY, transformEl, items, touchY }) {
  let dy = touchY - startY;
  transformEl.style.transform = `translateY(${dy}px)`;

  const dragPos = items.indexOf(item);
  for (let i = 0; i < items.length; i++) {
    if (items[i] === item) continue;
    const sibRect = items[i].getBoundingClientRect();
    const sibCenter = sibRect.top + sibRect.height / 2;
    if (dragPos < i && touchY > sibCenter) {
      items[i].insertAdjacentElement('afterend', item);
      startY += sibRect.height;
      dy -= sibRect.height;
      transformEl.style.transform = `translateY(${dy}px)`;
      break;
    } else if (dragPos > i && touchY < sibCenter) {
      items[i].insertAdjacentElement('beforebegin', item);
      startY -= sibRect.height;
      dy += sibRect.height;
      transformEl.style.transform = `translateY(${dy}px)`;
      break;
    }
  }
  return { startY, dy };
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
    const cards = [...container.querySelectorAll('.exercise-card')];
    ({ startY: homeExDragStartY, dy: homeExDragDy } = dragReorderStep({
      item: homeExDragItem, startY: homeExDragStartY, transformEl: homeExDragItem,
      items: cards, touchY: e.touches[0].clientY,
    }));
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
  const list = document.getElementById('set-list');
  const rows = [...list.querySelectorAll('.set-row')];
  ({ startY: setDragStartY, dy: setDragDy } = dragReorderStep({
    item: setDragItem, startY: setDragStartY, transformEl: setDragItem, items: rows, touchY,
  }));
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
  document.getElementById('exercise-search').value = '';
  setExercisesTitle('All Exercises');
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

// Picking a category (or Favorites) filters the list in place, so it gets its
// OWN history entry — otherwise the hardware back button would pop straight
// past the unfiltered "All Exercises" list to whatever screen opened it. The
// entry carries `browse` (the category id) so popstate can tell a filtered
// entry from the plain screen entry and sync the list to whichever it lands on.
function enterExerciseBrowseCategory(browseId, title, renderFn) {
  exerciseBrowserMode = 'exercises';
  currentBrowseCategory = browseId;
  setExercisesTitle(title);
  renderFn();
  pushHistoryEntry({ screen: 'screen-exercises', browse: browseId }, '#screen-exercises');
}

// Back to the unfiltered category list (mirrors what the in-app back arrow does).
function resetExerciseBrowseToCategories() {
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  document.getElementById('exercise-search').value = '';
  renderCategoryBrowser();
}

// Called by the popstate handler whenever history lands on the exercises
// screen: `browse` is that history entry's category id, or undefined for the
// plain (unfiltered) entry. Only touches the list when it's out of step.
function syncExerciseBrowseToHistory(browse) {
  if (!browse) {
    if (exerciseBrowserMode === 'exercises') resetExerciseBrowseToCategories();
  } else if (exerciseBrowserMode !== 'exercises' || currentBrowseCategory !== browse) {
    exerciseBrowserMode = 'exercises';
    currentBrowseCategory = browse;
    if (browse === FAVORITES_CATEGORY) { setExercisesTitle('Favorites'); renderFavoriteExercises(); }
    else { setExercisesTitle(browse); renderExercisesInCategory(browse); }
  }
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
      enterExerciseBrowseCategory(FAVORITES_CATEGORY, 'Favorites', renderFavoriteExercises);
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
      enterExerciseBrowseCategory(cat, cat, () => renderExercisesInCategory(cat));
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

document.getElementById('btn-cat-edit-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(pendingEditCategory, document.getElementById('cat-edit-input').value),
    () => closeOverlay('cat-edit-overlay')
  );
});
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
// Read the current TRACK-tab weight/reps input values, in the same shape
// used both for the baseline (right after they're set to a "known good"
// resting state) and for checking whether the user has typed something new.
function getTrackFieldsSnapshot() {
  return {
    weight: document.getElementById('field-weight').value,
    reps: document.getElementById('field-reps').value,
    rpe: document.getElementById('field-rpe').value,
  };
}
let trackFieldsBaseline = { weight: '0', reps: '0', rpe: '0' };

// RPE: 0 = not filled in; otherwise 6..10 in steps of 0.5. Whole numbers show
// without a decimal ("8"), halves with one ("8.5").
const RPE_MIN = 6, RPE_MAX = 10, RPE_STEP = 0.5;
// Decimal comma (Dutch keyboard) counts as a point.
function parseRpe(str) { return parseFloat(String(str).replace(',', '.')) || 0; }
function isValidRpe(v) { return v === 0 || (v >= RPE_MIN && v <= RPE_MAX && (v / RPE_STEP) % 1 === 0); }
function formatRpe(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
// Stepper: 0 -> 6 on +, 6 -> 0 on -, +/-0.5 in between (max 10).
function stepRpe(current, dir) {
  const v = parseRpe(current);
  if (dir === '+') return v < RPE_MIN ? RPE_MIN : Math.min(RPE_MAX, Math.round((v + RPE_STEP) / RPE_STEP) * RPE_STEP);
  return v <= RPE_MIN ? 0 : Math.round((v - RPE_STEP) / RPE_STEP) * RPE_STEP;
}
function setRpeField(v) { document.getElementById('field-rpe').value = v ? formatRpe(v) : 0; }
// Small RPE marker for a logged set: grey badge with the value, or a muted dash.
function rpeCellHtml(s) {
  const rpe = parseFloat(s.rpe) || 0;
  return `<span class="set-rpe-cell">${rpe > 0 ? `<span class="set-rpe-badge">RPE ${formatRpe(rpe)}</span>` : '<span class="set-rpe-none">—</span>'}</span>`;
}

function openTraining(name) {
  currentExercise = name;
  currentTimeRange = 'all'; // Graph tab period starts on "all" every time an exercise is opened
  syncTimeFilterButtons();
  selectedSetIndex = null;
  document.getElementById('training-title').textContent = name;
  document.getElementById('field-weight').value = 0;
  document.getElementById('field-reps').value = 0;
  setRpeField(0);
  trackFieldsBaseline = getTrackFieldsSnapshot();
  switchTab('track');
  showScreen('screen-training');
  renderSetList();
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

  const firstPRKeys = getPRSetKeys(currentExercise);
  list.innerHTML = '';

  sets.forEach((s, i) => {
    const isPR = firstPRKeys.has(currentDate + '#' + i);
    const hasNote = !!(s.note && s.note.trim());
    const isSelected = selectedSetIndex === i;
    const row = document.createElement('div');
    row.className = 'set-row' + (isSelected ? ' selected' : '');
    row.dataset.setIdx = i;
    row.innerHTML = `
      <span class="set-comment${hasNote ? ' has-note' : ''}" aria-label="Set note">${COMMENT_ICON_SVG}</span>
      <span class="set-row-pr">${isPR ? prTrophySvg('set-pr-icon') : ''}</span>
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
let setNoteBaseline = '';

function openSetNote(i) {
  const ex = getCurrentExerciseData();
  if (!ex || !ex.sets[i]) return;
  noteEditIndex = i;
  setNoteBaseline = ex.sets[i].note || '';
  document.getElementById('set-note-input').value = setNoteBaseline;
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
  toast(note ? 'Comment saved' : 'Comment deleted');
}

// Personal Records: 1..12 reps, or up to the highest rep count ever logged for
// this exercise if that's more (same range as the Graph's Reps dropdown). Each
// row is the heaviest weight ever
// actually logged for EXACTLY that rep count (same series as the Graph tab),
// dated by the first time it was lifted; "No data" when that rep count was never
// logged. Nothing here is estimated or interpolated.
function recordsRepLabel(n) { return n === 1 ? 'One Rep Max' : n + 'RM'; }

// Every moment the record for exactly `reps` reps was broken, oldest first: a
// session counts when its heaviest set beats the best of all sessions before
// it (strictly heavier, so equalling a record is not a new one). The last entry
// is the current record, dated the first time that weight was lifted.
function getExerciseRepRecordHistory(name, reps) {
  const history = [];
  getExerciseRepSeries(name, reps).forEach(p => {
    if (!history.length || p.val > history[history.length - 1].val) history.push(p);
  });
  return history;
}

function getExerciseRepRecord(name, reps) {
  const history = getExerciseRepRecordHistory(name, reps);
  return history.length ? history[history.length - 1] : null;
}

// Record history popup for one rep count: the current record plus every earlier
// record, newest first.
let recordsHistoryReps = null;
function recordsHistoryRowHtml(p) {
  return `
    <div class="records-row records-row-clickable" data-date="${p.date}" data-val="${p.val}">
      <span class="records-row-weight">${prTrophySvg()}${p.val} kgs</span>
      <span class="records-row-date">${formatDateStr(p.date, 'short')}</span>
    </div>`;
}
function openRecordsHistory(reps) {
  const history = getExerciseRepRecordHistory(currentExercise, reps);
  if (history.length === 0) return;
  recordsHistoryReps = reps;
  const current = history[history.length - 1];
  const previous = history.slice(0, -1).reverse();
  document.getElementById('records-history-title').textContent = recordsRepLabel(reps) + ' history';
  document.getElementById('records-history-body').innerHTML = `
    <div class="info-section-label">Current record</div>
    ${recordsHistoryRowHtml(current)}
    <div class="info-section-label">Previous records</div>
    ${previous.length ? previous.map(recordsHistoryRowHtml).join('') : '<div class="records-empty">No previous records</div>'}`;
  openOverlay('records-history-overlay');
}

// Right-hand side of a record row/block: weight + date, or "No data".
function recordsValueHtml(rec) {
  return rec
    ? `<span class="records-row-value">
        <span class="records-row-weight">${prTrophySvg()}${rec.val} kgs</span>
        <span class="records-row-date">${formatDateStr(rec.date, 'short')}</span>
      </span>`
    : `<span class="records-row-nodata">No data</span>`;
}
const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5z"/></svg>';

function openExerciseRecords() {
  document.getElementById('records-title').textContent = (currentExercise || '') + ' records';
  // One Rep Max: its own block on top; the list below starts at 2RM.
  const oneRm = getExerciseRepRecord(currentExercise, 1);
  const hero = document.getElementById('records-hero');
  hero.className = 'records-hero' + (oneRm ? ' records-hero-clickable' : '');
  if (oneRm) hero.dataset.reps = '1'; else delete hero.dataset.reps;
  hero.innerHTML = `<span class="records-hero-label">${CROWN_SVG}One rep max</span>${recordsValueHtml(oneRm)}`;
  const list = document.getElementById('records-list');
  list.innerHTML = Array.from({ length: getExerciseMaxReps(currentExercise) - 1 }, (_, k) => {
    const reps = k + 2;
    const rec = getExerciseRepRecord(currentExercise, reps);
    return `
      <div class="records-row${rec ? ' records-row-clickable' : ''}"${rec ? ` data-reps="${reps}"` : ''}>
        <span class="records-row-reps">${recordsRepLabel(reps)}</span>
        ${recordsValueHtml(rec)}
      </div>`;
  }).join('');
  document.getElementById('records-scroll').scrollTop = 0;
  showScreen('screen-records');
}

// -- Exercise info (muscle group / equipment setup) ------
// Exercise-own data, keyed by exercise name (same join key as favorites/
// hiddenBuiltins) — not tied to any session/set, so it's stored and loaded
// independently of db.workouts.
const MUSCLE_OPTIONS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quadriceps', 'Hamstrings', 'Glutes', 'Core', 'Calves'];

// Every equipment dropdown shares the same "Not set" first option, both so
// it's the natural default for a new/empty exercise and so a dropdown opened
// by accident can be closed by picking it, without a separate reset control.
function equipmentRangeOptions(start, end, step) {
  const opts = [{ value: '', label: 'Not set' }];
  const count = Math.round((end - start) / step);
  for (let i = 0; i <= count; i++) {
    const v = Math.round((start + i * step) * 100) / 100;
    opts.push({ value: String(v), label: String(v) });
  }
  return opts;
}
const BENCH_SETTING_OLD_OPTIONS = [
  { value: '', label: 'Not set' },
  ...[0, 15, 30, 45, 60, 90].map(v => ({ value: String(v), label: v + '°' })),
];
const BENCH_SETTING_NEW_OPTIONS = [
  { value: '', label: 'Not set' },
  ...[0, 1, 2, 3, 4, 5, 6].map(v => ({ value: String(v), label: String(v) })),
];
const BENCH_HEIGHT_OPTIONS = equipmentRangeOptions(1, 9, 0.5);
const CABLE_HEIGHT_OLD_OPTIONS = equipmentRangeOptions(1, 12, 1);
const CABLE_HEIGHT_NEW_OPTIONS = equipmentRangeOptions(1, 14, 1);
const SQUAT_RACK_HEIGHT_OPTIONS = equipmentRangeOptions(1, 10, 1);
const SAFETY_BAR_OPTIONS = equipmentRangeOptions(1, 10, 1);

// `kind: 'picker'` fields open the shared field-picker overlay (see
// wireExerciseInfoFormPickers below); `'checkbox'` and `'text'` read/write
// their input directly. View mode pairs the picker/checkbox fields up
// (EXERCISE_INFO_EQUIPMENT_PAIRS) the same way Muscle group pairs
// Primary/Secondary, and only renders whichever half of a pair is filled;
// the free-text fields stay full-width rows like before.
// The same field set is rendered twice — in the Exercise Info overlay
// (prefix 'info') and in the New/Edit Exercise screen (prefix 'new-ex-info')
// — so an element id is `<prefix>-<idSuffix>` (see EXERCISE_INFO_FORMS).
const EXERCISE_INFO_EQUIPMENT_FIELDS = [
  { key: 'benchSettingOld', label: 'Bench setting (old)', idSuffix: 'bench-setting-old', kind: 'picker', options: BENCH_SETTING_OLD_OPTIONS },
  { key: 'benchSettingNew', label: 'Bench setting (new)', idSuffix: 'bench-setting-new', kind: 'picker', options: BENCH_SETTING_NEW_OPTIONS },
  { key: 'benchHeight', label: 'Bench height', idSuffix: 'bench-height', kind: 'picker', options: BENCH_HEIGHT_OPTIONS },
  { key: 'powerliftBench', label: 'Powerlift bench', idSuffix: 'powerlift-bench', kind: 'checkbox' },
  { key: 'cableHeightOld', label: 'Cable height (old)', idSuffix: 'cable-height-old', kind: 'picker', options: CABLE_HEIGHT_OLD_OPTIONS },
  { key: 'cableHeightNew', label: 'Cable height (new)', idSuffix: 'cable-height-new', kind: 'picker', options: CABLE_HEIGHT_NEW_OPTIONS },
  { key: 'squatRackHeight', label: 'Squat rack height', idSuffix: 'squat-rack-height', kind: 'picker', options: SQUAT_RACK_HEIGHT_OPTIONS },
  { key: 'safetyBar', label: 'Safety bar', idSuffix: 'safety-bar', kind: 'picker', options: SAFETY_BAR_OPTIONS },
  { key: 'handPosition', label: 'Hand position', idSuffix: 'hand-position', kind: 'text' },
  { key: 'footPosition', label: 'Foot position', idSuffix: 'foot-position', kind: 'text' },
  { key: 'extra', label: 'Extra', idSuffix: 'extra', kind: 'text' },
];
const EXERCISE_INFO_EQUIPMENT_PAIRS = [
  ['benchSettingOld', 'benchSettingNew'],
  ['benchHeight', 'powerliftBench'],
  ['cableHeightOld', 'cableHeightNew'],
  ['squatRackHeight', 'safetyBar'],
];
const EXERCISE_INFO_FULLWIDTH_KEYS = ['handPosition', 'footPosition', 'extra'];
const EXERCISE_INFO_FIELDS_BY_KEY = {};
EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => { EXERCISE_INFO_FIELDS_BY_KEY[f.key] = f; });

function equipmentFieldIsFilled(f, info) {
  if (f.kind === 'checkbox') return !!info[f.key];
  const v = info[f.key];
  return v !== undefined && v !== null && v !== '';
}
function equipmentFieldViewValue(f, info) {
  if (f.kind === 'checkbox') return 'Yes';
  if (f.kind === 'picker') {
    const opt = f.options.find(o => o.value === String(info[f.key]));
    return opt ? opt.label : String(info[f.key]);
  }
  return info[f.key];
}

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
  let equipHtml = '';
  EXERCISE_INFO_EQUIPMENT_PAIRS.forEach(pair => {
    const cells = pair
      .map(key => EXERCISE_INFO_FIELDS_BY_KEY[key])
      .filter(f => equipmentFieldIsFilled(f, info))
      .map(f => `<div class="info-view-stat"><span class="info-view-stat-label">${f.label}</span><span class="info-view-stat-value">${equipmentFieldViewValue(f, info)}</span></div>`);
    if (cells.length > 0) equipHtml += `<div class="info-two-col">${cells.join('')}</div>`;
  });
  EXERCISE_INFO_FULLWIDTH_KEYS.forEach(key => {
    const f = EXERCISE_INFO_FIELDS_BY_KEY[key];
    if (!equipmentFieldIsFilled(f, info)) return;
    equipHtml += `<div class="info-view-stat"><span class="info-view-stat-label">${f.label}</span><span class="info-view-stat-value">${equipmentFieldViewValue(f, info)}</span></div>`;
  });
  if (equipHtml) sections.push('<div class="info-section-label">Equipment setup</div>' + equipHtml);
  const content = document.getElementById('exercise-info-view-content');
  content.innerHTML = sections.length === 0
    ? `<div class="exercise-info-empty">No info added yet</div>`
    : sections.join('');
  document.getElementById('exercise-info-view-mode').classList.remove('hidden');
  document.getElementById('exercise-info-edit-mode').classList.add('hidden');
}

const MUSCLE_PRIMARY_OPTIONS = MUSCLE_OPTIONS.map(m => ({ value: m, label: m }));
const MUSCLE_SECONDARY_OPTIONS = [{ value: '', label: 'None' }, ...MUSCLE_PRIMARY_OPTIONS];

// The muscle-group/equipment fields live in two places — the Exercise Info
// overlay and the New/Edit Exercise screen — and both are built, wired,
// populated and read by the same generic functions below, parameterised by one
// of these forms (element ids are `<prefix>-<field>`). primaryOptions[0] is
// what Primary shows for an exercise without data: the info overlay has always
// defaulted to Chest, whereas New/Edit Exercise shows "Not set" so saving an
// untouched form doesn't invent a muscle group.
const EXERCISE_INFO_FORMS = {
  overlay: { prefix: 'info', primaryOptions: MUSCLE_PRIMARY_OPTIONS },
  newEx: { prefix: 'new-ex-info', primaryOptions: [{ value: '', label: 'Not set' }, ...MUSCLE_PRIMARY_OPTIONS] },
};

function renderExerciseInfoFormFields(form) {
  const p = form.prefix;
  const pickerBtn = id => `<button type="button" class="new-ex-select new-ex-select-btn" id="${id}"></button>`;
  const field = (id, label, control) => `<div class="info-field"><label class="info-field-label" for="${id}">${label}</label>${control}</div>`;
  const equipmentField = key => {
    const f = EXERCISE_INFO_FIELDS_BY_KEY[key];
    const id = `${p}-${f.idSuffix}`;
    let control;
    if (f.kind === 'picker') control = pickerBtn(id);
    else if (f.kind === 'checkbox') control = `<input type="checkbox" class="info-checkbox" id="${id}"/>`;
    // Chrome keys its "previously entered values" suggestion list by the
    // field's name (falling back to id), so autocomplete="off" alone doesn't
    // suppress it. A fresh random name on every load means it never finds a
    // history match — same trick as the weight/reps fields. The app itself
    // only ever looks the field up by id, never by name.
    else control = `<input type="text" id="${id}" name="${id}-${Math.random().toString(36).slice(2)}" class="new-ex-input" placeholder="Leave empty to hide" autocomplete="off"/>`;
    return field(id, f.label, control);
  };
  document.getElementById(`${p}-muscle-fields`).innerHTML =
    field(`${p}-primary-muscle`, 'Primary', pickerBtn(`${p}-primary-muscle`)) +
    field(`${p}-secondary-muscle`, 'Secondary', pickerBtn(`${p}-secondary-muscle`));
  document.getElementById(`${p}-equipment-fields`).innerHTML =
    EXERCISE_INFO_EQUIPMENT_PAIRS.map(pair => `<div class="info-two-col">${pair.map(equipmentField).join('')}</div>`).join('') +
    EXERCISE_INFO_FULLWIDTH_KEYS.map(equipmentField).join('');
}

// Every picker field opens the same shared field-picker overlay and writes its
// selection back onto its own button — one loop covers all of them instead of
// repeating the new-ex-category/type/weight-unit pattern per field.
function wireExerciseInfoFormPickers(form) {
  const p = form.prefix;
  const wire = (id, title, options) => {
    document.getElementById(id).addEventListener('click', () => {
      openFieldPicker(title, options, getFieldBtnValue(id), value => {
        const opt = options.find(o => o.value === value);
        setFieldBtnValue(id, value, opt ? opt.label : 'Not set');
      });
    });
  };
  wire(`${p}-primary-muscle`, 'Primary', form.primaryOptions);
  wire(`${p}-secondary-muscle`, 'Secondary', MUSCLE_SECONDARY_OPTIONS);
  EXERCISE_INFO_EQUIPMENT_FIELDS.filter(f => f.kind === 'picker').forEach(f => wire(`${p}-${f.idSuffix}`, f.label, f.options));
}

function setExerciseInfoPicker(id, options, val) {
  const strVal = (val !== undefined && val !== null) ? String(val) : '';
  const opt = options.find(o => o.value === strVal) || options[0];
  setFieldBtnValue(id, opt.value, opt.label);
}

// Fills every field of a form from an exercise's stored info ({} = nothing set).
function populateExerciseInfoForm(form, info) {
  const p = form.prefix;
  setExerciseInfoPicker(`${p}-primary-muscle`, form.primaryOptions, info.primaryMuscle);
  setExerciseInfoPicker(`${p}-secondary-muscle`, MUSCLE_SECONDARY_OPTIONS, info.secondaryMuscle);
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    const val = info[f.key];
    if (f.kind === 'checkbox') document.getElementById(id).checked = !!val;
    else if (f.kind === 'picker') setExerciseInfoPicker(id, f.options, val);
    else document.getElementById(id).value = (val !== undefined && val !== null) ? val : '';
  });
}

// Reads the current, live state of every field of a form, in the same shape
// whether used to capture the baseline (right after populating the form) or to
// check for changes later (at Cancel/back time).
function getExerciseInfoFormSnapshot(form) {
  const p = form.prefix;
  const snapshot = {
    primaryMuscle: getFieldBtnValue(`${p}-primary-muscle`),
    secondaryMuscle: getFieldBtnValue(`${p}-secondary-muscle`),
  };
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    if (f.kind === 'checkbox') snapshot[f.key] = document.getElementById(id).checked;
    else if (f.kind === 'picker') snapshot[f.key] = getFieldBtnValue(id);
    else snapshot[f.key] = document.getElementById(id).value;
  });
  return snapshot;
}

// Converts a form into the stored info object; unset fields are left out, so
// an entirely empty form yields {}.
function readExerciseInfoForm(form) {
  const p = form.prefix;
  const info = {};
  const primary = getFieldBtnValue(`${p}-primary-muscle`);
  const secondary = getFieldBtnValue(`${p}-secondary-muscle`);
  if (primary) info.primaryMuscle = primary;
  if (secondary) info.secondaryMuscle = secondary;
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    if (f.kind === 'checkbox') {
      if (document.getElementById(id).checked) info[f.key] = true;
      return;
    }
    if (f.kind === 'picker') {
      const raw = getFieldBtnValue(id);
      if (raw === '') return;
      info[f.key] = parseFloat(raw);
      return;
    }
    const raw = document.getElementById(id).value.trim();
    if (raw === '') return;
    info[f.key] = raw;
  });
  return info;
}

Object.values(EXERCISE_INFO_FORMS).forEach(form => {
  renderExerciseInfoFormFields(form);
  wireExerciseInfoFormPickers(form);
});

let exerciseInfoEditBaseline = null;

function showExerciseInfoEdit() {
  const info = getExerciseInfo(currentExercise) || {};
  document.getElementById('exercise-info-edit-title').textContent = currentExercise + ' info';
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.overlay, info);
  document.getElementById('exercise-info-edit-mode').classList.remove('hidden');
  document.getElementById('exercise-info-view-mode').classList.add('hidden');
  exerciseInfoEditBaseline = getExerciseInfoFormSnapshot(EXERCISE_INFO_FORMS.overlay);
}

function openExerciseInfo() {
  renderExerciseInfoView();
  openOverlay('exercise-info-overlay');
}

// Stores (or, when empty, removes) one exercise's info. Skips the Firestore
// write when nothing actually changed.
function setExerciseInfoFor(name, info) {
  if (!db.exerciseInfo) db.exerciseInfo = {};
  const unchanged = JSON.stringify(db.exerciseInfo[name] || {}) === JSON.stringify(info);
  if (Object.keys(info).length === 0) delete db.exerciseInfo[name];
  else db.exerciseInfo[name] = info;
  if (!unchanged) persistExerciseInfo();
}

function saveExerciseInfo() {
  setExerciseInfoFor(currentExercise, readExerciseInfoForm(EXERCISE_INFO_FORMS.overlay));
  renderExerciseInfoView();
  toast('Info saved');
}

function saveSet() {
  const weight = parseFloat(document.getElementById('field-weight').value) || 0;
  const reps = parseInt(document.getElementById('field-reps').value) || 0;
  if (reps < 1) { toast('Enter reps', { type: 'error' }); return; }
  const rpe = parseRpe(document.getElementById('field-rpe').value);
  if (!isValidRpe(rpe)) { toast('RPE: 6 to 10, in steps of 0.5', { type: 'error' }); return; }

  const workout = getWorkout(currentDate);
  let ex = workout.find(e => e.name === currentExercise);
  if (!ex) { ex = { name: currentExercise, sets: [] }; workout.push(ex); }

  let savedMsg, savedIdx;
  if (selectedSetIndex !== null) {
    const existingNote = ex.sets[selectedSetIndex] && ex.sets[selectedSetIndex].note;
    ex.sets[selectedSetIndex] = { weight, reps, ...(rpe > 0 && { rpe }), ...(existingNote && { note: existingNote }) };
    savedIdx = selectedSetIndex;
    selectedSetIndex = null;
    savedMsg = 'Set updated';
  } else {
    ex.sets.push({ weight, reps, ...(rpe > 0 && { rpe }) });
    savedIdx = ex.sets.length - 1;
    savedMsg = 'Set saved';
  }

  setWorkout(currentDate, workout);
  // A PR replaces the plain confirmation entirely (two consecutive toast()
  // calls would just overwrite each other anyway).
  const isPR = getPRSetKeys(currentExercise).has(currentDate + '#' + savedIdx);
  if (isPR) toast('\u{1F3C6} Personal record! \u{1F3C6}', { type: 'pr' });
  else toast(savedMsg);
  trackFieldsBaseline = getTrackFieldsSnapshot();
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
    setRpeField(parseFloat(ex.sets[i].rpe) || 0);
  }
  // Whatever the fields show right after selecting/deselecting a set becomes
  // the new "nothing to lose" baseline — editing an existing set's already-
  // saved values isn't itself an unsaved change; only editing them FURTHER is.
  trackFieldsBaseline = getTrackFieldsSnapshot();
  renderSetList();
}

function clearFields() {
  selectedSetIndex = null;
  document.getElementById('field-weight').value = 0;
  document.getElementById('field-reps').value = 0;
  setRpeField(0);
  trackFieldsBaseline = getTrackFieldsSnapshot();
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

// -- Field +/- Buttons ---------------------------------
document.querySelectorAll('.field-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    const dir = btn.dataset.dir;
    const input = document.getElementById('field-' + field);
    if (field === 'rpe') { setRpeField(stepRpe(input.value, dir)); return; }
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
['field-weight', 'field-reps', 'field-rpe'].forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => input.select());
  input.addEventListener('contextmenu', e => e.preventDefault());
  // Chrome's "previously entered values" suggestion list is keyed by the
  // field's name (falling back to id when name is absent), so autocomplete="off"
  // alone doesn't suppress it here. Giving the field a fresh random name on
  // every load means Chrome never finds a history match for it.
  input.setAttribute('autocomplete', 'off');
  input.name = id + '-' + Math.random().toString(36).slice(2);
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

// Shared horizontal-swipe-with-direction-lock gesture, used by the day-nav
// swipe (Fitness Tracker) and the training-tab swipe (TRACK/HISTORY/GRAPH).
// `startGuard`, if given, is checked once at touchstart alongside the
// single-finger check. `duringGuard`, if given, is re-checked on every
// touchmove AND at touchend — needed only by the training-tab swipe, which
// must yield entirely to an in-progress set-row long-press-drag (see
// setupSetListDragReorder) even if that drag starts *after* the swipe
// already began tracking; the day-nav swipe has no such competing gesture
// and only ever needs the touchstart check, exactly as before this refactor.
function setupSwipeNav(containerId, onSwipe, { startGuard, duringGuard } = {}) {
  const container = document.getElementById(containerId);
  const SWIPE_THRESHOLD = 50;
  const DIRECTION_LOCK = 10;
  let startX = 0, startY = 0, tracking = false, direction = null;

  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || (startGuard && startGuard())) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    direction = null;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!tracking) return;
    if (duringGuard && duringGuard()) { tracking = false; direction = null; return; }
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
    if (direction === 'horizontal' && !(duringGuard && duringGuard())) {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) onSwipe(dx < 0 ? 1 : -1);
    }
    tracking = false;
    direction = null;
  };
  container.addEventListener('touchend', endSwipe, { passive: true });
  container.addEventListener('touchcancel', () => { tracking = false; direction = null; }, { passive: true });
}

function setupTrainingSwipeNav() {
  // Defer entirely to the set-row long-press-drag once it's taken over this
  // gesture (see setupSetListDragReorder) so the two never fight over the
  // same touch sequence.
  setupSwipeNav('training-content-wrap', navigateTrainingTab, {
    startGuard: () => setDragItem,
    duringGuard: () => setDragItem,
  });
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

  const firstPRKeys = getPRSetKeys(currentExercise);

  relevantDates.forEach(date => {
    const exIdx = db.workouts[date].findIndex(e => e.name === currentExercise);
    const ex = db.workouts[date][exIdx];
    if (!ex || !ex.sets.length) return;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'history-day-header clickable';
    headerDiv.innerHTML = `<div class="history-day-date">${formatDateStr(date, 'short')}</div><div class="history-day-divider"></div>`;
    headerDiv.addEventListener('click', () => openHistoryGotoDate(date));
    container.appendChild(headerDiv);

    ex.sets.forEach((s, i) => {
      const isPR = firstPRKeys.has(date + '#' + i);
      const hasNote = !!(s.note && s.note.trim());
      const row = document.createElement('div');
      row.className = 'history-set-row clickable';
      // Same comment indicator as the Fitness Tracker day overview: only drawn
      // when the set has a note (the slot is always reserved so rows stay
      // aligned), and tapping it opens the same comment popup.
      row.innerHTML = `
        <span class="history-set-comment${hasNote ? ' has-note' : ''}" aria-label="Set comment">${hasNote ? COMMENT_ICON_SVG : ''}</span>
        ${isPR ? prTrophySvg('history-set-pr') : `<span class="history-set-spacer"></span>`}
        <span class="history-set-weight">${s.weight} kg</span>
        <span class="history-set-reps">${s.reps} reps</span>
        <span class="history-set-rpe">${rpeCellHtml(s)}</span>
      `;
      if (hasNote) {
        row.querySelector('.history-set-comment').addEventListener('click', e => {
          e.stopPropagation();
          openSetCommentPopup(exIdx, i, date);
        });
      }
      row.addEventListener('click', () => openHistoryGotoDate(date));
      container.appendChild(row);
    });
  });
}

// -- History "Go to..." popup (date header / set row taps) ----
let historyGotoAction = null;
let historyGotoUnderOverlay = null;

// `bodyEl` (optional) is shown between the title and the buttons — used by the Graph tab to list that day's sets.
function openHistoryGoto(title, action, bodyEl, underOverlayId = null) {
  historyGotoUnderOverlay = underOverlayId;
  document.getElementById('history-goto-title').textContent = title;
  const body = document.getElementById('history-goto-body');
  body.innerHTML = '';
  if (bodyEl) body.appendChild(bodyEl);
  body.classList.toggle('hidden', !bodyEl);
  historyGotoAction = action;
  openOverlay('history-goto-overlay');
}

function openHistoryGotoDate(dateStr) {
  openHistoryGoto('Go to ' + formatDateStr(dateStr, 'short'), () => {
    currentDate = dateStr;
    showScreen('screen-fitness-tracker');
  });
}

// Same popup as above, plus that day's sets of the current exercise with the
// set(s) matching `markReps`/`markVal` highlighted — used by the Graph tab and
// the record-history popup. `underOverlayId`: an overlay that is open beneath
// this popup and must go away together with it on "Go To" (see confirm handler).
function openHistoryGotoDaySets(dateStr, markReps, markVal, underOverlayId) {
  const ex = (db.workouts[dateStr] || []).find(e => e.name === currentExercise);
  const body = document.createElement('div');
  body.className = 'cal-detail-ex';
  const nameEl = document.createElement('div');
  nameEl.className = 'cal-detail-ex-name';
  nameEl.textContent = currentExercise;
  body.appendChild(nameEl);
  ((ex && ex.sets) || []).forEach(s => {
    const isMarked = parseInt(s.reps) === markReps && (parseFloat(s.weight) || 0) === markVal;
    const row = document.createElement('div');
    row.className = 'history-set-row' + (isMarked ? ' graph-goto-set-point' : '');
    row.innerHTML = `
      <span class="history-set-spacer"></span>
      <span class="history-set-weight">${s.weight} kg</span>
      <span class="history-set-reps">${s.reps} reps</span>
    `;
    body.appendChild(row);
  });
  openHistoryGoto('Go to ' + formatDateStr(dateStr, 'short'), () => {
    currentDate = dateStr;
    showScreen('screen-fitness-tracker');
  }, body, underOverlayId);
}

document.getElementById('history-goto-cancel').addEventListener('click', () => closeOverlay('history-goto-overlay'));
document.getElementById('history-goto-confirm').addEventListener('click', () => {
  const action = historyGotoAction;
  const under = historyGotoUnderOverlay;
  historyGotoAction = null;
  historyGotoUnderOverlay = null;
  const n = overlayStack.length;
  if (under && n >= 2 && overlayStack[n - 2] === under && overlayStack[n - 1] === 'history-goto-overlay') {
    // Two popups stacked (e.g. record history -> Go to): both history entries go
    // in ONE traversal, then the action runs once the screen underneath is back
    // (registered after the app's own popstate handler, so it runs after it).
    overlayStack.length = n - 2;
    document.getElementById('history-goto-overlay').classList.remove('open');
    document.getElementById(under).classList.remove('open');
    window.addEventListener('popstate', () => { if (action) action(); }, { once: true });
    history.go(-2);
    return;
  }
  closeOverlay('history-goto-overlay');
  if (action) action();
});

// -- Graph Tab ------------------------------------------
// Reps dropdown: the graph shows, per session, the heaviest weight actually
// logged for exactly the chosen rep count — never an estimate. The list is
// 1..12, or up to the highest rep count ever logged for the exercise if that's
// more. 1 is labelled "One Rep Max".
const GRAPH_MIN_MAX_REPS = 12;
const graphRepsByExercise = {}; // last explicit choice per exercise (this session)

function graphRepsLabel(n) { return n === 1 ? 'One Rep Max' : String(n); }

// Per rep count: in how many sessions (dates) it was logged; plus the highest rep count ever.
function getExerciseRepStats(name) {
  const sessions = {};
  let highest = 0;
  Object.keys(db.workouts).forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === name);
    if (!ex) return;
    const seen = new Set();
    (ex.sets || []).forEach(s => {
      const r = parseInt(s.reps) || 0;
      if (r < 1) return;
      seen.add(r);
      if (r > highest) highest = r;
    });
    seen.forEach(r => { sessions[r] = (sessions[r] || 0) + 1; });
  });
  return { sessions, highest };
}

// Explicit choice for this exercise if there is one, otherwise the rep count
// logged in the most sessions (ties: the lower one) so the graph opens on real
// data, otherwise One Rep Max.
function resolveGraphReps(stats, maxReps) {
  const chosen = graphRepsByExercise[currentExercise];
  if (chosen && chosen <= maxReps) return chosen;
  let best = 1, bestCount = 0;
  Object.keys(stats.sessions).map(Number).sort((a, b) => a - b).forEach(r => {
    if (stats.sessions[r] > bestCount) { best = r; bestCount = stats.sessions[r]; }
  });
  return best;
}

// Top of the rep range shown for an exercise (Graph dropdown, Records overlay):
// 1..12, or the highest rep count ever logged for it if that is more.
function getExerciseMaxReps(name) {
  return Math.max(GRAPH_MIN_MAX_REPS, getExerciseRepStats(name).highest);
}

function graphRepOptions(maxReps) {
  return Array.from({ length: maxReps }, (_, i) => ({ value: String(i + 1), label: graphRepsLabel(i + 1) }));
}

document.getElementById('graph-reps').addEventListener('click', () => {
  const maxReps = getExerciseMaxReps(currentExercise);
  openFieldPicker('Reps', graphRepOptions(maxReps), getFieldBtnValue('graph-reps'), value => {
    graphRepsByExercise[currentExercise] = parseInt(value);
    renderGraph();
  });
});

// currentTimeRange is the single source of truth for the period selector: the
// highlighted button is always re-derived from it (syncTimeFilterButtons, run
// on every render), so what is highlighted can never differ from what is
// applied. Default is 'all', matching the button marked active in index.html.
document.querySelectorAll('.time-filter').forEach(t => {
  t.addEventListener('click', () => {
    currentTimeRange = t.dataset.range;
    renderGraph();
  });
});

function syncTimeFilterButtons() {
  document.querySelectorAll('.time-filter').forEach(b => b.classList.toggle('active', b.dataset.range === currentTimeRange));
}

// Pure string maths on YYYY-MM-DD (the format sessions are keyed by), so no
// local-vs-UTC mixing. A day that doesn't exist in the target month clamps to
// its last day: 31 Mar minus 1 month = 28/29 Feb (Date#setMonth would roll
// over into March instead and make the window ~3 days too short).
function dateStrMinusMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) - months;
  const ty = Math.floor(total / 12), tm = total % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return ty + '-' + String(tm + 1).padStart(2, '0') + '-' + String(Math.min(d, lastDay)).padStart(2, '0');
}

const TIME_RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };

// Keeps sessions dated on/after (today - period). "Today" is todayStr(), the
// same day source new sessions are dated with.
function filterDataByRange(data) {
  const months = TIME_RANGE_MONTHS[currentTimeRange];
  if (!months) return data; // 'all'
  const cutoffStr = dateStrMinusMonths(todayStr(), months);
  return data.filter(d => d.date >= cutoffStr);
}

// Point selection state. graphSeries is the series that is actually plotted (after the period AND
// reps filters); graphSelected indexes into it; graphPlot holds the last drawn pixel positions for hit-testing.
let graphSeries = [];
let graphSelected = -1;
let graphReps = 1;
let graphPlot = null;
const GRAPH_TAP_RADIUS = 28; // px around a point that counts as a tap on it (finger-sized)

// Per session (date, ascending), the heaviest weight actually logged for exactly
// `reps` reps. A session without such a set gets no entry — never an estimate.
// Shared by the Graph tab and the Personal Records overlay.
function getExerciseRepSeries(name, reps) {
  if (!(reps >= 1)) return [];
  return Object.keys(db.workouts).sort().reduce((acc, date) => {
    const ex = db.workouts[date] && db.workouts[date].find(e => e.name === name);
    if (!ex) return acc;
    const weights = (ex.sets || []).filter(s => parseInt(s.reps) === reps).map(s => parseFloat(s.weight) || 0);
    if (weights.length === 0) return acc;
    acc.push({ date, val: Math.max(...weights) });
    return acc;
  }, []);
}

function renderGraph(keepSelection = false) {
  syncTimeFilterButtons();
  const canvas = document.getElementById('progress-chart');
  const emptyEl = document.getElementById('graph-empty');
  const panel = document.getElementById('graph-selection');

  const stats = getExerciseRepStats(currentExercise);
  const maxReps = getExerciseMaxReps(currentExercise);
  const reps = resolveGraphReps(stats, maxReps);
  setFieldBtnValue('graph-reps', String(reps), graphRepsLabel(reps));

  // Heaviest weight among sets with exactly `reps` reps, per session.
  let data = getExerciseRepSeries(currentExercise, reps);

  data = filterDataByRange(data);
  graphSeries = data;
  graphReps = reps;
  // A new series (other reps/period/exercise, or the screen just opened) starts on
  // its most recent point; a plain re-render (e.g. rotation) keeps the selection.
  if (!keepSelection || graphSelected < 0 || graphSelected >= data.length) graphSelected = data.length - 1;

  // A single real data point is still data (an exact-rep-count series is often sparse), so only "none" is empty.
  if (data.length < 1) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'flex';
    panel.classList.add('hidden');
    graphPlot = null;
    return;
  }
  canvas.style.display = 'block';
  emptyEl.style.display = 'none';
  panel.classList.remove('hidden');
  drawGraphChart();
  updateGraphPanel();
}

// Draws graphSeries filling the chart area, with the selected point ringed in green.
function drawGraphChart() {
  const canvas = document.getElementById('progress-chart');
  const wrap = document.getElementById('graph-chart-wrap');
  const ctx = canvas.getContext('2d');
  const data = graphSeries;

  const W = wrap.clientWidth || 340;
  const H = wrap.clientHeight || 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const vals = data.map(d => d.val);
  let minV = Math.min(...vals);
  let maxV = Math.max(...vals);
  // All values equal (e.g. a single point): pad the axis so the point sits mid-chart instead of on the floor.
  if (maxV === minV) { minV -= 1; maxV += 1; }
  const range = maxV - minV;
  const pad = { top: 24, right: 20, bottom: 36, left: 48 };
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
    x: data.length === 1 ? pad.left + gW / 2 : pad.left + (i / (data.length - 1)) * gW,
    y: pad.top + gH - ((d.val - minV) / range) * gH
  }));
  graphPlot = { pts };

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

  // Selected point: green ring around its (still blue) dot.
  const sel = pts[graphSelected];
  if (sel) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#4CAF50';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sel.x, sel.y, 9, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = '#9e9e9e'; ctx.font = '11px Roboto';
  const dateLabel = d => new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  if (data.length === 1) {
    ctx.textAlign = 'center';
    ctx.fillText(dateLabel(data[0]), pts[0].x, H - 10);
  } else {
    ctx.textAlign = 'left';
    ctx.fillText(dateLabel(data[0]), pad.left, H - 10);
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel(data[data.length-1]), pad.left + gW, H - 10);
  }
}

// Bottom panel: ‹ [weight × reps / date] ›, arrows disabled at the ends of the series.
function updateGraphPanel() {
  const pt = graphSeries[graphSelected];
  if (!pt) return;
  document.getElementById('graph-sel-main').textContent = `${pt.val} kg × ${graphReps} rep${graphReps === 1 ? '' : 's'}`;
  document.getElementById('graph-sel-date').textContent = formatDateStr(pt.date, 'detail');
  document.getElementById('btn-graph-prev').disabled = graphSelected <= 0;
  document.getElementById('btn-graph-next').disabled = graphSelected >= graphSeries.length - 1;
}

function selectGraphPoint(i) {
  if (i < 0 || i >= graphSeries.length) return;
  graphSelected = i;
  drawGraphChart();
  updateGraphPanel();
}

document.getElementById('btn-graph-prev').addEventListener('click', () => selectGraphPoint(graphSelected - 1));
document.getElementById('btn-graph-next').addEventListener('click', () => selectGraphPoint(graphSelected + 1));

// Tap on (or near) a point in the chart selects the nearest one within finger reach.
document.getElementById('progress-chart').addEventListener('click', e => {
  if (!graphPlot) return;
  const r = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bestD = GRAPH_TAP_RADIUS;
  graphPlot.pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  if (best >= 0) selectGraphPoint(best);
});

// Tapping the weight × reps text: overview of ALL of that day's sets for this exercise + "Go To" (same overlay as History/Calendar).
document.getElementById('graph-sel-info').addEventListener('click', () => {
  const pt = graphSeries[graphSelected];
  if (!pt) return;
  openHistoryGotoDaySets(pt.date, graphReps, pt.val);
});

// The chart fills whatever space the screen has, so redraw when that changes (rotation, window resize).
window.addEventListener('resize', () => {
  if (document.getElementById('tab-graph').classList.contains('active')) renderGraph(true);
});

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
function openWorkoutDetail(dateStr) {
  calDetailDate = dateStr;
  document.getElementById('cal-detail-date').textContent = formatDateStr(dateStr, 'detail');

  const body = document.getElementById('cal-detail-body');
  body.innerHTML = '';
  const exercises = (db.workouts[dateStr] || []).filter(ex => (ex.sets || []).length > 0);

  if (exercises.length === 0) {
    body.innerHTML = `<div class="records-empty">There is no workout saved for this day.</div>`;
    openOverlay('cal-detail-overlay');
    return;
  }

  exercises.forEach(ex => {
    const firstPRKeys = getPRSetKeys(ex.name);
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
        ${isPR ? prTrophySvg('history-set-pr') : `<span class="history-set-spacer"></span>`}
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
  currentDate = calDetailDate;
  if (overlayStack[overlayStack.length - 1] === 'cal-detail-overlay') {
    // History is [day overview, calendar, popup]: leave the popup AND the
    // calendar in ONE traversal (the popup's own entry is consumed by it, so no
    // closeOverlay()). Two back() calls right after each other used to leave a
    // dead back press behind.
    overlayStack.pop();
    document.getElementById('cal-detail-overlay').classList.remove('open');
    window.addEventListener('popstate', () => showScreen('screen-fitness-tracker'), { once: true });
    history.go(-2);
    return;
  }
  closeOverlay('cal-detail-overlay');
  goBack('screen-fitness-tracker');
});

let pendingEditExerciseOriginalName = null;

// -- Custom field picker (replaces native <select>/picker for Category/Type) --
const EX_TYPE_OPTIONS = [
  { value: 'weight_reps', label: 'Weight and Reps' },
  { value: 'reps_only', label: 'Reps Only' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
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

function populateNewExCategorySelect(selected) {
  setFieldBtnValue('new-ex-category', selected || '', selected || 'Choose category...');
}

function getNewExerciseFormSnapshot() {
  return {
    name: document.getElementById('new-ex-name').value,
    category: getFieldBtnValue('new-ex-category'),
    type: getFieldBtnValue('new-ex-type'),
    info: getExerciseInfoFormSnapshot(EXERCISE_INFO_FORMS.newEx),
  };
}
let newExerciseBaseline = null;

// Muscle group is always visible; Equipment setup is a collapsible row that
// starts collapsed every time the screen opens, even when it already has data.
function setNewExEquipmentOpen(open) {
  document.getElementById('btn-new-ex-equipment-toggle').setAttribute('aria-expanded', String(open));
  document.getElementById('new-ex-info-equipment-fields').classList.toggle('hidden', !open);
}
document.getElementById('btn-new-ex-equipment-toggle').addEventListener('click', e => {
  setNewExEquipmentOpen(e.currentTarget.getAttribute('aria-expanded') !== 'true');
});

function openNewExerciseScreen() {
  pendingEditExerciseOriginalName = null;
  document.getElementById('new-ex-title').textContent = 'New Exercise';
  document.getElementById('new-ex-name').value = '';
  setFieldBtnValue('new-ex-type', 'weight_reps', 'Weight and Reps');
  populateNewExCategorySelect();
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.newEx, {});
  setNewExEquipmentOpen(false);
  newExerciseBaseline = getNewExerciseFormSnapshot();
  showScreen('screen-new-exercise');
  setTimeout(() => document.getElementById('new-ex-name').focus(), 300);
}

function openEditExerciseScreen(ex) {
  pendingEditExerciseOriginalName = ex.name;
  document.getElementById('new-ex-title').textContent = 'Update Exercise';
  document.getElementById('new-ex-name').value = ex.name;
  const typeOpt = EX_TYPE_OPTIONS.find(o => o.value === ex.type) || EX_TYPE_OPTIONS[0];
  setFieldBtnValue('new-ex-type', typeOpt.value, typeOpt.label);
  populateNewExCategorySelect(ex.category);
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.newEx, getExerciseInfo(ex.name) || {});
  setNewExEquipmentOpen(false);
  newExerciseBaseline = getNewExerciseFormSnapshot();
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
    entry = { category: updated.category, name: updated.name, type: updated.type };
    db.custom_exercises.push(entry);
    if (!db.hiddenBuiltins) db.hiddenBuiltins = {};
    db.hiddenBuiltins[originalName] = true;
    persistHiddenBuiltins();
  }
  const nameChanged = updated.name !== originalName;
  entry.category = updated.category;
  entry.name = updated.name;
  entry.type = updated.type;
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
  if (!name) { toast('Enter a name'); return; }
  if (!cat) { toast('Choose a category'); return; }

  if (pendingEditExerciseOriginalName) {
    const nameTaken = name.toLowerCase() !== pendingEditExerciseOriginalName.toLowerCase()
      && allExercises().find(e => e.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) { toast('Exercise already exists'); return; }
    updateExistingExercise(pendingEditExerciseOriginalName, { category: cat, name, type });
    // After the rename above has moved any existing info over to the new name.
    setExerciseInfoFor(name, readExerciseInfoForm(EXERCISE_INFO_FORMS.newEx));
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
  db.custom_exercises.push({ category: cat, name, type });
  persistCustomExercises();
  setExerciseInfoFor(name, readExerciseInfoForm(EXERCISE_INFO_FORMS.newEx));
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

document.getElementById('btn-new-ex-back').addEventListener('click', () => goBack('screen-exercises', () => hasChanges(newExerciseBaseline, getNewExerciseFormSnapshot())));
document.getElementById('btn-new-ex-save').addEventListener('click', () => saveNewExerciseFromScreen());
document.getElementById('btn-new-ex-add-cat').addEventListener('click', () => {
  document.getElementById('new-category-input').value = '';
  openOverlay('new-category-overlay');
  setTimeout(() => document.getElementById('new-category-input').focus(), 100);
});
document.getElementById('btn-new-category-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges('', document.getElementById('new-category-input').value),
    () => closeOverlay('new-category-overlay')
  );
});
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
  'records-history-overlay': 'btn-records-history-ok',
  'new-category-overlay': 'btn-new-category-cancel',
  'cat-edit-overlay': 'btn-cat-edit-cancel',
  'delete-exercise-overlay': 'btn-delete-ex-cancel',
  'cat-delete-overlay': 'btn-cat-delete-cancel',
  'delete-plan-overlay': 'btn-delete-plan-cancel',
  'reset-overlay': 'btn-reset-cancel',
  'history-goto-overlay': 'history-goto-cancel',
  'discard-changes-overlay': 'btn-discard-changes-cancel',
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
  setupSwipeNav('home-content', navigateDay, { startGuard: () => homeSelMode });
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
  if (exerciseBrowserMode === 'exercises') {
    // Walk the same history stack as the hardware back button: popstate then
    // resets the list. Direct reset only if the filtered entry is missing.
    if (history.state && history.state.browse) history.back();
    else resetExerciseBrowseToCategories();
  } else {
    goBack('screen-fitness-tracker');
  }
});

document.getElementById('btn-new-exercise').addEventListener('click', openNewExerciseScreen);
document.getElementById('btn-back-training').addEventListener('click', () => goBack('screen-fitness-tracker', () => hasChanges(trackFieldsBaseline, getTrackFieldsSnapshot())));
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
document.getElementById('btn-back-records').addEventListener('click', () => goBack('screen-training'));
// One handler for the gold One Rep Max block and the list rows (both carry data-reps when they have data).
document.getElementById('records-scroll').addEventListener('click', e => {
  const row = e.target.closest('[data-reps]');
  if (row) openRecordsHistory(parseInt(row.dataset.reps));
});
document.getElementById('records-history-body').addEventListener('click', e => {
  const row = e.target.closest('.records-row-clickable');
  if (row) openHistoryGotoDaySets(row.dataset.date, recordsHistoryReps, parseFloat(row.dataset.val), 'records-history-overlay');
});
document.getElementById('btn-records-history-ok').addEventListener('click', () => closeOverlay('records-history-overlay'));
// Graph: straight to this exercise's Graph tab on the tapped rep count. History
// is [training, records, popup], so one go(-2) lands on the training screen via
// the normal popstate handler (the popup's own entry is consumed by it too,
// hence no closeOverlay()); the tab switch waits until that screen is showing.
document.getElementById('btn-records-history-graph').addEventListener('click', () => {
  const overlayId = 'records-history-overlay';
  if (overlayStack[overlayStack.length - 1] !== overlayId) return;
  overlayStack.pop();
  document.getElementById(overlayId).classList.remove('open');
  graphRepsByExercise[currentExercise] = recordsHistoryReps;
  currentTimeRange = 'all'; // same period the Graph tab opens on, so no record date is filtered out
  window.addEventListener('popstate', () => switchTab('graph'), { once: true });
  history.go(-2);
});
document.getElementById('btn-training-info').addEventListener('click', openExerciseInfo);
document.getElementById('btn-exercise-info-edit').addEventListener('click', showExerciseInfoEdit);
document.getElementById('btn-exercise-info-close').addEventListener('click', () => closeOverlay('exercise-info-overlay'));
document.getElementById('btn-exercise-info-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(exerciseInfoEditBaseline, getExerciseInfoFormSnapshot(EXERCISE_INFO_FORMS.overlay)),
    renderExerciseInfoView
  );
});
document.getElementById('btn-exercise-info-save').addEventListener('click', saveExerciseInfo);
document.getElementById('btn-set-note-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(setNoteBaseline, document.getElementById('set-note-input').value),
    () => { noteEditIndex = null; closeOverlay('set-note-overlay'); }
  );
});
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
  confirmDiscardIfChanged(
    () => hasChanges(commentEditBaseline, document.getElementById('comment-edit-input').value),
    () => {
      const text = commentPopupCtx && commentPopupCtx.getText();
      if (text && text.trim()) showCommentView(text);
      else closeOverlay('comment-overlay');
    }
  );
});
document.getElementById('btn-comment-delete').addEventListener('click', () => {
  if (commentPopupCtx) commentPopupCtx.onDelete();
  closeOverlay('comment-overlay');
  toast('Comment deleted');
});
document.getElementById('btn-comment-save').addEventListener('click', () => {
  const val = document.getElementById('comment-edit-input').value.trim();
  if (commentPopupCtx) commentPopupCtx.onSave(val);
  closeOverlay('comment-overlay');
  // Saving an emptied comment removes it, same as Delete.
  toast(val ? 'Comment saved' : 'Comment deleted');
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
document.getElementById('menu-card-calculator').addEventListener('click', () => showScreen('screen-calculator'));
document.getElementById('menu-card-nutrition').addEventListener('click', () => showScreen('screen-nutrition'));
document.getElementById('menu-card-progress').addEventListener('click', () => showScreen('screen-progress'));

document.getElementById('btn-home-from-tracker').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-workout-plan').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-nutrition').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-progress').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-calculator').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-calc-1rm').addEventListener('click', open1rmCalculator);
document.getElementById('btn-calc-warmup').addEventListener('click', openWarmupCalculator);
document.getElementById('btn-calc-plate').addEventListener('click', openPlateCalculator);

// -- 1RM Calculator ---------------------------------------
// Epley: 1RM = weight × (1 + reps / 30). Pure helpers sit between the markers
// below so they can be unit-tested headless (extracted and eval'd in Node).
// <1rm-pure>
const ORM_TABLE_REPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20];

// One rep IS the max by definition: raw Epley would give 103,3% for 1 rep, so 1 rep
// is special-cased (1RM = lifted weight; the 1-rep table row = 100%).
function epley1rm(weight, reps) { return reps === 1 ? weight : weight * (1 + reps / 30); }
function weightAtReps(oneRm, reps) { return reps === 1 ? oneRm : oneRm / (1 + reps / 30); }
function percentAtReps(reps) { return reps === 1 ? 100 : Math.round(100 / (1 + reps / 30)); }

function formatKg1(n) { return n.toFixed(1).replace('.', ','); }

// Strict parse (Dutch comma allowed); NaN for empty/garbage like "5abc".
function parseOrmNumber(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// Returns { error } or { oneRm, rows: [{ reps, weight, percent }] }.
function computeOneRm(weightStr, repsStr) {
  if (String(weightStr).trim() === '' || String(repsStr).trim() === '') return { error: 'Vul zowel gewicht als herhalingen in.' };
  const weight = parseOrmNumber(weightStr);
  const reps = parseOrmNumber(repsStr);
  if (!isFinite(weight) || weight <= 0) return { error: 'Gewicht moet een getal groter dan 0 zijn.' };
  if (!isFinite(reps) || reps < 1 || !Number.isInteger(reps)) return { error: 'Herhalingen moet een geheel getal van minimaal 1 zijn.' };
  const oneRm = epley1rm(weight, reps);
  const rows = ORM_TABLE_REPS.map(n => ({ reps: n, weight: weightAtReps(oneRm, n), percent: percentAtReps(n) }));
  return { oneRm, rows };
}
// </1rm-pure>

function open1rmCalculator() {
  document.getElementById('orm-weight').value = '';
  document.getElementById('orm-reps').value = '';
  ['orm-error', 'orm-result-card', 'orm-table-section'].forEach(id => document.getElementById(id).classList.add('hidden'));
  showScreen('screen-calculator-1rm');
}
document.getElementById('btn-orm-calculate').addEventListener('click', () => {
  const errEl = document.getElementById('orm-error');
  const res = computeOneRm(document.getElementById('orm-weight').value, document.getElementById('orm-reps').value);
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove('hidden');
    document.getElementById('orm-result-card').classList.add('hidden');
    document.getElementById('orm-table-section').classList.add('hidden');
    return;
  }
  errEl.classList.add('hidden');
  document.getElementById('orm-result-value').textContent = formatKg1(res.oneRm) + ' kg';
  document.getElementById('orm-table-body').innerHTML = res.rows.map(r =>
    `<div class="orm-table-row"><div>${r.reps}</div><div>${formatKg1(r.weight)} kg</div><div>${r.percent}%</div></div>`
  ).join('');
  document.getElementById('orm-result-card').classList.remove('hidden');
  document.getElementById('orm-table-section').classList.remove('hidden');
});
document.getElementById('btn-back-calculator-1rm').addEventListener('click', () => goBack('screen-calculator'));

// -- Warm-up Calculator -----------------------------------
// Pure logic sits between the markers so it can be unit-tested headless.
// <warmup-pure>
const WARMUP_BAR_KG = 20;
const WARMUP_EXERCISES = {
  bench:    { label: 'Bench',    firstStep: WARMUP_BAR_KG + 20, increment: 20, reps: [8, 5, 3, 2, 1] },
  squat:    { label: 'Squat',    firstStep: WARMUP_BAR_KG + 40, increment: 40, reps: [5, 3, 2, 1] },
  deadlift: { label: 'Deadlift', firstStep: 70,                 increment: 40, reps: [5, 3, 2, 1] },
};

const WARMUP_EPS = 1e-9;
const WARMUP_ROUND_KG = 2.5;
function floorTo2_5(x) { return Math.floor(x / WARMUP_ROUND_KG + WARMUP_EPS) * WARMUP_ROUND_KG; }

// Ladder steps (kg) strictly below 'last': firstStep, firstStep + increment, ...
function warmupLadder(cfg, last) {
  const steps = [];
  for (let w = cfg.firstStep; w < last - WARMUP_EPS; w += cfg.increment) steps.push(w);
  return steps;
}

// Requirement 2: every jump (bar -> ladder -> last step -> work set) is <= the jump before it.
function warmupJumpsDescend(steps, work) {
  const seq = [WARMUP_BAR_KG].concat(steps, [work]);
  for (let i = 2; i < seq.length; i++) {
    if (seq[i] - seq[i - 1] > seq[i - 1] - seq[i - 2] + WARMUP_EPS) return false;
  }
  return true;
}

// Loaded steps (kg, empty bar not included; ladder first, last step at the end) for a work weight:
//  Candidates for the last step are all multiples of 2.5 in [0.875 × W, 0.925 × W], ordered by
//  distance to exactly 10% below W (0.90 × W), heavier first on a tie.
//  1. First candidate whose whole schedule (bar -> ladder below it -> candidate -> work set)
//     has descending jumps.
//  2. None does: walk the same order and lower the ladder step just before the candidate (to a
//     multiple of 2.5) so the jump into it is at least as big as the jump on to the work set;
//     take the first candidate where that makes the schedule regular (else the closest one).
//  If the band holds no multiple of 2.5 (light work weights), the band top rounded down is used.
// Returns { steps, fallback, regular }.
function warmupLoadedSteps(exercise, workKg) {
  const cfg = WARMUP_EXERCISES[exercise];
  const lo = 0.875 * workKg, hi = 0.925 * workKg, target = 0.9 * workKg;

  let cands = [];
  for (let k = Math.ceil(lo / WARMUP_ROUND_KG - WARMUP_EPS); k * WARMUP_ROUND_KG <= hi + WARMUP_EPS; k++) cands.push(k * WARMUP_ROUND_KG);
  if (!cands.length) cands = [floorTo2_5(hi)];
  cands = cands.filter(c => c > WARMUP_BAR_KG + WARMUP_EPS);
  if (!cands.length) return { steps: [], fallback: true, regular: true };
  cands.sort((a, b) => {
    const da = Math.abs(a - target), db = Math.abs(b - target);
    return Math.abs(da - db) > WARMUP_EPS ? da - db : b - a;
  });

  for (const last of cands) {
    const steps = warmupLadder(cfg, last).concat([last]);
    if (warmupJumpsDescend(steps, workKg)) return { steps, fallback: false, regular: true };
  }

  const lowered = cands.map(last => {
    const ladder = warmupLadder(cfg, last);
    if (ladder.length) {
      const prev = ladder.length > 1 ? ladder[ladder.length - 2] : WARMUP_BAR_KG;
      const step = Math.min(ladder[ladder.length - 1], floorTo2_5(2 * last - workKg));
      if (step > prev + WARMUP_EPS) ladder[ladder.length - 1] = step;
    }
    const steps = ladder.concat([last]);
    return { steps, fallback: true, regular: warmupJumpsDescend(steps, workKg) };
  });
  return lowered.find(r => r.regular) || lowered[0];
}

// N <= reps.length: last N values of the series; N > length: full series for the
// first steps, then 1 rep for every extra step.
function warmupReps(n, series) {
  if (n <= series.length) return series.slice(series.length - n);
  return series.concat(new Array(n - series.length).fill(1));
}

function parseWarmupNumber(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// Returns { error } or { rows: [{ bar?, weight, reps?, work? }], tooLight, regular }.
function computeWarmup(exercise, workStr) {
  const cfg = WARMUP_EXERCISES[exercise];
  if (!cfg) return { error: 'Kies een oefening.' };
  if (String(workStr == null ? '' : workStr).trim() === '') return { error: 'Vul een werkgewicht in.' };
  const work = parseWarmupNumber(workStr);
  if (!isFinite(work) || work <= 0) return { error: 'Werkgewicht moet een getal groter dan 0 zijn.' };
  if (work <= WARMUP_BAR_KG) return { error: 'Werkgewicht moet zwaarder zijn dan de lege stang (' + WARMUP_BAR_KG + ' kg).' };
  const plan = warmupLoadedSteps(exercise, work);
  const steps = plan.steps;
  const reps = warmupReps(steps.length, cfg.reps);
  const rows = [{ bar: true, weight: WARMUP_BAR_KG, reps: 10 }];
  steps.forEach((w, i) => rows.push({ weight: w, reps: reps[i] }));
  rows.push({ weight: work, work: true });
  return { rows, tooLight: steps.length === 0, regular: plan.regular };
}
// </warmup-pure>

let warmupExercise = 'bench';
function openWarmupCalculator() {
  warmupExercise = 'bench';
  document.querySelectorAll('#warmup-ex-options .plate-bar-option').forEach(o => o.classList.toggle('selected', o.dataset.ex === warmupExercise));
  document.getElementById('warmup-weight').value = '';
  ['warmup-error', 'warmup-result-card'].forEach(id => document.getElementById(id).classList.add('hidden'));
  showScreen('screen-calculator-warmup');
}
document.getElementById('warmup-ex-options').addEventListener('click', e => {
  const opt = e.target.closest('.plate-bar-option');
  if (!opt) return;
  warmupExercise = opt.dataset.ex;
  document.querySelectorAll('#warmup-ex-options .plate-bar-option').forEach(o => o.classList.toggle('selected', o === opt));
});
document.getElementById('btn-warmup-calculate').addEventListener('click', () => {
  const errEl = document.getElementById('warmup-error');
  const card = document.getElementById('warmup-result-card');
  const res = computeWarmup(warmupExercise, document.getElementById('warmup-weight').value);
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove('hidden');
    card.classList.add('hidden');
    return;
  }
  errEl.classList.add('hidden');
  document.getElementById('warmup-result-list').innerHTML = res.rows.map(r => {
    if (r.bar) return `<div class="plate-result-line">Lege stang × ${r.reps}</div>`;
    if (r.work) return `<div class="plate-result-line warmup-line-work">${formatKg(r.weight)} kg (werkset)</div>`;
    return `<div class="plate-result-line">${formatKg(r.weight)} kg × ${r.reps}</div>`;
  }).join('');
  const noteEl = document.getElementById('warmup-result-note');
  noteEl.textContent = 'Werkgewicht te laag voor tussenstappen — alleen lege stang, dan de werkset.';
  noteEl.classList.toggle('hidden', !res.tooLight);
  card.classList.remove('hidden');
});
document.getElementById('btn-back-calculator-warmup').addEventListener('click', () => goBack('screen-calculator'));

// -- Plate Calculator -------------------------------------
// Counts are the TOTAL number of that plate owned by the gym; only floor(count/2)
// of each type are usable per side of a symmetrically-loaded bar. `weight` is the
// average real weight used for the actual math; `deviation` is that plate's max
// deviation from its nominal weight (0 = exact), used both to flag an approximate
// result (any deviation > 0 plate in the chosen combo) and as the tie-break when
// multiple combinations land equally close to the target.
const PLATE_TYPES = [
  { id: 'p25', label: '25 kg', weight: 25, deviation: 0.2, defaultCount: 4 },
  { id: 'p20White', label: '20 kg wit', weight: 20.8, deviation: 0.1, defaultCount: 4 },
  { id: 'p20WhiteHandles', label: '20 kg wit met handvaten', weight: 20.3, deviation: 0, defaultCount: 2 },
  { id: 'p20BlackHandles', label: '20 kg zwart met handvaten', weight: 20.4, deviation: 0, defaultCount: 2 },
  { id: 'p15White', label: '15 kg wit', weight: 14.9, deviation: 0.4, defaultCount: 6 },
  { id: 'p15WhiteHandles', label: '15 kg wit met handvaten', weight: 15.3, deviation: 0, defaultCount: 2 },
  { id: 'p15BlackHandles', label: '15 kg zwart met handvaten', weight: 15, deviation: 0, defaultCount: 2 },
  { id: 'p10New', label: '10 kg nieuwe schijven', weight: 9.7, deviation: 0.1, defaultCount: 10 },
  { id: 'p10White', label: '10 kg wit', weight: 9.9, deviation: 0.4, defaultCount: 6 },
  { id: 'p10WhiteHandles', label: '10 kg wit met handvaten', weight: 10.5, deviation: 0, defaultCount: 2 },
  { id: 'p10BlackHandles', label: '10 kg zwart met handvaten', weight: 10.3, deviation: 0, defaultCount: 2 },
  { id: 'p5New', label: '5 kg nieuwe schijven', weight: 5, deviation: 0, defaultCount: 10 },
  { id: 'p5White', label: '5 kg wit', weight: 5, deviation: 0, defaultCount: 8 },
  { id: 'p5Black', label: '5 kg zwart', weight: 5.2, deviation: 0, defaultCount: 2 },
  { id: 'p2_5', label: '2,5 kg', weight: 2.5, deviation: 0, defaultCount: 6 },
  { id: 'p2', label: '2 kg', weight: 2, deviation: 0, defaultCount: 6 },
  { id: 'p1', label: '1 kg', weight: 1, deviation: 0, defaultCount: 6 },
  { id: 'p1Own', label: '1 kg eigen schijven', weight: 1, deviation: 0, defaultCount: 2 },
  { id: 'p0_5Own', label: '0,5 kg eigen schijven', weight: 0.5, deviation: 0, defaultCount: 2 },
  { id: 'p0_25Own', label: '0,25 kg eigen schijven', weight: 0.25, deviation: 0, defaultCount: 2 },
];
const PLATE_MAX_COUNT = 40; // per-type stepper ceiling (20 usable per side) — already far beyond any real rack

function getPlateCount(id) {
  const stored = (db.plateInventory || {})[id];
  if (stored !== undefined) return stored;
  const def = PLATE_TYPES.find(p => p.id === id);
  return def ? def.defaultCount : 0;
}
// "Beschikbaar" ceiling: the gym's real stock, i.e. the same defaultCount that
// "Reset beschikbaar" restores. (Not to be confused with PLATE_MAX_COUNT, the
// far looser ceiling the solver applies to whatever count is stored.)
function getPlateAvailableMax(id) {
  const def = PLATE_TYPES.find(p => p.id === id);
  return def ? def.defaultCount : 0;
}
function setPlateCount(id, count) {
  if (!db.plateInventory) db.plateInventory = {};
  db.plateInventory[id] = count;
  persistPlateInventory();
}
// "Op stang" (per side, not a gym-wide total like `getPlateCount` above) —
// always defaults to 0, no preset inventory to fall back to.
function getPlateOnBarCount(id) { return (db.plateOnBar || {})[id] || 0; }
function setPlateOnBarCount(id, count) {
  if (!db.plateOnBar) db.plateOnBar = {};
  db.plateOnBar[id] = count;
  persistPlateOnBar();
}
// Can never exceed half of what's available (you only have that many per side).
function getPlateOnBarMax(id) { return Math.floor(getPlateCount(id) / 2); }
// Called whenever "Beschikbaar" goes down (stepper, Reset, Clear) so "Op
// stang" never gets left above the new max. Mutates in place without
// persisting — callers persist once after clamping everything they touched.
function clampOnBarToAvailable(id) {
  const max = getPlateOnBarMax(id);
  if (getPlateOnBarCount(id) > max) {
    if (!db.plateOnBar) db.plateOnBar = {};
    db.plateOnBar[id] = max;
    return true;
  }
  return false;
}
function clampAllOnBarToAvailable() {
  let changed = false;
  PLATE_TYPES.forEach(p => { if (clampOnBarToAvailable(p.id)) changed = true; });
  if (changed) persistPlateOnBar();
}

// Dutch-locale kg formatting: 2 decimals max, trailing zeros trimmed, comma separator.
function formatKg(n) {
  let s = (Math.round(n * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

function renderPlateList() {
  document.getElementById('plate-list').innerHTML = PLATE_TYPES.map(p => {
    const meta = p.deviation > 0
      ? `Gem. ${formatKg(p.weight)} kg · max ±${formatKg(p.deviation)} kg`
      : `${formatKg(p.weight)} kg`;
    const onBarCount = getPlateOnBarCount(p.id);
    const onBarAtMax = onBarCount >= getPlateOnBarMax(p.id);
    const availableAtMax = getPlateCount(p.id) >= getPlateAvailableMax(p.id);
    return `
      <div class="plate-row" data-plate-id="${p.id}">
        <div class="plate-row-info">
          <span class="plate-row-name">${p.label}</span>
          <span class="plate-row-meta">${meta}</span>
        </div>
        <div class="plate-stepper" data-kind="available">
          <button type="button" class="plate-stepper-btn" data-dir="-">−</button>
          <span class="plate-stepper-count">${getPlateCount(p.id)}</span>
          <button type="button" class="plate-stepper-btn" data-dir="+"${availableAtMax ? ' disabled' : ''}>+</button>
        </div>
        <div class="plate-stepper" data-kind="onbar">
          <button type="button" class="plate-stepper-btn" data-dir="-">−</button>
          <span class="plate-stepper-count">${onBarCount}</span>
          <button type="button" class="plate-stepper-btn" data-dir="+"${onBarAtMax ? ' disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('plate-list').addEventListener('click', e => {
  const btn = e.target.closest('.plate-stepper-btn');
  if (!btn) return;
  const stepper = btn.closest('.plate-stepper');
  const row = btn.closest('.plate-row');
  const id = row.dataset.plateId;
  if (stepper.dataset.kind === 'onbar') {
    let count = getPlateOnBarCount(id);
    const max = getPlateOnBarMax(id);
    count = btn.dataset.dir === '+' ? Math.min(max, count + 1) : Math.max(0, count - 1);
    setPlateOnBarCount(id, count);
  } else {
    let count = getPlateCount(id);
    const max = getPlateAvailableMax(id);
    // A previously stored count above the cap is left alone by "+" (never snapped down).
    if (btn.dataset.dir === '+') count = count >= max ? count : count + 1;
    else count = Math.max(0, count - 1);
    setPlateCount(id, count);
    if (clampOnBarToAvailable(id)) persistPlateOnBar();
  }
  renderPlateList();
});
document.getElementById('btn-plate-reset').addEventListener('click', () => {
  db.plateInventory = {};
  PLATE_TYPES.forEach(p => { db.plateInventory[p.id] = p.defaultCount; });
  persistPlateInventory();
  clampAllOnBarToAvailable();
  renderPlateList();
});
document.getElementById('btn-plate-clear').addEventListener('click', () => {
  db.plateInventory = {};
  PLATE_TYPES.forEach(p => { db.plateInventory[p.id] = 0; });
  persistPlateInventory();
  clampAllOnBarToAvailable();
  renderPlateList();
});
document.getElementById('btn-plate-clear-onbar').addEventListener('click', () => {
  db.plateOnBar = {};
  PLATE_TYPES.forEach(p => { db.plateOnBar[p.id] = 0; });
  persistPlateOnBar();
  renderPlateList();
});
document.getElementById('plate-bar-options').addEventListener('click', e => {
  const opt = e.target.closest('.plate-bar-option');
  if (!opt) return;
  document.querySelectorAll('.plate-bar-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
});

// A plate's max deviation only matters for tie-breaking once it's 0.4kg or
// higher — 0 through 0.3 all count as "no deviation" and must never lose out
// to a bigger, lower-plate-count combo just because a 0.1/0.2/0.3 plate was
// involved. `penaltyTenths` is 0 for the equivalent tier, and the actual
// deviation (in tenths) for the "last resort" tier.
const PLATE_DEVIATION_EQUIVALENT_MAX_TENTHS = 3; // 0.3kg — anything <= this is "no deviation"
function platePenaltyTenths(deviation) {
  const tenths = Math.round(deviation * 10);
  return tenths > PLATE_DEVIATION_EQUIVALENT_MAX_TENTHS ? tenths : 0;
}

// Rank 0 = heaviest distinct plate weight, increasing for lighter weights;
// plates that share an identical weight (e.g. the two 5kg or two 1kg types)
// share a rank, since this only cares about the weight value, not which
// plate it is.
const PLATE_WEIGHT_RANKS = [...new Set(PLATE_TYPES.map(p => p.weight))].sort((a, b) => b - a);
function plateWeightRank(weight) { return PLATE_WEIGHT_RANKS.indexOf(weight); }

// Priority-cost encoding, as a BigInt so none of these tiers can ever bleed
// into one another regardless of how many plates get combined. From most to
// least significant (each tier only ever breaks a tie left by the one above
// it — this is a single exhaustive DP over ALL plate types together, not a
// sequence of independent greedy passes, so an earlier tier can never be
// undermined by a later one):
//   tier 1 (BAD_DEVIATION_WEIGHT): one huge step per "last resort" plate
//     (deviation >= 0.4kg) used — dominates every tier below it, so the DP
//     always minimizes how many of these it needs FIRST, even if avoiding
//     them costs more total plates or smaller ones. 0 for the "equivalent"
//     tier (deviation <= 0.3kg).
//   tier 2 (COUNT_WEIGHT): one step per plate used (bad or not), dominating
//     tiers 3-4 — among combos tied on tier 1, fewest total plates wins.
//   tier 3 (rank place-value): among combos ALSO tied on plate count, a
//     plate's rank SUBTRACTS RANK_UNIT * RANK_BASE^(rank-from-lightest) from
//     its cost, biasing the minimizing DP toward heavier plates. RANK_BASE
//     comfortably exceeds any plausible per-rank plate count, so this is a
//     positional number system — one more plate at a heavier rank always
//     outweighs any number of plates at every lighter rank combined, i.e.
//     "compare the used weights largest-first, first difference wins" (a
//     fixed-length leximax comparison, since the count is already pinned).
//   tier 4 (penaltyTenths): the deviation tie-break, only reached once plate
//     count AND the largest-plates-first comparison also tie.
// Plain JS numbers lose integer precision far before these magnitudes, so
// this needs BigInt; DP costs and the `dp`/`next` arrays are BigInt
// throughout (`null` stands in for the old `Infinity` = "unreachable").
const PLATE_BAD_DEVIATION_WEIGHT = 10n ** 70n;
const PLATE_COUNT_WEIGHT = 10n ** 60n;
const PLATE_RANK_UNIT = 100000n;
const PLATE_RANK_BASE = 1000n;
function platePriorityCost(p) {
  const penaltyTenths = platePenaltyTenths(p.deviation);
  const badDeviationCost = penaltyTenths > 0 ? PLATE_BAD_DEVIATION_WEIGHT : 0n;
  const rankFromLightest = PLATE_WEIGHT_RANKS.length - 1 - plateWeightRank(p.weight);
  const rankValue = PLATE_RANK_UNIT * (PLATE_RANK_BASE ** BigInt(rankFromLightest));
  // rankValue is subtracted, not added: a heavier plate (bigger rankValue)
  // must LOWER the total cost so the minimizing DP prefers it — that's what
  // makes "largest first" actually win instead of "smallest first".
  return badDeviationCost + PLATE_COUNT_WEIGHT - rankValue + BigInt(penaltyTenths);
}

// Bounded-knapsack DP: for every achievable per-side sum (in integer centikg
// units, to avoid float drift), tracks the minimal priority-cost needed to
// reach it, plus (via `choice`) how many of the current plate type were used
// — enough to both pick the best sum and reconstruct which plates make it up.
// `DP_MAX_UNITS` caps the search array at 600kg/side regardless of how large
// user-entered counts get, so even a pathological "max every stepper" input
// stays fast.
const PLATE_DP_MAX_UNITS = 60000;
function calcPlateCombo(targetPerSideKg, countsObj) {
  const items = PLATE_TYPES.map(p => {
    const count = countsObj[p.id] !== undefined ? countsObj[p.id] : p.defaultCount;
    return {
      ...p,
      weightUnits: Math.round(p.weight * 100),
      unitCost: platePriorityCost(p),
      maxUse: Math.max(0, Math.floor(Math.min(count, PLATE_MAX_COUNT) / 2)),
    };
  });
  const rangeMax = Math.min(PLATE_DP_MAX_UNITS, items.reduce((sum, it) => sum + it.weightUnits * it.maxUse, 0));
  const targetUnits = Math.round(Math.max(0, targetPerSideKg) * 100);

  let dp = new Array(rangeMax + 1).fill(null);
  dp[0] = 0n;
  const choice = items.map(() => new Array(rangeMax + 1).fill(0));

  items.forEach((it, i) => {
    const next = dp.slice();
    if (it.weightUnits > 0 && it.maxUse > 0) {
      for (let s = 0; s <= rangeMax; s++) {
        if (dp[s] === null) continue;
        let cost = dp[s];
        for (let k = 1; k <= it.maxUse; k++) {
          const s2 = s + k * it.weightUnits;
          if (s2 > rangeMax) break;
          cost += it.unitCost;
          if (next[s2] === null || cost < next[s2]) { next[s2] = cost; choice[i][s2] = k; }
        }
      }
    }
    dp = next;
  });

  let bestS = 0, bestDiff = Infinity, bestCost = null;
  for (let s = 0; s <= rangeMax; s++) {
    if (dp[s] === null) continue;
    const diff = Math.abs(s - targetUnits);
    if (diff < bestDiff || (diff === bestDiff && dp[s] < bestCost)) {
      bestDiff = diff; bestCost = dp[s]; bestS = s;
    }
  }

  const used = [];
  let s = bestS;
  for (let i = items.length - 1; i >= 0; i--) {
    const k = choice[i][s];
    if (k > 0) {
      used.unshift({ id: items[i].id, label: items[i].label, deviation: items[i].deviation, count: k });
      s -= k * items[i].weightUnits;
    }
  }

  return { perSideKg: bestS / 100, exact: bestS === targetUnits, used };
}

// Per-side weight already mounted, straight from the "Op stang" column (a
// direct per-side count, unlike `getPlateCount`'s gym-wide total).
function calcOnBarWeightPerSide() {
  return PLATE_TYPES.reduce((sum, p) => sum + getPlateOnBarCount(p.id) * p.weight, 0);
}
// Everything currently on the bar: both sides' plates plus the bar itself
// (0 for Leg press, which then is just the plates).
function calcCurrentBarTotal(barWeight) {
  return barWeight + calcOnBarWeightPerSide() * 2;
}
// Same rule as the final total's "±": any mounted plate type with a deviation > 0.
function onBarHasDeviation() {
  return PLATE_TYPES.some(p => getPlateOnBarCount(p.id) > 0 && p.deviation > 0);
}
// What calcPlateCombo() may still ADD per side: floor(available/2) minus
// what's already mounted, never negative. calcPlateCombo() itself halves
// whatever raw count it's given, so this hands it `2 * maxUse` to get that
// exact usable count back out unchanged.
function buildAvailableForAddCounts() {
  const adjusted = {};
  PLATE_TYPES.forEach(p => {
    const maxUse = Math.max(0, Math.floor(getPlateCount(p.id) / 2) - getPlateOnBarCount(p.id));
    adjusted[p.id] = maxUse * 2;
  });
  return adjusted;
}
// What calcPlateCombo() may pick from when REMOVING: only what's currently
// mounted per side, expressed the same "raw count" way as above.
function buildOnBarCountsForRemoval() {
  const adjusted = {};
  PLATE_TYPES.forEach(p => { adjusted[p.id] = getPlateOnBarCount(p.id) * 2; });
  return adjusted;
}

function renderPlateResult(remainingPerSide, targetWeight, barWeight, onBarWeightPerSide) {
  const card = document.getElementById('plate-result-card');
  card.classList.remove('hidden');
  const titleEl = document.getElementById('plate-result-title');
  const listEl = document.getElementById('plate-result-list');
  const noteEl = document.getElementById('plate-result-note');
  document.getElementById('plate-result-current-total').textContent = (onBarHasDeviation() ? '±' : '') + formatKg(calcCurrentBarTotal(barWeight)) + ' kg';

  if (Math.round(remainingPerSide * 100) === 0) {
    titleEl.textContent = 'Per kant';
    listEl.innerHTML = `<div class="plate-result-empty">Niets bijleggen of weghalen — je zit al op het doelgewicht.</div>`;
    document.getElementById('plate-result-total').textContent = formatKg(barWeight + onBarWeightPerSide * 2) + ' kg';
    noteEl.classList.add('hidden');
    return;
  }

  const removing = remainingPerSide < 0;
  const result = removing
    ? calcPlateCombo(-remainingPerSide, buildOnBarCountsForRemoval())
    : calcPlateCombo(remainingPerSide, buildAvailableForAddCounts());

  titleEl.textContent = removing ? 'Haal per kant weg' : 'Erbij per kant';
  listEl.innerHTML = result.used.length === 0
    ? `<div class="plate-result-empty">Geen schijven nodig</div>`
    : result.used.map(u => `<div class="plate-result-line">${u.count}x ${u.label}</div>`).join('');

  const finalOnBarWeight = removing ? onBarWeightPerSide - result.perSideKg : onBarWeightPerSide + result.perSideKg;
  const totalWeight = barWeight + finalOnBarWeight * 2;
  const hasDeviation = result.used.some(u => u.deviation > 0);
  document.getElementById('plate-result-total').textContent = (hasDeviation ? '±' : '') + formatKg(totalWeight) + ' kg';

  if (!result.exact) {
    const diff = Math.abs(targetWeight - totalWeight);
    noteEl.textContent = `Doel niet exact haalbaar — dichtstbijzijnde combinatie, ${formatKg(diff)} kg verschil`;
    noteEl.classList.remove('hidden');
  } else {
    noteEl.classList.add('hidden');
  }
}

document.getElementById('btn-plate-calculate').addEventListener('click', () => {
  const targetWeight = parseFloat((document.getElementById('plate-target-weight').value || '').replace(',', '.')) || 0;
  const barOpt = document.querySelector('.plate-bar-option.selected');
  const barWeight = barOpt ? parseFloat(barOpt.dataset.val) : 20;
  const targetPerSide = (targetWeight - barWeight) / 2;
  const onBarWeightPerSide = calcOnBarWeightPerSide();
  const remainingPerSide = targetPerSide - onBarWeightPerSide;
  renderPlateResult(remainingPerSide, targetWeight, barWeight, onBarWeightPerSide);
});

function openPlateCalculator() {
  document.getElementById('plate-target-weight').value = '';
  document.querySelectorAll('.plate-bar-option').forEach((o, i) => o.classList.toggle('selected', i === 0));
  document.getElementById('plate-result-card').classList.add('hidden');
  renderPlateList();
  showScreen('screen-calculator-plate');
}
document.getElementById('btn-back-calculator-plate').addEventListener('click', () => goBack('screen-calculator'));

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

// Plan writes are awaited by their callers, which previously saw the rejection;
// keep that (report, then rethrow) so a failed write still stops the flow
// instead of the caller announcing success right after the error toast.
async function persistPlan(planId, planData) {
  if (!currentUser) return;
  try { await plansCol().doc(planId).set(planData); } catch (e) { persistFailed(e); throw e; }
}
async function deletePlanDoc(planId) {
  if (!currentUser) return;
  try { await plansCol().doc(planId).delete(); } catch (e) { persistFailed(e); throw e; }
}
async function persistActivePlan(data) {
  if (!currentUser) return;
  if (!data) { await activePlanDoc().delete().catch(persistFailed); return; }
  try { await activePlanDoc().set(data); } catch (e) { persistFailed(e); throw e; }
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

// -- Delete plan confirmation ----------------------------
let pendingDeletePlanId = null;
let pendingDeletePlanOnDeleted = null;

function openDeletePlanConfirm(planId, planName, onDeleted) {
  pendingDeletePlanId = planId;
  pendingDeletePlanOnDeleted = onDeleted || null;
  document.getElementById('delete-plan-msg').textContent = `Delete "${planName}"? This can't be undone.`;
  openOverlay('delete-plan-overlay');
}

document.getElementById('btn-delete-plan-cancel').addEventListener('click', () => {
  pendingDeletePlanId = null;
  pendingDeletePlanOnDeleted = null;
  closeOverlay('delete-plan-overlay');
});
document.getElementById('btn-delete-plan-confirm').addEventListener('click', async () => {
  if (!pendingDeletePlanId) return;
  const planId = pendingDeletePlanId;
  const onDeleted = pendingDeletePlanOnDeleted;
  pendingDeletePlanId = null;
  pendingDeletePlanOnDeleted = null;
  closeOverlay('delete-plan-overlay');
  await deletePlan(planId);
  if (onDeleted) onDeleted();
});

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
        { label: 'Delete', action: () => openDeletePlanConfirm(plan.id, plan.name) },
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
    const items = [...list.querySelectorAll('.pde-item')];
    ({ startY: pdeDragStartY, dy: pdeDragDy } = dragReorderStep({
      item: pdeDragItem, startY: pdeDragStartY, transformEl: pdeDragItem.querySelector('.pde-item-inner'),
      items, touchY: e.touches[0].clientY,
    }));
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
    toast('Removed from plan');
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
      openDeletePlanConfirm(currentPlanId, currentPlanData.name, () => showScreen('screen-workout-plan'));
    }},
  ], e.currentTarget);
});

document.getElementById('btn-back-plan-detail').addEventListener('click', () => goBack('screen-workout-plan'));

// ── AI Generate Screen ────────────────────────────────
function getAiGenFormSnapshot() {
  return {
    goal: document.querySelector('#chips-goal .chip.active')?.dataset.val || '',
    level: document.querySelector('#chips-level .chip.active')?.dataset.val || '',
    days: document.querySelector('#chips-days .chip.active')?.dataset.val || '',
    pref: document.getElementById('ai-gen-pref').value,
  };
}
// The chip defaults as they appear in index.html's static markup. Note:
// openAIGenerate() below only ever resets the Preference textarea, not the
// chip selections themselves — so if a chip was left non-default from an
// earlier visit, this baseline (matching the ORIGINAL defaults, not
// "whatever's currently selected") could flag that leftover selection as an
// "unsaved change" even if nothing was touched this visit. Pre-existing
// screen behavior, not something this discard-check changes.
const AI_GEN_DEFAULT_SNAPSHOT = { goal: 'Muscle Growth', level: 'Intermediate', days: '4', pref: '' };

function openAIGenerate() {
  document.getElementById('ai-gen-form').classList.remove('hidden');
  document.getElementById('ai-gen-loading').classList.add('hidden');
  document.getElementById('ai-gen-pref').value = '';
  showScreen('screen-ai-generate');
}

document.getElementById('btn-back-ai-generate').addEventListener('click', () => goBack('screen-workout-plan', () => hasChanges(AI_GEN_DEFAULT_SNAPSHOT, getAiGenFormSnapshot())));

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
function getNewPlanFormSnapshot() {
  return {
    name: document.getElementById('new-plan-name').value,
    days: document.querySelector('#chips-new-plan-days .chip.active')?.dataset.val || '',
  };
}
const NEW_PLAN_DEFAULT_SNAPSHOT = { name: '', days: '3' };

function openMakeYourOwn() {
  document.getElementById('new-plan-name').value = '';
  document.querySelectorAll('#chips-new-plan-days .chip').forEach(c => c.classList.remove('active'));
  document.querySelector('#chips-new-plan-days [data-val="3"]').classList.add('active');
  openOverlay('new-plan-overlay');
}

document.getElementById('btn-plan-make-own').addEventListener('click', openMakeYourOwn);
document.getElementById('btn-plan-presets').addEventListener('click', openPresetsOverlay);
document.getElementById('btn-plan-ai').addEventListener('click', openAIGenerate);
document.getElementById('btn-new-plan-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(NEW_PLAN_DEFAULT_SNAPSHOT, getNewPlanFormSnapshot()),
    () => closeOverlay('new-plan-overlay')
  );
});
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
async function openLoadWorkout(planId, dayIndex) {
  currentLoadPlanId = planId;
  currentLoadDayIndex = dayIndex;
  const plan = db.plans[planId];
  if (!plan || !plan.days[dayIndex]) { toast('Could not load day'); return; }
  const day = plan.days[dayIndex];

  document.getElementById('load-workout-title').textContent = 'Load: ' + day.name;
  document.getElementById('lw-scroll').innerHTML = '<div style="padding:32px;text-align:center;color:#555">Loading...</div>';
  showScreen('screen-load-workout');

  loadWorkoutItems = (day.exercises || []).map(ex => ({ name: ex.name, sets: ex.sets, reps: ex.reps, selected: true }));

  renderLoadWorkoutList();
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
    card.innerHTML = `
      <div class="lw-ex-header">
        <div class="lw-checkbox ${item.selected ? 'checked' : ''}" data-idx="${idx}"></div>
        <div class="lw-ex-name">${item.name}</div>
        <div class="lw-ex-sets">${item.sets}×${item.reps}</div>
      </div>
    `;
    card.querySelector('[data-idx]').addEventListener('click', e => {
      e.stopPropagation();
      loadWorkoutItems[idx].selected = !loadWorkoutItems[idx].selected;
      renderLoadWorkoutList();
    });
    scroll.appendChild(card);
  });
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

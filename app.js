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
// Fitness Tracker's long-press selection mode (see createSelectionMode).
const homeSel = createSelectionMode({
  screenId: 'screen-fitness-tracker', countId: 'home-sel-count',
  countLabel: n => (n === 1 ? '1 exercise' : `${n} exercises`),
});
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
// Dates are plain 'YYYY-MM-DD' strings. "Today" is always the date in Amsterdam
// (Europe/Amsterdam: winter/summer time handled by the browser's tz data), whatever
// the device's own clock zone — never UTC, which is still "yesterday" until 01:00/
// 02:00 local. Day arithmetic on the strings goes through UTC midnight, which has
// no DST jumps, so adding days never skips or repeats one.
const amsterdamDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
function todayStr() {
  const p = {};
  amsterdamDateFormat.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
function addDaysToDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
// 0 = Maandag .. 6 = Zondag (like WEEKDAY_FULL_NAMES).
function weekdayOfDateStr(dateStr) {
  return (new Date(dateStr + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

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
    const yesterday = addDaysToDateStr(today, -1);
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
  currentDate = addDaysToDateStr(currentDate, delta);
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
let bannerDismissed = false;
let bannerSuggestedPick = null; // the getTodaysScheduledDay() result the banner is showing
let selectedSetIndex = null;
let currentTimeRange = 'all';
let calLoadedMonths = []; // ascending {year, month} entries currently rendered in the calendar scroller
let calSelectedDate = null;
let calWorkoutDates = []; // ascending date strings that have a logged workout, cached while the calendar screen is open
let calDetailDate = null;
let calScrollLock = false;
let exerciseBrowserMode = 'categories';
let currentBrowseCategory = null;
// The exercise browser (screen-exercises) doubles as the Plan Day "Add Exercise" flow
// for a plan day's pencil icon: 'browse' is its normal Fitness Tracker behavior
// (tapping a row opens Training), 'plan-add' is the plan flow (each row gets its own
// Voeg toe/Toegevoegd button that writes straight into the plan day being edited —
// see currentEditDayIndex/planDayHasExercise/addExerciseToPlanDay — and NEVER touches
// a Fitness Tracker workout).
let exerciseScreenMode = 'browse';
let exerciseLoadDayName = '';
// Plan Detail's editable state (toggled via ⋮ → Bewerken/Klaar): adds rename pencils,
// swaps the day pencil for a delete button, and shows Dag/Week toevoegen blocks.
let planDetailEditMode = false;
// Accordion state for the day cards on screen-plan-detail: the day index whose
// inline preview is expanded, or null if none is. Only one at a time.
let expandedPlanDayIndex = null;
let pendingRenameDayIndex = null; // null while renaming the plan itself, else a day index
let planRenameBaseline = '';
let pendingDeleteDayIndex = null;
let pendingAddDayGroup; // undefined | 'A' | 'B' — which week's "Dag toevoegen" was tapped
let currentEditDayIndex = null;
let pdeDragItem = null;
let pdeDragStartY = 0;
let pdeDragDy = 0;
let pendingPdeSetsRepsIndex = null;
let pendingPdeDeleteIndices = null; // exercise indices #delete-pde-exercise-overlay would delete
// Plan Day Edit's long-press selection mode — same component as the Fitness Tracker's.
const pdeSel = createSelectionMode({
  screenId: 'screen-plan-day-edit', countId: 'pde-sel-count',
  countLabel: n => (n === 1 ? '1 oefening' : `${n} oefeningen`),
  markEl: item => item.querySelector('.pde-item-inner'),
});
// 'uniform' ({sets, reps}) or 'persets' ({repsPerSet: [...]}) — which half of
// #pde-sets-reps-overlay is showing. pdeSrPerSetReps is the working array for
// the 'persets' side while the popup is open (add/remove set rows mutate it
// directly; only committed to the exercise on Opslaan).
let pdeSrMode = 'uniform';
let pdeSrPerSetReps = [];
// Name of the exercise being added via screen-exercises' Voeg toe (plan-add mode)
// while #pde-sets-reps-overlay is open in its "<name> toevoegen" variant; null when
// the popup is instead editing an existing exercise (pendingPdeSetsRepsIndex).
let pendingPdeSrAddName = null;

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
  'screen-schedule-pick-plan': () => renderSchedulePickPlan(),
  'screen-schedule-pick-day': () => renderSchedulePickDay(),
  'screen-workout-plan': () => renderPlanList(),
  'screen-plan-detail': () => renderPlanDetail(),
  'screen-plan-schedule': () => renderPlanSchedule(),
  'screen-plan-day-edit': () => renderPlanDayEdit(),
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

// Screens with a temporary mode that the hardware back button closes first, before it
// navigates away (two-stage back, see the popstate handler). `exit` is the same action
// as the mode's own on-screen exit control.
const SCREEN_TEMP_MODE = {
  // Plan Detail's editable state — same as the header checkmark / first back-arrow tap.
  'screen-plan-detail': { isActive: () => planDetailEditMode, exit: () => exitPlanDetailEditMode() },
  // Fitness Tracker's long-press selection mode — same as the ✓ in its selection header.
  'screen-fitness-tracker': { isActive: () => homeSel.active, exit: () => exitHomeSelMode() },
  // Plan Day Edit's long-press selection mode — same as the ✓ in its selection header.
  'screen-plan-day-edit': { isActive: () => pdeSel.active, exit: () => pdeSel.exit() },
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
let deferredHistoryActions = [];
// While a back press is being handled (dismissHold) or one of our own history
// steps is still in flight (suppressNextPopstate), history changes wait.
let dismissHold = false;
// Runs `fn` now, or — while such a step is in flight — as soon as its popstate
// has arrived (in order, one at a time).
function runAfterPendingBack(fn) {
  if (suppressNextPopstate || dismissHold) deferredHistoryActions.push(fn);
  else fn();
}
function pushHistoryEntry(state, url) {
  runAfterPendingBack(() => history.pushState(state, '', url));
}
function flushDeferredHistoryActions() {
  // an action may start a new back of its own: the rest then waits for that one
  while (deferredHistoryActions.length && !suppressNextPopstate && !dismissHold) deferredHistoryActions.shift()();
}
// One history.back() that the popstate handler will swallow (it only pops an
// overlay's entry, no navigation).
function popHistoryEntrySilently() {
  suppressNextPopstate = true;
  history.back();
  // Safety net: if the pop never produces a popstate, don't stay blocked forever.
  setTimeout(() => {
    if (suppressNextPopstate) { suppressNextPopstate = false; flushDeferredHistoryActions(); }
  }, 500);
}
// A hardware back press just consumed the history entry of a popup / guarded
// screen that is STAYING open (unsaved changes). Step forward onto that very same
// entry again instead of pushing a copy of it: a pushState made from inside the
// popstate handler (no user gesture) piled up extra entries — in the wrong order,
// behind the "Discard changes?" popup's own — which Chrome's back button then skips,
// so repeated "Keep editing" made the eventual Discard jump back too far.
function restoreConsumedEntry() {
  suppressNextPopstate = true;
  history.forward();
  setTimeout(() => {
    if (suppressNextPopstate) { suppressNextPopstate = false; flushDeferredHistoryActions(); }
  }, 500);
}
// Set right before a deliberate back step that leaves a guarded screen after the
// user already confirmed "Discard": the unsaved-changes guard must not ask again.
let skipScreenGuardOnce = false;

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
    runAfterPendingBack(() => history.back());
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
  if (!inPopstateNavigation) runAfterPendingBack(popHistoryEntrySilently);
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

// -- Generic delete confirmation (#confirm-delete-overlay) ----------------
// For every delete action that has no dedicated confirm overlay of its own
// (those — plan, plan day, plan-day exercise, category, exercise, reset — keep
// theirs). `onConfirm` runs only on Verwijderen; Annuleren (or back) deletes nothing.
let pendingConfirmDelete = null;
function openConfirmDelete({ title, message, onConfirm }) {
  pendingConfirmDelete = onConfirm;
  document.getElementById('confirm-delete-title').textContent = title;
  document.getElementById('confirm-delete-msg').textContent = message;
  openOverlay('confirm-delete-overlay');
}
document.getElementById('btn-confirm-delete-cancel').addEventListener('click', () => {
  pendingConfirmDelete = null;
  closeOverlay('confirm-delete-overlay');
});
document.getElementById('btn-confirm-delete-confirm').addEventListener('click', () => {
  const action = pendingConfirmDelete;
  pendingConfirmDelete = null;
  closeOverlay('confirm-delete-overlay');
  if (action) action();
});

window.addEventListener('popstate', e => {
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    flushDeferredHistoryActions();
    return;
  }
  if (overlayStack.length > 0) {
    const id = overlayStack.pop();
    const stackLenBeforeDismiss = overlayStack.length;
    dismissHold = true; // the discard popup's own history entry waits until the popup's entry is restored
    dismissOverlayForBack(id);
    dismissHold = false;
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
      restoreConsumedEntry();
    } else {
      flushDeferredHistoryActions();
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
  // Two-stage back for screens with a temporary mode (see SCREEN_TEMP_MODE): the first
  // press just leaves that mode and stays on this screen (consumed history entry
  // restored, no navigation); only a second press, now out of it, leaves the screen.
  const tempMode = activeScreen && SCREEN_TEMP_MODE[activeScreen.id];
  if (tempMode && tempMode.isActive()) {
    restoreConsumedEntry();
    tempMode.exit();
    return;
  }
  const guard = activeScreen && SCREEN_HAS_CHANGES[activeScreen.id];
  if (skipScreenGuardOnce) {
    skipScreenGuardOnce = false;
  } else if (guard && guard()) {
    restoreConsumedEntry();
    confirmDiscardIfChanged(guard, () => {
      // "Discard": the stack is now [..., target, this screen (restored above)] and
      // the discard popup's own entry is being popped. Leave for real with one more
      // history step, once that pop is done — switching screens by hand instead
      // would leave the restored entry behind, and the NEXT back press did nothing.
      runAfterPendingBack(() => {
        skipScreenGuardOnce = true;
        history.back();
      });
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
  document.getElementById('reset-confirm-label').textContent = busy ? 'Bezig met resetten...' : 'Resetten';
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
  if (!currentUser) { showResetError('Je bent niet ingelogd.'); return; }

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
    toast('Reset voltooid');
    openFitnessTracker();
  } catch (err) {
    console.error('[Reset] failed:', err);
    showResetError((err && err.message) ? err.message : 'Resetten mislukt. Controleer je verbinding en probeer het opnieuw.');
  } finally {
    setResetBusy(false);
  }
});

// -- Home Screen ----------------------------------------
// Returns a Set of "date#setIndex" keys for the sets of `exerciseName` that are a
// personal record under the DOMINANCE rule: a set only counts when no other set of
// this exercise (any date — an earlier OR later set can beat it) matches or beats it
// on BOTH weight and reps. So 100x5 loses its trophy once 100x6 exists, 120x5 loses
// it to 240x5, while 100x5 and 120x3 keep one each (neither beats the other on both).
// Dropsets never count (countsForRecords): a dropset can't be a PR and doesn't take one
// away from a normal set. Sets need >= 1 rep and > 0 kg.
// Identical sets: only the first one logged keeps the trophy (equalling is not a PR).
//
// Efficient by construction (no set-vs-set comparison): per exact rep count keep the
// heaviest weight and the first set that lifted it; then walk the rep counts from high
// to low — that rep count's best set is a PR exactly when it is strictly heavier than
// the best weight at ANY higher rep count. O(sets + distinct rep counts).
// Derived purely from the logged sets (no stored record table that could drift).
function getPRSetKeys(exerciseName) {
  const bestWeight = {}, firstKey = {};
  Object.keys(db.workouts).sort().forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === exerciseName);
    if (!ex) return;
    const sets = ex.sets || [];
    sets.forEach((s, i) => {
      if (!countsForRecords(sets, i)) return;
      const reps = parseInt(s.reps) || 0;
      const weight = parseFloat(s.weight) || 0;
      if (reps < 1 || weight <= 0) return;
      // strictly heavier only: among equal weights the chronologically first set stays
      if (weight > (bestWeight[reps] || 0)) { bestWeight[reps] = weight; firstKey[reps] = date + '#' + i; }
    });
  });
  const result = new Set();
  let heaviestWithMoreReps = 0;
  Object.keys(bestWeight).map(Number).sort((x, y) => y - x).forEach(reps => {
    if (bestWeight[reps] > heaviestWithMoreReps) result.add(firstKey[reps]);
    heaviestWithMoreReps = Math.max(heaviestWithMoreReps, bestWeight[reps]);
  });
  return result;
}

function renderHome() {
  renderSmartBanner();
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
      // Loaded from a plan day: show the plan's sets/reps until the first set is logged.
      setsDiv.innerHTML = `<div class="exercise-card-empty">${ex.target ? 'Plan: ' + formatExerciseSetsReps(ex.target) : 'No sets'}</div>`;
    } else {
      sets.forEach((s, setIdx) => {
        const isFirstPR = firstPRKeys.has(currentDate + '#' + setIdx);
        const hasNote = !!(s.note && s.note.trim());
        const row = document.createElement('div');
        row.className = setRowClass(sets, setIdx);
        row.innerHTML = setRowInnerHtml(sets, setIdx, { isPR: isFirstPR });
        if (hasNote) {
          row.querySelector('.set-comment').addEventListener('click', e => {
            e.stopPropagation();
            openSetCommentPopup(idx, setIdx);
          });
        }
        setsDiv.appendChild(row);
      });
    }
    card.appendChild(setsDiv);

    // Long-press to enter selection mode
    const wasLongPress = attachLongPress(card, () => homeSel.enter(card), () => homeSel.active);
    card.addEventListener('click', () => {
      if (wasLongPress()) return;
      if (!homeSel.active) openTraining(ex.name);
      else homeSel.toggle(card);
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
  const exName = (getWorkout(date)[exIdx] || {}).name;
  openCommentPopup({
    label: `Comment bij set ${setIdx + 1} van "${exName}"`,
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
    label: 'Comment bij deze workout',
    getText: () => getSessionNote(date),
    onSave: val => saveSessionNote(date, val),
    onDelete: () => saveSessionNote(date, '')
  });
}

// -- Long-press multi-select mode (shared) ---------------
// The pattern used by Fitness Tracker's exercise cards and Plan Day Edit's
// exercise items: long-press an item -> selection mode with that item selected.
// The screen gets .sel-mode, which swaps its .norm-only toolbar for the .sel-only
// one (✓ / "N <items>" / trash, see style.css); taps then toggle items, and
// deselecting the last one leaves the mode. .sel-single marks exactly one selected
// (Home shows its drag handle then). `markEl(item)` is the element that gets the
// .exercise-card-selected highlight (the item itself unless it has an inner card).
function createSelectionMode({ screenId, countId, countLabel, markEl = item => item }) {
  const sel = { active: false, items: new Set() };
  const screen = () => document.getElementById(screenId);
  const update = () => {
    document.getElementById(countId).textContent = countLabel(sel.items.size);
    screen().classList.toggle('sel-single', sel.items.size === 1);
  };
  sel.enter = item => {
    sel.active = true;
    sel.items.add(item);
    markEl(item).classList.add('exercise-card-selected');
    screen().classList.add('sel-mode');
    update();
  };
  sel.toggle = item => {
    if (sel.items.delete(item)) {
      markEl(item).classList.remove('exercise-card-selected');
      if (sel.items.size === 0) { sel.exit(); return; }
    } else {
      sel.items.add(item);
      markEl(item).classList.add('exercise-card-selected');
    }
    update();
  };
  sel.exit = () => {
    sel.active = false;
    sel.items.forEach(item => markEl(item).classList.remove('exercise-card-selected'));
    sel.items.clear();
    screen().classList.remove('sel-mode', 'sel-single');
  };
  return sel;
}

// Long-press (500ms + short vibrate) on `el` calls onLongPress(). Moving the finger
// more than 10px cancels it; touches for which `ignore(e)` is true (drag handles,
// an active drag/selection) are left alone. Returns a check for the element's click
// handler: true (once) when that click is just the end of a long-press, so the tap
// action must not run as well.
function attachLongPress(el, onLongPress, ignore = () => false) {
  let timer = null, fired = false, startX = 0, startY = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', e => {
    if (ignore(e)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    fired = false;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, 500);
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!timer) return;
    if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', cancel, { passive: true });
  el.addEventListener('touchcancel', cancel, { passive: true });
  return () => { const was = fired; fired = false; return was; };
}

function exitHomeSelMode() { homeSel.exit(); }

function confirmDeleteHomeSelectedEx() {
  if (homeSel.items.size === 0) return;
  const allCards = [...document.getElementById('home-content').querySelectorAll('.exercise-card')];
  const exercises = getWorkout(currentDate);
  const names = [...homeSel.items].map(c => exercises[allCards.indexOf(c)]).filter(Boolean).map(e => `"${e.name}"`);
  const n = names.length;
  openConfirmDelete({
    title: n === 1 ? 'Oefening verwijderen?' : 'Oefeningen verwijderen?',
    message: `${n === 1 ? names[0] : `${n} oefeningen (${names.join(', ')})`} verwijderen uit deze workout? Alle sets gaan verloren. Dit kan niet ongedaan worden gemaakt.`,
    onConfirm: deleteHomeSelectedEx,
  });
}

function deleteHomeSelectedEx() {
  if (homeSel.items.size === 0) return;
  const container = document.getElementById('home-content');
  const allCards = [...container.querySelectorAll('.exercise-card')];
  const selectedIdxs = new Set([...homeSel.items].map(c => allCards.indexOf(c)).filter(i => i >= 0));
  const exercises = getWorkout(currentDate);
  const newExercises = exercises.filter((_, i) => !selectedIdxs.has(i));
  const n = homeSel.items.size;
  setWorkout(currentDate, newExercises);
  exitHomeSelMode();
  renderHome();
  toast(n === 1 ? 'Oefening verwijderd' : `${n} oefeningen verwijderd`);
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
    if (!homeSel.active || homeSel.items.size !== 1) return;
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

// The top-level (unfiltered) title: "Toevoegen: [Dag]" while this screen is doubling
// as the Plan Day add-exercise flow, "All Exercises" for its normal Fitness Tracker use.
function defaultExercisesTitle() {
  return exerciseScreenMode === 'plan-add' ? ('Toevoegen: ' + exerciseLoadDayName) : 'All Exercises';
}

// -- New Workout intermediate screen --------------------
// The Tracker day New Workout was opened from: Load Schedule Manually loads into it
// (Automatically and the banner always load into today instead).
let newWorkoutDate = null;

function openNewWorkoutScreen() {
  newWorkoutDate = currentDate;
  renderNewWorkoutScreen();
  showScreen('screen-new-workout');
}

// The active plan's day that's up today — the ONE function the smart day banner,
// this screen's subtitle and "Load Schedule Automatically" all ask, so they can't
// disagree. Returns { plan, dayIndex, day, dayName } or null (no active plan, plan
// gone or empty, or — fixed-days plans — no day for today's weekday).
//   - "Geen vaste dagen": sequential — the day after the last loaded one
//     (db.activePlan.lastDayIndex), wrapping around.
//   - "Vaste dagen in de week": the day for today's weekday, whatever was loaded
//     before (so a break never builds up a backlog).
//   - "Vaste dagen" with a Week A/B split: today's weekday within the ACTIVE week
//     (planWeekCycle), unless that day was already done this cycle. The active
//     week switches once all of its days are done, or when a new calendar week
//     begins — whichever comes first.
// A split plan's day loaded earlier TODAY stays the suggestion for the rest of the
// day, so finishing a week doesn't make it suggest the other week's day right away.
function getTodaysScheduledDay() {
  if (!db.activePlan) return null;
  const plan = db.plans[db.activePlan.planId];
  if (!plan || !plan.days || plan.days.length === 0) return null;
  let dayIndex;
  if (!plan.fixedDays) {
    const lastIdx = db.activePlan.lastDayIndex ?? -1;
    dayIndex = (lastIdx + 1) % plan.days.length;
  } else {
    const weekday = weekdayOfDateStr(todayStr());
    if (!planHasWeekSplit(plan)) {
      dayIndex = plan.days.findIndex(d => inferDayWeekday(d) === weekday);
    } else if (db.activePlan.lastDate === todayStr() && plan.days[db.activePlan.lastDayIndex]) {
      dayIndex = db.activePlan.lastDayIndex;
    } else {
      const { week, done } = planWeekCycle(plan);
      dayIndex = done.includes(weekday) ? -1
        : plan.days.findIndex(d => d.group === week && inferDayWeekday(d) === weekday);
    }
    if (dayIndex < 0) return null;
  }
  const day = plan.days[dayIndex];
  return { plan, dayIndex, day, dayName: day.name || ('Day ' + (dayIndex + 1)) };
}

// Same test as Plan Detail's planHasWeekB(), for any plan (not just currentPlanData).
function planHasWeekSplit(plan) {
  return !!(plan.hasWeekB || (plan.days || []).some(d => d.group === 'B'));
}

// The weekdays (0 = Maandag) that `week` ('A'/'B') of a split plan trains on.
function planWeekWeekdays(plan, week) {
  return plan.days.filter(d => d.group === week).map(inferDayWeekday).filter(w => w !== undefined);
}

// 'YYYY-MM-DD' of the Monday that starts dateStr's calendar week (Monday first,
// like the calendar screen). `weeksLater` shifts it by whole weeks.
function mondayOf(dateStr, weeksLater = 0) {
  return addDaysToDateStr(dateStr, 7 * weeksLater - weekdayOfDateStr(dateStr));
}

// A split fixed-days plan's current cycle: { week: 'A' | 'B', done: [weekdays], since }
// — the active week, which of its days were already loaded this cycle, and the
// Monday of the calendar week it counts as started in. Stored on db.activePlan as
// activeWeek/doneWeekdays/weekStart (days by weekday, not day index, so editing the
// plan's days doesn't shift it). The week switches on whichever comes first:
//   - all its days done (markScheduledDayLoaded) — the new week then counts as
//     starting NEXT calendar week, so the Monday right after doesn't force it
//     straight back (its days still get suggested for the rest of this week);
//   - a later calendar week than `since` (checked here): forced, even with days
//     still open, and the new week starts this calendar week.
// Never loaded: Week A, nothing done, no start yet. Older records are derived from
// the last loaded day (lastDayIndex, lastGroup, lastDate). A week without days is
// skipped.
function planWeekCycle(plan) {
  const a = db.activePlan;
  const other = w => (w === 'A' ? 'B' : 'A');
  const lastDay = a.lastDayIndex >= 0 ? plan.days[a.lastDayIndex] : null;
  let week = a.activeWeek;
  let done = Array.isArray(a.doneWeekdays) ? a.doneWeekdays : [];
  let since = a.weekStart;
  if (week !== 'A' && week !== 'B') {
    week = a.lastGroup || (lastDay && lastDay.group) || 'A';
    const w = lastDay && lastDay.group === week ? inferDayWeekday(lastDay) : undefined;
    done = w !== undefined ? [w] : [];
    if (planWeekWeekdays(plan, week).every(d => done.includes(d))) { week = other(week); done = []; }
  }
  // No weekStart yet: the last loaded day either belongs to the active week (started
  // that calendar week) or completed the previous one (active week starts the next).
  if (!since && a.lastDate) since = mondayOf(a.lastDate, lastDay && lastDay.group !== week ? 1 : 0);
  const thisMonday = mondayOf(todayStr());
  if (since && thisMonday > since) { week = other(week); done = []; since = thisMonday; }
  if (planWeekWeekdays(plan, week).length === 0) { week = other(week); done = []; }
  return { week, done, since };
}

// Records a suggested day as loaded (banner "Yes, load it" / Automatically "Laden"):
// what getTodaysScheduledDay() bases the next suggestion on. For a split fixed-days
// plan it's also marked done in the active week (switches included, see
// planWeekCycle); once every day of that week is done, the other week becomes
// active with a fresh (empty) done list, counted from next calendar week.
function markScheduledDayLoaded(pick) {
  const a = db.activePlan;
  const plan = pick.plan;
  if (plan.fixedDays && planHasWeekSplit(plan) && a.lastDate !== todayStr()) {
    let { week, done, since } = planWeekCycle(plan);
    const w = inferDayWeekday(pick.day);
    if (pick.day.group === week && w !== undefined && !done.includes(w)) done = [...done, w];
    if (planWeekWeekdays(plan, week).every(d => done.includes(d))) {
      week = week === 'A' ? 'B' : 'A';
      done = [];
      since = mondayOf(todayStr(), 1);
    } else if (!since) {
      since = mondayOf(todayStr());
    }
    a.activeWeek = week;
    a.doneWeekdays = done;
    a.weekStart = since;
  }
  a.lastDayIndex = pick.dayIndex;
  a.lastDate = todayStr();
  delete a.lastGroup; // superseded by activeWeek/doneWeekdays
  bannerDismissed = true;
  return persistActivePlan(a);
}

function renderNewWorkoutScreen() {
  const pick = getTodaysScheduledDay();
  document.getElementById('nw-schema-auto-desc').textContent = pick
    ? `Today you have ${pick.dayName}.`
    : 'Automatic planning not set up yet';
}

// A plan exercise's sets/reps as a workout exercise's `target`: {sets, reps} or
// {repsPerSet: [...]} (same shapes as the plan, see formatExerciseSetsReps), or
// null when the plan has none.
function planExerciseTarget(ex) {
  if (Array.isArray(ex.repsPerSet) && ex.repsPerSet.length > 0) return { repsPerSet: [...ex.repsPerSet] };
  if (ex.sets && ex.reps) return { sets: ex.sets, reps: ex.reps };
  return null;
}

// The one place a plan day is loaded into a Fitness Tracker workout (smart day
// banner, Load Schedule Manually/Automatically). Only READS the plan and only
// WRITES the workout of `date`. Exercises already in that workout are kept as-is
// (no duplicates); new ones start without logged sets and carry the plan's
// sets/reps as `target` — shown on the exercise card and used to prefill reps.
function loadPlanDayIntoWorkout(day, date) {
  const workout = getWorkout(date);
  let added = 0;
  (day.exercises || []).forEach(ex => {
    if (workout.find(e => e.name === ex.name)) return;
    const target = planExerciseTarget(ex);
    workout.push({ name: ex.name, sets: [], ...(target && { target }) });
    added++;
  });
  if (added > 0) setWorkout(date, workout);
  return added;
}

function planDayHasExercises(day) {
  return !!(day && day.exercises && day.exercises.length > 0);
}

// After a schedule load from New Workout: back to the Fitness Tracker showing `date`
// (the day it loaded into) by walking back through history (`steps` = entries above
// it: New Workout, the pickers, an open popup), so the back button doesn't land on
// the pickers again. The popstate handler's showScreen() re-renders the tracker for
// currentDate.
function showTrackerAfterLoad(date, steps) {
  currentDate = date;
  history.go(-steps);
  toast('Workout geladen!');
}

// -- Load Schedule Manually: Kies een plan -> [Plan] — kies een dag ----------
// Read-only views of the Plan Builder's plans; the only write is the chosen
// day into the workout of the day New Workout was opened from (newWorkoutDate).
let schedulePickPlanId = null;

function openSchedulePickPlan() {
  renderSchedulePickPlan();
  showScreen('screen-schedule-pick-plan');
}

function renderSchedulePickPlan() {
  const scroll = document.getElementById('schedule-pick-plan-scroll');
  const plans = sortedPlans();
  if (plans.length === 0) {
    scroll.innerHTML = '<div class="plan-list-empty">Nog geen plannen. Maak er eerst een aan via Workout Plan Builder.</div>';
    return;
  }
  scroll.innerHTML = '';
  plans.forEach(plan => {
    const item = buildPlanItem(plan, { withMenu: false });
    item.addEventListener('click', () => openSchedulePickDay(plan.id));
    scroll.appendChild(item);
  });
}

function openSchedulePickDay(planId) {
  schedulePickPlanId = planId;
  renderSchedulePickDay();
  showScreen('screen-schedule-pick-day');
}

function renderSchedulePickDay() {
  const plan = db.plans[schedulePickPlanId];
  const scroll = document.getElementById('schedule-pick-day-scroll');
  scroll.innerHTML = '';
  if (!plan) return;
  document.getElementById('schedule-pick-day-title').textContent = `${plan.name} — kies een dag`;
  const days = plan.days || [];
  if (days.length === 0) {
    scroll.innerHTML = '<div class="plan-list-empty">Dit plan heeft nog geen dagen.</div>';
    return;
  }
  planDaySegments(days).forEach(seg => {
    if (seg.group) scroll.appendChild(buildPlanDayGroupLabel(seg.group));
    seg.dayIndices.forEach(idx => scroll.appendChild(buildSchedulePickDayCard(days[idx], idx)));
  });
}

// Same look as Plan Detail's day card head, but no preview/edit controls: the
// whole card is one tap target that loads the day.
function buildSchedulePickDayCard(day, idx) {
  const card = document.createElement('div');
  card.className = 'plan-day-card';
  card.innerHTML = `
    <div class="plan-day-head">
      <div class="plan-day-num">${idx + 1}</div>
      <div class="plan-day-info">
        <div class="plan-day-name">${day.name}</div>
        <div class="plan-day-sub">${planDaySubText(day)}</div>
      </div>
      <svg class="plan-day-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </div>
  `;
  card.addEventListener('click', () => loadPickedScheduleDay(idx));
  return card;
}

function loadPickedScheduleDay(idx) {
  const plan = db.plans[schedulePickPlanId];
  const day = plan && plan.days[idx];
  if (!planDayHasExercises(day)) { toast('Deze dag heeft geen oefeningen', { type: 'error' }); return; }
  // Into the day the Tracker was showing when New Workout opened — not forced to today.
  const date = newWorkoutDate || currentDate;
  loadPlanDayIntoWorkout(day, date);
  showTrackerAfterLoad(date, 3); // day picker, plan picker, New Workout
}

// -- Load Schedule Automatically ------------------------------------------
// The banner's pick (getTodaysScheduledDay) behind a confirm popup — or, without
// one, a notice with only OK. pendingScheduleLoad is the pick the open popup
// would load; null for the notice.
let pendingScheduleLoad = null;

function openScheduleLoadAuto() {
  const pick = getTodaysScheduledDay();
  pendingScheduleLoad = pick;
  // No pick but a usable active plan: that plan simply has no day for today.
  const activePlan = db.activePlan && db.plans[db.activePlan.planId];
  const noDayToday = !pick && activePlan && (activePlan.days || []).length > 0;
  document.getElementById('schedule-load-title').textContent = pick ? `Vandaag is ${pick.dayName}`
    : noDayToday ? 'Geen dag voor vandaag' : 'Geen actief plan';
  document.getElementById('schedule-load-msg').textContent = pick
    ? 'Oefeningen van dit plan laden voor vandaag?'
    : noDayToday ? `Je actieve plan "${activePlan.name}" heeft geen passende dag voor vandaag.`
    : 'Geen actief plan gevonden. Stel een plan in als actief via Workout Plan Builder.';
  document.getElementById('btn-schedule-load-cancel').classList.toggle('hidden', !pick);
  document.getElementById('btn-schedule-load-confirm').textContent = pick ? 'Laden' : 'OK';
  openOverlay('schedule-load-overlay');
}

document.getElementById('btn-schedule-load-cancel').addEventListener('click', () => {
  pendingScheduleLoad = null;
  closeOverlay('schedule-load-overlay');
});
document.getElementById('btn-schedule-load-confirm').addEventListener('click', async () => {
  const pick = pendingScheduleLoad;
  pendingScheduleLoad = null;
  if (!pick || !planDayHasExercises(pick.day)) {
    closeOverlay('schedule-load-overlay');
    if (pick) toast('Deze dag heeft geen oefeningen', { type: 'error' });
    return;
  }
  loadPlanDayIntoWorkout(pick.day, todayStr());
  markScheduledDayLoaded(pick);
  // Popup + New Workout in ONE history traversal (two back() calls in a row leave a
  // dead back press behind — see the calendar detail's "go to day").
  overlayStack.pop();
  document.getElementById('schedule-load-overlay').classList.remove('open');
  showTrackerAfterLoad(todayStr(), 2); // always today, whatever day the Tracker was showing
});

function openExerciseList() {
  exerciseScreenMode = 'browse';
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
  setExercisesTitle(defaultExercisesTitle());
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
  let msg = `"${cat}"`;
  if (total > 0) {
    msg += ` en de ${total} oefening${total !== 1 ? 'en' : ''} erin verwijderen?`;
    if (total > custom) msg += ` (${total - custom} ingebouwde oefening${total - custom !== 1 ? 'en kunnen' : ' kan'} niet worden verwijderd)`;
  } else {
    msg += ' verwijderen?';
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
  toast('Categorie verwijderd');
});

function renderExercisesInCategory(cat) {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const exercises = allExercises().filter(e => e.category === cat);
  if (exercises.length === 0) {
    list.insertAdjacentHTML('beforeend', `<div class="exercise-empty">No exercises found</div>`);
    return;
  }
  exercises.forEach(ex => renderExerciseItem(list, ex));
}

function renderFavoriteExercises() {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const favs = allExercises().filter(e => isFavoriteExercise(e.name));
  if (favs.length === 0) {
    list.insertAdjacentHTML('beforeend', `<div class="exercise-empty">No favorites yet</div>`);
    return;
  }
  favs.forEach(ex => renderExerciseItem(list, ex));
}

function renderExerciseSearchResults(q) {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const filtered = allExercises().filter(e => e.name.toLowerCase().includes(q));
  if (filtered.length === 0) {
    list.insertAdjacentHTML('beforeend', `<div class="exercise-empty">No exercises found</div>`);
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
  const isPlanAddMode = exerciseScreenMode === 'plan-add';
  const inPlanDay = isPlanAddMode && planDayHasExercise(ex.name);
  item.className = 'exercise-item list-row' + (ex.custom ? ' exercise-item-custom' : '');
  const isFav = isFavoriteExercise(ex.name);
  item.innerHTML = `
    <span class="exercise-item-name">${ex.name}</span>
    ${isPlanAddMode ? `
    <button class="btn btn-primary ex-add-btn${inPlanDay ? ' ex-add-btn-done' : ''}"${inPlanDay ? ' disabled' : ''}>${
      inPlanDay
        ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>Toegevoegd`
        : `Voeg toe`
    }</button>` : (isFav ? `<svg class="exercise-item-fav-star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>` : '')}
    <svg class="exercise-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  `;
  item.querySelector('.exercise-item-name').addEventListener('click', () => {
    if (!isPlanAddMode) openTraining(ex.name);
  });
  if (isPlanAddMode && !inPlanDay) {
    item.querySelector('.ex-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      openPdeSrAdd(ex.name);
    });
  }
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
    extra: document.getElementById('field-extra').value,
    extraType: getExtraType(),
    dropset: getDropsetField(),
  };
}
let trackFieldsBaseline = { weight: '0', reps: '0', rpe: '0', extra: '0', extraType: '', dropset: false };

// Number entry for sets (the TRACK tab is the only place sets are entered or edited):
// a decimal comma (Dutch keyboard) counts as a point; weight and RPE keep at most
// 1 decimal (more is rounded), reps and extra reps are whole numbers (a typed
// decimal is rounded). Shown without a superfluous ".0" (150, not 150.0).
function parseDecimal(str) { return parseFloat(String(str).replace(',', '.')) || 0; }
function round1(v) { return Math.round(v * 10) / 10; }
function parseWeight(str) { return Math.max(0, round1(parseDecimal(str))); }
function formatWeight(v) { return String(round1(v)); }
function parseWholeNumber(str) { return Math.max(0, Math.round(parseDecimal(str))); }

// RPE: 0 = not filled in; otherwise 6..10 in steps of 0.5. Whole numbers show
// without a decimal ("8"), halves with one ("8.5").
const RPE_MIN = 6, RPE_MAX = 10, RPE_STEP = 0.5;
function parseRpe(str) { return round1(parseDecimal(str)); }
function isValidRpe(v) { return v === 0 || (v >= RPE_MIN && v <= RPE_MAX && (v / RPE_STEP) % 1 === 0); }
function formatRpe(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
// Stepper: 0 -> 6 on +, 6 -> 0 on -, +/-0.5 in between (max 10).
function stepRpe(current, dir) {
  const v = parseRpe(current);
  if (dir === '+') return v < RPE_MIN ? RPE_MIN : Math.min(RPE_MAX, Math.round((v + RPE_STEP) / RPE_STEP) * RPE_STEP);
  return v <= RPE_MIN ? 0 : Math.round((v - RPE_STEP) / RPE_STEP) * RPE_STEP;
}
function setRpeField(v) { document.getElementById('field-rpe').value = v ? formatRpe(v) : 0; }
// Extra reps (partials / forced) on top of the set, 0 = not applicable. Only
// possible at RPE 10: extra reps > 0 sets RPE to 10 (a real, editable value),
// and lowering RPE below 10 again clears the extra reps.
const EXTRA_MAX = 20;
function getExtraReps() { return Math.min(EXTRA_MAX, parseWholeNumber(document.getElementById('field-extra').value)); }
function getExtraType() { const b = document.querySelector('#extra-type .extra-type-btn.active'); return b ? b.dataset.type : ''; }
// Type toggle follows the amount: disabled + nothing selected at 0, otherwise one
// of Partial/Forced is selected (Partial unless the user already picked Forced).
function syncExtraType(n, type) {
  const on = n > 0, sel = on ? (type || 'partial') : '';
  document.querySelectorAll('#extra-type .extra-type-btn').forEach(b => {
    b.disabled = !on;
    b.classList.toggle('active', on && b.dataset.type === sel);
  });
}
function setExtraField(n, type) {
  document.getElementById('field-extra').value = n;
  syncExtraType(n, type);
}
// Called whenever the amount changes (stepper or typing): keeps toggle + RPE in step.
function onExtraChanged(n) {
  syncExtraType(n, getExtraType());
  if (n > 0) setRpeField(RPE_MAX);
}
// Called whenever RPE changes by hand: RPE below 10 can't have extra reps.
function reconcileExtraWithRpe() {
  if (getExtraReps() > 0 && parseRpe(document.getElementById('field-rpe').value) < RPE_MAX) setExtraField(0, '');
}
function resetEffortFields() { setRpeField(0); setExtraField(0, ''); setDropsetField(false); }
// -- Dropsets -------------------------------------------------------------
// A set with isDropsetContinuation hangs under the previous set of that exercise
// that day (the chain simply follows the log order); the first set of a day can't
// be a continuation. Shared by the TRACK list, the day overview and History.
const DROP_ARROW_SVG = '<svg class="drop-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10"/><path d="M17 8v9H8"/></svg>';
function isDropChild(sets, i) { return i > 0 && !!sets[i].isDropsetContinuation; }
// The one rule for PRs, records and progression (trophies, PR toast, Records screen,
// Recap PR block, Graph): a dropset (the .drop-child row) never counts. The heavy set
// it follows is a normal set and counts as usual. Dropsets stay visible in every list.
function countsForRecords(sets, i) { return !isDropChild(sets, i); }
// -- Shared set row ----------------------------------------
// ONE row for every list of logged sets — TRACK list, day overview, History, Calendar
// day popup, Graph "Go to" popup — with fixed columns (style.css .set-row):
//   comment · PR trophy / dropset arrow · set number · weight · reps · RPE/partial
// Every cell is always rendered (empty when there's nothing to show), so the columns
// land on the same x positions in every list. The dropset arrow uses the trophy
// column: a dropset can never be a PR (countsForRecords), so they never meet.
//   comment: 'always' = icon on every row (TRACK: tap to add a note),
//            'note'   = icon only on a set that has a note, 'none' = never (popups)
function setRowInnerHtml(sets, i, { comment = 'note', commentLabel = 'Set comment', isPR = false } = {}) {
  const s = sets[i];
  const hasNote = comment !== 'none' && !!(s.note && s.note.trim());
  const showIcon = comment === 'always' || hasNote;
  return `
      <span class="set-comment${hasNote ? ' has-note' : ''}"${comment === 'none' ? '' : ` aria-label="${commentLabel}"`}>${showIcon ? COMMENT_ICON_SVG : ''}</span>
      <span class="set-pr">${isPR ? prTrophySvg('set-pr-icon') : isDropChild(sets, i) ? DROP_ARROW_SVG : ''}</span>
      <span class="set-num">${i + 1}</span>
      <span class="set-weight"><span class="set-val">${s.weight}</span><span class="set-unit">kgs</span></span>
      <span class="set-reps"><span class="set-val">${s.reps}</span><span class="set-unit">reps</span></span>
      ${effortCellHtml(s)}`;
}
// Row classes shared by every list: zebra striping + dropset chain markers.
function setRowClass(sets, i) {
  return 'set-row' + dropsetRowClass(sets, i);
}
function dropsetRowClass(sets, i) {
  const child = isDropChild(sets, i);
  const next = i + 1 < sets.length && !!sets[i + 1].isDropsetContinuation;
  return (child ? ' drop-child' : '') + (child && next ? ' drop-mid' : '') + (!child && next ? ' drop-parent' : '');
}
// The checkbox only makes sense when there is a previous set to attach to: a new
// set needs at least one saved set today, an edited set must not be the first one.
function dropsetEligible() {
  const ex = getCurrentExerciseData();
  const n = ex ? ex.sets.length : 0;
  return selectedSetIndex !== null ? selectedSetIndex > 0 : n > 0;
}
// Dropset is a toggle button under RPE (same .extra-type-btn look as Partial/Forced: on = .active);
// it's never disabled, only hidden when there's no previous set to hang on to.
function getDropsetField() { return document.getElementById('dropset-toggle').classList.contains('active'); }
function setDropsetField(on) {
  const b = document.getElementById('dropset-toggle');
  b.classList.toggle('active', !!on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function updateDropsetToggle() {
  const ok = dropsetEligible();
  document.getElementById('dropset-toggle').classList.toggle('hidden', !ok);
  if (!ok) setDropsetField(false);
}

// Effort marker for a logged set — ONE component used by the TRACK list, the day
// overview and History: RPE as plain text (never a badge), plus a small "+N partial/forced"
// line under it when there are extra reps; a muted dash when there is neither.
function effortCellHtml(s) {
  const rpe = parseFloat(s.rpe) || 0;
  const extra = parseInt(s.extra) || 0;
  const rpeText = rpe > 0 ? `<span class="set-rpe">RPE ${formatRpe(rpe)}</span>` : '';
  const extraLine = extra > 0 ? `<span class="set-effort-extra">+${extra} ${s.extraType === 'forced' ? 'forced' : 'partial'}</span>` : '';
  return `<span class="set-effort">${rpeText || extraLine ? rpeText + extraLine : '<span class="set-effort-none">—</span>'}</span>`;
}

function openTraining(name) {
  currentExercise = name;
  currentTimeRange = 'all'; // Graph tab period starts on "all" every time an exercise is opened
  syncTimeFilterButtons();
  selectedSetIndex = null;
  document.getElementById('training-title').textContent = name;
  document.getElementById('field-weight').value = 0;
  document.getElementById('field-reps').value = plannedRepsForNextSet() || 0;
  resetEffortFields();
  trackFieldsBaseline = getTrackFieldsSnapshot();
  switchTab('track');
  showScreen('screen-training');
  renderSetList();
}

// Reps the loaded plan day (the exercise's `target`, see loadPlanDayIntoWorkout)
// sets for the next set to log, or 0 without a target / once its sets are done.
function plannedRepsForNextSet() {
  const ex = getCurrentExerciseData();
  const target = ex && ex.target;
  if (!target) return 0;
  const next = (ex.sets || []).length;
  if (target.repsPerSet) return target.repsPerSet[next] || 0;
  return next < target.sets ? target.reps : 0;
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
  updateDropsetToggle();

  if (sets.length === 0) {
    list.innerHTML = `<div class="set-list-empty">No sets yet. Enter weight and reps, then tap SAVE.</div>`;
    return;
  }

  const firstPRKeys = getPRSetKeys(currentExercise);
  list.innerHTML = '';

  sets.forEach((s, i) => {
    const isPR = firstPRKeys.has(currentDate + '#' + i);
    const isSelected = selectedSetIndex === i;
    const row = document.createElement('div');
    row.className = setRowClass(sets, i) + (isSelected ? ' selected' : '');
    row.dataset.setIdx = i;
    row.innerHTML = setRowInnerHtml(sets, i, { comment: 'always', commentLabel: 'Set note', isPR });
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
  toast(note ? 'Comment saved' : 'Comment verwijderd');
}

// Personal Records: 1..12 reps, or up to the highest rep count ever logged for
// this exercise if that's more (same range as the Graph's Reps dropdown).
// The weight shown for N reps is the LEADING weight: the heaviest weight of any
// really logged set with N OR MORE reps — a set with more reps at some weight
// proves that weight is doable for fewer reps too. Nothing is estimated. Every
// row shows the workout date on which its current leading weight was FIRST reached;
// when that set has exactly N reps it is a direct record (trophy), when it has more
// reps the row says "via MRM" (no trophy); no qualifying set at all = "No data".
// Everything here goes by WORKOUT DATE (the day a set is logged on), never by the
// moment it was entered — a set added later to an older day counts as if it had
// always been there.
function recordsRepLabel(n) { return n === 1 ? 'One Rep Max' : n + 'RM'; }

// Every valid set (>= 1 rep, > 0 kg, not a dropset) of an exercise in workout-date
// order: by day, then by position within the day.
function getExerciseValidSets(name) {
  const out = [];
  Object.keys(db.workouts).sort().forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === name);
    if (!ex) return;
    const sets = ex.sets || [];
    sets.forEach((s, i) => {
      if (!countsForRecords(sets, i)) return;
      const reps = parseInt(s.reps) || 0;
      const weight = parseFloat(s.weight) || 0;
      if (reps >= 1 && weight > 0) out.push({ date, i, reps, weight });
    });
  });
  return out;
}

// The whole progression of the leading weight for every rep count 1..maxReps:
// steps[n] = [{ weight, date, sourceReps, direct }], oldest -> newest. Walking the
// workout dates in order, the leading weight for n reps on a date is the heaviest
// weight of any set logged up to and including that date with n OR MORE reps; each
// time it becomes strictly heavier than before that is one step. sourceReps is the
// rep count of the set that did it (the fewest reps >= n on that day at that
// weight); direct = it had exactly n reps. One pass over the days, O(days * reps).
function getRepProgressions(name, maxReps) {
  const days = [];
  let cur = null, top = maxReps;
  getExerciseValidSets(name).forEach(s => {
    if (!cur || cur.date !== s.date) { cur = { date: s.date, best: {} }; days.push(cur); }
    if (s.weight > (cur.best[s.reps] || 0)) cur.best[s.reps] = s.weight;
    if (s.reps > top) top = s.reps;
  });
  const steps = [], lead = [];
  for (let n = 0; n <= top; n++) { steps[n] = []; lead[n] = 0; }
  days.forEach(day => {
    let weight = 0, src = 0;
    for (let n = top; n >= 1; n--) {
      // >= so that on equal weights the nearest (fewest-rep) source wins
      if (day.best[n] && day.best[n] >= weight) { weight = day.best[n]; src = n; }
      if (weight > lead[n]) { lead[n] = weight; steps[n].push({ weight, date: day.date, sourceReps: src, direct: src === n }); }
    }
  });
  return steps;
}

// Current leading weight per rep count = the last step of its progression
// ({ reps, weight, direct, date, viaReps } or null = no data).
function getRepLeaders(name, maxReps) {
  const steps = getRepProgressions(name, maxReps);
  const out = [];
  for (let n = 1; n < steps.length; n++) {
    const last = steps[n][steps[n].length - 1];
    out[n] = last ? { reps: n, weight: last.weight, direct: last.direct, date: last.date, viaReps: last.direct ? null : last.sourceReps } : null;
  }
  return out;
}

// Record detail popup for one rep count: the current (leading) record, then the
// progression that led up to it ("previous records": every earlier step of the leading
// weight, newest first — the current record itself is NOT repeated), including the
// steps that came from a set with MORE reps ("via MRM").
let recordsHistoryReps = null;
// One record step / current record as a tappable row: weight + workout date, plus
// "via MRM" when it came from a set with more reps. Tapping opens "Go to" for that
// day with the source set highlighted.
function recordsStepRowHtml(weight, date, sourceReps, direct) {
  return `
    <div class="records-row records-row-clickable" data-date="${date}" data-val="${weight}" data-src-reps="${sourceReps}">
      <span class="records-row-weight">${weight} kgs</span>
      <span class="records-row-date">${formatDateStr(date, 'short')}${direct ? '' : `<span class="records-row-via"> \u00b7 via ${recordsRepLabel(sourceReps)}</span>`}</span>
    </div>`;
}
function openRecordsHistory(reps) {
  const steps = getRepProgressions(currentExercise, getExerciseMaxReps(currentExercise))[reps] || [];
  if (steps.length === 0) return;
  recordsHistoryReps = reps;
  const cur = steps[steps.length - 1];
  const previous = steps.slice(0, -1).reverse(); // everything BEFORE the current record, newest first
  document.getElementById('records-history-title').textContent = recordsRepLabel(reps) + ' history';
  document.getElementById('records-history-body').innerHTML = `
    <div class="section-label">Current record</div>
    ${recordsStepRowHtml(cur.weight, cur.date, cur.sourceReps, cur.direct)}
    <div class="section-label">${recordsRepLabel(reps)} previous records</div>
    ${previous.length ? previous.map(st => recordsStepRowHtml(st.weight, st.date, st.sourceReps, st.direct)).join('') : '<div class="records-empty">No previous records</div>'}`;
  openOverlay('records-history-overlay');
}

// Right-hand side of a record row/block: weight + workout date; a direct record
// (set with exactly this rep count) also gets the trophy, a derived one gets
// "via MRM" behind the date and no trophy; or "No data".
function recordsValueHtml(rec) {
  if (!rec) return `<span class="records-row-nodata">No data</span>`;
  return `<span class="records-row-value">
        <span class="records-row-weight">${rec.direct ? prTrophySvg() : ''}${rec.weight} kgs</span>
        <span class="records-row-date">${formatDateStr(rec.date, 'short')}${rec.direct ? '' : `<span class="records-row-via"> \u00b7 via ${recordsRepLabel(rec.viaReps)}</span>`}</span>
      </span>`;
}
const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5z"/></svg>';

function openExerciseRecords() {
  document.getElementById('records-title').textContent = (currentExercise || '') + ' records';
  const maxReps = getExerciseMaxReps(currentExercise);
  const leaders = getRepLeaders(currentExercise, maxReps);
  // One Rep Max: its own block on top (same rule as a normal row); the list below starts at 2RM.
  const oneRm = leaders[1];
  const hero = document.getElementById('records-hero');
  hero.className = 'records-hero' + (oneRm ? ' records-hero-clickable' : '');
  if (oneRm) hero.dataset.reps = '1'; else delete hero.dataset.reps;
  hero.innerHTML = `<span class="records-hero-label">${CROWN_SVG}One rep max</span>${recordsValueHtml(oneRm)}`;
  const list = document.getElementById('records-list');
  list.innerHTML = Array.from({ length: maxReps - 1 }, (_, k) => {
    const reps = k + 2;
    const rec = leaders[reps];
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
    sections.push(`<div class="section-label">Muscle group</div><div class="info-two-col">
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
  if (equipHtml) sections.push('<div class="section-label">Equipment setup</div>' + equipHtml);
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
  const field = (id, label, control) => `<div class="info-field"><label class="field-label" for="${id}">${label}</label>${control}</div>`;
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
  const weight = parseWeight(document.getElementById('field-weight').value);
  const reps = parseWholeNumber(document.getElementById('field-reps').value);
  if (reps < 1) { toast('Enter reps', { type: 'error' }); return; }
  reconcileExtraWithRpe(); // a typed RPE below 10 whose change event hasn't fired yet
  const rpe = parseRpe(document.getElementById('field-rpe').value);
  if (!isValidRpe(rpe)) { toast('RPE: 6 to 10, in steps of 0.5', { type: 'error' }); return; }
  const extra = getExtraReps();
  const extraType = extra > 0 ? (getExtraType() || 'partial') : '';

  const workout = getWorkout(currentDate);
  let ex = workout.find(e => e.name === currentExercise);
  if (!ex) { ex = { name: currentExercise, sets: [] }; workout.push(ex); }

  // Link to the previous set only when there is one (new set: any saved set today; edited set: not the first).
  const dropset = getDropsetField() && (selectedSetIndex !== null ? selectedSetIndex > 0 : ex.sets.length > 0);
  let savedMsg, savedIdx;
  if (selectedSetIndex !== null) {
    const existingNote = ex.sets[selectedSetIndex] && ex.sets[selectedSetIndex].note;
    ex.sets[selectedSetIndex] = { weight, reps, ...(rpe > 0 && { rpe }), ...(extra > 0 && { extra, extraType }), ...(dropset && { isDropsetContinuation: true }), ...(existingNote && { note: existingNote }) };
    savedIdx = selectedSetIndex;
    selectedSetIndex = null;
    savedMsg = 'Set updated';
  } else {
    ex.sets.push({ weight, reps, ...(rpe > 0 && { rpe }), ...(extra > 0 && { extra, extraType }), ...(dropset && { isDropsetContinuation: true }) });
    savedIdx = ex.sets.length - 1;
    savedMsg = 'Set saved';
  }

  setWorkout(currentDate, workout);
  // A PR replaces the plain confirmation entirely (two consecutive toast()
  // calls would just overwrite each other anyway).
  const isPR = getPRSetKeys(currentExercise).has(currentDate + '#' + savedIdx);
  if (isPR) toast('\u{1F3C6} Personal record! \u{1F3C6}', { type: 'pr' });
  else toast(savedMsg);
  setDropsetField(false); // linking is per set — the next one starts unlinked again
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
    document.getElementById('field-weight').value = formatWeight(parseDecimal(ex.sets[i].weight));
    document.getElementById('field-reps').value = parseWholeNumber(ex.sets[i].reps);
    setRpeField(parseRpe(ex.sets[i].rpe));
    setExtraField(parseWholeNumber(ex.sets[i].extra), ex.sets[i].extraType);
    setDropsetField(isDropChild(ex.sets, i));
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
  resetEffortFields();
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
  toast('Set verwijderd');
}

// -- Field +/- Buttons ---------------------------------
document.querySelectorAll('.field-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    const dir = btn.dataset.dir;
    const input = document.getElementById('field-' + field);
    if (field === 'rpe') { setRpeField(stepRpe(input.value, dir)); reconcileExtraWithRpe(); return; }
    if (field === 'extra') {
      const n = Math.max(0, Math.min(EXTRA_MAX, getExtraReps() + (dir === '+' ? 1 : -1)));
      input.value = n;
      onExtraChanged(n);
      return;
    }
    const isWeight = field === 'weight';
    let val = isWeight ? parseWeight(input.value) : parseWholeNumber(input.value);
    const step = isWeight ? 2.5 : 1;
    val = dir === '+' ? val + step : Math.max(0, val - step);
    input.value = isWeight ? formatWeight(val) : val;
  });
});

// Tap a weight/reps number to select it all, so typing overwrites it
// instead of inserting a cursor at the tap position. The resulting selection
// would normally summon Android's native Cut/Copy/Translate action bar above
// it; preventDefault on contextmenu suppresses that bar while leaving the
// blue selection highlight itself alone.
['field-weight', 'field-reps', 'field-rpe', 'field-extra'].forEach(id => {
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

// Block invalid characters while typing (also paste, and Android keyboards that
// show a separator anyway): weight and RPE take digits plus ONE decimal separator
// (comma or point) with at most 1 digit after it; reps and extra reps take digits
// only. A rejected keystroke simply doesn't appear; the caret stays where it was.
const FIELD_DECIMALS = { 'field-weight': 1, 'field-rpe': 1, 'field-reps': 0, 'field-extra': 0 };
function restrictNumber(str, decimals) {
  let out = '', sep = false, after = 0;
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') {
      if (!sep) out += ch;
      else if (after < decimals) { out += ch; after++; }
    } else if ((ch === ',' || ch === '.') && decimals > 0 && !sep) { out += ch; sep = true; }
  }
  return out;
}
Object.entries(FIELD_DECIMALS).forEach(([id, decimals]) => {
  const input = document.getElementById(id);
  let before = null;
  input.addEventListener('beforeinput', () => { before = { value: input.value, start: input.selectionStart, end: input.selectionEnd }; });
  input.addEventListener('input', e => {
    // Pasting into a whole-number field: everything from the first comma/point on is
    // dropped, so "8,5" becomes "8" (not "85").
    if (decimals === 0 && before && /^insertFrom/.test(e.inputType || '')) {
      const head = before.value.slice(0, before.start), tail = before.value.slice(before.end);
      const pasted = input.value.slice(head.length, input.value.length - tail.length).split(/[.,]/)[0];
      input.value = restrictNumber(head + pasted + tail, 0);
      const caret = restrictNumber(head + pasted, 0).length;
      input.setSelectionRange(caret, caret);
      return;
    }
    const clean = restrictNumber(input.value, decimals);
    if (clean === input.value) return;
    if (e.inputType === 'insertText' && before && restrictNumber(before.value, decimals) === before.value) {
      // A typed key that isn't allowed: undo just that keystroke.
      input.value = before.value;
      input.setSelectionRange(before.start, before.end);
    } else {
      // Paste, autofill, composition: keep what's valid.
      const caret = restrictNumber(input.value.slice(0, input.selectionStart), decimals).length;
      input.value = clean;
      input.setSelectionRange(caret, caret);
    }
  });
});

// Typing: extra reps updates toggle + RPE as you type (capped); a typed RPE is
// checked once you leave the field, so "10" isn't seen as "1" mid-typing. Leaving
// a field also normalizes it (safety net for the rules above, e.g. "132,5" ->
// "132.5", "150.0" -> "150", RPE "8,5" -> "8.5").
document.getElementById('field-extra').addEventListener('input', () => onExtraChanged(getExtraReps()));
document.getElementById('field-extra').addEventListener('change', e => { e.target.value = getExtraReps(); });
document.getElementById('field-rpe').addEventListener('change', e => { setRpeField(parseRpe(e.target.value)); reconcileExtraWithRpe(); });
document.getElementById('field-weight').addEventListener('change', e => { e.target.value = formatWeight(parseWeight(e.target.value)); });
document.getElementById('field-reps').addEventListener('change', e => { e.target.value = parseWholeNumber(e.target.value); });
document.querySelectorAll('#extra-type .extra-type-btn').forEach(b => b.addEventListener('click', () => {
  if (getExtraReps() > 0) syncExtraType(getExtraReps(), b.dataset.type);
}));
document.getElementById('dropset-toggle').addEventListener('click', () => setDropsetField(!getDropsetField()));

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

  // Only days with at least one logged set: an exercise can sit in a workout with
  // no sets yet (just added, or loaded from a plan day), which isn't history.
  const relevantDates = Object.keys(db.workouts).sort().reverse()
    .filter(d => db.workouts[d] && db.workouts[d].some(e => e.name === currentExercise && e.sets && e.sets.length > 0))
    .slice(0, 20);

  if (relevantDates.length === 0) {
    container.innerHTML = '<div class="plan-list-empty">No history yet</div>';
    return;
  }

  const firstPRKeys = getPRSetKeys(currentExercise);

  relevantDates.forEach(date => {
    const exIdx = db.workouts[date].findIndex(e => e.name === currentExercise);
    const ex = db.workouts[date][exIdx];
    if (!ex || !ex.sets.length) return;

    // One card per date, built like the day overview's exercise card: the date
    // sits where the exercise name sits there, above the same accent line.
    const card = document.createElement('div');
    card.className = 'history-card';
    const header = document.createElement('div');
    header.className = 'history-card-header clickable';
    header.innerHTML = `<div class="section-label">${formatDateStr(date, 'short')}</div>`;
    header.addEventListener('click', () => openHistoryGotoDate(date));
    card.appendChild(header);
    card.appendChild(Object.assign(document.createElement('div'), { className: 'history-card-divider' }));
    const setsDiv = document.createElement('div');
    setsDiv.className = 'history-card-sets';

    ex.sets.forEach((s, i) => {
      const isPR = firstPRKeys.has(date + '#' + i);
      const hasNote = !!(s.note && s.note.trim());
      const row = document.createElement('div');
      row.className = setRowClass(ex.sets, i) + ' clickable';
      // Same comment indicator as the Fitness Tracker day overview: only drawn
      // when the set has a note (the slot is always reserved so rows stay
      // aligned), and tapping it opens the same comment popup.
      row.innerHTML = setRowInnerHtml(ex.sets, i, { isPR });
      if (hasNote) {
        row.querySelector('.set-comment').addEventListener('click', e => {
          e.stopPropagation();
          openSetCommentPopup(exIdx, i, date);
        });
      }
      row.addEventListener('click', () => openHistoryGotoDate(date));
      setsDiv.appendChild(row);
    });
    card.appendChild(setsDiv);
    container.appendChild(card);
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
  const sets = (ex && ex.sets) || [];
  sets.forEach((s, i) => {
    const isMarked = countsForRecords(sets, i) && parseInt(s.reps) === markReps && (parseFloat(s.weight) || 0) === markVal;
    const row = document.createElement('div');
    row.className = setRowClass(sets, i) + (isMarked ? ' graph-goto-set-point' : '');
    row.innerHTML = setRowInnerHtml(sets, i, { comment: 'none' });
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
// Dropsets don't count (countsForRecords), like everywhere records/progression are derived.
function getExerciseRepStats(name) {
  const sessions = {};
  let highest = 0;
  Object.keys(db.workouts).forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.name === name);
    if (!ex) return;
    const seen = new Set();
    const sets = ex.sets || [];
    sets.forEach((s, i) => {
      if (!countsForRecords(sets, i)) return;
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
// "Include derived": also plot the moments the leading N-rep weight rose thanks to a set
// with MORE reps (the same progression the Records screen shows), in their own colour.
let graphIncludeDerived = true;
// Points of the graph for `reps` reps, oldest first: { date, val, reps, derived }. Direct
// points = the heaviest set with exactly `reps` reps per session (reps = that count);
// derived points (only when asked) = each step of the leading-weight progression that came
// from a set with more reps (reps = that set's real rep count). Workout-date order.
function getGraphPoints(name, reps, includeDerived) {
  const points = getExerciseRepSeries(name, reps).map(p => ({ date: p.date, val: p.val, reps, derived: false }));
  if (includeDerived) {
    (getRepProgressions(name, getExerciseMaxReps(name))[reps] || []).forEach(st => {
      if (!st.direct) points.push({ date: st.date, val: st.weight, reps: st.sourceReps, derived: true });
    });
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.derived ? 1 : 0) - (b.derived ? 1 : 0)));
  }
  return points;
}

let graphSeries = [];
let graphSelected = -1;
let graphReps = 1;
let graphPlot = null;
const GRAPH_TAP_RADIUS = 28; // px around a point that counts as a tap on it (finger-sized)

// Per session (date, ascending), the heaviest weight actually logged for exactly
// `reps` reps, dropsets excluded. A session without such a set gets no entry — never an estimate.
// Shared by the Graph tab and the Personal Records overlay.
function getExerciseRepSeries(name, reps) {
  if (!(reps >= 1)) return [];
  return Object.keys(db.workouts).sort().reduce((acc, date) => {
    const ex = db.workouts[date] && db.workouts[date].find(e => e.name === name);
    if (!ex) return acc;
    const sets = ex.sets || [];
    const weights = sets.filter((s, i) => countsForRecords(sets, i) && parseInt(s.reps) === reps).map(s => parseFloat(s.weight) || 0);
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
  const legend = document.getElementById('graph-legend');

  const stats = getExerciseRepStats(currentExercise);
  const maxReps = getExerciseMaxReps(currentExercise);
  const reps = resolveGraphReps(stats, maxReps);
  setFieldBtnValue('graph-reps', String(reps), graphRepsLabel(reps));

  let data = getGraphPoints(currentExercise, reps, graphIncludeDerived);

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
    legend.classList.add('hidden');
    graphPlot = null;
    return;
  }
  legend.classList.toggle('hidden', !graphIncludeDerived);
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

  const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Token hex (#rrggbb) → rgba() with the given alpha, for the area fill under the line.
  const hexAlpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const primary = tok('--primary');
  ctx.strokeStyle = tok('--border'); ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (gH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + gW, y); ctx.stroke();
    const label = (maxV - (range / 4) * i).toFixed(1);
    ctx.fillStyle = tok('--text-muted'); ctx.font = '11px Roboto'; ctx.textAlign = 'right';
    ctx.fillText(label, pad.left - 4, y + 4);
  }

  const pts = data.map((d, i) => ({
    x: data.length === 1 ? pad.left + gW / 2 : pad.left + (i / (data.length - 1)) * gW,
    y: pad.top + gH - ((d.val - minV) / range) * gH
  }));
  graphPlot = { pts };

  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
  grad.addColorStop(0, hexAlpha(primary, 0.35));
  grad.addColorStop(1, hexAlpha(primary, 0.02));
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pad.top + gH);
  ctx.lineTo(pts[0].x, pad.top + gH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = primary; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Direct points: blue dot. Derived ("via") points: the PR gold with a white edge.
  const gold = tok('--pr-gold');
  pts.forEach((p, i) => {
    if (data[i].derived) {
      ctx.fillStyle = gold; ctx.strokeStyle = tok('--surface'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = primary;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Selected point: green ring around its (still blue / gold) dot.
  const sel = pts[graphSelected];
  if (sel) {
    ctx.strokeStyle = tok('--success');
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sel.x, sel.y, 9, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = tok('--text-muted'); ctx.font = '11px Roboto';
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
  // A derived point shows the REAL rep count of its source set plus what it counts as.
  document.getElementById('graph-sel-main').textContent = `${pt.val} kg × ${pt.reps} rep${pt.reps === 1 ? '' : 's'}`;
  const dateEl = document.getElementById('graph-sel-date');
  dateEl.textContent = formatDateStr(pt.date, 'detail');
  if (pt.derived) {
    const via = document.createElement('span');
    via.className = 'graph-sel-via';
    via.textContent = 'Derived \u2014 counts as ' + recordsRepLabel(graphReps);
    dateEl.appendChild(via);
  }
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
document.getElementById('graph-derived').addEventListener('change', e => {
  graphIncludeDerived = e.target.checked;
  renderGraph();
});

document.getElementById('graph-sel-info').addEventListener('click', () => {
  const pt = graphSeries[graphSelected];
  if (!pt) return;
  openHistoryGotoDaySets(pt.date, pt.reps, pt.val);
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
  hdr.className = 'section-label';
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
  calJumpTo(+t.slice(0, 4), +t.slice(5, 7) - 1, t);
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
      row.className = setRowClass(ex.sets, i);
      row.innerHTML = setRowInnerHtml(ex.sets, i, { comment: 'none', isPR });
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
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

// -- Delete exercise (built-in or custom) ----------------
let pendingDeleteExercise = null;

function openDeleteExerciseConfirm(ex) {
  pendingDeleteExercise = ex;
  const workoutCount = Object.values(db.workouts).filter(exercises => exercises.some(e => e.name === ex.name)).length;
  document.getElementById('delete-ex-msg').innerHTML =
    `Weet je zeker dat je <strong>${ex.name}</strong> wilt verwijderen? De <strong>${workoutCount} workout${workoutCount !== 1 ? 's' : ''}</strong> die voor deze oefening zijn vastgelegd, worden ook permanent verwijderd.`;
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
  toast('Oefening verwijderd');
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
  'plan-rename-overlay': 'btn-plan-rename-cancel',
  'delete-plan-day-overlay': 'btn-delete-plan-day-cancel',
  'day-picker-overlay': 'btn-day-picker-cancel',
  'pde-sets-reps-overlay': 'btn-pde-sr-cancel',
  'delete-pde-exercise-overlay': 'btn-delete-pde-exercise-cancel',
  'reset-overlay': 'btn-reset-cancel',
  'history-goto-overlay': 'history-goto-cancel',
  'discard-changes-overlay': 'btn-discard-changes-cancel',
  'confirm-delete-overlay': 'btn-confirm-delete-cancel',
  'schedule-load-overlay': 'btn-schedule-load-cancel',
  'recap-overlay': 'btn-recap-close',
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
  setupSwipeNav('home-content', navigateDay, { startGuard: () => homeSel.active });
}

// -- Event Listeners ------------------------------------
document.getElementById('btn-prev-day').addEventListener('click', () => navigateDay(-1));
document.getElementById('btn-next-day').addEventListener('click', () => navigateDay(1));
document.getElementById('btn-calendar').addEventListener('click', openCalendar);
document.getElementById('btn-add-exercise').addEventListener('click', openExerciseList);
document.getElementById('btn-home-sel-done').addEventListener('click', exitHomeSelMode);
document.getElementById('btn-home-sel-delete').addEventListener('click', confirmDeleteHomeSelectedEx);
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
    goBack(exerciseScreenMode === 'plan-add' ? 'screen-plan-day-edit' : 'screen-fitness-tracker');
  }
});

document.getElementById('btn-new-exercise').addEventListener('click', openNewExerciseScreen);
document.getElementById('btn-back-training').addEventListener('click', () => goBack('screen-fitness-tracker', () => hasChanges(trackFieldsBaseline, getTrackFieldsSnapshot())));
document.getElementById('btn-back-new-workout').addEventListener('click', () => goBack('screen-fitness-tracker'));
document.getElementById('btn-nw-manual').addEventListener('click', openExerciseList);
document.getElementById('btn-nw-schema-manual').addEventListener('click', openSchedulePickPlan);
document.getElementById('btn-nw-schema-auto').addEventListener('click', openScheduleLoadAuto);
document.getElementById('btn-back-schedule-pick-plan').addEventListener('click', () => goBack('screen-new-workout'));
document.getElementById('btn-back-schedule-pick-day').addEventListener('click', () => goBack('screen-schedule-pick-plan'));
document.getElementById('btn-save-set').addEventListener('click', saveSet);
document.getElementById('btn-clear').addEventListener('click', () => {
  if (selectedSetIndex === null) { clearFields(); return; }
  const i = selectedSetIndex;
  openConfirmDelete({
    title: 'Set verwijderen?',
    message: `Set ${i + 1} van "${currentExercise}" verwijderen? Dit kan niet ongedaan worden gemaakt.`,
    onConfirm: () => deleteSet(i),
  });
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
  if (row) openHistoryGotoDaySets(row.dataset.date, parseInt(row.dataset.srcReps) || recordsHistoryReps, parseFloat(row.dataset.val), 'records-history-overlay');
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
document.getElementById('btn-day-recap').addEventListener('click', openDayRecap);
document.getElementById('btn-recap-close').addEventListener('click', () => closeOverlay('recap-overlay'));
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
  const ctx = commentPopupCtx;
  const doDelete = () => {
    if (ctx) ctx.onDelete();
    closeOverlay('comment-overlay');
    toast('Comment verwijderd');
  };
  // Nothing saved yet (popup opened straight into edit mode): nothing to lose, just close.
  const saved = ctx && ctx.getText();
  if (!saved || !saved.trim()) { doDelete(); return; }
  openConfirmDelete({
    title: 'Comment verwijderen?',
    message: `${ctx.label} verwijderen? Dit kan niet ongedaan worden gemaakt.`,
    onConfirm: doDelete,
  });
});
document.getElementById('btn-comment-save').addEventListener('click', () => {
  const val = document.getElementById('comment-edit-input').value.trim();
  if (commentPopupCtx) commentPopupCtx.onSave(val);
  closeOverlay('comment-overlay');
  // Saving an emptied comment removes it, same as Delete.
  toast(val ? 'Comment saved' : 'Comment verwijderd');
});

document.getElementById('exercise-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (q) {
    renderExerciseSearchResults(q);
    setExercisesTitle(defaultExercisesTitle());
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
  renderHome(); // also (re)renders the smart day banner
  showScreen('screen-fitness-tracker');
}

document.getElementById('menu-card-fitness').addEventListener('click', openFitnessTracker);
document.getElementById('menu-card-workout').addEventListener('click', openWorkoutPlan);
document.getElementById('menu-card-calculator').addEventListener('click', () => showScreen('screen-calculator'));
document.getElementById('menu-card-nutrition').addEventListener('click', () => showScreen('screen-nutrition'));
document.getElementById('menu-card-insight').addEventListener('click', () => showScreen('screen-insight'));

// -- Theme (light/dark) ---------------------------------
// The inline script at the top of <head> already set data-theme before first
// paint (saved choice, else the phone's setting); this keeps everything in sync
// when it changes. Once the user has tapped the toggle, only the saved choice counts.
const THEME_KEY = 'theme';
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function savedTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
}
function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // Android status bar follows the active theme's toolbar color.
  document.querySelector('meta[name="theme-color"]').content =
    getComputedStyle(document.documentElement).getPropertyValue('--toolbar').trim();
  document.getElementById('btn-theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  // The canvas chart reads its colors from the tokens only while drawing, so redraw it if it's on screen.
  if (graphPlot && document.getElementById('tab-graph').offsetParent) drawGraphChart();
}
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next);
});
// No saved choice yet: keep following the phone's setting if it changes while the app is open.
systemDarkQuery.addEventListener('change', e => { if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light'); });
applyTheme(currentTheme());

document.getElementById('btn-home-from-tracker').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-workout-plan').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-nutrition').addEventListener('click', () => goBack('screen-home'));
document.getElementById('btn-back-insight').addEventListener('click', () => goBack('screen-home'));
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

// -- Day Recap popup (#recap-overlay, the Fitness Tracker's "Recap" pill) --------
// Summarizes the VIEWED day (currentDate): how many PRs it has, then per exercise,
// logged sets vs. the plan target it was loaded with (only when it has one), and each
// set's weight, reps and RPE vs. the same set in the most recent earlier session.
const recapDayFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

function recapDayName(dateStr) {
  const s = recapDayFormat.format(new Date(dateStr + 'T00:00:00Z'));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Sets as the user counts them: a dropset continuation belongs to the set before it.
function workingSets(sets) {
  return sets.filter(s => !s.isDropsetContinuation);
}
function countWorkingSets(sets) {
  return workingSets(sets).length;
}

// The most recent session BEFORE `date` with logged sets of `name`, or null.
function previousSessionSets(name, date) {
  const prev = Object.keys(db.workouts).filter(d => d < date).sort().reverse()
    .map(d => db.workouts[d].find(e => e.name === name))
    .find(e => e && e.sets && e.sets.length > 0);
  return prev ? prev.sets : null;
}

function recapLine(cls, icon, html) {
  return `<div class="recap-line ${cls}"><span class="recap-icon">${icon}</span><span>${html}</span></div>`;
}

function recapSetsLine(ex) {
  const planned = ex.target.repsPerSet ? ex.target.repsPerSet.length : ex.target.sets;
  const done = countWorkingSets(ex.sets || []);
  if (done === planned) return recapLine('recap-ok', '✓', `${done}/${planned} sets (volgens schema)`);
  if (done < planned) return recapLine('recap-warn', '⚠', `${done}/${planned} sets (${planned - done} minder dan gepland)`);
  return recapLine('recap-more', '+', `${done}/${planned} sets (${done - planned} meer dan gepland)`);
}

// Working sets (dropset continuations folded into the set before them) with the
// raw `sets` indices they cover — PR keys (getPRSetKeys) use the raw index.
function workingSetGroups(sets) {
  const groups = [];
  sets.forEach((s, i) => {
    if (s.isDropsetContinuation && groups.length) groups[groups.length - 1].idxs.push(i);
    else groups.push({ set: s, idxs: [i] });
  });
  return groups;
}

// One block per working set of the day, each compared with the set at the SAME
// position in the most recent earlier session (Set 1 vs Set 1, ...):
//   "Set N" (+ the trophy when it is a PR — its dropsets never are)
//   weight × reps, with weight and reps judged separately
//   RPE, judged on its own (higher = felt heavier, so red)
//   what that set was last time
// Extra sets today have no counterpart; extra sets last time are simply not shown.
// No earlier session at all: no comparisons, one note under the last set.
function recapSetLines(ex, date, prKeys) {
  const groups = workingSetGroups(ex.sets || []);
  if (groups.length === 0) return recapLine('recap-muted', '', 'Nog geen sets gelogd');
  const prevSessionSets = previousSessionSets(ex.name, date);
  const prev = prevSessionSets ? workingSets(prevSessionSets) : null;
  const reps = n => `${n} ${n === 1 ? 'rep' : 'reps'}`;
  const blocks = groups.map(({ set: s, idxs }, i) => {
    const w = Number(s.weight) || 0, r = Number(s.reps) || 0, rpe = parseFloat(s.rpe) || 0;
    const p = prev && prev[i];
    const isPR = idxs.some(idx => prKeys.has(date + '#' + idx));
    let wrMarks = '', rpeMark = '', prevLine = '';
    if (p) {
      const pw = Number(p.weight) || 0, pr = Number(p.reps) || 0, prpe = parseFloat(p.rpe) || 0;
      const dw = Math.round((w - pw) * 100) / 100, dr = r - pr;
      const marks = [];
      if (dw > 0) marks.push(`<span class="recap-up">↑ +${formatKg(dw)} kg</span>`);
      if (dw < 0) marks.push(`<span class="recap-down">↓ -${formatKg(-dw)} kg</span>`);
      if (dr > 0) marks.push(`<span class="recap-up">↑ +${reps(dr)}</span>`);
      if (dr < 0) marks.push(`<span class="recap-down">↓ -${reps(-dr)}</span>`);
      wrMarks = ' ' + (marks.length ? marks.join(' ') : '<span class="recap-muted">(gelijk)</span>');
      if (rpe > 0 && prpe > 0) {
        const d = Math.round((rpe - prpe) * 10) / 10;
        rpeMark = d > 0 ? ` <span class="recap-down">↑ +${formatRpe(d)}</span>`
          : d < 0 ? ` <span class="recap-up">↓ -${formatRpe(-d)}</span>`
          : ' <span class="recap-muted">(gelijk)</span>';
      }
      prevLine = `Vorige keer: ${formatKg(pw)}×${pr}${prpe > 0 ? `, RPE ${formatRpe(prpe)}` : ''}`;
    } else if (prev) {
      prevLine = '(geen vorige set)';
    }
    return `
      <div class="recap-set">
        <div class="recap-set-head">Set ${i + 1}${isPR ? ' ' + prTrophySvg('recap-set-pr') : ''}</div>
        <div>${formatKg(w)} kg × ${r}${wrMarks}</div>
        <div>${rpe > 0 ? `RPE ${formatRpe(rpe)}${rpeMark}` : '<span class="recap-muted">Geen RPE gelogd</span>'}</div>
        ${prevLine ? `<div class="recap-prev">${prevLine}</div>` : ''}
      </div>`;
  });
  if (!prev) blocks.push(recapLine('recap-muted', '', 'Eerste keer deze oefening — geen vergelijking'));
  return blocks.join('');
}

// PR sets logged on `date`, per exercise name — straight from getPRSetKeys(), the
// same detection that draws the Track screen's trophies.
function recapPRKeys(exercises, date) {
  const byName = {};
  let count = 0;
  exercises.forEach(ex => {
    const keys = getPRSetKeys(ex.name);
    byName[ex.name] = keys;
    keys.forEach(k => { if (k.startsWith(date + '#')) count++; });
  });
  return { byName, count };
}

function openDayRecap() {
  const date = currentDate;
  const exercises = getWorkout(date);
  document.getElementById('recap-title').textContent = `Recap — ${recapDayName(date)}`;
  const body = document.getElementById('recap-body');
  // Exercises with logged sets, plus planned ones still at 0 sets (they count as
  // "minder dan gepland"); nothing logged at all on this day -> empty state.
  const shown = exercises.filter(ex => (ex.sets && ex.sets.length > 0) || ex.target);
  const prs = recapPRKeys(shown, date);
  const prsEl = document.getElementById('recap-prs');
  prsEl.textContent = `🏆 ${prs.count} ${prs.count === 1 ? 'nieuw record' : 'nieuwe records'} ${date === todayStr() ? 'vandaag' : 'op deze dag'}`;
  prsEl.classList.toggle('hidden', prs.count === 0);
  if (!exercises.some(ex => ex.sets && ex.sets.length > 0)) {
    body.innerHTML = `<div class="recap-empty">${date === todayStr() ? 'Nog niets gelogd vandaag.' : 'Nog niets gelogd op deze dag.'}</div>`;
  } else {
    body.innerHTML = shown.map(ex => `
      <div class="recap-ex">
        <div class="recap-ex-name">${ex.name}</div>
        ${ex.target ? recapSetsLine(ex) : ''}
        ${recapSetLines(ex, date, prs.byName[ex.name])}
      </div>`).join('');
  }
  openOverlay('recap-overlay');
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
  const copy = { id: newId, name: 'Kopie van ' + src.name, days: JSON.parse(JSON.stringify(src.days || [])), createdAt: Date.now() };
  db.plans[newId] = copy;
  await persistPlan(newId, copy);
  renderPlanList();
  toast('Plan gedupliceerd');
}

async function deletePlan(planId) {
  delete db.plans[planId];
  await deletePlanDoc(planId);
  if (db.activePlan && db.activePlan.planId === planId) {
    db.activePlan = null;
    await persistActivePlan(null);
  }
  renderPlanList();
  toast('Plan verwijderd');
}

// -- Delete plan confirmation ----------------------------
let pendingDeletePlanId = null;
let pendingDeletePlanOnDeleted = null;

function openDeletePlanConfirm(planId, planName, onDeleted) {
  pendingDeletePlanId = planId;
  pendingDeletePlanOnDeleted = onDeleted || null;
  document.getElementById('delete-plan-msg').textContent = `"${planName}" verwijderen? Dit kan niet ongedaan worden gemaakt.`;
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
    toast('Actief plan verwijderd');
  } else {
    db.activePlan = { planId, planName: plan.name, lastDayIndex: -1 };
    await persistActivePlan(db.activePlan);
    bannerDismissed = false;
    toast('Ingesteld als actief plan');
  }
}

// ── Plan List Screen ──────────────────────────────────
function openWorkoutPlan() {
  renderPlanList();
  showScreen('screen-workout-plan');
}

// Newest first — the order of "Mijn plannen" and the Fitness Tracker's "Kies een plan".
function sortedPlans() {
  return Object.values(db.plans).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// One plan card (name, day count, ★ ACTIEF pill). `withMenu` adds the ⋮ button;
// callers attach their own click handlers.
function buildPlanItem(plan, { withMenu }) {
  const isActive = db.activePlan && db.activePlan.planId === plan.id;
  const dayCount = (plan.days || []).length;
  const item = document.createElement('div');
  item.className = 'plan-item';
  item.innerHTML = `
    <div class="plan-item-info">
      <div class="plan-item-name">${plan.name}</div>
      <div class="plan-item-meta">${dayCount} dag${dayCount !== 1 ? 'en' : ''}</div>
      ${isActive ? '<div class="badge badge-primary plan-item-active-pill">★ ACTIEF</div>' : ''}
    </div>
    ${withMenu ? '<button class="plan-item-dots" aria-label="Options"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>' : ''}
  `;
  return item;
}

function renderPlanList() {
  const scroll = document.getElementById('plan-list-scroll');
  const plans = sortedPlans();
  if (plans.length === 0) {
    scroll.innerHTML = '<div class="plan-list-empty">Nog geen plannen. Maak er hierboven een aan!</div>';
    return;
  }
  scroll.innerHTML = '';
  plans.forEach(plan => {
    const item = buildPlanItem(plan, { withMenu: true });
    item.querySelector('.plan-item-info').addEventListener('click', () => {
      // First tap after creation configures the schedule (Aantal dagen/Dagindeling);
      // once that's been confirmed once, later taps go straight to the day cards —
      // "Bewerken" in Plan Detail is the way to change the configuration after that.
      if (plan.scheduleConfirmed) openPlanDetail(plan.id);
      else openPlanSchedule(plan.id);
    });
    item.querySelector('.plan-item-dots').addEventListener('click', e => {
      e.stopPropagation();
      const isAct = db.activePlan && db.activePlan.planId === plan.id;
      showOverflowMenu([
        { label: isAct ? '★ Actief verwijderen' : 'Actief maken', action: async () => { await setActivePlan(plan.id); renderPlanList(); } },
        { label: 'Dupliceren', action: () => duplicatePlan(plan.id) },
        { label: 'Verwijderen', action: () => openDeletePlanConfirm(plan.id, plan.name) },
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
  planDetailEditMode = false;
  expandedPlanDayIndex = null;
  document.getElementById('plan-detail-title').textContent = currentPlanData.name;
  const isActive = db.activePlan && db.activePlan.planId === planId;
  const ribbon = document.getElementById('plan-active-ribbon');
  ribbon.classList.toggle('show', isActive);
  const starBtn = document.getElementById('btn-plan-set-active');
  starBtn.classList.toggle('is-active', isActive);
  renderPlanDetail();
  showScreen('screen-plan-detail');
}

// True once "Week toevoegen" has started a Week B section — checked via the explicit
// flag (so a still-EMPTY Week B keeps its own "Dag toevoegen" block and the "Week
// toevoegen" block stays gone) OR'd with actually having a 'B' day (so a plan that was
// already split by the Schedule screen, before this flag existed, still counts).
function planHasWeekB() {
  return !!(currentPlanData.hasWeekB || (currentPlanData.days || []).some(d => d.group === 'B'));
}

function renderPlanDetail() {
  document.getElementById('btn-plan-title-edit').classList.toggle('hidden', !planDetailEditMode);
  document.getElementById('btn-plan-set-active').classList.toggle('hidden', planDetailEditMode);
  document.getElementById('btn-plan-detail-done').classList.toggle('hidden', !planDetailEditMode);
  const scroll = document.getElementById('plan-detail-scroll');
  if (!currentPlanData || !currentPlanData.days) { scroll.innerHTML = ''; return; }
  scroll.innerHTML = '';

  // Rendered as segments so each week's own "Dag toevoegen" block lands right after
  // that week's last card, even when Week A's block is tapped after Week B already
  // has days of its own.
  const segments = planDaySegments(currentPlanData.days);
  if (segments.length === 0) segments.push({ group: undefined, dayIndices: [] });
  // A brand-new, still-empty Week B (planHasWeekB() via the flag, no 'B' day yet) has no
  // segment of its own from the loop above — add one so it still gets its heading + block.
  if (planHasWeekB() && !segments.some(s => s.group === 'B')) segments.push({ group: 'B', dayIndices: [] });

  segments.forEach(seg => {
    if (seg.group) scroll.appendChild(buildPlanDayGroupLabel(seg.group));
    seg.dayIndices.forEach(idx => scroll.appendChild(buildPlanDayCard(currentPlanData.days[idx], idx)));
    if (planDetailEditMode) scroll.appendChild(buildAddDayBlock(seg.group));
  });

  if (planDetailEditMode && !planHasWeekB()) scroll.appendChild(buildAddWeekBlock());
}

// Groups the (already-ordered) days into contiguous same-group runs — 'A', 'B', or
// undefined for a plan with no Week A/B split yet: [{ group, dayIndices: [...] }].
function planDaySegments(days) {
  const segments = [];
  days.forEach((day, idx) => {
    let seg = segments[segments.length - 1];
    if (!seg || seg.group !== day.group) { seg = { group: day.group, dayIndices: [] }; segments.push(seg); }
    seg.dayIndices.push(idx);
  });
  return segments;
}

function buildPlanDayGroupLabel(group) {
  const label = document.createElement('div');
  label.className = 'section-label plan-day-group-label';
  label.textContent = group === 'A' ? 'WEEK A' : 'WEEK B';
  return label;
}

function planDaySubText(day) {
  const exCount = (day.exercises || []).length;
  return exCount === 0 ? 'Geen oefeningen' : `${exCount} ${exCount === 1 ? 'oefening' : 'oefeningen'}`;
}

// A plan day's exercise carries EITHER a uniform {sets, reps} pair OR a
// per-set {repsPerSet: [...]} list (never both — see the save handler on
// #pde-sets-reps-overlay) — every other place that displays sets/reps reads
// through this instead of the raw fields. `style: 'short'` drops " sets"/
// " reps" for tighter spots (the day-card preview); per-set reps has no
// shorter form of its own either way.
function formatExerciseSetsReps(ex, style) {
  if (Array.isArray(ex.repsPerSet) && ex.repsPerSet.length > 0) return `${ex.repsPerSet.join('-')} reps`;
  return style === 'short' ? `${ex.sets}×${ex.reps}` : `${ex.sets} sets × ${ex.reps} reps`;
}

function buildPlanDayCard(day, idx) {
  const exercises = day.exercises || [];
  const exCount = exercises.length;
  const subText = planDaySubText(day);
  const expanded = expandedPlanDayIndex === idx;
  const card = document.createElement('div');
  card.className = 'plan-day-card';
  card.innerHTML = `
    <div class="plan-day-head">
      <div class="plan-day-num">${idx + 1}</div>
      <div class="plan-day-info">
        <div class="plan-day-name-row">
          <div class="plan-day-name">${day.name}</div>
          ${planDetailEditMode ? `
          <button class="plan-day-rename-btn" aria-label="Naam wijzigen">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>` : ''}
        </div>
        <div class="plan-day-sub">${subText}</div>
      </div>
      <svg class="plan-day-chevron${expanded ? ' expanded' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
      ${planDetailEditMode ? `
      <button class="plan-day-delete-btn" aria-label="Dag verwijderen">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>` : `
      <button class="plan-day-edit-btn" aria-label="Bewerken">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </button>`}
    </div>
    ${expanded ? `
    <div class="plan-day-preview">
      ${exCount === 0 ? `<div class="plan-day-preview-empty">Geen oefeningen</div>` : exercises.map(ex => `
      <div class="plan-day-preview-row"><span class="plan-day-preview-name">${ex.name}</span><span class="plan-day-preview-meta">${formatExerciseSetsReps(ex, 'short')}</span></div>`).join('')}
    </div>` : ''}
  `;
  // Tapping the head (number, name, exercise count) toggles this card's inline
  // preview — accordion behaviour: only one day at a time, enforced by
  // expandedPlanDayIndex being a single value. The pencil/trash/rename buttons
  // stop propagation so they keep their own actions instead of also toggling it.
  card.querySelector('.plan-day-head').addEventListener('click', () => {
    expandedPlanDayIndex = expanded ? null : idx;
    renderPlanDetail();
  });
  if (planDetailEditMode) {
    card.querySelector('.plan-day-rename-btn').addEventListener('click', e => { e.stopPropagation(); openPlanDayRename(idx); });
    card.querySelector('.plan-day-delete-btn').addEventListener('click', e => { e.stopPropagation(); openDeletePlanDayConfirm(idx); });
  } else {
    card.querySelector('.plan-day-edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      openPlanDayEdit(idx);
    });
  }
  return card;
}

function buildAddDayBlock(group) {
  const block = document.createElement('button');
  block.className = 'plan-add-day-block';
  block.innerHTML = `<span class="plan-add-block-icon">+</span><span>Dag toevoegen</span>`;
  block.addEventListener('click', () => addPlanDay(group));
  return block;
}

function buildAddWeekBlock() {
  const block = document.createElement('button');
  block.className = 'plan-add-week-block';
  block.innerHTML = `<span class="plan-add-block-icon">+</span><span>Week toevoegen</span>`;
  block.addEventListener('click', addPlanWeek);
  return block;
}

// -- Plan / plan day rename (shared #plan-rename-overlay) ----------------
function openPlanRename() {
  pendingRenameDayIndex = null;
  planRenameBaseline = currentPlanData.name;
  document.getElementById('plan-rename-input').value = currentPlanData.name;
  openOverlay('plan-rename-overlay');
  setTimeout(() => document.getElementById('plan-rename-input').select(), 100);
}

function openPlanDayRename(idx) {
  pendingRenameDayIndex = idx;
  planRenameBaseline = currentPlanData.days[idx].name;
  document.getElementById('plan-rename-input').value = currentPlanData.days[idx].name;
  openOverlay('plan-rename-overlay');
  setTimeout(() => document.getElementById('plan-rename-input').select(), 100);
}

document.getElementById('btn-plan-title-edit').addEventListener('click', openPlanRename);

document.getElementById('btn-plan-rename-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(planRenameBaseline, document.getElementById('plan-rename-input').value),
    () => closeOverlay('plan-rename-overlay')
  );
});
document.getElementById('btn-plan-rename-save').addEventListener('click', async () => {
  const val = document.getElementById('plan-rename-input').value.trim();
  if (!val) return;
  if (pendingRenameDayIndex === null) {
    currentPlanData.name = val;
    document.getElementById('plan-detail-title').textContent = val;
  } else {
    currentPlanData.days[pendingRenameDayIndex].name = val;
  }
  closeOverlay('plan-rename-overlay');
  renderPlanDetail();
  await savePlanSchedule();
});

// -- Plan day delete (mirrors openDeletePlanConfirm / #delete-plan-overlay) --
function openDeletePlanDayConfirm(idx) {
  pendingDeleteDayIndex = idx;
  const day = currentPlanData.days[idx];
  document.getElementById('delete-plan-day-msg').textContent = `"${day.name}" verwijderen? Dit kan niet ongedaan worden gemaakt.`;
  openOverlay('delete-plan-day-overlay');
}

document.getElementById('btn-delete-plan-day-cancel').addEventListener('click', () => {
  pendingDeleteDayIndex = null;
  closeOverlay('delete-plan-day-overlay');
});
document.getElementById('btn-delete-plan-day-confirm').addEventListener('click', async () => {
  if (pendingDeleteDayIndex === null) return;
  currentPlanData.days.splice(pendingDeleteDayIndex, 1);
  pendingDeleteDayIndex = null;
  closeOverlay('delete-plan-day-overlay');
  syncPlanScheduleFieldsAfterDayChange();
  renderPlanDetail();
  await savePlanSchedule();
});

// ── Plan Schedule Screen (days/week + optional fixed weekday assignment) ──
// Tapping a plan card in "Mijn plannen" opens this instead of the day/exercise
// screen above — that screen (and Plan Day Edit, and the Presets/AI-generate
// flows that used to feed it) is unreachable from the UI now but left intact.
function openPlanSchedule(planId) {
  currentPlanId = planId;
  currentPlanData = db.plans[planId];
  if (!currentPlanData) return;
  document.getElementById('plan-schedule-title').textContent = currentPlanData.name;
  renderPlanSchedule();
  showScreen('screen-plan-schedule');
}

async function savePlanSchedule() {
  db.plans[currentPlanId] = currentPlanData;
  await persistPlan(currentPlanId, currentPlanData);
}

function renderPlanSchedule() {
  if (!currentPlanData) return;
  const daysPerWeek = currentPlanData.daysPerWeek || 0;
  const fixedDays = !!currentPlanData.fixedDays;
  const weekdaysA = currentPlanData.weekdaysA || [];
  const weekdaysB = currentPlanData.weekdaysB || [];
  const splitWeeks = daysPerWeek > 7;

  document.querySelectorAll('#ps-day-count-grid .ps-num-box').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.days) === daysPerWeek);
  });

  document.querySelectorAll('#ps-fixed-toggle .ps-toggle-option').forEach(btn => {
    btn.classList.toggle('selected', (btn.dataset.fixed === '1') === fixedDays);
  });

  document.getElementById('btn-plan-schedule-continue').disabled = !isPlanScheduleValid(currentPlanData);

  document.getElementById('ps-weekdays-section').style.display = fixedDays ? '' : 'none';
  if (!fixedDays) return;

  document.getElementById('ps-week-a-label').style.display = splitWeeks ? '' : 'none';
  document.getElementById('ps-week-b-block').style.display = splitWeeks ? '' : 'none';

  const totalSelected = weekdaysA.length + (splitWeeks ? weekdaysB.length : 0);
  document.getElementById('ps-weekdays-counter').textContent = `${totalSelected} / ${daysPerWeek} dagen geselecteerd`;
  const atLimit = totalSelected >= daysPerWeek;

  function renderWeekRow(weekKey, selectedArr) {
    document.querySelectorAll(`.ps-weekday-row[data-week="${weekKey}"] .ps-day-circle`).forEach(btn => {
      const isSelected = selectedArr.includes(parseInt(btn.dataset.day));
      btn.classList.toggle('selected', isSelected);
      btn.disabled = !isSelected && atLimit;
    });
  }
  renderWeekRow('a', weekdaysA);
  if (splitWeeks) renderWeekRow('b', weekdaysB);
}

// A schedule is only ready for "Doorgaan" once a day count is chosen, and — for fixed
// weekdays — exactly that many weekdays are checked (across both weeks when > 7).
function isPlanScheduleValid(plan) {
  const daysPerWeek = plan.daysPerWeek || 0;
  if (daysPerWeek <= 0) return false;
  if (!plan.fixedDays) return true;
  const splitWeeks = daysPerWeek > 7;
  const total = (plan.weekdaysA || []).length + (splitWeeks ? (plan.weekdaysB || []).length : 0);
  return total === daysPerWeek;
}

const WEEKDAY_FULL_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

// Turns the schedule config into the flat "days" list screen-plan-detail renders.
// No fixed days: "Dag 1".."Dag N". Fixed, <=7: one day per checked weekday, full Dutch
// name, Mon->Sun order. Fixed, >7: Week A's checked days then Week B's, each named
// "{Dagnaam} A"/"{Dagnaam} B" and flagged with `group` so renderPlanDetail() can show
// the "WEEK A"/"WEEK B" headers.
function generatePlanDaysFromSchedule(plan) {
  const daysPerWeek = plan.daysPerWeek || 0;
  if (!plan.fixedDays) {
    return Array.from({ length: daysPerWeek }, (_, i) => ({ name: `Dag ${i + 1}`, exercises: [] }));
  }
  const weekdaysA = [...(plan.weekdaysA || [])].sort((a, b) => a - b);
  if (daysPerWeek <= 7) {
    return weekdaysA.map(d => ({ name: WEEKDAY_FULL_NAMES[d], exercises: [] }));
  }
  const weekdaysB = [...(plan.weekdaysB || [])].sort((a, b) => a - b);
  return [
    ...weekdaysA.map(d => ({ name: `${WEEKDAY_FULL_NAMES[d]} A`, exercises: [], group: 'A' })),
    ...weekdaysB.map(d => ({ name: `${WEEKDAY_FULL_NAMES[d]} B`, exercises: [], group: 'B' })),
  ];
}

// ── Plan Detail editable state: add day / add week ────────────────────
// Days generated by generatePlanDaysFromSchedule() (or a plan created before this
// editable state existed) don't carry an explicit weekday index — only their
// rendered Dutch name. This recovers it by parsing that name (after stripping any
// "A"/"B" suffix), so weekday bookkeeping still works for a day this feature didn't
// itself create. Returns undefined if the name was hand-edited into something
// unparseable (e.g. via the rename pencil) — callers degrade gracefully for that.
function inferDayWeekday(day) {
  if (day.weekday !== undefined) return day.weekday;
  let name = day.name;
  if (day.group) name = name.replace(new RegExp('\\s*' + day.group + '$'), '');
  const idx = WEEKDAY_FULL_NAMES.indexOf(name);
  return idx >= 0 ? idx : undefined;
}

// Keeps daysPerWeek/weekdaysA/weekdaysB consistent with the actual `days` array after
// any edit-mode add/delete, so the Plan Schedule screen still shows the right state if
// the user goes back there, and a later "Doorgaan" there regenerates matching days
// (generatePlanDaysFromSchedule preserves a day's exercises by matching on name).
function syncPlanScheduleFieldsAfterDayChange() {
  const days = currentPlanData.days;
  currentPlanData.daysPerWeek = days.length;
  if (!currentPlanData.fixedDays) return;
  currentPlanData.weekdaysA = days.filter(d => d.group !== 'B').map(inferDayWeekday).filter(w => w !== undefined);
  currentPlanData.weekdaysB = days.filter(d => d.group === 'B').map(inferDayWeekday).filter(w => w !== undefined);
}

// Week A's "Dag toevoegen" must insert right after Week A's own last day, not at the
// very end of the array — Week B's days (if any) come after it and must stay last so
// renderPlanDetail()'s contiguous-run grouping doesn't split Week A into two sections.
function insertPlanDay(day, group) {
  if (group === 'A') {
    let insertAt = currentPlanData.days.length;
    for (let i = currentPlanData.days.length - 1; i >= 0; i--) {
      if (currentPlanData.days[i].group === 'A') { insertAt = i + 1; break; }
    }
    currentPlanData.days.splice(insertAt, 0, day);
  } else {
    currentPlanData.days.push(day);
  }
}

async function addPlanDay(group) {
  if (!currentPlanData) return;
  if (!currentPlanData.fixedDays) {
    const name = `Dag ${currentPlanData.days.length + 1}`;
    insertPlanDay(group ? { name, exercises: [], group } : { name, exercises: [] }, group);
    syncPlanScheduleFieldsAfterDayChange();
    renderPlanDetail();
    await savePlanSchedule();
    return;
  }
  openPlanWeekdayPicker(group);
}

function openPlanWeekdayPicker(group) {
  pendingAddDayGroup = group;
  const usedWeekdays = new Set(
    currentPlanData.days
      .filter(d => (d.group || undefined) === (group || undefined))
      .map(inferDayWeekday)
      .filter(w => w !== undefined)
  );
  const grid = document.getElementById('day-picker-grid');
  grid.innerHTML = WEEKDAY_FULL_NAMES.map((fullName, i) => {
    const taken = usedWeekdays.has(i);
    const short = fullName.slice(0, 2);
    return `<button class="day-picker-circle" data-day="${i}" ${taken ? 'disabled' : ''}>${short}</button>`;
  }).join('');
  openOverlay('day-picker-overlay');
}

document.getElementById('day-picker-grid').addEventListener('click', async e => {
  const btn = e.target.closest('.day-picker-circle');
  if (!btn || btn.disabled) return;
  const weekday = parseInt(btn.dataset.day);
  const group = pendingAddDayGroup;
  closeOverlay('day-picker-overlay');
  const name = WEEKDAY_FULL_NAMES[weekday] + (group ? ' ' + group : '');
  const day = { name, exercises: [], weekday };
  if (group) day.group = group;
  insertPlanDay(day, group);
  syncPlanScheduleFieldsAfterDayChange();
  renderPlanDetail();
  await savePlanSchedule();
});

document.getElementById('btn-day-picker-cancel').addEventListener('click', () => closeOverlay('day-picker-overlay'));

// Converts a single-week plan into Week A + a new, empty Week B: existing days become
// Week A (fixed-days plans also get their weekday recovered via inferDayWeekday() and
// an " A" suffix appended, since their name was plain "Maandag" etc. until now).
async function addPlanWeek() {
  if (!currentPlanData) return;
  currentPlanData.days.forEach(day => {
    const w = currentPlanData.fixedDays ? inferDayWeekday(day) : undefined;
    day.group = 'A';
    if (currentPlanData.fixedDays && w !== undefined) {
      day.weekday = w;
      day.name = WEEKDAY_FULL_NAMES[w] + ' A';
    }
  });
  currentPlanData.hasWeekB = true;
  syncPlanScheduleFieldsAfterDayChange();
  renderPlanDetail();
  await savePlanSchedule();
}

document.getElementById('btn-plan-schedule-continue').addEventListener('click', async () => {
  if (!currentPlanData || !isPlanScheduleValid(currentPlanData)) return;
  // Best-effort preserve: a regenerated day keeps its old exercises only if a day with
  // that exact name already existed. Any day whose name isn't reproduced by the new
  // config (count/weekdays changed since exercises were added) loses its exercises —
  // there's no reliable way to match it to a "new" day otherwise.
  const oldExercisesByName = new Map((currentPlanData.days || []).map(d => [d.name, d.exercises || []]));
  currentPlanData.days = generatePlanDaysFromSchedule(currentPlanData).map(d => ({
    ...d,
    exercises: oldExercisesByName.get(d.name) || [],
  }));
  currentPlanData.scheduleConfirmed = true;
  db.plans[currentPlanId] = currentPlanData;
  await persistPlan(currentPlanId, currentPlanData);
  openPlanDetail(currentPlanId);
});

document.getElementById('plan-schedule-scroll').addEventListener('click', async e => {
  if (!currentPlanData) return;

  const dayBtn = e.target.closest('.ps-num-box');
  if (dayBtn) {
    const days = parseInt(dayBtn.dataset.days);
    if (currentPlanData.daysPerWeek === days) return;
    currentPlanData.daysPerWeek = days;
    currentPlanData.weekdaysA = [];
    currentPlanData.weekdaysB = [];
    renderPlanSchedule();
    await savePlanSchedule();
    return;
  }

  const toggleBtn = e.target.closest('.ps-toggle-option');
  if (toggleBtn) {
    const fixed = toggleBtn.dataset.fixed === '1';
    if (!!currentPlanData.fixedDays === fixed) return;
    currentPlanData.fixedDays = fixed;
    renderPlanSchedule();
    await savePlanSchedule();
    return;
  }

  const circleBtn = e.target.closest('.ps-day-circle');
  if (circleBtn && !circleBtn.disabled) {
    const week = circleBtn.closest('.ps-weekday-row').dataset.week;
    const dayIdx = parseInt(circleBtn.dataset.day);
    const key = week === 'a' ? 'weekdaysA' : 'weekdaysB';
    const arr = currentPlanData[key] || (currentPlanData[key] = []);
    const pos = arr.indexOf(dayIdx);
    if (pos >= 0) arr.splice(pos, 1); else arr.push(dayIdx);
    renderPlanSchedule();
    await savePlanSchedule();
  }
});

document.getElementById('btn-back-plan-schedule').addEventListener('click', () => goBack('screen-workout-plan'));

// ── Plan Day Edit Screen ──────────────────────────────
function openPlanDayEdit(dayIdx) {
  currentEditDayIndex = dayIdx;
  const day = currentPlanData.days[dayIdx];
  document.getElementById('plan-day-edit-title').textContent = day.name;
  renderPlanDayEdit();
  showScreen('screen-plan-day-edit');
}

function renderPlanDayEdit() {
  pdeSel.exit(); // the selection holds this render's item elements
  const list = document.getElementById('pde-list');
  const day = currentPlanData.days[currentEditDayIndex];
  const exercises = day.exercises || [];
  list.innerHTML = '';

  if (exercises.length === 0) {
    list.innerHTML = '<div class="pde-empty">Geen oefeningen. Tik op het potlood-icoon om oefeningen aan deze dag toe te voegen.</div>';
    return;
  }

  exercises.forEach((ex, idx) => {
    const item = document.createElement('div');
    item.className = 'pde-item';
    item.dataset.exIdx = idx;
    item.innerHTML = `
      <div class="pde-item-inner">
        <div class="pde-ex-info">
          <span class="pde-ex-name">${ex.name}</span>
          <span class="pde-ex-meta">${formatExerciseSetsReps(ex)}</span>
        </div>
        <svg class="pde-chevron" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        <div class="pde-drag-handle" aria-label="Drag to reorder">
          <svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
        </div>
      </div>
    `;
    setupPdeItemInteractions(item);
    list.appendChild(item);
  });

  setupPdeDragReorder(list);
}

async function savePlanDayExercises(newExercises) {
  currentPlanData.days[currentEditDayIndex].exercises = newExercises;
  db.plans[currentPlanId] = currentPlanData;
  await persistPlan(currentPlanId, currentPlanData);
}

// -- Plan Day Edit: sets/reps popup (shared #pde-sets-reps-overlay) ------
// Two modes, toggled at the top of the popup: 'uniform' is the plain Sets/Reps
// pair every exercise starts with; 'persets' lets each set have its own reps
// (e.g. a descending pyramid) — see formatExerciseSetsReps for how both are
// displayed afterwards, and pdeSrMode/pdeSrPerSetReps above for the working state.
function openPdeSetsRepsEdit(exIdx) {
  const ex = currentPlanData.days[currentEditDayIndex].exercises[exIdx];
  if (!ex) return;
  pendingPdeSetsRepsIndex = exIdx;
  pendingPdeSrAddName = null;
  openPdeSrPopup(ex, 'Sets & reps aanpassen', 'Opslaan');
}

// Same popup, opened from screen-exercises' Voeg toe (plan-add mode): nothing is
// written to the plan day until Toevoegen — see btn-pde-sr-save.
function openPdeSrAdd(name) {
  pendingPdeSetsRepsIndex = null;
  pendingPdeSrAddName = name;
  openPdeSrPopup({ sets: 3, reps: 10 }, `${name} toevoegen`, 'Toevoegen');
}

function openPdeSrPopup(ex, title, saveLabel) {
  document.getElementById('pde-sr-title').textContent = title;
  document.getElementById('btn-pde-sr-save').textContent = saveLabel;
  if (Array.isArray(ex.repsPerSet) && ex.repsPerSet.length > 0) {
    pdeSrMode = 'persets';
    pdeSrPerSetReps = [...ex.repsPerSet];
    document.getElementById('pde-sr-sets').value = ex.repsPerSet.length;
    document.getElementById('pde-sr-reps').value = ex.repsPerSet[0];
  } else {
    pdeSrMode = 'uniform';
    pdeSrPerSetReps = Array.from({ length: ex.sets || 1 }, () => ex.reps || 1);
    document.getElementById('pde-sr-sets').value = ex.sets;
    document.getElementById('pde-sr-reps').value = ex.reps;
  }
  renderPdeSrMode();
  openOverlay('pde-sets-reps-overlay');
}

function renderPdeSrMode() {
  document.getElementById('pde-sr-mode-uniform').classList.toggle('active', pdeSrMode === 'uniform');
  document.getElementById('pde-sr-mode-persets').classList.toggle('active', pdeSrMode === 'persets');
  document.getElementById('pde-sr-uniform-fields').classList.toggle('hidden', pdeSrMode !== 'uniform');
  document.getElementById('pde-sr-persets-fields').classList.toggle('hidden', pdeSrMode !== 'persets');
  if (pdeSrMode === 'persets') renderPdeSrSetList();
}

function renderPdeSrSetList() {
  const list = document.getElementById('pde-sr-set-list');
  list.innerHTML = '';
  pdeSrPerSetReps.forEach((reps, i) => {
    const row = document.createElement('div');
    row.className = 'pde-sr-set-row';
    row.innerHTML = `
      <span class="pde-sr-set-label">Set ${i + 1}</span>
      <input type="number" class="pde-sr-set-reps-input" inputmode="numeric" min="1" value="${reps}"/>
      <button type="button" class="pde-sr-set-remove" aria-label="Set verwijderen">&times;</button>
    `;
    row.querySelector('.pde-sr-set-reps-input').addEventListener('input', e => {
      pdeSrPerSetReps[i] = parseInt(e.target.value, 10) || 0;
    });
    row.querySelector('.pde-sr-set-remove').addEventListener('click', () => {
      pdeSrPerSetReps.splice(i, 1);
      renderPdeSrSetList();
    });
    list.appendChild(row);
  });
}

document.getElementById('pde-sr-mode-uniform').addEventListener('click', () => {
  if (pdeSrMode === 'uniform') return;
  pdeSrMode = 'uniform';
  renderPdeSrMode();
});
document.getElementById('pde-sr-mode-persets').addEventListener('click', () => {
  if (pdeSrMode === 'persets') return;
  if (pdeSrPerSetReps.length === 0) {
    const sets = parseInt(document.getElementById('pde-sr-sets').value, 10) || 1;
    const reps = parseInt(document.getElementById('pde-sr-reps').value, 10) || 1;
    pdeSrPerSetReps = Array.from({ length: sets }, () => reps);
  }
  pdeSrMode = 'persets';
  renderPdeSrMode();
});
document.getElementById('pde-sr-add-set').addEventListener('click', () => {
  const last = pdeSrPerSetReps[pdeSrPerSetReps.length - 1];
  pdeSrPerSetReps.push(last !== undefined ? last : 1);
  renderPdeSrSetList();
});

// The popup's current values as {sets, reps} or {repsPerSet: [...]}, or null if
// they're not valid (no positive numbers).
function readPdeSrValues() {
  if (pdeSrMode === 'persets') {
    const reps = pdeSrPerSetReps.filter(r => r > 0);
    return reps.length > 0 ? { repsPerSet: reps } : null;
  }
  const sets = parseInt(document.getElementById('pde-sr-sets').value, 10);
  const reps = parseInt(document.getElementById('pde-sr-reps').value, 10);
  return sets > 0 && reps > 0 ? { sets, reps } : null;
}

document.getElementById('btn-pde-sr-cancel').addEventListener('click', () => {
  pendingPdeSetsRepsIndex = null;
  pendingPdeSrAddName = null;
  closeOverlay('pde-sets-reps-overlay');
});
document.getElementById('btn-pde-sr-save').addEventListener('click', async () => {
  if (pendingPdeSrAddName !== null) {
    const values = readPdeSrValues();
    if (!values) { toast('Vul geldige sets en reps in'); return; }
    const name = pendingPdeSrAddName;
    pendingPdeSrAddName = null;
    closeOverlay('pde-sets-reps-overlay');
    await addExerciseToPlanDay(name, values);
    return;
  }
  if (pendingPdeSetsRepsIndex === null) return;
  const day = currentPlanData.days[currentEditDayIndex];
  const ex = day.exercises[pendingPdeSetsRepsIndex];
  if (!ex) { closeOverlay('pde-sets-reps-overlay'); return; }
  const before = JSON.stringify({ sets: ex.sets, reps: ex.reps, repsPerSet: ex.repsPerSet });
  const values = readPdeSrValues();
  if (values && values.repsPerSet) { ex.repsPerSet = values.repsPerSet; delete ex.sets; delete ex.reps; }
  else if (values) { ex.sets = values.sets; ex.reps = values.reps; delete ex.repsPerSet; }
  const changed = JSON.stringify({ sets: ex.sets, reps: ex.reps, repsPerSet: ex.repsPerSet }) !== before;
  pendingPdeSetsRepsIndex = null;
  closeOverlay('pde-sets-reps-overlay');
  if (changed) {
    await persistPlan(currentPlanId, currentPlanData);
    renderPlanDayEdit();
    toast('Sets & reps opgeslagen');
  }
});

// -- Plan Day Edit: delete confirm for the selected exercises (#delete-pde-exercise-overlay) --
// Opened by the selection header's trash; names every selected exercise, like the
// Fitness Tracker's trash. Annuleren keeps the selection; Verwijderen deletes them
// all in one write and leaves selection mode (renderPlanDayEdit).
function openPdeDeleteSelectedConfirm() {
  const exercises = currentPlanData.days[currentEditDayIndex].exercises || [];
  const idxs = [...pdeSel.items].map(item => parseInt(item.dataset.exIdx)).filter(i => exercises[i]).sort((a, b) => a - b);
  if (idxs.length === 0) return;
  pendingPdeDeleteIndices = idxs;
  const names = idxs.map(i => `"${exercises[i].name}"`);
  document.getElementById('delete-pde-exercise-title').textContent = idxs.length === 1 ? 'Oefening verwijderen?' : 'Oefeningen verwijderen?';
  document.getElementById('delete-pde-exercise-msg').textContent = idxs.length === 1
    ? `Weet je zeker dat je ${names[0]} wilt verwijderen uit deze dag?`
    : `Weet je zeker dat je ${idxs.length} oefeningen (${names.join(', ')}) wilt verwijderen uit deze dag?`;
  openOverlay('delete-pde-exercise-overlay');
}
document.getElementById('btn-delete-pde-exercise-cancel').addEventListener('click', () => {
  pendingPdeDeleteIndices = null;
  closeOverlay('delete-pde-exercise-overlay');
});
document.getElementById('btn-delete-pde-exercise-confirm').addEventListener('click', async () => {
  if (!pendingPdeDeleteIndices) return;
  const remove = new Set(pendingPdeDeleteIndices);
  pendingPdeDeleteIndices = null;
  const exercises = (currentPlanData.days[currentEditDayIndex].exercises || []).filter((_, i) => !remove.has(i));
  await savePlanDayExercises(exercises);
  closeOverlay('delete-pde-exercise-overlay');
  renderPlanDayEdit();
  toast(remove.size === 1 ? 'Verwijderd uit plan' : `${remove.size} oefeningen verwijderd uit plan`);
});
document.getElementById('btn-pde-sel-done').addEventListener('click', () => pdeSel.exit());
document.getElementById('btn-pde-sel-delete').addEventListener('click', openPdeDeleteSelectedConfirm);

function setupPdeDragReorder(list) {
  list.addEventListener('touchstart', e => {
    if (pdeSel.active || !e.target.closest('.pde-drag-handle')) return; // no reordering while selecting
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
      toast('Volgorde opgeslagen');
    }
    pdeDragItem = null;
  };

  list.addEventListener('touchend', endDrag, { passive: true });
  list.addEventListener('touchcancel', endDrag, { passive: true });
}

// Long-press (not the drag handle — that's drag-to-reorder) starts selection mode
// with this exercise selected, like the Fitness Tracker's exercise cards. A plain
// tap opens the sets/reps editor, or — in selection mode — (de)selects the row.
function setupPdeItemInteractions(item) {
  const inner = item.querySelector('.pde-item-inner');
  const wasLongPress = attachLongPress(inner, () => pdeSel.enter(item),
    e => !!e.target.closest('.pde-drag-handle') || !!pdeDragItem || pdeSel.active);
  inner.addEventListener('click', e => {
    if (wasLongPress() || e.target.closest('.pde-drag-handle')) return;
    if (pdeSel.active) pdeSel.toggle(item);
    else openPdeSetsRepsEdit(parseInt(item.dataset.exIdx));
  });
}

document.getElementById('btn-back-plan-day-edit').addEventListener('click', () => goBack('screen-plan-detail'));
document.getElementById('btn-pde-add-exercise').addEventListener('click', () => openPlanDayAddExercises(currentEditDayIndex));

// ── Plan Set Active / Overflow ────────────────────────
document.getElementById('btn-plan-set-active').addEventListener('click', async () => {
  if (!currentPlanId) return;
  await setActivePlan(currentPlanId);
  const isActive = db.activePlan && db.activePlan.planId === currentPlanId;
  document.getElementById('plan-active-ribbon').classList.toggle('show', isActive);
  document.getElementById('btn-plan-set-active').classList.toggle('is-active', isActive);
});

// Saves (everything's already persisted per-action, but this re-confirms) and leaves
// the editable state — shared by the header checkmark, the back arrow's first tap
// while editing, and the hardware back button's equivalent (see the popstate handler).
async function exitPlanDetailEditMode() {
  planDetailEditMode = false;
  renderPlanDetail();
  await savePlanSchedule();
}

document.getElementById('btn-plan-detail-done').addEventListener('click', exitPlanDetailEditMode);

document.getElementById('btn-overflow-plan-detail').addEventListener('click', e => {
  if (planDetailEditMode) {
    showOverflowMenu([
      { label: 'Dupliceren', action: () => duplicatePlan(currentPlanId) },
      { label: 'Verwijderen', action: () => {
        if (!currentPlanData) return;
        openDeletePlanConfirm(currentPlanId, currentPlanData.name, () => showScreen('screen-workout-plan'));
      }},
    ], e.currentTarget);
    return;
  }
  showOverflowMenu([
    { label: 'Bewerken', action: () => { planDetailEditMode = true; renderPlanDetail(); } },
    { label: 'Dupliceren', action: () => duplicatePlan(currentPlanId) },
    { label: 'Verwijderen', action: () => {
      if (!currentPlanData) return;
      openDeletePlanConfirm(currentPlanId, currentPlanData.name, () => showScreen('screen-workout-plan'));
    }},
  ], e.currentTarget);
});

// Two-stage back: while editing, the first tap just closes the editable state (same as
// the checkmark) and stays on this screen; only a second tap (now out of edit mode)
// actually navigates away. Hardware back gets the same behavior via the popstate
// handler's screen-plan-detail special case above.
document.getElementById('btn-back-plan-detail').addEventListener('click', () => {
  if (planDetailEditMode) { exitPlanDetailEditMode(); return; }
  goBack('screen-workout-plan');
});

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
  return { name: document.getElementById('new-plan-name').value };
}
const NEW_PLAN_DEFAULT_SNAPSHOT = { name: '' };

function openMakeYourOwn() {
  document.getElementById('new-plan-name').value = '';
  openOverlay('new-plan-overlay');
}

document.getElementById('btn-plan-make-own').addEventListener('click', openMakeYourOwn);
// Presets and Generate with AI are temporarily disabled (single-user app, on hold for now):
// no click handler attached, so a tap is a no-op. Looks unchanged; wire back up when needed.
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
  closeOverlay('new-plan-overlay');
  await createPlan(name, []);
  renderPlanList();
});

// ── Plan Day Add Exercise Flow (screen-plan-day-edit's "+" button) ──────
// Reuses the exercise browser screen (screen-exercises) wholesale, in 'plan-add'
// mode: same categories, same exercise lists, same ⋮ menu and New Exercise form as
// the Fitness Tracker's own "All Exercises" — only each row's own Voeg toe/Toegevoegd
// button differs, and it writes straight into currentPlanData.days[currentEditDayIndex]
// (never into a Fitness Tracker workout). See exerciseScreenMode / renderExerciseItem.
// Always entered from screen-plan-day-edit (currentEditDayIndex is already set by
// openPlanDayEdit) and always returns there — see btn-back-exercises.
function openPlanDayAddExercises(dayIndex) {
  if (!currentPlanData || !currentPlanData.days[dayIndex]) { toast('Kon dag niet laden'); return; }
  currentEditDayIndex = dayIndex;
  exerciseScreenMode = 'plan-add';
  exerciseLoadDayName = currentPlanData.days[dayIndex].name;
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  document.getElementById('exercise-search').value = '';
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

// Whether `name` is already part of the plan day currently being edited via the
// pencil icon — drives the Voeg toe / Toegevoegd button state per row.
function planDayHasExercise(name) {
  const day = currentPlanData && currentPlanData.days[currentEditDayIndex];
  return !!(day && (day.exercises || []).some(e => e.name === name));
}

// `setsReps` is what the "<name> toevoegen" popup produced (see readPdeSrValues):
// either {sets, reps} or {repsPerSet: [...]}.
async function addExerciseToPlanDay(name, setsReps) {
  const day = currentPlanData && currentPlanData.days[currentEditDayIndex];
  if (!day) return;
  if (!day.exercises) day.exercises = [];
  if (day.exercises.some(e => e.name === name)) return;
  day.exercises.push({ name, ...setsReps });
  await persistPlan(currentPlanId, currentPlanData);
  refreshExerciseList();
}

// ── Smart Day Banner ──────────────────────────────────
// Re-checked on every renderHome(), so it follows today's workout however it got
// filled (manual add, Load Schedule Manually/Automatically, the banner itself):
// shown only while TODAY's workout (todayStr(), not the viewed day) is still empty.
function renderSmartBanner() {
  const banner = document.getElementById('smart-day-banner');
  if (!banner) return;
  const pick = getTodaysScheduledDay();
  bannerSuggestedPick = pick;
  if (bannerDismissed || !pick || getWorkout(todayStr()).length > 0) { banner.classList.add('hidden'); return; }
  document.getElementById('smart-banner-msg').textContent = `Based on your plan, today is ${pick.dayName}. Load it?`;
  banner.classList.remove('hidden');
}

document.getElementById('btn-banner-skip').addEventListener('click', () => {
  bannerDismissed = true;
  document.getElementById('smart-day-banner').classList.add('hidden');
});

// Unlike the Plan Builder's pencil icon (openPlanDayAddExercises), this DOES write
// into the Fitness Tracker on purpose — it's the Fitness Tracker itself loading
// today's suggested plan day into today's workout log, in one tap. Always TODAY
// (todayStr()), even when the tracker has been swiped to another day meanwhile —
// it then jumps back to today.
document.getElementById('btn-banner-load').addEventListener('click', async () => {
  document.getElementById('smart-day-banner').classList.add('hidden');
  const pick = bannerSuggestedPick;
  if (!db.activePlan || !pick) return;
  exitHomeSelMode();
  currentDate = todayStr();
  loadPlanDayIntoWorkout(pick.day, currentDate);
  await markScheduledDayLoaded(pick);
  renderHome();
  toast('Workout geladen!');
});

// Add new overlays to backdrop-close listener
['new-plan-overlay', 'presets-overlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOverlay(id);
  });
});

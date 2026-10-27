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
let db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, workoutPlanDays: {}, favoriteExercises: {}, hiddenBuiltins: {}, exerciseInfo: {}, plateInventory: {}, plateOnBar: {}, categories: { names: {}, custom: [], deleted: [] }, scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {} };

// -- Home selection mode state --------------------------
// Fitness Tracker's long-press selection mode (see createSelectionMode).
const homeSel = createSelectionMode({
  screenId: 'screen-fitness-tracker', countId: 'home-sel-count',
  countLabel: n => (n === 1 ? '1 oefening' : `${n} oefeningen`),
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

// The ONE date helper (nl-NL, first letter capitalised) for a YYYY-MM-DD `str`.
// Standard everywhere: "Donderdag 22 oktober 2026". Named variants for the exceptions:
//   'nav'       — tracker day navigation: "Vandaag" / "Gisteren", else the standard
//   'noWeekday' — the gold One rep max card: "22 oktober 2026"
//   'dayMonth'  — start of a date range across months (Inzicht): "26 oktober"
//   'month'     — calendar month headings: "Oktober 2026" (`str` may be any day of the month)
//   'axis'      — the Graph's x-axis: "6 okt"
// A label that shows a date in capitals (.section-label, day nav) does that in CSS.
const NL_DATE_FORMATS = {
  full: new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  noWeekday: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
  dayMonth: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }),
  month: new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }),
  axis: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }),
};
function formatDateStr(str, format = 'full') {
  if (format === 'nav') {
    const today = todayStr();
    if (str === today) return 'Vandaag';
    if (str === addDaysToDateStr(today, -1)) return 'Gisteren';
    format = 'full';
  }
  const s = NL_DATE_FORMATS[format].format(new Date(str + 'T12:00:00')).replace(/\.$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function changeDate(delta) {
  currentDate = addDaysToDateStr(currentDate, delta);
}
function getWorkout(date) { return db.workouts[date] || []; }
function setWorkout(date, exercises) {
  if (exercises.length === 0) {
    delete db.workouts[date];
    if (db.workoutPlanDays) delete db.workoutPlanDays[date]; // persistWorkout() deletes the whole document
  } else db.workouts[date] = exercises;
  persistWorkout(date, exercises);
}
function getCurrentExerciseData() { return getWorkout(currentDate).find(e => e.exerciseId === currentExerciseId) || null; }
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
  toast('Opslaan mislukt \u2014 controleer je verbinding', { type: 'error' });
}
// -- Exercises ------------------------------------------
// Every exercise has a fixed `id`; its name is only the text that's shown. Built-ins carry
// theirs in exercises.js (kebab-case of the original name), self-added ones get
// newExerciseId() when created. Everything that points at an exercise stores this id: plan
// days and logged workouts ({ exerciseId, … }), favorites, hiddenBuiltins, exerciseInfo and
// records. Renaming therefore only changes `name`.
// db.custom_exercises holds self-added exercises AND edited built-ins: an entry with a
// built-in's id overrides that built-in. A deleted entry stays as { …, deleted: true } so a
// plan day that still lists it keeps its name.
function newExerciseId() { return 'ex-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function allExercises() {
  const custom = db.custom_exercises || [];
  const customIds = new Set(custom.map(e => e.id));
  const hidden = db.hiddenBuiltins || {};
  const builtins = EXERCISE_DB.filter(e => !hidden[e.id] && !customIds.has(e.id));
  return [...builtins, ...custom.filter(e => !e.deleted).map(e => ({ ...e, custom: true }))];
}
// Any exercise by id, deleted ones included, or null.
function findExercise(id) {
  return (db.custom_exercises || []).find(e => e.id === id) || EXERCISE_DB.find(e => e.id === id) || null;
}
function exerciseName(id) {
  const ex = findExercise(id);
  return ex ? ex.name : '';
}

// -- Categories -----------------------------------------
// The rules (the seven standard categories, the fixed muscle-group list, the legacy name
// conversion) live in exercises.js; this is the per-user part, stored in meta/categories:
//   names:   { standardId: shown name } for a renamed standard category (id stays the same)
//   custom:  [{ id, name }] user-added categories, shown after the seven in creation order
//   deleted: [standardId] standard categories deleted while empty
// Adding and renaming are always allowed; deleting only while no exercise is in it.
function categoryState() {
  if (!db.categories) db.categories = {};
  const s = db.categories;
  if (!s.names) s.names = {};
  if (!s.custom) s.custom = [];
  if (!s.deleted) s.deleted = [];
  return s;
}
function allCategories() {
  const s = categoryState();
  return [
    ...EXERCISE_CATEGORIES.filter(c => !s.deleted.includes(c.id)).map(c => ({ id: c.id, name: s.names[c.id] || c.name, standard: true })),
    ...s.custom.map(c => ({ id: c.id, name: c.name, standard: false })),
  ];
}
function categoryName(id) {
  const c = allCategories().find(c => c.id === id);
  return c ? c.name : '';
}
function findCategoryByName(name, exceptId) {
  const n = name.trim().toLowerCase();
  return allCategories().find(c => c.id !== exceptId && c.name.toLowerCase() === n) || null;
}
function exercisesInCategory(id) { return allExercises().filter(e => e.category === id); }
// A category can be deleted while a deleted (hidden) exercise is still in it. A deleted custom
// category is therefore remembered in `removed` ([{ id, name }]), so putting such an exercise
// back (restoreExercise) can bring its category back too, with the same id and name.
function removedCategoryName(id) {
  const c = (categoryState().removed || []).find(c => c.id === id);
  return c ? c.name : '';
}
function restoreCategoryOf(ex) {
  if (allCategories().some(c => c.id === ex.category)) return;
  const s = categoryState();
  if (s.deleted.includes(ex.category)) {
    s.deleted = s.deleted.filter(id => id !== ex.category);
  } else {
    const name = removedCategoryName(ex.category);
    const builtin = EXERCISE_DB.find(b => b.id === ex.id);
    // The same name was added again meanwhile: join that one. No name known (deleted before
    // names were remembered): the category of the built-in it overrides, otherwise "Overig".
    const existing = name ? findCategoryByName(name)
      : (builtin && allCategories().find(c => c.id === builtin.category)) || findCategoryByName('Overig');
    if (existing || !name) {
      ex.category = existing ? existing.id : addCategory('Overig').id;
      persistCustomExercises();
      return;
    }
    s.custom.push({ id: ex.category, name });
  }
  s.removed = (s.removed || []).filter(c => c.id !== ex.category);
  persistCategories();
}
async function persistCategories() {
  if (!currentUser) return;
  uDoc('meta/categories').set(categoryState()).catch(persistFailed);
}
// New category by name. A deleted standard category with that (default) name comes back as
// itself, so it keeps its muscle groups; anything else becomes a user-added category.
function addCategory(name) {
  const s = categoryState();
  const std = EXERCISE_CATEGORIES.find(c => s.deleted.includes(c.id) && c.name.toLowerCase() === name.toLowerCase());
  let cat;
  if (std) {
    s.deleted = s.deleted.filter(id => id !== std.id);
    delete s.names[std.id];
    cat = { id: std.id, name: std.name };
  } else {
    cat = { id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
    s.custom.push(cat);
  }
  persistCategories();
  return cat;
}
// Self-added exercises from before this indeling stored a category NAME; convert it to an id
// by meaning (LEGACY_CATEGORY_MAP). Names without a clear meaning are not guessed: they
// become a user-added category with the same name. Returns whether anything changed.
function migrateCustomExerciseCategories() {
  const knownIds = new Set([...EXERCISE_CATEGORIES.map(c => c.id), ...categoryState().custom.map(c => c.id)]);
  let changed = false;
  (db.custom_exercises || []).forEach(ex => {
    if (knownIds.has(ex.category)) return;
    const old = String(ex.category || '').trim();
    const key = old.toLowerCase();
    const builtin = EXERCISE_DB.find(b => b.name === ex.name);
    let id = LEGACY_CATEGORY_MAP[key] || (LEGACY_CATEGORY_FALLBACK[key] && (builtin ? builtin.category : LEGACY_CATEGORY_FALLBACK[key]));
    if (!id) {
      const existing = old && findCategoryByName(old);
      id = existing ? existing.id : addCategory(old || 'Overig').id;
      knownIds.add(id);
      console.warn('[Categories] unclear old category, kept as own category:', old, '←', ex.name);
    } else if (LEGACY_CATEGORY_FALLBACK[key] && !builtin) {
      console.warn('[Categories] unclear old category, placed by best fit:', old, '→', id, '←', ex.name);
    }
    ex.category = id;
    changed = true;
  });
  return changed;
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
  uDoc('meta/favorites').set({ ids: Object.keys(db.favoriteExercises || {}) }).catch(persistFailed);
}
function isFavoriteExercise(id) { return !!(db.favoriteExercises || {})[id]; }
function toggleFavoriteExercise(id) {
  if (!db.favoriteExercises) db.favoriteExercises = {};
  const next = !db.favoriteExercises[id];
  if (next) db.favoriteExercises[id] = true;
  else delete db.favoriteExercises[id];
  persistFavorites();
  return next;
}
async function persistHiddenBuiltins() {
  if (!currentUser) return;
  uDoc('meta/hidden_builtins').set({ ids: Object.keys(db.hiddenBuiltins || {}) }).catch(persistFailed);
}
async function persistExerciseInfo() {
  if (!currentUser) return;
  uDoc('meta/exercise_info').set({ data: db.exerciseInfo || {} }).catch(persistFailed);
}
function getExerciseInfo(id) { return (db.exerciseInfo || {})[id] || null; }
// Muscle groups used to be stored as free names (primaryMuscle / secondaryMuscle, from the old
// MUSCLE_OPTIONS list). They are wiped, not converted: they're chosen again by hand from
// MUSCLE_GROUPS. Drops an entry that held nothing else. Returns whether anything changed.
function stripLegacyMuscleFields() {
  let changed = false;
  Object.keys(db.exerciseInfo || {}).forEach(key => {
    const info = db.exerciseInfo[key];
    if (!('primaryMuscle' in info) && !('secondaryMuscle' in info)) return;
    delete info.primaryMuscle;
    delete info.secondaryMuscle;
    if (Object.keys(info).length === 0) delete db.exerciseInfo[key];
    changed = true;
  });
  return changed;
}
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
    console.log('[Load] firing Promise.all for 16 Firestore reads...');
    const [workoutsSnap, recordsSnap, customSnap, plansSnap, activePlanSnap, favoritesSnap, hiddenBuiltinsSnap, exerciseInfoSnap, plateInventorySnap, plateOnBarSnap, categoriesSnap, migrationsSnap, scheduleVersionsSnap, weekCycleSnap, sleepSnap, bodyWeightSnap] = await Promise.all([
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
      fStore.doc('users/' + userUid + '/meta/categories').get(),
      fStore.doc('users/' + userUid + '/meta/migrations').get(),
      fStore.collection('users/' + userUid + '/schedule_versions').get(),
      fStore.collection('users/' + userUid + '/week_cycle').get(),
      fStore.collection('users/' + userUid + '/sleep').get(),
      fStore.collection('users/' + userUid + '/body_weight').get(),
    ]);
    console.log('[Load] Promise.all resolved, exerciseInfoSnap.exists:', exerciseInfoSnap.exists);
    db.workouts = {};
    db.sessionNotes = {};
    db.workoutPlanDays = {};
    workoutsSnap.forEach(doc => {
      const data = doc.data();
      db.workouts[doc.id] = data.exercises || [];
      if (data.sessionNote) db.sessionNotes[doc.id] = data.sessionNote;
      if (data.planDays && data.planDays.length) db.workoutPlanDays[doc.id] = data.planDays;
    });
    // Inzicht: all keyed by date (the document id)
    const byDate = snap => { const out = {}; snap.forEach(doc => { out[doc.id] = doc.data(); }); return out; };
    db.scheduleVersions = byDate(scheduleVersionsSnap);
    db.weekCycle = byDate(weekCycleSnap);
    db.sleep = byDate(sleepSnap);
    db.bodyWeight = {};
    bodyWeightSnap.forEach(doc => { db.bodyWeight[doc.id] = doc.data().kg; });
    db.records = recordsSnap.exists ? (recordsSnap.data().data || {}) : {};
    db.custom_exercises = customSnap.exists ? (customSnap.data().list || []) : [];
    db.plans = {};
    plansSnap.forEach(doc => { db.plans[doc.id] = { ...doc.data(), id: doc.id }; });
    db.activePlan = activePlanSnap.exists ? activePlanSnap.data() : null;
    db.favoriteExercises = {};
    if (favoritesSnap.exists) {
      // `names`: stored before exercises had an id (converted by migrateExerciseIds), same for hidden_builtins
      (favoritesSnap.data().ids || favoritesSnap.data().names || []).forEach(key => { db.favoriteExercises[key] = true; });
    }
    db.hiddenBuiltins = {};
    if (hiddenBuiltinsSnap.exists) {
      (hiddenBuiltinsSnap.data().ids || hiddenBuiltinsSnap.data().names || []).forEach(key => { db.hiddenBuiltins[key] = true; });
    }
    db.exerciseInfo = exerciseInfoSnap.exists ? (exerciseInfoSnap.data().data || {}) : {};
    if (stripLegacyMuscleFields()) persistExerciseInfo();
    db.plateInventory = plateInventorySnap.exists ? (plateInventorySnap.data().counts || {}) : {};
    db.plateOnBar = plateOnBarSnap.exists ? (plateOnBarSnap.data().counts || {}) : {};
    db.categories = categoriesSnap.exists ? categoriesSnap.data() : {};
    categoryState();
    if (migrateCustomExerciseCategories()) persistCustomExercises();
    const migrations = migrationsSnap.exists ? migrationsSnap.data() : {};
    if (!migrations.exerciseIds) await migrateExerciseIds(userUid);
    if (!migrations.planDays) await migratePlanDays(userUid);
    // The first run stores today's schedule (and Week A/B) as the starting point.
    await syncInsightSchedule();
    console.log('[Load] loadUserData finished OK');
  } catch(e) {
    console.error('[Load] loadUserData FAILED:', e && e.code, e && e.message, e);
  }
}

// Writes [path, data, options?] sets in batches — same 400-per-batch chunking as "Alles
// resetten". A migration puts its meta/migrations flag last, so it's only set once all
// of its data got through.
async function commitMigrationWrites(writes) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = fStore.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach(([path, data, opts]) => batch.set(fStore.doc(path), data, opts || {}));
    await batch.commit();
  }
}

// One-time conversion, per user, of data stored before exercises had a fixed id: everything
// that pointed at an exercise by NAME now points at its id. Runs from loadUserData() while
// meta/migrations has no `exerciseIds`, and sets that flag in the same (last) write batch,
// so it never runs again once it got through. Converts:
//   - custom_exercises: each entry gets an id — a built-in's own id when it has a built-in's
//     name (that's how a built-in edited without renaming used to be stored), otherwise a new one
//   - workouts and plan days: { name, … } → { exerciseId, … }
//   - favorites, hidden_builtins, exercise_info, records: keyed by id instead of name
// A name without a matching exercise is not guessed. In a workout or plan day such an entry is
// dropped (an exercise without an id can't be opened); as a key in favorites/hidden_builtins/
// exercise_info/records it is left as it is (nothing looks it up). Both are logged.
// Returns a report of what was converted.
async function migrateExerciseIds(userUid) {
  const report = { custom: 0, workouts: 0, plans: 0, favorites: 0, hidden: 0, info: 0, records: 0, unmatched: [] };
  (db.custom_exercises || []).forEach(ex => {
    if (ex.id) return;
    const builtin = EXERCISE_DB.find(b => b.name === ex.name);
    ex.id = builtin ? builtin.id : newExerciseId();
    report.custom++;
  });
  // Custom entries last: one with a built-in's name is that (edited) built-in.
  const idByName = new Map([...EXERCISE_DB, ...(db.custom_exercises || [])].map(e => [e.name, e.id]));

  const convertEntries = (entries, where) => {
    let changed = false;
    const out = [];
    entries.forEach(entry => {
      if (entry.exerciseId) { out.push(entry); return; }
      changed = true;
      const { name, ...rest } = entry;
      const id = idByName.get(name);
      if (id) out.push({ exerciseId: id, ...rest });
      else report.unmatched.push(`${where}: ${name}`);
    });
    return changed ? out : null;
  };
  const changedDates = [];
  Object.keys(db.workouts).forEach(date => {
    const out = convertEntries(db.workouts[date], 'workout ' + date);
    if (!out) return;
    if (out.length) db.workouts[date] = out; else delete db.workouts[date];
    changedDates.push(date);
  });
  const changedPlans = [];
  Object.values(db.plans).forEach(plan => {
    let changed = false;
    (plan.days || []).forEach(day => {
      const out = convertEntries(day.exercises || [], `plan "${plan.name}" / ${day.name}`);
      if (out) { day.exercises = out; changed = true; }
    });
    if (changed) changedPlans.push(plan.id);
  });
  // Re-keys a { name: value } map; returns how many keys changed.
  const rekey = (map, where) => {
    let n = 0;
    Object.keys(map).forEach(key => {
      const id = idByName.get(key);
      if (id === key) return;
      if (!id) {
        if (!findExercise(key)) report.unmatched.push(`${where}: ${key}`);
        return;
      }
      map[id] = map[key];
      delete map[key];
      n++;
    });
    return n;
  };
  report.favorites = rekey(db.favoriteExercises, 'favorites');
  report.hidden = rekey(db.hiddenBuiltins, 'hidden_builtins');
  report.info = rekey(db.exerciseInfo, 'exercise_info');
  report.records = rekey(db.records, 'records');
  report.workouts = changedDates.length;
  report.plans = changedPlans.length;

  const prefix = 'users/' + userUid + '/';
  const writes = [
    ...changedDates.map(date => [prefix + 'workouts/' + date, { exercises: db.workouts[date] || [] }, { merge: true }]),
    ...changedPlans.map(id => [prefix + 'plans/' + id, db.plans[id]]),
    ...(report.custom ? [[prefix + 'meta/custom_exercises', { list: db.custom_exercises }]] : []),
    ...(report.favorites ? [[prefix + 'meta/favorites', { ids: Object.keys(db.favoriteExercises) }]] : []),
    ...(report.hidden ? [[prefix + 'meta/hidden_builtins', { ids: Object.keys(db.hiddenBuiltins) }]] : []),
    ...(report.info ? [[prefix + 'meta/exercise_info', { data: db.exerciseInfo }]] : []),
    ...(report.records ? [[prefix + 'meta/records', { data: db.records }]] : []),
    [prefix + 'meta/migrations', { exerciseIds: todayStr() }, { merge: true }],
  ];
  await commitMigrationWrites(writes);
  if (report.unmatched.length) console.warn('[Migration] exercise names without a matching exercise:', report.unmatched);
  console.log('[Migration] exercise ids:', report);
  return report;
}

// One-time step, per user (flag meta/migrations.planDays, set in the last write batch):
// every plan day gets a fixed id (genPlanDayId), and on a fixed-days plan every day gets
// its weekday stored in day.weekday — derived one last time from its name the way it used
// to be (weekdayFromDayName); a day whose name isn't a weekday stays without one.
// Returns { plans, ids, weekdays } — how many plans changed, ids and weekdays added.
async function migratePlanDays(userUid) {
  const report = { plans: 0, ids: 0, weekdays: 0 };
  const changedPlans = [];
  Object.values(db.plans).forEach(plan => {
    let changed = false;
    (plan.days || []).forEach(day => {
      if (!day.id) { day.id = genPlanDayId(); report.ids++; changed = true; }
      if (plan.fixedDays && day.weekday === undefined) {
        const w = weekdayFromDayName(day);
        if (w !== undefined) { day.weekday = w; report.weekdays++; changed = true; }
      }
    });
    if (changed) changedPlans.push(plan.id);
  });
  report.plans = changedPlans.length;
  const prefix = 'users/' + userUid + '/';
  await commitMigrationWrites([
    ...changedPlans.map(id => [prefix + 'plans/' + id, db.plans[id]]),
    [prefix + 'meta/migrations', { planDays: todayStr() }, { merge: true }],
  ]);
  console.log('[Migration] plan days:', report);
  return report;
}

// -- State ----------------------------------------------
let currentDate = todayStr();
let currentExerciseId = null;

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
// + / check that writes straight into the plan day being edited —
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
// Id of the exercise being added via screen-exercises' + per row (plan-add mode)
// while #pde-sets-reps-overlay is open in its "<name> toevoegen" variant; null when
// the popup is instead editing an existing exercise (pendingPdeSetsRepsIndex).
let pendingPdeSrAddId = null;

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
  'screen-insight': () => renderInsight(),
  'screen-insight-day': () => renderInsightDay(),
  'screen-insight-metric': () => renderInsightMetric(),
  'screen-insight-training': () => renderInsightTraining(),
  'screen-insight-muscle': () => renderInsightMuscle(),
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
    toast('Inloggen mislukt');
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
      db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, workoutPlanDays: {}, favoriteExercises: {}, hiddenBuiltins: {}, scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {} };
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
        toast('Inloggen mislukt');
      }
    } else {
      console.error('[Auth] unhandled sign-in error:', err);
      toast('Inloggen mislukt');
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
    { label: 'Uitloggen', action: signOutUser },
    { label: 'Alles resetten', action: openResetOverlay, danger: true },
  ], e.currentTarget);
});
document.getElementById('btn-overflow-training').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Uitloggen', action: signOutUser }], e.currentTarget);
});
document.getElementById('btn-overflow-exercises').addEventListener('click', e => {
  showOverflowMenu([{ label: 'Uitloggen', action: signOutUser }], e.currentTarget);
});

// -- Reset to default ------------------------------------
// Deletes every piece of this user's data from Firestore and returns the
// app to its out-of-the-box state. Paths touched (all scoped under
// users/{uid}/ for the currently signed-in user):
//   - users/{uid}/workouts/*            (every logged workout/date)
//   - users/{uid}/plans/*                (every Workout Plan Builder plan)
//   - users/{uid}/coachingPhilosophies/* (if that collection exists)
//   - users/{uid}/schedule_versions/*, week_cycle/*, sleep/*, body_weight/*  (Inzicht)
//   - users/{uid}/meta/records           (PR records)
//   - users/{uid}/meta/custom_exercises  (self-added exercises)
//   - users/{uid}/meta/activeplan        (active plan pointer)
//   - users/{uid}/meta/categories        (renamed/added/deleted categories)
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
    const collections = ['workouts', 'plans', 'coachingPhilosophies', 'schedule_versions', 'week_cycle', 'sleep', 'body_weight'];
    const snaps = await Promise.all(collections.map(c => fStore.collection(userPrefix + c).get()));

    const refs = [
      ...snaps.flatMap(snap => snap.docs.map(d => d.ref)),
      fStore.doc(userPrefix + 'meta/records'),
      fStore.doc(userPrefix + 'meta/custom_exercises'),
      fStore.doc(userPrefix + 'meta/activeplan'),
      fStore.doc(userPrefix + 'meta/favorites'),
      fStore.doc(userPrefix + 'meta/hidden_builtins'),
      fStore.doc(userPrefix + 'meta/categories'),
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

    db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, workoutPlanDays: {}, favoriteExercises: {}, hiddenBuiltins: {}, scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {} };
    currentPlanId = null;
    currentPlanData = null;
    await syncInsightSchedule(); // starts over: "geen schema" from today

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
// Returns a Set of "date#setIndex" keys for the sets of exercise `exId` that are a
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
function getPRSetKeys(exId) {
  const bestWeight = {}, firstKey = {};
  Object.keys(db.workouts).sort().forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.exerciseId === exId);
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

// Empty state for a list you can add to (Fitness Tracker day, plan day, Trainingsplannen): the big +
// with a label, near the bottom; an optional muted title is centred in the space above it.
function emptyAddStateHtml(btnId, label, title = '') {
  return `
      <div class="home-empty">
        <div class="home-empty-title-wrap">
          ${title ? `<span class="home-empty-title">${title}</span>` : ''}
        </div>
        <button class="home-empty-action" id="${btnId}">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          <span>${label}</span>
        </button>
      </div>`;
}

function renderHome() {
  document.getElementById('day-nav-label').textContent = formatDateStr(currentDate, 'nav');
  const exercises = getWorkout(currentDate);
  const container = document.getElementById('home-content');
  const screenEl = document.getElementById('screen-fitness-tracker');
  // The smart day banner is the first block of the day's content, so it slides along
  // with it on a day change. Replacing the content below detaches it; it's put back
  // (same element, listeners intact) before renderSmartBanner() decides on visibility.
  const banner = document.getElementById('smart-day-banner');

  if (exercises.length === 0) {
    screenEl.classList.remove('has-day-actions');
    container.innerHTML = emptyAddStateHtml('btn-start-new', 'Nieuwe workout', 'Nog geen workout gelogd');
    container.prepend(banner);
    renderSmartBanner();
    document.getElementById('btn-start-new').addEventListener('click', openNewWorkoutScreen);
    return;
  }

  screenEl.classList.add('has-day-actions');
  container.innerHTML = '';
  container.prepend(banner);
  renderSmartBanner();

  exercises.forEach((ex, idx) => {
    const sets = ex.sets || [];
    const firstPRKeys = getPRSetKeys(ex.exerciseId);
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.exIdx = idx;

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.innerHTML = `
      <div class="exercise-card-name">${exerciseName(ex.exerciseId)}</div>
      <div class="exercise-card-drag-handle" aria-label="Sleep om te verplaatsen">
        <svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
      </div>`;
    card.appendChild(header);
    card.appendChild(Object.assign(document.createElement('div'), { className: 'exercise-card-divider' }));

    const setsDiv = document.createElement('div');
    setsDiv.className = 'exercise-card-sets';
    if (sets.length === 0) {
      // Loaded from a plan day: show the plan's sets/reps until the first set is logged.
      setsDiv.innerHTML = `<div class="exercise-card-empty">${ex.target ? 'Plan: ' + formatExerciseSetsReps(ex.target) : 'Geen sets'}</div>`;
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
      if (!homeSel.active) openTraining(ex.exerciseId);
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

// Wissen (full width above Annuleren · Opslaan) only when a note is saved, like Slaap and Gewicht.
function showCommentEdit(text) {
  commentEditBaseline = text;
  document.getElementById('comment-edit-input').value = text;
  const saved = commentPopupCtx && commentPopupCtx.getText();
  document.getElementById('btn-comment-delete').classList.toggle('hidden', !(saved && saved.trim()));
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
  const exName = exerciseName((getWorkout(date)[exIdx] || {}).exerciseId);
  openCommentPopup({
    label: `Notitie bij set ${setIdx + 1} van "${exName}"`,
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
    label: 'Notitie bij deze workout',
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
  const names = [...homeSel.items].map(c => exercises[allCards.indexOf(c)]).filter(Boolean).map(e => `"${exerciseName(e.exerciseId)}"`);
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

    if (JSON.stringify(newExercises.map(e => e.exerciseId)) !== JSON.stringify(exercises.map(e => e.exerciseId))) {
      setWorkout(currentDate, newExercises);
      cards.forEach((card, i) => { card.dataset.exIdx = i; });
      toast('Volgorde opgeslagen');
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
    const ex = workout.find(e => e.exerciseId === currentExerciseId);
    if (ex) {
      const newSets = oldIdxOrder.map(idx => ex.sets[idx]);
      if (selectedSetIndex !== null) selectedSetIndex = oldIdxOrder.indexOf(selectedSetIndex);
      ex.sets = newSets;
      setWorkout(currentDate, workout);
      toast('Volgorde opgeslagen');
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
  return exerciseScreenMode === 'plan-add' ? ('Toevoegen: ' + exerciseLoadDayName) : 'Alle oefeningen';
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
      dayIndex = plan.days.findIndex(d => planDayWeekday(d) === weekday);
    } else if (db.activePlan.lastDate === todayStr() && plan.days[db.activePlan.lastDayIndex]) {
      dayIndex = db.activePlan.lastDayIndex;
    } else {
      const { week, done } = planWeekCycle(plan);
      dayIndex = done.includes(weekday) ? -1
        : plan.days.findIndex(d => d.group === week && planDayWeekday(d) === weekday);
    }
    if (dayIndex < 0) return null;
  }
  const day = plan.days[dayIndex];
  return { plan, dayIndex, day, dayName: day.name || ('Dag ' + (dayIndex + 1)) };
}

// Same test as Plan Detail's planHasWeekB(), for any plan (not just currentPlanData).
function planHasWeekSplit(plan) {
  return !!(plan.hasWeekB || (plan.days || []).some(d => d.group === 'B'));
}

// The weekdays (0 = Maandag) that `week` ('A'/'B') of a split plan trains on.
function planWeekWeekdays(plan, week) {
  return plan.days.filter(d => d.group === week).map(planDayWeekday).filter(w => w !== undefined);
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
    const w = lastDay && lastDay.group === week ? planDayWeekday(lastDay) : undefined;
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
    const w = planDayWeekday(pick.day);
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

// -- Inzicht: schedule versions and Week A/B per date ---------------------
// Inzicht compares every day with the schedule that was active on THAT day, so every
// version of the active schedule is kept, apart from the plans themselves (editing or
// deleting a plan never touches them):
//   users/{uid}/schedule_versions/{YYYY-MM-DD}  — a full copy, valid from that local date
//     (Europe/Amsterdam, todayStr()) on, that day included; one per date, the last change
//     of a day wins. See scheduleSnapshot() for the content; { planId: null } = geen schema.
//   users/{uid}/week_cycle/{YYYY-MM-DD}  — { effectiveFrom, planId, week: 'A' | 'B' }: the
//     active week of a Week A/B plan from that date on. Written only when it differs from
//     the week already in effect on that date; never changed afterwards.
// Nothing is filled in backwards: the first run stores today's state with today's date.

// 'fixed' (vaste dagen), 'weekAB' (vaste dagen met Week A/B) or 'sequential' (doorlopend,
// "Geen vaste dagen": the next day after the last loaded one, whatever the date).
function planScheduleType(plan) {
  if (!plan.fixedDays) return 'sequential';
  return planHasWeekSplit(plan) ? 'weekAB' : 'fixed';
}

// The active schedule as stored in a version:
//   { planId, planName, type, days: [{ id, name, weekday?, week?, exercises: [{ exerciseId, name, sets }] }],
//     restWeekdays? (fixed) | restWeekdaysA?, restWeekdaysB? (weekAB) }
// Days in plan order; weekday (0 = Maandag) on fixed/weekAB plans, week on weekAB plans.
// `sets` is the planned number of sets (the length of repsPerSet when the plan uses that).
// The exercise name is kept for when the exercise is deleted later; muscle groups are not
// stored (Inzicht looks them up by exerciseId). Rest days are the weekdays without a plan
// day (per week for weekAB); a sequential plan has none — it has no weekdays at all.
// No active plan (or it no longer exists): { planId: null }.
function scheduleSnapshot() {
  const plan = db.activePlan && db.plans[db.activePlan.planId];
  if (!plan) return { planId: null };
  const type = planScheduleType(plan);
  const days = (plan.days || []).map(day => ({
    id: day.id,
    name: day.name,
    ...(type !== 'sequential' && planDayWeekday(day) !== undefined && { weekday: planDayWeekday(day) }),
    ...(type === 'weekAB' && day.group && { week: day.group }),
    exercises: (day.exercises || []).map(ex => ({
      exerciseId: ex.exerciseId,
      name: exerciseName(ex.exerciseId),
      sets: Array.isArray(ex.repsPerSet) && ex.repsPerSet.length > 0 ? ex.repsPerSet.length : (ex.sets || 0),
    })),
  }));
  const restWeekdays = week => [0, 1, 2, 3, 4, 5, 6].filter(w => !days.some(d => d.weekday === w && (!week || d.week === week)));
  return {
    planId: plan.id, planName: plan.name, type, days,
    ...(type === 'fixed' && { restWeekdays: restWeekdays() }),
    ...(type === 'weekAB' && { restWeekdaysA: restWeekdays('A'), restWeekdaysB: restWeekdays('B') }),
  };
}

// JSON with sorted keys: Firestore doesn't keep a map's key order.
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// Whether two versions describe the same schedule. Exercise names don't count: renaming an
// exercise isn't a schedule change (the next version just carries the new name).
function sameSchedule(a, b) {
  const strip = v => ({ ...v, effectiveFrom: undefined, days: (v.days || []).map(d => ({ ...d, exercises: d.exercises.map(({ name, ...ex }) => ex) })) });
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

// The latest entry of a { [date]: entry } map dated on or before `date` (sorted string
// dates), or null.
function latestOnOrBefore(map, date, filter = () => true) {
  const key = Object.keys(map || {}).filter(k => k <= date && filter(map[k])).sort().pop();
  return key ? map[key] : null;
}
function scheduleVersionOn(date) { return latestOnOrBefore(db.scheduleVersions, date); }
// The week ('A'/'B') of Week A/B plan `planId` that was active on `date`, or null.
function activeWeekOn(planId, date) {
  const e = latestOnOrBefore(db.weekCycle, date, e => e.planId === planId);
  return e ? e.week : null;
}

// Stores the active schedule as a version from today, unless it equals the latest version.
async function recordScheduleVersion() {
  const snapshot = scheduleSnapshot();
  const latest = latestOnOrBefore(db.scheduleVersions, '9999-12-31');
  if (latest && sameSchedule(latest, snapshot)) return;
  const version = { effectiveFrom: todayStr(), ...snapshot };
  if (!db.scheduleVersions) db.scheduleVersions = {};
  db.scheduleVersions[version.effectiveFrom] = version;
  await uDoc('schedule_versions/' + version.effectiveFrom).set(version);
}

// Week entry from `from` on, unless that week of that plan is already in effect then.
async function putWeekEntry(from, planId, week) {
  const cur = latestOnOrBefore(db.weekCycle, from);
  if (cur && cur.planId === planId && cur.week === week) return;
  const entry = { effectiveFrom: from, planId, week };
  if (!db.weekCycle) db.weekCycle = {};
  db.weekCycle[from] = entry;
  await uDoc('week_cycle/' + from).set(entry);
}

// Records the active Week A/B plan's week, by the same rules the app suggests days by
// (planWeekCycle / getTodaysScheduledDay):
//   - today's week: that of a split day already loaded today (it stays today's suggestion),
//     otherwise the cycle's active week. A switch forced by a new calendar week went in on
//     that week's Monday; any other change goes in today. The first entry for a plan
//     (first run, or the plan just became active/split) is today's.
//   - a week completed today: the other week goes in tomorrow.
async function recordWeekCycle() {
  const a = db.activePlan;
  const plan = a && db.plans[a.planId];
  if (!currentUser || !plan || planScheduleType(plan) !== 'weekAB') return;
  const today = todayStr();
  const { week, since } = planWeekCycle(plan);
  const loadedToday = a.lastDate === today ? plan.days[a.lastDayIndex] : null;
  const weekToday = loadedToday && loadedToday.group ? loadedToday.group : week;
  const prev = latestOnOrBefore(db.weekCycle, today);
  const from = prev && prev.planId === plan.id && since && since <= today && since > prev.effectiveFrom ? since : today;
  await putWeekEntry(from, plan.id, weekToday);
  if (week !== weekToday) await putWeekEntry(addDaysToDateStr(today, 1), plan.id, week);
}

// After any change that may touch the active schedule, and at start-up.
function syncInsightSchedule() {
  if (!currentUser) return Promise.resolve();
  return recordScheduleVersion().then(recordWeekCycle).catch(persistFailed);
}

// A switch is another plan id; any change within the same plan (its name too) is not.
// "Geen schema" (planId null) counts as a plan of its own.
function isScheduleSwitch(prevVersion, version) { return !!prevVersion && prevVersion.planId !== version.planId; }

// THE one answer to "what was planned on `date`?" — for Inzicht:
//   { status: 'no-version' }                       no version on or before that date
//   { status: 'no-schedule', version }             no active plan then
//   { status: 'day', version, day, week? }         fixed / weekAB: the plan day for that weekday
//                                                  (weekAB: in the week active on that date)
//   { status: 'rest', version, week? }             fixed / weekAB: no plan day = rest day
//   { status: 'no-week', version }                 weekAB, but no week recorded for that date
//   { status: 'sequential', version }              doorlopend: the version itself (days in
//                                                  order, effectiveFrom); the per-day
//                                                  calculation follows in a later step
function getPlannedForDate(date) {
  const version = scheduleVersionOn(date);
  if (!version) return { status: 'no-version' };
  if (!version.planId) return { status: 'no-schedule', version };
  if (version.type === 'sequential') return { status: 'sequential', version };
  const weekday = weekdayOfDateStr(date);
  let week = null;
  if (version.type === 'weekAB') {
    week = activeWeekOn(version.planId, date);
    if (!week) return { status: 'no-week', version };
  }
  const day = version.days.find(d => d.weekday === weekday && (!week || d.week === week));
  return { status: day ? 'day' : 'rest', version, ...(day && { day }), ...(week && { week }) };
}

// -- Inzicht: sleep and body weight ----------------------------------------
// Entered in Inzicht later; one document per date, like workouts:
//   users/{uid}/sleep/{YYYY-MM-DD}        { bedtime: 'HH:MM', wakeTime: 'HH:MM' }
//   users/{uid}/body_weight/{YYYY-MM-DD}  { kg }  (max. 2 decimals, like every weight)
// A night belongs to the day you wake up on: Wednesday → Thursday is Thursday's.
// Saving a date again overwrites it (that's how a day is changed).
const SLEEP_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function timeToMinutes(t) { return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10); }
function minutesToTime(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
// Minutes from bedtime to wake time, across midnight when the wake time is earlier.
function sleepDurationMinutes(bedtime, wakeTime) {
  return (timeToMinutes(wakeTime) - timeToMinutes(bedtime) + 1440) % 1440;
}
function getSleep(date) { return (db.sleep || {})[date] || null; }
// false (nothing stored) unless both times are a valid HH:MM.
function saveSleep(date, bedtime, wakeTime) {
  if (!SLEEP_TIME_RE.test(bedtime) || !SLEEP_TIME_RE.test(wakeTime)) return false;
  if (!db.sleep) db.sleep = {};
  db.sleep[date] = { bedtime, wakeTime };
  if (currentUser) uDoc('sleep/' + date).set(db.sleep[date]).catch(persistFailed);
  return true;
}
function deleteSleep(date) {
  if (db.sleep) delete db.sleep[date];
  if (currentUser) uDoc('sleep/' + date).delete().catch(persistFailed);
}
// [{ date, bedtime, wakeTime, minutes }] for from..to (both included), by date.
function getSleepRange(from, to) {
  return Object.keys(db.sleep || {}).filter(d => d >= from && d <= to).sort()
    .map(date => ({ date, ...db.sleep[date], minutes: sleepDurationMinutes(db.sleep[date].bedtime, db.sleep[date].wakeTime) }));
}

function getBodyWeight(date) { return (db.bodyWeight || {})[date] ?? null; }
// `value`: a number or typed text (comma or point), rounded to 2 decimals like every
// weight (parseWeight). false (nothing stored) unless it's more than 0 kg.
function saveBodyWeight(date, value) {
  const kg = parseWeight(value);
  if (!(kg > 0)) return false;
  if (!db.bodyWeight) db.bodyWeight = {};
  db.bodyWeight[date] = kg;
  if (currentUser) uDoc('body_weight/' + date).set({ kg }).catch(persistFailed);
  return true;
}
function deleteBodyWeight(date) {
  if (db.bodyWeight) delete db.bodyWeight[date];
  if (currentUser) uDoc('body_weight/' + date).delete().catch(persistFailed);
}
// [{ date, kg }] for from..to (both included), by date.
function getBodyWeightRange(from, to) {
  return Object.keys(db.bodyWeight || {}).filter(d => d >= from && d <= to).sort().map(date => ({ date, kg: db.bodyWeight[date] }));
}

// -- Inzicht: the screen (#screen-insight, period Week) ---------------------
// One week (Monday..Sunday) at a time; opens on the current week, can't go past it.
// Every day is judged against the schedule of THAT day (getPlannedForDate). Rules: see
// PROJECT_CONTEXT.md, "Inzicht"; the Per dag grid: DESIGN_SYSTEM.md, "Inzicht".
let insightWeekStart = null;

function weekStartOf(date) { return addDaysToDateStr(date, -weekdayOfDateStr(date)); }
// ISO 8601 week number: the week belongs to the year its Thursday is in.
function isoWeekOfDateStr(date) {
  const thursday = addDaysToDateStr(weekStartOf(date), 3);
  const jan1 = thursday.slice(0, 4) + '-01-01';
  const dayOfYear = Math.round((Date.parse(thursday + 'T00:00:00Z') - Date.parse(jan1 + 'T00:00:00Z')) / 86400000);
  return Math.floor(dayOfYear / 7) + 1;
}
// "19–25 oktober 2026", "26 oktober – 1 november 2026", "29 december 2025 – 4 januari 2026".
function formatDateRange(from, to) {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDateStr(from, 'noWeekday')} – ${formatDateStr(to, 'noWeekday')}`;
  if (from.slice(0, 7) !== to.slice(0, 7)) return `${formatDateStr(from, 'dayMonth')} – ${formatDateStr(to, 'noWeekday')}`;
  return `${Number(from.slice(8))}–${formatDateStr(to, 'noWeekday')}`;
}
// Whole numbers with a point between thousands ("1.250"); only for counts in Inzicht —
// formatNumber() stays without a thousands separator.
function formatCount(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// Minutes as "7:10".
function formatDuration(minutes) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
// "−0,3" / "+0,2" / "0" (a real minus sign).
function formatSignedNumber(n) { return n < 0 ? '−' + formatNumber(-n) : (n > 0 ? '+' : '') + formatNumber(n); }
const SLEEP_SHORT_MINUTES = 7 * 60;
const INSIGHT_WEEKDAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function hasLoggedSets(date) { return getWorkout(date).some(ex => (ex.sets || []).length > 0); }

// One day: { date, planned (getPlannedForDate), logged, past, counted }.
function insightDay(date) {
  const today = todayStr();
  return { date, planned: getPlannedForDate(date), logged: hasLoggedSets(date), past: date < today, counted: date <= today };
}
// Per day of the week: insightDay() plus switchHere: another plan id than the day before
// (isScheduleSwitch), not on Monday.
function insightWeekDays(weekStart) {
  return [0, 1, 2, 3, 4, 5, 6].map(i => insightDay(addDaysToDateStr(weekStart, i))).map((d, i, days) => ({
    ...d, switchHere: !!d.planned.version && isScheduleSwitch(i > 0 ? days[i - 1].planned.version : null, d.planned.version),
  }));
}

// "done" (≥ 1 set logged), "missed" (a planned day of a fixed or Week A/B schedule that is
// over without a set) or "empty" (rest day, no schedule, sequential, today, still to come).
function insightTrainingState(d) {
  if (d.logged) return 'done';
  if (d.past && d.planned.status === 'day') return 'missed';
  return 'empty';
}

// The schedule line: "Schema: Push Pull Legs · Week A", a plan-id switch as
// ", vanaf donderdag Upper Lower", "Geen schema actief" or "Geen schema bekend".
function insightScheduleText(days) {
  const known = days.filter(d => d.planned.version);
  if (known.length === 0) return 'Geen schema bekend';
  if (known.every(d => !d.planned.version.planId)) return 'Geen schema actief';
  // Segments of one plan id, each with its weeks (Week A/B) in order.
  const segments = [];
  known.forEach(d => {
    const v = d.planned.version;
    let seg = segments[segments.length - 1];
    if (!seg || seg.planId !== v.planId) {
      seg = { planId: v.planId, name: v.planId ? v.planName : 'geen schema', weekday: weekdayOfDateStr(d.date), weeks: [] };
      segments.push(seg);
    }
    const w = d.planned.week;
    if (w && (!seg.weeks.length || seg.weeks[seg.weeks.length - 1].week !== w)) seg.weeks.push({ week: w, weekday: weekdayOfDateStr(d.date) });
  });
  const segText = seg => seg.name + seg.weeks.map((w, i) => i === 0 ? ` · Week ${w.week}` : `, vanaf ${WEEKDAY_FULL_NAMES[w.weekday].toLowerCase()} Week ${w.week}`).join('');
  return 'Schema: ' + segments.map((seg, i) => i === 0 ? segText(seg) : `vanaf ${WEEKDAY_FULL_NAMES[seg.weekday].toLowerCase()} ${segText(seg)}`).join(', ');
}

// What planned and done sets are compared by: the exercise's primary muscle group as it is
// set now ('mg:chest'), or the exercise id itself when it has none ('ex:<id>').
function insightCompareKey(id) {
  const info = getExerciseInfo(id);
  return info && info.primaryMuscleGroup ? 'mg:' + info.primaryMuscleGroup : 'ex:' + id;
}

// Training card numbers for a week: planned vs done sets per primary muscle group, over
// the days that count (the current week: up to and including today).
//   planned: the sets of the plan days planned on those days (their schedule version);
//            today's plan day only counts once a set is logged today (no shortfall in the
//            morning) — from tomorrow on it counts like any past day
//   done:    the logged sets; a dropset continuation counts with the set before it
//   per group: min(planned, done) is "uit je schema", the rest of done is extra
//   no primary muscle group: compared per exercise id instead
//   trainings: plannedTrainings = planned days (as above), doneTrainings = those of them with
//            ≥ 1 logged set; a training on a day without a planned training isn't one of them
//            (its sets are extra). loggedDays = all days with ≥ 1 logged set (no comparison).
// compare: false when no counted day had a fixed or Week A/B schedule (no schedule, or a
// sequential one — that comparison follows later).
// Also per comparison key (planned, done) and per exercise id: plannedEx { sets, name } (as
// planned above) and doneEx (insightSetFeatures of all its logged sets, summed) — the
// training overview and the muscle-group screens are built from these. Today's plan day before
// today's first set doesn't count, but is kept apart: plannedToday (per key) and todayEx.
function insightTrainingStats(days) {
  const counted = days.filter(d => d.counted);
  const keyOf = insightCompareKey;
  const planned = {}, done = {}, plannedEx = {}, doneEx = {}, plannedToday = {}, todayEx = {};
  const today = todayStr();
  let plannedTrainings = 0, doneTrainings = 0, loggedDays = 0;
  counted.forEach(d => {
    if (d.planned.status === 'day' && (d.date !== today || d.logged)) {
      plannedTrainings++;
      if (d.logged) doneTrainings++;
      d.planned.day.exercises.forEach(ex => {
        const k = keyOf(ex.exerciseId); planned[k] = (planned[k] || 0) + (ex.sets || 0);
        if (!(ex.sets > 0)) return;
        const p = plannedEx[ex.exerciseId] || (plannedEx[ex.exerciseId] = { sets: 0, name: ex.name });
        p.sets += ex.sets;
      });
    } else if (d.planned.status === 'day') { // today, no set yet
      d.planned.day.exercises.filter(ex => ex.sets > 0).forEach(ex => {
        const k = keyOf(ex.exerciseId); plannedToday[k] = (plannedToday[k] || 0) + ex.sets;
        const p = todayEx[ex.exerciseId] || (todayEx[ex.exerciseId] = { sets: 0, name: ex.name });
        p.sets += ex.sets;
      });
    }
    if (d.logged) loggedDays++;
    getWorkout(d.date).forEach(ex => {
      const n = countWorkingSets(ex.sets || []);
      if (n === 0) return;
      const k = keyOf(ex.exerciseId); done[k] = (done[k] || 0) + n;
      doneEx[ex.exerciseId] = insightAddFeatures(doneEx[ex.exerciseId], insightSetFeatures(ex.sets));
    });
  });
  const keys = new Set([...Object.keys(planned), ...Object.keys(done)]);
  let fromSchedule = 0, extra = 0, plannedSets = 0, doneSets = 0;
  keys.forEach(k => {
    const p = planned[k] || 0, n = done[k] || 0;
    plannedSets += p; doneSets += n;
    fromSchedule += Math.min(p, n);
    extra += Math.max(0, n - p);
  });
  const compare = counted.some(d => ['day', 'rest', 'no-week'].includes(d.planned.status));
  return { compare, plannedSets, doneSets, fromSchedule, shortfall: plannedSets - fromSchedule, extra, plannedTrainings, doneTrainings, loggedDays,
    planned, done, plannedEx, doneEx, plannedToday, todayEx };
}

function insightAverage(values) { return values.reduce((a, b) => a + b, 0) / values.length; }

const INSIGHT_CHEVRON_SVG = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
// A figure card of the week. With `metric` ('training' / 'sleep' / 'weight') the whole card is a
// button that opens that detail screen, with a chevron on the right.
function insightCardHtml(label, bodyHtml, metric) {
  const inner = `<div class="section-label insight-card-label">${label}</div>${bodyHtml}`;
  if (!metric) return `<div class="card insight-card">${inner}</div>`;
  return `<button type="button" class="card insight-card insight-edit-card" data-insight-metric="${metric}">`
    + `<div class="insight-edit-main">${inner}</div><span class="insight-edit-icon insight-chevron">${INSIGHT_CHEVRON_SVG}</span></button>`;
}
function insightFigureHtml(value, unit) {
  return `<div class="insight-figure"><span class="set-val">${value}</span><span class="set-unit">${unit}</span></div>`;
}
function insightEmptyHtml(text) { return `<div class="role-row insight-empty">${text}</div>`; }

// The texts of the week's comparison, shared by the Training card and the training overview:
//   none       "3 trainingen · geen vergelijking met schema" (no comparison; only this one)
//   ofPlanned  "van 82 sets uit je schema" (after the number fromSchedule)
//   diff       "−24 · +6 extra" / "op schema · +6 extra" (insightCompareText)
//   trainings  "4 van 5 trainingen"
function insightTrainingTexts(stats) {
  const trainings = n => n === 1 ? 'training' : 'trainingen';
  if (!stats.compare) return { none: `${formatCount(stats.loggedDays)} ${trainings(stats.loggedDays)} · geen vergelijking met schema` };
  return { ofPlanned: `van ${formatCount(stats.plannedSets)} sets uit je schema`, diff: insightCompareText(stats.shortfall, stats.extra),
    trainings: `${formatCount(stats.doneTrainings)} van ${formatCount(stats.plannedTrainings)} ${trainings(stats.plannedTrainings)}` };
}
function insightTrainingCardHtml(stats) {
  const t = insightTrainingTexts(stats);
  if (t.none) return insightFigureHtml(formatCount(stats.doneSets), stats.doneSets === 1 ? 'set' : 'sets') + `<div class="role-sub">${t.none}</div>`;
  return insightFigureHtml(formatCount(stats.fromSchedule), t.ofPlanned) + `<div class="role-sub">${t.trainings} · ${t.diff}</div>`;
}

// A bedtime on a scale that runs on past midnight: 00:00–11:59 counts as after midnight
// (+24 h), so 23:50 and 00:30 average to 00:10, not 12:10.
function bedtimeAfterNoonMinutes(t) { const m = timeToMinutes(t); return m < 720 ? m + 1440 : m; }
// The week's nights: null without any, else { nights, avg (minutes), bedtime, wakeTime, shortest,
// longest }. Average bedtime on the scale above; the average wake time is that bedtime plus the
// average duration, so the three numbers always add up. Equal nights: the first one.
function insightSleepWeek(weekStart) {
  const nights = getSleepRange(weekStart, addDaysToDateStr(weekStart, 6));
  if (nights.length === 0) return null;
  const avg = Math.round(insightAverage(nights.map(n => n.minutes)));
  const bed = Math.round(insightAverage(nights.map(n => bedtimeAfterNoonMinutes(n.bedtime))));
  return {
    nights, avg, bedtime: minutesToTime(bed % 1440), wakeTime: minutesToTime((bed + avg) % 1440),
    shortest: nights.reduce((a, b) => b.minutes < a.minutes ? b : a),
    longest: nights.reduce((a, b) => b.minutes > a.minutes ? b : a),
  };
}
const insightNightOf = n => `${weekdayLower(n.date)}, ${formatDuration(n.minutes)} u`;

function insightSleepCardHtml(weekStart) {
  const s = insightSleepWeek(weekStart);
  if (!s) return insightEmptyHtml('Nog geen slaap ingevuld');
  return insightFigureHtml(formatDuration(s.avg), 'u gemiddeld')
    + `<div class="role-sub">Kortste nacht: ${insightNightOf(s.shortest)}</div>`;
}

// The week's weights: null without any, else { days, avg (1 decimal), min, max }.
function insightWeightWeek(weekStart) {
  const days = getBodyWeightRange(weekStart, addDaysToDateStr(weekStart, 6));
  if (days.length === 0) return null;
  const kgs = days.map(e => e.kg);
  return { days, avg: round1(insightAverage(kgs)), min: Math.min(...kgs), max: Math.max(...kgs) };
}
// "−0,3 kg t.o.v. week 42": the rounded averages of this and the previous week, neutral;
// '' when the previous week has no weight.
function insightWeightWeekCompareText(weekStart, avg) {
  const prevStart = addDaysToDateStr(weekStart, -7);
  const prev = insightWeightWeek(prevStart);
  return prev ? `${formatSignedNumber(round1(avg - prev.avg))} kg t.o.v. week ${isoWeekOfDateStr(prevStart)}` : '';
}

function insightWeightCardHtml(weekStart) {
  const w = insightWeightWeek(weekStart);
  if (!w) return insightEmptyHtml('Nog geen gewicht ingevuld');
  const cmp = insightWeightWeekCompareText(weekStart, w.avg);
  return insightFigureHtml(formatNumber(w.avg), 'kg gemiddeld') + (cmp ? `<div class="role-sub">${cmp}</div>` : '');
}

const INSIGHT_CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

function insightDaysGridHtml(days) {
  // The first day of another plan gets a dotted line on the left of every cell in its
  // column; the rows have no gap between them, so the line runs over the full grid height.
  // Every cell of a day up to today carries its date: the whole column opens the day
  // overview (the rows have no gap, so the column is one unbroken tap area).
  const sw = d => d.switchHere ? ' insight-switch' : '';
  const tap = d => d.counted ? ` data-date="${d.date}"` : '';
  const cell = (d, content, cls = '') => `<div class="t-small insight-cell${cls}${sw(d)}"${tap(d)}>${content}</div>`;
  const dash = d => cell(d, '–', ' insight-dash');
  const row = (label, cells) => `<div class="t-small insight-row-label">${label}</div>` + cells.join('');
  let html = '<div class="insight-grid"><div></div>';
  html += days.map((d, i) => d.counted
    ? `<div class="t-small insight-cell${sw(d)}"${tap(d)} role="button" tabindex="0" aria-label="Dagoverzicht ${formatDateStr(d.date)}">${INSIGHT_WEEKDAYS_SHORT[i]}</div>`
    : `<div class="t-small insight-cell${sw(d)}">${INSIGHT_WEEKDAYS_SHORT[i]}</div>`).join('');
  html += row('Training', days.map(d => {
    const state = insightTrainingState(d);
    if (state === 'done') return cell(d, `<span class="insight-done" role="img" aria-label="Getraind">${INSIGHT_CHECK_SVG}</span>`);
    if (state === 'missed') return cell(d, '<span class="insight-missed" role="img" aria-label="Gemist"></span>');
    return dash(d);
  }));
  html += row('Voeding', days.map(dash));
  html += row('Slaap', days.map(d => {
    const s = getSleep(d.date);
    if (!s) return dash(d);
    const min = sleepDurationMinutes(s.bedtime, s.wakeTime);
    return cell(d, formatDuration(min), min < SLEEP_SHORT_MINUTES ? ' insight-danger' : '');
  }));
  html += row('Gewicht', days.map(d => {
    const kg = getBodyWeight(d.date);
    return kg === null ? dash(d) : cell(d, formatNumber(kg));
  }));
  return html + '</div>';
}

// The top of every week screen (the week, the Slaap / Gewicht detail screens, the training overview
// and the muscle-group screen), one component:
// Week · Maand · Jaar (Maand and Jaar disabled for now), ‹ Week 43 › (right disabled on the
// current week) and the date line. The arrows step insightWeekStart (see the listener below).
function insightWeekHeadHtml(weekStart) {
  const atCurrent = weekStart >= weekStartOf(todayStr());
  return '<div class="insight-periods">'
    + '<button type="button" class="time-filter active" aria-pressed="true">Week</button>'
    + '<button type="button" class="time-filter" disabled>Maand</button>'
    + '<button type="button" class="time-filter" disabled>Jaar</button></div>'
    + '<div class="insight-nav">'
    + `<button type="button" class="insight-nav-btn" data-insight-step="-1" aria-label="Vorige week">${INSIGHT_CHEVRON_LEFT_SVG}</button>`
    + `<span class="t-heading insight-nav-title">Week ${isoWeekOfDateStr(weekStart)}</span>`
    + `<button type="button" class="insight-nav-btn" data-insight-step="1" aria-label="Volgende week"${atCurrent ? ' disabled' : ''}>${INSIGHT_CHEVRON_SVG}</button></div>`
    + `<div class="t-small insight-meta">${formatDateRange(weekStart, addDaysToDateStr(weekStart, 6))}</div>`;
}
const INSIGHT_CHEVRON_LEFT_SVG = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

function renderInsight() {
  if (!insightWeekStart) insightWeekStart = weekStartOf(todayStr());
  const weekStart = insightWeekStart;
  const days = insightWeekDays(weekStart);
  document.getElementById('insight-head').innerHTML = insightWeekHeadHtml(weekStart);
  document.getElementById('insight-schema').textContent = insightScheduleText(days);
  document.getElementById('insight-days').innerHTML = insightDaysGridHtml(days);
  document.getElementById('insight-cards').innerHTML =
    insightCardHtml('Training', insightTrainingCardHtml(insightTrainingStats(days)), 'training')
    + insightCardHtml('Voeding', insightEmptyHtml('Nog geen voedingsschema'))
    + insightCardHtml('Slaap', insightSleepCardHtml(weekStart), 'sleep')
    + insightCardHtml('Gewicht', insightWeightCardHtml(weekStart), 'weight');
}

function openInsight() {
  insightWeekStart = weekStartOf(todayStr());
  showScreen('screen-insight');
}
// ‹ › on a week screen: step a week (not past the current one) and redraw that screen.
['screen-insight', 'screen-insight-metric', 'screen-insight-training', 'screen-insight-muscle'].forEach(id => document.getElementById(id).addEventListener('click', e => {
  const b = e.target.closest('[data-insight-step]');
  if (!b || b.disabled) return;
  const next = addDaysToDateStr(insightWeekStart, 7 * Number(b.dataset.insightStep));
  if (next > weekStartOf(todayStr())) return;
  insightWeekStart = next;
  SCREEN_ON_ENTER[id]();
}));
document.getElementById('insight-cards').addEventListener('click', e => {
  const c = e.target.closest('[data-insight-metric]');
  if (!c) return;
  if (c.dataset.insightMetric === 'training') openInsightTraining();
  else openInsightMetric(c.dataset.insightMetric);
});
// A tap anywhere in a day's column (Per dag) opens that day; the whole column shows pressed.
(function setupInsightDayColumns() {
  const grid = document.getElementById('insight-days');
  const release = () => grid.querySelectorAll('.insight-col-pressed').forEach(c => c.classList.remove('insight-col-pressed'));
  grid.addEventListener('pointerdown', e => {
    const c = e.target.closest('[data-date]');
    if (c) grid.querySelectorAll(`[data-date="${c.dataset.date}"]`).forEach(x => x.classList.add('insight-col-pressed'));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => grid.addEventListener(t, release));
  grid.addEventListener('click', e => {
    const c = e.target.closest('[data-date]');
    if (c) openInsightDay(c.dataset.date);
  });
  grid.addEventListener('keydown', e => {
    const c = e.target.closest('[data-date]');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openInsightDay(c.dataset.date); }
  });
})();

// -- Inzicht: the day overview (#screen-insight-day) ------------------------
// One day, opened from the Per dag grid; up to today. The same rules as the week's Training
// card (insightTrainingStats, insightCompareKey) applied to that one day, plus entering and
// clearing that day's sleep and body weight. The back arrow lands on the week of the day
// shown (insightWeekStart follows the day). Rules: PROJECT_CONTEXT.md, "Inzicht".
let insightDayDate = null;

function openInsightDay(date) {
  if (date > todayStr()) return;
  insightDayDate = date;
  showScreen('screen-insight-day');
}

const INSIGHT_PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
function weekdayLower(date) { return WEEKDAY_FULL_NAMES[weekdayOfDateStr(date)].toLowerCase(); }
const insightPlural = (n, one, more) => `${formatCount(n)} ${n === 1 ? one : more}`;

// The day's training as compared with its schedule:
//   mode 'compare'  fixed / Week A/B day or rest day: planned (plan day) vs done
//        'pending'  today with a plan day but no set logged yet: only what is planned
//        'none'     no schedule, no version, no recorded week, or sequential: no comparison
//   rows: one per primary muscle group planned or trained (MUSCLE_GROUPS order), then one
//         "Geen spiergroep" row (id '') for exercises without one, compared per exercise.
//         { id, planned, done, counted (min per comparison key), extra, exercises: logged
//         [{ exerciseId, sets }], missed: planned exercises without a logged set }
// The muscle-group row an exercise belongs to: its primary muscle group as set now, or ''
// ("Geen spiergroep") without a (known) one. Day overview and training overview alike.
function insightMuscleRowId(id) {
  const info = getExerciseInfo(id);
  const mg = info && info.primaryMuscleGroup;
  return mg && MUSCLE_GROUPS.some(m => m.id === mg) ? mg : '';
}
function insightDayTraining(d) {
  const st = d.planned.status;
  const mode = st === 'day' || st === 'rest' ? (st === 'day' && d.date === todayStr() && !d.logged ? 'pending' : 'compare') : 'none';
  const rows = new Map();
  const rowFor = id => {
    const rid = insightMuscleRowId(id);
    if (!rows.has(rid)) rows.set(rid, { id: rid, plannedBy: {}, doneBy: {}, exercises: [], plannedEx: [] });
    return rows.get(rid);
  };
  if (st === 'day') d.planned.day.exercises.filter(ex => ex.sets > 0).forEach(ex => {
    const r = rowFor(ex.exerciseId), k = insightCompareKey(ex.exerciseId);
    r.plannedBy[k] = (r.plannedBy[k] || 0) + ex.sets;
    r.plannedEx.push(ex);
  });
  getWorkout(d.date).forEach(ex => {
    const n = countWorkingSets(ex.sets || []);
    if (n === 0) return;
    const r = rowFor(ex.exerciseId), k = insightCompareKey(ex.exerciseId);
    r.doneBy[k] = (r.doneBy[k] || 0) + n;
    r.exercises.push({ exerciseId: ex.exerciseId, sets: ex.sets });
  });
  const order = [...MUSCLE_GROUPS.map(m => m.id), ''];
  const list = [...rows.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(r => {
    const keys = new Set([...Object.keys(r.plannedBy), ...Object.keys(r.doneBy)]);
    let planned = 0, done = 0, counted = 0, extra = 0;
    keys.forEach(k => {
      const p = r.plannedBy[k] || 0, n = r.doneBy[k] || 0;
      planned += p; done += n; counted += Math.min(p, n); extra += Math.max(0, n - p);
    });
    const logged = new Set(r.exercises.map(e => e.exerciseId));
    return { id: r.id, planned, done, counted, extra, exercises: r.exercises, missed: r.plannedEx.filter(ex => !logged.has(ex.exerciseId)) };
  });
  const sum = f => list.reduce((a, r) => a + f(r), 0);
  return { mode, rows: list, planned: sum(r => r.planned), done: sum(r => r.done), counted: sum(r => r.counted), extra: sum(r => r.extra) };
}

// The counts of one exercise's logged sets, per set with its drops included: a set with drops
// is one set and one dropset; failure = RPE 10 on the set or one of its drops; partial /
// forced follow extraType on the set or one of its drops. { sets, failure, partial, forced, drops }
function insightSetFeatures(sets) {
  const groups = workingSetGroups(sets).map(g => g.idxs.map(i => sets[i]));
  const count = f => groups.filter(g => g.some(f)).length;
  const hasExtra = s => (parseInt(s.extra) || 0) > 0;
  return {
    sets: countWorkingSets(sets),
    failure: count(s => parseFloat(s.rpe) === 10),
    partial: count(s => hasExtra(s) && s.extraType !== 'forced'),
    forced: count(s => hasExtra(s) && s.extraType === 'forced'),
    drops: groups.filter(g => g.length > 1).length,
  };
}
const INSIGHT_FEATURES_EMPTY = { sets: 0, failure: 0, partial: 0, forced: 0, drops: 0 };
function insightAddFeatures(a, b) {
  a = a || INSIGHT_FEATURES_EMPTY;
  return { sets: a.sets + b.sets, failure: a.failure + b.failure, partial: a.partial + b.partial, forced: a.forced + b.forced, drops: a.drops + b.drops };
}
// "2 failure · 1 partial · 1 forced · 1 dropset"; a 0 is left out ('' when all are 0).
function insightFeaturesText(f) {
  const parts = [];
  if (f.failure) parts.push(`${formatCount(f.failure)} failure`);
  if (f.partial) parts.push(`${formatCount(f.partial)} partial`);
  if (f.forced) parts.push(`${formatCount(f.forced)} forced`);
  if (f.drops) parts.push(insightPlural(f.drops, 'dropset', 'dropsets'));
  return parts.join(' · ');
}
// "Bench press · 4 sets · 2 failure · 1 partial · 1 forced · 1 dropset" (insightSetFeatures).
function insightExerciseLine(exerciseId, sets) {
  const f = insightSetFeatures(sets);
  return [exerciseName(exerciseId), insightPlural(f.sets, 'set', 'sets'), insightFeaturesText(f)].filter(Boolean).join(' · ');
}

// The one rule for a comparison with the schedule, everywhere in Inzicht (Training card, training
// overview, muscle-group rows and screen, day overview): a shortfall "−1" (red), else "op schema"
// (green); then, when there are extra sets, "· +3 extra" (secondary text colour) — also after a
// shortfall (a row compared per exercise can have both).
function insightCompareText(shortfall, extra) {
  const parts = [shortfall > 0 ? `<span class="insight-danger">−${formatCount(shortfall)}</span>` : '<span class="insight-success">op schema</span>'];
  if (extra > 0) parts.push(`+${formatCount(extra)} extra`);
  return parts.join(' · ');
}

function insightDayRowHtml(r, mode) {
  const name = r.id ? muscleGroupName(r.id) : 'Geen spiergroep';
  const lines = r.exercises.map(e => `<div class="role-sub">${insightExerciseLine(e.exerciseId, e.sets)}</div>`);
  // A planned group without a logged set lists what was planned; the "Geen spiergroep" row
  // (compared per exercise) lists every planned exercise without a set.
  if (r.missed.length && (r.done === 0 || !r.id)) {
    lines.push(`<div class="role-sub insight-muted">Gepland: ${r.missed.map(ex => exerciseName(ex.exerciseId) || ex.name).join(', ')}</div>`);
  }
  let figure;
  if (mode === 'compare' && r.planned > 0) {
    figure = insightFigureHtml(formatCount(r.counted), `van ${formatCount(r.planned)}`)
      + `<div class="role-sub">${insightCompareText(r.planned - r.counted, r.extra)}</div>`;
  } else if (mode === 'compare') {
    figure = insightFigureHtml(formatCount(r.done), r.done === 1 ? 'set' : 'sets') + '<div class="role-sub">extra</div>';
  } else if (mode === 'pending') {
    figure = insightFigureHtml(formatCount(r.planned), r.planned === 1 ? 'set' : 'sets') + '<div class="role-sub">gepland</div>';
  } else {
    figure = insightFigureHtml(formatCount(r.done), r.done === 1 ? 'set' : 'sets');
  }
  return `<div class="insight-mg-row"><div class="insight-mg-main"><div class="role-row">${name}</div>${lines.join('')}</div>`
    + `<div class="insight-mg-figure">${figure}</div></div>`;
}

function insightDayTrainingHtml(d) {
  const t = insightDayTraining(d);
  const st = d.planned.status;
  const planDays = getWorkoutPlanDays(d.date);
  let title;
  if (st === 'day') title = d.planned.day.name;
  else if (st === 'rest') title = 'Rustdag';
  else if (planDays.length) title = planDays.map(p => p.dayName).join(' + ');
  else title = d.logged ? 'Training' : 'Geen training';
  let summary;
  if (t.mode === 'pending') summary = `Gepland: ${insightPlural(t.planned, 'set', 'sets')}`;
  else if (t.mode === 'none') summary = `${insightPlural(t.done, 'set', 'sets')} · geen vergelijking met schema`;
  else if (st === 'rest') summary = t.done ? `${insightPlural(t.done, 'set', 'sets')} · +${formatCount(t.extra)} extra` : 'Geen sets gepland';
  else summary = `${formatCount(t.counted)} van ${insightPlural(t.planned, 'set', 'sets')} · ${insightCompareText(t.planned - t.counted, t.extra)}`;
  return `<div class="insight-day-head"><div class="t-number">${title}</div>`
    + `<div class="role-sub">${insightScheduleText([d])}</div><div class="role-sub">${summary}</div></div>`
    + t.rows.map(r => insightDayRowHtml(r, t.mode)).join('');
}

// "00:20 – 06:50 · nacht van woensdag op donderdag" / "Nacht van woensdag op donderdag".
function insightNightText(date) {
  return `Nacht van ${weekdayLower(addDaysToDateStr(date, -1))} op ${weekdayLower(date)}`;
}
// "Nacht van woensdag 21 op donderdag 22 oktober 2026" (month and year once, unless they differ).
function insightNightLongText(date) {
  const prev = addDaysToDateStr(date, -1);
  const from = prev.slice(0, 4) !== date.slice(0, 4) ? formatDateStr(prev, 'noWeekday')
    : prev.slice(0, 7) !== date.slice(0, 7) ? formatDateStr(prev, 'dayMonth') : String(Number(prev.slice(8)));
  return `Nacht van ${weekdayLower(prev)} ${from} op ${weekdayLower(date)} ${formatDateStr(date, 'noWeekday')}`;
}
// "−0,4 kg t.o.v. woensdag": against the last earlier day with a weight; more than 6 days back,
// its date ("t.o.v. 14 oktober", with the year when that differs). '' without an earlier weight.
function insightWeightCompareText(date, kg) {
  const prev = Object.keys(db.bodyWeight || {}).filter(k => k < date).sort().pop();
  if (!prev) return '';
  const diff = roundWeight(kg - db.bodyWeight[prev]);
  const daysBack = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z')) / 86400000);
  const when = daysBack <= 6 ? weekdayLower(prev) : formatDateStr(prev, prev.slice(0, 4) === date.slice(0, 4) ? 'dayMonth' : 'noWeekday');
  return `${diff < 0 ? '−' : diff > 0 ? '+' : ''}${formatWeight(Math.abs(diff))} kg t.o.v. ${when}`;
}

// A filled-in value: the whole card opens the sheet, a pencil on the right.
function insightEditCardHtml(kind, bodyHtml) {
  return `<button type="button" class="card insight-edit-card" data-insight-edit="${kind}">`
    + `<div class="insight-edit-main">${bodyHtml}</div><span class="insight-edit-icon">${INSIGHT_PENCIL_SVG}</span></button>`;
}
// Not filled in: "Nog niet ingevuld" with a full-width fill button.
function insightFillCardHtml(kind, subHtml, label) {
  return `<div class="card">${insightEmptyHtml('Nog niet ingevuld')}${subHtml}`
    + `<button type="button" class="btn btn-primary btn-block insight-fill-btn" data-insight-edit="${kind}">${label}</button></div>`;
}

function insightDaySleepHtml(date) {
  const s = getSleep(date);
  if (!s) return insightFillCardHtml('sleep', `<div class="role-sub">${insightNightText(date)}</div>`, 'Slaap invullen');
  const min = sleepDurationMinutes(s.bedtime, s.wakeTime);
  return insightEditCardHtml('sleep',
    `<div class="insight-figure"><span class="set-val${min < SLEEP_SHORT_MINUTES ? ' insight-danger' : ''}">${formatDuration(min)}</span><span class="set-unit">u</span></div>`
    + `<div class="role-sub">${s.bedtime} – ${s.wakeTime} · ${insightNightText(date).toLowerCase()}</div>`);
}

function insightDayWeightHtml(date) {
  const kg = getBodyWeight(date);
  if (kg === null) return insightFillCardHtml('weight', '', 'Gewicht invullen');
  const cmp = insightWeightCompareText(date, kg);
  return insightEditCardHtml('weight', insightFigureHtml(formatWeight(kg), 'kg') + (cmp ? `<div class="role-sub">${cmp}</div>` : ''));
}

function renderInsightDay() {
  if (!insightDayDate || insightDayDate > todayStr()) insightDayDate = todayStr();
  const date = insightDayDate;
  insightWeekStart = weekStartOf(date); // back (arrow or hardware) lands on this day's week
  document.getElementById('insight-day-title').textContent = formatDateStr(date);
  document.getElementById('insight-day-next').disabled = date >= todayStr();
  document.getElementById('insight-day-training').innerHTML = insightDayTrainingHtml(insightDay(date));
  document.getElementById('insight-day-sleep').innerHTML = insightDaySleepHtml(date);
  document.getElementById('insight-day-weight').innerHTML = insightDayWeightHtml(date);
}

document.getElementById('insight-day-prev').addEventListener('click', () => {
  insightDayDate = addDaysToDateStr(insightDayDate, -1);
  renderInsightDay();
});
document.getElementById('insight-day-next').addEventListener('click', () => {
  if (insightDayDate >= todayStr()) return;
  insightDayDate = addDaysToDateStr(insightDayDate, 1);
  renderInsightDay();
});
document.getElementById('btn-back-insight-day').addEventListener('click', () => goBack('screen-insight'));
document.getElementById('screen-insight-day').addEventListener('click', e => {
  const el = e.target.closest('[data-insight-edit]');
  if (!el) return;
  if (el.dataset.insightEdit === 'sleep') openInsightSleepSheet(insightDayDate);
  else openInsightWeightSheet(insightDayDate);
});

// -- Inzicht: the detail screens Slaap and Gewicht (#screen-insight-metric) -----
// One screen for both (insightMetric), for the week in insightWeekStart: opened from the week's
// Slaap / Gewicht card on that week; browsing here moves insightWeekStart along, so back lands on
// the week shown last. A summary card with three columns, a chart card and a list with a row per
// day (Monday..today) that opens the day's sheet. Rules: PROJECT_CONTEXT.md, "Inzicht".
let insightMetric = 'sleep';
function openInsightMetric(kind) {
  insightMetric = kind;
  showScreen('screen-insight-metric');
}

// Summary: three columns, a Label above a Groot getal figure (unit on Klein).
function insightSummaryHtml(cols, noteHtml) {
  return '<div class="card insight-summary"><div class="insight-summary-cols">'
    + cols.map(c => `<div><div class="section-label">${c.label}</div>`
      + (c.unit ? insightFigureHtml(c.value, c.unit) : `<div class="insight-figure"><span class="set-val">${c.value}</span></div>`) + '</div>').join('')
    + `</div>${noteHtml ? `<div class="role-sub insight-summary-note">${noteHtml}</div>` : ''}</div>`;
}

// Chart over the week (one column per day, Ma … Zo), an SVG drawn at the measured width so the
// text stays 1:1; colours come from the tokens via CSS classes. y-axis labels on the left
// (right-aligned, GRAPH_LABEL_GAP from the plot), light gridlines, a dashed line on the average
// and Ma … Zo under the columns. A point sits in the middle of its day column, so the first
// and last are half a column away from the axis labels.
//   values: 7 numbers or null (no value: nothing drawn, the column stays empty)
//   lo, hi: the y range; ticks: [{ v, label }]; base: a gridline without a label (the 0 of bars)
//   type: 'bars' (danger(v) → --danger) or 'line' (the Grafiek's line: 2.5 wide, 4px points)
const INSIGHT_CHART_H = 168, INSIGHT_CHART_AXIS_W = 32, INSIGHT_CHART_TOP = 8, INSIGHT_CHART_BOTTOM = 24;
function insightChartSvg(width, o) {
  const W = Math.max(200, Math.round(width)), H = INSIGHT_CHART_H;
  const x0 = INSIGHT_CHART_AXIS_W + GRAPH_LABEL_GAP, plotB = H - INSIGHT_CHART_BOTTOM;
  const cw = (W - x0) / 7;
  const xAt = i => x0 + (i + 0.5) * cw;
  const yAt = v => INSIGHT_CHART_TOP + (1 - (v - o.lo) / (o.hi - o.lo)) * (plotB - INSIGHT_CHART_TOP);
  const crisp = y => Math.round(y) + 0.5;
  const hline = (y, cls) => `<line class="${cls}" x1="${x0}" x2="${W}" y1="${crisp(y)}" y2="${crisp(y)}"/>`;
  let svg = `<svg class="insight-chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria}">`;
  if (o.base !== undefined) svg += hline(yAt(o.base), 'insight-chart-grid');
  o.ticks.forEach(t => {
    svg += hline(yAt(t.v), 'insight-chart-grid');
    svg += `<text class="insight-chart-tick" x="${INSIGHT_CHART_AXIS_W}" y="${yAt(t.v).toFixed(1)}">${t.label}</text>`;
  });
  if (o.type === 'bars') {
    const bw = Math.min(24, Math.round(cw * 0.55)), r = Math.min(8, bw / 2), y0 = yAt(o.lo);
    o.values.forEach((v, i) => {
      if (v === null || v <= o.lo) return;
      const x = xAt(i) - bw / 2, y = yAt(v), rr = Math.min(r, y0 - y);
      // rounded top corners (--radius-sm), square at the base
      svg += `<path class="insight-bar${o.danger(v) ? ' is-short' : ''}" d="M${x} ${y0}V${(y + rr).toFixed(1)}`
        + `A${rr} ${rr} 0 0 1 ${x + rr} ${y.toFixed(1)}H${x + bw - rr}A${rr} ${rr} 0 0 1 ${x + bw} ${(y + rr).toFixed(1)}V${y0}Z"/>`;
    });
  }
  if (o.avg !== null) svg += hline(yAt(o.avg), 'insight-chart-avg');
  if (o.type === 'line') {
    const pts = o.values.map((v, i) => v === null ? null : [xAt(i), yAt(v)]).filter(Boolean);
    if (pts.length > 1) svg += `<polyline class="insight-line" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/>`;
    pts.forEach(p => { svg += `<circle class="insight-point" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"/>`; });
  }
  INSIGHT_WEEKDAYS_SHORT.forEach((d, i) => { svg += `<text class="insight-chart-day" x="${xAt(i).toFixed(1)}" y="${H - 6}">${d}</text>`; });
  return svg + '</svg>';
}

// Sleep: y from 0 with gridlines every 3 hours (3 u · 6 u · 9 u). The top label grows in steps of
// 3 hours: 9 u while the longest night is 9:00 or shorter, else 12 u, 15 u …; the range runs an
// hour above it, so there is always room above the highest bar.
function insightSleepChartOptions(weekStart, s) {
  const values = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const n = s.nights.find(x => x.date === addDaysToDateStr(weekStart, i));
    return n ? n.minutes : null;
  });
  const top = Math.max(540, Math.ceil(Math.max(...s.nights.map(n => n.minutes)) / 180) * 180);
  const hi = top + 60;
  const ticks = [];
  for (let v = 180; v <= top; v += 180) ticks.push({ v, label: `${v / 60} u` });
  return { type: 'bars', values, lo: 0, hi, base: 0, ticks, avg: s.avg, danger: v => v < SLEEP_SHORT_MINUTES,
    aria: `Slaap per nacht, gemiddeld ${formatDuration(s.avg)} u` };
}

// Weight: three gridlines on a round step (0,5 · 1 · 2 · 2,5 · 5 × 10ⁿ, at least 0,5 kg) around a
// round middle, the smallest step whose outer lines enclose every value; the range runs half a
// step beyond them, so no point touches the top or bottom and the axis never starts at 0.
function insightWeightAxis(min, max) {
  const steps = [];
  for (let e = -1; e <= 3; e++) [1, 2, 2.5, 5].forEach(m => { const s = Math.round(m * 10 ** e * 100) / 100; if (s >= 0.5) steps.push(s); });
  const clean = x => Math.round(x * 100) / 100;
  for (const step of steps) {
    const mid = clean(Math.round((min + max) / 2 / step) * step);
    if (mid - step <= min + 1e-9 && mid + step >= max - 1e-9) {
      return { lo: clean(mid - 1.5 * step), hi: clean(mid + 1.5 * step), ticks: [mid - step, mid, mid + step].map(clean) };
    }
  }
  return { lo: min - 1, hi: max + 1, ticks: [min, (min + max) / 2, max] };
}
function insightWeightChartOptions(weekStart, w) {
  const values = [0, 1, 2, 3, 4, 5, 6].map(i => getBodyWeight(addDaysToDateStr(weekStart, i)));
  const axis = insightWeightAxis(w.min, w.max);
  return { type: 'line', values, lo: axis.lo, hi: axis.hi, ticks: axis.ticks.map(v => ({ v, label: formatWeight(v) })), avg: w.avg,
    aria: `Gewicht per dag, gemiddeld ${formatNumber(w.avg)} kg` };
}

// The list: a row per day from Monday up to today (no days still to come), in a card. Left the
// date (Rij in een lijst) with a subline; right the figure (Groot getal), or nothing.
function insightDayListHtml(weekStart, rowFor) {
  const today = todayStr();
  const rows = [0, 1, 2, 3, 4, 5, 6].map(i => addDaysToDateStr(weekStart, i)).filter(d => d <= today).map(date => {
    const r = rowFor(date);
    return `<button type="button" class="insight-mg-row insight-list-row" data-insight-fill="${date}">`
      + `<div class="insight-mg-main"><div class="role-row">${formatDateStr(date)}</div>`
      + (r ? (r.sub ? `<div class="role-sub">${r.sub}</div>` : '') : '<div class="role-sub insight-muted">Niet ingevuld</div>')
      + `</div>${r ? `<div class="insight-mg-figure">${r.figure}</div>` : ''}</button>`;
  });
  return `<div class="card insight-day-card insight-list">${rows.join('')}</div>`;
}
const insightSleepFigureHtml = min =>
  `<div class="insight-figure"><span class="set-val${min < SLEEP_SHORT_MINUTES ? ' insight-danger' : ''}">${formatDuration(min)}</span><span class="set-unit">u</span></div>`;

function insightSleepDetailHtml(weekStart) {
  const s = insightSleepWeek(weekStart);
  const summary = s
    ? insightSummaryHtml([
      { label: 'Gemiddeld', value: formatDuration(s.avg), unit: 'u' },
      { label: 'Naar bed', value: s.bedtime },
      { label: 'Opgestaan', value: s.wakeTime },
    ], `<div>Kortste nacht: ${insightNightOf(s.shortest)}</div>`
      + (s.nights.length > 1 ? `<div>Langste nacht: ${insightNightOf(s.longest)}</div>` : ''))
    : `<div class="card insight-summary">${insightEmptyHtml('Nog geen slaap ingevuld')}</div>`;
  const list = insightDayListHtml(weekStart, date => {
    const n = getSleep(date);
    if (!n) return null;
    return { sub: `${n.bedtime} – ${n.wakeTime}`, figure: insightSleepFigureHtml(sleepDurationMinutes(n.bedtime, n.wakeTime)) };
  });
  return { summary, chart: s && insightSleepChartOptions(weekStart, s), label: 'Nachten', list };
}

function insightWeightDetailHtml(weekStart) {
  const w = insightWeightWeek(weekStart);
  const summary = w
    ? insightSummaryHtml([
      { label: 'Gemiddeld', value: formatNumber(w.avg), unit: 'kg' },
      { label: 'Laagste', value: formatWeight(w.min), unit: 'kg' },
      { label: 'Hoogste', value: formatWeight(w.max), unit: 'kg' },
    ], insightWeightWeekCompareText(weekStart, w.avg))
    : `<div class="card insight-summary">${insightEmptyHtml('Nog geen gewicht ingevuld')}</div>`;
  const list = insightDayListHtml(weekStart, date => {
    const kg = getBodyWeight(date);
    return kg === null ? null : { figure: insightFigureHtml(formatWeight(kg), 'kg') };
  });
  return { summary, chart: w && insightWeightChartOptions(weekStart, w), label: 'Weegmomenten', list };
}

let insightChartOptions = null; // the drawn chart, redrawn at a new width (rotation)
function drawInsightChart() {
  const el = document.getElementById('insight-chart');
  if (el && insightChartOptions) el.innerHTML = insightChartSvg(el.clientWidth || 296, insightChartOptions);
}
function renderInsightMetric() {
  if (!insightWeekStart) insightWeekStart = weekStartOf(todayStr());
  const weekStart = insightWeekStart;
  document.getElementById('insight-metric-title').textContent = insightMetric === 'sleep' ? 'Slaap' : 'Gewicht';
  document.getElementById('insight-metric-head').innerHTML = insightWeekHeadHtml(weekStart);
  const d = insightMetric === 'sleep' ? insightSleepDetailHtml(weekStart) : insightWeightDetailHtml(weekStart);
  insightChartOptions = d.chart;
  // No value at all: only the summary's empty state, no empty chart.
  const chart = d.chart ? '<div class="card insight-chart-card"><div class="insight-chart" id="insight-chart"></div>'
    + '<div class="role-sub insight-chart-legend">- - - gemiddeld</div></div>' : '';
  document.getElementById('insight-metric-body').innerHTML = d.summary + chart
    + `<div class="section-label insight-label">${d.label}</div>` + d.list;
  drawInsightChart();
}
document.getElementById('btn-back-insight-metric').addEventListener('click', () => goBack('screen-insight'));
document.getElementById('insight-metric-body').addEventListener('click', e => {
  const row = e.target.closest('[data-insight-fill]');
  if (!row) return;
  if (insightMetric === 'sleep') openInsightSleepSheet(row.dataset.insightFill);
  else openInsightWeightSheet(row.dataset.insightFill);
});
window.addEventListener('resize', () => {
  if (document.getElementById('screen-insight-metric').classList.contains('active')) drawInsightChart();
});

// -- Inzicht: the training overview and the muscle-group screen ----------------------------------
// #screen-insight-training: the week's training per muscle group, opened from the week's Training
// card; a row opens #screen-insight-muscle for that group (or "Geen spiergroep"), same week. Both
// for the week in insightWeekStart: browsing moves it along, so back lands on the week shown last.
// Everything comes from insightTrainingStats (insightCompareKey), the Training card's numbers.
// Rules: PROJECT_CONTEXT.md, "Het trainingsoverzicht".

// A row per MUSCLE_GROUPS group, plus '' ("Geen spiergroep") when sets or planned sets have no
// (known) primary muscle group: { id, planned, done, counted (min per comparison key), extra,
// today (planned today, before today's first set; not counted), features (insightSetFeatures,
// summed), pct (share of all done sets, whole %) }. The '' row is
// compared per exercise and adds those up. Sorted on pct (high to low), a tie in MUSCLE_GROUPS
// order, '' always last.
function insightMuscleRows(stats) {
  const rows = new Map();
  const row = id => {
    if (!rows.has(id)) rows.set(id, { ...INSIGHT_MUSCLE_ROW_EMPTY, id });
    return rows.get(id);
  };
  MUSCLE_GROUPS.forEach(m => row(m.id));
  const rowOfKey = k => row(k.startsWith('mg:') && rows.has(k.slice(3)) && k.slice(3) ? k.slice(3) : '');
  new Set([...Object.keys(stats.planned), ...Object.keys(stats.done)]).forEach(k => {
    const p = stats.planned[k] || 0, n = stats.done[k] || 0;
    if (!p && !n) return;
    const r = rowOfKey(k);
    r.planned += p; r.done += n; r.counted += Math.min(p, n); r.extra += Math.max(0, n - p);
  });
  Object.entries(stats.plannedToday).forEach(([k, p]) => { rowOfKey(k).today += p; });
  Object.entries(stats.doneEx).forEach(([id, f]) => { const r = row(insightMuscleRowId(id)); r.features = insightAddFeatures(r.features, f); });
  const order = [...MUSCLE_GROUPS.map(m => m.id), ''];
  return [...rows.values()]
    .map(r => ({ ...r, pct: stats.doneSets ? Math.round(r.done / stats.doneSets * 100) : 0 }))
    .sort((a, b) => (a.id === '') - (b.id === '') || b.pct - a.pct || order.indexOf(a.id) - order.indexOf(b.id));
}
const INSIGHT_MUSCLE_ROW_EMPTY = { id: '', planned: 0, done: 0, counted: 0, extra: 0, today: 0, features: INSIGHT_FEATURES_EMPTY, pct: 0 };
const insightMuscleName = id => id ? muscleGroupName(id) : 'Geen spiergroep';

// A row's comparison: "8 van 10 · " + insightCompareText ("−2" / "op schema", "· +2 extra"); not
// planned (yet): "2 sets · extra", "0 sets · vandaag gepland" (only planned today, before today's
// first set) or "0 sets · niet in schema"; no comparison: "N sets".
// `ofPlanned` goes after "van 10" (the muscle-group screen: " sets uit je schema").
function insightMuscleCompareText(r, compare, ofPlanned = '') {
  if (!compare) return insightPlural(r.done, 'set', 'sets');
  if (r.planned > 0) return `${formatCount(r.counted)} van ${formatCount(r.planned)}${ofPlanned} · ${insightCompareText(r.planned - r.counted, r.extra)}`;
  if (r.done) return `${insightPlural(r.done, 'set', 'sets')} · extra`;
  return r.today ? '0 sets · vandaag gepland' : '0 sets · niet in schema';
}

// Summary card with five columns: SETS, FAILURE, PARTIAL, FORCED, DROPSET.
function insightFeaturesSummaryHtml(f, noteHtml) {
  return insightSummaryHtml([
    { label: 'Sets', value: formatCount(f.sets) }, { label: 'Failure', value: formatCount(f.failure) },
    { label: 'Partial', value: formatCount(f.partial) }, { label: 'Forced', value: formatCount(f.forced) },
    { label: 'Dropset', value: formatCount(f.drops) },
  ], noteHtml);
}
// "16%": the number on Groot getal, the % right after it on Klein (no space).
const insightPctHtml = pct => `<div class="insight-figure insight-pct"><span class="set-val">${pct}</span><span class="set-unit">%</span></div>`;
// Done (--primary) above planned (--text-muted), 4px each, on one scale for all rows; a 0 draws
// nothing but keeps its place. An SVG, so the width needs no inline style.
function insightMuscleBarsSvg(done, planned, scale) {
  const bar = (cls, v, y) => v > 0 && scale > 0 ? `<rect class="${cls}" y="${y}" width="${(v / scale * 100).toFixed(2)}%" height="4" rx="2"/>` : '';
  return `<svg class="insight-mg-bars" width="100%" height="10" aria-hidden="true">${bar('insight-bar', done, 0)}${bar('insight-bar-planned', planned, 6)}</svg>`;
}

let insightMuscleId = '';
function openInsightTraining() { showScreen('screen-insight-training'); }
function openInsightMuscle(id) {
  insightMuscleId = id;
  showScreen('screen-insight-muscle');
}

function renderInsightTraining() {
  if (!insightWeekStart) insightWeekStart = weekStartOf(todayStr());
  const weekStart = insightWeekStart;
  const days = insightWeekDays(weekStart);
  const stats = insightTrainingStats(days);
  const rows = insightMuscleRows(stats);
  const t = insightTrainingTexts(stats);
  document.getElementById('insight-training-head').innerHTML = insightWeekHeadHtml(weekStart);
  document.getElementById('insight-training-schema').textContent = insightScheduleText(days);
  const total = rows.reduce((a, r) => insightAddFeatures(a, r.features), INSIGHT_FEATURES_EMPTY);
  const note = t.none ? `<div>${t.none}</div>`
    : `<div>${formatCount(stats.fromSchedule)} ${t.ofPlanned} · ${t.diff}</div><div>${t.trainings}</div>`;
  const scale = Math.max(0, ...rows.map(r => Math.max(r.done, r.planned)));
  const list = rows.map(r => {
    const features = insightFeaturesText(r.features);
    return `<button type="button" class="insight-mg-row insight-list-row" data-insight-mg="${r.id}">`
      + `<div class="insight-mg-main"><div class="role-row">${insightMuscleName(r.id)}</div>${insightMuscleBarsSvg(r.done, r.planned, scale)}`
      + `<div class="role-sub">${insightMuscleCompareText(r, stats.compare)}</div>${features ? `<div class="role-sub">${features}</div>` : ''}</div>`
      + `<div class="insight-mg-figure">${insightPctHtml(r.pct)}</div>`
      + `<span class="insight-edit-icon insight-chevron">${INSIGHT_CHEVRON_SVG}</span></button>`;
  }).join('');
  document.getElementById('insight-training-body').innerHTML = insightFeaturesSummaryHtml(total, note)
    + '<div class="insight-label insight-label-row"><span class="section-label">Per spiergroep</span>'
    + '<span class="t-small insight-legend"><span class="insight-legend-item"><span class="insight-dot insight-dot-done"></span>Gedaan</span>'
    + '<span class="insight-legend-item"><span class="insight-dot insight-dot-planned"></span>Schema</span></span></div>'
    + `<div class="card insight-day-card insight-list insight-mg-list">${list}</div>`;
}
document.getElementById('btn-back-insight-training').addEventListener('click', () => goBack('screen-insight'));
document.getElementById('insight-training-body').addEventListener('click', e => {
  const row = e.target.closest('[data-insight-mg]');
  if (row) openInsightMuscle(row.dataset.insightMg);
});

// A row of a list that is only to look at: name (and a Klein line) on the left, the value on the right.
function insightListRowHtml(mainHtml, figureHtml) {
  return `<div class="insight-mg-row"><div class="insight-mg-main">${mainHtml}</div>`
    + (figureHtml ? `<div class="insight-mg-figure">${figureHtml}</div>` : '') + '</div>';
}
const insightSetsFigureHtml = n => insightFigureHtml(formatCount(n), n === 1 ? 'set' : 'sets');
const insightListCardHtml = rows => `<div class="card insight-day-card insight-list">${rows.join('')}</div>`;

function renderInsightMuscle() {
  if (!insightWeekStart) insightWeekStart = weekStartOf(todayStr());
  const weekStart = insightWeekStart;
  const id = insightMuscleId;
  const days = insightWeekDays(weekStart);
  const stats = insightTrainingStats(days);
  const r = insightMuscleRows(stats).find(x => x.id === id) || { ...INSIGHT_MUSCLE_ROW_EMPTY, id };
  document.getElementById('insight-muscle-title').textContent = insightMuscleName(id);
  document.getElementById('insight-muscle-head').innerHTML = insightWeekHeadHtml(weekStart);
  document.getElementById('insight-muscle-schema').textContent = insightScheduleText(days);
  const note = (stats.compare ? `<div>${insightMuscleCompareText(r, true, ' sets uit je schema')}</div>` : '')
    + `<div>${r.pct}% van al je sets</div>`;
  // OEFENINGEN: done with this group as primary (most sets first), then planned but not done.
  const bySets = (a, b) => b[1].sets - a[1].sets || exerciseName(a[0]).localeCompare(exerciseName(b[0]), 'nl');
  const done = Object.entries(stats.doneEx).filter(([ex]) => insightMuscleRowId(ex) === id).sort(bySets);
  const missed = Object.entries(stats.plannedEx).filter(([ex]) => insightMuscleRowId(ex) === id && !stats.doneEx[ex]).sort(bySets);
  const today = Object.entries(stats.todayEx).filter(([ex]) => insightMuscleRowId(ex) === id && !stats.doneEx[ex] && !stats.plannedEx[ex]).sort(bySets);
  const exRows = done.map(([ex, f]) => {
    const features = insightFeaturesText(f);
    return insightListRowHtml(`<div class="role-row">${exerciseName(ex)}</div>${features ? `<div class="role-sub">${features}</div>` : ''}`, insightSetsFigureHtml(f.sets));
  }).concat(missed.map(([ex, p]) => insightListRowHtml(
    `<div class="role-row insight-muted">${exerciseName(ex) || p.name}</div><div class="role-sub">Gepland · ${insightPlural(p.sets, 'set', 'sets')}</div>`)),
  today.map(([ex, p]) => insightListRowHtml(
    `<div class="role-row insight-muted">${exerciseName(ex) || p.name}</div><div class="role-sub">Vandaag gepland · ${insightPlural(p.sets, 'set', 'sets')}</div>`)));
  // MEEGETRAIND: done with this group as a secondary one; left out when there is none.
  const secondary = id ? Object.entries(stats.doneEx).filter(([ex]) => {
    const info = getExerciseInfo(ex);
    return insightMuscleRowId(ex) !== id && ((info && info.secondaryMuscleGroups) || []).includes(id);
  }).sort(bySets) : [];
  const secRows = secondary.map(([ex, f]) => {
    const primary = insightMuscleRowId(ex);
    return insightListRowHtml(`<div class="role-row">${exerciseName(ex)}</div><div class="role-sub">Primair: ${primary ? muscleGroupName(primary) : 'niet ingesteld'}</div>`, insightSetsFigureHtml(f.sets));
  });
  document.getElementById('insight-muscle-body').innerHTML = insightFeaturesSummaryHtml(r.features, note)
    + '<div class="section-label insight-label">Oefeningen</div>'
    + (exRows.length ? insightListCardHtml(exRows) : `<div class="card">${insightEmptyHtml('Geen oefeningen deze week')}</div>`)
    + (secRows.length ? '<div class="insight-label"><div class="section-label">Meegetraind</div>'
      + '<div class="role-sub insight-label-note">Telt niet mee in het percentage</div></div>' + insightListCardHtml(secRows) : '');
}
document.getElementById('btn-back-insight-muscle').addEventListener('click', () => goBack('screen-insight-training'));

// The sheets below fill in insightSheetDate; after Opslaan or Wissen the screen they were opened
// from (day overview or a detail screen) is redrawn at once.
let insightSheetDate = null;
function renderInsightAfterEdit() {
  if (document.getElementById('screen-insight-metric').classList.contains('active')) renderInsightMetric();
  else renderInsightDay();
}

// Sleep sheet: an own 24-hour clock (0 at the top, clockwise; DESIGN_SYSTEM.md "24-uursklok").
// Drag a handle over the ring (5-minute steps, freely across 0) or tap a time in the middle and
// type it ("2345" → 23:45, "730" → 07:30). The duration always runs from bedtime to wake time,
// clockwise, across midnight. Starts on the night's own times, else the last earlier night's,
// else 23:00–07:00. Wissen (only for a night that is filled in) clears the night at once.
const SLEEP_CLOCK_R = 116, SLEEP_CLOCK_C = 140; // ring radius and centre in the 280 viewBox
const SLEEP_CLOCK_STEP = 5;
const SLEEP_DEFAULT = { bedtime: '23:00', wakeTime: '07:00' };
let insightSleepBaseline = null;
const insightSleepTimes = { bed: SLEEP_DEFAULT.bedtime, wake: SLEEP_DEFAULT.wakeTime };
const insightSleepValues = () => [insightSleepTimes.bed, insightSleepTimes.wake];
const sleepClock = document.getElementById('sleep-clock');
// A point on the ring for a time of day, in viewBox units (0:00 at the top, clockwise).
function sleepClockPoint(minutes) {
  const a = minutes / 1440 * 2 * Math.PI;
  return { x: SLEEP_CLOCK_C + SLEEP_CLOCK_R * Math.sin(a), y: SLEEP_CLOCK_C - SLEEP_CLOCK_R * Math.cos(a) };
}
function renderSleepClock() {
  const dur = sleepDurationMinutes(insightSleepTimes.bed, insightSleepTimes.wake);
  const p0 = sleepClockPoint(timeToMinutes(insightSleepTimes.bed)), p1 = sleepClockPoint(timeToMinutes(insightSleepTimes.wake));
  document.getElementById('sleep-clock-arc').setAttribute('d', dur === 0 ? ''
    : `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${SLEEP_CLOCK_R} ${SLEEP_CLOCK_R} 0 ${dur > 720 ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`);
  sleepClock.querySelectorAll('.sleep-clock-handle').forEach(h => {
    const t = insightSleepTimes[h.dataset.which], p = sleepClockPoint(timeToMinutes(t));
    h.style.left = `${p.x / (2 * SLEEP_CLOCK_C) * 100}%`;
    h.style.top = `${p.y / (2 * SLEEP_CLOCK_C) * 100}%`;
    h.setAttribute('aria-valuetext', t);
  });
  sleepClock.querySelectorAll('.sleep-clock-time').forEach(b => { b.textContent = insightSleepTimes[b.dataset.which]; });
  document.getElementById('insight-sleep-total').textContent = `Totaal: ${formatDuration(dur)} u · tik op een tijd om hem in te typen`;
}
// Dragging: the time follows the angle of the pointer around the centre, in 5-minute steps.
let sleepClockDrag = null;
sleepClock.querySelectorAll('.sleep-clock-handle').forEach(h => {
  h.addEventListener('pointerdown', e => {
    e.preventDefault();
    sleepClockDrag = { which: h.dataset.which, pointerId: e.pointerId };
    sleepClock.querySelectorAll('.sleep-clock-handle').forEach(x => x.classList.toggle('is-top', x === h)); // the dragged handle lies on top
    h.setPointerCapture(e.pointerId);
  });
  h.addEventListener('pointermove', e => {
    if (!sleepClockDrag || sleepClockDrag.pointerId !== e.pointerId) return;
    const r = sleepClock.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), (r.top + r.height / 2) - e.clientY);
    const m = (a / (2 * Math.PI) * 1440 + 1440) % 1440;
    insightSleepTimes[sleepClockDrag.which] = minutesToTime(Math.round(m / SLEEP_CLOCK_STEP) * SLEEP_CLOCK_STEP % 1440);
    renderSleepClock();
  });
  const end = e => { if (sleepClockDrag && sleepClockDrag.pointerId === e.pointerId) sleepClockDrag = null; };
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
  // keyboard: the arrows move 5 minutes
  h.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const m = timeToMinutes(insightSleepTimes[h.dataset.which]);
    insightSleepTimes[h.dataset.which] = minutesToTime((m + step * SLEEP_CLOCK_STEP + 1440) % 1440);
    renderSleepClock();
  });
});
// Typing: "2345" → 23:45, "730" → 07:30 (a typed colon is ignored); null when not a valid time.
function parseTypedTime(str) {
  const digits = String(str).replace(/\D/g, '');
  if (digits.length !== 3 && digits.length !== 4) return null;
  const h = Number(digits.slice(0, -2)), m = Number(digits.slice(-2));
  return h <= 23 && m <= 59 ? minutesToTime(h * 60 + m) : null;
}
const sleepClockEl = (cls, which) => sleepClock.querySelector(`.${cls}[data-which="${which}"]`);
function closeSleepClockInput(which) {
  sleepClockEl('sleep-clock-input', which).classList.add('hidden');
  sleepClockEl('sleep-clock-time', which).classList.remove('hidden');
}
// Takes the typed time over (the clock follows); an invalid one gives the red toast and keeps the old time.
function commitSleepClockInput(which) {
  const t = parseTypedTime(sleepClockEl('sleep-clock-input', which).value);
  if (!t) { toast('Vul een geldige tijd in', { type: 'error' }); return false; }
  insightSleepTimes[which] = t;
  renderSleepClock();
  return true;
}
sleepClock.querySelectorAll('.sleep-clock-time').forEach(b => b.addEventListener('click', () => {
  const input = sleepClockEl('sleep-clock-input', b.dataset.which);
  input.value = insightSleepTimes[b.dataset.which];
  b.classList.add('hidden');
  input.classList.remove('hidden');
  input.focus();
  input.select();
}));
sleepClock.querySelectorAll('.sleep-clock-input').forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (commitSleepClockInput(input.dataset.which)) input.blur(); else input.select();
  });
  input.addEventListener('blur', () => {
    if (input.classList.contains('hidden')) return;
    commitSleepClockInput(input.dataset.which);
    closeSleepClockInput(input.dataset.which);
  });
});
// The night's own times; else those of the last earlier night that is filled in; else 23:00–07:00.
function insightSleepStart(date) {
  const prev = Object.keys(db.sleep || {}).filter(d => d < date).sort().pop();
  return getSleep(date) || (prev ? db.sleep[prev] : SLEEP_DEFAULT);
}
function openInsightSleepSheet(date) {
  insightSheetDate = date;
  const start = insightSleepStart(insightSheetDate);
  insightSleepTimes.bed = start.bedtime;
  insightSleepTimes.wake = start.wakeTime;
  ['bed', 'wake'].forEach(closeSleepClockInput);
  document.getElementById('insight-sleep-sub').textContent = insightNightLongText(insightSheetDate);
  document.getElementById('btn-insight-sleep-clear').classList.toggle('hidden', !getSleep(insightSheetDate));
  insightSleepBaseline = insightSleepValues();
  renderSleepClock();
  openOverlay('insight-sleep-overlay');
}
document.getElementById('btn-insight-sleep-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(() => hasChanges(insightSleepBaseline, insightSleepValues()), () => closeOverlay('insight-sleep-overlay'));
});
document.getElementById('btn-insight-sleep-clear').addEventListener('click', () => {
  deleteSleep(insightSheetDate);
  toast('Slaap gewist');
  closeOverlay('insight-sleep-overlay');
  renderInsightAfterEdit();
});
document.getElementById('btn-insight-sleep-save').addEventListener('click', () => {
  const [bed, wake] = insightSleepValues();
  if (bed === wake) { toast('Naar bed en opgestaan kunnen niet gelijk zijn', { type: 'error' }); return; }
  if (!saveSleep(insightSheetDate, bed, wake)) { toast('Vul een geldige tijd in', { type: 'error' }); return; }
  toast('Slaap opgeslagen');
  closeOverlay('insight-sleep-overlay');
  renderInsightAfterEdit();
});

// Weight sheet: one decimal field (comma or point, max. 2 decimals, FIELD_DECIMALS), 20 to 400
// kg. Wissen (only for a day that is filled in) clears the weight at once; empty + Opslaan is an error.
const INSIGHT_WEIGHT_MIN = 20, INSIGHT_WEIGHT_MAX = 400;
let insightWeightBaseline = null;
function openInsightWeightSheet(date) {
  insightSheetDate = date;
  const kg = getBodyWeight(insightSheetDate);
  const input = document.getElementById('insight-weight-input');
  input.value = kg === null ? '' : formatWeight(kg);
  document.getElementById('insight-weight-sub').textContent = formatDateStr(insightSheetDate);
  document.getElementById('btn-insight-weight-clear').classList.toggle('hidden', kg === null);
  insightWeightBaseline = input.value;
  openOverlay('insight-weight-overlay');
}
document.getElementById('insight-weight-input').addEventListener('change', e => {
  if (e.target.value.trim() && parseDecimal(e.target.value) > 0) e.target.value = formatWeight(parseWeight(e.target.value));
});
document.getElementById('btn-insight-weight-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(() => hasChanges(insightWeightBaseline, document.getElementById('insight-weight-input').value), () => closeOverlay('insight-weight-overlay'));
});
document.getElementById('btn-insight-weight-clear').addEventListener('click', () => {
  deleteBodyWeight(insightSheetDate);
  toast('Gewicht gewist');
  closeOverlay('insight-weight-overlay');
  renderInsightAfterEdit();
});
document.getElementById('btn-insight-weight-save').addEventListener('click', () => {
  const date = insightSheetDate;
  const raw = document.getElementById('insight-weight-input').value.trim();
  if (!raw) { toast('Vul een gewicht in', { type: 'error' }); return; }
  const kg = parseWeight(raw);
  if (!(kg >= INSIGHT_WEIGHT_MIN && kg <= INSIGHT_WEIGHT_MAX)) { toast('Vul een gewicht in van 20 tot en met 400 kg', { type: 'error' }); return; }
  saveBodyWeight(date, kg);
  toast('Gewicht opgeslagen');
  closeOverlay('insight-weight-overlay');
  renderInsightAfterEdit();
});

function renderNewWorkoutScreen() {
  const pick = getTodaysScheduledDay();
  document.getElementById('nw-schema-auto-desc').textContent = pick
    ? `Vandaag staat ${pick.dayName} op het programma.`
    : 'Automatische planning nog niet ingesteld';
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
// The workout also remembers which plan day was loaded (recordWorkoutPlanDay).
function loadPlanDayIntoWorkout(plan, day, date) {
  recordWorkoutPlanDay(date, plan, day);
  const workout = getWorkout(date);
  let added = 0;
  (day.exercises || []).forEach(ex => {
    if (workout.find(e => e.exerciseId === ex.exerciseId)) return;
    const target = planExerciseTarget(ex);
    workout.push({ exerciseId: ex.exerciseId, sets: [], ...(target && { target }) });
    added++;
  });
  if (added > 0) setWorkout(date, workout);
  return added;
}

// The plan days loaded into the workout of `date` (stored on its document as `planDays`,
// next to `exercises`): [{ planId, dayId, dayName, week? }] — `week` ('A'/'B') only for a
// Week A/B plan. Every plan day loaded on that date is kept, each once (loading the same day
// again only refreshes its name). Exercises added without a plan day don't add anything here.
function getWorkoutPlanDays(date) { return (db.workoutPlanDays || {})[date] || []; }
function recordWorkoutPlanDay(date, plan, day) {
  if (!db.workoutPlanDays) db.workoutPlanDays = {};
  const entry = { planId: plan.id, dayId: day.id, dayName: day.name, ...(planScheduleType(plan) === 'weekAB' && day.group && { week: day.group }) };
  const list = getWorkoutPlanDays(date).filter(e => !(e.planId === entry.planId && e.dayId === entry.dayId));
  db.workoutPlanDays[date] = [...list, entry];
  if (!currentUser) return;
  uDoc('workouts/' + date).set({ planDays: db.workoutPlanDays[date] }, { merge: true }).catch(persistFailed);
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

// Same ACTIEF PLAN / MIJN PLANNEN sections as Trainingsplannen; a card opens the day picker.
function renderSchedulePickPlan() {
  const hasPlans = renderPlanSections('schedule-pick-plan', (plan, featured) => {
    const item = buildPlanItem(plan, { withMenu: false, featured });
    item.addEventListener('click', () => openSchedulePickDay(plan.id));
    return item;
  });
  if (!hasPlans) {
    document.getElementById('schedule-pick-plan-scroll').innerHTML = '<div class="plan-list-empty">Nog geen plannen. Maak er eerst een aan via Trainingsplannen.</div>';
  }
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
  loadPlanDayIntoWorkout(plan, day, date);
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
    : 'Geen actief plan gevonden. Stel een plan in als actief via Trainingsplannen.';
  document.getElementById('btn-schedule-load-cancel').classList.toggle('hidden', !pick);
  document.getElementById('btn-schedule-load-confirm').textContent = pick ? 'Laden' : 'Sluiten';
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
  loadPlanDayIntoWorkout(pick.plan, pick.day, todayStr());
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
  setExercisesTitle('Alle oefeningen');
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
    if (browse === FAVORITES_CATEGORY) { setExercisesTitle('Favorieten'); renderFavoriteExercises(); }
    else { setExercisesTitle(categoryName(browse)); renderExercisesInCategory(browse); }
  }
}

// Every list on the Alle oefeningen screen (categories, a category, search results, Favorieten)
// sits in one white card (.card.list-card) on --bg, like the History and day-overview cards.
// Empty-state text stays outside the card. Returns the card to append rows to.
function exerciseListCard() {
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card list-card';
  list.appendChild(card);
  return card;
}

function renderCategoryBrowser() {
  setExercisesTitle(defaultExercisesTitle());
  const list = exerciseListCard();
  // Visible favorites only: a deleted (hidden) exercise keeps its favorite mark.
  const hasFavorites = allExercises().some(e => isFavoriteExercise(e.id));
  if (hasFavorites) {
    const item = document.createElement('div');
    item.className = 'category-item category-item-favorites list-row';
    item.innerHTML = `
      <svg class="category-item-fav-star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      <span class="category-item-name">Favorieten</span>
    `;
    item.addEventListener('click', () => {
      enterExerciseBrowseCategory(FAVORITES_CATEGORY, 'Favorieten', renderFavoriteExercises);
    });
    list.appendChild(item);
  }
  allCategories().forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item list-row';
    item.innerHTML = `
      <span class="category-item-name">${cat.name}</span>
      <svg class="category-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
    `;
    item.querySelector('.category-item-name').addEventListener('click', () => {
      enterExerciseBrowseCategory(cat.id, cat.name, () => renderExercisesInCategory(cat.id));
    });
    item.querySelector('.category-item-dots').addEventListener('click', e => {
      e.stopPropagation();
      showOverflowMenu([
        { label: 'Bewerken', action: () => editCategory(cat) },
        { label: 'Verwijderen', action: () => deleteCategory(cat) }
      ], e.currentTarget);
    });
    list.appendChild(item);
  });
  // Entry to Verwijderde oefeningen: its own card under the categories, only while something
  // is deleted, and not when this screen picks an exercise for a plan day.
  const deletedCount = deletedExercises().length;
  if (deletedCount > 0 && exerciseScreenMode !== 'plan-add') {
    const card = document.createElement('div');
    card.className = 'card list-card';
    card.innerHTML = `
      <div class="category-item category-item-deleted list-row" id="exercises-deleted-row">
        <span class="category-item-name">Verwijderde oefeningen (${deletedCount})</span>
        <svg class="category-item-chevron" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </div>
    `;
    card.firstElementChild.addEventListener('click', openDeletedExercises);
    document.getElementById('exercise-list').appendChild(card);
  }
}

// -- Category edit/delete -------------------------------
// Renaming only changes the shown name (exercises keep the category id). Deleting is refused
// while the category still holds exercises: the same popup then only says it must be empty first.
let pendingEditCategory = null;
let pendingDeleteCategory = null;

function editCategory(cat) {
  pendingEditCategory = cat;
  document.getElementById('cat-edit-input').value = cat.name;
  openOverlay('cat-edit-overlay');
  setTimeout(() => document.getElementById('cat-edit-input').select(), 100);
}

function deleteCategory(cat) {
  const count = exercisesInCategory(cat.id).length;
  pendingDeleteCategory = count > 0 ? null : cat;
  document.getElementById('cat-delete-title').textContent = count > 0 ? 'Categorie niet leeg' : 'Categorie verwijderen?';
  document.getElementById('cat-delete-msg').textContent = count > 0
    ? `"${cat.name}" bevat nog ${count} oefening${count !== 1 ? 'en' : ''}. Een categorie kan pas worden verwijderd als hij leeg is: verplaats of verwijder eerst de oefeningen erin.`
    : `"${cat.name}" verwijderen?`;
  document.getElementById('btn-cat-delete-cancel').classList.toggle('hidden', count > 0);
  const confirmBtn = document.getElementById('btn-cat-delete-confirm');
  confirmBtn.textContent = count > 0 ? 'Sluiten' : 'Verwijderen';
  confirmBtn.classList.toggle('btn-danger', count === 0);
  confirmBtn.classList.toggle('btn-primary', count > 0);
  openOverlay('cat-delete-overlay');
}

document.getElementById('btn-cat-edit-cancel').addEventListener('click', () => {
  confirmDiscardIfChanged(
    () => hasChanges(pendingEditCategory && pendingEditCategory.name, document.getElementById('cat-edit-input').value),
    () => closeOverlay('cat-edit-overlay')
  );
});
document.getElementById('btn-cat-edit-save').addEventListener('click', () => {
  const newName = document.getElementById('cat-edit-input').value.trim();
  const cat = pendingEditCategory;
  if (!newName || !cat) return;
  if (findCategoryByName(newName, cat.id)) { toast('Deze categorie bestaat al'); return; }
  const s = categoryState();
  if (cat.standard) {
    const std = EXERCISE_CATEGORIES.find(c => c.id === cat.id);
    if (newName === std.name) delete s.names[cat.id];
    else s.names[cat.id] = newName;
  } else {
    s.custom.find(c => c.id === cat.id).name = newName;
  }
  persistCategories();
  closeOverlay('cat-edit-overlay');
  pendingEditCategory = null;
  renderCategoryBrowser();
  toast('Categorie hernoemd');
});
document.getElementById('btn-cat-delete-cancel').addEventListener('click', () => closeOverlay('cat-delete-overlay'));
document.getElementById('btn-cat-delete-confirm').addEventListener('click', () => {
  const cat = pendingDeleteCategory;
  pendingDeleteCategory = null;
  closeOverlay('cat-delete-overlay');
  // Not-empty notice ("Sluiten"), or the category filled up meanwhile: nothing to delete.
  if (!cat || exercisesInCategory(cat.id).length > 0) return;
  const s = categoryState();
  if (cat.standard) { if (!s.deleted.includes(cat.id)) s.deleted.push(cat.id); }
  else {
    s.custom = s.custom.filter(c => c.id !== cat.id);
    // A deleted exercise may still be in it: remembered so terugzetten can bring it back.
    if (deletedExercises().some(e => e.category === cat.id)) s.removed = [...(s.removed || []), { id: cat.id, name: cat.name }];
  }
  persistCategories();
  renderCategoryBrowser();
  toast('Categorie verwijderd');
});

function renderExercisesInCategory(cat) {
  const list = exerciseListCard();
  const exercises = exercisesInCategory(cat);
  if (exercises.length === 0) {
    document.getElementById('exercise-list').innerHTML = `<div class="exercise-empty">Geen oefeningen gevonden</div>`;
    return;
  }
  exercises.forEach(ex => renderExerciseItem(list, ex));
}

function renderFavoriteExercises() {
  const list = exerciseListCard();
  const favs = allExercises().filter(e => isFavoriteExercise(e.id));
  if (favs.length === 0) {
    document.getElementById('exercise-list').innerHTML = `<div class="exercise-empty">Nog geen favorieten</div>`;
    return;
  }
  favs.forEach(ex => renderExerciseItem(list, ex));
}

function renderExerciseSearchResults(q) {
  const list = exerciseListCard();
  const filtered = allExercises().filter(e => e.name.toLowerCase().includes(q));
  if (filtered.length === 0) {
    document.getElementById('exercise-list').innerHTML = `<div class="exercise-empty">Geen oefeningen gevonden</div>`;
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
  const inPlanDay = isPlanAddMode && planDayHasExercise(ex.id);
  item.className = 'exercise-item list-row' + (ex.custom ? ' exercise-item-custom' : '') + (isPlanAddMode ? ' exercise-item-add' : '');
  const isFav = isFavoriteExercise(ex.id);
  // Plan-add mode: a small stepper-style + directly left of the ⋮ menu, which turns into a
  // filled check once the exercise is in the plan day. Only the + adds; the rest of the row
  // does nothing in this mode.
  item.innerHTML = `
    <span class="exercise-item-name">${ex.name}</span>
    ${isPlanAddMode ? `
    <button type="button" class="plate-stepper-btn ex-add-btn${inPlanDay ? ' ex-add-btn-done' : ''}" aria-label="${inPlanDay ? 'Toegevoegd' : 'Toevoegen'}"${inPlanDay ? ' disabled' : ''}>${
      inPlanDay ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>` : '+'
    }</button>` : (isFav ? `<svg class="exercise-item-fav-star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>` : '')}
    <svg class="exercise-item-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  `;
  if (isPlanAddMode) {
    // Once added the + is a disabled check: a second tap does nothing (as before).
    if (!inPlanDay) item.querySelector('.ex-add-btn').addEventListener('click', () => openPdeSrAdd(ex.id));
  } else {
    item.querySelector('.exercise-item-name').addEventListener('click', () => openTraining(ex.id));
  }
  item.querySelector('.exercise-item-dots').addEventListener('click', e => {
    e.stopPropagation();
    showOverflowMenu([
      { label: 'Bewerken', action: () => openEditExerciseScreen(ex) },
      { label: 'Verwijderen', action: () => openDeleteExerciseConfirm(ex), danger: true },
      {
        label: isFav ? 'Uit favorieten' : 'Favoriet maken',
        action: () => { toggleFavoriteExercise(ex.id); refreshExerciseList(); }
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
// a decimal comma (Dutch keyboard) counts as a point; weight keeps at most 2 decimals
// (machines in 1,25 kg steps give 93,75 kg), RPE at most 1, reps and extra reps are
// whole numbers (more is rounded). Shown with a decimal comma and without superfluous
// zeros (150, not 150,00).
function parseDecimal(str) { return parseFloat(String(str).replace(',', '.')) || 0; }
// The ONE rounding function for decimals in the app (formatNumber, roundWeight, round1, roundOrm):
// half away from zero. toPrecision(12) first strips floating-point noise, so a computed exact half
// like 118,75 (3800 / 32, computed as 118,7499999…) rounds up as it should; the decimal point is
// then shifted in the string form ("118.75e1"), because multiplying (1,005 × 100 = 100,4999…)
// would bring the noise back.
function roundTo(n, decimals) {
  const v = Number(n) || 0;
  const clean = Number(Math.abs(v).toPrecision(12));
  if (clean < 1e-6) return 0; // String() would switch to exponent notation below this
  const r = Number(Math.round(Number(`${clean}e${decimals}`)) + `e-${decimals}`);
  return r === 0 ? 0 : (v < 0 ? -r : r);
}
function round1(v) { return roundTo(v, 1); }
const WEIGHT_DECIMALS = 2, MAX_DECIMALS = 1;
function roundWeight(v) { return roundTo(v, WEIGHT_DECIMALS); }
function parseWeight(str) { return Math.max(0, roundWeight(parseDecimal(str))); }
// The ONE display format for numbers anywhere in the app: decimal comma, no thousands
// separator, rounded half away from zero (not truncated), no trailing zeros ("132,5", "150").
// At most 1 decimal (RPE, percentages, ...), or 2 for a weight — `weight`, used through
// formatWeight() for every weight in the app (sets, records, graph, Samenvatting, calculators,
// plates: "93,75", "0,25").
// Display only: stored data stays plain numbers, input accepts comma and point.
function formatNumber(n, { weight = false } = {}) {
  return String(roundTo(n, weight ? WEIGHT_DECIMALS : MAX_DECIMALS)).replace('.', ',');
}
function formatWeight(v) { return formatNumber(v, { weight: true }); }
// A weight as value + unit: the number on Groot getal, "kg" apart on Klein (same
// classes as the set rows), wherever a weight is shown as a value.
function weightValueHtml(w) {
  return `<span class="set-val">${formatWeight(parseDecimal(w))}</span><span class="set-unit">kg</span>`;
}
function parseWholeNumber(str) { return Math.max(0, Math.round(parseDecimal(str))); }

// RPE: 0 = not filled in; otherwise 6..10 in steps of 0.5. Whole numbers show
// without a decimal ("8"), halves with one ("8,5").
const RPE_MIN = 6, RPE_MAX = 10, RPE_STEP = 0.5;
function parseRpe(str) { return round1(parseDecimal(str)); }
function isValidRpe(v) { return v === 0 || (v >= RPE_MIN && v <= RPE_MAX && (v / RPE_STEP) % 1 === 0); }
function formatRpe(v) { return formatNumber(v); }
// Stepper: 0 -> 6 on +, 6 -> 0 on -, +/-0.5 in between (max 10).
function stepRpe(current, dir) {
  const v = parseRpe(current);
  if (dir === '+') return v < RPE_MIN ? RPE_MIN : Math.min(RPE_MAX, Math.round((v + RPE_STEP) / RPE_STEP) * RPE_STEP);
  return v <= RPE_MIN ? 0 : Math.round((v - RPE_STEP) / RPE_STEP) * RPE_STEP;
}
function setRpeField(v) { document.getElementById('field-rpe').value = v ? formatRpe(v) : 0; }
// Extra reps (partials / forced) on top of the set, 0 = not applicable. Only
// possible at RPE 10: extra reps > 0 sets RPE to 10 (a real, editable value),
// and lowering RPE below 10 again clears the extra reps. At most 9: the set rows' 56px
// effort column is built for one digit ("+9 partial"). Typing, pasting and + all stop at 9
// (FIELD_MAX); an existing set with a higher value stays stored as it is.
const EXTRA_MAX = 9;
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
function setRowInnerHtml(sets, i, { comment = 'note', commentLabel = 'Notitie bij set', isPR = false } = {}) {
  const s = sets[i];
  const hasNote = comment !== 'none' && !!(s.note && s.note.trim());
  const showIcon = comment === 'always' || hasNote;
  return `
      <span class="set-comment${hasNote ? ' has-note' : ''}"${comment === 'none' ? '' : ` aria-label="${commentLabel}"`}>${showIcon ? COMMENT_ICON_SVG : ''}</span>
      <span class="set-pr">${isPR ? prTrophySvg('set-pr-icon') : isDropChild(sets, i) ? DROP_ARROW_SVG : ''}</span>
      <span class="set-num">${i + 1}</span>
      <span class="set-weight">${weightValueHtml(s.weight)}</span>
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
// The Dropset button only makes sense when there is a previous set to attach to: a new
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
// "+N partial" / "+N forced", or '' without extra reps — shared by the set rows and the Recap.
function extraRepsText(s) {
  const extra = parseInt(s.extra) || 0;
  return extra > 0 ? `+${extra} ${s.extraType === 'forced' ? 'forced' : 'partial'}` : '';
}
function effortCellHtml(s) {
  const rpe = parseFloat(s.rpe) || 0;
  const extra = extraRepsText(s);
  const rpeText = rpe > 0 ? `<span class="set-rpe">RPE ${formatRpe(rpe)}</span>` : '';
  const extraLine = extra ? `<span class="set-effort-extra">${extra}</span>` : '';
  return `<span class="set-effort">${rpeText || extraLine ? rpeText + extraLine : '<span class="set-effort-none">—</span>'}</span>`;
}

function openTraining(exId) {
  currentExerciseId = exId;
  currentTimeRange = 'all'; // Graph tab period starts on "all" every time an exercise is opened
  syncTimeFilterButtons();
  selectedSetIndex = null;
  document.getElementById('training-title').textContent = exerciseName(exId);
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
  saveBtn.textContent = isEditing ? 'Bijwerken' : 'Opslaan';
  clearBtn.textContent = isEditing ? 'Verwijderen' : 'Wissen';
  clearBtn.classList.toggle('btn-delete-mode', isEditing);
}

function renderSetList() {
  const list = document.getElementById('set-list');
  const ex = getCurrentExerciseData();
  const sets = ex ? ex.sets : [];
  updateActionButtonsUI();
  updateDropsetToggle();

  if (sets.length === 0) {
    list.innerHTML = `<div class="set-list-empty">Nog geen sets</div>`;
    return;
  }

  const firstPRKeys = getPRSetKeys(currentExerciseId);
  list.innerHTML = '';

  sets.forEach((s, i) => {
    const isPR = firstPRKeys.has(currentDate + '#' + i);
    const isSelected = selectedSetIndex === i;
    const row = document.createElement('div');
    row.className = setRowClass(sets, i) + (isSelected ? ' selected' : '');
    row.dataset.setIdx = i;
    row.innerHTML = setRowInnerHtml(sets, i, { comment: 'always', commentLabel: 'Notitie', isPR });
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
  document.getElementById('btn-set-note-clear').classList.toggle('hidden', !setNoteBaseline.trim());
  openOverlay('set-note-overlay');
}

// Opslaan needs text ("Vul een notitie in"); Wissen (only for a saved note) clears it at once.
function saveSetNote({ clear = false } = {}) {
  if (noteEditIndex === null) return;
  const note = clear ? '' : document.getElementById('set-note-input').value.trim();
  if (!clear && !note) { toast('Vul een notitie in', { type: 'error' }); return; }
  const workout = getWorkout(currentDate);
  const ex = workout.find(e => e.exerciseId === currentExerciseId);
  if (!ex || !ex.sets[noteEditIndex]) { closeOverlay('set-note-overlay'); return; }
  if (note) ex.sets[noteEditIndex].note = note;
  else delete ex.sets[noteEditIndex].note;
  setWorkout(currentDate, workout);
  noteEditIndex = null;
  closeOverlay('set-note-overlay');
  renderSetList();
  toast(note ? 'Notitie opgeslagen' : 'Notitie gewist');
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
function recordsRepLabel(n) { return n === 1 ? 'One rep max' : n + 'RM'; }

// Every valid set (>= 1 rep, > 0 kg, not a dropset) of an exercise in workout-date
// order: by day, then by position within the day.
function getExerciseValidSets(exId) {
  const out = [];
  Object.keys(db.workouts).sort().forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.exerciseId === exId);
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
function getRepProgressions(exId, maxReps) {
  const days = [];
  let cur = null, top = maxReps;
  getExerciseValidSets(exId).forEach(s => {
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
function getRepLeaders(exId, maxReps) {
  const steps = getRepProgressions(exId, maxReps);
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
      <span class="records-row-weight">${weightValueHtml(weight)}</span>
      <span class="records-row-date">${formatDateStr(date)}${direct ? '' : `<span class="records-row-via"> \u00b7 via ${recordsRepLabel(sourceReps)}</span>`}</span>
    </div>`;
}
function openRecordsHistory(reps) {
  const steps = getRepProgressions(currentExerciseId, getExerciseMaxReps(currentExerciseId))[reps] || [];
  if (steps.length === 0) return;
  recordsHistoryReps = reps;
  const cur = steps[steps.length - 1];
  const previous = steps.slice(0, -1).reverse(); // everything BEFORE the current record, newest first
  document.getElementById('records-history-title').textContent = recordsRepLabel(reps) + '-geschiedenis';
  document.getElementById('records-history-body').innerHTML = `
    <div class="section-label">Huidig record</div>
    ${recordsStepRowHtml(cur.weight, cur.date, cur.sourceReps, cur.direct)}
    <div class="section-label">Eerdere ${recordsRepLabel(reps)}-records</div>
    ${previous.length ? previous.map(st => recordsStepRowHtml(st.weight, st.date, st.sourceReps, st.direct)).join('') : '<div class="records-empty">Geen eerdere records</div>'}`;
  openOverlay('records-history-overlay');
}

// Right-hand side of a record row/block: weight + workout date; a direct record
// (set with exactly this rep count) also gets the trophy, a derived one gets
// "via MRM" behind the date and no trophy; or "Geen gegevens". The gold One rep max card
// leaves the weekday out (`noWeekday`), so date + "via" stay on one line.
function recordsValueHtml(rec, noWeekday = false) {
  if (!rec) return `<span class="records-row-nodata">Geen gegevens</span>`;
  return `<span class="records-row-value">
        <span class="records-row-weight">${rec.direct ? prTrophySvg() : ''}${weightValueHtml(rec.weight)}</span>
        <span class="records-row-date">${formatDateStr(rec.date, noWeekday ? 'noWeekday' : 'full')}${rec.direct ? '' : `<span class="records-row-via"> \u00b7 via ${recordsRepLabel(rec.viaReps)}</span>`}</span>
      </span>`;
}
const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5z"/></svg>';

function openExerciseRecords() {
  document.getElementById('records-title').textContent = exerciseName(currentExerciseId);
  const maxReps = getExerciseMaxReps(currentExerciseId);
  const leaders = getRepLeaders(currentExerciseId, maxReps);
  // One Rep Max: its own block on top (same rule as a normal row); the list below starts at 2RM.
  const oneRm = leaders[1];
  const hero = document.getElementById('records-hero');
  hero.className = 'records-hero' + (oneRm ? ' records-hero-clickable' : '');
  if (oneRm) hero.dataset.reps = '1'; else delete hero.dataset.reps;
  hero.innerHTML = `<span class="records-hero-label">${CROWN_SVG}One rep max</span>${recordsValueHtml(oneRm, true)}`;
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
// Exercise-own data, keyed by exercise id (same join key as favorites/
// hiddenBuiltins) — not tied to any session/set, so it's stored and loaded
// independently of db.workouts.
// Muscle groups come from the fixed MUSCLE_GROUPS list in exercises.js and are stored by id:
// primaryMuscleGroup (one id, or absent) and secondaryMuscleGroups (a list of ids, or absent).
function muscleGroupName(id) {
  const m = MUSCLE_GROUPS.find(m => m.id === id);
  return m ? m.name : '';
}
// Known ids only, in list order (the order Secundair is shown in).
function sortMuscleGroupIds(ids) { return MUSCLE_GROUPS.map(m => m.id).filter(id => ids.includes(id)); }
// Picker options grouped per category, a header above each group (category order; Cardio has
// no muscle groups, so no header).
function muscleGroupPickerOptions() {
  const out = [];
  EXERCISE_CATEGORIES.forEach(c => {
    const groups = MUSCLE_GROUPS.filter(m => m.category === c.id);
    if (groups.length === 0) return;
    out.push({ header: categoryName(c.id) || c.name });
    groups.forEach(m => out.push({ value: m.id, label: m.name }));
  });
  return out;
}

// Every equipment dropdown shares the same "Not set" first option, both so
// it's the natural default for a new/empty exercise and so a dropdown opened
// by accident can be closed by picking it, without a separate reset control.
function equipmentRangeOptions(start, end, step) {
  const opts = [{ value: '', label: 'Niet ingesteld' }];
  const count = Math.round((end - start) / step);
  for (let i = 0; i <= count; i++) {
    const v = Math.round((start + i * step) * 100) / 100;
    opts.push({ value: String(v), label: String(v) });
  }
  return opts;
}
const BENCH_SETTING_OLD_OPTIONS = [
  { value: '', label: 'Niet ingesteld' },
  ...[0, 15, 30, 45, 60, 90].map(v => ({ value: String(v), label: v + '°' })),
];
const BENCH_SETTING_NEW_OPTIONS = [
  { value: '', label: 'Niet ingesteld' },
  ...[0, 1, 2, 3, 4, 5, 6].map(v => ({ value: String(v), label: String(v) })),
];
const BENCH_HEIGHT_OPTIONS = equipmentRangeOptions(1, 9, 0.5);
const CABLE_HEIGHT_OLD_OPTIONS = equipmentRangeOptions(1, 12, 1);
const CABLE_HEIGHT_NEW_OPTIONS = equipmentRangeOptions(1, 14, 1);
const SQUAT_RACK_HEIGHT_OPTIONS = equipmentRangeOptions(1, 10, 1);
const SAFETY_BAR_OPTIONS = equipmentRangeOptions(1, 10, 1);

// `kind: 'picker'` fields open the shared field-picker overlay (see
// wireExerciseInfoFormPickers below); `'toggle'` is a Ja/Nee on/off button
// (getInfoToggle/setInfoToggle) and `'text'` reads/writes its input directly.
// View mode pairs the picker/toggle fields up
// (EXERCISE_INFO_EQUIPMENT_PAIRS) the same way Muscle group pairs
// Primary/Secondary, and only renders whichever half of a pair is filled;
// the free-text fields stay full-width rows like before.
// The same field set is rendered twice — in the Exercise Info overlay
// (prefix 'info') and in the New/Edit Exercise screen (prefix 'new-ex-info')
// — so an element id is `<prefix>-<idSuffix>` (see EXERCISE_INFO_FORMS).
const EXERCISE_INFO_EQUIPMENT_FIELDS = [
  { key: 'benchSettingOld', label: 'Bankstand (oud)', idSuffix: 'bench-setting-old', kind: 'picker', options: BENCH_SETTING_OLD_OPTIONS },
  { key: 'benchSettingNew', label: 'Bankstand (nieuw)', idSuffix: 'bench-setting-new', kind: 'picker', options: BENCH_SETTING_NEW_OPTIONS },
  { key: 'benchHeight', label: 'Bankhoogte', idSuffix: 'bench-height', kind: 'picker', options: BENCH_HEIGHT_OPTIONS },
  { key: 'powerliftBench', label: 'Powerliftbank', idSuffix: 'powerlift-bench', kind: 'toggle' },
  { key: 'cableHeightOld', label: 'Kabelhoogte (oud)', idSuffix: 'cable-height-old', kind: 'picker', options: CABLE_HEIGHT_OLD_OPTIONS },
  { key: 'cableHeightNew', label: 'Kabelhoogte (nieuw)', idSuffix: 'cable-height-new', kind: 'picker', options: CABLE_HEIGHT_NEW_OPTIONS },
  { key: 'squatRackHeight', label: 'Hoogte squatrek', idSuffix: 'squat-rack-height', kind: 'picker', options: SQUAT_RACK_HEIGHT_OPTIONS },
  { key: 'safetyBar', label: 'Valbeugels', idSuffix: 'safety-bar', kind: 'picker', options: SAFETY_BAR_OPTIONS },
  { key: 'handPosition', label: 'Handpositie', idSuffix: 'hand-position', kind: 'text' },
  { key: 'footPosition', label: 'Voetpositie', idSuffix: 'foot-position', kind: 'text' },
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

// A label with an addition in brackets ("Bankstand (oud)"): the addition goes in .label-unit —
// same size and colour as the label, but 400 and lowercase (see DESIGN_SYSTEM.md).
function labelHtml(label) {
  return label.replace(/\s*(\([^)]*\))$/, ' <span class="label-unit">$1</span>');
}

function equipmentFieldIsFilled(f, info) {
  if (f.kind === 'toggle') return !!info[f.key];
  const v = info[f.key];
  return v !== undefined && v !== null && v !== '';
}
function equipmentFieldViewValue(f, info) {
  if (f.kind === 'toggle') return 'Ja';
  if (f.kind === 'picker') {
    const opt = f.options.find(o => o.value === String(info[f.key]));
    return opt ? opt.label : String(info[f.key]);
  }
  return info[f.key];
}

function renderExerciseInfoView() {
  const info = getExerciseInfo(currentExerciseId) || {};
  document.getElementById('exercise-info-view-title').textContent = 'Info ' + exerciseName(currentExerciseId);
  const sections = [];
  // Spiergroep is always shown; nothing chosen = "Niet ingesteld" in the empty-field style.
  // Secundair lists each chosen group on its own line, in list order.
  const primary = muscleGroupName(info.primaryMuscleGroup);
  const secondary = sortMuscleGroupIds(info.secondaryMuscleGroups || []).map(muscleGroupName);
  const notSet = '<span class="info-view-stat-value info-view-stat-empty">Niet ingesteld</span>';
  const value = v => `<span class="info-view-stat-value">${v}</span>`;
  sections.push(`<div class="section-label section-head">Spiergroep</div><div class="info-two-col">
      <div class="info-view-stat"><span class="section-label">Primair</span>${primary ? value(primary) : notSet}</div>
      <div class="info-view-stat"><span class="section-label">Secundair</span>${secondary.length ? secondary.map(value).join('') : notSet}</div>
    </div>`);
  let equipHtml = '';
  EXERCISE_INFO_EQUIPMENT_PAIRS.forEach(pair => {
    const cells = pair
      .map(key => EXERCISE_INFO_FIELDS_BY_KEY[key])
      .filter(f => equipmentFieldIsFilled(f, info))
      .map(f => `<div class="info-view-stat"><span class="section-label">${labelHtml(f.label)}</span><span class="info-view-stat-value">${equipmentFieldViewValue(f, info)}</span></div>`);
    if (cells.length > 0) equipHtml += `<div class="info-two-col">${cells.join('')}</div>`;
  });
  EXERCISE_INFO_FULLWIDTH_KEYS.forEach(key => {
    const f = EXERCISE_INFO_FIELDS_BY_KEY[key];
    if (!equipmentFieldIsFilled(f, info)) return;
    equipHtml += `<div class="info-view-stat"><span class="section-label">${labelHtml(f.label)}</span><span class="info-view-stat-value">${equipmentFieldViewValue(f, info)}</span></div>`;
  });
  if (equipHtml) sections.push('<div class="section-label section-head">Apparatuur</div>' + equipHtml);
  document.getElementById('exercise-info-view-content').innerHTML = sections.join('');
  document.getElementById('exercise-info-view-mode').classList.remove('hidden');
  document.getElementById('exercise-info-edit-mode').classList.add('hidden');
}

// Primair: one group or "Niet ingesteld" (single-choice picker, "Niet ingesteld" on top).
// Secundair: any number of groups (multiple-choice picker, no "Niet ingesteld": nothing ticked =
// empty). Its field button holds the ids comma-separated; the label lists the names.
function setPrimaryMuscleField(id, value) {
  const name = muscleGroupName(value);
  setFieldBtnValue(id, name ? value : '', name || 'Niet ingesteld');
}
function getSecondaryMuscleField(id) {
  const v = getFieldBtnValue(id);
  return v ? v.split(',') : [];
}
function setSecondaryMuscleField(id, ids) {
  const sorted = sortMuscleGroupIds(ids || []);
  setFieldBtnValue(id, sorted.join(','), sorted.length ? sorted.map(muscleGroupName).join(', ') : 'Niet ingesteld');
}

// The muscle-group/equipment fields live in two places — the Exercise Info
// overlay and the New/Edit Exercise screen — and both are built, wired,
// populated and read by the same generic functions below, parameterised by one
// of these forms (element ids are `<prefix>-<field>`).
const EXERCISE_INFO_FORMS = {
  overlay: { prefix: 'info' },
  newEx: { prefix: 'new-ex-info' },
};

function renderExerciseInfoFormFields(form) {
  const p = form.prefix;
  const pickerBtn = id => `<button type="button" class="new-ex-select new-ex-select-btn" id="${id}"></button>`;
  const field = (id, label, control) => `<div class="info-field"><label class="section-label" for="${id}">${labelHtml(label)}</label>${control}</div>`;
  const equipmentField = key => {
    const f = EXERCISE_INFO_FIELDS_BY_KEY[key];
    const id = `${p}-${f.idSuffix}`;
    let control;
    if (f.kind === 'picker') control = pickerBtn(id);
    // Same look as Partial/Forced (.extra-type-btn), but its own element: the Partial/Forced
    // logic only ever looks inside #extra-type, so it never touches this button.
    else if (f.kind === 'toggle') control = `<div class="info-toggle"><button type="button" class="extra-type-btn" id="${id}" aria-pressed="false">Nee</button></div>`;
    // Chrome keys its "previously entered values" suggestion list by the
    // field's name (falling back to id), so autocomplete="off" alone doesn't
    // suppress it. A fresh random name on every load means it never finds a
    // history match — same trick as the weight/reps fields. The app itself
    // only ever looks the field up by id, never by name.
    else control = `<input type="text" id="${id}" name="${id}-${Math.random().toString(36).slice(2)}" class="new-ex-input" placeholder="Leeg laten om te verbergen" autocomplete="off"/>`;
    return field(id, f.label, control);
  };
  document.getElementById(`${p}-muscle-fields`).innerHTML =
    field(`${p}-primary-muscle`, 'Primair', pickerBtn(`${p}-primary-muscle`)) +
    field(`${p}-secondary-muscle`, 'Secundair', pickerBtn(`${p}-secondary-muscle`));
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
        setFieldBtnValue(id, value, opt ? opt.label : 'Niet ingesteld');
      });
    });
  };
  EXERCISE_INFO_EQUIPMENT_FIELDS.filter(f => f.kind === 'toggle').forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    document.getElementById(id).addEventListener('click', () => setInfoToggle(id, !getInfoToggle(id)));
  });
  const primaryId = `${p}-primary-muscle`, secondaryId = `${p}-secondary-muscle`;
  document.getElementById(primaryId).addEventListener('click', () => {
    openFieldPicker('Primair', [{ value: '', label: 'Niet ingesteld' }, ...muscleGroupPickerOptions()], getFieldBtnValue(primaryId), value => {
      setPrimaryMuscleField(primaryId, value);
      // A group is never both: choosing it as primary takes it out of Secundair.
      setSecondaryMuscleField(secondaryId, getSecondaryMuscleField(secondaryId).filter(id => id !== value));
    });
  });
  document.getElementById(secondaryId).addEventListener('click', () => {
    const primary = getFieldBtnValue(primaryId);
    openFieldPickerMulti('Secundair', muscleGroupPickerOptions(), getSecondaryMuscleField(secondaryId),
      primary ? { [primary]: 'Primair' } : {}, ids => setSecondaryMuscleField(secondaryId, ids));
  });
  EXERCISE_INFO_EQUIPMENT_FIELDS.filter(f => f.kind === 'picker').forEach(f => wire(`${p}-${f.idSuffix}`, f.label, f.options));
}

// Ja/Nee on/off button (Powerliftbank): on = .active (--primary filled) with "Ja", off = "Nee".
function getInfoToggle(id) { return document.getElementById(id).classList.contains('active'); }
function setInfoToggle(id, on) {
  const b = document.getElementById(id);
  b.classList.toggle('active', !!on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.textContent = on ? 'Ja' : 'Nee';
}

function setExerciseInfoPicker(id, options, val) {
  const strVal = (val !== undefined && val !== null) ? String(val) : '';
  const opt = options.find(o => o.value === strVal) || options[0];
  setFieldBtnValue(id, opt.value, opt.label);
}

// Fills every field of a form from an exercise's stored info ({} = nothing set).
function populateExerciseInfoForm(form, info) {
  const p = form.prefix;
  setPrimaryMuscleField(`${p}-primary-muscle`, info.primaryMuscleGroup);
  setSecondaryMuscleField(`${p}-secondary-muscle`, info.secondaryMuscleGroups);
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    const val = info[f.key];
    if (f.kind === 'toggle') setInfoToggle(id, !!val);
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
    primaryMuscleGroup: getFieldBtnValue(`${p}-primary-muscle`),
    secondaryMuscleGroups: getFieldBtnValue(`${p}-secondary-muscle`),
  };
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    if (f.kind === 'toggle') snapshot[f.key] = getInfoToggle(id);
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
  const secondary = getSecondaryMuscleField(`${p}-secondary-muscle`);
  if (primary) info.primaryMuscleGroup = primary;
  if (secondary.length) info.secondaryMuscleGroups = secondary;
  EXERCISE_INFO_EQUIPMENT_FIELDS.forEach(f => {
    const id = `${p}-${f.idSuffix}`;
    if (f.kind === 'toggle') {
      if (getInfoToggle(id)) info[f.key] = true;
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
  const info = getExerciseInfo(currentExerciseId) || {};
  document.getElementById('exercise-info-edit-title').textContent = 'Info ' + exerciseName(currentExerciseId);
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.overlay, info);
  document.getElementById('exercise-info-edit-mode').classList.remove('hidden');
  document.getElementById('exercise-info-view-mode').classList.add('hidden');
  exerciseInfoEditBaseline = getExerciseInfoFormSnapshot(EXERCISE_INFO_FORMS.overlay);
}

function openExerciseInfo() {
  renderExerciseInfoView();
  openOverlay('exercise-info-overlay');
}

// Exercise-info fields that are set elsewhere than Oefeninginfo's form (no field there).
// trackStrength: "Kracht volgen" for Inzicht, true = ja; absent = nee (the default).
const EXERCISE_INFO_NON_FORM_KEYS = ['trackStrength'];
function isStrengthTracked(id) { return !!(getExerciseInfo(id) || {}).trackStrength; }
function setStrengthTracked(id, on) {
  if (!db.exerciseInfo) db.exerciseInfo = {};
  const info = { ...(db.exerciseInfo[id] || {}) };
  if (!!info.trackStrength === !!on) return;
  if (on) info.trackStrength = true; else delete info.trackStrength;
  if (Object.keys(info).length === 0) delete db.exerciseInfo[id];
  else db.exerciseInfo[id] = info;
  persistExerciseInfo();
}

// Stores (or, when empty, removes) one exercise's info. Skips the Firestore
// write when nothing actually changed.
function setExerciseInfoFor(id, info) {
  if (!db.exerciseInfo) db.exerciseInfo = {};
  // Fields the form doesn't show are kept as they are.
  EXERCISE_INFO_NON_FORM_KEYS.forEach(k => {
    const prev = (db.exerciseInfo[id] || {})[k];
    if (prev !== undefined && !(k in info)) info = { ...info, [k]: prev };
  });
  const unchanged = JSON.stringify(db.exerciseInfo[id] || {}) === JSON.stringify(info);
  if (Object.keys(info).length === 0) delete db.exerciseInfo[id];
  else db.exerciseInfo[id] = info;
  if (!unchanged) persistExerciseInfo();
}

function saveExerciseInfo() {
  setExerciseInfoFor(currentExerciseId, readExerciseInfoForm(EXERCISE_INFO_FORMS.overlay));
  renderExerciseInfoView();
  toast('Info opgeslagen');
}

function saveSet() {
  const weight = parseWeight(document.getElementById('field-weight').value);
  const reps = parseWholeNumber(document.getElementById('field-reps').value);
  if (reps < 1) { toast('Vul reps in', { type: 'error' }); return; }
  reconcileExtraWithRpe(); // a typed RPE below 10 whose change event hasn't fired yet
  const rpe = parseRpe(document.getElementById('field-rpe').value);
  if (!isValidRpe(rpe)) { toast('RPE: 6 tot 10, in stappen van 0,5', { type: 'error' }); return; }
  const extra = getExtraReps();
  const extraType = extra > 0 ? (getExtraType() || 'partial') : '';

  const workout = getWorkout(currentDate);
  let ex = workout.find(e => e.exerciseId === currentExerciseId);
  if (!ex) { ex = { exerciseId: currentExerciseId, sets: [] }; workout.push(ex); }

  // Link to the previous set only when there is one (new set: any saved set today; edited set: not the first).
  const dropset = getDropsetField() && (selectedSetIndex !== null ? selectedSetIndex > 0 : ex.sets.length > 0);
  let savedMsg, savedIdx;
  if (selectedSetIndex !== null) {
    const existingNote = ex.sets[selectedSetIndex] && ex.sets[selectedSetIndex].note;
    ex.sets[selectedSetIndex] = { weight, reps, ...(rpe > 0 && { rpe }), ...(extra > 0 && { extra, extraType }), ...(dropset && { isDropsetContinuation: true }), ...(existingNote && { note: existingNote }) };
    savedIdx = selectedSetIndex;
    selectedSetIndex = null;
    savedMsg = 'Set bijgewerkt';
  } else {
    ex.sets.push({ weight, reps, ...(rpe > 0 && { rpe }), ...(extra > 0 && { extra, extraType }), ...(dropset && { isDropsetContinuation: true }) });
    savedIdx = ex.sets.length - 1;
    savedMsg = 'Set opgeslagen';
  }

  setWorkout(currentDate, workout);
  // A PR replaces the plain confirmation entirely (two consecutive toast()
  // calls would just overwrite each other anyway).
  const isPR = getPRSetKeys(currentExerciseId).has(currentDate + '#' + savedIdx);
  if (isPR) toast('\u{1F3C6} Nieuw PR! \u{1F3C6}', { type: 'pr' });
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
  const ex = workout.find(e => e.exerciseId === currentExerciseId);
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
// show a separator anyway): every decimal field in the app takes digits plus ONE decimal
// separator (comma or point) — weights (TRACK, Plate/1RM/Warm-up Calculator, body weight in Inzicht) with at most
// 2 digits after it, RPE with at most 1; counts (TRACK reps and extra reps, 1RM reps)
// take digits only. A rejected keystroke simply doesn't appear; the caret stays where it was.
const FIELD_DECIMALS = {
  'field-weight': WEIGHT_DECIMALS, 'field-rpe': 1, 'field-reps': 0, 'field-extra': 0,
  'plate-target-weight': WEIGHT_DECIMALS, 'orm-weight': WEIGHT_DECIMALS, 'orm-reps': 0, 'warmup-weight': WEIGHT_DECIMALS,
  'insight-weight-input': WEIGHT_DECIMALS,
};
// Upper limits on top of FIELD_DECIMALS: a typed digit that would exceed it is rejected,
// a pasted value is clamped to it.
const FIELD_MAX = { 'field-extra': EXTRA_MAX };
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
  const max = FIELD_MAX[id];
  if (max !== undefined) input.addEventListener('input', e => {
    if (parseWholeNumber(input.value) <= max) return;
    if (e.inputType === 'insertText' && before && parseWholeNumber(before.value) <= max) {
      input.value = before.value;
      input.setSelectionRange(before.start, before.end);
    } else {
      input.value = String(max);
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
    .filter(d => db.workouts[d] && db.workouts[d].some(e => e.exerciseId === currentExerciseId && e.sets && e.sets.length > 0))
    .slice(0, 20);

  if (relevantDates.length === 0) {
    container.innerHTML = '<div class="plan-list-empty">Nog geen geschiedenis</div>';
    return;
  }

  const firstPRKeys = getPRSetKeys(currentExerciseId);

  relevantDates.forEach(date => {
    const exIdx = db.workouts[date].findIndex(e => e.exerciseId === currentExerciseId);
    const ex = db.workouts[date][exIdx];
    if (!ex || !ex.sets.length) return;

    // One card per date, built like the day overview's exercise card: the date
    // sits where the exercise name sits there, above the same accent line.
    const card = document.createElement('div');
    card.className = 'history-card';
    const header = document.createElement('div');
    header.className = 'history-card-header clickable';
    header.innerHTML = `<div class="section-label">${formatDateStr(date)}</div>`;
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
  openHistoryGoto(formatDateStr(dateStr), () => {
    currentDate = dateStr;
    showScreen('screen-fitness-tracker');
  });
}

// Same popup as above, plus that day's sets of the current exercise with the
// set(s) matching `markReps`/`markVal` highlighted — used by the Graph tab and
// the record-history popup. `underOverlayId`: an overlay that is open beneath
// this popup and must go away together with it on "Go To" (see confirm handler).
function openHistoryGotoDaySets(dateStr, markReps, markVal, underOverlayId) {
  const ex = (db.workouts[dateStr] || []).find(e => e.exerciseId === currentExerciseId);
  const body = document.createElement('div');
  body.className = 'cal-detail-ex';
  const nameEl = document.createElement('div');
  nameEl.className = 'cal-detail-ex-name';
  nameEl.textContent = exerciseName(currentExerciseId);
  body.appendChild(nameEl);
  const sets = (ex && ex.sets) || [];
  sets.forEach((s, i) => {
    const isMarked = countsForRecords(sets, i) && parseInt(s.reps) === markReps && (parseFloat(s.weight) || 0) === markVal;
    const row = document.createElement('div');
    row.className = setRowClass(sets, i) + (isMarked ? ' graph-goto-set-point' : '');
    row.innerHTML = setRowInnerHtml(sets, i, { comment: 'none' });
    body.appendChild(row);
  });
  openHistoryGoto(formatDateStr(dateStr), () => {
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

function graphRepsLabel(n) { return n === 1 ? 'One rep max' : String(n); }

// Per rep count: in how many sessions (dates) it was logged; plus the highest rep count ever.
// Dropsets don't count (countsForRecords), like everywhere records/progression are derived.
function getExerciseRepStats(exId) {
  const sessions = {};
  let highest = 0;
  Object.keys(db.workouts).forEach(date => {
    const ex = (db.workouts[date] || []).find(e => e.exerciseId === exId);
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
  const chosen = graphRepsByExercise[currentExerciseId];
  if (chosen && chosen <= maxReps) return chosen;
  let best = 1, bestCount = 0;
  Object.keys(stats.sessions).map(Number).sort((a, b) => a - b).forEach(r => {
    if (stats.sessions[r] > bestCount) { best = r; bestCount = stats.sessions[r]; }
  });
  return best;
}

// Top of the rep range shown for an exercise (Graph dropdown, Records overlay):
// 1..12, or the highest rep count ever logged for it if that is more.
function getExerciseMaxReps(exId) {
  return Math.max(GRAPH_MIN_MAX_REPS, getExerciseRepStats(exId).highest);
}

function graphRepOptions(maxReps) {
  return Array.from({ length: maxReps }, (_, i) => ({ value: String(i + 1), label: graphRepsLabel(i + 1) }));
}

document.getElementById('graph-reps').addEventListener('click', () => {
  const maxReps = getExerciseMaxReps(currentExerciseId);
  openFieldPicker('Reps', graphRepOptions(maxReps), getFieldBtnValue('graph-reps'), value => {
    graphRepsByExercise[currentExerciseId] = parseInt(value);
    renderGraph();
  });
});

// currentTimeRange is the single source of truth for the period selector: the
// highlighted button is always re-derived from it (syncTimeFilterButtons, run
// on every render), so what is highlighted can never differ from what is
// applied. Default is 'all', matching the button marked active in index.html.
document.querySelectorAll('.graph-time-filters .time-filter').forEach(t => {
  t.addEventListener('click', () => {
    currentTimeRange = t.dataset.range;
    renderGraph();
  });
});

function syncTimeFilterButtons() {
  document.querySelectorAll('.graph-time-filters .time-filter').forEach(b => b.classList.toggle('active', b.dataset.range === currentTimeRange));
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
function getGraphPoints(exId, reps, includeDerived) {
  const points = getExerciseRepSeries(exId, reps).map(p => ({ date: p.date, val: p.val, reps, derived: false }));
  if (includeDerived) {
    (getRepProgressions(exId, getExerciseMaxReps(exId))[reps] || []).forEach(st => {
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
function getExerciseRepSeries(exId, reps) {
  if (!(reps >= 1)) return [];
  return Object.keys(db.workouts).sort().reduce((acc, date) => {
    const ex = db.workouts[date] && db.workouts[date].find(e => e.exerciseId === exId);
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

  const stats = getExerciseRepStats(currentExerciseId);
  const maxReps = getExerciseMaxReps(currentExerciseId);
  const reps = resolveGraphReps(stats, maxReps);
  // The narrow select shows the plain rep count ("1", not "One rep max"); the picker list keeps the labels.
  setFieldBtnValue('graph-reps', String(reps), String(reps));

  let data = getGraphPoints(currentExerciseId, reps, graphIncludeDerived);

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

const GRAPH_LABEL_GAP = 8; // px between the right edge of the y-axis labels and the chart area (--space-2)
// Y-axis for the plotted values: gridlines on round steps (1, 2, 2,5 or 5 × 10ⁿ), 4 to 6 of them,
// with the ends rounded outward to a multiple of the step. A point within 5% of either end gets
// one extra step on that side, so the highest/lowest point never sits on the outer line. All
// values equal (or one point): a range with that value in the middle (150 → 140 … 160).
// Never below 0 (weights). Returns { lo, hi, step, ticks }.
function graphYAxis(vals) {
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const clean = x => Math.round(x * 1e6) / 1e6; // keeps 0,25-steps exact (no 152.49999)
  const niceSteps = [];
  for (let e = -2; e <= 6; e++) [1, 2, 2.5, 5].forEach(m => niceSteps.push(clean(m * 10 ** e)));
  const build = (lo, hi, step) => {
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v = clean(v + step)) ticks.push(v);
    return { lo, hi: ticks[ticks.length - 1], step, ticks };
  };
  if (maxV === minV) {
    const step = niceSteps.find(s => s >= Math.max(1, Math.abs(minV) / 40));
    const below = clean(Math.floor(minV / step + 1e-9) * step), above = clean(Math.ceil(minV / step - 1e-9) * step);
    return build(Math.max(0, clean(below - 2 * step)), clean(above + 2 * step), step);
  }
  let best = null;
  niceSteps.forEach(step => {
    let lo = clean(Math.floor(minV / step + 1e-9) * step);
    let hi = clean(Math.ceil(maxV / step - 1e-9) * step);
    if (minV - lo < 0.05 * (hi - lo)) lo = clean(lo - step);
    if (hi - maxV < 0.05 * (hi - lo)) hi = clean(hi + step);
    lo = Math.max(0, lo);
    const lines = Math.round((hi - lo) / step) + 1;
    // Tightest range with 4–6 lines; on a tie the fewer (rounder) lines.
    if (lines >= 4 && lines <= 6 && (!best || hi - lo <= best.hi - best.lo)) best = { lo, hi, step };
  });
  return best ? build(best.lo, best.hi, best.step) : build(0, Math.max(1, maxV), Math.max(1, maxV));
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

  const axis = graphYAxis(data.map(d => d.val));
  const minV = axis.lo;
  const range = axis.hi - axis.lo;
  const pad = { top: 24, right: 20, bottom: 36, left: 48 };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Token hex (#rrggbb) → rgba() with the given alpha, for the area fill under the line.
  const hexAlpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const primary = tok('--primary');
  ctx.strokeStyle = tok('--border'); ctx.lineWidth = 1;
  // Gridlines on the round axis values; labels right-aligned, GRAPH_LABEL_GAP left of the chart area.
  axis.ticks.forEach(v => {
    const y = pad.top + gH - ((v - minV) / range) * gH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + gW, y); ctx.stroke();
    ctx.fillStyle = tok('--text-muted'); ctx.font = '11px Roboto'; ctx.textAlign = 'right';
    ctx.fillText(formatWeight(v), pad.left - GRAPH_LABEL_GAP, y + 4);
  });

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
  const dateLabel = d => formatDateStr(d.date, 'axis');
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
  // A derived point shows the REAL rep count of its source set, plus "Afgeleid van N reps".
  document.getElementById('graph-sel-main').innerHTML = `${weightValueHtml(pt.val)}<span class="set-unit">×</span><span class="set-val">${pt.reps}</span><span class="set-unit">rep${pt.reps === 1 ? '' : 's'}</span>`;
  const dateEl = document.getElementById('graph-sel-date');
  dateEl.textContent = formatDateStr(pt.date);
  if (pt.derived) {
    const via = document.createElement('span');
    via.className = 'graph-sel-via';
    via.textContent = 'Afgeleid van ' + pt.reps + ' reps';
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
// "Afgeleide sets": an on/off button in the Partial/Forced look (.extra-type-btn, on = .active).
// The Partial/Forced logic only looks inside #extra-type, so it never touches this button.
document.getElementById('graph-derived').addEventListener('click', e => {
  graphIncludeDerived = !graphIncludeDerived;
  e.currentTarget.classList.toggle('active', graphIncludeDerived);
  e.currentTarget.setAttribute('aria-pressed', String(graphIncludeDerived));
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

  const label = formatDateStr(`${year}-${String(month + 1).padStart(2, '0')}-01`, 'month');
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
  document.getElementById('cal-workout-count').textContent = `${n} ${n === 1 ? 'workout' : 'workouts'}`;
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
  document.getElementById('cal-detail-date').textContent = formatDateStr(dateStr);

  const body = document.getElementById('cal-detail-body');
  body.innerHTML = '';
  const exercises = (db.workouts[dateStr] || []).filter(ex => (ex.sets || []).length > 0);

  if (exercises.length === 0) {
    body.innerHTML = `<div class="records-empty">Er is voor deze dag geen workout opgeslagen.</div>`;
    openOverlay('cal-detail-overlay');
    return;
  }

  exercises.forEach(ex => {
    const firstPRKeys = getPRSetKeys(ex.exerciseId);
    const exEl = document.createElement('div');
    exEl.className = 'cal-detail-ex';

    const nameEl = document.createElement('div');
    nameEl.className = 'cal-detail-ex-name';
    nameEl.textContent = exerciseName(ex.exerciseId);
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

let pendingEditExerciseId = null;

// -- Custom field picker (replaces native <select>/picker for Category/Type) --
const EX_TYPE_OPTIONS = [
  { value: 'weight_reps', label: 'Gewicht en reps' },
  { value: 'reps_only', label: 'Alleen reps' },
  { value: 'duration', label: 'Duur' },
  { value: 'distance', label: 'Afstand' },
];

// An empty value ("Kies een categorie...", "Niet ingesteld") is the field's empty state: shown in
// the placeholder colour (.new-ex-select-empty), a real choice in the normal text colour.
function setFieldBtnValue(id, value, label) {
  const btn = document.getElementById(id);
  btn.dataset.value = value;
  btn.textContent = label;
  btn.classList.toggle('new-ex-select-empty', value === '');
}
function getFieldBtnValue(id) { return document.getElementById(id).dataset.value || ''; }

// Options are { value, label } rows; a { header } entry starts a group (a Label-style heading,
// e.g. the categories above the muscle groups). Single choice = radios, the tap picks and closes;
// multiple choice (openFieldPickerMulti) = checkboxes and a Klaar button.
let fieldPickerOnSelect = null;
let fieldPickerMulti = null; // { selected: Set, onChange } while a multiple-choice list is open
const FIELD_PICKER_RADIO = '<span class="field-picker-radio"><span class="field-picker-radio-dot"></span></span>';
const FIELD_PICKER_CHECK = '<span class="field-picker-check"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>';
// `disabled`: { value: note } — that row is grey, not tappable, with the note on the right.
function renderFieldPickerList(title, options, isSelected, mark, disabled = {}) {
  document.getElementById('field-picker-title').textContent = title;
  document.getElementById('field-picker-list').innerHTML = options.map(o => o.header !== undefined
    ? `<div class="section-label field-picker-group-label">${o.header}</div>`
    : `
    <div class="field-picker-row${isSelected(o.value) ? ' selected' : ''}${disabled[o.value] ? ' disabled' : ''}" data-value="${o.value}"${disabled[o.value] ? ' aria-disabled="true"' : ''}>
      ${mark}
      <span class="field-picker-label">${o.label}</span>
      ${disabled[o.value] ? `<span class="field-picker-note">${disabled[o.value]}</span>` : ''}
    </div>
  `).join('');
}
function openFieldPicker(title, options, selectedValue, onSelect) {
  renderFieldPickerList(title, options, v => v === selectedValue, FIELD_PICKER_RADIO);
  document.getElementById('field-picker-btns').classList.add('hidden');
  fieldPickerMulti = null;
  fieldPickerOnSelect = onSelect;
  openOverlay('field-picker-overlay');
}
// Every tick applies at once (onChange gets the new list of values), so closing with Klaar,
// back or a tap outside the sheet never loses anything.
function openFieldPickerMulti(title, options, selectedValues, disabled, onChange) {
  const selected = new Set(selectedValues);
  renderFieldPickerList(title, options, v => selected.has(v), FIELD_PICKER_CHECK, disabled);
  document.getElementById('field-picker-btns').classList.remove('hidden');
  fieldPickerOnSelect = null;
  fieldPickerMulti = { selected, onChange };
  openOverlay('field-picker-overlay');
}
document.getElementById('btn-field-picker-done').addEventListener('click', () => closeOverlay('field-picker-overlay'));
document.getElementById('field-picker-list').addEventListener('click', e => {
  const row = e.target.closest('.field-picker-row');
  if (!row || row.classList.contains('disabled')) return;
  if (fieldPickerMulti) {
    const { selected, onChange } = fieldPickerMulti;
    const v = row.dataset.value;
    if (selected.has(v)) selected.delete(v);
    else selected.add(v);
    row.classList.toggle('selected', selected.has(v));
    onChange([...selected]);
    return;
  }
  if (!fieldPickerOnSelect) return;
  const cb = fieldPickerOnSelect;
  fieldPickerOnSelect = null;
  closeOverlay('field-picker-overlay');
  cb(row.dataset.value);
});
// Value is the category id, label its (possibly renamed) name; same order as Alle oefeningen.
document.getElementById('new-ex-category').addEventListener('click', () => {
  openFieldPicker('Categorie', allCategories().map(c => ({ value: c.id, label: c.name })), getFieldBtnValue('new-ex-category'), value => {
    setFieldBtnValue('new-ex-category', value, categoryName(value));
  });
});
document.getElementById('new-ex-type').addEventListener('click', () => {
  openFieldPicker('Type', EX_TYPE_OPTIONS, getFieldBtnValue('new-ex-type'), value => {
    setFieldBtnValue('new-ex-type', value, EX_TYPE_OPTIONS.find(o => o.value === value).label);
  });
});

function populateNewExCategorySelect(selected) {
  const name = selected ? categoryName(selected) : '';
  setFieldBtnValue('new-ex-category', name ? selected : '', name || 'Kies een categorie...');
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
  pendingEditExerciseId = null;
  document.getElementById('new-ex-title').textContent = 'Nieuwe oefening';
  document.getElementById('new-ex-name').value = '';
  setFieldBtnValue('new-ex-type', 'weight_reps', 'Gewicht en reps');
  populateNewExCategorySelect();
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.newEx, {});
  setNewExEquipmentOpen(false);
  newExerciseBaseline = getNewExerciseFormSnapshot();
  showScreen('screen-new-exercise');
  setTimeout(() => document.getElementById('new-ex-name').focus(), 300);
}

function openEditExerciseScreen(ex) {
  pendingEditExerciseId = ex.id;
  document.getElementById('new-ex-title').textContent = 'Oefening bewerken';
  document.getElementById('new-ex-name').value = ex.name;
  const typeOpt = EX_TYPE_OPTIONS.find(o => o.value === ex.type) || EX_TYPE_OPTIONS[0];
  setFieldBtnValue('new-ex-type', typeOpt.value, typeOpt.label);
  populateNewExCategorySelect(ex.category);
  populateExerciseInfoForm(EXERCISE_INFO_FORMS.newEx, getExerciseInfo(ex.id) || {});
  setNewExEquipmentOpen(false);
  newExerciseBaseline = getNewExerciseFormSnapshot();
  showScreen('screen-new-exercise');
}

// Updates an exercise's name/category/type. Everything else points at its id, so a
// rename needs nothing else. A built-in's first edit gives it its own db.custom_exercises
// entry with the same id, which overrides the built-in (see allExercises()).
function updateExistingExercise(id, updated) {
  if (!db.custom_exercises) db.custom_exercises = [];
  let entry = db.custom_exercises.find(e => e.id === id);
  if (!entry) {
    entry = { id };
    db.custom_exercises.push(entry);
  }
  entry.category = updated.category;
  entry.name = updated.name;
  entry.type = updated.type;
  persistCustomExercises();
  toast('Oefening bijgewerkt');
}

// Names stay unique (case-insensitive) among the exercises you can see; `exceptId` is the
// exercise being edited, which may keep its own name.
function exerciseNameTaken(name, exceptId) {
  const n = name.toLowerCase();
  return allExercises().some(e => e.id !== exceptId && e.name.toLowerCase() === n);
}
// A deleted (hidden) exercise keeps its name: its history still shows it, so a new or renamed
// exercise can't take it.
function deletedExercises() {
  const custom = db.custom_exercises || [];
  const customIds = new Set(custom.map(e => e.id));
  const hidden = db.hiddenBuiltins || {};
  return [...custom.filter(e => e.deleted), ...EXERCISE_DB.filter(e => hidden[e.id] && !customIds.has(e.id))];
}
function deletedExerciseNameTaken(name) {
  const n = name.toLowerCase();
  return deletedExercises().some(e => e.name.toLowerCase() === n);
}
const DELETED_NAME_MSG = 'Deze naam hoort bij een verwijderde oefening. Kies een andere naam.';

function saveNewExerciseFromScreen() {
  const name = document.getElementById('new-ex-name').value.trim();
  const cat = getFieldBtnValue('new-ex-category');
  const type = getFieldBtnValue('new-ex-type');
  if (!name) { toast('Vul een naam in'); return; }
  if (!cat) { toast('Kies een categorie'); return; }

  if (pendingEditExerciseId) {
    const id = pendingEditExerciseId;
    if (exerciseNameTaken(name, id)) { toast('Deze oefening bestaat al'); return; }
    if (deletedExerciseNameTaken(name)) { toast(DELETED_NAME_MSG); return; }
    updateExistingExercise(id, { category: cat, name, type });
    setExerciseInfoFor(id, readExerciseInfoForm(EXERCISE_INFO_FORMS.newEx));
    pendingEditExerciseId = null;
    exerciseBrowserMode = 'categories';
    currentBrowseCategory = null;
    renderCategoryBrowser();
    showScreen('screen-exercises');
    return;
  }

  if (exerciseNameTaken(name)) { toast('Deze oefening bestaat al'); return; }
  if (deletedExerciseNameTaken(name)) { toast(DELETED_NAME_MSG); return; }
  if (!db.custom_exercises) db.custom_exercises = [];
  const id = newExerciseId();
  db.custom_exercises.push({ id, category: cat, name, type });
  persistCustomExercises();
  setExerciseInfoFor(id, readExerciseInfoForm(EXERCISE_INFO_FORMS.newEx));
  toast('Oefening aangemaakt');
  exerciseBrowserMode = 'categories';
  currentBrowseCategory = null;
  renderCategoryBrowser();
  showScreen('screen-exercises');
}

// -- Delete exercise (built-in or custom) ----------------
let pendingDeleteExercise = null;

// Popup text with the exercise name in bold; the name goes in as text, never as HTML.
function setMsgWithName(el, before, name, after) {
  const strong = document.createElement('strong');
  strong.textContent = name;
  el.replaceChildren(before, strong, after);
}

// No checkbox: hiding can be undone (Verwijderde oefeningen → terugzetten).
function openDeleteExerciseConfirm(ex) {
  pendingDeleteExercise = ex;
  setMsgWithName(document.getElementById('delete-ex-msg'), 'Weet je zeker dat je ', ex.name,
    ' wilt verwijderen? De oefening verdwijnt uit je lijsten. Je trainingsgeschiedenis blijft bewaard, en je kunt hem terugzetten via Verwijderde oefeningen.');
  openOverlay('delete-exercise-overlay');
}

document.getElementById('btn-delete-ex-cancel').addEventListener('click', () => {
  pendingDeleteExercise = null;
  closeOverlay('delete-exercise-overlay');
});
document.getElementById('btn-delete-ex-confirm').addEventListener('click', () => {
  if (!pendingDeleteExercise) return;
  const id = pendingDeleteExercise.id;
  // Deleting HIDES the exercise: a self-added (or edited) one stays as a deleted entry, a
  // built-in goes into hiddenBuiltins. Its id and name stay findable (findExercise), so
  // everything that points at it is kept: logged sets, records, the favorite mark and
  // Oefeninginfo; history, calendar, Samenvatting, plan days and Inzicht keep showing it.
  const entry = (db.custom_exercises || []).find(e => e.id === id);
  if (entry) {
    entry.deleted = true;
    persistCustomExercises();
  }
  if (EXERCISE_DB.some(b => b.id === id)) {
    if (!db.hiddenBuiltins) db.hiddenBuiltins = {};
    db.hiddenBuiltins[id] = true;
    persistHiddenBuiltins();
  }
  pendingDeleteExercise = null;
  closeOverlay('delete-exercise-overlay');
  refreshExerciseList();
  renderHome();
  toast('Oefening verwijderd');
});

// -- Verwijderde oefeningen (#screen-deleted-exercises) ---------------------------
// Every hidden exercise (deletedExercises()), sorted by name. Each can be put back
// (terugzetten); an own exercise can also be deleted for good (permanent verwijderen).
// Built-in = its id is in EXERCISE_DB, also when it was edited (it then has a custom entry).
function isBuiltinExerciseId(id) { return EXERCISE_DB.some(b => b.id === id); }

function openDeletedExercises() {
  renderDeletedExercises();
  showScreen('screen-deleted-exercises');
}

function renderDeletedExercises() {
  const list = document.getElementById('deleted-ex-list');
  list.innerHTML = '';
  const items = deletedExercises().sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
  if (items.length === 0) {
    list.innerHTML = `<div class="exercise-empty">Geen verwijderde oefeningen</div>`;
    return;
  }
  const intro = document.createElement('p');
  intro.className = 't-small deleted-ex-intro';
  intro.textContent = 'Je trainingsgeschiedenis van deze oefeningen is bewaard. Zet een oefening terug om hem weer in je lijsten te zien.';
  list.appendChild(intro);
  const card = document.createElement('div');
  card.className = 'card list-card';
  items.forEach(ex => {
    const builtin = isBuiltinExerciseId(ex.id);
    const row = document.createElement('div');
    row.className = 'deleted-ex-row list-row';
    row.innerHTML = `
      <div class="deleted-ex-body">
        <span class="role-row deleted-ex-name"></span>
        <span class="role-sub deleted-ex-meta"></span>
      </div>
      <div class="deleted-ex-actions">
        <button type="button" class="row-icon-btn row-icon-btn-primary deleted-ex-restore" aria-label="Terugzetten">
          <svg viewBox="0 0 24 24"><path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>
        </button>
        ${builtin ? '' : `
        <button type="button" class="row-icon-btn row-icon-btn-danger deleted-ex-purge" aria-label="Permanent verwijderen">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>`}
      </div>
    `;
    row.querySelector('.deleted-ex-name').textContent = ex.name;
    const cat = categoryName(ex.category) || removedCategoryName(ex.category);
    row.querySelector('.deleted-ex-meta').textContent = (cat ? cat + ' · ' : '') + (builtin ? 'ingebouwd' : 'eigen oefening');
    row.querySelector('.deleted-ex-restore').addEventListener('click', () => restoreExercise(ex.id));
    if (!builtin) row.querySelector('.deleted-ex-purge').addEventListener('click', () => openPurgeExerciseConfirm(ex));
    card.appendChild(row);
  });
  list.appendChild(card);
}

// Re-renders whatever shows deleted exercises, after one was put back or deleted for good.
function refreshAfterDeletedChange() {
  renderDeletedExercises();
  refreshExerciseList();
  renderHome();
}

// Terugzetten: undoes the hiding. Everything was kept (sets, records, Oefeninginfo, the
// favorite mark), so the exercise is simply visible again, in its own category. If that
// category was deleted in the meantime (allowed once it looked empty), it comes back too.
function restoreExercise(id) {
  const entry = (db.custom_exercises || []).find(e => e.id === id);
  if (entry && entry.deleted) {
    delete entry.deleted;
    persistCustomExercises();
  }
  if (db.hiddenBuiltins && db.hiddenBuiltins[id]) {
    delete db.hiddenBuiltins[id];
    persistHiddenBuiltins();
  }
  const ex = findExercise(id);
  if (ex) restoreCategoryOf(ex);
  refreshAfterDeletedChange();
  toast(`${exerciseName(id)} is teruggezet`);
}

// -- Permanent verwijderen (own exercises only) --------------------------------
let pendingPurgeExercise = null;

function openPurgeExerciseConfirm(ex) {
  pendingPurgeExercise = ex;
  setMsgWithName(document.getElementById('purge-ex-msg'), '', ex.name,
    ' en alle gelogde sets, records en info worden definitief gewist, en de oefening verdwijnt uit je plannen. Ook je overzichten in Inzicht veranderen daardoor met terugwerkende kracht.');
  document.getElementById('purge-ex-confirm-check').checked = false;
  document.getElementById('btn-purge-ex-confirm').disabled = true;
  openOverlay('purge-exercise-overlay');
}

document.getElementById('purge-ex-confirm-check').addEventListener('change', e => {
  document.getElementById('btn-purge-ex-confirm').disabled = !e.target.checked;
});
document.getElementById('btn-purge-ex-cancel').addEventListener('click', () => {
  pendingPurgeExercise = null;
  closeOverlay('purge-exercise-overlay');
});
document.getElementById('btn-purge-ex-confirm').addEventListener('click', () => {
  const ex = pendingPurgeExercise;
  if (!ex || !document.getElementById('purge-ex-confirm-check').checked) return;
  pendingPurgeExercise = null;
  closeOverlay('purge-exercise-overlay');
  purgeExercise(ex.id);
  refreshAfterDeletedChange();
  toast(`${ex.name} is permanent verwijderd`);
});

// Wipes an own exercise and everything that points at it: the exercise itself, its logged
// sets (a workout left without exercises disappears), records, Oefeninginfo (incl. Kracht
// volgen) and the favorite mark. It also leaves every plan day; for the active plan that
// stores a new schedule version (persistPlan → syncInsightSchedule). Existing schedule
// versions are not touched: they carry the exercise's name. The name is free again after.
function purgeExercise(id) {
  if (isBuiltinExerciseId(id)) return; // built-ins can only be hidden
  db.custom_exercises = (db.custom_exercises || []).filter(e => e.id !== id);
  persistCustomExercises();
  Object.keys(db.workouts).forEach(date => {
    const w = db.workouts[date] || [];
    if (w.some(e => e.exerciseId === id)) setWorkout(date, w.filter(e => e.exerciseId !== id));
  });
  if (db.records && id in db.records) { delete db.records[id]; persistRecords(); }
  if (db.exerciseInfo && id in db.exerciseInfo) { delete db.exerciseInfo[id]; persistExerciseInfo(); }
  if (isFavoriteExercise(id)) { delete db.favoriteExercises[id]; persistFavorites(); }
  Object.entries(db.plans || {}).forEach(([planId, plan]) => {
    let changed = false;
    (plan.days || []).forEach(day => {
      const kept = (day.exercises || []).filter(e => e.exerciseId !== id);
      if (kept.length !== (day.exercises || []).length) { day.exercises = kept; changed = true; }
    });
    if (changed) persistPlan(planId, plan).catch(() => {}); // persistFailed already reported it
  });
}

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
// Adds the category right away (it then shows in Alle oefeningen, empty until an exercise
// uses it) and selects it in the form.
document.getElementById('btn-new-category-save').addEventListener('click', () => {
  const newCat = document.getElementById('new-category-input').value.trim();
  if (!newCat) return;
  if (findCategoryByName(newCat)) { toast('Deze categorie bestaat al'); return; }
  const cat = addCategory(newCat);
  setFieldBtnValue('new-ex-category', cat.id, cat.name);
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
  'purge-exercise-overlay': 'btn-purge-ex-cancel',
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
  'insight-sleep-overlay': 'btn-insight-sleep-cancel',
  'insight-weight-overlay': 'btn-insight-weight-cancel',
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
document.getElementById('btn-back-deleted-exercises').addEventListener('click', () => goBack('screen-exercises'));
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
    message: `Set ${i + 1} van "${exerciseName(currentExerciseId)}" verwijderen? Dit kan niet ongedaan worden gemaakt.`,
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
  graphRepsByExercise[currentExerciseId] = recordsHistoryReps;
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
document.getElementById('btn-set-note-save').addEventListener('click', () => saveSetNote());
document.getElementById('btn-set-note-clear').addEventListener('click', () => saveSetNote({ clear: true }));
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
// Wissen clears the saved note at once (no confirmation), closes and says so — the
// "Wissen in een invulvenster" pattern. An empty note + Opslaan is an error, not a clear.
document.getElementById('btn-comment-delete').addEventListener('click', () => {
  if (commentPopupCtx) commentPopupCtx.onDelete();
  closeOverlay('comment-overlay');
  toast('Notitie gewist');
});
document.getElementById('btn-comment-save').addEventListener('click', () => {
  const val = document.getElementById('comment-edit-input').value.trim();
  if (!val) { toast('Vul een notitie in', { type: 'error' }); return; }
  if (commentPopupCtx) commentPopupCtx.onSave(val);
  closeOverlay('comment-overlay');
  toast('Notitie opgeslagen');
});

document.getElementById('exercise-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (q) {
    renderExerciseSearchResults(q);
    setExercisesTitle(defaultExercisesTitle());
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory === FAVORITES_CATEGORY) {
    renderFavoriteExercises();
    setExercisesTitle('Favorieten');
  } else if (exerciseBrowserMode === 'exercises' && currentBrowseCategory) {
    renderExercisesInCategory(currentBrowseCategory);
    setExercisesTitle(categoryName(currentBrowseCategory));
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
  const name = currentUser.displayName || currentUser.email || 'Gebruiker';
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
document.getElementById('menu-card-insight').addEventListener('click', openInsight);

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
  document.getElementById('btn-theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Licht thema' : 'Donker thema');
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
// below so they can be unit-tested headless (extracted and eval'd in Node, together with
// roundTo() from the number helpers, which roundOrm() uses).
// <1rm-pure>
const ORM_TABLE_REPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20];

// One rep IS the max by definition: raw Epley would give 103,3% for 1 rep, so 1 rep
// is special-cased (1RM = lifted weight; the 1-rep table row = 100%).
function epley1rm(weight, reps) { return reps === 1 ? weight : weight * (1 + reps / 30); }
function weightAtReps(oneRm, reps) { return reps === 1 ? oneRm : oneRm / (1 + reps / 30); }
function percentAtReps(reps) { return reps === 1 ? 100 : Math.round(100 / (1 + reps / 30)); }
// The estimated 1RM and every table weight are rounded to 1 decimal, half away from zero
// (164,06 → 164,1); the table weights are computed from the unrounded 1RM, so the 1-rep row
// equals the shown 1RM. The percentage stays the calculated one. Via the app's one rounding
// function, roundTo() (which also handles floating-point noise: 118,7499999… → 118,8).
function roundOrm(weight) { return roundTo(weight, 1); }


// Strict parse (Dutch comma allowed); NaN for empty/garbage like "5abc".
function parseOrmNumber(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// Returns { error } or { oneRm, rows: [{ reps, weight, percent }] }.
function computeOneRm(weightStr, repsStr) {
  if (String(weightStr).trim() === '' || String(repsStr).trim() === '') return { error: 'Vul zowel gewicht als reps in.' };
  const weight = parseOrmNumber(weightStr);
  const reps = parseOrmNumber(repsStr);
  if (!isFinite(weight) || weight <= 0) return { error: 'Gewicht moet een getal groter dan 0 zijn.' };
  if (!isFinite(reps) || reps < 1 || !Number.isInteger(reps)) return { error: 'Reps moet een geheel getal van minimaal 1 zijn.' };
  const oneRm = epley1rm(weight, reps);
  const rows = ORM_TABLE_REPS.map(n => ({ reps: n, weight: roundOrm(weightAtReps(oneRm, n)), percent: percentAtReps(n) }));
  return { oneRm: roundOrm(oneRm), rows };
}
// </1rm-pure>

function open1rmCalculator() {
  document.getElementById('orm-weight').value = '';
  document.getElementById('orm-reps').value = '';
  ['orm-error', 'orm-result-card', 'orm-table-section', 'orm-hint'].forEach(id => document.getElementById(id).classList.add('hidden'));
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
  // Same markup as the Plate Calculator's results: number on Groot getal, "kg" apart on Klein.
  document.getElementById('orm-result-value').innerHTML = plateTotalHtml(res.oneRm);
  // Rows in set-row style; the row for the reps you entered is marked (none if it isn't in the table).
  const ownReps = parseOrmNumber(document.getElementById('orm-reps').value);
  // Columns % · weight · reps. Percentage and weight sit right-aligned in a box (.orm-pct-box,
  // .orm-weight-box) so "%" and "kg" line up in every row, as in the set rows. "%" directly after
  // the number ("94%"), "kg" with a space.
  document.getElementById('orm-table-body').innerHTML = res.rows.map(r =>
    `<div class="orm-table-row${r.reps === ownReps ? ' orm-table-row-own' : ''}">` +
    `<div><span class="orm-pct-box"><span class="set-val">${r.percent}</span><span class="set-unit">%</span></span></div>` +
    `<div><span class="orm-weight-box"><span class="set-val">${formatWeight(r.weight)}</span><span class="set-unit">kg</span></span></div>` +
    `<div><span class="set-val">${r.reps}</span></div></div>`
  ).join('');
  document.getElementById('orm-result-card').classList.remove('hidden');
  document.getElementById('orm-table-section').classList.remove('hidden');
  // Every box exactly as wide as the longest value of its column needs, centred in its column.
  ['.orm-pct-box', '.orm-weight-box'].forEach(sel => {
    const boxes = [...document.querySelectorAll(`#orm-table-body ${sel}`)];
    boxes.forEach(b => { b.style.width = ''; });
    const boxWidth = Math.max(...boxes.map(b => b.getBoundingClientRect().width));
    boxes.forEach(b => { b.style.width = `${boxWidth}px`; });
  });
});
// The accuracy hint only adds something above 5 reps; it follows the field while typing.
document.getElementById('orm-reps').addEventListener('input', e => {
  document.getElementById('orm-hint').classList.toggle('hidden', !(parseOrmNumber(e.target.value) > 5));
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
// Calculator number fields (Plate, 1RM, Warm-up): like the TRACK fields, a typed number is
// shown through the shared formatWeight() / formatNumber() once the field is left
// ("93.75" -> "93,75", "150.0" -> "150"); typing is already limited (FIELD_DECIMALS:
// 2 decimals for a weight, none for reps), so nothing is rounded away. Text that isn't a number stays as typed, so the calculator's own error
// still appears.
['plate-target-weight', 'orm-weight', 'orm-reps', 'warmup-weight'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    const n = parseWarmupNumber(e.target.value);
    if (!isNaN(n)) e.target.value = id === 'orm-reps' ? formatNumber(n) : formatWeight(n);
  });
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
    if (r.work) return `<div class="plate-result-line warmup-line-work">${formatWeight(r.weight)} kg (werkset)</div>`;
    return `<div class="plate-result-line">${formatWeight(r.weight)} kg × ${r.reps}</div>`;
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
  { id: 'p20WhiteHandles', label: '20 kg wit handvaten', weight: 20.3, deviation: 0, defaultCount: 2 },
  { id: 'p20BlackHandles', label: '20 kg zwart handvaten', weight: 20.4, deviation: 0, defaultCount: 2 },
  { id: 'p15White', label: '15 kg wit', weight: 14.9, deviation: 0.4, defaultCount: 6 },
  { id: 'p15WhiteHandles', label: '15 kg wit handvaten', weight: 15.3, deviation: 0, defaultCount: 2 },
  { id: 'p15BlackHandles', label: '15 kg zwart handvaten', weight: 15, deviation: 0, defaultCount: 2 },
  { id: 'p10New', label: '10 kg nieuw', weight: 9.7, deviation: 0.1, defaultCount: 10 },
  { id: 'p10White', label: '10 kg wit', weight: 9.9, deviation: 0.4, defaultCount: 6 },
  { id: 'p10WhiteHandles', label: '10 kg wit handvaten', weight: 10.5, deviation: 0, defaultCount: 2 },
  { id: 'p10BlackHandles', label: '10 kg zwart handvaten', weight: 10.3, deviation: 0, defaultCount: 2 },
  { id: 'p5New', label: '5 kg nieuw', weight: 5, deviation: 0, defaultCount: 10 },
  { id: 'p5White', label: '5 kg wit', weight: 5, deviation: 0, defaultCount: 8 },
  { id: 'p5Black', label: '5 kg zwart', weight: 5.2, deviation: 0, defaultCount: 2 },
  { id: 'p2_5', label: '2,5 kg', weight: 2.5, deviation: 0, defaultCount: 6 },
  { id: 'p2', label: '2 kg', weight: 2, deviation: 0, defaultCount: 6 },
  { id: 'p1', label: '1 kg', weight: 1, deviation: 0, defaultCount: 6 },
  { id: 'p1Own', label: '1 kg eigen', weight: 1, deviation: 0, defaultCount: 2 },
  { id: 'p0_5Own', label: '0,5 kg eigen', weight: 0.5, deviation: 0, defaultCount: 2 },
  { id: 'p0_25Own', label: '0,25 kg eigen', weight: 0.25, deviation: 0, defaultCount: 2 },
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

// Sets as the user counts them: a dropset continuation belongs to the set before it.
function workingSets(sets) {
  return sets.filter(s => !s.isDropsetContinuation);
}
function countWorkingSets(sets) {
  return workingSets(sets).length;
}

// The most recent session BEFORE `date` with logged sets of exercise `exId`, or null.
function previousSessionSets(exId, date) {
  const prev = Object.keys(db.workouts).filter(d => d < date).sort().reverse()
    .map(d => db.workouts[d].find(e => e.exerciseId === exId))
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
//   "Set N" — N is the Track set number, so a dropset's number is skipped
//     (+ the trophy when it is a PR — its dropsets never are)
//   weight × reps, with weight and reps judged separately
//   RPE, judged on its own (higher = felt heavier, so red)
//   "+N partial/forced" when it has extra reps (same text as the set rows; never compared) —
//     under RPE, as in the set rows' effort cell
//   what that set was last time
//   "Gevolgd door (N) dropset(s)" when dropsets hang on it (their own values aren't shown)
// Extra sets today have no counterpart; extra sets last time are simply not shown.
// No earlier session at all: no comparisons, one note under the last set.
function recapSetLines(ex, date, prKeys) {
  const groups = workingSetGroups(ex.sets || []);
  if (groups.length === 0) return recapLine('recap-muted', '', 'Nog geen sets gelogd');
  const prevSessionSets = previousSessionSets(ex.exerciseId, date);
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
      if (dw > 0) marks.push(`<span class="recap-up">↑ +${formatWeight(dw)} kg</span>`);
      if (dw < 0) marks.push(`<span class="recap-down">↓ -${formatWeight(-dw)} kg</span>`);
      if (dr > 0) marks.push(`<span class="recap-up">↑ +${reps(dr)}</span>`);
      if (dr < 0) marks.push(`<span class="recap-down">↓ -${reps(-dr)}</span>`);
      wrMarks = ' ' + (marks.length ? marks.join(' ') : '<span class="recap-muted">(gelijk)</span>');
      if (rpe > 0 && prpe > 0) {
        const d = Math.round((rpe - prpe) * 10) / 10;
        rpeMark = d > 0 ? ` <span class="recap-down">↑ +${formatRpe(d)}</span>`
          : d < 0 ? ` <span class="recap-up">↓ -${formatRpe(-d)}</span>`
          : ' <span class="recap-muted">(gelijk)</span>';
      }
      prevLine = `Vorige keer: ${formatWeight(pw)}×${pr}${prpe > 0 ? `, RPE ${formatRpe(prpe)}` : ''}`;
    } else if (prev) {
      prevLine = '(geen vorige set)';
    }
    const drops = idxs.length - 1;
    const extra = extraRepsText(s);
    return `
      <div class="recap-set">
        <div class="recap-set-head">Set ${idxs[0] + 1}${isPR ? ' ' + prTrophySvg('recap-set-pr') : ''}</div>
        <div>${formatWeight(w)} kg × ${r}${wrMarks}</div>
        <div>${rpe > 0 ? `RPE ${formatRpe(rpe)}${rpeMark}` : '<span class="recap-muted">Geen RPE gelogd</span>'}</div>
        ${extra ? `<div class="recap-note recap-extra">${extra}</div>` : ''}
        ${prevLine ? `<div class="recap-prev">${prevLine}</div>` : ''}
        ${drops > 0 ? `<div class="recap-note recap-drop">${DROP_ARROW_SVG}Gevolgd door ${drops === 1 ? 'dropset' : `${drops} dropsets`}</div>` : ''}
      </div>`;
  });
  if (!prev) blocks.push(recapLine('recap-muted', '', 'Eerste keer deze oefening — geen vergelijking'));
  return blocks.join('');
}

// PR sets logged on `date`, per exercise id — straight from getPRSetKeys(), the
// same detection that draws the Track screen's trophies.
function recapPRKeys(exercises, date) {
  const byId = {};
  let count = 0;
  exercises.forEach(ex => {
    const keys = getPRSetKeys(ex.exerciseId);
    byId[ex.exerciseId] = keys;
    keys.forEach(k => { if (k.startsWith(date + '#')) count++; });
  });
  return { byId, count };
}

function openDayRecap() {
  const date = currentDate;
  const exercises = getWorkout(date);
  document.getElementById('recap-title').textContent = `Samenvatting — ${formatDateStr(date)}`;
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
        <div class="recap-ex-name">${exerciseName(ex.exerciseId)}</div>
        ${ex.target ? recapSetsLine(ex) : ''}
        ${recapSetLines(ex, date, prs.byId[ex.exerciseId])}
      </div>`).join('');
  }
  openOverlay('recap-overlay');
}


function renderPlateList() {
  document.getElementById('plate-list').innerHTML = PLATE_TYPES.map(p => {
    // A plate with a deviation: average and deviation on two lines; otherwise just the weight.
    const meta = p.deviation > 0
      ? `<span class="plate-row-meta">gem. ${formatWeight(p.weight)} kg</span><span class="plate-row-meta">±${formatWeight(p.deviation)} kg</span>`
      : `<span class="plate-row-meta">${formatWeight(p.weight)} kg</span>`;
    const onBarCount = getPlateOnBarCount(p.id);
    const onBarAtMax = onBarCount >= getPlateOnBarMax(p.id);
    const availableAtMax = getPlateCount(p.id) >= getPlateAvailableMax(p.id);
    return `
      <div class="plate-row" data-plate-id="${p.id}">
        <div class="plate-row-info">
          <span class="plate-row-name">${p.label}</span>
          ${meta}
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

// A plate-calculator total: the number (with "±" when a plate type deviates) on Groot getal and
// "kg" apart on Klein — the same .set-val / .set-unit as the set rows.
function plateTotalHtml(weight, approx) {
  return `<span class="set-val">${approx ? '±' : ''}${formatWeight(weight)}</span><span class="set-unit">kg</span>`;
}
function renderPlateResult(remainingPerSide, targetWeight, barWeight, onBarWeightPerSide) {
  const card = document.getElementById('plate-result-card');
  card.classList.remove('hidden');
  const titleEl = document.getElementById('plate-result-title');
  const listEl = document.getElementById('plate-result-list');
  const noteEl = document.getElementById('plate-result-note');
  document.getElementById('plate-result-current-total').innerHTML = plateTotalHtml(calcCurrentBarTotal(barWeight), onBarHasDeviation());

  if (Math.round(remainingPerSide * 100) === 0) {
    titleEl.textContent = 'Per kant';
    listEl.innerHTML = `<div class="plate-result-empty">Niets bijleggen of weghalen — je zit al op het doelgewicht.</div>`;
    document.getElementById('plate-result-total').innerHTML = plateTotalHtml(barWeight + onBarWeightPerSide * 2, false);
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
  document.getElementById('plate-result-total').innerHTML = plateTotalHtml(totalWeight, hasDeviation);

  if (!result.exact) {
    const diff = Math.abs(targetWeight - totalWeight);
    noteEl.textContent = `Doel niet exact haalbaar — dichtstbijzijnde combinatie, ${formatWeight(diff)} kg verschil`;
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
// Every one of them ends with syncInsightSchedule(): whatever changed (exercises, sets,
// days, weekdays, the kind of schedule, which plan is active, a deleted plan), a change
// to the active schedule is stored as a new schedule version right away.
async function persistPlan(planId, planData) {
  if (!currentUser) return;
  try { await plansCol().doc(planId).set(planData); } catch (e) { persistFailed(e); throw e; }
  syncInsightSchedule();
}
async function deletePlanDoc(planId) {
  if (!currentUser) return;
  try { await plansCol().doc(planId).delete(); } catch (e) { persistFailed(e); throw e; }
  syncInsightSchedule();
}
async function persistActivePlan(data) {
  if (!currentUser) return;
  if (!data) await activePlanDoc().delete().catch(persistFailed);
  else try { await activePlanDoc().set(data); } catch (e) { persistFailed(e); throw e; }
  syncInsightSchedule();
}

// ── Plan CRUD ─────────────────────────────────────────
function genPlanId() { return 'plan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
// A plan day's fixed id: never changes when the day is moved, renamed or others are added.
function genPlanDayId() { return 'day-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function createPlan(name, days) {
  const planId = genPlanId();
  const planData = { id: planId, name, days: days.map(d => ({ id: genPlanDayId(), ...d })), createdAt: Date.now() };
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

// One plan card (name, day count). `withMenu` adds the ⋮ button; `featured` is the
// ACTIEF PLAN card (blue border; the section label says it is active, so no badge).
// Callers attach their own click handlers.
function buildPlanItem(plan, { withMenu, featured = false }) {
  const dayCount = (plan.days || []).length;
  const item = document.createElement('div');
  item.className = 'plan-item' + (featured ? ' plan-item-featured' : '');
  item.innerHTML = `
    <div class="plan-item-info">
      <div class="plan-item-name">${plan.name}</div>
      <div class="plan-item-meta">${dayCount} dag${dayCount !== 1 ? 'en' : ''}</div>
    </div>
    ${withMenu ? '<button class="plan-item-dots" aria-label="Opties"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>' : ''}
  `;
  return item;
}

// Every list of plans (Trainingsplannen, Kies een plan): the active plan in its own ACTIEF PLAN
// section with the featured card, MIJN PLANNEN with the rest. `prefix` names the elements
// (<prefix>-active-section / -active-slot / -label / -scroll); buildItem(plan, featured)
// makes a card. No active plan → no ACTIEF PLAN section; only the active plan → no MIJN PLANNEN
// label; no plans → no labels and false, the caller shows its own empty state.
function renderPlanSections(prefix, buildItem) {
  const plans = sortedPlans();
  const active = plans.find(p => db.activePlan && db.activePlan.planId === p.id);
  const others = plans.filter(p => p !== active);
  const activeSlot = document.getElementById(prefix + '-active-slot');
  const scroll = document.getElementById(prefix + '-scroll');
  document.getElementById(prefix + '-active-section').classList.toggle('hidden', !active);
  document.getElementById(prefix + '-label').classList.toggle('hidden',
    plans.length === 0 || (!!active && others.length === 0));
  activeSlot.innerHTML = '';
  scroll.innerHTML = '';
  if (active) activeSlot.appendChild(buildItem(active, true));
  others.forEach(plan => scroll.appendChild(buildItem(plan, false)));
  return plans.length > 0;
}

function renderPlanList() {
  const hasPlans = renderPlanSections('plan-list', buildPlanListItem);
  const emptyState = document.getElementById('plan-list-empty-state');
  emptyState.classList.toggle('hidden', hasPlans);
  emptyState.innerHTML = hasPlans ? '' : emptyAddStateHtml('btn-plan-empty-add', 'Nieuw plan', 'Nog geen plannen');
  // Same action as the tile Zelf samenstellen.
  if (!hasPlans) document.getElementById('btn-plan-empty-add').addEventListener('click', openMakeYourOwn);
}

// A card in Trainingsplannen: tap opens the plan, ⋮ = Actief maken / Dupliceren / Verwijderen.
function buildPlanListItem(plan, featured) {
  const item = buildPlanItem(plan, { withMenu: true, featured });
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
  return item;
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
      <div class="plan-day-preview-row"><span class="plan-day-preview-name">${exerciseName(ex.exerciseId)}</span><span class="plan-day-preview-meta">${formatExerciseSetsReps(ex, 'short')}</span></div>`).join('')}
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
    return weekdaysA.map(d => ({ name: WEEKDAY_FULL_NAMES[d], exercises: [], weekday: d }));
  }
  const weekdaysB = [...(plan.weekdaysB || [])].sort((a, b) => a - b);
  return [
    ...weekdaysA.map(d => ({ name: `${WEEKDAY_FULL_NAMES[d]} A`, exercises: [], weekday: d, group: 'A' })),
    ...weekdaysB.map(d => ({ name: `${WEEKDAY_FULL_NAMES[d]} B`, exercises: [], weekday: d, group: 'B' })),
  ];
}

// ── Plan Detail editable state: add day / add week ────────────────────
// A plan day's weekday (0 = Maandag) on a fixed-days plan: always the stored day.weekday,
// never derived from its name, so a renamed day keeps it. undefined on other plans.
function planDayWeekday(day) { return day.weekday; }

// Only for migratePlanDays(): how the weekday used to be derived — the day's Dutch name
// (after stripping any "A"/"B" suffix). undefined for a name that isn't a weekday.
function weekdayFromDayName(day) {
  let name = day.name || '';
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
  currentPlanData.weekdaysA = days.filter(d => d.group !== 'B').map(planDayWeekday).filter(w => w !== undefined);
  currentPlanData.weekdaysB = days.filter(d => d.group === 'B').map(planDayWeekday).filter(w => w !== undefined);
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
    insertPlanDay(group ? { id: genPlanDayId(), name, exercises: [], group } : { id: genPlanDayId(), name, exercises: [] }, group);
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
      .map(planDayWeekday)
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
  const day = { id: genPlanDayId(), name, exercises: [], weekday };
  if (group) day.group = group;
  insertPlanDay(day, group);
  syncPlanScheduleFieldsAfterDayChange();
  renderPlanDetail();
  await savePlanSchedule();
});

document.getElementById('btn-day-picker-cancel').addEventListener('click', () => closeOverlay('day-picker-overlay'));

// Converts a single-week plan into Week A + a new, empty Week B: existing days become
// Week A (on a fixed-days plan a day still named after its weekday, plain "Maandag" etc.,
// gets an " A" suffix; a renamed day keeps its name — its weekday is stored anyway).
async function addPlanWeek() {
  if (!currentPlanData) return;
  currentPlanData.days.forEach(day => {
    const w = currentPlanData.fixedDays ? planDayWeekday(day) : undefined;
    day.group = 'A';
    if (w !== undefined && day.name === WEEKDAY_FULL_NAMES[w]) day.name += ' A';
  });
  currentPlanData.hasWeekB = true;
  syncPlanScheduleFieldsAfterDayChange();
  renderPlanDetail();
  await savePlanSchedule();
}

document.getElementById('btn-plan-schedule-continue').addEventListener('click', async () => {
  if (!currentPlanData || !isPlanScheduleValid(currentPlanData)) return;
  // Best-effort preserve: a regenerated day keeps its old id and exercises only if a day
  // with that exact name already existed. Any day whose name isn't reproduced by the new
  // config (count/weekdays changed since exercises were added) is a new day (new id, no
  // exercises) — there's no reliable way to match it to an old one otherwise.
  const oldDaysByName = new Map((currentPlanData.days || []).map(d => [d.name, d]));
  currentPlanData.days = generatePlanDaysFromSchedule(currentPlanData).map(d => {
    const old = oldDaysByName.get(d.name);
    return { id: old ? old.id : genPlanDayId(), ...d, exercises: old ? (old.exercises || []) : [] };
  });
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
  list.classList.toggle('is-empty', exercises.length === 0);

  if (exercises.length === 0) {
    // Same empty state as the Fitness Tracker; the + does what the toolbar + does.
    list.innerHTML = emptyAddStateHtml('btn-pde-empty-add', 'Nieuwe oefening', 'Nog geen oefeningen');
    document.getElementById('btn-pde-empty-add').addEventListener('click', () => openPlanDayAddExercises(currentEditDayIndex));
    return;
  }

  exercises.forEach((ex, idx) => {
    const item = document.createElement('div');
    item.className = 'pde-item';
    item.dataset.exIdx = idx;
    item.innerHTML = `
      <div class="pde-item-inner">
        <div class="pde-ex-info">
          <span class="pde-ex-name">${exerciseName(ex.exerciseId)}</span>
          <span class="pde-ex-meta">${formatExerciseSetsReps(ex)}</span>
        </div>
        <svg class="pde-chevron" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        <div class="pde-drag-handle" aria-label="Sleep om te verplaatsen">
          <svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
        </div>
      </div>
    `;
    setupPdeItemInteractions(item);
    list.appendChild(item);
  });
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
  pendingPdeSrAddId = null;
  openPdeSrPopup(ex, 'Sets & reps aanpassen', 'Opslaan');
}

// Same popup, opened from screen-exercises' + per row (plan-add mode): nothing is
// written to the plan day until Toevoegen — see btn-pde-sr-save.
function openPdeSrAdd(exId) {
  pendingPdeSetsRepsIndex = null;
  pendingPdeSrAddId = exId;
  openPdeSrPopup({ sets: 3, reps: 10 }, `${exerciseName(exId)} toevoegen`, 'Toevoegen');
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
  pendingPdeSrAddId = null;
  closeOverlay('pde-sets-reps-overlay');
});
document.getElementById('btn-pde-sr-save').addEventListener('click', async () => {
  if (pendingPdeSrAddId !== null) {
    const values = readPdeSrValues();
    if (!values) { toast('Vul geldige sets en reps in'); return; }
    const exId = pendingPdeSrAddId;
    pendingPdeSrAddId = null;
    closeOverlay('pde-sets-reps-overlay');
    await addExerciseToPlanDay(exId, values);
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
  const names = idxs.map(i => `"${exerciseName(exercises[i].exerciseId)}"`);
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

// Wired once at startup (like the Fitness Tracker's and the set list's reordering): #pde-list
// is a fixed element, and wiring it on every render stacked handlers, whose second touchend
// undid the first one's saved order.
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

    if (JSON.stringify(newExercises.map(e => e.exerciseId)) !== JSON.stringify(oldExercises.map(e => e.exerciseId))) {
      await savePlanDayExercises(newExercises);
      newItems.forEach((el, i) => { el.dataset.exIdx = i; });
      toast('Volgorde opgeslagen');
    }
    pdeDragItem = null;
  };

  list.addEventListener('touchend', endDrag, { passive: true });
  list.addEventListener('touchcancel', endDrag, { passive: true });
}
setupPdeDragReorder(document.getElementById('pde-list'));

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
    days: document.querySelector('#chips-days .ps-num-box.selected')?.dataset.val || '',
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

// The AI plan builder answers in Dutch, except for these terms (same list as PROJECT_CONTEXT.md)
// and exercise names, which must come from the dataset so a plan links to the same exercises
// and history. The chips' data-val stays English (Muscle Growth, Intermediate, ...) so the
// prompt input is unambiguous; only their labels are Dutch.
const AI_ENGLISH_TERMS = ['reps', 'sets', 'RPE', 'dropset', 'PR', 'partial', 'forced', 'extra reps', 'warm-up', '1RM', 'xRM (5RM, 8RM)', 'One rep max', 'Workout'];
function aiExerciseNameList() { return allExercises().map(e => e.name).join('\n'); }
// The AI answers with exercise names; a plan day stores ids. A name that isn't one of the
// listed exercises is left out (logged), never guessed.
function aiPlanDaysToIds(days) {
  const idByName = new Map(allExercises().map(e => [e.name, e.id]));
  return days.map(day => ({
    ...day,
    exercises: (day.exercises || []).flatMap(({ name, ...rest }) => {
      const id = idByName.get(name);
      if (!id) { console.warn('[AI] unknown exercise left out:', name); return []; }
      return [{ exerciseId: id, ...rest }];
    }),
  }));
}

function openAIGenerate() {
  document.getElementById('ai-gen-form').classList.remove('hidden');
  document.getElementById('ai-gen-loading').classList.add('hidden');
  document.getElementById('ai-gen-pref').value = '';
  showScreen('screen-ai-generate');
}

document.getElementById('btn-back-ai-generate').addEventListener('click', () => goBack('screen-workout-plan', () => hasChanges(AI_GEN_DEFAULT_SNAPSHOT, getAiGenFormSnapshot())));

document.getElementById('btn-ai-generate-submit').addEventListener('click', async () => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('YOUR_KEY')) {
    toast('Voeg je Anthropic API-sleutel toe in app.js');
    return;
  }
  const goal = document.querySelector('#chips-goal .chip.active')?.dataset.val || 'Muscle Growth';
  const level = document.querySelector('#chips-level .chip.active')?.dataset.val || 'Intermediate';
  const days = document.querySelector('#chips-days .ps-num-box.selected')?.dataset.val || '4';
  const pref = document.getElementById('ai-gen-pref').value.trim();

  document.getElementById('ai-gen-form').classList.add('hidden');
  document.getElementById('ai-gen-loading').classList.remove('hidden');

  const systemPrompt = `You are a professional fitness coach. Generate a workout plan based on the user's input.

Language: write the plan name, the day names and any explanation in Dutch. Keep exercise names and these fitness terms in English, also inside Dutch text: ${AI_ENGLISH_TERMS.join(', ')}. Workout split names Push, Pull, Legs, Upper and Lower may stay English too.

Exercises: use ONLY exercise names from this list, spelled exactly as written (same capitals, same brackets) — never invent, translate or rename one:
${aiExerciseNameList()}

Respond ONLY with a valid JSON object, no markdown, no explanation. Format:
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
    const planId = await createPlan(plan.name, aiPlanDaysToIds(plan.days));
    openPlanDetail(planId);
    toast('Plan gemaakt!');
  } catch(e) {
    console.error('AI gen error', e);
    document.getElementById('ai-gen-form').classList.remove('hidden');
    document.getElementById('ai-gen-loading').classList.add('hidden');
    toast('Plan maken mislukt. Probeer het opnieuw.', { type: 'error' });
  }
});

// Chip group click delegation — text chips (.chip, on = .active) and the "Dagen per week"
// number boxes (.ps-num-box, on = .selected, the same boxes as Plan schedule's Aantal dagen).
document.querySelectorAll('.chip-group, #chips-days').forEach(group => {
  group.addEventListener('click', e => {
    const chip = e.target.closest('.chip, .ps-num-box');
    if (!chip) return;
    const on = chip.classList.contains('chip') ? 'active' : 'selected';
    group.querySelectorAll('.chip, .ps-num-box').forEach(c => c.classList.remove(on));
    chip.classList.add(on);
  });
});

// ── Presets ───────────────────────────────────────────
const PLAN_PRESETS = [
  { name: 'Push / Pull / Legs', days: [
    { name: 'Push', exercises: [{ exerciseId:'bench-press', sets:4, reps:8 }, { exerciseId:'military-press-barbell', sets:3, reps:10 }, { exerciseId:'incline-bench-press-dumbbell', sets:3, reps:12 }, { exerciseId:'dips-triceps', sets:3, reps:12 }] },
    { name: 'Pull', exercises: [{ exerciseId:'deadlift', sets:4, reps:5 }, { exerciseId:'pull-ups', sets:4, reps:8 }, { exerciseId:'bent-over-barbell-row', sets:3, reps:10 }, { exerciseId:'dumbbell-curl', sets:3, reps:12 }] },
    { name: 'Legs', exercises: [{ exerciseId:'squat', sets:4, reps:8 }, { exerciseId:'romanian-deadlift', sets:3, reps:10 }, { exerciseId:'leg-press', sets:3, reps:12 }, { exerciseId:'standing-calf-raise-machine', sets:4, reps:15 }] },
  ]},
  { name: 'Upper / Lower (4 dagen)', days: [
    { name: 'Upper A', exercises: [{ exerciseId:'bench-press', sets:4, reps:6 }, { exerciseId:'bent-over-barbell-row', sets:4, reps:6 }, { exerciseId:'military-press-barbell', sets:3, reps:8 }, { exerciseId:'pull-ups', sets:3, reps:8 }] },
    { name: 'Lower A', exercises: [{ exerciseId:'squat', sets:4, reps:6 }, { exerciseId:'romanian-deadlift', sets:3, reps:8 }, { exerciseId:'leg-press', sets:3, reps:10 }, { exerciseId:'leg-curl-machine', sets:3, reps:12 }] },
    { name: 'Upper B', exercises: [{ exerciseId:'incline-bench-press', sets:4, reps:8 }, { exerciseId:'seated-cable-row', sets:4, reps:10 }, { exerciseId:'shoulder-press-dumbbell', sets:3, reps:10 }, { exerciseId:'dumbbell-curl', sets:3, reps:12 }] },
    { name: 'Lower B', exercises: [{ exerciseId:'deadlift', sets:4, reps:5 }, { exerciseId:'hack-squat', sets:3, reps:10 }, { exerciseId:'lunges-dumbbell', sets:3, reps:12 }, { exerciseId:'standing-calf-raise-machine', sets:4, reps:15 }] },
  ]},
  { name: 'Full body (3 dagen)', days: [
    { name: 'Dag A', exercises: [{ exerciseId:'squat', sets:3, reps:8 }, { exerciseId:'bench-press', sets:3, reps:8 }, { exerciseId:'bent-over-barbell-row', sets:3, reps:8 }, { exerciseId:'military-press-barbell', sets:3, reps:8 }] },
    { name: 'Dag B', exercises: [{ exerciseId:'deadlift', sets:3, reps:5 }, { exerciseId:'incline-bench-press', sets:3, reps:10 }, { exerciseId:'pull-ups', sets:3, reps:8 }, { exerciseId:'dumbbell-curl', sets:3, reps:12 }] },
    { name: 'Dag C', exercises: [{ exerciseId:'front-squat', sets:3, reps:8 }, { exerciseId:'dips-chest', sets:3, reps:10 }, { exerciseId:'chin-ups', sets:3, reps:8 }, { exerciseId:'lateral-raises-dumbbell', sets:3, reps:15 }] },
  ]},
  { name: 'Bro split (5 dagen)', days: [
    { name: 'Borst', exercises: [{ exerciseId:'bench-press', sets:4, reps:8 }, { exerciseId:'incline-bench-press-dumbbell', sets:3, reps:10 }, { exerciseId:'flyes-cable', sets:3, reps:12 }, { exerciseId:'dips-chest', sets:3, reps:12 }] },
    { name: 'Rug', exercises: [{ exerciseId:'deadlift', sets:4, reps:5 }, { exerciseId:'pull-ups', sets:4, reps:8 }, { exerciseId:'bent-over-barbell-row', sets:3, reps:10 }, { exerciseId:'seated-cable-row', sets:3, reps:12 }] },
    { name: 'Schouders', exercises: [{ exerciseId:'military-press-barbell', sets:4, reps:8 }, { exerciseId:'lateral-raises-dumbbell', sets:4, reps:15 }, { exerciseId:'front-raises-dumbbell', sets:3, reps:12 }, { exerciseId:'shrugs-barbell', sets:3, reps:12 }] },
    { name: 'Armen', exercises: [{ exerciseId:'barbell-curl', sets:4, reps:10 }, { exerciseId:'hammer-curl', sets:3, reps:12 }, { exerciseId:'skull-crushers-barbell', sets:4, reps:10 }, { exerciseId:'triceps-pushdown-cable', sets:3, reps:12 }] },
    { name: 'Benen', exercises: [{ exerciseId:'squat', sets:4, reps:8 }, { exerciseId:'romanian-deadlift', sets:3, reps:10 }, { exerciseId:'leg-press', sets:3, reps:12 }, { exerciseId:'standing-calf-raise-machine', sets:5, reps:15 }] },
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
        <div class="preset-item-meta">${preset.days.length} dagen</div>
      </div>
      <span class="preset-item-arrow">›</span>
    `;
    item.addEventListener('click', async () => {
      closeOverlay('presets-overlay');
      const planId = await createPlan(preset.name, JSON.parse(JSON.stringify(preset.days)));
      openPlanDetail(planId);
      toast('Sjabloon toegevoegd!');
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
  if (!name) { toast('Vul een naam voor het plan in'); return; }
  closeOverlay('new-plan-overlay');
  await createPlan(name, []);
  renderPlanList();
});

// ── Plan Day Add Exercise Flow (screen-plan-day-edit's "+" button) ──────
// Reuses the exercise browser screen (screen-exercises) wholesale, in 'plan-add'
// mode: same categories, same exercise lists, same ⋮ menu and New Exercise form as
// the Fitness Tracker's own "All Exercises" — only the rows differ: a small + left of the ⋮ menu
// (a check once added) is the only add target, and it writes straight into currentPlanData.days[currentEditDayIndex]
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

// Whether exercise `exId` is already part of the plan day currently being edited via the
// pencil icon — drives the + / check state per row.
function planDayHasExercise(exId) {
  const day = currentPlanData && currentPlanData.days[currentEditDayIndex];
  return !!(day && (day.exercises || []).some(e => e.exerciseId === exId));
}

// `setsReps` is what the "<name> toevoegen" popup produced (see readPdeSrValues):
// either {sets, reps} or {repsPerSet: [...]}.
async function addExerciseToPlanDay(exId, setsReps) {
  const day = currentPlanData && currentPlanData.days[currentEditDayIndex];
  if (!day) return;
  if (!day.exercises) day.exercises = [];
  if (day.exercises.some(e => e.exerciseId === exId)) return;
  day.exercises.push({ exerciseId: exId, ...setsReps });
  await persistPlan(currentPlanId, currentPlanData);
  refreshExerciseList();
}

// ── Smart Day Banner ──────────────────────────────────
// Re-checked on every renderHome(), so it follows today's workout however it got
// filled (manual add, Load Schedule Manually/Automatically, the banner itself):
// shown only while TODAY's workout (todayStr(), not the viewed day) is still empty,
// and only while the tracker shows today (hidden on any other day, back on today).
function renderSmartBanner() {
  const banner = document.getElementById('smart-day-banner');
  if (!banner) return;
  recordWeekCycle().catch(persistFailed);
  const pick = getTodaysScheduledDay();
  bannerSuggestedPick = pick;
  if (bannerDismissed || !pick || currentDate !== todayStr() || getWorkout(todayStr()).length > 0) { banner.classList.add('hidden'); return; }
  document.getElementById('smart-banner-msg').textContent = `Volgens je plan staat vandaag ${pick.dayName} op het programma. Laden?`;
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
  loadPlanDayIntoWorkout(pick.plan, pick.day, currentDate);
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

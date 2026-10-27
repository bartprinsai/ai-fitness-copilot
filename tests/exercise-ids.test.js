// Oefening-id's (vm, geen browser): de eenmalige migratie van namen naar id's, hernoemen,
// dubbele namen, plandagen, verwijderen (verbergen) en de AI-/sjabloon-koppeling op id.
// See PROJECT_CONTEXT.md, "Oefening-id's".
const H = require('./helpers');
const { FakeStore } = H;

const U = 'users/u1/';
const store = new FakeStore({
  [U + 'meta/custom_exercises']: { list: [{ category: 'arms', name: 'Mijn curl', type: 'weight_reps' }] },
  [U + 'meta/favorites']: { names: ['Bench press', 'Mijn curl'] },
  [U + 'meta/hidden_builtins']: { names: ['Snatch'] },
  [U + 'meta/exercise_info']: { data: {
    'Bench press': { primaryMuscleGroup: 'upper-chest', secondaryMuscleGroups: ['triceps', 'front-delts'], benchSettingNew: 2, powerliftBench: true, handPosition: 'Ringvinger op ring' },
    'Mijn curl': { primaryMuscleGroup: 'biceps' },
    'Weg oefening': { handPosition: 'x' },
  } },
  [U + 'meta/records']: { data: { 'Bench press': { 5: 105 }, 'Deadlift': { 3: 180 } } },
  [U + 'plans/p1']: { name: 'Mijn plan', fixedDays: true, daysPerWeek: 2, weekdaysA: [0, 1], scheduleConfirmed: true, createdAt: 1, days: [
    { name: 'Maandag', weekday: 0, exercises: [{ name: 'Bench press', sets: 3, reps: 5 }, { name: 'Mijn curl', repsPerSet: [12, 10, 8] }] },
    { name: 'Dinsdag', exercises: [{ name: 'Squat', sets: 5, reps: 5 }, { name: 'Bestaat niet', sets: 3, reps: 8 }] },
  ] },
  [U + 'workouts/2026-10-20']: { exercises: [
    { name: 'Bench press', sets: [{ weight: 100, reps: 5, rpe: 8 }, { weight: 80, reps: 8, isDropsetContinuation: true }] },
    { name: 'Mijn curl', sets: [{ weight: 20, reps: 10, extra: 2, extraType: 'partial' }] },
  ], sessionNote: 'Goede training' },
  [U + 'workouts/2026-10-22']: { exercises: [
    { name: 'Bench press', sets: [{ weight: 105, reps: 5 }] },
    { name: 'Onbekend ding', sets: [{ weight: 1, reps: 1 }] },
  ] },
  'users/u2/workouts/2026-10-22': { exercises: [{ name: 'Bench press', sets: [{ weight: 50, reps: 5 }] }] },
});

const test = String.raw`
const A = __assert, F = path => store.dump()[path];
const store = firebase.firestore();
currentUser = { uid: 'u1' };

console.test('\n# Migratie (eerste keer laden)');
await loadUserData('u1');
const w20 = F('users/u1/workouts/2026-10-20');
A(w20.exercises[0].exerciseId === 'bench-press' && w20.exercises[1].exerciseId === db.custom_exercises[0].id, 'workout 20-10: exerciseIds bench-press + eigen id');
A(w20.exercises.every(e => !('name' in e)), 'workout 20-10: geen name-veld meer');
A(w20.sessionNote === 'Goede training', 'workout 20-10: sessionNote behouden');
A(w20.exercises[0].sets[1].isDropsetContinuation === true && w20.exercises[1].sets[0].extraType === 'partial', 'sets ongewijzigd (dropset, extra reps)');
const w22 = F('users/u1/workouts/2026-10-22');
A(w22.exercises.length === 1 && w22.exercises[0].exerciseId === 'bench-press', 'onbekende naam "Onbekend ding" uit workout gehaald');
const mijnId = db.custom_exercises[0].id;
A(/^ex-[a-z0-9]+$/.test(mijnId), 'eigen oefening kreeg id ' + mijnId + ' (niet op naam gebaseerd)');
A(F('users/u1/meta/custom_exercises').list[0].id === mijnId, 'id van eigen oefening opgeslagen');
const p1 = F('users/u1/plans/p1');
A(JSON.stringify(p1.days[0].exercises) === JSON.stringify([{ exerciseId: 'bench-press', sets: 3, reps: 5 }, { exerciseId: mijnId, repsPerSet: [12, 10, 8] }]), 'plandag Maandag: ids, sets/reps behouden');
A(JSON.stringify(p1.days[1].exercises) === JSON.stringify([{ exerciseId: 'squat', sets: 5, reps: 5 }]), 'plandag Dinsdag: squat; "Bestaat niet" eruit');
A(JSON.stringify(F('users/u1/meta/favorites')) === JSON.stringify({ ids: ['bench-press', mijnId] }), 'favorieten op id');
A(JSON.stringify(F('users/u1/meta/hidden_builtins')) === JSON.stringify({ ids: ['snatch'] }), 'verborgen ingebouwde op id');
const info = F('users/u1/meta/exercise_info').data;
A(info['bench-press'].primaryMuscleGroup === 'upper-chest' && info['bench-press'].benchSettingNew === 2 && info[mijnId].primaryMuscleGroup === 'biceps', 'exercise_info op id, inhoud behouden');
A(info['Weg oefening'] && !info['Bench press'], 'onbekende exercise_info-sleutel blijft staan, oude naam-sleutel weg');
A(JSON.stringify(Object.keys(F('users/u1/meta/records').data).sort()) === JSON.stringify(['bench-press', 'deadlift']), 'records op id');
A(!!F('users/u1/meta/migrations').exerciseIds, 'migratievlag gezet: ' + F('users/u1/meta/migrations').exerciseIds);
A(F('users/u2/workouts/2026-10-22').exercises[0].name === 'Bench press', 'andere gebruiker (u2) niet aangeraakt');

console.test('\n# Migratie nog een keer');
const before = JSON.stringify(store.dump());
const writesBefore = store.writes.length;
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1');
A(JSON.stringify(store.dump()) === before && store.writes.length === writesBefore, 'tweede keer laden: migratie slaat over, geen enkele schrijfactie');
A(db.custom_exercises[0].id === mijnId && isFavoriteExercise('bench-press'), 'data na herladen gelijk (zelfde eigen id, favoriet)');
const r2 = await migrateExerciseIds('u1');
A(r2.custom + r2.workouts + r2.plans + r2.favorites + r2.hidden + r2.info + r2.records === 0, 'migratie geforceerd opnieuw draaien: 0 omzettingen');
A(JSON.stringify(store.dump()) === before, 'en Firestore identiek');

console.test('\n# Ingebouwde oefening hernoemen (Bench press -> Bankdrukken)');
const favBefore = isFavoriteExercise('bench-press');
openEditExerciseScreen(allExercises().find(e => e.id === 'bench-press'));
document.getElementById('new-ex-name').value = 'Bankdrukken';
saveNewExerciseFromScreen();
A(document.getElementById('toast-msg').textContent === 'Oefening bijgewerkt', 'opgeslagen');
A(exerciseName('bench-press') === 'Bankdrukken', 'naam via id: Bankdrukken');
A(allExercises().filter(e => e.id === 'bench-press').length === 1 && allExercises().every(e => e.name !== 'Bench press'), 'precies één oefening met dit id, oude naam niet meer in de lijst');
A(!db.hiddenBuiltins['bench-press'], 'ingebouwde niet verborgen, maar overschreven via eigen item met hetzelfde id');
A(db.plans.p1.days[0].exercises[0].exerciseId === 'bench-press', 'plan blijft gekoppeld');
A(getExerciseValidSets('bench-press').length === 2 && getPRSetKeys('bench-press').size > 0, 'geschiedenis en records (PR) blijven gekoppeld');
A(JSON.stringify(getRepLeaders('bench-press', 12)[5]) !== undefined && getRepLeaders('bench-press', 12)[5].weight === 105, 'Records-scherm: 5RM 105 kg');
A(isFavoriteExercise('bench-press') === favBefore && favBefore, 'favoriet blijft');
const bi = getExerciseInfo('bench-press');
A(bi.primaryMuscleGroup === 'upper-chest' && JSON.stringify(bi.secondaryMuscleGroups) === '["front-delts","triceps"]' && bi.benchSettingNew === 2 && bi.powerliftBench === true && bi.handPosition === 'Ringvinger op ring', 'Oefeninginfo (spiergroepen en apparatuur) blijft na bewerken via formulier');
openTraining('bench-press');
A(document.getElementById('training-title').textContent === 'Bankdrukken', 'Training-scherm toont nieuwe naam');
openExerciseInfo();
A(document.getElementById('exercise-info-view-title').textContent === 'Info Bankdrukken', 'Oefeninginfo-titel toont nieuwe naam');
A(F('users/u1/workouts/2026-10-20').exercises[0].exerciseId === 'bench-press', 'Firestore-workout ongewijzigd (alleen id)');
A(JSON.stringify(F('users/u1/meta/custom_exercises').list.find(e => e.id === 'bench-press')) === JSON.stringify({ id: 'bench-press', category: 'chest', name: 'Bankdrukken', type: 'weight_reps' }), 'opgeslagen als override met id bench-press');

console.test('\n# Eigen oefening hernoemen (Mijn curl -> Curl special)');
openEditExerciseScreen(allExercises().find(e => e.id === mijnId));
document.getElementById('new-ex-name').value = 'Curl special';
saveNewExerciseFromScreen();
A(exerciseName(mijnId) === 'Curl special' && db.custom_exercises.find(e => e.id === mijnId).name === 'Curl special', 'naam gewijzigd, id gelijk');
A(db.plans.p1.days[0].exercises[1].exerciseId === mijnId && getExerciseValidSets(mijnId).length === 1, 'plan en geschiedenis gekoppeld');
A(isFavoriteExercise(mijnId) && getExerciseInfo(mijnId).primaryMuscleGroup === 'biceps', 'favoriet en Oefeninginfo gekoppeld');
openEditExerciseScreen(allExercises().find(e => e.id === mijnId));
document.getElementById('new-ex-name').value = 'CURL SPECIAL';
saveNewExerciseFromScreen();
A(exerciseName(mijnId) === 'CURL SPECIAL', 'eigen naam met andere hoofdletters mag');

console.test('\n# Dubbele namen');
const countBefore = db.custom_exercises.length;
for (const dup of ['bankdrukken', 'Squat', 'curl special']) {
  openNewExerciseScreen();
  document.getElementById('new-ex-name').value = dup;
  setFieldBtnValue('new-ex-category', 'arms', 'Armen');
  saveNewExerciseFromScreen();
  A(document.getElementById('toast-msg').textContent === 'Deze oefening bestaat al' && db.custom_exercises.length === countBefore, 'nieuwe oefening "' + dup + '" geweigerd');
}
openEditExerciseScreen(allExercises().find(e => e.id === mijnId));
document.getElementById('new-ex-name').value = 'Deadlift';
saveNewExerciseFromScreen();
A(document.getElementById('toast-msg').textContent === 'Deze oefening bestaat al' && exerciseName(mijnId) === 'CURL SPECIAL', 'hernoemen naar bestaande naam "Deadlift" geweigerd');

console.test('\n# Nieuwe eigen oefening, hernoemen, toevoegen aan plandag');
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Kabel fly';
setFieldBtnValue('new-ex-category', 'chest', 'Borst');
saveNewExerciseFromScreen();
const fly = allExercises().find(e => e.name === 'Kabel fly');
A(fly && /^ex-/.test(fly.id) && fly.id !== mijnId, 'aangemaakt met eigen id ' + fly.id);
openEditExerciseScreen(fly);
document.getElementById('new-ex-name').value = 'Cable fly laag';
saveNewExerciseFromScreen();
currentPlanId = 'p1'; currentPlanData = db.plans.p1; currentEditDayIndex = 0;
A(!planDayHasExercise(fly.id), 'nog niet in plandag');
openPdeSrAdd(fly.id);
A(document.getElementById('pde-sr-title').textContent === 'Cable fly laag toevoegen', 'popup-titel toont naam');
await document.getElementById('btn-pde-sr-save').__fire('click');
A(planDayHasExercise(fly.id), 'toegevoegd aan plandag');
A(JSON.stringify(F('users/u1/plans/p1').days[0].exercises[2]) === JSON.stringify({ exerciseId: fly.id, sets: 3, reps: 10 }), 'in Firestore als { exerciseId, sets, reps }');

console.test('\n# Plandag laden in de Fitness Tracker');
const added = loadPlanDayIntoWorkout(db.plans.p1, db.plans.p1.days[0], '2026-10-26');
const w26 = F('users/u1/workouts/2026-10-26').exercises;
A(added === 3 && JSON.stringify(w26) === JSON.stringify([
  { exerciseId: 'bench-press', sets: [], target: { sets: 3, reps: 5 } },
  { exerciseId: mijnId, sets: [], target: { repsPerSet: [12, 10, 8] } },
  { exerciseId: fly.id, sets: [], target: { sets: 3, reps: 10 } },
]), '3 oefeningen met exerciseId en target');
A(loadPlanDayIntoWorkout(db.plans.p1, db.plans.p1.days[0], '2026-10-26') === 0, 'nogmaals laden voegt niets dubbel toe');
currentDate = '2026-10-26';
renderHome();
const cards = document.getElementById('home-content').children.filter(c => c.className === 'exercise-card');
A(cards.map(c => c.children[0].innerHTML.match(/exercise-card-name">([^<]*)/)[1]).join('|') === 'Bankdrukken|CURL SPECIAL|Cable fly laag', 'oefeningkaarten tonen de namen');
openTraining('bench-press');
A(document.getElementById('field-reps').value === 5, 'reps voorgevuld uit plan (5)');
document.getElementById('field-weight').value = '110';
document.getElementById('field-reps').value = '5';
saveSet();
A(F('users/u1/workouts/2026-10-26').exercises[0].sets[0].weight === 110, 'set gelogd op de geladen oefening');
A(document.getElementById('toast-msg').textContent.includes('PR'), 'PR-melding via id (110 > 105)');

console.test('\n# Verwijderen');
pendingDeleteExercise = allExercises().find(e => e.id === mijnId);
await document.getElementById('btn-delete-ex-confirm').__fire('click');
A(!allExercises().some(e => e.id === mijnId), 'eigen oefening uit de lijst');
A(db.custom_exercises.find(e => e.id === mijnId).deleted === true && exerciseName(mijnId) === 'CURL SPECIAL', 'blijft als verwijderd item: naam nog op te zoeken');
// Verwijderen = verbergen (PROJECT_CONTEXT.md, "Oefening-id's"): nothing is wiped any more.
A(getExerciseValidSets(mijnId).length === 1 && F('users/u1/workouts/2026-10-20').exercises.some(e => e.exerciseId === mijnId), 'gelogde sets bewaard (ook in Firestore)');
A(isFavoriteExercise(mijnId) && getExerciseInfo(mijnId).primaryMuscleGroup === 'biceps', 'favoriet en Oefeninginfo bewaard');
A(db.plans.p1.days[0].exercises.some(e => e.exerciseId === mijnId), 'plandag houdt hem (zoals voorheen), naam blijft zichtbaar');
pendingDeleteExercise = allExercises().find(e => e.id === 'squat');
await document.getElementById('btn-delete-ex-confirm').__fire('click');
A(db.hiddenBuiltins.squat && F('users/u1/meta/hidden_builtins').ids.includes('squat') && exerciseName('squat') === 'Squat', 'ingebouwde verborgen op id, naam nog op te zoeken');
pendingDeleteExercise = allExercises().find(e => e.id === 'bench-press');
await document.getElementById('btn-delete-ex-confirm').__fire('click');
A(!allExercises().some(e => e.id === 'bench-press') && db.hiddenBuiltins['bench-press'] && db.custom_exercises.find(e => e.id === 'bench-press').deleted === true && exerciseName('bench-press') === 'Bankdrukken', 'hernoemde ingebouwde: verborgen, override blijft als verwijderd item met de nieuwe naam');
A(getPRSetKeys('bench-press').size > 0 && getExerciseValidSets('bench-press').length === 3, 'hernoemde ingebouwde: geschiedenis (3 sets, ook de set van 26-10) en PR bewaard');
A(JSON.stringify(deletedExercises().map(e => e.id).sort()) === JSON.stringify([mijnId, 'bench-press', 'snatch', 'squat'].sort()), 'deletedExercises(): de drie verwijderde en de al verborgen Snatch');
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Curl special';
setFieldBtnValue('new-ex-category', 'arms', 'Armen');
saveNewExerciseFromScreen();
A(document.getElementById('toast-msg').textContent === DELETED_NAME_MSG && !allExercises().some(e => e.name.toLowerCase() === 'curl special'), 'naam van verwijderde oefening blijft bezet: "' + DELETED_NAME_MSG + '"');
// Permanent verwijderen frees the name. A separate exercise, so CURL SPECIAL stays deleted (for the plan-day check below).
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Weg curl';
setFieldBtnValue('new-ex-category', 'arms', 'Armen');
saveNewExerciseFromScreen();
const weg = allExercises().find(e => e.name === 'Weg curl');
pendingDeleteExercise = weg;
await document.getElementById('btn-delete-ex-confirm').__fire('click');
purgeExercise(weg.id);
A(!findExercise(weg.id) && !F('users/u1/meta/custom_exercises').list.some(e => e.id === weg.id), 'eigen oefening permanent verwijderd (ook in Firestore)');
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Weg curl';
setFieldBtnValue('new-ex-category', 'arms', 'Armen');
saveNewExerciseFromScreen();
const weg2 = allExercises().find(e => e.name === 'Weg curl');
A(weg2 && weg2.id !== weg.id, 'na permanent verwijderen is de naam weer vrij (nieuw id)');

console.test('\n# AI-plan en sjablonen');
const ai = aiPlanDaysToIds([{ name: 'Push', exercises: [{ name: 'Deadlift', sets: 3, reps: 5 }, { name: 'Verzonnen', sets: 1, reps: 1 }] }]);
A(JSON.stringify(ai) === JSON.stringify([{ name: 'Push', exercises: [{ exerciseId: 'deadlift', sets: 3, reps: 5 }] }]), 'AI-namen naar id, onbekende naam weggelaten');
A(PLAN_PRESETS.every(p => p.days.every(d => d.exercises.every(e => EXERCISE_DB.some(b => b.id === e.exerciseId) && !e.name))), 'alle sjabloonoefeningen verwijzen naar een bestaand ingebouwd id');

console.test('\n# Rooktest schermen');
currentExerciseId = 'deadlift'; currentDate = '2026-10-20';
const screens = { renderHistoryTab, renderGraph, openExerciseRecords, openDayRecap, openWorkoutDetail: () => openWorkoutDetail('2026-10-20'), renderHome,
  openPlanDetail: () => { openPlanDetail('p1'); expandedPlanDayIndex = 0; renderPlanDetail(); }, renderPlanDayEdit: () => { currentEditDayIndex = 0; renderPlanDayEdit(); },
  renderCategoryBrowser, renderFavoriteExercises, search: () => renderExerciseSearchResults('curl'), renderNewWorkoutScreen };
for (const [n, f] of Object.entries(screens)) { try { f(); A(true, n + ' zonder fout'); } catch (e) { A(false, n + ': ' + e.message); } }
const pdeHtml = JSON.stringify(document.getElementById('pde-list').children.map(c => c.innerHTML));
A(pdeHtml.includes('CURL SPECIAL') && pdeHtml.includes('Bankdrukken'), 'plandag toont namen, ook van verwijderde oefeningen');
`;

H.run(async () => {
  await H.runInVm(test, { store });
});

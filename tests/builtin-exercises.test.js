// De ingebouwde oefeningenlijst (vm, geen browser): aantallen per categorie en subcategorie, de
// ingebouwde subcategorieën (samen met een eigen subcategorie met dezelfde naam), standaard
// verborgen oefeningen (`hidden: true`: verborgen, terug te zetten), de eenmalige migratie van
// bewerkte ingebouwde oefeningen, oude namen, sjablonen en de AI-koppeling.
// See PROJECT_CONTEXT.md ("Categorieën en spiergroepen" → Ingebouwde oefeningen, Subcategorieën).
const H = require('./helpers');
const { FakeStore } = H;

const U = 'users/u1/';
const store = new FakeStore({
  [U + 'meta/custom_exercises']: { list: [
    { id: 'bench-press', category: 'chest', name: 'Bench press', type: 'weight_reps' },  // old name: brought along
    { id: 'deadlift', category: 'back', name: 'Deadlift', type: 'weight_reps' },        // old category: moves to Benen
    { id: 'squat', category: 'legs', name: 'Mijn squat', type: 'weight_reps' },          // own name: kept
    { id: 'lat-pulldown', category: 'back', name: 'Lat pulldown', type: 'weight_reps', subcategory: 'sub-eigen' }, // own subcategory: kept
    { id: 'ex-mijn', category: 'back', name: 'Mijn row', type: 'weight_reps', subcategory: 'sub-pull' },
  ] },
  [U + 'meta/categories']: { names: {}, custom: [], deleted: [], subcategories: [
    { id: 'sub-pull', name: 'pulldown', category: 'back' },  // same name as the built-in Pulldown
    { id: 'sub-eigen', name: 'Eigen', category: 'back' },
  ] },
  [U + 'meta/migrations']: { exerciseIds: '2026-10-26', planDays: '2026-10-26' },
  [U + 'workouts/2026-10-20']: { exercises: [{ exerciseId: 'crunches', sets: [{ weight: 0, reps: 20 }] }] },
});

const test = String.raw`
const A = __assert, F = path => store.dump()[path];
const store = firebase.firestore();
currentUser = { uid: 'u1' };
const visible = EXERCISE_DB.filter(e => !e.hidden);

console.test('\n# De lijst');
const per = {};
visible.forEach(e => { per[e.category] = (per[e.category] || 0) + 1; });
A(visible.length === 113, '113 zichtbare ingebouwde oefeningen (' + visible.length + ')');
A(JSON.stringify(per) === JSON.stringify({ chest: 20, back: 18, shoulders: 8, arms: 25, legs: 30, abs: 2, cardio: 10 }), 'per categorie: ' + JSON.stringify(per));
A(BUILTIN_SUBCATEGORIES.length === 21, '21 subcategorieën');
A(new Set(EXERCISE_DB.map(e => e.id)).size === EXERCISE_DB.length && new Set(EXERCISE_DB.map(e => e.name.toLowerCase())).size === EXERCISE_DB.length, 'id\'s en namen uniek');
A(new Set(BUILTIN_SUBCATEGORIES.map(s => s.id)).size === 21 && BUILTIN_SUBCATEGORIES.every(s => /^sub-[a-z0-9]+(-[a-z0-9]+)+$|^sub-[a-z]+$/.test(s.id)), 'subcategorie-id\'s uniek, sub- + kebab-case');
A(visible.every(e => !e.subcategory || BUILTIN_SUBCATEGORIES.some(s => s.id === e.subcategory && s.category === e.category)), 'elke subcategorie bestaat, in de categorie van de oefening');
A(BUILTIN_SUBCATEGORIES.every(s => visible.some(e => e.subcategory === s.id)), 'geen lege ingebouwde subcategorie');
A(visible.filter(e => e.subcategory).every(e => { const s = BUILTIN_SUBCATEGORIES.find(s => s.id === e.subcategory); return e.name === s.name || e.name.startsWith(s.name + ' - '); }), 'naam = subcategorie of "<subcategorie> - …"');
A(JSON.stringify(EXERCISE_DB.filter(e => e.hidden).map(e => e.id)) === '["crunches","sit-ups","plank","hanging-leg-raises"]', 'standaard verborgen: Crunches, Sit-ups, Plank, Hanging leg raises');
A(Object.keys(BUILTIN_PREVIOUS).every(id => EXERCISE_DB.some(e => e.id === id)), 'BUILTIN_PREVIOUS alleen voor bestaande oefeningen');

console.test('\n# Laden en migratie van bewerkte ingebouwde oefeningen');
await loadUserData('u1');
const list = F('users/u1/meta/custom_exercises').list, byId = id => list.find(e => e.id === id);
A(JSON.stringify(byId('bench-press')) === JSON.stringify({ id: 'bench-press', category: 'chest', name: 'Bench Press', type: 'weight_reps', subcategory: 'sub-bench-press' }), 'oude naam → Bench Press, subcategorie Bench Press');
A(byId('deadlift').category === 'legs' && byId('deadlift').subcategory === 'sub-deadlift' && byId('deadlift').name === 'Deadlift', 'Deadlift: Rug → Benen, subcategorie Deadlift');
A(byId('squat').name === 'Mijn squat' && byId('squat').subcategory === 'sub-squat', 'eigen naam Mijn squat blijft, krijgt wel subcategorie Squat');
A(byId('lat-pulldown').name === 'Pulldown - Wide Grip' && byId('lat-pulldown').subcategory === 'sub-eigen', 'eigen subcategorie blijft, oude naam wel bijgewerkt');
A(JSON.stringify(byId('ex-mijn')) === JSON.stringify({ id: 'ex-mijn', category: 'back', name: 'Mijn row', type: 'weight_reps', subcategory: 'sub-pull' }), 'eigen oefening ongemoeid');
A(!!F('users/u1/meta/migrations').builtinSubcategories && F('users/u1/meta/migrations').exerciseIds === '2026-10-26', 'vlag builtinSubcategories gezet, andere vlaggen blijven');
const before = JSON.stringify(store.dump()), writes = store.writes.length;
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1');
A(JSON.stringify(store.dump()) === before && store.writes.length === writes, 'tweede keer laden: geen enkele schrijfactie');

console.test('\n# Subcategorieën: ingebouwd en eigen samen');
const back = subcategoriesOf('back').map(s => s.name + ':' + s.id);
A(JSON.stringify(back) === JSON.stringify(['Barbell Row:sub-barbell-row', 'Eigen:sub-eigen', 'pulldown:sub-pull', 'Seated Cable Row:sub-seated-cable-row', 'Single Arm Row:sub-single-arm-row']), 'Rug: één Pulldown (de eigen), de rest ingebouwd: ' + back.join(', '));
A(findSubcategory('sub-pulldown').id === 'sub-pull' && exerciseSubcategory(EXERCISE_DB.find(e => e.id === 'pulldown-machine')).id === 'sub-pull', 'ingebouwde Pulldown wijst naar de eigen');
const pullGroup = allExercises().filter(e => e.category === 'back' && (exerciseSubcategory(e) || {}).id === 'sub-pull').map(e => e.name).sort();
A(pullGroup.length === 6 && pullGroup.includes('Mijn row') && !pullGroup.includes('Pulldown - Wide Grip'), 'groep pulldown: 5 ingebouwde + Mijn row (Wide Grip staat in Eigen)');
A(findSubcategoryByName('chest', 'BENCH PRESS').id === 'sub-bench-press' && findSubcategoryByName('back', 'Bench Press') === null, 'naam opzoeken per categorie, hoofdletterongevoelig');
A(subcategoriesOf('chest').length === 4 && subcategoriesOf('abs').length === 0 && subcategoriesOf('cardio').length === 0, 'Borst 4, Buik en Cardio geen');
A(!JSON.stringify(F('users/u1/meta/categories') || {}).includes('sub-bench-press'), 'ingebouwde subcategorieën niet in meta/categories opgeslagen');

console.test('\n# Standaard verborgen oefeningen');
A(!allExercises().some(e => ['crunches', 'sit-ups', 'plank', 'hanging-leg-raises'].includes(e.id)), 'niet in de lijsten');
A(JSON.stringify(deletedExercises().map(e => e.id).sort()) === JSON.stringify(['crunches', 'hanging-leg-raises', 'plank', 'sit-ups']), 'wel in Verwijderde oefeningen');
A(exerciseName('crunches') === 'Crunches' && getWorkout('2026-10-20')[0].exerciseId === 'crunches', 'naam en gelogde set blijven');
A(exercisesInCategory('abs').map(e => e.name).sort().join('|') === 'Ab Roller|Weighted Crunch', 'Buik toont Ab Roller en Weighted Crunch');
restoreExercise('crunches');
A(allExercises().some(e => e.id === 'crunches') && !deletedExercises().some(e => e.id === 'crunches'), 'terugzetten: weer zichtbaar');
A(JSON.stringify(F('users/u1/meta/hidden_builtins')) === JSON.stringify({ ids: [], shown: ['crunches'] }), 'opgeslagen als shown');
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1');
A(allExercises().some(e => e.id === 'crunches') && !allExercises().some(e => e.id === 'plank'), 'na herladen: Crunches zichtbaar, Plank nog verborgen');
pendingDeleteExercise = allExercises().find(e => e.id === 'crunches');
await document.getElementById('btn-delete-ex-confirm').__fire('click');
A(!allExercises().some(e => e.id === 'crunches') && JSON.stringify(F('users/u1/meta/hidden_builtins')) === JSON.stringify({ ids: ['crunches'], shown: [] }), 'opnieuw verwijderen: verborgen, ids');
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Plank';
setFieldBtnValue('new-ex-category', 'abs', 'Buik');
saveNewExerciseFromScreen();
A(document.getElementById('toast-msg').textContent === DELETED_NAME_MSG, 'naam van een standaard verborgen oefening is bezet');

console.test('\n# Oude namen, sjablonen, AI');
A(builtinByName('Lat pulldown').id === 'lat-pulldown' && builtinByName('Pulldown - Wide Grip').id === 'lat-pulldown' && builtinByName('Snatch') === null, 'oude en nieuwe naam gevonden, verwijderde niet');
A(PLAN_PRESETS.every(p => p.days.every(d => d.exercises.every(e => visible.some(b => b.id === e.exerciseId)))), 'alle sjabloonoefeningen bestaan en zijn zichtbaar');
A(!aiExerciseNameList().split('\n').includes('Plank') && aiExerciseNameList().split('\n').includes('Bench Press - Close Grip'), 'AI-lijst: nieuwe namen, geen verborgen');
const ai = aiPlanDaysToIds([{ name: 'Pull', exercises: [{ name: 'Barbell Row - Overhand', sets: 3, reps: 8 }, { name: 'Bent-over barbell row', sets: 3, reps: 8 }] }]);
A(JSON.stringify(ai[0].exercises) === JSON.stringify([{ exerciseId: 'bent-over-barbell-row', sets: 3, reps: 8 }]), 'AI-naam naar id, oude naam niet geraden');
`;

H.run(async () => {
  await H.runInVm(test, { store });
});

// De ingebouwde oefeningenlijst (vm, geen browser): aantallen per categorie en subcategorie, de
// ingebouwde subcategorieën (samen met een eigen subcategorie met dezelfde naam), de eenmalige
// migraties van bewerkte ingebouwde oefeningen (subcategorieën; kopieën zonder echt verschil na de
// naamstandaard), de naamstandaard en de nieuwe oefeningen, gelogde sets van een oefening die niet meer bestaat
// (overgeslagen, in Firestore bewaard), oude namen, sjablonen en de AI-koppeling. Gelijk aan eigen
// oefeningen: een type, permanent verwijderen (meta/purged_builtins: blijft weg, ook bij migraties,
// tot Alles resetten) en geen dubbele naam als een update een ingebouwde met de naam van een eigen
// oefening toevoegt (de eigen wint, niets wordt samengevoegd).
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
  [U + 'meta/migrations']: { exerciseIds: '2026-10-26', planDays: '2026-10-26', builtinCopies: '2026-11-10' }, // builtinCopies: eigen sectie
  // Crunches and Plank were taken out of EXERCISE_DB (November 2026); their logged sets stay.
  [U + 'workouts/2026-10-20']: { exercises: [{ exerciseId: 'crunches', sets: [{ weight: 0, reps: 20 }] }, { exerciseId: 'plank', sets: [{ weight: 0, reps: 1 }] }], planDays: [{ planId: 'p', dayId: 'd' }] },
  [U + 'workouts/2026-10-21']: { exercises: [{ exerciseId: 'crunches', sets: [{ weight: 0, reps: 15 }] }, { exerciseId: 'bench-press', sets: [{ weight: 100, reps: 5 }] }], sessionNote: 'Zwaar' },
});

const test = String.raw`
const A = __assert, F = path => store.dump()[path];
const store = firebase.firestore();
currentUser = { uid: 'u1' };
const visible = EXERCISE_DB.filter(e => !e.hidden);

console.test('\n# De lijst');
const per = {};
visible.forEach(e => { per[e.category] = (per[e.category] || 0) + 1; });
A(visible.length === 121, '121 zichtbare ingebouwde oefeningen (' + visible.length + ')');
A(JSON.stringify(per) === JSON.stringify({ chest: 20, back: 20, shoulders: 8, arms: 27, legs: 33, abs: 3, cardio: 10 }), 'per categorie: ' + JSON.stringify(per));
A(BUILTIN_SUBCATEGORIES.length === 21, '21 subcategorieën');
A(new Set(EXERCISE_DB.map(e => e.id)).size === EXERCISE_DB.length && new Set(EXERCISE_DB.map(e => e.name.toLowerCase())).size === EXERCISE_DB.length, 'id\'s en namen uniek');
A(new Set(BUILTIN_SUBCATEGORIES.map(s => s.id)).size === 21 && BUILTIN_SUBCATEGORIES.every(s => /^sub-[a-z0-9]+(-[a-z0-9]+)+$|^sub-[a-z]+$/.test(s.id)), 'subcategorie-id\'s uniek, sub- + kebab-case');
A(visible.every(e => !e.subcategory || BUILTIN_SUBCATEGORIES.some(s => s.id === e.subcategory && s.category === e.category)), 'elke subcategorie bestaat, in de categorie van de oefening');
A(BUILTIN_SUBCATEGORIES.every(s => visible.some(e => e.subcategory === s.id)), 'geen lege ingebouwde subcategorie');
A(visible.filter(e => e.subcategory).every(e => { const s = BUILTIN_SUBCATEGORIES.find(s => s.id === e.subcategory); return e.name === s.name || e.name.startsWith(s.name + ' - '); }), 'naam = subcategorie of "<subcategorie> - …"');
A(!EXERCISE_DB.some(e => e.hidden) && !['crunches', 'sit-ups', 'plank', 'hanging-leg-raises'].some(id => EXERCISE_DB.some(e => e.id === id)), 'Crunches, Sit-ups, Plank, Hanging leg raises helemaal weg, geen verborgen ingebouwde');
A(Object.keys(BUILTIN_PREVIOUS).every(id => EXERCISE_DB.some(e => e.id === id)), 'BUILTIN_PREVIOUS alleen voor bestaande oefeningen');
A(EXERCISE_DB.every(e => e.type === (e.category === 'cardio' || e.id === 'plank-hold' ? 'duration' : 'weight_reps')), 'elk type gezet: Cardio en Plank Duur, de rest Gewicht en reps');

console.test('\n# Naamstandaard en nieuwe oefeningen');
const word = w => !w || /^[A-Z0-9]/.test(w) || w === 'to'; // "High to Low" / "Low to High": niet in deze ronde
A(EXERCISE_DB.every(e => e.name.split(/[ -]+/).every(word)), 'elk woord met een hoofdletter, ook na een koppelteken: ' + EXERCISE_DB.filter(e => !e.name.split(/[ -]+/).every(word)).map(e => e.name));
const ren = { 'chin-ups': 'Chin-Up', 'pull-ups': 'Pull-Up', 'good-mornings': 'Good Morning', 'face-pulls': 'Face Pull - Rug', 'pulldown-machine-single-arm': 'Pulldown - Machine - Single Arm', 'face-pull-shoulder': 'Face Pull - Shoulder', 'rear-delt-flyes-machine': 'Rear Delt Fly - Machine', 'dumbbell-press-flat-neutral-grip': 'Dumbbell Press - Flat - Neutral Grip', 'dumbbell-press-incline-neutral-grip': 'Dumbbell Press - Incline - Neutral Grip', 'dips-triceps': 'Tricep Dip', 'pushdown-rope-seated': 'Pushdown - Rope - Seated', 'pushdown-v-bar-seated': 'Pushdown - V-Bar - Seated', 'bulgarian-split-squat': 'Bulgarian Split Squat', 'front-foot-elevated-split-squats': 'Front Foot Elevated Split Squat', 'sissy-squats': 'Sissy Squat', 'lunges-dumbbell': 'Walking Lunge', 'deadlift-deficit-paused': 'Deadlift - Deficit - Paused', 'deadlift-romanian-single-leg': 'Deadlift - Romanian - Single Leg', 'leg-press-single-leg-paused': 'Leg Press - Single Leg - Paused', 'cycling-outdoor': 'Cycling - Outdoor', 'jump-rope': 'Jump Rope', 'rowing-machine': 'Rowing Machine', 'stationary-bike': 'Stationary Bike' };
A(Object.entries(ren).every(([id, n]) => (EXERCISE_DB.find(e => e.name === n) || {}).id === id), '23 hernoemd, id\'s gelijk');
A(Object.keys(ren).every(id => previousNames(id).length && builtinByName(previousNames(id).slice(-1)[0]).id === id), 'oude namen herkend (BUILTIN_PREVIOUS)');
A(JSON.stringify(previousNames('bulgarian-split-squat')) === '["Bulgarian split squat","Bulgarian Split Squats"]' && previousNames('squat').length === 0, 'meerdere eerdere namen per id, oudste eerst');
const added = [['dumbbell-row-chest-supported', 'back', undefined, 'Dumbbell Row - Chest Supported', 'weight_reps'], ['lat-prayer', 'back', undefined, 'Lat Prayer', 'weight_reps'], ['hip-adduction', 'legs', undefined, 'Hip Adduction', 'weight_reps'], ['45-degree-back-extension', 'legs', undefined, '45-Degree Back Extension', 'weight_reps'], ['leg-press-sissy', 'legs', 'sub-leg-press', 'Leg Press - Sissy', 'weight_reps'], ['forearms-wrist-curl-dumbbell', 'arms', 'sub-forearms', 'Forearms - Wrist Curl - Dumbbell', 'weight_reps'], ['hammer-curl-dumbbell-preacher', 'arms', 'sub-hammer-curl', 'Hammer Curl - Dumbbell Preacher', 'weight_reps'], ['plank-hold', 'abs', undefined, 'Plank', 'duration']];
A(added.every(([id, c, sub, n, t]) => { const e = EXERCISE_DB.find(e => e.id === id) || {}; return e.category === c && e.subcategory === sub && e.name === n && e.type === t; }), '8 nieuwe: categorie, subcategorie, naam en type');
A(!EXERCISE_DB.some(e => e.id === 'plank'), 'Plank met een nieuwe id: de oude id plank blijft apart gezet');

console.test('\n# Laden en migratie van bewerkte ingebouwde oefeningen');
await loadUserData('u1');
const list = F('users/u1/meta/custom_exercises').list, byId = id => list.find(e => e.id === id);
A(JSON.stringify(byId('bench-press')) === JSON.stringify({ id: 'bench-press', category: 'chest', name: 'Bench Press', type: 'weight_reps', subcategory: 'sub-bench-press' }), 'oude naam → Bench Press, subcategorie Bench Press');
A(byId('deadlift').category === 'legs' && byId('deadlift').subcategory === 'sub-deadlift' && byId('deadlift').name === 'Deadlift', 'Deadlift: Rug → Benen, subcategorie Deadlift');
A(byId('squat').name === 'Mijn squat' && byId('squat').subcategory === 'sub-squat', 'eigen naam Mijn squat blijft, krijgt wel subcategorie Squat');
A(byId('lat-pulldown').name === 'Pulldown - Wide Grip' && byId('lat-pulldown').subcategory === 'sub-eigen', 'eigen subcategorie blijft, oude naam wel bijgewerkt');
A(JSON.stringify(byId('ex-mijn')) === JSON.stringify({ id: 'ex-mijn', category: 'back', name: 'Mijn row', type: 'weight_reps', subcategory: 'sub-pull' }), 'eigen oefening ongemoeid');
A(!!F('users/u1/meta/migrations').builtinSubcategories && F('users/u1/meta/migrations').exerciseIds === '2026-10-26' && F('users/u1/meta/migrations').builtinCopies === '2026-11-10', 'vlag builtinSubcategories gezet, andere vlaggen blijven');
const before = JSON.stringify(store.dump()), writes = store.writes.length;
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1');
A(JSON.stringify(store.dump()) === before && store.writes.length === writes, 'tweede keer laden: geen enkele schrijfactie');

console.test('\n# Migratie bewerkte ingebouwde zonder echt verschil (naamstandaard)');
{
  const saved = { list: F('users/u1/meta/custom_exercises').list, flags: F('users/u1/meta/migrations') };
  const info = { 'bicep-curl-cable-preacher-single-arm': { benchSettingNew: 3, cableHeightNew: 1 }, 'overhead-triceps-extension-cable': { cableHeightNew: 10 } };
  // De zes bewerkte kopieën zoals ze in het account van de gebruiker stonden (november 2026), plus randgevallen.
  await store.doc('users/u1/meta/custom_exercises').set({ list: [
    { category: 'back', type: 'weight_reps', id: 'face-pulls', name: 'Face pulls - Rug' },
    { name: 'Bulgarian Split Squats', category: 'legs', id: 'bulgarian-split-squat', type: 'weight_reps' },
    { name: 'Deadlift - Romanian - Single Leg', subcategory: 'sub-deadlift', id: 'deadlift-romanian-single-leg', type: 'weight_reps', category: 'legs' },
    { id: 'bicep-curl-cable-preacher-single-arm', category: 'arms', name: 'Bicep Curl - Cable Preacher - Single Arm', type: 'weight_reps', subcategory: 'sub-bicep-curl' },
    { id: 'pulldown-machine-single-arm', category: 'back', name: 'Pulldown - Machine - Single Arm', type: 'weight_reps', subcategory: 'sub-pulldown' },
    { id: 'overhead-triceps-extension-cable', category: 'arms', name: 'Overhead Extension - Rope', type: 'weight_reps', subcategory: 'sub-overhead-extension' },
    { id: 'chin-ups', category: 'back', name: 'Chin-ups', type: 'weight_reps', deleted: true },  // verwijderd: blijft verwijderd
    { id: 'pull-ups', category: 'back', name: 'Mijn pull-up', type: 'weight_reps' },            // eigen naam
    { id: 'sissy-squats', category: 'abs', name: 'Sissy Squats', type: 'weight_reps' },         // eigen categorie
    { id: 'jump-rope', category: 'cardio', name: 'Jump rope', type: 'weight_reps' },            // eigen type
    { id: 'ex-own', category: 'back', name: 'Mijn row', type: 'weight_reps' },
  ] });
  await store.doc('users/u1/meta/exercise_info').set({ data: info });
  await store.doc('users/u1/meta/migrations').set({ exerciseIds: '2026-10-26', planDays: '2026-10-26', builtinSubcategories: '2026-11-02' });
  db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
  await loadUserData('u1');
  const ids = F('users/u1/meta/custom_exercises').list.map(e => e.id);
  A(JSON.stringify(ids) === JSON.stringify(['chin-ups', 'pull-ups', 'sissy-squats', 'jump-rope', 'ex-own']), 'de zes kopieën weg; verwijderde, eigen naam/categorie/type en eigen oefening blijven: ' + ids);
  const shown = id => allExercises().find(e => e.id === id) || {};
  A(shown('face-pulls').name === 'Face Pull - Rug' && shown('bulgarian-split-squat').name === 'Bulgarian Split Squat' && shown('pulldown-machine-single-arm').subcategory === 'sub-pulldown', 'de ingebouwde toont, met de nieuwe naam');
  A(!allExercises().some(e => e.id === 'chin-ups') && shown('pull-ups').name === 'Mijn pull-up' && shown('jump-rope').type === 'weight_reps', 'verwijderd blijft weg, echte bewerkingen blijven');
  A(JSON.stringify(F('users/u1/meta/exercise_info').data) === JSON.stringify(info), 'Oefeninginfo ongemoeid');
  A(F('users/u1/meta/migrations').builtinCopies === todayStr() && F('users/u1/meta/migrations').builtinSubcategories === '2026-11-02', 'vlag builtinCopies gezet');
  const w = store.writes.length;
  db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
  await loadUserData('u1');
  A(store.writes.length === w, 'tweede keer laden: geen schrijfactie');
  await store.doc('users/u1/meta/custom_exercises').set({ list: saved.list });
  await store.doc('users/u1/meta/migrations').set(saved.flags);
  await store.doc('users/u1/meta/exercise_info').delete();
  db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
  await loadUserData('u1');
}

console.test('\n# Subcategorieën: ingebouwd en eigen samen');
const back = subcategoriesOf('back').map(s => s.name + ':' + s.id);
A(JSON.stringify(back) === JSON.stringify(['Barbell Row:sub-barbell-row', 'Eigen:sub-eigen', 'pulldown:sub-pull', 'Seated Cable Row:sub-seated-cable-row', 'Single Arm Row:sub-single-arm-row']), 'Rug: één Pulldown (de eigen), de rest ingebouwd: ' + back.join(', '));
A(findSubcategory('sub-pulldown').id === 'sub-pull' && exerciseSubcategory(EXERCISE_DB.find(e => e.id === 'pulldown-machine')).id === 'sub-pull', 'ingebouwde Pulldown wijst naar de eigen');
const pullGroup = allExercises().filter(e => e.category === 'back' && (exerciseSubcategory(e) || {}).id === 'sub-pull').map(e => e.name).sort();
A(pullGroup.length === 6 && pullGroup.includes('Mijn row') && !pullGroup.includes('Pulldown - Wide Grip'), 'groep pulldown: 5 ingebouwde + Mijn row (Wide Grip staat in Eigen)');
A(findSubcategoryByName('chest', 'BENCH PRESS').id === 'sub-bench-press' && findSubcategoryByName('back', 'Bench Press') === null, 'naam opzoeken per categorie, hoofdletterongevoelig');
A(subcategoriesOf('chest').length === 4 && subcategoriesOf('abs').length === 0 && subcategoriesOf('cardio').length === 0, 'Borst 4, Buik en Cardio geen');
A(!JSON.stringify(F('users/u1/meta/categories') || {}).includes('sub-bench-press'), 'ingebouwde subcategorieën niet in meta/categories opgeslagen');

console.test('\n# Sets van een oefening die niet meer bestaat');
const W = date => F('users/u1/workouts/' + date);
A(!findExercise('crunches') && !allExercises().some(e => e.id === 'crunches') && deletedExercises().length === 0, 'Crunches bestaat niet meer, geen Verwijderde oefeningen');
A(!('2026-10-20' in db.workouts) && !('2026-10-20' in db.workoutPlanDays), 'dag met alleen onbekende sets: geen training in de app');
A(JSON.stringify(getWorkout('2026-10-21').map(e => e.exerciseId)) === '["bench-press"]' && getSessionNote('2026-10-21') === 'Zwaar', 'gemengde dag: alleen Bench Press, notitie blijft');
A(JSON.stringify(Object.keys(db.unknownWorkoutEntries)) === '["2026-10-20","2026-10-21"]', 'apart gezet per datum');
A(W('2026-10-20').exercises.length === 2 && W('2026-10-20').planDays.length === 1 && W('2026-10-21').exercises.length === 2, 'Firestore niet aangeraakt bij het laden');
setWorkout('2026-10-21', [{ ...getWorkout('2026-10-21')[0], sets: [{ weight: 100, reps: 5 }, { weight: 102.5, reps: 5 }] }]);
A(JSON.stringify(W('2026-10-21').exercises.map(e => e.exerciseId + ':' + e.sets.length)) === '["bench-press:2","crunches:1"]' && W('2026-10-21').sessionNote === 'Zwaar', 'set loggen: Crunches-sets blijven in Firestore, notitie ook');
setWorkout('2026-10-21', []);
A(JSON.stringify(W('2026-10-21')) === JSON.stringify({ exercises: [{ exerciseId: 'crunches', sets: [{ weight: 0, reps: 15 }] }] }) && !('2026-10-21' in db.workouts), 'dag leeggemaakt: alleen de Crunches-sets blijven bewaard');
setWorkout('2026-10-20', [{ exerciseId: 'squat', sets: [{ weight: 120, reps: 5 }] }]);
A(JSON.stringify(W('2026-10-20').exercises.map(e => e.exerciseId)) === '["squat","crunches","plank"]', 'nieuwe set op een dag met alleen onbekende sets: erbij, de rest blijft');
setWorkout('2026-10-25', [{ exerciseId: 'squat', sets: [{ weight: 1, reps: 1 }] }]); setWorkout('2026-10-25', []);
A(W('2026-10-25') === undefined, 'gewone dag leegmaken verwijdert het document nog steeds');
A(!aiExerciseNameList().split('\n').some(n => /^(Crunches|Sit-ups|Hanging leg raises)$/.test(n)) && JSON.stringify(aiPlanDaysToIds([{ name: 'Core', exercises: [{ name: 'Crunches', sets: 3, reps: 20 }] }])) === JSON.stringify([{ name: 'Core', exercises: [] }]), 'AI: niet in de lijst, als antwoord weggelaten (Plank is terug, met een nieuwe id)');

console.test('\n# Type in Oefening bewerken');
openEditExerciseScreen(allExercises().find(e => e.id === 'treadmill'));
A(getFieldBtnValue('new-ex-type') === 'duration', 'Treadmill: Duur');
openEditExerciseScreen(allExercises().find(e => e.id === 'leg-press'));
A(getFieldBtnValue('new-ex-type') === 'weight_reps', 'Leg Press: Gewicht en reps');

console.test('\n# Ingebouwde oefening permanent verwijderen');
db.favoriteExercises['leg-press'] = true; db.exerciseInfo['leg-press'] = { primaryMuscleGroup: 'quads' };
setWorkout('2026-10-23', [{ exerciseId: 'leg-press', sets: [{ weight: 200, reps: 10 }] }]);
updateExistingExercise('leg-press', { category: 'legs', subcategory: 'sub-leg-press', name: 'Mijn leg press', type: 'weight_reps' });
purgeExercise('leg-press');
A(JSON.stringify(F('users/u1/meta/purged_builtins')) === '{"ids":["leg-press"]}', 'id op meta/purged_builtins');
A(!findExercise('leg-press') && !allExercises().some(e => e.id === 'leg-press') && !deletedExercises().some(e => e.id === 'leg-press'), 'nergens meer: niet te vinden, niet in de lijst, niet bij Verwijderde oefeningen');
A(!F('users/u1/meta/custom_exercises').list.some(e => e.id === 'leg-press') && F('users/u1/workouts/2026-10-23') === undefined && !isFavoriteExercise('leg-press') && !('leg-press' in db.exerciseInfo), 'bewerkte versie, sets, favoriet en info gewist');
A(!aiExerciseNameList().split('\n').some(n => /^(Leg Press|Mijn leg press)$/.test(n)) && JSON.stringify(aiPlanDaysToIds([{ name: 'L', exercises: [{ name: 'Leg Press', sets: 1, reps: 1 }] }])[0].exercises) === '[]', 'AI kent hem niet meer');
const presetDays = PLAN_PRESETS[0].days.map(d => d.exercises.filter(e => findExercise(e.exerciseId)).map(e => e.exerciseId));
A(!presetDays.flat().includes('leg-press') && PLAN_PRESETS[0].days[2].exercises.some(e => e.exerciseId === 'leg-press'), 'sjabloon met Leg Press: wordt overgeslagen bij het aanmaken');
openNewExerciseScreen();
document.getElementById('new-ex-name').value = 'Leg Press';
setFieldBtnValue('new-ex-category', 'legs', 'Benen');
saveNewExerciseFromScreen();
const eigenLp = allExercises().filter(e => e.name === 'Leg Press');
A(document.getElementById('toast-msg').textContent === 'Oefening aangemaakt' && eigenLp.length === 1 && /^ex-/.test(eigenLp[0].id), 'naam vrij: eigen Leg Press aangemaakt');
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1');
A(!findExercise('leg-press') && allExercises().filter(e => e.name === 'Leg Press').length === 1, 'na herladen nog steeds weg, alleen de eigen Leg Press');
db.workouts['2026-11-01'] = [{ name: 'Leg press', sets: [{ weight: 1, reps: 1 }] }];
await migrateExerciseIds('u1');
A(!JSON.stringify(db.workouts['2026-11-01'] || []).includes('leg-press') && builtinByName('Leg press') === null && builtinByName('Leg Press') === null, 'migratie op oude naam zet hem niet terug');
await migrateBuiltinSubcategories('u1');
A(!findExercise('leg-press') && !(db.custom_exercises || []).some(e => e.id === 'leg-press'), 'migratie bewerkte ingebouwde zet hem niet terug');
document.getElementById('reset-confirm-input').value = 'RESET';
await document.getElementById('btn-reset-confirm').__fire('click');
A(F('users/u1/meta/purged_builtins') === undefined && allExercises().some(e => e.id === 'leg-press' && e.name === 'Leg Press'), 'Alles resetten: lijst leeg, Leg Press terug');

console.test('\n# Naambotsing: een update voegt een ingebouwde toe met de naam van een eigen oefening');
db.custom_exercises = [{ id: 'ex-ext', category: 'legs', name: 'leg extension', type: 'weight_reps' }];
const ext = allExercises().filter(e => e.name.toLowerCase() === 'leg extension');
A(ext.length === 1 && ext[0].id === 'ex-ext' && !findExercise('ex-ext').subcategory, 'één oefening met die naam: de eigen, niets samengevoegd');
A(!deletedExercises().some(e => e.id === 'leg-extension-machine'), 'ingebouwde ook niet bij Verwijderde oefeningen');
db.custom_exercises[0].deleted = true;
A(!allExercises().some(e => e.id === 'leg-extension-machine') && deletedExercises().map(e => e.id).join() === 'ex-ext', 'eigen verwijderd: naam blijft van de eigen, de ingebouwde blijft weg');
db.custom_exercises[0].name = 'Leg extension oud'; delete db.custom_exercises[0].deleted;
A(allExercises().some(e => e.id === 'leg-extension-machine') && allExercises().some(e => e.id === 'ex-ext'), 'eigen hernoemd: de ingebouwde verschijnt');
db.custom_exercises = [];

console.test('\n# Oude namen, sjablonen, AI');
A(builtinByName('Lat pulldown').id === 'lat-pulldown' && builtinByName('Pulldown - Wide Grip').id === 'lat-pulldown' && builtinByName('Snatch') === null && builtinByName('Crunches') === null, 'oude en nieuwe naam gevonden, verwijderde niet');
A(PLAN_PRESETS.every(p => p.days.every(d => d.exercises.every(e => visible.some(b => b.id === e.exerciseId)))), 'alle sjabloonoefeningen bestaan en zijn zichtbaar');
A(aiExerciseNameList().split('\n').includes('Bench Press - Close Grip') && aiExerciseNameList().split('\n').length === 121, 'AI-lijst: de 121 ingebouwde met nieuwe namen (na Alles resetten)');
const ai = aiPlanDaysToIds([{ name: 'Pull', exercises: [{ name: 'Barbell Row - Overhand', sets: 3, reps: 8 }, { name: 'Bent-over barbell row', sets: 3, reps: 8 }] }]);
A(JSON.stringify(ai[0].exercises) === JSON.stringify([{ exerciseId: 'bent-over-barbell-row', sets: 3, reps: 8 }]), 'AI-naam naar id, oude naam niet geraden');
`;

H.run(async () => {
  await H.runInVm(test, { store });
});

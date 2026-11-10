// Gelogde sets van een oefening die niet meer bestaat (een ingebouwde die uit EXERCISE_DB is
// gehaald, zoals Crunches en Plank in november 2026): de app slaat ze overal over, zonder fout.
// Fitness Tracker, kalender, Geschiedenis, Samenvatting, Grafiek, Records, Inzicht (week, dag,
// training, kracht), de oefeningenlijst, Favorieten en de AI-namenlijst. Het bewaren in Firestore
// staat in builtin-exercises.test.js. See PROJECT_CONTEXT.md ("Oefening-id's").
const H = require('./helpers');
const { check } = H;

const S = (w, r) => ({ weight: String(w), reps: String(r), rpe: '8', extra: '0', extraType: '' });
// Today: Thursday 22 October 2026. Monday 19: Bench Press + Crunches; Tuesday 20: only Crunches and Plank.
const DATA = {
  custom_exercises: [], weekCycle: {}, sleep: {}, bodyWeight: {},
  favoriteExercises: { 'bench-press': true, crunches: true },
  exerciseInfo: { 'bench-press': { primaryMuscleGroup: 'chest', trackStrength: true }, crunches: { primaryMuscleGroup: 'abs', trackStrength: true }, plank: { primaryMuscleGroup: 'abs' } },
  records: { crunches: { weight: 20 } },
  workoutPlanDays: { '2026-10-20': [{ planId: 'p', dayId: 'd' }] },
  workouts: {
    '2026-10-12': [{ exerciseId: 'bench-press', sets: [S(95, 5)] }, { exerciseId: 'crunches', sets: [S(10, 20)] }],
    '2026-10-19': [{ exerciseId: 'bench-press', sets: [S(100, 5), S(100, 5)] }, { exerciseId: 'crunches', sets: [S(0, 20), S(0, 20)] }],
    '2026-10-20': [{ exerciseId: 'crunches', sets: [S(0, 25)] }, { exerciseId: 'plank', sets: [S(0, 1)] }],
  },
};
const GONE = /Crunches|Plank|crunches|plank/;

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1200 });
  await H.loadData(page, DATA);
  // What loadUserData() does after loading and the migrations.
  await page.evaluate(() => { setAsideUnknownExercises(); });

  check('opzet: in de app alleen Bench Press, op 12 en 19 oktober', await page.evaluate(() => Object.entries(db.workouts).map(([d, l]) => d + ':' + l.map(e => e.exerciseId).join(','))),
    ['2026-10-12:bench-press', '2026-10-19:bench-press']);

  // Each screen: no JS error, and none of the gone exercises in its text.
  const screens = {
    'Fitness Tracker 19 oktober': () => { currentDate = '2026-10-19'; showScreen('screen-fitness-tracker'); renderHome(); return document.getElementById('home-content').innerText; },
    'Fitness Tracker 20 oktober (alleen verdwenen sets)': () => { currentDate = '2026-10-20'; renderHome(); return document.getElementById('home-content').innerText + '|' + document.querySelectorAll('#home-content .exercise-card').length; },
    'Samenvatting 19 oktober': () => { currentDate = '2026-10-19'; renderHome(); openDayRecap(); const t = document.getElementById('recap-overlay').innerText; closeOverlay('recap-overlay'); return t; },
    'Kalender': () => { openCalendar(); const t = document.getElementById('screen-calendar') ? document.getElementById('screen-calendar').innerText : document.body.innerText; return t + '|' + calWorkoutDates.join(','); },
    'Kalender: dag 19 oktober': () => { openWorkoutDetail('2026-10-19'); const t = document.getElementById('cal-detail-body').innerText; closeOverlay('cal-detail-overlay'); return t; },
    'Geschiedenis Bench Press': () => { openTraining('bench-press'); renderHistoryTab(); return document.getElementById('history-content').innerText; },
    'Grafiek Bench Press': () => { renderGraph(); return document.getElementById('screen-training').innerText; },
    'Records Bench Press': () => { openExerciseRecords(); return document.body.innerText; },
    'Favorieten': () => { openExerciseList(); renderFavoriteExercises(); return document.getElementById('exercise-list').innerText; },
    'Buik': () => { enterExerciseBrowseCategory('abs', 'Buik', () => renderExercisesInCategory('abs')); return document.getElementById('exercise-list').innerText; },
    'Zoeken "crunch"': () => { const i = document.getElementById('exercise-search'); i.value = 'crunch'; i.dispatchEvent(new Event('input')); const t = document.getElementById('exercise-list').innerText; i.value = ''; i.dispatchEvent(new Event('input')); return t; },
    'Inzicht week': () => { showScreen('screen-home'); openInsight(); return document.getElementById('screen-insight').innerText; },
    'Inzicht dag 19 oktober': () => { openInsightDay('2026-10-19'); return document.querySelector('.screen.active').innerText; },
    'Inzicht dag 20 oktober': () => { openInsightDay('2026-10-20'); return document.querySelector('.screen.active').innerText; },
    'Inzicht training': () => { showScreen('screen-insight'); openInsightTraining(); return document.querySelector('.screen.active').innerText; },
    'Inzicht kracht': () => { showScreen('screen-insight'); openInsightStrength(); return document.querySelector('.screen.active').innerText; },
    // Plank is back as a new built-in under another id (plank-hold): its own line in the list is fine.
    'AI-namenlijst': () => aiExerciseNameList().split('\n').filter(n => n !== 'Plank').join('\n'),
  };
  const seen = {};
  for (const name of Object.keys(screens)) {
    const before = errors.length;
    const text = String(await page.evaluate(screens[name]).catch(e => 'FOUT: ' + e.message));
    await H.settle(page);
    seen[name] = text;
    check(`${name}: geen fout, geen verdwenen oefening`, { fout: text.startsWith('FOUT') ? text : null, jsFouten: errors.slice(before), verdwenen: GONE.test(text) }, { fout: null, jsFouten: [], verdwenen: false });
  }
  check('Fitness Tracker 20 oktober: geen oefeningkaart', seen['Fitness Tracker 20 oktober (alleen verdwenen sets)'].endsWith('|0'), true);
  check('Kalender: 20 oktober is geen trainingsdag', /\|2026-10-12,2026-10-19$/.test(seen['Kalender']), true);
  check('Zoeken "crunch": alleen Weighted Crunch', seen['Zoeken "crunch"'].trim(), 'Weighted Crunch');
  check('AI-namenlijst: de nieuwe Plank één keer, de oude id plank blijft weg', await page.evaluate(() => [aiExerciseNameList().split('\n').filter(n => n === 'Plank').length, !!findExercise('plank'), findExercise('plank-hold').name]), [1, false, 'Plank']);
  check('Inzicht dag 20 oktober: geen training', /Crunches|25/.test(seen['Inzicht dag 20 oktober']), false);

  await browser.close();
  check('geen JS-fouten', errors, []);
});

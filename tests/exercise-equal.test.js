// Eigen en ingebouwde oefeningen zien er overal hetzelfde uit: dezelfde kleur, zoeken en Favorieten
// op naam (een bewerkte ingebouwde schuift niet naar achteren), en een eigen naam met <, & of
// aanhalingstekens verschijnt als tekst, nooit als HTML (lijst, Fitness Tracker, kalender,
// Samenvatting, plan, Dag bewerken, Inzicht). See PROJECT_CONTEXT.md ("Oefening-id's").
const H = require('./helpers');
const { check } = H;

const XSS = '<b>Vet</b> & "co" <img src=x onerror="window.__xss=1">';
const S = (w, r) => ({ weight: String(w), reps: String(r), rpe: '8', extra: '0', extraType: '' });
const DAYS = [{ id: 'd1', name: 'Push', weekday: 0, exercises: [{ exerciseId: 'ex-xss', name: XSS, sets: 3 }, { exerciseId: 'ex-gepland', name: XSS + ' gepland', sets: 2 }] }];
const DATA = {
  custom_exercises: [
    { id: 'ex-aaa', name: 'Aaa eigen', category: 'chest', type: 'weight_reps' },
    { id: 'ex-xss', name: XSS, category: 'chest', type: 'weight_reps' },
    { id: 'ex-gepland', name: XSS + ' gepland', category: 'chest', type: 'weight_reps' },
    { id: 'bench-press', name: 'Bench Press', category: 'chest', subcategory: 'sub-bench-press', type: 'weight_reps' }, // edited built-in
  ],
  favoriteExercises: { 'bench-press': true, 'ex-aaa': true, 'cable-crossover': true, 'ex-xss': true, squat: true },
  exerciseInfo: { 'ex-xss': { primaryMuscleGroup: 'chest', trackStrength: true }, 'ex-gepland': { primaryMuscleGroup: 'chest' }, 'bench-press': { primaryMuscleGroup: 'chest', trackStrength: true } },
  workouts: {
    '2026-10-12': [{ exerciseId: 'ex-xss', sets: [S(50, 8)] }],
    '2026-10-19': [{ exerciseId: 'ex-xss', sets: [S(60, 8), S(60, 8)] }, { exerciseId: 'bench-press', sets: [S(100, 5)] }],
  },
  plans: { p: { id: 'p', name: 'Plan', fixedDays: true, days: DAYS } },
  activePlan: { planId: 'p', planName: 'Plan', lastDayIndex: -1 },
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'p', planName: 'Plan', type: 'fixed', days: DAYS, restWeekdays: [1, 2, 3, 4, 5, 6] } },
  weekCycle: {}, sleep: {}, bodyWeight: {},
};

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 390, height: 1400 });
  await H.loadData(page, DATA);
  const sorted = names => JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' })));
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#exercise-list .exercise-item')].map(r => ({
    name: r.querySelector('.exercise-item-name').textContent, color: getComputedStyle(r.querySelector('.exercise-item-name')).color, cls: r.className })));

  // ── 1. Kleur: Borst met eigen, bewerkte en gewone ingebouwde oefeningen, alle groepen open
  await page.evaluate(() => { openExerciseList(); enterExerciseBrowseCategory('chest', 'Borst', () => {}); openExerciseGroups = new Set(['', ...subcategoriesOf('chest').map(s => s.id)]); renderExercisesInCategory('chest'); });
  await H.settle(page);
  const chest = await rows();
  check('Borst: één kleur voor alle namen (eigen, bewerkt, ingebouwd)', [...new Set(chest.map(r => r.color))].length, 1);
  check('Borst: geen aparte klasse voor eigen oefeningen', chest.every(r => r.cls === 'exercise-item list-row'), true);
  check('Borst: de tekstkleur, niet blauw', chest[0].color, await H.tokenColor(page, '--text'));
  // plan-add mode: same colour
  await page.evaluate(() => { currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0); openPlanDayAddExercises(0); enterExerciseBrowseCategory('chest', 'Borst', () => {}); openExerciseGroups = new Set(['', ...subcategoriesOf('chest').map(s => s.id)]); renderExercisesInCategory('chest'); });
  await H.settle(page);
  check('toevoegen vanuit een plandag: één kleur', [...new Set((await rows()).map(r => r.color))].length, 1);

  // ── 2. Volgorde: Favorieten en zoeken op naam
  await page.evaluate(() => { openExerciseList(); currentBrowseCategory = FAVORITES_CATEGORY; exerciseBrowserMode = 'exercises'; renderFavoriteExercises(); });
  const favs = (await rows()).map(r => r.name);
  check('Favorieten op naam', { sorted: sorted(favs), n: favs.length }, { sorted: true, n: 5 });
  check('Favorieten: bewerkte Bench Press op zijn plek, niet achteraan', favs.indexOf('Bench Press') < favs.indexOf('Cable Fly - High to Low') && favs.indexOf('Aaa eigen') < favs.indexOf('Bench Press'), true);
  const search = async q => { await page.evaluate(q => { const i = document.getElementById('exercise-search'); i.value = q; i.dispatchEvent(new Event('input')); }, q); return (await rows()).map(r => r.name); };
  const press = await search('press');
  check('zoeken "press": op naam', sorted(press), true);
  check('zoeken: bewerkte Bench Press vooraan bij de B', press.slice(0, 2), ['Bench Press', 'Bench Press - Close Grip']);
  const aaa = await search('e');
  check('zoeken "e": op naam, eigen Aaa eigen vóór de ingebouwde (niet achteraan)', [sorted(aaa), aaa.indexOf('Aaa eigen') < aaa.indexOf('Bench Press - Close Grip')], [true, true]);
  const xssRows = await search('vet');
  check('zoeken: naam met < en & als tekst', [xssRows, await page.evaluate(() => document.querySelectorAll('#exercise-list b, #exercise-list img').length)], [[XSS, XSS + ' gepland'], 0]);
  await search('');

  // ── 3. Naam als tekst op elk scherm (geen <b> of <img> uit de naam, de naam letterlijk te zien)
  const screens = {
    'Fitness Tracker': () => { currentDate = '2026-10-19'; showScreen('screen-fitness-tracker'); renderHome(); return document.getElementById('home-content'); },
    'Samenvatting': () => { openDayRecap(); return document.getElementById('recap-overlay'); },
    'Kalender: dag': () => { closeOverlay('recap-overlay'); openWorkoutDetail('2026-10-19'); return document.getElementById('cal-detail-body'); },
    'Plan: dagvoorbeeld': () => { closeOverlay('cal-detail-overlay'); openPlanDetail('p'); expandedPlanDayIndex = 0; renderPlanDetail(); return document.querySelector('.screen.active'); },
    'Dag bewerken': () => { currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0); return document.getElementById('pde-list'); },
    'Inzicht dag (gedaan en gepland)': () => { showScreen('screen-home'); openInsight(); openInsightDay('2026-10-19'); return document.querySelector('.screen.active'); },
    'Inzicht spiergroep Borst': () => { openInsightMuscle('chest'); return document.querySelector('.screen.active'); },
    'Inzicht Kracht Borst': () => { showScreen('screen-insight'); openInsightStrength(); openInsightCategory('chest'); return document.querySelector('.screen.active'); },
  };
  for (const [name, fn] of Object.entries(screens)) {
    const r = await page.evaluate(fn => {
      const el = (0, eval)('(' + fn + ')')();
      return { text: el.innerText, tags: el.querySelectorAll('b, img').length, xss: !!window.__xss,
        aria: [...el.querySelectorAll('[aria-label]')].some(a => a.getAttribute('aria-label').includes('<b>Vet</b>')) || ![...el.querySelectorAll('svg[aria-label]')].length };
    }, fn.toString()).catch(e => ({ fout: e.message }));
    await H.settle(page);
    check(`${name}: naam letterlijk, geen HTML uit de naam`, { naam: !!(r.text && r.text.includes('<b>Vet</b> & "co"')), tags: r.tags, xss: r.xss, fout: r.fout || null }, { naam: true, tags: 0, xss: false, fout: null });
  }
  check('Inzicht Kracht: aria-label van de grafiek met de naam letterlijk', await page.evaluate(() => [...document.querySelectorAll('.screen.active svg[aria-label]')].some(s => s.getAttribute('aria-label').startsWith('<b>Vet</b> & "co"'))), true);

  // ── 3b. Plan-, dag-, categorie- en subcategorienamen ook als tekst
  const N = '<i>X</i> & "q" <img src=x onerror="window.__xss=2">';
  await page.evaluate(N => {
    db.categories = { names: {}, custom: [{ id: 'custom-x', name: 'Cat ' + N }], deleted: [], subcategories: [{ id: 'sub-x', name: 'Sub ' + N, category: 'chest' }] };
    db.custom_exercises.push({ id: 'ex-cat', name: 'In eigen categorie', category: 'custom-x', type: 'weight_reps' });
    db.exerciseInfo['ex-cat'] = { trackStrength: true };
    db.workouts['2026-10-20'] = [{ exerciseId: 'ex-cat', sets: [{ weight: '40', reps: '10', rpe: '8', extra: '0', extraType: '' }] }];
    db.workouts['2026-10-13'] = [{ exerciseId: 'ex-cat', sets: [{ weight: '35', reps: '10', rpe: '8', extra: '0', extraType: '' }] }];
    db.plans.q = { id: 'q', name: 'Plan ' + N, fixedDays: true, createdAt: 2, days: [{ id: 'dq', name: 'Dag ' + N, weekday: 1, exercises: [{ exerciseId: 'squat', sets: 3, reps: 5 }] }] };
  }, N);
  const named = {
    'Trainingsplannen': () => { openWorkoutPlan(); return document.querySelector('.screen.active'); },
    'Plan: dagkaart': () => { openPlanDetail('q'); return document.querySelector('.screen.active'); },
    'Schema handmatig laden: plannen': () => { openSchedulePickPlan(); return document.querySelector('.screen.active'); },
    'Schema handmatig laden: dagen': () => { openSchedulePickDay('q'); return document.getElementById('schedule-pick-day-scroll'); },
    'Alle oefeningen: categorieën': () => { openExerciseList(); exerciseBrowserMode = 'categories'; currentBrowseCategory = null; renderCategoryBrowser(); return document.getElementById('exercise-list'); },
    'Keuzelijst Categorie': () => { openNewExerciseScreen(); document.getElementById('new-ex-category').click(); return document.getElementById('field-picker-list'); },
    'Keuzelijst Subcategorie': () => { closeOverlay('field-picker-overlay'); setNewExCategory('chest', 'Borst'); document.getElementById('new-ex-subcategory').click(); return document.getElementById('field-picker-list'); },
    'Inzicht: Kracht-kaart': () => { closeOverlay('field-picker-overlay'); showScreen('screen-home'); openInsight(); return document.querySelector('[data-insight-metric="strength"]'); },
    'Inzicht: scherm Kracht': () => { openInsightStrength(); return document.querySelector('.screen.active'); },
  };
  for (const [name, fn] of Object.entries(named)) {
    const r = await page.evaluate(fn => {
      const el = (0, eval)('(' + fn + ')')();
      return { text: el.innerText, tags: el.querySelectorAll('i, img').length, xss: !!window.__xss };
    }, fn.toString()).catch(e => ({ fout: e.message }));
    await H.settle(page);
    check(`${name}: naam letterlijk, geen HTML uit de naam`, { naam: !!(r.text && r.text.includes('<i>X</i> & "q"')), tags: r.tags, xss: r.xss, fout: r.fout || null }, { naam: true, tags: 0, xss: false, fout: null });
  }

  // ── 4. Type: Oefening bewerken toont het type van de ingebouwde
  const type = await page.evaluate(() => {
    openEditExerciseScreen(allExercises().find(e => e.id === 'treadmill')); const t = document.getElementById('new-ex-type').textContent.trim();
    openEditExerciseScreen(allExercises().find(e => e.id === 'squat')); return [t, document.getElementById('new-ex-type').textContent.trim()];
  });
  check('Oefening bewerken: Treadmill Duur, Squat Gewicht en reps', type, ['Duur', 'Gewicht en reps']);

  await browser.close();
  check('geen JS-fouten', errors, []);
});

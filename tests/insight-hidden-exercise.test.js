// Inzicht keeps counting the sets of a hidden (deleted, not permanently) exercise: in the week
// overview (Per dag and the Training card), the day overview and the training overview. Own data
// (a deleted custom exercise and a hidden built-in one), apart from the permanent-delete test in
// exercise-delete.test.js. See PROJECT_CONTEXT.md ("Oefening-id's": Verwijderen = verbergen).
const H = require('./helpers');
const { check } = H;

const S = () => ({ weight: '60', reps: '10', rpe: '8', extra: '0', extraType: '' });
const n = k => Array.from({ length: k }, S);
// Today: Thursday 22 October 2026 (week 43). Fixed days: Monday Push (the hidden custom exercise).
const DAYS = [{ id: 'd-push', name: 'Push', weekday: 0, exercises: [{ exerciseId: 'ex-verborgen', name: 'Verborgen press', sets: 3 }] }];
const DATA = {
  custom_exercises: [{ id: 'ex-verborgen', name: 'Verborgen press', category: 'chest', type: 'weight_reps', deleted: true }],
  hiddenBuiltins: { 'leg-press': true },
  exerciseInfo: { 'ex-verborgen': { primaryMuscleGroup: 'chest' }, 'leg-press': { primaryMuscleGroup: 'quads' } },
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'pp', planName: 'Push', type: 'fixed', days: DAYS, restWeekdays: [1, 2, 3, 4, 5, 6] } },
  weekCycle: {},
  workouts: {
    '2026-10-19': [{ exerciseId: 'ex-verborgen', sets: n(3) }],
    '2026-10-20': [{ exerciseId: 'leg-press', sets: n(2) }],
  },
};
// The same week with both exercises visible: Inzicht must show exactly the same.
const VISIBLE = { ...DATA, custom_exercises: [{ ...DATA.custom_exercises[0], deleted: false }], hiddenBuiltins: {} };

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1200 });
  const text = sel => page.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  const views = async data => {
    await H.loadData(page, data);
    await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
    await page.waitForTimeout(80);
    const week = {
      done: await page.evaluate(() => [...document.querySelectorAll('#insight-days .insight-done')].map(e => e.closest('[data-date]').dataset.date)),
      training: (await text('[data-insight-metric="training"]'))[0],
    };
    await page.evaluate(() => openInsightDay('2026-10-19')); await page.waitForTimeout(80);
    const monday = await text('#insight-day-training .insight-mg-row, #insight-day-training .insight-day-head');
    await page.evaluate(() => openInsightDay('2026-10-20')); await page.waitForTimeout(80);
    const tuesday = await text('#insight-day-training .insight-mg-row, #insight-day-training .insight-day-head');
    await page.evaluate(() => { showScreen('screen-insight'); openInsightTraining(); }); await page.waitForTimeout(80);
    const overview = { summary: (await text('#insight-training-body .insight-summary'))[0], rows: await text('#insight-training-body .insight-mg-row') };
    return { week, monday, tuesday, overview };
  };

  const hidden = await views(DATA);
  check('opzet: beide oefeningen zijn verborgen (niet in Alle oefeningen)', await page.evaluate(() => allExercises().filter(e => ['ex-verborgen', 'leg-press'].includes(e.id)).length), 0);
  check('weekoverzicht: maandag en dinsdag gedaan in Per dag', hidden.week.done, ['2026-10-19', '2026-10-20']);
  check('weekoverzicht: Training-kaart telt de 3 sets uit het schema en de 2 extra sets', hidden.week.training, 'TRAINING 3van 3 sets uit je schema · op schema · +2 extra 1 van 1 training');
  check('dagoverzicht maandag: Verborgen press telt mee (Borst, 3 sets)', hidden.monday.some(t => /Borst/.test(t) && /Verborgen press/.test(t) && /3/.test(t)), true);
  check('dagoverzicht dinsdag: Leg press telt mee (Quadriceps, 2 sets)', hidden.tuesday.some(t => /Leg press/.test(t) && /2/.test(t)), true);
  check('trainingsoverzicht: 5 sets in totaal', /^SETS 5\b/.test(hidden.overview.summary), true);
  check('trainingsoverzicht: Borst 3 sets (60%) en Quadriceps 2 sets (40%)', hidden.overview.rows.slice(0, 2), ['Borst 3 van 3 · op schema 60 %', 'Quadriceps 2 sets · extra 40 %']);

  const visible = await views(VISIBLE);
  check('verborgen of zichtbaar: weekoverzicht, dagoverzicht en trainingsoverzicht zijn gelijk', hidden, visible);

  await browser.close();
  check('geen JS-fouten', errors, []);
});

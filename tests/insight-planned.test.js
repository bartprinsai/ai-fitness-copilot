// Inzicht, "Gepland" only with a shortfall: planned exercises that weren't done are shown only when their
// muscle group has fewer sets done than planned (also none at all). A replacement within the same group
// that is on schedule (or has extra sets) shows no "Gepland". One rule (insightPlannedNotDone) for the day
// overview's "Gepland: …" and the muscle-group screen's "Gepland · 4 sets". The "Geen spiergroep" row
// compares per exercise, so a planned exercise without sets always shows there.
const H = require('./helpers');
const { check } = H;

const s = n => Array.from({ length: n }, () => ({ weight: 50, reps: 8 }));
const EX = [
  ['bench', 'Bench press', 'chest'], ['dbpress', 'Dumbbell press', 'chest'], ['fly', 'Cable fly', 'chest'],
  ['pushdown', 'Triceps pushdown', 'triceps'], ['dips', 'Dips', 'triceps'],
  ['ohp', 'Overhead press', 'front-delts'], ['frontraise', 'Front raise', 'front-delts'],
  ['lateral', 'Lateral raise', 'side-delts'], ['facepull', 'Face pull', null], ['band', 'Band pull-apart', null],
];
// Monday 19 October (week 43; today is Thursday 22): one plan day, the rest of the week rest days.
//   Borst      planned bench 4 + fly 2, done Dumbbell press 7  → op schema · +1 extra (replaced): no Gepland
//   Triceps    planned pushdown 3, done Dips 3                  → op schema (replaced): no Gepland
//   Voorste s. planned ohp 3 + front raise 2, done ohp 3        → 3 van 5 · −2 (partial): Gepland: Front raise
//   Zijkant s. planned lateral 3, nothing done                  → 0 van 3 · −3 (skipped): Gepland: Lateral raise
//   Geen spg.  planned face pull 2, done band pull-apart 3      → per exercise: Gepland: Face pull
const DATA = {
  custom_exercises: EX.map(([id, name]) => ({ id, name, category: 'chest' })),
  exerciseInfo: Object.fromEntries(EX.filter(e => e[2]).map(([id, , mg]) => [id, { primaryMuscleGroup: mg }])),
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'p', planName: 'Test 1', type: 'fixed', restWeekdays: [1, 2, 3, 4, 5, 6],
    days: [{ id: 'd1', name: 'Maandag', weekday: 0, exercises: [
      { exerciseId: 'bench', name: 'Bench press', sets: 4 }, { exerciseId: 'fly', name: 'Cable fly', sets: 2 },
      { exerciseId: 'pushdown', name: 'Triceps pushdown', sets: 3 }, { exerciseId: 'ohp', name: 'Overhead press', sets: 3 },
      { exerciseId: 'frontraise', name: 'Front raise', sets: 2 }, { exerciseId: 'lateral', name: 'Lateral raise', sets: 3 },
      { exerciseId: 'facepull', name: 'Face pull', sets: 2 }] }] } },
  weekCycle: {}, workoutPlanDays: {}, sleep: {}, bodyWeight: {},
  workouts: { '2026-10-19': [
    { exerciseId: 'dbpress', sets: s(7) }, { exerciseId: 'dips', sets: s(3) }, { exerciseId: 'ohp', sets: s(3) }, { exerciseId: 'band', sets: s(3) }] },
};

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1400 });
  await H.loadData(page, DATA);

  H.section('dagoverzicht');
  const day = await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); openInsightDay('2026-10-19');
    return [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r =>
      [...r.querySelectorAll('.insight-mg-main > .role-row, .insight-mg-main > .role-sub')].map(e => e.textContent + (e.classList.contains('insight-muted') ? ' [muted]' : '')));
  });
  day.forEach(r => console.log('     ' + r.join(' | ')));
  check('vervangen op schema met extra (Borst): geen Gepland', day.find(r => r[0] === 'Borst'), ['Borst', '6 van 6 · op schema · +1 extra', 'Dumbbell press · 7 sets']);
  check('vervangen op schema (Triceps): geen Gepland', day.find(r => r[0] === 'Triceps'), ['Triceps', '3 van 3 · op schema', 'Dips · 3 sets']);
  check('gedeeltelijk tekort (Voorste schouders): wel Gepland', day.find(r => r[0] === 'Voorste schouders'), ['Voorste schouders', '3 van 5 · −2', 'Overhead press · 3 sets', 'Gepland: Front raise [muted]']);
  check('overgeslagen spiergroep (Zijkant schouders): Gepland', day.find(r => r[0] === 'Zijkant schouders'), ['Zijkant schouders', '0 van 3 · −3', 'Gepland: Lateral raise [muted]']);
  check('Geen spiergroep (per oefening): geplande oefening zonder sets blijft zichtbaar', day.find(r => r[0] === 'Geen spiergroep'),
    ['Geen spiergroep', '0 van 2 · −2 · +3 extra', 'Band pull-apart · 3 sets', 'Gepland: Face pull [muted]']);

  H.section('detailscherm per spiergroep (week 43)');
  const list = id => page.evaluate(id => {
    insightWeekStart = '2026-10-19'; openInsightTraining(); openInsightMuscle(id);
    return [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')].map(r => [...r.querySelectorAll('.role-row, .role-sub, .insight-mg-figure')].map(e => e.textContent).join(' | '));
  }, id);
  check('Borst: vervangen op schema met extra, geen Gepland', await list('chest'), ['Dumbbell press | 7sets']);
  check('Triceps: vervangen op schema, geen Gepland', await list('triceps'), ['Dips | 3sets']);
  check('Voorste schouders: gedeeltelijk tekort, wel Gepland', await list('front-delts'), ['Overhead press | 3sets', 'Front raise | Gepland · 2 sets']);
  check('Zijkant schouders: overgeslagen, Gepland', await list('side-delts'), ['Lateral raise | Gepland · 3 sets']);
  check('Geen spiergroep: Face pull Gepland', await list(''), ['Band pull-apart | 3sets', 'Face pull | Gepland · 2 sets']);

  H.section('dezelfde regel op beide plekken');
  // Over all groups: the day overview shows "Gepland: X" exactly for the exercises the muscle-group
  // screen shows as "Gepland · N sets" (the week holds only this day).
  const same = await page.evaluate(() => {
    const out = [];
    for (const id of ['chest', 'triceps', 'front-delts', 'side-delts', '']) {
      openInsightDay('2026-10-19');
      const row = [...document.querySelectorAll('#insight-day-training .insight-mg-row')].find(r => r.querySelector('.role-row').textContent === insightMuscleName(id));
      const g = row.querySelector('.role-sub.insight-muted');
      const dayNames = g ? g.textContent.replace('Gepland: ', '').split(', ') : [];
      insightWeekStart = '2026-10-19'; openInsightTraining(); openInsightMuscle(id);
      const det = [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')].filter(r => /Gepland ·/.test(r.textContent)).map(r => r.querySelector('.role-row').textContent);
      out.push(JSON.stringify(dayNames.sort()) === JSON.stringify(det.sort()));
    }
    return out;
  });
  check('dagoverzicht en detailscherm tonen dezelfde geplande oefeningen', same, [true, true, true, true, true]);

  await browser.close();
  check('geen JS-fouten', errors, []);
});

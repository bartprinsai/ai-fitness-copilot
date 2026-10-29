// Inzicht, a Week A/B day whose week (A or B) isn't known: it is compared with the schedule nowhere
// (insightComparable, the one place that decides it). Its sets count in the totals and the shares per
// muscle group, never as planned, shortfall or extra — on the week's Training card, Maand, the training
// overview, the muscle-group screen and the day overview alike; and the days add up to the week.
const H = require('./helpers');
const { check } = H;

const s = n => Array.from({ length: n }, () => ({ weight: 50, reps: 8 }));
// Week 43 (today Thursday 22): the week is only recorded from Wednesday 21 (Week A). Monday 19 is a
// Week A/B day without a known week; Wednesday is Pull A (row 4, done 2); Thursday is a rest day.
const DATA = {
  custom_exercises: [{ id: 'bench', name: 'Bench press', category: 'chest' }, { id: 'row', name: 'Barbell row', category: 'back' }],
  exerciseInfo: { bench: { primaryMuscleGroup: 'chest' }, row: { primaryMuscleGroup: 'mid-back' } },
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'ab', planName: 'Push Pull', type: 'weekAB',
    restWeekdaysA: [1, 3, 4, 5, 6], restWeekdaysB: [1, 2, 3, 4, 5, 6],
    days: [
      { id: 'a1', name: 'Push A', weekday: 0, week: 'A', exercises: [{ exerciseId: 'bench', name: 'Bench press', sets: 4 }] },
      { id: 'a2', name: 'Pull A', weekday: 2, week: 'A', exercises: [{ exerciseId: 'row', name: 'Barbell row', sets: 4 }] },
      { id: 'b1', name: 'Push B', weekday: 0, week: 'B', exercises: [{ exerciseId: 'bench', name: 'Bench press', sets: 4 }] },
    ] } },
  weekCycle: { '2026-10-21': { effectiveFrom: '2026-10-21', planId: 'ab', week: 'A' } },
  workoutPlanDays: {}, sleep: {}, bodyWeight: {},
  workouts: { '2026-10-19': [{ exerciseId: 'bench', sets: s(3) }], '2026-10-21': [{ exerciseId: 'row', sets: s(2) }] },
};
const DAYS = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];

// The numbers in a summary line: { from, planned, shortfall, extra } (0 for "Geen vergelijking …").
function parse(note) {
  const n = (re, i = 1) => { const m = note.match(re); return m ? Number(m[i]) : 0; };
  return { from: n(/^(\d+) van (\d+) sets/), planned: n(/^(\d+) van (\d+) sets/, 2), shortfall: n(/−(\d+)/), extra: n(/\+(\d+) extra/) };
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1400 });
  await H.loadData(page, DATA);
  check('opzet: maandag zonder vastgelegde week, woensdag Week A', await page.evaluate(() => [getPlannedForDate('2026-10-19').status, getPlannedForDate('2026-10-21').status]), ['no-week', 'day']);
  check('één plek beslist: insightComparable', await page.evaluate(() => [insightDay('2026-10-19'), insightDay('2026-10-21')].map(insightComparable)), [false, true]);

  H.section('de dag zelf: overal dezelfde uitkomst');
  const day = await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); openInsightDay('2026-10-19');
    const b = document.getElementById('insight-day-training');
    return { schema: document.getElementById('insight-day-schema').textContent, sets: b.querySelector('.insight-summary-cols .insight-figure').textContent,
      note: b.querySelector('.insight-summary-note').textContent, rows: [...b.querySelectorAll('.insight-mg-row')].map(r => [r.querySelector('.role-row').textContent, r.querySelector('.insight-mg-main > .role-sub').textContent]) };
  });
  check('dagoverzicht maandag: geen vergelijking, sets tellen mee', day, { schema: 'Schema: Push Pull', sets: '3', note: 'Geen vergelijking met schema', rows: [['Borst', '3 sets']] });
  // The training overview over only that day (insightRange stubbed for a moment)
  const ovDay = await page.evaluate(() => {
    const real = insightRange; insightRange = () => ({ ...real(), from: '2026-10-19', to: '2026-10-19' });
    try { renderInsightTraining(); } finally { insightRange = real; }
    const b = document.getElementById('insight-training-body');
    return { note: b.querySelector('.insight-summary-note div').textContent, rows: [...b.querySelectorAll('.insight-mg-row')].map(r => [r.querySelector('.role-row').textContent, r.querySelector('.insight-mg-main > .role-sub').textContent]).filter(r => r[1] !== '0 sets') };
  });
  check('trainingsoverzicht over alleen maandag: ook geen vergelijking', ovDay, { note: '1 training · geen vergelijking met schema', rows: [['Borst', '3 sets']] });
  const card = await page.evaluate(() => {
    const real = insightRange; insightRange = () => ({ ...real(), from: '2026-10-19', to: '2026-10-19' });
    const days = [insightDay('2026-10-19')];
    try { return insightTrainingCardHtml(insightTrainingStats(days)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); } finally { insightRange = real; }
  });
  check('Training-kaart over alleen maandag: geen vergelijking', card, '3 sets 1 training · geen vergelijking met schema');

  H.section('de week: maandag is geen gepland, tekort of extra');
  const week = await page.evaluate(() => {
    showScreen('screen-home'); openInsight();
    const c = document.querySelector('[data-insight-metric="training"] .insight-edit-main');
    const card = [...c.children].slice(1).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    openInsightTraining();
    const b = document.getElementById('insight-training-body');
    const cols = [...b.querySelectorAll('.insight-summary-cols > div')].map(x => x.querySelector('.insight-figure').textContent);
    const rows = Object.fromEntries([...b.querySelectorAll('.insight-mg-row')].map(r => [r.dataset.insightMg, [r.querySelector('.insight-mg-main > .role-sub').textContent, r.querySelector('.insight-mg-figure').textContent]]));
    openInsightMuscle('chest');
    const chest = [...document.querySelectorAll('#insight-muscle-body .insight-summary-note div')].map(x => x.textContent);
    openInsightTraining();
    const ovNote = document.querySelector('#insight-training-body .insight-summary-note div').textContent;
    return { card, cols, ovNote, chest: rows.chest, back: rows['mid-back'], chestScreen: chest };
  });
  console.log('     ' + JSON.stringify(week));
  check('weekkaart: alleen woensdag vergeleken', week.card, ['50%van je schema', '2 van 4 sets · −2', '1 van 1 training']);
  check('trainingsoverzicht: SETS 5 (maandag telt mee)', week.cols[0], '5');
  check('trainingsoverzicht: vergelijking zonder maandag', week.ovNote, '2 van 4 sets uit je schema · −2');
  check('rij Borst: 3 sets, geen extra, 60%', week.chest, ['3 sets', '60%']);
  check('rij Middenrug: 2 van 4 · −2, 40%', week.back, ['2 van 4 · −2', '40%']);
  check('detailscherm Borst: geen gepland, tekort of extra', week.chestScreen, ['3 sets', '60% van al je sets']);
  const month = await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); insightSwitchPeriod('month'); renderInsight();
    const row = [...document.querySelectorAll('#insight-days .insight-table-row')].find(r => /\b43$/.test(r.children[0].textContent));
    return row.children[1].textContent;
  });
  check('Maand: week 43 50% (zelfde vergelijking)', month, '50%');

  H.section('de som van de dagen is de week');
  const days = [];
  for (const date of DAYS) {
    days.push(await page.evaluate(date => {
      openInsightDay(date);
      const b = document.getElementById('insight-day-training'), cols = b.querySelector('.insight-summary-cols');
      return { date, sets: cols ? Number(cols.querySelector('.insight-figure').textContent) : 0, note: cols ? b.querySelector('.insight-summary-note').textContent : '' };
    }, date));
  }
  days.forEach(d => console.log(`     ${d.date}: ${d.sets} sets · ${d.note || '(geen kolommen)'}`));
  const sum = days.reduce((a, d) => { const p = parse(d.note); return { sets: a.sets + d.sets, from: a.from + p.from, planned: a.planned + p.planned, shortfall: a.shortfall + p.shortfall, extra: a.extra + p.extra }; },
    { sets: 0, from: 0, planned: 0, shortfall: 0, extra: 0 });
  const wk = await page.evaluate(() => { const t = insightTrainingStats(insightWeekDays('2026-10-19')); return { sets: t.doneSets, from: t.fromSchedule, planned: t.plannedSets, shortfall: t.shortfall, extra: t.extra }; });
  check('som van de dagen = week (sets, uit je schema, gepland, tekort, extra)', sum, wk);
  check('en dat is: 5 sets, 2 van 4, −2, geen extra', wk, { sets: 5, from: 2, planned: 4, shortfall: 2, extra: 0 });

  await browser.close();
  check('geen JS-fouten', errors, []);
});

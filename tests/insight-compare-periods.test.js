// Inzicht, Week / Maand / Jaar alike: the same days give the same sets, shortfall and extra sets in a week,
// a month and a year, also when the month has other days with logged sets but nothing to compare them with
// (no version, no schedule, a sequential schedule); the Training card has the same build-up in all three
// ("100% van je schema" / sets with the comparison / trainings); and the columns Training · Voeding ·
// Slaap · Gewicht of the tables PER WEEK (Maand) and PER MAAND (Jaar) sit at exactly the same place.
const H = require('./helpers');
const { check, ok } = H;

const S = () => ({ weight: '50', reps: '10', rpe: '8', extra: '0', extraType: '' });
const n = k => Array.from({ length: k }, S);
const ex = (id, name, sets) => ({ exerciseId: id, name, sets });
// Today: Thursday 29 October 2026 (week 44 = 26 Oct – 1 Nov).
//   before 10 Oct: no version · 10 Oct: no schedule · 15 Oct: sequential · 26 Oct: fixed days
//   fixed: Mon bench 4 + squat 4, Wed lat 4, Thu bench 4 → planned 16 up to today
//   done in week 44: Mon bench 2 (−2) + squat 4 + curl 1 (biceps not planned: +1), Wed lat 4, Thu bench 4
//   → 14 of 16 · −2 · +1 extra, 3 of 3 trainings
//   done earlier in October, on days without a comparison: 2 Oct bench 3 + curl 2, 13 Oct squat 5, 20 Oct lat 2
const DATA = {
  custom_exercises: [], weekCycle: {}, sleep: {}, bodyWeight: {},
  exerciseInfo: { 'bench-press': { primaryMuscleGroup: 'chest' }, squat: { primaryMuscleGroup: 'quads' },
    'lat-pulldown': { primaryMuscleGroup: 'lats' }, 'barbell-curl': { primaryMuscleGroup: 'biceps' } },
  scheduleVersions: {
    '2026-10-10': { effectiveFrom: '2026-10-10', planId: null },
    '2026-10-15': { effectiveFrom: '2026-10-15', planId: 'seq', planName: 'Doorlopend', type: 'sequential', days: [{ id: 's1', name: 'Dag 1', exercises: [ex('lat-pulldown', 'Lat pulldown', 3)] }] },
    '2026-10-26': { effectiveFrom: '2026-10-26', planId: 'fx', planName: 'Vast', type: 'fixed', restWeekdays: [], days: [
      { id: 'a', name: 'Ma', weekday: 0, exercises: [ex('bench-press', 'Bench press', 4), ex('squat', 'Squat', 4)] },
      { id: 'b', name: 'Wo', weekday: 2, exercises: [ex('lat-pulldown', 'Lat pulldown', 4)] },
      { id: 'c', name: 'Do', weekday: 3, exercises: [ex('bench-press', 'Bench press', 4)] }] },
  },
  workouts: {
    '2026-10-02': [{ exerciseId: 'bench-press', sets: n(3) }, { exerciseId: 'barbell-curl', sets: n(2) }],
    '2026-10-13': [{ exerciseId: 'squat', sets: n(5) }],
    '2026-10-20': [{ exerciseId: 'lat-pulldown', sets: n(2) }],
    '2026-10-26': [{ exerciseId: 'bench-press', sets: n(2) }, { exerciseId: 'squat', sets: n(4) }, { exerciseId: 'barbell-curl', sets: n(1) }],
    '2026-10-28': [{ exerciseId: 'lat-pulldown', sets: n(4) }],
    '2026-10-29': [{ exerciseId: 'bench-press', sets: n(4) }],
  },
};

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1400, now: '2026-10-29T12:00:00+01:00' });
  await H.loadData(page, DATA, 'light');

  // ── the numbers: the same days, the same comparison ────────────────────────────────────────
  H.section('dezelfde dagen, dezelfde sets, hetzelfde tekort, dezelfde extra sets');
  const stats = (from, to) => page.evaluate(([f, t]) => {
    const s = insightTrainingStats(insightRangeDays(f, t));
    const rows = insightMuscleRows(s).filter(r => r.planned || r.extra || r.counted).map(r => [r.id, r.planned, r.counted, r.extra]).sort((a, b) => a[0].localeCompare(b[0])); // by id: the display order follows the share of all sets
    return { compare: s.compare, planned: s.plannedSets, fromSchedule: s.fromSchedule, shortfall: s.shortfall, extra: s.extra, trainings: [s.doneTrainings, s.plannedTrainings], rows };
  }, [from, to]);
  const week = await stats('2026-10-26', '2026-11-01');
  const month = await stats('2026-10-01', '2026-10-31');
  const year = await stats('2026-01-01', '2026-12-31');
  check('week 44: 14 van 16 · −2 · +1 extra, 3 van 3 trainingen', [week.planned, week.fromSchedule, week.shortfall, week.extra, week.trainings], [16, 14, 2, 1, [3, 3]]);
  check('oktober = week 44 (sets, tekort, extra, trainingen, per spiergroep)', month, week);
  check('2026 = week 44', year, week);
  check('per spiergroep: borst −2, biceps +1 extra (alleen de set van 26 oktober)', week.rows, [['biceps', 0, 0, 1], ['chest', 8, 6, 0], ['lats', 4, 4, 0], ['quads', 4, 4, 0]]);
  // Done sets on days without a comparison still count as done (SETS, % of all your sets) — just not as extra.
  check('gedane sets: oktober telt ook de dagen zonder vergelijking mee', await page.evaluate(() => [
    insightTrainingStats(insightRangeDays('2026-10-26', '2026-11-01')).doneSets, insightTrainingStats(insightRangeDays('2026-10-01', '2026-10-31')).doneSets]), [15, 27]);

  // ── the Training card: one build-up in Week, Maand and Jaar ───────────────────────────────
  H.section('Training-kaart');
  const card = period => page.evaluate(p => {
    showScreen('screen-home'); openInsight(); if (p !== 'week') insightSwitchPeriod(p); renderInsight();
    const c = document.querySelector('[data-insight-metric="training"] .insight-edit-main');
    return [...c.children].slice(1).map(ch => ch.textContent);
  }, period);
  const wc = await card('week'), mc = await card('month'), yc = await card('year');
  check('Week: "88% van je schema" / sets met vergelijking / trainingen', wc, ['88%van je schema', '14 van 16 sets · −2 · +1 extra', '3 van 3 trainingen']);
  check('Maand: dezelfde kaart', mc, wc);
  check('Jaar: dezelfde kaart', yc, wc);
  const style = await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); renderInsight();
    const c = document.querySelector('[data-insight-metric="training"] .insight-edit-main'), f = el => { const s = getComputedStyle(el); return s.fontSize + '/' + s.fontWeight; };
    return [f(c.querySelector('.insight-pct .set-val')), f(c.querySelector('.insight-pct .set-unit')), f(c.querySelector('.insight-figure > .set-unit')), ...[...c.querySelectorAll(':scope > .role-sub')].map(f)];
  });
  check('Week: percentage Groot getal, %-teken en "van je schema" 12px/400, regels eronder Klein', style, ['20px/700', '12px/400', '12px/400', '12px/400', '12px/400']);
  // No comparison (week 43: a sequential schedule only): as before
  const seq = await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); insightStep(-1); renderInsight();
    return [...document.querySelector('[data-insight-metric="training"] .insight-edit-main').children].slice(1).map(ch => ch.textContent);
  });
  check('Week 43, doorlopend schema: zoals het was', seq, ['2sets', '1 training · geen vergelijking met schema']);
  // the day overview of a day without a schedule: still no comparison
  check('dagoverzicht 13 oktober (geen schema): geen vergelijking', await page.evaluate(() => {
    showScreen('screen-home'); openInsight(); openInsightDay('2026-10-13');
    return document.querySelectorAll('#insight-day-training .insight-day-head .role-sub')[1].textContent;
  }), '5 sets · geen vergelijking met schema');

  // ── fixed columns in the tables PER WEEK (Maand) and PER MAAND (Jaar) ─────────────────────
  H.section('vaste kolommen bij Maand en Jaar');
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 1400 });
    await H.loadData(page, DATA, theme);
    const table = period => page.evaluate(p => {
      showScreen('screen-home'); openInsight(); insightSwitchPeriod(p); renderInsight();
      const rows = [...document.querySelectorAll('#insight-days .insight-table-row')];
      const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; };
      return {
        head: [...rows[0].children].map(box),
        // the values centred in their column: the text's middle on the column's middle
        centred: rows.slice(1).every(row => [...row.children].slice(1).every(cell => {
          const range = document.createRange(); range.selectNodeContents(cell);
          const t = range.getBoundingClientRect(), c = cell.getBoundingClientRect();
          return Math.abs((t.left + t.width / 2) - (c.left + c.width / 2)) < 1;
        })),
        cut: rows.filter(row => [...row.children].some(cell => cell.scrollWidth > cell.clientWidth + 0.5)).map(row => row.children[0].textContent),
        labels: rows.slice(1).map(row => row.children[0].textContent),
      };
    }, period);
    const m = await table('month'), y = await table('year');
    const tag = `${theme} ${w}`;
    check(`${tag}: eerste kolom even breed in Maand en Jaar`, m.head[0], y.head[0]);
    check(`${tag}: Training, Voeding, Slaap en Gewicht op exact dezelfde plek`, m.head.slice(1), y.head.slice(1));
    ok(new Set(m.head.slice(1).map(c => c[1])).size === 1, `${tag}: de vier kolommen zijn even breed`, m.head);
    ok(m.centred && y.centred, `${tag}: waarden gecentreerd in hun kolom`, [m.centred, y.centred]);
    check(`${tag}: niets afgekapt (ook "September")`, [m.cut, y.cut, y.labels.includes('September')], [[], [], true]);
  }

  check('geen JS-fouten', errors, []);
  await browser.close();
});

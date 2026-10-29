// Inzicht, Maand and Jaar: period buttons, the per-week / per-month tables, cards, zooming in and out,
// detail screens in Maand and Jaar, layout; and the back chain (browser back and the back arrow).
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const S = (o = {}) => ({ weight: '50', reps: '10', rpe: '8', extra: '0', extraType: '', ...o });
const n = k => Array.from({ length: k }, () => S());
const ex = (id, name, sets) => ({ exerciseId: id, name, sets });
// Today: Thursday 22 October 2026.
//   2026-01-05 Push Pull Legs (Mon Push: bench 4, Wed Pull: lat 4, Thu Legs: squat 4)
//   2026-06-01 Upper Lower (Tue Upper: bench 3 + lat 3, Fri Lower: squat 4)
//   2026-10-15 Full Body (Mon + Thu: bench 2 + squat 2)        — no version at all in 2025
const V = (from, planId, planName, days) => ({ effectiveFrom: from, planId, planName, type: 'fixed', days, restWeekdays: [] });
const DATA = {
  custom_exercises: [],
  exerciseInfo: { 'bench-press': { primaryMuscleGroup: 'chest' }, 'lat-pulldown': { primaryMuscleGroup: 'lats', secondaryMuscleGroups: ['biceps'] },
    squat: { primaryMuscleGroup: 'quads' }, 'barbell-curl': { primaryMuscleGroup: 'biceps' } },
  scheduleVersions: {
    '2026-01-05': V('2026-01-05', 'ppl', 'Push Pull Legs', [
      { id: 'a', name: 'Push', weekday: 0, exercises: [ex('bench-press', 'Bench press', 4)] },
      { id: 'b', name: 'Pull', weekday: 2, exercises: [ex('lat-pulldown', 'Lat pulldown', 4)] },
      { id: 'c', name: 'Legs', weekday: 3, exercises: [ex('squat', 'Squat', 4)] }]),
    '2026-06-01': V('2026-06-01', 'ul', 'Upper Lower', [
      { id: 'd', name: 'Upper', weekday: 1, exercises: [ex('bench-press', 'Bench press', 3), ex('lat-pulldown', 'Lat pulldown', 3)] },
      { id: 'e', name: 'Lower', weekday: 4, exercises: [ex('squat', 'Squat', 4)] }]),
    '2026-10-15': V('2026-10-15', 'fb', 'Full Body', [
      { id: 'f', name: 'Full A', weekday: 0, exercises: [ex('bench-press', 'Bench press', 2), ex('squat', 'Squat', 2)] },
      { id: 'g', name: 'Full B', weekday: 3, exercises: [ex('bench-press', 'Bench press', 2), ex('squat', 'Squat', 2)] }]),
  },
  weekCycle: {},
  workouts: {
    '2025-03-10': [{ exerciseId: 'bench-press', sets: n(3) }], '2025-03-12': [{ exerciseId: 'squat', sets: n(2) }],
    '2026-01-12': [{ exerciseId: 'bench-press', sets: n(4) }],
    '2026-09-29': [{ exerciseId: 'bench-press', sets: n(3) }, { exerciseId: 'lat-pulldown', sets: n(1) }], // week 40, in September
    '2026-10-02': [{ exerciseId: 'squat', sets: n(4) }],                                                  // week 40, in October
    '2026-10-06': [{ exerciseId: 'bench-press', sets: n(3) }, { exerciseId: 'lat-pulldown', sets: n(3) }, { exerciseId: 'barbell-curl', sets: n(2) }],
    '2026-10-13': [{ exerciseId: 'bench-press', sets: n(3) }, { exerciseId: 'lat-pulldown', sets: n(3) }],
    '2026-10-15': [{ exerciseId: 'bench-press', sets: n(2) }, { exerciseId: 'squat', sets: n(2) }],
    '2026-10-19': [{ exerciseId: 'bench-press', sets: n(2) }, { exerciseId: 'squat', sets: n(1) }],
  },
  sleep: {
    '2026-10-06': { bedtime: '00:30', wakeTime: '06:30' }, '2026-10-07': { bedtime: '01:00', wakeTime: '06:40' }, // week 41: short
    '2026-10-13': { bedtime: '23:00', wakeTime: '07:00' }, '2026-10-16': { bedtime: '22:30', wakeTime: '07:00' }, // week 42
    '2026-10-23': undefined,
    '2026-09-15': { bedtime: '23:00', wakeTime: '07:30' }, '2026-02-10': { bedtime: '00:00', wakeTime: '06:00' },
  },
  bodyWeight: {
    '2026-01-10': 101.4, '2026-01-20': 101.0,          // January 101,2
    '2026-09-10': 99.2, '2026-09-20': 99.0,            // September 99,1
    '2026-10-05': 98.6, '2026-10-12': 98.4, '2026-10-19': 98.5, // October 98,5 → −0,6 t.o.v. september
    '2025-12-20': 103.0,                                // 2025: one month only
  },
};
delete DATA.sleep['2026-10-23'];

async function setup(page, data = DATA, theme = 'light') {
  await H.loadData(page, data, theme);
  await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
  await H.settle(page);
}
const main = page => page.evaluate(() => ({
  periods: [...document.querySelectorAll('#insight-head .time-filter')].map(b => (b.classList.contains('active') ? '*' : '') + b.textContent + (b.disabled ? '(uit)' : '')),
  title: document.querySelector('#insight-head .insight-nav-title').textContent,
  dateLine: !!document.querySelector('#insight-head .insight-meta'),
  nextDisabled: document.querySelector('#insight-head [data-insight-step="1"]').disabled,
  schema: document.getElementById('insight-schema').textContent,
  label: document.getElementById('insight-days-label').textContent,
  table: [...document.querySelectorAll('#insight-days .insight-table-row')].map(r => [...r.children].map(c => c.textContent).join(' | ') + (r.tagName === 'BUTTON' ? '' : r.classList.contains('is-future') ? '  (grijs, niet tikbaar)' : '')),
  cards: [...document.querySelectorAll('#insight-cards .insight-card')].map(c => [...c.querySelectorAll('.insight-figure, .role-sub, .insight-empty')].map(e => e.textContent).join(' / ')),
}));
const click = async (page, sel) => { await page.click(sel); await H.settle(page); };
const active = page => page.evaluate(() => document.querySelector('.screen.active').id);
const headOf = (page, screen) => page.evaluate(s => document.querySelector(`#${s} .insight-nav-title`).textContent, screen);
const show = o => console.log(JSON.stringify(o, null, 2).split('\n').map(l => '     ' + l).join('\n'));

// Maand and Jaar on the main screen and the detail screens.
async function monthAndYear(page) {

  // ── Week stays as it was
  await setup(page);
  const w = await main(page);
  check('Week: knoppen aan, titel, datumregel, schemaregel, PER DAG', [w.periods, w.title, w.dateLine, w.schema, w.label],
    [['*Week', 'Maand', 'Jaar'], 'Week 43', true, 'Schema: Full Body', 'Per dag']);

  // ── Week → Maand: October 2026 (current month)
  await click(page, '#insight-head [data-insight-period="month"]');
  const m = await main(page);
  console.log('     OKTOBER 2026 (vandaag do 22 okt, vandaag nog geen set):'); show(m);
  check('Maand: titel, geen datumregel, rechts uit', [m.title, m.dateLine, m.nextDisabled, m.label], ['Oktober 2026', false, true, 'Per week']);
  check('Maand: schemaregel met wissel', m.schema, 'Schema: Upper Lower · vanaf 15 oktober Full Body');
  check('Maand: tabel', m.table, [
    'Week | Training | Voeding | Slaap | Gewicht',
    'Week 40 | 100% | – | – | –',
    'Week 41 | 60% | – | 5:50 | 98,6',
    'Week 42 | 100% | – | 8:15 | 98,4',
    'Week 43 | 75% | – | – | 98,5',
    'Week 44 | – | – | – | –  (grijs, niet tikbaar)',
  ]);
  check('Maand: Training-kaart', m.cards[0], '82%van je schema / 82% / 23 van 28 sets · −5 · +2 extra / 5 van 6 trainingen');
  check('Maand: Slaap- en Gewicht-kaart', [m.cards[2], m.cards[3]], ['7:03u gemiddeld / Kortste nacht: woensdag 7 oktober, 5:40 u', '98,5kg gemiddeld / −0,6 kg t.o.v. september']);
  const colours = await page.evaluate(() => {
    const tok = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const rows = [...document.querySelectorAll('#insight-days .insight-table-row')];
    const c = (r, i) => getComputedStyle(rows[r].children[i]).color;
    return { pct100: c(1, 1) === tok('--success'), pct60: c(2, 1) === tok('--text'), shortSleep: c(2, 3) === tok('--danger'), sleepOk: c(3, 3) === tok('--text'),
      dash: c(1, 2) === tok('--text-muted'), futureLabel: c(5, 0) === tok('--text-muted'), head: c(0, 1) === tok('--text-secondary'),
      font: getComputedStyle(rows[1].children[1]).fontSize, minH: Math.min(...rows.slice(1).map(r => r.getBoundingClientRect().height)) };
  });
  check('Maand: kleuren (100% groen, 60% tekst, slaap <7:00 rood, – grijs, toekomst grijs, kop secundair), 12px, rij ≥ 48px',
    [colours.pct100, colours.pct60, colours.shortSleep, colours.sleepOk, colours.dash, colours.futureLabel, colours.head, colours.font, colours.minH >= 48],
    [true, true, true, true, true, true, true, '12px', true]);
  // Week 40 in September counts Sep 28–30 only
  await click(page, '#insight-head [data-insight-step="-1"]');
  const sep = await main(page);
  check('September: titel, rechts aan, schemaregel', [sep.title, sep.nextDisabled, sep.schema], ['September 2026', false, 'Schema: Upper Lower']);
  check('September: week 40 telt alleen 28–30 sep (Upper 6 gepland, 4 gedaan → 67%)', sep.table.find(r => r.startsWith('Week 40')), 'Week 40 | 67% | – | – | –');
  await click(page, '#insight-head [data-insight-step="1"]');

  // ── Today rule: a set today changes only the current week / month
  const withToday = JSON.parse(JSON.stringify(DATA)); withToday.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: n(2) }];
  await setup(page, withToday);
  await click(page, '#insight-head [data-insight-period="month"]');
  const mt = await main(page);
  check('na eerste set vandaag: week 43 = (2+1+0+2) / 8 = 63%', mt.table.find(r => r.startsWith('Week 43')), 'Week 43 | 63% | – | – | 98,5');
  console.log('     Training-kaart oktober na eerste set: ' + mt.cards[0]);
  await setup(page);
  await click(page, '#insight-head [data-insight-period="month"]');

  // ── Maand → Jaar
  await click(page, '#insight-head [data-insight-period="year"]');
  const y = await main(page);
  console.log('     2026:'); show({ title: y.title, schema: y.schema, label: y.label, table: y.table, cards: y.cards });
  check('Jaar: titel, rechts uit, schemaregel, PER MAAND', [y.title, y.nextDisabled, y.schema, y.label], ['2026', true, "Schema's: Push Pull Legs, Upper Lower, Full Body", 'Per maand']);
  check('Jaar: 12 maanden, nov/dec grijs', [y.table.length, y.table[11].endsWith('(grijs, niet tikbaar)'), y.table[12].endsWith('(grijs, niet tikbaar)'), y.table[10].includes('(grijs')], [13, true, true, false]);
  check('Jaar: gewichtsregel', y.cards[3], '99,4kg gemiddeld / Van 101,2 kg in januari naar 98,5 kg in oktober');
  // 2025: no schedule version at all; weight in one month only
  await click(page, '#insight-head [data-insight-step="-1"]');
  const y25 = await main(page);
  check('2025: schemaregel, training "–" in alle maanden', [y25.schema, y25.table.slice(1).every(r => r.split(' | ')[1] === '–')], ['Geen schema bekend', true]);
  check('2025: Training-kaart zonder vergelijking, gewicht zonder regel (één maand)', [y25.cards[0], y25.cards[3]], ['5sets / 2 trainingen · geen vergelijking met schema', '103kg gemiddeld']);
  // Jaar (2025) → Maand: January 2025; Maand → Week: the week with 1 January (Mon 30 Dec 2024 = week 1)
  await click(page, '#insight-head [data-insight-period="month"]');
  const jan = await main(page);
  check('Jaar 2025 → Maand: januari 2025, gewicht zonder vorige maand', [jan.title, jan.cards[3]], ['Januari 2025', 'Nog geen gewicht ingevuld']);
  await click(page, '#insight-head [data-insight-period="week"]');
  check('Maand jan 2025 → Week: de week met 1 januari', [(await main(page)).title, await page.evaluate(() => insightWeekStart)], ['Week 1', '2024-12-30']);
  // Year → Month in the current year: the current month
  await click(page, '#insight-head [data-insight-period="year"]');
  check('Week (30 dec 2024) → Jaar: 2024', (await main(page)).title, '2024');
  await page.evaluate(() => { insightYearStart = '2026-01-01'; renderInsight(); });
  await click(page, '#insight-head [data-insight-period="month"]');
  check('Jaar 2026 → Maand: de huidige maand', (await main(page)).title, 'Oktober 2026');
  await click(page, '#insight-head [data-insight-period="week"]');
  check('Maand (huidig) → Week: de huidige week', (await main(page)).title, 'Week 43');
  // Week → Maand uses the Monday: week 40 (Mon 28 Sep) → September
  await page.evaluate(() => { insightWeekStart = '2026-09-28'; renderInsight(); });
  await click(page, '#insight-head [data-insight-period="month"]');
  check('Week 40 (ma 28 sep) → Maand: september', (await main(page)).title, 'September 2026');
  // January 2026: weight without a previous month; one sleep night in Feb
  await page.evaluate(() => { insightMonthStart = '2026-01-01'; renderInsight(); });
  check('januari 2026: met vorige maand (dec 2025 = 103) → regel', (await main(page)).cards[3], '101,2kg gemiddeld / −1,8 kg t.o.v. december');
  await page.evaluate(() => { insightMonthStart = '2026-09-01'; renderInsight(); });
  check('september 2026: augustus zonder gewicht → geen regel', (await main(page)).cards[3], '99,1kg gemiddeld');

  // ── Tap a row: a week (Maand) → Week; a month (Jaar) → Maand; a future row does nothing
  await page.evaluate(() => { insightMonthStart = '2026-10-01'; renderInsight(); });
  await click(page, '#insight-days [data-insight-open="week:2026-10-05"]');
  const tw = await main(page);
  check('tik op Week 41 → Week 41', [tw.periods[0], tw.title], ['*Week', 'Week 41']);
  await click(page, '#insight-head [data-insight-period="year"]');
  await click(page, '#insight-days [data-insight-open="month:2026-09-01"]');
  check('tik op September → Maand september', [(await main(page)).periods[1], (await main(page)).title], ['*Maand', 'September 2026']);
  await click(page, '#insight-head [data-insight-period="year"]');
  await page.click('#insight-days .is-future'); await H.settle(page);
  check('tik op een toekomstige maand doet niets', (await main(page)).title, '2026');

  // ── Detail screens in Maand and Jaar, and back
  await page.evaluate(() => { insightPeriod = 'month'; insightMonthStart = '2026-10-01'; renderInsight(); });
  await click(page, '[data-insight-metric="sleep"]');
  const sl = await page.evaluate(() => ({
    head: document.querySelector('#insight-metric-head .insight-nav-title').textContent,
    periods: [...document.querySelectorAll('#insight-metric-head .time-filter')].map(b => (b.classList.contains('active') ? '*' : '') + b.textContent),
    note: [...document.querySelectorAll('#insight-metric-body .insight-summary-note div')].map(d => d.textContent),
    label: document.querySelector('#insight-metric-body .insight-label').textContent,
    axis: [...document.querySelectorAll('#insight-chart .insight-chart-day')].map(t => t.textContent),
    bars: [...document.querySelectorAll('#insight-chart .insight-bar')].map(b => b.classList.contains('is-short') ? 'rood' : 'blauw'),
    rows: [...document.querySelectorAll('#insight-metric-body .insight-list-row')].map(r => r.innerText.replace(/\n/g, ' | ')),
  }));
  console.log('     SLAAP, OKTOBER:'); show(sl);
  check('Slaap maand: kop, periode, kortste/langste met datum', [sl.head, sl.periods[1], sl.note], ['Oktober 2026', '*Maand', ['Kortste nacht: woensdag 7 oktober, 5:40 u', 'Langste nacht: vrijdag 16 oktober, 8:30 u']]);
  check('Slaap maand: x-as weeknummers, staaf <7:00 rood', [sl.axis, sl.bars], [['40', '41', '42', '43', '44'], ['rood', 'blauw']]);
  check('Slaap maand: lijst PER WEEK', [sl.label, sl.rows], ['per week', ['Week 40 | Niet ingevuld', 'Week 41 | 00:45 – 06:35 | 5:50 | u', 'Week 42 | 22:45 – 07:00 | 8:15 | u', 'Week 43 | Niet ingevuld']]);
  await click(page, '#insight-metric-body [data-insight-open="week:2026-10-12"]');
  check('tik op Week 42 in de lijst → detail in Week 42', [await headOf(page, 'screen-insight-metric'), await page.evaluate(() => document.querySelector('#insight-metric-body .insight-label').textContent)], ['Week 42', 'Nachten']);
  await click(page, '#insight-metric-head [data-insight-period="year"]');
  const sly = await page.evaluate(() => ({ axis: [...document.querySelectorAll('#insight-chart .insight-chart-day')].map(t => t.textContent),
    bars: [...document.querySelectorAll('#insight-chart .insight-bar')].map(b => b.classList.contains('is-short') ? 'rood' : 'blauw'),
    rows: [...document.querySelectorAll('#insight-metric-body .insight-list-row')].length }));
  check('Slaap jaar: x-as maanden, staven (feb 6:00 rood, sep 8:30, okt 7:03)', sly, { axis: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'], bars: ['rood', 'blauw', 'blauw'], rows: 10 });
  // Oktober → (inzoomen) Week 42 → (bladeren) Jaar: terug gaat eerst naar de periode op het moment
  // van inzoomen (Oktober, op Slaap), en pas daarna naar het hoofdscherm, in de periode die je het
  // laatst bekeek (gedeeld: Oktober).
  await page.goBack(); await H.settle(page);
  const metricPeriod = () => page.evaluate(() => document.querySelector('#insight-metric-head .time-filter.active').textContent);
  check('terug uit Slaap (jaar, na inzoomen) → Slaap in Oktober 2026', [await active(page), await headOf(page, 'screen-insight-metric'), await metricPeriod()], ['screen-insight-metric', 'Oktober 2026', 'Maand']);
  await page.goBack(); await H.settle(page);
  check('nog eens terug → hoofdscherm in Oktober 2026', [await active(page), (await main(page)).title, (await main(page)).periods[1]], ['screen-insight', 'Oktober 2026', '*Maand']);
  await click(page, '#insight-head [data-insight-period="year"]');
  await click(page, '[data-insight-metric="weight"]');
  const wy = await page.evaluate(() => ({ cols: [...document.querySelectorAll('#insight-metric-body .insight-summary-cols > div')].map(c => c.textContent),
    note: document.querySelector('#insight-metric-body .insight-summary-note').textContent,
    points: document.querySelectorAll('#insight-chart .insight-point').length, ticks: [...document.querySelectorAll('#insight-chart .insight-chart-tick')].map(t => t.textContent),
    rows: [...document.querySelectorAll('#insight-metric-body .insight-list-row')].map(r => r.innerText.replace(/\n/g, ' | ')).filter(t => !t.includes('Niet ingevuld')) }));
  console.log('     GEWICHT, 2026:'); show(wy);
  check('Gewicht jaar: samenvatting en regel', [wy.cols, wy.note], [['Gemiddeld99,4kg', 'Laagste98,4kg', 'Hoogste101,4kg'], 'Van 101,2 kg in januari naar 98,5 kg in oktober']);
  check('Gewicht jaar: 3 punten (jan, sep, okt), as rond 100', [wy.points, wy.rows], [3, ['Januari | 101,2 | kg', 'September | 99,1 | kg', 'Oktober | 98,5 | kg']]);
  await click(page, '#insight-metric-head [data-insight-period="month"]');
  check('Gewicht: Jaar → Maand = oktober, regel t.o.v. september', [await headOf(page, 'screen-insight-metric'), await page.evaluate(() => document.querySelector('#insight-metric-body .insight-summary-note').textContent)], ['Oktober 2026', '−0,6 kg t.o.v. september']);
  await click(page, '#btn-back-insight-metric'); await H.settle(page);
  check('terugpijl → hoofdscherm in Maand oktober', [(await main(page)).periods[1], (await main(page)).title], ['*Maand', 'Oktober 2026']);
  // Training and muscle group in Maand
  await click(page, '[data-insight-metric="training"]');
  const tr = await page.evaluate(() => ({ head: document.querySelector('#insight-training-head .insight-nav-title').textContent, schema: document.getElementById('insight-training-schema').textContent,
    totals: [...document.querySelectorAll('#insight-training-body .insight-summary-cols > div')].map(c => c.textContent),
    note: [...document.querySelectorAll('#insight-training-body .insight-summary-note div')].map(d => d.textContent),
    rows: [...document.querySelectorAll('.insight-mg-list .insight-mg-row')].slice(0, 4).map(r => r.innerText.replace(/\n/g, ' | ')) }));
  console.log('     TRAINING, OKTOBER:'); show(tr);
  check('Training maand: kop, schemaregel, totalen', [tr.head, tr.schema, tr.totals[0]], ['Oktober 2026', 'Schema: Upper Lower · vanaf 15 oktober Full Body', 'Sets25']);
  await click(page, '[data-insight-mg="lats"]');
  const lat = await page.evaluate(() => ({ head: document.querySelector('#insight-muscle-head .insight-nav-title').textContent, schema: document.getElementById('insight-muscle-schema').textContent,
    note: [...document.querySelectorAll('#insight-muscle-body .insight-summary-note div')].map(d => d.textContent),
    rows: [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')].map(r => r.innerText.replace(/\n/g, ' | ')) }));
  console.log('     LATS, OKTOBER:'); show(lat);
  check('Lats maand: vergelijking en oefeningen', [lat.head, lat.note, lat.rows], ['Oktober 2026', ['6 van 6 sets uit je schema · op schema', '24% van al je sets'], ['Lat pulldown | 6 | sets']]);
  await click(page, '#insight-muscle-head [data-insight-period="year"]');
  const latY = await page.evaluate(() => ({ head: document.querySelector('#insight-muscle-head .insight-nav-title').textContent, schema: document.getElementById('insight-muscle-schema').textContent,
    note: [...document.querySelectorAll('#insight-muscle-body .insight-summary-note div')].map(d => d.textContent),
    rows: [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')].map(r => r.innerText.replace(/\n/g, ' | ')) }));
  console.log('     LATS, 2026:'); show(latY);
  await page.goBack(); await H.settle(page);
  check('terug uit spiergroep → trainingsoverzicht in Jaar 2026', [await active(page), await headOf(page, 'screen-insight-training')], ['screen-insight-training', '2026']);
  await page.goBack(); await H.settle(page);
  check('terug → hoofdscherm in Jaar 2026', [await active(page), (await main(page)).title], ['screen-insight', '2026']);

  // ── Layout, light/dark, 360/390
  for (const wpx of H.WIDTHS) for (const theme of H.THEMES) {
    const tag = `${theme} ${wpx}px`;
    await page.setViewportSize({ width: wpx, height: 1400 });
    await setup(page, DATA, theme);
    for (const per of ['month', 'year']) {
      await click(page, `#insight-head [data-insight-period="${per}"]`);
      const lay = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#insight-days .insight-table-row')];
        const cells = rows.flatMap(r => [...r.children]);
        const clipped = cells.filter(c => c.scrollWidth > c.clientWidth + 0.5).map(c => c.textContent);
        const rights = rows.map(r => [...r.children].map(c => Math.round(c.getBoundingClientRect().left)).join(','));
        const head = rows[0]; const vw = [...head.children].slice(1).map(c => Math.round(c.getBoundingClientRect().width)); return { equal: new Set(vw).size === 1, clipped, aligned: new Set(rights).size === 1, overflow: document.documentElement.scrollWidth > innerWidth || document.getElementById('insight-scroll').scrollWidth > document.getElementById('insight-scroll').clientWidth,
          minH: Math.min(...rows.slice(1).map(r => r.getBoundingClientRect().height)) };
      });
      check(`${tag} ${per}: tabel past (niets afgekapt), 4 waardekolommen even breed, kolommen uitgelijnd, geen overloop, rijen ≥ 48px`, [lay.clipped, lay.equal, lay.aligned, lay.overflow, lay.minH >= 48], [[], true, true, false, true]);
      await page.screenshot({ path: path.join(OUT, `v3-main-${per}-${theme}-${wpx}.png`), fullPage: true });
      await click(page, '[data-insight-metric="sleep"]');
      const ax = await page.evaluate(() => { const t = [...document.querySelectorAll('#insight-chart .insight-chart-day')].map(e => e.getBBox());
        return t.slice(1).every((b, i) => b.x >= t[i].x + t[i].width + 1); });
      check(`${tag} ${per}: x-aslabels Slaap overlappen niet`, ax, true);
      await page.screenshot({ path: path.join(OUT, `v3-sleep-${per}-${theme}-${wpx}.png`), fullPage: true });
      await page.goBack(); await H.settle(page);
    }
  }
}

// The back chain (zoom steps) with browser back and with the back arrow. Own page, so the history starts empty.
async function backChain(page) {
  await H.loadData(page, DATA);
  // Where are we: screen + the title in its head (or the day overview's date)
  const where = () => page.evaluate(() => {
    const s = document.querySelector('.screen.active');
    const t = s.querySelector('.insight-nav-title');
    return s.id.replace('screen-', '') + (t ? ' · ' + t.textContent : '');
  });
  const click = async sel => { await page.click(sel); await H.settle(page); };
  // back: 'arrow' = the toolbar's back arrow, 'browser' = history.back (= Android back)
  const back = async how => {
    if (how === 'arrow') await page.evaluate(() => document.querySelector('.screen.active .toolbar-btn').click());
    else await page.goBack();
    await H.settle(page);
    return where();
  };
  const start = async () => {
    await page.evaluate(() => { showScreen('screen-home'); }); await H.settle(page);
    await page.evaluate(() => document.getElementById('menu-card-insight').click()); await H.settle(page);
  };

  for (const how of ['browser', 'arrow']) {
    const tag = how === 'arrow' ? 'pijl' : 'browser-terug';
    // ── 1. Jaar → Oktober → Week 43 → a day, then back four times (and once more: the main menu)
    await start();
    await click('#insight-head [data-insight-period="year"]');
    await click('#insight-days [data-insight-open="month:2026-10-01"]');
    await click('#insight-days [data-insight-open="week:2026-10-19"]');
    await click('#insight-days .insight-cell[data-date="2026-10-19"]');
    const path1 = [await where()];
    for (let i = 0; i < 4; i++) path1.push(await back(how));
    check(`${tag}: Jaar → Okt → Week 43 → dag, dan 4× terug`, path1,
      ['insight-day · Maandag 19 oktober 2026', 'insight · Week 43', 'insight · Oktober 2026', 'insight · 2026', 'home']);
    check(`${tag}: na de laatste stap in het hoofdmenu`, path1[4], 'home');

    // ── 2. Browsing (arrows, period buttons) adds no step
    await start();
    await click('#insight-head [data-insight-step="-1"]');
    await click('#insight-head [data-insight-period="month"]');
    await click('#insight-head [data-insight-step="-1"]');
    await click('#insight-head [data-insight-period="year"]');
    const before = await where();
    check(`${tag}: bladeren en wisselen → terug gaat meteen naar het hoofdmenu`, [before, await back(how)], ['insight · 2026', 'home']);

    // ── 3. Browse, then zoom in: back lands on the period as it was when zooming in
    await start();
    await click('#insight-head [data-insight-period="year"]');
    await click('#insight-head [data-insight-step="-1"]');             // 2025
    await click('#insight-days [data-insight-open="month:2025-03-01"]'); // zoom: March 2025
    await click('#insight-head [data-insight-step="1"]');              // browse: April 2025
    await click('#insight-head [data-insight-period="week"]');         // switch: a week in April
    const w = await where();
    await click('#insight-head [data-insight-period="month"]');        // Week 14 (ma 31 mrt) → Maand: maart
    await click('#insight-days [data-insight-open="week:2025-03-10"]'); // zoom: Week 11
    const path3 = [await where()];
    for (let i = 0; i < 3; i++) path3.push(await back(how));
    check(`${tag}: bladeren, dan inzoomen → terug naar de periode op het moment van inzoomen`, [w, path3],
      ['insight · Week 14', ['insight · Week 11', 'insight · Maart 2025', 'insight · 2025', 'home']]);

    // ── 4. Zoom in on the Slaap detail screen, then back to the main screen
    await start();
    await click('#insight-head [data-insight-period="year"]');
    await click('[data-insight-metric="sleep"]');
    await click('#insight-metric-body [data-insight-open="month:2026-10-01"]');
    await click('#insight-metric-body [data-insight-open="week:2026-10-05"]');
    const path4 = [await where()];
    for (let i = 0; i < 4; i++) path4.push(await back(how));
    check(`${tag}: Slaap: 2026 → Okt → Week 41, terug door het detailscherm en dan het hoofdscherm`, path4,
      ['insight-metric · Week 41', 'insight-metric · Oktober 2026', 'insight-metric · 2026', 'insight · 2026', 'home']);
    // Zoom in on Slaap, browse there, back out: the main screen shows the period last seen (shared)
    await start();
    await click('#insight-head [data-insight-period="month"]');
    await click('[data-insight-metric="weight"]');
    await click('#insight-metric-body [data-insight-open="week:2026-10-12"]');
    await click('#insight-metric-head [data-insight-step="-1"]'); // Week 41, no step
    const path5 = [await where()];
    for (let i = 0; i < 3; i++) path5.push(await back(how));
    check(`${tag}: Gewicht: Okt → Week 42, bladeren naar 41, terug`, path5,
      ['insight-metric · Week 41', 'insight-metric · Oktober 2026', 'insight · Oktober 2026', 'home']);
    // Training → muscle group, zooming is only on the main screen's table here; still: back chain
    await start();
    await click('#insight-head [data-insight-period="year"]');
    await click('#insight-days [data-insight-open="month:2026-10-01"]');
    await click('[data-insight-metric="training"]');
    await click('[data-insight-mg="chest"]');
    const path6 = [await where()];
    for (let i = 0; i < 4; i++) path6.push(await back(how));
    check(`${tag}: Jaar → Okt → Training → Borst, terug`, path6,
      ['insight-muscle · Oktober 2026', 'insight-training · Oktober 2026', 'insight · Oktober 2026', 'insight · 2026', 'home']);
  }
}

H.run(async () => {
  H.section('Maand en Jaar');
  const a = await H.openApp({ width: 360, height: 1400, scale: 2 });
  await monthAndYear(a.page);
  await a.browser.close();
  check('geen JS-fouten', a.errors, []);

  H.section('Terug na inzoomen');
  const b = await H.openApp({ width: 360, height: 1400 });
  await backChain(b.page);
  await b.browser.close();
  check('geen JS-fouten (terug na inzoomen)', b.errors, []);
});

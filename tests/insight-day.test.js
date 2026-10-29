// Inzicht, Dagoverzicht: the schedule line with the plan day, the training overview's summary card and PER SPIERGROEP for one day (only that day's groups), rest/missed/today/no-schedule days, Voeding/Slaap/Gewicht with the label in the card, day navigation, opening from the week grid, the sleep and weight sheets.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const s = n => Array.from({ length: n }, () => ({ weight: 50, reps: 8 }));
const EX = [
  ['bench', 'Bench press', 'chest'], ['incline', 'Incline dumbbell press', 'upper-chest'], ['ohp', 'Overhead press', 'front-delts'],
  ['pushdown', 'Triceps pushdown', 'triceps'], ['dips', 'Dips', 'triceps'], ['lateral', 'Lateral raise', 'side-delts'],
  ['facepull', 'Face pull', null], ['band', 'Band pull-apart', null], ['row', 'Barbell row', 'mid-back'], ['curl', 'Curl', 'biceps'],
  ['squat', 'Squat', 'quads'], ['legcurl', 'Leg curl', 'hamstrings'],
];
const custom = EX.map(([id, name]) => ({ id, name, category: 'chest' }));
const info = Object.fromEntries(EX.filter(e => e[2]).map(([id, , mg]) => [id, { primaryMuscleGroup: mg }]));
const ppl = {
  effectiveFrom: '2026-10-01', planId: 'ppl', planName: 'Push Pull Legs', type: 'fixed',
  days: [
    { id: 'd1', name: 'Push A', weekday: 0, exercises: [
      { exerciseId: 'bench', name: 'Bench press', sets: 4 }, { exerciseId: 'incline', name: 'Incline dumbbell press', sets: 3 },
      { exerciseId: 'ohp', name: 'Overhead press', sets: 3 }, { exerciseId: 'pushdown', name: 'Triceps pushdown', sets: 4 },
      { exerciseId: 'facepull', name: 'Face pull', sets: 2 }] },
    { id: 'd2', name: 'Pull A', weekday: 2, exercises: [{ exerciseId: 'row', name: 'Barbell row', sets: 4 }, { exerciseId: 'curl', name: 'Curl', sets: 3 }] },
    { id: 'd3', name: 'Legs A', weekday: 3, exercises: [{ exerciseId: 'squat', name: 'Squat', sets: 5 }, { exerciseId: 'legcurl', name: 'Leg curl', sets: 3 }] },
  ],
  restWeekdays: [1, 4, 5, 6],
};
const BASE = {
  custom_exercises: custom, exerciseInfo: info,
  scheduleVersions: { '2026-10-01': ppl, '2026-10-24': { effectiveFrom: '2026-10-24', planId: null } },
  weekCycle: {},
  workoutPlanDays: {},
  workouts: {
    '2026-10-19': [ // Monday, Push A
      { exerciseId: 'bench', sets: [
        { weight: 100, reps: 8, rpe: 8 }, { weight: 100, reps: 8, rpe: 10 }, { weight: 100, reps: 7, rpe: 9, extra: 2, extraType: 'partial' },
        { weight: 100, reps: 6, rpe: 9.5, extra: 1, extraType: 'forced' },
        { weight: 90, reps: 6 }, { weight: 70, reps: 6, isDropsetContinuation: true, rpe: 10 }] },   // 5 sets, the last with a drop at RPE 10
      { exerciseId: 'ohp', sets: s(2) },
      { exerciseId: 'dips', sets: s(4) },
      { exerciseId: 'lateral', sets: s(3) },
      { exerciseId: 'facepull', sets: s(1) },
      { exerciseId: 'band', sets: s(2) },
    ],
    '2026-10-20': [{ exerciseId: 'curl', sets: s(3) }],           // Tuesday: rest day with training
    '2026-10-21': [{ exerciseId: 'row', sets: [] }],              // Wednesday: missed (loaded, nothing logged)
    '2026-10-26': [{ exerciseId: 'squat', sets: s(3) }],          // Monday 26, no schedule (version planId null from 24th)
  },
  sleep: {}, bodyWeight: { '2026-10-08': 99.2 },
};

async function setup(page, data, date, theme = 'light') {
  await page.evaluate(({ data, date, theme }) => {
    document.documentElement.dataset.theme = theme;
    const sp = document.getElementById('splash-screen'); if (sp) sp.style.display = 'none';
    currentUser = null;
    Object.assign(db, JSON.parse(JSON.stringify(data)));
    if (date) { insightDayDate = date; showScreen('screen-insight-day'); renderInsightDay(); }
  }, { data, date, theme });
}

// A summary column as "SETS 17" (the label as shown, in capitals), also on a screen that isn't shown.
const COL_HELPER = () => { window.insightTestCol = c => c.querySelector('.section-label').textContent.toUpperCase() + ' ' + c.querySelector('.insight-figure').textContent; };
async function readDay(page) {
  await page.evaluate(COL_HELPER);
  return page.evaluate(() => {
    const t = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    const mark = el => (el.querySelector('.insight-danger') ? ' [danger]' : '') + (el.querySelector('.insight-success') ? ' [success]' : '') + (el.classList.contains('insight-muted') ? ' [muted]' : '');
    const sum = document.querySelector('#insight-day-training .insight-summary');
    const cols = sum && sum.querySelector('.insight-summary-cols');
    const rows = [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r =>
      [...r.querySelector('.insight-mg-main').children].filter(c => c.tagName.toLowerCase() !== 'svg').map(c => t(c) + mark(c)).concat(r.querySelector('.insight-mg-figure').textContent));
    return {
      title: document.getElementById('insight-day-title').textContent, next: document.getElementById('insight-day-next').disabled,
      schema: document.getElementById('insight-day-schema').textContent,
      summary: cols ? [...cols.children].map(insightTestCol) : [t(sum)],
      note: sum && sum.querySelector('.insight-summary-note') ? t(sum.querySelector('.insight-summary-note')) + mark(sum.querySelector('.insight-summary-note')) : null,
      label: t(document.querySelector('#insight-day-training .insight-label')),
      rows, sleep: t(document.getElementById('insight-day-sleep')), weight: t(document.getElementById('insight-day-weight')),
      sleepDanger: !!document.querySelector('#insight-day-sleep .set-val.insight-danger'),
    };
  });
}
// What the training overview gives for exactly this one day: renderInsightTraining() over the range
// date..date (insightRange stubbed for a moment), its summary and the rows that have sets or a plan.
async function overviewOfDay(page, date) {
  await page.evaluate(COL_HELPER);
  return page.evaluate(date => {
    const t = el => el.innerText.replace(/\s+/g, ' ').trim();
    const real = insightRange;
    insightRange = () => ({ ...real(), from: date, to: date });
    try { renderInsightTraining(); } finally { insightRange = real; }
    const body = document.getElementById('insight-training-body');
    return {
      summary: [...body.querySelectorAll('.insight-summary-cols > div')].map(insightTestCol),
      note: body.querySelector('.insight-summary-note div').textContent,
      rows: [...body.querySelectorAll('.insight-mg-row')].map(r => [r.querySelector('.role-row').textContent, r.querySelector('.insight-mg-main > .role-sub').textContent, r.querySelector('.insight-mg-figure').textContent])
        .filter(r => !/niet in schema$/.test(r[1])),
    };
  }, date);
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1200, scale: 2 }); // today = Thursday 22 Oct

  // --- An ordinary day: shortfall, extra sets, a dropset, a replaced exercise (Dips for Triceps
  //     pushdown), a skipped group (Bovenborst) and exercises without a muscle group
  await setup(page, BASE, '2026-10-19');
  let d = await readDay(page);
  console.log('\nMaandag 19 oktober (Push A):'); console.log(JSON.stringify({ schema: d.schema, summary: d.summary, note: d.note, label: d.label }, null, 1));
  d.rows.forEach(r => console.log('   ' + r.join(' | ')));
  check('titel', d.title, 'Maandag 19 oktober 2026');
  check('schemaregel met de plandag', d.schema, 'Schema: Push Pull Legs · Push A');
  check('samenvatting: vijf totalen', d.summary, ['SETS 17', 'FAILURE 2', 'PARTIAL 1', 'FORCED 1', 'DROPSET 1']);
  check('samenvatting: vergelijking (geen regel met trainingen)', d.note, '11 van 16 sets uit je schema · −5 · +6 extra [danger]');
  check('label met legenda', d.label, 'PER SPIERGROEP Gedaan Schema');
  check('rijen: alleen de spiergroepen van die dag, op percentage, Geen spiergroep als laatste', d.rows, [
    ['Borst', '4 van 4 · op schema · +1 extra [success]', 'Bench press · 5 sets · 2 failure · 1 partial · 1 forced · 1 dropset', '29%'],
    ['Triceps', '4 van 4 · op schema [success]', 'Dips · 4 sets', '24%'], // Dips replaced Triceps pushdown, on schedule: no "Gepland"
    ['Zijkant schouders', '3 sets · extra', 'Lateral raise · 3 sets', '18%'],
    ['Voorste schouders', '2 van 3 · −1 [danger]', 'Overhead press · 2 sets', '12%'],
    ['Bovenborst', '0 van 3 · −3 [danger]', 'Gepland: Incline dumbbell press [muted]', '0%'],
    ['Geen spiergroep', '1 van 2 · −1 · +2 extra [danger]', 'Face pull · 1 set', 'Band pull-apart · 2 sets', '18%'],
  ]);
  const shape = await page.evaluate(() => {
    const list = document.querySelector('#insight-day-training .insight-mg-list');
    const tok = v => { const x = document.createElement('div'); x.style.color = `var(${v})`; document.body.appendChild(x); const c = getComputedStyle(x).color; x.remove(); return c; };
    return { cls: list.className, buttons: list.querySelectorAll('button, [data-insight-mg]').length, chevrons: list.querySelectorAll('.insight-chevron').length,
      bars: list.querySelectorAll('.insight-mg-row > .insight-mg-main > svg.insight-mg-bars').length, cols: getComputedStyle(list).gridTemplateColumns.split(' ').length,
      muted: getComputedStyle(list.querySelector('.role-sub.insight-muted')).color === tok('--text-muted'),
      small: [...list.querySelectorAll('.insight-mg-main > .role-sub')].every(e => getComputedStyle(e).fontSize === '12px' && getComputedStyle(e).fontWeight === '400') };
  });
  check('lijst: gedeelde spiergroeprij, dagvariant zonder chevron en niet aan te tikken', [shape.cls, shape.buttons, shape.chevrons, shape.bars, shape.cols],
    ['card insight-day-card insight-list insight-mg-list is-day divided-list', 0, 0, 6, 2]);
  check('oefeningregels in de rol Klein, "Gepland: …" in --text-muted', [shape.small, shape.muted], [true, true]);
  // the bars: one scale, the highest done or planned of these rows (Borst done 5)
  const bars = await page.evaluate(() => [...document.querySelectorAll('#insight-day-training .insight-mg-bars')].map(s => [...s.querySelectorAll('rect')].map(r => r.getAttribute('class') + ' ' + r.getAttribute('width'))));
  check('balkjes op één schaal (max 5)', bars, [['insight-bar 100.00%', 'insight-bar-planned 80.00%'], ['insight-bar 80.00%', 'insight-bar-planned 80.00%'], ['insight-bar 60.00%'],
    ['insight-bar 40.00%', 'insight-bar-planned 60.00%'], ['insight-bar-planned 60.00%'], ['insight-bar 60.00%', 'insight-bar-planned 40.00%']]);

  // --- The day's totals are what the training overview gives for that one day
  for (const date of ['2026-10-19', '2026-10-20', '2026-10-21']) {
    await setup(page, BASE, date);
    d = await readDay(page);
    const ov = await overviewOfDay(page, date);
    check(`${date}: totalen gelijk aan het trainingsoverzicht voor die dag`, d.summary, ov.summary);
    // a rest day: the overview says "0 van 0 sets uit je schema · op schema · +3 extra", the day "Geen sets gepland · +3 extra"
    if (date !== '2026-10-20') check(`${date}: vergelijking gelijk`, d.note.replace(/ \[\w+\]$/, ''), ov.note);
    check(`${date}: rijen (naam, regel 1, percentage) gelijk`, d.rows.map(r => [r[0], r[1].replace(/ \[\w+\]$/, ''), r[r.length - 1]]), ov.rows);
  }

  // --- Rest day with training
  await setup(page, BASE, '2026-10-20');
  d = await readDay(page);
  check('rustdag met training', [d.schema, d.summary, d.note, d.rows],
    ['Schema: Push Pull Legs · Rustdag', ['SETS 3', 'FAILURE 0', 'PARTIAL 0', 'FORCED 0', 'DROPSET 0'], 'Geen sets gepland · +3 extra', [['Biceps', '3 sets · extra', 'Curl · 3 sets', '100%']]]);

  // --- Missed day: totals 0
  await setup(page, BASE, '2026-10-21');
  d = await readDay(page);
  check('gemiste dag', [d.schema, d.summary, d.note, d.rows],
    ['Schema: Push Pull Legs · Pull A', ['SETS 0', 'FAILURE 0', 'PARTIAL 0', 'FORCED 0', 'DROPSET 0'], '0 van 7 sets uit je schema · −7 [danger]',
      [['Middenrug', '0 van 4 · −4 [danger]', 'Gepland: Barbell row [muted]', '0%'], ['Biceps', '0 van 3 · −3 [danger]', 'Gepland: Curl [muted]', '0%']]]);

  // --- Today before and after the first set
  await setup(page, BASE, '2026-10-22');
  d = await readDay(page);
  check('vandaag vóór eerste set: "Gepland: 8 sets", geen tekort', [d.schema, d.summary, d.note, d.rows, d.next],
    ['Schema: Push Pull Legs · Legs A', ['SETS 0', 'FAILURE 0', 'PARTIAL 0', 'FORCED 0', 'DROPSET 0'], 'Gepland: 8 sets',
      [['Quadriceps', '0 sets · vandaag gepland', 'Gepland: Squat [muted]', '0%'], ['Hamstrings', '0 sets · vandaag gepland', 'Gepland: Leg curl [muted]', '0%']], true]);
  await page.evaluate(() => { db.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }]; renderInsightDay(); });
  d = await readDay(page);
  check('vandaag na eerste set', [d.summary[0], d.note, d.rows],
    ['SETS 1', '1 van 8 sets uit je schema · −7 [danger]',
      [['Quadriceps', '1 van 5 · −4 [danger]', 'Squat · 1 set', '100%'], ['Hamstrings', '0 van 3 · −3 [danger]', 'Gepland: Leg curl [muted]', '0%']]]);

  // --- Rest day without training; no schedule with and without training
  await setup(page, BASE, '2026-10-16');
  d = await readDay(page);
  check('rustdag zonder training: "Rustdag" in de kaart, geen PER SPIERGROEP', [d.schema, d.summary, d.note, d.label, d.rows.length],
    ['Schema: Push Pull Legs · Rustdag', ['Rustdag'], null, null, 0]);
  check('in de stijl van de lege staten (.role-row.insight-empty)', await page.evaluate(() => !!document.querySelector('#insight-day-training .insight-summary > .role-row.insight-empty')), true);
  await setup(page, BASE, '2026-09-30');
  d = await readDay(page);
  check('geen schema, geen training: "Geen training"', [d.schema, d.summary, d.note, d.label], ['Geen schema bekend', ['Geen training'], null, null]);
  await page.evaluate(() => { db.workouts['2026-09-30'] = [{ exerciseId: 'squat', sets: [{ weight: 1, reps: 1 }, { weight: 1, reps: 1 }] }]; renderInsightDay(); });
  d = await readDay(page);
  check('geen schema, wel training: geen vergelijking', [d.summary[0], d.note, d.rows], ['SETS 2', 'Geen vergelijking met schema', [['Quadriceps', '2 sets', 'Squat · 2 sets', '100%']]]);

  // --- Schedule lines: Week A/B, sequential (with a loaded plan day), no schedule active
  const AB = { ...BASE, scheduleVersions: { '2026-10-01': { ...ppl, type: 'weekAB',
    days: [{ ...ppl.days[0], name: 'Push', week: 'A' }, { id: 'd9', name: 'Pull', weekday: 0, week: 'B', exercises: [] }], restWeekdaysA: [1, 2, 3, 4, 5, 6], restWeekdaysB: [1, 2, 3, 4, 5, 6] } },
  weekCycle: { '2026-10-19': { effectiveFrom: '2026-10-19', planId: 'ppl', week: 'A' } } };
  await setup(page, AB, '2026-10-19');
  check('Week A/B', (await readDay(page)).schema, 'Schema: Push Pull Legs · Week A · Push');
  await setup(page, AB, '2026-10-20');
  check('Week A/B rustdag', (await readDay(page)).schema, 'Schema: Push Pull Legs · Week A · Rustdag');
  await setup(page, AB, '2026-10-13');
  d = await readDay(page);
  check('Week A/B zonder vastgelegde week: geen vergelijking', [d.schema, d.summary], ['Schema: Push Pull Legs', ['Geen training']]);
  const SEQ = { ...BASE, scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'seq', planName: 'Test 1', type: 'sequential', days: ppl.days.map(({ weekday, ...x }) => x) } },
    workoutPlanDays: { '2026-10-19': [{ planId: 'seq', dayId: 'd1', dayName: 'Push A' }] } };
  await setup(page, SEQ, '2026-10-19');
  d = await readDay(page);
  check('doorlopend met geladen plandag', [d.schema, d.summary[0], d.note], ['Schema: Test 1 · Push A', 'SETS 17', 'Geen vergelijking met schema']);
  check('doorlopend: rijen zonder vergelijking', d.rows.map(r => r[1]), ['5 sets', '4 sets', '3 sets', '2 sets', '3 sets']);
  await setup(page, SEQ, '2026-10-20');
  check('doorlopend zonder geladen plandag', (await readDay(page)).schema, 'Schema: Test 1');
  await setup(page, { ...BASE, scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: null } } }, '2026-10-19');
  d = await readDay(page);
  check('geen schema actief', [d.schema, d.note], ['Geen schema actief', 'Geen vergelijking met schema']);

  // --- Voeding, Slaap and Gewicht: the label in the card; the pencil right, in the middle, where
  //     the main screen's chevron is
  await setup(page, { ...BASE, sleep: { '2026-10-19': { bedtime: '00:20', wakeTime: '06:50' } }, bodyWeight: { '2026-10-19': 98.4 } }, '2026-10-19');
  const cards = await page.evaluate(() => ['insight-day-food', 'insight-day-sleep', 'insight-day-weight'].map(id => {
    const card = document.getElementById(id).firstElementChild, label = card.querySelector('.section-label');
    const icon = card.querySelector('.insight-edit-icon'), r = card.getBoundingClientRect(), ir = icon && icon.getBoundingClientRect();
    return { label: label && label.textContent, inCard: !!label && card.contains(label) && label === (card.querySelector('.insight-edit-main') || card).firstElementChild,
      pencil: !!(icon && !icon.classList.contains('insight-chevron')), right: ir && Math.round(r.right - ir.right), mid: ir && Math.abs((ir.top + ir.bottom) / 2 - (r.top + r.bottom) / 2) < 0.6 };
  }));
  check('labels in de kaart', cards.map(c => [c.label, c.inCard]), [['Voeding', true], ['Slaap', true], ['Gewicht', true]]);
  check('geen labels meer boven de kaarten', await page.evaluate(() => document.querySelectorAll('#screen-insight-day .insight-scroll > .insight-label, #screen-insight-day .insight-cards > .section-label').length), 0);
  check('potloodjes rechts, verticaal in het midden', cards.slice(1).map(c => [c.pencil, c.mid]), [[true, true], [true, true]]);
  const chevronRight = await page.evaluate(() => { insightWeekStart = '2026-10-19'; showScreen('screen-insight');
    const c = document.querySelector('[data-insight-metric="sleep"]'), i = c.querySelector('.insight-chevron');
    return Math.round(c.getBoundingClientRect().right - i.getBoundingClientRect().right); });
  check('potlood op dezelfde plek als het pijltje op het hoofdscherm', cards.slice(1).map(c => c.right), [chevronRight, chevronRight]);
  await setup(page, BASE, '2026-10-19');

  // --- Days browsing; can't go past today
  await setup(page, BASE, '2026-10-21');
  await page.click('#insight-day-next');
  d = await readDay(page);
  check('volgende → vandaag, rechts uit', [d.title, d.next], ['Donderdag 22 oktober 2026', true]);
  await page.click('#insight-day-next', { force: true });
  d = await readDay(page);
  check('niet voorbij vandaag', d.title, 'Donderdag 22 oktober 2026');
  await page.click('#insight-day-prev'); await page.click('#insight-day-prev'); await page.click('#insight-day-prev'); await page.click('#insight-day-prev');
  d = await readDay(page);
  check('terugbladeren over weekgrens', [d.title, d.next], ['Zondag 18 oktober 2026', false]);

  // --- Opening from the week grid + back to the right week
  await page.evaluate(() => { showScreen('screen-home'); });
  await page.click('#menu-card-insight');
  const futureTappable = await page.evaluate(() => [...document.querySelectorAll('.insight-grid [data-date]')].map(c => c.dataset.date).filter((v, i, a) => a.indexOf(v) === i));
  check('tikbare dagen in week 43 (t/m vandaag)', futureTappable, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  const colH = await page.evaluate(() => { const c = [...document.querySelectorAll('.insight-grid [data-date="2026-10-20"]')]; const a = c[0].getBoundingClientRect(), b = c[c.length - 1].getBoundingClientRect(); return [c.length, Math.round(b.bottom - a.top), Math.round(a.width)]; });
  console.log('kolom Di: cellen, hoogte, breedte', colH);
  check('kolom hoger dan 48px', colH[1] >= 48, true);
  // tap the Slaap row cell of Tuesday (not the header) → opens Tuesday
  await page.click('.insight-grid [data-date="2026-10-20"]:nth-last-child(1), .insight-grid [data-date="2026-10-20"] >> nth=3');
  d = await readDay(page);
  check('tik in kolom opent die dag', d.title, 'Dinsdag 20 oktober 2026');
  await page.click('#insight-day-prev'); await page.click('#insight-day-prev'); // Sunday 18 → week 42
  await page.click('#btn-back-insight-day');
  await H.settle(page);
  const wk = await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-head .insight-nav-title').textContent]);
  check('terug naar de week van die dag', wk, ['screen-insight', 'Week 42']);
  // Hardware back from the day overview too
  await page.click('.insight-grid [data-date="2026-10-14"] >> nth=0');
  await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); // → Mon 19
  await page.goBack(); await H.settle(page);
  const wk2 = await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-head .insight-nav-title').textContent]);
  check('hardware-terug → week 43', wk2, ['screen-insight', 'Week 43']);
  // future day: no data-date and openInsightDay refuses
  const fut = await page.evaluate(() => { openInsightDay('2026-10-23'); return document.querySelector('.screen.active').id; });
  check('toekomst opent niet', fut, 'screen-insight');

  // --- Sleep: fill, change (over midnight, under 7:00), clear
  const setClock = async (bed, wake) => {
    for (const [which, t] of [['bed', bed], ['wake', wake]]) {
      await page.click(`#sleep-clock .sleep-clock-time[data-which="${which}"]`);
      await page.fill(`#sleep-clock .sleep-clock-input[data-which="${which}"]`, t);
      await page.press(`#sleep-clock .sleep-clock-input[data-which="${which}"]`, 'Enter');
    }
  };
  await setup(page, BASE, '2026-10-22');
  d = await readDay(page);
  check('lege staat Slaap: label in de kaart', d.sleep, 'SLAAP Nog niet ingevuld Nacht van woensdag op donderdag SLAAP INVULLEN');
  await page.click('#insight-day-sleep .insight-fill-btn');
  await H.settle(page);
  const sub = await page.textContent('#insight-sleep-sub');
  check('slaap-sheet subregel', sub, 'Nacht van woensdag 21 op donderdag 22 oktober 2026');
  // Since stap 4 the sheet is a 24-hour clock (no time fields): a time is typed by tapping it.
  // No earlier night: it starts on 23:00–07:00. Clearing is the button Wissen (not two empty fields).
  check('startstand 23:00–07:00', await page.textContent('#insight-sleep-total'), 'Totaal: 8:00 u · tik op een tijd om hem in te typen');
  await setClock('23:00', '07:15');
  check('totaal live', await page.textContent('#insight-sleep-total'), 'Totaal: 8:15 u · tik op een tijd om hem in te typen');
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  d = await readDay(page);
  check('slaap ingevuld', [d.sleep, d.sleepDanger], ['SLAAP 8:15 u 23:00 – 07:15 · nacht van woensdag op donderdag', false]);
  await page.click('#insight-day-sleep .insight-edit-card'); await H.settle(page);
  check('sheet vooringevuld', await page.evaluate(() => [insightSleepValues(), document.getElementById('insight-sleep-total').textContent]), [['23:00', '07:15'], 'Totaal: 8:15 u · tik op een tijd om hem in te typen']);
  await setClock('00:20', '06:50');
  check('totaal 6:30', await page.textContent('#insight-sleep-total'), 'Totaal: 6:30 u · tik op een tijd om hem in te typen');
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  d = await readDay(page);
  check('slaap gewijzigd, onder 7:00 rood', [d.sleep, d.sleepDanger], ['SLAAP 6:30 u 00:20 – 06:50 · nacht van woensdag op donderdag', true]);
  check('opgeslagen', await page.evaluate(() => db.sleep['2026-10-22']), { bedtime: '00:20', wakeTime: '06:50' });
  await page.click('#insight-day-sleep .insight-edit-card'); await H.settle(page);
  await page.click('#btn-insight-sleep-clear'); await H.settle(page);
  d = await readDay(page);
  check('Wissen → gewist', [d.sleep, await page.evaluate(() => db.sleep['2026-10-22'] || null), await page.textContent('#toast-msg')], ['SLAAP Nog niet ingevuld Nacht van woensdag op donderdag SLAAP INVULLEN', null, 'Slaap gewist']);
  // Annuleren with changes asks; without changes just closes
  await page.click('#insight-day-sleep .insight-fill-btn'); await H.settle(page);
  await page.click('#btn-insight-sleep-cancel'); await H.settle(page);
  check('annuleren zonder wijziging sluit', await page.evaluate(() => document.getElementById('insight-sleep-overlay').classList.contains('open')), false);
  await page.click('#insight-day-sleep .insight-fill-btn'); await H.settle(page);
  await setClock('22:00', '07:00');
  await page.click('#btn-insight-sleep-cancel'); await H.settle(page);
  check('annuleren met wijziging vraagt', await page.evaluate(() => document.getElementById('discard-changes-overlay').classList.contains('open')), true);
  await page.evaluate(() => { document.getElementById('discard-changes-overlay').classList.remove('open'); closeOverlay('insight-sleep-overlay'); });
  // month boundary text
  check('nacht over maandgrens', await page.evaluate(() => [insightNightLongText('2026-10-01'), insightNightLongText('2026-01-01')]),
    ['Nacht van woensdag 30 september op donderdag 1 oktober 2026', 'Nacht van woensdag 31 december 2025 op donderdag 1 januari 2026']);

  // --- Weight: comma, point, invalid, t.o.v.
  await setup(page, BASE, '2026-10-22');
  d = await readDay(page);
  check('lege staat Gewicht: label in de kaart', d.weight, 'GEWICHT Nog niet ingevuld GEWICHT INVULLEN');
  await page.click('#insight-day-weight .insight-fill-btn'); await H.settle(page);
  check('gewicht-sheet subregel', await page.textContent('#insight-weight-sub'), 'Donderdag 22 oktober 2026');
  await page.type('#insight-weight-input', '98,456');
  check('max 2 decimalen tijdens typen', await page.inputValue('#insight-weight-input'), '98,45');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  d = await readDay(page);
  check('komma, t.o.v. datum (>6 dagen)', d.weight, 'GEWICHT 98,45 kg −0,75 kg t.o.v. 8 oktober');
  await page.evaluate(() => { db.bodyWeight['2026-10-21'] = 98.85; renderInsightDay(); });
  d = await readDay(page);
  check('t.o.v. weekdag', d.weight, 'GEWICHT 98,45 kg −0,4 kg t.o.v. woensdag');
  await page.evaluate(() => { db.bodyWeight['2026-10-16'] = 98; delete db.bodyWeight['2026-10-21']; renderInsightDay(); });
  d = await readDay(page);
  check('t.o.v. 6 dagen terug = weekdag', d.weight, 'GEWICHT 98,45 kg +0,45 kg t.o.v. vrijdag');
  await page.evaluate(() => { db.bodyWeight['2026-10-15'] = 98.45; delete db.bodyWeight['2026-10-16']; renderInsightDay(); });
  d = await readDay(page);
  check('7 dagen terug = datum, verschil 0', d.weight, 'GEWICHT 98,45 kg 0 kg t.o.v. 15 oktober');
  await page.evaluate(() => { db.bodyWeight = { '2026-10-22': 98.45 }; renderInsightDay(); });
  d = await readDay(page);
  check('zonder eerdere waarde geen regel', d.weight, 'GEWICHT 98,45 kg');
  await page.click('#insight-day-weight .insight-edit-card'); await H.settle(page);
  check('vooringevuld', await page.inputValue('#insight-weight-input'), '98,45');
  await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', '97.5');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('punt geaccepteerd', [await page.evaluate(() => db.bodyWeight['2026-10-22']), (await readDay(page)).weight], [97.5, 'GEWICHT 97,5 kg']);
  for (const [val, label] of [['19,99', 'onder 20'], ['400,01', 'boven 400'], ['0', 'nul'], [',', 'alleen komma']]) {
    await page.click('#insight-day-weight .insight-edit-card'); await H.settle(page);
    await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', val);
    await page.click('#btn-insight-weight-save'); await H.settle(page);
    check(`ongeldig: ${label}`, await page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('insight-weight-overlay').classList.contains('open'), db.bodyWeight['2026-10-22']]),
      ['Vul een gewicht in van 20 tot en met 400 kg', true, 97.5]);
    await page.evaluate(() => closeOverlay('insight-weight-overlay')); await H.settle(page);
  }
  for (const [val, kg] of [['20', 20], ['400', 400]]) {
    await page.click('#insight-day-weight .insight-edit-card'); await H.settle(page);
    await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', val);
    await page.click('#btn-insight-weight-save'); await H.settle(page);
    check(`grens ${val}`, await page.evaluate(() => db.bodyWeight['2026-10-22']), kg);
  }
  await page.type('#insight-weight-input', 'abc');
  check('letters geweigerd', await page.inputValue('#insight-weight-input'), '400');
  await page.click('#insight-day-weight .insight-edit-card'); await H.settle(page);
  await page.fill('#insight-weight-input', '');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('leeg opslaan wist niet: rode melding, venster blijft open', await page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('insight-weight-overlay').classList.contains('open'), db.bodyWeight['2026-10-22']]), ['Vul een gewicht in', true, 400]);
  await page.click('#btn-insight-weight-clear'); await H.settle(page);
  check('Wissen → gewist', [await page.evaluate(() => db.bodyWeight['2026-10-22'] ?? null), (await readDay(page)).weight], [null, 'GEWICHT Nog niet ingevuld GEWICHT INVULLEN']);

  // --- Week overview updated right after saving
  await page.evaluate(() => { saveSleep('2026-10-22', '00:20', '06:50'); saveBodyWeight('2026-10-22', 98.4); });
  await page.click('#btn-back-insight-day').catch(() => {});
  await page.evaluate(() => { insightWeekStart = '2026-10-19'; showScreen('screen-insight'); });
  const wcell = await page.evaluate(() => [...document.querySelectorAll('.insight-grid .insight-cell')].filter(c => c.dataset.date === '2026-10-22').map(c => c.textContent.trim()));
  check('week toont slaap/gewicht van do', wcell.slice(3), ['6:30', '98,4']);

  // --- Screenshots: light/dark × 360/390
  const shots = [];
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 1300 });
    await setup(page, { ...BASE, sleep: { '2026-10-19': { bedtime: '00:20', wakeTime: '06:50' } }, bodyWeight: { '2026-10-19': 98.4, '2026-10-15': 98.8 } }, '2026-10-19', theme);
    await H.settle(page);
    const f = `day-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    await setup(page, BASE, '2026-10-22', theme);
    const f2 = `day-empty-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f2) }); shots.push(f2);
    await page.setViewportSize({ width: w, height: 760 });
    await page.click('#insight-day-sleep .insight-fill-btn'); await H.settle(page); await setClock('23:10', '06:40'); await H.settle(page);
    const f3 = `sheet-sleep-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f3) }); shots.push(f3);
    await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await H.settle(page);
    await page.click('#insight-day-weight .insight-fill-btn'); await page.type('#insight-weight-input', '98,4'); await H.settle(page);
    const f4 = `sheet-weight-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f4) }); shots.push(f4);
    await page.evaluate(() => closeOverlay('insight-weight-overlay')); await H.settle(page);
    // overflow check
    const ov = await page.evaluate(() => document.getElementById('insight-day-scroll').scrollWidth - document.getElementById('insight-day-scroll').clientWidth);
    check(`geen horizontale overloop ${theme} ${w}`, ov, 0);
    // pressed column on the week grid
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; insightWeekStart = '2026-10-19'; showScreen('screen-insight'); }, theme);
    await page.hover('.insight-grid [data-date="2026-10-20"] >> nth=2'); await page.mouse.down();
    const f5 = `week-pressed-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f5), clip: { x: 0, y: 0, width: w, height: 420 } }); shots.push(f5);
    await page.mouse.move(5, 5); await page.mouse.up();
    await page.evaluate(() => { document.querySelectorAll('.insight-col-pressed').forEach(c => c.classList.remove('insight-col-pressed')); });
  }
  console.log('screenshots:', shots.join(', '));
  await browser.close();
  check('geen JS-fouten', errors, []);
});

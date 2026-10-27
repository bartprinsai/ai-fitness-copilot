// Inzicht, Dagoverzicht: muscle-group rows, rest/missed/today/no-schedule days, day navigation, opening from the week grid, the sleep and weight sheets.
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

async function readDay(page) {
  return page.evaluate(() => {
    const t = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    const head = [...document.querySelectorAll('#insight-day-training .insight-day-head > *')].map(t);
    const rows = [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r => ({
      left: [...r.querySelector('.insight-mg-main').children].map(c => t(c) + (c.classList.contains('insight-muted') ? ' [muted]' : '')),
      right: [...r.querySelector('.insight-mg-figure').children].map(c => t(c)
        + (c.querySelector('.insight-danger') ? ' [danger]' : '') + (c.querySelector('.insight-success') ? ' [success]' : '')),
    }));
    return {
      title: document.getElementById('insight-day-title').textContent, next: document.getElementById('insight-day-next').disabled,
      head, rows, sleep: t(document.getElementById('insight-day-sleep')), weight: t(document.getElementById('insight-day-weight')),
      sleepDanger: !!document.querySelector('#insight-day-sleep .set-val.insight-danger'),
    };
  });
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1200, scale: 2 }); // today = Thursday 22 Oct

  // --- Day with shortfall, extra, replacement, skipped group, dropset, no muscle group
  await setup(page, BASE, '2026-10-19');
  let d = await readDay(page);
  console.log('\nMaandag 19 oktober (Push A):'); console.log(JSON.stringify(d, null, 1));
  check('titel', d.title, 'Maandag 19 oktober 2026');
  check('kop', d.head, ['Push A', 'Schema: Push Pull Legs', '11 van 16 sets · −5 · +6 extra']);
  check('rijen', d.rows.map(r => [r.left, r.right]), [
    [['Bovenborst', 'Gepland: Incline dumbbell press [muted]'], ['0 van 3', '−3 [danger]']],
    [['Borst', 'Bench press · 5 sets · 2 failure · 1 partial · 1 forced · 1 dropset'], ['4 van 4', 'op schema · +1 extra [success]']],
    [['Voorste schouders', 'Overhead press · 2 sets'], ['2 van 3', '−1 [danger]']],
    [['Zijkant schouders', 'Lateral raise · 3 sets'], ['3 sets', 'extra']],
    [['Triceps', 'Dips · 4 sets'], ['4 van 4', 'op schema [success]']],
    [['Geen spiergroep', 'Face pull · 1 set', 'Band pull-apart · 2 sets'], ['1 van 2', '−1 · +2 extra [danger]']],
  ]);
  // Wait: total shortfall check: planned 4+3+3+4+2=16, counted 4+0+2+4+1=11 ... recomputed below
  const tot = await page.evaluate(() => { const t = insightDayTraining(insightDay('2026-10-19')); return [t.planned, t.counted, t.extra, t.done]; });
  console.log('totalen planned/counted/extra/done', tot);

  // --- Rest day with training
  await setup(page, BASE, '2026-10-20');
  d = await readDay(page);
  check('rustdag met training', [d.head, d.rows.map(r => [r.left, r.right])],
    [['Rustdag', 'Schema: Push Pull Legs', '3 sets · +3 extra'], [[['Biceps', 'Curl · 3 sets'], ['3 sets', 'extra']]]]);

  // --- Missed day
  await setup(page, BASE, '2026-10-21');
  d = await readDay(page);
  check('gemiste dag', [d.head, d.rows.map(r => [r.left, r.right])],
    [['Pull A', 'Schema: Push Pull Legs', '0 van 7 sets · −7'],
     [[['Middenrug', 'Gepland: Barbell row [muted]'], ['0 van 4', '−4 [danger]']], [['Biceps', 'Gepland: Curl [muted]'], ['0 van 3', '−3 [danger]']]]]);

  // --- Today before and after the first set
  await setup(page, BASE, '2026-10-22');
  d = await readDay(page);
  check('vandaag vóór eerste set', [d.head, d.rows.map(r => [r.left, r.right]), d.next],
    [['Legs A', 'Schema: Push Pull Legs', 'Gepland: 8 sets'],
     [[['Quadriceps', 'Gepland: Squat [muted]'], ['5 sets', 'gepland']], [['Hamstrings', 'Gepland: Leg curl [muted]'], ['3 sets', 'gepland']]], true]);
  await page.evaluate(() => { db.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }]; renderInsightDay(); });
  d = await readDay(page);
  check('vandaag na eerste set', [d.head, d.rows.map(r => [r.left, r.right])],
    [['Legs A', 'Schema: Push Pull Legs', '1 van 8 sets · −7'],
     [[['Quadriceps', 'Squat · 1 set'], ['1 van 5', '−4 [danger]']], [['Hamstrings', 'Gepland: Leg curl [muted]'], ['0 van 3', '−3 [danger]']]]]);
  // the week's Training card keeps its own rule (today only counts after the first set) — unchanged

  // --- Day without schedule (no version) and with "geen schema actief"
  await setup(page, BASE, '2026-09-30');
  d = await readDay(page);
  check('zonder versie, niets gelogd', [d.head, d.rows.length], [['Geen training', 'Geen schema bekend', '0 sets · geen vergelijking met schema'], 0]);
  await page.evaluate(() => { db.workouts['2026-09-30'] = [{ exerciseId: 'squat', sets: [{ weight: 1, reps: 1 }, { weight: 1, reps: 1 }] }]; renderInsightDay(); });
  d = await readDay(page);
  check('zonder versie, wel gelogd', [d.head, d.rows.map(r => [r.left, r.right])],
    [['Training', 'Geen schema bekend', '2 sets · geen vergelijking met schema'], [[['Quadriceps', 'Squat · 2 sets'], ['2 sets']]]]);

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
  await page.waitForTimeout(150);
  const wk = await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-head .insight-nav-title').textContent]);
  check('terug naar de week van die dag', wk, ['screen-insight', 'Week 42']);
  // Hardware back from the day overview too
  await page.click('.insight-grid [data-date="2026-10-14"] >> nth=0');
  await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); await page.click('#insight-day-next'); // → Mon 19
  await page.goBack(); await page.waitForTimeout(150);
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
  check('slaap leeg', d.sleep, 'Nog niet ingevuld Nacht van woensdag op donderdag SLAAP INVULLEN');
  await page.click('#insight-day-sleep .insight-fill-btn');
  await page.waitForTimeout(350);
  const sub = await page.textContent('#insight-sleep-sub');
  check('slaap-sheet subregel', sub, 'Nacht van woensdag 21 op donderdag 22 oktober 2026');
  // Since stap 4 the sheet is a 24-hour clock (no time fields): a time is typed by tapping it.
  // No earlier night: it starts on 23:00–07:00. Clearing is the button Wissen (not two empty fields).
  check('startstand 23:00–07:00', await page.textContent('#insight-sleep-total'), 'Totaal: 8:00 u · tik op een tijd om hem in te typen');
  await setClock('23:00', '07:15');
  check('totaal live', await page.textContent('#insight-sleep-total'), 'Totaal: 8:15 u · tik op een tijd om hem in te typen');
  await page.click('#btn-insight-sleep-save'); await page.waitForTimeout(350);
  d = await readDay(page);
  check('slaap ingevuld', [d.sleep, d.sleepDanger], ['8:15 u 23:00 – 07:15 · nacht van woensdag op donderdag', false]);
  await page.click('#insight-day-sleep .insight-edit-card'); await page.waitForTimeout(350);
  check('sheet vooringevuld', await page.evaluate(() => [insightSleepValues(), document.getElementById('insight-sleep-total').textContent]), [['23:00', '07:15'], 'Totaal: 8:15 u · tik op een tijd om hem in te typen']);
  await setClock('00:20', '06:50');
  check('totaal 6:30', await page.textContent('#insight-sleep-total'), 'Totaal: 6:30 u · tik op een tijd om hem in te typen');
  await page.click('#btn-insight-sleep-save'); await page.waitForTimeout(350);
  d = await readDay(page);
  check('slaap gewijzigd, onder 7:00 rood', [d.sleep, d.sleepDanger], ['6:30 u 00:20 – 06:50 · nacht van woensdag op donderdag', true]);
  check('opgeslagen', await page.evaluate(() => db.sleep['2026-10-22']), { bedtime: '00:20', wakeTime: '06:50' });
  await page.click('#insight-day-sleep .insight-edit-card'); await page.waitForTimeout(350);
  await page.click('#btn-insight-sleep-clear'); await page.waitForTimeout(350);
  d = await readDay(page);
  check('Wissen → gewist', [d.sleep, await page.evaluate(() => db.sleep['2026-10-22'] || null), await page.textContent('#toast-msg')], ['Nog niet ingevuld Nacht van woensdag op donderdag SLAAP INVULLEN', null, 'Slaap gewist']);
  // Annuleren with changes asks; without changes just closes
  await page.click('#insight-day-sleep .insight-fill-btn'); await page.waitForTimeout(350);
  await page.click('#btn-insight-sleep-cancel'); await page.waitForTimeout(100);
  check('annuleren zonder wijziging sluit', await page.evaluate(() => document.getElementById('insight-sleep-overlay').classList.contains('open')), false);
  await page.click('#insight-day-sleep .insight-fill-btn'); await page.waitForTimeout(350);
  await setClock('22:00', '07:00');
  await page.click('#btn-insight-sleep-cancel'); await page.waitForTimeout(100);
  check('annuleren met wijziging vraagt', await page.evaluate(() => document.getElementById('discard-changes-overlay').classList.contains('open')), true);
  await page.evaluate(() => { document.getElementById('discard-changes-overlay').classList.remove('open'); closeOverlay('insight-sleep-overlay'); });
  // month boundary text
  check('nacht over maandgrens', await page.evaluate(() => [insightNightLongText('2026-10-01'), insightNightLongText('2026-01-01')]),
    ['Nacht van woensdag 30 september op donderdag 1 oktober 2026', 'Nacht van woensdag 31 december 2025 op donderdag 1 januari 2026']);

  // --- Weight: comma, point, invalid, t.o.v.
  await setup(page, BASE, '2026-10-22');
  d = await readDay(page);
  check('gewicht leeg', d.weight, 'Nog niet ingevuld GEWICHT INVULLEN');
  await page.click('#insight-day-weight .insight-fill-btn'); await page.waitForTimeout(350);
  check('gewicht-sheet subregel', await page.textContent('#insight-weight-sub'), 'Donderdag 22 oktober 2026');
  await page.type('#insight-weight-input', '98,456');
  check('max 2 decimalen tijdens typen', await page.inputValue('#insight-weight-input'), '98,45');
  await page.click('#btn-insight-weight-save'); await page.waitForTimeout(350);
  d = await readDay(page);
  check('komma, t.o.v. datum (>6 dagen)', d.weight, '98,45 kg −0,75 kg t.o.v. 8 oktober');
  await page.evaluate(() => { db.bodyWeight['2026-10-21'] = 98.85; renderInsightDay(); });
  d = await readDay(page);
  check('t.o.v. weekdag', d.weight, '98,45 kg −0,4 kg t.o.v. woensdag');
  await page.evaluate(() => { db.bodyWeight['2026-10-16'] = 98; delete db.bodyWeight['2026-10-21']; renderInsightDay(); });
  d = await readDay(page);
  check('t.o.v. 6 dagen terug = weekdag', d.weight, '98,45 kg +0,45 kg t.o.v. vrijdag');
  await page.evaluate(() => { db.bodyWeight['2026-10-15'] = 98.45; delete db.bodyWeight['2026-10-16']; renderInsightDay(); });
  d = await readDay(page);
  check('7 dagen terug = datum, verschil 0', d.weight, '98,45 kg 0 kg t.o.v. 15 oktober');
  await page.evaluate(() => { db.bodyWeight = { '2026-10-22': 98.45 }; renderInsightDay(); });
  d = await readDay(page);
  check('zonder eerdere waarde geen regel', d.weight, '98,45 kg');
  await page.click('#insight-day-weight .insight-edit-card'); await page.waitForTimeout(350);
  check('vooringevuld', await page.inputValue('#insight-weight-input'), '98,45');
  await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', '97.5');
  await page.click('#btn-insight-weight-save'); await page.waitForTimeout(350);
  check('punt geaccepteerd', [await page.evaluate(() => db.bodyWeight['2026-10-22']), (await readDay(page)).weight], [97.5, '97,5 kg']);
  for (const [val, label] of [['19,99', 'onder 20'], ['400,01', 'boven 400'], ['0', 'nul'], [',', 'alleen komma']]) {
    await page.click('#insight-day-weight .insight-edit-card'); await page.waitForTimeout(350);
    await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', val);
    await page.click('#btn-insight-weight-save'); await page.waitForTimeout(100);
    check(`ongeldig: ${label}`, await page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('insight-weight-overlay').classList.contains('open'), db.bodyWeight['2026-10-22']]),
      ['Vul een gewicht in van 20 tot en met 400 kg', true, 97.5]);
    await page.evaluate(() => closeOverlay('insight-weight-overlay')); await page.waitForTimeout(300);
  }
  for (const [val, kg] of [['20', 20], ['400', 400]]) {
    await page.click('#insight-day-weight .insight-edit-card'); await page.waitForTimeout(350);
    await page.fill('#insight-weight-input', ''); await page.type('#insight-weight-input', val);
    await page.click('#btn-insight-weight-save'); await page.waitForTimeout(350);
    check(`grens ${val}`, await page.evaluate(() => db.bodyWeight['2026-10-22']), kg);
  }
  await page.type('#insight-weight-input', 'abc');
  check('letters geweigerd', await page.inputValue('#insight-weight-input'), '400');
  await page.click('#insight-day-weight .insight-edit-card'); await page.waitForTimeout(350);
  await page.fill('#insight-weight-input', '');
  await page.click('#btn-insight-weight-save'); await page.waitForTimeout(100);
  check('leeg opslaan wist niet: rode melding, venster blijft open', await page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('insight-weight-overlay').classList.contains('open'), db.bodyWeight['2026-10-22']]), ['Vul een gewicht in', true, 400]);
  await page.click('#btn-insight-weight-clear'); await page.waitForTimeout(350);
  check('Wissen → gewist', [await page.evaluate(() => db.bodyWeight['2026-10-22'] ?? null), (await readDay(page)).weight], [null, 'Nog niet ingevuld GEWICHT INVULLEN']);

  // --- Week overview updated right after saving
  await page.evaluate(() => { saveSleep('2026-10-22', '00:20', '06:50'); saveBodyWeight('2026-10-22', 98.4); });
  await page.click('#btn-back-insight-day').catch(() => {});
  await page.evaluate(() => { insightWeekStart = '2026-10-19'; showScreen('screen-insight'); });
  const wcell = await page.evaluate(() => [...document.querySelectorAll('.insight-grid .insight-cell')].filter(c => c.dataset.date === '2026-10-22').map(c => c.textContent.trim()));
  check('week toont slaap/gewicht van do', wcell.slice(3), ['6:30', '98,4']);

  // --- Screenshots: light/dark × 360/390
  const shots = [];
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 1300 });
    await setup(page, { ...BASE, sleep: { '2026-10-19': { bedtime: '00:20', wakeTime: '06:50' } }, bodyWeight: { '2026-10-19': 98.4, '2026-10-15': 98.8 } }, '2026-10-19', theme);
    await page.waitForTimeout(100);
    const f = `day-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    await setup(page, BASE, '2026-10-22', theme);
    const f2 = `day-empty-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f2) }); shots.push(f2);
    await page.setViewportSize({ width: w, height: 760 });
    await page.click('#insight-day-sleep .insight-fill-btn'); await page.waitForTimeout(350); await setClock('23:10', '06:40'); await page.waitForTimeout(100);
    const f3 = `sheet-sleep-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f3) }); shots.push(f3);
    await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await page.waitForTimeout(300);
    await page.click('#insight-day-weight .insight-fill-btn'); await page.type('#insight-weight-input', '98,4'); await page.waitForTimeout(350);
    const f4 = `sheet-weight-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f4) }); shots.push(f4);
    await page.evaluate(() => closeOverlay('insight-weight-overlay')); await page.waitForTimeout(300);
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

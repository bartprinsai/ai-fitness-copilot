// Inzicht, Trainingsoverzicht and the muscle-group detail screen (week): totals, comparison with the schedule,
// muscle-group rows, navigation, layout; the four comparison situations (short / on schedule / extra) in every place.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const S = (o = {}) => ({ weight: '50', reps: '10', rpe: '8', extra: '0', extraType: '', ...o });
const n = (k, o) => Array.from({ length: k }, () => S(o));

// ── Data for "Trainingsoverzicht en spiergroepdetail"
// Today: Thursday 22 October 2026 (week 43: 19–25 oktober). Fixed days: Mon Push, Wed Pull, Thu Legs.
const DAYS = [
  { id: 'd-push', name: 'Push', weekday: 0, exercises: [
    { exerciseId: 'bench-press', name: 'Bench press', sets: 4 }, { exerciseId: 'incline-bench-press', name: 'Incline bench press', sets: 3 },
    { exerciseId: 'triceps-pushdown-cable', name: 'Triceps pushdown', sets: 3 }, { exerciseId: 'lateral-raises-dumbbell', name: 'Lateral raises', sets: 3 }] },
  { id: 'd-pull', name: 'Pull', weekday: 2, exercises: [
    { exerciseId: 'lat-pulldown', name: 'Lat pulldown', sets: 4 }, { exerciseId: 'seated-cable-row', name: 'Seated cable row', sets: 3 },
    { exerciseId: 'barbell-curl', name: 'Barbell curl', sets: 3 }, { exerciseId: 'my-nogroup', name: 'Mijn oefening', sets: 2 }] },
  { id: 'd-legs', name: 'Legs', weekday: 3, exercises: [
    { exerciseId: 'squat', name: 'Squat', sets: 4 }, { exerciseId: 'leg-curl-machine', name: 'Leg curl', sets: 3 },
    { exerciseId: 'standing-calf-raise-machine', name: 'Calf raise', sets: 3 }] },
];
const DATA = {
  custom_exercises: [{ id: 'my-nogroup', name: 'Mijn oefening', category: 'arms' }, { id: 'my-other', name: 'Andere oefening', category: 'arms' }],
  exerciseInfo: {
    'bench-press': { primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'front-delts'] },
    'bench-press-dumbbell': { primaryMuscleGroup: 'chest' },
    'incline-bench-press': { primaryMuscleGroup: 'upper-chest', secondaryMuscleGroups: ['front-delts'] },
    'triceps-pushdown-cable': { primaryMuscleGroup: 'triceps' },
    'lateral-raises-dumbbell': { primaryMuscleGroup: 'side-delts' },
    'face-pulls': { primaryMuscleGroup: 'rear-delts' },
    'lat-pulldown': { primaryMuscleGroup: 'lats', secondaryMuscleGroups: ['biceps'] },
    'seated-cable-row': { primaryMuscleGroup: 'mid-back' },
    'barbell-curl': { primaryMuscleGroup: 'biceps' },
    'squat': { primaryMuscleGroup: 'quads', secondaryMuscleGroups: ['glutes'] },
    'leg-curl-machine': { primaryMuscleGroup: 'hamstrings' },
    'standing-calf-raise-machine': { primaryMuscleGroup: 'calves' },
    'my-nogroup': { secondaryMuscleGroups: ['triceps'] },
  },
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'ppl', planName: 'Push Pull Legs', type: 'fixed', days: DAYS, restWeekdays: [1, 4, 5, 6] } },
  weekCycle: {},
  workouts: {
    '2026-10-19': [ // Push
      { exerciseId: 'bench-press', sets: [S({ rpe: '10' }), S(), S({ weight: '40', isDropsetContinuation: true, rpe: '10' }), S({ extra: '2', extraType: 'partial' }), S({ extra: '1', extraType: 'forced' })] },
      { exerciseId: 'bench-press-dumbbell', sets: n(2) },
      { exerciseId: 'incline-bench-press', sets: n(2) },
      { exerciseId: 'triceps-pushdown-cable', sets: [S({ rpe: '10' }), S(), S()] },
    ],
    '2026-10-20': [{ exerciseId: 'face-pulls', sets: n(2) }], // rest day
    '2026-10-21': [ // Pull
      { exerciseId: 'lat-pulldown', sets: n(4) }, { exerciseId: 'seated-cable-row', sets: n(3) },
      { exerciseId: 'barbell-curl', sets: [S(), S(), S({ rpe: '10' }), S({ isDropsetContinuation: true })] },
      { exerciseId: 'my-nogroup', sets: n(3) }, { exerciseId: 'my-other', sets: n(1) },
    ],
  },
};
// The same week without any schedule version
const NO_SCHEDULE = { ...DATA, scheduleVersions: {} };
// Sort test: two groups with an equal share (Biceps and Borst both 2 sets) → MUSCLE_GROUPS order (Borst first)
const TIE = { ...DATA, workouts: { '2026-10-20': [{ exerciseId: 'barbell-curl', sets: n(2) }, { exerciseId: 'bench-press-dumbbell', sets: n(2) }, { exerciseId: 'face-pulls', sets: n(1) }] } };

// ── Data for "Vergelijking met het schema op elke plek"
// Today: Thursday 22 October 2026 (week 43). Mon: Push (bench 4, my-nogroup 3). Thu (today): Legs (squat 4).
const DAYS_2 = [
  { id: 'd-push', name: 'Push', weekday: 0, exercises: [{ exerciseId: 'bench-press', name: 'Bench press', sets: 4 }, { exerciseId: 'my-nogroup', name: 'Mijn oefening', sets: 3 }] },
  { id: 'd-legs', name: 'Legs', weekday: 3, exercises: [{ exerciseId: 'squat', name: 'Squat', sets: 4 }] },
];
const BASE = {
  custom_exercises: [{ id: 'my-nogroup', name: 'Mijn oefening', category: 'arms' }, { id: 'my-other', name: 'Andere oefening', category: 'arms' }],
  exerciseInfo: {
    'bench-press': { primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'] },
    'bench-press-dumbbell': { primaryMuscleGroup: 'chest' },
    'triceps-pushdown-cable': { primaryMuscleGroup: 'triceps' },
    squat: { primaryMuscleGroup: 'quads' },
  },
  scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'p1', planName: 'Test 1', type: 'fixed', days: DAYS_2, restWeekdays: [1, 2, 4, 5, 6] } },
  weekCycle: {}, sleep: {}, bodyWeight: {},
};
const week = mon => ({ ...BASE, workouts: { '2026-10-19': mon } });
// The four situations (chest: 4 planned; my-nogroup: 3 planned)
const SIT = {
  tekort: week([{ exerciseId: 'bench-press', sets: n(2) }, { exerciseId: 'my-nogroup', sets: n(3) }]),
  opSchema: week([{ exerciseId: 'bench-press', sets: n(4) }, { exerciseId: 'my-nogroup', sets: n(3) }]),
  opSchemaExtra: week([{ exerciseId: 'bench-press', sets: n(4) }, { exerciseId: 'bench-press-dumbbell', sets: n(2) }, { exerciseId: 'my-nogroup', sets: n(3) }]),
  tekortExtra: week([{ exerciseId: 'bench-press', sets: n(2) }, { exerciseId: 'bench-press-dumbbell', sets: n(0) }, { exerciseId: 'my-nogroup', sets: n(1) }, { exerciseId: 'my-other', sets: n(2) }]),
};
const EXPECT = {
  tekort: { card: '71% van je schema / 5 van 7 sets · −2 / 1 van 1 training', sum: '5 van 7 sets uit je schema · −2', chest: '2 van 4 · −2', none: '3 van 3 · op schema',
    detail: '2 van 4 sets uit je schema · −2' },
  opSchema: { card: '100% van je schema / 7 van 7 sets · op schema / 1 van 1 training', sum: '7 van 7 sets uit je schema · op schema', chest: '4 van 4 · op schema', none: '3 van 3 · op schema',
    detail: '4 van 4 sets uit je schema · op schema' },
  opSchemaExtra: { card: '100% van je schema / 7 van 7 sets · op schema · +2 extra / 1 van 1 training', sum: '7 van 7 sets uit je schema · op schema · +2 extra', chest: '4 van 4 · op schema · +2 extra', none: '3 van 3 · op schema',
    detail: '4 van 4 sets uit je schema · op schema · +2 extra' },
  tekortExtra: { card: '43% van je schema / 3 van 7 sets · −4 · +2 extra / 1 van 1 training', sum: '3 van 7 sets uit je schema · −4 · +2 extra', chest: '2 van 4 · −2', none: '1 van 3 · −2 · +2 extra',
    detail: '1 van 3 sets uit je schema · −2 · +2 extra' },
};

async function setup(page, data, theme = 'light') {
  await H.loadData(page, data, theme);
  await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
  await H.settle(page);
}
const overview = page => page.evaluate(() => {
  const body = document.getElementById('insight-training-body');
  return {
    title: document.querySelector('#screen-insight-training .toolbar-title').textContent,
    week: document.querySelector('#insight-training-head .insight-nav-title').textContent,
    schema: document.getElementById('insight-training-schema').textContent,
    totals: [...body.querySelectorAll('.insight-summary-cols > div')].map(c => c.querySelector('.section-label').textContent.toUpperCase() + ' ' + c.querySelector('.set-val').textContent),
    note: [...body.querySelectorAll('.insight-summary-note > div')].map(d => d.textContent),
    rows: [...body.querySelectorAll('.insight-mg-row')].map(r => {
      const subs = [...r.querySelectorAll('.role-sub')].map(s => s.textContent);
      return `${r.querySelector('.role-row').textContent} ${r.querySelector('.insight-pct').textContent} | ${subs.join(' | ')}`;
    }),
  };
});
const detail = page => page.evaluate(() => {
  const body = document.getElementById('insight-muscle-body');
  const lists = [...body.querySelectorAll('.insight-list')];
  const rows = l => l ? [...l.querySelectorAll('.insight-mg-row')].map(r => [...r.querySelectorAll('.role-row, .role-sub, .insight-mg-figure')].map(e => e.textContent).join(' | ')) : null;
  return {
    title: document.getElementById('insight-muscle-title').textContent,
    week: document.querySelector('#insight-muscle-head .insight-nav-title').textContent,
    totals: [...body.querySelectorAll('.insight-summary-cols > div')].map(c => c.querySelector('.section-label').textContent.toUpperCase() + ' ' + c.querySelector('.set-val').textContent),
    note: [...body.querySelectorAll('.insight-summary-note > div')].map(d => d.textContent),
    labels: [...body.querySelectorAll('.section-label')].map(l => l.textContent),
    oefeningen: rows(lists[0]) || [...body.querySelectorAll('.insight-empty')].map(e => e.textContent),
    meegetraind: rows(lists[1]),
  };
});
const activeScreen = page => page.evaluate(() => document.querySelector('.screen.active').id);
const show = o => console.log(JSON.stringify(o, null, 2).split('\n').map(l => '     ' + l).join('\n'));
const go = (page, fn, arg) => page.evaluate(([f, a]) => window[f](a), [fn, arg]).then(() => H.settle(page));
// The comparison spans: [text, colour role] — checks that only −N is danger and only "op schema" success
const colours = page => page.evaluate(() => {
  const tok = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const danger = tok('--danger'), success = tok('--success'), sec = tok('--text-secondary');
  const bad = [];
  document.querySelectorAll('.screen.active .insight-danger').forEach(e => { if (!/^−\d+$/.test(e.textContent) && !/^\d/.test(e.textContent) || getComputedStyle(e).color !== danger) bad.push(e.textContent); });
  document.querySelectorAll('.screen.active .insight-success').forEach(e => { if (e.textContent !== 'op schema' || getComputedStyle(e).color !== success) bad.push(e.textContent); });
  // "+N extra" is plain text in a .role-sub: secondary colour
  document.querySelectorAll('.screen.active .role-sub').forEach(e => { if (/extra/.test(e.textContent) && getComputedStyle(e).color !== sec) bad.push('extra-kleur: ' + e.textContent); });
  return bad;
});

async function trainingOverview(page) {
  await page.setViewportSize({ width: 360, height: 1600 });
  // ── 1. Week with shortfall, extra, unplanned group, planned group without sets, dropsets, no group, secondary
  await setup(page, DATA);
  const card = await page.evaluate(() => { const c = document.querySelector('[data-insight-metric="training"]');
    return { button: c.tagName, chevron: !!c.querySelector('.insight-chevron svg'), text: c.querySelector('.insight-edit-main').textContent }; });
  check('Training-kaart is een knop met chevron', [card.button, card.chevron], ['BUTTON', true]);
  console.log('     Training-kaart: ' + card.text);
  await page.click('[data-insight-metric="training"]');
  await H.settle(page);
  check('tik op Training-kaart opent het trainingsoverzicht', await activeScreen(page), 'screen-insight-training');
  const o = await overview(page);
  console.log('     TRAININGSOVERZICHT (vandaag do 22 okt, nog geen set vandaag):'); show(o);
  check('titel + week', [o.title, o.week], ['Training', 'Week 43']);
  check('schemaregel', o.schema, 'Schema: Push Pull Legs');
  check('vijf totalen', o.totals, ['SETS 27', 'FAILURE 4', 'PARTIAL 1', 'FORCED 1', 'DROPSET 2']);
  check('vergelijking + trainingen', o.note, ['21 van 25 sets uit je schema · −4 · +6 extra', '2 van 2 trainingen']);
  check('19 rijen (18 + Geen spiergroep)', o.rows.length, 19);
  check('Geen spiergroep als laatste', o.rows[18].startsWith('Geen spiergroep'), true);

  // Navigation: back from the overview lands on the week overview, on the week last shown
  await page.click('#insight-training-head [data-insight-step="-1"]');
  check('bladeren in overzicht → week 42', (await overview(page)).week, 'Week 42');
  await page.click('#insight-training-head [data-insight-step="1"]');
  check('terug naar week 43, volgende-knop uit', [(await overview(page)).week, await page.isDisabled('#insight-training-head [data-insight-step="1"]')], ['Week 43', true]);

  // ── Detail of one muscle group (Borst, no Meegetraind)
  await page.click('[data-insight-mg="chest"]');
  await H.settle(page);
  check('tik op Borst opent het detailscherm', await activeScreen(page), 'screen-insight-muscle');
  const dChest = await detail(page);
  console.log('     DETAIL BORST:'); show(dChest);
  check('Borst: totalen', dChest.totals, ['SETS 6', 'FAILURE 2', 'PARTIAL 1', 'FORCED 1', 'DROPSET 1']);
  check('Borst: noot', dChest.note, ['4 van 4 sets uit je schema · op schema · +2 extra', '22% van al je sets']);
  check('Borst: geen Meegetraind', [dChest.meegetraind, dChest.labels.includes('Meegetraind')], [null, false]);

  const tri = async () => { await page.evaluate(() => openInsightMuscle('triceps')); await H.settle(page); return detail(page); };
  const dTri = await tri();
  console.log('     DETAIL TRICEPS:'); show(dTri);
  check('Triceps: Meegetraind met primair', dTri.meegetraind, ['Bench press | Primair: Borst | 4sets', 'Mijn oefening | Primair: niet ingesteld | 3sets']);
  await page.evaluate(() => openInsightMuscle('side-delts')); await H.settle(page);
  const dSide = await detail(page);
  console.log('     DETAIL ZIJKANT SCHOUDERS (gepland, niet gedaan):'); show(dSide);
  await page.evaluate(() => openInsightMuscle('')); await H.settle(page);
  const dNone = await detail(page);
  console.log('     DETAIL GEEN SPIERGROEP:'); show(dNone);
  await page.evaluate(() => openInsightMuscle('glutes')); await H.settle(page);
  const dGlutes = await detail(page);
  console.log('     DETAIL GLUTES (niets gedaan):'); show(dGlutes);
  check('Glutes: lege staat', dGlutes.oefeningen, ['Geen oefeningen deze week']);

  // Browse on the detail screen, then back twice
  await page.evaluate(() => openInsightMuscle('chest')); await H.settle(page);
  await page.click('#insight-muscle-head [data-insight-step="-1"]'); await H.settle(page);
  const dPrev = await detail(page);
  check('detail bladeren → week 42, zelfde spiergroep', [dPrev.week, dPrev.title, dPrev.totals[0]], ['Week 42', 'Borst', 'SETS 0']);
  await page.click('#btn-back-insight-muscle'); await H.settle(page);
  // Several muscle detail screens were opened via openInsightMuscle on top of each other? showScreen on an active screen
  // pushes no entry, so one back step leads to the overview.
  check('terug (pijl) uit detail → trainingsoverzicht op week 42', [await activeScreen(page), (await overview(page)).week], ['screen-insight-training', 'Week 42']);
  await page.evaluate(() => openInsightMuscle('chest')); await H.settle(page);
  await page.click('#insight-muscle-head [data-insight-step="1"]'); await H.settle(page);
  await page.goBack(); await H.settle(page);
  check('hardwareterug uit detail → overzicht op week 43', [await activeScreen(page), (await overview(page)).week], ['screen-insight-training', 'Week 43']);
  await page.click('#insight-training-head [data-insight-step="-1"]'); await H.settle(page);
  await page.goBack(); await H.settle(page);
  check('hardwareterug uit overzicht → weekoverzicht op week 42', [await activeScreen(page), await page.textContent('#insight-head .insight-nav-title')], ['screen-insight', 'Week 42']);
  await page.click('[data-insight-metric="training"]'); await H.settle(page);
  check('Training-kaart opent dezelfde week (42)', (await overview(page)).week, 'Week 42');
  await page.click('#btn-back-insight-training'); await H.settle(page);
  check('terugpijl uit overzicht → weekoverzicht', await activeScreen(page), 'screen-insight');

  // ── 2. Today after the first set: totals count today either way, only the comparison changes
  const withToday = JSON.parse(JSON.stringify(DATA));
  withToday.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: n(2) }];
  await setup(page, withToday);
  await page.evaluate(() => openInsightTraining()); await H.settle(page);
  const oToday = await overview(page);
  console.log('     NA DE EERSTE SET VANDAAG (2 sets squat):'); show({ totals: oToday.totals, note: oToday.note, rows: oToday.rows.filter(r => /Quadriceps|Hamstrings|Kuiten/.test(r)) });
  const before = await (async () => { await setup(page, DATA); await page.evaluate(() => openInsightTraining()); await H.settle(page); return overview(page); })();
  check('vóór eerste set: Quadriceps/Hamstrings staan vandaag gepland (tellen nog niet mee)', before.rows.filter(r => /Quadriceps|Hamstrings/.test(r)), ['Quadriceps 0% | 0 sets · vandaag gepland', 'Hamstrings 0% | 0 sets · vandaag gepland']);

  // ── 3. Sort with equal percentages
  await setup(page, TIE);
  await page.evaluate(() => openInsightTraining()); await H.settle(page);
  const oTie = await overview(page);
  check('gelijke percentages → volgorde MUSCLE_GROUPS', oTie.rows.slice(0, 4).map(r => r.split(' |')[0]), ['Borst 40%', 'Biceps 40%', 'Achterste schouders 20%', 'Bovenborst 0%']);
  check('0%-rijen in MUSCLE_GROUPS-volgorde', oTie.rows.slice(3, 6).map(r => r.split(' ')[0]), ['Bovenborst', 'Lats', 'Middenrug']);

  // ── 4. Week without a schedule
  await setup(page, NO_SCHEDULE);
  await page.evaluate(() => openInsightTraining()); await H.settle(page);
  const oNone = await overview(page);
  console.log('     ZONDER SCHEMA:'); show({ schema: oNone.schema, totals: oNone.totals, note: oNone.note, rows: oNone.rows.slice(0, 4).concat(oNone.rows.slice(-2)) });
  check('zonder schema: noot', oNone.note, ['3 trainingen · geen vergelijking met schema']);
  check('zonder schema: regel 1 alleen "N sets"', oNone.rows.every(r => /^\D+ \d+% \| \d+ sets?( \||$)/.test(r)), true);
  await page.evaluate(() => openInsightMuscle('chest')); await H.settle(page);
  check('zonder schema: detail zonder vergelijkingsregel', (await detail(page)).note, ['22% van al je sets']);

  // ── 5. Layout: 360 / 390, light / dark
  for (const w of H.WIDTHS) for (const theme of H.THEMES) {
    const tag = `${theme} ${w}px`;
    await page.setViewportSize({ width: w, height: 1600 });
    await setup(page, DATA, theme);
    await page.evaluate(() => openInsightTraining()); await H.settle(page);
    const lay = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('#insight-training-body .insight-summary-cols > div')];
      const labels = cols.map(c => c.querySelector('.section-label'));
      const fits = labels.map(l => l.scrollWidth <= l.clientWidth && l.getBoundingClientRect().height <= 16);
      const gaps = labels.slice(1).map((l, i) => {
        const r = document.createRange(); r.selectNodeContents(labels[i]); const a = r.getBoundingClientRect();
        const r2 = document.createRange(); r2.selectNodeContents(l); const b = r2.getBoundingClientRect();
        return Math.round((b.left - a.right) * 10) / 10; });
      const widths = cols.map(c => Math.round(c.getBoundingClientRect().width * 10) / 10);
      const sc = document.getElementById('insight-training-scroll');
      const rows = [...document.querySelectorAll('.insight-mg-list .insight-mg-row')];
      const svgW = [...new Set(rows.map(r => Math.round(r.querySelector('.insight-mg-bars').getBoundingClientRect().width)))];
      const pctRight = [...new Set(rows.map(r => Math.round(r.querySelector('.insight-pct').getBoundingClientRect().right)))];
      const minH = Math.min(...rows.map(r => r.getBoundingClientRect().height));
      const dot = getComputedStyle(document.querySelector('.insight-dot-done'));
      const dot2 = getComputedStyle(document.querySelector('.insight-dot-planned'));
      const bar = getComputedStyle(document.querySelector('.insight-mg-bars .insight-bar')).fill;
      const bar2 = getComputedStyle(document.querySelector('.insight-mg-bars .insight-bar-planned')).fill;
      const chev = document.querySelector('.insight-mg-list .insight-chevron svg').getBoundingClientRect();
      const tok = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const pctVal = getComputedStyle(document.querySelector('.insight-pct .set-val'));
      return { lw: labels.map(l => l.scrollWidth), fits, gaps, widths, overflow: sc.scrollWidth > sc.clientWidth || document.documentElement.scrollWidth > innerWidth, svgW, pctRight, minH,
        dot: [dot.width, dot.backgroundColor === tok('--primary'), dot2.backgroundColor === tok('--text-muted')],
        bars: [bar === tok('--primary'), bar2 === tok('--text-muted')], chevron: [chev.width, chev.height],
        pct: [pctVal.fontSize, pctVal.fontWeight], labelFont: getComputedStyle(labels[0]).fontSize + '/' + getComputedStyle(labels[0]).fontWeight };
    });
    console.log(`     ${tag}: kolombreedtes ${lay.widths.join(', ')}; labelbreedtes ${lay.lw.join(', ')}; ruimte tussen labels ${lay.gaps.join(', ')} px`);
    check(`${tag}: vijf labels op één regel, niet afgekapt`, lay.fits, [true, true, true, true, true]);
    check(`${tag}: labels raken elkaar niet`, lay.gaps.every(g => g >= 4), true);
    check(`${tag}: geen horizontale overloop`, lay.overflow, false);
    check(`${tag}: balkjes van alle rijen even breed (zelfde schaal) + % rechts uitgelijnd`, [lay.svgW.length, lay.pctRight.length], [1, 1]);
    check(`${tag}: rij ≥ 48px, chevron 20px, % 20px/700, label 11px/500`, [lay.minH >= 48, lay.chevron, lay.pct, lay.labelFont], [true, [20, 20], ['20px', '700'], '11px/500']);
    check(`${tag}: legenda 8px --primary/--text-muted, balkjes idem`, [lay.dot, lay.bars], [['8px', true, true], [true, true]]);
    await page.screenshot({ path: path.join(OUT, `training-${theme}-${w}.png`), fullPage: true });
    await page.evaluate(() => openInsightMuscle('triceps')); await H.settle(page);
    const d = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')];
      return { heights: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height - parseFloat(getComputedStyle(r).borderTopWidth))))],
        centered: rows.every(r => { const f = r.querySelector('.insight-mg-figure'); if (!f) return true; const a = r.getBoundingClientRect(), b = f.getBoundingClientRect();
          return Math.abs((a.top + 1 + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 0.6; }),
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    check(`${tag}: detail rijen 58px (zonder lijn), waarde in het midden, geen overloop`, d, { heights: [58], centered: true, overflow: false });
    await page.screenshot({ path: path.join(OUT, `muscle-triceps-${theme}-${w}.png`), fullPage: true });
    await page.evaluate(() => openInsightMuscle('chest')); await H.settle(page);
    await page.screenshot({ path: path.join(OUT, `muscle-chest-${theme}-${w}.png`), fullPage: true });
    await page.evaluate(() => { insightWeekStart = '2026-10-19'; showScreen('screen-insight'); }); await H.settle(page);
    await page.screenshot({ path: path.join(OUT, `week-${theme}-${w}.png`), fullPage: true });
  }

  // ── 6. Regression: day overview and the existing Training card texts
  await setup(page, DATA);
  await page.evaluate(() => openInsightDay('2026-10-19')); await H.settle(page);
  const day = await page.evaluate(() => [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r => r.textContent));
  console.log('     DAGOVERZICHT MAANDAG:'); show(day);
  check('dagoverzicht: Bench press-regel ongewijzigd', day.some(t => t.includes('Bench press · 4 sets · 2 failure · 1 partial · 1 forced · 1 dropset')), true);
}

async function comparisons(page) {
  await page.setViewportSize({ width: 360, height: 1400 });
  // ── 1. Four situations, every place
  for (const [k, data] of Object.entries(SIT)) {
    const e = EXPECT[k];
    await setup(page, data);
    const card = await page.evaluate(() => { const c = document.querySelector('[data-insight-metric="training"]');
      const fig = c.querySelector('.insight-edit-main > .insight-figure');
      return [fig.querySelector('.insight-pct').textContent + ' ' + fig.querySelector(':scope > .set-unit').textContent, ...[...c.querySelectorAll('.insight-edit-main > .role-sub')].map(x => x.textContent)].join(' / '); });
    const cardCol = await colours(page);
    await go(page, 'openInsightTraining');
    const ov = await page.evaluate(() => ({
      sum: document.querySelector('#insight-training-body .insight-summary-note div').textContent,
      rows: Object.fromEntries([...document.querySelectorAll('.insight-mg-list .insight-mg-row')].map(r => [r.dataset.insightMg, r.querySelectorAll('.role-sub')[0].textContent])),
    }));
    const ovCol = await colours(page);
    await go(page, 'openInsightMuscle', k === 'tekortExtra' ? '' : 'chest');
    const det = await page.evaluate(() => document.querySelector('#insight-muscle-body .insight-summary-note div').textContent);
    const detCol = await colours(page);
    await go(page, 'openInsightDay', '2026-10-19');
    const day = await page.evaluate(() => ({
      head: document.querySelector('#insight-day-training .insight-summary-note div').textContent,
      rows: [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r => [r.querySelector('.role-row').textContent, r.querySelector('.insight-mg-main > .role-sub').textContent]),
    }));
    const dayCol = await colours(page);
    const dayRow = name => (day.rows.find(r => r[0] === name) || [])[1];
    check(`${k}: Training-kaart (vergelijking bij de sets, trainingen eronder)`, card, e.card);
    check(`${k}: samenvatting trainingsoverzicht`, ov.sum, e.sum);
    check(`${k}: spiergroeprij Borst / Geen spiergroep`, [ov.rows.chest, ov.rows['']], [e.chest, e.none]);
    check(`${k}: detailscherm (${k === 'tekortExtra' ? 'Geen spiergroep' : 'Borst'})`, det, e.detail);
    // the week holds only Monday, so the day overview of Monday says what the training overview says
    check(`${k}: dagoverzicht samenvatting = trainingsoverzicht`, day.head, e.sum);
    check(`${k}: dagoverzicht rij Borst / Geen spiergroep = trainingsoverzicht`, [dayRow('Borst'), dayRow('Geen spiergroep')], [e.chest, e.none]);
    check(`${k}: kleuren (−N danger, op schema success, extra secundair)`, [...cardCol, ...ovCol, ...detCol, ...dayCol], []);
  }

  // ── 2. Planned only today (Quadriceps via Legs on Thursday), before and after the first set
  await setup(page, SIT.opSchema);
  await go(page, 'openInsightTraining');
  const before = await page.evaluate(() => [...document.querySelectorAll('[data-insight-mg="quads"] .role-sub')].map(e => [e.textContent, getComputedStyle(e).color]));
  await go(page, 'openInsightMuscle', 'quads');
  const beforeDet = await page.evaluate(() => ({ note: document.querySelector('#insight-muscle-body .insight-summary-note div').textContent,
    list: [...document.querySelectorAll('#insight-muscle-body .insight-mg-row')].map(r => r.textContent) }));
  check('vandaag gepland, vóór eerste set: rij Quadriceps', before.map(b => b[0]), ['0 sets · vandaag gepland']);
  check('vandaag gepland: secundaire tekstkleur', before[0][1], await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--text-secondary)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }));
  check('vandaag gepland: detailscherm', beforeDet, { note: '0 sets · vandaag gepland', list: ['SquatVandaag gepland · 4 sets'] });
  check('andere spiergroep zonder schema blijft "niet in schema"', await page.evaluate(() => { openInsightTraining(); return document.querySelector('[data-insight-mg="glutes"] .role-sub').textContent; }), '0 sets · niet in schema');
  await go(page, 'openInsightDay', '2026-10-22');
  console.log('     dagoverzicht vandaag vóór eerste set: ' + await page.evaluate(() => document.querySelector('#insight-day-training').innerText.replace(/\n+/g, ' | ')));
  const after = JSON.parse(JSON.stringify(SIT.opSchema)); after.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: n(2) }];
  await setup(page, after);
  await go(page, 'openInsightTraining');
  check('na eerste set: rij Quadriceps', await page.evaluate(() => document.querySelector('[data-insight-mg="quads"] .role-sub').textContent), '2 van 4 · −2');
  await go(page, 'openInsightMuscle', 'quads');
  check('na eerste set: detailscherm', await page.evaluate(() => document.querySelector('#insight-muscle-body .insight-summary-note div').textContent), '2 van 4 sets uit je schema · −2');

  // ── 4. Schedule line on the muscle-group screen
  check('schemaregel detailscherm = trainingsoverzicht', await page.evaluate(() => [document.getElementById('insight-muscle-schema').textContent,
    (openInsightTraining(), document.getElementById('insight-training-schema').textContent)]), ['Schema: Test 1', 'Schema: Test 1']);

  // ── 3 + 5 + themes/widths
  const LISTS = JSON.parse(JSON.stringify(SIT.opSchemaExtra));
  LISTS.workouts['2026-10-19'][0].sets[0].rpe = '10'; // bench press gets a feature line, dumbbell press stays one line
  LISTS.workouts['2026-10-19'].push({ exerciseId: 'triceps-pushdown-cable', sets: n(2) });
  LISTS.sleep = { '2026-10-19': { bedtime: '23:00', wakeTime: '06:40' }, '2026-10-20': { bedtime: '23:30', wakeTime: '07:10' } };
  LISTS.bodyWeight = { '2026-10-19': 98.4, '2026-10-21': 98.1 };
  const rowInfo = (page, sel) => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(r => r.offsetParent).map(r => {
    const rb = r.getBoundingClientRect(), bt = parseFloat(getComputedStyle(r).borderTopWidth);
    const mid = (rb.top + bt + rb.bottom) / 2;
    const lines = [...r.querySelector('.insight-mg-main').children];
    const lb = lines.reduce((a, l) => { const b = l.getBoundingClientRect(); return [Math.min(a[0], b.top), Math.max(a[1], b.bottom)]; }, [1e9, -1e9]);
    const f = r.querySelector('.insight-mg-figure');
    return { lines: lines.length, h: Math.round((rb.height - bt) * 10) / 10, leftOff: Math.round(((lb[0] + lb[1]) / 2 - mid) * 10) / 10,
      firstTop: Math.round((lb[0] - rb.top - bt) * 10) / 10,
      figOff: f ? Math.round(((f.getBoundingClientRect().top + f.getBoundingClientRect().bottom) / 2 - mid) * 10) / 10 : null };
  }), sel);
  const spaces = page => page.evaluate(() => {
    const card = document.querySelector('.screen.active .insight-summary');
    const cb = card.getBoundingClientRect();
    const cols = [...card.querySelectorAll('.insight-summary-cols > div')].map(c => c.getBoundingClientRect());
    const sp = [cols[0].left - cb.left, ...cols.slice(1).map((c, i) => c.left - cols[i].right), cb.right - cols[cols.length - 1].right];
    const inner = [...card.querySelectorAll('.insight-summary-cols > div')].map(c => { const l = c.querySelector('.section-label').getBoundingClientRect(), f = c.querySelector('.insight-figure').getBoundingClientRect(), b = c.getBoundingClientRect();
      return Math.abs((l.left + l.right) / 2 - (b.left + b.right) / 2) < 0.6 && Math.abs((f.left + f.right) / 2 - (b.left + b.right) / 2) < 0.6; });
    return { sp: sp.map(x => Math.round(x * 10) / 10), centred: inner.every(Boolean), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  const even = s => Math.max(...s.sp) - Math.min(...s.sp) <= 0.6 && Math.min(...s.sp) > 0;
  for (const w of H.WIDTHS) for (const theme of H.THEMES) {
    const tag = `${theme} ${w}px`;
    await page.setViewportSize({ width: w, height: 1400 });
    await setup(page, LISTS, theme);
    await go(page, 'openInsightTraining');
    const sT = await spaces(page);
    console.log(`     ${tag} Training: ruimtes ${sT.sp.join(' · ')}`);
    check(`${tag}: Training 5 kolommen gelijke ruimte, label+getal gecentreerd, geen overloop`, [even(sT), sT.centred, sT.overflow], [true, true, false]);
    await page.screenshot({ path: path.join(OUT, `v2-training-${theme}-${w}.png`), fullPage: true });
    await go(page, 'openInsightMuscle', 'chest');
    const sM = await spaces(page);
    check(`${tag}: spiergroep 5 kolommen gelijke ruimte`, [even(sM), sM.centred], [true, true]);
    const oef = await rowInfo(page, '#insight-muscle-body .insight-list .insight-mg-row');
    console.log(`     ${tag} OEFENINGEN + MEEGETRAIND (Borst): ${JSON.stringify(oef)}`);
    await page.screenshot({ path: path.join(OUT, `v2-chest-${theme}-${w}.png`), fullPage: true });
    await go(page, 'openInsightMuscle', 'triceps');
    const tri = await rowInfo(page, '#insight-muscle-body .insight-list .insight-mg-row');
    await page.screenshot({ path: path.join(OUT, `v2-triceps-${theme}-${w}.png`), fullPage: true });
    const all = [...oef, ...tri];
    check(`${tag}: OEFENINGEN/MEEGETRAIND één én twee regels aanwezig`, [all.some(r => r.lines === 1), all.some(r => r.lines === 2)], [true, true]);
    check(`${tag}: OEFENINGEN/MEEGETRAIND rijen 58px, links en rechts in het midden`, [...new Set(all.map(r => r.h))].concat(all.every(r => Math.abs(r.leftOff) <= 0.6 && Math.abs(r.figOff) <= 0.6)), [58, true]);
    check(`${tag}: twee regels blijven bovenaan (12px)`, [...new Set(all.filter(r => r.lines === 2).map(r => r.firstTop))], [12]);
    for (const kind of ['sleep', 'weight']) {
      await page.evaluate(k => { insightWeekStart = '2026-10-19'; openInsightMetric(k); }, kind); await H.settle(page);
      const s3 = await spaces(page);
      console.log(`     ${tag} ${kind}: ruimtes ${s3.sp.join(' · ')}`);
      check(`${tag}: ${kind} 3 kolommen gelijke ruimte`, [even(s3), s3.centred, s3.overflow], [true, true, false]);
      const rr = await rowInfo(page, '#insight-metric-body .insight-list-row');
      check(`${tag}: ${kind} rijen (${[...new Set(rr.map(r => r.lines))].join('+')} regels) 58px, links en rechts in het midden`, [...new Set(rr.map(r => r.h))].concat(rr.every(r => Math.abs(r.leftOff) <= 0.6 && (r.figOff === null || Math.abs(r.figOff) <= 0.6))), [58, true]);
      await page.screenshot({ path: path.join(OUT, `v2-${kind}-${theme}-${w}.png`), fullPage: true });
    }
    // Day overview muscle rows: the training overview's row, the value in the middle
    await go(page, 'openInsightDay', '2026-10-19');
    const base = await page.evaluate(() => [...document.querySelectorAll('#insight-day-training .insight-mg-row')].map(r => getComputedStyle(r).alignItems));
    check(`${tag}: dagoverzicht spiergroeprijen in het midden`, [...new Set(base)], ['center']);
  }
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1600, scale: 2 });
  H.section('Trainingsoverzicht en spiergroepdetail');
  await trainingOverview(page);
  H.section('Vergelijking met het schema op elke plek');
  await comparisons(page);
  await browser.close();
  check('geen JS-fouten', errors, []);
});

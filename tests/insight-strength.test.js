// Inzicht, Kracht: estimated-1RM rules, the Kracht card in Week / Maand / Jaar, records, the screen Kracht (a card
// with a chart per category) and the screen of a category (a chart per exercise, Sterkst / Zwakst), the time frame of
// the charts, zooming in and back, no way to the Fitness Tracker, empty states, Kracht volgen in Oefeninginfo /
// Nieuwe oefening, layout.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const S = (w, r, o = {}) => ({ weight: String(w), reps: String(r), rpe: '8', extra: '0', extraType: '', ...o });
// Today: Thursday 22 October 2026 (week 43 = 19–25 Oct; week 42 = 12–18 Oct).
const DATA = {
  custom_exercises: [], scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {},
  exerciseInfo: {
    'bench-press': { primaryMuscleGroup: 'chest', trackStrength: true },
    'incline-bench-press': { trackStrength: true },
    squat: { trackStrength: true },
    deadlift: { trackStrength: true },
    'barbell-curl': { trackStrength: true },
    treadmill: { trackStrength: true },          // Cardio: never counts
    'lat-pulldown': { primaryMuscleGroup: 'lats' }, // not tracked
  },
  workouts: {
    '2025-03-10': [{ exerciseId: 'bench-press', sets: [S(90, 5)] }],
    '2026-09-15': [{ exerciseId: 'bench-press', sets: [S(95, 5)] }],
    '2026-09-16': [{ exerciseId: 'squat', sets: [S(150, 5)] }],
    '2026-10-06': [{ exerciseId: 'incline-bench-press', sets: [S(75, 8)] }],
    '2026-10-13': [{ exerciseId: 'bench-press', sets: [S(100, 5)] }, { exerciseId: 'squat', sets: [S(140, 5)] }, { exerciseId: 'deadlift', sets: [S(180, 3)] }],
    '2026-10-19': [
      { exerciseId: 'bench-press', sets: [
        S(102.5, 5),                                  // main set of a dropset: counts → 119,6
        S(110, 8, { isDropsetContinuation: true }),  // a drop: would be 139,3 — never counts
        S(95, 6, { extra: '4', extraType: 'partial' }), // full reps only: 114 (with extras 126,7)
        S(0, 10), S(60, 0),                           // 0 kg / 0 reps: never
      ] },
      { exerciseId: 'incline-bench-press', sets: [S(80, 8)] },
      { exerciseId: 'lat-pulldown', sets: [S(200, 10)] },
      { exerciseId: 'treadmill', sets: [S(10, 30)] },
    ],
    '2026-10-20': [{ exerciseId: 'squat', sets: [S(140, 3)] }],
  },
};

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1400 });
  const setup = async (data = DATA, theme = 'light') => {
    await H.loadData(page, data, theme);
    await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
    await page.waitForTimeout(60);
  };
  const click = async sel => { await page.click(sel); await page.waitForTimeout(80); };
  const card = () => page.evaluate(() => {
    const c = document.querySelector('[data-insight-metric="strength"]');
    return { label: c.querySelector('.insight-card-label').textContent, chevron: !!c.querySelector('.insight-chevron'),
      rows: [...c.querySelectorAll('.insight-strength-row')].map(r => [...r.querySelectorAll('.role-row, .role-sub, .insight-figure')].map(e => e.textContent + (e.querySelector('.insight-success') || e.classList.contains('insight-success') ? '(groen)' : '') + (e.classList.contains('insight-muted') ? '(grijs)' : '')).join(' | ')),
      note: (c.querySelector('.insight-strength-note') || {}).textContent, empty: (c.querySelector('.insight-empty') || {}).textContent,
      trophy: !!c.querySelector('.insight-records .insight-pr') };
  });
  // ── Rekenregels (pure functies)
  const calc = await page.evaluate(() => ({
    calc: computeOneRm('102,5', '5').oneRm, fn: estimatedOneRm(102.5, 5), one: estimatedOneRm(100, 1),
    dayBench: (Object.assign(db, { workouts: {} }), null),
  }));
  check('1RM Calculator en Kracht geven hetzelfde (102,5 kg × 5)', [calc.calc, calc.fn], [119.6, 119.6]);
  check('1 rep = het gewicht zelf', calc.one, 100);
  await setup();
  const rules = await page.evaluate(() => ({
    bench19: dayBestOneRm('bench-press', '2026-10-19'),
    withDrop: estimatedOneRm(110, 8), withExtras: estimatedOneRm(95, 10), fullReps: estimatedOneRm(95, 6),
    pct: [2.485, -0.8, 0.04, -0.04, 0, 13.92].map(p => insightStrengthPct(p).text + (insightStrengthPct(p).cls ? '(groen)' : '')),
    records: [...getPRSetKeys('bench-press')].sort(),
  }));
  check('bench 19 okt: hoofdset van de dropset telt (119,6), drop (139,3) en extra reps (126,7) niet', [rules.bench19, rules.withDrop, rules.withExtras, rules.fullReps], [119.6, 139.3, 126.7, 114]);
  check('percentage: 1 decimaal, komma, teken, geen rood', rules.pct, ['+2,5(groen)', '−0,8', '0,0', '0,0', '0,0', '+13,9(groen)']);
  check('trofeeën bench (getPRSetKeys)', rules.records, ['2026-10-19#0', '2026-10-19#2']);

  // ── Week 43 vs week 42
  check('Week: kaart', await card(), {
    label: 'Kracht3 records', chevron: true,
    rows: ['Borst | +2,5%(groen) | 3 records', 'Rug | Geen vergelijking(grijs)', 'Armen | Geen vergelijking(grijs)', 'Benen | −5,7%'],
    note: 'Gemiddelde verandering van de geschatte 1RM t.o.v. week 42', trophy: true });

  // ── Maand en Jaar op de kaart (ongewijzigd)
  await click('#insight-head [data-insight-period="month"]');
  check('Maand: kaart', (await card()).note, 'Gemiddelde verandering van de geschatte 1RM t.o.v. september');
  await click('#insight-head [data-insight-period="year"]');
  const yc = await card();
  check('Jaar: kaart', [yc.rows, yc.note, yc.label], [['Borst | +13,9%(groen) | 3 records', 'Rug | Geen vergelijking(grijs) | 1 record', 'Armen | Geen vergelijking(grijs)', 'Benen | Geen vergelijking(grijs) | 1 record'],
    'Gemiddelde verandering van de geschatte 1RM t.o.v. 2025', 'Kracht5 records']);
  await click('#insight-head [data-insight-step="-1"]');
  const y25 = await card();
  check('Jaar 2025: geen records = geen trofee rechtsboven, geen "records"-regel', [y25.label, y25.trophy, y25.rows[0]], ['Kracht', false, 'Borst | Geen vergelijking(grijs)']);
  check('zonder records: het pijltje staat in de kop rechts naast het label KRACHT, rechts uitgelijnd, midden op het label', await page.evaluate(() => {
    const card = document.querySelector('[data-insight-metric="strength"]'), head = card.querySelector('.insight-card-label'), chev = head.querySelector('.insight-chevron svg');
    const label = head.querySelector('.section-label').getBoundingClientRect(), c = chev && chev.getBoundingClientRect(), box = card.querySelector('.insight-edit-main').getBoundingClientRect();
    return chev && { right: Math.abs(c.right - box.right) < 0.5, middle: Math.abs((c.top + c.bottom) / 2 - (label.top + label.bottom) / 2) < 2, records: !!head.querySelector('.insight-records'), count: card.querySelectorAll('.insight-chevron').length };
  }), { right: true, middle: true, records: false, count: 1 });
  check('de hele Kracht-kaart blijft één knop', await page.evaluate(() => document.querySelector('[data-insight-metric="strength"]').tagName), 'BUTTON');

  // ── De categorielijn (pure functie): twee oefeningen die op een verschillend punt beginnen
  //   A: 100 · – · 110 · 120 (begint op punt 1), B: – · 50 · 55 · 50 (begint op punt 2)
  //   punt 3: A 110 ÷ 100 − 1 = +10%, B 55 ÷ 50 − 1 = +10% → (10 + 10) ÷ 2 = +10%
  //   punt 4: A 120 ÷ 100 − 1 = +20%, B 50 ÷ 50 − 1 = 0%  → (20 + 0) ÷ 2 = +10%
  const line = await page.evaluate(() => ({
    two: insightCategoryLine([[100, null, 110, 120], [null, 50, 55, 50]]).map(v => v === null ? null : Math.round(v * 1e6) / 1e6),
    gap: insightCategoryLine([[null, 80, null, 88], [null, null, null, null]]).map(v => v === null ? null : Math.round(v * 1e6) / 1e6),
    none: insightCategoryLine([[null, null], [null, null]]),
    axis: [insightPctChartOptions([0, 0, 10, 10], ['a', 'b', 'c', 'd'], 'x'), insightPctChartOptions([0, -2, -1.5], ['a', 'b', 'c'], 'x'), insightPctChartOptions([0], ['a'], 'x')]
      .map(o => [o.lo, o.hi, o.ticks.map(t => t.label).join(' ')]),
  }));
  check('categorielijn: punt 1 en 2 zijn 0% (elk zijn eigen begin), punt 3 +10%, punt 4 +10%', line.two, [0, 0, 10, 10]);
  check('categorielijn: punten zonder waarde blijven leeg (null), een oefening zonder enig punt telt niet', [line.gap, line.none], [[null, 0, null, 10], [null, null]]);
  check('categorielijn: y-as in procenten met teken, 0% altijd binnen de as', line.axis, [[-2.5, 12.5, '0% +5% +10%'], [-2.5, 0.5, '−2% −1% 0%'], [-0.75, 0.75, '−0,5% 0% +0,5%']]);
  await setup();
  const real = await page.evaluate(() => {
    const r = insightRange();
    const pts = insightStrengthPoints(r);
    const s = ['bench-press', 'incline-bench-press'].map(id => insightStrengthSeries(id, pts).map(p => p && p.value));
    return { s, line: insightCategoryLine(s).map(v => v === null ? null : Math.round(v * 1000) / 1000) };
  });
  // bench: week 38 110,8 · week 42 116,7 · week 43 119,6; incline: week 41 95 · week 43 101,3
  check('Borst, Week 43: de reeksen per oefening', real.s, [[null, null, 110.8, null, null, null, 116.7, 119.6], [null, null, null, null, null, 95, null, 101.3]]);
  check('Borst, Week 43: lijn 0 · 0 · (116,7÷110,8−1) · gem. van (119,6÷110,8−1) en (101,3÷95−1)', real.line,
    [null, null, 0, null, null, 0, Math.round((116.7 / 110.8 - 1) * 100000) / 1000, Math.round(((119.6 / 110.8 - 1) + (101.3 / 95 - 1)) / 2 * 100000) / 1000]);

  // ── Tijdsbestek: Week = 8 weken, Maand = 6 maanden, Jaar = jan t/m dec (komende maanden zonder punt)
  const frames = await page.evaluate(() => [
    { period: 'week', start: '2026-10-19' }, { period: 'month', start: '2026-10-01' }, { period: 'year', start: '2026-01-01' },
    { period: 'week', start: '2026-01-05' }, { period: 'month', start: '2026-02-01' }, { period: 'year', start: '2025-01-01' },
  ].map(r => insightStrengthPoints(r).map(p => p.label + (p.future ? '*' : '')).join(' ') + ' | ' + insightStrengthPoints(r)[0].from + '…' + insightStrengthPoints(r).slice(-1)[0].to));
  check('tijdsbestek per periode (* = nog niet geweest, geen punt)', frames, [
    '36 37 38 39 40 41 42 43 | 2026-08-31…2026-10-25',
    'mei jun jul aug sep okt | 2026-05-01…2026-10-31',
    'jan feb mrt apr mei jun jul aug sep okt nov* dec* | 2026-01-01…2026-12-31',
    '47 48 49 50 51 52 1 2 | 2025-11-17…2026-01-11',
    'sep okt nov dec jan feb | 2025-09-01…2026-02-28',
    'jan feb mrt apr mei jun jul aug sep okt nov dec | 2025-01-01…2025-12-31']);
  // Een (toekomstige) set in november telt in Jaar niet als punt; de maand staat wel op de as.
  const FUT = JSON.parse(JSON.stringify(DATA));
  FUT.workouts['2026-11-05'] = [{ exerciseId: 'bench-press', sets: [S(130, 5)] }];
  await setup(FUT);
  await page.evaluate(() => { insightSwitchPeriod('year'); openInsightCategory('chest'); }); await page.waitForTimeout(120);
  const chartOf = async id => page.evaluate(id => {
    const svg = document.querySelector(`[data-insight-exercise-card="${id}"] .insight-chart-svg`);
    return svg && { x: [...svg.querySelectorAll('.insight-chart-day')].map(t => t.textContent).join(' '), points: svg.querySelectorAll('.insight-point').length, line: !!svg.querySelector('.insight-line') };
  }, id);
  check('Jaar 2026: 12 maanden op de as, punten alleen in de maanden met waarde t/m oktober (nov. telt niet)', await chartOf('bench-press'), { x: 'jan feb mrt apr mei jun jul aug sep okt nov dec', points: 2, line: true });
  for (const [per, x, pts] of [['week', '36 37 38 39 40 41 42 43', 3], ['month', 'mei jun jul aug sep okt', 2]]) {
    await click(`#insight-category-head [data-insight-period="${per}"]`);
    check(`${per}: x-as en punten in de grafiek van Bench press`, await chartOf('bench-press'), { x, points: pts, line: true });
  }

  // ── Scherm Kracht: een kaart per categorie
  await setup();
  await click('[data-insight-metric="strength"]');
  const cats = () => page.evaluate(() => {
    const mark = e => e.textContent.replace(/\s+/g, ' ').trim() + (e.querySelector('.insight-success') || e.classList.contains('insight-success') ? '(groen)' : '') + (e.classList.contains('insight-muted') || e.querySelector('.insight-muted') ? '(grijs)' : '');
    return [...document.querySelectorAll('#insight-strength-body .insight-strength-card')].map(c => ({
      tag: c.tagName, cat: c.dataset.insightCategory, title: c.querySelector('.role-title').textContent, sub: c.querySelector('.insight-mg-main .role-sub').textContent,
      trophy: !!c.querySelector('.insight-mg-main .role-sub .insight-pr'), figure: mark(c.querySelector('.insight-mg-figure')), chevron: !!c.querySelector('.insight-chevron'),
      points: c.querySelectorAll('.insight-point').length, line: c.querySelectorAll('.insight-line').length,
      ticks: [...c.querySelectorAll('.insight-chart-tick')].map(t => t.textContent).join(' '),
      note: (c.querySelector('.insight-chart-note') || {}).textContent || '', empty: (c.querySelector('.insight-empty') || {}).textContent || '' }));
  });
  const wkc = await cats();
  check('Kracht Week 43: titel, geen schemaregel, een kaart per categorie in de volgorde van de categorieën', [
    await page.evaluate(() => document.querySelector('#screen-insight-strength .toolbar-title').textContent),
    await page.evaluate(() => !!document.querySelector('#screen-insight-strength .insight-meta + .insight-meta, #insight-strength-body .insight-meta')),
    wkc.map(c => c.title)], ['Kracht', false, ['Borst', 'Rug', 'Armen', 'Benen']]);
  check('Kracht Week 43: Borst', wkc[0], { tag: 'BUTTON', cat: 'chest', title: 'Borst', sub: 't.o.v. week 42 · 3 records', trophy: true, figure: '+2,5%(groen)', chevron: true, points: 4, line: 1, ticks: '0% +5% +10%', note: '', empty: '' });
  check('Kracht Week 43: Rug (één punt: alleen het punt, met de regel eronder)', wkc[1], { tag: 'BUTTON', cat: 'back', title: 'Rug', sub: 't.o.v. week 42', trophy: false, figure: 'Geen vergelijking(grijs)', chevron: true, points: 1, line: 0, ticks: '−0,5% 0% +0,5%', note: 'Na nog een week trainen verschijnt hier een lijn', empty: '' });
  check('Kracht Week 43: Armen (geen enkel punt: lege staat)', wkc[2], { tag: 'BUTTON', cat: 'arms', title: 'Armen', sub: 't.o.v. week 42', trophy: false, figure: 'Geen vergelijking(grijs)', chevron: true, points: 0, line: 0, ticks: '', note: '', empty: 'Nog niet getraind in deze periode' });
  check('Kracht Week 43: Benen (−5,7%: niet groen)', [wkc[3].figure, wkc[3].points, wkc[3].line], ['−5,7%', 3, 1]);
  await click('#insight-strength-head [data-insight-period="month"]');
  const mc = await cats();
  check('Kracht Oktober: t.o.v. september, Rug één punt → "maand"', [mc[0].sub, mc[1].note, mc[1].points], ['t.o.v. september · 3 records', 'Na nog een maand trainen verschijnt hier een lijn', 1]);
  await click('#insight-strength-head [data-insight-period="year"]');
  check('Kracht 2026: t.o.v. 2025', (await cats()).map(c => c.sub), ['t.o.v. 2025 · 3 records', 't.o.v. 2025 · 1 record', 't.o.v. 2025', 't.o.v. 2025 · 1 record']);

  // ── Scherm van een categorie: een kaart per oefening
  await setup();
  await click('[data-insight-metric="strength"]');
  const exCards = () => page.evaluate(() => [...document.querySelectorAll('#insight-category-body .insight-strength-card')].map(c => {
    const sub = c.querySelector('.insight-mg-main .role-sub'), fig = c.querySelector('.insight-mg-figure');
    return { tag: c.tagName, name: (c.querySelector('.insight-pr') ? '🏆 ' : '') + c.querySelector('.role-row').textContent,
      sub: sub.textContent + (sub.querySelector('.insight-success') ? '(groen)' : '') + (sub.classList.contains('insight-muted') ? '(grijs)' : ''),
      figure: fig.textContent + (fig.querySelector('.insight-success') ? '(groen)' : '') + (fig.querySelector('.insight-muted') ? '(grijs)' : ''), chevron: !!c.querySelector('.insight-chevron'),
      points: c.querySelectorAll('.insight-point').length, ticks: [...c.querySelectorAll('.insight-chart-tick')].map(t => t.textContent).join(' '),
      extremes: [...c.querySelectorAll('.insight-extremes .role-sub')].map(e => e.textContent),
      note: (c.querySelector('.insight-chart-note') || {}).textContent || '', empty: (c.querySelector('.insight-empty') || {}).textContent || '' };
  }));
  // Inzoomen: Kracht → Borst, en terug (pijl en Android-terug), in de periode die je het laatst bekeek
  for (const how of ['arrow', 'browser']) {
    await setup();
    await click('[data-insight-metric="strength"]');
    await click('#insight-strength-body [data-insight-category="chest"] .insight-strength-chart');
    const at = await page.evaluate(() => [document.querySelector('.screen.active').id, document.getElementById('insight-category-title').textContent, document.querySelector('#insight-category-head .insight-nav-title').textContent]);
    check(`${how}: tik in de kaart Borst (ook op de grafiek) opent Borst in dezelfde periode`, at, ['screen-insight-category', 'Borst', 'Week 43']);
    await click('#insight-category-head [data-insight-period="month"]');
    if (how === 'arrow') await page.evaluate(() => document.getElementById('btn-back-insight-category').click()); else await page.goBack();
    await page.waitForTimeout(250);
    check(`${how}: terug → Kracht, in Oktober 2026`, await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-strength-head .insight-nav-title').textContent]), ['screen-insight-strength', 'Oktober 2026']);
    if (how === 'arrow') await page.evaluate(() => document.getElementById('btn-back-insight-strength').click()); else await page.goBack();
    await page.waitForTimeout(250);
    check(`${how}: nog eens terug → hoofdscherm`, await page.evaluate(() => document.querySelector('.screen.active').id), 'screen-insight');
  }
  await setup();
  await page.evaluate(() => openInsightStrength()); await page.waitForTimeout(80);
  await click('[data-insight-category="chest"]');
  // Bench press: 119,6 ÷ 116,7 − 1 = +2,5% (de geschatte 1RM van week 43 t.o.v. week 42, alleen op de achtergrond).
  // Grafiek: 110,8 · 116,7 · 119,6 → 0% · +5,3% · +7,9%. Sterkst / Zwakst: de echte sets 102,5 × 5 en 95 × 5.
  check('Borst Week 43: kaarten (hoogste 1RM eerst) met alleen procenten, niet aan te tikken, geen chevron', await exCards(), [
    { tag: 'DIV', name: '🏆 Bench press', sub: 't.o.v. week 42', figure: '+2,5%(groen)', chevron: false, points: 3, ticks: '0% +5% +10%',
      extremes: ['Sterkst 102,5 kg × 5 · maandag 19 oktober 2026', 'Zwakst 95 kg × 5 · dinsdag 15 september 2026'], note: '', empty: '' },
    { tag: 'DIV', name: '🏆 Incline bench press', sub: 't.o.v. week 42', figure: 'Geen vergelijking(grijs)', chevron: false, points: 2, ticks: '0% +5% +10%',
      extremes: ['Sterkst 80 kg × 8 · maandag 19 oktober 2026', 'Zwakst 75 kg × 8 · dinsdag 6 oktober 2026'], note: '', empty: '' }]);
  const first0 = await page.evaluate(() => [...document.querySelectorAll('#insight-category-body .insight-chart-svg')].map(svg => {
    const zero = [...svg.querySelectorAll('.insight-chart-tick')].find(t => t.textContent === '0%');
    return !!zero && Math.abs(Number(svg.querySelector('.insight-point').getAttribute('cy')) - Number(zero.getAttribute('y'))) < 0.11;
  }));
  check('grafiek in procenten: het eerste punt ligt op 0%', first0, [true, true]);
  check('grafiek van één oefening = de categorielijn voor die ene oefening: (waarde ÷ eerste punt − 1) × 100', await page.evaluate(() =>
    insightCategoryLine([insightStrengthSeries('bench-press', insightStrengthPoints(insightRange())).map(p => p && p.value)]).map(v => v === null ? null : Math.round(v * 100) / 100)),
    [null, null, 0, null, null, null, 5.32, 7.94]);
  const tap = await page.evaluate(() => {
    const c = document.querySelector('#insight-category-body .insight-strength-card');
    c.click();
    return { screen: document.querySelector('.screen.active').id, buttons: document.querySelectorAll('#insight-category-body button, #insight-category-body [role="button"], #insight-category-body [tabindex]').length,
      cursor: getComputedStyle(c).cursor };
  });
  check('oefeningkaart: tikken doet niets, geen knoppen in de kaarten', tap, { screen: 'screen-insight-category', buttons: 0, cursor: 'auto' });
  await page.goBack(); await page.waitForTimeout(200);
  await click('[data-insight-category="back"]');
  check('Rug Week 43: Deadlift niet gedaan ("Niet gedaan" grijs, geen kg), één punt: "Pas één week getraind", geen Sterkst/Zwakst', await exCards(), [
    { tag: 'DIV', name: 'Deadlift', sub: 't.o.v. week 42', figure: 'Niet gedaan(grijs)', chevron: false, points: 1, ticks: '−0,5% 0% +0,5%', extremes: [], note: 'Pas één week getraind', empty: '' }]);
  await click('#insight-category-head [data-insight-period="month"]');
  check('Rug Oktober: "Pas één maand getraind"', (await exCards())[0].note, 'Pas één maand getraind');
  await page.goBack(); await page.waitForTimeout(200);
  await click('[data-insight-category="arms"]');
  check('Armen (Oktober): Barbell curl nooit gedaan: "Niet gedaan" grijs, lege staat zonder grafiek', await exCards(), [
    { tag: 'DIV', name: 'Barbell curl', sub: 't.o.v. september', figure: 'Niet gedaan(grijs)', chevron: false, points: 0, ticks: '', extremes: [], note: '', empty: 'Nog niet getraind in deze periode' }]);
  await page.goBack(); await page.waitForTimeout(200);
  await click('[data-insight-category="legs"]');
  // Squat: 163,3 (oktober) ÷ 175 (september) − 1 = −6,7%
  check('Benen Oktober (de periode bleef Maand): −6,7%, t.o.v. september', await exCards().then(c => [c[0].figure, c[0].sub]), ['−6,7%', 't.o.v. september']);
  check('negatief percentage in --text (niet groen, niet rood)', await page.evaluate(() => getComputedStyle(document.querySelector('#insight-category-body .insight-pct .set-val')).color), await H.tokenColor(page, '--text'));

  // Volgorde: gedaan in de periode op 1RM, niet gedaan achteraan (ook als de laatst bekende hoger is)
  const ORD = JSON.parse(JSON.stringify(DATA));
  ORD.exerciseInfo['bench-press-dumbbell'] = { trackStrength: true };
  ORD.workouts['2026-10-05'] = [{ exerciseId: 'bench-press-dumbbell', sets: [S(150, 5)] }]; // week 41: 175, niet in week 43
  await setup(ORD);
  await page.evaluate(() => openInsightCategory('chest')); await page.waitForTimeout(100);
  check('volgorde op geschatte 1RM: Bench press (119,6) · Incline (101,3) · daarna niet gedaan (Bench press (dumbbell), laatst 175)', (await exCards()).map(c => c.name + ' ' + c.figure),
    ['🏆 Bench press +2,5%(groen)', '🏆 Incline bench press Geen vergelijking(grijs)', 'Bench press (dumbbell) Niet gedaan(grijs)']);
  // Allemaal niet gedaan in week 43: onderling op de laatst bekende geschatte 1RM (175 · 116,7 · 95)
  const ORD2 = JSON.parse(JSON.stringify(ORD));
  delete ORD2.workouts['2026-10-19'];
  await setup(ORD2);
  await page.evaluate(() => openInsightCategory('chest')); await page.waitForTimeout(100);
  check('niet gedaan: onderling op de laatst bekende geschatte 1RM', (await exCards()).map(c => c.name + ' ' + c.figure),
    ['Bench press (dumbbell) Niet gedaan(grijs)', 'Bench press Niet gedaan(grijs)', 'Incline bench press Niet gedaan(grijs)']);

  // ── Sterkst en Zwakst tonen de echte set: gewicht met decimalen, reps zonder extra reps
  const XR = { custom_exercises: [], scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {}, exerciseInfo: { squat: { trackStrength: true } },
    workouts: {
      '2026-10-13': [{ exerciseId: 'squat', sets: [S(100, 5)] }],                                                    // 116,7
      '2026-10-20': [{ exerciseId: 'squat', sets: [S(142.25, 5, { extra: '3', extraType: 'forced' }), S(140, 5)] }], // 166 (met de extra reps 179,9)
    } };
  await setup(XR);
  await page.evaluate(() => openInsightCategory('legs')); await page.waitForTimeout(100);
  const xr = (await exCards())[0];
  check('echte set "142,25 kg × 5" (extra reps niet in de weergave); percentage 166 ÷ 116,7 − 1 = +42,2%', [xr.figure, xr.extremes],
    ['+42,2%(groen)', ['Sterkst 142,25 kg × 5 · dinsdag 20 oktober 2026', 'Zwakst 100 kg × 5 · dinsdag 13 oktober 2026']]);

  // ── Sterkst en Zwakst: gelijke waarden → de meest recente; één punt → geen
  const EQ = { custom_exercises: [], scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {}, exerciseInfo: { squat: { trackStrength: true } },
    workouts: {
      '2026-09-01': [{ exerciseId: 'squat', sets: [S(100, 1)] }],   // week 36: 100
      '2026-09-08': [{ exerciseId: 'squat', sets: [S(120, 1)] }],   // week 37: 120
      '2026-09-15': [{ exerciseId: 'squat', sets: [S(100, 1)] }],   // week 38: 100 (gelijk aan week 36)
      '2026-09-22': [{ exerciseId: 'squat', sets: [S(110, 1)] }],   // week 39
      '2026-10-06': [{ exerciseId: 'squat', sets: [S(120, 1)] }],   // week 41: 120 (gelijk aan week 37) op dinsdag …
      '2026-10-09': [{ exerciseId: 'squat', sets: [S(120, 1)] }],   // … en vrijdag: de set van vrijdag levert het punt
    } };
  await setup(EQ);
  const eq = await page.evaluate(() => insightExtremes(insightStrengthSeries('squat', insightStrengthPoints(insightRange()))));
  check('gelijke waarden: Sterkst = de meest recente 120 (vrijdag 9 oktober), Zwakst = de meest recente 100 (15 september)', eq,
    { strongest: { value: 120, weight: 120, reps: 1, date: '2026-10-09' }, weakest: { value: 100, weight: 100, reps: 1, date: '2026-09-15' } });
  await page.evaluate(() => openInsightCategory('legs')); await page.waitForTimeout(100);
  check('gelijke waarden op het scherm', (await exCards())[0].extremes, ['Sterkst 120 kg × 1 · vrijdag 9 oktober 2026', 'Zwakst 100 kg × 1 · dinsdag 15 september 2026']);
  // Gelijke geschatte 1RM op één dag (100 × 1 = 100 en 75 × 10 = 100): de latere set geldt
  const SAMEDAY = { ...EQ, workouts: { '2026-10-13': [{ exerciseId: 'squat', sets: [S(80, 1)] }], '2026-10-20': [{ exerciseId: 'squat', sets: [S(100, 1), S(75, 10)] }] } };
  await setup(SAMEDAY);
  await page.evaluate(() => openInsightCategory('legs')); await page.waitForTimeout(100);
  check('gelijke waarden op één dag: de latere set (75 kg × 10)', (await exCards())[0].extremes[0], 'Sterkst 75 kg × 10 · dinsdag 20 oktober 2026');
  const ALLEQ = { ...EQ, workouts: { '2026-09-01': EQ.workouts['2026-09-01'], '2026-09-15': EQ.workouts['2026-09-15'] } };
  await setup(ALLEQ);
  await page.evaluate(() => openInsightCategory('legs')); await page.waitForTimeout(100);
  check('alle punten gelijk: Sterkst en Zwakst zijn allebei het meest recente punt', (await exCards())[0].extremes, ['Sterkst 100 kg × 1 · dinsdag 15 september 2026', 'Zwakst 100 kg × 1 · dinsdag 15 september 2026']);

  // ── Nergens in Inzicht een geschatte 1RM in kg (alleen de echte sets bij Sterkst en Zwakst)
  const kgFound = [];
  for (const per of ['week', 'month', 'year']) {
    await setup();
    const grab = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => { const c = el.cloneNode(true); c.querySelectorAll('.insight-extremes').forEach(x => x.remove()); return c.textContent; }).join(' '), sel);
    await page.evaluate(p => { insightSwitchPeriod(p); renderInsight(); }, per);
    const texts = [await grab('[data-insight-metric="strength"]')];
    await page.evaluate(() => openInsightStrength()); await page.waitForTimeout(80);
    texts.push(await grab('#insight-strength-body'));
    for (const cat of ['chest', 'back', 'arms', 'legs']) {
      await page.evaluate(c => openInsightCategory(c), cat); await page.waitForTimeout(60);
      texts.push(await grab('#insight-category-body'));
      const ext = await page.evaluate(() => [...document.querySelectorAll('.insight-extremes .role-sub')].every(e => /^(Sterkst|Zwakst) \d+(,\d{1,2})? kg × \d+ · /.test(e.textContent)));
      if (!ext) kgFound.push(per + ' ' + cat + ': Sterkst/Zwakst niet als echte set');
      await page.goBack(); await page.waitForTimeout(150);
    }
    texts.forEach((t, i) => { if (/kg/.test(t)) kgFound.push(per + ' #' + i + ': ' + t.slice(0, 80)); });
  }
  check('nergens kg op de Kracht-kaart, de categoriekaarten en de oefeningkaarten (Week, Maand, Jaar); Sterkst/Zwakst altijd "gewicht kg × reps"', kgFound, []);

  // ── Nergens meer een koppeling naar de Fitness Tracker
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const insight = src.slice(src.indexOf('// -- Inzicht: the screen'), src.indexOf('// The sheets below fill in insightSheetDate'));
  check('geen koppeling van Inzicht naar de Grafiek / Fitness Tracker (geen data-insight-exercise, openTraining of switchTab in Inzicht)',
    [/data-insight-exercise[^-]/.test(src), /openTraining\(|switchTab\(/.test(insight), insight.length > 1000], [false, false, true]);

  // ── Lege staat
  const EMPTY = JSON.parse(JSON.stringify(DATA));
  Object.values(EMPTY.exerciseInfo).forEach(i => delete i.trackStrength);
  EMPTY.exerciseInfo.treadmill = { trackStrength: true }; // Cardio alone: still empty
  await setup(EMPTY);
  const ec = await card();
  check('lege staat: kaart', [ec.label, ec.empty, ec.chevron, ec.rows], ['Kracht', 'Zet Kracht volgen aan bij een oefening om je kracht hier te volgen.', true, []]);
  await click('[data-insight-metric="strength"]');
  check('lege staat: scherm Kracht', await page.evaluate(() => [document.querySelector('#insight-strength-body .insight-empty').textContent, document.querySelectorAll('#insight-strength-body .insight-strength-card').length]),
    ['Zet Kracht volgen aan bij een oefening om je kracht hier te volgen.', 0]);

  // ── Oefeninginfo: Kracht volgen
  await setup();
  const info = async () => page.evaluate(() => {
    const v = document.getElementById('exercise-info-view-content');
    return [...v.querySelectorAll('.section-head')].map(h => h.textContent).join(',') + ' / ' + [...v.querySelectorAll('.info-view-stat')].map(s => s.textContent).join(' · ');
  });
  await page.evaluate(() => { openTraining('incline-bench-press'); openExerciseInfo(); }); await page.waitForTimeout(80);
  check('bekijken, aan: INZICHT met Kracht volgen Ja', await info(), 'Spiergroep,Inzicht / PrimairNiet ingesteld · SecundairNiet ingesteld · Kracht volgenJa');
  await click('#btn-exercise-info-edit');
  const ed = await page.evaluate(() => ({ heads: [...document.querySelectorAll('#exercise-info-edit-mode .section-head')].filter(h => h.offsetParent).map(h => h.textContent),
    btn: document.getElementById('info-track-strength').textContent, pressed: document.getElementById('info-track-strength').getAttribute('aria-pressed'),
    hint: document.getElementById('info-track-strength-hint').textContent }));
  check('bewerken: sectie tussen Spiergroep en Apparatuur, knop Ja, hulpregel', ed, { heads: ['Spiergroep', 'Inzicht', 'Apparatuur'], btn: 'Ja', pressed: 'true', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Borst.' });
  await page.screenshot({ path: path.join(OUT, 'info-edit-light-360.png') });
  await click('#info-track-strength');
  await click('#btn-exercise-info-save');
  check('uit + opslaan: veld weg uit de opslag, sectie INZICHT weg bij bekijken', [JSON.stringify(await page.evaluate(() => db.exerciseInfo['incline-bench-press'] || null)), await info()],
    ['null', 'Spiergroep / PrimairNiet ingesteld · SecundairNiet ingesteld']);
  await click('#btn-exercise-info-edit');
  check('standaard uit (Nee)', await page.evaluate(() => document.getElementById('info-track-strength').textContent), 'Nee');
  await click('#info-track-strength');
  await click('#btn-exercise-info-save');
  check('aan + opslaan: trackStrength true, andere velden blijven', await page.evaluate(() => db.exerciseInfo['incline-bench-press']), { trackStrength: true });
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Andere velden bewaren trackStrength
  await page.evaluate(() => { openTraining('bench-press'); openExerciseInfo(); }); await page.waitForTimeout(50);
  await click('#btn-exercise-info-edit'); await click('#info-powerlift-bench'); await click('#btn-exercise-info-save');
  check('Powerliftbank wijzigen houdt Kracht volgen', await page.evaluate(() => db.exerciseInfo['bench-press']), { primaryMuscleGroup: 'chest', trackStrength: true, powerliftBench: true });
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Cardio
  await page.evaluate(() => { openTraining('treadmill'); openExerciseInfo(); }); await page.waitForTimeout(50);
  const cv = await info();
  await click('#btn-exercise-info-edit');
  const ce = await page.evaluate(() => [...document.querySelectorAll('#exercise-info-edit-mode .section-head')].filter(h => h.offsetParent).map(h => h.textContent).concat(document.getElementById('info-track-strength').offsetParent ? ['knop zichtbaar'] : []));
  check('Cardio: niet bij bekijken (ook al staat trackStrength opgeslagen), niet bij bewerken', [cv, ce], ['Spiergroep / PrimairNiet ingesteld · SecundairNiet ingesteld', ['Spiergroep', 'Apparatuur']]);
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Nieuwe oefening / Oefening bewerken
  await page.evaluate(() => openNewExerciseScreen()); await page.waitForTimeout(350);
  const nx = () => page.evaluate(() => ({ shown: !!document.getElementById('new-ex-info-insight-head').offsetParent, btn: document.getElementById('new-ex-info-track-strength').textContent, hint: document.getElementById('new-ex-info-track-strength-hint').textContent }));
  check('Nieuwe oefening: zichtbaar, uit, hulpregel zonder categorie', await nx(), { shown: true, btn: 'Nee', hint: 'Telt mee voor Kracht in Inzicht.' });
  await page.evaluate(() => { document.getElementById('new-ex-name').value = 'Hip thrust'; });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="legs"]');
  await click('#new-ex-info-track-strength');
  check('Nieuwe oefening: categorie Benen, aan', await nx(), { shown: true, btn: 'Ja', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Benen.' });
  await page.screenshot({ path: path.join(OUT, 'new-ex-light-360.png'), fullPage: true });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="cardio"]');
  check('Nieuwe oefening: Cardio → sectie weg', (await nx()).shown, false);
  await click('#new-ex-category'); await click('#field-picker-list [data-value="legs"]');
  await click('#btn-new-ex-save');
  const hip = await page.evaluate(() => { const e = db.custom_exercises.find(x => x.name === 'Hip thrust'); return e && db.exerciseInfo[e.id]; });
  check('Nieuwe oefening opgeslagen met Kracht volgen', hip, { trackStrength: true });
  await page.evaluate(() => openEditExerciseScreen(findExercise('squat'))); await page.waitForTimeout(100);
  check('Oefening bewerken (squat): aan, Benen', await nx(), { shown: true, btn: 'Ja', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Benen.' });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="cardio"]');
  await click('#btn-new-ex-save');
  check('Oefening naar Cardio verplaatst: Kracht volgen vervalt', await page.evaluate(() => db.exerciseInfo.squat || null), null);

  // ── Layout: licht/donker, 360/390
  for (const wpx of [360, 390]) for (const theme of ['light', 'dark']) {
    const tag = `${theme} ${wpx}px`;
    await page.setViewportSize({ width: wpx, height: 1400 });
    await setup(DATA, theme);
    await page.evaluate(() => document.getElementById('insight-cards').lastElementChild.scrollIntoView());
    const ov = () => page.evaluate(() => { const s = document.querySelector('.screen.active .insight-scroll'); return document.documentElement.scrollWidth > innerWidth || s.scrollWidth > s.clientWidth; });
    check(`${tag}: hoofdscherm geen horizontale overloop`, await ov(), false);
    await page.screenshot({ path: path.join(OUT, `main-week-${theme}-${wpx}.png`), fullPage: true });
    await page.evaluate(() => document.querySelector('[data-insight-metric="strength"]').scrollIntoView());
    await page.screenshot({ path: path.join(OUT, `card-week-${theme}-${wpx}.png`) });
    for (const per of ['week', 'year']) {
      await click(`#insight-head [data-insight-period="${per}"]`);
      const cl = await page.evaluate(() => {
        const card = document.querySelector('[data-insight-metric="strength"]');
        const rows = [...card.querySelectorAll('.insight-strength-row')];
        const note = card.querySelector('.insight-strength-note');
        const box = card.querySelector('.insight-edit-main').getBoundingClientRect(), cr = card.getBoundingClientRect();
        const bd = el => getComputedStyle(el).borderTopWidth + ' ' + getComputedStyle(el).borderTopStyle;
        const tok = n => { const d = document.createElement('div'); d.style.borderTop = `1px solid var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).borderTopColor; d.remove(); return c; };
        const mid = el => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
        const lineOk = el => bd(el) === '1px solid' && getComputedStyle(el).borderTopColor === tok('--border')
          && Math.abs(el.getBoundingClientRect().left - cr.left - 16) < 0.5 && Math.abs(cr.right - el.getBoundingClientRect().right - 16) < 0.5;
        const head = card.querySelector('.insight-card-label'), chev = card.querySelector('.insight-chevron svg'), label = head.querySelector('.section-label');
        const rec = head.querySelector('.insight-records');
        const heights = rows.map(r => Math.round(r.getBoundingClientRect().height - parseFloat(getComputedStyle(r).borderTopWidth)));
        window.__krachtLayout = {
          lines: [rows[0] && bd(rows[0]) === '0px none', rows.slice(1).every(lineOk), lineOk(note)],
          sameHeight: new Set(heights).size === 1, minHeight: Math.min(...heights) >= 58,
          centred: rows.every(r => Math.abs(mid(r.querySelector('.role-row')) - mid(r)) < 1 && Math.abs(mid(r.querySelector('.insight-mg-figure').firstElementChild.parentElement) - mid(r)) < 1
            && (r.querySelector('.insight-mg-figure').children.length > 1 || Math.abs(mid(r.querySelector('.insight-mg-figure').firstElementChild) - mid(r)) < 1)),
          chevron: { inHead: head.contains(chev), right: Math.abs(chev.getBoundingClientRect().right - box.right) < 0.5, afterRecords: rec ? chev.getBoundingClientRect().left > rec.getBoundingClientRect().right : true,
            middle: Math.abs(mid(chev) - mid(label)) < 2, size: chev.getBoundingClientRect().width, onlyOne: card.querySelectorAll('.insight-chevron').length },
        };
        const base = el => { const r = document.createRange(); r.selectNodeContents(el); const rc = r.getClientRects()[0]; return rc.bottom; };
        return rows.map(r => {
          const name = r.querySelector('.role-row'), fig = r.querySelector('.insight-mg-figure'), first = fig.firstElementChild, rec = fig.querySelector(':scope > .role-sub:not(.insight-muted)');
          const nameBase = base(name), figText = first.classList.contains('insight-figure') ? first.querySelector('.set-val') : first;
          const fr = fig.getBoundingClientRect(), rr = rec && rec.getBoundingClientRect();
          return { name: name.textContent, records: rec ? rec.textContent : '',
            sameBaseline: Math.abs(nameBase - base(figText)) < 1.5,
            recRightAligned: rec ? Math.abs(rr.right - fr.right) < 1 && Math.abs(first.getBoundingClientRect().right - fr.right) < 1 : true,
            recUnder: rec ? rr.top >= first.getBoundingClientRect().bottom - 0.5 : true,
            recStyle: rec ? getComputedStyle(rec).fontSize + '/' + getComputedStyle(rec).fontWeight : '' };
        });
      });
      const ok = cl.every(c => c.recRightAligned && c.recUnder && (!c.records || c.recStyle === '12px/400'));
      check(`${tag} ${per}: kaart — met records (${cl.filter(c => c.records).map(c => c.name).join(', ')}) en zonder (${cl.filter(c => !c.records).map(c => c.name).join(', ')}): "record" rechts onder het percentage, Klein`, ok, true);
      if (!ok) console.log(JSON.stringify(cl));
      check(`${tag} ${per}: Kracht-kaart — geen lijn boven de eerste rij, 1px --border tussen de rijen en boven de uitleg (16px van de kaartranden), rijen even hoog (≥ 58px), naam en waarde in het midden, één chevron van 20px rechtsboven in de kop na de records, midden op het label`,
        await page.evaluate(() => window.__krachtLayout),
        { lines: [true, true, true], sameHeight: true, minHeight: true, centred: true, chevron: { inHead: true, right: true, afterRecords: true, middle: true, size: 20, onlyOne: 1 } });
      await page.evaluate(() => document.querySelector('[data-insight-metric="strength"]').scrollIntoView());
      await page.screenshot({ path: path.join(OUT, `card2-${per}-${theme}-${wpx}.png`) });
    }
    // Kracht en een categorie: rollen, kleuren, grafieken, niets afgekapt
    await click('#insight-head [data-insight-period="week"]');
    await click('[data-insight-metric="strength"]');
    const style = () => page.evaluate(() => {
      const tok = n => { const d = document.createElement('div'); d.style.color = `var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const f = el => el ? `${getComputedStyle(el).fontSize}/${getComputedStyle(el).fontWeight}` : null;
      const col = el => el ? getComputedStyle(el).color : null;
      const scr = document.querySelector('.screen.active');
      const body = scr.querySelector('.insight-scroll');
      const clipped = [...body.querySelectorAll('.role-row, .role-sub, .role-title, .insight-figure')].filter(e => e.scrollWidth > e.clientWidth + 0.5).map(e => e.textContent);
      // y-aslabels binnen de kaart (niet links buiten de SVG), x-aslabels niet over elkaar
      const svgs = [...body.querySelectorAll('.insight-chart-svg')];
      const ticksIn = svgs.every(s => [...s.querySelectorAll('.insight-chart-tick')].every(t => t.getBBox().x >= 0));
      const xApart = svgs.every(s => { const b = [...s.querySelectorAll('.insight-chart-day')].map(t => t.getBoundingClientRect()); return b.every((r, i) => !i || r.left >= b[i - 1].right + 1); });
      const card = body.querySelector('.insight-strength-card');
      const ext = body.querySelector('.insight-extremes');
      return {
        clipped, ticksIn, xApart, overflow: document.documentElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth,
        svgFits: svgs.every(s => s.getBoundingClientRect().right <= s.closest('.card').getBoundingClientRect().right - 15.5),
        line: svgs.every(s => [...s.querySelectorAll('.insight-line')].every(l => getComputedStyle(l).stroke === tok('--primary'))) && svgs.every(s => s.querySelectorAll('.insight-line').length <= 1),
        point: svgs.every(s => [...s.querySelectorAll('.insight-point')].every(l => getComputedStyle(l).fill === tok('--primary'))),
        noAvg: !body.querySelector('.insight-chart-avg'),
        tick: f(body.querySelector('.insight-chart-tick')) + ' ' + (getComputedStyle(body.querySelector('.insight-chart-tick')).fill === tok('--text-muted')),
        title: f(card.querySelector('.role-title, .role-row')) + ' ' + (col(card.querySelector('.role-title, .role-row')) === tok('--text')),
        sub: f(card.querySelector('.insight-mg-main .role-sub')),
        figure: f(card.querySelector('.set-val')), unit: f(card.querySelector('.set-unit')),
        green: col(body.querySelector('.insight-success')) === tok('--success'),
        muted: [...body.querySelectorAll('.insight-muted')].every(e => col(e.matches('.insight-figure') ? e.querySelector('.set-val') : e) === tok('--text-muted')),
        chevron: (() => { const c = body.querySelector('.insight-chevron svg'); return c ? `${c.getBoundingClientRect().width} ${getComputedStyle(c).fill === tok('--text-muted')}` : 'geen'; })(),
        ext: ext ? { label: f(ext.querySelector('.insight-extreme-label')) + ' ' + (col(ext.querySelector('.insight-extreme-label')) === tok('--text')), text: f(ext.querySelector('.role-sub')),
          border: getComputedStyle(ext).borderTopWidth + ' ' + (getComputedStyle(ext).borderTopColor === getComputedStyle(document.querySelector('.insight-strength-card')).getPropertyValue('--border').trim() || getComputedStyle(ext).borderTopColor === (() => { const d = document.createElement('div'); d.style.borderTopColor = 'var(--border)'; d.style.borderTopStyle = 'solid'; document.body.appendChild(d); const c = getComputedStyle(d).borderTopColor; d.remove(); return c; })()),
          edge: Math.abs(ext.getBoundingClientRect().left - ext.closest('.card').getBoundingClientRect().left) < 0.5 && Math.abs(ext.getBoundingClientRect().right - ext.closest('.card').getBoundingClientRect().right) < 0.5 } : null,
      };
    });
    const STRENGTH = { clipped: [], ticksIn: true, xApart: true, overflow: false, svgFits: true, line: true, point: true, noAvg: true, tick: '11px/400 true',
      title: '16px/500 true', sub: '12px/400', figure: '20px/700', unit: '12px/400', green: true, muted: true, chevron: '20 true', ext: null };
    for (const per of ['week', 'month', 'year']) {
      await click(`#insight-strength-head [data-insight-period="${per}"]`);
      check(`${tag} Kracht ${per}: Kop / Klein / Groot getal, lijn en punten --primary, aslabels 11px --text-muted, chevron 20px, niets afgekapt, geen overloop`, await style(), STRENGTH);
      await page.screenshot({ path: path.join(OUT, `strength-${per}-${theme}-${wpx}.png`), fullPage: true });
    }
    await click('#insight-strength-head [data-insight-period="week"]');
    await click('[data-insight-category="chest"]');
    for (const per of ['week', 'month', 'year']) {
      await click(`#insight-category-head [data-insight-period="${per}"]`);
      check(`${tag} Borst ${per}: Rij in een lijst / Klein / Groot getal, Sterkst 12px/500 --text, lijn 1px --border van rand tot rand, geen chevron`, await style(),
        { ...STRENGTH, title: '15px/400 true', chevron: 'geen', ext: { label: '12px/500 true', text: '12px/400', border: '1px true', edge: true } });
      await page.screenshot({ path: path.join(OUT, `category-${per}-${theme}-${wpx}.png`), fullPage: true });
    }
  }
  await browser.close();
  check('geen JS-fouten', errors, []);
});

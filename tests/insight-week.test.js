// Inzicht, Week view: date helpers, navigation, rows and cards for Week A/B, a mid-week schedule switch, no schedule, no version, sequential, big numbers.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const ppl = (type) => ({
  planId: 'ppl', planName: 'Push Pull Legs', type,
  days: [
    { id: 'd1', name: 'Push A', weekday: 0, ...(type === 'weekAB' && { week: 'A' }), exercises: [{ exerciseId: 'bench-press', sets: 4 }, { exerciseId: 'ohp', sets: 3 }] },
    { id: 'd2', name: 'Pull A', weekday: 2, ...(type === 'weekAB' && { week: 'A' }), exercises: [{ exerciseId: 'row', sets: 4 }, { exerciseId: 'face-pull', sets: 3 }, { exerciseId: 'curl', sets: 3 }] },
    { id: 'd3', name: 'Legs A', weekday: 3, ...(type === 'weekAB' && { week: 'A' }), exercises: [{ exerciseId: 'squat', sets: 5 }] },
    { id: 'd4', name: 'Upper A', weekday: 4, ...(type === 'weekAB' && { week: 'A' }), exercises: [{ exerciseId: 'bench-press', sets: 3 }] },
    ...(type === 'weekAB' ? [{ id: 'd5', name: 'Push B', weekday: 1, week: 'B', exercises: [{ exerciseId: 'bench-press', sets: 4 }] }] : []),
  ],
});
const ul = { planId: 'ul', planName: 'Upper Lower', type: 'fixed', days: [
  { id: 'u1', name: 'Upper', weekday: 3, exercises: [{ exerciseId: 'bench-press', sets: 4 }] },
  { id: 'u2', name: 'Lower', weekday: 5, exercises: [{ exerciseId: 'squat', sets: 4 }] },
] };
const sets = n => Array.from({ length: n }, () => ({ weight: 50, reps: 8 }));
const INFO = { 'bench-press': { primaryMuscleGroup: 'chest' }, 'db-press': { primaryMuscleGroup: 'chest' }, ohp: { primaryMuscleGroup: 'front-delts' },
  lateral: { primaryMuscleGroup: 'side-delts' }, row: { primaryMuscleGroup: 'mid-back' }, curl: { primaryMuscleGroup: 'biceps' }, squat: { primaryMuscleGroup: 'quads' } };

const SCENARIOS = {
  // Week 43 (19–25 Oct), today Thursday 22 Oct, Week A/B
  weekAB: {
    weekStart: '2026-10-19',
    data: {
      scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', ...ppl('weekAB') } },
      weekCycle: { '2026-10-12': { effectiveFrom: '2026-10-12', planId: 'ppl', week: 'B' }, '2026-10-19': { effectiveFrom: '2026-10-19', planId: 'ppl', week: 'A' } },
      exerciseInfo: INFO,
      workouts: {
        '2026-10-19': [ // Mon: db-press 4 working sets + 1 dropset, ohp 2, lateral 3 (not planned)
          { exerciseId: 'db-press', sets: [...sets(3), { weight: 40, reps: 8, isDropsetContinuation: true }, ...sets(1)] },
          { exerciseId: 'ohp', sets: sets(2) },
          { exerciseId: 'lateral', sets: sets(3) },
        ],
        '2026-10-20': [{ exerciseId: 'face-pull', sets: sets(4) }], // Tue (rest day): no muscle group
        '2026-10-21': [{ exerciseId: 'row', sets: [] }],             // Wed: loaded, nothing logged → missed
      },
      sleep: { '2026-10-19': { bedtime: '23:00', wakeTime: '06:10' }, '2026-10-20': { bedtime: '00:30', wakeTime: '06:20' }, '2026-10-21': { bedtime: '23:30', wakeTime: '06:45' } },
      bodyWeight: { '2026-10-19': 98.4, '2026-10-21': 98.8, '2026-10-13': 98.9, '2026-10-16': 98.9 },
    },
  },
  // Week 42 (12–18 Oct): Push Pull Legs, from Thursday Upper Lower
  switch: {
    weekStart: '2026-10-12',
    data: {
      scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', ...ppl('fixed') }, '2026-10-15': { effectiveFrom: '2026-10-15', ...ul } },
      exerciseInfo: INFO,
      workouts: { '2026-10-12': [{ exerciseId: 'bench-press', sets: sets(4) }, { exerciseId: 'ohp', sets: sets(3) }], '2026-10-15': [{ exerciseId: 'bench-press', sets: sets(4) }] },
      sleep: {}, bodyWeight: {},
    },
  },
  noSchedule: {
    weekStart: '2026-10-12',
    data: { scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: null } }, exerciseInfo: INFO,
      workouts: { '2026-10-13': [{ exerciseId: 'squat', sets: sets(5) }], '2026-10-16': [{ exerciseId: 'row', sets: sets(1) }] }, sleep: {}, bodyWeight: {} },
  },
  noVersion: { weekStart: '2026-10-12', data: { scheduleVersions: {}, exerciseInfo: {}, workouts: {}, sleep: {}, bodyWeight: {} } },
  sequential: { weekStart: '2026-10-12', data: { scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', ...ppl('sequential'), days: ppl('sequential').days.map(({ weekday, ...d }) => d) } },
    exerciseInfo: INFO, workouts: { '2026-10-14': [{ exerciseId: 'squat', sets: sets(3) }] }, sleep: {}, bodyWeight: {} } },
  manySets: { weekStart: '2026-10-12', data: { scheduleVersions: { '2026-10-01': { effectiveFrom: '2026-10-01', planId: 'big', planName: 'Groot', type: 'fixed',
    days: [{ id: 'b', name: 'Ma', weekday: 0, exercises: [{ exerciseId: 'squat', sets: 1250 }] }] } }, exerciseInfo: INFO,
    workouts: { '2026-10-12': [{ exerciseId: 'squat', sets: sets(1100) }, { exerciseId: 'curl', sets: sets(1001) }] }, sleep: {}, bodyWeight: {} } },
};

async function setup(page, scenario, theme = 'light') {
  await page.evaluate(({ s, theme }) => {
    document.documentElement.dataset.theme = theme;
    const sp = document.getElementById('splash-screen'); if (sp) sp.style.display = 'none';
    Object.assign(db, s.data);
    showScreen('screen-insight');
    insightWeekStart = s.weekStart;
    renderInsight();
  }, { s: SCENARIOS[scenario], theme });
}

async function readScreen(page) {
  return page.evaluate(() => {
    const t = id => document.getElementById(id).textContent.trim();
    const grid = document.querySelector('.insight-grid');
    const cells = [...grid.children];
    const rows = [];
    for (let r = 0; r < 5; r++) rows.push(cells.slice(r * 8, r * 8 + 8).map(c => {
      if (c.querySelector('.insight-done')) return '✓';
      if (c.querySelector('.insight-missed')) return '○';
      return c.textContent.trim() + (c.classList.contains('insight-danger') ? '!' : '');
    }));
    const cards = [...document.querySelectorAll('.insight-card')].map(c => [...(c.querySelector('.insight-edit-main') || c).children].map(ch => ch.classList.contains('insight-figure') ? [...ch.children].map(x => x.textContent).join(' ') : ch.innerText).join(' | '));
    const switches = cells.slice(1, 8).map((c, i) => c.classList.contains('insight-switch') ? i + 1 : 0).filter(Boolean);
    const q = sel => document.querySelector('#insight-head ' + sel);
    return { title: q('.insight-nav-title').textContent.trim(), dates: q('.insight-meta').textContent.trim(), schema: t('insight-schema'), nextDisabled: q('[data-insight-step="1"]').disabled, rows, cards, switches };
  });
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1100, scale: 2 });

  // --- Pure helpers
  const h = await page.evaluate(() => ({
    sameMonth: formatDateRange('2026-10-19', '2026-10-25'),
    twoMonths: formatDateRange('2026-10-26', '2026-11-01'),
    twoYears: formatDateRange('2025-12-29', '2026-01-04'),
    weeks: ['2025-12-28', '2025-12-29', '2026-01-04', '2026-10-22', '2026-12-31', '2027-01-03', '2027-01-04', '2021-01-03', '2020-12-31'].map(d => d + '=W' + isoWeekOfDateStr(d)),
    count: [5, 999, 1000, 1250, 1234567].map(formatCount),
    dur: [430, 350, 60, 605].map(formatDuration),
  }));
  check('datum zelfde maand', h.sameMonth, '19–25 oktober 2026');
  check('datum twee maanden', h.twoMonths, '26 oktober – 1 november 2026');
  check('datum twee jaren', h.twoYears, '29 december 2025 – 4 januari 2026');
  check('ISO-weken', h.weeks, ['2025-12-28=W52', '2025-12-29=W1', '2026-01-04=W1', '2026-10-22=W43', '2026-12-31=W53', '2027-01-03=W53', '2027-01-04=W1', '2021-01-03=W53', '2020-12-31=W53']);
  check('duizendtallen', h.count, ['5', '999', '1.000', '1.250', '1.234.567']);
  check('slaapduur', h.dur, ['7:10', '5:50', '1:00', '10:05']);

  // --- Opening from the menu: current week
  await page.evaluate(() => { document.getElementById('splash-screen').style.display = 'none'; showScreen('screen-home'); });
  const tile = await page.evaluate(() => [document.querySelector('#menu-card-insight .nav-card-title').textContent, document.querySelector('#menu-card-insight .nav-card-desc').textContent]);
  check('tegel', tile, ['Inzicht', 'Training, voeding, slaap en gewicht']);
  await page.click('#menu-card-insight');
  let s = await readScreen(page);
  check('opent op huidige week', [s.title, s.dates, s.nextDisabled], ['Week 43', '19–25 oktober 2026', true]);
  await page.click('#insight-head [data-insight-step="-1"]');
  s = await readScreen(page);
  check('terugbladeren', [s.title, s.dates, s.nextDisabled], ['Week 42', '12–18 oktober 2026', false]);
  await page.click('#insight-head [data-insight-step="1"]');
  s = await readScreen(page);
  check('vooruit tot huidige week', [s.title, s.nextDisabled], ['Week 43', true]);
  await page.click('#insight-head [data-insight-step="1"]', { force: true });
  check('niet voorbij huidige week', (await readScreen(page)).title, 'Week 43');
  const periods = await page.evaluate(() => [...document.querySelectorAll('.insight-periods .time-filter')].map(b => `${b.textContent}:${b.classList.contains('active') ? 'aan' : ''}${b.disabled ? 'uit' : ''}`));
  check('periodeknoppen (sinds stap 6 alle drie aan)', periods, ['Week:aan', 'Maand:', 'Jaar:']);

  // --- Scenario: Week A/B with a missed day (today = Thursday)
  await setup(page, 'weekAB');
  s = await readScreen(page);
  console.log('\nWeek A/B:', JSON.stringify(s, null, 1));
  check('A/B schema', s.schema, 'Schema: Push Pull Legs · Week A');
  check('A/B training-rij', s.rows[1], ['Training', '✓', '✓', '○', '–', '–', '–', '–']);
  check('A/B slaap-rij', s.rows[3], ['Slaap', '7:10', '5:50!', '7:15', '–', '–', '–', '–']);
  check('A/B gewicht-rij', s.rows[4], ['Gewicht', '98,4', '–', '98,8', '–', '–', '–', '–']);
  check('A/B voeding-rij', s.rows[2], ['Voeding', '–', '–', '–', '–', '–', '–', '–']);
  check('A/B training-kaart vóór set op do', s.cards[0], 'TRAINING | 53% van je schema | 9 van 17 sets · −8 · +4 extra | 1 van 2 trainingen');
  const thu = await page.evaluate(() => { db.workouts['2026-10-22'] = [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }]; renderInsight();
    const c = document.querySelector('.insight-card'); const r = [...(c.querySelector('.insight-edit-main') || c).children].map(ch => ch.classList.contains('insight-figure') ? [...ch.children].map(x => x.textContent).join(' ') : ch.innerText).join(' | ');
    delete db.workouts['2026-10-22']; renderInsight(); return r; });
  check('A/B training-kaart na set op do', thu, 'TRAINING | 45% van je schema | 10 van 22 sets · −12 · +4 extra | 2 van 3 trainingen');
  check('voeding-kaart', s.cards[1], 'VOEDING | Nog geen voedingsschema');
  check('A/B slaap-kaart', s.cards[2], 'SLAAP | 6:45 u gemiddeld | Kortste nacht: dinsdag, 5:50 u');
  check('A/B gewicht-kaart', s.cards[3], 'GEWICHT | 98,6 kg gemiddeld | −0,3 kg t.o.v. week 42');
  check('A/B geen stippellijn', s.switches, []);
  const colors = await page.evaluate(() => {
    const c = sel => getComputedStyle(document.querySelector(sel));
    return { done: c('.insight-done').backgroundColor, missed: c('.insight-missed').borderTopColor, short: c('.insight-danger').color,
      dash: c('.insight-dash').color, rowLabel: c('.insight-row-label').color, rowLabelSize: c('.insight-row-label').fontSize,
      head: c('.insight-grid > .insight-cell').fontSize, title: c('#insight-head .insight-nav-title').fontSize + '/' + c('#insight-head .insight-nav-title').fontWeight,
      big: c('.insight-figure .set-val').fontSize + '/' + c('.insight-figure .set-val').fontWeight, unit: c('.insight-figure .set-unit').fontSize + '/' + c('.insight-figure .set-unit').fontWeight,
      label: c('.insight-card-label').fontSize, period: c('.insight-periods .time-filter').fontSize + '/' + c('.insight-periods .time-filter').fontWeight + '/' + c('.insight-periods .time-filter').borderRadius,
      chevron: c('.insight-nav-btn svg').width, empty: '' };
  });
  console.log('Stijlen:', JSON.stringify(colors));
  check('kleuren', [colors.done, colors.missed, colors.short], ['rgb(76, 175, 80)', 'rgb(198, 40, 40)', 'rgb(198, 40, 40)']);
  check('typografie', [colors.rowLabelSize, colors.head, colors.title, colors.big, colors.unit, colors.label, colors.period, colors.chevron],
    ['12px', '12px', '16px/500', '20px/700', '12px/400', '11px', '12px/500/999px', '20px']);
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 1100 });
    await setup(page, 'weekAB', theme);
    await H.settle(page); // measured at rest, not halfway through the page-turn of the ‹ › tapped above
    const overflow = await page.evaluate(() => {
      const sc = document.getElementById('insight-scroll');
      const bad = [...document.querySelectorAll('.insight-grid > *')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      return { hScroll: sc.scrollWidth > sc.clientWidth, cellsOverflowing: bad };
    });
    check(`geen overloop ${theme} ${w}`, overflow, { hScroll: false, cellsOverflowing: [] });
    await page.screenshot({ path: path.join(OUT, `insight-weekAB-${theme}-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 360, height: 1100 });

  // --- Scenario: plan switch mid-week
  await setup(page, 'switch');
  s = await readScreen(page);
  check('wissel schema', s.schema, 'Schema: Push Pull Legs, vanaf donderdag Upper Lower');
  check('wissel stippellijn bij do', s.switches, [4]);
  check('wissel training-rij', s.rows[1], ['Training', '✓', '–', '○', '✓', '–', '○', '–']);
  check('wissel training-kaart', s.cards[0], 'TRAINING | 44% van je schema | 11 van 25 sets · −14 | 2 van 4 trainingen');
  const line = await page.evaluate(() => {
    const g = document.querySelector('.insight-grid').getBoundingClientRect();
    const ls = [...document.querySelectorAll('.insight-switch')]; const cs = getComputedStyle(ls[0]);
    const contiguous = ls.every((l, i) => i === 0 || Math.abs(l.getBoundingClientRect().top - ls[i - 1].getBoundingClientRect().bottom) < 0.5);
    const top = ls[0].getBoundingClientRect().top, bottom = ls[ls.length - 1].getBoundingClientRect().bottom;
    const lefts = new Set(ls.map(l => Math.round(l.getBoundingClientRect().left)));
    return { cells: ls.length, fullHeight: contiguous && Math.abs(top - g.top) < 1 && Math.abs(bottom - g.bottom) < 1, oneColumn: lefts.size === 1, style: cs.borderLeftStyle + ' ' + cs.borderLeftWidth + ' ' + cs.borderLeftColor };
  });
  check('stippellijn vorm', line, { cells: 5, fullHeight: true, oneColumn: true, style: 'dotted 1px rgb(158, 158, 158)' });
  check('lege slaap', s.cards[2], 'SLAAP | Nog geen slaap ingevuld');
  check('leeg gewicht', s.cards[3], 'GEWICHT | Nog geen gewicht ingevuld');
  const emptyStyle = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.insight-empty')); return c.fontSize + '/' + c.fontWeight + '/' + c.color; });
  check('lege staat stijl', emptyStyle, '15px/400/rgb(158, 158, 158)');
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    await setup(page, 'switch', theme);
    await page.screenshot({ path: path.join(OUT, `insight-switch-${theme}-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 360, height: 1000 });

  // --- No schedule, no version, sequential, big numbers
  await setup(page, 'noSchedule');
  s = await readScreen(page);
  check('geen schema regel', s.schema, 'Geen schema actief');
  check('geen schema kaart', s.cards[0], 'TRAINING | 6 sets | 2 trainingen · geen vergelijking met schema');
  check('geen schema geen rode ring', s.rows[1], ['Training', '–', '✓', '–', '–', '✓', '–', '–']);
  await setup(page, 'noVersion');
  s = await readScreen(page);
  check('geen versie regel', s.schema, 'Geen schema bekend');
  check('geen versie kaart', s.cards[0], 'TRAINING | 0 sets | 0 trainingen · geen vergelijking met schema');
  await setup(page, 'sequential');
  s = await readScreen(page);
  check('doorlopend regel', s.schema, 'Schema: Push Pull Legs');
  check('doorlopend nooit rode ring', s.rows[1], ['Training', '–', '–', '✓', '–', '–', '–', '–']);
  check('doorlopend kaart', s.cards[0], 'TRAINING | 3 sets | 1 training · geen vergelijking met schema');
  await setup(page, 'manySets');
  s = await readScreen(page);
  check('duizendtallen kaart', s.cards[0], 'TRAINING | 88% van je schema | 1.100 van 1.250 sets · −150 · +1.001 extra | 1 van 1 training');
  // The same build-up as Maand and Jaar: the % big, "van je schema" 12px/400 after it, under it the sets with the
  // comparison (Klein, −150 red) and then the trainings; each on one line, nothing outside the card.
  const build = await page.evaluate(() => {
    const c = document.querySelector('[data-insight-metric="training"]'), fig = c.querySelector('.insight-edit-main > .insight-figure');
    const f = el => getComputedStyle(el).fontSize + '/' + getComputedStyle(el).fontWeight;
    const subs = [...c.querySelectorAll('.insight-edit-main > .role-sub')];
    return { pct: f(fig.querySelector('.insight-pct .set-val')), pctSign: f(fig.querySelector('.insight-pct .set-unit')), ofSchema: f(fig.querySelector(':scope > .set-unit')),
      subs: subs.map(f), oneLine: subs.every(s => s.getClientRects().length === 1 && s.scrollWidth <= s.clientWidth),
      danger: getComputedStyle(subs[0].querySelector('.insight-danger')).color };
  });
  check('360px: % groot, "van je schema" 12px/400, sets en trainingen Klein op één regel, −150 rood', build,
    { pct: '20px/700', pctSign: '12px/400', ofSchema: '12px/400', subs: ['12px/400', '12px/400'], oneLine: true, danger: await H.tokenColor(page, '--danger') });

  // Week without shortfall → "op schema"
  await setup(page, 'switch');
  await page.evaluate(() => {
    db.workouts['2026-10-14'] = [{ exerciseId: 'row', sets: Array(4).fill({ weight: 1, reps: 1 }) }, { exerciseId: 'face-pull', sets: Array(3).fill({ weight: 1, reps: 1 }) }, { exerciseId: 'curl', sets: Array(3).fill({ weight: 1, reps: 1 }) }];
    db.workouts['2026-10-17'] = [{ exerciseId: 'squat', sets: Array(4).fill({ weight: 1, reps: 1 }) }];
    renderInsight();
  });
  s = await readScreen(page);
  const okColor = await page.evaluate(() => getComputedStyle(document.querySelector('.insight-success')).color);
  check('op schema', [s.cards[0], okColor], ['TRAINING | 100% van je schema | 25 van 25 sets · op schema | 4 van 4 trainingen', 'rgb(76, 175, 80)']);

  // Graph period filters still work (handler scoped to the Grafiek)
  const graphScoped = await page.evaluate(() => document.querySelectorAll('.graph-time-filters .time-filter').length);
  check('grafiekfilters', graphScoped, 5);

  await browser.close();
  check('geen JS-fouten', errors, []);
});

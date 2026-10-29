// Swiping to browse on every Inzicht screen with ‹ › (the main screen, the day overview, Slaap, Gewicht,
// Training, a muscle group, Kracht, a category), in Week / Maand / Jaar, both ways: the same as a tap on
// the arrow, not past the current period / today, no history step, the head stays put; a vertical
// move scrolls; from anywhere, also right at the screen's edge (like the tracker); never in the sleep
// clock or the weight sheet; the animation doesn't replay when you come back to a screen (Inzicht and
// the tracker alike). The Fitness Tracker's day swipe as before. And no zooming in the whole app (viewport + touch-action; a real
// pinch can't be checked headless, see there).
// The touches are real ones (CDP Input.dispatchTouchEvent), so scrolling and preventDefault behave as
// on a phone.
const H = require('./helpers');
const { check, ok } = H;

const S = (w, r) => ({ weight: String(w), reps: String(r), rpe: '8', extra: '0', extraType: '' });
// Today: Thursday 22 October 2026 (week 43).
const DATA = {
  custom_exercises: [], scheduleVersions: {}, weekCycle: {},
  exerciseInfo: { 'bench-press': { primaryMuscleGroup: 'chest', trackStrength: true }, squat: { primaryMuscleGroup: 'quads', trackStrength: true } },
  workouts: {
    '2026-09-15': [{ exerciseId: 'bench-press', sets: [S(95, 5)] }],
    '2026-10-13': [{ exerciseId: 'bench-press', sets: [S(100, 5)] }, { exerciseId: 'squat', sets: [S(140, 5)] }],
    '2026-10-19': [{ exerciseId: 'bench-press', sets: [S(102.5, 5)] }, { exerciseId: 'squat', sets: [S(140, 3)] }],
  },
  sleep: { '2026-10-20': { bedtime: '23:00', wakeTime: '07:00' } },
  bodyWeight: { '2026-10-12': 98.4, '2026-10-19': 98.5 },
};

// The screens, how to open them, and their scroll area.
const SCREENS = [
  ['hoofdscherm', 'screen-insight', () => openInsight()],
  ['Slaap', 'screen-insight-metric', () => { openInsight(); openInsightMetric('sleep'); }],
  ['Gewicht', 'screen-insight-metric', () => { openInsight(); openInsightMetric('weight'); }],
  ['Training', 'screen-insight-training', () => { openInsight(); openInsightTraining(); }],
  ['spiergroep', 'screen-insight-muscle', () => { openInsight(); openInsightTraining(); openInsightMuscle('chest'); }],
  ['Kracht', 'screen-insight-strength', () => { openInsight(); openInsightStrength(); }],
  ['categorie', 'screen-insight-category', () => { openInsight(); openInsightStrength(); openInsightCategory('chest'); }],
];

H.run(async () => {
  const { browser, ctx, page, errors } = await H.openApp({ width: 360, height: 800, touch: true });
  const cdp = await ctx.newCDPSession(page);
  const W = 360;
  // A real touch: down at (x, y), 4 steps to (x + dx, y + dy), up.
  const swipe = async (x, y, dx, dy = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 4, y: y + dy * i / 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await H.settle(page);
  };
  const Y = 420; // in the content, under the head
  const left = () => swipe(260, Y, -150);   // → later (like ›)
  const right = () => swipe(100, Y, 150);   // → earlier (like ‹)
  const open = async fn => { await page.evaluate(fn); await H.settle(page); };
  const title = sel => page.evaluate(s => document.querySelector(s).textContent, sel);
  const hist = () => page.evaluate(() => [history.length, JSON.stringify(history.state)]);
  // Watches the classes the swipe sets during the animation (settle() finishes it at once).
  const watchSlide = id => page.evaluate(id => {
    window.__slid = [];
    const kids = [...document.querySelector(`#${id} .insight-scroll`).children];
    const mo = new MutationObserver(() => kids.forEach((k, i) => {
      ['slide-in-next', 'slide-in-prev'].forEach(c => { if (k.classList.contains(c) && !window.__slid.includes(i + c)) window.__slid.push(i + c); });
    }));
    // the head is re-rendered inside its own element, the other children stay
    kids.forEach(k => mo.observe(k, { attributes: true, attributeFilter: ['class'] }));
    window.__slidStop = () => mo.disconnect();
  }, id);
  const slid = () => page.evaluate(() => { window.__slidStop(); return window.__slid.sort(); });

  await H.loadData(page, DATA, 'light');
  await page.evaluate(() => showScreen('screen-home'));

  // ── every screen with a period head, in Week / Maand / Jaar ─────────────────────────────
  const EXPECT = { week: ['Week 43', 'Week 42'], month: ['Oktober 2026', 'September 2026'], year: ['2026', '2025'] };
  for (const [name, id, fn] of SCREENS) {
    H.section(`${name} (${id})`);
    for (const period of ['week', 'month', 'year']) {
      await open(fn);
      await page.evaluate(p => { insightSwitchPeriod(p); SCREEN_ON_ENTER[document.querySelector('.screen.active').id](); }, period);
      await H.settle(page);
      const T = `#${id} .insight-nav-title`;
      const [now, prev] = EXPECT[period];
      check(`${name} ${period}: begint op de huidige`, await title(T), now);
      const h0 = await hist();
      // left at the current period: › is disabled → nothing
      await left();
      check(`${name} ${period}: veeg naar links bij de huidige doet niets`, await title(T), now);
      // right: one back, like ‹; the content under the head slides, the head not
      await watchSlide(id);
      await right();
      const s = await slid();
      check(`${name} ${period}: veeg naar rechts = ‹`, await title(T), prev);
      ok(s.length > 0 && s.every(x => x.endsWith('slide-in-prev')) && !s.some(x => x.startsWith('0')), `${name} ${period}: inhoud onder de kop schuift van links in, de kop niet`, s);
      // left again: back to the current, like ›
      await watchSlide(id);
      await left();
      const s2 = await slid();
      check(`${name} ${period}: veeg naar links = ›`, await title(T), now);
      ok(s2.length > 0 && s2.every(x => x.endsWith('slide-in-next')), `${name} ${period}: van rechts in`, s2);
      check(`${name} ${period}: vegen geeft geen stap in de geschiedenis`, await hist(), h0);
      // the same as a tap: ‹ then a swipe left gives the same as ‹ then ›
      await page.click(`#${id} [data-insight-step="-1"]`); await H.settle(page);
      check(`${name} ${period}: tik ‹ geeft hetzelfde als veeg naar rechts`, await title(T), prev);
      await left();
    }
  }

  // ── the day overview ─────────────────────────────────────────────────────────────────────
  H.section('dagoverzicht');
  await open(() => { openInsight(); openInsightDay('2026-10-22'); });
  const DT = '#insight-day-title';
  const h0 = await hist();
  await left();
  check('dag: vandaag, veeg naar links doet niets', await title(DT), 'Donderdag 22 oktober 2026');
  await watchSlide('screen-insight-day');
  await right();
  const ds = await slid();
  check('dag: veeg naar rechts = vorige dag', await title(DT), 'Woensdag 21 oktober 2026');
  ok(ds.length > 0 && ds.every(x => x.endsWith('slide-in-prev')) && !ds.some(x => x.startsWith('0')), 'dag: inhoud schuift, de navigatie niet', ds);
  await right();
  check('dag: nog een dag terug', await title(DT), 'Dinsdag 20 oktober 2026');
  await left(); await left();
  check('dag: twee keer naar links = vandaag', await title(DT), 'Donderdag 22 oktober 2026');
  await left();
  check('dag: niet voorbij vandaag', await title(DT), 'Donderdag 22 oktober 2026');
  check('dag: vegen geeft geen stap in de geschiedenis', await hist(), h0);
  // back (the history) still goes to the main screen in one step
  await page.evaluate(() => history.back()); await H.settle(page);
  check('dag: terug gaat in één stap naar het hoofdscherm', await page.evaluate(() => document.querySelector('.screen.active').id), 'screen-insight');

  // ── thresholds, direction, edge ──────────────────────────────────────────────────────────
  H.section('drempel, richting, rand');
  // Animations that start after leaving the screen and coming back (history.back(): the real way back).
  const replayed = async leave => {
    await page.evaluate(leave); await H.settle(page);
    await page.evaluate(() => { window.__starts = []; document.addEventListener('animationstart', e => window.__starts.push(e.animationName + ' ' + (e.target.id || e.target.className)), true); history.back(); });
    await H.settle(page);
    return page.evaluate(() => [document.querySelector('.screen.active').id, window.__starts, document.querySelectorAll('.slide-in-next, .slide-in-prev').length]);
  };
  await open(() => { openInsight(); insightStep(-1); renderInsight(); });
  const MT = '#screen-insight .insight-nav-title';
  await swipe(200, Y, 40);
  check('40px horizontaal (onder de drempel van 50) bladert niet', await title(MT), 'Week 42');
  await swipe(200, Y, 60);
  check('60px horizontaal bladert wel', await title(MT), 'Week 41');
  await swipe(2, Y, 150);
  check('vanaf de linkerrand (2px) bladert ook: geen randzone', await title(MT), 'Week 40');
  await swipe(W - 2, Y, -150);
  check('vanaf de rechterrand (2px) bladert ook', await title(MT), 'Week 41');
  await swipe(2, Y, 150);
  // vertical: scrolls, doesn't browse
  await page.evaluate(() => { document.getElementById('insight-scroll').scrollTop = 0; });
  await swipe(180, 600, 30, -300);
  const sc = await page.evaluate(() => document.getElementById('insight-scroll').scrollTop);
  check('verticale veeg bladert niet', await title(MT), 'Week 40');
  ok(sc > 50, 'verticale veeg scrolt de inhoud', sc);
  // a horizontal swipe doesn't scroll sideways or the page
  await swipe(260, Y, -150, 20);
  check('schuine veeg die vooral horizontaal is, bladert', await title(MT), 'Week 41');
  check('touch-action van de Inzicht-inhoud', await page.evaluate(() => [...document.querySelectorAll('.insight-scroll')].map(e => getComputedStyle(e).touchAction)), Array(7).fill('pan-y'));

  // the animation doesn't replay when you come back to the screen
  check('Inzicht, terug op het scherm: de schuifanimatie speelt niet opnieuw', await replayed(() => openInsightMetric('sleep')), ['screen-insight', [], 0]);

  // ── sheets: the sleep clock and the weight sheet ─────────────────────────────────────────
  H.section('slaapklok en gewichtsvenster');
  await open(() => { openInsight(); openInsightDay('2026-10-21'); openInsightSleepSheet('2026-10-21'); });
  const times0 = await page.evaluate(() => JSON.stringify(insightSleepTimes));
  const clock = await page.evaluate(() => { const r = document.querySelector('.sleep-clock').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await swipe(clock.x + 60, clock.y, -150);
  await swipe(clock.x - 60, clock.y, 150);
  const panel = await page.evaluate(() => { const r = document.querySelector('#insight-sleep-overlay .overlay-panel').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 30 }; });
  await swipe(panel.x + 60, panel.y, -150);
  await swipe(panel.x - 60, panel.y, 150);
  check('slaapklok: vegen bladert niet (dag gelijk, venster open, tijden gelijk)',
    [await title(DT), await page.evaluate(() => document.getElementById('insight-sleep-overlay').classList.contains('open')), await page.evaluate(() => JSON.stringify(insightSleepTimes))],
    ['Woensdag 21 oktober 2026', true, times0]);
  await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await H.settle(page);
  await open(() => openInsightWeightSheet('2026-10-21'));
  const wp = await page.evaluate(() => { const r = document.querySelector('#insight-weight-overlay .overlay-panel').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 }; });
  await swipe(wp.x + 60, wp.y, -150);
  await swipe(wp.x - 60, wp.y, 150);
  check('gewichtsvenster: vegen bladert niet', [await title(DT), await page.evaluate(() => document.getElementById('insight-weight-overlay').classList.contains('open'))], ['Woensdag 21 oktober 2026', true]);
  await page.evaluate(() => closeOverlay('insight-weight-overlay')); await H.settle(page);
  // and a sheet over a period screen (the Slaap list's sheet)
  await open(() => { openInsight(); openInsightMetric('sleep'); openInsightSleepSheet('2026-10-20'); });
  await swipe(panel.x - 60, panel.y, 150);
  check('sheet boven Slaap: vegen bladert niet', await title('#screen-insight-metric .insight-nav-title'), 'Week 43');
  await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await H.settle(page);

  // ── the Fitness Tracker, as before ───────────────────────────────────────────────────────
  H.section('Fitness Tracker');
  await open(() => { showScreen('screen-fitness-tracker'); currentDate = '2026-10-22'; renderHome(); });
  const cd = () => page.evaluate(() => currentDate);
  const th0 = await hist();
  await page.evaluate(() => {
    window.__homeSlid = [];
    const el = document.getElementById('home-content');
    new MutationObserver(() => ['slide-in-next', 'slide-in-prev'].forEach(c => { if (el.classList.contains(c)) window.__homeSlid.push(c); })).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await left();
  check('tracker: veeg naar links = volgende dag (ook na vandaag)', await cd(), '2026-10-23');
  await right(); await right();
  check('tracker: veeg naar rechts = vorige dag', await cd(), '2026-10-21');
  check('tracker: dezelfde animatie (de hele inhoud)', await page.evaluate(() => window.__homeSlid), ['slide-in-next', 'slide-in-prev', 'slide-in-prev']);
  await swipe(200, Y, 40);
  check('tracker: drempel 50px ongewijzigd', await cd(), '2026-10-21');
  await swipe(2, Y, 150);
  check('tracker: vanaf de rand werkt zoals voorheen (geen randzone)', await cd(), '2026-10-20');
  await swipe(180, Y, 10, -200);
  check('tracker: verticaal bladert niet', await cd(), '2026-10-20');
  check('tracker: vegen geeft geen stap in de geschiedenis', await hist(), th0);
  check('tracker, terug op het scherm: de schuifanimatie speelt niet opnieuw', await replayed(() => openInsight()), ['screen-fitness-tracker', [], 0]);
  check('tracker: animatie-CSS ongewijzigd', await page.evaluate(() => { const el = document.getElementById('home-content'); el.classList.remove('slide-in-prev'); el.classList.add('slide-in-next'); const cs = getComputedStyle(el); const r = [cs.animationName, cs.animationDuration, cs.animationTimingFunction]; el.classList.remove('slide-in-next'); return r; }),
    ['slideInFromRight', '0.22s', 'ease-out']);

  // ── no zooming ───────────────────────────────────────────────────────────────────────────
  H.section('vergroten uit');
  const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  ok(/user-scalable=no/.test(meta) && /maximum-scale=1(\.0)?\b/.test(meta) && /width=device-width/.test(meta), 'viewport: user-scalable=no, maximum-scale=1, width=device-width', meta);
  check('touch-action: overal geen zoomen', await page.evaluate(() => [document.documentElement, document.body, document.querySelector('.card'), document.querySelector('.toolbar')].map(e => getComputedStyle(e).touchAction)),
    Array(4).fill('pan-x pan-y'));
  // No element anywhere allows pinch zoom of its own: every touch-action is pan-x pan-y or narrower
  // (manipulation only on the training graph's canvas, whose ancestors take pinch-zoom away again).
  // A real pinch can't be checked headless: headless Chromium doesn't zoom on a synthesized pinch, not
  // even on a page without these settings.
  check('touch-action van elk element', await page.evaluate(() => {
    const seen = {};
    document.querySelectorAll('*').forEach(e => { const t = getComputedStyle(e).touchAction; if (t !== 'pan-x pan-y') (seen[t] = seen[t] || new Set()).add(e.id ? '#' + e.id : e.classList[0] || e.tagName); });
    return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, k === 'manipulation' ? [...v] : 'ok']).sort());
  }), { manipulation: ['#progress-chart'], none: 'ok', 'pan-y': 'ok' });
  check('geen text-size-adjust (de lettergrootte van Android blijft werken)', await page.evaluate(() => getComputedStyle(document.documentElement).webkitTextSizeAdjust), 'auto');

  check('geen JS-fouten', errors, []);
  await browser.close();
});

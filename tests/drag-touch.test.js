// Dragging with a finger still works everywhere, now that every element has touch-action: pan-x pan-y
// (no zooming, see DESIGN_SYSTEM.md "Geen vergroten"): with real touches (CDP Input.dispatchTouchEvent,
// so touch-action and preventDefault behave as on a phone) —
//   long-press on an exercise card (Fitness Tracker) and on a plan-day exercise (selection mode),
//   dragging an exercise card by its handle (Fitness Tracker, selection mode),
//   long-press-dragging a set row (TRACK),
//   dragging an exercise in Dag bewerken by its handle,
//   dragging a handle of the 24-hour sleep clock,
//   swiping TRACK → HISTORY (the training tabs) and a day in the tracker;
// and nothing scrolls along while dragging.
const H = require('./helpers');
const { check } = H;

const S = w => ({ weight: String(w), reps: '5', rpe: '8', extra: '0', extraType: '' });
const DATA = {
  custom_exercises: [], scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {}, exerciseInfo: {},
  workouts: { '2026-10-22': [
    { exerciseId: 'bench-press', sets: [S(100), S(90), S(80)] },
    { exerciseId: 'squat', sets: [S(140)] },
    { exerciseId: 'barbell-curl', sets: [S(30)] },
  ] },
  plans: { p: { name: 'P', createdAt: 1, days: [{ name: 'Dag', exercises: [
    { exerciseId: 'bench-press', name: 'Bench press', sets: 3, reps: 10 },
    { exerciseId: 'squat', name: 'Squat', sets: 3, reps: 10 },
    { exerciseId: 'deadlift', name: 'Deadlift', sets: 3, reps: 10 },
  ] }] } },
};

H.run(async () => {
  const { browser, ctx, page, errors } = await H.openApp({ width: 360, height: 800, touch: true });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // Down at (x, y); optionally hold until `until` is true in the page (a long-press: no fixed wait);
  // then in 10 steps to (x + dx, y + dy), and up.
  const drag = async (x, y, dx, dy, until) => {
    await touch('touchStart', x, y);
    if (until) await page.waitForFunction(until, null, { polling: 50, timeout: 3000 });
    for (let i = 1; i <= 10; i++) await touch('touchMove', x + dx * i / 10, y + dy * i / 10);
    await touch('touchEnd');
    await H.settle(page);
  };
  const centre = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; }, sel);
  const ta = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).touchAction, sel);

  await H.loadData(page, DATA, 'light');

  // ── Fitness Tracker: long-press → selection mode, then drag a card by its handle ──────────
  H.section('Fitness Tracker: oefeningkaarten');
  await page.evaluate(() => { showScreen('screen-fitness-tracker'); currentDate = '2026-10-22'; renderHome(); }); await H.settle(page);
  const order = () => page.evaluate(() => getWorkout(currentDate).map(e => e.exerciseId));
  let c = await centre('#home-content .exercise-card');
  await drag(c.x, c.y, 0, 0, () => homeSel.active);
  check('long-press op een oefeningkaart zet de selectie aan', await page.evaluate(() => [homeSel.active, homeSel.items.size]), [true, 1]);
  check('touch-action van de sleepgreep', await ta('.exercise-card-drag-handle'), 'none');
  const scroll0 = await page.evaluate(() => document.getElementById('home-content').scrollTop);
  const handle = await centre('#home-content .exercise-card .exercise-card-drag-handle');
  const last = await centre('#home-content .exercise-card:last-of-type');
  await drag(handle.x, handle.y, 0, last.y - handle.y + last.h / 2);
  check('kaart slepen aan de greep: volgorde veranderd en opgeslagen', await order(), ['squat', 'barbell-curl', 'bench-press']);
  check('tijdens het slepen scrolt de inhoud niet', await page.evaluate(() => document.getElementById('home-content').scrollTop), scroll0);
  await page.evaluate(() => exitHomeSelMode()); await H.settle(page);

  // ── Fitness Tracker: swiping a day still works ──────────────────────────────────────────
  await drag(260, 500, -150, 0);
  check('veeg in de tracker: volgende dag', await page.evaluate(() => currentDate), '2026-10-23');
  await page.evaluate(() => { currentDate = '2026-10-22'; renderHome(); }); await H.settle(page);

  // ── TRACK: long-press a set row and drag it ──────────────────────────────────────────────
  H.section('TRACK: setrijen');
  await page.evaluate(() => openTraining('bench-press')); await H.settle(page);
  const weights = () => page.evaluate(() => getWorkout(currentDate).find(e => e.exerciseId === 'bench-press').sets.map(s => s.weight));
  const r0 = await centre('#set-list .set-row');
  const r2 = await page.evaluate(() => { const r = [...document.querySelectorAll('#set-list .set-row')].pop().getBoundingClientRect(); return { y: r.top + r.height / 2, h: r.height }; });
  await drag(r0.x, r0.y, 0, r2.y - r0.y + r2.h / 2, () => !!setDragItem);
  check('setrij lang indrukken en slepen: volgorde veranderd en opgeslagen', await weights(), ['90', '80', '100']);
  check('na het slepen is het slepen klaar en geen set geselecteerd', await page.evaluate(() => [setDragItem, selectedSetIndex]), [null, null]);
  // swiping TRACK → HISTORY (the training-tab swipe)
  await drag(260, 600, -150, 0);
  check('veeg TRACK → HISTORY', await page.evaluate(() => document.querySelector('.tab.active').dataset.tab), 'history');
  await page.evaluate(() => switchTab('track')); await H.settle(page);

  // ── Dag bewerken: long-press → selection, drag by the handle ────────────────────────────
  H.section('Dag bewerken');
  await page.evaluate(() => { currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0); }); await H.settle(page);
  const pdeOrder = () => page.evaluate(() => currentPlanData.days[0].exercises.map(e => e.exerciseId));
  check('touch-action van de sleepgreep', await ta('.pde-drag-handle'), 'none');
  const ph = await centre('#pde-list .pde-item .pde-drag-handle');
  const pl = await page.evaluate(() => { const r = [...document.querySelectorAll('#pde-list .pde-item')].pop().getBoundingClientRect(); return { y: r.top + r.height / 2, h: r.height }; });
  await drag(ph.x, ph.y, 0, pl.y - ph.y + pl.h / 2);
  check('oefening slepen aan de greep: volgorde veranderd', await pdeOrder(), ['squat', 'deadlift', 'bench-press']);
  const pi = await centre('#pde-list .pde-item .pde-item-inner');
  await drag(pi.x - 60, pi.y, 0, 0, () => pdeSel.active);
  check('long-press op een oefening zet de selectie aan', await page.evaluate(() => pdeSel.active), true);
  await page.evaluate(() => pdeSel.exit()); await H.settle(page);

  // ── Inzicht: the 24-hour sleep clock ────────────────────────────────────────────────────
  H.section('24-uursklok');
  await page.evaluate(() => { showScreen('screen-home'); openInsight(); openInsightDay('2026-10-21'); openInsightSleepSheet('2026-10-21'); }); await H.settle(page);
  check('touch-action van de klok', await ta('.sleep-clock'), 'none');
  const bed0 = await page.evaluate(() => insightSleepTimes.bed);
  const panelScroll0 = await page.evaluate(() => document.querySelector('#insight-sleep-overlay .overlay-panel').scrollTop);
  const clock = await centre('.sleep-clock');
  const hb = await centre('.sleep-clock-handle[data-which="bed"]');
  // a quarter turn clockwise around the centre: 6 hours later
  const R = Math.hypot(hb.x - clock.x, hb.y - clock.y), a0 = Math.atan2(hb.x - clock.x, clock.y - hb.y);
  await touch('touchStart', hb.x, hb.y);
  for (let i = 1; i <= 12; i++) { const a = a0 + Math.PI / 2 * i / 12; await touch('touchMove', clock.x + R * Math.sin(a), clock.y - R * Math.cos(a)); }
  await touch('touchEnd'); await H.settle(page);
  const bed1 = await page.evaluate(() => insightSleepTimes.bed);
  const diff = (timeToMin => (timeToMin(bed1) - timeToMin(bed0) + 1440) % 1440)(t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
  check('naar-bed-greep slepen: een kwartslag = 6 uur later', diff, 360);
  check('tijdens het slepen scrolt het venster niet', await page.evaluate(() => document.querySelector('#insight-sleep-overlay .overlay-panel').scrollTop), panelScroll0);
  await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await H.settle(page);

  check('geen JS-fouten', errors, []);
  await browser.close();
});

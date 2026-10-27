// Two-stage hardware back (history.back(), what Android's back button triggers in the PWA):
// a temporary mode (Fitness Tracker selection mode, Plan detail edit mode) and an open popup
// are closed first, before back leaves the screen — see SCREEN_TEMP_MODE in app.js.
const H = require('./helpers');

H.run(async () => {
  const { browser, ctx, page, errors } = await H.openApp({ width: 390, height: 844, touch: true });
  const cdp = await ctx.newCDPSession(page);
  const settle = (ms = 450) => page.waitForTimeout(ms);
  const back = async () => { await page.evaluate(() => history.back()); await settle(); };
  const state = () => page.evaluate(() => ({
    screen: document.querySelector('.screen.active').id,
    sel: homeSel.active,
    selClass: document.getElementById('screen-fitness-tracker').classList.contains('sel-mode'),
    selected: document.querySelectorAll('.exercise-card-selected').length,
    doneVisible: getComputedStyle(document.getElementById('btn-home-sel-done')).display !== 'none',
  }));
  const longPress = async idx => {
    const box = await page.locator('#home-content .exercise-card').nth(idx).locator('.exercise-card-name').boundingBox();
    const x = box.x + 20, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); // a real Android long-press release fires no click
    await settle();
  };

  // Real navigation path: hub → Fitness Tracker (pushes a history entry, as on the phone)
  await page.evaluate(() => {
    showScreen('screen-home');
    db.workouts = {};
    currentDate = todayStr();
    db.workouts[currentDate] = [
      { exerciseId: 'bench-press', sets: [{ weight: 80, reps: 8 }] },
      { exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] },
      { exerciseId: 'bent-over-barbell-row', sets: [{ weight: 60, reps: 10 }] },
    ];
  });
  await settle();
  await page.evaluate(() => openFitnessTracker()); await settle();
  H.check('drie oefeningkaarten', await page.locator('#home-content .exercise-card').count(), 3);

  H.section('lang drukken → terug → terug');
  await longPress(0);
  let s = await state();
  H.check('lang drukken opent de selectiemodus', [s.sel, s.selClass, s.selected, s.doneVisible], [true, true, 1, true]);
  await back();
  s = await state();
  H.check('1e keer terug: blijft op de Fitness Tracker, selectiemodus dicht', s, { screen: 'screen-fitness-tracker', sel: false, selClass: false, selected: 0, doneVisible: false });
  await back();
  H.check('2e keer terug: verlaat het scherm', (await state()).screen, 'screen-home');

  H.section('meerdere selecteren, herhaald (geen verloren of extra historiestappen)');
  await page.evaluate(() => openFitnessTracker()); await settle();
  await longPress(0);
  await page.locator('#home-content .exercise-card').nth(2).click(); await settle();
  H.check('twee kaarten geselecteerd', (await state()).selected, 2);
  await back();
  s = await state();
  H.check('terug deselecteert alles en blijft', [s.screen, s.sel, s.selected], ['screen-fitness-tracker', false, 0]);
  await longPress(1); await back();
  await longPress(2); await back();
  s = await state();
  H.check('na 3× selecteren/terug: nog op het scherm, uit de selectiemodus', [s.screen, s.sel], ['screen-fitness-tracker', false]);
  await back();
  H.check('nog één keer terug verlaat het scherm', (await state()).screen, 'screen-home');

  H.section('✓ in de kop, daarna terug');
  await page.evaluate(() => openFitnessTracker()); await settle();
  await longPress(0);
  await page.click('#btn-home-sel-done'); await settle();
  H.check('✓ sluit de selectiemodus', (await state()).sel, false);
  await back();
  H.check('terug (niet in selectiemodus) verlaat meteen', (await state()).screen, 'screen-home');

  H.section('pop-up open in selectiemodus: terug sluit pop-up, dan modus, dan scherm');
  await page.evaluate(() => openFitnessTracker()); await settle();
  await longPress(1);
  await page.click('#btn-home-sel-delete'); await settle();
  const confirmOpen = () => page.evaluate(() => document.getElementById('confirm-delete-overlay').classList.contains('open'));
  H.check('bevestiging open', await confirmOpen(), true);
  await back();
  s = await state();
  H.check('terug #1 sluit alleen de pop-up (selectie blijft, niets verwijderd)', [await confirmOpen(), s.sel, s.selected, await page.evaluate(() => getWorkout(currentDate).length)], [false, true, 1, 3]);
  await back();
  s = await state();
  H.check('terug #2 sluit de selectiemodus', [s.screen, s.sel], ['screen-fitness-tracker', false]);
  await back();
  H.check('terug #3 verlaat het scherm', (await state()).screen, 'screen-home');

  H.section('Plan detail: bewerkmodus');
  await page.evaluate(() => {
    db.plans = { p: { id: 'p', name: 'P', createdAt: 1, scheduleConfirmed: true, days: [{ name: 'D', exercises: [] }] } };
    showScreen('screen-workout-plan'); renderPlanList();
  }); await settle();
  await page.evaluate(() => openPlanDetail('p')); await settle();
  await page.evaluate(() => { planDetailEditMode = true; renderPlanDetail(); });
  await back();
  H.check('1e keer terug sluit de bewerkmodus en blijft', await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, edit: planDetailEditMode })), { screen: 'screen-plan-detail', edit: false });
  await back();
  H.check('2e keer terug verlaat Plan detail', await page.evaluate(() => document.querySelector('.screen.active').id), 'screen-workout-plan');

  H.check('geen JS-fouten', errors, []);
  await browser.close();
});

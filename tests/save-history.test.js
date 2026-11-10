// Opslaan is een afgeronde stap terug: het formulier gaat uit de schermgeschiedenis. Na Opslaan
// in Oefening bewerken / Nieuwe oefening sta je weer op de lijst waar je het opende (ververst),
// en de terugknop (Android = history.back(), of het pijltje) gaat daarna verder terug — nooit
// meer naar het opgeslagen formulier. Opslaan in Oefening bewerken werkt altijd dezelfde
// oefening bij (ook een ingebouwde: bewerkte kopie met hetzelfde id), nooit een nieuwe.
// Zonder opslaan blijft "Wijzigingen weggooien?" werken. Plannen: Doorgaan in Planschema en
// Verwijderen in Plan detail laten dat scherm ook niet in de geschiedenis achter.
const H = require('./helpers');

H.run(async () => {
  const { page, errors } = await H.openApp({ width: 390, height: 844 });
  await H.loadData(page, {});
  const settle = () => H.settle(page);
  const click = async sel => { await page.click(sel); await settle(); };
  const hwBack = async () => { await page.evaluate(() => history.back()); await settle(); };
  const state = () => page.evaluate(() => ({
    screen: document.querySelector('.screen.active').id,
    discard: document.getElementById('discard-changes-overlay').classList.contains('open'),
  }));
  const names = () => page.evaluate(() => [...document.querySelectorAll('#exercise-list .exercise-item-name')].map(e => e.textContent));
  const customs = () => page.evaluate(() => (db.custom_exercises || []).map(e => [e.id, e.name]));
  // Fitness Tracker → Alle oefeningen → Benen → Losse oefeningen open → ⋮ → Bewerken
  const openEdit = async exName => {
    await page.evaluate(() => { showScreen('screen-home'); openFitnessTracker(); openExerciseList(); }); await settle();
    await page.locator('#exercise-list .category-item', { hasText: 'Benen' }).click(); await settle();
    const heads = page.locator('#exercise-list .ex-group-head');
    for (let i = 0; i < await heads.count(); i++) if (await heads.nth(i).getAttribute('aria-expanded') !== 'true') { await heads.nth(i).click(); await settle(); }
    await page.locator('#exercise-list .exercise-item', { hasText: exName }).first().locator('.exercise-item-dots').click(); await settle();
    await page.locator('#overflow-panel .dropdown-item', { hasText: 'Bewerken' }).click(); await settle();
  };

  for (const how of ['android', 'pijltje']) {
    H.section(`Oefening bewerken (ingebouwd), opslaan, dan terug met ${how}`);
    await page.evaluate(() => { db.custom_exercises = []; });
    await openEdit('Bulgarian Split Squat');
    H.check(`${how}: bewerkscherm open`, (await state()).screen, 'screen-new-exercise');
    await page.fill('#new-ex-name', 'Bulgarian Split Squa');
    await click('#btn-new-ex-save');
    let s = await state();
    H.check(`${how}: na opslaan terug op de lijst Benen`, [s.screen, s.discard, await page.evaluate(() => currentBrowseCategory)], ['screen-exercises', false, 'legs']);
    const n = await names();
    H.check(`${how}: nieuwe naam één keer in de lijst, oude weg`, [n.filter(x => x === 'Bulgarian Split Squa').length, n.includes('Bulgarian Split Squat')], [1, false]);
    H.check(`${how}: bewerkte kopie met hetzelfde id, geen nieuwe oefening`, await customs(), [['bulgarian-split-squat', 'Bulgarian Split Squa']]);
    if (how === 'android') await hwBack(); else await click('#btn-back-exercises');
    s = await state();
    H.check(`${how}: 1× terug → Alle oefeningen (categorieën)`, [s.screen, s.discard, await page.evaluate(() => exerciseBrowserMode)], ['screen-exercises', false, 'categories']);
    if (how === 'android') await hwBack(); else await click('#btn-back-exercises');
    s = await state();
    H.check(`${how}: 2× terug → Fitness Tracker, nooit het bewerkscherm`, [s.screen, s.discard], ['screen-fitness-tracker', false]);
  }

  H.section('Tweede keer opslaan (zelfde formulier) werkt dezelfde oefening bij');
  await page.evaluate(() => { db.custom_exercises = []; });
  await openEdit('Bulgarian Split Squat');
  await page.fill('#new-ex-name', 'Bulgarian Split Squa');
  await click('#btn-new-ex-save');
  // the old route back onto the saved form, by hand: Opslaan again must not make a new exercise
  await page.evaluate(() => showScreen('screen-new-exercise')); await settle();
  await page.fill('#new-ex-name', 'Bulgarian Split Squats 2');
  await click('#btn-new-ex-save');
  H.check('nog steeds één oefening, zelfde id', await customs(), [['bulgarian-split-squat', 'Bulgarian Split Squats 2']]);

  H.section('Eigen oefening bewerken: zelfde id');
  await page.evaluate(() => { db.custom_exercises = [{ id: 'ex-eigen', name: 'Mijn lunge', category: 'legs', type: 'weight_reps' }]; });
  await openEdit('Mijn lunge');
  await page.fill('#new-ex-name', 'Mijn lunges');
  await click('#btn-new-ex-save');
  H.check('eigen oefening hernoemd, geen nieuwe', await customs(), [['ex-eigen', 'Mijn lunges']]);
  await hwBack(); await hwBack();
  H.check('terug, terug → Fitness Tracker', (await state()).screen, 'screen-fitness-tracker');

  H.section('Nieuwe oefening: opslaan, dan terug');
  await page.evaluate(() => { db.custom_exercises = []; showScreen('screen-home'); openFitnessTracker(); openExerciseList(); }); await settle();
  await page.locator('#exercise-list .category-item', { hasText: 'Benen' }).click(); await settle();
  await click('#btn-new-exercise');
  await page.fill('#new-ex-name', 'Proef squat');
  await click('#new-ex-category'); await click('#field-picker-list [data-value="legs"]');
  await click('#btn-new-ex-save');
  let s = await state();
  H.check('na opslaan op de lijst Benen, oefening erin', [s.screen, s.discard, await page.evaluate(() => currentBrowseCategory), (await customs()).length], ['screen-exercises', false, 'legs', 1]);
  const heads = page.locator('#exercise-list .ex-group-head');
  for (let i = 0; i < await heads.count(); i++) if (await heads.nth(i).getAttribute('aria-expanded') !== 'true') { await heads.nth(i).click(); await settle(); }
  H.check('nieuwe oefening staat in de lijst', (await names()).includes('Proef squat'), true);
  await hwBack(); await hwBack();
  H.check('terug, terug → Fitness Tracker', (await state()).screen, 'screen-fitness-tracker');

  H.section('Niet opgeslagen: melding blijft');
  await page.evaluate(() => { db.custom_exercises = []; });
  for (const how of ['android', 'pijltje']) {
    await openEdit('Bulgarian Split Squat');
    await page.fill('#new-ex-name', 'Iets anders');
    if (how === 'android') await hwBack(); else await click('#btn-new-ex-back');
    s = await state();
    H.check(`${how}: melding om weg te gooien`, [s.screen, s.discard], ['screen-new-exercise', true]);
    await click('#btn-discard-changes-confirm');
    s = await state();
    H.check(`${how}: Weggooien → lijst, niets opgeslagen`, [s.screen, s.discard, (await customs()).length], ['screen-exercises', false, 0]);
    await openEdit('Bulgarian Split Squat');
    if (how === 'android') await hwBack(); else await click('#btn-new-ex-back');
    H.check(`${how}: niets gewijzigd → zonder melding terug`, await state(), { screen: 'screen-exercises', discard: false });
  }

  H.section('Planschema → Doorgaan, dan terug');
  await page.evaluate(() => { showScreen('screen-home'); openWorkoutPlan(); }); await settle();
  const planId = await page.evaluate(async () => { const id = await createPlan('Proefplan', []); renderPlanList(); return id; });
  await page.locator('#screen-workout-plan .plan-item-info', { hasText: 'Proefplan' }).first().click(); await settle();
  H.check('planschema open', (await state()).screen, 'screen-plan-schedule');
  await page.evaluate(() => { currentPlanData.dayCount = currentPlanData.dayCount || 3; });
  const valid = await page.evaluate(() => isPlanScheduleValid(currentPlanData));
  if (!valid) await page.locator('#plan-schedule-scroll .ps-num-box').first().click();
  await settle();
  await click('#btn-plan-schedule-continue');
  H.check('Doorgaan → plan detail', (await state()).screen, 'screen-plan-detail');
  await hwBack();
  H.check('terug → planlijst, niet het planschema', (await state()).screen, 'screen-workout-plan');

  H.section('Plan verwijderen in Plan detail, dan terug');
  await page.locator('#screen-workout-plan .plan-item-info', { hasText: 'Proefplan' }).first().click(); await settle();
  H.check('plan detail open', (await state()).screen, 'screen-plan-detail');
  await click('#btn-overflow-plan-detail');
  await page.locator('#overflow-panel .dropdown-item', { hasText: 'Bewerken' }).click(); await settle();
  await click('#btn-overflow-plan-detail');
  await page.locator('#overflow-panel .dropdown-item', { hasText: 'Verwijderen' }).click(); await settle();
  await click('#btn-delete-plan-confirm');
  H.check('na verwijderen → planlijst, plan weg', [(await state()).screen, await page.evaluate(id => !!db.plans[id], planId)], ['screen-workout-plan', false]);
  await hwBack();
  H.check('terug → hoofdmenu, niet het verwijderde plan', (await state()).screen, 'screen-home');

  H.done(errors);
});

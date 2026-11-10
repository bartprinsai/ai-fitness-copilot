// Week A/B: welke week en dag de app voorstelt, zelf de huidige week instellen in Plan detail, en
// een handmatig geladen dag die de app overneemt als waar het plan nu staat. See PROJECT_CONTEXT.md
// ("Week A/B: de huidige week").
//
// De fout die dit oploste: wie in week B begon, kreeg steeds de verkeerde week. Nooit geladen = Week
// A (planWeekCycle), en Schema handmatig laden gaf de geladen dag niet door aan het plan, dus de
// app bleef één week verschoven (elke maandag wisselt hij, dus daarna steeds de verkeerde).
const H = require('./helpers');
const { check, ok } = H;

// Donderdag 22 oktober 2026 (weekdag 3), week van maandag 19 oktober.
const MON = '2026-10-19', TUE = '2026-10-20', THU = '2026-10-22', NEXT_MON = '2026-10-26', NEXT_TUE = '2026-10-27';
const ex = id => [{ exerciseId: id, sets: 3, reps: 5 }];
// Vaste dagen met Week A/B: A = maandag en woensdag, B = dinsdag en donderdag.
const splitPlan = { id: 'ab', name: 'AB', fixedDays: true, hasWeekB: true, createdAt: 1, days: [
  { id: 'a-ma', name: 'Maandag A', weekday: 0, group: 'A', exercises: ex('bench-press') },
  { id: 'a-wo', name: 'Woensdag A', weekday: 2, group: 'A', exercises: ex('squat') },
  { id: 'b-di', name: 'Dinsdag B', weekday: 1, group: 'B', exercises: ex('deadlift') },
  { id: 'b-do', name: 'Donderdag B', weekday: 3, group: 'B', exercises: ex('leg-press') },
] };
// Geen vaste dagen, met Week A/B: A1, A2, B1, B2.
const seqPlan = { id: 'seq', name: 'Seq', fixedDays: false, hasWeekB: true, createdAt: 2, days: [
  { id: 's-a1', name: 'A1', group: 'A', exercises: ex('bench-press') }, { id: 's-a2', name: 'A2', group: 'A', exercises: ex('squat') },
  { id: 's-b1', name: 'B1', group: 'B', exercises: ex('deadlift') }, { id: 's-b2', name: 'B2', group: 'B', exercises: ex('leg-press') },
] };
const data = (plan, active = {}) => ({ plans: { [plan.id]: plan }, activePlan: { planId: plan.id, planName: plan.name, lastDayIndex: -1, ...active }, weekCycle: {}, scheduleVersions: {} });

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 390, height: 900 });
  const setToday = async date => { await page.clock.setFixedTime(new Date(date + 'T12:00:00+02:00')); };
  const suggestion = () => page.evaluate(() => { const p = getTodaysScheduledDay(); return p ? p.dayName : null; });
  const cycle = () => page.evaluate(() => ({ week: db.activePlan.activeWeek, done: db.activePlan.doneWeekdays, since: db.activePlan.weekStart }));

  // ── 1. De oorzaak: nooit geladen = Week A
  H.section('oorzaak');
  await H.loadData(page, data(splitPlan));
  check('nooit geladen: de app gaat uit van Week A, dus op donderdag (alleen in B) niets', await suggestion(), null);

  // ── 2. Handmatig laden neemt de week over
  H.section('handmatig laden');
  await page.evaluate(d => { currentDate = d; newWorkoutDate = d; showScreen('screen-fitness-tracker'); showScreen('screen-new-workout'); showScreen('screen-schedule-pick-plan'); openSchedulePickDay('ab'); }, THU);
  await H.settle(page);
  await page.evaluate(() => loadPickedScheduleDay(3)); // Donderdag B
  await H.settle(page);
  check('Donderdag B handmatig geladen: Week B is de huidige week, donderdag gedaan', await cycle(), { week: 'B', done: [3], since: MON });
  check('Inzicht: Week B vanaf maandag', await page.evaluate(m => db.weekCycle[m], MON), { effectiveFrom: MON, planId: 'ab', week: 'B' });
  check('vandaag blijft de geladen dag het voorstel', await suggestion(), 'Donderdag B');
  await setToday(NEXT_MON);
  check('volgende maandag: Week A', await suggestion(), 'Maandag A');
  await setToday(NEXT_TUE);
  check('volgende dinsdag: geen dag (dinsdag is alleen B)', await suggestion(), null);
  await setToday(THU);

  // Een dag die past bij de cyclus corrigeert niets
  await H.loadData(page, data(splitPlan, { activeWeek: 'B', doneWeekdays: [1], weekStart: MON, lastDayIndex: 2, lastDate: TUE }));
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.ab, 3, todayStr()));
  check('Donderdag B in Week B: week compleet, Week A vanaf volgende maandag', await cycle(), { week: 'A', done: [], since: NEXT_MON });
  check('geen correctie in Inzicht', await page.evaluate(() => Object.keys(db.weekCycle)), []);

  // Een oudere datum dan de laatst geladen dag draait het plan niet terug
  await H.loadData(page, data(splitPlan, { activeWeek: 'B', doneWeekdays: [3], weekStart: MON, lastDayIndex: 3, lastDate: THU }));
  await page.evaluate(m => adoptLoadedPlanDay(db.plans.ab, 0, m), MON);
  check('Maandag A op een eerdere datum: plan blijft staan', await cycle(), { week: 'B', done: [3], since: MON });

  // Een dag van vorige week: die week was de week van die dag, deze week de andere
  await H.loadData(page, data(splitPlan));
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.ab, 3, '2026-10-15')); // donderdag vorige week, Donderdag B
  check('Donderdag B vorige week: nu Week A', await page.evaluate(() => planWeekCycle(db.plans.ab).week), 'A');

  // Een ander plan dan het actieve: het actieve plan blijft zoals het is
  await H.loadData(page, { ...data(splitPlan), plans: { ab: splitPlan, seq: seqPlan } });
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.seq, 2, todayStr()));
  check('dag van een ander plan: actief plan ongewijzigd', await page.evaluate(() => db.activePlan.lastDayIndex), -1);

  // ── 3. Plan detail: Huidige week
  H.section('Plan detail: huidige week');
  await H.loadData(page, data(splitPlan));
  await page.evaluate(() => openPlanDetail('ab'));
  await H.settle(page);
  const card = () => page.evaluate(() => {
    const c = document.querySelector('#plan-detail-scroll .plan-week-now');
    return c && { label: c.querySelector('.section-label').textContent, options: [...c.querySelectorAll('[data-week]')].map(b => b.textContent + (b.classList.contains('selected') ? ' ✓' : '')),
      note: c.querySelector('.role-sub').textContent, first: c === document.querySelector('#plan-detail-scroll').firstElementChild };
  });
  check('kaart bovenaan, Week A gekozen (nooit geladen)', await card(), { label: 'Huidige week', options: ['Week A ✓', 'Week B'], note: 'Wisselt elke maandag vanzelf naar de andere week.', first: true });
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.screenshot({ path: require('path').join(H.outDir(__filename), `plan-detail-${theme}-${w}.png`) });
  }
  await page.click('#plan-detail-scroll [data-week="B"]');
  await H.settle(page);
  check('Week B getikt: B is de week, niets gedaan, vanaf maandag', await cycle(), { week: 'B', done: [], since: MON });
  check('kaart toont Week B', (await card()).options, ['Week A', 'Week B ✓']);
  check('vandaag (donderdag): Donderdag B', await suggestion(), 'Donderdag B');
  check('Inzicht: Week B vanaf maandag', await page.evaluate(m => db.weekCycle[m].week, MON), 'B');
  await setToday(NEXT_MON);
  check('na de wissel: volgende maandag Week A', await suggestion(), 'Maandag A');
  await setToday(THU);
  // Terug naar A: de Inzicht-regel van maandag wordt overschreven, latere regels van dit plan gaan weg.
  await page.evaluate(n => { db.weekCycle[n] = { effectiveFrom: n, planId: 'ab', week: 'A' }; }, NEXT_MON);
  await page.click('#plan-detail-scroll [data-week="A"]');
  await H.settle(page);
  check('terug naar Week A: Inzicht maandag A, geen latere regel', await page.evaluate(() => db.weekCycle), { [MON]: { effectiveFrom: MON, planId: 'ab', week: 'A' } });
  check('vandaag (donderdag, alleen B): geen dag', await suggestion(), null);

  // Niet actief of zonder Week B: geen kaart
  await H.loadData(page, { ...data(splitPlan), activePlan: null });
  await page.evaluate(() => openPlanDetail('ab', { replace: true })); await H.settle(page);
  check('plan niet actief: geen kaart', await card(), null);
  await H.loadData(page, data({ ...splitPlan, hasWeekB: false, days: splitPlan.days.slice(0, 2) }));
  await page.evaluate(() => openPlanDetail('ab', { replace: true })); await H.settle(page);
  check('plan zonder Week B: geen kaart', await card(), null);
  await H.loadData(page, data(splitPlan));
  await page.evaluate(() => { openPlanDetail('ab', { replace: true }); planDetailEditMode = true; renderPlanDetail(); }); await H.settle(page);
  check('bewerken: geen kaart', await card(), null);
  await page.evaluate(() => { planDetailEditMode = false; renderPlanDetail(); });

  // Geen vaste dagen: de volgende dag komt uit de gekozen week
  await H.loadData(page, data(seqPlan));
  await page.evaluate(() => openPlanDetail('seq', { replace: true })); await H.settle(page);
  check('geen vaste dagen: Week A (volgende dag A1)', (await card()).options, ['Week A ✓', 'Week B']);
  check('geen vaste dagen: eigen uitleg', (await card()).note, 'Je volgende dag komt uit deze week.');
  await page.click('#plan-detail-scroll [data-week="B"]'); await H.settle(page);
  check('Week B gekozen: volgende dag B1', await suggestion(), 'B1');
  // Handmatig laden gaat verder vanaf die dag
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.seq, 0, todayStr()));
  check('A1 handmatig geladen: volgende dag A2', await suggestion(), 'A2');

  await browser.close();
  check('geen JS-fouten', errors, []);
  ok(true, 'klaar');
});

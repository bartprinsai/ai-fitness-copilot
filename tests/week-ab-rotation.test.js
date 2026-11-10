// Week A/B: welke week en dag de app voorstelt, en een handmatig geladen dag (Schema handmatig
// laden) die de app overneemt als waar het plan nu staat — de enige manier om de week te bepalen;
// Plan detail heeft er geen keuze meer voor. See PROJECT_CONTEXT.md ("Week A/B: de huidige week").
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

  // ── 3. Plan detail heeft geen keuze voor de week meer; handmatig laden is de enige manier
  H.section('Plan detail: geen keuze voor de week');
  await H.loadData(page, data(splitPlan));
  await page.evaluate(() => openPlanDetail('ab'));
  await H.settle(page);
  check('geen kaart Huidige week, geen weekknoppen', await page.evaluate(() => [
    !!document.querySelector('#plan-detail-scroll .plan-week-now'), document.querySelectorAll('#plan-detail-scroll [data-week]').length,
    document.getElementById('plan-detail-scroll').textContent.includes('Huidige week')]), [false, 0, false]);
  check('Plan detail begint met de weeklabels', await page.evaluate(() => document.querySelector('#plan-detail-scroll').firstElementChild.textContent), 'WEEK A');
  check('de functies van de keuze bestaan niet meer', await page.evaluate(() => [typeof setActivePlanWeek, typeof buildCurrentWeekCard, typeof activePlanCurrentWeek]), ['undefined', 'undefined', 'undefined']);
  await page.screenshot({ path: require('path').join(H.outDir(__filename), 'plan-detail.png') });

  // ── 4. Inzicht volgt de week van handmatig laden, ook na de wissel op maandag
  H.section('Inzicht volgt handmatig laden');
  await H.loadData(page, data(splitPlan));
  // Een eerdere (verkeerde) Week A-regel van dit plan, maandag en morgen: de geladen dag corrigeert ze.
  await page.evaluate(({ m }) => {
    db.weekCycle[m] = { effectiveFrom: m, planId: 'ab', week: 'A' };
    db.weekCycle['2026-10-23'] = { effectiveFrom: '2026-10-23', planId: 'ab', week: 'B' };
    currentDate = todayStr(); newWorkoutDate = todayStr(); schedulePickPlanId = 'ab'; loadPickedScheduleDay(3); // Donderdag B
  }, { m: MON });
  await H.settle(page);
  check('week_cycle: Week B vanaf maandag, latere regels weg', await page.evaluate(() => db.weekCycle), { [MON]: { effectiveFrom: MON, planId: 'ab', week: 'B' } });
  check('Inzicht: dinsdag en donderdag in Week B', await page.evaluate(() => [activeWeekOn('ab', '2026-10-20'), activeWeekOn('ab', '2026-10-22')]), ['B', 'B']);
  check('Inzicht: geplande dag dinsdag is Dinsdag B', await page.evaluate(() => {
    db.scheduleVersions = { '2026-10-01': { effectiveFrom: '2026-10-01', ...scheduleSnapshot() } };
    const p = getPlannedForDate('2026-10-20'); return [p.status, p.week, p.day && p.day.name]; }), ['day', 'B', 'Dinsdag B']);
  // Volgende week: de app stelt Week A voor (wissel op maandag)
  await setToday(NEXT_MON);
  check('volgende maandag stelt de app Week A voor', await suggestion(), 'Maandag A');
  await setToday(THU);

  // Geen vaste dagen: handmatig laden bepaalt ook daar waar het schema verder gaat
  await H.loadData(page, data(seqPlan));
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.seq, 2, todayStr())); // B1
  check('B1 handmatig geladen: volgende dag B2', await suggestion(), 'B2');
  await page.evaluate(() => adoptLoadedPlanDay(db.plans.seq, 0, todayStr())); // A1
  check('A1 handmatig geladen: volgende dag A2', await suggestion(), 'A2');

  await browser.close();
  check('geen JS-fouten', errors, []);
  ok(true, 'klaar');
});

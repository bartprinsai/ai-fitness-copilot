// Een plandag inladen wordt alleen aangeboden als die dag oefeningen heeft die bestaan: de banner
// in de Fitness Tracker, Schema automatisch laden (pop-up en de regel op Nieuwe workout) en de
// dagkiezer van Schema handmatig laden. Een lege dag, of een dag met alleen oefeningen die niet
// meer bestaan (uit EXERCISE_DB gehaald of permanent verwijderd), biedt niets aan; bij een dag met
// beide wordt alleen het bestaande ingeladen. See PROJECT_CONTEXT.md ("Trainingsplannen").
const H = require('./helpers');
const { check } = H;

const TODAY = H.TODAY; // Thursday 22 October 2026: weekday 3
const plan = exercises => ({ p: { id: 'p', name: 'Plan', fixedDays: true, daysPerWeek: 2, createdAt: 1,
  days: [{ id: 'd-ma', name: 'Maandag', weekday: 0, exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }] }, { id: 'd-do', name: 'Donderdag', weekday: 3, exercises }] } });
const data = exercises => ({ plans: plan(exercises), activePlan: { planId: 'p', planName: 'Plan', lastDayIndex: -1 }, purgedBuiltins: { squat: true }, weekCycle: {}, scheduleVersions: {} });

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 390, height: 900 });
  const state = () => page.evaluate(today => {
    bannerDismissed = false; currentDate = today; showScreen('screen-fitness-tracker'); renderHome();
    const banner = document.getElementById('smart-day-banner');
    renderNewWorkoutScreen();
    const sub = document.getElementById('nw-schema-auto-desc').textContent;
    openScheduleLoadAuto();
    const popup = { title: document.getElementById('schedule-load-title').textContent, msg: document.getElementById('schedule-load-msg').textContent,
      cancel: !document.getElementById('btn-schedule-load-cancel').classList.contains('hidden'), confirm: document.getElementById('btn-schedule-load-confirm').textContent };
    closeOverlay('schedule-load-overlay');
    return { banner: !banner.classList.contains('hidden'), sub, popup };
  }, TODAY);
  const NOTHING = { banner: false, sub: 'Vandaag staat Donderdag op het programma, nog zonder oefeningen.',
    popup: { title: 'Vandaag is Donderdag', msg: 'Deze dag heeft nog geen oefeningen, er is niets om te laden.', cancel: false, confirm: 'Sluiten' } };

  // ── 1. Lege dag
  await H.loadData(page, data([]));
  check('lege dag: geen banner, regel "nog zonder oefeningen", pop-up alleen Sluiten', await state(), NOTHING);
  await page.evaluate(() => { openScheduleLoadAuto(); document.getElementById('btn-schedule-load-confirm').click(); });
  await H.settle(page);
  check('lege dag: Sluiten laadt niets', await page.evaluate(t => [getWorkout(t).length, getWorkoutPlanDays(t).length], TODAY), [0, 0]);

  // ── 2. Alleen oefeningen die niet meer bestaan (Crunches uit de lijst, Squat permanent verwijderd)
  await H.loadData(page, data([{ exerciseId: 'crunches', sets: 3, reps: 20 }, { exerciseId: 'squat', sets: 5, reps: 5 }]));
  check('alleen verdwenen oefeningen: zelfde als een lege dag', await state(), NOTHING);

  // ── 3. Eén bestaande en één verdwenen oefening: aangeboden, alleen de bestaande ingeladen
  await H.loadData(page, data([{ exerciseId: 'crunches', sets: 3, reps: 20 }, { exerciseId: 'leg-press', sets: 3, reps: 10 }]));
  check('gemengde dag: banner en gewone pop-up', await state(), { banner: true, sub: 'Vandaag staat Donderdag op het programma.',
    popup: { title: 'Vandaag is Donderdag', msg: 'Oefeningen van dit plan laden voor vandaag?', cancel: true, confirm: 'Laden' } });
  await page.click('#btn-banner-load'); await H.settle(page);
  check('banner laden: alleen Leg Press, met naam op de kaart', await page.evaluate(t => ({
    workout: getWorkout(t).map(e => e.exerciseId), cards: [...document.querySelectorAll('#home-content .exercise-card-name')].map(n => n.textContent) }), TODAY),
    { workout: ['leg-press'], cards: ['Leg Press'] });

  // ── 4. Schema handmatig laden: een dag zonder oefeningen is niet aan te tikken
  await H.loadData(page, data([{ exerciseId: 'crunches', sets: 3, reps: 20 }]));
  await page.evaluate(() => { currentDate = '2026-10-21'; newWorkoutDate = '2026-10-21'; openSchedulePickDay('p'); });
  await H.settle(page);
  const cards = () => page.evaluate(() => [...document.querySelectorAll('#schedule-pick-day-scroll .plan-day-card')].map(c => ({
    name: c.querySelector('.plan-day-name').textContent, sub: c.querySelector('.plan-day-sub').textContent,
    chevron: !!c.querySelector('.plan-day-chevron'), disabled: c.getAttribute('aria-disabled') === 'true', cursor: getComputedStyle(c.querySelector('.plan-day-head')).cursor })));
  check('dagkiezer: Maandag te laden, Donderdag niet', await cards(), [
    { name: 'Maandag', sub: '1 oefening', chevron: true, disabled: false, cursor: 'pointer' },
    { name: 'Donderdag', sub: 'Geen oefeningen', chevron: false, disabled: true, cursor: 'default' }]);
  await page.evaluate(() => { clearTimeout(toastTimer); document.getElementById('toast').classList.remove('show'); }); // "Workout geladen!" from step 3
  await page.click('#schedule-pick-day-scroll .plan-day-card:nth-child(2) .plan-day-head'); await H.settle(page);
  check('tik op Donderdag: niets geladen, geen melding, scherm blijft', await page.evaluate(() => ({
    workout: getWorkout('2026-10-21').length, screen: document.querySelector('.screen.active').id, toast: document.getElementById('toast').classList.contains('show') })),
    { workout: 0, screen: 'screen-schedule-pick-day', toast: false });
  await page.screenshot({ path: require('path').join(H.outDir(__filename), 'pick-day.png') });

  await browser.close();
  check('geen JS-fouten', errors, []);
});

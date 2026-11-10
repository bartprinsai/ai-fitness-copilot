// Rustdag en Deloaddag: de knoppen onderaan een lege dag van de Fitness Tracker, de kaart en het label, wat
// ze met het schema doen, en dat een deloaddag nergens voor meetelt (records, PR, Grafiek, Records,
// Kracht, Samenvatting, Inzicht) maar zichtbaar blijft (Geschiedenis, kalender). Overal herkenbaar
// aan icoon en tekst. See PROJECT_CONTEXT.md ("Rustdag en deloaddag").
const path = require('path');
const H = require('./helpers');
const { check, ok } = H;

const TODAY = H.TODAY; // donderdag 22 oktober 2026 (weekdag 3)
const MON = '2026-10-19', TUE = '2026-10-20', WED = '2026-10-21';
const set = (weight, reps) => ({ weight, reps });
// Vaste dagen: maandag en donderdag (bench press 3 sets), woensdag (squat 2 sets).
const fixedPlan = { id: 'fx', name: 'Vast', fixedDays: true, createdAt: 1, days: [
  { id: 'fx-ma', name: 'Maandag', weekday: 0, exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }] },
  { id: 'fx-wo', name: 'Woensdag', weekday: 2, exercises: [{ exerciseId: 'squat', sets: 2, reps: 5 }] },
  { id: 'fx-do', name: 'Donderdag', weekday: 3, exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }] },
] };
const seqPlan = { id: 'sq', name: 'Doorlopend', fixedDays: false, createdAt: 2, days: [
  { id: 'sq-1', name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }] },
  { id: 'sq-2', name: 'Pull', exercises: [{ exerciseId: 'deadlift', sets: 3, reps: 5 }] },
] };
const version = (plan, from) => {
  const fixed = plan.fixedDays;
  return { effectiveFrom: from, planId: plan.id, planName: plan.name, type: fixed ? 'fixed' : 'sequential',
    days: plan.days.map(d => ({ id: d.id, name: d.name, ...(fixed && { weekday: d.weekday }), exercises: d.exercises.map(e => ({ exerciseId: e.exerciseId, name: e.exerciseId, sets: e.sets })) })),
    ...(fixed && { restWeekdays: [1, 4, 5, 6] }) };
};
const base = (plan, extra = {}) => ({ plans: { [plan.id]: plan }, activePlan: { planId: plan.id, planName: plan.name, lastDayIndex: -1 },
  scheduleVersions: { '2026-10-01': version(plan, '2026-10-01') }, weekCycle: {}, dayMarks: {}, workouts: {}, ...extra });

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 390, height: 900 });
  const out = H.outDir(__filename);
  const shot = async name => { for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await H.settle(page);
    await page.screenshot({ path: path.join(out, `${name}-${theme}-${w}.png`) });
  } await page.setViewportSize({ width: 390, height: 900 }); await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); };
  const tracker = d => page.evaluate(d => { exitHomeSelMode(); currentDate = d; bannerDismissed = false; showScreen('screen-fitness-tracker'); renderHome(); }, d);
  const toastText = () => page.evaluate(() => document.getElementById('toast').classList.contains('show') ? document.getElementById('toast-msg').textContent : null);
  const hideToast = () => page.evaluate(() => { clearTimeout(toastTimer); document.getElementById('toast').classList.remove('show'); });
  const openNewWorkout = async d => { await tracker(d); await page.click('#btn-start-new'); await H.settle(page); };

  // Welke knoppen onderaan zichtbaar zijn (en of Notitie een eigen regel boven Rustdag en Deloaddag heeft).
  const pills = () => page.evaluate(() => ({
    shown: [...document.querySelectorAll('.day-actions-row .pill')].filter(p => p.offsetParent !== null).map(p => p.textContent.trim()),
    twoRows: document.querySelector('.day-actions-row').classList.contains('day-actions-two-rows') }));
  const pillStyle = id => page.evaluate(id => { const p = document.getElementById(id), cs = getComputedStyle(p), svg = getComputedStyle(p.querySelector('svg'));
    return { cls: p.className, height: cs.height, radius: cs.borderRadius, border: cs.border, bg: cs.backgroundColor, shadow: cs.boxShadow, font: cs.fontSize + ' ' + cs.fontWeight,
      icon: svg.width, iconColor: svg.fill === 'none' ? svg.stroke : svg.fill }; }, id);
  const bottomGap = id => page.evaluate(id => Math.round(document.querySelector('.day-actions-row').getBoundingClientRect().bottom - document.getElementById(id).getBoundingClientRect().bottom), id);

  // ── 1. Nieuwe workout: alleen de drie laadopties
  H.section('Nieuwe workout');
  await H.loadData(page, base(fixedPlan));
  await tracker(TODAY);
  check('alleen Handmatig, Schema handmatig laden, Schema automatisch laden', await page.evaluate(() =>
    [...document.querySelectorAll('#screen-new-workout .nav-card .nav-card-title')].map(t => t.textContent)), ['Handmatig', 'Schema handmatig laden', 'Schema automatisch laden']);
  check('geen Rustdag of Deloaddag op Nieuwe workout', await page.evaluate(() => document.getElementById('screen-new-workout').textContent.match(/Rustdag|Deloaddag/g)), null);

  // ── 2. Dagoverzicht: knoppen Rustdag en Deloaddag
  H.section('knoppen in het dagoverzicht');
  await tracker(TODAY);
  check('lege dag: alleen Rustdag en Deloaddag', await pills(), { shown: ['Rustdag', 'Deloaddag'], twoRows: false });
  const rest = await pillStyle('btn-day-rest'), deload = await pillStyle('btn-day-deload'), restGap = await bottomGap('btn-day-rest');
  ok(await page.evaluate(() => document.getElementById('btn-start-new').getBoundingClientRect().bottom <= document.getElementById('btn-day-rest').getBoundingClientRect().top),
    'Nieuwe workout (+) valt niet achter de knoppen');
  await shot('empty-day');
  await page.evaluate(() => { db.workouts[todayStr()] = [{ exerciseId: 'bench-press', sets: [] }]; renderHome(); });
  check('met een oefening: Samenvatting en Notitie, Rustdag en Deloaddag weg', await pills(), { shown: ['Samenvatting', 'Notitie'], twoRows: false });
  const recap = await pillStyle('btn-day-recap');
  check('Rustdag: zelfde ronde knopstijl als Samenvatting', rest, recap);
  check('Deloaddag: zelfde ronde knopstijl als Samenvatting', deload, recap);
  check('op dezelfde plek als Samenvatting (onderkant van de rij)', restGap, await bottomGap('btn-day-recap'));
  check('iconen zzz en feather', await page.evaluate(() => ['btn-day-rest', 'btn-day-deload'].map(id => document.querySelector(`#${id} svg path`).getAttribute('d').slice(0, 10))),
    ['M4 12h6l-6', 'M4 20l10 -']);
  await page.evaluate(() => { delete db.workouts[todayStr()]; renderHome(); });
  // Een bestaande notitie: Notitie erbij, op een eigen regel boven Rustdag en Deloaddag
  await page.evaluate(() => { saveSessionNote(todayStr(), 'Knie wat stijf'); renderHome(); });
  check('lege dag met notitie: Notitie boven Rustdag en Deloaddag', await pills(), { shown: ['Rustdag', 'Deloaddag', 'Notitie'], twoRows: true });
  check('Notitie gecentreerd op de bovenste regel, de twee naast elkaar eronder', await page.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    return [r('btn-day-comment').bottom <= r('btn-day-rest').top, Math.round(r('btn-day-rest').top) === Math.round(r('btn-day-deload').top), r('btn-day-rest').right <= r('btn-day-deload').left,
      Math.abs((r('btn-day-comment').left + r('btn-day-comment').right) / 2 - innerWidth / 2) < 1]; }), [true, true, true, true]);
  ok(await page.evaluate(() => document.getElementById('btn-start-new').getBoundingClientRect().bottom <= document.getElementById('btn-day-comment').getBoundingClientRect().top),
    'Nieuwe workout (+) valt niet achter twee regels knoppen');
  await shot('empty-day-note');
  await page.evaluate(() => { saveSessionNote(todayStr(), ''); renderHome(); });
  check('notitie gewist: Notitie weg', await pills(), { shown: ['Rustdag', 'Deloaddag'], twoRows: false });
  // Rustdag: Notitie blijft bereikbaar; ongedaan maken brengt de knoppen terug
  await page.click('#btn-day-rest'); await H.settle(page);
  check('rustdag: alleen Notitie', await pills(), { shown: ['Notitie'], twoRows: false });
  await page.click('#btn-day-comment'); await H.settle(page);
  check('Notitie op een rustdag opent het invulvenster', await page.evaluate(() => document.getElementById('comment-overlay').classList.contains('open')), true);
  await page.evaluate(() => closeOverlay('comment-overlay')); await H.settle(page);
  await page.click('#btn-undo-rest'); await H.settle(page);
  check('rustdag ongedaan: Rustdag en Deloaddag terug', await pills(), { shown: ['Rustdag', 'Deloaddag'], twoRows: false });
  await page.evaluate(() => { db.activePlan = null; }); // geen plandag: een deloaddag zonder oefeningen
  await page.click('#btn-day-deload'); await H.settle(page);
  check('deloaddag zonder oefeningen: alleen Notitie', await pills(), { shown: ['Notitie'], twoRows: false });
  await page.click('#home-content .day-mark-menu'); await H.settle(page);
  await page.click('#overflow-panel .dropdown-item'); await H.settle(page);
  check('deloadlabel weg: Rustdag en Deloaddag terug', await pills(), { shown: ['Rustdag', 'Deloaddag'], twoRows: false });
  // Elke datum: eerder, een week terug, later
  for (const d of ['2026-10-21', '2026-10-15', '2026-10-23']) {
    await tracker(d);
    check(`${d}: lege dag met Rustdag en Deloaddag`, await pills(), { shown: ['Rustdag', 'Deloaddag'], twoRows: false });
  }
  // Een notitie blijft bewaard als de laatste oefening van een dag verdwijnt
  check('notitie bewaard na de laatste oefening weg; zonder notitie gaat het document', await page.evaluate(() => {
    const writes = [], prevUser = currentUser, orig = uDoc;
    currentUser = { uid: 'u' };
    uDoc = p => ({ set: d => { writes.push(['set', p, d]); return Promise.resolve(); }, delete: () => { writes.push(['delete', p]); return Promise.resolve(); } });
    db.sessionNotes['2026-10-15'] = 'Noot';
    setWorkout('2026-10-15', []);
    delete db.sessionNotes['2026-10-15'];
    setWorkout('2026-10-15', []);
    uDoc = orig; currentUser = prevUser;
    return writes; }),
    [['set', 'workouts/2026-10-15', { sessionNote: 'Noot' }], ['delete', 'workouts/2026-10-15']]);

  // ── 3. Rustdag
  await H.loadData(page, base(fixedPlan));
  await tracker(TODAY);
  H.section('Rustdag');
  await hideToast();
  await page.click('#btn-day-rest'); await H.settle(page);
  check('rustdag opgeslagen, in de tracker', await page.evaluate(() => [db.dayMarks[todayStr()], document.querySelector('.screen.active').id]), ['rest', 'screen-fitness-tracker']);
  check('melding', await toastText(), 'Rustdag ingesteld');
  const restCard = () => page.evaluate(() => {
    const c = document.querySelector('#home-content .day-mark-card');
    return c && { icon: !!c.querySelector('.day-mark-icon svg'), title: c.querySelector('.day-mark-title').textContent, sub: c.querySelector('.day-mark-sub').textContent,
      button: c.querySelector('button').textContent, empty: !!document.querySelector('#home-content .home-empty'), banner: !document.getElementById('smart-day-banner').classList.contains('hidden') };
  });
  check('kaart: icoon, Rustdag, Geen training vandaag, Ongedaan maken; geen lege staat, geen banner', await restCard(),
    { icon: true, title: 'Rustdag', sub: 'Geen training vandaag', button: 'Ongedaan maken', empty: false, banner: false });
  await shot('rest-card');
  await hideToast();
  await page.click('#btn-add-exercise'); await H.settle(page);
  check('+ op een rustdag: melding, blijft in de tracker', [await toastText(), await page.evaluate(() => document.querySelector('.screen.active').id)],
    ['Dit is een rustdag. Maak de rustdag eerst ongedaan.', 'screen-fitness-tracker']);
  await page.evaluate(() => openScheduleLoadAuto());
  check('Schema automatisch laden op een rustdag: alleen een melding', await page.evaluate(() => {
    const r = [document.getElementById('schedule-load-title').textContent, document.getElementById('btn-schedule-load-cancel').classList.contains('hidden'), document.getElementById('btn-schedule-load-confirm').textContent];
    document.getElementById('btn-schedule-load-confirm').click(); return r; }), ['Vandaag is een rustdag', true, 'Sluiten']);
  check('… en laadt niets', await page.evaluate(() => getWorkout(todayStr()).length), 0);
  await page.evaluate(() => { newWorkoutDate = todayStr(); schedulePickPlanId = 'fx'; loadPickedScheduleDay(0); });
  check('Schema handmatig laden op een rustdag: niets geladen', await page.evaluate(() => getWorkout(todayStr()).length), 0);
  // Inzicht: vaste dagen → de geplande dag van vandaag telt als gemist (vanaf vandaag), geen training
  const stats = days => page.evaluate(days => { const s = insightTrainingStats(days.map(insightDay)); return [s.plannedTrainings, s.doneTrainings, s.plannedSets, s.fromSchedule, s.doneSets]; }, days);
  check('Inzicht (vast): rustdag op een plandag = gemist', await stats([TODAY]), [1, 0, 3, 0, 0]);
  check('Inzicht (vast): status rest-missed', await page.evaluate(d => insightTrainingState(insightDay(d)), TODAY), 'rest-missed');
  await hideToast();
  await page.click('#btn-undo-rest'); await H.settle(page);
  check('Ongedaan maken: weg, lege staat terug, banner terug', await page.evaluate(() => [db.dayMarks[todayStr()] || null, !!document.querySelector('#home-content .home-empty'),
    !document.getElementById('smart-day-banner').classList.contains('hidden')]), [null, true, true]);
  check('melding', await toastText(), 'Rustdag ongedaan gemaakt');

  // Een rustdag op een eerdere dag (maandag, plandag): gemist; het schema gaat de volgende dag door
  await H.loadData(page, base(fixedPlan));
  await tracker(MON);
  await page.click('#btn-day-rest'); await H.settle(page);
  check('rustdag op de getoonde datum (maandag)', await page.evaluate(m => [db.dayMarks[m], currentDate, db.dayMarks[todayStr()] || null], MON), ['rest', MON, null]);
  check('maandag: "Geen training op deze dag"', (await restCard()).sub, 'Geen training op deze dag');
  check('vandaag: gewoon Donderdag voorgesteld', await page.evaluate(() => getTodaysScheduledDay().dayName), 'Donderdag');
  check('Inzicht: maandag gemist, telt niet als training', await stats([MON]), [1, 0, 3, 0, 0]);
  // Doorlopend schema: de dag schuift door, niet gemist
  await H.loadData(page, base(seqPlan, { scheduleVersions: { '2026-10-01': version(seqPlan, '2026-10-01') } }));
  await tracker(TODAY);
  check('doorlopend: voor de rustdag Push', await page.evaluate(() => getTodaysScheduledDay().dayName), 'Push');
  await page.click('#btn-day-rest'); await H.settle(page);
  check('doorlopend: na de rustdag nog steeds Push (schuift door)', await page.evaluate(() => [getTodaysScheduledDay().dayName, db.activePlan.lastDayIndex]), ['Push', -1]);
  check('doorlopend: status rest (niet gemist)', await page.evaluate(d => insightTrainingState(insightDay(d)), TODAY), 'rest');
  // Kalender: icoon en tekst, geen trainingsdag
  await page.evaluate(() => openCalendar()); await H.settle(page);
  check('kalender: rustdag met icoon en label, geen workout, telt niet', await page.evaluate(d => {
    const c = document.querySelector(`.cal-day[data-date="${d}"]`);
    return [c.classList.contains('cal-rest'), !!c.querySelector('.cal-mark svg'), c.getAttribute('aria-label'), c.classList.contains('has-workout'), document.getElementById('cal-workout-count').textContent];
  }, TODAY), [true, true, '22, rustdag', false, '0 workouts']);
  await page.evaluate(d => openWorkoutDetail(d), TODAY); await H.settle(page);
  check('kalender-popup: "Rustdag" met icoon', await page.evaluate(() => { const m = document.querySelector('#cal-detail-body .day-mark-inline'); return m && [m.textContent, !!m.querySelector('svg')]; }), ['Rustdag', true]);
  await page.evaluate(() => closeOverlay('cal-detail-overlay'));

  // ── 4. Deloaddag
  H.section('Deloaddag');
  // Eerdere sessies: maandag 100 × 5. De deloaddag (vandaag) heeft een zwaardere set die nergens mag tellen.
  const history = { [MON]: [{ exerciseId: 'bench-press', sets: [set(100, 5), set(100, 5)] }] };
  await H.loadData(page, base(fixedPlan, { workouts: history, exerciseInfo: { 'bench-press': { trackStrength: true, primaryMuscleGroup: 'chest' } } }));
  await tracker(TODAY);
  await hideToast();
  await page.click('#btn-day-deload'); await H.settle(page);
  check('deloaddag: geplande dag geladen en als uitgevoerd geteld', await page.evaluate(() => ({
    mark: db.dayMarks[todayStr()], workout: getWorkout(todayStr()).map(e => [e.exerciseId, e.target]), planDays: getWorkoutPlanDays(todayStr()).map(p => p.dayName),
    lastDayIndex: db.activePlan.lastDayIndex, lastDate: db.activePlan.lastDate })),
    { mark: 'deload', workout: [['bench-press', { sets: 3, reps: 5 }]], planDays: ['Donderdag'], lastDayIndex: 2, lastDate: TODAY });
  check('melding', await toastText(), 'Deloaddag: Donderdag geladen');
  const label = () => page.evaluate(() => {
    const l = document.querySelector('#home-content .day-mark-label');
    if (!l) return null;
    const cs = getComputedStyle(l);
    return { icon: !!l.querySelector('.day-mark-icon svg'), title: l.querySelector('.day-mark-title').textContent, sub: l.querySelector('.day-mark-sub').textContent,
      border: cs.borderTopStyle, menu: l.querySelector('.day-mark-menu').getAttribute('aria-label'),
      aboveCards: l.getBoundingClientRect().bottom <= document.querySelector('#home-content .exercise-card').getBoundingClientRect().top };
  });
  check('label bovenaan: icoon, gestippelde rand, Deloaddag, Telt nergens voor mee, ⋮', await label(),
    { icon: true, title: 'Deloaddag', sub: 'Telt nergens voor mee', border: 'dotted', menu: 'Menu deloaddag', aboveCards: true });
  // Sets loggen op de deloaddag (zwaarder dan maandag)
  await page.evaluate(() => { const w = getWorkout(todayStr()); w[0].sets = [{ weight: 140, reps: 5 }, { weight: 140, reps: 5 }]; setWorkout(todayStr(), w); renderHome(); });
  await H.settle(page);
  await shot('deload-label');
  check('geen PR-trofee op de deloaddag (wel op maandag)', await page.evaluate(() => [...getPRSetKeys('bench-press')]), [MON + '#0']);
  check('trofee niet getekend in de tracker', await page.evaluate(() => document.querySelectorAll('#home-content .exercise-card .set-pr-icon').length), 0);
  check('Grafiek: alleen maandag', await page.evaluate(() => getExerciseRepSeries('bench-press', 5).map(p => p.date)), [MON]);
  check('Records: alleen sets van maandag', await page.evaluate(() => [...new Set(getExerciseValidSets('bench-press').map(s => s.date))]), [MON]);
  check('Grafiek reps-lijst: alleen maandag geteld', await page.evaluate(() => getExerciseRepStats('bench-press').highest), 5);
  check('Kracht: deze week alleen de 1RM van maandag', await page.evaluate(m => [bestOneRmIn('bench-press', m, todayStr()), dayBestOneRm('bench-press', todayStr())], MON), [116.7, null]);
  check('Kracht: geen records van de deloaddag', await page.evaluate(m => insightStrengthStats({ period: 'week', start: m, from: m, to: '2026-10-25' }).exercises.find(e => e.id === 'bench-press').records, MON), 1);
  // De volgende dag vergelijkt met maandag, niet met de deloaddag
  check('Samenvatting morgen: "vorige keer" is maandag', await page.evaluate(() => previousSessionSets('bench-press', '2026-10-23').map(s => s.weight)), [100, 100]);
  await page.evaluate(() => openDayRecap()); await H.settle(page);
  check('Samenvatting deloaddag: markering, geen records, geen vergelijking', await page.evaluate(() => ({
    mark: (document.querySelector('#recap-body .day-mark-inline') || {}).textContent, prs: document.getElementById('recap-prs').classList.contains('hidden'),
    prev: document.querySelectorAll('#recap-body .recap-prev').length, first: document.getElementById('recap-body').textContent.includes('Eerste keer') })),
    { mark: 'Deloaddag · telt nergens voor mee', prs: true, prev: 0, first: false });
  await page.evaluate(() => closeOverlay('recap-overlay'));
  // Inzicht: plandag 100%, eigen sets tellen niet
  check('Inzicht vandaag: 1 van 1 training, 3 van 3 sets uit je schema, 0 sets', await stats([TODAY]), [1, 1, 3, 3, 0]);
  check('Inzicht: status deload', await page.evaluate(d => insightTrainingState(insightDay(d)), TODAY), 'deload');
  // Geschiedenis en kalender: zichtbaar, gemarkeerd
  await page.evaluate(() => { openTraining('bench-press'); switchTab('history'); }); await H.settle(page);
  check('Geschiedenis: deloaddag zichtbaar en gemarkeerd, maandag niet', await page.evaluate(() => [...document.querySelectorAll('#history-content .history-card-header')].map(h => [h.querySelector('.section-label').textContent, (h.querySelector('.day-mark-inline') || {}).textContent || ''])),
    [['Donderdag 22 oktober 2026', 'Deload'], ['Maandag 19 oktober 2026', '']]);
  await shot('deload-history');
  await page.evaluate(() => openCalendar()); await H.settle(page);
  check('kalender: deloaddag met icoon, wel zichtbaar als workout, telt niet mee in het aantal', await page.evaluate(d => {
    const c = document.querySelector(`.cal-day[data-date="${d}"]`);
    return [c.classList.contains('cal-deload'), !!c.querySelector('.cal-mark svg'), c.getAttribute('aria-label'), c.classList.contains('has-workout'), document.getElementById('cal-workout-count').textContent];
  }, TODAY), [true, true, '22, deloaddag', true, '1 workout']);
  await shot('calendar');
  await page.evaluate(d => openWorkoutDetail(d), TODAY); await H.settle(page);
  check('kalender-popup: markering en de sets', await page.evaluate(() => [(document.querySelector('#cal-detail-body .day-mark-inline') || {}).textContent, document.querySelectorAll('#cal-detail-body .set-row').length]),
    ['Deloaddag · telt nergens voor mee', 2]);
  await page.evaluate(() => closeOverlay('cal-detail-overlay'));
  // Label weghalen via ⋮: de sets tellen weer
  await tracker(TODAY);
  await hideToast();
  await page.click('#home-content .day-mark-menu'); await H.settle(page);
  check('⋮: Label weghalen', await page.evaluate(() => [...document.querySelectorAll('#overflow-panel .dropdown-item')].map(i => i.textContent)), ['Label weghalen']);
  await page.click('#overflow-panel .dropdown-item'); await H.settle(page);
  check('label weg, sets tellen weer (PR)', await page.evaluate(() => [db.dayMarks[todayStr()] || null, !!document.querySelector('#home-content .day-mark-label'), getPRSetKeys('bench-press').has(todayStr() + '#0')]), [null, false, true]);
  check('melding', await toastText(), 'Deloadlabel weggehaald');

  // Deloaddag zonder te trainen: plandag in Inzicht toch 100%
  await H.loadData(page, base(fixedPlan, { dayMarks: { [MON]: 'deload' } }));
  check('deloaddag maandag zonder sets: 1 van 1, 3 van 3', await stats([MON]), [1, 1, 3, 3, 0]);
  await page.evaluate(m => openInsightDay(m), MON); await H.settle(page);
  check('dagoverzicht: markering met uitleg', await page.evaluate(() => (document.querySelector('#insight-day-training .day-mark-inline') || {}).textContent),
    'Deloaddag · telt nergens voor mee · geplande dag telt als gedaan');
  await shot('insight-day-deload');
  // Weekoverzicht: icoon per dag, met tekst als label
  await H.loadData(page, base(fixedPlan, { dayMarks: { [MON]: 'deload', [WED]: 'rest', [TUE]: 'rest' } }));
  await page.evaluate(() => { openInsight(); }); await H.settle(page);
  check('weekoverzicht: deload, rustdag op plandag (gemist), rustdag op rustdag', await page.evaluate(() =>
    [...document.querySelectorAll('.insight-grid .insight-mark')].map(m => m.getAttribute('aria-label'))),
    ['Deloaddag', 'Rustdag', 'Rustdag, geplande training gemist']);
  await shot('insight-week');

  // Deloaddag op een andere datum met een doorlopend schema: de volgende dag wordt geladen en het schema gaat door
  await H.loadData(page, base(seqPlan, { scheduleVersions: { '2026-10-01': version(seqPlan, '2026-10-01') } }));
  await tracker(WED);
  await page.click('#btn-day-deload'); await H.settle(page);
  check('doorlopend, woensdag: Push geladen, volgende is Pull', await page.evaluate(w => [db.dayMarks[w], getWorkout(w).map(e => e.exerciseId), getTodaysScheduledDay().dayName], WED),
    ['deload', ['bench-press'], 'Pull']);
  // Zonder geplande dag: wel deloaddag, niets geladen
  await H.loadData(page, base(fixedPlan));
  await tracker(TUE);
  await hideToast();
  await page.click('#btn-day-deload'); await H.settle(page);
  check('dinsdag (geen plandag): deloaddag, niets geladen, label met lege staat', await page.evaluate(t => [db.dayMarks[t], getWorkout(t).length, !!document.querySelector('#home-content .day-mark-label'), !!document.querySelector('#home-content .home-empty')], TUE),
    ['deload', 0, true, true]);
  check('melding', await toastText(), 'Deloaddag ingesteld');

  // ── 5. Opslag en Alles resetten (vm, nagebootste Firestore)
  H.section('opslag');
  const store = new H.FakeStore({ 'users/u1/day_marks/2026-10-20': { type: 'rest' }, 'users/u1/day_marks/2026-10-21': { type: 'deload' }, 'users/u1/day_marks/2026-10-22': { type: 'iets anders' } });
  await H.runInVm(`
    currentUser = { uid: 'u1' };
    await loadUserData('u1');
    __assert(JSON.stringify(db.dayMarks) === JSON.stringify({ '2026-10-20': 'rest', '2026-10-21': 'deload' }), 'geladen uit day_marks (onbekend type genegeerd)');
    setDayMark('2026-10-23', 'rest');
    setDayMark('2026-10-20', null);
    await new Promise(r => r());
  `, { store });
  check('opgeslagen en gewist in day_marks', Object.keys(store.dump('users/u1/day_marks')), ['users/u1/day_marks/2026-10-21', 'users/u1/day_marks/2026-10-22', 'users/u1/day_marks/2026-10-23']);
  ok(require('fs').readFileSync(path.join(H.ROOT, 'app.js'), 'utf8').includes("'body_weight', 'day_marks']"), 'Alles resetten wist day_marks');

  await browser.close();
  check('geen JS-fouten', errors, []);
});

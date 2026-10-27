// Insight storage (vm, no browser): plan-day ids, schedule versions, Week A/B cycle, sleep, body weight, Kracht volgen.
const H = require('./helpers');
const { FakeStore } = H;
const U = 'users/u1/';
const store = new FakeStore({
  [U + 'meta/migrations']: { exerciseIds: '2026-10-20' },
  [U + 'meta/exercise_info']: { data: { 'bench-press': { primaryMuscleGroup: 'upper-chest', benchSettingNew: 2 } } },
  [U + 'meta/activeplan']: { planId: 'pFixed', planName: 'Vast schema', lastDayIndex: -1 },
  [U + 'plans/pFixed']: { name: 'Vast schema', fixedDays: true, daysPerWeek: 3, weekdaysA: [0, 2], scheduleConfirmed: true, createdAt: 3, days: [
    { name: 'Maandag', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }, { exerciseId: 'squat', repsPerSet: [5, 5, 5, 5] }] },
    { name: 'Woensdag', weekday: 2, exercises: [{ exerciseId: 'deadlift', sets: 3, reps: 5 }] },
    { name: 'Push', exercises: [] },
  ] },
  [U + 'plans/pAB']: { name: 'Week A/B', fixedDays: true, daysPerWeek: 8, hasWeekB: true, weekdaysA: [0, 3], weekdaysB: [1, 4], scheduleConfirmed: true, createdAt: 2, days: [
    { name: 'Maandag A', group: 'A', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }] },
    { name: 'Donderdag A', group: 'A', exercises: [{ exerciseId: 'squat', sets: 3, reps: 5 }] },
    { name: 'Dinsdag B', group: 'B', exercises: [{ exerciseId: 'deadlift', sets: 3, reps: 5 }] },
    { name: 'Vrijdag B', group: 'B', exercises: [{ exerciseId: 'pull-ups', sets: 3, reps: 8 }] },
  ] },
  [U + 'plans/pSeq']: { name: 'Doorlopend', fixedDays: false, daysPerWeek: 2, scheduleConfirmed: true, createdAt: 1, days: [
    { name: 'Dag 1', exercises: [{ exerciseId: 'bench-press', sets: 4, reps: 8 }] },
    { name: 'Dag 2', exercises: [{ exerciseId: 'squat', sets: 4, reps: 8 }] },
  ] },
});

const test = String.raw`
const A = __assert, F = path => store.dump()[path];
const store = firebase.firestore();
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
let TODAY = '2026-10-21'; // woensdag
todayStr = () => TODAY;
currentUser = { uid: 'u1' };
const versions = () => store.dump('users/u1/schedule_versions/');
const weeks = () => store.dump('users/u1/week_cycle/');
const plan = id => db.plans[id];

console.test('\n# Migratie plandagen + startpunt (wo 21-10)');
await loadUserData('u1');
await settle();
const fx = plan('pFixed');
A(fx.days.every(d => /^day-[a-z0-9]+$/.test(d.id)) && new Set(fx.days.map(d => d.id)).size === 3, 'elke plandag kreeg een uniek id');
A(fx.days[0].weekday === 0 && fx.days[1].weekday === 2, 'weekdag eenmalig uit de naam afgeleid (Maandag = 0), bestaande (Woensdag = 2) blijft');
A(fx.days[2].weekday === undefined, '"Push" (geen weekdagnaam) krijgt geen weekdag');
A(plan('pSeq').days.every(d => d.id && d.weekday === undefined), 'doorlopend plan: ids, geen weekdag');
A(F('users/u1/plans/pFixed').days[0].id === fx.days[0].id && F('users/u1/meta/migrations').planDays === '2026-10-21', 'opgeslagen in Firestore, vlag planDays gezet');
A(JSON.stringify(Object.keys(versions())) === '["users/u1/schedule_versions/2026-10-21"]', 'startpunt: één schemaversie met datum van vandaag, niets terugwerkend');
const v1 = F('users/u1/schedule_versions/2026-10-21');
A(v1.planId === 'pFixed' && v1.planName === 'Vast schema' && v1.type === 'fixed' && v1.effectiveFrom === '2026-10-21', 'versie: plan-id, naam, soort, ingangsdatum');
A(JSON.stringify(v1.days[0]) === JSON.stringify({ id: fx.days[0].id, name: 'Maandag', weekday: 0, exercises: [{ exerciseId: 'bench-press', name: 'Bench press', sets: 3 }, { exerciseId: 'squat', name: 'Squat', sets: 4 }] }), 'plandag met id, naam, weekdag, oefeningen (id, naam, sets; repsPerSet [5,5,5,5] = 4 sets)');
A(JSON.stringify(v1.restWeekdays) === '[1,3,4,5,6]', 'rustdagen: di, do, vr, za, zo');
A(!JSON.stringify(v1).includes('upper-chest'), 'geen spiergroepen in de versie');
A(Object.keys(weeks()).length === 0, 'geen Week A/B-opslag zolang het actieve plan geen Week A/B is');

console.test('\n# Migraties nog een keer');
const before = JSON.stringify(store.dump()), writesBefore = store.writes.length;
db = { workouts: {}, custom_exercises: [], records: {}, plans: {}, activePlan: null, sessionNotes: {}, favoriteExercises: {}, hiddenBuiltins: {} };
await loadUserData('u1'); await settle();
A(JSON.stringify(store.dump()) === before && store.writes.length === writesBefore, 'tweede keer laden: niets geschreven, ids gelijk');
const r2 = await migratePlanDays('u1');
A(r2.plans + r2.ids + r2.weekdays === 0, 'migratePlanDays geforceerd opnieuw: 0 wijzigingen');

console.test('\n# Centrale functie, vaste dagen');
A(getPlannedForDate('2026-10-20').status === 'no-version', 'di 20-10 (vóór startpunt): geen versie');
A(getPlannedForDate('2026-10-21').day.name === 'Woensdag', 'wo 21-10: Woensdag');
A(getPlannedForDate('2026-10-22').status === 'rest', 'do 22-10: rustdag');
A(getPlannedForDate('2026-10-26').day.name === 'Maandag', 'ma 26-10: Maandag');

console.test('\n# Wijziging midden in de week (vr 23-10), twee keer op één dag');
TODAY = '2026-10-23';
currentPlanId = 'pFixed'; currentPlanData = plan('pFixed'); currentEditDayIndex = 1;
await addExerciseToPlanDay('pull-ups', { sets: 4, reps: 8 }); await settle();
A(Object.keys(versions()).length === 2 && F('users/u1/schedule_versions/2026-10-23').days[1].exercises.length === 2, 'nieuwe versie per 23-10 met 2 oefeningen op woensdag');
A(getPlannedForDate('2026-10-21').day.exercises.length === 1 && getPlannedForDate('2026-10-22').version.effectiveFrom === '2026-10-21', 'dagen ervoor (21, 22-10) houden de oude versie');
A(getPlannedForDate('2026-10-23').version.effectiveFrom === '2026-10-23' && getPlannedForDate('2026-10-28').day.exercises.length === 2, 'vanaf 23-10 (die dag inbegrepen) de nieuwe');
const wedId = currentPlanData.days[1].id;
openPlanDayRename(1);
document.getElementById('plan-rename-input').value = 'Zware dag';
await document.getElementById('btn-plan-rename-save').__fire('click'); await settle();
A(Object.keys(versions()).length === 2, 'tweede wijziging dezelfde dag: nog steeds één versie per 23-10');
const v23 = F('users/u1/schedule_versions/2026-10-23');
A(v23.days[1].name === 'Zware dag' && v23.days[1].exercises.length === 2, 'die versie is de laatste stand (hernoemd én 2 oefeningen)');
A(currentPlanData.days[1].id === wedId && currentPlanData.days[1].weekday === 2 && getPlannedForDate('2026-10-28').day.name === 'Zware dag', 'hernoemde dag houdt id en weekdag (woensdag)');

console.test('\n# Plandag verplaatsen (za 24-10)');
TODAY = '2026-10-24';
const idsBefore = currentPlanData.days.map(d => d.id + ':' + d.weekday).sort().join();
currentPlanData.days.reverse();
await savePlanSchedule(); await settle();
A(currentPlanData.days.map(d => d.id + ':' + d.weekday).sort().join() === idsBefore, 'na omdraaien van de volgorde: zelfde ids met dezelfde weekdag');
A(getPlannedForDate('2026-10-26').day.name === 'Maandag' && getPlannedForDate('2026-10-28').day.name === 'Zware dag', 'centrale functie vindt de dagen nog op weekdag');
A(F('users/u1/schedule_versions/2026-10-24').days[0].name === 'Push', 'nieuwe versie bewaart de nieuwe volgorde');
document.getElementById('btn-day-picker-cancel'); // (geen versleep-UI in de app; dag toevoegen voegt in)
pendingAddDayGroup = undefined;
await document.getElementById('day-picker-grid').__fire('click', { target: { closest: () => ({ disabled: false, dataset: { day: '4' } }) } }); await settle();
const fri = currentPlanData.days.find(d => d.weekday === 4);
A(fri && /^day-/.test(fri.id) && fri.name === 'Vrijdag' && !idsBefore.includes(fri.id) && currentPlanData.days.map(d => d.id + ':' + d.weekday).filter(x => idsBefore.split(',').includes(x)).length === 3, 'dag toevoegen (vrijdag): nieuw eigen id en weekdag 4; de drie bestaande ids en weekdagen ongewijzigd');

console.test('\n# Plan hernoemen (geen wissel), ander plan actief (wel een wissel)');
const vPrev = scheduleVersionOn('2026-10-24');
openPlanRename();
document.getElementById('plan-rename-input').value = 'Vast schema v2';
await document.getElementById('btn-plan-rename-save').__fire('click'); await settle();
const vRen = F('users/u1/schedule_versions/2026-10-24');
A(vRen.planName === 'Vast schema v2' && vRen.planId === 'pFixed' && !isScheduleSwitch(scheduleVersionOn('2026-10-23'), vRen), 'hernoemd plan: versie met nieuwe naam, zelfde plan-id = geen wissel');
TODAY = '2026-10-26'; // maandag
await setActivePlan('pAB'); await settle();
const vAB = F('users/u1/schedule_versions/2026-10-26');
A(vAB.planId === 'pAB' && vAB.type === 'weekAB' && isScheduleSwitch(scheduleVersionOn('2026-10-25'), vAB), 'ander plan actief: versie per 26-10, ander plan-id = wissel');
A(JSON.stringify(vAB.days.map(d => [d.name, d.weekday, d.week])) === '[["Maandag A",0,"A"],["Donderdag A",3,"A"],["Dinsdag B",1,"B"],["Vrijdag B",4,"B"]]', 'Week A/B-versie: weekdag en week per dag');
A(JSON.stringify(vAB.restWeekdaysA) === '[1,2,4,5,6]' && JSON.stringify(vAB.restWeekdaysB) === '[0,2,3,5,6]', 'rustdagen per week');
A(JSON.stringify(F('users/u1/week_cycle/2026-10-26')) === JSON.stringify({ effectiveFrom: '2026-10-26', planId: 'pAB', week: 'A' }), 'startpunt Week A/B: week A per 26-10');

console.test('\n# Week A/B: plandagen laden, wissel midden in de week');
currentDate = TODAY;
let pick = getTodaysScheduledDay();
loadPlanDayIntoWorkout(pick.plan, pick.day, TODAY); await markScheduledDayLoaded(pick); await settle();
A(JSON.stringify(F('users/u1/workouts/2026-10-26').planDays) === JSON.stringify([{ planId: 'pAB', dayId: plan('pAB').days[0].id, dayName: 'Maandag A', week: 'A' }]), 'training ma 26-10 onthoudt plan, plandag, naam en week A');
TODAY = '2026-10-29'; // donderdag: laatste dag van week A
pick = getTodaysScheduledDay();
A(pick.day.name === 'Donderdag A', 'do 29-10: Donderdag A voorgesteld');
loadPlanDayIntoWorkout(pick.plan, pick.day, TODAY); await markScheduledDayLoaded(pick); await settle();
A(JSON.stringify(Object.keys(weeks()).map(k => weeks()[k].week + '@' + weeks()[k].effectiveFrom)) === '["A@2026-10-26","B@2026-10-30"]', 'week A afgerond op do 29-10: week B per vr 30-10');
A(getTodaysScheduledDay().day.name === 'Donderdag A', 'vandaag blijft Donderdag A (zoals de app)');
renderHome(); await settle();
A(Object.keys(weeks()).length === 2, 'opnieuw renderen schrijft niets extra');
TODAY = '2026-10-30';
A(getTodaysScheduledDay().day.name === 'Vrijdag B', 'vr 30-10: app stelt Vrijdag B voor');
const P = d => { const r = getPlannedForDate(d); return r.status + (r.day ? ':' + r.day.name : '') + (r.week ? '/' + r.week : ''); };
A(P('2026-10-26') === 'day:Maandag A/A' && P('2026-10-27') === 'rest/A' && P('2026-10-29') === 'day:Donderdag A/A', 'ma 26 Maandag A, di 27 rust (A), do 29 Donderdag A');
A(P('2026-10-30') === 'day:Vrijdag B/B' && P('2026-10-31') === 'rest/B' && P('2026-11-03') === 'day:Dinsdag B/B', 'vr 30 Vrijdag B, za 31 rust (B), di 3-11 Dinsdag B');
A(P('2026-10-25') === 'rest' , 'zo 25-10: oude vaste versie (Vast schema v2), rustdag');
TODAY = '2026-11-03';
pick = getTodaysScheduledDay(); loadPlanDayIntoWorkout(pick.plan, pick.day, TODAY); await markScheduledDayLoaded(pick); await settle();
TODAY = '2026-11-06';
pick = getTodaysScheduledDay(); loadPlanDayIntoWorkout(pick.plan, pick.day, TODAY); await markScheduledDayLoaded(pick); await settle();
A(weeks()['users/u1/week_cycle/2026-11-07'].week === 'A' && P('2026-11-09') === 'day:Maandag A/A', 'week B af op vr 6-11: week A per za 7-11, ma 9-11 Maandag A');
TODAY = '2026-11-18'; // twee weken niet geopend: nieuwe kalenderweek dwingt de wissel af
currentDate = TODAY; renderHome(); await settle();
A(weeks()['users/u1/week_cycle/2026-11-16'].week === 'B' && planWeekCycle(plan('pAB')).week === 'B' && planWeekCycle(plan('pAB')).since === '2026-11-16', 'gedwongen wissel bij nieuwe kalenderweek: B per ma 16-11, gelijk aan planWeekCycle() van de app');
A(P('2026-11-12') === 'day:Donderdag A/A' && P('2026-11-17') === 'day:Dinsdag B/B', 'do 12-11 Donderdag A, di 17-11 Dinsdag B');

console.test('\n# Meer plandagen op één datum, losse oefening');
loadPlanDayIntoWorkout(plan('pAB'), plan('pAB').days[2], TODAY);
loadPlanDayIntoWorkout(plan('pAB'), plan('pAB').days[2], TODAY);
loadPlanDayIntoWorkout(plan('pSeq'), plan('pSeq').days[0], TODAY);
openTraining('lat-pulldown'); document.getElementById('field-weight').value = '50'; document.getElementById('field-reps').value = '10'; saveSet();
const w18 = F('users/u1/workouts/2026-11-18');
A(w18.planDays.length === 2 && w18.planDays[0].week === 'B' && w18.planDays[1].planId === 'pSeq' && !('week' in w18.planDays[1]), 'twee verschillende plandagen bewaard (dubbel laden telt één keer); doorlopend plan zonder week');
A(w18.exercises.some(e => e.exerciseId === 'lat-pulldown') && w18.planDays.length === 2, 'oefening zonder plandag: werkt zoals nu, planDays ongewijzigd');

console.test('\n# Actief plan verwijderen, doorlopend, soort schema');
TODAY = '2026-11-19';
const nVersions = Object.keys(versions()).length, oldV = JSON.stringify(versions());
await deletePlan('pAB'); await settle();
A(F('users/u1/schedule_versions/2026-11-19').planId === null && getPlannedForDate('2026-11-19').status === 'no-schedule', 'verwijderd actief plan: versie "geen schema" per 19-11');
A(Object.keys(versions()).length === nVersions + 1 && Object.entries(versions()).filter(([k]) => !k.endsWith('2026-11-19')).every(([k, v]) => JSON.stringify(v) === JSON.stringify(JSON.parse(oldV)[k])), 'bestaande versies onaangeroerd');
A(P('2026-11-17') === 'day:Dinsdag B/B', 'oude datum vindt nog het (verwijderde) Week A/B-schema');
TODAY = '2026-11-20';
await setActivePlan('pSeq'); await settle();
const r20 = getPlannedForDate('2026-11-21');
A(r20.status === 'sequential' && r20.version.effectiveFrom === '2026-11-20' && r20.version.days.map(d => d.name).join() === 'Dag 1,Dag 2' && !('restWeekdays' in r20.version), 'doorlopend: de versie zelf (dagen in volgorde, ingangsdatum), geen rustdagen');
await setActivePlan('pSeq'); await settle(); // nogmaals = niet meer actief
A(F('users/u1/schedule_versions/2026-11-20').planId === null, 'geen plan meer actief (zelfde dag): versie 20-11 wordt "geen schema"');
await setActivePlan('pFixed'); await settle();
currentPlanId = 'pFixed'; currentPlanData = plan('pFixed');
await document.getElementById('plan-schedule-scroll').__fire('click', { target: { closest: sel => sel === '.ps-toggle-option' ? { dataset: { fixed: '0' } } : null } }); await settle();
A(F('users/u1/schedule_versions/2026-11-20').type === 'sequential' && F('users/u1/schedule_versions/2026-11-20').planId === 'pFixed', 'soort schema gewijzigd (vaste dagen → doorlopend): versie bijgewerkt');

console.test('\n# Doorgaan (dagindeling opnieuw): ids blijven bij dezelfde dagnaam');
currentPlanData.fixedDays = true; currentPlanData.daysPerWeek = 2; currentPlanData.weekdaysA = [0, 4];
const monId = currentPlanData.days.find(d => d.name === 'Maandag').id, vrijId = currentPlanData.days.find(d => d.name === 'Vrijdag').id;
await document.getElementById('btn-plan-schedule-continue').__fire('click'); await settle();
A(currentPlanData.days.map(d => d.name + ':' + d.weekday).join() === 'Maandag:0,Vrijdag:4' && currentPlanData.days[0].id === monId && currentPlanData.days[1].id === vrijId, 'Maandag en Vrijdag houden id; weekdag opgeslagen bij nieuw gemaakte dagen');

console.test('\n# Oefening hernoemen is geen schemawijziging');
const nv = Object.keys(versions()).length, cur = JSON.stringify(F('users/u1/schedule_versions/2026-11-20'));
TODAY = '2026-11-21';
updateExistingExercise('bench-press', { category: 'chest', name: 'Bankdrukken', type: 'weight_reps' });
await syncInsightSchedule();
A(Object.keys(versions()).length === nv, 'na hernoemen geen nieuwe versie');

console.test('\n# Slaap');
A(saveSleep('2026-10-22', '23:30', '07:15') && getSleep('2026-10-22').bedtime === '23:30', 'opgeslagen (nacht wo→do hoort bij do 22-10)');
A(sleepDurationMinutes('23:30', '07:15') === 465 && sleepDurationMinutes('22:00', '06:00') === 480 && sleepDurationMinutes('01:00', '08:30') === 450, 'duur over middernacht: 7u45, 8u; na middernacht naar bed: 7u30');
A(!saveSleep('2026-10-23', '25:00', '07:00') && !saveSleep('2026-10-23', '7:00', '23:00') && !getSleep('2026-10-23'), 'ongeldige tijd geweigerd');
saveSleep('2026-10-22', '00:15', '06:45'); saveSleep('2026-10-24', '22:45', '06:30');
A(JSON.stringify(F('users/u1/sleep/2026-10-22')) === '{"bedtime":"00:15","wakeTime":"06:45"}', 'wijzigen = opnieuw opslaan (overschrijft)');
A(JSON.stringify(getSleepRange('2026-10-20', '2026-10-31').map(n => n.date + '=' + n.minutes)) === '["2026-10-22=390","2026-10-24=465"]', 'periode ophalen met duur');
deleteSleep('2026-10-24');
A(!F('users/u1/sleep/2026-10-24') && getSleepRange('2026-10-24', '2026-10-24').length === 0, 'wissen');

console.test('\n# Gewicht');
A(saveBodyWeight('2026-10-22', '82,456') && F('users/u1/body_weight/2026-10-22').kg === 82.46, '"82,456" → 82,46 kg (max 2 decimalen)');
A(saveBodyWeight('2026-10-22', 81.2) && F('users/u1/body_weight/2026-10-22').kg === 81.2 && getBodyWeight('2026-10-22') === 81.2 && Object.keys(store.dump('users/u1/body_weight/')).length === 1, 'nieuwe invoer overschrijft: één waarde per dag');
A(!saveBodyWeight('2026-10-23', '0') && !saveBodyWeight('2026-10-23', 'abc') && getBodyWeight('2026-10-23') === null, '0 of geen getal geweigerd');
saveBodyWeight('2026-10-25', 80.75);
A(JSON.stringify(getBodyWeightRange('2026-10-01', '2026-10-31')) === '[{"date":"2026-10-22","kg":81.2},{"date":"2026-10-25","kg":80.75}]', 'periode ophalen');
deleteBodyWeight('2026-10-25');
A(!F('users/u1/body_weight/2026-10-25') && getBodyWeight('2026-10-25') === null, 'wissen');

console.test('\n# Kracht volgen');
A(!isStrengthTracked('deadlift'), 'standaard nee');
// Since stap 7 Kracht volgen is a field of the Oefeninginfo form (setStrengthTracked() is gone).
const toggleStrength = async () => { openTraining('bench-press'); showExerciseInfoEdit(); await document.getElementById('info-track-strength').__fire('click'); saveExerciseInfo(); };
await toggleStrength();
A(F('users/u1/meta/exercise_info').data['bench-press'].trackStrength === true && isStrengthTracked('bench-press'), 'ja: opgeslagen in meta/exercise_info op oefening-id');
const bi = F('users/u1/meta/exercise_info').data['bench-press'];
A(bi.trackStrength === true && bi.primaryMuscleGroup === 'upper-chest' && bi.benchSettingNew === 2, 'Kracht volgen opslaan via het formulier laat de andere velden staan');
openTraining('bench-press'); showExerciseInfoEdit(); saveExerciseInfo();
A(F('users/u1/meta/exercise_info').data['bench-press'].trackStrength === true, 'Oefeninginfo opnieuw opslaan laat Kracht volgen staan');
await toggleStrength();
A(!('trackStrength' in F('users/u1/meta/exercise_info').data['bench-press']) && !isStrengthTracked('bench-press'), 'nee: veld weg (= standaard)');
`;

H.run(async () => {
  await H.runInVm(test, { store });
});

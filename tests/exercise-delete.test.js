// Oefening verwijderen = verbergen, Verwijderde oefeningen, terugzetten en permanent verwijderen.
// See PROJECT_CONTEXT.md ("Oefening-id's": Verwijderen = verbergen, Verwijderde oefeningen,
// Terugzetten, Permanent verwijderen) and DESIGN_SYSTEM.md ("All Exercises-scherm",
// "Verwijderde oefeningen", Modals → "Vinkje in een pop-up").
// Layout (pop-ups, rows, screen) in light and dark at 360 and 390px; the full data checks once
// (light 360), the core flow in every variant.
const path = require('path');
const H = require('./helpers');

const MSG = 'Deze naam hoort bij een verwijderde oefening. Kies een andere naam.';
const DATA = {
  custom_exercises: [{ id: 'ex-mijn', name: 'Mijn press', category: 'chest', type: 'weight_reps' }],
  favoriteExercises: { 'bench-press': true, 'ex-mijn': true },
  exerciseInfo: { 'bench-press': { primaryMuscleGroup: 'chest', benchSetting: '3' }, 'ex-mijn': { primaryMuscleGroup: 'chest', trackStrength: true } },
  records: { 'ex-mijn': { weight: 40 } },
  workouts: {
    '2026-10-19': [{ exerciseId: 'bench-press', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }, { exerciseId: 'ex-mijn', sets: [{ weight: 40, reps: 10 }] }],
    '2026-10-20': [{ exerciseId: 'ex-mijn', sets: [{ weight: 42, reps: 8 }] }],
  },
  plans: {
    p: { id: 'p', name: 'Plan', days: [{ id: 'd1', name: 'Maandag', weekday: 0, exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 5 }, { exerciseId: 'ex-mijn', sets: 3, reps: 8 }] }] },
    q: { id: 'q', name: 'Ander plan', days: [{ id: 'd2', name: 'Dag 1', exercises: [{ exerciseId: 'ex-mijn', sets: 2, reps: 10 }] }] },
  },
  activePlan: { planId: 'p', planName: 'Plan', lastDayIndex: -1 },
};

H.run(async () => {
  const out = H.outDir(__filename);
  const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

  for (const theme of H.THEMES) for (const width of H.WIDTHS) {
    const tag = `${theme}-${width}`;
    const full = theme === 'light' && width === 360;
    H.section(tag);
    const { browser, page, errors } = await H.openApp({ width, theme, scale: 2 });
    await H.loadData(page, DATA);
    await page.evaluate(() => {
      // A signed-in user, so permanent verwijderen stores a new schedule version
      // (persistPlan → syncInsightSchedule). Firebase is the no-op stub of helpers.js and the
      // network is blocked, so nothing reaches Firestore.
      currentUser = { uid: 'test' };
      db.scheduleVersions = { '2026-10-01': { effectiveFrom: '2026-10-01', ...scheduleSnapshot() } };
      window.__oldVersions = JSON.stringify(db.scheduleVersions);
      openExerciseList();
    });
    const state = () => page.evaluate(() => ({
      row: document.getElementById('exercises-deleted-row') ? document.getElementById('exercises-deleted-row').textContent.trim() : null,
      toast: document.getElementById('toast-msg').textContent,
    }));

    if (full) H.check('geen rij zonder verwijderde oefeningen', (await state()).row, null);

    // ── 1. Verwijderpop-up: geen vinkje, Verwijderen direct aan te tikken
    await page.evaluate(() => openDeleteExerciseConfirm(allExercises().find(e => e.id === 'bench-press')));
    await H.settle(page);
    const pop = await page.evaluate(() => {
      const p = document.querySelector('#delete-exercise-overlay .overlay-panel');
      return {
        title: document.querySelector('#delete-exercise-overlay h3').textContent,
        msg: document.getElementById('delete-ex-msg').innerText,
        bold: document.querySelector('#delete-ex-msg strong').textContent,
        checkbox: !!document.querySelector('#delete-exercise-overlay input[type=checkbox]'),
        enabled: !document.getElementById('btn-delete-ex-confirm').disabled,
        fits: p.scrollWidth <= p.clientWidth && p.getBoundingClientRect().top >= 0,
      };
    });
    await shot(page, `delete-popup-${tag}`);
    H.check(`${tag} verwijderpop-up`, pop, { title: 'Oefening verwijderen?', msg: 'Weet je zeker dat je Bench press wilt verwijderen? De oefening verdwijnt uit je lijsten. Je trainingsgeschiedenis blijft bewaard, en je kunt hem terugzetten via Verwijderde oefeningen.',
      bold: 'Bench press', checkbox: false, enabled: true, fits: true });
    await page.click('#btn-delete-ex-confirm'); await H.settle(page);
    const afterDel = await state();
    H.check(`${tag} na verwijderen: rij en melding`, afterDel, { row: 'Verwijderde oefeningen (1)', toast: 'Oefening verwijderd' });
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show')); await H.settle(page); // the toast has gone
    await page.evaluate(() => document.getElementById('exercise-list').scrollTo(0, 99999));
    await shot(page, `exercises-row-${tag}`);
    if (full) {
      const rowStyle = await page.evaluate(() => {
        const n = document.querySelector('#exercises-deleted-row .category-item-name');
        const cs = getComputedStyle(n), root = getComputedStyle(document.documentElement);
        const toRgb = v => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
        return { size: cs.fontSize, weight: cs.fontWeight, secondary: cs.color === toRgb(root.getPropertyValue('--text-secondary').trim()),
          ownCard: n.closest('.card') !== document.querySelector('#exercise-list .card') };
      });
      H.check('rij-stijl', rowStyle, { size: '15px', weight: '400', secondary: true, ownCard: true });
      const planAdd = await page.evaluate(() => {
        currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayAddExercises(0);
        const r = !!document.getElementById('exercises-deleted-row'); openExerciseList(); return r;
      });
      H.check('geen rij in keuzescherm plandag', planAdd, false);
    }

    // ── 2. Scherm Verwijderde oefeningen + terugzetten van een ingebouwde oefening
    await page.click('#exercises-deleted-row'); await H.settle(page);
    const scr = await page.evaluate(() => ({
      active: document.getElementById('screen-deleted-exercises').classList.contains('active'),
      rows: [...document.querySelectorAll('.deleted-ex-row')].map(r => [r.querySelector('.deleted-ex-name').textContent, r.querySelector('.deleted-ex-meta').textContent, r.querySelectorAll('.row-icon-btn').length]),
      tap: [...document.querySelectorAll('.row-icon-btn')].map(b => { const r = b.getBoundingClientRect(); return r.width + 'x' + r.height; }),
    }));
    if (full) H.check('scherm met ingebouwde oefening', scr, { active: true, rows: [['Bench press', 'Borst · ingebouwd', 1]], tap: ['48x48'] });
    await page.click('.deleted-ex-restore'); await H.settle(page);
    const afterRestore = await page.evaluate(() => ({
      empty: document.getElementById('deleted-ex-list').innerText.trim(),
      inBorst: exercisesInCategory('chest').some(e => e.id === 'bench-press'),
      sets: db.workouts['2026-10-19'].find(e => e.exerciseId === 'bench-press').sets.length,
      favoriet: isFavoriteExercise('bench-press'), info: getExerciseInfo('bench-press'), pr: getPRSetKeys('bench-press').size > 0,
      rowInList: !!document.getElementById('exercises-deleted-row'),
    }));
    H.check(`${tag} terugzetten`, { ...afterRestore, toast: (await state()).toast }, { empty: 'Geen verwijderde oefeningen', inBorst: true, sets: 2, favoriet: true,
      info: { primaryMuscleGroup: 'chest', benchSetting: '3' }, pr: true, rowInList: false, toast: 'Bench press is teruggezet' });
    await H.settle(page);
    await shot(page, `deleted-empty-${tag}`);

    // ── 3. Twee verwijderd: ingebouwd + eigen; alleen de eigen kan permanent weg
    await page.evaluate(() => {
      for (const id of ['bench-press', 'ex-mijn']) { openDeleteExerciseConfirm(allExercises().find(e => e.id === id)); document.getElementById('btn-delete-ex-confirm').click(); }
      openDeletedExercises();
    });
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show')); await H.settle(page); // the toast has gone
    const two = await page.evaluate(() => [...document.querySelectorAll('.deleted-ex-row')].map(r => [r.querySelector('.deleted-ex-name').textContent, r.querySelector('.deleted-ex-meta').textContent, [...r.querySelectorAll('.row-icon-btn')].map(b => b.getAttribute('aria-label') + ' ' + b.getBoundingClientRect().width + 'x' + b.getBoundingClientRect().height)]));
    H.check(`${tag} twee rijen (ingebouwd zonder Permanent verwijderen)`, two, [['Bench press', 'Borst · ingebouwd', ['Terugzetten 48x48']], ['Mijn press', 'Borst · eigen oefening', ['Terugzetten 48x48', 'Permanent verwijderen 48x48']]]);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.deleted-ex-row')].every(r => r.scrollWidth <= r.clientWidth));
    H.check(`${tag} past in breedte`, fits, true);
    await shot(page, `deleted-screen-${tag}`);

    if (full) {
      // Gone from every list where you pick or browse an exercise …
      const lists = await page.evaluate(() => {
        const vis = allExercises().map(e => e.id);
        const names = () => [...document.querySelectorAll('#exercise-list .exercise-item-name')].map(e => e.textContent.trim());
        showScreen('screen-exercises');
        exerciseBrowserMode = 'categories'; currentBrowseCategory = null; document.getElementById('exercise-search').value = '';
        renderCategoryBrowser(); const cats = [...document.querySelectorAll('#exercise-list .category-item-name')].map(e => e.textContent.trim());
        renderExercisesInCategory('chest'); const chest = names();
        renderExerciseSearchResults('press'); const search = names();
        renderFavoriteExercises(); const favs = document.getElementById('exercise-list').innerText.trim();
        exerciseScreenMode = 'plan-add'; renderExercisesInCategory('chest'); const planAdd = names(); exerciseScreenMode = 'normal';
        const gone = l => !l.includes('Bench press') && !l.includes('Mijn press');
        return { allExercises: !vis.includes('bench-press') && !vis.includes('ex-mijn'), favorietenCategorie: !cats.includes('Favorieten'),
          borst: gone(chest) && chest.length > 0, zoeken: gone(search) && search.length > 0, toevoegenPlandag: gone(planAdd) && planAdd.length > 0,
          favorietenLijst: favs, aiLijst: gone(aiExerciseNameList().split('\n')) };
      });
      H.check('verdwenen uit lijsten', lists, { allExercises: true, favorietenCategorie: true, borst: true, zoeken: true, toevoegenPlandag: true, favorietenLijst: 'Nog geen favorieten', aiLijst: true });

      // … but everything that points at it is kept
      const kept = await page.evaluate(() => ({
        sets: Object.fromEntries(Object.entries(db.workouts).map(([d, w]) => [d, w.map(e => e.exerciseId + ':' + e.sets.length)])),
        favoriet: isFavoriteExercise('bench-press') && isFavoriteExercise('ex-mijn'),
        info: [getExerciseInfo('bench-press'), getExerciseInfo('ex-mijn')],
        namen: [exerciseName('bench-press'), exerciseName('ex-mijn')],
        records: getPRSetKeys('bench-press').size > 0 && getPRSetKeys('ex-mijn').size > 0,
        opgeslagen: [db.custom_exercises.find(e => e.id === 'ex-mijn').deleted, db.hiddenBuiltins['bench-press']],
      }));
      H.check('bewaard: sets, favoriet, Oefeninginfo, records, naam', kept, {
        sets: { '2026-10-19': ['bench-press:2', 'ex-mijn:1'], '2026-10-20': ['ex-mijn:1'] }, favoriet: true,
        info: [{ primaryMuscleGroup: 'chest', benchSetting: '3' }, { primaryMuscleGroup: 'chest', trackStrength: true }],
        namen: ['Bench press', 'Mijn press'], records: true, opgeslagen: [true, true] });

      // The name still shows in the history
      const hist = await page.evaluate(() => {
        currentDate = '2026-10-19'; showScreen('screen-fitness-tracker'); renderHome();
        const tracker = [...document.querySelectorAll('#home-content .exercise-card-name')].map(e => e.textContent.trim());
        openWorkoutDetail('2026-10-19'); const cal = document.getElementById('cal-detail-body').innerText; closeOverlay('cal-detail-overlay');
        openDayRecap(); const recap = document.getElementById('recap-overlay').innerText; closeOverlay('recap-overlay');
        openTraining('ex-mijn'); renderHistoryTab();
        const histTab = { titel: document.getElementById('training-title').textContent, sets: document.getElementById('history-content').textContent };
        showScreen('screen-fitness-tracker');
        return { dagoverzicht: tracker, kalender: cal.includes('Bench press') && cal.includes('Mijn press'), samenvatting: recap.includes('Bench press') && recap.includes('Mijn press'),
          geschiedenis: [histTab.titel, histTab.sets.includes('42') && histTab.sets.includes('40')],
          plandag: db.plans.p.days[0].exercises.map(e => exerciseName(e.exerciseId)) };
      });
      H.check('naam blijft in de geschiedenis', hist, { dagoverzicht: ['Bench press', 'Mijn press'], kalender: true, samenvatting: true, geschiedenis: ['Mijn press', true], plandag: ['Bench press', 'Mijn press'] });

      // A new or renamed exercise can't take a deleted exercise's name (case-insensitive)
      const refuse = await page.evaluate(MSG => {
        const saved = JSON.stringify(db.custom_exercises);
        const toasts = []; const orig = toast; toast = m => { toasts.push(m); };
        showScreen('screen-exercises');
        pendingEditExerciseId = null; setFieldBtnValue('new-ex-category', 'chest');
        document.getElementById('new-ex-name').value = 'bench PRESS'; saveNewExerciseFromScreen();
        document.getElementById('new-ex-name').value = 'Mijn press'; saveNewExerciseFromScreen();
        db.custom_exercises.push({ id: 'ex-ander', name: 'Ander', category: 'chest', type: 'weight_reps' });
        pendingEditExerciseId = 'ex-ander'; document.getElementById('new-ex-name').value = 'Mijn Press'; saveNewExerciseFromScreen();
        const renamed = db.custom_exercises.find(e => e.id === 'ex-ander').name;
        pendingEditExerciseId = null;
        document.getElementById('new-ex-name').value = 'Squat'; saveNewExerciseFromScreen();
        const before = db.custom_exercises.length;
        document.getElementById('new-ex-name').value = 'Nieuwe press'; saveNewExerciseFromScreen();
        const added = db.custom_exercises.length - before;
        toast = orig;
        db.custom_exercises = JSON.parse(saved); // back to the two deleted exercises
        return { toasts, toegevoegd: added, hernoemd: renamed, msgOk: toasts[0] === MSG };
      }, MSG);
      H.check('naam van verwijderde oefening geweigerd', refuse, { toasts: [MSG, MSG, MSG, 'Deze oefening bestaat al', 'Oefening aangemaakt'], toegevoegd: 1, hernoemd: 'Ander', msgOk: true });
      await page.evaluate(() => openDeletedExercises());
      await H.settle(page);
    }

    // ── 4. Permanent verwijderen (eigen oefening), met vinkje
    await page.click('.deleted-ex-purge'); await H.settle(page);
    const pp = await page.evaluate(() => {
      const p = document.querySelector('#purge-exercise-overlay .overlay-panel');
      return { msg: document.getElementById('purge-ex-msg').innerText, title: document.querySelector('#purge-exercise-overlay h3').textContent,
        check: document.querySelector('#purge-exercise-overlay .delete-ex-check-row').innerText.trim(), checked: document.getElementById('purge-ex-confirm-check').checked,
        disabled: document.getElementById('btn-purge-ex-confirm').disabled, fits: p.scrollWidth <= p.clientWidth && p.getBoundingClientRect().top >= 0 };
    });
    await shot(page, `purge-popup-${tag}`);
    H.check(`${tag} pop-up permanent`, pp, { msg: 'Mijn press en alle gelogde sets, records en info worden definitief gewist, en de oefening verdwijnt uit je plannen. Ook je overzichten in Inzicht veranderen daardoor met terugwerkende kracht.',
      title: 'Permanent verwijderen', check: 'Ik begrijp dat dit niet ongedaan kan worden gemaakt.', checked: false, disabled: true, fits: true });
    const blocked = await page.evaluate(() => { document.getElementById('btn-purge-ex-confirm').click(); return { open: document.getElementById('purge-exercise-overlay').classList.contains('open'), exists: !!findExercise('ex-mijn') }; });
    await page.click('#btn-purge-ex-confirm', { force: true }).catch(() => {});
    const blocked2 = await page.evaluate(() => !!findExercise('ex-mijn'));
    H.check(`${tag} zonder vinkje niet aan te tikken`, { ...blocked, tapped: blocked2 }, { open: true, exists: true, tapped: true });
    await page.check('#purge-ex-confirm-check');
    H.check(`${tag} met vinkje aan te tikken`, await page.evaluate(() => !document.getElementById('btn-purge-ex-confirm').disabled), true);
    await page.click('#btn-purge-ex-confirm'); await H.settle(page);
    const p = await page.evaluate(() => ({
      oefening: findExercise('ex-mijn'), custom: db.custom_exercises.length,
      workouts: Object.fromEntries(Object.entries(db.workouts).map(([d, w]) => [d, w.map(e => e.exerciseId)])),
      records: 'ex-mijn' in db.records, info: 'ex-mijn' in db.exerciseInfo, favoriet: isFavoriteExercise('ex-mijn'),
      plannen: Object.values(db.plans).map(pl => pl.days.map(d => d.exercises.map(e => e.exerciseId))),
      versies: Object.keys(db.scheduleVersions).sort(),
      nieuweVersie: db.scheduleVersions['2026-10-22'] && db.scheduleVersions['2026-10-22'].days[0].exercises.map(e => e.exerciseId),
      oudOnveranderd: JSON.stringify({ '2026-10-01': db.scheduleVersions['2026-10-01'] }) === window.__oldVersions,
      oudeVersieHeeftNaam: db.scheduleVersions['2026-10-01'].days[0].exercises.map(e => e.name),
      scherm: [...document.querySelectorAll('.deleted-ex-name')].map(n => n.textContent),
    }));
    H.check(`${tag} permanent verwijderd`, { ...p, toast: (await state()).toast }, {
      oefening: null, custom: 0, workouts: { '2026-10-19': ['bench-press'] }, records: false, info: false, favoriet: false,
      plannen: [[['bench-press']], [[]]], versies: ['2026-10-01', '2026-10-22'], nieuweVersie: ['bench-press'], oudOnveranderd: true,
      oudeVersieHeeftNaam: ['Bench press', 'Mijn press'], scherm: ['Bench press'], toast: 'Mijn press is permanent verwijderd' });

    // ── 5. De naam is weer vrij
    const again = await page.evaluate(() => {
      showScreen('screen-exercises'); pendingEditExerciseId = null; setFieldBtnValue('new-ex-category', 'chest');
      document.getElementById('new-ex-name').value = 'Mijn press'; saveNewExerciseFromScreen();
      return { toast: document.getElementById('toast-msg').textContent, zichtbaar: allExercises().some(e => e.name === 'Mijn press' && e.id !== 'ex-mijn') };
    });
    H.check(`${tag} zelfde naam opnieuw`, again, { toast: 'Oefening aangemaakt', zichtbaar: true });

    // ── 6. De rij verdwijnt als er niets meer verwijderd is
    const last = await page.evaluate(() => { restoreExercise('bench-press'); exerciseBrowserMode = 'categories'; renderCategoryBrowser(); return !!document.getElementById('exercises-deleted-row'); });
    H.check(`${tag} rij weg bij lege lijst`, last, false);

    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

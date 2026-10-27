// Delete confirmations and clear actions in popups (DESIGN_SYSTEM.md "Modals"):
// - every delete asks first; actions without their own popup go through openConfirmDelete()
//   (#confirm-delete-overlay): the Fitness Tracker trash and Verwijderen of a set in Loggen;
// - actions with their own popup (plan day, plan day exercises, plan, category, Reset) open
//   exactly that one popup, never a second one;
// - Wissen in the Notitie popup clears at once, without confirmation, with the toast
//   "Notitie gewist"; an empty note + Opslaan is an error, not a clear;
// - leaving an edited note asks "Wijzigingen weggooien?";
// - a closed popup leaves nothing behind (no open overlay, empty overlay stack).
// Exercise delete/restore/purge is covered elsewhere (exercise-delete tests).
const path = require('path');
const H = require('./helpers');

H.run(async () => {
  const out = H.outDir(__filename);
  const { browser, page, errors } = await H.openApp({ width: 390, height: 844 });
  const settle = (ms = 350) => page.waitForTimeout(ms);
  const isOpen = id => page.evaluate(id => document.getElementById(id).classList.contains('open'), id);
  const openOverlays = () => page.evaluate(() => [...document.querySelectorAll('.overlay.open')].map(o => o.id));
  const text = sel => page.evaluate(sel => document.querySelector(sel).textContent.trim(), sel);
  // Last toast message since the previous call.
  const lastToast = () => page.evaluate(() => { const el = document.getElementById('toast-msg'); const t = el.textContent; el.textContent = ''; return t || '(geen melding)'; });
  const W = () => page.evaluate(() => JSON.parse(JSON.stringify(getWorkout(currentDate))));
  const seed = () => page.evaluate(() => {
    document.querySelectorAll('.overlay.open').forEach(o => closeOverlay(o.id));
    db.workouts = {};
    db.workouts[currentDate] = [
      { exerciseId: 'bench-press', sets: [{ weight: 80, reps: 8, note: 'felt good' }, { weight: 80, reps: 7 }, { weight: 75, reps: 8 }] },
      { exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] },
      { exerciseId: 'bent-over-barbell-row', sets: [{ weight: 60, reps: 10 }] },
    ];
    db.sessionNotes = { [currentDate]: 'great session' };
    showScreen('screen-fitness-tracker'); renderHome();
  });

  H.section('Fitness Tracker — prullenbak in de selectiemodus');
  await seed(); await settle();
  await page.evaluate(() => homeSel.enter(document.querySelectorAll('#home-content .exercise-card')[1]));
  await page.click('#btn-home-sel-delete'); await settle();
  H.check('prullenbak opent de bevestiging', await openOverlays(), ['confirm-delete-overlay']);
  H.check('titel en melding met de naam', [await text('#confirm-delete-title'), await text('#confirm-delete-msg')],
    ['Oefening verwijderen?', '"Squat" verwijderen uit deze workout? Alle sets gaan verloren. Dit kan niet ongedaan worden gemaakt.']);
  H.check('knoppen Annuleren (secundair) · Verwijderen (danger)', await page.evaluate(() => [...document.querySelectorAll('#confirm-delete-overlay .overlay-btns .btn')].map(b => `${b.textContent.trim()} ${b.className}`)),
    ['Annuleren btn btn-secondary', 'Verwijderen btn btn-danger']);
  await page.screenshot({ path: path.join(out, 'confirm-home.png') });
  await page.click('#btn-confirm-delete-cancel'); await settle();
  H.check('Annuleren: dicht, niets verwijderd, selectie blijft', [await openOverlays(), (await W()).length, await page.evaluate(() => homeSel.active && homeSel.items.size)], [[], 3, 1]);
  await page.evaluate(() => homeSel.toggle(document.querySelectorAll('#home-content .exercise-card')[2]));
  await page.click('#btn-home-sel-delete'); await settle();
  H.check('meerdere: titel en melding met alle namen', [await text('#confirm-delete-title'), await text('#confirm-delete-msg')],
    ['Oefeningen verwijderen?', '2 oefeningen ("Squat", "Bent-over barbell row") verwijderen uit deze workout? Alle sets gaan verloren. Dit kan niet ongedaan worden gemaakt.']);
  await lastToast();
  await page.click('#btn-confirm-delete-confirm'); await settle();
  H.check('Verwijderen haalt precies de geselecteerde oefeningen weg', [(await W()).map(e => e.exerciseId), await openOverlays(), await lastToast()], [['bench-press'], [], '2 oefeningen verwijderd']);
  await seed(); await settle();
  await page.evaluate(() => homeSel.enter(document.querySelectorAll('#home-content .exercise-card')[2]));
  await page.click('#btn-home-sel-delete'); await settle(); await page.click('#btn-confirm-delete-confirm'); await settle();
  H.check('één oefening: melding "Oefening verwijderd"', await lastToast(), 'Oefening verwijderd');

  H.section('Loggen — set verwijderen');
  await seed(); await page.evaluate(() => openTraining('bench-press')); await settle();
  H.check('zonder gekozen set heet de knop Wissen', await text('#btn-clear'), 'Wissen');
  await page.locator('#set-list .set-row').nth(1).click(); await settle();
  H.check('een set kiezen maakt er Verwijderen van', await text('#btn-clear'), 'Verwijderen');
  await page.click('#btn-clear'); await settle();
  H.check('Verwijderen vraagt bevestiging', [await openOverlays(), await text('#confirm-delete-title'), await text('#confirm-delete-msg')],
    [['confirm-delete-overlay'], 'Set verwijderen?', 'Set 2 van "Bench press" verwijderen? Dit kan niet ongedaan worden gemaakt.']);
  await page.click('#btn-confirm-delete-cancel'); await settle();
  H.check('Annuleren: set blijft', (await W())[0].sets.length, 3);
  await page.click('#btn-clear'); await settle();
  await page.click('#btn-confirm-delete-confirm'); await settle();
  H.check('Verwijderen haalt precies set 2 weg', [(await W())[0].sets.map(s => s.reps), await lastToast()], [[8, 8], 'Set verwijderd']);
  H.check('daarna weer Wissen', await text('#btn-clear'), 'Wissen');
  await page.click('#btn-clear'); await settle();
  H.check('Wissen (velden leegmaken) vraagt niets', await openOverlays(), []);

  H.section('Notitie — Wissen zonder bevestiging');
  await seed(); await settle();
  await page.evaluate(() => openSetCommentPopup(0, 0)); await settle();
  H.check('opgeslagen notitie opent in bekijkmodus', await page.evaluate(() => [document.getElementById('comment-view-mode').classList.contains('hidden'), document.getElementById('comment-view-text').textContent]), [false, 'felt good']);
  await page.click('#btn-comment-edit');
  H.check('bewerken: Wissen zichtbaar (er is een opgeslagen notitie)', await page.evaluate(() => !document.getElementById('btn-comment-delete').classList.contains('hidden')), true);
  H.check('Wissen in de stijl van Annuleren met rode tekst, over de volle breedte', await page.evaluate(() => document.getElementById('btn-comment-delete').className), 'btn btn-secondary btn-block btn-danger-text');
  await lastToast();
  await page.click('#btn-comment-delete'); await settle();
  H.check('Wissen wist meteen, sluit, meldt "Notitie gewist" — geen bevestiging', [await openOverlays(), (await W())[0].sets[0].note, await lastToast()], [[], undefined, 'Notitie gewist']);
  await page.evaluate(() => openSessionCommentPopup()); await settle();
  await page.click('#btn-comment-edit'); await page.click('#btn-comment-delete'); await settle();
  H.check('sessienotitie: Wissen wist meteen', [await openOverlays(), await page.evaluate(() => getSessionNote(currentDate)), await lastToast()], [[], '', 'Notitie gewist']);
  await page.evaluate(() => openSessionCommentPopup()); await settle();
  H.check('zonder opgeslagen notitie: meteen bewerken, geen Wissen', await page.evaluate(() => [document.getElementById('comment-edit-mode').classList.contains('hidden'), document.getElementById('btn-comment-delete').classList.contains('hidden')]), [false, true]);
  await page.click('#btn-comment-save'); await settle();
  H.check('leeg + Opslaan: rode melding, venster blijft open', [await lastToast(), await page.evaluate(() => document.getElementById('toast').classList.contains('toast-error')), await isOpen('comment-overlay')], ['Vul een notitie in', true, true]);
  await page.fill('#comment-edit-input', 'nieuw'); await page.click('#btn-comment-save'); await settle();
  H.check('Opslaan: "Notitie opgeslagen"', [await page.evaluate(() => getSessionNote(currentDate)), await lastToast(), await openOverlays()], ['nieuw', 'Notitie opgeslagen', []]);

  H.section('Wijzigingen weggooien?');
  await seed(); await settle();
  await page.evaluate(() => openSetCommentPopup(0, 0)); await settle();
  await page.click('#btn-comment-edit'); await page.fill('#comment-edit-input', 'gewijzigd');
  await page.click('#btn-comment-cancel'); await settle();
  H.check('Annuleren met een wijziging opent de waarschuwing', [await isOpen('discard-changes-overlay'), await text('#discard-changes-overlay h3'), await text('#discard-changes-overlay .cat-delete-msg'), await text('#btn-discard-changes-cancel'), await text('#btn-discard-changes-confirm')],
    [true, 'Wijzigingen weggooien?', 'Je hebt niet-opgeslagen wijzigingen. Als je teruggaat, gaan ze verloren.', 'Verder bewerken', 'Weggooien']);
  await page.screenshot({ path: path.join(out, 'discard.png') });
  await page.click('#btn-discard-changes-cancel'); await settle();
  H.check('Verder bewerken: terug in het formulier, wijziging intact', [await isOpen('discard-changes-overlay'), await isOpen('comment-overlay'), await page.inputValue('#comment-edit-input')], [false, true, 'gewijzigd']);
  await page.click('#btn-comment-cancel'); await settle();
  await page.click('#btn-discard-changes-confirm'); await settle();
  H.check('Weggooien: wijziging weg, opgeslagen notitie onaangeroerd', [await isOpen('discard-changes-overlay'), (await W())[0].sets[0].note], [false, 'felt good']);
  await page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => closeOverlay(o.id)));

  H.section('Eigen bevestigingen — precies één pop-up');
  await page.evaluate(() => {
    db.plans = {
      p1: { id: 'p1', name: 'PPL', createdAt: 2, scheduleConfirmed: true, days: [{ name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 10 }, { exerciseId: 'squat', sets: 3, reps: 10 }] }, { name: 'Pull', exercises: [] }] },
      p2: { id: 'p2', name: 'Weg', createdAt: 1, days: [] },
    };
    openPlanDetail('p1'); planDetailEditMode = true; renderPlanDetail();
  }); await settle();
  await page.locator('.plan-day-delete-btn').nth(1).click(); await settle();
  H.check('plandag 🗑: alleen de eigen bevestiging', [await openOverlays(), await text('#delete-plan-day-msg')], [['delete-plan-day-overlay'], '"Pull" verwijderen? Dit kan niet ongedaan worden gemaakt.']);
  await page.click('#btn-delete-plan-day-confirm'); await settle();
  H.check('plandag: na één bevestiging weg', [await page.evaluate(() => currentPlanData.days.map(d => d.name)), await openOverlays()], [['Push'], []]);
  await page.evaluate(() => { planDetailEditMode = false; openPlanDayEdit(0); pdeSel.enter(document.querySelectorAll('#pde-list .pde-item')[1]); });
  await page.click('#btn-pde-sel-delete'); await settle();
  H.check('oefening in plandag: alleen de eigen bevestiging', [await openOverlays(), await text('#delete-pde-exercise-msg')], [['delete-pde-exercise-overlay'], 'Weet je zeker dat je "Squat" wilt verwijderen uit deze dag?']);
  await page.click('#btn-delete-pde-exercise-confirm'); await settle();
  H.check('oefening in plandag: na één bevestiging weg', [await page.evaluate(() => currentPlanData.days[0].exercises.map(e => e.exerciseId)), await openOverlays(), await lastToast()], [['bench-press'], [], 'Verwijderd uit plan']);
  await page.evaluate(() => { showScreen('screen-workout-plan'); renderPlanList(); openDeletePlanConfirm('p2', 'Weg'); }); await settle();
  H.check('plan (⋮ Verwijderen): alleen de eigen bevestiging', await openOverlays(), ['delete-plan-overlay']);
  await page.click('#btn-delete-plan-confirm'); await settle();
  H.check('plan: na één bevestiging weg', [await page.evaluate(() => !!db.plans.p2), await openOverlays(), await lastToast()], [false, [], 'Plan verwijderd']);

  H.section('Categorie verwijderen');
  await page.evaluate(() => { db.categories = { names: {}, custom: [{ id: 'custom-1', name: 'Eigen' }], deleted: [] }; exerciseScreenMode = 'browse'; showScreen('screen-exercises'); renderCategoryBrowser(); deleteCategory(allCategories().find(c => c.id === 'custom-1')); }); await settle();
  H.check('lege categorie: "Categorie verwijderen?"', [await openOverlays(), await text('#cat-delete-title'), await text('#cat-delete-msg'), await text('#btn-cat-delete-cancel'), await text('#btn-cat-delete-confirm')],
    [['cat-delete-overlay'], 'Categorie verwijderen?', '"Eigen" verwijderen?', 'Annuleren', 'Verwijderen']);
  await page.click('#btn-cat-delete-cancel'); await settle();
  H.check('Annuleren verwijdert niets', await page.evaluate(() => allCategories().some(c => c.id === 'custom-1')), true);
  await page.evaluate(() => deleteCategory(allCategories().find(c => c.id === 'custom-1'))); await settle();
  await page.click('#btn-cat-delete-confirm'); await settle();
  H.check('Verwijderen: categorie weg, "Categorie verwijderd"', [await page.evaluate(() => allCategories().some(c => c.id === 'custom-1')), await openOverlays(), await lastToast()], [false, [], 'Categorie verwijderd']);
  await page.evaluate(() => deleteCategory(allCategories().find(c => c.id === 'arms'))); await settle();
  const notEmpty = await page.evaluate(() => ({ title: document.getElementById('cat-delete-title').textContent, msg: document.getElementById('cat-delete-msg').textContent, cancelHidden: document.getElementById('btn-cat-delete-cancel').classList.contains('hidden'), btn: document.getElementById('btn-cat-delete-confirm').textContent, cls: document.getElementById('btn-cat-delete-confirm').className }));
  H.ok(notEmpty.title === 'Categorie niet leeg' && /^"Armen" bevat nog \d+ oefeningen\. Een categorie kan pas worden verwijderd als hij leeg is/.test(notEmpty.msg) && notEmpty.cancelHidden && notEmpty.btn === 'Sluiten' && /btn-primary/.test(notEmpty.cls) && !/btn-danger/.test(notEmpty.cls), 'categorie met oefeningen: "Categorie niet leeg" met alleen Sluiten', notEmpty);
  await page.click('#btn-cat-delete-confirm'); await settle();
  H.check('Sluiten verwijdert niets', [await page.evaluate(() => allCategories().some(c => c.id === 'arms')), await openOverlays()], [true, []]);

  H.section('Alles resetten (nooit echt uitgevoerd)');
  await page.evaluate(() => { currentUser = { uid: 'fake' }; openResetOverlay(); }); await settle();
  H.check('teksten', [await openOverlays(), await text('#reset-overlay h3'), (await text('#reset-overlay .cat-delete-msg')).startsWith('Dit verwijdert permanent alle gegevens'), await page.evaluate(() => document.querySelectorAll('#reset-overlay .cat-delete-msg')[1].textContent), await page.getAttribute('#reset-confirm-input', 'placeholder'), await text('#btn-reset-cancel'), await text('#reset-confirm-label')],
    [['reset-overlay'], 'Terugzetten naar standaard?', true, 'Typ hieronder RESET om te bevestigen.', 'Typ RESET', 'Annuleren', 'Resetten']);
  H.check('Resetten uit zolang leeg', await page.isDisabled('#btn-reset-confirm'), true);
  await page.fill('#reset-confirm-input', 'reset');
  H.check('"reset" in kleine letters telt niet', await page.isDisabled('#btn-reset-confirm'), true);
  await page.fill('#reset-confirm-input', 'RESET');
  H.check('precies "RESET" zet de knop aan', await page.isDisabled('#btn-reset-confirm'), false);
  await page.click('#btn-reset-cancel'); await settle();
  H.check('Annuleren sluit', await isOpen('reset-overlay'), false);
  await page.evaluate(() => openResetOverlay()); await settle();
  await page.fill('#reset-confirm-input', 'RESET');
  await page.evaluate(() => { currentUser = null; });
  await page.click('#btn-reset-confirm'); await settle();
  H.check('niet ingelogd: niets gewist, melding, pop-up blijft', [await text('#reset-error'), await isOpen('reset-overlay')], ['Je bent niet ingelogd.', true]);
  await page.evaluate(() => setResetBusy(true));
  H.check('bezig-label', await text('#reset-confirm-label'), 'Bezig met resetten...');
  await page.evaluate(() => { setResetBusy(false); closeOverlay('reset-overlay'); });
  H.check('label terug na bezig', await text('#reset-confirm-label'), 'Resetten');

  H.section('Pop-ups sluiten zonder resten');
  await seed(); await settle();
  const popups = [
    { label: 'Nieuw plan (Annuleren)', screen: () => { showScreen('screen-workout-plan'); renderPlanList(); }, open: () => openOverlay('new-plan-overlay'), close: ['#btn-new-plan-cancel'] },
    { label: 'Notitie (Klaar)', screen: () => { showScreen('screen-fitness-tracker'); renderHome(); }, open: () => openSetCommentPopup(0, 0), close: ['#btn-comment-done'] },
    { label: 'Bevestiging (Annuleren)', screen: () => {}, open: () => openConfirmDelete({ title: 'T', message: 'M', onConfirm: () => {} }), close: ['#btn-confirm-delete-cancel'] },
    { label: 'Bevestiging op Notitie (gestapeld)', screen: () => {}, open: () => { openSetCommentPopup(0, 0); openConfirmDelete({ title: 'T', message: 'M', onConfirm: () => {} }); }, close: ['#btn-confirm-delete-cancel', '#btn-comment-done'] },
    { label: 'Naam wijzigen (Annuleren)', screen: () => openPlanDetail('p1'), open: () => openPlanRename(), close: ['#btn-plan-rename-cancel'] },
    { label: 'Sets & reps (Annuleren)', screen: () => openPlanDayEdit(0), open: () => openPdeSetsRepsEdit(0), close: ['#btn-pde-sr-cancel'] },
    { label: 'Nieuw plan (tik buiten de sheet)', screen: () => { showScreen('screen-workout-plan'); renderPlanList(); }, open: () => openOverlay('new-plan-overlay'), close: ['BACKDROP'] },
    { label: 'Naam wijzigen (terugknop)', screen: () => openPlanDetail('p1'), open: () => openPlanRename(), close: ['BACK'] },
  ];
  for (const p of popups) {
    await page.evaluate(p.screen); await settle();
    await page.evaluate(p.open); await settle(450);
    const opened = (await openOverlays()).length;
    for (const sel of p.close) {
      if (sel === 'BACKDROP') await page.mouse.click(195, 60);
      else if (sel === 'BACK') await page.evaluate(() => history.back());
      else await page.click(sel);
      await settle(450);
    }
    const left = await page.evaluate(() => ({
      open: [...document.querySelectorAll('.overlay.open')].map(o => o.id),
      stack: overlayStack.length,
      visible: [...document.querySelectorAll('.overlay')].filter(o => getComputedStyle(o).opacity !== '0').map(o => o.id),
    }));
    H.check(`${p.label}: geopend, daarna niets meer open, zichtbaar of op de stapel`, [opened >= 1, left], [true, { open: [], stack: 0, visible: [] }]);
  }

  H.check('geen JS-fouten', errors, []);
  await browser.close();
});

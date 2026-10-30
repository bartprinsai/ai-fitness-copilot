// Subcategorieën: opslag (meta/categories → subcategories, oefening → subcategory), het veld
// Subcategorie in Nieuwe oefening / Oefening bewerken (vergrendeld zonder categorie, keuzelijst,
// + met de pop-up Nieuwe subcategorie), het voorvoegsel "<subcategorie> - " in Naam, en de
// gegroepeerde lijst per categorie (Alle oefeningen, ook vanuit een plandag), zoeken, favoriet.
// See PROJECT_CONTEXT.md ("Categorieën en spiergroepen" → Subcategorieën) and DESIGN_SYSTEM.md
// ("Exercise-formulier" → Subcategorie, "All Exercises-scherm" → Groepen in een categorie).
const path = require('path');
const H = require('./helpers');

const DATA = {
  categories: { subcategories: [
    { id: 'sub-pd', name: 'Pulldown', category: 'back' },
    { id: 'sub-row', name: 'Row', category: 'back' },
    { id: 'sub-leeg', name: 'Aaa leeg', category: 'back' },
    { id: 'sub-fly', name: 'Fly', category: 'chest' },
  ] },
  custom_exercises: [
    { id: 'ex-pd2', name: 'Pulldown - Wide grip', category: 'back', type: 'weight_reps', subcategory: 'sub-pd' },
    { id: 'ex-pd1', name: 'Pulldown - Close grip', category: 'back', type: 'weight_reps', subcategory: 'sub-pd' },
    { id: 'ex-row1', name: 'Row - Cable', category: 'back', type: 'weight_reps', subcategory: 'sub-row' },
    // a subcategory of another category counts as loose
    { id: 'ex-odd', name: 'Odd one', category: 'back', type: 'weight_reps', subcategory: 'sub-fly' },
    { id: 'ex-gone', name: 'Pulldown - Weg', category: 'back', type: 'weight_reps', subcategory: 'sub-pd', deleted: true },
  ],
};

H.run(async () => {
  const out = H.outDir(__filename);
  const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

  for (const theme of H.THEMES) for (const width of H.WIDTHS) {
    const tag = `${theme}-${width}`;
    H.section(tag);
    const { browser, page, errors } = await H.openApp({ width, theme, scale: 2 });
    await H.loadData(page, DATA);
    const click = async sel => { await page.click(sel); await H.settle(page); };
    const pick = async value => click(`#field-picker-list [data-value="${value}"]`);
    const form = () => page.evaluate(() => {
      const f = document.getElementById('new-ex-subcategory'), add = document.getElementById('btn-new-ex-add-subcat');
      const cs = getComputedStyle(f);
      return {
        name: document.getElementById('new-ex-name').value,
        sub: f.dataset.value || '', text: f.textContent.trim(),
        locked: f.disabled && add.disabled && f.classList.contains('new-ex-locked'),
        lockIcons: f.querySelectorAll('.new-ex-lock-icon').length + add.querySelectorAll('.new-ex-lock-icon').length,
        dashed: cs.borderTopStyle === 'dashed' && getComputedStyle(add).borderTopStyle === 'dashed',
        chevron: getComputedStyle(f, '::after').display !== 'none',
        plus: add.textContent.trim(),
      };
    });

    // ── 1. Nieuwe oefening: vergrendeld zonder categorie
    await page.evaluate(() => { openExerciseList(); openNewExerciseScreen(); });
    await H.settle(page);
    const order = await page.evaluate(() => [...document.querySelectorAll('#screen-new-exercise .new-ex-section > .section-label')].slice(0, 4).map(l => l.textContent));
    H.check(`${tag} volgorde velden`, order, ['Naam', 'Categorie', 'Subcategorie', 'Type']);
    H.check(`${tag} vergrendeld`, await form(), { name: '', sub: '', text: 'Kies eerst een categorie', locked: true, lockIcons: 2, dashed: true, chevron: false, plus: '' });
    await shot(page, `form-locked-${tag}`);
    await page.click('#new-ex-subcategory', { force: true }); await H.settle(page);
    H.check(`${tag} vergrendeld veld opent niets`, await page.evaluate(() => document.getElementById('field-picker-overlay').classList.contains('open')), false);

    // ── 2. Categorie kiezen → actief, Geen subcategorie, alleen subcategorieën van die categorie
    await click('#new-ex-category'); await pick('back');
    H.check(`${tag} actief na categorie`, await form(), { name: '', sub: '', text: 'Geen subcategorie', locked: false, lockIcons: 0, dashed: false, chevron: true, plus: '+' });
    await shot(page, `form-active-${tag}`);
    await click('#new-ex-subcategory');
    H.check(`${tag} keuzelijst Rug`, await page.evaluate(() => [...document.querySelectorAll('#field-picker-list .field-picker-label')].map(l => l.textContent)),
      ['Geen subcategorie', 'Aaa leeg', 'Pulldown', 'Row']);
    await shot(page, `picker-${tag}`);

    // ── 3. Voorvoegsel in Naam
    await pick('sub-pd');
    const f1 = await form();
    const caret = await page.evaluate(() => { const i = document.getElementById('new-ex-name'); return { focus: document.activeElement === i, pos: i.selectionStart, len: i.value.length }; });
    H.check(`${tag} lege naam krijgt voorvoegsel, cursor erachter`, { name: f1.name, sub: f1.sub, focus: caret.focus, atEnd: caret.pos === caret.len }, { name: 'Pulldown - ', sub: 'sub-pd', focus: true, atEnd: true });
    await page.keyboard.type('Neutral grip');
    await click('#new-ex-subcategory'); await pick('sub-row');
    H.check(`${tag} wisselen vervangt voorvoegsel`, (await form()).name, 'Row - Neutral grip');
    await click('#new-ex-subcategory'); await pick('sub-row');
    H.check(`${tag} al juist voorvoegsel: niets`, (await form()).name, 'Row - Neutral grip');
    await click('#new-ex-subcategory'); await pick('');
    H.check(`${tag} Geen subcategorie haalt voorvoegsel weg`, (await form()).name, 'Neutral grip');
    await click('#new-ex-subcategory'); await pick('sub-pd');
    H.check(`${tag} bestaande tekst: voorvoegsel ervoor`, (await form()).name, 'Pulldown - Neutral grip');
    await page.fill('#new-ex-name', 'pulldown - Iets');
    await click('#new-ex-subcategory'); await pick('sub-pd');
    H.check(`${tag} voorvoegsel hoofdletterongevoelig herkend`, (await form()).name, 'pulldown - Iets');
    await page.fill('#new-ex-name', 'Pulldown - Neutral grip');
    await click('#new-ex-category'); await pick('chest');
    const f2 = await form();
    H.check(`${tag} categoriewissel: terug naar Geen, voorvoegsel weg`, { name: f2.name, sub: f2.sub, text: f2.text }, { name: 'Neutral grip', sub: '', text: 'Geen subcategorie' });
    await click('#new-ex-category'); await pick('chest');
    H.check(`${tag} zelfde categorie opnieuw: niets`, (await form()).text, 'Geen subcategorie');

    // ── 4. + : nieuwe subcategorie onder de gekozen categorie
    await click('#new-ex-category'); await pick('back');
    await click('#btn-new-ex-add-subcat');
    const pop = await page.evaluate(() => ({ title: document.querySelector('#new-subcategory-overlay h3').textContent, ph: document.getElementById('new-subcategory-input').placeholder,
      btns: [...document.querySelectorAll('#new-subcategory-overlay .btn')].map(b => b.className + ':' + b.textContent) }));
    H.check(`${tag} pop-up Nieuwe subcategorie`, pop, { title: 'Nieuwe subcategorie', ph: 'Naam subcategorie', btns: ['btn btn-secondary:Annuleren', 'btn btn-primary:Opslaan'] });
    await shot(page, `new-sub-popup-${tag}`);
    await page.fill('#new-subcategory-input', 'row');
    await click('#btn-new-subcategory-save');
    H.check(`${tag} dubbele naam geweigerd`, await page.evaluate(() => ({ toast: document.getElementById('toast-msg').textContent, open: document.getElementById('new-subcategory-overlay').classList.contains('open') })),
      { toast: 'Deze subcategorie bestaat al', open: true });
    await page.fill('#new-subcategory-input', ' T-bar ');
    await click('#btn-new-subcategory-save');
    const made = await page.evaluate(() => { const s = db.categories.subcategories.find(s => s.name === 'T-bar'); return s && { category: s.category, idOk: /^sub-/.test(s.id), selected: getFieldBtnValue('new-ex-subcategory') === s.id }; });
    H.check(`${tag} nieuwe subcategorie opgeslagen en gekozen`, { made, name: (await form()).name, text: (await form()).text }, { made: { category: 'back', idOk: true, selected: true }, name: 'T-bar - Neutral grip', text: 'T-bar' });

    // ── 5. Opslaan
    await page.fill('#new-ex-name', 'T-bar - ');
    await click('#btn-new-ex-save');
    H.check(`${tag} alleen voorvoegsel = geen naam`, await page.evaluate(() => document.getElementById('toast-msg').textContent), 'Vul een naam in');
    await page.fill('#new-ex-name', 'T-bar - Chest supported');
    await click('#btn-new-ex-save');
    const saved = await page.evaluate(() => { const e = db.custom_exercises.find(e => e.name === 'T-bar - Chest supported'); const s = db.categories.subcategories.find(s => s.name === 'T-bar'); return { cat: e.category, sub: e.subcategory === s.id }; });
    H.check(`${tag} opgeslagen met subcategorie`, saved, { cat: 'back', sub: true });
    await page.evaluate(() => { openNewExerciseScreen(); });
    await H.settle(page);
    await click('#new-ex-category'); await pick('back');
    await page.fill('#new-ex-name', 'Zonder sub');
    await click('#btn-new-ex-save');
    H.check(`${tag} zonder subcategorie: geen veld`, await page.evaluate(() => 'subcategory' in db.custom_exercises.find(e => e.name === 'Zonder sub')), false);

    // ── 6. Oefening bewerken
    await page.evaluate(() => openEditExerciseScreen(allExercises().find(e => e.id === 'ex-pd1')));
    await H.settle(page);
    H.check(`${tag} bewerken: veld ingevuld, naam ongewijzigd`, await form(), { name: 'Pulldown - Close grip', sub: 'sub-pd', text: 'Pulldown', locked: false, lockIcons: 0, dashed: false, chevron: true, plus: '+' });
    await click('#new-ex-subcategory'); await pick('sub-row');
    H.check(`${tag} bewerken: wisselen`, (await form()).name, 'Row - Close grip');
    await click('#btn-new-ex-save');
    H.check(`${tag} bewerken opgeslagen`, await page.evaluate(() => { const e = db.custom_exercises.find(e => e.id === 'ex-pd1'); return [e.name, e.subcategory]; }), ['Row - Close grip', 'sub-row']);
    await page.evaluate(() => openEditExerciseScreen(allExercises().find(e => e.id === 'ex-odd')));
    await H.settle(page);
    H.check(`${tag} subcategorie van andere categorie toont Geen`, (await form()).text, 'Geen subcategorie');
    await page.evaluate(() => openEditExerciseScreen(allExercises().find(e => e.id === 'lat-pulldown')));
    await H.settle(page);
    await click('#new-ex-subcategory'); await pick('sub-pd');
    await click('#btn-new-ex-save');
    H.check(`${tag} ingebouwde oefening: id blijft, subcategorie gezet`, await page.evaluate(() => { const e = allExercises().find(e => e.id === 'lat-pulldown'); return [e.name, e.subcategory, EXERCISE_DB.find(b => b.id === 'lat-pulldown').subcategory]; }),
      ['Pulldown - Lat pulldown', 'sub-pd', undefined]);
    await page.evaluate(() => openEditExerciseScreen(allExercises().find(e => e.id === 'ex-row1')));
    await H.settle(page);
    await click('#new-ex-subcategory'); await pick('');
    await click('#btn-new-ex-save');
    H.check(`${tag} bewerken naar Geen: veld weg`, await page.evaluate(() => { const e = db.custom_exercises.find(e => e.id === 'ex-row1'); return [e.name, 'subcategory' in e]; }), ['Cable', false]);

    // ── 7. Lijst per categorie: groepen
    const groups = () => page.evaluate(() => [...document.querySelectorAll('#exercise-list .ex-group')].map(g => ({
      name: g.querySelector('.ex-group-name').textContent, count: g.querySelector('.ex-group-count').textContent,
      open: g.querySelector('.ex-group-head').getAttribute('aria-expanded') === 'true' && !g.querySelector('.ex-group-body').classList.contains('hidden'),
      items: [...g.querySelectorAll('.exercise-item-name')].map(n => n.textContent),
    })));
    const openBack = () => page.evaluate(() => { openExerciseList(); enterExerciseBrowseCategory('back', categoryName('back'), () => renderExercisesInCategory('back')); });
    await openBack(); await H.settle(page);
    const g1 = await groups();
    const loose = await page.evaluate(() => sortByName(exercisesInCategory('back').filter(e => !exerciseSubcategory(e))).map(e => e.name));
    H.check(`${tag} groepen: volgorde, aantallen, dicht`, g1.map(g => [g.name, g.count, g.open]),
      [['Losse oefeningen', String(loose.length), false], ['Pulldown', '2', false], ['Row', '1', false], ['T-bar', '1', false]]);
    H.check(`${tag} groepen: volledige namen op alfabet`, g1.slice(1).map(g => g.items), [['Pulldown - Lat pulldown', 'Pulldown - Wide grip'], ['Row - Close grip'], ['T-bar - Chest supported']]);
    H.check(`${tag} Losse oefeningen op alfabet`, g1[0].items, loose);
    H.ok(loose.includes('Odd one') && loose.includes('Cable') && !loose.includes('Lat pulldown'), `${tag} los: andere-categorie-sub en Geen; niet de ingedeelde`);
    H.ok(!g1.some(g => g.items.includes('Pulldown - Weg')), `${tag} verwijderde oefening niet in de groep`);
    await shot(page, `list-closed-${tag}`);
    await click('#exercise-list .ex-group:nth-child(2) .ex-group-head');
    const geo = await page.evaluate(() => {
      const card = document.querySelector('#exercise-list .list-card').getBoundingClientRect();
      const head = document.querySelector('#exercise-list .ex-group:nth-child(2) .ex-group-name').getBoundingClientRect();
      const item = document.querySelector('#exercise-list .ex-group:nth-child(2) .exercise-item-name').getBoundingClientRect();
      const chev = getComputedStyle(document.querySelector('#exercise-list .ex-group:nth-child(2) .ex-group-chevron')).transform;
      const closed = getComputedStyle(document.querySelector('#exercise-list .ex-group:nth-child(1) .ex-group-chevron')).transform;
      const badge = document.querySelector('#exercise-list .ex-group:nth-child(2) .ex-group-count').getBoundingClientRect();
      return { indented: Math.round(item.left - card.left), nameLeft: Math.round(head.left - card.left), badgeRight: Math.round(card.right - badge.right),
        bold: getComputedStyle(document.querySelector('.ex-group-name')).fontWeight, rotated: chev !== 'none' && chev !== closed };
    });
    H.check(`${tag} open: ingesprongen, vet, chevron omlaag, label rechts`, geo, { indented: geo.nameLeft, nameLeft: 16 + 20 + 12, badgeRight: 16, bold: '700', rotated: true });
    const g2 = await groups();
    H.check(`${tag} tik opent alleen die groep`, g2.map(g => g.open), [false, true, false, false]);
    await shot(page, `list-open-${tag}`);
    // a re-render of the same category (favorite) keeps the open group
    await page.evaluate(() => { toggleFavoriteExercise('ex-pd2'); refreshExerciseList(); });
    H.check(`${tag} favoriet: groep blijft open`, (await groups()).map(g => g.open), [false, true, false, false]);
    await click('#exercise-list .ex-group:nth-child(2) .ex-group-head');
    H.check(`${tag} tik klapt dicht`, (await groups()).map(g => g.open), [false, false, false, false]);
    await click('#exercise-list .ex-group:nth-child(3) .ex-group-head');
    await page.evaluate(() => { resetExerciseBrowseToCategories(); }); await openBack(); await H.settle(page);
    H.check(`${tag} opnieuw openen: alles dicht`, (await groups()).map(g => g.open), [false, false, false, false]);
    // A category without subcategories: just Losse oefeningen
    await page.evaluate(() => enterExerciseBrowseCategory('arms', 'Armen', () => renderExercisesInCategory('arms'))); await H.settle(page);
    H.check(`${tag} Armen: alleen Losse oefeningen`, (await groups()).map(g => [g.name, g.count]), [['Losse oefeningen', String(await page.evaluate(() => exercisesInCategory('arms').length))]]);

    // ── 8. Zoeken: plat, ook op subcategorie
    const search = q => page.evaluate(q => { const i = document.getElementById('exercise-search'); i.value = q; i.dispatchEvent(new Event('input')); return { groups: document.querySelectorAll('#exercise-list .ex-group').length, names: [...document.querySelectorAll('#exercise-list .exercise-item-name')].map(n => n.textContent) }; }, q);
    H.check(`${tag} zoeken op subcategorie`, await search('t-bar'), { groups: 0, names: ['T-bar row', 'T-bar - Chest supported'] });
    await search('');
    H.check(`${tag} zoekveld leeg: weer groepen`, (await groups()).length, 1);

    // ── 9. Vanuit een plandag: dezelfde groepen, + werkt in een groep
    await page.evaluate(() => {
      db.plans = { p: { id: 'p', name: 'Plan', days: [{ id: 'd', name: 'Pull', exercises: [] }] } };
      currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0); openPlanDayAddExercises(0);
      enterExerciseBrowseCategory('back', 'Rug', () => renderExercisesInCategory('back'));
    });
    await H.settle(page);
    H.check(`${tag} plandag: groepen dicht`, (await groups()).map(g => [g.name, g.open]), [['Losse oefeningen', false], ['Pulldown', false], ['Row', false], ['T-bar', false]]);
    await click('#exercise-list .ex-group:nth-child(2) .ex-group-head');
    await click('#exercise-list .ex-group:nth-child(2) .exercise-item:first-child .ex-add-btn');
    await click('#btn-pde-sr-save');
    const added = await page.evaluate(() => ({ day: currentPlanData.days[0].exercises.map(e => e.exerciseId), done: !!document.querySelector('#exercise-list .ex-group:nth-child(2) .exercise-item:first-child .ex-add-btn-done'),
      open: document.querySelector('#exercise-list .ex-group:nth-child(2) .ex-group-head').getAttribute('aria-expanded') }));
    H.check(`${tag} plandag: toegevoegd, groep blijft open`, added, { day: ['lat-pulldown'], done: true, open: 'true' });
    await shot(page, `plan-add-${tag}`);

    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

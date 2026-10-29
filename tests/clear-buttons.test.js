// Wissen (clear) buttons in the note, set-note, sleep and weight pop-ups: when they show, what they do, one style;
// empty Opslaan never clears; the set-note placeholder.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const DATE = '2026-10-22';
const data = (note, sessionNote) => ({
  custom_exercises: [{ id: 'bench', name: 'Bench press', category: 'chest' }],
  workouts: { [DATE]: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, ...(note ? { note } : {}) }, { weight: 100, reps: 5 }] }] },
  sessionNotes: sessionNote ? { [DATE]: sessionNote } : {},
  scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {},
});
async function setup(page, d, theme = 'light') {
  await H.loadData(page, d, theme);
  await page.evaluate(DATE => { currentDate = DATE; showScreen('screen-fitness-tracker'); renderHome(); }, DATE);
  await H.settle(page);
}
const vis = (page, sel) => page.isVisible(sel);
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains('open'), id);
const toastState = page => page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('toast').classList.contains('toast-error')]);
// order of visible buttons in a panel, top to bottom / left to right
const buttons = (page, panelSel) => page.evaluate(sel => [...document.querySelectorAll(sel + ' button')].filter(b => b.offsetParent).map(b => {
  const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), top: Math.round(r.top), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
}), panelSel);
const style = (page, id) => page.evaluate(id => { const s = getComputedStyle(document.getElementById(id)); return [s.color, s.backgroundColor, s.borderTopColor, s.height]; }, id);

// Wissen in every pop-up: session note, set note (day overview and Loggen), sleep and weight sheets.
async function clearButtons(page) {
  await page.setViewportSize({ width: 360, height: 760 });

  // --- Session note (Notitie pill): new → edit mode without Wissen
  await setup(page, data());
  await page.evaluate(() => openSessionCommentPopup()); await H.settle(page);
  check('nieuwe sessienotitie: geen Wissen', [await vis(page, '#btn-comment-delete'), (await buttons(page, '#comment-edit-mode')).map(b => b.t)], [false, ['Annuleren', 'Opslaan']]);
  await page.click('#btn-comment-save'); await H.settle(page);
  check('leeg opslaan → "Vul een notitie in", blijft open', [await toastState(page), await isOpen(page, 'comment-overlay')], [['Vul een notitie in', true], true]);
  await page.fill('#comment-edit-input', 'Goede sessie');
  await page.click('#btn-comment-save'); await H.settle(page);
  check('opgeslagen', [await page.evaluate(d => getSessionNote(d), DATE), (await toastState(page))[0], await isOpen(page, 'comment-overlay')], ['Goede sessie', 'Notitie opgeslagen', false]);
  // existing: view mode → Bewerken → Wissen on top
  await page.evaluate(() => openSessionCommentPopup()); await H.settle(page);
  check('bestaand: view-modus Sluiten · Bewerken', (await buttons(page, '#comment-view-mode')).map(b => b.t), ['Sluiten', 'Bewerken']);
  await page.click('#btn-comment-edit');
  const eb = await buttons(page, '#comment-edit-mode');
  check('bestaand: Wissen volle breedte boven Annuleren · Opslaan', [eb.map(b => b.t), eb[0].top < eb[1].top, eb[1].top === eb[2].top, eb[0].w === eb[2].r - eb[1].l], [['Wissen', 'Annuleren', 'Opslaan'], true, true, true]);
  await page.click('#btn-comment-delete'); await H.settle(page);
  check('Wissen sessienotitie: meteen, dicht, melding, geen bevestiging', [await page.evaluate(d => getSessionNote(d) || '', DATE), await toastState(page), await isOpen(page, 'comment-overlay'), await isOpen(page, 'confirm-delete-overlay')],
    ['', ['Notitie gewist', false], false, false]);

  // --- Set note via the comment popup (Fitness Tracker day overview)
  await setup(page, data('Zwaar'));
  await page.click('#home-content .set-comment.has-note'); await H.settle(page);
  await page.click('#btn-comment-edit');
  check('setnotitie (dagoverzicht): Wissen zichtbaar', await vis(page, '#btn-comment-delete'), true);
  await page.fill('#comment-edit-input', '');
  await page.click('#btn-comment-save'); await H.settle(page);
  check('leeggemaakt + Opslaan wist niet', [await page.evaluate(d => db.workouts[d][0].sets[0].note, DATE), await toastState(page)], ['Zwaar', ['Vul een notitie in', true]]);
  await page.click('#btn-comment-delete'); await H.settle(page);
  check('Wissen setnotitie', [await page.evaluate(d => db.workouts[d][0].sets[0].note ?? null, DATE), (await toastState(page))[0], await isOpen(page, 'comment-overlay')], [null, 'Notitie gewist', false]);
  check('comment-icoon weg na wissen', await page.evaluate(() => document.querySelectorAll('#home-content .set-comment.has-note').length), 0);

  // --- Set note in Loggen (#set-note-overlay)
  await setup(page, data('Techniek'));
  await page.evaluate(() => openTraining('bench')); await H.settle(page);
  await page.evaluate(() => openSetNote(1)); await H.settle(page);
  check('Loggen-setnotitie nieuw: geen Wissen', [(await buttons(page, '#set-note-overlay')).map(b => b.t)], [['Annuleren', 'Opslaan']]);
  await page.click('#btn-set-note-save'); await H.settle(page);
  check('Loggen leeg opslaan → fout', [await toastState(page), await isOpen(page, 'set-note-overlay')], [['Vul een notitie in', true], true]);
  await page.evaluate(() => closeOverlay('set-note-overlay')); await H.settle(page);
  await page.evaluate(() => openSetNote(0)); await H.settle(page);
  const lb = await buttons(page, '#set-note-overlay');
  check('Loggen-setnotitie bestaand: Wissen boven', [lb.map(b => b.t), lb[0].top < lb[1].top], [['Wissen', 'Annuleren', 'Opslaan'], true]);
  await page.click('#btn-set-note-clear'); await H.settle(page);
  check('Wissen Loggen-setnotitie', [await page.evaluate(d => db.workouts[d][0].sets[0].note ?? null, DATE), await toastState(page), await isOpen(page, 'set-note-overlay')], [null, ['Notitie gewist', false], false]);
  // Wissen in Loggen (#btn-clear) unchanged
  const clr = await page.evaluate(() => { const b = document.getElementById('btn-clear'), s = getComputedStyle(b), r = getComputedStyle(document.documentElement);
    return [b.className, b.textContent, s.backgroundColor, s.color, s.height]; });
  check('Wissen in Loggen ongewijzigd (btn btn-primary, blauw gevuld, wit)', clr, ['btn btn-primary', 'Wissen', 'rgb(3, 155, 229)', 'rgb(255, 255, 255)', '48px']);

  // --- Same style everywhere
  await setup(page, { ...data('a', 'b'), sleep: { [DATE]: { bedtime: '23:00', wakeTime: '07:00' } }, bodyWeight: { [DATE]: 80 } });
  const ids = ['btn-comment-delete', 'btn-set-note-clear', 'btn-insight-sleep-clear', 'btn-insight-weight-clear'];
  const cls = await page.evaluate(ids => ids.map(id => document.getElementById(id).className.replace(' hidden', '')), ids);
  check('alle Wissen-knoppen in pop-ups dezelfde klassen', [...new Set(cls)], ['btn btn-secondary btn-block btn-danger-text']);
  const rd = await page.evaluate(() => document.querySelectorAll('.overlay .btn-danger').length);
  console.log('resterende .btn-danger in pop-ups (bevestigingsknoppen Verwijderen):', rd, await page.evaluate(() => [...document.querySelectorAll('.overlay .btn-danger')].map(b => b.id + '=' + b.textContent.trim())));

  // --- Layout + screenshots: light/dark × 360/390
  const shots = [];
  const fits = async (sel) => page.evaluate(sel => {
    const bs = [...document.querySelectorAll(sel + ' button')].filter(b => b.offsetParent);
    return bs.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })
      && document.documentElement.scrollWidth === document.documentElement.clientWidth;
  }, sel);
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 760 });
    const st = {};
    // comment popup new + existing
    await setup(page, data(null, null), theme);
    await page.evaluate(() => openSessionCommentPopup()); await H.settle(page);
    st.newNote = await fits('#comment-overlay');
    let f = `note-new-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    await setup(page, data('Zwaar, laatste rep ging traag', 'Goede sessie'), theme);
    await page.evaluate(() => openSessionCommentPopup()); await H.settle(page);
    await page.click('#btn-comment-edit');
    st.existingNote = await fits('#comment-overlay');
    f = `note-existing-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    st.styleComment = await style(page, 'btn-comment-delete');
    await page.evaluate(() => closeOverlay('comment-overlay')); await H.settle(page);
    // Loggen set note + the Loggen Wissen button
    await page.evaluate(() => openTraining('bench')); await H.settle(page);
    f = `loggen-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    await page.evaluate(() => openSetNote(0)); await H.settle(page);
    st.setNote = await fits('#set-note-overlay');
    st.styleSetNote = await style(page, 'btn-set-note-clear');
    f = `setnote-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
    await page.evaluate(() => closeOverlay('set-note-overlay')); await H.settle(page);
    // Inzicht sheets
    await page.evaluate(({ DATE }) => { db.sleep = { [DATE]: { bedtime: '23:00', wakeTime: '07:00' } }; db.bodyWeight = { [DATE]: 80 }; insightDayDate = DATE; showScreen('screen-insight-day'); renderInsightDay(); openInsightSleepSheet(DATE); }, { DATE });
    await H.settle(page);
    st.sleep = await fits('#insight-sleep-overlay'); st.styleSleep = await style(page, 'btn-insight-sleep-clear');
    await page.evaluate(DATE => { closeOverlay('insight-sleep-overlay'); openInsightWeightSheet(DATE); }, DATE); await H.settle(page);
    st.weight = await fits('#insight-weight-overlay'); st.styleWeight = await style(page, 'btn-insight-weight-clear');
    await page.evaluate(() => closeOverlay('insight-weight-overlay'));
    const same = [st.styleComment, st.styleSetNote, st.styleSleep, st.styleWeight].every(s => JSON.stringify(s) === JSON.stringify(st.styleComment));
    check(`${theme} ${w}: alles past, Wissen overal gelijk`, [st.newNote, st.existingNote, st.setNote, st.sleep, st.weight, same], [true, true, true, true, true, true]);
    console.log(`  stijl Wissen ${theme} (tekst, achtergrond, rand, hoogte):`, st.styleComment);
  }
  console.log('screenshots:', shots.join(', '));
}

// The set note in Loggen shows the same placeholder as the Notitie pop-up.
async function placeholder(page) {
  await page.setViewportSize({ width: 360, height: 760 });
  await H.loadData(page, { custom_exercises: [{ id: 'bench', name: 'Bench press', category: 'chest' }], workouts: { [DATE]: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5 }] }] } });
  const res = await page.evaluate(DATE => {
    currentDate = DATE;
    openTraining('bench'); openSetNote(0);
    const all = [...document.querySelectorAll('textarea')].map(t => t.id + ': ' + t.placeholder);
    const s = getComputedStyle(document.getElementById('set-note-input'), '::placeholder');
    return { all, color: s.color };
  }, DATE);
  await H.settle(page);
  for (const theme of H.THEMES) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.screenshot({ path: path.join(OUT, `setnote-placeholder-${theme}.png`) });
  }
  const ph = await page.evaluate(() => [document.getElementById('set-note-input').placeholder, document.getElementById('set-note-input').value, document.getElementById('comment-edit-input').placeholder]);
  console.log(JSON.stringify(res, null, 1));
  H.ok(ph[0] === 'Notitie toevoegen...' && ph[1] === '' && ph[0] === ph[2], 'setnotitie toont "Notitie toevoegen...", gelijk aan Notitie-popup', ph);
}

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 760, scale: 2 });
  H.section('Wissen-knoppen');
  await clearButtons(page);
  H.section('Placeholder setnotitie');
  await placeholder(page);
  await browser.close();
  check('geen JS-fouten', errors, []);
});

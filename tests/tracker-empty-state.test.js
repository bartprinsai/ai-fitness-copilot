// Fitness Tracker, tab Bijhouden: de lege staat van de setlijst ("Nog geen sets", op één regel,
// onder de knoppen) en dat die verdwijnt zodra je via het formulier een set opslaat.
// Licht en donker, 360 en 390 px breed.
const path = require('path');
const H = require('./helpers');

const DATE = '2026-10-25';

H.run(async () => {
  const out = H.outDir(__filename);
  for (const theme of H.THEMES) for (const width of H.WIDTHS) {
    const tag = `[${theme} ${width}px]`;
    H.section(`Lege setlijst ${tag}`);
    const { browser, page, errors } = await H.openApp({ width, height: 780, theme, scale: 2 });
    await H.loadData(page, { workouts: { [DATE]: [{ exerciseId: 'bench-press', sets: [] }] } }, theme);
    const r = await page.evaluate(date => {
      currentDate = date; currentExerciseId = 'bench-press';
      showScreen('screen-training'); switchTab('track'); renderSetList();
      const el = document.querySelector('#set-list .set-list-empty');
      if (!el) return null;
      const cs = getComputedStyle(el), b = el.getBoundingClientRect();
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const btn = document.getElementById('btn-save-set').getBoundingClientRect();
      return { text: el.textContent, lines: Math.round((b.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh), gapUnderSave: Math.round(b.top - btn.bottom) };
    }, DATE);
    await page.screenshot({ path: path.join(out, `track-empty-${theme}-${width}.png`) });
    H.ok(r, `${tag} lege staat aanwezig`);
    if (r) {
      H.check(`${tag} tekst`, r.text, 'Nog geen sets');
      H.check(`${tag} één regel`, r.lines, 1);
      H.ok(r.gapUnderSave >= 0, `${tag} onder de knop Opslaan (${r.gapUnderSave}px)`, r);
    }

    // Een set opslaan via het formulier
    await page.evaluate(() => {
      for (const [id, v] of [['field-weight', '100'], ['field-reps', '5']]) { const f = document.getElementById(id); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.click('#btn-save-set');
    await H.settle(page);
    const after = await page.evaluate(date => ({ empty: !!document.querySelector('#set-list .set-list-empty'), sets: ((db.workouts[date] || []).find(e => e.exerciseId === 'bench-press') || {}).sets }), DATE);
    await page.screenshot({ path: path.join(out, `track-saved-${theme}-${width}.png`) });
    H.check(`${tag} na opslaan: lege staat weg`, after.empty, false);
    H.check(`${tag} na opslaan: één set van 100 × 5`, (after.sets || []).map(s => [s.weight, s.reps]), [[100, 5]]);

    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

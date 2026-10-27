// Trainingsplannen zonder plannen: de lege staat ("Nog geen plannen" + plusje "Nieuw plan")
// heeft dezelfde stijl en plek als die van de Fitness Tracker, het plusje doet hetzelfde als
// "Zelf samenstellen", en "Kies een plan" blijft zonder plusje. Light en dark, 360 en 390px.
const path = require('path');
const H = require('./helpers');

// Position and style of the empty state on the active screen (title, + icon, label).
const measure = () => {
  const r = el => { const b = el.getBoundingClientRect(); return { midX: Math.round(b.left + b.width / 2), top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10 }; };
  const s = el => { const c = getComputedStyle(el); return [c.fontSize, c.fontWeight, c.color]; };
  const scr = document.querySelector('.screen.active');
  const t = scr.querySelector('.home-empty-title'), b = scr.querySelector('.home-empty-action'), svg = b.querySelector('svg'), sp = b.querySelector('span');
  return { title: r(t), titleStyle: s(t), plus: r(svg), plusFill: getComputedStyle(svg).fill, label: r(sp), labelStyle: s(sp) };
};
const closeAll = page => page.evaluate(() => document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open', 'active', 'show')));

H.run(async () => {
  const out = H.outDir(__filename);
  for (const theme of ['light', 'dark']) for (const width of [360, 390]) {
    const tag = `${theme} ${width}`;
    H.section(tag);
    const { browser, page, errors } = await H.openApp({ width, theme, scale: 2 });
    await H.loadData(page, { plans: {}, activePlan: null });
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });

    await page.evaluate(() => showScreen('screen-fitness-tracker'));
    const tracker = await page.evaluate(measure);
    await page.evaluate(() => showScreen('screen-workout-plan'));
    const plans = await page.evaluate(measure);
    H.check(`${tag} zelfde stijl en positie als tracker`, plans, tracker);
    H.check(`${tag} tekst`, await page.evaluate(() => [document.querySelector('#screen-workout-plan .home-empty-title').textContent, document.querySelector('#btn-plan-empty-add span').textContent]), ['Nog geen plannen', 'Nieuw plan']);
    H.check(`${tag} label MIJN PLANNEN verborgen`, await page.evaluate(() => document.getElementById('plan-list-label').offsetParent === null), true);
    const layout = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#screen-workout-plan .plan-create-btn')];
      const hit = tiles.map(t => { const b = t.getBoundingClientRect(); return t.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)) && t.contains(document.elementFromPoint(b.left + 4, b.bottom - 4)); });
      const tilesBottom = Math.max(...tiles.map(t => t.getBoundingClientRect().bottom));
      const title = document.querySelector('#screen-workout-plan .home-empty-title').getBoundingClientRect();
      const btn = document.getElementById('btn-plan-empty-add').getBoundingClientRect();
      return { tilesTappable: hit, gapTilesToTitle: Math.round(title.top - tilesBottom), gapTitleToPlus: Math.round(btn.top - title.bottom), plusHitIsButton: document.elementFromPoint(btn.left + btn.width / 2, btn.top + 30).closest('#btn-plan-empty-add') !== null };
    });
    console.log(`     ${tag} ruimte: tegels→titel ${layout.gapTilesToTitle}px, titel→plusje ${layout.gapTitleToPlus}px`);
    H.check(`${tag} tegels aantikbaar, geen overlap`, [layout.tilesTappable, layout.gapTilesToTitle > 0, layout.gapTitleToPlus > 0, layout.plusHitIsButton], [[true, true], true, true, true]);
    await page.screenshot({ path: path.join(out, `plans-empty-${theme}-${width}.png`) });
    if (theme === 'light' && width === 360) {
      await page.evaluate(() => showScreen('screen-fitness-tracker'));
      await page.screenshot({ path: path.join(out, `tracker-empty-${theme}-${width}.png`) });
      await page.evaluate(() => showScreen('screen-workout-plan'));
    }

    // Tapping + does the same as Zelf samenstellen
    await page.click('#btn-plan-empty-add');
    const viaPlus = await page.evaluate(() => [...document.querySelectorAll('.overlay.open, .overlay.active, .overlay.show')].map(o => o.id));
    await closeAll(page);
    await page.click('#btn-plan-make-own');
    const viaTile = await page.evaluate(() => [...document.querySelectorAll('.overlay.open, .overlay.active, .overlay.show')].map(o => o.id));
    H.check(`${tag} plusje = Zelf samenstellen`, [viaPlus, viaTile], [['new-plan-overlay'], ['new-plan-overlay']]);
    await closeAll(page);

    // With a plan: the label comes back, the empty state goes
    const after = await page.evaluate(() => {
      db.plans = { p1: { id: 'p1', name: 'Testplan', days: [], createdAt: 1 } }; renderPlanList();
      const r = { label: document.getElementById('plan-list-label').offsetParent !== null, empty: document.getElementById('plan-list-empty-state').offsetParent !== null, plus: !!document.getElementById('btn-plan-empty-add'), cards: document.querySelectorAll('#plan-list-scroll .plan-item').length };
      db.plans = {}; renderPlanList(); r.backEmpty = !!document.getElementById('btn-plan-empty-add') && document.getElementById('plan-list-label').offsetParent === null;
      return r;
    });
    H.check(`${tag} met plan: label terug, lege staat weg`, after, { label: true, empty: false, plus: false, cards: 1, backEmpty: true });

    // Kies een plan: no +
    const pick = await page.evaluate(() => { showScreen('screen-schedule-pick-plan'); renderSchedulePickPlan(); const s = document.getElementById('screen-schedule-pick-plan');
      return [!!s.querySelector('.home-empty-action'), s.querySelector('.plan-list-empty').textContent, document.getElementById('schedule-pick-plan-label').offsetParent === null]; });
    H.check(`${tag} Kies een plan ongewijzigd`, pick, [false, 'Nog geen plannen. Maak er eerst een aan via Trainingsplannen.', true]);

    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

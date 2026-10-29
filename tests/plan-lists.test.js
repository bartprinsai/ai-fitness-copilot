// De twee planlijsten met de secties ACTIEF PLAN / MIJN PLANNEN:
//   - Trainingsplannen (#screen-workout-plan): volgorde en afstanden, de actieve kaart (rand,
//     geen badge, zelfde opbouw als een gewone kaart), ⋮ Actief maken / Actief verwijderen,
//     alleen een actief plan, geen plannen, en tikken op een kaart opent het plan;
//   - Kies een plan (Nieuwe workout → Schema handmatig laden, #screen-schedule-pick-plan): dezelfde
//     opbouw en stijl als Trainingsplannen, de lege staten, en tikken op een kaart → Kies een dag →
//     een dag laden zet de oefeningen in de training van de dag waarvandaan Nieuwe workout openging.
// Licht en donker, 360 en 390 px breed.
const path = require('path');
const H = require('./helpers');

// Plannen in het huidige datamodel: plandagen met een id en oefeningen als { exerciseId, sets, reps }.
const day = (planId, n, exId) => ({ id: `day-${planId}-${n}`, name: 'Dag ' + n, exercises: exId ? [{ exerciseId: exId, sets: 3, reps: 8 }] : [] });
const PLANS = {
  p1: { id: 'p1', name: 'Push Pull Legs', days: [day('p1', 1, 'bench-press'), day('p1', 2, 'deadlift'), day('p1', 3)], createdAt: 3, scheduleConfirmed: true },
  p2: { id: 'p2', name: 'Upper Lower', days: [day('p2', 1, 'squat'), day('p2', 2, 'pull-ups'), day('p2', 3, 'bench-press'), day('p2', 4, 'deadlift')], createdAt: 2, scheduleConfirmed: true },
  p3: { id: 'p3', name: 'Full body', days: [day('p3', 1, 'squat')], createdAt: 1, scheduleConfirmed: true },
};
const ACTIVE_P2 = { planId: 'p2', planName: 'Upper Lower', lastDayIndex: -1 };

// Meet de staat van een planlijstscherm: zichtbare secties, namen, afstanden, stijl van labels en kaarten.
function pageState(screenId) {
  const scr = document.getElementById(screenId);
  const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  const r = el => el.getBoundingClientRect();
  const cs = el => getComputedStyle(el);
  const textTop = el => r(el).top + parseFloat(cs(el).paddingTop);
  const textBottom = el => r(el).bottom - parseFloat(cs(el).paddingBottom);
  const round = v => Math.round(v * 100) / 100;
  const sec = scr.querySelector('.plan-active-section');
  const lbl = scr.querySelector(':scope > .plan-list-label');
  const scroll = scr.querySelector('.plan-list-scroll');
  const toolbar = scr.querySelector('.toolbar');
  const activeCard = sec.querySelector('.plan-item');
  const listCards = [...scroll.querySelectorAll('.plan-item')];
  const empty = scr.querySelector('#plan-list-empty-state') || scroll.querySelector('.plan-list-empty');
  const out = {
    activeVisible: vis(sec), listLabelVisible: vis(lbl),
    activeName: vis(sec) && activeCard ? activeCard.querySelector('.plan-item-name').textContent : null,
    listNames: listCards.map(c => c.querySelector('.plan-item-name').textContent),
    emptyText: vis(empty) ? empty.textContent.replace(/\s+/g, ' ').trim() : null,
    anyBadge: !!scr.querySelector('.badge') || listCards.some(c => c.querySelector('.plan-item-active-pill')),
    scrollFlex: cs(scroll).overflowY + ' ' + cs(scroll).flexGrow, secShrink: cs(sec).flexShrink,
  };
  const first = vis(sec) ? sec.querySelector('.plan-list-label') : vis(lbl) ? lbl : empty;
  if (first) out.firstTop = round(textTop(first) - r(toolbar).bottom);
  const tiles = scr.querySelector('.plan-create-row .plan-create-btn');
  const labelStyle = el => [cs(el).fontSize, cs(el).fontWeight, cs(el).textTransform, cs(el).color, cs(el).paddingLeft].join(' ');
  // Plek van titel, subregel (en ⋮) ten opzichte van de buitenrand van de kaart.
  const pos = c => {
    const b = r(c), n = r(c.querySelector('.plan-item-name')), m = r(c.querySelector('.plan-item-meta'));
    const dots = c.querySelector('.plan-item-dots');
    const d = dots ? [b.right - r(dots).right, r(dots).top - b.top] : [];
    return [n.left - b.left, n.top - b.top, m.left - b.left, m.top - b.top, ...d, b.height, b.width].map(round);
  };
  if (out.activeVisible) {
    const al = sec.querySelector('.plan-list-label');
    out.activeLabel = al.textContent.trim();
    out.activeLabelStyle = labelStyle(al);
    out.activeLabelToCard = round(r(activeCard).top - textBottom(al));
    if (tiles) out.gapTilesToActiveLabel = round(textTop(al) - r(tiles).bottom);
    out.border = cs(activeCard).borderTopWidth + ' ' + cs(activeCard).borderTopStyle + ' ' + cs(activeCard).borderTopColor;
    out.radius = cs(activeCard).borderTopLeftRadius;
    if (out.listLabelVisible) out.sectionGap = round(textTop(lbl) - r(activeCard).bottom);
    out.activePos = pos(activeCard);
    if (listCards[0]) out.plainPos = pos(listCards[0]);
  } else if (out.listLabelVisible && tiles) {
    out.gapTilesToListLabel = round(textTop(lbl) - r(tiles).bottom);
  }
  if (out.listLabelVisible) {
    out.listLabelStyle = labelStyle(lbl);
    if (listCards[0]) out.listLabelToCard = round(r(listCards[0]).top - textBottom(lbl));
  }
  return out;
}

H.run(async () => {
  const out = H.outDir(__filename);
  for (const theme of H.THEMES) for (const width of H.WIDTHS) {
    const tag = `[${theme} ${width}px]`;
    const { browser, page, errors } = await H.openApp({ width, height: 780, theme, scale: 2 });
    await page.addScriptTag({ content: `window.__state = ${pageState.toString()};` });
    const primaryRgb = await H.tokenColor(page, '--primary');
    const activeScreen = () => page.evaluate(() => ({ screen: document.querySelector('.screen.active')?.id, planTitle: document.getElementById('plan-detail-title').textContent, dayTitle: document.getElementById('schedule-pick-day-title').textContent }));

    // ── Trainingsplannen ─────────────────────────────────────────────────────
    H.section(`Trainingsplannen ${tag}`);
    await H.loadData(page, { plans: PLANS, activePlan: ACTIVE_P2 }, theme);
    await page.evaluate(() => openWorkoutPlan());
    await H.settle(page);
    let s = await page.evaluate(() => __state('screen-workout-plan'));
    const ref = s; // referentie voor Kies een plan (zelfde data)
    await page.screenshot({ path: path.join(out, `plans-${theme}-${width}.png`) });
    H.ok(s.activeVisible && s.activeLabel.toUpperCase() === 'ACTIEF PLAN' && s.activeName === 'Upper Lower' && s.listLabelVisible, `${tag} volgorde tegels → ACTIEF PLAN (Upper Lower) → MIJN PLANNEN`, s);
    H.check(`${tag} actief plan niet onder MIJN PLANNEN`, s.listNames, ['Push Pull Legs', 'Full body']);
    H.check(`${tag} ruimte boven labels (24 = --section-gap)`, [s.gapTilesToActiveLabel, s.sectionGap], [24, 24]);
    H.check(`${tag} label→kaart gelijk voor beide secties`, s.activeLabelToCard, s.listLabelToCard);
    H.check(`${tag} rand en radius actieve kaart`, [s.border, s.radius], [`2px solid ${primaryRgb}`, '12px']);
    H.check(`${tag} geen ★ ACTIEF-badge`, s.anyBadge, false);
    H.check(`${tag} titel/subregel/⋮ op dezelfde plek als gewone kaart`, s.activePos, s.plainPos);

    // ⋮ Actief maken / Actief verwijderen
    const clickMenu = async (sel, label) => {
      await page.click(sel);
      await page.evaluate(label => [...document.querySelectorAll('#overflow-panel .dropdown-item')].find(e => e.textContent.trim() === label).click(), label);
      await H.settle(page);
    };
    await clickMenu('#plan-list-scroll .plan-item:nth-child(1) .plan-item-dots', 'Actief maken');
    s = await page.evaluate(() => __state('screen-workout-plan'));
    H.check(`${tag} ⋮ Actief maken`, [s.activeName, s.listNames], ['Push Pull Legs', ['Upper Lower', 'Full body']]);
    await clickMenu('#plan-list-active-slot .plan-item-dots', '★ Actief verwijderen');
    s = await page.evaluate(() => __state('screen-workout-plan'));
    H.check(`${tag} ⋮ Actief verwijderen: sectie weg, MIJN PLANNEN omhoog`, [s.activeVisible, s.listLabelVisible, s.listNames.length, s.gapTilesToListLabel], [false, true, 3, 24]);
    await page.screenshot({ path: path.join(out, `plans-noactive-${theme}-${width}.png`) });

    // Alleen een actief plan
    s = await page.evaluate(({ p2, a }) => { db.plans = { p2 }; db.activePlan = a; renderPlanList(); return __state('screen-workout-plan'); }, { p2: PLANS.p2, a: ACTIVE_P2 });
    H.check(`${tag} alleen actief plan: MIJN PLANNEN-label weg`, [s.activeVisible, s.activeName, s.listLabelVisible, s.listNames.length, s.emptyText], [true, 'Upper Lower', false, 0, null]);
    await page.screenshot({ path: path.join(out, `plans-onlyactive-${theme}-${width}.png`) });

    // Tikken op een kaart opent het plan
    await page.click('#plan-list-active-slot .plan-item-info');
    await H.settle(page);
    let o = await activeScreen();
    H.check(`${tag} tik op actieve kaart opent het plan`, [o.screen, o.planTitle], ['screen-plan-detail', 'Upper Lower']);
    await page.evaluate(p3 => { db.plans.p3 = p3; openWorkoutPlan(); }, PLANS.p3);
    await H.settle(page);
    await page.click('#plan-list-scroll .plan-item .plan-item-info');
    await H.settle(page);
    o = await activeScreen();
    H.check(`${tag} tik op gewone kaart opent het plan`, [o.screen, o.planTitle], ['screen-plan-detail', 'Full body']);

    // Geen plannen
    s = await page.evaluate(() => { db.plans = {}; db.activePlan = null; openWorkoutPlan(); return __state('screen-workout-plan'); });
    H.ok(!s.activeVisible && String(s.emptyText).startsWith('Nog geen plannen') && s.listNames.length === 0, `${tag} geen plannen: lege staat "${s.emptyText}"`, s);
    await page.screenshot({ path: path.join(out, `plans-empty-${theme}-${width}.png`) });

    // ── Kies een plan (Nieuwe workout → Schema handmatig laden) ─────────────
    H.section(`Kies een plan ${tag}`);
    await H.loadData(page, { plans: PLANS, activePlan: ACTIVE_P2 }, theme);
    await page.evaluate(() => { showScreen('screen-training'); openNewWorkoutScreen(); openSchedulePickPlan(); });
    await H.settle(page);
    s = await page.evaluate(() => __state('screen-schedule-pick-plan'));
    await page.screenshot({ path: path.join(out, `pick-${theme}-${width}.png`) });
    H.ok(s.activeVisible && s.activeLabel.toUpperCase() === 'ACTIEF PLAN' && s.activeName === 'Upper Lower' && s.listLabelVisible, `${tag} opbouw ACTIEF PLAN (Upper Lower) → MIJN PLANNEN`, s);
    H.check(`${tag} eerste label op --screen-top`, s.firstTop, 16);
    H.check(`${tag} ruimte tussen secties (= Trainingsplannen)`, s.sectionGap, ref.sectionGap);
    H.check(`${tag} ruimte tussen secties 24`, s.sectionGap, 24);
    H.check(`${tag} label→kaart (= Trainingsplannen, 12)`, [s.activeLabelToCard, s.listLabelToCard], [ref.activeLabelToCard, ref.listLabelToCard]);
    H.check(`${tag} label→kaart 12`, s.activeLabelToCard, 12);
    H.check(`${tag} labelstijl gelijk aan Trainingsplannen`, [s.activeLabelStyle, s.listLabelStyle], [ref.activeLabelStyle, ref.listLabelStyle]);
    H.check(`${tag} scrollgedrag gelijk aan Trainingsplannen`, [s.scrollFlex, s.secShrink], [ref.scrollFlex, ref.secShrink]);
    H.check(`${tag} rand, radius, geen badge`, [s.border, s.radius, s.anyBadge], [`2px solid ${primaryRgb}`, '12px', false]);
    H.check(`${tag} titel/subregel op dezelfde plek als gewone kaart`, s.activePos, s.plainPos);
    H.check(`${tag} actief plan niet onder MIJN PLANNEN`, s.listNames, ['Push Pull Legs', 'Full body']);

    s = await page.evaluate(() => { db.activePlan = null; renderSchedulePickPlan(); return __state('screen-schedule-pick-plan'); });
    H.check(`${tag} geen actief plan: sectie weg, MIJN PLANNEN bovenaan`, [s.activeVisible, s.listLabelVisible, s.listNames.length, s.firstTop], [false, true, 3, 16]);
    await page.screenshot({ path: path.join(out, `pick-noactive-${theme}-${width}.png`) });
    s = await page.evaluate(({ p2 }) => { db.plans = { p2 }; db.activePlan = { planId: 'p2' }; renderSchedulePickPlan(); return __state('screen-schedule-pick-plan'); }, { p2: PLANS.p2 });
    H.check(`${tag} alleen actief plan: MIJN PLANNEN-label weg`, [s.activeVisible, s.listLabelVisible, s.listNames.length, s.firstTop], [true, false, 0, 16]);
    s = await page.evaluate(() => { db.plans = {}; db.activePlan = null; renderSchedulePickPlan(); return __state('screen-schedule-pick-plan'); });
    H.check(`${tag} geen plannen: lege staat (16 + 32 eigen padding)`, [s.activeVisible, s.listLabelVisible, s.emptyText, s.firstTop], [false, false, 'Nog geen plannen. Maak er eerst een aan via Trainingsplannen.', 48]);
    await page.screenshot({ path: path.join(out, `pick-empty-${theme}-${width}.png`) });

    // Tik actieve kaart → Kies een dag → dag laden in de training van 25 oktober
    H.section(`Dag laden ${tag}`);
    await H.loadData(page, { plans: PLANS, activePlan: { planId: 'p2' } }, theme);
    await page.evaluate(() => { currentDate = '2026-10-25'; showScreen('screen-training'); openNewWorkoutScreen(); openSchedulePickPlan(); });
    await H.settle(page);
    await page.click('#schedule-pick-plan-active-slot .plan-item');
    await H.settle(page);
    o = await activeScreen();
    H.check(`${tag} tik actieve kaart → Kies een dag`, [o.screen, o.dayTitle], ['screen-schedule-pick-day', 'Upper Lower — kies een dag']);
    await page.click('#schedule-pick-day-scroll .plan-day-card:nth-child(1)');
    await H.settle(page);
    const loaded = await page.evaluate(() => ({ w: db.workouts['2026-10-25'] || [], planDays: getWorkoutPlanDays('2026-10-25'), screen: document.querySelector('.screen.active')?.id, date: currentDate }));
    H.check(`${tag} dag laden: oefeningen in de training`, loaded.w, [{ exerciseId: 'squat', sets: [], target: { sets: 3, reps: 8 } }]);
    H.check(`${tag} dag laden: training onthoudt de plandag`, loaded.planDays, [{ planId: 'p2', dayId: 'day-p2-1', dayName: 'Dag 1' }]);
    H.check(`${tag} dag laden: terug in de Fitness Tracker op die dag`, [loaded.screen, loaded.date], ['screen-training', '2026-10-25']);
    // Tik een gewone kaart
    await page.evaluate(() => { showScreen('screen-schedule-pick-plan'); renderSchedulePickPlan(); });
    await H.settle(page);
    await page.click('#schedule-pick-plan-scroll .plan-item:nth-child(2)');
    await H.settle(page);
    o = await activeScreen();
    H.check(`${tag} tik gewone kaart → Kies een dag`, [o.screen, o.dayTitle], ['screen-schedule-pick-day', 'Full body — kies een dag']);

    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

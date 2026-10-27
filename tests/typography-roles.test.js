// Typography per role (DESIGN_SYSTEM.md "Typografie per rol"): every text gets the style of its
// role, not of its place — Titel in een blok 16px/500 --text (line-height normal), Subregel
// 12px/400 --text-secondary, Rij in een lijst 15px/400 --text, Compacte keuzeknop 12px/500
// (--on-primary when on), Label 11px/500 --text-secondary, Hoofdknop 14px/500. Measured on every
// screen that has these roles, in light and dark, at 360 and 390px; nothing may overflow.
const path = require('path');
const H = require('./helpers');

// Runs inside the page: sets up every screen in turn and measures each text.
function measureAll() {
  const out = [];
  const probe = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const T = { 'text': probe('--text'), 'text-secondary': probe('--text-secondary'), 'on-primary': probe('--on-primary'), 'on-gold': probe('--on-gold') };
  const EXP = { title: ['16px', '500', 'text'], sub: ['12px', '400', 'text-secondary'], row: ['15px', '400', 'text'], choice: ['12px', '500', 'text'], label: ['11px', '500', 'text-secondary'], btn: ['14px', '500', null] };
  const m = (screen, text, role, el, opts = {}) => {
    const name = `${screen}: ${text} — ${role}${opts.state ? ` (${opts.state})` : ''}`;
    if (!el) { out.push({ name, missing: true }); return; }
    const cs = getComputedStyle(el);
    const exp = [...EXP[role]];
    if (opts.color) exp[2] = opts.color;
    const box = opts.box ? el.closest(opts.box) : el;
    const r = document.createRange(); r.selectNodeContents(el);
    const lines = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
    const now = { size: cs.fontSize, weight: cs.fontWeight, color: exp[2] ? (cs.color === T[exp[2]] ? exp[2] : cs.color) : null, lh: role === 'title' ? cs.lineHeight : 'normal', overflow: box.scrollWidth > box.clientWidth + 0.5, oneLine: opts.oneLine ? lines === 1 : true };
    const want = { size: exp[0], weight: exp[1], color: exp[2], lh: 'normal', overflow: false, oneLine: true };
    out.push({ name, now, want });
  };
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const safe = (label, fn) => { try { fn(); } catch (e) { out.push({ name: `${label}: opzetten`, missing: true, error: e.message }); } };
  const on = (el, cls = 'active') => el.classList.contains(cls);
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));

  db.plans = {
    a: { id: 'a', name: 'Test', days: [], createdAt: 2 },
    b: { id: 'b', name: 'Push Pull Legs', createdAt: 1, scheduleConfirmed: true, days: [{ name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 10 }] }, { name: 'Pull', exercises: [] }, { name: 'Legs', exercises: [] }] },
  };
  db.workouts[currentDate] = [{ exerciseId: 'bench-press', sets: [{ weight: 80, reps: 10, rpe: 8 }] }];
  db.workouts['2026-01-05'] = [{ exerciseId: 'bench-press', sets: [{ weight: 100, reps: 1 }, { weight: 90, reps: 3 }] }];

  safe('Hoofdmenu', () => { showScreen('screen-home'); m('Hoofdmenu', `kaarttitel "${q('.nav-card-title').textContent}"`, 'title', q('.nav-card-title')); m('Hoofdmenu', 'kaartregel eronder', 'sub', q('.nav-card-desc')); });
  safe('Trainingsplannen', () => {
    showScreen('screen-workout-plan'); renderPlanList();
    qa('.plan-create-btn span').forEach(s => m('Trainingsplannen', `tegel "${s.textContent}"`, 'title', s, { box: '.plan-create-btn', oneLine: true }));
    m('Trainingsplannen', 'label "MIJN PLANNEN"', 'label', q('#plan-list-label'));
    m('Trainingsplannen', 'plannaam', 'title', q('.plan-item-name'));
    m('Trainingsplannen', `subregel "${q('.plan-item-meta').textContent.trim()}"`, 'sub', q('.plan-item-meta'));
  });
  safe('Sjablonen', () => { openPresetsOverlay(); m('Sjablonen (popup)', 'sjabloonnaam', 'title', q('.preset-item-name')); m('Sjablonen (popup)', 'subregel "N dagen"', 'sub', q('.preset-item-meta')); q('#presets-overlay').classList.remove('open'); });
  safe('Plan detail', () => { openPlanDetail('b'); expandedPlanDayIndex = 0; renderPlanDetail(); m('Plan detail', 'dagnaam "Push"', 'title', q('.plan-day-name')); m('Plan detail', 'subregel onder dagnaam', 'sub', q('.plan-day-sub')); m('Plan detail', 'oefening in dagkaart', 'row', q('.plan-day-preview-name')); m('Plan detail', 'sets×reps eronder', 'sub', q('.plan-day-preview-meta')); });
  safe('Plan schedule', () => {
    openPlanSchedule('b');
    qa('.ps-toggle-option').forEach(b => m('Plan schedule', `dagindeling "${b.textContent.trim()}"`, 'choice', b, { state: on(b, 'selected') ? 'aan' : 'uit', color: on(b, 'selected') ? 'on-primary' : 'text' }));
  });
  safe('Dag bewerken', () => {
    currentPlanId = 'b'; currentPlanData = db.plans.b; openPlanDayEdit(0);
    m('Dag bewerken', 'oefeningnaam', 'title', q('.pde-ex-name')); m('Dag bewerken', 'sets×reps eronder', 'sub', q('.pde-ex-meta'));
    openPdeSetsRepsEdit(0);
    qa('.pde-sr-mode-btn').forEach(b => m('Sets & reps aanpassen', `"${b.textContent}"`, 'choice', b, { state: on(b) ? 'aan' : 'uit', color: on(b) ? 'on-primary' : 'text' }));
    m('Sets & reps aanpassen', '"OPSLAAN"', 'btn', q('#btn-pde-sr-save'));
    q('#pde-sets-reps-overlay').classList.remove('open');
  });
  for (const [scr, id] of [['Warming-up', 'screen-calculator-warmup'], ['Schijvencalculator', 'screen-calculator-plate']]) safe(scr, () => {
    if (id === 'screen-calculator-plate') openPlateCalculator(); else openWarmupCalculator();
    qa(`#${id} .plate-bar-option`).forEach(o => {
      const sel = on(o, 'selected');
      m(scr, `knop "${o.querySelector('.plate-bar-option-title').textContent}"`, 'title', o.querySelector('.plate-bar-option-title'), { state: sel ? 'aan' : 'uit', color: sel ? 'on-primary' : 'text', box: '.plate-bar-option', oneLine: true });
      m(scr, `subregel "${o.querySelector('.plate-bar-option-weight').textContent}"`, 'sub', o.querySelector('.plate-bar-option-weight'), { state: sel ? 'aan' : 'uit', color: sel ? 'on-primary' : 'text-secondary', box: '.plate-bar-option', oneLine: true });
    });
    qa(`#${id} .section-label`).filter(l => l.offsetParent).slice(0, 2).forEach(l => m(scr, `label "${l.childNodes[0].textContent.trim().toUpperCase()}"`, 'label', l));
    if (id === 'screen-calculator-plate') m(scr, `schijf-subregel "${q('.plate-row-meta').textContent}"`, 'sub', q('.plate-row-meta'));
    m(scr, 'hoofdknop "BEREKENEN"', 'btn', q(`#${id} .btn-block`));
  });
  safe('Alle oefeningen', () => {
    exerciseScreenMode = 'browse'; showScreen('screen-exercises'); renderCategoryBrowser();
    m('Alle oefeningen', 'categorie', 'row', q('.category-item-name'));
    exerciseBrowserMode = 'exercises'; currentBrowseCategory = 'arms'; renderExercisesInCategory('arms');
    m('Alle oefeningen', 'oefening', 'row', q('.exercise-item-name'));
    showOverflowMenu([{ label: 'Bewerken', action: () => {} }], q('.exercise-item-dots'));
    m('⋮-menu', 'menu-item "Bewerken"', 'row', q('.dropdown-item'));
    document.body.click();
  });
  safe('Keuzelijst', () => { openFieldPicker('Test', [{ value: 'a', label: 'Optie A' }, { value: 'b', label: 'Optie B' }], 'a', () => {}); m('Keuzelijst (popup)', 'optie', 'row', q('.field-picker-label')); q('#field-picker-overlay').classList.remove('open'); });
  safe('Fitness Tracker', () => { showScreen('screen-fitness-tracker'); renderHome(); m('Dagoverzicht', 'oefeningnaam boven kaart', 'title', q('#home-content .exercise-card-name')); });
  safe('Loggen', () => {
    openTraining('bench-press'); switchTab('track');
    qa('#extra-type .extra-type-btn').forEach(b => m('Loggen', `"${b.textContent.trim()}"`, 'choice', b, { state: on(b) ? 'aan' : 'uit', color: on(b) ? 'on-primary' : 'text' }));
    const d = q('#dropset-toggle'); if (d && d.offsetParent) m('Loggen', '"Dropset"', 'choice', d, { state: on(d) ? 'aan' : 'uit', color: on(d) ? 'on-primary' : 'text' });
    m('Loggen', 'label "GEWICHT"', 'label', q('#tab-track .section-label'));
    m('Loggen', '"WISSEN"', 'btn', q('#btn-clear'));
    switchTab('graph');
    qa('.time-filter').forEach(b => m('Grafiek', `periodefilter "${b.textContent}"`, 'choice', b, { state: on(b) ? 'aan' : 'uit', color: on(b) ? 'on-primary' : 'text', oneLine: true }));
    const g = q('#graph-derived'); m('Grafiek', '"Afgeleide sets"', 'choice', g, { state: on(g) ? 'aan' : 'uit', color: on(g) ? 'on-primary' : 'text', oneLine: true });
  });
  safe('Records', () => { currentExerciseId = 'bench-press'; openExerciseRecords(); m('Records', '"One rep max"', 'title', q('.records-hero-label'), { color: 'on-gold' }); m('Records', 'datumregel', 'sub', q('.records-row-date'), { color: q('.records-hero .records-row-date') ? 'on-gold' : 'text-secondary' }); });
  safe('Nieuwe oefening', () => { openNewExerciseScreen(); setNewExEquipmentOpen(true); const b = q('#new-ex-info-powerlift-bench'); m('Nieuwe oefening', `"${b && b.textContent.trim()}" (Powerliftbank)`, 'choice', b, { state: 'uit' }); });
  safe('AI genereren', () => {
    openAIGenerate();
    qa('.chip').forEach(c => m('AI genereren', `keuze "${c.textContent.trim()}"`, 'choice', c, { state: on(c) ? 'aan' : 'uit', color: on(c) ? 'on-primary' : 'text', oneLine: true }));
  });
  safe('Samenvatting', () => { showScreen('screen-fitness-tracker'); openDayRecap(); m('Samenvatting (popup)', 'oefeningnaam', 'title', q('.recap-ex-name')); q('#recap-overlay').classList.remove('open'); });
  return out;
}

H.run(async () => {
  const out = H.outDir(__filename);
  const allErrors = [];
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    H.section(`${theme} ${w}`);
    const { browser, page, errors } = await H.openApp({ width: w, height: 780, theme });
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '*{transition:none!important}'; document.head.appendChild(st); });
    const res = await page.evaluate(measureAll);
    H.ok(res.length > 60, `${theme} ${w}: ${res.length} teksten gemeten`);
    for (const r of res) {
      if (r.missing) { H.ok(false, `${theme} ${w} ${r.name}`, r.error || 'element ontbreekt'); continue; }
      H.check(`${theme} ${w} ${r.name}`, r.now, r.want);
    }
    if (w === 360) await page.screenshot({ path: path.join(out, `recap-${theme}.png`) });
    allErrors.push(...errors);
    await browser.close();
  }
  H.check('geen JS-fouten', allErrors, []);
});

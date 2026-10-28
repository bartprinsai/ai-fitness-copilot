// Dividers (DESIGN_SYSTEM.md "Scheidingslijnen"): every grey line between rows or sections (1px
// --border) starts and ends 16px from the edges — of its card or menu, or of the screen when there is
// no frame (popups and sheets included). Measured in pixels on a screenshot of every screen, so it
// counts what is drawn, not how. The two exceptions run from edge to edge: the 2px --primary line under
// the name of an exercise (day overview) and a date (History), and the background of a chosen or
// pressed row. In light and dark, at 360 and 390px.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const S = (weight, reps, extra = {}) => ({ weight, reps, ...extra });
const DATA = {
  exerciseInfo: { 'bench-press': { trackStrength: true, primaryMuscleGroup: 'chest' }, 'incline-bench-press': { trackStrength: true, primaryMuscleGroup: 'chest' }, squat: { trackStrength: true } },
  workouts: {
    '2026-10-22': [{ exerciseId: 'bench-press', sets: [S(80, 10, { rpe: 8 }), S(85, 8), S(90, 6)] }, { exerciseId: 'squat', sets: [S(100, 5), S(110, 5)] }, { exerciseId: 'incline-bench-press', sets: [S(60, 10), S(65, 8)] }],
    '2026-10-20': [{ exerciseId: 'bench-press', sets: [S(80, 8), S(82.5, 8)] }],
    '2026-10-13': [{ exerciseId: 'bench-press', sets: [S(75, 10), S(80, 6)] }, { exerciseId: 'squat', sets: [S(95, 5)] }],
    '2026-10-06': [{ exerciseId: 'bench-press', sets: [S(70, 10)] }, { exerciseId: 'squat', sets: [S(90, 5)] }],
  },
  plans: { b: { id: 'b', name: 'Push Pull Legs', createdAt: 1, scheduleConfirmed: true, days: [{ name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, reps: 10 }, { exerciseId: 'squat', sets: 3, reps: 5 }] }, { name: 'Pull', exercises: [] }] } },
  sleep: { '2026-10-19': { bedtime: '23:50', wakeTime: '07:00' }, '2026-10-20': { bedtime: '00:30', wakeTime: '07:00' } },
  bodyWeight: { '2026-10-19': 98.9, '2026-10-21': 98.2 },
};

// Every screen and popup, with the lines that must be there (so a screen can't pass by having none).
const insight = 'showScreen("screen-home"); openInsight();';
const STATES = [
  ['Dagoverzicht', 'showScreen("screen-fitness-tracker"); renderHome();', ['set-row in exercise-card']],
  ['Samenvatting', 'showScreen("screen-fitness-tracker"); renderHome(); openDayRecap();', ['recap-ex in overlay-panel']],
  ['Loggen', 'openTraining("bench-press"); switchTab("track");', ['set-row in scherm']],
  ['Geschiedenis', 'openTraining("bench-press"); switchTab("history");', ['set-row in history-card']],
  ['Ga naar-popup', 'openTraining("bench-press"); switchTab("graph"); openHistoryGotoDaySets("2026-10-22", 8, 85);', ['set-row in overlay-panel']],
  ['Records', 'openTraining("bench-press"); openExerciseRecords();', ['records-row in records-list']],
  ['Records-historie', 'openTraining("bench-press"); openExerciseRecords(); openRecordsHistory(1);', ['records-row in overlay-panel']],
  ['Kalender-popup', 'showScreen("screen-fitness-tracker"); openCalendar(); openWorkoutDetail("2026-10-13");', ['set-row in overlay-panel']],
  ['Oefeninginfo', 'openTraining("bench-press"); openExerciseInfo();', ['section-head in overlay-panel']],
  ['Alle oefeningen', 'exerciseScreenMode = "browse"; showScreen("screen-exercises"); renderCategoryBrowser();', ['category-item in list-card']],
  ['Categorie', 'exerciseScreenMode = "browse"; showScreen("screen-exercises"); exerciseBrowserMode = "exercises"; currentBrowseCategory = "chest"; renderExercisesInCategory("chest");', ['exercise-item in list-card']],
  ['⋮-menu', 'exerciseScreenMode = "browse"; showScreen("screen-exercises"); exerciseBrowserMode = "exercises"; currentBrowseCategory = "chest"; renderExercisesInCategory("chest"); showOverflowMenu([{ label: "Bewerken", action: () => {} }, { label: "Verbergen", action: () => {} }, { label: "Verwijderen", action: () => {}, danger: true }], document.querySelector(".exercise-item-dots"));', ['dropdown-item in dropdown-panel']],
  ['Verwijderde oefeningen', 'db.hiddenBuiltins = { [EXERCISE_DB[5].id]: true, [EXERCISE_DB[6].id]: true, [EXERCISE_DB[7].id]: true }; openDeletedExercises();', ['deleted-ex-row in list-card']],
  ['Keuzelijst', 'openFieldPicker("Test", [{ value: "a", label: "Optie A" }, { value: "b", label: "Optie B" }, { value: "c", label: "Optie C" }], "b", () => {});', ['field-picker-row in overlay-panel']],
  ['Keuzelijst meerdere', 'openFieldPickerMulti("Secundair", [{ value: "a", label: "Optie A" }, { value: "b", label: "Optie B" }, { value: "c", label: "Optie C" }], ["b"], {}, () => {});', ['field-picker-row in overlay-panel']],
  ['Nieuwe oefening', 'openNewExerciseScreen();', ['new-ex-group in scherm']],
  ['Oefening bewerken', 'openEditExerciseScreen(EXERCISE_DB.find(e => e.id === "bench-press"));', ['new-ex-group in scherm']],
  ['Trainingsplannen', 'showScreen("screen-workout-plan"); renderPlanList();', []],
  ['Sjablonen', 'showScreen("screen-workout-plan"); renderPlanList(); openPresetsOverlay();', []],
  ['Plan detail', 'openPlanDetail("b"); expandedPlanDayIndex = 0; renderPlanDetail();', ['plan-day-preview in plan-day-card']],
  ['Plan schedule', 'openPlanSchedule("b");', []],
  ['Dag bewerken', 'currentPlanId = "b"; currentPlanData = db.plans.b; openPlanDayEdit(0);', []],
  ['Sets & reps', 'currentPlanId = "b"; currentPlanData = db.plans.b; openPlanDayEdit(0); openPdeSetsRepsEdit(0);', []],
  ['AI genereren', 'openAIGenerate();', []],
  ['Schijvencalculator', 'openPlateCalculator();', ['plate-row in plate-list']],
  ['1RM Calculator', 'open1rmCalculator(); document.getElementById("orm-weight").value = "100"; document.getElementById("orm-reps").value = "5"; document.getElementById("btn-orm-calculate").click();', ['orm-table-row in orm-table-card']],
  ['Warm-up Calculator', 'openWarmupCalculator(); document.getElementById("warmup-weight").value = "100"; document.getElementById("btn-warmup-calculate").click();', []],
  ['Inzicht Week', insight, ['insight-strength-row in insight-card', 'insight-strength-note in insight-card']],
  ['Inzicht Maand', insight + ' insightSwitchPeriod("month"); renderInsight();', ['insight-table-row in insight-day-card', 'insight-strength-row in insight-card']],
  ['Inzicht Jaar', insight + ' insightSwitchPeriod("year"); renderInsight();', ['insight-table-row in insight-day-card']],
  ['Inzicht dag', insight + ' openInsightDay("2026-10-22");', ['insight-mg-row in insight-day-card']],
  ['Inzicht Training', insight + ' openInsightTraining();', ['insight-mg-row in insight-day-card']],
  ['Inzicht spiergroep', insight + ' openInsightTraining(); document.querySelector("[data-insight-mg]").click();', ['insight-mg-row in insight-day-card']],
  ['Inzicht Slaap', insight + ' openInsightMetric("sleep");', ['insight-mg-row in insight-day-card']],
  ['Inzicht Gewicht', insight + ' openInsightMetric("weight");', ['insight-mg-row in insight-day-card']],
  ['Inzicht Kracht', insight + ' openInsightStrength();', []],
  ['Inzicht categorie', insight + ' openInsightStrength(); openInsightCategory("chest");', ['insight-extremes in insight-strength-card']],
];

const codeOf = label => STATES.find(s => s[0] === label)[1];

// In the page: every visible element with a 1px top or bottom border in --border (a line, so not a
// control with a border all round), the y of that line, and its frame: the nearest card, menu or
// popup panel around it, or the screen.
function lineCandidates() {
  const tok = n => { const d = document.createElement('div'); d.style.color = `var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const border = tok('--border');
  const KEYS = ['set-row', 'recap-ex', 'records-row', 'section-head', 'category-item', 'exercise-item', 'deleted-ex-row', 'dropdown-item', 'field-picker-row', 'new-ex-group',
    'plan-day-preview', 'plate-row', 'orm-table-row', 'insight-table-row', 'insight-mg-row', 'insight-strength-row', 'insight-strength-note', 'insight-extremes'];
  const FRAMES = ['exercise-card', 'history-card', 'records-list', 'list-card', 'dropdown-panel', 'overlay-panel', 'plan-day-card', 'plate-list', 'orm-table-card', 'insight-strength-card', 'insight-day-card', 'insight-card'];
  const key = (el, list) => list.find(k => el.classList.contains(k)) || el.tagName.toLowerCase() + [...el.classList].map(c => '.' + c).join('');
  const isFrame = el => { const cs = getComputedStyle(el); return el.classList.contains('overlay-panel') || el.classList.contains('dropdown-panel') || (cs.boxShadow !== 'none' && parseFloat(cs.borderTopLeftRadius) > 0 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'); };
  const lines = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) continue;
    for (const side of ['Top', 'Bottom']) {
      if (cs[`border${side}Width`] !== '1px' || cs[`border${side}Style`] === 'none' || cs[`border${side}Color`] !== border) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const y = Math.round(side === 'Top' ? r.top : r.bottom - 1);
      if (y < 0 || y >= innerHeight - 1) continue;
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y + 0.5);
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el) || hit.parentElement === el.parentElement)) continue; // under a popup
      let f = el.parentElement; while (f && f !== document.body && !isFrame(f)) f = f.parentElement;
      const framed = f && f !== document.body, fr = framed ? f.getBoundingClientRect() : { left: 0, right: innerWidth };
      lines.push({ name: `${key(el, KEYS)} in ${framed ? key(f, FRAMES) : 'scherm'}`, y, fl: fr.left, fr: fr.right });
    }
  }
  return { lines, border };
}

// In the page (installed once as window.__decode): the screenshot as a canvas.
async function decode(png) {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  return ctx;
}
// In the page: per line, where the --border pixels on that pixel row start and end, measured from
// the frame's edges. And the colour of single pixels.
const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
const close = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 9;
async function measureLines({ png, lines, border }) {
  const ctx = await window.__decode(png);
  const b = border.match(/\d+/g).map(Number);
  return lines.map(l => {
    const d = ctx.getImageData(0, l.y, ctx.canvas.width, 1).data;
    let first = null, last = null;
    for (let x = Math.ceil(l.fl); x < Math.floor(l.fr); x++) {
      const i = x * 4;
      if (Math.abs(d[i] - b[0]) + Math.abs(d[i + 1] - b[1]) + Math.abs(d[i + 2] - b[2]) <= 9) { if (first === null) first = x; last = x; }
    }
    return { name: l.name, edges: first === null ? 'geen lijn' : `${Math.round(first - l.fl)}/${Math.round(l.fr - last - 1)}` };
  });
}
async function pixels({ png, points }) {
  const ctx = await window.__decode(png);
  return points.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]);
}
const shot = async page => (await page.screenshot()).toString('base64');
const pixelsAt = async (page, points, png) => page.evaluate(pixels, { png: png || await shot(page), points });

async function setup(page, theme, code) {
  await H.loadData(page, DATA, theme);
  await page.evaluate(() => document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open')));
  await page.evaluate(code);
  await page.waitForTimeout(120);
}

H.run(async () => {
  const allErrors = [];
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    H.section(`${theme} ${w}`);
    // Tall, so every list fits on one screenshot (the screens are fixed to the viewport).
    const { browser, page, errors } = await H.openApp({ width: w, height: 1800, theme });
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}'; document.head.appendChild(st); });
    await page.evaluate(`window.__decode = ${decode}`);
    const tag = `${theme} ${w}`;
    const tok = async n => rgb(await H.tokenColor(page, n));

    // ── 1. Every grey line: 16px from the edges ──
    let total = 0;
    for (const [label, code, must] of STATES) {
      await setup(page, theme, code);
      const { lines, border } = await page.evaluate(lineCandidates);
      const res = await page.evaluate(measureLines, { png: await shot(page), lines, border });
      total += res.length;
      const summary = {};
      for (const r of res) (summary[r.name] = summary[r.name] || new Set()).add(r.edges);
      const got = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, [...v].join(', ')]));
      const want = Object.fromEntries(Object.keys(summary).map(k => [k, '16/16']));
      check(`${tag} ${label}: elke grijze lijn 16px van de randen (links/rechts)`, got, want);
      const missing = must.filter(m => !summary[m]);
      check(`${tag} ${label}: lijnen gevonden (${must.join(', ') || 'geen verwacht'})`, missing, []);
      if (w === 360 && ['Dagoverzicht', 'Records', '1RM Calculator', 'Inzicht Training'].includes(label)) await page.screenshot({ path: path.join(OUT, `${label.replace(/\W+/g, '-')}-${theme}.png`) });
    }
    H.ok(total > 120, `${tag}: ${total} lijnen gemeten`);

    // ── 2. Exception: the blue line under an exercise name / a date runs from edge to edge ──
    for (const [label, code, sel, frame] of [['Dagoverzicht', codeOf('Dagoverzicht'), '.exercise-card-divider', '.exercise-card'], ['Geschiedenis', codeOf('Geschiedenis'), '.history-card-divider', '.history-card']]) {
      await setup(page, theme, code);
      const geo = await page.evaluate(([sel, frame]) => [...document.querySelectorAll(sel)].filter(d => d.offsetParent).map(d => {
        const r = d.getBoundingClientRect(), c = d.closest(frame).getBoundingClientRect();
        return { y: r.top + 1, l: c.left, r: c.right - 1, same: Math.abs(r.left - c.left) < 0.5 && Math.abs(r.right - c.right) < 0.5, h: r.height };
      }), [sel, frame]);
      const px = await pixelsAt(page, geo.flatMap(g => [[g.l, g.y], [g.r, g.y]]));
      const primary = await tok('--primary');
      check(`${tag} ${label}: blauwe lijn (2px --primary) van rand tot rand van de kaart, ook in pixels`,
        { n: geo.length > 0, same: geo.every(g => g.same), h: geo.every(g => g.h === 2), ends: px.every(p => close(p, primary)) }, { n: true, same: true, h: true, ends: true });
    }

    // ── 3. Exception: a chosen or pressed row has its background over the full width of the row ──
    // Keuzelijst: the chosen option.
    await setup(page, theme, codeOf('Keuzelijst'));
    let g = await page.evaluate(() => { const r = document.querySelector('.field-picker-row.selected').getBoundingClientRect(), list = document.querySelector('.field-picker-list').getBoundingClientRect();
      return { y: (r.top + r.bottom) / 2, l: r.left, r: r.right - 1, full: Math.abs(r.left - list.left) < 0.5 && Math.abs(r.right - list.right) < 0.5 }; });
    // 2px in from each end: the rounded corners (--radius-sm) don't reach the middle of the row.
    let px = await pixelsAt(page, [[g.l + 2, g.y], [g.r - 2, g.y]]);
    const pl = await tok('--primary-light');
    check(`${tag} Keuzelijst: gekozen rij --primary-light over de hele breedte van de rij (zo breed als de lijst)`, { full: g.full, ends: px.map(p => close(p, pl)) }, { full: true, ends: [true, true] });
    // Alle oefeningen (in a card): a pressed row is --bg from edge to edge of the card, its line stays 16px in.
    await setup(page, theme, codeOf('Alle oefeningen'));
    g = await page.evaluate(() => { const row = document.querySelectorAll('.list-card .category-item')[1], r = row.getBoundingClientRect(), c = row.closest('.list-card').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: (r.top + r.bottom) / 2, line: Math.round(r.bottom - 1), l: c.left, r: c.right - 1 }; });
    await page.mouse.move(g.x, g.y); await page.mouse.down();
    await page.waitForTimeout(50);
    px = await pixelsAt(page, [[g.l, g.y], [g.r, g.y], [g.l + 8, g.line], [g.r - 8, g.line], [g.l + 16, g.line], [g.r - 16, g.line]]);
    await page.mouse.move(1, 1); await page.mouse.up();
    const bg = await tok('--bg'), bd = await tok('--border');
    check(`${tag} Alle oefeningen: ingedrukte rij --bg van rand tot rand van de kaart, de lijn eronder 16px ingesprongen (uiteinden --bg, vanaf 16px --border)`,
      px.map((p, i) => close(p, i < 4 ? bg : bd)), [true, true, true, true, true, true]);
    // 1RM Calculator (in a card): the row for your reps is --primary-light over the full card width.
    await setup(page, theme, codeOf('1RM Calculator'));
    g = await page.evaluate(() => { const r = document.querySelector('.orm-table-row-own').getBoundingClientRect(), c = document.querySelector('.orm-table-card').getBoundingClientRect();
      return { y: (r.top + r.bottom) / 2, top: Math.round(r.top), l: c.left, r: c.right - 1 }; });
    px = await pixelsAt(page, [[g.l, g.y], [g.r, g.y], [g.l + 4, g.top], [g.r - 4, g.top]]);
    check(`${tag} 1RM Calculator: eigen rij --primary-light van rand tot rand, ook onder de ingesprongen lijn`, px.map(p => close(p, pl)), [true, true, true, true]);

    allErrors.push(...errors);
    await browser.close();
  }
  check('geen JS-fouten', allErrors, []);
});

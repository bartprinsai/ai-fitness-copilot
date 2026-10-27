// Workout Plan Builder: Trainingsplannen (tiles, empty state), Plan schedule (number grid,
// weekday circles, counter, Doorgaan), Plan detail, Dag bewerken (cards, empty state, drag,
// selection, delete), adding exercises from a plan day (plan-add mode of the exercise browser,
// the Sets & reps popup) and the round/square choice controls elsewhere (day picker, AI form,
// calendar, graph filters). See DESIGN_SYSTEM.md "Workout Plan Builder", "Lege staten",
// "Typografie per rol" (Keuzeraster, Vorm: datums rond, aantallen vierkant).
const path = require('path');
const H = require('./helpers');

const NO_TRANSITIONS = () => { const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}'; document.head.appendChild(st); };
const EX_IDS = ['bench-press', 'squat', 'deadlift', 'pull-ups', 'leg-press', 'leg-curl-machine', 'hammer-curl', 'barbell-curl', 'dumbbell-curl', 'cable-curl', 'spider-curl', 'reverse-curl'];
const exList = n => EX_IDS.slice(0, n).map(exerciseId => ({ exerciseId, sets: 3, reps: 10 }));

// In-page helpers, installed once per page.
function installHelpers() {
  window.__st = el => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, font: cs.fontSize + '/' + cs.fontWeight, color: cs.color, bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopColor, radius: parseFloat(cs.borderTopLeftRadius), overflow: el.scrollWidth > el.clientWidth }; };
  window.__tok = t => { const d = document.createElement('div'); d.style.color = `var(${t})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  // Long-press with real TouchEvents (attachLongPress waits 500ms).
  window.__longPress = async el => {
    const r = el.getBoundingClientRect();
    const t = new Touch({ identifier: 2, target: el, clientX: r.left + 20, clientY: r.top + 10 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], changedTouches: [t] }));
    await new Promise(res => setTimeout(res, 650));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t] }));
  };
  // Drags item `from`'s handle up past item `to` with TouchEvents; returns the styles seen mid-drag.
  window.__dragUp = async (from, to) => {
    const list = document.getElementById('pde-list'); const items = list.querySelectorAll('.pde-item');
    const h = items[from].querySelector('.pde-drag-handle'), r = h.getBoundingClientRect();
    const t = y => new Touch({ identifier: 1, target: h, clientX: r.left + 5, clientY: y });
    const fire = (type, y) => h.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t(y)], changedTouches: [t(y)] }));
    const y0 = r.top + r.height / 2, dy = items[from].getBoundingClientRect().top - items[to].getBoundingClientRect().top;
    fire('touchstart', y0);
    fire('touchmove', y0 - 5); await new Promise(res => setTimeout(res, 16));
    const dragged = items[from], inner = dragged.querySelector('.pde-item-inner'), cs = getComputedStyle(inner);
    const during = { shadow: cs.boxShadow, scale: cs.scale, z: getComputedStyle(dragged).zIndex, siblingZ: getComputedStyle(items[to]).zIndex, overflow: getComputedStyle(dragged).overflow, translate: inner.style.transform.includes('translateY') };
    for (let i = 1; i <= 10; i++) { fire('touchmove', y0 - dy * i / 10 - 2); await new Promise(res => setTimeout(res, 16)); }
    fire('touchend', y0 - dy - 2); await new Promise(res => setTimeout(res, 100));
    const ref = document.createElement('div'); ref.className = 'exercise-card-dragging'; document.body.appendChild(ref); during.ref = getComputedStyle(ref).boxShadow; ref.remove();
    return during;
  };
}

H.run(async () => {
  const out = H.outDir(__filename);
  const allErrors = [];

  // ── 1. Plan schedule, day picker, AI form, calendar, graph filters ─────────────
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    const tag = `${theme} ${w}`;
    H.section(`Plan schedule en keuzerasters ${tag}`);
    const { browser, page, errors } = await H.openApp({ width: w, theme });
    await page.evaluate(NO_TRANSITIONS); await page.evaluate(installHelpers);
    await page.evaluate(() => { db.plans = { p: { name: 'Plan', days: [], createdAt: 1, daysPerWeek: 5, fixedDays: true, weekdaysA: [] } }; });
    const T = await page.evaluate(() => Object.fromEntries(['--text', '--text-secondary', '--on-primary', '--primary', '--surface', '--border', '--bg'].map(t => [t, __tok(t)])));
    const shape = s => s.radius >= s.w / 2 - 0.5 ? 'rond' : s.radius === 8 ? 'vierkant 8px' : `radius ${s.radius}`;
    const look = (s, sel) => ({ font: s.font, color: s.color === (sel ? T['--on-primary'] : T['--text']), bg: s.bg === (sel ? T['--primary'] : T['--surface']), border: sel || s.border === '1px ' + T['--border'], fits: !s.overflow, square: Math.abs(s.w - s.h) < 0.6 });
    const LOOK = { font: '15px/500', color: true, bg: true, border: true, fits: true, square: true };

    await page.evaluate(() => { currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanSchedule('p'); });
    await page.waitForTimeout(150);
    const ps = await page.evaluate(() => ({
      nums: [...document.querySelectorAll('#ps-day-count-grid .ps-num-box')].map(b => ({ t: b.textContent, sel: b.classList.contains('selected'), ...__st(b) })),
      days: [...document.querySelectorAll('.ps-weekday-row[data-week="a"] .ps-day-circle')].map(b => ({ t: b.textContent, sel: b.classList.contains('selected'), ...__st(b) })),
      order: [...document.getElementById('ps-weekdays-section').children].filter(c => c.offsetParent).map(c => c.className.split(' ')[0]),
      label: (() => { const l = document.querySelector('#ps-weekdays-section > .section-label'); const cs = getComputedStyle(l); return `${l.textContent} ${cs.fontSize}/${cs.fontWeight} ${cs.textTransform}`; })(),
      counter: (() => { const c = document.getElementById('ps-weekdays-counter'); const cs = getComputedStyle(c); return { t: c.textContent, s: `${cs.fontSize}/${cs.fontWeight}`, color: cs.color }; })(),
      footer: (() => { const cs = getComputedStyle(document.querySelector('.plan-schedule-footer')); return { bg: cs.backgroundColor, border: cs.borderTopWidth }; })(),
      gaps: (() => { const s = [...document.querySelectorAll('#plan-schedule-scroll > .ps-section')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect()); return s.slice(1).map((r, i) => Math.round(r.top - s[i].bottom)); })(),
    }));
    const n0 = ps.nums[0], d0 = ps.days[0];
    H.check(`${tag}: AANTAL DAGEN 1–14 vierkant, Keuzeraster`, [ps.nums.map(b => b.t).join(' '), ps.nums.every(s => shape(s) === 'vierkant 8px'), ps.nums.map(s => look(s, s.sel)).filter(l => JSON.stringify(l) !== JSON.stringify(LOOK)).length], ['1 2 3 4 5 6 7 8 9 10 11 12 13 14', true, 0]);
    H.check(`${tag}: weekdagen rond, Keuzeraster`, [ps.days.map(b => b.t).join(' '), ps.days.every(s => shape(s) === 'rond'), ps.days.map(s => look(s, s.sel)).filter(l => JSON.stringify(l) !== JSON.stringify(LOOK)).length], ['Ma Di Wo Do Vr Za Zo', true, 0]);
    H.check(`${tag}: vierkant en rond even groot`, [n0.w, n0.h], [d0.w, d0.h]);
    H.check(`${tag}: label WEEKDAGEN boven, teller eronder`, [ps.label, ps.order], ['Weekdagen 11px/500 uppercase', ['section-label', 'ps-week-block', 'ps-weekdays-counter']]);
    H.check(`${tag}: teller is een subregel`, [ps.counter.t, ps.counter.s, ps.counter.color === T['--text-secondary']], ['0 / 5 dagen geselecteerd', '12px/400', true]);
    H.check(`${tag}: onderbalk --bg zonder lijn; 24px tussen de blokken`, [ps.footer.bg === T['--bg'], ps.footer.border, ps.gaps.every(g => g === 24)], [true, '0px', true]);

    for (const d of [0, 1, 2, 3]) await page.click(`.ps-weekday-row[data-week="a"] .ps-day-circle[data-day="${d}"]`);
    const s1 = await page.evaluate(() => ({ c: document.getElementById('ps-weekdays-counter').textContent, dis: document.getElementById('btn-plan-schedule-continue').disabled }));
    await page.click('.ps-weekday-row[data-week="a"] .ps-day-circle[data-day="4"]');
    const s2 = await page.evaluate(() => ({ c: document.getElementById('ps-weekdays-counter').textContent, dis: document.getElementById('btn-plan-schedule-continue').disabled, locked: [...document.querySelectorAll('.ps-weekday-row[data-week="a"] .ps-day-circle:disabled')].map(b => b.textContent).join(''), selStyle: __st(document.querySelector('.ps-day-circle.selected')) }));
    H.check(`${tag}: teller loopt mee, Doorgaan pas aan bij 5 dagen, Za/Zo dan vergrendeld`, [s1, { c: s2.c, dis: s2.dis, locked: s2.locked }, look(s2.selStyle, true)], [{ c: '4 / 5 dagen geselecteerd', dis: true }, { c: '5 / 5 dagen geselecteerd', dis: false, locked: 'ZaZo' }, LOOK]);
    await page.click('#ps-day-count-grid .ps-num-box[data-days="10"]');
    const sw = await page.evaluate(() => ({ order: [...document.getElementById('ps-weekdays-section').children].filter(c => c.offsetParent).map(c => c.className.split(' ')[0]), c: document.getElementById('ps-weekdays-counter').textContent, sel: [...document.querySelectorAll('#ps-day-count-grid .selected')].map(b => b.textContent) }));
    H.ok(sw.sel.join() === '10' && sw.order.join() === 'section-label,ps-week-block,ps-week-block,ps-weekdays-counter' && /\/ 10 dagen/.test(sw.c), `${tag}: 10 dagen → week A + B, teller eronder`, sw);
    await page.click('#ps-day-count-grid .ps-num-box[data-days="5"]');
    await page.waitForTimeout(100);
    for (const d of [0, 1, 2, 3, 4]) {
      const sel = await page.evaluate(d => document.querySelector(`.ps-weekday-row[data-week="a"] .ps-day-circle[data-day="${d}"]`).classList.contains('selected'), d);
      if (!sel) await page.click(`.ps-weekday-row[data-week="a"] .ps-day-circle[data-day="${d}"]`);
    }
    await page.click('#btn-plan-schedule-continue'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, days: currentPlanData.days.length }));
    H.check(`${tag}: Doorgaan → Plan detail met 5 dagen`, after, { screen: 'screen-plan-detail', days: 5 });
    if (w === 360) { await page.evaluate(() => openPlanSchedule('p')); await page.waitForTimeout(150); await page.screenshot({ path: path.join(out, `schedule-${theme}.png`) }); }

    // Day picker (Dag toevoegen with fixed days)
    await page.evaluate(() => openPlanWeekdayPicker(undefined)); await page.waitForTimeout(150);
    const dp = await page.evaluate(() => [...document.querySelectorAll('.day-picker-circle')].map(b => ({ dis: b.disabled, ...__st(b) })));
    const free = dp.filter(d => !d.dis), taken = dp.filter(d => d.dis);
    H.check(`${tag}: dagkiezer rond, zelfde maat; bezette dagen grijs`, [free.length > 0, free.every(s => shape(s) === 'rond' && JSON.stringify(look(s, false)) === JSON.stringify(LOOK)), dp[0].w === d0.w, taken.every(d => d.color !== T['--text'])], [true, true, true, true]);
    await page.evaluate(() => closeOverlay('day-picker-overlay'));

    // AI form: Dagen per week = same squares as AANTAL DAGEN
    await page.evaluate(() => openAIGenerate()); await page.waitForTimeout(150);
    const ai = await page.evaluate(() => ({ boxes: [...document.querySelectorAll('#chips-days button')].map(b => ({ t: b.textContent, cls: b.className, sel: b.classList.contains('selected'), ...__st(b) })), snap: getAiGenFormSnapshot().days }));
    const a0 = ai.boxes[0];
    H.check(`${tag}: AI "Dagen per week" = vierkantjes van AANTAL DAGEN`, [ai.boxes.every(b => b.cls.startsWith('ps-num-box') && shape(b) === 'vierkant 8px' && JSON.stringify(look(b, b.sel)) === JSON.stringify(LOOK)), a0.w, a0.h, ai.snap], [true, n0.w, n0.h, '4']);
    await page.click('#chips-days button[data-val="6"]');
    await page.click('#chips-goal .chip[data-val="Strength"]');
    const ai2 = await page.evaluate(() => ({ snap: getAiGenFormSnapshot(), sel: [...document.querySelectorAll('#chips-days .selected')].map(b => b.textContent), goals: document.querySelectorAll('#chips-goal .chip.active').length, goal: getComputedStyle(document.querySelector('#chips-goal .chip')).fontSize }));
    H.check(`${tag}: AI-keuzes werken (één dag- en één doelkeuze); doel-chip 12px`, [ai2.snap.days, ai2.sel, ai2.snap.goal, ai2.goals, ai2.goal], ['6', ['6'], 'Strength', 1, '12px']);
    const sub = await page.locator('#btn-ai-generate-submit').boundingBox();
    H.ok(sub.height === 48 && sub.width > w - 40, `${tag}: Genereer-knop volle breedte, 48px hoog`, sub);

    // Calendar days round, graph period filters pills
    await page.evaluate(() => { db.workouts['2026-10-20'] = [{ exerciseId: 'bench-press', sets: [{ weight: 80, reps: 5 }] }]; openCalendar(); });
    await page.waitForTimeout(200);
    const cal = await page.evaluate(() => __st([...document.querySelectorAll('.cal-day:not(.empty)')][5]));
    H.check(`${tag}: kalenderdag rond`, [shape(cal), Math.abs(cal.w - cal.h) < 0.6], ['rond', true]);
    await page.evaluate(() => { openTraining('bench-press'); switchTab('graph'); }); await page.waitForTimeout(150);
    const tf = await page.evaluate(() => [...document.querySelectorAll('.time-filter')].map(__st));
    H.ok(tf.length > 0 && tf.every(t => t.radius >= t.h / 2 && t.w > t.h), `${tag}: periodefilters in de Grafiek zijn pillen`, tf[0]);
    allErrors.push(...errors);
    await browser.close();
  }

  // ── 2. Trainingsplannen, empty states, Plan detail, Dag bewerken ───────────────
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    const tag = `${theme} ${w}`;
    H.section(`Trainingsplannen en Dag bewerken ${tag}`);
    const { browser, page, errors } = await H.openApp({ width: w, height: 780, theme, touch: true });
    await page.evaluate(NO_TRANSITIONS); await page.evaluate(installHelpers);

    // Tiles
    await page.evaluate(() => { db.plans = {}; showScreen('screen-workout-plan'); renderPlanList(); });
    const tiles = await page.evaluate(() => {
      const row = document.querySelector('.plan-create-row'), cs = getComputedStyle(row), rr = row.getBoundingClientRect();
      const inner = rr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), gap = parseFloat(cs.columnGap) || 0;
      const b = [...document.querySelectorAll('.plan-create-btn')].map(x => { const r = x.getBoundingClientRect(); return { label: x.textContent.trim(), w: r.width, h: r.height }; });
      return { labels: b.map(x => x.label), half: b.every(x => Math.abs(x.w - (inner - gap) / 2) < 0.5), sameH: b[0].h === b[1].h };
    });
    H.check(`${tag}: tegels Zelf samenstellen en Sjablonen, elk de halve rij, even hoog`, tiles, { labels: ['Zelf samenstellen', 'Sjablonen'], half: true, sameH: true });

    // Empty states: tracker (reference), Dag bewerken, Trainingsplannen
    const snap = () => page.evaluate(() => {
      const ti = sel => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(), c = getComputedStyle(e); return { text: e.textContent.trim(), top: Math.round(b.top * 10) / 10, cx: Math.round((b.left + b.width / 2) * 10) / 10, style: `${c.fontSize}/${c.fontWeight} ${c.color}` }; };
      const action = sel => { const btn = document.querySelector(sel), svg = btn.querySelector('svg'), span = btn.querySelector('span'); const r = e => { const x = e.getBoundingClientRect(); return [x.left, x.top, x.width, x.height].map(v => Math.round(v * 10) / 10); }; const sp = getComputedStyle(span); return { btn: r(btn), svg: r(svg), fill: getComputedStyle(svg).fill, span: `${sp.fontSize}/${sp.fontWeight} ${sp.color}`, text: span.textContent, vis: getComputedStyle(btn).visibility, pe: getComputedStyle(btn).pointerEvents }; };
      db.plans = {}; db.workouts = {};
      showScreen('screen-fitness-tracker'); renderHome();
      const tracker = { title: ti('#home-content .home-empty-title'), act: action('#home-content .home-empty-action') };
      db.plans.p = { name: 'P', createdAt: 1, days: [{ name: 'Dag', exercises: [] }] }; currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0);
      const pde = { title: ti('#pde-list .home-empty-title'), act: action('#pde-list .home-empty-action') };
      delete db.plans.p;
      showScreen('screen-workout-plan'); renderPlanList();
      const plans = { title: ti('#plan-list-empty-state .home-empty-title'), act: action('#plan-list-empty-state .home-empty-action') };
      const tileEls = [...document.querySelectorAll('.plan-create-btn')];
      const tb = tileEls[0].getBoundingClientRect();
      const tileHit = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2).closest('.plan-create-btn') === tileEls[0];
      const labelsHidden = document.getElementById('plan-list-label').classList.contains('hidden') && document.getElementById('plan-list-active-section').classList.contains('hidden');
      const tileGap = Math.round(plans.title.top - Math.max(...tileEls.map(x => x.getBoundingClientRect().bottom)));
      return { tracker, pde, plans, tileHit, labelsHidden, tileGap };
    });
    const e = await snap();
    H.check(`${tag}: lege staten — titels en teksten`, [e.tracker.title.text, e.tracker.act.text, e.pde.title.text, e.pde.act.text, e.plans.title.text, e.plans.act.text],
      ['Nog geen workout gelogd', 'Nieuwe workout', 'Nog geen oefeningen', 'Nieuwe oefening', 'Nog geen plannen', 'Nieuw plan']);
    // The button is at least 120px wide and grows with its text, so only its centre, top and height are shared.
    const strip = x => ({ top: x.title.top, cx: x.title.cx, style: x.title.style, btnCx: Math.round(x.act.btn[0] + x.act.btn[2] / 2), btnTop: x.act.btn[1], btnH: x.act.btn[3], minW: x.act.btn[2] >= 120, svg: x.act.svg, fill: x.act.fill, span: x.act.span });
    H.check(`${tag}: Dag bewerken — lege staat identiek aan de tracker (plek, maat, kleur)`, strip(e.pde), strip(e.tracker));
    H.check(`${tag}: Trainingsplannen — lege staat identiek aan de tracker`, strip(e.plans), strip(e.tracker));
    H.check(`${tag}: Trainingsplannen — plusje zichtbaar en aantikbaar, tegels blijven aantikbaar door de laag`, [e.plans.act.vis, e.plans.act.pe, e.tileHit], ['visible', 'auto', true]);
    H.check(`${tag}: zonder plannen geen labels ACTIEF PLAN / MIJN PLANNEN`, e.labelsHidden, true);
    H.ok(e.tileGap >= 24, `${tag}: titel ruim onder de tegels (niets overlapt)`, e.tileGap);
    if (w === 360) await page.screenshot({ path: path.join(out, `plans-empty-${theme}.png`) });
    await page.tap('#btn-plan-empty-add'); await page.waitForTimeout(200);
    H.check(`${tag}: plusje "Nieuw plan" opent hetzelfde als Zelf samenstellen`, await page.evaluate(() => [...document.querySelectorAll('.overlay.open')].map(o => o.id)), ['new-plan-overlay']);
    await page.click('#btn-new-plan-cancel'); await page.waitForTimeout(200);
    const cycle = await page.evaluate(() => {
      db.plans.n = { name: 'Nieuw plan', days: [], createdAt: 2 }; renderPlanList();
      const withPlan = { empty: !document.getElementById('plan-list-empty-state').classList.contains('hidden'), items: document.querySelectorAll('.plan-item').length, label: !document.getElementById('plan-list-label').classList.contains('hidden') };
      delete db.plans.n; renderPlanList();
      return { withPlan, back: !document.getElementById('plan-list-empty-state').classList.contains('hidden') };
    });
    H.check(`${tag}: lege staat weg zodra er een plan is (label MIJN PLANNEN terug), terug zonder plannen`, cycle, { withPlan: { empty: false, items: 1, label: true }, back: true });

    // Dag bewerken: empty-state + and toolbar + both open the add flow for this day
    await page.evaluate(() => { db.plans = { p: { name: 'P', createdAt: 1, scheduleConfirmed: true, days: [{ name: 'Maandag A', exercises: [] }, { name: 'Dinsdag', exercises: [] }] } }; currentPlanId = 'p'; currentPlanData = db.plans.p; openPlanDayEdit(0); });
    const addState = () => page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, mode: exerciseScreenMode, day: currentEditDayIndex }));
    await page.tap('#btn-pde-empty-add'); await page.waitForTimeout(200);
    const viaPlus = await addState();
    await page.evaluate(() => { exerciseScreenMode = 'browse'; showScreen('screen-plan-day-edit'); });
    await page.tap('#btn-pde-add-exercise'); await page.waitForTimeout(200);
    H.check(`${tag}: plusje in de lege staat = toolbar-+`, [viaPlus, await addState()], [{ screen: 'screen-exercises', mode: 'plan-add', day: 0 }, { screen: 'screen-exercises', mode: 'plan-add', day: 0 }]);
    H.check(`${tag}: geen uitleghint op Dag bewerken`, await page.evaluate(() => /Houd ≡|Houd een oefening/.test(document.getElementById('screen-plan-day-edit').innerText)), false);

    // Cards: Dag bewerken = plan cards; Plan detail; Trainingsplannen
    const measure = n => page.evaluate(ex => {
      const r = el => el.getBoundingClientRect();
      const card = el => { const cs = getComputedStyle(el); let clipped = false; for (let p = el.parentElement; p && !p.matches('.pde-list, .plan-list-scroll, .plan-detail-scroll, .screen'); p = p.parentElement) if (getComputedStyle(p).overflow !== 'visible') clipped = true; return { shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, pad: cs.padding, h: Math.round(r(el).height), left: Math.round(r(el).left), w: Math.round(r(el).width), clipped }; };
      db.plans.q = { name: 'Plan 2', days: [], createdAt: 0 };
      db.plans.p.days[0].exercises = ex;
      showScreen('screen-workout-plan'); renderPlanList();
      const pi = document.querySelectorAll('.plan-item');
      const o = { plan: card(pi[0]), planGap: Math.round(r(pi[1]).top - r(pi[0]).bottom), dots: (() => { const s = getComputedStyle(pi[0].querySelector('.plan-item-dots svg')); return `${s.width} ${s.fill}`; })() };
      openPlanDetail('p');
      const tb = r(document.querySelector('#screen-plan-detail .toolbar')).bottom, dc = document.querySelectorAll('.plan-day-card');
      o.detailTop = Math.round(r(dc[0]).top - tb); o.detailGap = Math.round(r(dc[1]).top - r(dc[0]).bottom); o.detailClipped = card(dc[0]).clipped;
      openPlanDayEdit(0);
      const list = document.getElementById('pde-list'), tb2 = r(document.querySelector('#screen-plan-day-edit .toolbar')).bottom;
      const items = [...list.querySelectorAll('.pde-item-inner')];
      o.pde = card(items[0]); o.pdeTop = Math.round(r(items[0]).top - tb2); o.pdeGap = items[1] ? Math.round(r(items[1]).top - r(items[0]).bottom) : null;
      const t = s => { const c = getComputedStyle(items[0].querySelector(s)); return `${c.fontSize}/${c.fontWeight} ${c.color}`; };
      o.name = t('.pde-ex-name'); o.meta = t('.pde-ex-meta'); o.metaText = items[0].querySelector('.pde-ex-meta').textContent;
      const ic = s => { const c = getComputedStyle(items[0].querySelector(s)); return `${c.width} ${c.fill}`; };
      o.chev = ic('.pde-chevron'); o.handle = ic('.pde-drag-handle svg');
      const hb = r(items[0].querySelector('.pde-drag-handle')); o.handleBox = `${hb.width}×${hb.height}`;
      list.scrollTop = list.scrollHeight;
      const pill = document.getElementById('btn-global-ai-coach');
      o.lastAbovePill = Math.round(r(pill).top - r(items[items.length - 1]).bottom);
      list.scrollTop = 0;
      return o;
    }, exList(n));
    const T = await page.evaluate(() => ({ text: __tok('--text'), sec: __tok('--text-secondary') }));
    for (const n of [1, 3, 12]) {
      const m = await measure(n);
      const t = `${tag} ${n} oef.`;
      H.check(`${t}: oefeningkaart = plankaart (schaduw zichtbaar)`, m.pde, { ...m.plan, clipped: false });
      H.check(`${t}: eerste kaart 16px onder de toolbar, 12px ertussen`, [m.pdeTop, n > 1 ? m.pdeGap : 12], [16, 12]);
      H.check(`${t}: naam = Titel in een blok, "3 sets × 10 reps" = Subregel`, [m.name, m.meta, m.metaText], [`16px/500 ${T.text}`, `12px/400 ${T.sec}`, '3 sets × 10 reps']);
      H.check(`${t}: › en ≡ zoals de ⋮ op een plankaart; greep 48×48`, [m.chev, m.handle, m.handleBox], [m.dots, m.dots, '48×48']);
      H.ok(m.lastAbovePill >= 0, `${t}: laatste kaart na scrollen boven de AI Coach-pil`, m.lastAbovePill);
      if (n === 3) {
        H.check(`${t}: Plan detail eerste dagkaart 16px onder de toolbar, 12px ertussen`, [m.detailTop, m.detailGap, m.detailClipped], [16, 12, false]);
        H.check(`${t}: Trainingsplannen 12px tussen plankaarten`, [m.planGap, m.plan.clipped], [12, false]);
      }
    }

    // Drag (3 exercises): reorder + drag look, then back to normal
    await measure(3);
    const normal = await page.evaluate(() => getComputedStyle(document.querySelector('.pde-item-inner')).boxShadow);
    const drag = await page.evaluate(() => __dragUp(1, 0));
    const afterDrag = await page.evaluate(() => {
      const el = document.querySelectorAll('.pde-item')[1], inner = el.querySelector('.pde-item-inner');
      return { order: currentPlanData.days[0].exercises.map(e => e.exerciseId), dom: [...document.querySelectorAll('.pde-ex-name')].map(e => e.textContent), dragging: document.querySelectorAll('.pde-dragging').length, z: getComputedStyle(el).zIndex, shadow: getComputedStyle(inner).boxShadow, transform: inner.style.transform };
    });
    H.check(`${tag}: slepen — volgorde opgeslagen en lijst gelijk`, [afterDrag.order, afterDrag.dom], [['squat', 'bench-press', 'deadlift'], ['Squat', 'Bench press', 'Deadlift']]);
    H.check(`${tag}: tijdens slepen schaduw = gesleepte kaart in de tracker, geen vergroting, boven de buren`, [drag.shadow === drag.ref, drag.scale, drag.z, drag.siblingZ, drag.overflow, drag.translate], [true, 'none', '10', 'auto', 'visible', true]);
    H.check(`${tag}: na loslaten niets achtergebleven`, [afterDrag.dragging, afterDrag.z, afterDrag.shadow === normal, afterDrag.transform], [0, 'auto', true, '']);

    // Selection: long-press → 1, tap → 2, style = selected tracker card; delete both → empty state back
    const sel = await page.evaluate(async () => {
      await __longPress(document.querySelectorAll('#pde-list .pde-item-inner')[0]);
      const one = document.getElementById('pde-sel-count').textContent;
      const inner = document.querySelectorAll('#pde-list .pde-item-inner')[0], cs = getComputedStyle(inner);
      const ref = document.createElement('div'); ref.className = 'exercise-card-selected'; document.body.appendChild(ref); const rc = getComputedStyle(ref);
      const same = ['backgroundColor', 'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset'].every(k => cs[k] === rc[k]); ref.remove();
      document.querySelectorAll('#pde-list .pde-item-inner')[1].click();
      return { active: pdeSel.active, one, two: document.getElementById('pde-sel-count').textContent, same };
    });
    H.check(`${tag}: selecteren — lang drukken, tik erbij; stijl = geselecteerde trackerkaart`, sel, { active: true, one: '1 oefening', two: '2 oefeningen', same: true });
    await page.click('#btn-pde-sel-delete'); await page.waitForTimeout(250);
    H.check(`${tag}: prullenbak vraagt bevestiging met de namen`, await page.evaluate(() => [document.getElementById('delete-pde-exercise-title').textContent, document.getElementById('delete-pde-exercise-msg').textContent]),
      ['Oefeningen verwijderen?', 'Weet je zeker dat je 2 oefeningen ("Squat", "Bench press") wilt verwijderen uit deze dag?']);
    await page.click('#btn-delete-pde-exercise-confirm'); await page.waitForTimeout(300);
    H.check(`${tag}: na verwijderen één oefening over`, await page.evaluate(() => currentPlanData.days[0].exercises.map(e => e.exerciseId)), ['deadlift']);
    await page.evaluate(async () => { await __longPress(document.querySelectorAll('#pde-list .pde-item-inner')[0]); });
    await page.click('#btn-pde-sel-delete'); await page.waitForTimeout(250);
    await page.click('#btn-delete-pde-exercise-confirm'); await page.waitForTimeout(300);
    const back = await page.evaluate(() => { const b = document.querySelector('#pde-list .home-empty-action'); const r = b && b.getBoundingClientRect(); return { empty: document.getElementById('pde-list').classList.contains('is-empty'), btn: r && [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10) }; });
    H.check(`${tag}: laatste oefening weg → lege staat terug op dezelfde plek`, back, { empty: true, btn: e.pde.act.btn });
    if (w === 360) { await measure(3); await page.screenshot({ path: path.join(out, `day-edit-${theme}.png`), clip: { x: 0, y: 0, width: w, height: 420 } }); }
    allErrors.push(...errors);
    await browser.close();
  }

  // ── 3. Adding exercises from a plan day (plan-add mode) ───────────────────────
  for (const theme of ['light', 'dark']) for (const w of [360, 390]) {
    const tag = `${theme} ${w}`;
    H.section(`Oefening toevoegen aan een plandag ${tag}`);
    const { browser, page, errors } = await H.openApp({ width: w, height: 780, theme, touch: true });
    await page.evaluate(NO_TRANSITIONS);
    await page.evaluate(() => { db.plans = { test: { name: 'Test', createdAt: 1, days: [{ name: 'Dag 3', exercises: [] }] } }; currentPlanId = 'test'; currentPlanData = db.plans.test; });
    const openArms = () => page.evaluate(() => { openPlanDayEdit(0); openPlanDayAddExercises(0); exerciseBrowserMode = 'exercises'; currentBrowseCategory = 'arms'; renderExercisesInCategory('arms'); });
    await openArms(); await page.waitForTimeout(200);
    const row = name => `#exercise-list .exercise-item:has(.exercise-item-name:text-is("${name}"))`;
    // Rows within the viewport (elementFromPoint only sees those).
    const geo = await page.evaluate(() => [...document.querySelectorAll('#exercise-list .exercise-item')].filter(r => r.getBoundingClientRect().bottom < window.innerHeight - 80).map(r => {
      const n = r.querySelector('.exercise-item-name'), b = r.querySelector('.ex-add-btn'), d = r.querySelector('.exercise-item-dots');
      const rr = r.getBoundingClientRect(), nr = n.getBoundingClientRect(), br = b.getBoundingClientRect(), dr = d.getBoundingClientRect();
      const after = getComputedStyle(b, '::after'), tw = parseFloat(after.width), th = parseFloat(after.height);
      const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
      const range = document.createRange(); range.selectNodeContents(n);
      const hitDots = document.elementFromPoint(dr.left + dr.width / 2, dr.top + dr.height / 2), hitEdge = document.elementFromPoint(br.right + 4, cy);
      return { name: n.textContent, btn: [br.width, br.height], tap: [tw, th], gapDots: dr.left - (cx + tw / 2), gapName: (cx - tw / 2) - nr.right,
        dotsRight: Math.round(rr.right - dr.right), padRight: parseFloat(getComputedStyle(r).paddingRight),
        hitDots: !!(hitDots && hitDots.closest('.exercise-item-dots')), hitEdge: !!(hitEdge && hitEdge.closest('.ex-add-btn')),
        lines: new Set([...range.getClientRects()].map(x => Math.round(x.top))).size, h: Math.round(rr.height), cursor: getComputedStyle(r).cursor };
    }));
    H.ok(geo.length > 5 && geo.every(x => x.btn.join() === '36,36' && x.tap.join() === '48,48'), `${tag}: plusje 36×36, tikvlak 48×48`, geo[0] && [geo[0].btn, geo[0].tap]);
    H.ok(geo.every(x => x.hitDots && x.gapDots >= 0 && x.hitEdge && x.gapName >= 0), `${tag}: tikvlak plusje valt niet over ⋮ en niet over de naam`, geo.filter(x => !(x.hitDots && x.gapDots >= 0 && x.hitEdge && x.gapName >= 0)).map(x => x.name));
    H.ok(geo.every(x => x.dotsRight === x.padRight && x.h === 56 && x.cursor === 'default'), `${tag}: ⋮ helemaal rechts, rijen 56px, geen knop-cursor`, geo.filter(x => !(x.dotsRight === x.padRight && x.h === 56 && x.cursor === 'default')));
    H.ok(['Preacher curl (dumbbell)', 'Preacher curl (barbell)', 'Incline dumbbell curl'].every(n => (geo.find(x => x.name === n) || {}).lines === 1), `${tag}: lange curl-namen op één regel naast plusje en ⋮`);

    // ⋮ menu also works in add mode
    await page.tap(row('Hammer curl') + ' .exercise-item-dots'); await page.waitForTimeout(200);
    const menu = await page.evaluate(() => [...document.querySelectorAll('.dropdown-item')].filter(e => e.offsetParent).map(e => e.textContent.trim()));
    H.check(`${tag}: ⋮-menu in toevoegmodus`, menu, ['Bewerken', 'Verwijderen', 'Favoriet maken']);
    await page.tap('.dropdown-item:has-text("Favoriet maken")'); await page.waitForTimeout(200);
    H.check(`${tag}: menu-actie "Favoriet maken" uitgevoerd`, await page.evaluate(() => isFavoriteExercise('hammer-curl')), true);
    await page.evaluate(() => { toggleFavoriteExercise('hammer-curl'); refreshExerciseList(); });

    // Taps on the name or the empty space of a row do nothing
    for (const [desc, fn] of [
      ['de naam', () => page.tap(row('Preacher curl (dumbbell)') + ' .exercise-item-name')],
      ['de lege ruimte van de rij', async () => { const b = await page.locator(row('Barbell curl') + ' .ex-add-btn').boundingBox(); const n = await page.locator(row('Barbell curl') + ' .exercise-item-name').boundingBox(); await page.touchscreen.tap(n.x + n.width - 20, b.y + b.height / 2); }],
    ]) {
      await fn(); await page.waitForTimeout(250);
      H.check(`${tag}: tik op ${desc}: niets gebeurt`, await page.evaluate(() => [document.getElementById('pde-sets-reps-overlay').classList.contains('open'), document.querySelector('.screen.active').id, currentPlanData.days[0].exercises.length]), [false, 'screen-exercises', 0]);
    }

    const popupState = () => page.evaluate(() => ({ open: document.getElementById('pde-sets-reps-overlay').classList.contains('open'), title: document.getElementById('pde-sr-title').textContent, save: document.getElementById('btn-pde-sr-save').textContent, uniform: document.getElementById('pde-sr-mode-uniform').classList.contains('active'), sets: document.getElementById('pde-sr-sets').value, reps: document.getElementById('pde-sr-reps').value }));
    const day = () => page.evaluate(() => JSON.parse(JSON.stringify(currentPlanData.days[0].exercises)));
    // + → popup, Annuleren adds nothing
    await page.tap(row('Preacher curl (dumbbell)') + ' .ex-add-btn'); await page.waitForTimeout(300);
    H.check(`${tag}: plusje opent "<naam> toevoegen", voorgevuld 3 × 10`, await popupState(), { open: true, title: 'Preacher curl (dumbbell) toevoegen', save: 'Toevoegen', uniform: true, sets: '3', reps: '10' });
    await page.click('#btn-pde-sr-cancel'); await page.waitForTimeout(250);
    H.check(`${tag}: Annuleren voegt niets toe, plusje blijft`, [await day(), await page.evaluate(() => document.querySelector('.ex-add-btn-done') === null)], [[], true]);
    // Uniform add with own values
    await page.tap(row('Preacher curl (dumbbell)') + ' .ex-add-btn'); await page.waitForTimeout(300);
    await page.fill('#pde-sr-sets', '4'); await page.fill('#pde-sr-reps', '8');
    await page.click('#btn-pde-sr-save'); await page.waitForTimeout(300);
    const added = await page.evaluate(() => { const r = [...document.querySelectorAll('#exercise-list .exercise-item')].find(x => x.querySelector('.exercise-item-name').textContent === 'Preacher curl (dumbbell)'); const b = r.querySelector('.ex-add-btn'); return { done: b.classList.contains('ex-add-btn-done'), bg: getComputedStyle(b).backgroundColor, fill: getComputedStyle(b.querySelector('svg')).fill, size: b.getBoundingClientRect().width, dots: !!r.querySelector('.exercise-item-dots') }; });
    const primary = await H.tokenColor(page, '--primary');
    H.check(`${tag}: toegevoegd als { exerciseId, sets, reps }`, await day(), [{ exerciseId: 'preacher-curl-dumbbell', sets: 4, reps: 8 }]);
    H.check(`${tag}: plusje wordt blauw vinkje (36px, wit vinkje), ⋮ blijft`, added, { done: true, bg: primary, fill: 'rgb(255, 255, 255)', size: 36, dots: true });
    await page.tap(row('Preacher curl (dumbbell)') + ' .ex-add-btn', { force: true }); await page.waitForTimeout(250);
    H.check(`${tag}: tweede tik op het vinkje: niets gebeurt`, [(await popupState()).open, (await day()).length], [false, 1]);
    // Per-set add
    await page.tap(row('Incline dumbbell curl') + ' .ex-add-btn'); await page.waitForTimeout(300);
    H.check(`${tag}: nieuwe popup weer op 3 × 10`, [(await popupState()).sets, (await popupState()).reps], ['3', '10']);
    await page.click('#pde-sr-mode-persets');
    H.check(`${tag}: Andere reps per set: 3 rijen`, await page.locator('.pde-sr-set-row').count(), 3);
    const inputs = page.locator('.pde-sr-set-reps-input');
    await inputs.nth(0).fill('12'); await inputs.nth(1).fill('10'); await inputs.nth(2).fill('8');
    await page.click('#pde-sr-add-set'); await inputs.nth(3).fill('6');
    await page.click('#btn-pde-sr-save'); await page.waitForTimeout(300);
    H.check(`${tag}: per set opgeslagen als { exerciseId, repsPerSet }`, (await day())[1], { exerciseId: 'incline-dumbbell-curl', repsPerSet: [12, 10, 8, 6] });
    // Invalid input keeps the popup open
    await page.tap(row('Spider curl') + ' .ex-add-btn'); await page.waitForTimeout(300);
    await page.fill('#pde-sr-sets', '0'); await page.click('#btn-pde-sr-save'); await page.waitForTimeout(200);
    H.check(`${tag}: ongeldige waarde: popup blijft open, niets toegevoegd`, [(await popupState()).open, (await day()).length], [true, 2]);
    await page.click('#btn-pde-sr-cancel'); await page.waitForTimeout(200);
    if (w === 360) await page.screenshot({ path: path.join(out, `add-${theme}.png`), clip: { x: 0, y: 120, width: w, height: 400 } });
    // Back on Dag bewerken: both exercises, edit popup keeps its own title
    await page.evaluate(() => goBack('screen-plan-day-edit')); await page.waitForTimeout(250);
    H.check(`${tag}: terug op Dag bewerken staan beide oefeningen`, await page.evaluate(() => [...document.querySelectorAll('#pde-list .pde-ex-name')].map(e => e.textContent)), ['Preacher curl (dumbbell)', 'Incline dumbbell curl']);
    await page.evaluate(() => openPdeSetsRepsEdit(0)); await page.waitForTimeout(250);
    const ed = await popupState();
    H.check(`${tag}: bewerkpopup "Sets & reps aanpassen" / "Opslaan" met 4 × 8`, [ed.title, ed.save, ed.sets, ed.reps], ['Sets & reps aanpassen', 'Opslaan', '4', '8']);
    await page.fill('#pde-sr-reps', '5'); await page.click('#btn-pde-sr-save'); await page.waitForTimeout(250);
    H.check(`${tag}: Opslaan past de bestaande oefening aan`, (await day())[0], { exerciseId: 'preacher-curl-dumbbell', sets: 4, reps: 5 });
    allErrors.push(...errors);
    await browser.close();
  }

  // ── 4. Plan list → schedule/detail, week group labels ─────────────────────────
  {
    H.section('Plan openen, weekgroepen');
    const { browser, page, errors } = await H.openApp({ width: 390, height: 844 });
    await page.evaluate(() => {
      db.plans = { p1: { id: 'p1', name: 'Alpha', createdAt: 1, days: [] }, p2: { id: 'p2', name: 'Beta', createdAt: 2, scheduleConfirmed: true, days: [{ name: 'Dag 1', exercises: [] }] } };
      showScreen('screen-workout-plan'); renderPlanList();
    });
    const active = () => page.evaluate(() => document.querySelector('.screen.active').id);
    await page.locator('.plan-item', { hasText: 'Alpha' }).locator('.plan-item-info').click();
    H.check('plan zonder schema opent Plan schedule', await active(), 'screen-plan-schedule');
    const cont = page.locator('#btn-plan-schedule-continue');
    H.check('Doorgaan uit tot er dagen gekozen zijn', await cont.isDisabled(), true);
    await page.click('.ps-num-box[data-days="3"]');
    H.check('aantal dagen kiezen zet Doorgaan aan', [await page.locator('.ps-num-box[data-days="3"]').evaluate(e => e.classList.contains('selected')), await cont.isDisabled()], [true, false]);
    await page.click('#ps-fixed-toggle [data-fixed="1"]');
    H.check('Vaste dagen toont WEEKDAGEN', await page.isVisible('#ps-weekdays-section'), true);
    await page.click('#ps-fixed-toggle [data-fixed="0"]');
    await cont.click(); await page.waitForTimeout(300);
    H.check('Doorgaan → Plan detail met 3 dagen', [await active(), await page.evaluate(() => db.plans.p1.days.length)], ['screen-plan-detail', 3]);
    await page.evaluate(() => { showScreen('screen-workout-plan'); renderPlanList(); });
    await page.locator('.plan-item', { hasText: 'Beta' }).locator('.plan-item-info').click();
    H.check('plan met schema opent Plan detail', await active(), 'screen-plan-detail');
    await page.evaluate(() => { db.plans.p3 = { id: 'p3', name: 'C', createdAt: 3, splitWeeks: true, fixedDays: false, scheduleConfirmed: true, days: [{ name: 'X', group: 'A', exercises: [] }, { name: 'Y', group: 'B', exercises: [] }] }; openPlanDetail('p3'); });
    const labels = await page.locator('.plan-day-group-label').evaluateAll(els => els.map(e => [e.textContent.trim(), e.classList.contains('section-label'), getComputedStyle(e).textTransform]));
    H.ok(labels.length === 2 && labels.every(([t, cls, tt]) => /week/i.test(t) && cls && tt === 'uppercase'), 'weekgroepen met een gedeeld sectielabel', labels);
    allErrors.push(...errors);
    await browser.close();
  }

  H.check('geen JS-fouten', allErrors, []);
});

// Inzicht, Kracht: estimated-1RM rules, the Kracht card and detail screen in Week / Maand / Jaar, records,
// the way to the Grafiek and back, the empty state, Kracht volgen in Oefeninginfo / Nieuwe oefening, layout.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const S = (w, r, o = {}) => ({ weight: String(w), reps: String(r), rpe: '8', extra: '0', extraType: '', ...o });
// Today: Thursday 22 October 2026 (week 43 = 19–25 Oct; week 42 = 12–18 Oct).
const DATA = {
  custom_exercises: [], scheduleVersions: {}, weekCycle: {}, sleep: {}, bodyWeight: {},
  exerciseInfo: {
    'bench-press': { primaryMuscleGroup: 'chest', trackStrength: true },
    'incline-bench-press': { trackStrength: true },
    squat: { trackStrength: true },
    deadlift: { trackStrength: true },
    'barbell-curl': { trackStrength: true },
    treadmill: { trackStrength: true },          // Cardio: never counts
    'lat-pulldown': { primaryMuscleGroup: 'lats' }, // not tracked
  },
  workouts: {
    '2025-03-10': [{ exerciseId: 'bench-press', sets: [S(90, 5)] }],
    '2026-09-15': [{ exerciseId: 'bench-press', sets: [S(95, 5)] }],
    '2026-09-16': [{ exerciseId: 'squat', sets: [S(150, 5)] }],
    '2026-10-06': [{ exerciseId: 'incline-bench-press', sets: [S(75, 8)] }],
    '2026-10-13': [{ exerciseId: 'bench-press', sets: [S(100, 5)] }, { exerciseId: 'squat', sets: [S(140, 5)] }, { exerciseId: 'deadlift', sets: [S(180, 3)] }],
    '2026-10-19': [
      { exerciseId: 'bench-press', sets: [
        S(102.5, 5),                                  // main set of a dropset: counts → 119,6
        S(110, 8, { isDropsetContinuation: true }),  // a drop: would be 139,3 — never counts
        S(95, 6, { extra: '4', extraType: 'partial' }), // full reps only: 114 (with extras 126,7)
        S(0, 10), S(60, 0),                           // 0 kg / 0 reps: never
      ] },
      { exerciseId: 'incline-bench-press', sets: [S(80, 8)] },
      { exerciseId: 'lat-pulldown', sets: [S(200, 10)] },
      { exerciseId: 'treadmill', sets: [S(10, 30)] },
    ],
    '2026-10-20': [{ exerciseId: 'squat', sets: [S(140, 3)] }],
  },
};

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 1400 });
  const setup = async (data = DATA, theme = 'light') => {
    await H.loadData(page, data, theme);
    await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
    await page.waitForTimeout(60);
  };
  const click = async sel => { await page.click(sel); await page.waitForTimeout(80); };
  const card = () => page.evaluate(() => {
    const c = document.querySelector('[data-insight-metric="strength"]');
    return { label: c.querySelector('.insight-card-label').textContent, chevron: !!c.querySelector('.insight-chevron'),
      rows: [...c.querySelectorAll('.insight-strength-row')].map(r => [...r.querySelectorAll('.role-row, .role-sub, .insight-figure')].map(e => e.textContent + (e.querySelector('.insight-success') || e.classList.contains('insight-success') ? '(groen)' : '') + (e.classList.contains('insight-muted') ? '(grijs)' : '')).join(' | ')),
      note: (c.querySelector('.insight-strength-note') || {}).textContent, empty: (c.querySelector('.insight-empty') || {}).textContent,
      trophy: !!c.querySelector('.insight-records .insight-pr') };
  });
  const detail = () => page.evaluate(() => [...document.querySelectorAll('#insight-strength-body .insight-strength-head, #insight-strength-body .insight-mg-row, #insight-strength-body .insight-empty')].map(e => {
    if (e.classList.contains('insight-strength-head')) return '## ' + e.textContent + (e.querySelector('.insight-success') ? '(groen)' : '') + (e.querySelector('.insight-muted') ? '(grijs)' : '');
    if (e.classList.contains('insight-empty')) return 'LEEG: ' + e.textContent;
    const fig = e.querySelector('.insight-figure');
    return (e.querySelector('.insight-pr') ? '🏆 ' : '') + e.querySelector('.role-row').textContent + ' | ' + e.querySelector('.role-sub').textContent
      + (e.querySelector('.role-sub .insight-success') ? '(groen)' : '') + (e.querySelector('.role-sub').classList.contains('insight-muted') ? '(grijs)' : '')
      + ' | ' + fig.textContent + (fig.classList.contains('insight-muted') ? '(grijs)' : '');
  }));

  // ── Rekenregels (pure functies)
  const calc = await page.evaluate(() => ({
    calc: computeOneRm('102,5', '5').oneRm, fn: estimatedOneRm(102.5, 5), one: estimatedOneRm(100, 1),
    dayBench: (Object.assign(db, { workouts: {} }), null),
  }));
  check('1RM Calculator en Kracht geven hetzelfde (102,5 kg × 5)', [calc.calc, calc.fn], [119.6, 119.6]);
  check('1 rep = het gewicht zelf', calc.one, 100);
  await setup();
  const rules = await page.evaluate(() => ({
    bench19: dayBestOneRm('bench-press', '2026-10-19'),
    withDrop: estimatedOneRm(110, 8), withExtras: estimatedOneRm(95, 10), fullReps: estimatedOneRm(95, 6),
    pct: [2.485, -0.8, 0.04, -0.04, 0, 13.92].map(p => insightStrengthPct(p).text + (insightStrengthPct(p).cls ? '(groen)' : '')),
    records: [...getPRSetKeys('bench-press')].sort(),
  }));
  check('bench 19 okt: hoofdset van de dropset telt (119,6), drop (139,3) en extra reps (126,7) niet', [rules.bench19, rules.withDrop, rules.withExtras, rules.fullReps], [119.6, 139.3, 126.7, 114]);
  check('percentage: 1 decimaal, komma, teken, geen rood', rules.pct, ['+2,5(groen)', '−0,8', '0,0', '0,0', '0,0', '+13,9(groen)']);
  check('trofeeën bench (getPRSetKeys)', rules.records, ['2026-10-19#0', '2026-10-19#2']);

  // ── Week 43 vs week 42
  check('Week: kaart', await card(), {
    label: 'Kracht3 records', chevron: true,
    rows: ['Borst | +2,5%(groen) | 3 records', 'Rug | Geen vergelijking(grijs)', 'Armen | Geen vergelijking(grijs)', 'Benen | −5,7%'],
    note: 'Gemiddelde verandering van de geschatte 1RM t.o.v. week 42', trophy: true });
  await click('[data-insight-metric="strength"]');
  const wk = await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, title: document.querySelector('#insight-strength-head .insight-nav-title').textContent,
    schema: !!document.querySelector('#screen-insight-strength .insight-meta:not(#insight-strength-head .insight-meta)'), label: document.querySelector('#insight-strength-body .insight-label').textContent }));
  check('Week: detailscherm opent in dezelfde periode, zonder schemaregel', wk, { screen: 'screen-insight-strength', title: 'Week 43', schema: false, label: 'Geschatte 1RM per oefening' });
  check('Week: detail (incline alleen deze week = geen vergelijking, telt niet in Borst; deadlift niet gedaan; curl nooit)', await detail(), [
    '## Borst+2,5%(groen)', '🏆 Bench press | +2,9 kg(groen) | 119,6kg', '🏆 Incline bench press | Geen vergelijking(grijs) | 101,3kg',
    '## RugGeen vergelijking(grijs)', 'Deadlift | Niet gedaan(grijs) | 198kg(grijs)',
    '## ArmenGeen vergelijking(grijs)', 'Barbell curl | Niet gedaan(grijs) | –(grijs)',
    '## Benen−5,7%', 'Squat | −9,3 kg | 154kg']);

  // ── Maand: Oktober vs September
  await click('#insight-strength-head [data-insight-period="month"]');
  check('Maand: detail', await detail(), [
    '## Borst+7,9%(groen)', '🏆 Bench press | +8,8 kg(groen) | 119,6kg', '🏆 Incline bench press | Geen vergelijking(grijs) | 101,3kg',
    '## RugGeen vergelijking(grijs)', '🏆 Deadlift | Geen vergelijking(grijs) | 198kg',
    '## ArmenGeen vergelijking(grijs)', 'Barbell curl | Niet gedaan(grijs) | –(grijs)',
    '## Benen−6,7%', 'Squat | −11,7 kg | 163,3kg']);
  await page.goBack(); await page.waitForTimeout(200);
  check('Maand: terug → hoofdscherm in Oktober', await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-head .insight-nav-title').textContent]), ['screen-insight', 'Oktober 2026']);
  check('Maand: kaart', (await card()).note, 'Gemiddelde verandering van de geschatte 1RM t.o.v. september');
  // ── Jaar: 2026 vs 2025
  await click('#insight-head [data-insight-period="year"]');
  const yc = await card();
  check('Jaar: kaart', [yc.rows, yc.note, yc.label], [['Borst | +13,9%(groen) | 3 records', 'Rug | Geen vergelijking(grijs) | 1 record', 'Armen | Geen vergelijking(grijs)', 'Benen | Geen vergelijking(grijs) | 1 record'],
    'Gemiddelde verandering van de geschatte 1RM t.o.v. 2025', 'Kracht5 records']);
  // 2025: bench gedaan, 2024 niet; records alleen in 2025
  await click('#insight-head [data-insight-step="-1"]');
  const y25 = await card();
  check('Jaar 2025: geen records = geen trofee rechtsboven, geen "records"-regel', [y25.label, y25.trophy, y25.rows[0]], ['Kracht', false, 'Borst | Geen vergelijking(grijs)']);

  // ── Tik op een oefening → Grafiek, en terug (pijl en Android-terug), in dezelfde periode
  for (const how of ['arrow', 'browser']) {
    await setup();
    await click('#insight-head [data-insight-period="month"]');
    await click('[data-insight-metric="strength"]');
    await click('#insight-strength-body [data-insight-exercise="squat"]');
    const g = await page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, title: document.getElementById('training-title').textContent, tab: document.querySelector('.tab.active').dataset.tab }));
    check(`${how}: rij Squat opent de Grafiek`, g, { screen: 'screen-training', title: 'Squat', tab: 'graph' });
    if (how === 'arrow') await page.evaluate(() => document.getElementById('btn-back-training').click()); else await page.goBack();
    await page.waitForTimeout(250);
    check(`${how}: terug → Kracht in Oktober 2026`, await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-strength-head .insight-nav-title').textContent]), ['screen-insight-strength', 'Oktober 2026']);
    if (how === 'arrow') await page.evaluate(() => document.getElementById('btn-back-insight-strength').click()); else await page.goBack();
    await page.waitForTimeout(250);
    check(`${how}: nog eens terug → hoofdscherm in Oktober 2026`, await page.evaluate(() => [document.querySelector('.screen.active').id, document.querySelector('#insight-head .insight-nav-title').textContent]), ['screen-insight', 'Oktober 2026']);
  }

  // ── Lege staat
  const EMPTY = JSON.parse(JSON.stringify(DATA));
  Object.values(EMPTY.exerciseInfo).forEach(i => delete i.trackStrength);
  EMPTY.exerciseInfo.treadmill = { trackStrength: true }; // Cardio alone: still empty
  await setup(EMPTY);
  const ec = await card();
  check('lege staat: kaart', [ec.label, ec.empty, ec.chevron, ec.rows], ['Kracht', 'Zet Kracht volgen aan bij een oefening om je kracht hier te volgen.', true, []]);
  await click('[data-insight-metric="strength"]');
  check('lege staat: detail', await detail(), ['LEEG: Zet Kracht volgen aan bij een oefening om je kracht hier te volgen.']);

  // ── Oefeninginfo: Kracht volgen
  await setup();
  const info = async () => page.evaluate(() => {
    const v = document.getElementById('exercise-info-view-content');
    return [...v.querySelectorAll('.section-head')].map(h => h.textContent).join(',') + ' / ' + [...v.querySelectorAll('.info-view-stat')].map(s => s.textContent).join(' · ');
  });
  await page.evaluate(() => { openTraining('incline-bench-press'); openExerciseInfo(); }); await page.waitForTimeout(80);
  check('bekijken, aan: INZICHT met Kracht volgen Ja', await info(), 'Spiergroep,Inzicht / PrimairNiet ingesteld · SecundairNiet ingesteld · Kracht volgenJa');
  await click('#btn-exercise-info-edit');
  const ed = await page.evaluate(() => ({ heads: [...document.querySelectorAll('#exercise-info-edit-mode .section-head')].filter(h => h.offsetParent).map(h => h.textContent),
    btn: document.getElementById('info-track-strength').textContent, pressed: document.getElementById('info-track-strength').getAttribute('aria-pressed'),
    hint: document.getElementById('info-track-strength-hint').textContent }));
  check('bewerken: sectie tussen Spiergroep en Apparatuur, knop Ja, hulpregel', ed, { heads: ['Spiergroep', 'Inzicht', 'Apparatuur'], btn: 'Ja', pressed: 'true', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Borst.' });
  await page.screenshot({ path: path.join(OUT, 'info-edit-light-360.png') });
  await click('#info-track-strength');
  await click('#btn-exercise-info-save');
  check('uit + opslaan: veld weg uit de opslag, sectie INZICHT weg bij bekijken', [JSON.stringify(await page.evaluate(() => db.exerciseInfo['incline-bench-press'] || null)), await info()],
    ['null', 'Spiergroep / PrimairNiet ingesteld · SecundairNiet ingesteld']);
  await click('#btn-exercise-info-edit');
  check('standaard uit (Nee)', await page.evaluate(() => document.getElementById('info-track-strength').textContent), 'Nee');
  await click('#info-track-strength');
  await click('#btn-exercise-info-save');
  check('aan + opslaan: trackStrength true, andere velden blijven', await page.evaluate(() => db.exerciseInfo['incline-bench-press']), { trackStrength: true });
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Andere velden bewaren trackStrength
  await page.evaluate(() => { openTraining('bench-press'); openExerciseInfo(); }); await page.waitForTimeout(50);
  await click('#btn-exercise-info-edit'); await click('#info-powerlift-bench'); await click('#btn-exercise-info-save');
  check('Powerliftbank wijzigen houdt Kracht volgen', await page.evaluate(() => db.exerciseInfo['bench-press']), { primaryMuscleGroup: 'chest', trackStrength: true, powerliftBench: true });
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Cardio
  await page.evaluate(() => { openTraining('treadmill'); openExerciseInfo(); }); await page.waitForTimeout(50);
  const cv = await info();
  await click('#btn-exercise-info-edit');
  const ce = await page.evaluate(() => [...document.querySelectorAll('#exercise-info-edit-mode .section-head')].filter(h => h.offsetParent).map(h => h.textContent).concat(document.getElementById('info-track-strength').offsetParent ? ['knop zichtbaar'] : []));
  check('Cardio: niet bij bekijken (ook al staat trackStrength opgeslagen), niet bij bewerken', [cv, ce], ['Spiergroep / PrimairNiet ingesteld · SecundairNiet ingesteld', ['Spiergroep', 'Apparatuur']]);
  await page.evaluate(() => closeOverlay('exercise-info-overlay')); await page.waitForTimeout(50);
  // Nieuwe oefening / Oefening bewerken
  await page.evaluate(() => openNewExerciseScreen()); await page.waitForTimeout(350);
  const nx = () => page.evaluate(() => ({ shown: !!document.getElementById('new-ex-info-insight-head').offsetParent, btn: document.getElementById('new-ex-info-track-strength').textContent, hint: document.getElementById('new-ex-info-track-strength-hint').textContent }));
  check('Nieuwe oefening: zichtbaar, uit, hulpregel zonder categorie', await nx(), { shown: true, btn: 'Nee', hint: 'Telt mee voor Kracht in Inzicht.' });
  await page.evaluate(() => { document.getElementById('new-ex-name').value = 'Hip thrust'; });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="legs"]');
  await click('#new-ex-info-track-strength');
  check('Nieuwe oefening: categorie Benen, aan', await nx(), { shown: true, btn: 'Ja', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Benen.' });
  await page.screenshot({ path: path.join(OUT, 'new-ex-light-360.png'), fullPage: true });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="cardio"]');
  check('Nieuwe oefening: Cardio → sectie weg', (await nx()).shown, false);
  await click('#new-ex-category'); await click('#field-picker-list [data-value="legs"]');
  await click('#btn-new-ex-save');
  const hip = await page.evaluate(() => { const e = db.custom_exercises.find(x => x.name === 'Hip thrust'); return e && db.exerciseInfo[e.id]; });
  check('Nieuwe oefening opgeslagen met Kracht volgen', hip, { trackStrength: true });
  await page.evaluate(() => openEditExerciseScreen(findExercise('squat'))); await page.waitForTimeout(100);
  check('Oefening bewerken (squat): aan, Benen', await nx(), { shown: true, btn: 'Ja', hint: 'Telt mee voor Kracht in Inzicht, bij de categorie Benen.' });
  await click('#new-ex-category'); await click('#field-picker-list [data-value="cardio"]');
  await click('#btn-new-ex-save');
  check('Oefening naar Cardio verplaatst: Kracht volgen vervalt', await page.evaluate(() => db.exerciseInfo.squat || null), null);

  // ── Layout: licht/donker, 360/390
  for (const wpx of [360, 390]) for (const theme of ['light', 'dark']) {
    const tag = `${theme} ${wpx}px`;
    await page.setViewportSize({ width: wpx, height: 1400 });
    await setup(DATA, theme);
    await page.evaluate(() => document.getElementById('insight-cards').lastElementChild.scrollIntoView());
    const ov = () => page.evaluate(() => { const s = document.querySelector('.screen.active .insight-scroll'); return document.documentElement.scrollWidth > innerWidth || s.scrollWidth > s.clientWidth; });
    check(`${tag}: hoofdscherm geen horizontale overloop`, await ov(), false);
    await page.screenshot({ path: path.join(OUT, `main-week-${theme}-${wpx}.png`), fullPage: true });
    await page.evaluate(() => document.querySelector('[data-insight-metric="strength"]').scrollIntoView());
    await page.screenshot({ path: path.join(OUT, `card-week-${theme}-${wpx}.png`) });
    for (const per of ['week', 'year']) {
      await click(`#insight-head [data-insight-period="${per}"]`);
      const cl = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-insight-metric="strength"] .insight-strength-row')];
        const base = el => { const r = document.createRange(); r.selectNodeContents(el); const rc = r.getClientRects()[0]; return rc.bottom; };
        return rows.map(r => {
          const name = r.querySelector('.role-row'), fig = r.querySelector('.insight-mg-figure'), first = fig.firstElementChild, rec = fig.querySelector(':scope > .role-sub:not(.insight-muted)');
          const nameBase = base(name), figText = first.classList.contains('insight-figure') ? first.querySelector('.set-val') : first;
          const fr = fig.getBoundingClientRect(), rr = rec && rec.getBoundingClientRect();
          return { name: name.textContent, records: rec ? rec.textContent : '',
            sameBaseline: Math.abs(nameBase - base(figText)) < 1.5,
            recRightAligned: rec ? Math.abs(rr.right - fr.right) < 1 && Math.abs(first.getBoundingClientRect().right - fr.right) < 1 : true,
            recUnder: rec ? rr.top >= first.getBoundingClientRect().bottom - 0.5 : true,
            recStyle: rec ? getComputedStyle(rec).fontSize + '/' + getComputedStyle(rec).fontWeight : '' };
        });
      });
      const ok = cl.every(c => c.sameBaseline && c.recRightAligned && c.recUnder && (!c.records || c.recStyle === '12px/400'));
      check(`${tag} ${per}: kaart — met records (${cl.filter(c => c.records).map(c => c.name).join(', ')}) en zonder (${cl.filter(c => !c.records).map(c => c.name).join(', ')}): percentage op de basislijn van de naam, "record" rechts onder het percentage, Klein`, ok, true);
      if (!ok) console.log(JSON.stringify(cl));
      await page.evaluate(() => document.querySelector('[data-insight-metric="strength"]').scrollIntoView());
      await page.screenshot({ path: path.join(OUT, `card2-${per}-${theme}-${wpx}.png`) });
    }
    await click('#insight-head [data-insight-period="week"]');
    await click('[data-insight-metric="strength"]');
    for (const per of ['week', 'month', 'year']) {
      await click(`#insight-strength-head [data-insight-period="${per}"]`);
      const lay = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#insight-strength-body .insight-mg-row')];
        const clipped = [...document.querySelectorAll('#insight-strength-body .role-row, #insight-strength-body .role-sub, #insight-strength-body .insight-figure')].filter(e => e.scrollWidth > e.clientWidth + 0.5).map(e => e.textContent);
        const h = rows.map(r => Math.round(r.getBoundingClientRect().height - parseFloat(getComputedStyle(r).borderTopWidth))); console.log(JSON.stringify(h));
        const centred = rows.every(r => { const a = r.getBoundingClientRect(), f = r.querySelector('.insight-mg-figure').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (f.top + f.bottom) / 2) < 1; });
        const col = getComputedStyle(document.querySelector('#insight-strength-body .insight-success')).color;
        const muted = getComputedStyle(document.querySelector('#insight-strength-body .insight-figure.insight-muted .set-val')).color;
        const tok = n => { const d = document.createElement('div'); d.style.color = `var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
        return { clipped, minH: Math.min(...h), sameH: new Set(h).size === 1, centred, green: col === tok('--success'), muted: muted === tok('--text-muted') };
      });
      check(`${tag} ${per}: niets afgekapt, rijen ≥ 48px en even hoog, waarde in het midden, groen = --success, grijs = --text-muted, geen overloop`,
        [lay.clipped, lay.minH >= 48, lay.sameH, lay.centred, lay.green, lay.muted, await ov()], [[], true, true, true, true, true, false]);
      await page.screenshot({ path: path.join(OUT, `strength-${per}-${theme}-${wpx}.png`), fullPage: true });
    }
  }
  await browser.close();
  check('geen JS-fouten', errors, []);
});

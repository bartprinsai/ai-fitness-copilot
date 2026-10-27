// Grafiek-tab (Fitness Tracker): afgeleide sets (een set van 5 reps telt ook mee voor 3 en 4 reps),
// de legenda Exact/Afgeleid, de knop "Afgeleide sets" (aan/uit, op één regel naast het REPS-veld)
// en de detailregel "Afgeleid van N reps". Plus de Records van dezelfde oefening: een record dat
// uit een zwaardere set komt toont "via 5RM", zonder de woorden Exact/Afgeleid.
// Licht en donker, 360 en 390 px breed.
const path = require('path');
const H = require('./helpers');

H.run(async () => {
  const out = H.outDir(__filename);
  for (const theme of ['light', 'dark']) for (const width of [360, 390]) {
    const tag = `[${theme} ${width}px]`;
    H.section(`Grafiek ${tag}`);
    const { browser, page, errors } = await H.openApp({ width, height: 780, theme, scale: 2 });
    // 150×5 op 1 sep (telt mee voor 3 en 4 reps), 140×3 op 8 sep, 155×3 op 15 sep
    await H.loadData(page, {
      workouts: {
        '2026-09-01': [{ exerciseId: 'bench-press', sets: [{ weight: 150, reps: 5 }] }],
        '2026-09-08': [{ exerciseId: 'bench-press', sets: [{ weight: 140, reps: 3 }] }],
        '2026-09-15': [{ exerciseId: 'bench-press', sets: [{ weight: 155, reps: 3 }] }],
      },
    }, theme);
    const r = await page.evaluate(async () => {
      currentExerciseId = 'bench-press';
      graphRepsByExercise['bench-press'] = 3;
      showScreen('screen-training');
      switchTab('graph');
      await new Promise(res => setTimeout(res, 100));
      const btn = document.getElementById('graph-derived');
      const sel = document.getElementById('graph-reps');
      const legend = document.getElementById('graph-legend');
      const via = () => { const e = document.querySelector('#graph-sel-date .graph-sel-via'); return e ? e.textContent : null; };
      const o = {};
      o.btnText = btn.textContent.trim();
      const br = btn.getBoundingClientRect(), sr = sel.getBoundingClientRect();
      o.btnHeight = br.height;
      o.btnOneLine = br.height <= 40 && btn.scrollWidth <= btn.clientWidth;
      o.sameRow = Math.abs((br.top + br.bottom) / 2 - (sr.top + sr.bottom) / 2) < 1 && br.left > sr.right;
      o.btnInViewport = br.right <= window.innerWidth;
      o.legend = [...document.querySelectorAll('#graph-legend .graph-legend-item')].map(e => e.textContent.trim());
      o.legendVisible = !legend.classList.contains('hidden');
      o.series = graphSeries.map(p => `${p.date}:${p.val}x${p.reps}${p.derived ? 'd' : ''}`);
      selectGraphPoint(graphSeries.findIndex(p => p.derived));
      o.derivedVia = via();
      selectGraphPoint(graphSeries.findIndex(p => !p.derived));
      o.directVia = via();
      // 4 reps: alleen het afgeleide punt 150×5
      graphRepsByExercise['bench-press'] = 4; renderGraph();
      selectGraphPoint(0);
      o.via4 = via();
      graphRepsByExercise['bench-press'] = 3; renderGraph();
      const state = () => ({ pressed: btn.getAttribute('aria-pressed'), active: btn.classList.contains('active'), legendHidden: legend.classList.contains('hidden'), n: graphSeries.length, anyDerived: graphSeries.some(p => p.derived) });
      o.initial = state();
      btn.click();
      o.off = state();
      btn.click();
      o.on = state();
      return o;
    });
    await page.screenshot({ path: path.join(out, `graph-${theme}-${width}.png`) });
    H.check(`${tag} knoptekst`, r.btnText, 'Afgeleide sets');
    H.ok(r.btnOneLine && r.sameRow && r.btnInViewport, `${tag} knop op één regel (h=${r.btnHeight}) naast REPS-veld, binnen scherm`, r);
    H.check(`${tag} reeks 3 reps (datum:gewicht x bron-reps, d = afgeleid)`, r.series, ['2026-09-01:150x5d', '2026-09-08:140x3', '2026-09-15:155x3']);
    H.check(`${tag} legenda`, r.legend, ['Exact', 'Afgeleid']);
    H.ok(r.legendVisible, `${tag} legenda zichtbaar`);
    H.check(`${tag} detail afgeleid punt (3 reps)`, r.derivedVia, 'Afgeleid van 5 reps');
    H.check(`${tag} detail afgeleid punt (4 reps)`, r.via4, 'Afgeleid van 5 reps');
    H.check(`${tag} geen afgeleid-regel bij exact punt`, r.directVia, null);
    H.check(`${tag} standaard aan`, r.initial, { pressed: 'true', active: true, legendHidden: false, n: 3, anyDerived: true });
    H.check(`${tag} uit`, r.off, { pressed: 'false', active: false, legendHidden: true, n: 2, anyDerived: false });
    H.check(`${tag} weer aan`, r.on, { pressed: 'true', active: true, legendHidden: false, n: 3, anyDerived: true });

    H.section(`Records ${tag}`);
    const rec = await page.evaluate(() => {
      openExerciseRecords();
      return [...document.querySelectorAll('#records-list .records-row, #records-hero')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
    });
    await page.screenshot({ path: path.join(out, `records-${theme}-${width}.png`) });
    const r4 = rec.find(t => t.startsWith('4RM'));
    H.ok(/via 5RM/.test(r4 || ''), `${tag} Records 4RM via 5RM: "${r4}"`, rec);
    H.ok(!rec.some(t => /Afgeleid|Exact/.test(t)), `${tag} Records zonder Exact/Afgeleid`, rec);
    await browser.close();
    H.check(`${tag} geen JS-fouten`, errors, []);
  }
});

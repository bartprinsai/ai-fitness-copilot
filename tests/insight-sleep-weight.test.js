// Inzicht, Slaap and Gewicht detail screens (week): summary, chart, list, filling in / changing / clearing
// from the list, browsing, back navigation; axis label style, row heights and the shortest/longest-night note.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

// Today: Friday 23 October 2026 (week 43: 19–25 oktober)
const DATA = {
  workouts: {}, scheduleVersions: {}, weekCycle: {},
  sleep: {
    // week 43: Mon 7:10, Tue 6:30 (short), Wed missing, Thu 5:50 (short), Fri 7:55
    '2026-10-19': { bedtime: '23:50', wakeTime: '07:00' },
    '2026-10-20': { bedtime: '00:30', wakeTime: '07:00' },
    '2026-10-22': { bedtime: '01:10', wakeTime: '07:00' },
    '2026-10-23': { bedtime: '23:05', wakeTime: '07:00' },
    // week 41: only 23:50 and 00:30 → average bedtime 00:10
    '2026-10-06': { bedtime: '23:50', wakeTime: '07:00' },
    '2026-10-08': { bedtime: '00:30', wakeTime: '07:10' },
  },
  bodyWeight: {
    '2026-10-14': 98.9,                                          // week 42
    '2026-10-19': 98.9, '2026-10-21': 98.2, '2026-10-23': 98.6,  // week 43, gaps
    '2026-10-07': 80.25,                                          // week 41: one point, week 40 empty
  },
};
// For the axis/row scenarios: extra nights in week 40 (one night, 7:40), week 39 (a night of 10:30),
// week 38 (8:00 + 8:30) and week 37 (exactly 9:00).
const DATA_AXIS = JSON.parse(JSON.stringify(DATA));
Object.assign(DATA_AXIS.sleep, {
  '2026-09-30': { bedtime: '23:00', wakeTime: '06:40' },
  '2026-09-21': { bedtime: '21:00', wakeTime: '07:30' }, '2026-09-22': { bedtime: '23:00', wakeTime: '06:00' },
  '2026-09-14': { bedtime: '23:00', wakeTime: '07:00' }, '2026-09-15': { bedtime: '22:30', wakeTime: '07:00' },
  '2026-09-07': { bedtime: '22:00', wakeTime: '07:00' },
});
async function setup(page, theme = 'light', data = DATA) {
  await H.loadData(page, data, theme);
  await page.evaluate(() => { showScreen('screen-home'); openInsight(); });
  await H.settle(page);
}
const active = page => page.evaluate(() => document.querySelector('.screen.active').id);
const headOf = (page, scr) => page.evaluate(scr => {
  const s = document.getElementById(scr);
  return [s.querySelector('.insight-nav-title').textContent, s.querySelector('.insight-meta').textContent, s.querySelector('[data-insight-step="1"]').disabled];
}, scr);
const summary = page => page.evaluate(() => {
  const c = document.querySelector('#insight-metric-body .insight-summary');
  return { cols: [...c.querySelectorAll('.insight-summary-cols > div')].map(d => d.innerText.replace(/\s+/g, ' ').trim()),
    note: (c.querySelector('.insight-summary-note') || {}).textContent || null, empty: (c.querySelector('.insight-empty') || {}).textContent || null };
});
const list = page => page.evaluate(() => [...document.querySelectorAll('#insight-metric-body .insight-list-row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
const chart = page => page.evaluate(() => {
  const svg = document.querySelector('#insight-chart svg');
  if (!svg) return null;
  return {
    bars: [...svg.querySelectorAll('.insight-bar')].map(b => b.classList.contains('is-short') ? 'rood' : 'blauw'),
    ticks: [...svg.querySelectorAll('.insight-chart-tick')].map(t => t.textContent),
    days: [...svg.querySelectorAll('.insight-chart-day')].map(t => t.textContent),
    line: !!svg.querySelector('.insight-line'), points: svg.querySelectorAll('.insight-point').length,
    avg: !!svg.querySelector('.insight-chart-avg'),
  };
});
const toastMsg = page => page.evaluate(() => document.getElementById('toast-msg').textContent);
const colours = page => page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const toRgb = v => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  // Draw the Fitness Tracker's Grafiek and record the style of every text it writes on the canvas.
  const seen = [], P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  P.fillText = function (t, ...r) { seen.push(toRgb(this.fillStyle) + ' / ' + this.font); return orig.call(this, t, ...r); };
  const wrap = document.getElementById('graph-chart-wrap');
  let el = wrap; const shown = []; while (el && el !== document.body) { if (getComputedStyle(el).display === 'none') { shown.push([el, el.style.display]); el.style.display = 'block'; } el = el.parentElement; }
  graphSeries = [{ date: '2026-10-01', val: 100 }, { date: '2026-10-08', val: 105 }, { date: '2026-10-15', val: 110 }];
  drawGraphChart();
  P.fillText = orig; shown.forEach(([e, d]) => { e.style.display = d; });
  return { muted: toRgb(root.getPropertyValue('--text-muted').trim()), grafiek: [...new Set(seen)] };
});
const openWeek = (page, kind, weekStart) => page.evaluate(([k, w]) => { insightWeekStart = w; openInsightMetric(k); }, [kind, weekStart]).then(() => H.settle(page));
const axis = page => page.evaluate(() => {
  const svg = document.querySelector('#insight-chart svg');
  const st = sel => [...svg.querySelectorAll(sel)].map(e => { const cs = getComputedStyle(e); return [cs.fill, cs.fontSize, cs.fontWeight].join(' / '); });
  return { ticks: st('.insight-chart-tick'), days: st('.insight-chart-day') };
});
const rows = page => page.evaluate(() => [...document.querySelectorAll('.insight-list-row')].map(r => {
  const rb = r.getBoundingClientRect(), bt = parseFloat(getComputedStyle(r).borderTopWidth);
  const f = r.querySelector('.insight-mg-figure');
  const mid = (rb.top + bt + rb.bottom) / 2;
  return { h: Math.round((rb.height - bt) * 10) / 10, filled: !!f,
    figOffset: f ? Math.round(((f.getBoundingClientRect().top + f.getBoundingClientRect().bottom) / 2 - mid) * 10) / 10 : null };
}));
const noteLines = page => page.evaluate(() => { const n = document.querySelector('.insight-summary-note');
  return { lines: [...n.children].map(c => c.textContent), dot: n.textContent.includes('·'),
    stacked: n.children.length < 2 || n.children[1].getBoundingClientRect().top >= n.children[0].getBoundingClientRect().bottom,
    centered: getComputedStyle(n).textAlign, fs: getComputedStyle(n).fontSize,
    oneLineEach: [...n.children].every(c => c.getBoundingClientRect().height < 20) }; });

H.run(async () => {
  // Today: Friday 23 October 2026
  const { browser, page, errors } = await H.openApp({ width: 360, height: 760, scale: 2, now: '2026-10-23T12:00:00+02:00' });

  H.section('Slaap en Gewicht: samenvatting, grafiek, lijst, invullen, bladeren');
  await setup(page);
  // --- Pure rules
  check('bedtijd 23:50 + 00:30 → 00:10', await page.evaluate(() => insightSleepRange('2026-10-05', '2026-10-11').bedtime), '00:10');
  check('opgestaan week 41 (07:00, 07:10) → 07:05', await page.evaluate(() => insightSleepRange('2026-10-05', '2026-10-11').wakeTime), '07:05');
  check('y-as 98,2–98,9', await page.evaluate(() => insightWeightAxis(98.2, 98.9)), { lo: 97.75, hi: 99.25, ticks: [98, 98.5, 99] });
  check('y-as één waarde 80,25', await page.evaluate(() => insightWeightAxis(80.25, 80.25)), { lo: 79.75, hi: 81.25, ticks: [80, 80.5, 81] });
  check('y-as 92–101', await page.evaluate(() => insightWeightAxis(92, 101)).then(a => a.ticks), [90, 100, 110]);

  // --- Week overview: Slaap and Gewicht tappable with a chevron, Training/Voeding not
  await setup(page);
  check('weekoverzicht kop gedeeld', await headOf(page, 'screen-insight'), ['Week 43', '19–25 oktober 2026', true]);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#insight-cards > .card')].map(c => [c.querySelector('.insight-card-label').textContent, c.tagName, !!c.querySelector('.insight-chevron svg'), c.dataset.insightMetric || null]));
  check('kaarten (Training aan te tikken sinds stap 5, Kracht sinds stap 7)', cards, [['Training', 'BUTTON', true, 'training'], ['Voeding', 'DIV', false, null], ['Slaap', 'BUTTON', true, 'sleep'], ['Gewicht', 'BUTTON', true, 'weight'], ['Kracht', 'BUTTON', true, 'strength']]);
  const chev = await page.evaluate(() => { const s = document.querySelector('.insight-chevron svg'); const cs = getComputedStyle(s); return [cs.width, cs.fill === getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || cs.fill]; });
  console.log('     chevron:', chev);

  // --- Sleep detail, week 43
  await page.click('#insight-cards [data-insight-metric="sleep"]'); await H.settle(page);
  check('slaap opent', [await active(page), await page.textContent('#insight-metric-title')], ['screen-insight-metric', 'Slaap']);
  check('slaap kop', await headOf(page, 'screen-insight-metric'), ['Week 43', '19–25 oktober 2026', true]);
  check('periodeknoppen', await page.evaluate(() => [...document.querySelectorAll('#insight-metric-head .time-filter')].map(b => [b.textContent, b.disabled])), [['Week', false], ['Maand', false], ['Jaar', false]]); // sinds stap 6 alle drie aan
  // avg (430+390+350+475)/4 = 411.25 → 6:51; bedtimes 1430,1470,1510,1385 → 1448.75 → 1449 = 00:09; wake 1449+411 = 1860 → 07:00
  check('slaap samenvatting', await summary(page), { cols: ['GEMIDDELD 6:51 u', 'NAAR BED 00:09', 'OPGESTAAN 07:00'],
    note: 'Kortste nacht: donderdag, 5:50 uLangste nacht: vrijdag, 7:55 u', empty: null });
  check('slaap grafiek (staven, kleur, as, dagen)', await chart(page), { bars: ['blauw', 'rood', 'rood', 'blauw'], ticks: ['3 u', '6 u', '9 u'], days: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'], line: false, points: 0, avg: true });
  check('legenda', await page.textContent('.insight-chart-legend'), '- - - gemiddeld');
  check('label NACHTEN', await page.evaluate(() => getComputedStyle(document.querySelector('#insight-metric-body .insight-label')).textTransform + ' ' + document.querySelector('#insight-metric-body .insight-label').textContent), 'uppercase Nachten');
  check('nachtenlijst (t/m vandaag)', await list(page), [
    'Maandag 19 oktober 2026 23:50 – 07:00 7:10 u', 'Dinsdag 20 oktober 2026 00:30 – 07:00 6:30 u', 'Woensdag 21 oktober 2026 Niet ingevuld',
    'Donderdag 22 oktober 2026 01:10 – 07:00 5:50 u', 'Vrijdag 23 oktober 2026 23:05 – 07:00 7:55 u']);
  check('rood in lijst alleen onder 7:00', await page.evaluate(() => [...document.querySelectorAll('.insight-list-row .set-val')].map(v => v.classList.contains('insight-danger'))), [false, true, true, false]);
  // Wo: no bar, the space stays empty — bar x positions sit in their own day column
  const barX = await page.evaluate(() => { const svg = document.querySelector('#insight-chart svg'); const days = [...svg.querySelectorAll('.insight-chart-day')].map(t => +t.getAttribute('x'));
    return [...svg.querySelectorAll('.insight-bar')].map(b => { const bb = b.getBBox(); return days.findIndex(x => Math.abs(x - (bb.x + bb.width / 2)) < 1); }); });
  check('staven in kolom ma, di, do, vr', barX, [0, 1, 3, 4]);

  // fill in Wednesday from the list
  await page.click('[data-insight-fill="2026-10-21"]'); await H.settle(page);
  check('invulvenster slaap open voor woensdag', [await page.evaluate(() => document.getElementById('insight-sleep-overlay').classList.contains('open')), await page.textContent('#insight-sleep-sub'),
    await page.isVisible('#btn-insight-sleep-clear')], [true, 'Nacht van dinsdag 20 op woensdag 21 oktober 2026', false]);
  await page.evaluate(() => { insightSleepTimes.bed = '22:30'; insightSleepTimes.wake = '06:45'; renderSleepClock(); });
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  check('opgeslagen: lijst, grafiek en samenvatting direct bij', [await toastMsg(page), (await list(page))[2], (await chart(page)).bars.length, (await summary(page)).cols[0]],
    ['Slaap opgeslagen', 'Woensdag 21 oktober 2026 22:30 – 06:45 8:15 u', 5, 'GEMIDDELD 7:08 u']);
  // change it
  await page.click('[data-insight-fill="2026-10-21"]'); await H.settle(page);
  check('wijzigen: start op de eigen tijden, Wissen zichtbaar', [await page.evaluate(() => insightSleepValues()), await page.isVisible('#btn-insight-sleep-clear')], [['22:30', '06:45'], true]);
  await page.evaluate(() => { insightSleepTimes.wake = '04:30'; renderSleepClock(); });
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  check('gewijzigd: 6:00 rood', [(await list(page))[2], (await chart(page)).bars], ['Woensdag 21 oktober 2026 22:30 – 04:30 6:00 u', ['blauw', 'rood', 'rood', 'rood', 'blauw']]);
  // clear it
  await page.click('[data-insight-fill="2026-10-21"]'); await H.settle(page);
  await page.click('#btn-insight-sleep-clear'); await H.settle(page);
  check('gewist: direct bij', [await toastMsg(page), (await list(page))[2], (await chart(page)).bars.length, (await summary(page)).cols[0]],
    ['Slaap gewist', 'Woensdag 21 oktober 2026 Niet ingevuld', 4, 'GEMIDDELD 6:51 u']);

  // browse: back two weeks (week 41: 23:50 + 00:30), then week 40 (empty)
  await page.click('#insight-metric-head [data-insight-step="-1"]'); await H.settle(page);
  check('week 42 (geen nachten): lege staat, geen grafiek, rechts aan', [await headOf(page, 'screen-insight-metric'), (await summary(page)).empty, await chart(page), (await list(page)).length],
    [['Week 42', '12–18 oktober 2026', false], 'Nog geen slaap ingevuld', null, 7]);
  await page.click('#insight-metric-head [data-insight-step="-1"]'); await H.settle(page);
  check('week 41: bedtijd over middernacht', (await summary(page)).cols, ['GEMIDDELD 6:55 u', 'NAAR BED 00:10', 'OPGESTAAN 07:05']);
  // back arrow → week overview on week 41
  await page.click('#btn-back-insight-metric'); await H.settle(page);
  check('terugpijl: weekoverzicht op week 41', [await active(page), (await headOf(page, 'screen-insight'))[0]], ['screen-insight', 'Week 41']);
  // hardware back: open Gewicht on week 41, browse to 43, back
  await page.click('#insight-cards [data-insight-metric="weight"]'); await H.settle(page);
  check('gewicht opent op dezelfde week', [await page.textContent('#insight-metric-title'), (await headOf(page, 'screen-insight-metric'))[0]], ['Gewicht', 'Week 41']);
  check('week 41: één punt, geen lijn, geen t.o.v. (week 40 leeg)', [await chart(page).then(c => [c.points, c.line, c.ticks]), (await summary(page))],
    [[1, false, ['80', '80,5', '81']], { cols: ['GEMIDDELD 80,3 kg', 'LAAGSTE 80,25 kg', 'HOOGSTE 80,25 kg'], note: null, empty: null }]);
  await page.click('#insight-metric-head [data-insight-step="-1"]'); await H.settle(page);
  check('week 40: geen gewicht', [(await summary(page)).empty, await chart(page)], ['Nog geen gewicht ingevuld', null]);
  await page.click('#insight-metric-head [data-insight-step="1"]'); await page.click('#insight-metric-head [data-insight-step="1"]'); await page.click('#insight-metric-head [data-insight-step="1"]');
  await H.settle(page);
  check('week 43 gewicht, rechts uit', await headOf(page, 'screen-insight-metric'), ['Week 43', '19–25 oktober 2026', true]);
  await page.click('#insight-metric-head [data-insight-step="1"]', { force: true }); await H.settle(page);
  check('niet voorbij de huidige week', (await headOf(page, 'screen-insight-metric'))[0], 'Week 43');
  check('gewicht samenvatting week 43', await summary(page), { cols: ['GEMIDDELD 98,6 kg', 'LAAGSTE 98,2 kg', 'HOOGSTE 98,9 kg'], note: '−0,3 kg t.o.v. week 42', empty: null });
  check('gewicht grafiek: gaten overgeslagen', await chart(page), { bars: [], ticks: ['98', '98,5', '99'], days: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'], line: true, points: 3, avg: true });
  const geo = await page.evaluate(() => {
    const svg = document.querySelector('#insight-chart svg');
    const ticks = [...svg.querySelectorAll('.insight-chart-tick')].map(t => t.getBBox());
    const pts = [...svg.querySelectorAll('.insight-point')].map(c => ({ x: +c.getAttribute('cx'), y: +c.getAttribute('cy') }));
    const labelRight = Math.max(...ticks.map(b => b.x + b.width));
    const H = +svg.getAttribute('height');
    return { gapFirstPointToLabels: Math.round(pts[0].x - 4 - labelRight), lastPointToRight: Math.round(+svg.getAttribute('width') - pts[pts.length - 1].x - 4),
      pointsInside: pts.every(p => p.y - 4 > 8 && p.y + 4 < H - 24), polyline: svg.querySelector('.insight-line').getAttribute('points').split(' ').length };
  });
  console.log('     geometrie gewicht:', JSON.stringify(geo));
  check('eerste punt ruim los van aslabels, punten binnen het vlak', [geo.gapFirstPointToLabels >= 16, geo.lastPointToRight >= 12, geo.pointsInside, geo.polyline], [true, true, true, 3]);
  check('weegmomenten', await list(page), ['Maandag 19 oktober 2026 98,9 kg', 'Dinsdag 20 oktober 2026 Niet ingevuld', 'Woensdag 21 oktober 2026 98,2 kg',
    'Donderdag 22 oktober 2026 Niet ingevuld', 'Vrijdag 23 oktober 2026 98,6 kg']);
  // fill Tuesday
  await page.click('[data-insight-fill="2026-10-20"]'); await H.settle(page);
  check('invulvenster gewicht voor dinsdag', [await page.textContent('#insight-weight-sub'), await page.inputValue('#insight-weight-input')], ['Dinsdag 20 oktober 2026', '']);
  await page.fill('#insight-weight-input', '98,45');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('gewicht opgeslagen: direct bij', [await toastMsg(page), (await list(page))[1], (await chart(page)).points, (await summary(page)).cols[0]],
    ['Gewicht opgeslagen', 'Dinsdag 20 oktober 2026 98,45 kg', 4, 'GEMIDDELD 98,5 kg']);
  await page.click('[data-insight-fill="2026-10-20"]'); await H.settle(page);
  check('wijzigen: veld gevuld', await page.inputValue('#insight-weight-input'), '98,45');
  await page.fill('#insight-weight-input', '99.5');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('gewijzigd → hoogste 99,5, as schuift mee', [(await list(page))[1], (await summary(page)).cols[2], (await chart(page)).ticks], ['Dinsdag 20 oktober 2026 99,5 kg', 'HOOGSTE 99,5 kg', ['98', '99', '100']]);
  await page.click('[data-insight-fill="2026-10-20"]'); await H.settle(page);
  await page.click('#btn-insight-weight-clear'); await H.settle(page);
  check('gewist: direct bij', [await toastMsg(page), (await list(page))[1], (await chart(page)).points], ['Gewicht gewist', 'Dinsdag 20 oktober 2026 Niet ingevuld', 3]);
  // hardware back → week overview on week 43
  await page.goBack(); await H.settle(page);
  check('terugknop telefoon: weekoverzicht op week 43', [await active(page), (await headOf(page, 'screen-insight'))[0]], ['screen-insight', 'Week 43']);
  // t.o.v.: with no weight in the previous week on the week card too
  await page.evaluate(() => { insightWeekStart = '2026-10-05'; renderInsight(); });
  check('weekkaart week 41 zonder t.o.v.', await page.evaluate(() => document.querySelector('[data-insight-metric="weight"]').innerText.replace(/\s+/g, ' ').trim()), 'GEWICHT 80,3 kg gemiddeld');
  // day overview still works with the sheets
  await page.evaluate(() => openInsightDay('2026-10-22')); await H.settle(page);
  await page.click('#insight-day-weight [data-insight-edit]'); await H.settle(page);
  await page.fill('#insight-weight-input', '97'); await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('dagoverzicht: invullen werkt nog, wordt bijgewerkt', await page.evaluate(() => document.getElementById('insight-day-weight').innerText.replace(/\s+/g, ' ').trim()), 'GEWICHT 97 kg −1,2 kg t.o.v. woensdag');
  await page.evaluate(() => deleteBodyWeight('2026-10-22'));

  // --- Light / dark × 360 / 390: no horizontal overflow, colours from the tokens
  for (const w of H.WIDTHS) for (const theme of H.THEMES) {
    await page.setViewportSize({ width: w, height: 1400 });
    for (const kind of ['sleep', 'weight']) {
      await setup(page, theme);
      await page.evaluate(k => openInsightMetric(k), kind); await H.settle(page);
      const m = await page.evaluate(() => {
        const sc = document.getElementById('insight-metric-scroll');
        const svg = document.querySelector('#insight-chart svg');
        const card = document.querySelector('.insight-chart-card').getBoundingClientRect();
        const root = getComputedStyle(document.documentElement), tok = n => root.getPropertyValue(n).trim();
        const col = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
        const toRgb = hex => { const d = document.createElement('div'); d.style.color = hex; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
        return { overflow: sc.scrollWidth > sc.clientWidth || document.documentElement.scrollWidth > innerWidth,
          svgFits: svg.getBoundingClientRect().right <= card.right - 15, summaryCols: [...document.querySelectorAll('.insight-summary-cols .insight-figure')].every(f => f.scrollWidth <= f.clientWidth + 1),
          grid: col('.insight-chart-grid', 'stroke') === toRgb(tok('--border')), avg: col('.insight-chart-avg', 'stroke') === toRgb(tok('--text-muted')),
          tick: col('.insight-chart-tick', 'fill') === toRgb(tok('--text-muted')), // rol Aslabel: --text-muted
          mark: (col('.insight-bar', 'fill') || col('.insight-point', 'fill')) === toRgb(tok('--primary')),
          rowsMin48: [...document.querySelectorAll('.insight-list-row')].every(r => r.getBoundingClientRect().height >= 48) };
      });
      check(`${kind} ${theme} ${w}px`, m, { overflow: false, svgFits: true, summaryCols: true, grid: true, avg: true, tick: true, mark: true, rowsMin48: true });
      await page.screenshot({ path: path.join(OUT, `detail-${kind}-${theme}-${w}.png`), fullPage: false });
    }
    await setup(page, theme);
    await page.screenshot({ path: path.join(OUT, `week-${theme}-${w}.png`), fullPage: false });
  }

  H.section('Aslabels, rijhoogtes, kortste/langste nacht');
  for (const w of H.WIDTHS) for (const theme of H.THEMES) {
    const tag = `${theme} ${w}px`;
    await page.setViewportSize({ width: w, height: 1400 });
    await setup(page, theme, DATA_AXIS);
    const c = await colours(page);
    console.log(`     ${tag}: --text-muted = ${c.muted}; Grafiek-aslabels (canvas) = ${c.grafiek.join(' | ')}`);
    check(`${tag}: Grafiek-aslabels zijn --text-muted 11px`, c.grafiek, [`${c.muted} / 11px Roboto`]);
    c.grafiekCanvas = c.grafiek[0].split(' / ')[0];
    for (const kind of ['sleep', 'weight']) {
      await openWeek(page, kind, '2026-10-19');
      const a = await axis(page);
      check(`${tag} ${kind}: y-aslabels`, [...new Set(a.ticks)], [`${c.grafiekCanvas} / 11px / 400`]);
      check(`${tag} ${kind}: x-aslabels Ma…Zo`, [...new Set(a.days)], [`${c.grafiekCanvas} / 11px / 400`]);
      const r = await rows(page);
      check(`${tag} ${kind}: rijen met én zonder waarde aanwezig`, [r.some(x => x.filled), r.some(x => !x.filled)], [true, true]);
      check(`${tag} ${kind}: alle rijhoogtes (zonder lijn erboven)`, [...new Set(r.map(x => x.h))], [58]);
      check(`${tag} ${kind}: waarde rechts in het midden (afwijking px)`, r.filter(x => x.filled).map(x => Math.abs(x.figOffset) <= 0.5), r.filter(x => x.filled).map(() => true));
      await page.screenshot({ path: path.join(OUT, `${kind}-${theme}-${w}.png`), fullPage: true });
    }
    await openWeek(page, 'sleep', '2026-09-14');
    const n2 = await noteLines(page);
    check(`${tag}: kortste/langste nacht`, n2, { lines: ['Kortste nacht: maandag, 8:00 u', 'Langste nacht: dinsdag, 8:30 u'], dot: false, stacked: true, centered: 'center', fs: '12px', oneLineEach: true });
    await page.screenshot({ path: path.join(OUT, `sleep-twee-nachten-${theme}-${w}.png`), fullPage: true });
    await openWeek(page, 'sleep', '2026-09-28');
    check(`${tag}: één nacht → alleen "Kortste nacht"`, (await noteLines(page)).lines, ['Kortste nacht: woensdag, 7:40 u']);
    await openWeek(page, 'sleep', '2026-09-21');
    const g = await page.evaluate(() => { const svg = document.querySelector('#insight-chart svg');
      const bars = [...svg.querySelectorAll('.insight-bar')].map(b => b.getBBox());
      const ticks = [...svg.querySelectorAll('.insight-chart-tick')];
      const t12 = ticks.find(t => t.textContent === '12 u');
      return { ticks: ticks.map(t => t.textContent), barTop: Math.min(...bars.map(b => b.y)), y12: t12 ? +t12.getAttribute('y') : null,
        labelsInside: ticks.every(t => t.getBBox().y >= 0) }; });
    console.log(`     ${tag} 10:30: bovenkant staaf y=${g.barTop.toFixed(1)}, lijn 12 u y=${g.y12}, bovenkant vlak y=8`);
    check(`${tag}: week met 10:30 → as`, g.ticks, ['3 u', '6 u', '9 u', '12 u']);
    check(`${tag}: staaf 10:30 binnen grafiek, onder 12 u`, [g.barTop > 8, g.barTop > g.y12, g.labelsInside], [true, true, true]);
    await page.screenshot({ path: path.join(OUT, `sleep-1030-${theme}-${w}.png`), fullPage: true });
    await openWeek(page, 'sleep', '2026-09-07');
    const g9 = await page.evaluate(() => { const svg = document.querySelector('#insight-chart svg'); const b = svg.querySelector('.insight-bar').getBBox();
      return { ticks: [...svg.querySelectorAll('.insight-chart-tick')].map(t => t.textContent), room: Math.round(b.y - 8) }; });
    check(`${tag}: nacht van precies 9:00 → as tot 9 u, ruimte erboven`, [g9.ticks, g9.room > 10], [['3 u', '6 u', '9 u'], true]);
  }
  await browser.close();
  check('geen JS-fouten', errors, []);
});

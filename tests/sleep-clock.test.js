// Sleep sheet: the 24-hour clock (start position, dragging with mouse and touch, typing a time, invalid input,
// equal times, Wissen), the weight sheet's Wissen / empty Opslaan, and the layout at 300 / 360 / 390 px.
const path = require('path');
const H = require('./helpers');
const { check } = H;
const OUT = H.outDir(__filename);

const BASE = { scheduleVersions: {}, weekCycle: {}, workouts: {}, sleep: {}, bodyWeight: {} };

async function setup(page, data, date, theme = 'light') {
  await H.loadData(page, data, theme);
  await page.evaluate(date => { insightDayDate = date; showScreen('screen-insight-day'); renderInsightDay(); }, date);
  await H.settle(page);
}
const openSleep = async page => { await page.click('#insight-day-sleep button'); await H.settle(page); };
const openWeight = async page => { await page.click('#insight-day-weight button'); await H.settle(page); };
const state = page => page.evaluate(() => ({
  times: insightSleepValues(),
  shown: [...document.querySelectorAll('.sleep-clock-time')].map(b => b.textContent),
  total: document.getElementById('insight-sleep-total').textContent,
}));
const toastState = page => page.evaluate(() => [document.getElementById('toast-msg').textContent, document.getElementById('toast').classList.contains('toast-error')]);
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains('open'), id);
// screen point of a time of day on the ring (centre line), from the real clock rect
const ringPoint = (page, minutes, rFactor = 1) => page.evaluate(({ minutes, rFactor }) => {
  const r = document.getElementById('sleep-clock').getBoundingClientRect(), s = r.width / 280, a = minutes / 1440 * 2 * Math.PI;
  return { x: r.left + r.width / 2 + 116 * rFactor * s * Math.sin(a), y: r.top + r.height / 2 - 116 * rFactor * s * Math.cos(a) };
}, { minutes, rFactor });
const handleCentre = (page, which) => page.evaluate(which => {
  const r = document.querySelector(`.sleep-clock-handle[data-which="${which}"]`).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, which);

H.run(async () => {
  const { browser, page, errors } = await H.openApp({ width: 360, height: 760, scale: 2 });

  // --- Start position: three situations
  await setup(page, BASE, '2026-10-22');
  await openSleep(page);
  let st = await state(page);
  check('startstand: nooit iets ingevuld → 23:00–07:00', [st.times, st.shown, st.total], [['23:00', '07:00'], ['23:00', '07:00'], 'Totaal: 8:00 u · tik op een tijd om hem in te typen']);
  check('geen time-inputs meer', await page.evaluate(() => document.querySelectorAll('input[type="time"]').length), 0);
  check('Wissen verborgen bij nieuwe nacht', await page.isVisible('#btn-insight-sleep-clear'), false);
  await setup(page, { ...BASE, sleep: { '2026-10-18': { bedtime: '22:10', wakeTime: '05:55' }, '2026-10-20': { bedtime: '00:20', wakeTime: '06:50' }, '2026-10-25': { bedtime: '01:00', wakeTime: '09:00' } } }, '2026-10-22');
  await openSleep(page);
  st = await state(page);
  check('startstand: laatste eerdere nacht', [st.times, st.total], [['00:20', '06:50'], 'Totaal: 6:30 u · tik op een tijd om hem in te typen']);
  check('Wissen verborgen (nacht zelf leeg)', await page.isVisible('#btn-insight-sleep-clear'), false);
  await page.click('#btn-insight-sleep-cancel'); await H.settle(page);
  check('Annuleren zonder wijziging sluit', await isOpen(page, 'insight-sleep-overlay'), false);
  await setup(page, { ...BASE, sleep: { '2026-10-20': { bedtime: '00:20', wakeTime: '06:50' }, '2026-10-22': { bedtime: '23:35', wakeTime: '06:10' } } }, '2026-10-22');
  await openSleep(page);
  st = await state(page);
  check('startstand: ingevulde nacht', st.times, ['23:35', '06:10']);
  check('Wissen zichtbaar bij ingevulde nacht', await page.isVisible('#btn-insight-sleep-clear'), true);

  // --- Dragging (pointer events via the mouse)
  await setup(page, BASE, '2026-10-22');
  await openSleep(page);
  const hb = await handleCentre(page, 'bed');
  check('tikvlak handgreep ≥ 48×48', [hb.w >= 48, hb.h >= 48], [true, true]);
  const knob = await page.evaluate(() => { const r = document.querySelector('.sleep-clock-knob').getBoundingClientRect(); return [r.width, r.height]; });
  check('handgreep 34px', knob, [34, 34]);
  const p2300 = await ringPoint(page, 23 * 60);
  check('bed-handgreep ligt op 23:00', [Math.abs(hb.x - p2300.x) < 1, Math.abs(hb.y - p2300.y) < 1], [true, true]);
  await page.mouse.move(hb.x, hb.y); await page.mouse.down();
  let p = await ringPoint(page, 23 * 60 + 47); await page.mouse.move(p.x, p.y, { steps: 4 });
  st = await state(page);
  check('per 5 min: 23:47 → 23:45 (live tijdens slepen)', [st.times[0], st.shown[0], st.total], ['23:45', '23:45', 'Totaal: 7:15 u · tik op een tijd om hem in te typen']);
  p = await ringPoint(page, 23 * 60 + 58); await page.mouse.move(p.x, p.y, { steps: 3 });
  check('23:58 → 00:00', (await state(page)).times[0], '00:00');
  p = await ringPoint(page, 32, 0.8); await page.mouse.move(p.x, p.y, { steps: 3 }); // slightly inside the ring: angle counts
  st = await state(page);
  check('over 0 uur heen: 00:32 → 00:30', [st.times[0], st.total], ['00:30', 'Totaal: 6:30 u · tik op een tijd om hem in te typen']);
  await page.mouse.up();
  const arcSmall = await page.getAttribute('#sleep-clock-arc', 'd');
  check('boog 6:30 = kleine boog, met de klok mee', /A116 116 0 0 1/.test(arcSmall), true);
  // drag bed back across 0 the other way, to 22:00
  let h = await handleCentre(page, 'bed');
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (const m of [10, 1435, 1400, 1320]) { p = await ringPoint(page, m); await page.mouse.move(p.x, p.y, { steps: 3 }); }
  await page.mouse.up();
  check('terug over 0 uur: 22:00, totaal 9:00', [(await state(page)).times[0], (await state(page)).total], ['22:00', 'Totaal: 9:00 u · tik op een tijd om hem in te typen']);
  // drag the wake time to 01:00: total over midnight 3:00, then to 21:00 → 23:00 long night (large arc)
  h = await handleCentre(page, 'wake');
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (const m of [300, 120, 61]) { p = await ringPoint(page, m); await page.mouse.move(p.x, p.y, { steps: 3 }); }
  check('opsta-tijd 01:00, totaal over middernacht 3:00', [(await state(page)).times, (await state(page)).total], [['22:00', '01:00'], 'Totaal: 3:00 u · tik op een tijd om hem in te typen']);
  for (const m of [0, 1380, 1262]) { p = await ringPoint(page, m); await page.mouse.move(p.x, p.y, { steps: 3 }); }
  await page.mouse.up();
  st = await state(page);
  check('opsta-tijd vóór bedtijd: 22:00 → 21:00 = 23:00', [st.times, st.total], [['22:00', '21:00'], 'Totaal: 23:00 u · tik op een tijd om hem in te typen']);
  check('lange nacht = grote boog', /A116 116 0 1 1/.test(await page.getAttribute('#sleep-clock-arc', 'd')), true);
  check('touch-action: none op de klok', await page.evaluate(() => getComputedStyle(document.getElementById('sleep-clock')).touchAction), 'none');
  check('paneel niet gescrold tijdens slepen', await page.evaluate(() => [document.scrollingElement.scrollTop, document.querySelector('#insight-sleep-overlay .overlay-panel').scrollTop]), [0, 0]);
  // real touch pointer events too (pointerType touch), dispatched on the handle
  const touchRes = await page.evaluate(async () => {
    const h = document.querySelector('.sleep-clock-handle[data-which="bed"]');
    const r = document.getElementById('sleep-clock').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = 116 * r.width / 280;
    const at = m => ({ clientX: cx + R * Math.sin(m / 1440 * 2 * Math.PI), clientY: cy - R * Math.cos(m / 1440 * 2 * Math.PI) });
    const opt = m => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, ...at(m) });
    const hr = h.getBoundingClientRect();
    h.dispatchEvent(new PointerEvent('pointerdown', { ...opt(0), clientX: hr.left + 24, clientY: hr.top + 24 }));
    h.dispatchEvent(new PointerEvent('pointermove', opt(1438)));
    const a = insightSleepValues()[0];
    h.dispatchEvent(new PointerEvent('pointermove', opt(23 * 60 + 12)));
    h.dispatchEvent(new PointerEvent('pointerup', opt(23 * 60 + 12)));
    const b = insightSleepValues()[0];
    h.dispatchEvent(new PointerEvent('pointermove', opt(600))); // after pointerup: ignored
    return [a, b, insightSleepValues()[0]];
  });
  check('touch-pointer: 23:58 → 00:00, 23:12 → 23:10, na loslaten niets', touchRes, ['00:00', '23:10', '23:10']);

  // --- Typing in the middle
  await setup(page, BASE, '2026-10-22');
  await openSleep(page);
  await page.click('.sleep-clock-time[data-which="bed"]');
  const inp = await page.evaluate(() => {
    const i = document.querySelector('.sleep-clock-input[data-which="bed"]');
    return [!i.classList.contains('hidden'), document.activeElement === i, i.inputMode, i.value, i.selectionStart, i.selectionEnd,
      document.querySelector('.sleep-clock-time[data-which="bed"]').classList.contains('hidden')];
  });
  check('tik op tijd: veld, focus, numeriek, tijd geselecteerd', inp, [true, true, 'numeric', '23:00', 0, 5, true]);
  await page.keyboard.type('2345'); await page.keyboard.press('Enter');
  st = await state(page);
  check('"2345" + Enter → 23:45', [st.times[0], st.shown[0], await page.isVisible('.sleep-clock-input[data-which="bed"]')], ['23:45', '23:45', false]);
  const hb2 = await handleCentre(page, 'bed'), p2345 = await ringPoint(page, 23 * 60 + 45);
  check('klok springt mee', [Math.abs(hb2.x - p2345.x) < 1, Math.abs(hb2.y - p2345.y) < 1], [true, true]);
  await page.click('.sleep-clock-time[data-which="wake"]');
  await page.keyboard.type('730');
  await page.click('#insight-sleep-sub'); // leave the field
  st = await state(page);
  check('"730" + veld verlaten → 07:30, totaal live', [st.times[1], st.shown[1], st.total], ['07:30', '07:30', 'Totaal: 7:45 u · tik op een tijd om hem in te typen']);
  await page.click('.sleep-clock-time[data-which="wake"]');
  await page.keyboard.type('0733'); await page.keyboard.press('Enter');
  check('getypt hoeft niet op 5 min', (await state(page)).times[1], '07:33');
  for (const bad of ['2460', '2375', '12', '12345', 'abc']) {
    await page.click('.sleep-clock-time[data-which="bed"]');
    await page.keyboard.type(bad); await page.keyboard.press('Enter');
    const t = await toastState(page);
    const still = await page.isVisible('.sleep-clock-input[data-which="bed"]');
    await page.click('#insight-sleep-sub'); // leave: invalid again → old time stays
    check(`ongeldig "${bad}" → rode melding, tijd blijft`, [t, still, (await state(page)).times[0]], [['Vul een geldige tijd in', true], true, '23:45']);
  }
  await page.click('#btn-insight-sleep-cancel'); await H.settle(page);
  check('Annuleren met wijziging vraagt', await isOpen(page, 'discard-changes-overlay'), true);
  await page.evaluate(() => { document.getElementById('discard-changes-overlay').classList.remove('open'); });
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  check('Opslaan', [await page.evaluate(() => db.sleep['2026-10-22']), (await toastState(page))[0], await isOpen(page, 'insight-sleep-overlay')],
    [{ bedtime: '23:45', wakeTime: '07:33' }, 'Slaap opgeslagen', false]);
  // equal times
  await openSleep(page);
  await page.click('.sleep-clock-time[data-which="wake"]'); await page.keyboard.type('2345'); await page.keyboard.press('Enter');
  check('gelijke tijden: totaal 0, geen boog', [(await state(page)).total, await page.getAttribute('#sleep-clock-arc', 'd')], ['Totaal: 0:00 u · tik op een tijd om hem in te typen', '']);
  await page.click('#btn-insight-sleep-save'); await H.settle(page);
  check('gelijke tijden → bestaande fout, venster blijft', [await toastState(page), await isOpen(page, 'insight-sleep-overlay')], [['Naar bed en opgestaan kunnen niet gelijk zijn', true], true]);
  // Wissen sleep
  check('Wissen zichtbaar', await page.isVisible('#btn-insight-sleep-clear'), true);
  await page.click('#btn-insight-sleep-clear'); await H.settle(page);
  check('Wissen slaap: gewist, melding, dicht, kaart leeg', [await page.evaluate(() => db.sleep['2026-10-22'] || null), await toastState(page), await isOpen(page, 'insight-sleep-overlay'),
    await page.evaluate(() => document.getElementById('insight-day-sleep').innerText.includes('Nog niet ingevuld'))], [null, ['Slaap gewist', false], false, true]);

  // --- Weight
  await setup(page, BASE, '2026-10-22');
  await openWeight(page);
  check('gewicht: Wissen verborgen bij lege dag', await page.isVisible('#btn-insight-weight-clear'), false);
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('leeg + Opslaan → "Vul een gewicht in", blijft open', [await toastState(page), await isOpen(page, 'insight-weight-overlay')], [['Vul een gewicht in', true], true]);
  await page.type('#insight-weight-input', '98,4');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('Gewicht opgeslagen', [await page.evaluate(() => db.bodyWeight['2026-10-22']), (await toastState(page))[0]], [98.4, 'Gewicht opgeslagen']);
  await openWeight(page);
  check('gewicht: Wissen zichtbaar bij ingevulde dag', await page.isVisible('#btn-insight-weight-clear'), true);
  await page.fill('#insight-weight-input', '');
  await page.click('#btn-insight-weight-save'); await H.settle(page);
  check('leeggemaakt + Opslaan wist niet meer', [await page.evaluate(() => db.bodyWeight['2026-10-22']), await toastState(page), await isOpen(page, 'insight-weight-overlay')], [98.4, ['Vul een gewicht in', true], true]);
  await page.click('#btn-insight-weight-clear'); await H.settle(page);
  check('Wissen gewicht: gewist, melding, dicht', [await page.evaluate(() => db.bodyWeight['2026-10-22'] ?? null), await toastState(page), await isOpen(page, 'insight-weight-overlay')], [null, ['Gewicht gewist', false], false]);
  const btnStyle = await page.evaluate(() => {
    const w = getComputedStyle(document.getElementById('btn-insight-weight-clear')), c = getComputedStyle(document.getElementById('btn-insight-weight-cancel'));
    const root = getComputedStyle(document.documentElement);
    return [w.borderColor === c.borderColor, w.backgroundColor === c.backgroundColor, w.height, w.color];
  });
  console.log('Wissen-stijl (rand = Annuleren, achtergrond = Annuleren, hoogte, kleur):', btnStyle);
  check('Wissen omlijnd zoals Annuleren, tekst --danger', btnStyle, [true, true, '48px', 'rgb(198, 40, 40)']);

  // --- Layout: light/dark × 360/390
  const shots = [];
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 760 });
    // handles at the extremes: 18:00 (left) and 06:00 (right); then 00:00 (top) and 12:00 (bottom)
    for (const [bed, wake, tag] of [['18:00', '06:00', 'lr'], ['00:00', '12:00', 'tb'], ['23:10', '06:40', '']]) {
      await setup(page, { ...BASE, sleep: { '2026-10-22': { bedtime: bed, wakeTime: wake } } }, '2026-10-22', theme);
      await openSleep(page);
      const lay = await page.evaluate(() => {
        const panel = document.querySelector('#insight-sleep-overlay .overlay-panel').getBoundingClientRect();
        const clock = document.getElementById('sleep-clock').getBoundingClientRect();
        const knobs = [...document.querySelectorAll('.sleep-clock-knob')].map(k => k.getBoundingClientRect());
        const taps = [...document.querySelectorAll('.sleep-clock-handle')].map(k => k.getBoundingClientRect());
        const inside = (r, o) => r.left >= o.left - .5 && r.right <= o.right + .5 && r.top >= o.top - .5 && r.bottom <= o.bottom + .5;
        return {
          clockW: Math.round(clock.width), centred: Math.abs((clock.left + clock.right) / 2 - (panel.left + panel.right) / 2) < 1,
          knobsInPanel: knobs.every(k => inside(k, panel)), knobsInClock: knobs.every(k => inside(k, clock)), tapsInClock: taps.every(k => inside(k, clock)),
          hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          panelScroll: document.querySelector('#insight-sleep-overlay .overlay-panel').scrollWidth - document.querySelector('#insight-sleep-overlay .overlay-panel').clientWidth,
          panelFits: panel.top >= 0, save: document.getElementById('btn-insight-sleep-save').getBoundingClientRect().bottom <= innerHeight,
        };
      });
      check(`layout ${theme} ${w} ${bed}–${wake}`, lay, { clockW: 280, centred: true, knobsInPanel: true, knobsInClock: true, tapsInClock: true, hScroll: 0, panelScroll: 0, panelFits: true, save: true });
      if (tag === '') {
        const f = `sheet-sleep-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f);
        const colors = await page.evaluate(() => {
          const g = s => getComputedStyle(document.querySelector(s));
          return { track: g('.sleep-clock-track').stroke, arc: g('.sleep-clock-arc').stroke, knob: g('.sleep-clock-knob').backgroundColor, icon: g('.sleep-clock-knob svg').fill,
            num: g('.sleep-clock-num').fill, numSize: g('.sleep-clock-num').fontSize + '/' + g('.sleep-clock-num').fontWeight,
            time: g('.sleep-clock-time').fontSize + '/' + g('.sleep-clock-time').fontWeight + ' ' + g('.sleep-clock-time').color,
            centreIcon: g('.sleep-clock-icon').fill + ' ' + g('.sleep-clock-icon').width, total: g('#insight-sleep-total').fontSize + ' ' + g('#insight-sleep-total').color };
        });
        console.log(`  kleuren ${theme} ${w}:`, JSON.stringify(colors));
      }
      if (tag === 'tb' && w === 360) { const f = `sheet-sleep-top-${theme}.png`; await page.screenshot({ path: path.join(OUT, f) }); shots.push(f); }
    }
    // editing state screenshot
    await page.click('.sleep-clock-time[data-which="bed"]');
    const f2 = `sheet-sleep-typing-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f2) }); shots.push(f2);
    await page.evaluate(() => closeOverlay('insight-sleep-overlay')); await H.settle(page);
    // weight sheet with Wissen
    await setup(page, { ...BASE, bodyWeight: { '2026-10-22': 98.4 } }, '2026-10-22', theme);
    await openWeight(page);
    const f3 = `sheet-weight-${theme}-${w}.png`; await page.screenshot({ path: path.join(OUT, f3) }); shots.push(f3);
  }
  // narrower than 360: clock scales down
  await page.setViewportSize({ width: 300, height: 700 });
  await setup(page, BASE, '2026-10-22');
  await openSleep(page);
  const narrow = await page.evaluate(() => [Math.round(document.getElementById('sleep-clock').getBoundingClientRect().width), document.documentElement.scrollWidth - document.documentElement.clientWidth]);
  check('300px breed: klok schaalt mee (268px), geen scroll', narrow, [268, 0]);
  const hn = await handleCentre(page, 'bed'), pn = await ringPoint(page, 23 * 60);
  check('300px: handgreep op de ring', [Math.abs(hn.x - pn.x) < 1, Math.abs(hn.y - pn.y) < 1], [true, true]);

  console.log('screenshots:', shots.join(', '));
  await browser.close();
  // The touch check above dispatches synthetic PointerEvents (pointerId 7) that the browser does not know as an
  // active pointer, so setPointerCapture() throws there; a real touch always has an active pointer.
  check('geen JS-fouten', errors.filter(e => !/setPointerCapture.*No active pointer/.test(e)), []);
});

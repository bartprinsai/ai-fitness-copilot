// Calculators: number formatting (formatNumber/roundTo), the 1RM calculator (rounding, rep max
// table, hint), the Plate Calculator (header row, plate names, stored counts) — see
// DESIGN_SYSTEM.md "Typografie" (decimals, percentages), "Rep max-tabel van de 1RM-calculator",
// "Schijvencalculator" and PROJECT_CONTEXT.md.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const NO_TRANSITIONS = () => { const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}'; document.head.appendChild(st); };

H.run(async () => {
  const out = H.outDir(__filename);
  const allErrors = [];

  // ── 1. Rounding and number formatting (pure functions) ─────────────────────────
  {
    const { browser, page, errors } = await H.openApp();
    H.section('formatNumber: komma, half van nul af, geen overbodige nullen');
    const cases = [
      ['118,75 berekend (100×8 → rij 2)', (100 * (1 + 8 / 30)) / (1 + 2 / 30), false, '118,8'],
      ['92,625 met ruis, als gewicht', 92.62499999999999, true, '92,63'],
      ['22,5 met ruis', 22.499999999999996, false, '22,5'],
      ['1002,25 met ruis', 1002.2499999999999, false, '1002,3'],
      ['3800 / 32 (118,75)', 3800 / 32, false, '118,8'],
      ['2,25 met ruis', 2.2499999999999996, false, '2,3'],
      ['0,15 / 3 (0,05 met ruis)', 0.15 / 3, false, '0,1'],
      ['1,1 × 1,1 als gewicht', 1.1 * 1.1, true, '1,21'],
      ['741 / 8 als gewicht (92,625)', 741 / 8, true, '92,63'],
      ['-2,25 met ruis', -2.2499999999999996, false, '-2,3'],
      ['0', 0, false, '0'],
      ['150', 150, false, '150'],
      ['132,5 als gewicht', 132.5, true, '132,5'],
      ['93,75 als gewicht', 93.75, true, '93,75'],
      ['0,25 als gewicht', 0.25, true, '0,25'],
      ['1234,5 (geen duizendtalscheiding)', 1234.5, false, '1234,5'],
    ];
    for (const [label, v, weight, want] of cases) {
      H.check(`formatNumber(${label})`, await page.evaluate(([v, w]) => formatNumber(v, { weight: w }), [v, weight]), want);
    }
    H.check('roundOrm: exacte helften en voorbeelden (118,75 · 164,06 · 158,72 · 150,04 · 0,05)',
      await page.evaluate(() => [computeOneRm('100', '8').rows[1].weight, roundOrm(164.06), roundOrm(158.72), roundOrm(150.04), roundOrm(0.05)]),
      [118.8, 164.1, 158.7, 150, 0.1]);

    H.section('1RM: Epley, afgerond op 1 decimaal, rij 1 = geschat 1RM');
    for (const [wt, r] of [['142,5', '5'], ['100', '8'], ['137,5', '3'], ['87,25', '7'], ['163,75', '1'], ['150', '1']]) {
      const res = await page.evaluate(([a, b]) => {
        const w = parseOrmNumber(a), n = parseOrmNumber(b);
        const exact1rm = n === 1 ? w : w * (1 + n / 30);
        const exactRows = ORM_TABLE_REPS.map(k => k === 1 ? exact1rm : exact1rm / (1 + k / 30));
        const res = computeOneRm(a, b);
        const r1 = x => Math.round(Number(x.toPrecision(12)) * 10) / 10;
        return {
          oneRmOk: res.oneRm === r1(exact1rm),
          rowsOk: res.rows.every((x, i) => x.weight === r1(exactRows[i])),
          row1IsOneRm: res.rows[0].weight === res.oneRm && res.rows[0].percent === 100,
          shownClean: res.rows.every(x => !/,0$/.test(formatWeight(x.weight)) && !/,\d\d/.test(formatWeight(x.weight))),
        };
      }, [wt, r]);
      H.check(`${wt} kg × ${r}`, res, { oneRmOk: true, rowsOk: true, row1IsOneRm: true, shownClean: true });
    }
    H.check('142,5 × 5 → geschat 1RM 166,3 (166,25 half naar boven)', await page.evaluate(() => formatWeight(computeOneRm('142,5', '5').oneRm)), '166,3');
    H.check('foutmeldingen bij leeg / 0 / tekst',
      await page.evaluate(() => [computeOneRm('100', '').error, computeOneRm('100', '0').error, computeOneRm('abc', '5').error]),
      ['Vul zowel gewicht als reps in.', 'Reps moet een geheel getal van minimaal 1 zijn.', 'Gewicht moet een getal groter dan 0 zijn.']);

    H.section('Geen spatie voor % (broncode)');
    const src = ['app.js', 'index.html'].map(f => fs.readFileSync(path.join(H.ROOT, f), 'utf8')).join('\n');
    const hits = src.split('\n').filter(l => /\d\s+%|\}\s+%|>\s+%</.test(l) && !/^\s*\/\//.test(l.trim()) && !/width|height|translate|calc\(/.test(l)).map(l => l.trim().slice(0, 80));
    H.check('broncode: plekken met een spatie voor %', hits, []);
    allErrors.push(...errors);
    await browser.close();
  }

  // ── 2. 1RM calculator screen ───────────────────────────────────────────────────
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    const tag = `${theme} ${w}`;
    H.section(`1RM-calculator ${tag}`);
    const { browser, page, errors } = await H.openApp({ width: w, height: 1100, theme });
    await page.evaluate(NO_TRANSITIONS);
    const T = {};
    for (const t of ['--text', '--text-secondary', '--on-primary', '--primary', '--primary-light', '--border']) T[t] = await H.tokenColor(page, t);
    await page.evaluate(() => open1rmCalculator());

    // Hint only above 5 reps, while typing
    const hint = () => page.evaluate(() => { const h = document.getElementById('orm-hint'); const cs = getComputedStyle(h); return { vis: h.offsetParent !== null, s: `${cs.fontSize}/${cs.fontWeight}`, color: cs.color, tt: cs.textTransform }; });
    await page.fill('#orm-weight', '142,5');
    await page.click('#orm-reps');
    const seq = [['leeg', (await hint()).vis]];
    await page.keyboard.type('5'); seq.push(['5', (await hint()).vis]);
    await page.keyboard.press('Backspace'); await page.keyboard.type('6'); seq.push(['6', (await hint()).vis]);
    await page.keyboard.press('Backspace'); await page.keyboard.type('1'); seq.push(['1', (await hint()).vis]);
    await page.keyboard.type('2'); seq.push(['12', (await hint()).vis]);
    await page.keyboard.press('Backspace'); seq.push(['1', (await hint()).vis]);
    await page.keyboard.press('Backspace'); await page.keyboard.type('8'); const h8 = await hint(); seq.push(['8', h8.vis]);
    H.check(`${tag}: hulpregel tijdens typen (alleen bij meer dan 5 reps)`, seq, [['leeg', false], ['5', false], ['6', true], ['1', false], ['12', true], ['1', false], ['8', true]]);
    H.check(`${tag}: hulpregel 11px/400 --text-secondary, gewone schrijfwijze`, [h8.s, h8.color === T['--text-secondary'], h8.tt], ['11px/400', true, 'none']);

    const calc = async (wt, reps) => { await page.fill('#orm-weight', wt); await page.fill('#orm-reps', reps); await page.dispatchEvent('#orm-reps', 'input'); await page.click('#btn-orm-calculate'); await H.settle(page); };
    for (const [wt, reps] of [['142,5', '5'], ['60', '11'], ['163,75', '1']]) {
      await calc(wt, reps);
      const r = await page.evaluate(() => {
        const rows = [document.querySelector('.orm-table-head'), ...document.querySelectorAll('#orm-table-body .orm-table-row')];
        const body = rows.slice(1);
        const inner = row => { const b = row.getBoundingClientRect(), c = getComputedStyle(row); return { l: b.left + parseFloat(c.paddingLeft), r: b.right - parseFloat(c.paddingRight) }; };
        const textBox = el => { const range = document.createRange(); range.selectNodeContents(el); const rs = [...range.getClientRects()].filter(x => x.width); return { l: Math.min(...rs.map(x => x.left)), r: Math.max(...rs.map(x => x.right)), lines: rs.some(x => x.top >= rs[0].bottom - 1) ? 2 : 1 }; };
        const centerOf = el => { const b = textBox(el); return (b.l + b.r) / 2; };
        const round = v => Math.round(v * 100) / 100;
        const off = { head: 0, reps: 0, pctBox: 0, kgBox: 0 };
        const widths = new Set(), kgX = new Set(), pctX = new Set(), pctGap = new Set(), kgGap = new Set(), pctW = new Set(), kgW = new Set();
        let wraps = 0, overflow = 0;
        rows.forEach((row, ri) => {
          const i = inner(row), third = (i.r - i.l) / 3, mid = k => i.l + third * (k + 0.5);
          [...row.children].forEach(c => { widths.add(round(c.getBoundingClientRect().width)); if (c.scrollWidth > c.clientWidth + 0.5) overflow++; if (textBox(c).lines > 1) wraps++; });
          if (ri === 0) { [0, 1, 2].forEach(k => { off.head = Math.max(off.head, Math.abs(centerOf(row.children[k]) - mid(k))); }); return; }
          off.reps = Math.max(off.reps, Math.abs(centerOf(row.children[2]) - mid(2)));
          const pb = row.querySelector('.orm-pct-box'), kb = row.querySelector('.orm-weight-box');
          const pr = pb.getBoundingClientRect(), kr = kb.getBoundingClientRect();
          off.pctBox = Math.max(off.pctBox, Math.abs((pr.left + pr.right) / 2 - mid(0)));
          off.kgBox = Math.max(off.kgBox, Math.abs((kr.left + kr.right) / 2 - mid(1)));
          const pu = pb.querySelector('.set-unit').getBoundingClientRect(), pv = pb.querySelector('.set-val').getBoundingClientRect();
          const ku = kb.querySelector('.set-unit').getBoundingClientRect(), kv = kb.querySelector('.set-val').getBoundingClientRect();
          pctX.add(round(pu.left)); kgX.add(round(ku.left));
          pctGap.add(Math.round(pu.left - pv.right)); kgGap.add(Math.round(ku.left - kv.right));
          pctW.add(round(pr.width)); kgW.add(round(kr.width));
        });
        const natural = sel => round(Math.max(...[...document.querySelectorAll(sel)].map(b => { const t = textBox(b); return t.r - t.l; })));
        const cs = el => { const c = getComputedStyle(el); return `${c.fontSize}/${c.fontWeight}`; };
        const first = body[4] || body[0];
        const head = rows[0], ch = getComputedStyle(head);
        const card = document.querySelector('.orm-table-card'), cr = card.getBoundingClientRect();
        const own = body.filter(x => x.classList.contains('orm-table-row-own'));
        const ownR = own[0] && own[0].getBoundingClientRect();
        const res = document.getElementById('orm-result-value');
        const blocks = [...document.querySelector('#screen-calculator-1rm .plate-calc-scroll').children].filter(e => e.offsetParent);
        return {
          head: [...head.children].map(c => c.textContent), headStyle: `${ch.fontSize}/${ch.fontWeight} ${ch.textTransform}`, headBg: ch.backgroundColor, headColor: ch.color,
          oneWidth: widths.size, off: Object.fromEntries(Object.entries(off).map(([k, v]) => [k, round(v)])), wraps, overflow,
          pctX: pctX.size, kgX: kgX.size, pctGap: [...pctGap], kgGap: [...kgGap],
          pctW: [...pctW], kgW: [...kgW], pctNat: natural('.orm-pct-box'), kgNat: natural('.orm-weight-box'),
          vals: [...first.querySelectorAll('.set-val')].map(e => `${cs(e)} ${getComputedStyle(e).color}`),
          units: [...first.querySelectorAll('.set-unit')].map(e => `${cs(e)} ${getComputedStyle(e).color}`),
          lines: body.map(x => getComputedStyle(x).borderTopWidth + ' ' + getComputedStyle(x).borderTopColor),
          own: own.map(x => x.children[2].textContent), ownBg: own[0] && getComputedStyle(own[0]).backgroundColor,
          ownFull: !!ownR && Math.abs(ownR.left - cr.left) < 0.5 && Math.abs(ownR.right - cr.right) < 0.5,
          firstRow: [...body[0].children].map(c => c.textContent).join(' | '),
          result: res.textContent, resultVal: `${cs(res.querySelector('.set-val'))} ${getComputedStyle(res.querySelector('.set-val')).color}`,
          resultUnit: `${cs(res.querySelector('.set-unit'))} ${getComputedStyle(res.querySelector('.set-unit')).color}`,
          labels: [...document.querySelectorAll('#screen-calculator-1rm .section-label')].filter(l => l.offsetParent).map(l => l.textContent.trim()),
          gaps: blocks.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().top - blocks[i].getBoundingClientRect().bottom)),
        };
      });
      const t = `${tag} ${wt}×${reps}`;
      H.check(`${t}: kopbalk`, [r.head, r.headStyle, r.headBg === T['--primary'], r.headColor === T['--on-primary']], [['% van 1RM', 'Gewicht', 'Reps'], '11px/500 uppercase', true, true]);
      H.check(`${t}: drie even brede kolommen, niets loopt over of breekt af`, [r.oneWidth, r.wraps, r.overflow], [1, 0, 0]);
      H.ok(Object.values(r.off).every(v => v <= 0.5), `${t}: koppen, REPS en de %- en gewichtsvakken in het midden van hun kolom`, r.off);
      H.check(`${t}: "%" en "kg" in alle rijen op dezelfde x`, [r.pctX, r.kgX], [1, 1]);
      H.ok(r.pctW.length === 1 && Math.abs(r.pctW[0] - r.pctNat) < 0.5 && r.kgW.length === 1 && Math.abs(r.kgW[0] - r.kgNat) < 0.5, `${t}: vakken precies zo breed als de langste waarde`, { pct: [r.pctW, r.pctNat], kg: [r.kgW, r.kgNat] });
      H.check(`${t}: geen ruimte voor "%", 4px voor "kg"`, [r.pctGap, r.kgGap], [[0], [4]]);
      H.check(`${t}: waardes Groot getal --text, eenheden Klein --text-secondary`, [r.vals, r.units],
        [[`20px/700 ${T['--text']}`, `20px/700 ${T['--text']}`, `20px/700 ${T['--text']}`], [`12px/400 ${T['--text-secondary']}`, `12px/400 ${T['--text-secondary']}`]]);
      H.ok(r.lines[0].startsWith('0px') && r.lines.slice(1).every(l => l === '1px ' + T['--border']), `${t}: geen lijn onder de kop, 1px --border tussen de rijen`, r.lines.slice(0, 2));
      H.check(`${t}: geschat 1RM = rij 1 (Groot getal + "kg" op Klein)`, [r.result.replace('kg', ''), r.resultVal, r.resultUnit],
        [r.firstRow.split(' | ')[1].replace('kg', ''), `20px/700 ${T['--text']}`, `12px/400 ${T['--text-secondary']}`]);
      H.check(`${t}: geen label boven de tabel; 24px tussen alle blokken`, [r.labels, r.gaps.every(g => g === 24)], [['Gewicht (kg)', 'Reps', 'Geschat 1RM'], true]);
      const wantOwn = reps === '11' ? [] : [reps];
      H.check(`${t}: rij met de ingevulde reps gemarkeerd (--primary-light, volle kaartbreedte)`, [r.own, r.own.length ? r.ownBg === T['--primary-light'] && r.ownFull : true], [wantOwn, true]);
      if (reps === '1') H.check(`${t}: langste waardes op één regel`, r.firstRow, '100% | 163,8kg | 1');
      if (w === 360 && reps === '5') await page.screenshot({ path: path.join(out, `1rm-${theme}.png`), fullPage: true });
    }
    allErrors.push(...errors);
    await browser.close();
  }

  // ── 3. Plate Calculator ────────────────────────────────────────────────────────
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    const tag = `${theme} ${w}`;
    H.section(`Schijvencalculator ${tag}`);
    const { browser, page, errors } = await H.openApp({ width: w, height: 1400, theme });
    await page.evaluate(NO_TRANSITIONS);
    await page.evaluate(() => openPlateCalculator());
    const r = await page.evaluate(() => {
      const scr = document.getElementById('screen-calculator-plate');
      const head = scr.querySelector('.plate-list-header'), cols = [...head.children], list = document.getElementById('plate-list');
      const textRect = el => { const r = document.createRange(); r.selectNodeContents(el.firstChild); return r.getBoundingClientRect(); };
      const round = v => Math.round(v * 100) / 100;
      const st = el => { const c = getComputedStyle(el); return `${c.fontSize}/${c.fontWeight} ${c.textTransform} ${c.color}`; };
      const blocks = [...scr.querySelector('.plate-calc-scroll').children].filter(e => e.offsetParent);
      const names = [...list.querySelectorAll('.plate-row-name')].map(n => { const r = document.createRange(); r.selectNodeContents(n); return round(r.getClientRects()[0].left); });
      const rows = [...list.querySelectorAll('.plate-row')].map(row => {
        const n = row.querySelector('.plate-row-name'); const range = document.createRange(); range.selectNodeContents(n);
        return { name: n.textContent, lines: new Set([...range.getClientRects()].filter(x => x.width).map(x => Math.round(x.top))).size, meta: [...row.querySelectorAll('.plate-row-meta')].map(m => ({ t: m.textContent, ws: getComputedStyle(m).whiteSpace, lines: m.getClientRects().length })) };
      });
      return {
        headTexts: cols.map(c => c.innerText.replace(/\n/g, ' ')),
        oldLabel: [...scr.querySelectorAll('.section-label')].some(l => /beschikbare schijven/i.test(l.textContent)),
        tops: [...new Set(cols.map(c => round(textRect(c).top)))].length,
        nameLeft: [...new Set(names)], schijvenLeft: round(textRect(cols[0]).left),
        styles: [...new Set(cols.map(c => st(c)))],
        gaps: blocks.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().top - blocks[i].getBoundingClientRect().bottom)),
        headToCard: Math.round(list.getBoundingClientRect().top - head.getBoundingClientRect().bottom),
        rows,
      };
    });
    const secondary = await H.tokenColor(page, '--text-secondary');
    H.check(`${tag}: kopregel (geen los label "Beschikbare schijven")`, [r.headTexts, r.oldLabel], [['SCHIJVEN', 'BESCHIKBAAR (totaal)', 'OP STANG (per kant)'], false]);
    H.check(`${tag}: kolomkoppen op dezelfde hoogte, in de labelstijl`, [r.tops, r.styles], [1, [`11px/500 uppercase ${secondary}`]]);
    H.ok(r.nameLeft.length === 1 && Math.abs(r.nameLeft[0] - r.schijvenLeft) < 0.5, `${tag}: SCHIJVEN recht boven de schijfnamen`, [r.schijvenLeft, r.nameLeft]);
    H.check(`${tag}: 24px tussen de blokken, 12px tussen kopregel en kaart`, [r.gaps.every(g => g === 24), r.headToCard], [true, 12]);
    H.check(`${tag}: schijfnamen zonder "met"/"schijven"`, r.rows.filter(x => /met |schijven/.test(x.name)).map(x => x.name), []);
    H.ok(r.rows.every(x => x.lines <= 2), `${tag}: geen schijfnaam over meer dan 2 regels`, r.rows.filter(x => x.lines > 2).map(x => x.name));
    H.ok(r.rows.every(x => x.meta.every(m => m.ws === 'nowrap' && m.lines === 1)), `${tag}: elke grijze regel op één regel (nowrap)`);
    const p20 = r.rows.find(x => x.name === '20 kg wit'), p25w = r.rows.find(x => x.name === '20 kg wit handvaten');
    H.check(`${tag}: met afwijking twee regels, zonder één`, [p20.meta.map(m => m.t), p25w.meta.map(m => m.t)], [['gem. 20,8 kg', '±0,1 kg'], ['20,3 kg']]);
    if (w === 360) await page.screenshot({ path: path.join(out, `plate-${theme}.png`), fullPage: true });
    allErrors.push(...errors);
    await browser.close();
  }

  // Stored counts are keyed by plate id, independent of the shown name
  {
    H.section('Schijvencalculator: opgeslagen aantallen per id');
    const { browser, page, errors } = await H.openApp({ height: 1400 });
    await page.evaluate(() => { db.plateInventory = { p20WhiteHandles: 1, p15BlackHandles: 0, p10New: 4, p1Own: 1, p0_25Own: 0, p25: 2 }; db.plateOnBar = { p10New: 1, p1Own: 1 }; openPlateCalculator(); });
    const counts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.plate-row')].map(r => [r.querySelector('.plate-row-name').textContent, [...r.querySelectorAll('.plate-stepper-count')].map(c => c.textContent).join('/')])));
    H.check('aantallen (beschikbaar/op stang) bij de juiste schijf', [counts['20 kg wit handvaten'], counts['10 kg nieuw'], counts['1 kg eigen'], counts['25 kg'], counts['15 kg zwart handvaten']], ['1/0', '4/1', '1/1', '2/0', '0/0']);
    allErrors.push(...errors);
    await browser.close();
  }

  H.check('geen JS-fouten', allErrors, []);
});

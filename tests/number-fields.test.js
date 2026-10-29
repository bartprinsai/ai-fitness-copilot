// Number fields: value on Groot getal (20px/700), placeholder 20px/400 --text-muted, 48px box;
// the Sets & reps popup is the documented 16px/700 exception; text fields stay 16px/400.
// Plus typing limits (FIELD_DECIMALS/restrictNumber) and the display after leaving a calculator
// field. See DESIGN_SYSTEM.md "Inputs" and "Track-stepper".
const path = require('path');
const H = require('./helpers');

const CASES = [
  { screen: 'screen-calculator-plate', sel: '#plate-target-weight', long: '232,25' },
  { screen: 'screen-calculator-1rm', sel: '#orm-weight', long: '232,25' },
  { screen: 'screen-calculator-1rm', sel: '#orm-reps', long: '100' },
  { screen: 'screen-calculator-warmup', sel: '#warmup-weight', long: '232,25' },
  { overlay: 'uniform', sel: '#pde-sr-sets', long: '100', popup: true },
  { overlay: 'uniform', sel: '#pde-sr-reps', long: '100', popup: true },
  { overlay: 'persets', sel: '.pde-sr-set-reps-input', long: '100', popup: true },
];
const TEXT = ['#exercise-search', '#new-ex-name', '#new-plan-name', '#plan-rename-input', '#new-category-input', '#reset-confirm-input'];

H.run(async () => {
  const out = H.outDir(__filename);
  const allErrors = [];
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    const tag = `${theme} ${w}`;
    H.section(tag);
    const { browser, page, errors } = await H.openApp({ width: w, theme });
    const muted = await H.tokenColor(page, '--text-muted');
    for (const c of CASES) {
      await page.evaluate(c => {
        document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
        if (c.screen) document.getElementById(c.screen).classList.add('active');
        if (c.overlay) {
          pdeSrMode = c.overlay; pdeSrPerSetReps = [8, 8, 8];
          renderPdeSrMode();
          document.getElementById('pde-sets-reps-overlay').classList.add('open');
        }
      }, c);
      await H.settle(page);
      const r = await page.evaluate(({ sel, long }) => {
        const el = document.querySelector(sel);
        const realPh = el.hasAttribute('placeholder'); if (!realPh) el.setAttribute('placeholder', '8');
        const cs = getComputedStyle(el), ph = getComputedStyle(el, '::placeholder');
        const o = { h: Math.round(el.getBoundingClientRect().height), padEqual: cs.paddingTop === cs.paddingBottom, ph: `${ph.fontSize}/${ph.fontWeight}`, phColor: ph.color };
        el.value = long;
        const cs2 = getComputedStyle(el);
        o.val = `${cs2.fontSize}/${cs2.fontWeight}`;
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${cs2.fontWeight} ${cs2.fontSize} ${cs2.fontFamily}`;
        o.fits = ctx.measureText(long).width <= el.clientWidth - parseFloat(cs2.paddingLeft) - parseFloat(cs2.paddingRight) && el.scrollWidth <= el.clientWidth;
        if (!realPh) el.removeAttribute('placeholder');
        el.value = '';
        return o;
      }, c);
      const size = c.popup ? '16px' : '20px';
      H.check(`${tag} ${c.sel}: waarde ${size}/700, placeholder ${size}/400 --text-muted, 48px, "${c.long}" past`,
        [r.val, r.ph, r.phColor === muted, r.h, r.padEqual, r.fits], [`${size}/700`, `${size}/400`, true, 48, true, true]);
      if (w === 360 && theme === 'light') {
        const box = await page.locator(c.sel).first().boundingBox();
        await page.screenshot({ path: path.join(out, `${c.sel.replace(/[#.]/g, '')}.png`), clip: { x: 0, y: Math.max(0, box.y - 30), width: w, height: box.height + 50 } });
      }
    }
    const text = await page.evaluate(sels => sels.map(s => { const el = document.querySelector(s); el.value = 'Bankdrukken'; const cs = getComputedStyle(el), ph = getComputedStyle(el, '::placeholder'); const r = `${cs.fontSize}/${cs.fontWeight} ph ${ph.fontSize}/${ph.fontWeight}`; el.value = ''; return r; }), TEXT);
    H.check(`${tag}: tekstvelden blijven 16px/400`, text, TEXT.map(() => '16px/400 ph 16px/400'));
    allErrors.push(...errors);
    await browser.close();
  }

  H.section('Invoer begrenzen en weergave na verlaten');
  const { browser, page, errors } = await H.openApp();
  await page.evaluate(() => open1rmCalculator());
  const typeInto = async (sel, txt) => { await page.fill(sel, ''); await page.click(sel); await page.keyboard.type(txt); return page.inputValue(sel); };
  H.check('gewicht: max. 2 decimalen, één decimaalteken', await typeInto('#orm-weight', '102,555.5'), '102,55');
  H.check('reps: alleen cijfers', await typeInto('#orm-reps', '8,5x'), '85');
  await page.evaluate(() => showScreen('screen-calculator-plate'));
  for (const [typed, shown] of [['102.5', '102,5'], ['150.0', '150'], ['93.75', '93,75']]) {
    await typeInto('#plate-target-weight', typed);
    await page.locator('#plate-target-weight').blur();
    H.check(`schijvencalculator: "${typed}" na verlaten → "${shown}"`, await page.inputValue('#plate-target-weight'), shown);
  }
  allErrors.push(...errors);
  await browser.close();

  H.check('geen JS-fouten', allErrors, []);
});

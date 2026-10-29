// The logo, the app icons, the manifest and the splash (loading screen).
//   - manifest.json is valid; every icon exists with the size it claims; "any" and "maskable" at 192 and 512;
//   - the maskable icons: the tile colour over the whole square, the mark inside the 80% safe zone (with margin);
//   - the "any" icons have transparent corners, the apple-touch-icon none;
//   - index.html links the favicon (svg + 32px png) and the apple-touch-icon, and they exist;
//   - the splash is the same light screen in the light and the dark theme (--splash-* tokens), shows the
//     logo in the centre and the name, has the loading bar, and fades out as soon as the app is ready;
//   - the old logo (icon-192.png / icon-512.png / favicon.png in the root) is gone and referenced nowhere.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./helpers');

const ROOT = path.join(__dirname, '..');
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

H.run(async () => {
  H.section('manifest');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')); } catch (e) { /* checked below */ }
  H.ok(manifest, 'manifest.json is geldige JSON');
  H.check('name', manifest.name, 'AI Fitness Co-Pilot');
  H.check('background_color', manifest.background_color, '#f2f2f2');
  const icons = manifest.icons || [];
  for (const icon of icons) {
    const file = path.join(ROOT, icon.src);
    if (!H.ok(fs.existsSync(file), `${icon.src} bestaat`)) continue;
    H.check(`${icon.src}: maat`, pngSize(file).join('x'), icon.sizes);
    H.check(`${icon.src}: type`, icon.type, 'image/png');
  }
  const has = (purpose, size) => icons.some(i => i.purpose === purpose && i.sizes === `${size}x${size}`);
  for (const purpose of ['any', 'maskable']) for (const size of [192, 512]) H.ok(has(purpose, size), `icoon purpose "${purpose}" ${size}×${size}`);

  H.section('index.html: favicon en apple-touch-icon');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
  H.check('links', links, [['icon', 'icons/favicon.svg'], ['icon', 'icons/favicon-32.png'], ['apple-touch-icon', 'icons/apple-touch-icon.png']]);
  links.forEach(([, href]) => H.ok(fs.existsSync(path.join(ROOT, href)), `${href} bestaat`));
  H.check('favicon-32.png: maat', pngSize(path.join(ROOT, 'icons/favicon-32.png')), [32, 32]);
  H.check('apple-touch-icon.png: maat', pngSize(path.join(ROOT, 'icons/apple-touch-icon.png')), [180, 180]);

  H.section('pixels van de iconen');
  const { page, browser } = await H.openApp();
  // Per icon: the corner pixel, and the farthest pixel that differs from the tile colour (#212121), as a
  // fraction of the width from the centre.
  const analyse = async file => page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, n = c.width;
    let far = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const diff = Math.abs(d[i] - 0x21) + Math.abs(d[i + 1] - 0x21) + Math.abs(d[i + 2] - 0x21) + (255 - d[i + 3]);
      if (diff > 24) far = Math.max(far, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / n);
    }
    return { corner: [...d.slice(0, 4)], far: Math.round(far * 1000) / 1000 };
  }, 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, file)).toString('base64'));
  for (const size of [192, 512]) {
    const m = await analyse(`icons/maskable-${size}.png`);
    H.check(`maskable-${size}: hoek is de tegelkleur, ondoorzichtig`, m.corner, [0x21, 0x21, 0x21, 255]);
    H.ok(m.far <= 0.38, `maskable-${size}: inhoud binnen de veilige zone (≤ 40%, met marge ≤ 38%)`, m.far);
    const a = await analyse(`icons/icon-${size}.png`);
    H.check(`icon-${size}: hoek transparant`, a.corner[3], 0);
  }
  H.check('apple-touch-icon: hoek is de tegelkleur, ondoorzichtig', (await analyse('icons/apple-touch-icon.png')).corner, [0x21, 0x21, 0x21, 255]);

  H.section('laadscherm');
  let first = null;
  for (const theme of ['light', 'dark']) {
    const s = await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      const sp = document.getElementById('splash-screen');
      sp.style.display = ''; sp.classList.remove('is-hiding');
      const logo = sp.querySelector('.splash-logo'), name = sp.querySelector('.splash-name'), bar = sp.querySelector('.splash-bar');
      const r = logo.getBoundingClientRect(), nr = name.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const cs = el => getComputedStyle(el);
      return {
        bg: cs(sp).backgroundColor, opacity: cs(sp).opacity, nameColor: cs(name).color, name: name.textContent,
        barBg: cs(bar).backgroundColor, barMove: getComputedStyle(bar, '::before').backgroundColor, barH: br.height,
        barW: Math.round(br.width), logoW: Math.round(r.width),
        logoSrc: logo.getAttribute('src'), logoLoaded: logo.complete && logo.naturalWidth > 0,
        logoCentre: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)], view: [innerWidth / 2, innerHeight / 2],
        order: r.bottom <= nr.top && nr.bottom <= br.top, cover: [sp.offsetWidth, sp.offsetHeight].join('x') === [innerWidth, innerHeight].join('x'),
      };
    }, theme);
    H.check(`${theme}: achtergrond`, s.bg, 'rgb(242, 242, 242)');
    H.check(`${theme}: kleur van de naam`, s.nameColor, 'rgb(33, 33, 33)');
    H.check(`${theme}: naam`, s.name, 'AI Fitness Co-Pilot');
    H.ok(s.logoSrc === 'icons/logo.svg' && s.logoLoaded, `${theme}: logo geladen (icons/logo.svg)`, s.logoSrc);
    H.check(`${theme}: logo in het midden van het scherm`, s.logoCentre, s.view);
    H.ok(s.order, `${theme}: logo, daaronder de naam, daaronder de laadbalk`);
    H.ok(s.cover && s.opacity === '1', `${theme}: laadscherm dekt het hele scherm`);
    H.check(`${theme}: laadbalk 3px hoog, even breed als het logo`, [s.barH, s.barW], [3, s.logoW]);
    H.check(`${theme}: laadbalk spoor en bewegend stuk`, [s.barBg, s.barMove], ['rgb(225, 245, 254)', await H.tokenColor(page, '--primary')]);
    if (!first) first = s; else H.check('licht en donker zien er hetzelfde uit', { ...s, view: 0 }, { ...first, view: 0 });
  }

  H.section('laadscherm verdwijnt zodra de app klaar is');
  const fade = await page.evaluate(() => {
    const sp = document.getElementById('splash-screen');
    showScreen('screen-home');
    authDone = true; splashHidden = false;
    const t0 = performance.now();
    checkAndReveal();
    return { cls: sp.classList.contains('is-hiding'), duration: getComputedStyle(sp).transitionDuration, t0 };
  });
  H.ok(fade.cls, 'is-hiding gezet zodra auth klaar is (geen vaste wachttijd)');
  H.check('vervaagt in 200 ms', fade.duration, '0.2s');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('splash-screen')).display === 'none', null, { timeout: 2000 });
  H.ok(true, 'laadscherm daarna weg (display: none)');
  H.ok(await page.evaluate(() => document.getElementById('screen-home').classList.contains('active')), 'hoofdmenu zichtbaar');
  await browser.close();

  H.section('het oude logo');
  for (const f of ['icon-192.png', 'icon-512.png', 'favicon.png']) H.ok(!fs.existsSync(path.join(ROOT, f)), `${f} (oud) bestaat niet meer`);
  const tracked = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.(html|js|json|css|md|svg)$/.test(f) && f !== 'tests/logo-splash.test.js' && !f.includes('package-lock'));
  const old = /(^|[^\w\/-])(icon-(192|512)\.png|favicon\.png)/;
  const hits = tracked.filter(f => fs.existsSync(path.join(ROOT, f)) && old.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  H.check('geen verwijzingen naar het oude logo', hits, []);
});

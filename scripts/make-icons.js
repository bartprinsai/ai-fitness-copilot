// Makes every app icon from the one logo source, icons/logo.svg (viewBox 0 0 100 100):
//   icons/icon-192.png, icons/icon-512.png        purpose "any": the logo as is (rounded tile, transparent corners)
//   icons/maskable-192.png, icons/maskable-512.png purpose "maskable": the tile colour over the whole square,
//                                                  the mark smaller and centred, well inside the 80% safe zone
//   icons/apple-touch-icon.png (180)               the tile colour over the whole square, the mark as is
//   icons/favicon-32.png, icons/favicon.svg        the logo as is
// Run from the repo root after changing the logo:  node scripts/make-icons.js
// Uses the Playwright of the tests (root package.json, `npm install`): Chromium draws the SVG.
// The logo source is expected to be one tile `<rect width="100" height="100" … fill="…"/>` plus the mark
// (everything else); the script stops when it can't find that tile.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'icons');
// The mark in the maskable icon, relative to the logo. 0.78 keeps its farthest point (the corners of the
// small plates) at about 36% of the width from the centre: inside the safe zone (a circle of 40%) with room.
const MASKABLE_SCALE = 0.78;

const logo = fs.readFileSync(path.join(DIR, 'logo.svg'), 'utf8');
const tileRe = /<rect\s+width="100"\s+height="100"[^>]*fill="([^"]+)"[^>]*\/>/;
const tile = logo.match(tileRe);
if (!tile) throw new Error('icons/logo.svg: geen tegel <rect width="100" height="100" … fill="…"/> gevonden');
const tileColor = tile[1];
const mark = logo.slice(logo.indexOf('>') + 1, logo.lastIndexOf('</svg>')).replace(tileRe, '').trim();
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Centre of the mark (its bounding box, stroke ignored), so the maskable mark sits in the middle.
  await page.setContent(`<body>${svg(mark)}</body>`);
  const box = await page.evaluate(() => { const b = document.querySelector('svg').getBBox(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; });
  const full = svg(`<rect width="100" height="100" fill="${tileColor}"/>${mark}`);
  const maskable = svg(`<rect width="100" height="100" fill="${tileColor}"/><g transform="translate(50 50) scale(${MASKABLE_SCALE}) translate(${-box.cx} ${-box.cy})">${mark}</g>`);

  const render = async (source, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
    await page.screenshot({ path: path.join(ROOT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`${file} (${size}×${size})`);
  };
  await render(logo, 192, 'icons/icon-192.png');
  await render(logo, 512, 'icons/icon-512.png');
  await render(maskable, 192, 'icons/maskable-192.png');
  await render(maskable, 512, 'icons/maskable-512.png');
  await render(full, 180, 'icons/apple-touch-icon.png');
  await render(logo, 32, 'icons/favicon-32.png');
  fs.writeFileSync(path.join(DIR, 'favicon.svg'), logo);
  console.log('icons/favicon.svg (kopie van logo.svg)');
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });

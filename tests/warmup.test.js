// Warm-up Calculator: the gym ladders for Bench and Squat (scenarios, descending jumps, minimum
// last jump), Deadlift unchanged against commit bd23afc (the last one before the gym ladders), input validation, and what the screen
// shows (comma, "kg", work set without reps).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./helpers');

// The pure warm-up logic (between the <warmup-pure> markers) in its own vm context.
function loadPure(src) {
  const m = src.match(/\/\/ <warmup-pure>([\s\S]*?)\/\/ <\/warmup-pure>/);
  if (!m) throw new Error('warmup-pure markers niet gevonden');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[1] + '\n;globalThis.computeWarmup = computeWarmup; globalThis.WARMUP_EXERCISES = WARMUP_EXERCISES;', ctx);
  return ctx;
}
// A result as the screen lists it, e.g. ["bar×10", "40×8", …, "100 WS"].
const lines = res => res.error ? res.error : res.rows.map(r => r.bar ? 'bar×' + r.reps : r.work ? r.weight + ' WS' : r.weight + '×' + r.reps);
const ladder = (steps, work) => ['bar×10', ...steps, work + ' WS'];
// The expected rep series per exercise (then 1 for every further step).
const WARMUP_REPS = { bench: [8, 5, 3, 2], squat: [5, 3, 2] };

H.run(async () => {
  const cur = loadPure(fs.readFileSync(path.join(H.ROOT, 'app.js'), 'utf8'));

  H.section('Bench: scenario\'s');
  const B = ['40×8', '60×5', '80×3'];
  const bench = [
    ['100', [...B, '90×2'], 100],
    ['110', [...B, '100×2'], 110],
    ['112,5', [...B, '100×2', '107.5×1'], 112.5],
    ['115', [...B, '100×2', '107.5×1'], 115],
    ['117,5', [...B, '100×2', '110×1'], 117.5],
    ['120', [...B, '100×2', '110×1'], 120],
    ['122', [...B, '100×2', '110×1', '117×1'], 122],
    ['122,5', [...B, '100×2', '110×1', '117.5×1'], 122.5],
    ['125', [...B, '100×2', '110×1', '117.5×1'], 125],
    ['127,5', [...B, '100×2', '110×1', '120×1'], 127.5],
    ['130', [...B, '100×2', '110×1', '120×1'], 130],
    ['131', [...B, '100×2', '110×1', '120×1', '126×1'], 131],
    ['132', [...B, '100×2', '110×1', '120×1', '127×1'], 132],
    ['132,5', [...B, '100×2', '110×1', '120×1', '127.5×1'], 132.5],
    ['133', [...B, '100×2', '110×1', '120×1', '127.5×1'], 133],
    ['135', [...B, '100×2', '110×1', '120×1', '127.5×1'], 135],
    ['136', [...B, '100×2', '110×1', '120×1', '130×1'], 136],
    ['139', [...B, '100×2', '110×1', '120×1', '130×1'], 139],
    ['140', [...B, '100×2', '110×1', '120×1', '130×1'], 140],
    ['150', [...B, '100×2', '110×1', '120×1', '130×1', '140×1'], 150],
  ];
  for (const [w, steps, work] of bench) H.check('Bench ' + w, lines(cur.computeWarmup('bench', w)), ladder(steps, work));

  H.section('Squat: scenario\'s');
  const S = ['60×5', '80×3', '100×2', '120×1', '140×1', '160×1', '180×1'];
  const squat = [
    ['200', [], 200], ['201', ['191×1'], 201], ['202,5', ['192.5×1'], 202.5], ['205', ['192.5×1'], 205],
    ['207,5', ['195×1'], 207.5], ['210', ['195×1'], 210], ['212,5', ['197.5×1'], 212.5],
    ['215', ['200×1'], 215], ['217,5', ['200×1'], 217.5], ['220', ['200×1'], 220],
  ];
  for (const [w, extra, work] of squat) H.check('Squat ' + w, lines(cur.computeWarmup('squat', w)), ladder([...S, ...extra], work));

  H.section('Bench 100–200 en Squat 150–300 (per 0,5 kg): sprongen nooit groter, laatste sprong groot genoeg');
  for (const [ex, from, to, minLast] of [['bench', 100, 200, 5], ['squat', 150, 300, 10]]) {
    const bad = [];
    for (let h = from * 2; h <= to * 2; h++) {
      const w = h / 2;
      const res = cur.computeWarmup(ex, String(w).replace('.', ','));
      const ws = res.rows.map(r => Math.round(r.weight * 100));
      const jumps = ws.slice(1).map((x, i) => x - ws[i]);
      const up = jumps.findIndex((j, i) => i > 0 && j > jumps[i - 1]);
      const last = jumps[jumps.length - 1];
      const reps = res.rows.filter(r => !r.bar && !r.work).map(r => r.reps);
      const want = WARMUP_REPS[ex].slice(0, reps.length).concat(new Array(Math.max(0, reps.length - WARMUP_REPS[ex].length)).fill(1));
      if (up >= 0) bad.push(`${w}: sprong ${jumps[up] / 100} na ${jumps[up - 1] / 100} (${lines(res).join(', ')})`);
      if (last < minLast * 100) bad.push(`${w}: laatste sprong ${last / 100} < ${minLast}`);
      if (jumps.some(j => j <= 0)) bad.push(`${w}: stap niet zwaarder dan de vorige`);
      if (JSON.stringify(reps) !== JSON.stringify(want)) bad.push(`${w}: reps ${reps}`);
      if (!res.regular) bad.push(`${w}: regular = false`);
    }
    H.check(`${ex} ${from}–${to}: afwijkingen`, bad, []);
  }

  H.section('Lichte werkgewichten en randgevallen');
  H.check('Bench 30: alleen lege stang (tooLight)', [lines(cur.computeWarmup('bench', '30')), cur.computeWarmup('bench', '30').tooLight], [['bar×10', '30 WS'], true]);
  H.check('Bench 35: één tussenstap 27,5', lines(cur.computeWarmup('bench', '35')), ['bar×10', '27.5×8', '35 WS']);
  H.check('Bench 50: 40×8', lines(cur.computeWarmup('bench', '50')), ['bar×10', '40×8', '50 WS']);
  H.check('Squat 40: alleen lege stang', lines(cur.computeWarmup('squat', '40')), ['bar×10', '40 WS']);
  H.check('Squat 70: 40 (lege stang + 20)', lines(cur.computeWarmup('squat', '70')), ['bar×10', '40×5', '70 WS']);
  H.check('Squat 80: 60×5', lines(cur.computeWarmup('squat', '80')), ['bar×10', '60×5', '80 WS']);
  H.check('Bench 122,25 (2 decimalen): tussenstap 117,25', lines(cur.computeWarmup('bench', '122,25')), ladder([...B, '100×2', '110×1', '117.25×1'], 122.25));
  H.check('Squat 400: ladder loopt door tot 380', lines(cur.computeWarmup('squat', '400')).slice(-3), ['360×1', '380×1', '400 WS']);
  H.check('Invoervalidatie ongewijzigd', ['', 'abc', '0', '20', '1e3', '-5'].map(w => cur.computeWarmup('bench', w).error), [
    'Vul een werkgewicht in.', 'Werkgewicht moet een getal groter dan 0 zijn.', 'Werkgewicht moet een getal groter dan 0 zijn.',
    'Werkgewicht moet zwaarder zijn dan de lege stang (20 kg).', 'Werkgewicht moet een getal groter dan 0 zijn.', 'Werkgewicht moet een getal groter dan 0 zijn.']);

  H.section('Deadlift: gelijk aan commit bd23afc');
  H.check('Deadlift 250', lines(cur.computeWarmup('deadlift', '250')), ['bar×10', '70×5', '110×3', '150×2', '190×1', '225×1', '250 WS']);
  let old = null;
  try { old = loadPure(execSync('git show bd23afc:app.js', { cwd: H.ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); } catch (e) { /* no git */ }
  if (old && !old.WARMUP_EXERCISES.bench.ladderStart) {
    const diff = [];
    for (let h = 0; h <= 1200 * 4; h++) {
      const w = String(h / 4).replace('.', ',');
      if (JSON.stringify(cur.computeWarmup('deadlift', w)) !== JSON.stringify(old.computeWarmup('deadlift', w))) diff.push(w);
    }
    H.check('Deadlift 0–1200 kg per 0,25 kg identiek aan bd23afc (schema, tooLight, regular)', diff, []);
  } else H.ok(false, 'Deadlift-vergelijking met bd23afc: commit niet gevonden');

  H.section('Scherm: weergave met komma, kg, werkset zonder reps');
  const { browser, page, errors } = await H.openApp();
  const shown = async (ex, w) => page.evaluate(([ex, w]) => {
    openWarmupCalculator();
    document.querySelector(`#warmup-ex-options .plate-bar-option[data-ex="${ex}"]`).click();
    document.getElementById('warmup-weight').value = w;
    document.getElementById('btn-warmup-calculate').click();
    return [...document.querySelectorAll('#warmup-result-list .plate-result-line')].map(e => e.textContent);
  }, [ex, w]);
  H.check('Bench 122,5 op het scherm', await shown('bench', '122,5'),
    ['Lege stang × 10', '40 kg × 8', '60 kg × 5', '80 kg × 3', '100 kg × 2', '110 kg × 1', '117,5 kg × 1', '122,5 kg (werkset)']);
  H.check('Squat 202,5 op het scherm', await shown('squat', '202,5'),
    ['Lege stang × 10', '60 kg × 5', '80 kg × 3', '100 kg × 2', '120 kg × 1', '140 kg × 1', '160 kg × 1', '180 kg × 1', '192,5 kg × 1', '202,5 kg (werkset)']);
  H.check('Deadlift 250 op het scherm', await shown('deadlift', '250'),
    ['Lege stang × 10', '70 kg × 5', '110 kg × 3', '150 kg × 2', '190 kg × 1', '225 kg × 1', '250 kg (werkset)']);
  await browser.close();
  if (errors.length) H.check('geen JS-fouten op de pagina', errors, []);
});

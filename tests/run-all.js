// Runs every tests/*.test.js (one Node process each, several side by side) and prints an overview:
// per file the number of checks that passed and failed, and how long it took. `npm test` runs this.
//   node tests/run-all.js              all tests, quick round (light, 360px)
//   node tests/run-all.js --full       full round: light and dark at 360 and 390px (npm run test:full)
//   node tests/run-all.js insight      only the files whose name contains "insight" (in either round)
//   --workers=2                        how many files run at the same time (default: CPU cores − 1)
//   --verbose                          also print every check line of every file
// The round is passed on to each file as TEST_FULL (tests/helpers.js: THEMES / WIDTHS). The files
// don't share anything: each has its own browser, its own output folder (tests/output/<name>/) and
// its own log (tests/output/<name>.log). Exit code 1 when any check fails or a file crashes or hangs.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const full = args.includes('--full') || process.env.TEST_FULL === '1';
const workersArg = args.find(a => a.startsWith('--workers='));
const workers = Math.max(1, workersArg ? parseInt(workersArg.split('=')[1], 10) || 1 : os.cpus().length - 1);
const filter = args.find(a => !a.startsWith('--')) || '';
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
const logDir = path.join(__dirname, 'output');
fs.mkdirSync(logDir, { recursive: true });

function runFile(file) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], { cwd: path.join(__dirname, '..'), env: { ...process.env, TEST_FULL: full ? '1' : '0' } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nFAIL time-out na 10 minuten'; child.kill(); }, 10 * 60 * 1000);
    child.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(logDir, file.replace(/\.test\.js$/, '.log')), out);
      const m = out.match(/^RESULT (\{.*\})$/m);
      const r = m ? JSON.parse(m[1]) : { passed: 0, failed: 0 };
      const crashed = !m;
      if (crashed) r.failed++;
      // A file that ends with a non-zero exit code without a failed check still counts as failed.
      if (!crashed && code !== 0 && !r.failed) r.failed++;
      resolve({ file, ...r, crashed, code, seconds: Math.round((Date.now() - started) / 1000), fails: out.split('\n').filter(l => l.startsWith('FAIL')), out });
    });
  });
}

const line = r => `  ${r.file.padEnd(34)} ${r.failed ? 'FAALT' : 'ok   '}  ${String(r.passed).padStart(4)} geslaagd  ${String(r.failed).padStart(3)} gefaald  ${String(r.seconds).padStart(4)} s${r.crashed ? '  (liep vast, zie log)' : ''}`;

(async () => {
  if (!files.length) { console.log(`Geen tests gevonden${filter ? ` met "${filter}"` : ''}.`); process.exitCode = 1; return; }
  const n = Math.min(workers, files.length);
  console.log(`${files.length} testbestanden${filter ? ` met "${filter}"` : ''} — ${full ? 'volledige ronde (licht en donker, 360 en 390px)' : 'snelle ronde (licht, 360px)'}, ${n} tegelijk\n`);
  const started = Date.now();
  // A queue every worker takes the next file from: the slowest first (by the times of the last run of
  // this round, tests/output/durations.json), so a slow file doesn't start last and hold up the end.
  const durFile = path.join(logDir, 'durations.json');
  let last = {}; try { last = JSON.parse(fs.readFileSync(durFile, 'utf8'))[full ? 'full' : 'quick'] || {}; } catch (e) { /* first run */ }
  const queue = [...files].sort((a, b) => (last[b] || 0) - (last[a] || 0)), results = [];
  let finished = 0;
  const tty = process.stdout.isTTY;
  const worker = async () => {
    while (queue.length) {
      const r = await runFile(queue.shift());
      results.push(r);
      finished++;
      if (tty) process.stdout.write(`\r  ${finished}/${files.length} klaar …`);
      if (verbose) console.log(`\n${r.out}`);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  if (tty) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  results.sort((a, b) => a.file.localeCompare(b.file));
  let all = {}; try { all = JSON.parse(fs.readFileSync(durFile, 'utf8')); } catch (e) { /* first run */ }
  all[full ? 'full' : 'quick'] = { ...(all[full ? 'full' : 'quick'] || {}), ...Object.fromEntries(results.map(r => [r.file, r.seconds])) };
  fs.writeFileSync(durFile, JSON.stringify(all, null, 2));
  results.forEach(r => console.log(line(r)));
  const passed = results.reduce((s, r) => s + r.passed, 0), failed = results.reduce((s, r) => s + r.failed, 0);
  console.log(`\n  ${'Totaal'.padEnd(34)} ${failed ? 'FAALT' : 'ok   '}  ${String(passed).padStart(4)} geslaagd  ${String(failed).padStart(3)} gefaald  ${String(Math.round((Date.now() - started) / 1000)).padStart(4)} s`);
  const bad = results.filter(r => r.failed);
  if (bad.length) {
    console.log('\nWat faalt:');
    bad.forEach(r => { console.log(`  ${r.file} (log: tests/output/${r.file.replace(/\.test\.js$/, '.log')})`); r.fails.slice(0, 10).forEach(l => console.log('    ' + l.slice(0, 220))); });
  }
  process.exitCode = failed ? 1 : 0;
})();

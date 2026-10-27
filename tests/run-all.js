// Runs every tests/*.test.js (one Node process each, one after the other) and prints an overview:
// per file the number of checks that passed and failed. `npm test` runs this.
//   node tests/run-all.js              all tests
//   node tests/run-all.js insight      only the files whose name contains "insight"
//   --verbose                          also print every check line of every file
// Exit code 1 when any check fails or a file crashes. Full output per file: tests/output/<name>.log.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filter = args.find(a => !a.startsWith('--')) || '';
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
const logDir = path.join(__dirname, 'output');
fs.mkdirSync(logDir, { recursive: true });

function runFile(file) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], { cwd: path.join(__dirname, '..') });
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
      resolve({ file, ...r, crashed, code, seconds: Math.round((Date.now() - started) / 1000), fails: out.split('\n').filter(l => l.startsWith('FAIL')), out });
    });
  });
}

(async () => {
  if (!files.length) { console.log(`Geen tests gevonden${filter ? ` met "${filter}"` : ''}.`); process.exitCode = 1; return; }
  console.log(`${files.length} testbestanden${filter ? ` met "${filter}"` : ''}\n`);
  const results = [];
  for (const f of files) {
    if (process.stdout.isTTY) process.stdout.write(`  ${f.padEnd(34)} …`); // overwritten by the result line
    const r = await runFile(f);
    results.push(r);
    process.stdout.write(`${process.stdout.isTTY ? '\r' : ''}  ${f.padEnd(34)} ${r.failed ? 'FAALT' : 'ok   '}  ${String(r.passed).padStart(4)} geslaagd  ${String(r.failed).padStart(3)} gefaald  ${String(r.seconds).padStart(4)} s${r.crashed ? '  (liep vast, zie log)' : ''}\n`);
    if (verbose) console.log(r.out);
  }
  const passed = results.reduce((n, r) => n + r.passed, 0), failed = results.reduce((n, r) => n + r.failed, 0);
  console.log(`\n  ${'Totaal'.padEnd(34)} ${failed ? 'FAALT' : 'ok   '}  ${String(passed).padStart(4)} geslaagd  ${String(failed).padStart(3)} gefaald`);
  const bad = results.filter(r => r.failed);
  if (bad.length) {
    console.log('\nWat faalt:');
    bad.forEach(r => { console.log(`  ${r.file} (log: tests/output/${r.file.replace(/\.test\.js$/, '.log')})`); r.fails.slice(0, 10).forEach(l => console.log('    ' + l.slice(0, 220))); });
  }
  process.exitCode = failed ? 1 : 0;
})();

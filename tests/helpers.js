// Shared basis for every test in tests/ (see PROJECT_CONTEXT.md, "Tests").
//
// Two kinds of test:
//   - browser tests: the real index.html in headless Chromium (Playwright), with
//     openApp() — Firebase is replaced by a no-op stub and every network request
//     other than the app's own files (and Google Fonts) is blocked, so a test can
//     never reach the real Firestore or sign in;
//   - vm tests: app.js in a Node vm with a fake DOM and an in-memory Firestore
//     (runInVm() with a FakeStore), for storage logic without a browser.
// Both count their checks in the same way; done() prints the summary line that
// tests/run-all.js reads (RESULT {"passed":n,"failed":m}) and sets the exit code.
//
// Quick and full round — ONE setting for every test file: the layout checks run over THEMES ×
// WIDTHS. Quick (npm test, the default): light at 360px. Full (npm run test:full, or TEST_FULL=1 /
// --full when you run one file): light and dark at 360 and 390px. A test never lists the themes or
// widths itself: `for (const theme of H.THEMES) for (const w of H.WIDTHS)`.
//
// Speed: one browser per test file (openApp() opens a new context in it, cheap), and no fixed
// waits — settle(page) waits until the app is idle (see there).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
// "Today" in every test unless a test says otherwise: Thursday 22 October 2026 (week 43).
const TODAY = '2026-10-22';
const FULL = process.env.TEST_FULL === '1' || process.argv.includes('--full');
const THEMES = FULL ? ['light', 'dark'] : ['light'];
const WIDTHS = FULL ? [360, 390] : [360];

// ── Checks ──────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
// Deep equality via JSON, like every test here has always done.
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(actual)}${ok ? '' : '\n       verwacht ' + JSON.stringify(expected)}`);
  return ok;
}
// A plain condition with a message.
function ok(cond, name, detail) {
  if (cond) passed++; else failed++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${!cond && detail !== undefined ? ': ' + JSON.stringify(detail) : ''}`);
  return !!cond;
}
function section(title) { console.log(`\n── ${title}`); }
// Prints the summary and sets the exit code. Call once, at the end of the test.
function done(extraErrors = []) {
  if (extraErrors.length) check('geen JS-fouten op de pagina', extraErrors, []);
  console.log(failed ? `\n${failed} FOUT(EN), ${passed} geslaagd` : `\nALLES OK (${passed} controles)`);
  console.log('RESULT ' + JSON.stringify({ passed, failed }));
  process.exitCode = failed ? 1 : 0;
}
// Runs an async test body; a crash counts as a failure (and is shown), never as a pass. The shared
// browser is always closed afterwards, also after a crash, so a crashed test ends at once instead of
// keeping its process alive (until run-all's time-out).
function run(fn) {
  fn().catch(e => { failed++; console.log('FAIL test liep vast: ' + (e && e.stack || e)); })
    .finally(async () => { await closeBrowser(); done(); });
}

// ── Output (screenshots and the like) ───────────────────────────────────────────
// tests/output/<test name>/ — in .gitignore.
function outDir(testFile) {
  const dir = path.join(__dirname, 'output', path.basename(testFile).replace(/\.test\.js$/, ''));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Browser tests ───────────────────────────────────────────────────────────────
// Deep no-op stub for the Firebase compat SDK: no network, no user, nothing is ever stored.
const FIREBASE_STUB = `(function(){ const stub = () => new Proxy(function(){}, { get: (t, k) => k === 'then' ? undefined : stub(), apply: () => stub() }); window.firebase = stub(); })();`;

// Opens the app in headless Chromium on a fixed "today", with Firebase stubbed and the network
// blocked. Returns { browser, ctx, page, errors } (errors: uncaught page errors).
//   width/height: viewport (default 360 × 800); theme: 'light' | 'dark'; now: an ISO time;
//   touch: a mobile context with touch events.
//   The returned `browser` only closes this context (browser.close()); the real browser is shared by
//   every openApp() of the test file and closed by run().
let sharedBrowser = null;
async function getBrowser() {
  if (!sharedBrowser) { const { chromium } = require('playwright'); sharedBrowser = chromium.launch(); }
  return sharedBrowser;
}
async function closeBrowser() {
  if (!sharedBrowser) return;
  const b = sharedBrowser; sharedBrowser = null;
  try { await (await b).close(); } catch (e) { /* already gone */ }
}
// In the page, before the app's own scripts: keeps count of the app's pending short timers
// (setTimeout up to IDLE_TIMER_MS), so settle() can wait until they have run. Longer timers (a toast
// that hides after 2 s, the splash) are not waited for: a test that needs them waits for their
// result (the toast hidden) instead.
const IDLE_TIMER_MS = 1000;
// Per pending timer its callback's source, so settle() can see a safety net that has nothing left to do.
const TIMER_TRACKER = `(() => {
  const pending = new Map(), st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  window.__pendingTimers = pending;
  window.setTimeout = (fn, ms = 0, ...a) => {
    if (!(ms <= ${IDLE_TIMER_MS})) return st(fn, ms, ...a);
    const id = st((...x) => { pending.delete(id); typeof fn === 'function' ? fn(...x) : eval(fn); }, ms, ...a);
    pending.set(id, String(fn)); return id;
  };
  window.clearTimeout = id => { pending.delete(id); ct(id); };
})();`;
// Waits until the app is idle — a concrete state instead of a fixed wait: no CSS transition or
// finite animation running (an endless spinner doesn't count), no short app timer pending, the fonts
// loaded; then two more frames, so whatever that last step changed has been laid out and painted.
// One kind of pending timer doesn't count: the app's 500ms safety net after a history step
// (popHistoryEntrySilently / restoreConsumedEntry: `if (suppressNextPopstate) …`) once the popstate it
// guards has arrived — suppressNextPopstate is false again, so the timer has nothing left to do.
async function settle(page, { timeout = 5000 } = {}) {
  // A running transition or finite animation is finished at once (Animation.finish(): the same end
  // state, the same events, as waiting it out — the app doesn't listen to transition events anyway).
  await page.waitForFunction(() => {
    document.getAnimations().forEach(a => { if (a.playState === 'running' && a.effect.getComputedTiming().endTime !== Infinity) a.finish(); });
    const guardOff = typeof suppressNextPopstate !== 'undefined' && !suppressNextPopstate;
    const busy = [...(window.__pendingTimers || new Map()).values()].filter(src => !(guardOff && src.includes('if (suppressNextPopstate)')));
    return document.fonts.status === 'loaded' && busy.length === 0;
  }, null, { polling: 'raf', timeout });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function openApp({ width = 360, height = 800, theme = 'light', now = TODAY + 'T12:00:00+02:00', touch = false, scale = 1 } = {}) {
  const real = await getBrowser();
  const ctx = await real.newContext({ viewport: { width, height }, deviceScaleFactor: scale, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? FIREBASE_STUB : '' });
    if (u.startsWith('file:') || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  const browser = { close: () => ctx.close(), newContext: (...a) => real.newContext(...a) };
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(TIMER_TRACKER); // after the clock, so it wraps the clock's setTimeout
  await page.goto(APP_URL);
  await settle(page);
  await page.evaluate(theme => {
    document.documentElement.dataset.theme = theme;
    const sp = document.getElementById('splash-screen'); if (sp) sp.style.display = 'none';
    currentUser = null; // nothing is persisted: every persist* function stops without a user
  }, theme);
  return { browser, ctx, page, errors };
}
// Replaces the user data with `data` (a plain object in the shape of `db`) and sets the theme.
// Starts from an empty db, so nothing of an earlier scenario stays behind.
async function loadData(page, data = {}, theme) {
  await page.evaluate(({ d, theme }) => {
    if (theme) document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    currentUser = null;
    Object.keys(db).forEach(k => { db[k] = Array.isArray(db[k]) ? [] : (db[k] && typeof db[k] === 'object' ? {} : db[k]); });
    Object.assign(db, JSON.parse(JSON.stringify(d)));
  }, { d: data, theme });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The colour a token resolves to in the current theme, as rgb(…), for comparing computed styles.
async function tokenColor(page, token) {
  return page.evaluate(t => { const d = document.createElement('div'); d.style.color = `var(${t})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, token);
}

// ── vm tests (no browser) ───────────────────────────────────────────────────────
// A fake element: enough of the DOM API for app.js to load and run its logic.
function makeEl(tag) {
  const store = { value: '', textContent: '', innerHTML: '', dataset: {}, style: {}, children: [], disabled: false, checked: false };
  const classes = new Set();
  store.classList = {
    add: (...c) => c.forEach(x => classes.add(x)),
    remove: (...c) => c.forEach(x => classes.delete(x)),
    contains: c => classes.has(c),
    toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : !!force; on ? classes.add(c) : classes.delete(c); return on; },
  };
  const p = new Proxy(function () {}, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'className') return [...classes].join(' ');
      if (k === 'appendChild' || k === 'prepend' || k === 'append') return c => { store.children.push(c); return c; };
      if (k === 'addEventListener') return (type, f) => { (store.listeners = store.listeners || {})[type] = [...((store.listeners || {})[type] || []), f]; };
      // __fire('click'): runs the element's listeners, like a tap.
      if (k === '__fire') return async (type, ev = {}) => { for (const f of ((store.listeners || {})[type] || [])) await f({ preventDefault() {}, stopPropagation() {}, target: p, currentTarget: p, ...ev }); };
      if (k === 'querySelectorAll') return () => [];
      if (k === 'closest') return () => null;
      if (k === 'getBoundingClientRect') return () => ({ top: 0, left: 0, width: 0, height: 0 });
      // Related elements are fake elements too, so app.js can call their methods.
      if (k === 'firstElementChild' || k === 'lastElementChild' || k === 'parentElement' || k === 'nextElementSibling' || k === 'previousElementSibling') {
        return store[k] || (store[k] = makeEl(tag + '.' + k));
      }
      if (k === 'querySelector') return () => makeEl(tag + '.querySelector()');
      return function () { return makeEl(tag + '.' + String(k) + '()'); };
    },
    set(t, k, v) {
      if (k === 'className') { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); return true; }
      store[k] = v; return true;
    },
  });
  return p;
}
function makeDocument() {
  const byId = new Map();
  const doc = makeEl('document');
  const get = id => { if (!byId.has(id)) byId.set(id, makeEl('#' + id)); return byId.get(id); };
  return new Proxy(doc, {
    get(t, k) {
      if (k === 'getElementById') return get;
      if (k === 'createElement') return tag => makeEl(tag);
      if (k === 'querySelector') return () => makeEl('qs');
      if (k === 'querySelectorAll') return () => [];
      if (k === 'documentElement' || k === 'body' || k === 'head') return get('__' + k);
      return t[k];
    },
  });
}
// In-memory Firestore with the subset of the compat API app.js uses. Seed: { 'users/u1/…': {…} }.
class FakeStore {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])); this.writes = []; }
  snap(p) {
    const has = this.data.has(p);
    const d = has ? JSON.parse(JSON.stringify(this.data.get(p))) : undefined;
    return { exists: has, id: p.split('/').pop(), data: () => d, ref: this.doc(p) };
  }
  doc(p) {
    const self = this;
    return {
      path: p, id: p.split('/').pop(),
      get: async () => self.snap(p),
      set: async (d, opts) => self._set(p, d, opts),
      delete: async () => { self.writes.push(['delete', p]); self.data.delete(p); },
    };
  }
  _set(p, d, opts) {
    const clean = JSON.parse(JSON.stringify(d));
    this.writes.push(['set', p]);
    if (opts && opts.merge && this.data.has(p)) this.data.set(p, { ...this.data.get(p), ...clean });
    else this.data.set(p, clean);
  }
  collection(p) {
    const self = this;
    return {
      doc: id => self.doc(p + '/' + id),
      get: async () => {
        const docs = [...self.data.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).sort().map(k => self.snap(k));
        return { docs, size: docs.length, forEach: f => docs.forEach(f) };
      },
    };
  }
  batch() {
    const ops = [];
    return {
      set: (ref, d, opts) => ops.push(() => this._set(ref.path, d, opts)),
      delete: ref => ops.push(() => this.data.delete(ref.path)),
      commit: async () => ops.forEach(o => o()),
    };
  }
  dump(prefix = '') { return Object.fromEntries([...this.data.entries()].filter(([k]) => k.startsWith(prefix)).sort()); }
}
// Runs `testSource` appended to exercises.js + app.js in a vm, so it sees app.js's top-level
// functions and state. Inside it: __assert(cond, msg) (counted like ok()), console.test(…)
// (printed), firebase.firestore() is `store`.
async function runInVm(testSource, { store = new FakeStore(), logs = false } = {}) {
  const document = makeDocument();
  const noop = () => {};
  const firebase = {
    initializeApp: noop,
    auth: Object.assign(() => ({ onAuthStateChanged: noop, getRedirectResult: () => new Promise(noop), signInWithPopup: noop, signOut: noop, setPersistence: () => Promise.resolve() }), { GoogleAuthProvider: function () {}, Auth: { Persistence: {} } }),
    firestore: () => store,
  };
  const window = { addEventListener: noop, removeEventListener: noop, history: { pushState: noop, replaceState: noop, back: noop, go: noop, state: null }, location: { href: '', hash: '' }, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), innerWidth: 400, innerHeight: 800, scrollTo: noop };
  const quiet = { log: noop, warn: logs ? console.warn : noop, error: console.error, info: noop };
  const ctx = {
    document, window, firebase, history: window.history, location: window.location, navigator: { vibrate: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, matchMedia: window.matchMedia,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
    console: { ...quiet, test: console.log }, fetch: async () => { throw new Error('no network'); },
    getComputedStyle: () => ({ getPropertyValue: () => '' }), HTMLElement: function () {}, Event: function () {}, CustomEvent: function () {},
    __assert: (cond, msg) => { ok(cond, msg); },
  };
  ctx.window.document = document;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'exercises.js'), 'utf8') + '\n'
    + fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/^﻿/, '')
    + '\n;globalThis.__test = (async () => {\n' + testSource + '\n})();';
  vm.runInContext(src, ctx, { filename: 'app+test.js' });
  await ctx.__test;
}

module.exports = { ROOT, APP_URL, TODAY, FULL, THEMES, WIDTHS, check, ok, section, done, run, outDir, openApp, closeBrowser, settle, loadData, sleep, tokenColor, FIREBASE_STUB, FakeStore, runInVm };

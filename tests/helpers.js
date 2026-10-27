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
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
// "Today" in every test unless a test says otherwise: Thursday 22 October 2026 (week 43).
const TODAY = '2026-10-22';

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
// Runs an async test body; a crash counts as a failure (and is shown), never as a pass.
function run(fn) {
  fn().catch(e => { failed++; console.log('FAIL test liep vast: ' + (e && e.stack || e)); }).finally(() => done());
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
async function openApp({ width = 360, height = 800, theme = 'light', now = TODAY + 'T12:00:00+02:00', touch = false, scale = 1 } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? FIREBASE_STUB : '' });
    if (u.startsWith('file:') || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(APP_URL);
  await page.waitForTimeout(300);
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

module.exports = { ROOT, APP_URL, TODAY, check, ok, section, done, run, outDir, openApp, loadData, sleep, tokenColor, FIREBASE_STUB, FakeStore, runInVm };

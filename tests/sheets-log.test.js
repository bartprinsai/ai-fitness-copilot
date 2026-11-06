// Tijdelijk trainingslog naar Google Sheets (sheets-log.js). Google zelf is nagebootst: een kleine
// nep-spreadsheet in de pagina (window.fetch), en een sleutel die gewoon in de toestand staat — er
// gaat nooit iets naar Google. Gecontroleerd: kolommen, één regel per set, alleen regels van vandaag
// toevoegen/wijzigen/verwijderen, eerdere dagen en regels zonder set-id nooit aangeraakt (ook niet
// door Alles resetten), wijzigingen aan een eerdere dag niet verstuurd, offline om 23:50 gelogd en
// na middernacht nog verstuurd, schakelaar uit, verlopen toegang, Google-fout zonder gevolgen voor
// de app, en het scherm Instellingen (statusregel in tekst).
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const TODAY = H.TODAY, YESTERDAY = '2026-10-21';
const HEAD = ['Datum', 'Oefening', 'Categorie', 'Subcategorie', 'Set', 'Gewicht (kg)', 'Reps', 'Duur', 'Afstand', 'Set-id'];
const OLD_ROWS = [
  [YESTERDAY, 'Bench Press', 'Borst', 'Bench press', 1, 100, 5, '', '', `${YESTERDAY}|bench-press|1`],
  [YESTERDAY, 'Bench Press', 'Borst', 'Bench press', 2, 100, 4, '', '', `${YESTERDAY}|bench-press|2`],
  // vangnet: datum van gisteren maar een id van vandaag → toch nooit aanraken
  [YESTERDAY, 'Raar', '', '', 1, 1, 1, '', '', `${TODAY}|bench-press|9`],
];
const MANUAL = [TODAY, 'Zelf getypt', '', '', '', '', '', '', '', ''];

H.run(async () => {
  const { page, ctx, errors } = await H.openApp();
  const out = H.outDir(__filename);
  await H.loadData(page, {});
  const settle = () => H.settle(page);

  // Nep-Google in de pagina.
  await page.evaluate(({ head, rows, manual }) => {
    window.__sheet = { values: [head, ...rows, manual], calls: [], fail: false };
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    window.fetch = async (url, opts = {}) => {
      const S = window.__sheet;
      S.calls.push((opts.method || 'GET') + ' ' + url);
      if (S.fail) throw new TypeError('Failed to fetch');
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (!(opts.headers && opts.headers.Authorization === 'Bearer t')) return reply(401, { error: { message: 'unauth' } });
      if ((opts.method || 'GET') === 'GET' && url.includes('/values/')) return reply(200, { values: JSON.parse(JSON.stringify(S.values)) });
      if (url.includes('/values:batchUpdate')) {
        body.data.forEach(d => { const r = Number(d.range.match(/A(\d+):/)[1]) - 1; S.values[r] = d.values[0]; });
        return reply(200, {});
      }
      if (url.endsWith(':batchUpdate')) {
        body.requests.forEach(q => S.values.splice(q.deleteDimension.range.startIndex, 1));
        return reply(200, {});
      }
      if (url.includes(':append')) { S.values.push(...body.values); return reply(200, {}); }
      return reply(404, { error: { message: 'onbekend' } });
    };
    SheetsLog.__test.setUser({ uid: 'u-test', email: 'bart@example.com' });
    SheetsLog.__test.state = { enabled: true, linked: true, spreadsheetId: 'S1', sheetId: 0, url: 'https://docs.google.com/spreadsheets/d/S1', email: 'bart@example.com',
      token: { value: 't', exp: Date.now() + 3600e3 }, pending: {}, lastSync: '', error: null };
  }, { head: HEAD, rows: OLD_ROWS, manual: MANUAL });

  const sheet = () => page.evaluate(() => window.__sheet.values);
  const pending = () => page.evaluate(() => Object.keys(SheetsLog.__test.state.pending));
  const flush = () => page.evaluate(() => SheetsLog.__test.flush());
  const status = () => page.evaluate(() => SheetsLog.__test.statusText());
  const todayRows = async () => (await sheet()).filter(r => r[0] === TODAY && r[9]);
  const untouched = async () => {
    const v = await sheet();
    return JSON.stringify(v.slice(0, 1 + OLD_ROWS.length)) === JSON.stringify([HEAD, ...OLD_ROWS]) && v.some(r => JSON.stringify(r) === JSON.stringify(MANUAL));
  };
  // Een set loggen of bewerken via het echte Loggen-scherm.
  const logSet = async (weight, reps, { exercise = 'bench-press', date } = {}) => {
    await page.evaluate(({ exercise, date }) => { if (date) currentDate = date; openTraining(exercise); switchTab('track'); }, { exercise, date });
    await settle();
    await page.fill('#field-weight', String(weight));
    await page.fill('#field-reps', String(reps));
    await page.evaluate(() => saveSet());
    await settle();
  };

  H.section('Nieuwe sets van vandaag');
  await page.evaluate(() => { currentDate = todayStr(); });
  await logSet(100, 5);
  await logSet(102.5, 4);
  H.check('wacht in de rij voor vandaag', await pending(), [TODAY]);
  await flush();
  H.check('twee regels onderaan, juiste kolommen', (await sheet()).slice(-2), [
    [TODAY, 'Bench Press', 'Borst', 'Bench Press', 1, 100, 5, '', '', `${TODAY}|bench-press|1`],
    [TODAY, 'Bench Press', 'Borst', 'Bench Press', 2, 102.5, 4, '', '', `${TODAY}|bench-press|2`],
  ]);
  H.check('rij leeg na versturen', await pending(), []);
  H.ok(await untouched(), 'eerdere dagen en regel zonder set-id ongewijzigd');
  H.ok(/^In orde\. Laatst bijgewerkt: vandaag om \d\d:\d\d\.$/.test(await status()), 'status in tekst: in orde, wanneer', await status());

  H.section('Set van vandaag bewerken en verwijderen');
  await page.evaluate(() => { openTraining('bench-press'); selectSet(0); });
  await page.fill('#field-weight', '105');
  await page.evaluate(() => saveSet()); await settle();
  await flush();
  H.check('regel 1 gewijzigd op zijn plek', (await todayRows()).map(r => [r[4], r[5], r[6], r[9]]), [[1, 105, 5, `${TODAY}|bench-press|1`], [2, 102.5, 4, `${TODAY}|bench-press|2`]]);
  await page.evaluate(() => { openTraining('bench-press'); deleteSet(0); }); await settle();
  await flush();
  H.check('na verwijderen set 1: één regel, nummering zoals in de app', (await todayRows()).map(r => [r[4], r[5], r[6], r[9]]), [[1, 102.5, 4, `${TODAY}|bench-press|1`]]);
  H.ok(await untouched(), 'eerdere dagen nog steeds ongewijzigd');

  H.section('Een eerdere dag (achteraf) komt er niet in');
  const before = await sheet();
  await logSet(80, 8, { date: YESTERDAY });
  H.check('niets in de rij', await pending(), []);
  await page.evaluate(() => { openTraining('bench-press'); deleteSet(0); }); await settle(); // gisteren: oude set weg
  await flush();
  H.check('spreadsheet ongewijzigd', await sheet(), before);
  await page.evaluate(() => { currentDate = todayStr(); });

  H.section('Schakelaar uit: niets; weer aan: de stand van vandaag');
  await page.evaluate(() => { SheetsLog.openSettings(); }); await settle();
  await page.click('#sheets-log-toggle'); await settle();
  H.check('knop toont Nee', await page.textContent('#sheets-log-toggle'), 'Nee');
  H.ok((await status()).startsWith('Uit:'), 'status: uit', await status());
  await logSet(110, 3, { exercise: 'squat' });
  H.check('uit: niets in de rij', await pending(), []);
  await page.evaluate(() => { SheetsLog.openSettings(); }); await settle();
  await page.click('#sheets-log-toggle'); await settle();
  await flush();
  H.check('weer aan: de squat van vandaag (gelogd terwijl uit) komt er alsnog bij', (await todayRows()).map(r => r[9]), [`${TODAY}|bench-press|1`, `${TODAY}|squat|1`]);

  H.section('Alles resetten: alleen de regels van vandaag weg');
  const appSrc = fs.readFileSync(path.join(H.ROOT, 'app.js'), 'utf8');
  const resetBlock = appSrc.slice(appSrc.indexOf("getElementById('btn-reset-confirm').addEventListener"), appSrc.indexOf('// -- Home Screen'));
  H.ok(/syncInsightSchedule\(\);[^\n]*\n\s*if \(window\.SheetsLog\) SheetsLog\.onResetAll\(\);/.test(resetBlock), 'Alles resetten roept SheetsLog.onResetAll() aan na een geslaagde reset');
  await page.evaluate(() => SheetsLog.onResetAll());
  await flush();
  H.check('geen regels van vandaag meer', await todayRows(), []);
  H.ok(await untouched(), 'gisteren en de regel zonder set-id staan er nog');

  H.section('Offline om 23:50, verstuurd na middernacht');
  await page.evaluate(() => { db.workouts = {}; window.__sheet.calls = []; });
  await page.clock.setFixedTime(new Date(TODAY + 'T23:50:00+02:00'));
  const freshToken = () => page.evaluate(() => { const s = SheetsLog.__test.state; s.token = { value: 't', exp: Date.now() + 3600e3 }; s.error = null; SheetsLog.__test.state = s; });
  await freshToken();
  await ctx.setOffline(true);
  await page.evaluate(() => { currentDate = todayStr(); });
  await logSet(60, 10, { exercise: 'squat' });
  await flush();
  H.check('offline: niets verstuurd', await page.evaluate(() => window.__sheet.calls.length), 0);
  H.ok((await status()).startsWith('Offline:'), 'status: offline, in tekst', await status());
  await page.clock.setFixedTime(new Date('2026-10-23T00:10:00+02:00'));
  await freshToken();
  // na middernacht nog iets aan "gisteren" veranderen telt niet
  await logSet(65, 10, { exercise: 'squat', date: TODAY });
  await ctx.setOffline(false);
  await flush();
  H.check('na middernacht verstuurd met de datum van gisteren (de 23:50-stand)', (await sheet()).filter(r => r[0] === TODAY && r[9]).map(r => [r[0], r[5], r[6]]), [[TODAY, 60, 10]]);
  await page.clock.setFixedTime(new Date(TODAY + 'T12:00:00+02:00'));
  await page.evaluate(() => { db.workouts = {}; });

  H.section('Toegang verlopen');
  await page.evaluate(() => { const s = SheetsLog.__test.state; s.token = null; SheetsLog.__test.state = s; currentDate = todayStr(); window.__sheet.calls = []; });
  await logSet(70, 6, { exercise: 'deadlift' });
  await flush();
  H.check('niets verstuurd', await page.evaluate(() => window.__sheet.calls.length), 0);
  H.check('wijziging blijft bewaard', await pending(), [TODAY]);
  H.ok((await status()).startsWith('Toegang verlopen.'), 'status in tekst: toegang verlopen', await status());
  await page.evaluate(() => SheetsLog.openSettings()); await settle();
  H.ok(await page.isVisible('#sheets-log-renew'), 'knop Vernieuwen zichtbaar');
  await page.screenshot({ path: path.join(out, 'verlopen.png') });

  H.section('Google onbereikbaar: de app werkt gewoon door');
  await page.evaluate(() => { const s = SheetsLog.__test.state; s.token = { value: 't', exp: Date.now() + 3600e3 }; s.error = null; SheetsLog.__test.state = s; window.__sheet.fail = true; });
  await logSet(72.5, 6, { exercise: 'deadlift' });
  await flush();
  H.check('set staat in de app', await page.evaluate(() => getWorkout(todayStr()).find(e => e.exerciseId === 'deadlift').sets.map(s => s.weight)), [70, 72.5]);
  H.ok((await status()).includes('Versturen mislukt'), 'status in tekst: mislukt', await status());
  await page.evaluate(() => { window.__sheet.fail = false; });
  await flush();
  H.check('later alsnog verstuurd', (await todayRows()).map(r => [r[1], r[5]]), [['Deadlift', 70], ['Deadlift', 72.5]]);

  H.section('Instellingen');
  for (const theme of H.THEMES) for (const w of H.WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.evaluate(t => { document.documentElement.dataset.theme = t; openFitnessTracker(); }, theme); await settle();
    await page.click('#btn-overflow-home'); await settle();
    const items = await page.$$eval('#overflow-panel .dropdown-item', els => els.map(e => e.textContent));
    H.check(`${theme} ${w}: menu Fitness Tracker`, items, ['Instellingen', 'Uitloggen', 'Alles resetten']);
    await page.locator('#overflow-panel .dropdown-item', { hasText: 'Instellingen' }).click(); await settle();
    const ui = await page.evaluate(() => ({
      screen: document.querySelector('.screen.active').id,
      title: document.querySelector('#screen-settings .toolbar-title').textContent,
      head: document.querySelector('#sheets-log-settings .section-label').textContent,
      toggle: document.getElementById('sheets-log-toggle').textContent,
      visible: ['sheets-log-link', 'sheets-log-renew', 'sheets-log-open', 'sheets-log-unlink'].filter(id => !document.getElementById(id).classList.contains('hidden')),
      href: document.getElementById('sheets-log-open').dataset.url,
      overflowX: document.querySelector('#screen-settings .plate-calc-scroll').scrollWidth > document.querySelector('#screen-settings .plate-calc-scroll').clientWidth,
    }));
    H.check(`${theme} ${w}: gekoppeld scherm`, ui, { screen: 'screen-settings', title: 'Instellingen', head: 'Trainingslog in Google Sheets', toggle: 'Ja', visible: ['sheets-log-open', 'sheets-log-unlink'], href: 'https://docs.google.com/spreadsheets/d/S1', overflowX: false });
    await page.screenshot({ path: path.join(out, `instellingen-${theme}-${w}.png`) });
    await page.click('#btn-back-settings'); await settle();
    H.check(`${theme} ${w}: terug → Fitness Tracker`, await page.evaluate(() => document.querySelector('.screen.active').id), 'screen-fitness-tracker');
  }
  H.section('Ontkoppelen');
  await page.evaluate(() => SheetsLog.openSettings()); await settle();
  await page.click('#sheets-log-unlink'); await settle();
  const after = await page.evaluate(() => ({
    visible: ['sheets-log-link', 'sheets-log-renew', 'sheets-log-open', 'sheets-log-unlink'].filter(id => !document.getElementById(id).classList.contains('hidden')),
    status: document.getElementById('sheets-log-status').textContent,
    keptId: SheetsLog.__test.state.spreadsheetId,
  }));
  H.check('niet gekoppeld: Koppelen (en de link naar de bestaande spreadsheet)', after.visible, ['sheets-log-link', 'sheets-log-open']);
  H.ok(after.status.startsWith('Nog niet ingesteld') || after.status.startsWith('Niet gekoppeld'), 'status in tekst', after.status);
  H.check('spreadsheet-id blijft bewaard voor opnieuw koppelen', after.keptId, 'S1');
  await page.screenshot({ path: path.join(out, 'ontkoppeld.png') });
  await page.evaluate(() => { currentDate = todayStr(); });
  await logSet(50, 5, { exercise: 'squat' });
  H.check('ontkoppeld: niets in de rij', await pending(), []);

  if (errors.length) H.check('geen JS-fouten op de pagina', errors, []);
});

#!/usr/bin/env node
'use strict';

/**
 * One-off admin script: permanently deletes OWN exercises (meta/custom_exercises entries that are
 * not a built-in) by name, in ONE account, with everything that points at them — the same as
 * "Permanent verwijderen" in the app (purgeExercise() in app.js), plus the plan snapshots in
 * schedule_versions (Inzicht's "Gepland"). Used in November 2026 when three own exercises became
 * built-ins (exercises.js) under a new id; the user re-enters their data by hand.
 *
 * Removes, for each matching exercise id:
 *   - the entry in meta/custom_exercises (removed from the list, not marked deleted, so the
 *     built-in with the same name is no longer hidden by "jouw oefening wint")
 *   - its entries in workouts/{date} (a day left empty keeps only its note, else the document
 *     goes, like persistWorkout() in app.js)
 *   - meta/records, meta/exercise_info, meta/favorites
 *   - its place in plans/{id} and schedule_versions/{date} (every day)
 * Other accounts are never changed; own exercises with the same name there are only reported.
 *
 * Same setup as cleanup-video-fields.js (scripts/serviceAccountKey.json, `cd scripts && npm install`).
 *   node scripts/purge-custom-exercises.js --uid=<uid> --names="A,B,C"            dry run
 *   node scripts/purge-custom-exercises.js --uid=<uid> --names="A,B,C" --apply    writes
 *   [--key=path/to/key.json]
 */

const path = require('path');
const arg = name => { const a = process.argv.find(a => a.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const APPLY = process.argv.includes('--apply');
const UID = arg('uid');
const NAMES = (arg('names') || '').split(',').map(s => s.trim()).filter(Boolean);
const keyPath = arg('key') ? path.resolve(arg('key')) : path.join(__dirname, 'serviceAccountKey.json');
if (!UID || !NAMES.length) { console.error('Usage: --uid=<uid> --names="A,B" [--apply]'); process.exit(1); }

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(require(keyPath)) });
const fs = getFirestore();

// Built-in ids are never "own": an entry with a built-in's id is an edited built-in.
const BUILTIN_IDS = new Set(require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, '..', 'exercises.js'), 'utf8') + ';EXERCISE_DB').map(e => e.id));

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY — changes will be written' : 'DRY RUN — nothing is written'}`);
  const isOwnMatch = e => !BUILTIN_IDS.has(e.id) && NAMES.includes(e.name);

  // Other accounts: report only.
  for (const u of await fs.collection('users').listDocuments()) {
    if (u.id === UID) continue;
    const c = await u.collection('meta').doc('custom_exercises').get();
    const hits = (c.exists ? c.data().list || [] : []).filter(isOwnMatch);
    console.log(`other account ${u.id}: ${hits.length ? 'own exercises with the same name, NOT touched: ' + hits.map(e => e.name).join(', ') : 'none with these names'}`);
  }

  const user = fs.collection('users').doc(UID);
  const customRef = user.collection('meta').doc('custom_exercises');
  const list = ((await customRef.get()).data() || {}).list || [];
  const targets = list.filter(isOwnMatch);
  const ids = new Set(targets.map(e => e.id));
  NAMES.filter(n => !targets.some(e => e.name === n)).forEach(n => console.log(`not found as own exercise: ${n}`));
  if (!ids.size) { console.log('Nothing to do.'); return; }
  const nameOf = id => targets.find(e => e.id === id).name;
  console.log('deleting:', targets.map(e => `${e.name} (${e.id})`).join(', '));

  const writes = []; // [description, fn]
  writes.push([`meta/custom_exercises: remove ${ids.size}`, () => customRef.set({ list: list.filter(e => !ids.has(e.id)) })]);

  for (const doc of (await user.collection('workouts').get()).docs) {
    const data = doc.data(), exercises = data.exercises || [];
    const kept = exercises.filter(e => !ids.has(e.exerciseId));
    if (kept.length === exercises.length) continue;
    const gone = exercises.filter(e => ids.has(e.exerciseId)).map(e => `${nameOf(e.exerciseId)} (${(e.sets || []).length} sets)`).join(', ');
    if (kept.length) writes.push([`workouts/${doc.id}: remove ${gone}`, () => doc.ref.update({ exercises: kept })]);
    else if (data.sessionNote) writes.push([`workouts/${doc.id}: remove ${gone}; only the note stays`, () => doc.ref.set({ sessionNote: data.sessionNote })]);
    else writes.push([`workouts/${doc.id}: remove ${gone}; day now empty, document deleted`, () => doc.ref.delete()]);
  }

  const meta = id => user.collection('meta').doc(id);
  for (const [docId, field] of [['records', 'data'], ['exercise_info', 'data']]) {
    const snap = await meta(docId).get();
    const map = snap.exists ? { ...(snap.data()[field] || {}) } : {};
    const hit = Object.keys(map).filter(k => ids.has(k));
    if (!hit.length) continue;
    hit.forEach(k => delete map[k]);
    writes.push([`meta/${docId}: remove ${hit.map(nameOf).join(', ')}`, () => meta(docId).set({ [field]: map })]);
  }
  const fav = await meta('favorites').get();
  const favIds = fav.exists ? fav.data().ids || [] : [];
  if (favIds.some(id => ids.has(id))) writes.push([`meta/favorites: remove ${favIds.filter(id => ids.has(id)).map(nameOf).join(', ')}`, () => meta('favorites').set({ ids: favIds.filter(id => !ids.has(id)) })]);

  for (const coll of ['plans', 'schedule_versions']) {
    for (const doc of (await user.collection(coll).get()).docs) {
      const data = doc.data();
      const where = [];
      const days = (data.days || []).map(day => {
        const kept = (day.exercises || []).filter(e => !ids.has(e.exerciseId));
        if (kept.length !== (day.exercises || []).length) where.push(`${day.name}: ${(day.exercises || []).filter(e => ids.has(e.exerciseId)).map(e => nameOf(e.exerciseId)).join(', ')}`);
        return { ...day, exercises: kept };
      });
      if (where.length) writes.push([`${coll}/${doc.id} (${data.name || data.planName || ''}): remove from ${where.join('; ')}`, () => doc.ref.update({ days })]);
    }
  }

  for (const [desc, fn] of writes) {
    console.log(`${APPLY ? '[WRITTEN]' : '[WOULD WRITE]'} ${desc}`);
    if (APPLY) await fn();
  }
  if (!APPLY) console.log('\nDry run — nothing written. Re-run with --apply.');
})().catch(e => { console.error(e); process.exit(1); });

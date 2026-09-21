#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY diagnostic — never writes anything. Reports, per user:
 *   - sets with fewer than 1 rep (the app no longer lets you save these);
 *   - where the old stored `meta/records` table disagrees with the logged sets
 *     (the app no longer uses that table for PR trophies).
 * Same setup as cleanup-video-fields.js (scripts/serviceAccountKey.json, `npm install`).
 *
 *   node scripts/check-set-data.js [--key=path/to/key.json]
 */

const path = require('path');
const keyArg = process.argv.find(a => a.startsWith('--key='));
const keyPath = keyArg ? path.resolve(keyArg.slice(6)) : path.join(__dirname, 'serviceAccountKey.json');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(require(keyPath)) });
const fs = getFirestore();

(async () => {
  for (const u of await fs.collection('users').listDocuments()) {
    const [wSnap, rSnap] = await Promise.all([u.collection('workouts').get(), u.collection('meta').doc('records').get()]);
    const workouts = {};
    wSnap.forEach(d => { workouts[d.id] = d.data().exercises || []; });
    const records = rSnap.exists ? (rSnap.data().data || {}) : {};
    console.log(`user ${u.id.slice(0, 6)}…  (${Object.keys(workouts).length} workout days)`);

    const zero = [];
    const best = {};
    Object.keys(workouts).sort().forEach(date => workouts[date].forEach(ex => (ex.sets || []).forEach((s, i) => {
      const reps = parseInt(s.reps) || 0, weight = parseFloat(s.weight) || 0;
      if (reps < 1) zero.push(`${date}  ${ex.name}  set ${i + 1}: ${s.weight} kg x ${s.reps} reps`);
      const k = ex.name + '|' + reps;
      if (best[k] === undefined || weight > best[k]) best[k] = weight;
    })));
    console.log(`  sets with reps < 1: ${zero.length}`);
    zero.forEach(z => console.log('    ' + z));

    const diffs = [];
    Object.entries(records).forEach(([name, byReps]) => Object.entries(byReps).forEach(([reps, w]) => {
      const a = best[name + '|' + reps];
      if (a === undefined) diffs.push(`${name} ${reps} reps: stored record ${w} kg, but no such set exists (any more)`);
      else if (a < w) diffs.push(`${name} ${reps} reps: stored record ${w} kg is above the best logged set (${a} kg)`);
      else if (a > w) diffs.push(`${name} ${reps} reps: stored record ${w} kg is below the best logged set (${a} kg)`);
    }));
    console.log(`  stored records that disagree with the logged sets: ${diffs.length}`);
    diffs.forEach(d => console.log('    ' + d));
  }
})().catch(e => { console.error(e.message); process.exit(1); });

#!/usr/bin/env node
'use strict';

/**
 * One-off cleanup script — removes the legacy `videoId` / `idbKey` fields left
 * behind in Firestore set objects after the AI camera / video recording
 * feature was removed from the app. Not part of the live app; run manually.
 *
 * ── Setup ──────────────────────────────────────────────────────────────────
 * 1. Get a service account key (skip if you already have one):
 *      Firebase Console → Project settings (gear icon) → Service accounts tab
 *      → "Generate new private key" → save the downloaded JSON as:
 *        scripts/serviceAccountKey.json
 *    This file grants full admin access to your Firestore project — it is
 *    gitignored and must never be committed or shared.
 * 2. Install the one dependency this script needs:
 *      cd scripts
 *      npm install
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   node scripts/cleanup-video-fields.js            Dry run (default) — only
 *                                                    logs what would change.
 *   node scripts/cleanup-video-fields.js --apply     Actually writes changes.
 *   node scripts/cleanup-video-fields.js --key=path/to/key.json [--apply]
 *                                                    Use a key file at a
 *                                                    different path.
 *
 * ── How the cleanup works ────────────────────────────────────────────────
 * Workouts are stored at users/{uid}/workouts/{date} as a single `exercises`
 * field: an array of { name, sets: [{ weight, reps, videoId?, idbKey? }] }.
 * Firestore does not support deleting a field at a path that runs through an
 * array index (e.g. "exercises.0.sets.0.videoId"), so FieldValue.delete()
 * cannot target a single set's field directly. Instead, this script rebuilds
 * the `exercises` array in memory — copying every set as-is and, for sets
 * that have a `videoId` and/or `idbKey`, dropping just those two keys while
 * leaving weight/reps (and anything else on the set) untouched — then writes
 * the whole `exercises` field back with a single .update() per changed
 * document. No other document fields are touched.
 */

const path = require('path');

const APPLY = process.argv.includes('--apply');
const keyArg = process.argv.find(a => a.startsWith('--key='));
const keyPath = keyArg ? path.resolve(keyArg.slice('--key='.length))
                       : path.join(__dirname, 'serviceAccountKey.json');

let admin, serviceAccount;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('Missing dependency "firebase-admin". Run: cd scripts && npm install');
  process.exit(1);
}
try {
  serviceAccount = require(keyPath);
} catch (e) {
  console.error(`Could not load service account key at:\n  ${keyPath}`);
  console.error('See the setup instructions in the header comment of this script.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Returns a copy of `set` with videoId/idbKey removed, or null if neither was present.
function stripVideoFields(set) {
  if (!set || typeof set !== 'object') return null;
  if (set.videoId === undefined && set.idbKey === undefined) return null;
  const { videoId, idbKey, ...rest } = set;
  return rest;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY — changes will be written' : 'DRY RUN — no changes will be written'}`);
  console.log(`Service account key: ${keyPath}`);
  console.log('Scanning collection group "workouts" across all users...\n');

  const snapshot = await db.collectionGroup('workouts').get();

  let docsScanned = 0;
  let docsChanged = 0;
  let setsChanged = 0;

  for (const doc of snapshot.docs) {
    docsScanned++;
    const data = doc.data();
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    let docChanged = false;

    const newExercises = exercises.map(ex => {
      if (!ex || !Array.isArray(ex.sets)) return ex;
      const newSets = ex.sets.map(s => {
        const stripped = stripVideoFields(s);
        if (stripped === null) return s;
        docChanged = true;
        setsChanged++;
        return stripped;
      });
      return { ...ex, sets: newSets };
    });

    if (docChanged) {
      docsChanged++;
      console.log(`${APPLY ? '[UPDATED]' : '[WOULD UPDATE]'} ${doc.ref.path}`);
      if (APPLY) {
        await doc.ref.update({ exercises: newExercises });
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Documents scanned: ${docsScanned}`);
  console.log(`Documents ${APPLY ? 'updated' : 'that would be updated'}: ${docsChanged}`);
  console.log(`Sets ${APPLY ? 'cleaned' : 'that would be cleaned'}: ${setsChanged}`);
  if (!APPLY) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply to write these changes.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });

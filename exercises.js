// ── Categories and muscle groups: the ONE place for these rules ──
// Everything else in the app (Alle oefeningen, the New/Edit Exercise form, plan-day adding,
// category management) reads categories through the helpers in app.js that build on these.
//
// The seven standard categories, in display order. Exercises store the stable `id`, never the
// name, so a renamed standard category (db.categories.names) keeps its exercises and its
// muscle groups. User-added categories get an id of their own ('custom-…', see app.js).
const EXERCISE_CATEGORIES = [
  { id: 'chest', name: 'Borst' },
  { id: 'back', name: 'Rug' },
  { id: 'shoulders', name: 'Schouders' },
  { id: 'arms', name: 'Armen' },
  { id: 'legs', name: 'Benen' },
  { id: 'abs', name: 'Buik' },
  { id: 'cardio', name: 'Cardio' },
];

// Fixed muscle-group list, each under a standard category (Cardio has none), in display order.
// Users can't add, rename or delete these. This is the ONLY muscle list in the app: the
// Primair/Secundair fields (Oefeninginfo, Nieuwe oefening / Oefening bewerken) choose from it
// and store the stable `id` (db.exerciseInfo[name].primaryMuscleGroup: one id,
// .secondaryMuscleGroups: [ids]). Nothing is derived automatically: muscle groups are only
// ever set by hand per exercise.
const MUSCLE_GROUPS = [
  { id: 'upper-chest', name: 'Bovenborst', category: 'chest' },
  { id: 'chest', name: 'Borst', category: 'chest' },
  { id: 'lats', name: 'Lats', category: 'back' },
  { id: 'mid-back', name: 'Middenrug', category: 'back' },
  { id: 'lower-back', name: 'Onderrug', category: 'back' },
  { id: 'traps', name: 'Trapezius', category: 'back' },
  { id: 'front-delts', name: 'Voorste schouders', category: 'shoulders' },
  { id: 'side-delts', name: 'Zijkant schouders', category: 'shoulders' },
  { id: 'rear-delts', name: 'Achterste schouders', category: 'shoulders' },
  { id: 'biceps', name: 'Biceps', category: 'arms' },
  { id: 'triceps', name: 'Triceps', category: 'arms' },
  { id: 'forearms', name: 'Onderarmen', category: 'arms' },
  { id: 'quads', name: 'Quadriceps', category: 'legs' },
  { id: 'hamstrings', name: 'Hamstrings', category: 'legs' },
  { id: 'glutes', name: 'Glutes', category: 'legs' },
  { id: 'adductors', name: 'Adductoren', category: 'legs' },
  { id: 'calves', name: 'Kuiten', category: 'legs' },
  { id: 'abs', name: 'Buik', category: 'abs' },
];

// One-time conversion of category NAMES stored before this indeling (self-added exercises in
// meta/custom_exercises stored the name) to the standard category id, by meaning. Keys are
// matched case-insensitively. "Olympisch gewichtheffen" has no single meaning: such an
// exercise takes the category of the built-in with the same name, else LEGACY_CATEGORY_FALLBACK.
// Any other name is not guessed: it becomes a user-added category with that name (see app.js).
const LEGACY_CATEGORY_MAP = {
  'borst': 'chest', 'chest': 'chest',
  'rug': 'back', 'back': 'back',
  'schouders': 'shoulders', 'shoulders': 'shoulders',
  'armen': 'arms', 'arms': 'arms', 'biceps': 'arms', 'triceps': 'arms', 'onderarmen': 'arms', 'forearms': 'arms',
  'benen': 'legs', 'legs': 'legs', 'kuiten': 'legs', 'calves': 'legs',
  'buik': 'abs', 'buikspieren': 'abs', 'abs': 'abs', 'abdominals': 'abs', 'core': 'abs',
  'cardio': 'cardio',
};
const LEGACY_CATEGORY_FALLBACK = { 'olympisch gewichtheffen': 'legs', 'olympic weightlifting': 'legs' };

// Built-in subcategories (see "Subcategories" in app.js). They show up exactly like the user's
// own (meta/categories.subcategories): in the Subcategorie field and as a group in the list.
// When the user has an own subcategory with the same name (case-insensitive) in the same
// category, that one IS this one: the built-ins below then join it, no double group. Fixed ids:
// "sub-" + kebab-case of the name (the user's own are "sub-" + random letters and digits, without
// a second "-", so they never clash). Never change one.
const BUILTIN_SUBCATEGORIES = [
  { id: "sub-bench-press", name: "Bench Press", category: "chest" },
  { id: "sub-dumbbell-press", name: "Dumbbell Press", category: "chest" },
  { id: "sub-cable-fly", name: "Cable Fly", category: "chest" },
  { id: "sub-machine", name: "Machine", category: "chest" },
  { id: "sub-barbell-row", name: "Barbell Row", category: "back" },
  { id: "sub-pulldown", name: "Pulldown", category: "back" },
  { id: "sub-seated-cable-row", name: "Seated Cable Row", category: "back" },
  { id: "sub-single-arm-row", name: "Single Arm Row", category: "back" },
  { id: "sub-lateral-raise", name: "Lateral Raise", category: "shoulders" },
  { id: "sub-shoulder-press", name: "Shoulder Press", category: "shoulders" },
  { id: "sub-bicep-curl", name: "Bicep Curl", category: "arms" },
  { id: "sub-hammer-curl", name: "Hammer Curl", category: "arms" },
  { id: "sub-forearms", name: "Forearms", category: "arms" },
  { id: "sub-overhead-extension", name: "Overhead Extension", category: "arms" },
  { id: "sub-pushdown", name: "Pushdown", category: "arms" },
  { id: "sub-calves", name: "Calves", category: "legs" },
  { id: "sub-deadlift", name: "Deadlift", category: "legs" },
  { id: "sub-leg-curl", name: "Leg Curl", category: "legs" },
  { id: "sub-leg-extension", name: "Leg Extension", category: "legs" },
  { id: "sub-leg-press", name: "Leg Press", category: "legs" },
  { id: "sub-squat", name: "Squat", category: "legs" },
];

// Built-in exercises, each in a category and optionally in a subcategory (BUILTIN_SUBCATEGORIES;
// without one it's a "Losse oefening"), with a type like an own exercise (EX_TYPE_OPTIONS in
// app.js): Cardio and Plank "duration" (Duur), everything else "weight_reps" (Gewicht en reps).
// `id` is the exercise's fixed id (kebab-case of its name when ids were introduced, October 2026,
// or when it was added). It never changes, also not when the name or category does: plans,
// workouts, favorites, exercise info and records all point at it. Never edit an existing id; a
// new built-in gets a new, unique one. A built-in can be taken out of the list: logged sets that
// still point at its id are then skipped everywhere in the app (setAsideUnknownExercises() in
// app.js) and kept as they are in Firestore.
const EXERCISE_DB = [
  { id: "bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press", type: "weight_reps" },
  { id: "close-grip-bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Close Grip", type: "weight_reps" },
  { id: "incline-bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Incline", type: "weight_reps" },
  { id: "bench-press-larsson", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Larsson", type: "weight_reps" },
  { id: "bench-press-negative", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Negative", type: "weight_reps" },
  { id: "bench-press-pin-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Pin Press", type: "weight_reps" },
  { id: "bench-press-spoto", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Spoto", type: "weight_reps" },
  { id: "bench-press-wiggle", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Wiggle", type: "weight_reps" },

  { id: "bench-press-dumbbell", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Flat", type: "weight_reps" },
  { id: "incline-bench-press-dumbbell", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Incline", type: "weight_reps" },
  { id: "dumbbell-press-flat-neutral-grip", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Flat - Neutral Grip", type: "weight_reps" },
  { id: "dumbbell-press-incline-neutral-grip", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Incline - Neutral Grip", type: "weight_reps" },

  { id: "cable-crossover", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - High to Low", type: "weight_reps" },
  { id: "flyes-cable", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Medium", type: "weight_reps" },
  { id: "cable-fly-incline-30", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Incline 30", type: "weight_reps" },
  { id: "cable-fly-incline-45", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Incline 45", type: "weight_reps" },
  { id: "cable-fly-low-to-high", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Low to High", type: "weight_reps" },

  { id: "flyes-machine", category: "chest", subcategory: "sub-machine", name: "Machine - Pec Deck", type: "weight_reps" },
  { id: "machine-flat-chest-press", category: "chest", subcategory: "sub-machine", name: "Machine - Flat Chest Press", type: "weight_reps" },
  { id: "machine-incline-chest-press", category: "chest", subcategory: "sub-machine", name: "Machine - Incline Chest Press", type: "weight_reps" },

  { id: "chin-ups", category: "back", name: "Chin-Up", type: "weight_reps" },
  { id: "pull-ups", category: "back", name: "Pull-Up", type: "weight_reps" },
  { id: "face-pulls", category: "back", name: "Face Pull - Rug", type: "weight_reps" },
  { id: "good-mornings", category: "back", name: "Good Morning", type: "weight_reps" },
  { id: "dumbbell-row-chest-supported", category: "back", name: "Dumbbell Row - Chest Supported", type: "weight_reps" },
  { id: "lat-prayer", category: "back", name: "Lat Prayer", type: "weight_reps" },

  { id: "bent-over-barbell-row", category: "back", subcategory: "sub-barbell-row", name: "Barbell Row - Overhand", type: "weight_reps" },
  { id: "barbell-row-underhand", category: "back", subcategory: "sub-barbell-row", name: "Barbell Row - Underhand", type: "weight_reps" },

  { id: "lat-pulldown", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Wide Grip", type: "weight_reps" },
  { id: "pulldown-close-grip", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Close Grip", type: "weight_reps" },
  { id: "pulldown-machine", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Machine", type: "weight_reps" },
  { id: "pulldown-machine-single-arm", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Machine - Single Arm", type: "weight_reps" },
  { id: "pulldown-neutral-grip", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Neutral Grip", type: "weight_reps" },
  { id: "pulldown-underhand", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Underhand", type: "weight_reps" },

  { id: "seated-cable-row", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Close Grip", type: "weight_reps" },
  { id: "seated-cable-row-neutral-grip", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Neutral Grip", type: "weight_reps" },
  { id: "seated-cable-row-rope", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Rope", type: "weight_reps" },
  { id: "seated-cable-row-wide-overhand", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Wide Overhand", type: "weight_reps" },

  { id: "single-arm-row-high-to-low", category: "back", subcategory: "sub-single-arm-row", name: "Single Arm Row - High to Low", type: "weight_reps" },
  { id: "single-arm-row-medium", category: "back", subcategory: "sub-single-arm-row", name: "Single Arm Row - Medium", type: "weight_reps" },

  { id: "rear-delt-flyes-machine", category: "shoulders", name: "Rear Delt Fly - Machine", type: "weight_reps" },
  { id: "face-pull-shoulder", category: "shoulders", name: "Face Pull - Shoulder", type: "weight_reps" },

  { id: "lateral-raises-cable", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Cable", type: "weight_reps" },
  { id: "lateral-raises-dumbbell", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Dumbbell", type: "weight_reps" },
  { id: "lateral-raise-machine", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Machine", type: "weight_reps" },

  { id: "military-press-barbell", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Barbell", type: "weight_reps" },
  { id: "shoulder-press-dumbbell", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Dumbbell", type: "weight_reps" },
  { id: "machine-shoulder-press", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Machine", type: "weight_reps" },

  { id: "skull-crushers-barbell", category: "arms", name: "Skull Crusher - Ez-Bar", type: "weight_reps" },
  { id: "dips-triceps", category: "arms", name: "Tricep Dip", type: "weight_reps" },

  { id: "barbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Barbell", type: "weight_reps" },
  { id: "cable-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Straight Bar", type: "weight_reps" },
  { id: "dumbbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Dumbbell", type: "weight_reps" },
  { id: "incline-dumbbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Seated Dumbbell 45", type: "weight_reps" },
  { id: "bicep-curl-cable-bayesian", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Bayesian", type: "weight_reps" },
  { id: "bicep-curl-cable-preacher-single-arm", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Preacher - Single Arm", type: "weight_reps" },
  { id: "bicep-curl-ez-bar", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Ez-Bar", type: "weight_reps" },
  { id: "bicep-curl-machine", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Machine", type: "weight_reps" },

  { id: "hammer-curl", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Dumbbell", type: "weight_reps" },
  { id: "hammer-curl-rope", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope", type: "weight_reps" },
  { id: "hammer-curl-rope-single-arm", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope - Single Arm", type: "weight_reps" },
  { id: "hammer-curl-rope-preacher-single-arm", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope Preacher - Single Arm", type: "weight_reps" },
  { id: "hammer-curl-dumbbell-preacher", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Dumbbell Preacher", type: "weight_reps" },

  { id: "reverse-curl", category: "arms", subcategory: "sub-forearms", name: "Forearms - Reverse Curl - Ez-Bar", type: "weight_reps" },
  { id: "forearms-wrist-curl-barbell", category: "arms", subcategory: "sub-forearms", name: "Forearms - Wrist Curl - Barbell", type: "weight_reps" },
  { id: "forearms-wrist-curl-cable", category: "arms", subcategory: "sub-forearms", name: "Forearms - Wrist Curl - Cable", type: "weight_reps" },
  { id: "forearms-wrist-curl-dumbbell", category: "arms", subcategory: "sub-forearms", name: "Forearms - Wrist Curl - Dumbbell", type: "weight_reps" },

  { id: "overhead-triceps-extension-cable", category: "arms", subcategory: "sub-overhead-extension", name: "Overhead Extension - Rope", type: "weight_reps" },
  { id: "overhead-extension-straight-bar", category: "arms", subcategory: "sub-overhead-extension", name: "Overhead Extension - Straight Bar", type: "weight_reps" },

  { id: "triceps-pushdown-cable", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope", type: "weight_reps" },
  { id: "pushdown-rope-single-arm", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope - Single Arm", type: "weight_reps" },
  { id: "pushdown-rope-seated", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope - Seated", type: "weight_reps" },
  { id: "pushdown-straight-bar", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Straight Bar", type: "weight_reps" },
  { id: "pushdown-v-bar", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - V-Bar", type: "weight_reps" },
  { id: "pushdown-v-bar-seated", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - V-Bar - Seated", type: "weight_reps" },

  { id: "bulgarian-split-squat", category: "legs", name: "Bulgarian Split Squat", type: "weight_reps" },
  { id: "hip-thrust-barbell", category: "legs", name: "Hip Thrust", type: "weight_reps" },
  { id: "lunges-dumbbell", category: "legs", name: "Walking Lunge", type: "weight_reps" },
  { id: "front-foot-elevated-split-squats", category: "legs", name: "Front Foot Elevated Split Squat", type: "weight_reps" },
  { id: "sissy-squats", category: "legs", name: "Sissy Squat", type: "weight_reps" },
  { id: "hip-adduction", category: "legs", name: "Hip Adduction", type: "weight_reps" },
  { id: "45-degree-back-extension", category: "legs", name: "45-Degree Back Extension", type: "weight_reps" },

  { id: "leg-press-calf-raise", category: "legs", subcategory: "sub-calves", name: "Calves - Press", type: "weight_reps" },
  { id: "seated-calf-raise-machine", category: "legs", subcategory: "sub-calves", name: "Calves - Seated", type: "weight_reps" },
  { id: "standing-calf-raise-machine", category: "legs", subcategory: "sub-calves", name: "Calves - Standing", type: "weight_reps" },
  { id: "calves-tibialis-raise", category: "legs", subcategory: "sub-calves", name: "Calves - Tibialis Raise", type: "weight_reps" },

  { id: "deadlift", category: "legs", subcategory: "sub-deadlift", name: "Deadlift", type: "weight_reps" },
  { id: "romanian-deadlift", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian", type: "weight_reps" },
  { id: "deadlift-deficit-paused", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Deficit - Paused", type: "weight_reps" },
  { id: "deadlift-paused", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Paused", type: "weight_reps" },
  { id: "deadlift-rack-pull", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Rack Pull", type: "weight_reps" },
  { id: "deadlift-romanian-smith-machine", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian - Smith Machine", type: "weight_reps" },
  { id: "deadlift-romanian-single-leg", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian - Single Leg", type: "weight_reps" },

  { id: "leg-curl-lying", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Lying", type: "weight_reps" },
  { id: "leg-curl-machine", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Seated", type: "weight_reps" },
  { id: "leg-curl-seated-single-leg", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Seated - Single Leg", type: "weight_reps" },

  { id: "leg-extension-machine", category: "legs", subcategory: "sub-leg-extension", name: "Leg Extension", type: "weight_reps" },
  { id: "leg-extension-single-leg", category: "legs", subcategory: "sub-leg-extension", name: "Leg Extension - Single Leg", type: "weight_reps" },

  { id: "leg-press", category: "legs", subcategory: "sub-leg-press", name: "Leg Press", type: "weight_reps" },
  { id: "leg-press-paused", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Paused", type: "weight_reps" },
  { id: "leg-press-single-leg", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Single Leg", type: "weight_reps" },
  { id: "leg-press-single-leg-paused", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Single Leg - Paused", type: "weight_reps" },
  { id: "leg-press-sissy", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Sissy", type: "weight_reps" },

  { id: "squat", category: "legs", subcategory: "sub-squat", name: "Squat", type: "weight_reps" },
  { id: "front-squat", category: "legs", subcategory: "sub-squat", name: "Squat - Front", type: "weight_reps" },
  { id: "squat-front-smith-machine", category: "legs", subcategory: "sub-squat", name: "Squat - Front - Smith Machine", type: "weight_reps" },
  { id: "squat-high-bar", category: "legs", subcategory: "sub-squat", name: "Squat - High Bar", type: "weight_reps" },
  { id: "squat-paused", category: "legs", subcategory: "sub-squat", name: "Squat - Paused", type: "weight_reps" },

  { id: "ab-wheel-rollout", category: "abs", name: "Ab Roller", type: "weight_reps" },
  { id: "weighted-crunch", category: "abs", name: "Weighted Crunch", type: "weight_reps" },
  // Plank came back in November 2026 under a new id: the old id "plank" (taken out earlier) is
  // still in logged sets, which would otherwise show up again.
  { id: "plank-hold", category: "abs", name: "Plank", type: "duration" },

  { id: "running", category: "cardio", name: "Running", type: "duration" },
  { id: "treadmill", category: "cardio", name: "Treadmill", type: "duration" },
  { id: "rowing-machine", category: "cardio", name: "Rowing Machine", type: "duration" },
  { id: "cycling-outdoor", category: "cardio", name: "Cycling - Outdoor", type: "duration" },
  { id: "stationary-bike", category: "cardio", name: "Stationary Bike", type: "duration" },
  { id: "elliptical", category: "cardio", name: "Elliptical", type: "duration" },
  { id: "jump-rope", category: "cardio", name: "Jump Rope", type: "duration" },
  { id: "stairmaster", category: "cardio", name: "Stairmaster", type: "duration" },
  { id: "hiit", category: "cardio", name: "HIIT", type: "duration" },
  { id: "swimming", category: "cardio", name: "Swimming", type: "duration" },
];

// What the renamed or moved built-ins were called / where they were before, by id: `names` lists
// every earlier name (oldest first), `category` the earlier category. Two rounds, both November
// 2026: the indeling in subcategories, then the standard for names (every word capitalised, also
// after a hyphen; singular; " - " between separate features). Used to recognise old names in data
// stored by name (the one-time migrations in app.js), to bring along an edited built-in that still
// has an old name or category (migrateBuiltinSubcategories()) and to recognise an edited built-in
// that differs in nothing but an old name (migrateBuiltinCopies()). "Face pulls - Rug" is the name
// an edited copy of Face pulls carried in user data, not a name the built-in itself ever had.
const BUILTIN_PREVIOUS = {
  "bench-press": { names: ["Bench press"] },
  "close-grip-bench-press": { names: ["Close grip bench press"], category: "arms" },
  "incline-bench-press": { names: ["Incline bench press"] },
  "bench-press-dumbbell": { names: ["Bench press (dumbbell)"] },
  "incline-bench-press-dumbbell": { names: ["Incline bench press (dumbbell)"] },
  "dumbbell-press-flat-neutral-grip": { names: ["Dumbbell Press - Flat Neutral Grip"] },
  "dumbbell-press-incline-neutral-grip": { names: ["Dumbbell Press - Incline Neutral Grip"] },
  "cable-crossover": { names: ["Cable crossover"] },
  "flyes-cable": { names: ["Flyes (cable)"] },
  "flyes-machine": { names: ["Flyes (machine)"] },
  "chin-ups": { names: ["Chin-ups"] },
  "pull-ups": { names: ["Pull-ups"] },
  "face-pulls": { names: ["Face pulls", "Face pulls - Rug"] },
  "good-mornings": { names: ["Good mornings"] },
  "bent-over-barbell-row": { names: ["Bent-over barbell row"] },
  "lat-pulldown": { names: ["Lat pulldown"] },
  "pulldown-machine-single-arm": { names: ["Pulldown - Machine Single Arm"] },
  "seated-cable-row": { names: ["Seated cable row"] },
  "rear-delt-flyes-machine": { names: ["Rear delt flyes (machine)", "Rear Delt Flyes - Machine"] },
  "face-pull-shoulder": { names: ["Face Pull Shoulder"] },
  "lateral-raises-cable": { names: ["Lateral raises (cable)"] },
  "lateral-raises-dumbbell": { names: ["Lateral raises (dumbbell)"] },
  "military-press-barbell": { names: ["Military press (barbell)"] },
  "shoulder-press-dumbbell": { names: ["Shoulder press (dumbbell)"] },
  "machine-shoulder-press": { names: ["Machine shoulder press"] },
  "skull-crushers-barbell": { names: ["Skull crushers (barbell)"] },
  "dips-triceps": { names: ["Dips (triceps)", "Tricep Dips"] },
  "barbell-curl": { names: ["Barbell curl"] },
  "cable-curl": { names: ["Cable curl"] },
  "dumbbell-curl": { names: ["Dumbbell curl"] },
  "incline-dumbbell-curl": { names: ["Incline dumbbell curl"] },
  "hammer-curl": { names: ["Hammer curl"] },
  "reverse-curl": { names: ["Reverse curl"] },
  "overhead-triceps-extension-cable": { names: ["Overhead triceps extension (cable)"] },
  "triceps-pushdown-cable": { names: ["Triceps pushdown (cable)"] },
  "pushdown-rope-seated": { names: ["Pushdown - Rope Seated"] },
  "pushdown-v-bar-seated": { names: ["Pushdown - V-Bar Seated"] },
  "bulgarian-split-squat": { names: ["Bulgarian split squat", "Bulgarian Split Squats"] },
  "hip-thrust-barbell": { names: ["Hip thrust (barbell)"] },
  "lunges-dumbbell": { names: ["Lunges (dumbbell)", "Walking Lunges"] },
  "front-foot-elevated-split-squats": { names: ["Front Foot Elevated Split Squats"] },
  "sissy-squats": { names: ["Sissy Squats"] },
  "leg-press-calf-raise": { names: ["Leg press calf raise"] },
  "seated-calf-raise-machine": { names: ["Seated calf raise (machine)"] },
  "standing-calf-raise-machine": { names: ["Standing calf raise (machine)"] },
  "deadlift": { category: "back" },
  "romanian-deadlift": { names: ["Romanian deadlift"], category: "back" },
  "deadlift-deficit-paused": { names: ["Deadlift - Deficit Paused"] },
  "deadlift-romanian-single-leg": { names: ["Deadlift - Romanian Single Leg"] },
  "leg-curl-lying": { names: ["Leg curl (lying)"] },
  "leg-curl-machine": { names: ["Leg curl (machine)"] },
  "leg-extension-machine": { names: ["Leg extension (machine)"] },
  "leg-press": { names: ["Leg press"] },
  "leg-press-single-leg-paused": { names: ["Leg Press - Single Leg Paused"] },
  "front-squat": { names: ["Front squat"] },
  "ab-wheel-rollout": { names: ["Ab wheel rollout"] },
  "rowing-machine": { names: ["Rowing machine"] },
  "cycling-outdoor": { names: ["Cycling (outdoor)"] },
  "stationary-bike": { names: ["Stationary bike"] },
  "jump-rope": { names: ["Jump rope"] },
};

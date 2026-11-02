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
// without one it's a "Losse oefening").
// `id` is the exercise's fixed id (kebab-case of its name when ids were introduced, October 2026,
// or when it was added). It never changes, also not when the name or category does: plans,
// workouts, favorites, exercise info and records all point at it. Never edit an existing id; a
// new built-in gets a new, unique one. A built-in that's taken out of the list while logged sets
// still point at it stays here with `hidden: true`: hidden like a deleted built-in (see
// isBuiltinHidden() in app.js), so its history keeps its name and it can be put back.
const EXERCISE_DB = [
  { id: "bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press" },
  { id: "close-grip-bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Close Grip" },
  { id: "incline-bench-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Incline" },
  { id: "bench-press-larsson", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Larsson" },
  { id: "bench-press-negative", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Negative" },
  { id: "bench-press-pin-press", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Pin Press" },
  { id: "bench-press-spoto", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Spoto" },
  { id: "bench-press-wiggle", category: "chest", subcategory: "sub-bench-press", name: "Bench Press - Wiggle" },

  { id: "bench-press-dumbbell", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Flat" },
  { id: "incline-bench-press-dumbbell", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Incline" },
  { id: "dumbbell-press-flat-neutral-grip", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Flat Neutral Grip" },
  { id: "dumbbell-press-incline-neutral-grip", category: "chest", subcategory: "sub-dumbbell-press", name: "Dumbbell Press - Incline Neutral Grip" },

  { id: "cable-crossover", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - High to Low" },
  { id: "flyes-cable", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Medium" },
  { id: "cable-fly-incline-30", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Incline 30" },
  { id: "cable-fly-incline-45", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Incline 45" },
  { id: "cable-fly-low-to-high", category: "chest", subcategory: "sub-cable-fly", name: "Cable Fly - Low to High" },

  { id: "flyes-machine", category: "chest", subcategory: "sub-machine", name: "Machine - Pec Deck" },
  { id: "machine-flat-chest-press", category: "chest", subcategory: "sub-machine", name: "Machine - Flat Chest Press" },
  { id: "machine-incline-chest-press", category: "chest", subcategory: "sub-machine", name: "Machine - Incline Chest Press" },

  { id: "chin-ups", category: "back", name: "Chin-ups" },
  { id: "pull-ups", category: "back", name: "Pull-ups" },
  { id: "face-pulls", category: "back", name: "Face pulls" },
  { id: "good-mornings", category: "back", name: "Good mornings" },

  { id: "bent-over-barbell-row", category: "back", subcategory: "sub-barbell-row", name: "Barbell Row - Overhand" },
  { id: "barbell-row-underhand", category: "back", subcategory: "sub-barbell-row", name: "Barbell Row - Underhand" },

  { id: "lat-pulldown", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Wide Grip" },
  { id: "pulldown-close-grip", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Close Grip" },
  { id: "pulldown-machine", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Machine" },
  { id: "pulldown-machine-single-arm", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Machine Single Arm" },
  { id: "pulldown-neutral-grip", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Neutral Grip" },
  { id: "pulldown-underhand", category: "back", subcategory: "sub-pulldown", name: "Pulldown - Underhand" },

  { id: "seated-cable-row", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Close Grip" },
  { id: "seated-cable-row-neutral-grip", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Neutral Grip" },
  { id: "seated-cable-row-rope", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Rope" },
  { id: "seated-cable-row-wide-overhand", category: "back", subcategory: "sub-seated-cable-row", name: "Seated Cable Row - Wide Overhand" },

  { id: "single-arm-row-high-to-low", category: "back", subcategory: "sub-single-arm-row", name: "Single Arm Row - High to Low" },
  { id: "single-arm-row-medium", category: "back", subcategory: "sub-single-arm-row", name: "Single Arm Row - Medium" },

  { id: "rear-delt-flyes-machine", category: "shoulders", name: "Rear Delt Flyes - Machine" },
  { id: "face-pull-shoulder", category: "shoulders", name: "Face Pull Shoulder" },

  { id: "lateral-raises-cable", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Cable" },
  { id: "lateral-raises-dumbbell", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Dumbbell" },
  { id: "lateral-raise-machine", category: "shoulders", subcategory: "sub-lateral-raise", name: "Lateral Raise - Machine" },

  { id: "military-press-barbell", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Barbell" },
  { id: "shoulder-press-dumbbell", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Dumbbell" },
  { id: "machine-shoulder-press", category: "shoulders", subcategory: "sub-shoulder-press", name: "Shoulder Press - Machine" },

  { id: "skull-crushers-barbell", category: "arms", name: "Skull Crusher - Ez-Bar" },
  { id: "dips-triceps", category: "arms", name: "Tricep Dips" },

  { id: "barbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Barbell" },
  { id: "cable-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Straight Bar" },
  { id: "dumbbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Dumbbell" },
  { id: "incline-dumbbell-curl", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Seated Dumbbell 45" },
  { id: "bicep-curl-cable-bayesian", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Bayesian" },
  { id: "bicep-curl-cable-preacher-single-arm", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Cable Preacher - Single Arm" },
  { id: "bicep-curl-ez-bar", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Ez-Bar" },
  { id: "bicep-curl-machine", category: "arms", subcategory: "sub-bicep-curl", name: "Bicep Curl - Machine" },

  { id: "hammer-curl", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Dumbbell" },
  { id: "hammer-curl-rope", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope" },
  { id: "hammer-curl-rope-single-arm", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope - Single Arm" },
  { id: "hammer-curl-rope-preacher-single-arm", category: "arms", subcategory: "sub-hammer-curl", name: "Hammer Curl - Rope Preacher - Single Arm" },

  { id: "reverse-curl", category: "arms", subcategory: "sub-forearms", name: "Forearms - Reverse Curl - Ez-Bar" },
  { id: "forearms-wrist-curl-barbell", category: "arms", subcategory: "sub-forearms", name: "Forearms - Wrist Curl - Barbell" },
  { id: "forearms-wrist-curl-cable", category: "arms", subcategory: "sub-forearms", name: "Forearms - Wrist Curl - Cable" },

  { id: "overhead-triceps-extension-cable", category: "arms", subcategory: "sub-overhead-extension", name: "Overhead Extension - Rope" },
  { id: "overhead-extension-straight-bar", category: "arms", subcategory: "sub-overhead-extension", name: "Overhead Extension - Straight Bar" },

  { id: "triceps-pushdown-cable", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope" },
  { id: "pushdown-rope-single-arm", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope - Single Arm" },
  { id: "pushdown-rope-seated", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Rope Seated" },
  { id: "pushdown-straight-bar", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - Straight Bar" },
  { id: "pushdown-v-bar", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - V-Bar" },
  { id: "pushdown-v-bar-seated", category: "arms", subcategory: "sub-pushdown", name: "Pushdown - V-Bar Seated" },

  { id: "bulgarian-split-squat", category: "legs", name: "Bulgarian Split Squats" },
  { id: "hip-thrust-barbell", category: "legs", name: "Hip Thrust" },
  { id: "lunges-dumbbell", category: "legs", name: "Walking Lunges" },
  { id: "front-foot-elevated-split-squats", category: "legs", name: "Front Foot Elevated Split Squats" },
  { id: "sissy-squats", category: "legs", name: "Sissy Squats" },

  { id: "leg-press-calf-raise", category: "legs", subcategory: "sub-calves", name: "Calves - Press" },
  { id: "seated-calf-raise-machine", category: "legs", subcategory: "sub-calves", name: "Calves - Seated" },
  { id: "standing-calf-raise-machine", category: "legs", subcategory: "sub-calves", name: "Calves - Standing" },
  { id: "calves-tibialis-raise", category: "legs", subcategory: "sub-calves", name: "Calves - Tibialis Raise" },

  { id: "deadlift", category: "legs", subcategory: "sub-deadlift", name: "Deadlift" },
  { id: "romanian-deadlift", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian" },
  { id: "deadlift-deficit-paused", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Deficit Paused" },
  { id: "deadlift-paused", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Paused" },
  { id: "deadlift-rack-pull", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Rack Pull" },
  { id: "deadlift-romanian-smith-machine", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian - Smith Machine" },
  { id: "deadlift-romanian-single-leg", category: "legs", subcategory: "sub-deadlift", name: "Deadlift - Romanian Single Leg" },

  { id: "leg-curl-lying", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Lying" },
  { id: "leg-curl-machine", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Seated" },
  { id: "leg-curl-seated-single-leg", category: "legs", subcategory: "sub-leg-curl", name: "Leg Curl - Seated - Single Leg" },

  { id: "leg-extension-machine", category: "legs", subcategory: "sub-leg-extension", name: "Leg Extension" },
  { id: "leg-extension-single-leg", category: "legs", subcategory: "sub-leg-extension", name: "Leg Extension - Single Leg" },

  { id: "leg-press", category: "legs", subcategory: "sub-leg-press", name: "Leg Press" },
  { id: "leg-press-paused", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Paused" },
  { id: "leg-press-single-leg", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Single Leg" },
  { id: "leg-press-single-leg-paused", category: "legs", subcategory: "sub-leg-press", name: "Leg Press - Single Leg Paused" },

  { id: "squat", category: "legs", subcategory: "sub-squat", name: "Squat" },
  { id: "front-squat", category: "legs", subcategory: "sub-squat", name: "Squat - Front" },
  { id: "squat-front-smith-machine", category: "legs", subcategory: "sub-squat", name: "Squat - Front - Smith Machine" },
  { id: "squat-high-bar", category: "legs", subcategory: "sub-squat", name: "Squat - High Bar" },
  { id: "squat-paused", category: "legs", subcategory: "sub-squat", name: "Squat - Paused" },

  { id: "ab-wheel-rollout", category: "abs", name: "Ab Roller" },
  { id: "weighted-crunch", category: "abs", name: "Weighted Crunch" },

  { id: "running", category: "cardio", name: "Running" },
  { id: "treadmill", category: "cardio", name: "Treadmill" },
  { id: "rowing-machine", category: "cardio", name: "Rowing machine" },
  { id: "cycling-outdoor", category: "cardio", name: "Cycling (outdoor)" },
  { id: "stationary-bike", category: "cardio", name: "Stationary bike" },
  { id: "elliptical", category: "cardio", name: "Elliptical" },
  { id: "jump-rope", category: "cardio", name: "Jump rope" },
  { id: "stairmaster", category: "cardio", name: "Stairmaster" },
  { id: "hiit", category: "cardio", name: "HIIT" },
  { id: "swimming", category: "cardio", name: "Swimming" },

  // Taken out of the list (November 2026) while logged sets still point at them: hidden, see above.
  { id: "crunches", category: "abs", name: "Crunches", hidden: true },
  { id: "sit-ups", category: "abs", name: "Sit-ups", hidden: true },
  { id: "plank", category: "abs", name: "Plank", hidden: true },
  { id: "hanging-leg-raises", category: "abs", name: "Hanging leg raises", hidden: true },
];

// What the renamed or moved built-ins were called / where they were before the indeling in
// subcategories (November 2026), by id. Used to recognise old names in data stored by name (the
// one-time migrations in app.js) and to bring along an edited built-in that still has the old
// name or category (migrateBuiltinSubcategories() in app.js).
const BUILTIN_PREVIOUS = {
  "bench-press": { name: "Bench press" },
  "close-grip-bench-press": { name: "Close grip bench press", category: "arms" },
  "incline-bench-press": { name: "Incline bench press" },
  "bench-press-dumbbell": { name: "Bench press (dumbbell)" },
  "incline-bench-press-dumbbell": { name: "Incline bench press (dumbbell)" },
  "cable-crossover": { name: "Cable crossover" },
  "flyes-cable": { name: "Flyes (cable)" },
  "flyes-machine": { name: "Flyes (machine)" },
  "bent-over-barbell-row": { name: "Bent-over barbell row" },
  "lat-pulldown": { name: "Lat pulldown" },
  "seated-cable-row": { name: "Seated cable row" },
  "rear-delt-flyes-machine": { name: "Rear delt flyes (machine)" },
  "lateral-raises-cable": { name: "Lateral raises (cable)" },
  "lateral-raises-dumbbell": { name: "Lateral raises (dumbbell)" },
  "military-press-barbell": { name: "Military press (barbell)" },
  "shoulder-press-dumbbell": { name: "Shoulder press (dumbbell)" },
  "machine-shoulder-press": { name: "Machine shoulder press" },
  "skull-crushers-barbell": { name: "Skull crushers (barbell)" },
  "dips-triceps": { name: "Dips (triceps)" },
  "barbell-curl": { name: "Barbell curl" },
  "cable-curl": { name: "Cable curl" },
  "dumbbell-curl": { name: "Dumbbell curl" },
  "incline-dumbbell-curl": { name: "Incline dumbbell curl" },
  "hammer-curl": { name: "Hammer curl" },
  "reverse-curl": { name: "Reverse curl" },
  "overhead-triceps-extension-cable": { name: "Overhead triceps extension (cable)" },
  "triceps-pushdown-cable": { name: "Triceps pushdown (cable)" },
  "bulgarian-split-squat": { name: "Bulgarian split squat" },
  "hip-thrust-barbell": { name: "Hip thrust (barbell)" },
  "lunges-dumbbell": { name: "Lunges (dumbbell)" },
  "leg-press-calf-raise": { name: "Leg press calf raise" },
  "seated-calf-raise-machine": { name: "Seated calf raise (machine)" },
  "standing-calf-raise-machine": { name: "Standing calf raise (machine)" },
  "deadlift": { category: "back" },
  "romanian-deadlift": { name: "Romanian deadlift", category: "back" },
  "leg-curl-lying": { name: "Leg curl (lying)" },
  "leg-curl-machine": { name: "Leg curl (machine)" },
  "leg-extension-machine": { name: "Leg extension (machine)" },
  "leg-press": { name: "Leg press" },
  "front-squat": { name: "Front squat" },
  "ab-wheel-rollout": { name: "Ab wheel rollout" },
};

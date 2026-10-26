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

// Built-in exercises. The former "Olympisch gewichtheffen" lifts are placed by best fit:
// presses under Schouders, the cleans/snatch/swing under Benen.
// `id` is the exercise's fixed id (kebab-case of its name when ids were introduced, October 2026).
// It never changes, also not when the name does: plans, workouts, favorites, exercise info and
// records all point at it. Never edit an existing id; a new built-in gets a new, unique one.
const EXERCISE_DB = [
  { id: "bench-press", category: "chest", name: "Bench press" },
  { id: "bench-press-dumbbell", category: "chest", name: "Bench press (dumbbell)" },
  { id: "incline-bench-press", category: "chest", name: "Incline bench press" },
  { id: "incline-bench-press-dumbbell", category: "chest", name: "Incline bench press (dumbbell)" },
  { id: "decline-bench-press", category: "chest", name: "Decline bench press" },
  { id: "flyes-machine", category: "chest", name: "Flyes (machine)" },
  { id: "flyes-cable", category: "chest", name: "Flyes (cable)" },
  { id: "flyes-dumbbell", category: "chest", name: "Flyes (dumbbell)" },
  { id: "push-ups", category: "chest", name: "Push-ups" },
  { id: "dips-chest", category: "chest", name: "Dips (chest)" },
  { id: "cable-crossover", category: "chest", name: "Cable crossover" },
  { id: "pullover-dumbbell", category: "chest", name: "Pullover (dumbbell)" },

  { id: "deadlift", category: "back", name: "Deadlift" },
  { id: "sumo-deadlift", category: "back", name: "Sumo deadlift" },
  { id: "romanian-deadlift", category: "back", name: "Romanian deadlift" },
  { id: "lat-pulldown", category: "back", name: "Lat pulldown" },
  { id: "seated-cable-row", category: "back", name: "Seated cable row" },
  { id: "bent-over-barbell-row", category: "back", name: "Bent-over barbell row" },
  { id: "bent-over-dumbbell-row", category: "back", name: "Bent-over dumbbell row" },
  { id: "t-bar-row", category: "back", name: "T-bar row" },
  { id: "chin-ups", category: "back", name: "Chin-ups" },
  { id: "pull-ups", category: "back", name: "Pull-ups" },
  { id: "one-arm-dumbbell-row", category: "back", name: "One-arm dumbbell row" },
  { id: "machine-row", category: "back", name: "Machine row" },
  { id: "face-pulls", category: "back", name: "Face pulls" },
  { id: "shrugs-barbell", category: "back", name: "Shrugs (barbell)" },
  { id: "shrugs-dumbbell", category: "back", name: "Shrugs (dumbbell)" },
  { id: "hyperextensions", category: "back", name: "Hyperextensions" },
  { id: "good-mornings", category: "back", name: "Good mornings" },

  { id: "military-press-barbell", category: "shoulders", name: "Military press (barbell)" },
  { id: "shoulder-press-dumbbell", category: "shoulders", name: "Shoulder press (dumbbell)" },
  { id: "arnold-press", category: "shoulders", name: "Arnold press" },
  { id: "lateral-raises-dumbbell", category: "shoulders", name: "Lateral raises (dumbbell)" },
  { id: "lateral-raises-cable", category: "shoulders", name: "Lateral raises (cable)" },
  { id: "front-raises-dumbbell", category: "shoulders", name: "Front raises (dumbbell)" },
  { id: "front-raises-cable", category: "shoulders", name: "Front raises (cable)" },
  { id: "rear-delt-flyes-dumbbell", category: "shoulders", name: "Rear delt flyes (dumbbell)" },
  { id: "rear-delt-flyes-machine", category: "shoulders", name: "Rear delt flyes (machine)" },
  { id: "upright-row-barbell", category: "shoulders", name: "Upright row (barbell)" },
  { id: "upright-row-cable", category: "shoulders", name: "Upright row (cable)" },
  { id: "machine-shoulder-press", category: "shoulders", name: "Machine shoulder press" },

  { id: "barbell-curl", category: "arms", name: "Barbell curl" },
  { id: "dumbbell-curl", category: "arms", name: "Dumbbell curl" },
  { id: "hammer-curl", category: "arms", name: "Hammer curl" },
  { id: "concentration-curl", category: "arms", name: "Concentration curl" },
  { id: "preacher-curl-barbell", category: "arms", name: "Preacher curl (barbell)" },
  { id: "preacher-curl-dumbbell", category: "arms", name: "Preacher curl (dumbbell)" },
  { id: "cable-curl", category: "arms", name: "Cable curl" },
  { id: "incline-dumbbell-curl", category: "arms", name: "Incline dumbbell curl" },
  { id: "spider-curl", category: "arms", name: "Spider curl" },
  { id: "reverse-curl", category: "arms", name: "Reverse curl" },
  { id: "chin-ups-biceps", category: "arms", name: "Chin-ups (biceps)" },

  { id: "triceps-pushdown-cable", category: "arms", name: "Triceps pushdown (cable)" },
  { id: "skull-crushers-barbell", category: "arms", name: "Skull crushers (barbell)" },
  { id: "skull-crushers-dumbbell", category: "arms", name: "Skull crushers (dumbbell)" },
  { id: "overhead-triceps-extension-dumbbell", category: "arms", name: "Overhead triceps extension (dumbbell)" },
  { id: "overhead-triceps-extension-cable", category: "arms", name: "Overhead triceps extension (cable)" },
  { id: "close-grip-bench-press", category: "arms", name: "Close grip bench press" },
  { id: "dips-triceps", category: "arms", name: "Dips (triceps)" },
  { id: "kickbacks-dumbbell", category: "arms", name: "Kickbacks (dumbbell)" },
  { id: "kickbacks-cable", category: "arms", name: "Kickbacks (cable)" },
  { id: "diamond-push-ups", category: "arms", name: "Diamond push-ups" },

  { id: "squat", category: "legs", name: "Squat" },
  { id: "squat-dumbbell", category: "legs", name: "Squat (dumbbell)" },
  { id: "hack-squat", category: "legs", name: "Hack squat" },
  { id: "leg-press", category: "legs", name: "Leg press" },
  { id: "lunges-barbell", category: "legs", name: "Lunges (barbell)" },
  { id: "lunges-dumbbell", category: "legs", name: "Lunges (dumbbell)" },
  { id: "bulgarian-split-squat", category: "legs", name: "Bulgarian split squat" },
  { id: "leg-extension-machine", category: "legs", name: "Leg extension (machine)" },
  { id: "leg-curl-machine", category: "legs", name: "Leg curl (machine)" },
  { id: "leg-curl-lying", category: "legs", name: "Leg curl (lying)" },
  { id: "stiff-leg-deadlift", category: "legs", name: "Stiff-leg deadlift" },
  { id: "hip-thrust-barbell", category: "legs", name: "Hip thrust (barbell)" },
  { id: "hip-thrust-machine", category: "legs", name: "Hip thrust (machine)" },
  { id: "sumo-squat", category: "legs", name: "Sumo squat" },
  { id: "step-ups", category: "legs", name: "Step-ups" },
  { id: "goblet-squat", category: "legs", name: "Goblet squat" },
  { id: "front-squat", category: "legs", name: "Front squat" },

  { id: "standing-calf-raise-machine", category: "legs", name: "Standing calf raise (machine)" },
  { id: "seated-calf-raise-machine", category: "legs", name: "Seated calf raise (machine)" },
  { id: "calf-raise-dumbbell", category: "legs", name: "Calf raise (dumbbell)" },
  { id: "calf-raise-smith-machine", category: "legs", name: "Calf raise (smith machine)" },
  { id: "leg-press-calf-raise", category: "legs", name: "Leg press calf raise" },

  { id: "crunches", category: "abs", name: "Crunches" },
  { id: "sit-ups", category: "abs", name: "Sit-ups" },
  { id: "plank", category: "abs", name: "Plank" },
  { id: "leg-raises", category: "abs", name: "Leg raises" },
  { id: "hanging-leg-raises", category: "abs", name: "Hanging leg raises" },
  { id: "cable-crunch", category: "abs", name: "Cable crunch" },
  { id: "russian-twists", category: "abs", name: "Russian twists" },
  { id: "ab-wheel-rollout", category: "abs", name: "Ab wheel rollout" },
  { id: "mountain-climbers", category: "abs", name: "Mountain climbers" },
  { id: "bicycle-crunches", category: "abs", name: "Bicycle crunches" },
  { id: "side-plank", category: "abs", name: "Side plank" },

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

  { id: "clean-and-press", category: "shoulders", name: "Clean and press" },
  { id: "clean-and-jerk", category: "legs", name: "Clean and jerk" },
  { id: "snatch", category: "legs", name: "Snatch" },
  { id: "power-clean", category: "legs", name: "Power clean" },
  { id: "push-press", category: "shoulders", name: "Push press" },
  { id: "kettlebell-swing", category: "legs", name: "Kettlebell swing" },
  { id: "kettlebell-clean", category: "legs", name: "Kettlebell clean" },
];

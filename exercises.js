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

// Fixed muscle-group list, each under a standard category (Cardio has none). Users can't add,
// rename or delete these. Deliberately NOT linked to anything yet: no exercise has a muscle
// group, nothing is derived from exercise names, and nothing reads this list so far. (The
// Exercise Info Primair/Secundair field still uses its own MUSCLE_OPTIONS in app.js.)
const MUSCLE_GROUPS = [
  { name: 'Bovenborst', category: 'chest' },
  { name: 'Borst', category: 'chest' },
  { name: 'Lats', category: 'back' },
  { name: 'Middenrug', category: 'back' },
  { name: 'Onderrug', category: 'back' },
  { name: 'Trapezius', category: 'back' },
  { name: 'Voorste schouders', category: 'shoulders' },
  { name: 'Zijkant schouders', category: 'shoulders' },
  { name: 'Achterste schouders', category: 'shoulders' },
  { name: 'Biceps', category: 'arms' },
  { name: 'Triceps', category: 'arms' },
  { name: 'Onderarmen', category: 'arms' },
  { name: 'Quadriceps', category: 'legs' },
  { name: 'Hamstrings', category: 'legs' },
  { name: 'Glutes', category: 'legs' },
  { name: 'Adductoren', category: 'legs' },
  { name: 'Kuiten', category: 'legs' },
  { name: 'Buik', category: 'abs' },
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
// presses under Schouders (incl. Turkish get-up), the cleans/snatch/swing under Benen.
const EXERCISE_DB = [
  { category: "chest", name: "Bench press" },
  { category: "chest", name: "Bench press (dumbbell)" },
  { category: "chest", name: "Incline bench press" },
  { category: "chest", name: "Incline bench press (dumbbell)" },
  { category: "chest", name: "Decline bench press" },
  { category: "chest", name: "Flyes (machine)" },
  { category: "chest", name: "Flyes (cable)" },
  { category: "chest", name: "Flyes (dumbbell)" },
  { category: "chest", name: "Push-ups" },
  { category: "chest", name: "Dips (chest)" },
  { category: "chest", name: "Cable crossover" },
  { category: "chest", name: "Pullover (dumbbell)" },

  { category: "back", name: "Deadlift" },
  { category: "back", name: "Sumo deadlift" },
  { category: "back", name: "Romanian deadlift" },
  { category: "back", name: "Lat pulldown" },
  { category: "back", name: "Seated cable row" },
  { category: "back", name: "Bent-over barbell row" },
  { category: "back", name: "Bent-over dumbbell row" },
  { category: "back", name: "T-bar row" },
  { category: "back", name: "Chin-ups" },
  { category: "back", name: "Pull-ups" },
  { category: "back", name: "One-arm dumbbell row" },
  { category: "back", name: "Machine row" },
  { category: "back", name: "Face pulls" },
  { category: "back", name: "Shrugs (barbell)" },
  { category: "back", name: "Shrugs (dumbbell)" },
  { category: "back", name: "Hyperextensions" },
  { category: "back", name: "Good mornings" },

  { category: "shoulders", name: "Military press (barbell)" },
  { category: "shoulders", name: "Shoulder press (dumbbell)" },
  { category: "shoulders", name: "Arnold press" },
  { category: "shoulders", name: "Lateral raises (dumbbell)" },
  { category: "shoulders", name: "Lateral raises (cable)" },
  { category: "shoulders", name: "Front raises (dumbbell)" },
  { category: "shoulders", name: "Front raises (cable)" },
  { category: "shoulders", name: "Rear delt flyes (dumbbell)" },
  { category: "shoulders", name: "Rear delt flyes (machine)" },
  { category: "shoulders", name: "Upright row (barbell)" },
  { category: "shoulders", name: "Upright row (cable)" },
  { category: "shoulders", name: "Machine shoulder press" },

  { category: "arms", name: "Barbell curl" },
  { category: "arms", name: "Dumbbell curl" },
  { category: "arms", name: "Hammer curl" },
  { category: "arms", name: "Concentration curl" },
  { category: "arms", name: "Preacher curl (barbell)" },
  { category: "arms", name: "Preacher curl (dumbbell)" },
  { category: "arms", name: "Cable curl" },
  { category: "arms", name: "Incline dumbbell curl" },
  { category: "arms", name: "Spider curl" },
  { category: "arms", name: "Reverse curl" },
  { category: "arms", name: "Chin-ups (biceps)" },

  { category: "arms", name: "Triceps pushdown (cable)" },
  { category: "arms", name: "Skull crushers (barbell)" },
  { category: "arms", name: "Skull crushers (dumbbell)" },
  { category: "arms", name: "Overhead triceps extension (dumbbell)" },
  { category: "arms", name: "Overhead triceps extension (cable)" },
  { category: "arms", name: "Close grip bench press" },
  { category: "arms", name: "Dips (triceps)" },
  { category: "arms", name: "Kickbacks (dumbbell)" },
  { category: "arms", name: "Kickbacks (cable)" },
  { category: "arms", name: "Diamond push-ups" },

  { category: "legs", name: "Squat" },
  { category: "legs", name: "Squat (dumbbell)" },
  { category: "legs", name: "Hack squat" },
  { category: "legs", name: "Leg press" },
  { category: "legs", name: "Lunges (barbell)" },
  { category: "legs", name: "Lunges (dumbbell)" },
  { category: "legs", name: "Bulgarian split squat" },
  { category: "legs", name: "Leg extension (machine)" },
  { category: "legs", name: "Leg curl (machine)" },
  { category: "legs", name: "Leg curl (lying)" },
  { category: "legs", name: "Stiff-leg deadlift" },
  { category: "legs", name: "Hip thrust (barbell)" },
  { category: "legs", name: "Hip thrust (machine)" },
  { category: "legs", name: "Sumo squat" },
  { category: "legs", name: "Step-ups" },
  { category: "legs", name: "Goblet squat" },
  { category: "legs", name: "Front squat" },

  { category: "legs", name: "Standing calf raise (machine)" },
  { category: "legs", name: "Seated calf raise (machine)" },
  { category: "legs", name: "Calf raise (dumbbell)" },
  { category: "legs", name: "Calf raise (smith machine)" },
  { category: "legs", name: "Leg press calf raise" },

  { category: "abs", name: "Crunches" },
  { category: "abs", name: "Sit-ups" },
  { category: "abs", name: "Plank" },
  { category: "abs", name: "Leg raises" },
  { category: "abs", name: "Hanging leg raises" },
  { category: "abs", name: "Cable crunch" },
  { category: "abs", name: "Russian twists" },
  { category: "abs", name: "Ab wheel rollout" },
  { category: "abs", name: "Mountain climbers" },
  { category: "abs", name: "Bicycle crunches" },
  { category: "abs", name: "Side plank" },

  { category: "cardio", name: "Running" },
  { category: "cardio", name: "Treadmill" },
  { category: "cardio", name: "Rowing machine" },
  { category: "cardio", name: "Cycling (outdoor)" },
  { category: "cardio", name: "Stationary bike" },
  { category: "cardio", name: "Elliptical" },
  { category: "cardio", name: "Jump rope" },
  { category: "cardio", name: "Stairmaster" },
  { category: "cardio", name: "HIIT" },
  { category: "cardio", name: "Swimming" },

  { category: "shoulders", name: "Clean and press" },
  { category: "legs", name: "Clean and jerk" },
  { category: "legs", name: "Snatch" },
  { category: "legs", name: "Power clean" },
  { category: "shoulders", name: "Push press" },
  { category: "legs", name: "Kettlebell swing" },
  { category: "legs", name: "Kettlebell clean" },
  { category: "shoulders", name: "Turkish get-up" },
];

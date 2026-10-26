# AI Fitness Co-Pilot — Project Context & Workflow

## Wat is dit project?
Een fitness tracker PWA (Progressive Web App) waarmee je workouts bijhoudt: sets, reps en gewicht loggen, geschiedenis en grafieken bekijken, en workout plannen bouwen (met AI-hulp). Persoonlijke app, geen product voor extern publiek.

---

## Hoe wij werken

### Rolverdeling
- **Gebruiker (Bart)**: geeft instructies in gewone taal, test de app op zijn telefoon, stuurt screenshots
- **Claude (chat)**: analyseert, stelt vragen, schrijft prompts voor Claude Code
- **Claude Code**: voert code wijzigingen uit in de lokale projectmap en pusht naar GitHub

### Werkwijze
1. Bart beschrijft wat hij wil (in gewone taal, soms met screenshots)
2. Claude stelt verduidelijkende vragen als iets niet duidelijk is
3. Claude schrijft een duidelijke, complete prompt voor Claude Code
4. Bart stuurt de prompt naar Claude Code
5. Claude Code bouwt de feature en pusht naar GitHub
6. Bart test op zijn telefoon en rapporteert terug
7. Als er bugs zijn: Claude schrijft een fix prompt voor Claude Code

### Belangrijke regels
- Claude schrijft NOOIT zelf code — alleen prompts voor Claude Code
- Prompts voor Claude Code zijn altijd volledig en zelfstandig uitvoerbaar
- Elke prompt eindigt altijd met een git push commando
- Claude vraagt door als iets onduidelijk is voordat hij een prompt schrijft
- Als Bart meerdere dingen wil, vraagt Claude "onthoud ik ze en maak ik aan het einde één grote prompt?"
- Screenshots van FitNotes of andere apps worden gebruikt als voorbeeld/referentie

### Hoe Bart instructies geeft
- Soms via screenshots van andere apps (bijv. FitNotes, Hevy)
- Soms in gewone taal
- Soms zegt hij "onthoud dit" en geeft hij meerdere dingen tegelijk
- Bart werkt op een Windows computer, telefoon is Android

### App testen
- App is live op: https://bartprinsai.github.io/ai-fitness-copilot
- Bart test altijd op zijn Android telefoon
- Na elke push even wachten (1-2 minuten) voor GitHub Pages deployt
- Bij PWA updates: cache wissen of hard refreshen nodig

---

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Hosting**: GitHub Pages → https://bartprinsai.github.io/ai-fitness-copilot
- **Database**: Firebase Firestore (workout data per gebruiker)
- **Auth**: Firebase Authentication (Google login)
- **Exercise data**: statische lijst in `exercises.js`, geen externe dataset meer
- **AI (Workout Plan Builder)**: Anthropic API — rechtstreeks vanuit de browser via `anthropic-dangerous-direct-browser-access`, vereist een eigen API key in `app.js`
- **Repo**: https://github.com/bartprinsai/ai-fitness-copilot
- **Lokale map**: C:\Users\bartp\projecten\ai-fitness-copilot

---

## Projectstructuur
```
ai-fitness-copilot/
├── index.html              # Alle schermen en overlays
├── app.js                  # Alle logica
├── exercises.js            # Ingebouwde oefeningen + de centrale regels voor categorieën en spiergroepen
├── style.css                # Styling
├── manifest.json            # PWA manifest (start_url/scope: /ai-fitness-copilot/)
├── scripts/                  # Eenmalige admin-scripts (niet onderdeel van de live app)
│   └── cleanup-video-fields.js
├── icon-192.png
└── icon-512.png
```

---

## Firebase Config
- **Project ID**: ai-fitness-copilot
- **Project Number**: 41596366904

---

## Belangrijke variabelen in app.js
```javascript
let currentUser = null;            // Ingelogde Firebase user
let currentExerciseId = null;      // Id van de huidige oefening (naam via exerciseName())
let currentDate = todayStr();      // Huidige datum (YYYY-MM-DD)
let db = { ... };                  // In-memory state: workouts, records, plans
```

---

## Belangrijke functies in app.js
```javascript
todayStr()                         // "Vandaag" als 'YYYY-MM-DD' in Europe/Amsterdam (nooit UTC); rekenen met addDaysToDateStr()/weekdayOfDateStr()
allExercises()                     // Zichtbare oefeningen ({ id, name, category, … }); exerciseName(id)/findExercise(id) zoeken op id, ook verwijderde
getWorkout(date)                   // Haal workout op voor datum
setWorkout(date, workout)          // Sla workout op in Firestore
renderSetList()                    // Herrender de set lijst
toast(message, {type, duration})    // Banner onder de header: type "success" (standaard, groen) | "error" (rood, 4s) | "pr" (goud)
openExerciseInfo()                 // Open exercise info bottom-sheet (spiergroep + apparaat-instellingen)
callClaude(userMessage, sysPrompt) // Anthropic API call voor de AI plan generator
```

---

## Wat al werkt
- Google login via Firebase Auth
- Workout data opslaan in Firestore per gebruiker
- Oefeningen bijhouden met sets, reps en gewicht
- Geschiedenis en grafieken, PR-detectie
- PWA installeerbaar op telefoon
- **Hoofdmenu** met de tegels Fitness Tracker, Trainingsplannen, Calculators, Voeding (binnenkort beschikbaar) en Inzicht ("Training, voeding, slaap en gewicht"; opent het weekoverzicht, zie "Inzicht")
- **Globale "AI Coach"-pil** zwevend onderaan op elk scherm behalve login/hoofdmenu (effen paars `--ai`, sparkle-icoon, geen achtergrondbalk erachter) — scherm/logica nog niet gebouwd, klik-handler is een lege TODO in `app.js` (`btn-global-ai-coach`)
- **Workout Plan Builder** met presets (Push Pull Legs, Upper Lower), AI generator, koppeling aan Fitness Tracker
- **Multi-select modus** voor meerdere oefeningen tegelijk verwijderen
- **Drag-to-reorder** oefeningen in daglijst (ingedrukt houden → slepen)
- Leeg-workoutlog-scherm toont nu "Workout Log Empty" + "Start New Workout" (de losse "AI Coach"-tegel hier is vervallen — die functionaliteit zit nu in de globale AI Coach-pil hierboven)
- **"Start New Workout"** opent niet meer direct "All Exercises", maar eerst het **New Workout-tussenscherm** (`#screen-new-workout`) met drie kaarten: Manual Workout (→ All Exercises, werkt), Load Schedule Manually (→ "Kies een plan" → "[Plan] — kies een dag" → laadt die dag in de dag die de Tracker toonde toen New Workout werd geopend; Automatically en de banner laden altijd in vandaag) en Load Schedule Automatically (bevestigingspop-up "Vandaag is [dag]" op basis van `getTodaysScheduledDay()`, dezelfde functie als de Smart Day Banner: "Geen vaste dagen" = sequentieel na de laatst geladen dag, "Vaste dagen" = de dag van de huidige weekdag, bij Week A/B binnen de actieve week, die wisselt zodra al haar dagen zijn afgewerkt óf een nieuwe kalenderweek (maandag t/m zondag) begint — wat het eerst komt (`activePlan.activeWeek`/`doneWeekdays`/`weekStart`, eerste keer Week A; na een wissel door afwerken telt de nieuwe week vanaf de volgende maandag); zonder actief plan of zonder dag voor vandaag een melding). Banner en beide opties laden via `loadPlanDayIntoWorkout()`: oefeningen krijgen de sets/reps uit het plan mee als `target`, en de training onthoudt welke plandag geladen is (`planDays`, zie "Inzicht") (getoond op de oefeningkaart, reps voorgevuld op het Track-tabblad)
- **Exercise info bottom-sheet** — per oefening: spiergroep (Primair: één keuze, Secundair: meerdere keuzes, beide uit `MUSCLE_GROUPS`, zie "Categorieën en spiergroepen") en apparaat-instellingen (bench setting/height, oude/nieuwe cable height, hand/foot position). Bereikbaar via het ⓘ-icoon in de training-toolbar, tussen de trofee en het drie-puntjes-menu. View mode toont altijd Spiergroep (Primair en Secundair, "Niet ingesteld" als er niets gekozen is; Secundair elke spiergroep op een eigen regel) en verder alleen ingevulde apparatuurvelden; Edit mode heeft keuzelijsten voor spiergroep en losse velden voor apparaat-instellingen (leeg gelaten veld wordt niet opgeslagen). Data hoort bij de oefening zelf (net als favorite/hidden), opgeslagen in Firestore onder `meta/exercise_info`, met het oefening-id als sleutel (zie "Oefening-id's") — blijft gekoppeld bij hernoemen en bij verwijderen (verbergen), en wordt alleen gewist bij permanent verwijderen
- **Uniform design system** voor de hele app (oorspronkelijk FitNotes-geïnspireerd): één set tokens in `:root` (kleuren, zes typografieniveaus, vier radiussen, één kaartschaduw, spacing-schaal) en gedeelde basisklassen (`.toolbar`, `.btn`, `.pill`, `.nav-card`, `.section-label`, één input-stijl). Licht thema standaard; licht/donker-schakelaar rechts in de toolbar van het hoofdmenu, keuze in `localStorage` (zonder keuze: systeeminstelling), gezet vóór de eerste paint door een inline script in `<head>`. Zie `DESIGN_SYSTEM.md`
- **Nieuw oefening aanmaken** scherm (NAME, CATEGORY, TYPE, WEIGHT UNIT — het NOTES-veld is verwijderd) — hetzelfde scherm dient ook als **Edit**-formulier voor élke oefening, ook ingebouwde (titel wisselt naar "Update Exercise"); onder TYPE staan een altijd zichtbare **MUSCLE GROUP**-sectie (Primary/Secondary) en een inklapbare **EQUIPMENT SETUP**-rij (standaard ingeklapt, ook als er al data is) met exact dezelfde velden als het exercise info-scherm — beide schermen delen dezelfde veld-definities/render/lees/schrijf-functies (`EXERCISE_INFO_FORMS` in app.js, id-prefix `info` vs `new-ex-info`) en dezelfde opslag (`meta/exercise_info`); het ✓ bovenin slaat alles in één keer op. categorie/type/dropdown-velden gebruiken de gedeelde omrande input-stijl, nieuwe categorie aanmaken gaat via een aparte "New Category"-modal
- **Edit/Delete/Favorite per oefening** via drie puntjes menu in de All Exercises-lijst — identiek voor ingebouwde én zelf toegevoegde oefeningen (Edit van een ingebouwde oefening maakt een eigen item met hetzelfde id dat de ingebouwde overschrijft; Delete van een ingebouwde oefening verbergt 'm via `db.hiddenBuiltins`, zie "Oefening-id's" en `DESIGN_SYSTEM.md`). Favorieten krijgen een blauw sterretje en verschijnen gebundeld in een automatische "Favorites"-categorie bovenaan. Delete verbergt de oefening; de trainingsgeschiedenis blijft. Terugzetten, en eigen oefeningen permanent verwijderen, gaat via Verwijderde oefeningen onderaan Alle oefeningen (zie "Oefening-id's")
- **Gedeelde modal-stijl**: elke pop-up in de app (`.overlay`/`.overlay-panel`) heeft een blauwe titel en losse, afgeronde actieknoppen (geen bordered/segmented rij) — één centrale CSS-basisregel in `style.css`, zie `DESIGN_SYSTEM.md` sectie "Modals"
- **Categoriebeheer** via het drie-puntjes-menu (hernoemen/verwijderen) en "+" in het oefeningformulier (toevoegen) — zie "Categorieën en spiergroepen"
- **Selectie modus** met vinkje en vuilnisbak in toolbar bij ingedrukt houden
- **"Alles resetten"** in het drie-puntjes-menu van de Fitness Tracker (popup "Terugzetten naar standaard?") — tijdelijke knop (blijft staan tot de app verder af is) om alle Firestore-data van het account te wissen en de app terug te zetten naar de standaardstaat. Vereist het typen van "RESET" ter bevestiging. Zie `resetInProgress`/`openResetOverlay` in app.js voor de exacte paden die dit raakt.

## Categorieën en spiergroepen
Alle regels staan op **één plek: bovenaan `exercises.js`** (`EXERCISE_CATEGORIES`, `MUSCLE_GROUPS`, `LEGACY_CATEGORY_MAP`). De per-gebruiker-kant (hernoemd/toegevoegd/verwijderd) staat in Firestore onder `meta/categories` en loopt via de helpers onder "Categories" in `app.js` (`allCategories()`, `categoryName()`, `addCategory()`, `exercisesInCategory()`). Elk scherm dat categorieën toont (Alle oefeningen, oefening toevoegen vanuit de Fitness Tracker en vanuit een plandag, het Categorie-veld in Nieuwe oefening/Oefening bewerken) leest via `allCategories()`, dus overal dezelfde namen in dezelfde volgorde.

- **Zeven standaardcategorieën, in deze volgorde**: Borst, Rug, Schouders, Armen, Benen, Buik, Cardio. Oefeningen bewaren het vaste **id** (`chest`, `back`, `shoulders`, `arms`, `legs`, `abs`, `cardio`), nooit de naam. Eigen categorieën komen erna, in volgorde van aanmaken (id `custom-…`). Alle categorieën worden getoond, ook als ze leeg zijn.
- **Ingebouwde oefeningen** (`EXERCISE_DB`, 112 stuks, eigen lijst — de app gebruikt free-exercise-db niet): de oude indeling is op betekenis omgezet: Biceps en Triceps → Armen, Kuiten → Benen, Buikspieren → Buik. De oude categorie "Olympisch gewichtheffen" is verdeeld: Clean and press en Push press → Schouders; Clean and jerk, Snatch, Power clean, Kettlebell swing en Kettlebell clean → Benen. De **Turkish get-up is verwijderd** (oktober 2026); hij kwam nergens anders voor (geen presets, plannen, workouts of andere data, ook niet in Firestore).
- **Omzetting van datasetspieren**: niet van toepassing. Er is geen externe dataset (zie "Wat bewust is verwijderd"); de omzettingsregels voor free-exercise-db (`primaryMuscles` → categorie, cardio altijd Cardio) zijn daarom bewust niet in de code gezet.
- **Eigen oefeningen van vóór deze indeling** bewaarden een categorienaam. Bij het laden zet `migrateCustomExerciseCategories()` die eenmalig om naar het id via `LEGACY_CATEGORY_MAP` (op betekenis, Nederlands en Engels, bv. Chest → Borst, Biceps/Triceps → Armen, Core → Buik). "Olympisch gewichtheffen" krijgt de categorie van de ingebouwde oefening met dezelfde naam, anders Benen. Een naam zonder duidelijke betekenis wordt niet gegokt: die wordt een eigen categorie met dezelfde naam (en een `console.warn`). Op het moment van deze omzetting (oktober 2026) had geen enkel account eigen oefeningen.
- **Vaste spiergroepenlijst** (`MUSCLE_GROUPS`), elk met zijn categorie: Borst: Bovenborst, Borst · Rug: Lats, Middenrug, Onderrug, Trapezius · Schouders: Voorste schouders, Zijkant schouders, Achterste schouders · Armen: Biceps, Triceps, Onderarmen · Benen: Quadriceps, Hamstrings, Glutes, Adductoren, Kuiten · Buik: Buik · Cardio: geen. Gebruikers kunnen deze lijst niet aanpassen. Het is **de enige spiergroepenlijst** in de app: de oude lijst `MUSCLE_OPTIONS` is verwijderd, en de velden Primair en Secundair (Oefeninginfo en Nieuwe oefening / Oefening bewerken, dezelfde velddefinities) kiezen alleen hieruit.
- **Opslag per oefening** (in `meta/exercise_info`, met het oefening-id als sleutel, net als de apparatuurvelden): `primaryMuscleGroup` = één spiergroep-id (bv. `upper-chest`) of weggelaten; `secondaryMuscleGroups` = een lijst van id's, of weggelaten als hij leeg is. **Secundair heeft meerdere keuzes**; een spiergroep is nooit tegelijk primair en secundair (kies je hem als primair, dan verdwijnt hij uit Secundair). Er wordt niets automatisch afgeleid (geen koppeling met oefeningnamen of een dataset): spiergroepen worden alleen met de hand per oefening gekozen.
- **Alle waarden gewist** (oktober 2026): de oude vrije namen (`primaryMuscle` / `secondaryMuscle`) zijn niet omgezet maar gewist, in Firestore (alleen Bench press en Deadlift van één account hadden waarden; hun apparatuurgegevens zijn bewaard) en voor de zekerheid ook bij het laden (`stripLegacyMuscleFields()` in `app.js`). Elke oefening staat daardoor op "Niet ingesteld".
- **Categoriebeheer**: **toevoegen** (via "+" naast het Categorie-veld; de categorie bestaat meteen, ook als de oefening niet wordt opgeslagen) en **hernoemen** (⋮ → Bewerken) mag altijd, zolang de naam nog niet bestaat. Hernoemen verandert alleen de getoonde naam: een standaardcategorie houdt zijn id en dus zijn spiergroepen. **Verwijderen** (⋮ → Verwijderen) mag alleen als er geen oefeningen in zitten; anders meldt de pop-up "Categorie niet leeg" dat de categorie eerst leeg moet zijn. Een verwijderde standaardcategorie komt terug als je een categorie met zijn oorspronkelijke naam toevoegt. Verwijderde (verborgen) oefeningen tellen niet mee; zit er zo'n oefening in een verwijderde eigen categorie, dan onthoudt `meta/categories` die als `removed: [{ id, name }]`, zodat terugzetten de categorie terugbrengt (zie "Oefening-id's"). "Alles resetten" wist ook `meta/categories`.

## Oefening-id's
- **Elke oefening heeft een vast id; de naam is alleen weergave.** Hernoemen verandert alleen `name`; alles wat naar de oefening verwijst blijft gekoppeld. Namen blijven wel uniek (hoofdletterongevoelig) onder de zichtbare oefeningen: `exerciseNameTaken()` weigert een dubbele naam bij aanmaken en hernoemen ("Deze oefening bestaat al").
- **Ingebouwde oefeningen**: het id staat in de code, in `EXERCISE_DB` (`exercises.js`), gemaakt van de naam bij de invoering in kebab-case (`Bench press` → `bench-press`, `Flyes (cable)` → `flyes-cable`). Een bestaand id wordt nooit meer gewijzigd, ook niet als de naam verandert.
- **Eigen oefeningen** krijgen bij het aanmaken `newExerciseId()`: `ex-` + tijd + willekeurige tekens, niet gebaseerd op de naam.
- **Bewerken van een ingebouwde oefening** maakt in `meta/custom_exercises` een item met hetzelfde id; dat overschrijft de ingebouwde (`allExercises()`).
- **Verwijderen = verbergen** (sinds oktober 2026). Een eigen (of bewerkte) oefening blijft in `meta/custom_exercises` staan met `deleted: true`, een ingebouwde komt in `meta/hidden_builtins`. Er wordt **niets gewist**: alle gelogde sets, records (live berekend), de favoriet-markering en de Oefeninginfo (`meta/exercise_info`) blijven bewaard. Id en naam blijven op te zoeken (`exerciseName(id)`, `findExercise(id)`).
  - **Weg uit elke lijst waarin je een oefening kiest of bekijkt**: alles wat via `allExercises()` loopt — Alle oefeningen, de categorieën (`exercisesInCategory()`), de zoekresultaten, oefening toevoegen vanuit de Fitness Tracker en vanuit een plandag (hetzelfde scherm), Favorieten (de lijst én de categorie Favorieten, die alleen verschijnt als er een zichtbare favoriet is) en de oefeningenlijst voor de AI-planbuilder. Records hebben geen eigen overzichtslijst; ze horen bij de geopende oefening.
  - **Blijft zichtbaar met de naam**: trainingen uit het verleden (dagoverzicht, Geschiedenis, kalenderpopup, Ga naar), de Samenvatting, plandagen die de oefening bevatten, en Inzicht telt haar sets gewoon mee (de spiergroep uit de bewaarde Oefeninginfo).
  - **Naam blijft bezet**: een nieuwe oefening, of hernoemen naar de naam van een verwijderde oefening (hoofdletterongevoelig) wordt geweigerd met de melding "Deze naam hoort bij een verwijderde oefening. Kies een andere naam." Na permanent verwijderen is de naam weer vrij (`deletedExerciseNameTaken()`, zelfde patroon als "Deze oefening bestaat al").
  - De verwijderpop-up heeft **geen vinkje**: verbergen is terug te draaien.
  - Data die vóór deze wijziging door verwijderen is gewist, komt niet terug.
- **Verwijderde oefeningen** (sinds oktober 2026): onder de categorieën in Alle oefeningen staat een eigen kaart met de rij "Verwijderde oefeningen (N)", alleen als er iets verwijderd is en niet in het keuzescherm vanuit een plandag (`exerciseScreenMode === 'plan-add'`). Het scherm (`#screen-deleted-exercises`, `renderDeletedExercises()`) toont alle verborgen oefeningen (`deletedExercises()`) op naam, met de categorie en "ingebouwd" of "eigen oefening". Ingebouwd = het id staat in `EXERCISE_DB` (`isBuiltinExerciseId()`), ook als de oefening bewerkt is.
  - **Terugzetten** (`restoreExercise()`, elke verwijderde oefening, zonder bevestiging): haalt `deleted` van de eigen entry en het id uit `meta/hidden_builtins`. Omdat er niets gewist was, is de oefening meteen terug in haar eigen categorie met al haar geschiedenis, records, Oefeninginfo en favoriet-markering. Is haar categorie intussen verwijderd (dat mag zodra hij leeg lijkt), dan komt die terug (`restoreCategoryOf()`): een standaardcategorie uit `deleted`, een eigen categorie met hetzelfde id en dezelfde naam uit `meta/categories.removed` (daar onthoudt Categorie verwijderen een eigen categorie waar nog een verwijderde oefening in zit). Melding: "[naam] is teruggezet".
  - **Permanent verwijderen** (`purgeExercise()`, **alleen eigen oefeningen**; een ingebouwde kan alleen verborgen worden). Na de pop-up met vinkje wordt gewist: de oefening zelf (uit `meta/custom_exercises`), al haar gelogde sets (een training zonder oefeningen verdwijnt, via `setWorkout()`), records (`meta/records`), Oefeninginfo inclusief Kracht volgen (`meta/exercise_info`) en de favoriet-markering (`meta/favorites`). Ze gaat ook uit **alle plandagen** van alle plannen (`persistPlan()`); voor het actieve plan is dat een schemawijziging, dus ontstaat via `syncInsightSchedule()` een nieuwe schemaversie vanaf vandaag. **Bestaande schemaversies blijven onaangeroerd**: daarin staat de naam van de oefening, dus Inzicht kan die dagen blijven tonen. Inzicht telt haar sets niet meer mee, ook niet met terugwerkende kracht. Daarna is de naam weer vrij voor een nieuwe oefening. Melding: "[naam] is permanent verwijderd".
- **Wat naar het id verwijst**:
  - plandagen (`plans/{id}` → `days[].exercises[]` = `{ exerciseId, sets, reps }` of `{ exerciseId, repsPerSet }`) en de sjablonen;
  - gelogde trainingen (`workouts/{datum}` → `exercises[]` = `{ exerciseId, sets, target? }`);
  - `meta/favorites` → `{ ids: [...] }`, `meta/hidden_builtins` → `{ ids: [...] }`;
  - `meta/exercise_info` → `{ data: { [id]: {...} } }` en `meta/records` → `{ data: { [id]: {...} } }` (records worden live berekend; dit oude document wordt alleen nog opgeschoond);
  - in de app zelf: `currentExerciseId`, PR's, Records, Grafiek, Geschiedenis, Samenvatting en de kalenderpopup zoeken allemaal op id. Schermen tonen de naam via `exerciseName(id)`.
- **Video's**: er is op dit moment geen koppeling met video's meer. De map `exercises/videos/` en alle videocode zijn eerder verwijderd (zie hieronder). Komt er weer een video bij een oefening, dan wordt die via het oefening-id gevonden, nooit via de naam. Het oude document `meta/video_links` (Drive-video's, sleutel `datum_naam_setnummer`) in één account wordt door de app niet gelezen en is niet omgezet.
- **Migratie (eenmalig, per gebruiker)**: `migrateExerciseIds()` in `app.js` draait vanuit `loadUserData()` zolang `meta/migrations` geen `exerciseIds` heeft, en zet die vlag (de datum) in de laatste schrijfbatch, zodat hij daarna nooit meer draait. Hij zet om: eigen oefeningen krijgen een id (heeft een eigen oefening de naam van een ingebouwde, dan is het die bewerkte ingebouwde en krijgt hij diens id); trainingen en plandagen `{ name }` → `{ exerciseId }`; favorieten, verborgen ingebouwde, exercise_info en records naar id als sleutel. Een naam zonder bijbehorende oefening wordt niet gegokt: in een training of plandag valt zo'n regel weg (zonder id kan de app hem niet openen), als sleutel in favorieten/verborgen/exercise_info/records blijft hij staan (niets zoekt hem op); beide worden gelogd (`console.warn`). Op 26 oktober 2026 is de migratie voor alle drie de accounts gedraaid; er waren geen onbekende namen.

## Inzicht
Stap 1 (oktober 2026) legde de opslag aan, stap 2 het hoofdscherm voor een week, stap 3 het dagoverzicht met slaap en gewicht invullen, stap 4 de detailschermen Slaap en Gewicht. De code staat in `app.js` onder "Inzicht: schedule versions and Week A/B per date", "Inzicht: sleep and body weight", "Inzicht: the screen", "Inzicht: the day overview" en "Inzicht: the detail screens Slaap and Gewicht". Vormgeving: DESIGN_SYSTEM.md, "Inzicht".

### Vaste afspraken
- **Een week loopt van maandag tot en met zondag** (weekdag 0 = maandag, `weekdayOfDateStr()`).
- **De nacht hoort bij de dag van wakker worden**: de nacht van woensdag op donderdag hoort bij donderdag.
- **Elke dag wordt vergeleken met het schema dat die dag actief was**, nooit met het huidige plan. Daarvoor is er één centrale functie: `getPlannedForDate(datum)` (zie hieronder).
- **Bij vaste dagen en Week A/B telt een geplande dag zonder training als gemist.** Een rustdag is nooit gemist.
- **Bij doorlopende schema's** ("Geen vaste dagen") wordt niet per dag als gemist gemarkeerd, maar per periode vergeleken met het schema zoals het op de kalender zou lopen vanaf de ingangsdatum van de versie (die berekening volgt in een latere stap).
- **Een wissel is een ander plan-id** (`isScheduleSwitch()`). Een wijziging binnen hetzelfde plan, ook een andere naam, is geen wissel. Inzicht toont welk schema actief was en markeert alleen een wissel.
- **Inzicht is alleen om te kijken**, behalve slaap en gewicht: die worden in Inzicht ingevuld.

### Plandagen
- **Elke plandag heeft een vast id** (`day.id`, `genPlanDayId()`: `day-` + tijd + willekeurige tekens). Het verandert niet als dagen verschuiven, hernoemd worden of er dagen bijkomen. Nieuwe dagen krijgen er een bij het aanmaken (`createPlan()`, Dag toevoegen, de weekdagkiezer, Doorgaan). Doorgaan op het dagindelingsscherm maakt de dagen opnieuw en geeft een dag het id (en de oefeningen) van de oude dag met dezelfde naam.
- **Bij vaste dagen staat de weekdag in `day.weekday`** (0 = maandag) en wordt nooit meer uit de dagnaam afgeleid (`planDayWeekday(day)`). Een hernoemde dag houdt zo zijn weekdag. Doorlopende plannen hebben geen weekdag.
- **Een training onthoudt zijn plandag**: als je een plandag laadt (banner, Schema handmatig/automatisch laden), krijgt het trainingsdocument `workouts/{datum}` naast `exercises` een lijst `planDays: [{ planId, dayId, dayName, week? }]`. `week` ('A'/'B') alleen bij een Week A/B-plan. Elke plandag die je op die datum laadt komt erin, elk één keer. Oefeningen zonder plandag voegen niets toe. Wordt de training helemaal leeg (document gewist), dan is ook deze lijst weg.

### Schemaversies (`users/{uid}/schedule_versions/{datum}`)
- Bij elke wijziging die het actieve schema raakt, wordt een volledige kopie opgeslagen met een ingangsdatum: de lokale datum (Europe/Amsterdam) van de wijziging. De versie geldt vanaf die dag, die dag inbegrepen; dagen ervoor houden de vorige versie. Eén document per datum: bij meerdere wijzigingen op één dag blijft alleen de laatste over.
- **Wanneer**: elke schrijfactie van een plan of het actieve plan (`persistPlan`, `deletePlanDoc`, `persistActivePlan`) roept `syncInsightSchedule()` aan. Die slaat alleen een versie op als het schema echt anders is dan de laatste versie. Dat dekt een ander plan actief maken, oefeningen, sets, plandagen, weekdagen of het soort schema wijzigen, het actieve plan verwijderen en geen plan meer actief hebben. Een oefening hernoemen is geen schemawijziging; de volgende versie neemt de nieuwe naam gewoon mee.
- **Inhoud**: `{ effectiveFrom, planId, planName, type, days, restWeekdays | restWeekdaysA + restWeekdaysB }`.
  - `type`: `fixed` (vaste dagen), `weekAB` (vaste dagen met Week A/B) of `sequential` (doorlopend).
  - `days`: alle plandagen in de volgorde van het plan, `{ id, name, weekday?, week?, exercises: [{ exerciseId, name, sets }] }`. `sets` is het aantal geplande sets; bij `repsPerSet` het aantal sets in die lijst.
  - Rustdagen: de weekdagen zonder plandag (`restWeekdays`; bij Week A/B per week). **Een doorlopend plan heeft geen rustdagen**: de app stelt gewoon de volgende dag voor na de laatst geladen dag, ongeacht de datum. Een pauze is dus geen rustdag en bouwt ook geen achterstand op.
  - Geen spiergroepen: die zoekt Inzicht op via het oefening-id. De naam van een oefening staat er wel in, voor als die later verwijderd wordt.
  - Geen actief plan: `{ effectiveFrom, planId: null }` ("geen schema").
- Verwijderen of wijzigen van een plan raakt bestaande versies nooit. "Alles resetten" wist ze wel (alle data).
- **Startpunt**: de eerste keer dat de app laadt na deze stap, wordt het huidige schema opgeslagen met de datum van die dag. Er is niets met terugwerkende kracht ingevuld.

### Week A/B per datum (`users/{uid}/week_cycle/{datum}`)
- `{ effectiveFrom, planId, week }`: de actieve week van een Week A/B-plan vanaf die datum. Los van `meta/activeplan`, wordt nooit achteraf aangepast. Eén document per datum, de laatste wint.
- `recordWeekCycle()` volgt dezelfde regels als de app bij het voorstellen van een dag (`planWeekCycle`): is een week op een dag helemaal afgewerkt, dan gaat de andere week de volgende dag in (vandaag blijft de dag die je net laadde). Een wissel door een nieuwe kalenderweek gaat in op de maandag van die week. Elke andere wijziging gaat vandaag in.
- Wordt vastgelegd bij het laden van de app, bij elke wijziging van een plan of het actieve plan, en bij elk openen van de Fitness Tracker (zo wordt een nieuwe kalenderweek opgemerkt).
- **Startpunt**: gebruikt het actieve plan Week A/B, dan wordt bij de eerste keer de huidige week opgeslagen met de datum van vandaag.

### Centrale functie: `getPlannedForDate(datum)`
Geeft de geldende schemaversie (de laatste ingangsdatum op of vóór die datum) en wat er gepland stond:
- `no-version`: geen versie op of vóór die datum.
- `no-schedule`: geen actief plan.
- `day` (met `day`) of `rest`: bij vaste dagen de plandag voor die weekdag; bij Week A/B de plandag voor die weekdag in de week die op die datum actief was (met `week`).
- `no-week`: Week A/B, maar voor die datum is geen week vastgelegd.
- `sequential`: doorlopend; de versie zelf, met de dagen in volgorde en de ingangsdatum.

### Slaap en gewicht
- **Slaap** (`users/{uid}/sleep/{datum}` → `{ bedtime, wakeTime }`, HH:MM). De duur wordt uitgerekend, ook over middernacht (`sleepDurationMinutes()`). Functies: `saveSleep(datum, bedtijd, opstaan)` (opslaan én wijzigen, weigert een ongeldige tijd), `deleteSleep`, `getSleep`, `getSleepRange(van, tot)` (met `minutes`).
- **Gewicht** (`users/{uid}/body_weight/{datum}` → `{ kg }`), maximaal 2 decimalen (`parseWeight()`, komma of punt). Eén waarde per dag; opnieuw opslaan overschrijft. Functies: `saveBodyWeight(datum, waarde)` (weigert 0 of geen getal), `deleteBodyWeight`, `getBodyWeight`, `getBodyWeightRange(van, tot)`.
- Worden bij het laden in het geheugen gezet (`db.sleep`, `db.bodyWeight`), net als de andere gebruikersdata.

### Kracht volgen
- Per oefening in `meta/exercise_info` (op oefening-id): `trackStrength: true` = ja; ontbreekt = nee (de standaard). Ook voor ingebouwde oefeningen, als eigen instelling van de gebruiker.
- `isStrengthTracked(id)` / `setStrengthTracked(id, aan)`. Nog geen knop of weergave. Oefeninginfo opslaan laat het veld staan (`EXERCISE_INFO_NON_FORM_KEYS`).

### Het scherm: week (stap 2)
- **Openen**: de tegel Inzicht op het hoofdmenu (`openInsight()`) opent altijd op de huidige week. Terugbladeren kan onbeperkt, vooruit tot en met de huidige week. Weeknummer = ISO 8601 (`isoWeekOfDateStr()`: de week hoort bij het jaar van zijn donderdag; 29 december 2025 valt in week 1 van 2026, 31 december 2026 in week 53). Maand en Jaar volgen later.
- **Datumregel** (`formatDateRange()`): "19–25 oktober 2026", over twee maanden "26 oktober – 1 november 2026", over twee jaren "29 december 2025 – 4 januari 2026".
- **Schemaregel** (`insightScheduleText()`, per dag via `getPlannedForDate()`): "Schema: Push Pull Legs · Week A" (de week alleen bij Week A/B; wisselt de week midden in de week, dan "· Week A, vanaf vrijdag Week B"). Een wissel naar een ander plan-id: "Schema: Push Pull Legs, vanaf donderdag Upper Lower" (naar geen plan: "…, vanaf donderdag geen schema"). Alleen dagen zonder actief plan: "Geen schema actief". Geen versie voor die dagen: "Geen schema bekend". Dagen vóór de eerste versie tellen voor deze regel niet mee.
- **Per dag, Training**: minstens één gelogde set op die datum = gedaan (groen vinkje). **Rode ring (gemist)** alleen als de dag volgens zijn eigen schemaversie een plandag had (vaste dagen of Week A/B), de dag voorbij is (vóór vandaag) en er geen set is gelogd; een geladen training zonder sets telt dus als gemist. Vandaag, dagen die nog komen, rustdagen, dagen zonder schema of zonder vastgelegde week en **doorlopende schema's krijgen nooit een rode ring**, maar een streepje.
- **Per dag, overige rijen**: Voeding nog overal een streepje; Slaap de duur als u:mm, onder 7:00 rood; Gewicht de waarde met 1 decimaal zonder eenheid. De eerste dag van een ander plan-id krijgt een stippellijn (zie DESIGN_SYSTEM.md).
- Tikken op een dag (de hele kolom in Per dag) opent het dagoverzicht (stap 3, hieronder); dagen na vandaag openen niet.
- **Aan te tikken kaarten**: Slaap en Gewicht zijn in hun geheel een knop met rechts een chevron en openen hun detailscherm (stap 4, hieronder) voor dezelfde week. Training en Voeding hebben (nog) geen chevron en doen niets.
- **De kop** (Week · Maand · Jaar, ‹ Week 43 ›, de datumregel) is één gedeeld component, `insightWeekHeadHtml()`, voor het weekoverzicht en beide detailschermen. Bladeren verschuift `insightWeekStart` en tekent het actieve scherm opnieuw.

### Het dagoverzicht (stap 3)
- **Openen en navigeren**: `openInsightDay(datum)` vanuit het raster Per dag, alleen tot en met vandaag. Bovenaan ‹ datum › ("Donderdag 22 oktober 2026"); terugbladeren onbeperkt, vooruit tot en met vandaag. De terugpijl (en de terugknop van de telefoon) brengt je naar het weekoverzicht van de week waarin de getoonde dag valt (`renderInsightDay()` zet `insightWeekStart` mee).
- **Training, kop**: de naam van de plandag die volgens de schemaversie gepland stond; "Rustdag" als er niets gepland stond; zonder schema met vaste dagen (geen versie, geen plan, doorlopend, geen week vastgelegd) de naam van de geladen plandag(en) uit `planDays` als die er is, anders "Training" (wel sets) of "Geen training". Daaronder de schemaregel (`insightScheduleText()` voor die ene dag) en de samenvatting:
  - plandag: "13 van 18 sets · −5 · +4 extra" (zelfde regels als de Training-kaart; "op schema" zonder tekort, "+N extra" alleen als N > 0);
  - vandaag zonder gelogde set: "Gepland: 18 sets" (geen tekort in de ochtend);
  - rustdag: "N sets · +N extra", zonder training "Geen sets gepland";
  - geen vergelijking (geen schema, doorlopend, geen week vastgelegd): "N sets · geen vergelijking met schema".
- **Rijen per spiergroep** (`insightDayTraining()`): één rij per primaire spiergroep die gepland stond of getraind is, in de volgorde van `MUSCLE_GROUPS`, dan één rij "Geen spiergroep" voor oefeningen zonder (bekende) primaire spiergroep. Vergelijken gaat met `insightCompareKey()`, dezelfde sleutel als de Training-kaart: per spiergroep, en zonder spiergroep per oefening. Per rij telt min(gepland, gedaan) als "van N"; daaronder het tekort (rood), "op schema" (groen) of "+N extra"; de rij Geen spiergroep kan zowel een tekort als extra hebben ("−1 · +2 extra"). Een spiergroep die niet gepland stond: "N sets" met "extra". Vandaag vóór de eerste set: "N sets" met "gepland". Zonder vergelijking: alleen "N sets".
  - Links per gedane oefening "Bench press · 4 sets · 2 failure · 1 partial · 1 forced · 1 dropset" (`insightExerciseLine()`, een kenmerk met 0 vervalt). Van een geplande spiergroep zonder gelogde set staat er "Gepland: [oefeningen]"; in de rij Geen spiergroep staan daar de geplande oefeningen zonder set.
  - **Telregels per set**: een set met drops (`isDropsetContinuation`, `workingSetGroups()`) is één set en één dropset; failure = RPE 10 op de set of op een van zijn drops; partial en forced volgen `extraType` (met extra reps) op de set of een van zijn drops.
- **Voeding**: "Nog geen voedingsschema".
- **Slaap invullen**: de kaart toont de duur ("6:30 u", onder 7:00 rood) met "00:20 – 06:50 · nacht van woensdag op donderdag"; tikken op de kaart opent het invulvenster. Niet ingevuld: "Nog niet ingevuld", "Nacht van woensdag op donderdag" en de knop Slaap invullen. Het venster heeft een eigen 24-uursklok (DESIGN_SYSTEM.md, "24-uursklok"; vervangt de tijdvelden van Android): slepen per 5 minuten of een tijd typen in het midden, met een live totaal, ook over middernacht. **Startstand** (`insightSleepStart()`): is de nacht al ingevuld, dan die tijden; anders de tijden van de laatste eerdere ingevulde nacht; is er nog nooit iets ingevuld, dan 23:00 tot 07:00. Opslaan slaat de tijden op die op de klok staan ("Slaap opgeslagen"); twee gelijke tijden = foutmelding, het venster blijft open. **Wissen**: alleen bij een nacht die al is ingevuld staat boven Annuleren en Opslaan de knop Wissen; die wist de nacht meteen (zonder bevestiging en zonder vinkje), sluit het venster en meldt "Slaap gewist". Annuleren met wijzigingen vraagt eerst "Wijzigingen negeren?".
- **Gewicht invullen**: de kaart toont "98,4 kg" (max. 2 decimalen) met "−0,4 kg t.o.v. woensdag": het verschil met de laatste eerdere dag met een gewicht (`insightWeightCompareText()`), bewust neutraal. Ligt die dag meer dan 6 dagen terug, dan de datum ("t.o.v. 14 oktober", met jaartal als dat anders is); zonder eerdere waarde vervalt de regel. Het venster heeft één veld (komma of punt, max. 2 decimalen tijdens het typen via `FIELD_DECIMALS`), toegestaan 20 tot en met 400 kg; leeg opslaan wist niet, maar geeft de rode melding "Vul een gewicht in". **Wissen**: alleen bij een dag met een gewicht staat de knop Wissen; die wist meteen, sluit het venster en meldt "Gewicht gewist" (hetzelfde patroon als bij slaap).
- Na opslaan of wissen is het scherm waarvandaan het venster is geopend (dagoverzicht of detailscherm) direct bijgewerkt (`renderInsightAfterEdit()`); het weekoverzicht tekent bij openen opnieuw (`SCREEN_ON_ENTER`). De vensters vullen een opgegeven datum in (`openInsightSleepSheet(datum)`, `openInsightWeightSheet(datum)`).

### De detailschermen Slaap en Gewicht (stap 4)
- **Eén scherm** `#screen-insight-metric` (`openInsightMetric('sleep' | 'weight')`, `renderInsightMetric()`), titel "Slaap" of "Gewicht", voor de week in `insightWeekStart`. Bladeren kan zoals in het weekoverzicht (vooruit tot en met de huidige week); de terugpijl en de terugknop van de telefoon brengen je naar het weekoverzicht op de week die je hier het laatst bekeek.
- **Samenvatting Slaap**: GEMIDDELD (gemiddelde duur, hele minuten), NAAR BED, OPGESTAAN, daaronder "Kortste nacht: vrijdag, 5:50 u · langste: zaterdag, 7:55 u" (bij gelijke duur de eerste). **Gemiddelde bedtijd** (`insightSleepWeek()`, `bedtimeAfterNoonMinutes()`): tijden van 00:00 tot 12:00 tellen als na middernacht (+24 uur), dus 23:50 en 00:30 geven 00:10 en niet 12:10. **Gemiddelde opsta-tijd** = gemiddelde bedtijd + gemiddelde duur, zodat de drie getallen altijd optellen.
- **Samenvatting Gewicht** (`insightWeightWeek()`): GEMIDDELD (1 decimaal), LAAGSTE en HOOGSTE (zoals ingevoerd, max. 2 decimalen), daaronder "−0,3 kg t.o.v. week 42" (dezelfde regel als de weekkaart, `insightWeightWeekCompareText()`, neutraal; vervalt zonder gewicht in de vorige week).
- **Niets ingevuld** in die week: in de samenvatting "Nog geen slaap ingevuld" / "Nog geen gewicht ingevuld", en geen grafiekkaart. De lijst blijft staan, zodat je kunt invullen.
- **Grafiek Slaap**: een staaf per nacht (duur), onder 7:00 rood; een dag zonder nacht houdt een lege plek. y-as vanaf 0 met 3 u · 6 u · 9 u, minstens tot 10 uur (bij een langere nacht schuift hij mee in stappen van 3 uur).
- **Grafiek Gewicht**: een lijn langs de ingevulde dagen (dagen zonder gewicht worden overgeslagen), één punt zonder lijn bij één dag. y-as (`insightWeightAxis()`): drie rasterlijnen op een ronde stap (0,5 · 1 · 2 · 2,5 · 5 × 10ⁿ, minstens 0,5 kg) rond een rond midden, de kleinste stap waarbij de buitenste lijnen alle waardes omsluiten; het bereik loopt een halve stap verder, dus geen punt raakt de rand en de as begint niet bij 0 (98,2–98,9 → 98 · 98,5 · 99).
- Beide grafieken: een stippellijn op het gemiddelde (de afgeronde waarde uit de samenvatting).
- **Lijst NACHTEN / WEEGMOMENTEN**: een rij per dag van maandag tot en met zondag, zonder dagen na vandaag. Tik op een rij opent het invulvenster (24-uursklok of gewicht) voor die dag; na opslaan of wissen zijn samenvatting, grafiek en lijst direct bijgewerkt.

### Rekenregels Training-kaart (`insightTrainingStats()`)
- **Welke dagen**: alle dagen van de week; **in de lopende week alleen tot en met vandaag**. **Vandaag** telt pas mee zodra er vandaag minstens één set is gelogd: vóór die eerste set tellen de geplande sets en de geplande training van vandaag niet mee (geen tekort in de ochtend). Vanaf morgen telt de dag gewoon mee als voorbije dag, ook zonder set. Dit geldt voor de sets uit je schema, het tekort, de extra sets en de telling van trainingen; de rode ring in Per dag stond vandaag al nooit.
- **Geplande sets**: per dag de sets van de plandag die volgens de schemaversie van die dag gepland stond (`version.days[].exercises[].sets`).
- **Gedane sets**: alle gelogde sets van die dagen, ook op rustdagen. **Een dropset (`isDropsetContinuation`) telt niet apart: hij hoort bij de set ervoor** (`countWorkingSets()`, dezelfde regel als de Samenvatting).
- **Vergelijken per primaire spiergroep** (`primaryMuscleGroup` van de oefening, via het oefening-id in `meta/exercise_info`, dus zoals die nu is ingesteld). Een oefening zonder primaire spiergroep wordt **per oefening-id** vergeleken. Zo telt een dumbbell press als vervanging van een geplande bench press als beide Borst zijn.
- **Maximum per spiergroep**: per spiergroep telt `min(gepland, gedaan)` als "uit je schema". **Extra** = alles boven het geplande aantal, plus alle sets van spiergroepen (of oefeningen) die niet gepland stonden. **Tekort** = gepland − uit je schema.
- **Trainingen**: "X van Y trainingen" telt alleen geplande trainingsdagen. Y = de getelde dagen waarop volgens de schemaversies een training gepland stond; X = die geplande dagen met minstens één gelogde set. Een training op een dag zonder geplande training (rustdag) telt niet mee in X; die dag krijgt wel het groene vinkje in Per dag en de sets tellen mee als extra.
- **Weergave**: "58 van 82 sets uit je schema", daaronder "4 van 5 trainingen · −24 · +6 extra" (tekort rood; geen tekort: "op schema" groen; "+N extra" alleen als N > 0). Aantallen vanaf 1000 met een punt als scheiding (`formatCount()`, alleen voor aantallen in Inzicht; `formatNumber()` blijft zonder).
- **Geen vergelijking** als geen enkele getelde dag een schema met vaste dagen of Week A/B had (geen schema, geen versie, of een doorlopend schema): "N sets" met "M trainingen · geen vergelijking met schema", waarbij M = het aantal dagen met minstens één gelogde set. De vergelijking voor doorlopende schema's volgt later.

### Rekenregels Slaap en Gewicht
- **Slaap**: gemiddelde duur van de ingevulde nachten van die week (afgerond op hele minuten): "6:48 u gemiddeld", met "Kortste nacht: vrijdag, 5:50 u" (bij gelijke duur de eerste). Niets ingevuld: "Nog geen slaap ingevuld".
- **Gewicht**: gemiddelde van de ingevulde dagen, 1 decimaal. "−0,3 kg t.o.v. week 42" = verschil tussen de afgeronde gemiddelden van deze en de vorige week, bewust neutraal (geen rood of groen); zonder gewicht in de vorige week vervalt die regel. Niets ingevuld: "Nog geen gewicht ingevuld".

### Migratie
- `migratePlanDays()` draait één keer per gebruiker bij het laden (vlag `meta/migrations.planDays`). Die geeft elke bestaande plandag een id en vult bij vaste-dagenplannen `day.weekday` in, eenmalig afgeleid uit de dagnaam zoals de app dat eerder deed (`weekdayFromDayName()`). Een dag waarvan de naam geen weekdag is, blijft zonder weekdag.

## Wat bewust is verwijderd
- **AI Camera** (MediaPipe pose detection, skeleton overlay, automatische rep-telling per oefeningstype, live coaching via Web Speech API)
- **Live Coach**-knop in de Fitness Tracker
- **Video opname bij sets**: "Record set"-optie, IndexedDB-opslag, Google Drive-upload/streaming, bijbehorende Google OAuth `drive.file`-scope
- **Copy Previous Workout**-tegel (kopieerde oefeningsnamen van de laatste workout met sets naar de huidige dag, zonder sets) — vervangen door de "AI Coach"-placeholdertegel
- Reden: persoonlijke app, deze features kostten meer onderhoud dan ze waarde opleverden
- Oude `videoId`/`idbKey` velden in bestaande Firestore-documenten zijn opgeschoond via `scripts/cleanup-video-fields.js` (eenmalig, met Firebase Admin SDK — zie het bestand zelf voor gebruiksinstructies)
- **Video/instructies exercise info** (lokale mp4's in `exercises/videos/`, spiergroepen/instructies uit de free-exercise-db dataset `dist/exercises.json` met fuzzy-name-matching) — vervangen door het handmatig invulbare exercise info bottom-sheet hierboven (spiergroep + apparaat-instellingen, eigen Firestore-veld, geen externe dataset)

---

## Volgende stappen
1. Chat Coach activeren (koppelen aan de globale AI Coach-balk)
2. Nutrition sectie bouwen
3. Inzicht verder bouwen (Maand en Jaar, detailschermen van Training en Voeding, vergelijking voor doorlopende schema's)

---

## Deploy workflow
```bash
cd C:\Users\bartp\projecten\ai-fitness-copilot
git add -A
git commit -m "Beschrijving van wijziging"
git push origin main
```
GitHub Pages deployt automatisch na elke push.

---

## Taal

- **De app is volledig Nederlands**: schermtitels, knoppen, labels, menu's, popups, toasts, foutmeldingen, lege staten, placeholders, aria-labels, `<html lang="nl">`, manifest.json en de AI-functies. Nieuwe schermen, teksten en AI-functies volgen deze regels.
- **Blijven Engels** (ook in Nederlandse zinnen: "5 reps", "Nieuw PR!", "Gevolgd door dropset"): reps, sets, RPE, dropset, PR, partial, forced, extra reps, warm-up, 1RM en de xRM-notatie (5RM, 8RM, "via 5RM"), One rep max, Workout, Fitness Tracker, AI Coach en de appnaam AI Fitness Co-Pilot. Ook oefeningnamen (Bench press, Deadlift, …) en de sjabloon-dagnamen Push, Pull, Legs, Upper en Lower. Categorie- en spiergroepnamen zijn Nederlands (Borst, Rug, Schouders, Armen, Benen, Buik, Bovenborst, Middenrug, Onderrug, Voorste/Zijkant/Achterste schouders, Onderarmen, Adductoren, Kuiten), behalve Cardio, Lats, Trapezius, Biceps, Triceps, Quadriceps, Hamstrings en Glutes. Die namen staan direct in `exercises.js` (`EXERCISE_CATEGORIES`, `MUSCLE_GROUPS`), zonder aparte vertaaltabel.
- **Datums** via één helper, `formatDateStr(str, format)` (nl-NL, weekdag met hoofdletter). Standaard overal: "Donderdag 22 oktober 2026". Uitzonderingen: dagnavigatie in de tracker "Vandaag" / "Gisteren", daarna de standaard (`'nav'`); maandkoppen in de kalender "Oktober 2026" (`'month'`); x-as van de Grafiek "6 okt" (`'axis'`); de gouden One rep max-kaart zonder weekdag, "22 oktober 2026 · via 5RM" (`'noWeekday'`); de datumregel van Inzicht "19–25 oktober 2026" (`formatDateRange()`, met `'dayMonth'` "26 oktober" als begin over twee maanden); de Ga naar-popup toont alleen de datum als titel; Samenvatting-titel "Samenvatting — Donderdag 22 oktober 2026". Weekdagkop kalender: Ma Di Wo Do Vr Za Zo. Een label dat in hoofdletters staat (`.section-label`, dagnavigatie) mag de datum in hoofdletters tonen; dat doet de CSS.
- **Woordenlijst (vaste vertalingen, overal gelijk):** Save → Opslaan · Cancel → Annuleren · Delete → Verwijderen (een opgeslagen waarde in een pop-up of invulvenster weghalen: Wissen, bv. een notitie, slaap of gewicht) · Close / Done / OK → Sluiten · een knop of vinkje die een bewerking afrondt → Klaar · Edit → Bewerken · Update → Bijwerken · Add → Toevoegen · Create → Aanmaken · Clear → Wissen · Reset → Resetten · Rename → Naam wijzigen / hernoemen · Duplicate → Dupliceren · Load → Laden · Skip → Overslaan · Continue → Doorgaan · Back → Terug · Go to → Ga naar · Search → Zoeken · Calculate → Berekenen · Generate → Maken ("Plan maken") · Previous / Next → Vorige / Volgende · Today / Yesterday → Vandaag / Gisteren · Not set / None / Yes → Niet ingesteld / Geen / Ja · Exercise → Oefening · Category → Categorie · Favorites → Favorieten (Favoriet maken / Uit favorieten) · Comment / Note → Notitie · Weight → Gewicht · Track / History / Graph (tabs) → Loggen / Geschiedenis / Grafiek · Recap → Samenvatting · Preset → Sjabloon · No data → Geen gegevens · No … yet → Nog geen … · Coming soon → Binnenkort beschikbaar · Sign in / Sign out → Inloggen / Uitloggen · Safety bar → Valbeugels.
- **Afgeleide sets (Grafiek)**: een afgeleide set is een set met meer reps dan gekozen, die meetelt voor een lager aantal reps (150 kg × 5 telt ook voor 3 of 4 reps). Vaste termen: de aan/uit-knop heet **Afgeleide sets**, de legenda toont **Exact** (set met precies het gekozen aantal reps) en **Afgeleid**, en het detailpaneel bij een afgeleid punt toont **"Afgeleid van N reps"** (N = reps van de bronset). Op het Records-scherm en de One rep max-kaart blijft de korte notatie "via 3RM" in de datumregel.
- **Sjablonen en AI-plannen verwijzen naar het oefening-id.** De sjablonen (`PLAN_PRESETS`) staan direct op id (bv. `bench-press`). De AI kent alleen namen: hij krijgt de exacte oefeningnamen en `aiPlanDaysToIds()` zet zijn antwoord om naar id's; een naam die niet in de lijst staat wordt weggelaten (en gelogd), nooit gegokt. De AI-planbuilder krijgt in de systeemprompt een taalinstructie (plannaam, dagnamen en uitleg in het Nederlands; oefeningnamen en de Engelse termen hierboven in het Engels; `AI_ENGLISH_TERMS` in app.js) en de volledige lijst oefeningnamen (`aiExerciseNameList()`), met de instructie om uitsluitend die exacte namen te gebruiken. De keuzechips tonen Nederlandse labels; hun `data-val` (die naar de prompt gaat) blijft Engels en eenduidig. Bij een API-fout verschijnt "Plan maken mislukt. Probeer het opnieuw."; het technische bericht gaat alleen naar de console.

## Belangrijke aandachtspunten
- **Dropsets tellen nooit mee voor PR's, records of progressie.** Een dropset is elke set die als dropset gemarkeerd is (`isDropsetContinuation`, de rij met het pijltje, `.drop-child` / `isDropChild()`); de zware set waar hij op volgt is een gewone set en telt gewoon mee. Eén regel in app.js, `countsForRecords(sets, i)`, die alle afleidingen gebruiken: de trofee in alle setlijsten (`getPRSetKeys`), de PR-melding bij opslaan, het Records-scherm en de records-historypopup (`getExerciseValidSets` → `getRepProgressions`), het PR-blok in de Recap en de Graph (`getExerciseRepSeries`, "derived"-punten, rep-bereik/standaard-reps via `getExerciseRepStats`). Dropsets blijven gewoon zichtbaar als gelogde sets. Nieuwe record-/progressieberekeningen gebruiken dezelfde functie. PR's worden niet opgeslagen maar altijd live uit de gelogde sets berekend (het oude Firestore-document `meta/records` wordt sinds commit 21e6c6f niet meer geschreven of voor weergave gelezen).
- **Decimaalregels bij het invoeren en bewerken van sets** (TRACK-tab, de enige plek waar sets worden ingevoerd of bewerkt; helpers `parseDecimal`/`parseWeight`/`formatWeight`/`parseWholeNumber`/`parseRpe` in app.js): **Weight** maximaal 2 decimalen (93,75 — sommige machines gaan in stappen van 1,25 kg), **RPE** maximaal 1 decimaal (8,5; daarnaast geldt de bestaande 6–10-in-stappen-van-0,5-check bij SAVE), **Reps** en **Extra reps** alleen hele getallen. **Extra reps maximaal 9** (`EXTRA_MAX`/`FIELD_MAX`): een getypt cijfer dat boven 9 uitkomt wordt geweigerd, een geplakte waarde wordt 9, en de + doet bij 9 niets meer. Reden: de RPE-kolom van de setrij (56px) is ingericht op één cijfer ("+9 partial"). Bestaande sets met een hogere waarde blijven ongewijzigd opgeslagen. Punt én komma tellen als decimaalteken. **Invoer wordt bij het typen geblokkeerd** (input-event, `restrictNumber()`/`FIELD_DECIMALS` in app.js; werkt ook bij plakken en bij Android-toetsenborden die toch een komma/punt tonen): een tweede decimaalteken wordt niet geaccepteerd, en ook geen derde cijfer na de komma/punt bij Weight ("93,756" typen geeft "93,75") of tweede bij RPE ("8,55" geeft "8,5"); bij Reps en Extra reps worden alleen cijfers geaccepteerd (komma/punt doen niets). Een geweigerde toetsaanslag verschijnt gewoon niet; bij plakken blijft het geldige deel staan. Als vangnet wordt bij het verlaten van het veld en bij SAVE nog genormaliseerd (afronden op 2 decimalen voor Weight, 1 voor RPE, heel getal voor Reps). Nooit overbodige nullen (150, niet 150,00). Toetsenbord: `inputmode="decimal"` voor Weight en RPE, `inputmode="numeric"` voor Reps en Extra reps. Stapgrootte −/+: Weight 2,5, Reps 1, Extra reps 1, RPE 0,5 (0 → 6). Nieuwe invoer voor sets gebruikt dezelfde helpers.
- **1RM-calculator: geschat 1RM en rep max-tabel op 1 decimaal.** Het geschatte 1RM en alle gewichten in de rep max-tabel worden wiskundig afgerond op 1 decimaal (half van nul af, `roundOrm()` in app.js: 164,06 → 164,1; 158,72 → 158,7), zonder overbodige ",0" (150, niet 150,0). De tabelgewichten worden berekend uit het onafgeronde 1RM, dus de rij met 1 rep is gelijk aan het getoonde 1RM. Er wordt **niet meer afgerond op stappen van 1,25 kg**. Het percentage blijft het berekende percentage en de formule (Epley) is ongewijzigd.
- **Eén gedeelde afrondfunctie: `roundTo(n, decimals)` in app.js.** Alle afronding op decimalen loopt hierdoor: `formatNumber()`/`formatWeight()` (weergave), `roundWeight()` en `round1()` (invoer van gewicht en RPE) en `roundOrm()` (1RM-calculator). Half van nul af, met een correctie op rekenruis: eerst `toPrecision(12)` (zodat een berekende helft als 118,7499999… als 118,75 telt en naar 118,8 gaat), daarna verschuiven van de komma in de tekstvorm in plaats van vermenigvuldigen (1,005 × 100 geeft anders 100,4999…). Afronden op hele getallen (reps, percentages, schijfeenheden) blijft gewoon `Math.round`.
- **Decimalen (invoer én weergave), altijd met een komma.** **Gewicht maximaal 2 decimalen** — sommige machines gaan in stappen van 1,25 kg, waardoor 93,75 kg voorkomt; ook schijven van 0,25 kg vallen hieronder. **RPE maximaal 1 decimaal**, andere getallen (percentages e.d.) ook maximaal 1. **Aantallen** (reps, extra reps, sets, herhalingen) altijd hele getallen. Weergave via één gedeelde functie `formatNumber(n, { weight })` in app.js: `formatWeight()` (= `weight: true`, 2 decimalen) voor elk gewicht — setrijen, Records, de records-popup, het Graph-detailpaneel, de Samenvatting, de calculatoruitkomsten en de schijfgewichten — en `formatRpe()`/`formatNumber()` (1 decimaal) voor de rest. Correct afgerond, geen scheidingsteken voor duizendtallen, nooit overbodige nullen ("93,75", "132,5", "150"). Ook de Graph-y-as volgt `formatNumber()` zonder overbodige nullen ("200", "152,5"); de vroegere vaste asnotatie met 1 decimaal (`fixed`) bestaat niet meer. De y-as gebruikt ronde stappen (1 · 2 · 2,5 · 5 × 10ⁿ, 4–6 rasterlijnen) met een extra stap marge als een punt binnen 5% van de rand ligt (`graphYAxis()`, zie DESIGN_SYSTEM.md). **Bij het typen** (ook plakken) accepteert elk gewichtsveld max. 2 decimalen (TRACK Gewicht, Plate-doelgewicht, 1RM-gewicht, Warm-up-werkgewicht), RPE max. 1 en elk aantal-veld alleen cijfers (TRACK Reps/Extra reps, 1RM-reps; plakken: alles vanaf de eerste komma/punt vervalt) — één gedeelde regel, `FIELD_DECIMALS`/`restrictNumber()`, met `WEIGHT_DECIMALS` = 2. Het setrij-gewichtsblok is 84px breed, zodat "232,25 kg" past. De Plate Calculator heeft geen invoervelden voor schijfgewichten (de voorraad gaat via aantallen) en toont geen los gewicht per kant, alleen de schijven per kant. Invoer accepteert komma én punt (`parseDecimal`); na het verlaten van een invoerveld staat de waarde er via `formatNumber()` — in de TRACK-tab én in de getalvelden van de Plate-, 1RM- en Warm-up Calculator (tekst die geen getal is blijft staan, zodat de foutmelding van de calculator verschijnt); opgeslagen data in Firestore blijven gewone getallen (JS-numbers met een punt). Eenheid altijd "kg", nooit "kgs".
- **Design system is verplicht**: nieuwe schermen en componenten gebruiken uitsluitend de variabelen uit `:root` in `style.css` (kleuren, `--fs-*`, `--radius-*`, `--card-shadow`, `--space-*`) en de basisklassen (`.toolbar` met pijl-terug, `.btn` + variant, `.pill`/`.badge`, `.card`/`.nav-card`, `.section-label`, de gedeelde input-stijl, de choice-controls). Geen hardcoded kleuren of inline stijlen, geen eigen knop-/kaartdefinities, geen font-weight 600. Een waarde die nog niet bestaat wordt eerst als token in `:root` (en zo nodig `[data-theme="dark"]`) toegevoegd en in `DESIGN_SYSTEM.md` beschreven
- PWA — na wijzigingen cache wissen of hard refreshen
- manifest.json heeft `"scope": "/ai-fitness-copilot/"` — nodig voor GitHub Pages
- Firebase compat SDK versie: 10.13.2
- Bij syntax errors: `node --check app.js`
- Anthropic API werkt niet vanuit alle browsercontexten door CORS-beperkingen — als de AI-generator in de Workout Plan Builder faalt, eerst dit checken
- **Android/browser back-knop**: `showScreen()` (app.js) is de centrale plek die zowel het zichtbare scherm wisselt als `history.pushState`/`popstate` bijhoudt, zodat de hardware terug-knop één scherm terugstapt i.p.v. de PWA te sluiten. Nieuwe schermovergangen die via een menu/kaart/actie vooruit navigeren, blijven gewoon `showScreen(id)` aanroepen; nieuwe "terug"-knoppen (een `<`-pijltje dat terugkeert naar het vorige scherm) moeten `goBack(fallbackId)` aanroepen in plaats van `showScreen(id)`, anders ontstaan dubbele history-entries.

---

## Contactinfo eigenaar
- GitHub: bartprinsai
- Firebase/Google account: bartprins2604@gmail.com

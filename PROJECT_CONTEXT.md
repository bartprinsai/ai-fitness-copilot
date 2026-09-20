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
├── exercises.js            # Lijst van oefeningen
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
let currentExercise = null;        // Huidige oefening naam
let currentDate = todayStr();      // Huidige datum (YYYY-MM-DD)
let db = { ... };                  // In-memory state: workouts, records, plans
```

---

## Belangrijke functies in app.js
```javascript
getWorkout(date)                   // Haal workout op voor datum
setWorkout(date, workout)          // Sla workout op in Firestore
renderSetList()                    // Herrender de set lijst
toast(message, {type, duration})    // Banner onder de header: type "success" (standaard, teal) | "error" (rood, 4s) | "pr" (goud)
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
- **Hoofdmenu** met 4 secties: Fitness Tracker, Workout Plan Builder, Nutrition (coming soon), Progress (coming soon)
- **Globale "AI Coach"-pil** zwevend onderaan op elk scherm behalve login/hoofdmenu (groen, sparkle-icoon, geen achtergrondbalk erachter) — scherm/logica nog niet gebouwd, klik-handler is een lege TODO in `app.js` (`btn-global-ai-coach`)
- **Workout Plan Builder** met presets (Push Pull Legs, Upper Lower), AI generator, koppeling aan Fitness Tracker
- **Multi-select modus** voor meerdere oefeningen tegelijk verwijderen
- **Drag-to-reorder** oefeningen in daglijst (ingedrukt houden → slepen)
- Leeg-workoutlog-scherm toont nu "Workout Log Empty" + "Start New Workout" (de losse "AI Coach"-tegel hier is vervallen — die functionaliteit zit nu in de globale AI Coach-pil hierboven)
- **"Start New Workout"** opent niet meer direct "All Exercises", maar eerst het **New Workout-tussenscherm** (`#screen-new-workout`) met drie kaarten: Manual Workout (→ All Exercises, werkt), Load Schedule Manually (TODO) en Load Schedule Automatically (TODO, toont via `getTodaysScheduledDayName()` welke plandag er volgens de bestaande plan-rotatielogica vandaag aan de beurt zou zijn)
- **Exercise info bottom-sheet** — per oefening: spiergroep (Primary/Secondary dropdown) en apparaat-instellingen (bench setting/height, oude/nieuwe cable height, hand/foot position). Bereikbaar via het ⓘ-icoon in de training-toolbar, tussen de trofee en het drie-puntjes-menu. View mode toont alleen ingevulde velden (leeg = lege staat met alleen Edit-knop); Edit mode heeft dropdowns voor spiergroep en losse velden voor apparaat-instellingen (leeg gelaten veld wordt niet opgeslagen). Data hoort bij de oefening zelf (net als favorite/hidden), opgeslagen in Firestore onder `meta/exercise_info`, keyed op oefeningnaam — migreert mee bij hernoemen, verwijderd bij delete
- **FitNotes-geïnspireerde** visuele stijl (lichtgrijs, cyaan accenten, witte kaarten)
- **Nieuw oefening aanmaken** scherm (NAME, CATEGORY, TYPE, WEIGHT UNIT — het NOTES-veld is verwijderd) — hetzelfde scherm dient ook als **Edit**-formulier voor élke oefening, ook ingebouwde (titel wisselt naar "Update Exercise"); onder TYPE staan een altijd zichtbare **MUSCLE GROUP**-sectie (Primary/Secondary) en een inklapbare **EQUIPMENT SETUP**-rij (standaard ingeklapt, ook als er al data is) met exact dezelfde velden als het exercise info-scherm — beide schermen delen dezelfde veld-definities/render/lees/schrijf-functies (`EXERCISE_INFO_FORMS` in app.js, id-prefix `info` vs `new-ex-info`) en dezelfde opslag (`meta/exercise_info`); het ✓ bovenin slaat alles in één keer op. categorie/type/dropdown-velden zijn onderlijnd (FitNotes-stijl), nieuwe categorie aanmaken gaat via een aparte "New Category"-modal
- **Edit/Delete/Favorite per oefening** via drie puntjes menu in de All Exercises-lijst — identiek voor ingebouwde én zelf toegevoegde oefeningen (Edit van een ingebouwde oefening zet 'm om in een custom-override; Delete van een ingebouwde oefening verbergt 'm via `db.hiddenBuiltins`, zie `DESIGN_SYSTEM.md`). Favorieten krijgen een blauw sterretje en verschijnen gebundeld in een automatische "Favorites"-categorie bovenaan. Delete cascadeert door alle gelogde workouts/records/favorieten voor die oefening
- **Gedeelde modal-stijl**: elke pop-up in de app (`.overlay`/`.overlay-panel`) heeft een blauwe titel en losse, afgeronde actieknoppen (geen bordered/segmented rij) — één centrale CSS-basisregel in `style.css`, zie `DESIGN_SYSTEM.md` sectie "Modals"
- **Edit/Delete categorieën** via drie puntjes menu
- **Selectie modus** met vinkje en vuilnisbak in toolbar bij ingedrukt houden
- **"Reset to default"** in het drie-puntjes-menu van de Fitness Tracker — tijdelijke knop (blijft staan tot de app verder af is) om alle Firestore-data van het account te wissen en de app terug te zetten naar de standaardstaat. Vereist het typen van "RESET" ter bevestiging. Zie `resetInProgress`/`openResetOverlay` in app.js voor de exacte paden die dit raakt.

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
3. Progress sectie bouwen

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

## Belangrijke aandachtspunten
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

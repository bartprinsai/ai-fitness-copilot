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
- **Exercise data**: free-exercise-db (GitHub, `dist/exercises.json`) voor spiergroepen en instructies, lokale mp4's in `exercises/videos/` voor animaties (nu: squat, bench press — niet elke oefening heeft er een)
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
├── exercises/videos/         # Lokale mp4-animaties per oefening
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
toast(message)                     // Toon een toast melding
openExerciseInfo(exerciseName)     // Open exercise info scherm (video + spieren + instructies)
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
- **Chat Coach**-knop in Fitness Tracker (scherm/logica nog niet gebouwd, toont "Coming soon!")
- **Workout Plan Builder** met presets (Push Pull Legs, Upper Lower), AI generator, koppeling aan Fitness Tracker
- **Multi-select modus** voor meerdere oefeningen tegelijk verwijderen
- **Drag-to-reorder** oefeningen in daglijst (ingedrukt houden → slepen)
- **"AI Coach"-tegel** naast "Start New Workout" in het lege-workoutlog-scherm (placeholder, linkt nog nergens naartoe — komt bij het bouwen van Chat Coach)
- **Exercise info scherm** (ⓘ bolletje bij elke oefening) — lokale video-animatie waar beschikbaar, spiergroepen en instructies uit free-exercise-db
- **FitNotes-geïnspireerde** visuele stijl (lichtgrijs, cyaan accenten, witte kaarten)
- **Dropdown** in All Exercises toolbar met plannen en "Create New Routine"
- **Nieuw oefening aanmaken** scherm (NAME, NOTES, CATEGORY, TYPE, WEIGHT UNIT)
- **Edit/Delete categorieën** via drie puntjes menu
- **Selectie modus** met vinkje en vuilnisbak in toolbar bij ingedrukt houden

## Wat bewust is verwijderd
- **AI Camera** (MediaPipe pose detection, skeleton overlay, automatische rep-telling per oefeningstype, live coaching via Web Speech API)
- **Live Coach**-knop in de Fitness Tracker
- **Video opname bij sets**: "Record set"-optie, IndexedDB-opslag, Google Drive-upload/streaming, bijbehorende Google OAuth `drive.file`-scope
- **Copy Previous Workout**-tegel (kopieerde oefeningsnamen van de laatste workout met sets naar de huidige dag, zonder sets) — vervangen door de "AI Coach"-placeholdertegel
- Reden: persoonlijke app, deze features kostten meer onderhoud dan ze waarde opleverden
- Oude `videoId`/`idbKey` velden in bestaande Firestore-documenten zijn opgeschoond via `scripts/cleanup-video-fields.js` (eenmalig, met Firebase Admin SDK — zie het bestand zelf voor gebruiksinstructies)

---

## Opgeloste bugs
### Exercise info pagina toonde "Animation not available" / "No muscle data" / "Could not load instructions"
- **Oorzaak**: verkeerde dataset-URL (`.../exercises/exercises.json` i.p.v. `.../dist/exercises.json`) en een CORS-blokkade op directe Anthropic API calls voor instructies vanuit GitHub Pages
- **Oplossing die uiteindelijk is gebouwd**: dataset-URL gefixt naar `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`; spiergroepen en instructies komen rechtstreeks uit die dataset (geen wger of Anthropic API nodig); animaties zijn overgestapt van een externe GIF-API naar lokaal gehoste mp4's in `exercises/videos/` (nog niet voor elke oefening aanwezig — valt dan terug op "Animation not available")

---

## Volgende stappen
1. Chat Coach activeren in Fitness Tracker
2. Nutrition sectie bouwen
3. Progress sectie bouwen
4. Meer lokale video-animaties toevoegen voor oefeningen die er nog geen hebben

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

---

## Contactinfo eigenaar
- GitHub: bartprinsai
- Firebase/Google account: bartprins2604@gmail.com

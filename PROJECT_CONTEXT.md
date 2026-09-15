# AI Fitness Co-Pilot — Project Context

## Wat is dit project?
Een fitness tracker PWA (Progressive Web App) waarmee je workouts bijhoudt: sets, reps en gewicht loggen, geschiedenis en grafieken bekijken, en workout plannen bouwen. Persoonlijke app, geen product voor extern publiek.

---

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Hosting**: GitHub Pages → https://bartprinsai.github.io/ai-fitness-copilot
- **Database**: Firebase Firestore (workout data per gebruiker)
- **Auth**: Firebase Authentication (Google login)
- **Exercise data**: free-exercise-db (GitHub) voor spiergroepen en instructies, lokale mp4's voor animaties (nog niet voor elke oefening beschikbaar)
- **AI (Workout Plan Builder)**: Anthropic API — rechtstreeks vanuit de browser (`anthropic-dangerous-direct-browser-access`), vereist een eigen API key in `app.js`
- **Repo**: https://github.com/bartprinsai/ai-fitness-copilot
- **Lokale map**: C:\Users\bartp\projecten\ai-fitness-copilot

---

## Projectstructuur
```
ai-fitness-copilot/
├── index.html              # Alle schermen en overlays
├── app.js                  # Alle logica (~2170 regels)
├── exercises.js            # Lijst van oefeningen
├── style.css                # Styling
├── manifest.json            # PWA manifest (start_url/scope: /ai-fitness-copilot/)
├── exercises/videos/         # Lokale mp4-animaties per oefening (nu: squat, bench press)
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
openExerciseInfo(name)             // Open exercise info scherm (video + spieren + instructies)
callClaude(userMessage, sysPrompt) // Anthropic API call voor de AI plan generator
```

---

## Wat al werkt
- Google login via Firebase Auth
- Workout data opslaan in Firestore per gebruiker
- Oefeningen bijhouden met sets, reps en gewicht
- Geschiedenis en grafieken, PR-detectie
- Rest timer
- Exercise info scherm — lokale video-animatie (waar beschikbaar), spiergroepen en instructies uit free-exercise-db
- Workout Plan Builder met presets, AI-generator (Anthropic API), koppeling aan Fitness Tracker
- PWA installeerbaar op telefoon

## Wat bewust is verwijderd
- **AI Camera** (MediaPipe pose detection, skeleton overlay, automatische rep-telling, live coaching via Web Speech API)
- **Live Coach**-knop
- **Video opname bij sets** (IndexedDB-opslag, Google Drive-upload/streaming, "Record set"-optie)
- Reden: persoonlijke app, deze features waren te veel onderhoud voor de waarde die ze opleverden. Zie git-historie (commit "Remove AI camera, live coach and video recording features") voor details.
- Oude `videoId`/`idbKey` velden zijn opgeschoond uit bestaande Firestore-documenten via `scripts/cleanup-video-fields.js`.

## Wat nog gebouwd moet worden
1. **Chat Coach** activeren — knop staat er, scherm/logica nog niet gebouwd (toont nu "Coming soon!")
2. Nutrition sectie
3. Progress sectie

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
- De app is een PWA — na wijzigingen moet de gebruiker de browser cache wissen of hard refreshen
- manifest.json heeft `"scope": "/ai-fitness-copilot/"` — dit is nodig voor GitHub Pages
- Firebase compat SDK versie: 10.13.2
- Bij syntax errors in app.js: `node --check app.js`
- Anthropic API werkt niet vanuit alle browsercontexten door CORS-beperkingen — als de AI-generator faalt, eerst dit checken

---

## Contactinfo eigenaar
- GitHub: bartprinsai
- Firebase/Google account: bartprins2604@gmail.com

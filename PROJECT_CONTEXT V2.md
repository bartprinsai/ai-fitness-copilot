# AI Fitness Co-Pilot — Project Context & Workflow

## Wat is dit project?
Een fitness tracker PWA (Progressive Web App) waarmee gebruikers workouts kunnen bijhouden, video's kunnen opnemen bij sets, en live AI coaching kunnen krijgen via pose detection.

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
- **Video opslag**: IndexedDB (lokaal, snel) + Google Drive (cloud, achtergrond upload)
- **Pose detection**: MediaPipe (gebouwd)
- **AI**: Anthropic API — **werkt NIET direct vanuit browser vanwege CORS** — alleen via proxy of alternatieve API's
- **Exercise data**: wger API (gratis, CORS-vriendelijk) voor instructies, GitHub free-exercise-db voor animaties
- **Repo**: https://github.com/bartprinsai/ai-fitness-copilot
- **Lokale map**: C:\Users\bartp\projecten\ai-fitness-copilot

---

## Projectstructuur
```
ai-fitness-copilot/
├── index.html       # Alle schermen en overlays
├── app.js           # Alle logica
├── exercises.js     # Lijst van oefeningen
├── style.css        # Styling
├── manifest.json    # PWA manifest (start_url/scope: /ai-fitness-copilot/)
├── icon-192.png
└── icon-512.png
```

---

## Firebase Config
- **Project ID**: ai-fitness-copilot
- **Project Number**: 41596366904

---

## Google OAuth
- **Client ID**: 41596366904-3h277tnkmavund1rc8l4rn3a5klu966k.apps.googleusercontent.com
- **Scope**: https://www.googleapis.com/auth/drive.file
- **Authorized origins**: https://bartprinsai.github.io

---

## Belangrijke variabelen in app.js
```javascript
let googleAccessToken = null;      // Drive access token
let driveFolderId = null;          // Drive folder ID
let pendingVideoSetIndex = null;   // Set index voor video upload
let currentExercise = null;        // Huidige oefening naam
let currentDate = todayStr();      // Huidige datum (YYYY-MM-DD)
let tokenClient = null;            // GIS token client
```

---

## Belangrijke functies in app.js
```javascript
getWorkout(date)                   // Haal workout op voor datum
setWorkout(date, workout)          // Sla workout op in Firestore
renderSetList()                    // Herrender de set lijst
toast(message)                     // Toon een toast melding
uploadToDrive(file, filename)      // Upload bestand naar Google Drive
openVideoFrame(videoId)            // Toon video van Drive
showVideoPopup(setIndex, videoId)  // Toon video popup menu
requestDriveToken(onSuccess)       // Vraag Drive token aan
openExerciseInfo(exerciseName)     // Open exercise info scherm
```

---

## Wat al werkt
- Google login via Firebase Auth
- Workout data opslaan in Firestore per gebruiker
- Oefeningen bijhouden met sets, reps en gewicht
- Geschiedenis en grafieken
- Video opnemen en uploaden naar Google Drive
- Video bekijken via streaming van Drive
- PWA installeerbaar op telefoon
- **Hoofdmenu** met 4 secties: Fitness Tracker, Workout Plan Builder, Nutrition (coming soon), Progress (coming soon)
- **AI Camera** met MediaPipe pose detection, rep teller, live coaching via Web Speech API
- **Live Coach** en **Chat Coach** knoppen in Fitness Tracker (Chat Coach nog niet actief)
- **Workout Plan Builder** met presets (Push Pull Legs, Upper Lower), AI generator, koppeling aan Fitness Tracker
- **Multi-select modus** voor meerdere oefeningen tegelijk verwijderen
- **Drag-to-reorder** oefeningen in daglijst (ingedrukt houden → slepen)
- **Copy Previous Workout** via kalender
- **Exercise info scherm** (ⓘ bolletje bij elke oefening) — animaties, spiergroepen, instructies
- **FitNotes-geïnspireerde** visuele stijl (lichtgrijs, cyaan accenten, witte kaarten)
- **Dropdown** in All Exercises toolbar met plannen en "Create New Routine"
- **Nieuw oefening aanmaken** scherm (NAME, NOTES, CATEGORY, TYPE, WEIGHT UNIT)
- **Edit/Delete categorieën** via drie puntjes menu
- **Selectie modus** met vinkje en vuilnisbak in toolbar bij ingedrukt houden

---

## Bekende bug — Exercise info pagina

### Symptomen
Als je op het ⓘ bolletje tikt bij een oefening:
- "Animation not available"
- "No muscle data available"
- "Could not load instructions"

### Oorzaken
1. **Dataset URL is 404** — verkeerde URL in de code:
   - Fout: `.../exercises/exercises.json`
   - Correct: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`

2. **Anthropic API CORS fout** — werkt niet direct vanuit GitHub Pages

### Fix prompt voor Claude Code
```
Fix de exercise info pagina in C:\Users\bartp\projecten\ai-fitness-copilot:

## 1. Fix GitHub dataset URL voor animaties en spiergroepen
Verander de URL naar:
https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json

## 2. Fix instructies via wger API
De Anthropic API werkt niet direct vanuit GitHub Pages vanwege CORS.
Gebruik de gratis wger API:

Zoek oefening op naam:
https://wger.de/api/v2/exercise/search/?term={naam}&language=english&format=json

Haal volledige info op:
https://wger.de/api/v2/exerciseinfo/{id}/?format=json

- Gebruik description als instructie tekst (strip HTML tags)
- Gebruik muscles en muscles_secondary voor spiergroepen
- Cache resultaten in memory per oefening
- Als niet gevonden: toon "Instructions not available for this exercise"

## 3. Laad GitHub dataset bij opstarten
Laad de dataset eenmalig bij opstarten en cache in memory.

Push daarna naar GitHub:
git add -A && git commit -m "Fix exercise info: correct dataset URL and use wger API" && git push origin main
```

---

## Volgende stappen na huidige bug fix
1. Chat Coach activeren in Fitness Tracker
2. Nutrition sectie bouwen
3. Progress sectie bouwen
4. Rep telling finetunen per oefening

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
- Google Drive API moet actief zijn in Google Cloud Console (project: ai-fitness-copilot)
- IndexedDB key formaat voor videos: `video_{date}_{exercise}_{setIndex}`
- Firebase compat SDK versie: 10.13.2
- Bij syntax errors: `node --input-type=module < app.js`
- **Anthropic API werkt NIET direct vanuit browser op GitHub Pages** — gebruik wger of andere CORS-vriendelijke API's

---

## Contactinfo eigenaar
- GitHub: bartprinsai
- Firebase/Google account: bartprins2604@gmail.com

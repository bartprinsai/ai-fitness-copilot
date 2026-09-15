# AI Fitness Co-Pilot — Project Context

## Wat is dit project?
Een fitness tracker PWA (Progressive Web App) waarmee gebruikers workouts kunnen bijhouden, video's kunnen opnemen bij sets, en live AI coaching kunnen krijgen via pose detection.

---

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Hosting**: GitHub Pages → https://bartprinsai.github.io/ai-fitness-copilot
- **Database**: Firebase Firestore (workout data per gebruiker)
- **Auth**: Firebase Authentication (Google login)
- **Video opslag**: IndexedDB (lokaal, snel) + Google Drive (cloud, achtergrond upload)
- **Pose detection**: MediaPipe (nog te bouwen)
- **Repo**: https://github.com/bartprinsai/ai-fitness-copilot
- **Lokale map**: C:\Users\bartp\projecten\ai-fitness-copilot

---

## Projectstructuur
```
ai-fitness-copilot/
├── index.html       # Alle schermen en overlays
├── app.js           # Alle logica (~1136 regels)
├── exercises.js     # Lijst van oefeningen
├── style.css        # Styling
├── manifest.json    # PWA manifest (start_url: /ai-fitness-copilot/)
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

---

## Wat nog gebouwd moet worden

### 1. AI Camera met pose detection (VOLGENDE STAP)
**Doel**: Gebruiker filmt zichzelf, app telt reps automatisch en geeft live coaching.

**Aanpak**:
- MediaPipe Pose via CDN voor skeleton tracking
- MediaRecorder voor gelijktijdige video opname
- Rep tellen via hoekberekening per oefening:
  - Squat/Deadlift: hoek bij heup en knie
  - Bicep curl: hoek bij elleboog
  - Shoulder press: hoek bij schouder
  - Fallback: ellebooghoek
- Live coaching tekst + Web Speech API voor audio
- Video opslaan in IndexedDB (direct beschikbaar)
- Achtergrond upload naar Google Drive
- Bij bekijken: eerst IndexedDB, dan Drive

**UI**:
- Nieuw fullscreen scherm: id="screen-ai-camera"
- Camerafeed + canvas overlay voor skeleton
- Grote rep teller onderin
- Coaching tekst
- Record/Stop knop
- Camera wissel knop (front/back)
- Sluit scherm → reps automatisch ingevuld in field-reps

**Toegang**: Via "Record set" in de video popup

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
- Google Drive API moet actief zijn in Google Cloud Console (project: ai-fitness-copilot)
- IndexedDB key formaat voor videos: `video_{date}_{exercise}_{setIndex}`
- Firebase compat SDK versie: 10.13.2
- Bij syntax errors in app.js: gebruik `node --input-type=module < app.js` om te checken

---

## Contactinfo eigenaar
- GitHub: bartprinsai
- Firebase/Google account: bartprins2604@gmail.com

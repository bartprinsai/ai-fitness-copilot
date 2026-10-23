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
todayStr()                         // "Vandaag" als 'YYYY-MM-DD' in Europe/Amsterdam (nooit UTC); rekenen met addDaysToDateStr()/weekdayOfDateStr()
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
- **Hoofdmenu** met 4 secties: Fitness Tracker, Workout Plan Builder, Nutrition (coming soon), Insight (coming soon)
- **Globale "AI Coach"-pil** zwevend onderaan op elk scherm behalve login/hoofdmenu (effen paars `--ai`, sparkle-icoon, geen achtergrondbalk erachter) — scherm/logica nog niet gebouwd, klik-handler is een lege TODO in `app.js` (`btn-global-ai-coach`)
- **Workout Plan Builder** met presets (Push Pull Legs, Upper Lower), AI generator, koppeling aan Fitness Tracker
- **Multi-select modus** voor meerdere oefeningen tegelijk verwijderen
- **Drag-to-reorder** oefeningen in daglijst (ingedrukt houden → slepen)
- Leeg-workoutlog-scherm toont nu "Workout Log Empty" + "Start New Workout" (de losse "AI Coach"-tegel hier is vervallen — die functionaliteit zit nu in de globale AI Coach-pil hierboven)
- **"Start New Workout"** opent niet meer direct "All Exercises", maar eerst het **New Workout-tussenscherm** (`#screen-new-workout`) met drie kaarten: Manual Workout (→ All Exercises, werkt), Load Schedule Manually (→ "Kies een plan" → "[Plan] — kies een dag" → laadt die dag in de dag die de Tracker toonde toen New Workout werd geopend; Automatically en de banner laden altijd in vandaag) en Load Schedule Automatically (bevestigingspop-up "Vandaag is [dag]" op basis van `getTodaysScheduledDay()`, dezelfde functie als de Smart Day Banner: "Geen vaste dagen" = sequentieel na de laatst geladen dag, "Vaste dagen" = de dag van de huidige weekdag, bij Week A/B binnen de actieve week, die wisselt zodra al haar dagen zijn afgewerkt óf een nieuwe kalenderweek (maandag t/m zondag) begint — wat het eerst komt (`activePlan.activeWeek`/`doneWeekdays`/`weekStart`, eerste keer Week A; na een wissel door afwerken telt de nieuwe week vanaf de volgende maandag); zonder actief plan of zonder dag voor vandaag een melding). Banner en beide opties laden via `loadPlanDayIntoWorkout()`: oefeningen krijgen de sets/reps uit het plan mee als `target` (getoond op de oefeningkaart, reps voorgevuld op het Track-tabblad)
- **Exercise info bottom-sheet** — per oefening: spiergroep (Primary/Secondary dropdown) en apparaat-instellingen (bench setting/height, oude/nieuwe cable height, hand/foot position). Bereikbaar via het ⓘ-icoon in de training-toolbar, tussen de trofee en het drie-puntjes-menu. View mode toont alleen ingevulde velden (leeg = lege staat met alleen Edit-knop); Edit mode heeft dropdowns voor spiergroep en losse velden voor apparaat-instellingen (leeg gelaten veld wordt niet opgeslagen). Data hoort bij de oefening zelf (net als favorite/hidden), opgeslagen in Firestore onder `meta/exercise_info`, keyed op oefeningnaam — migreert mee bij hernoemen, verwijderd bij delete
- **Uniform design system** voor de hele app (oorspronkelijk FitNotes-geïnspireerd): één set tokens in `:root` (kleuren, zes typografieniveaus, drie radiussen, één kaartschaduw, spacing-schaal) en gedeelde basisklassen (`.toolbar`, `.btn`, `.pill`, `.nav-card`, `.section-label`, één input-stijl). Licht thema standaard; licht/donker-schakelaar rechts in de toolbar van het hoofdmenu, keuze in `localStorage` (zonder keuze: systeeminstelling), gezet vóór de eerste paint door een inline script in `<head>`. Zie `DESIGN_SYSTEM.md`
- **Nieuw oefening aanmaken** scherm (NAME, CATEGORY, TYPE, WEIGHT UNIT — het NOTES-veld is verwijderd) — hetzelfde scherm dient ook als **Edit**-formulier voor élke oefening, ook ingebouwde (titel wisselt naar "Update Exercise"); onder TYPE staan een altijd zichtbare **MUSCLE GROUP**-sectie (Primary/Secondary) en een inklapbare **EQUIPMENT SETUP**-rij (standaard ingeklapt, ook als er al data is) met exact dezelfde velden als het exercise info-scherm — beide schermen delen dezelfde veld-definities/render/lees/schrijf-functies (`EXERCISE_INFO_FORMS` in app.js, id-prefix `info` vs `new-ex-info`) en dezelfde opslag (`meta/exercise_info`); het ✓ bovenin slaat alles in één keer op. categorie/type/dropdown-velden gebruiken de gedeelde omrande input-stijl, nieuwe categorie aanmaken gaat via een aparte "New Category"-modal
- **Edit/Delete/Favorite per oefening** via drie puntjes menu in de All Exercises-lijst — identiek voor ingebouwde én zelf toegevoegde oefeningen (Edit van een ingebouwde oefening zet 'm om in een custom-override; Delete van een ingebouwde oefening verbergt 'm via `db.hiddenBuiltins`, zie `DESIGN_SYSTEM.md`). Favorieten krijgen een blauw sterretje en verschijnen gebundeld in een automatische "Favorites"-categorie bovenaan. Delete cascadeert door alle gelogde workouts/records/favorieten voor die oefening
- **Gedeelde modal-stijl**: elke pop-up in de app (`.overlay`/`.overlay-panel`) heeft een blauwe titel en losse, afgeronde actieknoppen (geen bordered/segmented rij) — één centrale CSS-basisregel in `style.css`, zie `DESIGN_SYSTEM.md` sectie "Modals"
- **Edit/Delete categorieën** via drie puntjes menu
- **Selectie modus** met vinkje en vuilnisbak in toolbar bij ingedrukt houden
- **"Alles resetten"** in het drie-puntjes-menu van de Fitness Tracker (popup "Terugzetten naar standaard?") — tijdelijke knop (blijft staan tot de app verder af is) om alle Firestore-data van het account te wissen en de app terug te zetten naar de standaardstaat. Vereist het typen van "RESET" ter bevestiging. Zie `resetInProgress`/`openResetOverlay` in app.js voor de exacte paden die dit raakt.

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
3. Insight sectie bouwen

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
- **Blijven Engels** (ook in Nederlandse zinnen: "5 reps", "Nieuw PR!", "Gevolgd door dropset"): reps, sets, RPE, dropset, PR, partial, forced, extra reps, warm-up, 1RM en de xRM-notatie (5RM, 8RM, "via 5RM"), One rep max, Workout, Fitness Tracker, AI Coach en de appnaam AI Fitness Co-Pilot. Ook oefeningnamen (Bench press, Deadlift, …) en de sjabloon-dagnamen Push, Pull, Legs, Upper en Lower. Categorie- en spiergroepnamen zijn Nederlands (Borst, Rug, Schouders, Benen, Kuiten, Buikspieren, Bilspieren, Olympisch gewichtheffen), behalve Biceps, Triceps, Quadriceps, Hamstrings, Core en Cardio. Die namen staan direct in de dataset (`exercises.js`) en in `MUSCLE_OPTIONS`, zonder aparte vertaaltabel.
- **Datums** via één helper, `formatDateStr(str, format)` (nl-NL, weekdag met hoofdletter). Standaard overal: "Donderdag 22 oktober 2026". Uitzonderingen: dagnavigatie in de tracker "Vandaag" / "Gisteren", daarna de standaard (`'nav'`); maandkoppen in de kalender "Oktober 2026" (`'month'`); x-as van de Grafiek "6 okt" (`'axis'`); de gouden One rep max-kaart zonder weekdag, "22 oktober 2026 · via 5RM" (`'noWeekday'`); de Ga naar-popup toont alleen de datum als titel; Samenvatting-titel "Samenvatting — Donderdag 22 oktober 2026". Weekdagkop kalender: Ma Di Wo Do Vr Za Zo. Een label dat in hoofdletters staat (`.section-label`, dagnavigatie) mag de datum in hoofdletters tonen; dat doet de CSS.
- **Woordenlijst (vaste vertalingen, overal gelijk):** Save → Opslaan · Cancel → Annuleren · Delete → Verwijderen (alleen in de 3-knoppen-Notitiepopup: Wissen) · Close / Done / OK → Sluiten · een knop of vinkje die een bewerking afrondt → Klaar · Edit → Bewerken · Update → Bijwerken · Add → Toevoegen · Create → Aanmaken · Clear → Wissen · Reset → Resetten · Rename → Naam wijzigen / hernoemen · Duplicate → Dupliceren · Load → Laden · Skip → Overslaan · Continue → Doorgaan · Back → Terug · Go to → Ga naar · Search → Zoeken · Calculate → Berekenen · Generate → Maken ("Plan maken") · Previous / Next → Vorige / Volgende · Today / Yesterday → Vandaag / Gisteren · Not set / None / Yes → Niet ingesteld / Geen / Ja · Exercise → Oefening · Category → Categorie · Favorites → Favorieten (Favoriet maken / Uit favorieten) · Comment / Note → Notitie · Weight → Gewicht · Track / History / Graph (tabs) → Loggen / Geschiedenis / Grafiek · Recap → Samenvatting · Preset → Sjabloon · No data → Geen gegevens · No … yet → Nog geen … · Coming soon → Binnenkort beschikbaar · Sign in / Sign out → Inloggen / Uitloggen · Safety bar → Valbeugels.
- **Sjablonen en AI-plannen gebruiken exact de oefeningnamen uit de dataset** (bv. "Bench press", "Pull-ups", "Military press (barbell)"), zodat ze aan dezelfde oefening en geschiedenis gekoppeld zijn. De AI-planbuilder krijgt in de systeemprompt een taalinstructie (plannaam, dagnamen en uitleg in het Nederlands; oefeningnamen en de Engelse termen hierboven in het Engels; `AI_ENGLISH_TERMS` in app.js) en de volledige lijst oefeningnamen (`aiExerciseNameList()`), met de instructie om uitsluitend die exacte namen te gebruiken. De keuzechips tonen Nederlandse labels; hun `data-val` (die naar de prompt gaat) blijft Engels en eenduidig. Bij een API-fout verschijnt "Plan maken mislukt. Probeer het opnieuw."; het technische bericht gaat alleen naar de console.

## Belangrijke aandachtspunten
- **Dropsets tellen nooit mee voor PR's, records of progressie.** Een dropset is elke set die als dropset gemarkeerd is (`isDropsetContinuation`, de rij met het pijltje, `.drop-child` / `isDropChild()`); de zware set waar hij op volgt is een gewone set en telt gewoon mee. Eén regel in app.js, `countsForRecords(sets, i)`, die alle afleidingen gebruiken: de trofee in alle setlijsten (`getPRSetKeys`), de PR-melding bij opslaan, het Records-scherm en de records-historypopup (`getExerciseValidSets` → `getRepProgressions`), het PR-blok in de Recap en de Graph (`getExerciseRepSeries`, "derived"-punten, rep-bereik/standaard-reps via `getExerciseRepStats`). Dropsets blijven gewoon zichtbaar als gelogde sets. Nieuwe record-/progressieberekeningen gebruiken dezelfde functie. PR's worden niet opgeslagen maar altijd live uit de gelogde sets berekend (het oude Firestore-document `meta/records` wordt sinds commit 21e6c6f niet meer geschreven of voor weergave gelezen).
- **Decimaalregels bij het invoeren en bewerken van sets** (TRACK-tab, de enige plek waar sets worden ingevoerd of bewerkt; helpers `parseDecimal`/`parseWeight`/`formatWeight`/`parseWholeNumber`/`parseRpe` in app.js): **Weight** maximaal 2 decimalen (93,75 — sommige machines gaan in stappen van 1,25 kg), **RPE** maximaal 1 decimaal (8,5; daarnaast geldt de bestaande 6–10-in-stappen-van-0,5-check bij SAVE), **Reps** en **Extra reps** alleen hele getallen. **Extra reps maximaal 9** (`EXTRA_MAX`/`FIELD_MAX`): een getypt cijfer dat boven 9 uitkomt wordt geweigerd, een geplakte waarde wordt 9, en de + doet bij 9 niets meer. Reden: de RPE-kolom van de setrij (56px) is ingericht op één cijfer ("+9 partial"). Bestaande sets met een hogere waarde blijven ongewijzigd opgeslagen. Punt én komma tellen als decimaalteken. **Invoer wordt bij het typen geblokkeerd** (input-event, `restrictNumber()`/`FIELD_DECIMALS` in app.js; werkt ook bij plakken en bij Android-toetsenborden die toch een komma/punt tonen): een tweede decimaalteken wordt niet geaccepteerd, en ook geen derde cijfer na de komma/punt bij Weight ("93,756" typen geeft "93,75") of tweede bij RPE ("8,55" geeft "8,5"); bij Reps en Extra reps worden alleen cijfers geaccepteerd (komma/punt doen niets). Een geweigerde toetsaanslag verschijnt gewoon niet; bij plakken blijft het geldige deel staan. Als vangnet wordt bij het verlaten van het veld en bij SAVE nog genormaliseerd (afronden op 2 decimalen voor Weight, 1 voor RPE, heel getal voor Reps). Nooit overbodige nullen (150, niet 150,00). Toetsenbord: `inputmode="decimal"` voor Weight en RPE, `inputmode="numeric"` voor Reps en Extra reps. Stapgrootte −/+: Weight 2,5, Reps 1, Extra reps 1, RPE 0,5 (0 → 6). Nieuwe invoer voor sets gebruikt dezelfde helpers.
- **1RM-calculator: geschat 1RM en rep max-tabel op 1 decimaal.** Het geschatte 1RM en alle gewichten in de rep max-tabel worden wiskundig afgerond op 1 decimaal (half van nul af, `roundOrm()` in app.js: 164,06 → 164,1; 158,72 → 158,7), zonder overbodige ",0" (150, niet 150,0). De tabelgewichten worden berekend uit het onafgeronde 1RM, dus de rij met 1 rep is gelijk aan het getoonde 1RM. Er wordt **niet meer afgerond op stappen van 1,25 kg**. Het percentage blijft het berekende percentage en de formule (Epley) is ongewijzigd.
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

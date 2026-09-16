# AI Fitness Co-Pilot — Design System

Dit bestand documenteert de visuele stijl zoals die daadwerkelijk in `style.css` / `index.html` is geïmplementeerd. Het is geen los ontwerp-ideaal maar een weerslag van de huidige app — bij elke visuele wijziging (nieuwe screenshot-referentie, nieuwe kleur, nieuw component) dit bestand meteen bijwerken zodat het blijft kloppen.

Stijl-inspiratie: **FitNotes** (Android app) — lichtgrijze achtergrond, cyaan accentkleur, witte kaarten/rijen, donkere toolbar.

---

## Kleuren (`:root` custom properties in `style.css`)

| Token | Waarde | Gebruik |
|---|---|---|
| `--toolbar` | `#212121` | Toolbar- en tab-balk achtergrond (bijna zwart) |
| `--daynav` | `#303030` | Dag-navigatiebalk op het Home-scherm |
| `--cyan` | `#29b6f6` | Accentkleur: actieve tab-underline, cyan-lijn onder veld-labels, PR-trofee-icoon, actieve tijd-filter, grafieklijn |
| `--cyan-light` | `rgba(41,182,246,0.12)` | Achtergrond van geselecteerde/actieve rijen en filters |
| `--bg` | `#f2f2f2` | Algemene schermachtergrond |
| `--surface` | `#ffffff` | Kaarten, rijen, velden-sectie |
| `--border` | `#e0e0e0` | Scheidingslijnen, invoerveld-onderlijn |
| `--text-primary` | `#212121` | Hoofdtekst |
| `--text-secondary` | `#757575` | Labels, eenheden (kgs/reps), subtitels |
| `--text-hint` | `#9e9e9e` | Placeholder-achtige/hint-tekst |
| `--green` | `#4CAF50` | SAVE-knop |
| `--blue-btn` | `#2196f3` | CLEAR-knop |
| `--gray-btn` | `#e0e0e0` | Stepper-knoppen (−/+) |
| `--color-ai-coach-accent` | `#22c55e` | Basis/referentie-groen voor AI-gedreven features. Bewust een ander groen dan `--green` (dat is de bestaande SAVE-knopkleur) — dit is de eerste kleur van een groeiende "AI-feature"-accentfamilie, te onderscheiden van de FitNotes-cyaan die voor kernfunctionaliteit (loggen, tracken) blijft staan. |
| `--color-ai-coach-gradient-start` | `#4ade80` | Lichtste stop van de groene gradient op de AI Coach-pil (135°, samen met `--color-ai-coach-gradient-end`). |
| `--color-ai-coach-gradient-end` | `#16a34a` | Donkerste stop van de groene gradient op de AI Coach-pil. |
| `--color-ai-coach-glow` | `rgba(34,197,94,0.35)` | Zachte groene gloed-schaduw rond de AI Coach-pil (`box-shadow`). |

## Typografie

- Font: `Roboto, sans-serif`, basis `16px` op `html/body`.
- Toolbar-titel: `18px / 500`.
- Tab-labels (TRACK/HISTORY/GRAPH): `13px / 700`, uppercase, letter-spacing `.08em`.
- Veld-labels (bv. "WEIGHT (kgs)"): `11px / 700`, letter-spacing `.1em`, **niet** geforceerd uppercase via CSS — de casing staat letterlijk in de HTML-tekst (zo kan "(kgs)" bewust lowercase blijven terwijl "WEIGHT" caps is).
- Grote invoerwaarde (gewicht/reps in TRACK-tab): `42px / 600`, gecentreerd, met een dunne `1px solid var(--border)` onderlijn (Android-EditText-achtig hairline-effect).
- Set-lijst: setnummer `15px/700`, waarde (gewicht/reps) `18px/700` + eenheid ernaast in `13px`, kleur `--text-secondary` (bv. "90.0" groot+zwart, "kgs" klein+grijs ernaast).

## Iconen

Basisregel, geldig op **elke** toolbar in de app: `.toolbar-btn svg { fill: white; }` — alle header-iconen zijn wit op de donkere toolbar-achtergrond (`--toolbar`), ongeacht welk scherm. Dit is een globale default in `style.css` en moet dat blijven; een icoon dat lokaal een andere fill/stroke nodig heeft, krijgt een eigen klasse die de default overschrijft (nooit de globale regel zelf verwijderen — daarmee vallen alle toolbar-iconen impliciet terug op SVG-default-zwart, wat op een donkere balk onleesbaar is).

- `.icon-outline` — `fill: none; stroke: white; stroke-width: 1.8;` — lijnstijl-override, alleen gebruikt voor de rest-timer (klok), records (trofee) en info-iconen in de training-toolbar, ter referentie aan de FitNotes-screenshot (dunne witte outline-iconen op de donkere toolbar). Elders in de app blijven toolbar-iconen gewoon gevuld (de default).
- PR-trofee-icoon (los van de toolbar, gebruikt in set-rijen/history/kalender-popup/records-overlay/dagoverzicht) is altijd een gevulde `--cyan` trofee (`.set-pr-icon` / `.history-set-pr` / `.exercise-set-pr` / records-lijst), consistent op elke plek waar een PR getoond wordt. **Bugfix**: dit icoon gebruikte overal in de app per ongeluk het SVG-pad van een 5-puntige ster (`M12 1L9 9H1l6.5 4.7L5 21l7-5 7 5-2.5-7.3L23 9h-8z`, sinds de allereerste versie van de app) in plaats van een echte trofee — verholpen door dat ene gedeelde pad overal te vervangen door het Material "emoji_events"-trofeepad (`M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94...`), dezelfde vorm als het (outline) trofee-icoon dat al op de records-knop in de training-toolbar stond.
- AI-features gebruiken een sparkle/sterren-icoon (Material Icons "auto_awesome"-pad), wit gevuld op de groene gradient-pil van de globale AI Coach-pil (zie hieronder) — dit is het te herhalen icoon-patroon voor toekomstige AI-features (bv. straks de Chat Coach zelf).

## Globale layout-elementen

Elementen die **niet** binnen een los `.screen`-blok staan maar als eigen `<body>`-kind na alle schermen in `index.html` staan, en daardoor automatisch op elk scherm zichtbaar zijn zonder dat een nieuw scherm er zelf iets voor hoeft te doen:

**Zwevende-pil-patroon (geen achtergrondbalk, geen gereserveerde kleurstrook).** Beide onderstaande elementen tonen alleen de pil-knop(pen) zelf, `position: fixed` en gecentreerd. De wrapper-`<div>` van elke pil-rij (`#global-ai-bar`, `#day-actions-row`) heeft **geen enkele `background`-declaratie** (dus volledig transparant) en is zelf `pointer-events: none` — alleen de pil-knop(pen) zelf hebben een achtergrond en zijn `pointer-events: auto`. Geverifieerd met een headless Playwright-render (`elementFromPoint` vlak naast beide pillen geeft `.home-content`/`.cal-scroll` terug met `background-color: rgba(0,0,0,0)`, geen apart wrapper-element) — zie ook de screenshots die bij deze wijziging zijn gemaakt.
  - **`.screen` reserveert zelf géén ruimte meer** (gewoon `position: fixed; inset: 0`, volle hoogte, geen `padding-bottom`). In plaats daarvan krijgt de **daadwerkelijke scrollbare content van elk scherm** (bv. `.home-content`, `.cal-scroll`, `.set-list`, `.history-content`, `.exercise-list`, `.plan-list-scroll`, `.plan-detail-scroll`, `.ai-gen-form`, `.pde-list`, `.new-ex-scroll`, `.ei-scroll`) een `padding-bottom: var(--ai-bar-space)` (of meer, samengesteld met de eigen bestaande padding) — dit is scroll-padding **binnen** de lijst zelf, geen los schermbreed vlak. Het effect: content scrollt echt door tot de fysieke onderrand van het scherm (zichtbaar en deels verborgen achter de pil terwijl je scrollt, precies zoals bij een normale `position: fixed` bottom-nav over scrollende content), met aan het einde van de lijst nog net genoeg lucht om het allerlaatste kaartje volledig tevoorschijn te scrollen.
  - **Niet-scrollbare, interactieve bodembalken** (die zelf geen lijst zijn, dus niets om "onderdoor te scrollen") krijgen in plaats daarvan een `margin-bottom: var(--ai-bar-space)` op de balk zelf, zodat de knoppen erin nooit permanent achter een pil verstopt zitten: `.cal-footer` (vorige/volgende workout in de Calendar) en `.lw-footer` (bevestig-knop op het Load Workout-scherm). Hun eigen achtergrondkleur (`--daynav` resp. `--surface`) blijft gewoon zichtbaar tot aan hun eigen rand, met de pil er los overheen.

- **Globale AI Coach-pil** (`#global-ai-bar` = de positionerings-wrapper, knop `.global-ai-bar-pill` / `#btn-global-ai-coach`) — zwevend onderaan de viewport, boven de Android-systeembalk (`padding-bottom: calc(var(--safe-bottom) + 16px)`). Groene 135°-gradient-achtergrond (`linear-gradient(135deg, var(--color-ai-coach-gradient-start), var(--color-ai-coach-gradient-end))`), `border-radius: 22px`, en een gecombineerde schaduw voor diepte + accent: `box-shadow: 0 4px 14px rgba(0,0,0,.25), 0 3px 10px var(--color-ai-coach-glow)` (een neutrale donkere schaduw voor het zwevende effect, plus de groene gloed erbovenop). Sparkle-icoon en "AI Coach"-tekst zijn beide wit (`#fff`) en bold.
  - Klik-gedrag is voorlopig een lege handler met `// TODO: link to the Chat Coach screen once it's built` in `app.js` — de echte Chat Coach-koppeling volgt later.
  - Clearance-hoogte via `--ai-bar-height` (64px) en `--ai-bar-space` (`--ai-bar-height` + `--safe-bottom`) — deze tokens heten nog naar de oude balk-implementatie maar betekenen nu "hoeveel scroll-cushion een lijst nodig heeft om onder de pil uit te komen". **Een nieuw scherm met een scrollbare lijst moet zelf `padding-bottom: var(--ai-bar-space)` (of meer) op die lijst zetten** — dit gebeurt niet meer automatisch via `.screen` (dat zou weer een lege gereserveerde strook teruggeven, precies het probleem dat hier is opgelost). Een niet-scrollbare bodembalk met interactieve knoppen gebruikt in plaats daarvan `margin-bottom: var(--ai-bar-space)` op zichzelf (zie de twee voorbeelden hieronder).
  - Uitzonderingen — schermen waar de pil **niet** hoort: `#screen-login` (vóór inloggen — een AI-coach-call-to-action heeft geen zin vóór authenticatie) en `#screen-home` (het hoofdmenu/hub-scherm met de 4 kaarten). Beide krijgen `padding-bottom: 0` (volledige hoogte, geen ruimte gereserveerd) en verbergen de pil zelf via de CSS-sibling-selector `#screen-login.active ~ .global-ai-bar, #screen-home.active ~ .global-ai-bar { display: none; }`.
  - Bottom-sheet overlays (`.overlay`, z-index 100) en het overflow-dropdownmenu (`.dropdown-menu`, `.exd-overlay`, z-index 150) liggen boven de pil (`.global-ai-bar` heeft z-index 60) en dekken 'm dus tijdelijk af zolang ze open staan — bewust, want dat zijn modale lagen.
  - Was voorheen twee losse, schermgebonden implementaties (de "Chat Coach"-knop op het exercise-logging scherm en de "AI Coach"-tegel op het lege Fitness Tracker-startscherm, beide verwijderd) — vervangen door dit ene globale element; voeg geen nieuwe schermgebonden "coach"-knoppen meer toe.
- **Dag-acties-pillen** (`#day-actions-row` = de positionerings-wrapper, "Recap" + "Comment", `.day-action-pill`) — zelfde zwevende-pil-patroon (transparante wrapper, alleen de pillen zelf hebben achtergrond/schaduw), maar **niet écht globaal**: enkel zichtbaar wanneer `#screen-fitness-tracker` zowel `.active` als `.has-day-actions` heeft (CSS-sibling-selector `#screen-fitness-tracker.active.has-day-actions ~ .day-actions-row`). `.has-day-actions` wordt in `renderHome()` (app.js) gezet zodra de huidige dag oefeningen bevat, en verwijderd in de lege-staat. Wit/rand-stijl (`border: 1px solid var(--border)`, `background: var(--surface)`) met een neutrale schaduw (`box-shadow: 0 3px 10px rgba(0,0,0,.15)`) — bewust géén groene gradient, zodat 'm nooit met de AI Coach-pil verward wordt. Zweeft met `bottom: var(--ai-bar-space)` — dus direct boven de zone van de AI Coach-pil. Hoogte-cushion via `--day-actions-height` (56px): wanneer deze pillen zichtbaar zijn, krijgt specifiek `.home-content` (niet `.screen` zelf) extra scroll-padding: `#screen-fitness-tracker.has-day-actions .home-content { padding-bottom: calc(var(--ai-bar-space) + var(--day-actions-height) + 16px); }`. Een volgend scherm dat een eigen extra pil-rij nodig heeft, volgt dit patroon: eigen `.has-*`-klasse op het scherm + een descendant-selector die de padding op de eigen scrollbare lijst verhoogt, nooit op `.screen` zelf.
  - "Recap": voorlopig een lege handler met `// TODO: recap-functionaliteit volgt later` in `app.js`.
  - "Comment": opent de Comment-popup (zie hieronder) gekoppeld aan de hele dag-sessie i.p.v. aan één set.

## Exercise-logging scherm (`#screen-training`) — referentie-implementatie

Dit scherm (geopend via `openTraining(name)`, TRACK/HISTORY/GRAPH tabs) is het canonieke voorbeeld van bovenstaande tokens in de praktijk:

- Toolbar: exercise-naam + 4 acties rechts (timer, records, info, overflow), donkere achtergrond, outline-iconen zoals hierboven.
- Tab-balk direct eronder: 3 tabs, actieve tab cyan tekst + cyan underline (`border-bottom: 2px solid var(--cyan)`).
- **WEIGHT (kgs)** en **REPS** secties: label + dunne cyan-lijn (`.field-cyan-line`, 2px) + rij met −/waarde/+ (grijze vierkante stepper-knoppen, grote onderlijnde waarde in het midden).
- **SAVE** (groen, `--green`) en **CLEAR** (blauw, `--blue-btn`) knoppen naast elkaar, volle breedte, uppercase tekst.
- Set-lijst eronder: **geen kolomkop-rij** (bewust weggelaten om exact met de FitNotes-referentie te matchen) — elke rij toont: notitie-icoon (spraakbubbel, grijs — cyaan gevuld zodra er een notitie op die set staat) → PR-trofee-slot (alleen gevuld bij PR) → volgnummer → gewicht+eenheid → reps+eenheid. Het verwijder-icoon (prullenbak) is **niet standaard zichtbaar**; het verschijnt pas als extra kolom zodra een rij geselecteerd is (tap op de rij) — dit is een bewuste afwijking van de screenshot om de bestaande delete-functionaliteit te behouden zonder de rij standaard drukker te maken dan de referentie.
- Per-set notitie: opgeslagen als optioneel `note`-veld op het set-object in Firestore (`users/{uid}/workouts/{date}` → `exercises[].sets[].note`), bewerkbaar via een bottom-sheet overlay (`#set-note-overlay`) die opent via het notitie-icoon.
- Records-knop (trofee in de toolbar) opent een overlay (`#records-overlay`) met de PR-tabel van de huidige oefening (per repcount de beste gewicht-waarde uit `db.records`), i.p.v. de vroegere "Records coming soon"-placeholder.
- HISTORY- en GRAPH-tab: styling ongewijzigd t.o.v. wat er al was (matchte al met de FitNotes-referentie); onderliggende data-logica (`renderHistoryTab`, `renderGraph`) is niet aangeraakt.

## Fitness Tracker startscherm (`#screen-fitness-tracker`) — begin van een eigen visuele identiteit

Dit scherm (het datum-navigatie-scherm dat opent na "Fitness Tracker") is het **eerste scherm dat bewust afwijkt** van de FitNotes-referentiestijl hierboven. Toekomstige schermen mogen hierop voortbouwen; de trainingsscreen-sectie hierboven blijft het FitNotes-getrouwe referentiepunt, dit is het startpunt van de eigen richting:

- **Geen groet-balkje meer onder de header.** Het vroegere `#user-bar`-element ("Hi, [naam]") is volledig verwijderd (uit `index.html`, `style.css` én de `updateUserBar()`-functie in `app.js`) — niet alleen leeggemaakt, ook de ruimte die het innam is weg. Reden: voegde geen functionele waarde toe en oogde als restant uit een eerdere iteratie.
- **Geen losse "AI Coach"-tegel meer op dit scherm.** Die is verwijderd (zowel in de lege als de gevulde workoutlog-staat — de gevulde staat had er sowieso nooit een) en vervangen door de globale AI Coach-pil (zie "Globale layout-elementen" hierboven), die nu overal in de app staat in plaats van hier lokaal.
- **Lege-workoutlog-staat**: "Start New Workout" staat dicht bij de onderkant van het scherm — `.home-empty-action { margin-bottom: var(--ai-bar-space) }` (niet scrollbaar, dus zelfde `margin-bottom`-aanpak als de niet-scrollbare bodembalken hierboven) zodat de knop vlak boven de zone zit waar de AI Coach-pil zweeft, zonder overlap. "Workout Log Empty" is verticaal gecentreerd, maar **niet over het hele scherm** — een eigen wrapper (`.home-empty-title-wrap { flex: 1; display:flex; align-items:center; justify-content:center }`) centreert 'm alleen binnen de ruimte tussen de dag-navigatiebalk bovenaan en de bovenkant van de "Start New Workout"-knop. Bewust géén gecentreerde groep meer — de twee elementen staan onafhankelijk hoog/laag in `.home-empty` (flex column, titel-wrapper neemt de resterende ruimte, knop volgt daarna in de flow).
- "Start New Workout" blijft cyaan (de hoofdkleur), zoals de rest van de kernfunctionaliteit.

Volgende schermen die aan deze eigen identiteit meebouwen: volg hetzelfde patroon — witte toolbar-iconen blijven de vaste basis (zie Iconen hierboven), maar layout/spacing/accentkleuren mogen per scherm bewust van de FitNotes-referentie afwijken zodra dat expliciet gevraagd wordt.

## Fitness Tracker dagoverzicht (gevulde workout-staat) — grote cijfers, PR-logica, comments

Wanneer de huidige dag al gelogde oefeningen heeft (bv. via "Yesterday" navigeren naar een dag met workouts), toont `#screen-fitness-tracker` een lijst `.exercise-card`s met daarin de gelogde sets. Dit is een apart visueel patroon van het exercise-logging scherm (`#screen-training`) hierboven — niet hetzelfde component, bewust een compactere kaart-weergave:

- **Grote, dikgedrukte cijfers**: elke set-rij (`.exercise-set-row`) is een CSS-grid met vaste kolommen (`20px 16px 1fr 1fr`) zodat gewicht- en reps-kolom altijd nette, rechts-uitgelijnde kolommen vormen over alle rijen heen. Waarde groot+bold (`.exercise-set-val`, `20px/700`), eenheid klein+grijs ernaast (`.exercise-set-unit`, `12px`, `--text-secondary`) — bv. **"90.0" `kgs`**, **"10" `reps`**. Zelfde grote-cijfer-principe als de TRACK-tab-invoerwaarde op het exercise-logging scherm, hier toegepast op de *weergave* van al gelogde sets i.p.v. een invoerveld.
- **PR-trofee alleen bij de allereerste keer**: dit scherm gebruikt een striktere PR-regel dan de rest van de app. Elders (Calendar-popup, HISTORY-tab, records-overlay) toont de trofee **elke** set die aan de huidige record-drempel voldoet (`weight >= db.records[naam][reps]`) — hier toont hij 'm alleen bij de chronologisch **eerste** keer dat die exacte (reps, gewicht)-combinatie ooit is behaald, via de nieuwe helper `getFirstPRComboKeys(exerciseName)` in `app.js` (itereert alle datums chronologisch, houdt een `Set` van al-geziene "reps_gewicht"-combo's bij, markeert alleen de eerste hit per combo — ook binnen dezelfde dag als er dubbele identieke sets zijn). Hergebruikt dezelfde onderliggende PR-predicate (`db.records`), voegt er alleen de dedup-laag overheen — geen aparte PR-databron.
- **Comment-icoon per set**: alleen zichtbaar (en klikbaar, `.exercise-set-comment.has-note`) als de set een `note` heeft — hetzelfde `note`-veld dat al bestaat sinds het exercise-logging scherm (`exercises[].sets[].note` in Firestore, `users/{uid}/workouts/{date}`). Klikken opent de Comment-popup (zie hieronder) voor die specifieke set, zonder naar het exercise-logging scherm te navigeren (`e.stopPropagation()` voorkomt dat de kaart-klik — die normaal naar `openTraining()` navigeert — ook afgaat).

### Comment-popup (`#comment-overlay`) — hergebruikt voor set- én sessie-notities

Eén overlay-component met twee submodi (`#comment-view-mode` / `#comment-edit-mode`, getoggled via `.hidden`), aangestuurd door een generieke `openCommentPopup(ctx)`-functie in `app.js` die een context krijgt (`getText`/`onSave`/`onDelete`) — zo hergebruikt zowel het per-set comment-icoon (`openSetCommentPopup(exIdx, setIdx)`) als de "Comment"-pil in de dag-acties-rij (`openSessionCommentPopup()`) exact dezelfde UI:

- **View-modus**: titel "Comment" in de blauwe accentkleur (`.overlay-panel .comment-title { color: var(--blue-btn) }` — bewust specifieker dan de standaard `.overlay-panel h3`-kleur, om 'm te overschrijven), de notitietekst eronder (`.comment-text`), en **Edit** (`.btn-secondary`) + **Done** (`.btn-primary`) naast elkaar. Done sluit zonder actie.
- **Edit-modus**: tekst wordt een `<textarea>`, met **Cancel** (`.btn-secondary` — gaat terug naar view-modus als er al tekst was, sluit anders direct), **Delete** (nieuwe klasse `.btn-text-danger`: zelfde vorm als `.btn-secondary` maar rode tekst i.p.v. een gevulde rode knop — bewust subtieler dan de bestaande `.btn-danger` die voor destructieve account-acties zoals "Reset to default" gebruikt wordt) en **Save** (`.btn-primary`, schrijft weg naar hetzelfde `note`-veld en sluit de popup).
- Opent direct in edit-modus (leeg) als er nog geen tekst is — relevant voor de sessie-comment-pil, die (anders dan het per-set icoon) altijd klikbaar is, ook als er nog geen sessienotitie bestaat.
- **Sessienotitie-opslag**: er bestond nog geen notitieveld op sessieniveau — toegevoegd als `sessionNote` (string) op hetzelfde workout-document als de oefeningen, `users/{uid}/workouts/{date}.sessionNote`, naast het bestaande `exercises`-veld. In-memory bijgehouden in een nieuwe `db.sessionNotes[date]`-map (los van `db.workouts[date]`, dat een array blijft — geen wijziging aan de bestaande array-vorm om alle bestaande code die daarvan uitgaat niet te raken). `persistWorkout()` en de nieuwe `saveSessionNote()` schrijven allebei met `{ merge: true }` zodat ze elkaars veld niet overschrijven.

## Overlays (bottom sheets)

Generieke `.overlay` / `.overlay-panel` classes: donker scrim, paneel schuift van onderen omhoog, `border-radius: 12px 12px 0 0`. Bevat meestal een `<h3>` titel, invoerveld(en) (`input[type=text]`, `select`, of sinds dit scherm ook `textarea`), en een knoppenrij (`.overlay-btns` met `.btn-secondary` + `.btn-primary`, of alleen `.btn-primary` bij een puur informatieve overlay zoals de records-lijst).

# AI Fitness Co-Pilot — Design System

Dit bestand documenteert de visuele stijl zoals die daadwerkelijk in `style.css` / `index.html` is geïmplementeerd. Bij elke visuele wijziging (nieuwe kleur, nieuw component) dit bestand meteen bijwerken zodat het blijft kloppen.

**Eén systeem voor de hele app.** Elk onderdeel (hoofdmenu, Fitness Tracker, Workout Plan Builder, Calculator, Nutrition, Insight, losse schermen en pop-ups) gebruikt dezelfde tokens en basisklassen. Er bestaan geen sectie-eigen kleuren, radiussen, schaduwen of knopdefinities meer.

## Harde regels

1. **Alle waardes komen uit `:root`.** Buiten `:root` en `:root[data-theme="dark"]` staat er in `style.css` geen enkele kleur-literal (geen hex, geen `rgb()`), en in `index.html`/`app.js` staan geen inline kleuren of `style="…"`-opmaak. Afgeleide tinten (bv. `--danger-light`) worden in `:root` met `color-mix()` uit de basiskleuren berekend, zodat het donkere thema ze automatisch volgt.
   - Bewuste uitzondering: `<meta name="theme-color">`, het kleine thema-script bovenin `<head>` en `manifest.json` (Android-statusbalk/PWA-splash). Die draaien vóór `style.css` of kunnen geen CSS-variabele lezen; ze gebruiken de `--toolbar`-waarde per thema (`#212121` licht, `#1E1E1E` donker). Manifest: `theme_color` `#212121`, `background_color` `#f2f2f2` (= `--bg` licht).
   - De grafiek (`<canvas>` in de Graph-tab) leest zijn kleuren tijdens het tekenen uit de tokens (`getComputedStyle(…).getPropertyValue('--primary')` enz.).
2. **Nieuwe schermen gebruiken uitsluitend deze tokens en basisklassen** (`.toolbar`, `.btn`, `.pill`, `.badge`, `.card`/`.nav-card`, `.section-label`, de gedeelde input-stijl, de choice-controls). Geen eigen hex-waardes, geen eigen knopklasse met eigen kleuren/hoogte/radius.
3. **Geen font-weight 600.** Alleen 400 / 500 / 700 (dat zijn ook de enige geladen Roboto-gewichten).

## Kleuren

### Licht thema (standaard, `:root`)

| Token | Waarde | Gebruik |
|---|---|---|
| `--bg` | `#f2f2f2` | Schermachtergrond; ook zebra-strepen, gedrukte rij/kaart, neutrale badge |
| `--surface` | `#ffffff` | Kaarten, rijen, bottom sheets, inputs, secundaire knoppen |
| `--toolbar` | `#212121` | Toolbar en de balken eraan vast (dag-navigatie, TRACK/HISTORY/GRAPH-tabs, kalender-footer, kop van de 1RM-tabel) |
| `--text` | `#212121` | Hoofdtekst |
| `--text-secondary` | `#757575` | Labels, eenheden, beschrijvingen, secundaire knoptekst |
| `--text-muted` | `#9e9e9e` | Placeholders, lege staten, chevrons/drie-puntjes |
| `--border` | `#e0e0e0` | Randen van inputs/knoppen/choice-controls, scheidingslijnen |
| `--primary` | `#039BE5` | **De enige accentkleur.** Vervangt alle vroegere varianten (`#29b6f6` cyaan, `#4a9eff`, `#2196f3`, `#2979FF`). Primaire knoppen, actieve tab, geselecteerde staat, modal-titels, focusrand, links-achtige acties, grafieklijn |
| `--primary-light` | `#E1F5FE` | Tint-achtergrond: icoonvakjes van nav-kaarten, geselecteerde/gedrukte rijen, "vandaag" in de kalender, badge-primary |
| `--success` | `#4CAF50` | SAVE, "Week toevoegen", succes-toast, recap "gehaald", grafiek-selectiering. Vervangt alle andere groentinten |
| `--danger` | `#C62828` | Verwijderen, foutmeldingen, fout-toast. Vervangt `#d32f2f` |
| `--warning` | `#e69500` | Recap "minder dan gepland" |
| `--pr-gold` | `#d4a017` | Alles wat een PR/record is: trofee-iconen, PR-toast, One Rep Max-kaart, Recap-PR-pil, afgeleide grafiekpunten |
| `--ai` | `#7C4DFF` | **Alleen AI-functies**: AI Coach-pil, Generate Plan-knop, AI-laadspinner |

Tekst/iconen óp een kleurvlak:

| Token | Waarde | Gebruik |
|---|---|---|
| `--on-toolbar` | `#ffffff` | Toolbartitel en -iconen |
| `--on-primary` | `#ffffff` | Tekst op primary/success/danger/ai-knoppen, toasts, geselecteerde choice-controls |
| `--on-gold` | `#000000` | Tekst/iconen op `--pr-gold` |
| `--google-blue/-green/-yellow/-red` | Google-merkkleuren | Alleen het Google-logo op de inlogknop |

Afgeleid (in `:root`, via `color-mix`, volgen het thema vanzelf): `--danger-light`, `--success-light` (12% tint), `--pressed` (8% `--text`, druk-feedback op neutrale knoppen), `--toolbar-pressed` (15% wit, druk-feedback van toolbar-iconen), `--toolbar-icon-muted` (45% wit: inactieve tab, inactieve plan-ster), `--scrim` (overlay-achtergrond).

### Donker thema (`<html data-theme="dark">`)

Overschrijft alleen de basispalet-tokens. Alle overige kleuren (primary, success, danger, warning, pr-gold, ai, on-*) blijven gelijk.

| Token | Donker |
|---|---|
| `--bg` | `#121212` |
| `--surface` | `#1E1E1E` |
| `--toolbar` | `#1E1E1E` |
| `--text` | `#ffffff` |
| `--text-secondary` | `#9e9e9e` |
| `--text-muted` | `#757575` |
| `--border` | `#333333` |
| `--primary-light` | `#0B3A52` |

**Wisselen en onthouden:**
- Schakelaar: icoonknop `#btn-theme-toggle` rechts in de toolbar van het hoofdmenu (alleen daar). Licht thema toont een maan (tik → donker), donker thema een zon (tik → licht); welke van de twee SVG's zichtbaar is regelt CSS op `data-theme`, het aria-label zet `applyTheme()`.
- Startwaarde: een inline script bovenin `<head>` (vóór de CSS en de splash) zet `data-theme` op `<html>`: de opgeslagen keuze (`localStorage` sleutel `theme`, `light`/`dark`), anders `prefers-color-scheme` van de telefoon. Zo verschijnt de app (ook splash en login) nooit eerst in het verkeerde thema.
- Zonder opgeslagen keuze volgt de app ook live een wijziging van de systeeminstelling; na één tik telt alleen nog de opgeslagen keuze.
- `applyTheme(theme)` (app.js) zet `data-theme`, werkt `<meta name="theme-color">` bij naar `--toolbar` van het actieve thema, en tekent de grafiek opnieuw als die in beeld is (canvas leest zijn kleuren alleen tijdens het tekenen). Al het andere volgt via de CSS-variabelen vanzelf, zonder herladen.

## Typografie

Font `Roboto` (Google Fonts, alleen 400/500/700). Er zijn **zes niveaus**, als tokens (`--fs-*`) en als utility-klassen (`.section-label`, `.t-small`, `.t-body`, `.t-heading`, `.t-number`, `.t-hero`):

| Niveau | Token | Grootte / gewicht | Gebruik |
|---|---|---|---|
| Label | `--fs-label` | 11px / 500, hoofdletters, letter-spacing `.08em`, `--text-secondary` | Sectielabels: **`.section-label`**, ook TRACK-veldlabels, kalendermaanden, History-datums, plate-tabelkoppen |
| Klein | `--fs-small` | 12px / 400 | Beschrijvingen, meta, eenheden (kgs/reps), badges, hints |
| Body | `--fs-body` | 15px / 400 | Lijstitems, lopende tekst, lege staten, choice-controls, toasts |
| Kop | `--fs-heading` | 16px / 500 | Toolbartitel, modal-titel, oefeningnamen, kaarttitels |
| Groot getal | `--fs-number` | 20px / 700 | Setwaardes (alle setlijsten), waarde in de gewicht/reps/RPE/extra-velden, record-gewichten, plate-totaal |
| Hero | `--fs-hero` | 32px / 700 | 1RM-resultaat, appnaam op splash en login |

- `.section-label` is **de** sectielabelklasse. De vroegere losse klassen `.field-label`, `.info-section-label`, `.new-ex-label`, `.plate-section-label`, `.plate-result-title`, `.cal-month-header` en `.history-day-date` bestaan niet meer. Positionering (marges) gaat via de context (`.field-group .section-label`, `.cal-month > .section-label`, …) of een aparte positie-klasse (`.plan-list-label`, `.plan-day-group-label`).
- Een eenheid binnen een label houdt zijn eigen casing via `.label-unit` ("WEIGHT (kgs)"); "(optional)" via `.field-label-optional`.
- Nadruk binnen een niveau mag met gewicht 500/700 (bv. de vetgedrukte gewichten in Recap-regels), maar nooit met een andere grootte.
- Knoplabels (`--fs-button`, 14px / 500, hoofdletters, `.06em`) horen bij het `.btn`-component (en de tab-labels, die ook knoppen zijn), niet bij de tekstniveaus.
- Setwaardes (gewicht en reps) staan **overal** op Groot getal met de eenheid ("kgs"/"reps") als apart element op Klein — ook dropsets (alleen het pijltje markeert ze) en de setrijen in de kalender- en Go to-popup.

## Radius en schaduw

Precies drie radiussen:

| Token | Waarde | Gebruik |
|---|---|---|
| `--radius-sm` | 8px | Knoppen, inputs, steppers, choice-blokjes (dagenaantal, toggles, stang-opties), dropdownmenu, icoonvakjes, bewerk-/verwijderknoppen |
| `--radius-lg` | 12px | Kaarten, bottom sheets (alleen bovenhoeken), stippel-"toevoegen"-blokken, resultaatkaarten, app-icoon op splash/login |
| `--radius-pill` | 999px | Pillen (AI Coach, Recap/Comment, Recap-PR), badges, filterchips, tijdfilters, en alles wat rond is (dagcirkels, kalenderdagen, avatar, radio's, ronde toolbar-ripple) |

Schaduwen:
- `--card-shadow` — **de enige kaartschaduw**, voor elke kaart in elke sectie (nav-kaarten, oefeningkaarten in de Tracker, plan-kaarten, records, calculatorkaarten). Kaarten krijgen nooit een eigen schaduw.
- `--card-shadow-elevated` — een kaart/rij die gesleept wordt.
- `--toolbar-shadow`, `--float-shadow` (zwevende pillen), `--menu-shadow` (dropdown) — voor balken en zwevende lagen, nooit voor kaarten.

## Spacing

Schaal: `--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 24px · `--space-6` 32px. Alle paddings/marges/gaps komen uit deze schaal (alleen 2px-micro-afstanden tussen een titel en zijn meta-regel vallen erbuiten).

Semantische aliassen:
- `--screen-gutter` = 16px — **zijmarge van elk scherm**, ook van bottom sheets, toolbars-zonder-terugknop, lijsten en formulieren.
- `--card-padding` = 16px — binnenruimte van een kaart.
- `--card-gap` = 12px — ruimte tussen kaarten.
- `--section-gap` = 24px — ruimte tussen secties (Plan schedule, AI-formulier, calculators).

## Componenten

### Toolbar (`.toolbar`)
- Op **elk** scherm dezelfde: `--toolbar-height` (56px) + safe-area-top, `--toolbar`, `--toolbar-shadow`, titel `.toolbar-title` op niveau Kop, `--on-toolbar`.
- **Linksboven staat op elk scherm een pijl-terug** (`.toolbar-btn`, Material "arrow_back"-pad), ook op de Fitness Tracker (was een huis-icoon) en het Training-scherm (was een hamburger-icoon); de navigatie erachter is ongewijzigd. Uitzondering: het **hoofdmenu** heeft de standaard toolbar met de appnaam als titel en géén knop links. Zonder knop links lijnt de titel uit op de 16px-gutter (`.toolbar > .toolbar-title:first-child`).
- Iconen: **24px** in de toolbar (`--icon-toolbar`), **20px** in lijsten en kaarten (`--icon-list`). `.icon-outline` blijft de lijnstijl-variant voor de records/info-iconen in de training-toolbar. Illustratie-iconen van lege staten (48px) vallen hierbuiten.
- Vaste iconen: PR = gevulde trofee (Material "emoji_events"-pad) in `--pr-gold`, overal waar een PR getoond wordt; AI-functies = sparkle-icoon (Material "auto_awesome"), het te herhalen patroon voor toekomstige AI-features.
- Balken die aan de toolbar vastzitten (`.day-nav`, `.training-tabs`, `.cal-footer`) gebruiken ook `--toolbar`, 48px hoog, met een 2px `--primary`-lijn waar ze in de content overgaan.

### Knoppen (`.btn`)
- Basis: 48px hoog (`--control-height`), `--radius-sm`, 14px/500, hoofdletters, `.06em`, `flex: 1` (in een rij vullen ze de breedte).
- Varianten: `.btn-primary` (`--primary`, witte tekst), `.btn-secondary` (`--surface`, 1px `--border`, `--text-secondary`), `.btn-danger`, `.btn-success`, `.btn-ai`. Druk-feedback: `filter: brightness(.9)` (secundair: `--pressed`).
- Modifiers: `.btn-block` (volle breedte, losstaand in een kolom: Doorgaan, Generate Plan, Bereken), `.btn-multiline` (label op twee regels, de drie Reset/Clear-knoppen van de Plate Calculator), `.btn-delete-mode` (CLEAR → rood tijdens het bewerken van een set).
- Alle knoppen bouwen hierop: modalknoppen, SAVE (`btn-success`) / CLEAR (`btn-primary`), Doorgaan, Bereken (`btn-primary`, was cyaan), Generate Plan (`btn-ai`), Google-inlog (`btn-secondary`), de Smart-banner-knoppen, "Voeg toe" in de oefeningenlijst.
- **Icoonknoppen** (toolbar, steppers, bewerken/verwijderen, drie-puntjes, rename-potlood, set verwijderen, nieuwe categorie) hebben altijd een tikvlak van minimaal 48×48. Dat gaat via de afmeting zelf, of een onzichtbare `::after` van 48×48 rond een kleiner getekend icoon. TRACK-steppers zijn 48×48 en zien eruit als een secundaire knop (surface + border, radius-sm).
- **In elke modal staat secundair links en primair/danger rechts** (`.overlay-btns`), ook bij exercise info (Close · Edit) en de Comment-popup (Done · Edit; Cancel · Delete · Save). Een modal met één knop zet die ook in `.overlay-btns`.

### Pillen en badges
- `.pill` — één pilvorm (40px hoog, `--radius-pill`, 14px/500, géén hoofdletters, 20px-iconen): Recap- en Comment-pil (`--surface` + border), AI Coach-pil (`.pill-ai`: effen `--ai`, witte tekst, geen gradient meer), Recap-PR-blok (`.pill-pr`: `--pr-gold`, `--on-gold`). Kleur alleen waar die iets betekent. Zwevende knop-pillen krijgen `--float-shadow` en een tikvlak van 48px hoog.
- `.badge` — dezelfde vorm, compact (Klein, 500): RPE-badge (neutraal, `--bg`) en "★ ACTIEF" (`.badge-primary`).

### Kaarten
- `.card` / elke kaart: `--surface`, `--radius-lg`, `--card-shadow`, padding 16, 12 ertussen. Geen gekleurde linkerranden (alleen de Smart-banner, een balk en geen kaart, heeft nog een 3px `--primary`-rand).
- **`.nav-card`** — navigatiekaart, identiek op het hoofdmenu, het Calculator-menu en New Workout: links een vakje van 36×36 (`--radius-sm`, `--primary-light`) met een 20px icoon in `--primary`, titel op Kop, beschrijving op Klein, rechts een 20px chevron in `--text-muted`. Lijst-container `.nav-card-list` (verticaal gecentreerd, 16px gutter, 12px gap). Geen accentkleuren per kaart.

### Setrij (`.set-row`) — één component voor elke lijst van gelogde sets
- Gebruikt door de TRACK-lijst, het Fitness Tracker-dagoverzicht, de History-tab, de kalender-dagpopup en de Graph → "Go to"-popup. Opgebouwd door één helper, `setRowInnerHtml(sets, i, opts)` (+ `setRowClass(sets, i)`) in app.js; nooit een eigen rij-template per scherm.
- **Eén vaste grid** (`.set-row`): `28px · 20px · 24px · 1fr · 56px · 72px` = comment-icoon · PR-trofee óf dropset-pijltje · setnummer · gewicht · reps · RPE/partial/"—". Elke cel wordt altijd gerenderd (leeg als er niets te tonen is), dus alle kolommen staan in elke lijst en elke rij op dezelfde x. De RPE-kolom (72px) heeft ruimte voor de badge en regels als "+10 forced".
- **Trofee-/pijltjeskolom** (`.set-pr`, 20px): toont de trofee bij een PR, of het dropset-pijltje (zelfde 20px grootte) bij een dropset-rij. Er is geen aparte pijltjeskolom: een dropset telt nooit mee voor PR's, dus trofee en pijltje staan nooit samen in één rij.
- **Gewichtsblok**: `.set-weight` is een blok van vaste breedte (76px — "132.5 kgs" past er net in), met `--space-3` (12px) afstand direct na de setnummerkolom (zo plakt het gewicht ook niet tegen setnummers van twee cijfers), links in de flexibele kolom (niet gecentreerd). Binnen het blok staan getal en "kgs" rechts uitgelijnd, dus "kgs" eindigt in elke rij op dezelfde x (ook bij 80 of 132.5). Extra schermbreedte komt tussen gewicht en reps terecht. Reps en de RPE-cel zijn rechts uitgelijnd in hun kolom.
- **Zelfde afstand tot de schermrand**: de inhoud begint en eindigt overal op 24px (`--screen-gutter` + `--space-2`). Rijen in een kaart (dagoverzicht, History) of een bottom sheet (popups) staan al één gutter naar binnen en krijgen `--space-2` (8px) als zijpadding; de TRACK-lijst loopt van rand tot rand en krijgt de som (`#set-list .set-row`). De kaartmarge zelf blijft 16px. **Koppen** houden de standaard kaart-binnenruimte van 16px (`--card-padding`), gelijk aan alle andere kaarten in de app: de oefeningnaam in `.exercise-card-header`, de datum in `.history-card-header`, de oefeningnaam (`.cal-detail-ex-name`) in de kalender- en Go to-popup, en de "No sets"/"Plan: …"-regel (`.exercise-card-empty`) in een kaart zonder sets. Alleen de setrijen zelf gebruiken 8px, dus een kop begint 8px rechts van de comment-kolom.
- **Cellen**: `.set-comment` (16px icoon in een 28px kolom; TRACK: op elke rij, grijs `--border` tot er een note is, tikken = note toevoegen, tikvlak 48×48 via een onzichtbare `::after` die naar links de rijpadding in steekt en nooit over de trofeekolom; dagoverzicht/History: alleen bij een set met comment, dan `--primary` en tikbaar; popups: nooit), `.set-pr` (20px trofee `.set-pr-icon`, `--pr-gold`), `.set-num` (Body-grootte, 700), `.set-weight`/`.set-reps` (`.set-val` Groot getal + `.set-unit` "kgs"/"reps" op Klein), `.set-effort` (RPE-`.badge`, "+N partial/forced" en "—" op Klein, twee regels waar nodig).
- **Setnummers**: overal `index + 1` binnen de sets van die oefening op die dag, dropset-rijen tellen mee — dus dezelfde nummering als TRACK; in History begint elke datum weer bij 1.
- **Dropset** (`.drop-child`): pijltje in de trofeekolom (vóór het setnummer), in dezelfde grootte als de trofee; een dropset krijgt nooit een trofee; het gewicht houdt zijn rechts uitgelijnde x (staat recht onder het gewicht van de hoofdset). Geen verschuiving, zelfde typografie als elke andere set.
- Zebra-striping via `.row-alt` (`--bg`), 1px transparante `border-bottom`. Staten: TRACK ingedrukt/geselecteerd en tikbare History-rijen (`.clickable`) `--primary-light`; de gemarkeerde rij in de Go to-popup (`.graph-goto-set-point`) ook `--primary-light`.
- **Kaarten met setrijen**: `.exercise-card` (dagoverzicht, één per oefening) en `.history-card` (History, één per datum) delen box, kop (48px, inhoud op `--card-padding`), 2px `--primary`-lijn en set-ruimte; in History staat de datum als `.section-label` op de plek van de oefeningnaam en is de kop tikbaar (Go to). De TRACK-lijst heeft geen kaart.

### Inputs
- Eén stijl voor elk invoerveld (tekst, nummer, textarea, select-knop, zoekbalk, modal-inputs, New Exercise, Plate/1RM/Warm-up, AI-voorkeur): 48px hoog, 1px `--border`, `--radius-sm`, `--surface`, 16px tekst, focusrand `--primary`, placeholder `--text-muted`. Textarea: zelfde box, min. 80px hoog. Onderlijn-inputs bestaan niet meer.
- Select-knop (`.new-ex-select`): dezelfde box met een CSS-chevron rechts (geen SVG met hardcoded kleur).
- Zoekbalk: dezelfde box met het zoek-icoon erin (44px links-padding).
- TRACK-velden (gewicht/reps/RPE/extra): dezelfde omrande box, de waarde gecentreerd op niveau Groot getal; geen cyaan lijn meer onder het label.

### Choice-controls (selectie)
Toggles, chips, dagenaantal-blokjes, dagindeling, weekdagcirkels, dagkiezer, stang-/oefening-opties (calculators), Partial/Forced, Gelijke/Andere reps en tijdfilters delen één look: `--surface` + 1px `--border` + `--text-secondary`. **Geselecteerd = `--primary` gevuld met witte tekst**, overal. Radius `--radius-sm` voor blokjes, `--radius-pill` voor chips/tijdfilters/cirkels.

### Modals (`.overlay` / `.overlay-panel`)
Bottom sheet, `--radius-lg` bovenhoeken, padding 16 (gutter), 16 tussen titel/inhoud/knoppen, titel (`<h3>`) op niveau Kop in `--primary`. Inputs en knoppen volgen de regels hierboven.

### Lege staten en placeholderschermen
Lege-lijst-teksten: Body, `--text-muted`, gecentreerd. Nutrition en Insight (Coming Soon) gebruiken het gewone thema: standaard toolbar, `--bg`, 48px icoon in `--primary`, titel op Kop, beschrijving op Body.

### Splash en login
Volgen het actieve thema (`--bg`), delen het `.brand`-blok: app-icoon (`--radius-lg`), "AI Fitness" op Hero (`--text`), "Co-Pilot" op Kop in `--primary` (hoofdletters). Geen inline stijlen meer in de splash.

---

## Globale layout-elementen

Elementen die **niet** binnen een los `.screen`-blok staan maar als eigen `<body>`-kind na alle schermen in `index.html` staan, en daardoor automatisch op elk scherm zichtbaar zijn zonder dat een nieuw scherm er zelf iets voor hoeft te doen:

**Zwevende-pil-patroon (geen achtergrondbalk, geen gereserveerde kleurstrook).** Beide onderstaande elementen tonen alleen de pil-knop(pen) zelf, `position: fixed` en gecentreerd. De wrapper-`<div>` van elke pil-rij (`#global-ai-bar`, `#day-actions-row`) heeft **geen enkele `background`-declaratie** (dus volledig transparant) en is zelf `pointer-events: none` — alleen de pil-knop(pen) zelf hebben een achtergrond en zijn `pointer-events: auto`. Geverifieerd met een headless Playwright-render (`elementFromPoint` vlak naast beide pillen geeft `.home-content`/`.cal-scroll` terug met `background-color: rgba(0,0,0,0)`, geen apart wrapper-element) — zie ook de screenshots die bij deze wijziging zijn gemaakt.
  - **`.screen` reserveert zelf géén ruimte meer** (gewoon `position: fixed; inset: 0`, volle hoogte, geen `padding-bottom`). In plaats daarvan krijgt de **daadwerkelijke scrollbare content van elk scherm** (bv. `.home-content`, `.cal-scroll`, `.set-list`, `.history-content`, `.exercise-list`, `.plan-list-scroll`, `.plan-detail-scroll`, `.ai-gen-form`, `.pde-list`, `.new-ex-scroll`, `.ei-scroll`) een `padding-bottom: var(--ai-bar-space)` (of meer, samengesteld met de eigen bestaande padding) — dit is scroll-padding **binnen** de lijst zelf, geen los schermbreed vlak. Het effect: content scrollt echt door tot de fysieke onderrand van het scherm (zichtbaar en deels verborgen achter de pil terwijl je scrollt, precies zoals bij een normale `position: fixed` bottom-nav over scrollende content), met aan het einde van de lijst nog net genoeg lucht om het allerlaatste kaartje volledig tevoorschijn te scrollen.
  - **Niet-scrollbare, interactieve bodembalken** (die zelf geen lijst zijn, dus niets om "onderdoor te scrollen") krijgen in plaats daarvan een `margin-bottom: var(--ai-bar-space)` op de balk zelf, zodat de knoppen erin nooit permanent achter een pil verstopt zitten: `.cal-footer` (vorige/volgende workout in de Calendar) en `.plan-schedule-footer` (Doorgaan op Plan schedule). Hun eigen achtergrondkleur (`--toolbar` resp. `--surface`) blijft gewoon zichtbaar tot aan hun eigen rand, met de pil er los overheen.

- **Globale AI Coach-pil** (`#global-ai-bar` = de positionerings-wrapper, knop `.pill.pill-ai` / `#btn-global-ai-coach`) — zwevend onderaan de viewport, boven de Android-systeembalk (`padding-bottom: calc(var(--safe-bottom) + 16px)`). Effen `--ai`-achtergrond (paars, geen gradient of gloed meer), gedeelde `.pill`-vorm (`--radius-pill`), `--float-shadow`. Sparkle-icoon en "AI Coach"-tekst in `--on-primary` (wit).
  - Klik-gedrag is voorlopig een lege handler met `// TODO: link to the Chat Coach screen once it's built` in `app.js` — de echte Chat Coach-koppeling volgt later.
  - Clearance-hoogte via `--ai-bar-height` (64px) en `--ai-bar-space` (`--ai-bar-height` + `--safe-bottom`) — deze tokens heten nog naar de oude balk-implementatie maar betekenen nu "hoeveel scroll-cushion een lijst nodig heeft om onder de pil uit te komen". **Een nieuw scherm met een scrollbare lijst moet zelf `padding-bottom: var(--ai-bar-space)` (of meer) op die lijst zetten** — dit gebeurt niet meer automatisch via `.screen` (dat zou weer een lege gereserveerde strook teruggeven, precies het probleem dat hier is opgelost). Een niet-scrollbare bodembalk met interactieve knoppen gebruikt in plaats daarvan `margin-bottom: var(--ai-bar-space)` op zichzelf (zie de twee voorbeelden hieronder).
  - Uitzonderingen — schermen waar de pil **niet** hoort: `#screen-login` (vóór inloggen — een AI-coach-call-to-action heeft geen zin vóór authenticatie) en `#screen-home` (het hoofdmenu/hub-scherm met de 4 kaarten). Beide krijgen `padding-bottom: 0` (volledige hoogte, geen ruimte gereserveerd) en verbergen de pil zelf via de CSS-sibling-selector `#screen-login.active ~ .global-ai-bar, #screen-home.active ~ .global-ai-bar { display: none; }`.
  - Bottom-sheet overlays (`.overlay`, z-index 100) en het overflow-dropdownmenu (`.dropdown-menu`, z-index 150) liggen boven de pil (`.global-ai-bar` heeft z-index 60) en dekken 'm dus tijdelijk af zolang ze open staan — bewust, want dat zijn modale lagen.
  - Was voorheen twee losse, schermgebonden implementaties (de "Chat Coach"-knop op het exercise-logging scherm en de "AI Coach"-tegel op het lege Fitness Tracker-startscherm, beide verwijderd) — vervangen door dit ene globale element; voeg geen nieuwe schermgebonden "coach"-knoppen meer toe.
- **Dag-acties-pillen** (`#day-actions-row` = de positionerings-wrapper, "Recap" + "Comment", `.pill`) — zelfde zwevende-pil-patroon (transparante wrapper, alleen de pillen zelf hebben achtergrond/schaduw), maar **niet écht globaal**: enkel zichtbaar wanneer `#screen-fitness-tracker` zowel `.active` als `.has-day-actions` heeft (CSS-sibling-selector `#screen-fitness-tracker.active.has-day-actions ~ .day-actions-row`). `.has-day-actions` wordt in `renderHome()` (app.js) gezet zodra de huidige dag oefeningen bevat, en verwijderd in de lege-staat. Neutrale `.pill` (`--surface` + `--border`, `--float-shadow`) — bewust niet in `--ai`, zodat 'm nooit met de AI Coach-pil verward wordt. Zweeft met `bottom: var(--ai-bar-space)` — dus direct boven de zone van de AI Coach-pil. Hoogte-cushion via `--day-actions-height` (56px): wanneer deze pillen zichtbaar zijn, krijgt specifiek `.home-content` (niet `.screen` zelf) extra scroll-padding: `#screen-fitness-tracker.has-day-actions .home-content { padding-bottom: calc(var(--ai-bar-space) + var(--day-actions-height) + 16px); }`. Een volgend scherm dat een eigen extra pil-rij nodig heeft, volgt dit patroon: eigen `.has-*`-klasse op het scherm + een descendant-selector die de padding op de eigen scrollbare lijst verhoogt, nooit op `.screen` zelf.
  - "Recap": opent de Recap-popup (`openDayRecap()`); het PR-blok bovenin is een `.pill.pill-pr`.
  - "Comment": opent de Comment-popup (zie hieronder) gekoppeld aan de hele dag-sessie i.p.v. aan één set.

## Exercise-logging scherm (`#screen-training`) — referentie-implementatie

Dit scherm (geopend via `openTraining(name)`, TRACK/HISTORY/GRAPH tabs) is het canonieke voorbeeld van bovenstaande tokens in de praktijk:

- Toolbar: exercise-naam + 4 acties rechts (timer, records, info, overflow), donkere achtergrond, outline-iconen zoals hierboven.
- Tab-balk direct eronder (`--toolbar`, 48px): 3 tabs, actieve tab `--primary`-tekst + underline (`border-bottom: 2px solid var(--primary)`).
- **WEIGHT (kgs)** en **REPS** secties: `.section-label` + rij met −/waarde/+ (48×48 steppers in secundaire-knopstijl, de waarde in de gedeelde omrande input op niveau Groot getal). De vroegere cyaan lijn (`.field-cyan-line`) is weg.
- **SAVE** (`.btn.btn-success`) en **CLEAR** (`.btn.btn-primary`, rood via `.btn-delete-mode` tijdens bewerken) naast elkaar, volle breedte.
- Set-lijst eronder: **geen kolomkop-rij** (bewust weggelaten om exact met de FitNotes-referentie te matchen) — elke rij toont: notitie-icoon (spraakbubbel, grijs — cyaan gevuld zodra er een notitie op die set staat) → PR-trofee-slot (alleen gevuld bij PR) → volgnummer → gewicht+eenheid → reps+eenheid. Het verwijder-icoon (prullenbak) is **niet standaard zichtbaar**; het verschijnt pas als extra kolom zodra een rij geselecteerd is (tap op de rij) — dit is een bewuste afwijking van de screenshot om de bestaande delete-functionaliteit te behouden zonder de rij standaard drukker te maken dan de referentie.
- Per-set notitie: opgeslagen als optioneel `note`-veld op het set-object in Firestore (`users/{uid}/workouts/{date}` → `exercises[].sets[].note`), bewerkbaar via een bottom-sheet overlay (`#set-note-overlay`) die opent via het notitie-icoon.
- Records-knop (trofee in de toolbar) opent een volledig scherm (`#screen-records`, gewone `showScreen`/`goBack`-navigatie, toolbar met terug-pijl + titel "[oefening] records") met per repcount 1..12 (of tot het hoogste ooit gelogde aantal) het **leidende gewicht**: het zwaarste gewicht uit alle echt gelogde sets met N óf méér reps (niets geschat). Elke rij toont de workout-datum waarop dat gewicht voor het eerst werd gehaald (`getRepProgressions()`): komt het uit een set met exact N reps → trofee + datum; uit een set met meer reps → datum + cursief "· via MRM" (geen trofee); geen kwalificerende set → "No data". Het gouden One Rep Max-blok volgt dezelfde regel. Tik op een rij: popup met CURRENT RECORD en "[N]RM previous records" = de progressie die tot het huidige record leidde (elke eerdere keer dat het leidende gewicht strikt zwaarder werd, óók door een set met méér reps, dan met "via MRM"), nieuwste eerst, zonder het huidige record zelf (dat staat al bij CURRENT RECORD; "No previous records" als er geen eerdere stap is); niet-verbeterende sets verschijnen niet. Elke stap is tikbaar (Go to met de bronset gemarkeerd). **Alles gaat op workout-datum** (de dag waaraan een set hangt), nooit op invoermoment: achteraf toegevoegde sets op een oudere dag tellen alsof ze er altijd waren (PR-trofeeën, records, sortering en Graph). Records staan los van `getPRSetKeys` (trofee-dominantie).
- **Steppers**: alle vier de TRACK-velden (Weight, Reps, RPE, Extra reps) hebben dezelfde stepper: knoppen 48×48, waarde 20px/700 in de omrande input; Weight/Reps en RPE/Extra reps zijn twee rijen van twee halve kolommen. Alle TRACK-labels (WEIGHT, REPS, RPE, EXTRA REPS, DROPSET) zijn `.section-label` (Label-niveau); alleen "(optional)" is lichter (400, gedempt) en "(kgs)" houdt zijn kleine letters (`.label-unit`).
- **RPE (optioneel)**: derde stepper op TRACK onder Reps (`#field-rpe`, compacter, licht label "RPE (optional)"). 0 = niet ingevuld, geldig 6–10 in stappen van 0,5 (+ vanaf 0 → 6, − vanaf 6 → 0; ongeldige getypte waarde wordt bij SAVE geweigerd). Opgeslagen als `rpe` op de set, alleen als > 0 (anders ontbreekt het veld). Getoond als neutrale `.badge` "RPE 8" (of niets als er geen RPE is) rechts van elke set-rij in het dagoverzicht en de History-tab (`rpeCellHtml()`); de Calendar/Go to-popups tonen het (nog) niet.
- **Extra reps (partials/forced)**: half-brede stepper naast RPE (`#field-extra`, 0–20) met eronder een Partial/Forced-toggle (uitgeschakeld en leeg bij 0, anders precies één actief, default Partial). Extra reps > 0 zet RPE echt op 10 (blijft aanpasbaar); RPE handmatig onder 10 zetten (stepper, of getypt zodra het veld verlaten wordt) reset extra reps + type naar 0/leeg, en terug naar 10 herstelt niets. Opgeslagen als `extra` + `extraType` op de set, alleen bij extra > 0. Badge: één gedeelde component `effortCellHtml()` op TRACK-setlijst, dagoverzicht en History — RPE-badge, met bij extra reps een kleine gedempte regel "+N partial/forced" eronder, of niets (lege ruimte) als beide leeg zijn.
- **Graph-tab: "Include derived"**: vinkje rechts van de Reps-dropdown (`#graph-derived`, standaard aan). Aan: naast de rechtstreekse punten (zwaarste set met exact N reps per sessie, `--primary`-bolletje) ook de afgeleide punten — elke stap van de leidende-gewicht-progressie (`getRepProgressions()`, dezelfde als Records/"previous records") die uit een set met méér reps kwam — als goud bolletje (`--pr-gold`) met een `--surface`-rand; `getGraphPoints()` levert ze op workout-datum. Legenda "Direct" / "Derived (via)" onder de grafiek (alleen zichtbaar als aan). Detailpaneel bij een afgeleid punt: "255 kg × 5 reps" (echte reps van de bronset) + datum + cursief "Derived — counts as 4RM"; tikken opent Go to voor de bronset. Uit: alleen rechtstreekse punten (oorspronkelijke werking).
- **Set-rij**: het gedeelde `.set-row`-component (zie "Setrij" bovenaan): vaste kolommen comment · PR · setnummer · gewicht · reps · RPE/partial, op exact dezelfde x in TRACK, dagoverzicht, History en de kalender-/Go to-popups. TRACK toont het comment-icoon op elke rij; dagoverzicht en History alleen bij een set met comment (kolom altijd gereserveerd). Zebra-striping via `.row-alt` (elke tweede set `--bg`; rij-index telt dropset-kinderen gewoon mee; de 1px `border-bottom` is `transparent` zodat rij-hoogtes gelijk blijven). History staat per datum in een eigen `.history-card`. De popups tonen setnummer, dropset-pijltje en RPE/partial net als de hoofdlijsten; hun comment-kolom blijft leeg (niet tikbaar), de Go to-popup toont geen trofee (die gegevens rekent hij niet uit).
- **Dropsets**: vinkje "DROPSET" (`#field-dropset`) rechts op de REPS-labelregel, zelfde Label-niveau in `--primary`; alleen zichtbaar als er een vorige set is om aan te koppelen (nieuwe set: vandaag al ≥ 1 set voor deze oefening; bewerkte set: niet de eerste). Opgeslagen als `isDropsetContinuation: true` op de set (alleen als aan; geen groeps-ID — de keten volgt de logvolgorde van die dag), na elke SAVE en bij Clear weer uit. Los te koppelen per set door de set te bewerken en het vinkje uit te zetten. Weergave in elke setlijst: alle rijen (ook zonder dropset) gebruiken dezelfde vaste kolommen van `.set-row`, dus er verschuift nooit iets wanneer er een dropset bijkomt. Een gekoppelde set (`.drop-child`, nooit de eerste rij) krijgt een pijltje in de trofeekolom (`.set-pr`), vóór het setnummer; het getal blijft rechts uitgelijnd en staat dus recht onder het gewicht van de hoofdset (geen verschuiving, geen verticale verbindingslijn), cijfers op hetzelfde niveau (Groot getal) als elke andere set; (`.drop-parent`/`.drop-mid` markeren de keten-structuur, zonder eigen opmaak). Alle rijen gebruiken `align-items: center` (ook het dagoverzicht, dat vroeger op baseline uitlijnde). Helpers: `setRowInnerHtml()`, `setRowClass()`, `dropsetRowClass()`, `isDropChild()`, `DROP_ARROW_SVG`.
- HISTORY-tab: één `.history-card` per datum (zelfde kaart als in het dagoverzicht, datum als `.section-label`-kop, tikbaar → Go to), met daarin de gedeelde setrijen. GRAPH-tab: onderliggende data-logica (`renderHistoryTab`, `renderGraph`) is niet aangeraakt.

## Fitness Tracker startscherm (`#screen-fitness-tracker`)

Het datum-navigatie-scherm dat opent na "Fitness Tracker" (pijl-terug linksboven → hoofdmenu):

- **Geen groet-balkje meer onder de header.** Het vroegere `#user-bar`-element ("Hi, [naam]") is volledig verwijderd (uit `index.html`, `style.css` én de `updateUserBar()`-functie in `app.js`) — niet alleen leeggemaakt, ook de ruimte die het innam is weg. Reden: voegde geen functionele waarde toe en oogde als restant uit een eerdere iteratie.
- **Geen losse "AI Coach"-tegel meer op dit scherm.** Die is verwijderd (zowel in de lege als de gevulde workoutlog-staat — de gevulde staat had er sowieso nooit een) en vervangen door de globale AI Coach-pil (zie "Globale layout-elementen" hierboven), die nu overal in de app staat in plaats van hier lokaal.
- **Lege-workoutlog-staat**: "Start New Workout" staat dicht bij de onderkant van het scherm — `.home-empty-action { margin-bottom: var(--ai-bar-space) }` (niet scrollbaar, dus zelfde `margin-bottom`-aanpak als de niet-scrollbare bodembalken hierboven) zodat de knop vlak boven de zone zit waar de AI Coach-pil zweeft, zonder overlap. "Workout Log Empty" is verticaal gecentreerd, maar **niet over het hele scherm** — een eigen wrapper (`.home-empty-title-wrap { flex: 1; display:flex; align-items:center; justify-content:center }`) centreert 'm alleen binnen de ruimte tussen de dag-navigatiebalk bovenaan en de bovenkant van de "Start New Workout"-knop. Bewust géén gecentreerde groep meer — de twee elementen staan onafhankelijk hoog/laag in `.home-empty` (flex column, titel-wrapper neemt de resterende ruimte, knop volgt daarna in de flow).
- "Start New Workout" staat in `--primary`, zoals de rest van de kernfunctionaliteit. Opent sinds het New Workout-tussenscherm (zie hieronder) niet meer direct "All Exercises", maar dat tussenscherm.

Schermen wijken niet meer per sectie af: layout, spacing en kleuren komen voor elk scherm uit dezelfde tokens en basisklassen (zie bovenaan).

## New Workout-tussenscherm (`#screen-new-workout`)

Zit tussen "Start New Workout" (leeg Fitness Tracker-scherm) en het bestaande "All Exercises"-scherm in. Standaard toolbar (terug-pijl + titel "New Workout"), `--bg`. Drie `.nav-card`s onder elkaar — exact dezelfde kaart als op het hoofdmenu en het Calculator-menu (icoonvakje in `--primary-light`/`--primary`, titel, ondertekst, chevron; geen accentkleur per kaart). De groep staat verticaal gecentreerd (`.nav-card-list { justify-content: center }`).

- **Manual Workout** — pen-icoon (Material "edit"). Navigeert naar het bestaande `openExerciseList()` / "All Exercises"-scherm, ongewijzigd. De titel "All Exercises" op dat scherm was voorheen een knop (`.toolbar-title-btn`, met een ▾-pijltje) die een dropdown opende met "All Exercises"/opgeslagen plannen/"Create New Routine" (`#exd-overlay` en alle `.exd-*`-CSS/JS) — verwijderd als overbodig nu er een eigen New Workout-scherm is; de titel is nu gewoon statische tekst (`.toolbar-title`, geen klik-gedrag).
- **Load Schedule Manually** — clipboard-icoon (hetzelfde pad als de "Presets"-knop in de Workout Plan Builder). Klik-handler is voorlopig een lege TODO in `app.js`.
- **Load Schedule Automatically** — sparkle-icoon. Ondertekst is dynamisch: `getTodaysScheduledDayName()` in `app.js` hergebruikt **dezelfde rotatielogica als de bestaande smart-day-banner** (`renderSmartBanner()`: `db.activePlan.lastDayIndex + 1` gemoduleerd op `plan.days.length`) om te bepalen welke plandag er "vandaag" aan de beurt zou zijn — geen nieuwe planningslogica, puur hergebruik. Toont "Today you have [Day Name]." als er een actief plan met dagen is, anders de generieke placeholder "Automatic planning not set up yet" (i.p.v. iets te verzinnen). Klik-handler is voorlopig een lege TODO.
- Krijgt de globale AI Coach-pil automatisch (`#screen-new-workout` staat niet op de uitsluitingslijst naast `#screen-login`/`#screen-home` — geen extra werk nodig), met de standaard scroll-cushion (`padding-bottom: var(--ai-bar-space)`) op `.nav-card-list` zodat de derde kaart er nooit permanent achter verstopt zit.
- Tekst in de UI is Engels, consistent met de rest van de app (alle andere schermen/knoppen/toasts zijn Engels) — de Nederlandse titels/onderteksten uit de opdracht zijn hiervoor vertaald.

## Fitness Tracker dagoverzicht (gevulde workout-staat) — grote cijfers, PR-logica, comments

Wanneer de huidige dag al gelogde oefeningen heeft (bv. via "Yesterday" navigeren naar een dag met workouts), toont `#screen-fitness-tracker` een lijst `.exercise-card`s met daarin de gelogde sets. Dit is een apart visueel patroon van het exercise-logging scherm (`#screen-training`) hierboven — niet hetzelfde component, bewust een compactere kaart-weergave:

- **Grote, dikgedrukte cijfers**: elke rij is de gedeelde `.set-row` (zie "Setrij" bovenaan), met setnummers zoals in TRACK. Waarde op Groot getal (`.set-val`), eenheid op Klein ernaast (`.set-unit`, `--text-secondary`) — bv. **"90.0" `kgs`**, **"10" `reps`**.
- **PR-trofee = niet-gedomineerde set**: overal (dagoverzicht, TRACK-setlijst, HISTORY-tab, Calendar-popup) en voor de "Personal record!"-toast bepaalt `getPRSetKeys(exerciseName)` in `app.js` welke sets een PR zijn, puur uit de gelogde sets. Regel (dominantie): een set (≥ 1 rep, > 0 kg) is alleen een PR als geen enkele andere set van die oefening — van welke datum ook, eerder of later — hem op gewicht ÉN reps evenaart of verslaat. 100×5 verliest zijn trofee dus zodra 100×6 bestaat, 120×5 aan 240×5, terwijl 100×5 en 120×3 er allebei één houden; dropsets tellen niet mee (`countsForRecords()`): een dropset krijgt nooit een trofee en neemt er ook geen af van een gewone set; de zware set waar de dropset op volgt is een gewone set. Identieke sets: alleen de eerst gelogde houdt de trofee. Implementatie O(sets): per exact rep-aantal het zwaarste gewicht (+ eerste set die dat tilde), dan van hoog naar laag rep-aantal: PR als dat gewicht strikt zwaarder is dan het zwaarste gewicht bij méér reps. De Records-tabel (`getExerciseRepRecord`, zwaarste gewicht bij exact N reps) is een aparte, niet-gedomineerde weergave en gebruikt deze functie niet.
- **Comment-icoon per set**: alleen zichtbaar (en klikbaar, `.set-comment.has-note`) als de set een `note` heeft — hetzelfde `note`-veld dat al bestaat sinds het exercise-logging scherm (`exercises[].sets[].note` in Firestore, `users/{uid}/workouts/{date}`). Klikken opent de Comment-popup (zie hieronder) voor die specifieke set, zonder naar het exercise-logging scherm te navigeren (`e.stopPropagation()` voorkomt dat de kaart-klik — die normaal naar `openTraining()` navigeert — ook afgaat).

### Comment-popup (`#comment-overlay`) — hergebruikt voor set- én sessie-notities

Eén overlay-component met twee submodi (`#comment-view-mode` / `#comment-edit-mode`, getoggled via `.hidden`), aangestuurd door een generieke `openCommentPopup(ctx)`-functie in `app.js` die een context krijgt (`getText`/`onSave`/`onDelete`) — zo hergebruikt zowel het per-set comment-icoon (`openSetCommentPopup(exIdx, setIdx)`) als de "Comment"-pil in de dag-acties-rij (`openSessionCommentPopup()`) exact dezelfde UI:

- **View-modus**: titel "Comment" (`--primary`, via de gedeelde modal-basisregel), de notitietekst eronder (`.comment-text`), en **Done** (secundair, links) + **Edit** (primair, rechts). Done sluit zonder actie.
- **Edit-modus**: tekst wordt een `<textarea>`, met **Cancel** (`.btn-secondary` — gaat terug naar view-modus als er al tekst was, sluit anders direct), **Delete** (`.btn.btn-danger`, in het midden) en **Save** (`.btn-primary`, schrijft weg naar hetzelfde `note`-veld en sluit de popup).
- Opent direct in edit-modus (leeg) als er nog geen tekst is — relevant voor de sessie-comment-pil, die (anders dan het per-set icoon) altijd klikbaar is, ook als er nog geen sessienotitie bestaat.
- **Sessienotitie-opslag**: er bestond nog geen notitieveld op sessieniveau — toegevoegd als `sessionNote` (string) op hetzelfde workout-document als de oefeningen, `users/{uid}/workouts/{date}.sessionNote`, naast het bestaande `exercises`-veld. In-memory bijgehouden in een nieuwe `db.sessionNotes[date]`-map (los van `db.workouts[date]`, dat een array blijft — geen wijziging aan de bestaande array-vorm om alle bestaande code die daarvan uitgaat niet te raken). `persistWorkout()` en de nieuwe `saveSessionNote()` schrijven allebei met `{ merge: true }` zodat ze elkaars veld niet overschrijven.

## All Exercises-scherm (`#screen-exercises`) — edit/delete/favorite

- **Info-icoon (ⓘ) per oefening verwijderd** uit `renderExerciseItem()` — de onderliggende Exercise Info-functionaliteit (`openExerciseInfo()`, `#screen-exercise-info`) bestaat nog gewoon en blijft bereikbaar via het ⓘ-icoon in de training-toolbar (`btn-training-info`); alleen déze ene toegangsweg is weg.
- **Drie-puntjes-menu per oefening** (`.exercise-item-dots`) opent `showOverflowMenu()` (hetzelfde generieke dropdown-component als overal elders in de app, bv. bij categorieën) met altijd dezelfde drie items: **Edit**, **Delete** (rood/`danger`), **Favorite/Unfavorite** — géén onderscheid meer tussen built-in en custom oefeningen (zie hieronder voor hoe dat technisch kan voor built-ins, die geen eigen Firestore-document hebben).
- **Edit** hergebruikt het "New Exercise"-scherm (`#screen-new-exercise`, zie "Exercise-formulier" hieronder) — titel wisselt naar "Update Exercise" (`#new-ex-title`), het "save and add another"-knopje (✓+) wordt verborgen (`.hidden`) zodat alleen het enkele vinkje overblijft, en alle velden worden vooringevuld (`openEditExerciseScreen(ex)`). Bij opslaan (`updateExistingExercise()`): als de naam wijzigt, wordt die **overal** waar de oefening bij naam gerefereerd wordt hernoemd — `db.custom_exercises`, elke gelogde set in `db.workouts` (elke betrokken dag opnieuw gepersisteerd via `setWorkout()`), `db.records[naam]` (PR-tabel) en `db.favoriteExercises[naam]`. Naam is in deze app de enige stabiele identifier voor een oefening (geen losse id's), dus een rename raakt potentieel al deze plekken. **Edit van een built-in** (geen bestaande `db.custom_exercises`-entry) converteert 'm bij het opslaan naar een nieuwe custom-entry en verbergt de originele built-in-naam (`db.hiddenBuiltins`, zie hieronder).
- **Delete-bevestiging** (`#delete-exercise-overlay`): titel "Delete Exercise" (standaard modal-titel, zie "Modals" hieronder). Aantal getoonde "workouts" = aantal dagen (`db.workouts`-sleutels) waarin de oefening voorkomt, live berekend bij het openen. Checkbox gate't de Delete-knop (`disabled` totdat aangevinkt, hergebruikt `.btn-danger:disabled`-styling). Bevestigde delete verwijdert de oefening — uit `db.custom_exercises` als het een custom-oefening is, anders (built-in) door de naam aan `db.hiddenBuiltins` toe te voegen — **plus** cascadeert door elke dag in `db.workouts` (sets van deze oefening eruit filteren, dag verwijderen als 'ie daarna leeg is — via de bestaande `setWorkout()`-logica), plus opschonen van `db.records`/`db.favoriteExercises`. Deze cascade-logica was al naam-gebaseerd en maakte al geen onderscheid tussen built-in/custom.
- **Built-in oefeningen bewerkbaar/verwijderbaar maken**: `EXERCISE_DB` (`exercises.js`) is statische, gedeelde broncode zonder per-gebruiker Firestore-document — bewerken/verwijderen kan er dus niet direct op. Opgelost met twee nieuwe, naam-gebaseerde mechanismen (zelfde patroon als `db.favoriteExercises`):
  - `db.hiddenBuiltins` (map `{naam: true}`) — per-gebruiker Firestore-document `users/{uid}/meta/hidden_builtins` → `{ names: [...] }`. `allExercises()` filtert built-ins die hierop staan (of al een custom-override met dezelfde naam hebben) eruit vóór ze met `db.custom_exercises` samengevoegd worden.
  - Editen van een built-in zet 'm dus om in een gewone custom-oefening (zie boven); deleten verbergt de naam zonder een custom-entry aan te maken.
  - **"Reset to default" bijgewerkt**: `meta/hidden_builtins` toegevoegd aan de lijst met te verwijderen documenten (naast `meta/favorites`) — anders zou een reset verborgen/bewerkte built-ins niet terugzetten naar hun oorspronkelijke staat.
  - Geverifieerd met een headless end-to-end test: een built-in oefening bewerken (naam + type gewijzigd) resulteert in precies één custom-entry in `allExercises()`, geen dubbele/verweesde originele built-in-regel.
- **Zoekbalk-breedte, met een gedeelde klasse i.p.v. toevallig gelijke getallen**: `.search-bar`, `.category-item` en `.exercise-item` delen nu allemaal de klasse `.list-row` (`width: 100%; box-sizing: border-box; margin: 0; padding-left: 16px; padding-right: 16px`) voor hun horizontale box-model, in plaats van dat elk hun eigen `padding: … 16px`-declaratie had die er toevallig hetzelfde uitzag. Geverifieerd met een headless render + exacte `getBoundingClientRect()`-meting: `left: 0, right: 390, width: 390` voor beide, op de pixel identiek. De zoekbalk-input zelf is de gedeelde omrande input met het zoek-icoon erin.
- **Favorites**: nieuw top-level Firestore-document `users/{uid}/meta/favorites` → `{ names: [...] }`, in-memory als `db.favoriteExercises` (map `{naam: true}`, zelfde patroon als `db.sessionNotes`) — een aparte opslag omdat naam de enige gedeelde sleutel is tussen built-in én custom oefeningen (built-ins hebben geen eigen Firestore-document om een veld op te zetten). Ook toegevoegd aan de "Reset to default"-opruimlijst zodat een volledige reset ook favorieten wist.
  - Gevuld sterretje in `--primary` vóór het drie-puntjes-icoon in de lijst (`.exercise-item-fav-star`) zodra `isFavoriteExercise(naam)` waar is.
  - **"Favorites"-categorie**: verschijnt bovenaan `renderCategoryBrowser()` (vetgedrukt, sterretje ervoor, `.category-item-favorites`) zodra `Object.keys(db.favoriteExercises).length > 0`, en verdwijnt automatisch weer zodra de laatste favoriet unfavorited wordt (opnieuw geverifieerd met een headless render). Klikken erop rendert `renderFavoriteExercises()` — een cross-categorie filter, met een sentinel-waarde (`FAVORITES_CATEGORY = '__favorites__'`) voor `currentBrowseCategory` zodat de bestaande terug-knop-/zoek-logica (die anders op een echte categorienaam rekent) 'm correct herkent en de juiste view opnieuw rendert als je begint te zoeken en het zoekveld weer leegmaakt.

## Modals (`.overlay` bottom sheets) — één gedeeld visueel contract

Generieke `.overlay` / `.overlay-panel` classes: `--scrim`, paneel schuift van onderen omhoog, `--radius-lg` op de bovenhoeken, padding 16. **Elke** pop-up in de app is hierop gebouwd (New Plan, Presets, Calendar-detail, Timer, Set note, Category rename/delete, Delete Exercise, New Exercise (legacy quick-add), Reset to default, Comment, New Category) — daardoor is dit ook precies de plek om het gedeelde modal-contract vast te leggen: wijzig je deze basisregels, dan krijgt elke bestaande én toekomstige modal het automatisch mee, zonder dat je 12 losse componenten hoeft aan te passen.

- **Titel altijd hetzelfde**: `.overlay-panel h3` op niveau Kop (16px/500) in `--primary` is de stijl voor élke `<h3>` binnen een modal (alle 16 bottom-sheet-popups, incl. Field-picker, Delete Exercise en Calendar-detail), zonder onderstreping en zonder per-modal kleur- of gewichtsafwijking. Voeg geen losse titelklassen toe die dit overschrijven.
- **Actieknoppen**: `.btn`-blokken in `.overlay-btns { display: flex; gap: 12px; }`, **secundair links, primair/danger rechts**. `.btn-secondary` voor Cancel/Close/Done, `.btn-primary` voor de hoofdactie, `.btn-danger` voor destructieve acties (ook de Delete in de Comment-popup). Een modal met één knop (Presets, Welke dag?, Recap) zet die ook in `.overlay-btns`.
- **Elke verwijder-actie vraagt eerst bevestiging.** Acties met een eigen bevestigingspop-up (plan, plandag, plandag-oefening, categorie, oefening, Reset to default) houden die. Alle andere verwijder-acties (prullenbak in de Fitness Tracker-selectiemodus, DELETE van een set op TRACK, Delete van een opgeslagen comment) gaan via de generieke `openConfirmDelete({ title, message, onConfirm })` in `app.js` → `#confirm-delete-overlay`: zelfde opbouw als "Plan verwijderen?" (`--primary`-titel, `.cat-delete-msg` met de naam van wat verwijderd wordt, `.btn-secondary` ANNULEREN + `.btn-danger` VERWIJDEREN). Staat in de nested tier (`--z-overlay-nested`), zodat hij ook boven de comment-popup kan openen. Nieuwe verwijder-acties gebruiken deze functie in plaats van direct te verwijderen.
- **Inputs**: de gedeelde input-stijl (48px, 1px `--border`, `--radius-sm`, focus `--primary`). De vroegere `.modal-input-underline` bestaat niet meer.
- Geverifieerd met headless screenshots van meerdere modals (Delete Exercise, New Category, Comment, Reset to default) dat de titel overal `--primary` is en de knoppen overal los/afgerond ogen, geen enkele met een geërfde donkere titel of een bordered knoppenrij.

## Exercise-formulier (`#screen-new-exercise`) — New/Edit

Zowel "New Exercise" (via de "+" op het All Exercises-scherm) als "Update Exercise" (via Edit in het drie-puntjes-menu) delen dit ene scherm — zie de sectie "All Exercises-scherm" hierboven voor de Edit/Delete/Favorite-logica zelf.

- **Geen Notes-veld meer**: sectie (label, input) volledig verwijderd, en het onderliggende `notes`-veld wordt niet meer opgeslagen op nieuwe/bewerkte custom-oefeningen (bestaande opgeslagen `notes` op oude custom-oefeningen worden niet actief gewist, alleen niet meer gebruikt/getoond).
- **Dropdowns (Category/Type/…)**: `.new-ex-select` is een knop in de gedeelde omrande input-stijl met een CSS-chevron rechts — zelfde box als het NAME-veld (`.new-ex-input`). Focus-kleur `--primary`.
- **CATEGORY-rij**: de "+"-knop (nieuwe categorie) stond eerst op de labelregel, staat nu op dezelfde regel als de dropdown zelf (`.new-ex-field-row { display: flex; gap: 10px }`, select `flex:1` + 48×48 "+"-knop (secundaire knopstijl) ernaast).
- Secties: padding 16 (gutter), `.section-label` met 8px eronder, dan de input.
- **"New Category" is nu een echte modal** (`#new-category-overlay`, hergebruikt het gedeelde modal-contract hierboven) i.p.v. de vroegere inline uitklap-rij met een apart rond bevestig-knopje. Titel "New Category" (blauw, automatisch via de modal-basisregel), het gedeelde tekstveld, twee losse knoppen Cancel/Save. Bij Save: categorie toegevoegd aan de `<select>`-opties én meteen geselecteerd, modal sluit.
- **TYPE-opties**: Weight and Reps / Reps Only / Duration / **Distance** (nieuw). Onderzocht hoe "Distance" verwerkt moet worden bij het loggen, net als "Duration" — bevinding: `type` is in de hele app een **puur informatief/opgeslagen veld**, het exercise-logging scherm (`#screen-training`) toont altijd dezelfde WEIGHT+REPS-velden ongeacht de gekozen `type`, ook voor bestaande "Duration"-oefeningen. Er is dus geen bestaand type-afhankelijk logging-gedrag om "Distance" consistent mee te maken — toegevoegd als vierde optie op exact dezelfde (niet-functionele) manier als Duration, in plaats van in deze wijziging óók meteen een ongevraagde losse duur/afstand-invoer op het logging-scherm te bouwen.
- **WEIGHT UNIT-opties**: alleen **Kilogram** (`value="kg"`) en **Pounds** (`value="lbs"`) — de tussenlaag-optie "Default (kgs)" (`value="default"`) is weg. Nieuwe/bewerkte oefeningen krijgen altijd expliciet `kg` of `lbs`; het Edit-scherm toont bestaande custom-oefeningen met de oude `weightUnit: 'default'`-waarde (of zonder waarde) als "Kilogram", zodat er geen kapotte/lege dropdown-status ontstaat voor reeds opgeslagen data.

## Workout Plan Builder (alle schermen onder het hoofdmenu-item)

Trainingsplannen, Plan schedule, Plan detail, Dag bewerken, AI genereren en de Laden-flow (hergebruikt `#screen-exercises`) volgen het gedeelde systeem: de standaard `.toolbar`, `--bg`-body en kaarten met `--radius-lg`/`--card-shadow`, 16px gutter, 12px tussen kaarten. `.plan-screen` markeert de schermen alleen en zet zelf geen kleuren.

- Kleine kopjes ("MIJN PLANNEN", "WEEK A/B", "AANTAL DAGEN", AI-formulierlabels, Sets/Reps-labels in de pop-up) gebruiken de gedeelde `.section-label`.
- Volle-breedte acties: Doorgaan `.btn.btn-primary.btn-block`, Generate Plan `.btn.btn-ai.btn-block`; pop-ups gebruiken `.btn-primary`/`.btn-secondary`/`.btn-danger`.
- Selectiestaat (dagenaantal, dagindeling, weekdagen, AI-chips, Gelijke/Andere reps): de gedeelde choice-control-stijl → geselecteerd vol `--primary` met witte tekst.
- "Actief plan" (ster in de toolbar, ACTIEF-badge, ACTIEF PLAN-strook) en de dagnummer-rondjes zijn `--primary`; de inactieve ster is `--toolbar-icon-muted`.
- Bewerk-acties op Plan detail (potloodjes, "Dag toevoegen") zijn `--primary`, "Week toevoegen" is `--success`, verwijderen `--danger`. Bewerk-/verwijderknoppen 40×40 (tikvlak 48), `--radius-sm`.

## Toast-melding (banner)

- Eén gedeeld element `#toast` (`.toast` = clip-schil, `.toast-msg` = gekleurde balk) en één functie `toast(msg, { type, duration })` in `app.js`; alle meldingen in de app gaan hierdoor, nooit een eigen implementatie.
- **Volle-breedte banner direct onder de header** (`top: toolbar-height + safe-top`, dus onder statusbalk/notch), bedekt tijdelijk de TRACK/HISTORY/GRAPH-tabbalk. Schuift naar beneden/boven (`transform`, .22s); de schil heeft `overflow: hidden` zodat de balk nooit over de header heen schildert. `pointer-events: none`, dus tikken gaan erdoorheen.
- Tekst `--on-primary`, Body-niveau vet, gecentreerd, wrapt bij lange meldingen; geen icoon in de balk.
- Kleuren: `--success` (standaard, geen `type` nodig), `--danger` (fout), `--pr-gold` (PR). Geen eigen toast-tokens meer. Fout blijft 4s, de rest 2s. Een PR-toast ("🏆 Personal record! 🏆") vervangt "Set saved" volledig.
- Elke Firestore-schrijffout gaat via `persistFailed` → rode "Couldn't save — check your connection".

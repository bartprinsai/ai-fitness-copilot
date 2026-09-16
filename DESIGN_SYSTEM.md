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
| `--color-ai-coach-accent` | `#22c55e` | Accentkleur voor AI-gedreven features (bv. AI Coach-tegel). Bewust een ander groen dan `--green` (dat is de bestaande SAVE-knopkleur) — dit is de eerste kleur van een groeiende "AI-feature"-accentfamilie, te onderscheiden van de FitNotes-cyaan die voor kernfunctionaliteit (loggen, tracken) blijft staan. |

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
- PR-trofee-icoon (los van de toolbar, gebruikt in set-rijen/history/kalender-popup) is altijd een gevulde `--cyan` trofee (`.set-pr-icon` / `.history-set-pr`), consistent op elke plek waar een PR getoond wordt.
- AI-features gebruiken een sparkle/sterren-icoon (Material Icons "auto_awesome"-pad) in `--color-ai-coach-accent` i.p.v. de generieke chat-bubble die eerder als placeholder diende (zie AI Coach-tegel hieronder) — dit is het te herhalen icoon/kleur-patroon voor toekomstige AI-features (bv. straks de Chat Coach zelf).

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
- **Lege-workoutlog-tegels ("Start New Workout" / "AI Coach") staan gecentreerd, niet edge-to-edge.** `.home-empty-actions` gebruikt `justify-content: center` met een vaste `gap: 40px` tussen de tegels i.p.v. `flex: 1` per tegel (dat rekte ze voorheen over de volle breedte uit).
- **AI Coach-tegel heeft een eigen accentkleur** (`--color-ai-coach-accent`, groen) i.p.v. de standaard cyaan — dit is bewust het enige element op dit scherm dat afwijkt qua kleur, om AI-features visueel te onderscheiden van kernfunctionaliteit. "Start New Workout" blijft cyaan (de hoofdkleur) omdat het geen AI-feature is.
- Icoon van de AI Coach-tegel is het Material "auto_awesome" sparkle-icoon (drie sterretjes), ter vervanging van de eerdere chat-bubble die niets met de tegel-tekst te maken had.

Volgende schermen die aan deze eigen identiteit meebouwen: volg hetzelfde patroon — witte toolbar-iconen blijven de vaste basis (zie Iconen hierboven), maar layout/spacing/accentkleuren mogen per scherm bewust van de FitNotes-referentie afwijken zodra dat expliciet gevraagd wordt.

## Overlays (bottom sheets)

Generieke `.overlay` / `.overlay-panel` classes: donker scrim, paneel schuift van onderen omhoog, `border-radius: 12px 12px 0 0`. Bevat meestal een `<h3>` titel, invoerveld(en) (`input[type=text]`, `select`, of sinds dit scherm ook `textarea`), en een knoppenrij (`.overlay-btns` met `.btn-secondary` + `.btn-primary`, of alleen `.btn-primary` bij een puur informatieve overlay zoals de records-lijst).

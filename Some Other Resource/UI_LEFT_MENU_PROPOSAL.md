# Left Menu — UI Proposal

Scope: the left panel (`#panel`) only — the `Ocean / Atmosphere / Land` choices,
the `Explore a place` block, and the footer hints. The masthead, readout,
destination card and camera flow stay as they are unless noted.

Status: proposal for review. Nothing in `index.html` / `styles.css` has changed yet.

---

## 1. What exists today

```
  E/I/J  EARTH INFORMATION JUKEBOX
         PHASE 2 · ALPHA TEST

  EXPLORE EARTH
  What do you
  want to hear?

  │ 🌊  OCEAN            Listen to Earth's oceans
  │ 🌧  ATMOSPHERE       Listen to Earth's atmosphere
  │ 🌱  LAND             Listen to Earth's land

  ─────────────── or ───────────────

  ┌─────────────────────────────────┐
  │ EXPLORE A PLACE                 │
  │ COX'S BAZAR                     │
  │ 1 region available              │
  └─────────────────────────────────┘

  DRAG ROTATE     SCROLL ZOOM
```

Aesthetic to preserve:

- dark space background, no filled cards except the mobile drawer
- 1px hairline borders, `rgba(178,205,236,.22)`
- mono micro-labels, uppercase, wide tracking (`.eyebrow`, `.ro-key`)
- left border on rows that brightens to `--accent` on hover
- hover = subtle horizontal gradient + 5px slide, no glow, no shadow
- everything is one column, 360px max, vertically centred

---

## 2. Why Ocean / Atmosphere / Land has to go

Those three are **Earth-system categories**, but the new dataset is organised by
**place × variable**, not by sphere:

| Old option | Problem |
|---|---|
| Ocean | Only 4 of 6 regions have sea-level data; Dhaka/Sylhet are inland and `SEA_LEVEL_mm = 0` (N/A) |
| Atmosphere | Temperature + rain + air + CO₂ are all "atmosphere", so the bucket is ambiguous |
| Land | NDVI, canopy, night lights, groundwater — also "land" |

The dataset's own structure is **6 EIC pillars** (sea level, air, carbon, night
lights, canopy, disasters) plus the two weather variables. So the menu should be
built from **regions** (where to listen) and **signals** (what to hear), not spheres.

---

## 3. The information model

Two axes, both searchable:

```
PLACES  (6 now, more later)          SIGNALS  (10)
──────────────────────────          ──────────────────────────
dhaka                                T2M_C            temperature
chittagong                           PRECTOTCORR_mm   rain
sylhet                               NDVI             vegetation
sundarbans                           GEDI_canopy_m    canopy
coxs_bazar                           GRACE_ewh_cm     groundwater
kutubdia_saint_martin                SEA_LEVEL_mm     sea level
                                     AIR_AOD_NO2      air quality
                                     CO2_ppm          carbon
                                     NIGHT_LIGHTS_nW  night lights
                                     EXTREME_EVENTS   disasters
```

A place is a **destination** (camera flies there).
A signal is a **layer** (which voices are audible once there).

---

## 4. Three concepts

### Concept A — Place-first  ★ recommended

The panel asks "Where do you want to listen?" and lists regions. Search filters
the list. Signals appear after arrival as sound layers.

```
WHERE DO YOU WANT TO LISTEN?
⌕ search a place…
│ COX'S BAZAR        coastal shoreline
│ DHAKA              urban heat island
│ CHITTAGONG         port & hills
│ SYLHET             haor & tea gardens
│ SUNDARBANS         mangrove delta
│ KUTUBDIA + ST MARTIN  offshore islands
```

- Closest to the current flow (choose → fly → destination card).
- Scales to 20+ regions with search + scroll.
- Signals are not lost; they move to the destination card / a layer drawer.

### Concept B — Signal-first

```
WHAT DO YOU WANT TO HEAR?
│ SEA LEVEL      4 coastal regions
│ AIR QUALITY    2 urban regions
│ CARBON         3 regions
│ NIGHT LIGHTS   3 regions
│ CANOPY         2 regions
│ DISASTERS      2 regions
```

- Strongest for the EIC story, but you must pick a place afterwards, so it adds
  a second decision before the camera moves.
- Better as the **destination-screen** menu, not the solar-system menu.

### Concept C — Command palette

One search field, results grouped by type. No default list.

```
⌕ _
  PLACES
  SIGNALS
```

- Fastest for power users, but an empty panel on first load is weaker for a
  cinematic demo and for judges who just want to click.

### Recommendation

**Concept A at the solar system, Concept B at the destination**, with Concept C's
search behaviour applied to both. The left panel keeps one identity: a searchable
index of places, and the same component later lists signals.

---

## 5. Recommended wireframes

### 5.1 Solar system — default

```
  EARTH INFORMATION JUKEBOX
  ─────────────────────────────────────────────

  WHERE DO YOU
  WANT TO LISTEN?

  ⌕  Search a place…                      /
  ─────────────────────────────────────────────

  REGIONS                                   6
  ┌─────────────────────────────────────────┐
  │ ▸ COX'S BAZAR                       ›   │  hover
  │   কক্সবাজার · coastal shoreline          │
  │   1985–2026 · 10 signals                 │
  │                                          │
  │   DHAKA                             ›   │
  │   ঢাকা · urban heat island               │
  │                                          │
  │   CHITTAGONG                        ›   │
  │   চট্টগ্রাম · port & hills               │
  │                                          │
  │   SYLHET                            ›   │
  │   সিলেট · haor & tea gardens             │
  │                                          │
  │   SUNDARBANS                        ›   │
  │   সুন্দরবন · mangrove delta              │
  │                                          │
  │   KUTUBDIA + SAINT MARTIN           ›   │
  │   কুতুবদিয়া · offshore islands          │
  └─────────────────────────────────────────┘

  ↑↓ move    ⏎ select    / search
```

Notes

- `REGIONS 6` is the only count; the old "1 region available" disappears.
- The first row is pre-highlighted so `⏎` works immediately.
- The list scrolls inside the panel; the search field and footer stay pinned.
- Each row keeps the existing left-border + slide hover.

### 5.2 Solar system — typing

```
  ⌕  sea level                            ×
  ─────────────────────────────────────────────

  SIGNALS                                   1
  │ ♪ SEA LEVEL                              │
  │   SEA_LEVEL_mm · 4 coastal regions        │
  │   +247.8 mm since 1985                    │

  REGIONS                                   4
  │   SUNDARBANS        strongest rise        │
  │   KUTUBDIA + ST MARTIN                    │
  │   COX'S BAZAR                             │
  │   CHITTAGONG                              │
  ─────────────────────────────────────────────
  ↑↓ move    ⏎ select    esc clear
```

Notes

- One query searches **both** axes. A signal match surfaces the regions that
  carry it, ranked by the size of the change.
- Matching is accent- and case-insensitive, and also matches Bangla names and
  category text ("mangrove", "urban", "haor").
- `×` and `Esc` clear; `/` focuses the field from anywhere.

### 5.3 Solar system — place expanded

```
  REGIONS                                   6
  ┌─────────────────────────────────────────┐
  │ ▾ COX'S BAZAR                            │
  │   কক্সবাজার · 21.43°N  91.97°E           │
  │   Bangladesh · Bay of Bengal              │
  │                                          │
  │   TEMP      25.4 → 27.6 °C               │
  │   RAIN      2,097 → 2,412 mm             │
  │   CANOPY    8.7 → 3.3 m                  │
  │   SEA       n/a                          │
  │   LIGHTS    14 → 94 nW                   │
  │                                          │
  │   ┌────────────────┬───────────────────┐ │
  │   │   LISTEN 1985  │   LISTEN 2025     │ │
  │   └────────────────┴───────────────────┘ │
  │   ┌────────────────────────────────────┐ │
  │   │      COMPARE 1985 ↔ 2025           │ │
  │   └────────────────────────────────────┘ │
  └─────────────────────────────────────────┘
  │   DHAKA                             ›   │
  │   ...                                    │
```

Notes

- Expanding in place avoids a second panel and keeps the list context visible.
- The three year actions replace the old `Listen / Coming next` button.
- `n/a` is shown for inland sea level instead of a fake zero.
- On the 3D globe this same expansion can be skipped: click flies immediately,
  and the destination card carries the detail (see 5.4).

### 5.4 Destination — signals as layers

After the flight, the left panel swaps to the signal list for the chosen place.

```
  COX'S BAZAR
  ─────────────────────────────────────────────
  SOUND LAYERS                     6 of 10 on

  [●] ♪ TEMPERATURE      T2M_C          27.6 °C
  [●] ♪ RAIN             PRECTOTCORR    2,412 mm
  [○] ♪ VEGETATION       NDVI           0.42
  [●] ♪ CANOPY           GEDI           3.3 m
  [●] ♪ GROUNDWATER      GRACE          −12.4 cm
  [●] ♪ SEA LEVEL        SEA_LEVEL      254.9 mm
  [○] ♪ AIR QUALITY      AIR_AOD_NO2    61
  [●] ♪ CARBON           CO2            431 ppm
  [●] ♪ NIGHT LIGHTS     NIGHT_LIGHTS   94 nW
  [○] ♪ DISASTERS        EXTREME        44

  ─────────────────────────────────────────────
  1985  ●───────────────○───────────────●  2025
         PLAY 1985      COMPARE       PLAY 2025
```

Notes

- Toggles are the only new control; everything else reuses the row component.
- The year scrubber sits at the bottom of the panel, under the layers.
- `6 of 10 on` gives a quick mix read-out.

### 5.5 Compact / mobile

The panel becomes a bottom sheet (existing `@media (max-width: 760px)` pattern).

```
  ┌─────────────────────────────────────────┐
  │ ⌕  Search a place…                  ×   │
  │ ─────────────────────────────────────── │
  │ COX'S BAZAR                         ›   │
  │ DHAKA                               ›   │
  │ CHITTAGONG                          ›   │
  │ SYLHET                              ›   │
  │ ─────────────────────────────────────── │
  │ 6 regions · 1985–2026                   │
  └─────────────────────────────────────────┘
```

- Search stays pinned at the top of the sheet.
- Descriptions drop; name + chevron only.
- The sheet is capped at ~55vh and scrolls.

### 5.6 Future — many regions

When more countries/regions arrive, group by country and keep search first.

```
  ⌕  Search a place…                      /
  ─────────────────────────────────────────────
  BANGLADESH                                6
  │ COX'S BAZAR                         ›   │
  │ DHAKA                               ›   │
  │ ...                                     │
  ─────────────────────────────────────────────
  INDIA                                     3
  │ SUNDARBANS (IN)                     ›   │
  │ ...                                     │
  ─────────────────────────────────────────────
  NEPAL                                     2
  │ ...                                     │
  ─────────────────────────────────────────────
  11 regions · 1985–2026
```

- Country headers are the same `.eyebrow` style, so no new visual language.
- No virtualization needed until ~50 rows; a plain scroll container is fine.

---

## 6. Component anatomy

```
  ┌─ row (existing .choice) ─────────────────────┐
  │ │  left border, brightens on hover/active    │
  │ │  ▸/●  marker        optional               │
  │ │  NAME               .choice-name  mono     │
  │ │  native · category  .choice-desc  dim      │
  │ │  meta line          new .row-meta 9px mono │
  │ └────────────────────────────────────────────┘
```

New pieces, all built from existing tokens:

| Element | Reuses | New |
|---|---|---|
| Search field | `.place` border, `--mono` | `.search`, `.search-input`, `.search-clear` |
| Group header | `.eyebrow` | `.group-head` (adds count + hairline) |
| Region row | `.choice` | `.region-row`, `.row-meta`, `.row-chevron` |
| Signal row | `.choice` | `.signal-row`, `.toggle`, `.toggle-dot` |
| Year bar | `.divider` | `.yearbar`, `.year-track`, `.year-head` |
| Scroll area | — | `.panel-scroll` (max-height, mask fade) |

Deliberately **not** adding: cards, shadows, rounded corners, icons beyond the
existing glyph set, colour fills. The panel must stay a text index.

---

## 7. Search behaviour

- `/` or `⌘K` focuses; `Esc` clears; `↑↓` move; `⏎` opens the highlighted row.
- Debounce 80 ms; results are pure client-side over ~6–50 rows.
- Query normalisation: lowercase, strip diacritics, fold `'` and `-`.
- Match fields, in priority order:
  1. region `name_en`
  2. region `name_bn`
  3. region `category`
  4. signal `label`
  5. signal raw field name (`SEA_LEVEL_mm`)
- A signal match shows the signal first, then the regions that carry it, ranked
  by absolute delta (largest change first).
- Empty state: `No place or signal matches "xyz".` plus a `clear` action.
- No results should ever leave the panel blank without a message.

---

## 8. Accessibility

- The list is a real `<ul>`/`<button>` set, not divs, so Tab and screen readers work.
- `aria-live="polite"` on the result count ("4 regions, 1 signal").
- Toggles use `role="switch"` + `aria-checked`.
- The search input has a visible label (`Search a place or signal`), not just a placeholder.
- Focus ring = existing `:focus-visible` accent border, not a browser default.

---

## 9. Open questions

1. **Default axis** — should the solar-system panel open on **Places** (Concept A)
   or **Signals** (Concept B)? I recommend Places.
2. **Year actions** — `Listen 1985` / `Listen 2025` / `Compare`, or a single
   `Listen` that opens the layer view and lets the year bar choose?
3. **Signals at destination** — toggles (mix layers) or solo (one signal at a time)?
4. **Bangla names** — always visible in the row, or only on hover/expand?
5. **`kutubdia_saint_martin`** — one row labelled `KUTUBDIA + SAINT MARTIN`, or
   two rows sharing one dataset?
6. **Search scope** — places + signals only, or also free text over the values
   ("show regions above 30 °C")? I recommend starting with places + signals.

---

## 10. What changes in code (when approved)

- `index.html`: replace the three `.choice` buttons and `.place` block with the
  search field, group headers, and region list; add the destination signal list.
- `styles.css`: add `.search`, `.group-head`, `.region-row`, `.signal-row`,
  `.toggle`, `.panel-scroll`, `.yearbar`; keep every existing token.
- `src/config.js`: add a `REGIONS` array (id, name, bn, category, lat, lon,
  colour placeholder) replacing the single `REGION`.
- `src/ui.js`: render the list from config, wire search/filter/keyboard, and swap
  the panel between Places and Signals.
- `src/main.js`: `onSelect` takes a region id instead of `ocean|atmosphere|land`;
  the flight uses the chosen region's lat/lon.
- No camera-director changes: it already takes `region.config.lat/lon`.

The 3D region marker and atlas still point at Cox's Bazar until the per-region
imagery/placeholder work lands; the menu can ship first because it only changes
which `REGION` config is passed in.

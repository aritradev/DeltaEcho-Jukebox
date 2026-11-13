# JUKEBOX — Left Panel UI/UX Redesign Proposal

**Design Direction:** Geographic Explorer  
**Scope:** Left-side panel (`#panel`) only  
**Status:** Proposed design — pending review and approval

---

## 1. Design Objective

The current left panel presents three Earth-system categories:

- Ocean
- Atmosphere
- Land

However, the new dataset is organized around geographic destinations and their associated environmental signals. The existing category-based navigation no longer represents the underlying data structure effectively.

The proposed redesign introduces a **Geographic Explorer**: a hierarchical, searchable place navigator that allows users to discover geographic destinations without overwhelming the interface as the number of regions increases.

The primary design objective is to make the left panel scalable from a handful of destinations to hundreds without requiring another major UI redesign.

### Core principle

**Don't make the user navigate a database. Make them feel like they're exploring Earth.**

The geographic hierarchy should support exploration rather than become the experience itself.

---

## 2. Proposed Information Architecture

Instead of displaying every available region in one flat list, introduce a hierarchical geographic structure.

### Current structure

```text
PLACES
  ├── Cox's Bazar
  ├── Dhaka
  ├── Chittagong
  ├── Sylhet
  ├── Sundarbans
  └── Kutubdia + Saint Martin
```

This structure is manageable with six destinations but becomes increasingly difficult to navigate when more regions are introduced.

### Proposed structure

```text
EARTH
  │
  ├── ASIA
  │     │
  │     ├── BANGLADESH
  │     │      ├── Cox's Bazar
  │     │      ├── Dhaka
  │     │      ├── Chittagong
  │     │      ├── Sylhet
  │     │      ├── Sundarbans
  │     │      └── Kutubdia + Saint Martin
  │     │
  │     ├── INDIA
  │     │      └── Other destinations
  │     │
  │     ├── NEPAL
  │     │      └── Other destinations
  │     │
  │     └── ...
  │
  ├── AFRICA
  ├── EUROPE
  ├── NORTH AMERICA
  ├── SOUTH AMERICA
  └── OCEANIA
```

The hierarchy introduces three possible navigation levels:

**Continent → Country → Destination**

However, all three levels do not need to be implemented immediately.

For the current dataset, the panel should begin with countries and their destinations. The continent level can be introduced when the number of supported countries makes it necessary.

Country and continent are grouping mechanisms, not camera destinations.

---

## 3. Solar System Panel — Default State

The default panel should prioritize geographic discovery.

The panel should begin directly with the main question, without a branding block, introductory section, or decorative masthead.

### Proposed wireframe

```text
┌──────────────────────────────────────┐
│                                      │
│  WHERE WOULD YOU                     │
│  LIKE TO LISTEN?                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ ⌕ Search places...          / │  │
│  └────────────────────────────────┘  │
│                                      │
│  BROWSE BY COUNTRY                   │
│                                      │
│  ▼ BANGLADESH                   06   │
│  ──────────────────────────────────  │
│                                      │
│    COX'S BAZAR                    ›  │
│    Coastal shoreline                │
│                                      │
│    DHAKA                          ›  │
│    Urban heat island                │
│                                      │
│    CHITTAGONG                     ›  │
│    Port and hills                   │
│                                      │
│    SYLHET                         ›  │
│    Haor and tea gardens             │
│                                      │
│    SUNDARBANS                     ›  │
│    Mangrove delta                   │
│                                      │
│    KUTUBDIA + SAINT MARTIN        ›  │
│    Offshore islands                 │
│                                      │
│  ▶ INDIA                        03   │
│  ──────────────────────────────────  │
│                                      │
│  ▶ NEPAL                        02   │
│  ──────────────────────────────────  │
│                                      │
│                                      │
│  ↑↓ NAVIGATE     ↵ SELECT     / SEARCH│
│                                      │
└──────────────────────────────────────┘
```

*Illustrative wireframe. Additional countries are examples of future expansion, not claims about the current dataset.*

### Design decisions

- Search field remains visible at the top.
- Countries are collapsible groups.
- The currently selected country can be expanded by default.
- Destination rows appear inside their respective country groups.
- Country headers display the number of available destinations.
- Only the geographic list scrolls.
- Search and footer hints remain pinned.
- No unnecessary cards or filled containers.
- No Bangla text or secondary-language labels.
- No branding block or introductory heading above the main question.

### Why this approach?

**Progressive disclosure:** Users only see destinations belonging to expanded geographic groups.

**Scalability:** Adding destinations does not create an increasingly long, visually overwhelming list.

**Consistency:** Every country follows the same interaction pattern.

**Maintainability:** New geographic groups can be introduced without redesigning the destination row.

---

## 4. Search Experience

Search should work as a temporary discovery interface rather than turning the default panel into a command palette.

It should search geographic destinations across all supported countries.

### 4.1 Empty search

When the search field is empty, the normal country-based geographic browser remains visible.

```text
WHERE WOULD YOU
LIKE TO LISTEN?

┌────────────────────────────────┐
│ ⌕ Search places...          / │
└────────────────────────────────┘

BROWSE BY COUNTRY

▼ BANGLADESH                   06
  COX'S BAZAR
  DHAKA
  CHITTAGONG
  SYLHET
  ...

▶ INDIA                        03
▶ NEPAL                        02
```

### 4.2 Search results

When a user searches for a destination, matching results appear in a flat list grouped by country.

Example: Searching for "sundar".

```text
┌──────────────────────────────────────┐
│  ⌕ sundar                       ×   │
│                                      │
│  MATCHING PLACES                02   │
│                                      │
│  BANGLADESH                          │
│                                      │
│  │ SUNDARBANS                    ›  │
│  │ Mangrove delta                   │
│                                      │
│  INDIA                               │
│                                      │
│  │ SUNDARBANS                    ›  │
│  │ Mangrove ecosystem               │
│                                      │
│  ──────────────────────────────────  │
│  2 matching places                  │
│                                      │
│  ESC CLEAR       ↵ SELECT            │
└──────────────────────────────────────┘
```

### Search behavior

- Search across all available destinations.
- Match English names, country names and destination descriptions.
- Matching should be case-insensitive and accent-insensitive.
- Results should be grouped by country.
- Selecting a result should trigger the normal destination-selection flow.
- Clearing the query should restore the geographic browser.

### 4.3 Empty results

Never leave the panel blank when there are no matches.

```text
┌──────────────────────────────────────┐
│  ⌕ xyz                         ×   │
│                                      │
│                                      │
│          NO PLACES FOUND             │
│                                      │
│    Try another place or region.      │
│                                      │
│             CLEAR SEARCH             │
│                                      │
└──────────────────────────────────────┘
```

---

## 5. Scalable Navigation Strategy

The geographic explorer should evolve gradually as the dataset expands.

### Stage 1 — 6 to 20 destinations

Use country-based grouping.

```text
BROWSE BY COUNTRY

▼ BANGLADESH                   06
  COX'S BAZAR
  DHAKA
  CHITTAGONG
  SYLHET
  ...

▶ INDIA                        03
▶ NEPAL                        02
```

### Stage 2 — 20 to 60 destinations

Keep country groups but make search more prominent.

```text
WHERE WOULD YOU
LIKE TO LISTEN?

⌕ Search places...

BROWSE BY COUNTRY

▼ BANGLADESH                   18
▶ INDIA                        14
▶ NEPAL                        08
▶ PAKISTAN                     12
```

### Stage 3 — 60 to 200+ destinations

Introduce continent-level navigation.

```text
WHERE WOULD YOU
LIKE TO LISTEN?

⌕ Search places...

BROWSE BY REGION

▶ ASIA
▶ AFRICA
▶ EUROPE
▶ NORTH AMERICA
▶ SOUTH AMERICA
▶ OCEANIA
```

Selecting Asia:

```text
‹ ALL REGIONS

ASIA

▶ BANGLADESH               18
▶ INDIA                    24
▶ NEPAL                     08
▶ PAKISTAN                 12
```

Selecting Bangladesh:

```text
‹ ASIA

BANGLADESH

⌕ Search Bangladesh...

COX'S BAZAR
DHAKA
CHITTAGONG
SYLHET
...
```

This creates a predictable navigation hierarchy without requiring all geographic levels to be visible simultaneously.

**Important:** These stages are design evolution guidelines, not rigid thresholds. The transition should depend on actual content density and usability rather than destination count alone.

---

## 6. Destination Selection

The geographic explorer should remain responsible for selecting a destination.

When a user selects a region:

1. The selected destination is identified through its unique ID.
2. The destination's geographic coordinates are passed to the existing camera system.
3. The existing camera transition begins.
4. The left panel transitions from geographic discovery to the destination's signal interface.

The existing camera flow should remain unchanged.

### Destination row design

```text
▼ BANGLADESH                   06

│ COX'S BAZAR                 ›
│ Coastal shoreline

│ DHAKA                       ›
│ Urban heat island

│ CHITTAGONG                  ›
│ Port and hills

│ SYLHET                      ›
│ Haor and tea gardens
```

Descriptions are secondary information. They should not compete visually with destination names.

---

## 7. Destination Panel — Signal Discovery

Once the camera reaches a destination, the left panel changes its responsibility.

The solar-system panel answers:

**Where would you like to listen?**

The destination panel answers:

**What would you like to hear?**

The signal interface should be separate from the geographic browser.

### Proposed wireframe

```text
┌──────────────────────────────────────┐
│                                      │
│  COX'S BAZAR                         │
│  BANGLADESH                          │
│                                      │
│  ──────────────────────────────────  │
│                                      │
│  EXPLORE THE SIGNALS                 │
│                                      │
│  10 EARTH SIGNALS                    │
│                                      │
│  SOUND LAYERS                        │
│                                      │
│  ● TEMPERATURE          27.6 °C      │
│  ● RAIN                 2412 mm      │
│  ○ VEGETATION           0.42         │
│  ● CANOPY               3.3 m        │
│  ● GROUNDWATER         -12.4 cm      │
│  ● SEA LEVEL            254.9 mm     │
│  ○ AIR QUALITY          61           │
│  ● CARBON               431 ppm      │
│  ● NIGHT LIGHTS         94 nW        │
│  ○ DISASTERS            44           │
│                                      │
│  ──────────────────────────────────  │
│                                      │
│  1985 ─────────●────────── 2025      │
│                                      │
│  PLAY       COMPARE       PLAY       │
│                                      │
└──────────────────────────────────────┘
```

### Interaction decisions

- Multiple signal layers can be enabled simultaneously.
- Toggles control which signals are included in the audio experience.
- Provide an optional solo action for listening to one signal independently.
- Show unavailable data as `N/A`, never as zero.
- Display the number of enabled layers.
- The year selector controls the selected listening period.
- Compare allows the user to compare two supported time periods.

The actual number of available signals should be derived from the selected destination's dataset rather than hardcoded.

---

## 8. Visual Design Language

The redesigned panel should preserve the existing JUKEBOX aesthetic.

### Preserve

- Dark space background.
- Minimal, cinematic interface.
- Thin 1px hairline borders.
- Existing `rgba(178,205,236,.22)` border treatment.
- Monospace micro-labels.
- Uppercase typography.
- Wide letter spacing.
- Existing accent color.
- Left-border interaction on destination rows.
- Subtle horizontal hover gradient.
- Existing 5px horizontal hover movement.
- No unnecessary glow or shadows.

### Proposed component styling

| Element | Design direction |
|---|---|
| Main heading | Two-line editorial heading |
| Search field | Minimal bordered input |
| Country header | Existing eyebrow typography with count |
| Destination row | Existing `.choice` styling |
| Selected destination | Persistent accent left border |
| Hover state | Existing gradient and horizontal movement |
| Description | Small, muted secondary text |
| Count | Right-aligned monospace number |
| Scroll container | Independent vertical scrolling |
| Footer | Fixed to the bottom of the panel |

### Deliberately avoid

- Rounded cards.
- Heavy background fills.
- Box shadows.
- Excessive icons.
- Large decorative graphics.
- Multiple competing accent colors.
- Showing all destination metrics in the geographic browser.
- Bangla labels or multilingual secondary text.
- Unnecessary branding or introductory blocks inside the panel.

The left panel should remain a restrained text-based navigation interface.

---

## 9. Interaction and Accessibility

### Keyboard navigation

| Key | Action |
|---|---|
| `/` | Focus search |
| `Ctrl + K` / `Cmd + K` | Focus search |
| `↑` / `↓` | Navigate results |
| `Enter` | Select highlighted destination or expand group |
| `Esc` | Clear search or return to previous navigation level |
| `Tab` | Move through interactive controls |

Keyboard interactions must not interfere with existing camera controls or text input.

### Accessibility

- Use semantic lists and buttons.
- Provide a visible search label.
- Use `aria-expanded` for collapsible country groups.
- Use `aria-live="polite"` for search result counts.
- Provide visible `:focus-visible` styling using the existing accent color.
- Use accessible labels for signal switches.
- Maintain sufficient contrast for secondary text.
- Preserve logical keyboard navigation order.

---

## 10. Responsive Behavior

On compact screens, the existing bottom-sheet pattern should be preserved.

### Mobile wireframe

```text
┌──────────────────────────────────────┐
│                                      │
│  WHERE WOULD YOU                     │
│  LIKE TO LISTEN?                     │
│                                      │
│  ⌕ Search places...              ×  │
│  ──────────────────────────────────  │
│                                      │
│  ▼ BANGLADESH                   06   │
│                                      │
│    COX'S BAZAR                    ›  │
│    DHAKA                          ›  │
│    CHITTAGONG                     ›  │
│    SYLHET                         ›  │
│                                      │
│  ▶ INDIA                        03   │
│  ▶ NEPAL                        02   │
│                                      │
│  ──────────────────────────────────  │
│  6 destinations · Bangladesh        │
│                                      │
└──────────────────────────────────────┘
```

### Mobile rules

- Keep search pinned at the top.
- Hide secondary destination descriptions.
- Maintain compact destination rows.
- Keep country groups collapsible.
- Cap the bottom sheet at approximately 55vh.
- Allow independent scrolling inside the sheet.
- Preserve the existing dark background and hairline borders.

---

## 11. Proposed Data Architecture

The interface should not depend on a flat, hardcoded list of destinations.

Introduce a geographic hierarchy that separates geographic metadata from UI components.

The data structure should support:

- Unique destination identification.
- Geographic parent-child relationships.
- Country-based grouping.
- Future continent-based grouping.
- Destination-specific coordinates.
- Destination-specific dataset references.
- Different signal availability across destinations.

### Architectural requirements

1. Every destination must have a stable, unique ID.
2. Geographic hierarchy must remain independent of UI components.
3. Search must operate on destination metadata.
4. Country and continent groups should be generated from data.
5. Camera navigation must use the selected destination's coordinates.
6. Signals must belong to datasets or destinations, not geographic categories.
7. Missing values must be represented explicitly as unavailable.
8. A destination may have multiple signals, and different destinations may have different signal availability.
9. Geographic grouping must not assume that every destination has the same dataset structure.

The initial implementation should use country-level grouping. Continent-level grouping can be introduced later without replacing the destination row component.

---

## 12. Implementation Scope

Only the left-side panel should be modified.

### `index.html`

- Remove the existing Ocean, Atmosphere and Land choices.
- Remove the old Explore a Place block.
- Remove the branding and introductory sections from the panel.
- Introduce the main question as the first visible element.
- Introduce the geographic search field.
- Introduce collapsible country groups.
- Add destination rows.
- Add the destination signal list.
- Preserve the existing panel structure wherever practical.

### `styles.css`

Introduce or extend:

- `.search`
- `.search-input`
- `.search-clear`
- `.group-head`
- `.country-group`
- `.region-row`
- `.region-meta`
- `.region-chevron`
- `.panel-scroll`
- `.signal-row`
- `.toggle`
- `.yearbar`

Reuse existing design tokens and existing interaction styles.

### `src/config.js`

- Introduce the geographic hierarchy.
- Define destination metadata.
- Define country relationships.
- Maintain unique destination IDs.
- Keep signal availability associated with the corresponding datasets.

### `src/ui.js`

- Render country groups dynamically.
- Render destination rows dynamically.
- Implement expand/collapse behavior.
- Implement geographic search.
- Implement keyboard navigation.
- Render signal layers at the destination.
- Maintain selected destination and enabled signal states.

### `src/main.js`

- Change destination selection to accept a region ID.
- Resolve the corresponding geographic configuration.
- Pass the selected destination's coordinates into the existing camera flow.

**Important:** No camera-director changes are required for this proposal. The existing camera flow should remain untouched.

The existing 3D region marker and atlas may continue using Cox's Bazar until per-region imagery and marker support are implemented.

---

## 13. Final Design Decisions

| Design question | Decision |
|---|---|
| Default navigation | Geographic places |
| Geographic grouping | Country |
| Future hierarchy | Continent → Country → Destination |
| Search behavior | Search destinations across all countries |
| Search result layout | Flat results grouped by country |
| Country expansion | Collapsible |
| Language | English only |
| Destination selection | One selection triggers camera flight |
| Signal navigation | Separate destination interface |
| Signal interaction | Multiple enabled layers with optional solo |
| Year selection | One destination-level year selector |
| Missing values | Display `N/A`, never zero |
| Mobile layout | Existing bottom-sheet pattern |
| Panel introduction | Main question directly; no branding block |

---

## 14. Expected Outcome

The redesigned left panel should provide:

- A more intuitive geographic discovery experience.
- Better alignment with the new dataset structure.
- Scalable navigation for additional countries and destinations.
- Search without sacrificing the cinematic first impression.
- Clear separation between geographic discovery and signal exploration.
- Consistent interaction patterns across desktop and mobile.
- Minimal disruption to the existing camera and visual systems.
- A cleaner interface without unnecessary introductory elements or multilingual text.

### Final design direction

**Solar System:** Geographic Explorer — discover and select destinations.

**Destination:** Signal Explorer — discover, enable and listen to environmental signals.

**Future:** Expand geographic navigation from country-level to continent-level without fundamentally redesigning the panel.

The left panel should remain visually quiet and restrained. The 3D Earth is the centerpiece; the panel exists to guide the user's exploration, not compete with it.
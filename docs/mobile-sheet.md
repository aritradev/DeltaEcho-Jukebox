# Mobile explorer sheet

The mobile explorer is a three-snap bottom sheet. It shares the existing Places and
Signals content, keeps the globe interactive, and does not change the camera
choreography or desktop layout.

This document is the authoritative contract. The two design proposals under
`Some Other Resource/` are retained as history and are superseded.

---

## 1. Breakpoints

The sheet is active at:

```css
(max-width: 820px), (max-width: 1024px) and (max-height: 560px)
```

`src/ui.js` uses the same media query for `isMobileSheet()`, so CSS and JavaScript
cannot disagree about whether the sheet is active. A phone in landscape (for
example 844 × 390) therefore uses the sheet, while a normal desktop window does
not.

---

## 2. States

| State | Meaning | User reachable |
| --- | --- | --- |
| `peek` | 64px summary bar; default resting state | yes |
| `half` | Browsing height | yes |
| `full` | Expanded height with scrim | yes |
| `hidden` | Zero height during flights and approach | no |

`peek` is the minimum. There is no user-reachable dismissed state, so the explorer
can always be reopened from its bar.

### Mode matrix

| Application condition | Sheet state | View |
| --- | --- | --- |
| Initial load, `SOLAR` | PEEK | Places |
| `EXPLORE` | PEEK, HALF, or FULL | Places |
| `FLYING`, approach, continent, locality | HIDDEN | last view |
| `ATLAS` landing | HALF | Signals |
| `ATLAS` after user collapse | PEEK | Signals |
| After Back settles | PEEK | Places |

Selecting a destination changes the sheet directly to `hidden`; it never passes
through PEEK on the way to the flight.

---

## 3. Geometry

All heights include the bottom safe-area inset through the panel’s padding box.

| Property | Value |
| --- | --- |
| PEEK | `64px + safe-area-inset-bottom` |
| Places HALF | `min(52dvh, 320px) + safe inset` |
| Signals HALF | `min(66dvh, 450px) + safe inset` |
| FULL | `min(84dvh, 520px, visualViewport height - 12px) + safe inset` |
| Short places HALF | `min(62dvh, 320px) + safe inset` |
| Short places FULL | `min(72dvh, 440px) + safe inset` |
| Short signals HALF | `min(78dvh, 460px) + safe inset` |
| Short signals FULL | `min(88dvh, 520px) + safe inset` |
| Handle | 32 × 2px |
| Minimum touch target | 44px |
| Transition | 220ms `cubic-bezier(.22, .61, .36, 1)` |
| Scrim | `rgba(3, 6, 12, 0.45)`, FULL only |

HALF is content-aware. Places needs less height than Signals because Signals also
has to keep the region switcher and the year bar visible.

On short landscape screens the Signals view becomes a two-column grid: scrollable
signal list on the left, year controls on the right, with the region switcher
spanning both columns above them. This is a presentation of the same Signals view,
not a fourth snap state. The comparison interval selector is hidden in short
landscape HALF to leave room for the slider and year actions; it is available in
FULL.

---

## 4. Ownership

`src/ui.js` is the only owner of panel presentation.

```js
setSheetState(state, { animate, focus }) // peek | half | full | hidden
showPanel(duration, { state })
hidePanel(duration, { delay })
showPlaces()
showSignals(region)
syncPeek()
handleEscape()
collapseOnGlobe()
```

Desktop `hidePanel`/`showPanel` keep the GSAP opacity/transform animation. Mobile
uses `data-sheet` and height transitions. `main.js` requests state; it never writes
`data-sheet`, ARIA, or panel styles.

`hidePanel` ignores its delay on mobile, which is what removes the old delayed
timer race during destination selection.

---

## 5. Interaction rules

### PEEK bar

- Tap: PEEK → HALF; HALF → PEEK; FULL → HALF.
- ArrowUp/ArrowDown: move one snap.
- Home/End: PEEK/FULL.
- Vertical drag on the bar: move one snap past a 24px threshold.
- PEEK downward drag is a no-op.
- Horizontal gestures on the bar are ignored and do not toggle the sheet.
- The bar carries `aria-expanded`; it is the keyboard and screen-reader control.

The handle is not the only way to expand or collapse; tapping the whole bar works.

### List and globe

- Lists scroll independently inside the sheet.
- The sheet body is not a drag handle.
- Touching the visible globe while the sheet is HALF collapses it to PEEK on
  `pointerdown`.
- The same pointer sequence still reaches `ExplorerControls`; the globe rotates in
  the same gesture. No synthetic events are created.
- FULL is covered by the scrim, so the globe is not interactive until the sheet
  collapses.

### Scrim and Escape

- Scrim appears only in FULL and clicking it returns to PEEK.
- Escape precedence:
  1. region switcher menu open: close it and restore focus to the header;
  2. search field focused: clear or blur;
  3. FULL → HALF;
  4. HALF → PEEK;
  5. otherwise, the existing app Escape behavior runs (Skip/Back).

### Search and keyboard

- Focusing search promotes the sheet to FULL.
- `visualViewport` sets `--vvh` and lifts the sheet by the keyboard overlap
  (`--kb-lift`).
- While the keyboard is open, the masthead and readout are hidden to avoid overlap;
  the PEEK bar remains as the close control.
- Blurring an empty search restores the previous snap state (usually HALF). A
  non-empty query stays in FULL.

### PEEK summary

- Places: `places · 06`, value = selected destination (Cox's Bazar on first load).
- Signals: `signals · {region}`, value = available enabled layers and year.
- Counts exclude unavailable signals.

---

## 6. Views

- Places lays out search and a compact Sound Lab link on one 44px row, with
  `#place-scroll` beneath both. This keeps the Lab reachable without spending a
  separate vertical row on it.
- Places HALF hides the decorative page title, the guidance sentence, and the
  country header so destination rows remain visible. FULL restores guidance and the
  header on tall screens; short landscape keeps the title hidden.
- A map preparation banner appears at the top of `#place-scroll`. It reports
  progress, promotes PEEK to HALF, and exposes Retry after failure and Cancel while
  pending. The sheet remains otherwise interactive.
- Signals HALF keeps the destination title and switcher chevron but hides the
  eyebrow and the signal-count head; the year bar stays pinned below the scrolling
  list.
- Signals FULL restores the header on tall screens; short landscape keeps the
  header hidden to preserve list height.
- The region switcher is pinned at the top of `#signals-view` in both HALF and
  FULL. It lists all eight destinations grouped by country/EIC series and switches
  in place without flying back to the solar system.
- Unavailable signal rows render `N/A` and are disabled. The active count is
  derived from the same availability check used by the audio engine.

### HUD and audio

- The **Sonification Lab** button sits in `#masthead` beside the brand and stays at
  least 44px tall on mobile.
- Portrait phones give `#audio-controls` its own full-width row below the masthead
  as a two-row grid: status text spans both columns and the Play/Pause, Mute, and
  volume controls sit beneath it. Without the Play/Pause button (no destination
  open) the grid collapses to three columns.
- Short landscape keeps the audio toolbar on the masthead row and hides `#readout`
  because there is no vertical room for three stacked HUD blocks.
- `#readout` sits below the audio row on portrait so the three HUD blocks never
  overlap down to 320px wide.

---

## 7. Accessibility

- Panel is labelled `Place explorer` or `Sound layers` via `data-view`.
- PEEK button exposes `aria-expanded` and `aria-controls="panel-body"`.
- Hidden sheet sets `inert`.
- The region switcher title and chevron are both click targets; the chevron is a
  button with `aria-haspopup="listbox"`, `aria-expanded`, and
  `aria-controls="region-switcher-menu"`. The menu is a `role="listbox"` of grouped
  `role="option"` buttons with `aria-selected`, arrow/Home/End movement, and Escape
  to close.
- Back bar is `aria-hidden` while Signals is HALF/FULL and visible again at PEEK.
- Focus returns to the PEEK button when Escape collapses the sheet, and to the
  switcher chevron when the menu closes.
- Focus rings are preserved; all primary mobile controls are at least 44px.
- Sheet motion is disabled under `prefers-reduced-motion: reduce`.

---

## 8. Verification

Manual and Playwright checks cover:

- 320 × 569, 390 × 844, 844 × 390, 568 × 320, and 1280 × 800.
- PEEK/HALF/FULL taps and drags; drag-down from PEEK is inert.
- Scrim click and Escape precedence.
- Search focus keyboard lift; HUD hidden while lifted.
- Globe touch-collapse and rotation in the same gesture.
- Destination selection with no intermediate PEEK frame.
- ATLAS Signals HALF, signal toggle count, year bar, and Back to PEEK Places.
- Region switcher opens inside the sheet, lists all eight destinations, switches
  in place, and closes on selection/Escape.
- Audio Play/Pause suspends and resumes without disturbing Mute or volume; the
  portrait audio row and masthead/readout never overlap at 320–430px wide.
- Desktop resize round-trip at 820/1024 breakpoints.
- No console errors and no document horizontal overflow.

The camera files, `vendor/`, textures, and datasets are not part of this change.

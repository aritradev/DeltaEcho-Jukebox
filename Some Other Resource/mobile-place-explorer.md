# Mobile place explorer — proposed design

> **Superseded.** The sheet is implemented. The authoritative contract is
> [`docs/mobile-sheet.md`](../docs/mobile-sheet.md); this document is retained as
> design history.

**Status:** historical proposal. The implemented design keeps the three-snap model
but revises the ATLAS behavior, content-aware heights, and the breakpoint for short
landscape screens.

**Reference viewport:** 320 × 569 CSS px (the narrow DevTools preset). The same
rules apply up to 760 px wide and to short landscape screens.

---

## 1. The problem

On mobile the place explorer is a permanently expanded bottom card. At 320 px it
takes up to `55vh` plus bottom padding, so it covers roughly half the screen and
overlaps the readout that the mobile CSS also parks at the bottom. The globe — the
whole point of the scene — is squeezed into the top half, and the list stays open
even when the viewer only wants to look at Earth.

```text
CURRENT — 320 × 569
+----------------------------------+
| E/I/J                            |
|                                  |
|            .-''''-.              |
|          .'        '.            |
|         /   EARTH    \           |
|         \            /           |
|          '.        .'            |
|            '-....-'              |
|                                  |
|  +----------------------------+  |  <- panel starts ~45% down
|  | Where would you like       |  |
|  | to listen?                 |  |
|  | [ search places...     / ] |  |
|  |  BANGLADESH            06  |  |
|  |  DHAKA                   > |  |
|  |  CHITTAGONG              > |  |
|  |  SYLHET                  > |  |
|  |  SUNDARBANS              > |  |
|  | VIEW 01 · SOLAR SYSTEM     |  |  <- readout collides here
|  | TARGET COX'S BAZAR ...     |  |
|  +----------------------------+  |
|  [ back ]                        |
+----------------------------------+
```

Three separate faults:

1. **Permanent occlusion.** The sheet has no collapsed state, so it is always in
   the way.
2. **Readout collision.** `#readout` is moved to the bottom on mobile while the
   panel is also bottom-anchored.
3. **No dismissal gesture.** The only way to see the globe is to ignore the
   panel; tapping or dragging the scene does not get it out of the way.

---

## 2. Goals

- The globe is the default view. The explorer should occupy a thin edge, not a
  card, until the viewer asks for it.
- One thumb reach opens the list; one tap or one downward swipe dismisses it.
- Selecting a destination collapses the explorer before the flight starts.
- In Earth orbit the explorer remains available but collapsed.
- Keep the existing hairline/mono aesthetic: no rounded cards, no shadows, no
  heavy fills, no bright accent blocks.
- Do not change the camera choreography or the desktop layout.

**Non-goals:** redesigning the desktop panel, changing the destination card, or
adding a new navigation model. The state machine and keyboard contract stay as
they are.

---

## 3. Recommended pattern: peek → half → full

A three-snap bottom sheet. Only the **peek** state is persistent.

| State | Height | What is visible | When |
| --- | --- | --- | --- |
| `PEEK` | 64 px + safe area | Handle, `PLACES · 06`, current region, chevron | Default on mobile; after selection; after Back to orbit |
| `HALF` | `min(46vh, 300px)` | Search + list; globe still visible above | Tapped peek or swiped up |
| `FULL` | `min(84vh, 520px)` | Search results, or signals with year bar | Search focused, or dragged up from `HALF` |
| `HIDDEN` | — | Nothing | `FLYING` and `ATLAS` (skip/back take over) |

The sheet never covers more than 46% of the viewport in its default expanded
state. `FULL` is an explicit request, and only that state adds a scrim.

```text
STATE MACHINE

                    tap peek / swipe up
      PEEK  ────────────────────────────────►  HALF
        ▲                                        │  │
        │  swipe down / select / tap globe       │  │ swipe up
        │                                        ▼  ▼
        └────────────────────────────────────  FULL
                                                 │
                       swipe down / tap scrim    │
                       ──────────────────────────┘
```

---

## 4. ASCII wireframes

### 4.1 Peek (default)

```text
+----------------------------------+
| E/I/J                  03 ORBIT  |
|                                  |
|            .-''''-.              |
|          .'        '.            |
|         /   EARTH    \           |
|         \            /           |
|          '.        .'            |
|            '-....-'              |
|                                  |
|                                  |
|                                  |
|                                  |
| +------------------------------+ |
| |       [ ==== handle ==== ]   | |  64 px
| | PLACES 06    Cox's Bazar  ^  | |
| +------------------------------+ |
+----------------------------------+
```

- The handle is a 32 × 2 px hairline, not a pill.
- `PLACES 06` is mono 9 px, `Cox's Bazar` is 13 px, chevron is 12 px.
- The whole bar is one button (`aria-expanded="false"`).
- The readout is moved to the **top-right**, under the masthead, so nothing sits
  behind the peek bar.

### 4.2 Half — places list

```text
+----------------------------------+
| E/I/J                  03 ORBIT  |
|          .-''''-.                |
|        .'        '.              |
|       /   EARTH    \             |  <- globe still visible
|        '.        .'              |
| +------------------------------+ |
| |       [ ==== handle ==== ]   | |
| | Where would you like         | |
| | to listen?                   | |
| | [ search places...      / ]  | |
| |  BANGLADESH             06   | |
| |  DHAKA                    >  | |
| |  CHITTAGONG               >  | |
| |  SYLHET                   >  | |
| |  SUNDARBANS               >  | |
| |  ...                         | |
| +------------------------------+ |
+----------------------------------+
```

- No scrim in `HALF`; the top hairline separates sheet from scene.
- `max-height: 46vh`; the list scrolls inside.
- Tapping the globe collapses to `PEEK` before the tap is treated as a scene
  interaction, so the first tap never selects a place by accident.

### 4.3 Full — search focused

```text
+----------------------------------+
| +------------------------------+ |
| |       [ ==== handle ==== ]   | |
| | SEARCH PLACES                | |
| | [ cox|                   x ] | |
| | RESULTS 01                   | |
| |  COX'S BAZAR              >  | |
| |                              | |
| |                              | |
| |                              | |
| |                              | |
| |  (on-screen keyboard below)  | |
| +------------------------------+ |
| [ keyboard ]                     |
+----------------------------------+
```

- Focusing the search input promotes `HALF → FULL` so results are not hidden by
  the keyboard.
- The search field is sticky at the top of the sheet; the list scrolls under it.
- Clearing search keeps `FULL`; collapsing or selecting returns to `PEEK`.
- A `Cancel` affordance is not needed: the handle and scrim already dismiss.

### 4.4 Signals

```text
+----------------------------------+
| E/I/J                  08 LOCALITY|
| +------------------------------+ |
| |       [ ==== handle ==== ]   | |
| | SIGNALS · COX'S BAZAR     ^  | |
| | 10 of 10 on                  | |
| |  [x] surf        [x] wind    | |
| |  [x] rain        [x] gulls   | |
| |  [x] boats       [x] market  | |
| |  ...                         | |
| | 1985 [=====|=====] 2026      | |
| | [PLAY 85] [COMPARE] [PLAY 25]| |
| +------------------------------+ |
+----------------------------------+
```

- The signals sheet uses the same three snaps. `PEEK` reads
  `SIGNALS · Sylhet`.
- The year bar is sticky to the bottom of the sheet so it stays reachable while
  the layer list scrolls.
- On short screens the year actions may wrap to two rows; they must not be hidden
  as they are today (`display: none` in the current mobile CSS).

### 4.5 Destination / Back

```text
+----------------------------------+
| E/I/J                  08 LOCALITY|
|                                  |
| +------------------------------+ |
| | COX'S BAZAR                  | |
| | 1985 · 2025 · 10 layers      | |
| | [ signal summary ]           | |
| +------------------------------+ |
|                                  |
| [ <- Back to Earth orbit ]       |
+----------------------------------+
```

- The explorer is `HIDDEN` in `ATLAS`; the existing destination card and backbar
  remain.
- Returning to orbit restores `PEEK` with the selected region, not an open list.
  That keeps the "return to the zoomed orbit" behaviour intact without covering
  the globe.

### 4.6 Short landscape

```text
+--------------------------------------------------+
| E/I/J          03 ORBIT                [readout] |
|      .-''''-.                                    |
|    .' EARTH '.     +---------------------------+ |
|    \         /     | [ ==== handle ==== ]      | |
|     '-.....-'      | PLACES 06  Cox's Bazar ^  | |
|                    +---------------------------+ |
+--------------------------------------------------+
```

- In `max-height: 560px` the peek bar stays at the bottom edge and the sheet
  height cap drops to `40vh`. There is no full-height mode; search opens as an
  overlay with its own close control.

---

## 5. Layout specification

| Token | Value |
| --- | --- |
| Breakpoint | `max-width: 760px` |
| Short-screen breakpoint | `max-height: 560px` |
| Peek height | `64px` + `env(safe-area-inset-bottom)` |
| Half height | `min(46vh, 300px)` |
| Full height | `min(84vh, 520px)` |
| Sheet side padding | `14px` |
| Sheet inner padding | `16px 16px 14px` |
| Handle | `32 × 2px`, `var(--ink-dim)`, centred, 8 px top margin |
| Top border | `1px solid var(--line-soft)` |
| Sheet background | existing `linear-gradient(180deg, rgba(6,11,20,.86), rgba(4,8,14,.92))` + `blur(10px)` |
| Corner radius | `0` (keep the hairline/rectangular language) |
| Scrim (FULL only) | `rgba(3, 6, 12, 0.45)` |
| Transition | `220ms cubic-bezier(.22,.61,.36,1)`; `0.15s` opacity under reduced motion |
| Touch target | every row and the peek bar ≥ `44px` tall |
| Readout position | top-right on mobile; never behind the sheet |

The peek bar sits inside the existing `#panel` element so `pointer-events` and
z-index continue to work. The sheet is a sibling wrapper around `.panel-inner`;
the desktop layout can ignore it entirely.

---

## 6. Behaviour rules

1. **On entering `EXPLORE`** the sheet is `PEEK`. It is not auto-expanded.
2. **Tapping the peek bar** opens `HALF`; the search input is *not* focused
   automatically.
3. **Tapping the search field** promotes to `FULL`.
4. **Dragging the handle up** goes `PEEK → HALF → FULL`; dragging down reverses
   the snap.
5. **Tapping the globe** collapses `HALF`/`FULL → PEEK` and lets the same tap
   reach the scene on the next pointer event, so orbit dragging still feels
   immediate.
6. **Selecting a destination** sets `PEEK`, updates the peek label, then starts
   the flight. The sheet must be collapsed before `MODE = FLYING`.
7. **Back/Escape to orbit** restores `PEEK` with the current region selected.
8. **`FLYING` and `ATLAS`** hide the sheet entirely; the Skip/Back controls own
   the bottom edge.
9. **Signals view** keeps its own sheet state; switching tabs preserves the last
   snap per view.
10. **Desktop** (`>760px`) ignores all of the above and keeps the current fixed
    left panel.

---

## 7. Alternatives considered

### A. Peek → half → full sheet (recommended)

- **Pros:** standard, discoverable, keeps the globe visible, one-thumb reach,
  works for both places and signals.
- **Cons:** needs gesture handling and a new markup wrapper.

### B. Floating action button + full-screen overlay

```text
+----------------------------------+
| E/I/J                            |
|                                  |
|            .-''''-.              |
|          .'  EARTH  '.           |
|         \            /           |
|          '-......-'              |
|                                  |
|                          [ 06 ]  |  <- FAB, 48 px
+----------------------------------+
```

- **Pros:** maximum globe area when closed.
- **Cons:** hides the current selection, adds a floating element that fights the
  hairline language, and a full-screen list loses the globe context entirely.

### C. Horizontal chip rail

```text
+----------------------------------+
| E/I/J                            |
|            .-''''-.              |
|          .'  EARTH  '.           |
|          '-......-'              |
| [Dhaka] [Chittagong] [Sylhet] >  |
+----------------------------------+
```

- **Pros:** one-tap selection, very low height.
- **Cons:** six long names do not fit; search, country grouping, and signals have
  no home; the rail scrolls horizontally, which conflicts with orbit drag.

**Decision:** A. It is the only option that scales to the full Champion dataset
and the signals view without discarding the globe.

---

## 8. Accessibility

- The peek bar is a `<button>` with `aria-expanded` and `aria-controls` pointing
  at the sheet.
- `PEEK`/`HALF`/`FULL` are reflected with `data-sheet` on `#panel`; screen
  readers hear "Places, collapsed/expanded".
- Focus moves into the sheet when it opens via the peek bar, and back to the peek
  bar when it collapses.
- `Escape` (hardware keyboard) collapses `FULL → HALF → PEEK` before it reaches
  the camera skip/back handlers.
- Drag gestures have button equivalents: the peek bar toggles `PEEK ⇄ HALF`, and
  the handle toggles `HALF ⇄ FULL`.
- `prefers-reduced-motion: reduce` removes the spring and uses a short fade.
- The sheet never traps focus; tabbing past the last control leaves the panel.

---

## 9. Implementation map

| File | Change |
| --- | --- |
| `index.html` | Add the peek bar and handle inside `#panel`; wrap `.panel-inner` in a `.panel-sheet` element. Keep the desktop markup semantics. |
| `styles.css` | Replace the mobile `.panel` block with `[data-sheet]` states. Move `#readout` to the top-right in the mobile query. Add the scrim and safe-area padding. |
| `src/ui.js` | Add `setSheetState('peek' \| 'half' \| 'full')`, pointer-drag snapping, and update the peek summary from `setActiveRegion`, `showPlaces`, and `showSignals`. Expose `sheetState` for tests. |
| `src/main.js` | Collapse to `PEEK` in `onSelect`, `enterExplore`, and the orbit-return `settle`. Hide the sheet in `onFlightComplete`/`onBack`. No camera changes. |
| `docs/architecture.md` | Record the mobile sheet states next to the mode table once implemented. |

The camera director, atlas, region marker, and audio are untouched.

---

## 10. Acceptance checks

At 320 × 569 and 360 × 640:

1. `PEEK` occupies ≤ 72 px plus safe area; the globe and readout are fully
   visible and never overlapped.
2. Tapping the peek bar opens `HALF`; the globe remains visible above the sheet.
3. Search focus opens `FULL`; results are not hidden by the keyboard.
4. Dragging the globe collapses the sheet and rotates the globe on the same
   gesture.
5. Selecting a destination collapses the sheet before `MODE = FLYING`.
6. Back/Escape to orbit restores `PEEK` with the selected region.
7. Signals opens at `HALF`, the year bar stays reachable, and toggles work.
8. Desktop (`>760px`) is pixel-identical to the current layout.
9. Keyboard navigation (`/`, `↑`, `↓`, `Enter`, `Esc`) still works on desktop.
10. No console errors and no change to camera timing.

---

## 11. Open questions

- Should the peek label read `Cox's Bazar` or the more instructive
  `Choose a place` when no destination has been chosen yet? Recommendation:
  show the current selection once one exists, otherwise `Choose a place`.
- Should the peek bar dim to 40% while the user drags the globe, then return?
  Recommendation: yes, as a 200 ms opacity fade; it signals "I am not in the
  way".
- Do we need a dedicated full-screen search on screens shorter than 480 px?
  Recommendation: not initially; the `FULL` snap plus keyboard avoidance is
  enough.

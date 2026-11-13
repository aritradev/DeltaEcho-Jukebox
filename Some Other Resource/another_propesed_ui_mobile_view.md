# JUKEBOX — Mobile Place Explorer & Bottom Sheet UI/UX Proposal

> **Superseded.** The implemented contract is
> [`docs/mobile-sheet.md`](../docs/mobile-sheet.md). This document is retained as
> design history; its ATLAS/mode table and uniform heights were revised during
> implementation.

## 1. Overview

This proposal redesigns the mobile experience of the JUKEBOX place explorer.

The desktop layout remains unchanged. Only the mobile presentation and interaction model are affected.

The goal is to make the Earth globe the primary focus of the mobile experience while keeping the place explorer accessible through a compact, touch-friendly bottom sheet.

The explorer should feel like a natural part of the experience rather than a permanent panel covering the globe.

### Scope

- Mobile screens: viewport width up to 760px.
- Desktop layout: unchanged.
- Reference viewport: 320 × 569px.
- Existing Three.js globe, camera choreography, destination transitions, and visual identity remain unchanged.
- No new navigation model is introduced.

---

## 2. Current Problem

The current mobile panel occupies a significant portion of the screen even when the user is primarily interested in viewing the Earth.

There are several issues:

1. The permanently expanded bottom panel reduces the visible globe area.
2. The panel can overlap the bottom-anchored readout.
3. The user has no clear, convenient way to dismiss the panel.
4. The experience gives too much visual priority to the interface instead of the Earth.
5. The panel does not adapt naturally between browsing places and viewing the globe.

On mobile, the globe should be visible by default. The explorer should appear when the user wants to interact with it.

---

## 3. Design Goals

The mobile explorer should:

- Keep the Earth globe as the primary visual element.
- Occupy minimal screen space by default.
- Provide one-thumb access to the place explorer.
- Support natural touch gestures.
- Allow users to expand, collapse, and dismiss the explorer.
- Keep the explorer accessible while viewing the globe.
- Collapse automatically when a destination is selected.
- Remain available in a compact state after returning to the solar system.
- Avoid interfering with existing camera interactions.

The overall principle:

**Show the Earth first. Reveal the interface when needed.**

---

## 4. Recommended Interaction Model: Three-Snap Bottom Sheet

Use one bottom sheet with three snap positions:

1. PEEK
2. HALF
3. FULL

These are presentation states of the same explorer, not separate screens.

### 4.1 PEEK — Default State

The PEEK state is the default mobile presentation.

It should occupy approximately 64px plus the device's bottom safe-area inset.

Content:

- A small horizontal drag handle.
- A compact section label.
- The number of available places.
- The currently selected region, if one exists.
- A subtle directional indicator.

Example before selecting a place:

```text
────────────────────────────
          ──────
PLACES · 06          Choose a place  ↑
────────────────────────────
```

Example after selecting a place:

```text
────────────────────────────
          ──────
PLACES · 06          Cox's Bazar  ↑
────────────────────────────
```

Behavior:

- Default state when entering the mobile place explorer.
- Tapping the PEEK area expands the sheet to HALF.
- Dragging the handle upward expands the sheet.
- Dragging downward dismisses or collapses the sheet.
- After selecting a destination, the selected place is reflected in the PEEK summary.
- After returning to the solar system, the explorer returns to PEEK.

The PEEK state should not obstruct the globe or important scene information.

### 4.2 HALF — Browsing State

The HALF state is the primary browsing interface.

Recommended height:

```css
height: min(46vh, 300px);
```

Content:

- Section title.
- Search field.
- Scrollable destination list.
- Existing destination information and visual language.

Example:

```text
┌──────────────────────────────┐
│             ──────           │
│                              │
│  PLACES                      │
│  Explore a location          │
│                              │
│  ┌────────────────────────┐  │
│  │ Search places...       │  │
│  └────────────────────────┘  │
│                              │
│  BANGLADESH                  │
│                              │
│  Dhaka                  →    │
│  Chittagong             →    │
│  Sylhet                 →    │
│  Sundarbans             →    │
│  Cox's Bazar            →    │
│  Kutubdia               →    │
│                              │
└──────────────────────────────┘
```

Behavior:

- The globe remains visible above the sheet.
- The destination list scrolls independently.
- The search field remains visible while browsing the list.
- Tapping a destination selects it and starts the existing destination transition.
- Tapping the visible globe collapses the sheet to PEEK.
- The globe must remain interactive when the sheet is in HALF.

The HALF state should not use a full-screen scrim.

### 4.3 FULL — Expanded State

The FULL state provides more space for browsing.

Recommended maximum height:

```css
height: min(84vh, 520px);
```

Content:

- Section title.
- Search field.
- Complete destination list or signal list.
- Existing controls and information.

Behavior:

- Reached by dragging the handle upward from HALF.
- A scrim appears behind the sheet.
- The sheet becomes the primary interface temporarily.
- The destination list remains independently scrollable.
- Tapping the scrim dismisses the sheet to PEEK.
- Dragging downward moves the sheet to HALF or PEEK.
- Selecting a destination collapses the sheet before the existing camera transition begins.

FULL should provide more browsing space without introducing a different navigation system.

---

## 5. Sheet Appearance and Visual Language

The mobile sheet should reuse the existing JUKEBOX visual language.

Do not introduce a completely different card-based design.

### Handle

- Width: 32px.
- Height: 2px.
- Centered horizontally.
- Use the existing subtle border color.
- Avoid a large, rounded, bright handle.

### Sheet Surface

```css
background: /* existing panel gradient */;
backdrop-filter: blur(10px);

border-top: 1px solid var(--line-soft);
border-radius: 0;
```

The sheet should feel connected to the existing interface.

### Scrim

Only the FULL state should display a scrim.

```css
background: rgba(3, 6, 12, 0.45);
```

The scrim should not appear in PEEK or HALF.

### Transitions

Recommended transition:

```css
transition:
  height 220ms cubic-bezier(.22, .61, .36, 1),
  transform 220ms cubic-bezier(.22, .61, .36, 1);
```

Avoid exaggerated bouncing or spring animations.

The interface should feel precise and controlled, consistent with the cinematic character of JUKEBOX.

---

## 6. Touch Interaction Rules

Touch interactions must remain predictable.

### Sheet Movement

The dedicated handle controls sheet movement.

- Swipe upward: move to the next expanded state.
- Swipe downward: move to the previous collapsed state.
- A sufficiently large downward gesture from PEEK can dismiss the explorer.
- Use reasonable movement thresholds so small accidental touches do not change the sheet state.

The entire sheet should not behave like a drag handle.

This distinction is important:

- Handle controls sheet movement.
- Destination list controls scrolling.
- Globe controls Earth rotation.

### Globe Interaction

The globe must remain interactive whenever it is visible and not covered by the FULL-state scrim.

When the sheet is in HALF:

- A touch beginning on the visible globe should collapse the sheet to PEEK.
- The same touch gesture must still reach the existing Three.js interaction system.
- The user should be able to begin rotating the globe immediately.
- Do not require a second touch after the sheet collapses.
- Do not create synthetic or replayed pointer events.

This preserves the natural interaction between the explorer and the Earth.

### Destination Selection

When a destination is selected:

1. Update the selected destination internally.
2. Update the PEEK summary with the selected destination.
3. Transition the application into the existing FLYING mode.
4. Hide the bottom sheet during the transition.
5. Continue the existing camera choreography without modification.

Avoid showing an unnecessary intermediate PEEK state before the sheet disappears.

---

## 7. Mobile Readout Position

The existing readout should move from its bottom-anchored desktop position to the top-right area on mobile.

Reason:

- The bottom area is now occupied by the bottom sheet.
- The readout should remain visible when the sheet is expanded.
- It should not compete with the explorer.

Requirements:

- Preserve the existing readout content.
- Keep the visual styling consistent.
- Avoid overlapping the masthead or orbit status.
- Maintain enough spacing from the screen edges.
- Keep it compact so the globe remains visually dominant.

The readout's mobile position changes, but its information and functionality do not.

---

## 8. Signals Explorer

The Signals interface should reuse the same bottom-sheet system.

Do not introduce a separate mobile navigation pattern for signals.

### PEEK

Example:

```text
────────────────────────────
          ──────
SIGNALS · SYLHET                 ↑
────────────────────────────
```

The label should reflect the currently selected destination.

### HALF

Show:

- Signals section title.
- Available signal list.
- Existing active/inactive states.
- Existing signal information.

### FULL

Show:

- Complete signal list.
- Existing year controls.
- Existing signal information.

### Important Behavior

- The signal list should scroll independently.
- The year bar should remain reachable and visually accessible.
- The year bar should remain sticky where appropriate.
- Do not hide existing controls simply to save mobile space.
- The active signal count must reflect the actual selected signals.
- Do not force every signal to be active.
- Signals unavailable for a destination should remain unavailable rather than being represented as zero.

The Signals explorer should feel like the same interface changing its content, not a completely different mobile component.

---

## 9. Behavior Across Application Modes

The bottom sheet must respect the existing application states.

| Application state | Bottom sheet behavior |
|---|---|
| SOLAR SYSTEM / ORBIT | PEEK |
| EXPLORE | PEEK, HALF, or FULL |
| FLYING | Hidden |
| ATLAS | Hidden |

### Entering Explore

- Show the explorer in PEEK.
- Keep the globe visible.
- Do not automatically expand the sheet.

### Browsing Places

- Allow the user to move between PEEK, HALF, and FULL.
- Preserve the selected destination information.

### Selecting a Destination

- Update the selected destination.
- Hide the sheet as the existing flight begins.
- Do not modify the camera animation.

### Entering Atlas

- Hide the explorer.
- Preserve the existing destination card and Back controls.

### Returning to the Solar System

- Restore the explorer in PEEK.
- Keep the selected destination reflected in its summary.
- Do not automatically reopen HALF or FULL.

The Places and Signals views may maintain separate last-used browsing positions while the user remains in the same browsing session. However, application mode transitions should restore the compact PEEK state.

---

## 10. Short Landscape Screens

Short landscape screens need a slightly different presentation.

Condition:

```css
@media (max-height: 560px) {
  /* Short-screen adjustments */
}
```

Requirements:

- Keep PEEK available at the bottom.
- Limit the expanded sheet to approximately 40vh.
- Preserve enough visible space for the globe.
- Avoid opening a large FULL sheet.
- Provide a compact search presentation with its own close control when more search space is necessary.

This should be treated as a compact presentation of the existing explorer, not an additional permanent sheet state.

---

## 11. Responsive Layout Specifications

Recommended starting values:

| Property | Value |
|---|---|
| Mobile breakpoint | `max-width: 760px` |
| Short-screen condition | `max-height: 560px` |
| PEEK height | `64px + safe-area inset` |
| HALF height | `min(46vh, 300px)` |
| FULL height | `min(84vh, 520px)` |
| Horizontal sheet padding | `14px` |
| Inner content padding | `16px 16px 14px` |
| Handle width | `32px` |
| Handle height | `2px` |
| Sheet top border | `1px solid var(--line-soft)` |
| Sheet border radius | `0` |
| Scrim | `rgba(3, 6, 12, 0.45)` |
| Transition duration | `220ms` |
| Transition easing | `cubic-bezier(.22, .61, .36, 1)` |
| Minimum touch target | `44px` |

The bottom sheet must account for the device's bottom safe-area inset.

---

## 12. Accessibility and Usability

- The PEEK control should communicate that it expands the explorer.
- Use an appropriate expanded/collapsed state for the control.
- Keep interactive controls large enough for touch.
- Maintain visible focus indicators for supported interaction methods.
- Do not make the handle the only way to expand or collapse the sheet.
- Ensure destination rows are individually accessible controls.
- The FULL-state scrim should provide a clear way to return to the globe.
- Keep the interface understandable without relying only on gestures.

---

## 13. Implementation Areas

This proposal does not require rebuilding the existing explorer or changing the globe architecture.

The expected implementation areas are:

### `index.html`

- Add the compact PEEK bar.
- Add the dedicated drag handle.
- Keep the existing explorer content inside its own inner wrapper.
- Preserve existing destination and signal elements.

### Stylesheet

- Replace the existing mobile panel presentation.
- Add PEEK, HALF, and FULL sheet states.
- Add the FULL-state scrim.
- Adjust the mobile readout position.
- Add short-landscape adjustments.
- Keep desktop styles unchanged.

### `ui.js`

- Add a sheet-state controller.
- Handle touch-based sheet movement.
- Update the PEEK summary when the selected destination changes.
- Keep destination and signal content behavior intact.

### `main.js`

- Connect sheet visibility to existing application modes.
- Hide the sheet during FLYING and ATLAS.
- Restore PEEK when returning to the solar system.
- Preserve existing Three.js pointer interaction and camera transitions.

### Documentation

- Record the mobile sheet states and transitions.
- Document the interaction rules between the sheet and globe.
- Keep the existing camera choreography and application architecture unchanged.

---

## 14. Acceptance Criteria

The redesign should be considered successful when:

### Default View

- At 320 × 569px, PEEK occupies no more than approximately 72px plus the safe-area inset.
- The globe remains the primary visual element.
- The mobile readout remains visible and does not overlap the explorer.

### Explorer

- Tapping PEEK opens HALF.
- Dragging the handle can move between sheet states.
- The destination list scrolls independently.
- FULL displays the scrim.
- Tapping the scrim collapses the sheet to PEEK.

### Globe

- The globe remains interactive in HALF.
- Touching and dragging the visible globe collapses HALF to PEEK.
- The same gesture continues to rotate the globe.
- Existing Three.js interaction remains functional.

### Destination Selection

- Selecting a destination updates the selected place.
- The sheet disappears as the existing flight begins.
- No intermediate PEEK flicker occurs.
- Existing camera timing and choreography remain unchanged.

### Signals

- Signals use the same sheet behavior.
- The signal list scrolls independently.
- Year controls remain accessible.
- Unavailable signals are not incorrectly presented as zero.

### Application Modes

- The sheet is hidden during FLYING and ATLAS.
- Returning to the solar system restores PEEK.
- The selected destination remains reflected in the explorer.

### Desktop

- Desktop layout remains visually and functionally unchanged.
- No desktop panel redesign is included in this proposal.

### Stability

- No existing camera transitions are modified.
- No existing destination or atlas behavior is broken.
- No console errors are introduced.

---

## 15. Final Design Decision

The recommended approach is a **three-snap, touch-first bottom sheet** with PEEK, HALF, and FULL states.

It keeps the existing JUKEBOX interface and visual identity while adapting its presentation to smaller screens.

The most important change is not simply reducing the panel height. It is changing the relationship between the globe and the interface.

On mobile:

- The Earth is the primary experience.
- The explorer is secondary and available on demand.
- The bottom sheet provides browsing without permanently occupying the screen.
- Touch interaction with the globe remains natural.
- Destination selection leads directly into the existing cinematic transition.

**The mobile experience should feel like exploring the Earth, not using an interface that happens to contain a globe.**
# Camera transitions — behavioural contract

This document records the camera behaviour of the **current Phase 1 prototype** and
separates two things that must not be confused:

- the **approved cinematic experience and its reliability guarantees** —
  interruption recovery, timeline cleanup, lock restoration, and cancellation of
  stale completion callbacks — which are protected;
- the **current choreography, timings, and camera targets**, which are a dated
  baseline recorded for regression comparison, not permanent requirements.

Phase 1 is an early, unfinished prototype. The single-region experience and its
targeting strategy are temporary limitations: the region experience is expected to
work across many regions and future experiences. See §13.

Scope: `src/camera-director.js`, the camera-related parts of `src/main.js`,
`src/controls.js`, and the UI state they drive.

> **Baseline.** Values captured at commit `8ab5577` (`docs: add workflow and context
> architecture guides`) with `src/` unchanged since `e2118e3`. If the code and this
> document disagree, the code is correct and this document is stale — see §11.

---

## 1. How to read this document

| Label | Meaning |
| --- | --- |
| **MUST** / **MUST NOT** | Protected reliability guarantee or approved experience property. Changing it requires review, an explicit decision, a same-commit update to this document, and the regression checks in §9 |
| **Baseline** | The value or mechanism observed at the baseline commit. Recorded so unintended drift is visible. **Not immutable**: an intentional improvement is allowed with review, regression evidence, and a same-commit update here (§11.2) |
| **Verified** | Read directly from the current source; no runtime steps required to establish the fact |
| **Runtime-pending** | Reachable from the source, but its user-visible effect has not been exercised in a running build |
| **Observation** | Prototype implementation detail, limitation, or suspected defect. Never a requirement |

Protected surface, in full:

1. The cinematic journey keeps its current shape and character: six ordered stages,
   each one actually visited, with the current visual intent.
2. Interruption recovery: `MODE`, panel, hotspot, hint (§7).
3. Timeline and lock cleanup (§6, §7).
4. Cancellation of stale completion callbacks (§7).
5. Escape and Back remaining inert during `FLYING` (§7).

Baseline, **not** protected:

- The exact durations and target values in §5.
- The current single-region targeting strategy and precomputed azimuth (§6.2, Q4).
- The specific `focus` / `offX` / `offY` framing values.
- The single-scalar `regionVisibility` model.

The reliability guarantees must survive all of those changing. §13 lists the
prototype choices that are expected to evolve.

Everything else in this document is descriptive. In particular, the items in §10
are **not** requirements; several are suspected defects.

### Why exact numbers appear here

`src/config.js` remains the runtime source of truth for durations and
`camera-director.js` for target values. The numbers below are duplicated as a
**dated baseline snapshot**, so that an unintended change surfaces as a diff in this
document. They are not a prohibition on changing the choreography: a deliberate
timing or framing improvement is allowed, provided it is reviewed, the §9.3
regression set is run, and the affected baseline entries are updated in the same
commit.

---

## 2. The rig

The camera is never animated directly. `CameraDirector` owns a plain object of
animatable numbers, and GSAP tweens only those numbers.

| Field | Meaning | Unit |
| --- | --- | --- |
| `dist` | Distance from Earth's centre | Earth radii (`EARTH.radius` = 2.8 world units) |
| `az` | Azimuth around Earth | radians |
| `el` | Elevation | radians |
| `fov` | Perspective field of view | degrees |
| `focus` | Look-target bias: 0 = Earth centre, 1 = region surface point | 0–1 |
| `offX`, `offY` | Look-target offset along camera right/up, as a fraction of the look span | unitless |

**MUST** — All camera motion is expressed as tweens of `rig` fields or as calls to
a `CameraDirector` method. No module may assign `camera.position`, call
`camera.lookAt`, or set `camera.fov` except inside `apply()`.

**Verified** — The only camera transform writes in `src/` are
`camera-director.js → apply()` (`camera.position`, `camera.lookAt`, `camera.fov`,
`updateProjectionMatrix`). The only other camera touch is
`main.js → onResize()`, which updates `camera.aspect` and the projection matrix on
window resize; it does not move the camera and is therefore permitted.

**Verified** — Three modules read camera state without writing it:
`region.js` copies `camera.quaternion` for the reticle, `starfield.js` follows
`camera.position`, and `main.js` reads `camera.position` for hotspot facing.

---

## 3. `apply()` — rig to camera

`apply()` runs once per frame after `controls.update()` and once during
`buildWorld()` before the first frame.

```text
1. local  = sphericalToVector3(dist * EARTH.radius, az, el)
2. pos    = local.applyQuaternion(earth.orbitFrameQuaternion()) + earth.center
3. target = lerp(earth.center, earth.getRegionWorldPosition(), focus)
4. forward = normalize(target - pos);  span = max(0.2, |target - pos|)
   right   = normalize(forward × (0,1,0));  up = right × forward
5. target += right * (offX * span) + up * (offY * span)
6. camera.position = pos;  camera.lookAt(target)
7. if |camera.fov - rig.fov| > 1e-4: assign and updateProjectionMatrix()
```

### Frame semantics — **Verified**

`orbitFrameQuaternion()` returns the world quaternion of the Earth's **tilt**
group. The hierarchy is:

```text
orbitRoot → orbitPivot → holder → tiltGroup → spin → surface mesh
```

So the frame includes the Earth's orbital revolution and its axial tilt, and
**excludes** its spin. This is why `az` stays stable while the planet rotates
underneath, and why rig azimuths are directly comparable with
`earth.getRegionAzElTilt()`.

`earth.center` is refreshed every frame from the spin node's world position
(`earth.refresh()` in the render loop). The camera therefore follows Earth around
the Sun without any explicit tracking code.

### Durable rule and baseline mechanism

**MUST** — Only `apply()` writes camera transforms. Framing is never achieved by
assigning `camera.position` outside it.

**Baseline mechanism — may evolve.** The look target is currently built as
`lerp(center, regionSurface, focus)` and then offset by `offX`/`offY` in camera-space
right/up. Those offsets are tuned for the present single-region framing; multi-region
work may replace or extend the mechanism (§13). Changing it does not violate the
contract, provided the durable rule above holds and §9.3 still passes.

**Baseline mechanism — may evolve.** A projection-matrix rebuild happens only when the
FOV change exceeds `1e-4`. Keep the guard unless there is a measured reason to change
it.

**MUST NOT** — Parent the camera to the Earth, or apply the tilt twice. `apply()`
already rotates the local offset into the tilt frame; duplicating it breaks every
region at once.

---

## 4. Clamps and their ownership

| Limit | Value | Enforced by |
| --- | --- | --- |
| Minimum `dist` | 1.055 | `controls.js` only |
| Maximum `dist` | 15 | `controls.js` only |
| Minimum `el` | −72° | `controls.js` only |
| Maximum `el` | 78° | `controls.js` only |

**Verified (baseline)** — These clamps live in `ExplorerControls` and are applied on
drag, wheel, and pinch. They are the current interactive limits, not architectural
constants. The director does not apply them, so transitions may legitimately exceed
them: `introDolly` begins at `dist = WIDE.dist + 4.4 = 15.2`, above the user maximum.

**Verified** — `az` is wrapped with `% TAU` only when momentum is applied in
`controls.update()`; GSAP-tweened azimuths are not wrapped, which is why
`nearestAligned()` exists (§5).

---

## 5. Transition catalogue

All durations below are in seconds. "State" is the `STATES` value emitted at that
timeline position; the readout renders it as `NN · name`.

Everything in this section is the **baseline choreography at `8ab5577`**. It records
what the prototype currently does so a later change can be compared against it.
None of these values is a lifetime requirement — §11.2 describes how to change them
deliberately.

### 5.1 `beginFlight` — category selection (full journey)

Constructed by `CameraDirector.beginFlight()`, called from `main.onSelect()` before
the 1700 ms panel-hide timer.

| At | State | Rig / scene changes |
| --- | --- | --- |
| 0 → 2.2 | — | **Hold.** `t0 = TIMELINE.acknowledge = 2.2`; nothing animates |
| 2.2 | `02 earth approach` | `dist → 5.1`, `el → 11.5°`, `fov → 45`, `focus → 0.45`, `offX → 0.02`, `offY → 0.01` (6.8 s, `power1.inOut`; offsets `power2.inOut`) |
| 2.2 | — | `cloudOpacity → 0.34` (6.12 s), `spinScale → 0.62` (3.4 s), `coronaScale → 0.85` (6.8 s), `orbitLineFade → 0.55` (6.8 s) |
| 9.0 | `03 earth orbit` | `dist → 2.7`, `az → regionAzTilt + 0.3` via `nearestAligned`, `el → 15°`, `fov → 40`, `focus → 0.85`, `offX → 0`, `offY → 0.022` (5.5 s) |
| 9.0 | — | `cloudOpacity → 0.66`; `spinScale → 0.55` starts at 10.1 for 2.75 s |
| 14.5 | `04 region approach` | `dist → 1.44` (`power2.in`), `az → regionAzTilt`, `el → regionElTilt + 3.2°`, `fov → 47`, `focus → 1`, `offX → −0.028`, `offY → 0.06` (4.5 s) |
| 14.5 | — | `spinScale → 0.55` (2.475 s), `regionVisibility → 0.14` (2.7 s), `cloudOpacity → 0.92`, `orbitLineFade → 1` (1.6 s) |
| 19.0 | `05 cloud entry` | `dist → 1.052` and `fov → 53` (`power1.in`), `offX → 0`, `offY → 0.03`, `veil → 0.9` (2.475 s) |
| 19.0 | — | `cloudOpacity → 1.0` (2.25 s), `regionVisibility → 0.1` (2.25 s) |
| 23.5 | `06 region reveal` | `veil → 0` (2.79 s), `cloudOpacity → 0.4` (3.6 s), `regionVisibility → 1` (3.375 s), `dist → 1.38`, `fov → 40`, `offX → −0.05`, `offY → 0.075` (4.5 s, `power2.out`) |
| 28.0 | `07 region hotspot` | `dist → 2.75`, `fov → 41`, `focus → 0.32`, `offX → −0.02`, `offY → 0.03` (2.2 s) |
| 28.0 | — | `cloudOpacity → 0.46` and `spinScale → 0.55` (2.0 s) |
| 30.2 | complete | `timeline = null`, `locked = false`, completion callback fires |

**Total: 30.2 s.** Stage boundaries: 2.2 / 9.0 / 14.5 / 19.0 / 23.5 / 28.0.

**Verified** — The `settle` window is `max(TIMELINE.lock, 2.2) = 2.2`, so the
hotspot state is emitted at 28.0 and the shot finishes settling at 30.2.

### 5.2 `continueToRegion` — hotspot click from free orbit

Same region sequence as 5.1 from its 14.5 s mark, starting at 0.

| At | State |
| --- | --- |
| 0 | `04 region approach` |
| 4.5 | `05 cloud entry` |
| 9.0 | `06 region reveal` |
| 13.5 | `07 region hotspot` |
| 15.7 | complete |

Targets are identical to 5.1. The two scene-parameter tweens inside the settle
(`cloudOpacity`, `spinScale`) use `lock = 0.9` instead of 2.0, so they finish
earlier, but the `settle` floor keeps the total at 15.7 s. See Q1.

### 5.3 `returnToSolarSystem` — Back button

| At | State | Changes |
| --- | --- | --- |
| 0 | `06 region reveal` | `regionVisibility → 0` (1.8 s), `veil → 0` (1.2 s), `cloudOpacity → 0.72` (2.2 s), `spinScale → 0.55` (2 s), `dist → 2.6`, `fov → 44`, `offX → 0`, `offY → 0.023` (3.2 s) |
| 2.6 | `02 earth approach` | `dist → 5.2`, `fov → 46`, `focus → 0.45` (4.4 s); `el → 12°`, `az → wideAz` (4.4 s); `cloudOpacity → 0.3`; `orbitLineFade → 0`, `coronaScale → 1` |
| 5.4 | — | Final tween to `WIDE`: `dist 10.8`, `fov 56`, `focus 0`, `offX −0.278`, `offY 0`, `el 15°`, `az wideAz` (5.6 s, ends 11.0) |
| 6.4 | `01 solar system` | Readout switches before the camera finishes arriving |
| 11.0 | — | 0.1 s padding tween |
| 11.1 | complete | `timeline = null`, `locked = false`, `setState(SOLAR_SYSTEM)`, callback |

**Total: 11.1 s.** The readout therefore goes `07 → 06 → 02 → 01`.

**Verified** — This is a reverse *framing*, not a reversed timeline: stages are
authored forward at absolute positions.

### 5.4 `enterFreeOrbit` — click Earth from the wide view

Not a timeline. One `gsap.to` on the rig plus one on the director.

| Parameter | Default | Value used by `main.enterExplore()` |
| --- | --- | --- |
| `dist` | 3.2 | 3.5 |
| `el` | 17° | 19° |
| `fov` | 42 | 42 |
| `focus` | 0.85 | 0.85 |
| `offX` / `offY` | 0 / 0.023 | defaults |
| `az` | `regionAzTilt` via `nearestAligned`, unless `keepAz` | `keepAz: true` (azimuth preserved) |
| Duration | 3.4 | 3.4 |
| State | `03 earth orbit`, set immediately | same |
| Scene | `spinScale 0.55`, `cloudOpacity 0.66`, `regionVisibility 0.85`, `orbitLineFade 1` | same |

**Baseline.** `enterFreeOrbit` is not cancellable by `interrupt()`: it creates no
timeline, so `isFlying === false` and `interrupt()` returns `false`. A future design
may choose to make it interruptible; that is an experience decision, not a
reliability regression. See Q3 and Q10.

### 5.5 `introDolly` — entering the observatory

Called once by `main.onEnter()` with `duration = 5.2`.

| From | To |
| --- | --- |
| `dist = 15.2` | `dist = 10.8` (`WIDE.dist`) |
| `fov = 61` | `fov = 56` (`WIDE.fov`) |
| `offX = −0.145`, `offY = −0.026` | `offX = −0.278`, `offY = 0` |

Ease `power2.out`. `az`, `el`, and `focus` are untouched.

**Verified** — This is a tween, not a timeline. `isFlying === false`, `locked` stays
`false`, and `interrupt()` cannot cancel it.

### 5.6 `restoreSolarState` — interrupt cleanup

Default duration 0.9 s, called bare by `interrupt()`.

```text
orbitLineFade    → 0
regionVisibility → 0
coronaScale      → 1
veil             → 0
cloudOpacity     → CLOUDS.opacity.solarRest (0.3)
spinScale        → 0.55
```

**MUST** — Interrupt recovery must not move the camera to a "recovered" pose: the
user's grabbed viewpoint is preserved. In the current prototype this is achieved by
`restoreSolarState()` touching scene parameters only. See Q5 for the consequence.

### 5.7 Totals

| Path | Duration |
| --- | --- |
| `beginFlight` | 30.2 s |
| `continueToRegion` | 15.7 s |
| `returnToSolarSystem` | 11.1 s |
| `enterFreeOrbit` | 3.4 s |
| `introDolly` | 5.2 s |
| `restoreSolarState` | 0.9 s |

---

## 6. Sequencing, state emission, and completion

### 6.1 Absolute-time authoring — **Verified**

Every tween in these timelines carries an absolute position parameter. Times are
accumulated in the builder:

```js
let t = t0 + T.approach;
...
this.buildRegionSequence(tl, t + T.orbit, false);
```

State changes are zero-duration calls placed at the same positions:

```js
scheduleState(tl, state, time)  →  tl.call(() => this.setState(state), null, time)
```

`setState()` returns early if the state is unchanged, otherwise fires
`onStateChange`, which updates the readout and performs entry effects (panel hide
on `EARTH_APPROACH`, marker pulse on `REGION_HOTSPOT`).

### 6.2 Timelines are built synchronously — **Verified**

`buildRegionSequence()` executes during `beginFlight()`/`continueToRegion()`
construction, at the moment of the click. All target values — including
`regionAzTilt`, `regionElTilt`, `orbitAz`, and `alignAz` — are captured then. GSAP
reads *start* values when each tween begins, but *end* values are fixed at
construction. See Q4.

### 6.3 Completion ordering

The exact step order below is baseline and may be refactored. Only the two guarantees
that follow it are protected.

| Path | Order |
| --- | --- |
| `beginFlight`, `continueToRegion` | `timeline = null` → `locked = false` → clear `pendingComplete` → invoke callback |
| `returnToSolarSystem` | `timeline = null` → `locked = false` → `setState(SOLAR_SYSTEM)` → invoke callback |

**MUST** — `locked` is cleared before the completion callback runs, so the callback
observes an unlocked director.

**MUST NOT** — Invoke a completion callback after the timeline has been killed, or
after an interruption has taken ownership of recovery.

### 6.4 Lock lifecycle — **Verified**

| Method | Sets `locked` |
| --- | --- |
| `beginFlight` | `true` |
| `continueToRegion` | `true` |
| `returnToSolarSystem` | `true` |
| `enterFreeOrbit` | `false` |
| timeline `onComplete` | `false` |
| `killTimeline` / `interrupt` | `false` (via `interrupt`) |

`controls.update()` damps residual drag velocity while `locked` is true, so
momentum cannot fight a scripted tween.

### 6.5 `killTimeline()` — **Verified**

```text
if (timeline) timeline.kill()
timeline = null
pendingComplete = null
gsap.killTweensOf(rig)
gsap.killTweensOf(this)      // also kills the punch tween
```

**MUST** — Clear `pendingComplete` before or during the kill, so a cancelled
transition cannot fire its completion later.

---

## 7. Mid-flight interruption — the protected behaviour

This section is the part of the document that is genuinely contractual. The steps
below describe how the current prototype meets the guarantees; the guarantees, not
the step list, are what must hold as the implementation evolves.

### 7.1 Trigger path — **Verified**

```text
pointer drag / wheel / pinch
  → ExplorerControls.notifyIntent()
  → main.onUserIntent()
  → if (MODE !== FLYING) return
  → if (!director.interrupt()) return
  → recovery
```

Controls are **enabled for the whole session** after `onEnter()`; they are never
disabled for a flight. The first user intent is therefore what cancels it.

### 7.2 Preconditions

- `interrupt()` returns `false` when `timeline` is `null` (no flight running,
  including during `introDolly` and `enterFreeOrbit`).
- `main.onUserIntent()` additionally requires `MODE === FLYING`.

**MUST** — A `false` return must leave all state untouched.

### 7.3 Postconditions on `true` — **Verified (baseline implementation)**

In this order:

1. `killTimeline()` runs: timeline killed, `timeline = null`,
   `pendingComplete = null`, rig/director tweens killed.
2. `locked = false`.
3. `restoreSolarState()` starts a 0.9 s tween of scene parameters only (§5.6).
4. `near = director.rig.dist < 6` (strict).
5. `MODE = EXPLORE` if `near`, otherwise `SOLAR`.
6. `ui.hideSelectionNote()`.
7. `ui.showPanel(1.2)` and `ui.setPanelEnabled(true)`.
8. `hotspotArmed = near`.
9. Hint: `Flight interrupted · manual control restored` (4 s).

### 7.4 Requirements

**MUST** — Cancel the timeline and clear `pendingComplete`; a cancelled flight must
never deliver its completion callback.

**MUST** — Restore `locked` to `false` and leave `director.isFlying === false`.

**MUST** — Recover `MODE` and never leave it in `FLYING`: `EXPLORE` when the camera
is close to Earth, otherwise `SOLAR`. The current boundary is `dist < 6` (baseline;
the boundary may be retuned, the never-stuck-in-`FLYING` rule may not).

**MUST** — Restore the panel (visible and enabled), hide the selection note, and set
`hotspotArmed` to the same `near` value used for the mode decision.

**MUST NOT** — Show the destination card or enable the back bar as a result of an
interruption. Those belong to successful completion only.

**MUST NOT** — Move the camera to a "recovered" pose. Recovery preserves the
user's current viewpoint. In the current prototype this is achieved by
`restoreSolarState()` touching scene parameters only.

**MUST NOT** — Break Escape or Back semantics during `FLYING`:
- `Escape` acts only in `MODE.REGION` and `MODE.EXPLORE`; during `FLYING` it does
  nothing.
- The back button handler returns immediately when `MODE === FLYING`.

**MUST** — Keep these guarantees when region targeting changes. The current
single-region precomputed azimuth (Q4) is a prototype limitation, not part of the
guarantee. A multi-region implementation must still satisfy §7.3–§7.4 while Earth is
rotating and while more than one region can be addressed. See §13.

### 7.5 Path-specific behaviour

| Situation | Behaviour | Status |
| --- | --- | --- |
| Interrupt during the 2.2 s hold | Mode `SOLAR` (`dist` still 10.8); panel restored — except the Q2 timer race | Verified / Q2 runtime-pending |
| Interrupt early in approach | Mode `SOLAR` (`dist > 6`) | Verified |
| Interrupt late in approach | Mode `EXPLORE` (`dist < 6`), hotspot armed | Verified |
| Interrupt during cloud entry / reveal | Mode `EXPLORE`; veil and region visibility fade to 0 | Verified |
| Interrupt during `returnToSolarSystem` | `interrupt()` succeeds; the return timeline's own callback never runs, so panel restoration comes from `onUserIntent` | Verified |
| Interrupt during `introDolly` | Not possible: no timeline, `isFlying === false`; wheel zoom is overwritten by the dolly tween (Q3) | Verified |
| Interrupt during `enterFreeOrbit` | Not possible: no timeline; mode is `EXPLORE`, so `onUserIntent` returns before calling `interrupt()` | Verified |
| `Escape` during `FLYING` | No effect | Verified |
| Back during `FLYING` | No effect | Verified |
| Interrupt within 1.7 s of selection | Suspected: stale `hidePanel` timer hides the restored panel (Q2) | Runtime-pending |
| Interrupt during return with `dist < 6` | Suspected: `hotspotArmed = true` while `regionVisibility → 0` leaves an invisible-but-hittable hotspot (Q8) | Runtime-pending |

### 7.6 What is deliberately *not* protected

- The exact choreography, durations, and target values in §5.
- The exact recovered `focus`/`offX`/`offY` values (they persist; Q5).
- The single-region targeting strategy and its precomputed azimuth (Q4).
- The single-scalar `regionVisibility` model.
- Panel timing races (Q2).
- Any behaviour reachable only by interrupting within the first 1.7 s.

An intentional change to any of these is a design decision, not a violation. The
guarantees in §7.3–§7.4 must still hold afterwards.

---

## 8. Coupled scene parameters

These are not camera transforms, but the transition timeline drives them and the
render loop consumes them. Desynchronising them from `MODE` is the most common way
to produce a visually broken state. This set is baseline and may grow; multi-region
support will likely add per-region state.

| Parameter | Written by | Read by | Range in these paths |
| --- | --- | --- | --- |
| `spinScale` | director tweens | `earth.setSpinRate` | 0.55–0.62 |
| `cloudOpacity` | director tweens | `earth.setCloudOpacity` | 0.3 → 1.0 → 0.46 |
| `regionVisibility` | director tweens | `main.updateHotspot` | 0 → 0.14 → 1 |
| `veil` | director tweens | `ui.setVeil` | 0 → 0.9 → 0 |
| `coronaScale` | director tweens | `solar.setCorona` | 1 → 0.85 → 1 |
| `orbitLineFade` | director tweens | `solar.setOrbitLines` | 0 → 1 → 0 |
| `punch` | `main.onHotspotClick` | `main.updateHotspot` | 0 → 1 → 0 |

**MUST NOT** — Leave a visible region marker while `MODE` is `SOLAR` after recovery.
In the current prototype this is guaranteed by `restoreSolarState()` driving
`regionVisibility` to 0 over 0.9 s. The single scalar is a prototype choice, not a
permanent model: if multi-region work tracks visibility per region, the same
requirement applies to each region.

---

## 9. Manual verification

**No automated test exercises any of this.** There is no test framework, no CI, and
no browser harness. Everything below is a manual procedure executed in a running
build. Do not report a check as passed unless you performed it.

Start the app with `node server.mjs`, open `http://localhost:5173/`, and click
"Enter the observatory". The readout in the top-left is the state indicator.

### 9.1 Timing checkpoints

Measure from the moment a category is clicked. Small drift is expected on slow
machines; the ordering and ratios are what matter.

| Elapsed | Readout | Visual checkpoint |
| --- | --- | --- |
| 0.0 | `01 · solar system` | Selection note appears; panel disabled immediately, fade scheduled for 1.7 s |
| 2.2 | `02 · earth approach` | Camera starts closing; panel still fading (gone by ~3.4 s — two overlapping `hidePanel` calls) |
| 9.0 | `03 · earth orbit` | Earth fills frame; orbit lines fading |
| 14.5 | `04 · region approach` | Descent accelerates into the globe |
| 19.0 | `05 · cloud entry` | Veil near peak, clouds dense |
| 23.5 | `06 · region reveal` | Veil clears, marker fades in |
| 28.0 | `07 · region hotspot` | Pull-back begins, destination card appears |
| 30.2 | `07 · region hotspot` | Motion settled |

Hotspot click from free orbit: `04` at 0, `05` at 4.5, `06` at 9.0, `07` at 13.5,
settled at 15.7.

Back button: `06` at 0, `02` at 2.6, `01` at 6.4, settled at 11.1.

### 9.2 Interruption matrix

Reload the page between destructive tests to return to the baseline.

| Test | Action and timing | Expected |
| --- | --- | --- |
| I1 | Drag 1 s after selecting a category | Readout stays `01`; hint "Flight interrupted · manual control restored"; no destination card; panel should be visible — **if it is not, Q2 is confirmed** |
| I2 | Drag ~3 s after selection | Mode `SOLAR`; panel returns; `dist > 6` |
| I3 | Drag ~8.5 s after selection | Mode `EXPLORE`; hotspot armed |
| I4 | Wheel during cloud entry (~20 s) | Mode `EXPLORE`; veil fades out; region marker fades |
| I5 | Drag during reveal (~25 s) | Mode `EXPLORE`; no destination card appears |
| I6 | Wheel ~3 s into the Back transition | Manual control restored; panel returns; readout is not `01`; no stuck state |
| I7 | Press Escape during any flight | Nothing happens |
| I8 | Click Back during any flight | Nothing happens |
| I9 | After any interruption, inspect `__jukebox.director` | `isFlying === false`, `locked === false`, `rig.dist` unchanged by recovery |
| I10 | After I3/I4, click the hotspot | Flight continues to the region; destination card appears at the end |

Probe available in the console (exposed by `main.js`):

```js
__jukebox.mode                    // 'solar' | 'explore' | 'flying' | 'region'
__jukebox.director.isFlying       // false after a successful interrupt
__jukebox.director.locked
__jukebox.director.rig            // { dist, az, el, fov, focus, offX, offY }
```

### 9.3 Contract regression set

Minimum evidence required after any change to protected behaviour **or** to the
baseline choreography:

1. §9.1 checkpoints in order, with no readout skip or repeat.
2. I2, I3, I4, I6, I7, I8, I9 pass.
3. The destination card appears only after successful completion, never after an
   interruption.
4. `git diff` shows no change outside the intended files.

---

## 10. Observations on the current prototype (Q1–Q10)

None of these is a requirement, and none may be promoted to one without a separate
decision. They describe the Phase 1 prototype as it stands at `8ab5577`, so that
(a) nobody mistakes a temporary limitation for intended design, and (b) future work
starts from an accurate description.

Status vocabulary:

- **Confirmed source fact** — statically true in the current code (Q1, Q3, Q5, Q6,
  Q9, Q10).
- **Suspected defect** — statically reachable but not yet exercised in a browser
  (Q2, Q4, Q7, Q8). Runtime validation is required before treating one as either a
  bug or acceptable behaviour.

Fixing any of them is normal prototype work: it needs review, and the §9.3
regression set if protected behaviour is touched. It does not require preserving the
current approach.

| ID | Finding | Evidence | Status |
| --- | --- | --- | --- |
| Q1 | `shortened` is effectively dead. `approach`, `cloud`, and `reveal` are assigned the same values in both branches; only `lock` differs (2.0 vs 0.9), and the `settle = max(lock, 2.2)` floor cancels that difference. The hotspot flight is therefore the same 15.7 s as the full flight's region half | `camera-director.js → buildRegionSequence` | Confirmed source fact |
| Q2 | **Early-interrupt panel race.** `onSelect()` schedules `hidePanel(1.6)` at 1700 ms and never clears it. An interrupt before 1.7 s calls `showPanel()`, then the stale timer fades the panel out again. Because `.panel-inner` keeps `pointer-events: auto`, the invisible panel may remain clickable | `main.js` 1700 ms timer; `ui.js → hidePanel`; `styles.css .panel-inner` | **Suspected defect — runtime validation required** |
| Q3 | **Unguarded camera tweens vs. manual input.** `introDolly` writes `dist`/`fov`/`offX`/`offY` for 5.2 s with no input guard, so wheel zoom during it is overwritten each frame; it also starts at `dist = 15.2`, above the user maximum of 15. `enterFreeOrbit` similarly tweens `el` for 3.4 s and can fight a drag | `camera-director.js` introDolly/enterFreeOrbit; `controls.js` clamps | Confirmed source fact |
| Q4 | **Stale region target.** `buildRegionSequence()` runs synchronously at click time and captures `regionAzTilt`/`regionElTilt`. Earth keeps spinning at `spinScale ≈ 0.55` for the next 14.5 s, so the target azimuth is sampled before the descent begins | `camera-director.js` construction order; `earth.getRegionAzElTilt()` | **Suspected defect — visual impact not measured** |
| Q5 | **Composition persists after interrupt.** `restoreSolarState()` does not reset `focus`, `offX`, or `offY`. Interrupting near the region leaves the look target biased toward the region point and the framing offset applied | `camera-director.js → restoreSolarState` | Confirmed source fact |
| Q6 | Completion ordering differs between paths: the flight paths clear `locked` then call back; the return path also calls `setState(SOLAR_SYSTEM)` between them | `camera-director.js` onComplete blocks | Confirmed source fact |
| Q7 | **Return has no `pendingComplete`.** `returnToSolarSystem()` passes its callback directly to the timeline, so `killTimeline()` cannot route it, and an interrupted return never fires it. Panel restoration then depends entirely on `onUserIntent()` | `camera-director.js → returnToSolarSystem` | **Suspected defect — relies on a second code path** |
| Q8 | **Invisible hotspot after interrupting a return.** When a return is interrupted with `dist < 6`, `hotspotArmed` becomes `true` while `regionVisibility` tweens to 0, leaving a hittable marker that is fading or invisible | `main.onUserIntent`; `restoreSolarState`; `main.updateHotspot` | **Suspected defect — runtime validation required** |
| Q9 | **Overlapping return tweens.** The stage-2 tween runs 2.6–7.0 s and the final tween starts at 5.4 s; both target `dist`, `fov`, `focus`, `el`, and `az` on the same object for 1.6 s. GSAP resolves the conflict by render order, so the outcome is not explicit in the code | `camera-director.js` 2.6 s and 5.4 s blocks | Confirmed source fact; runtime effect unmeasured |
| Q10 | `director.onComplete` is initialised but never assigned, so `enterFreeOrbit()`'s `if (this.onComplete)` branch is dead | `camera-director.js:47`; no assignment in `src/` | Confirmed source fact |

---

## 11. Changing camera behaviour

Two tiers, because this document protects different things.

### 11.1 Reliability guarantees

Any change to a **MUST** in §2, §3, §5.6, §6.3, §6.5, §7, or §8 is gated:

1. **Review and explicit decision** on the behavioural change, before editing.
2. **Same-commit contract update** — this document must describe the new behaviour.
3. **Regression verification** using §9.3, with the performed checks reported.
4. **One commit**, scope-limited to the behaviour plus its documentation.

### 11.2 Baseline choreography, timings, and framing

These are **not** frozen. A different shot, a shorter hold, a new framing for a
second region, or a replacement for the single-region targeting strategy is normal
product work, not a contract violation. It still requires:

1. Review of the intended visual change.
2. The §9.3 regression set, so the reliability guarantees are shown to survive.
3. A same-commit update to the affected baseline entries in this document.

Nothing here should be read as "this prototype's single-region approach must be
preserved". §13 lists what is expected to change.

### 11.3 Documentation-only edits

Typos, link repair, and clarity edits need no decision gate, provided no **MUST**
statement changes meaning.

### 11.4 If code and document disagree

The running code is authoritative until an approved change says otherwise. Report
the discrepancy, update this document to match the code, and only then decide
whether the code should change. Do not silently "correct" the document to describe
intended-but-absent behaviour.

---

## 12. Provenance

| Item | Value |
| --- | --- |
| Applies to | Phase 1 prototype, single region, at the baseline commit |
| Baseline commit | `8ab5577` |
| Files verified | `src/camera-director.js`, `src/main.js`, `src/controls.js`, `src/earth.js`, `src/ui.js`, `src/config.js`, `styles.css` |
| Method | Direct source reading; no runtime instrumentation performed as part of writing this document |
| Runtime-confirmed items | None — every "Verified" label above is static source verification, not browser observation |

---

## 13. Prototype scope and future extensibility

Phase 1 is not final or fully polished. The camera system currently serves **one**
region, and several choices reflect that. Recording them as baseline does not make
them permanent.

| Current choice | Status | Why it is expected to change |
| --- | --- | --- |
| One region with fixed `regionAzTilt` / `regionElTilt` | Temporary | Multi-region support needs per-region targets |
| Region target sampled once at click (`buildRegionSequence`) | Temporary | Targets must stay correct while Earth rotates (Q4) |
| Fixed `focus` / `offX` / `offY` framing values | Temporary | Framing must adapt per region and per aspect |
| `regionVisibility` as one scalar | Temporary | Several regions may be visible or fading together |
| A single `REGION_EL` elevation offset | Temporary | Elevation must be derived per region |
| Exact durations in §5 | Baseline | Cinematic timing is a design decision, revisitable through §11.2 |

What must survive multi-region work:

- §7.3–§7.4 interruption recovery, unchanged in substance.
- Timeline cancellation and stale-callback cancellation (§6.5, §7.4).
- `locked` restoration, and the guarantee that `MODE` never sticks in `FLYING`.
- Escape and Back staying inert during `FLYING`.
- No completion callback firing after an interruption.

What need not survive: everything in the table above, plus Q1–Q10, which may be
fixed or redesigned as the prototype matures.

This section is descriptive. It does not implement or require any specific
multi-region design; it only states which current limitations the contract does not
entrench.

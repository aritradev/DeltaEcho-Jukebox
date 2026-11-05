# Camera transitions — behavioural contract

This document records the camera behaviour of the **current Phase 2 alpha
prototype** and separates two things that must not be confused:

- the **approved cinematic experience and its reliability guarantees** —
  interruption recovery, timeline cleanup, lock restoration, and cancellation of
  stale completion callbacks — which are protected;
- the **current choreography, timings, and camera targets**, which are a dated
  baseline recorded for regression comparison, not permanent requirements.

Phase 2 alpha is an early, unfinished prototype. The journey now continues past the
region into a flat map stage, and the single-region experience and its targeting
strategy remain temporary limitations: the region experience is expected to work
across many regions and future experiences. See §13.

> **Phase 2 alpha addition.** After cloud entry the camera hands over to a flat
> map: two camera-attached planes in `src/atlas.js` whose texture windows animate
> while the camera transform keeps its single writer. The `STATES` sequence has
> grown from six stages to eight (`CONTINENT`, `COUNTRY`, `LOCALITY` replace
> `REGION_REVEAL`, `REGION_HOTSPOT`). Everything in §2–§4, §6–§8 still applies
> unchanged; the atlas plates are scene parameters, not camera transforms.

Scope: `src/camera-director.js`, the camera-related parts of `src/main.js`,
`src/controls.js`, and the UI state they drive.

> **Baseline.** Values captured at the Phase 2 alpha commit (`feat: add a flat
> continent map stage after cloud entry`). The previous Phase 1 baseline was
> `8ab5577`. If the code and this document disagree, the code is correct and this
> document is stale — see §11.
>
> **Skip control.** Added after the baseline commit; §5.7 records its current values.

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

1. The cinematic journey keeps its current shape and character: eight ordered stages,
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

Everything in this section is the **baseline choreography at the Phase 2 alpha
commit**. It records what the prototype currently does so a later change can be
compared against it. None of these values is a lifetime requirement — §11.2
describes how to change them deliberately.

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
| 23.5 | `06 continent` | `atlasA` opacity → 1 (1.6 s, `power2.out`), `atlasA.zoom → 1.15` (3.2 s, `sine.inOut`), `veil → 0` (2.5 s, `power2.out`), `cloudOpacity → 0.4` (2.24 s). The veil is still up from cloud entry, so the globe→map swap happens underneath it |
| 26.7 | `07 country` | `atlasA.u → 0.551`, `atlasA.v → 0.733` (4.0 s, `power3.out`); `atlasA.zoom → 9` (4.0 s, `power2.inOut`) |
| 30.7 | — | Dissolve, no state change: `atlasB` set to `coxs.start` and faded in (1.7 s); `atlasA` fades out (1.36 s) while still zooming to `9 × 1.4`; `veil → 0.34` then back to 0 |
| 32.4 | `08 locality` | `atlasB` `u/v/zoom → coxs.end` (2.8 s, `power2.out`) |
| 35.2 | complete | `timeline = null`, `locked = false`, completion callback fires |

**Total: 35.2 s.** Stage boundaries: 2.2 / 9.0 / 14.5 / 19.0 / 23.5 / 26.7 / 32.4.

**Verified** — There is no `settle` floor any more. `buildRegionSequence()` returns
`t + TIMELINE.locality`, so the timeline ends exactly on the final atlas tween and the
completion callback fires at 35.2 s.

**Verified** — `CONTINENT` is also where input is switched off (`main.onStateChange`
calls `controls.setEnabled(false)`). The camera is inside a flat map from this point
on, so drag and wheel have nothing to act on until Back.

### 5.2 `continueToRegion` — hotspot click from free orbit

Same region sequence as 5.1 from its 14.5 s mark, starting at 0.

| At | State |
| --- | --- |
| 0 | `04 region approach` |
| 4.5 | `05 cloud entry` |
| 9.0 | `06 continent` |
| 12.2 | `07 country` |
| 17.9 | `08 locality` |
| 20.7 | complete |

Targets are identical to 5.1. `buildRegionSequence()` no longer takes a `shortened`
flag, so this path is simply the tail of the full flight with no timing differences.

### 5.3 `returnToSolarSystem` — Back button

Reached either directly, or through `exitAtlas()` when a map plate is on screen.

`exitAtlas()` first fades both atlas plates out over 0.5 s while raising the veil to
1, then resets `atlasA`/`atlasB` to their start values and calls
`returnToSolarSystem()`. When no plate is visible it forwards straight to
`returnToSolarSystem()`, so callers do not need to know the current mode. Back from
the map therefore takes 0.5 + 11.1 = **11.6 s**; from anywhere else, 11.1 s.

| At | State | Changes |
| --- | --- | --- |
| 0 | `06 continent` | `atlasA`/`atlasB` `opacity → 0` (0.9 s), `regionVisibility → 0` (1.8 s), `veil → 0` (1.2 s), `cloudOpacity → 0.72` (2.2 s), `spinScale → 0.55` (2 s), `dist → 2.6`, `fov → 44`, `offX → 0`, `offY → 0.023` (3.2 s) |
| 2.6 | `02 earth approach` | `dist → 5.2`, `fov → 46`, `focus → 0.45` (4.4 s); `el → 12°`, `az → wideAz` (4.4 s); `cloudOpacity → 0.3`; `orbitLineFade → 0`, `coronaScale → 1` |
| 5.4 | — | Final tween to `WIDE`: `dist 10.8`, `fov 56`, `focus 0`, `offX −0.278`, `offY 0`, `el 15°`, `az wideAz` (5.6 s, ends 11.0) |
| 6.4 | `01 solar system` | Readout switches before the camera finishes arriving |
| 11.0 | — | 0.1 s padding tween |
| 11.1 | complete | `timeline = null`, `locked = false`, `setState(SOLAR_SYSTEM)`, callback |

**Total: 11.1 s.** The readout therefore goes `08 → 06 → 02 → 01` from the map, and
`06 → 02 → 01` from elsewhere.

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
orbitLineFade       → 0
regionVisibility    → 0
coronaScale         → 1
veil                → 0
cloudOpacity        → CLOUDS.opacity.solarRest (0.3)
spinScale           → 0.55
atlasA/atlasB.opacity → 0
```

**MUST** — Interrupt recovery must not move the camera to a "recovered" pose: the
user's grabbed viewpoint is preserved. In the current prototype this is achieved by
`restoreSolarState()` touching scene parameters only. See Q5 for the consequence.

### 5.7 `skipToRegion` — skip control

The Skip control is shown only while `MODE === FLYING`: it appears when a category,
the place, or the region hotspot is chosen, and hides again on arrival, Back, or
interrupt. It is disabled whenever it is hidden.

`skipToRegion()` kills the timeline and cuts straight to the end of the region
sequence instead of playing it.

| Item | Value |
| --- | --- |
| Rig | `dist 1.052`, `az regionAzTilt`, `el regionElTilt + 3.2°`, `fov 53`, `focus 1`, `offX 0`, `offY 0.03` |
| Scene | `spinScale 0.55`, `regionVisibility 0.1`, `cloudOpacity 0.4`, `orbitLineFade 1`, `coronaScale 0.85` |
| Atlas | `atlasA.opacity 0`; `atlasB` at `coxs.end`, opacity 1 |
| State | `08 locality` immediately |
| Veil | jumps to 0.85, fades to 0 over 0.7 s |
| Completion | callback fires when the veil clears; `MODE` becomes `ATLAS` |

This is a tween, not a timeline, so `interrupt()` does not apply during the 0.7 s
cut; controls are disabled for that window.

### 5.8 Totals

| Path | Duration |
| --- | --- |
| `beginFlight` | 35.2 s |
| `continueToRegion` | 20.7 s |
| `returnToSolarSystem` | 11.1 s |
| Back via `exitAtlas` (plate visible) | 11.6 s |
| `enterFreeOrbit` | 3.4 s |
| `introDolly` | 5.2 s |
| `restoreSolarState` | 0.9 s |
| `skipToRegion` | 0.7 s |

---

## 6. Sequencing, state emission, and completion

### 6.1 Absolute-time authoring — **Verified**

Every tween in these timelines carries an absolute position parameter. Times are
accumulated in the builder:

```js
let t = t0 + T.approach;
...
this.buildRegionSequence(tl, t + T.orbit);
```

State changes are zero-duration calls placed at the same positions:

```js
scheduleState(tl, state, time)  →  tl.call(() => this.setState(state), null, time)
```

`setState()` returns early if the state is unchanged, otherwise fires
`onStateChange`, which updates the readout and performs entry effects (panel hide
on `EARTH_APPROACH`, input shutdown and anchor hiding on `CONTINENT`).

The atlas tweens are the exception to "camera only": they animate `atlasA`/`atlasB`,
plain state objects owned by the director. `src/atlas.js` reads them each frame and
writes only texture `offset`/`repeat` and mesh visibility — never a camera transform.

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

`exitAtlas()` is not a timeline of its own: it fades the plates over 0.5 s and then
delegates to `returnToSolarSystem()`, so the ordering above applies to the delegated
return. The 0.5 s fade is the only window in which a scripted transition is running
with `locked === false`; `MODE` is already `FLYING` and controls are already
disabled, so no input can reach a tween.

### 6.4 Lock lifecycle — **Verified**

| Method | Sets `locked` |
| --- | --- |
| `beginFlight` | `true` |
| `continueToRegion` | `true` |
| `returnToSolarSystem` | `true` |
| `exitAtlas` | unchanged (delegates to `returnToSolarSystem`) |
| `enterFreeOrbit` | `false` |
| `skipToRegion` | `false` |
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
gsap.killTweensOf(atlasA)
gsap.killTweensOf(atlasB)
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

Controls are **enabled for every camera flight** after `onEnter()`. The single
exception is the flat-map stage: `onStateChange(CONTINENT)` disables controls for the
rest of the descent, so from `CONTINENT` onward there is no user intent to interrupt
with. Before that point, the first user intent is what cancels a flight.

**Verified** — `main.onBack()` re-enables controls in the completion callback of
`director.exitAtlas()`, so the disabled window ends exactly when the map is gone.

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
- `Escape` acts only in `MODE.ATLAS` and `MODE.EXPLORE`; during `FLYING` it does
  nothing.
- The back button handler returns immediately when `MODE === FLYING`.

**MUST** — Keep the flat map inert. `MODE.ATLAS` means a plate is on screen and drag,
wheel, and pinch do nothing. Controls are re-enabled only by the callback that runs
after the plates have faded out, never while one is still visible. This is an
intentional input carve-out for the map stage, not an interruption guarantee: it
narrows when the user can interrupt, and must not be used to bypass §7.3–§7.4.

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
| Interrupt during cloud entry | Mode `EXPLORE`; veil fades to 0, atlas never appears | Verified |
| Interrupt during `returnToSolarSystem` | `interrupt()` succeeds; the return timeline's own callback never runs, so panel restoration comes from `onUserIntent` | Verified |
| Drag/wheel during `CONTINENT` → `LOCALITY` | No effect: controls are disabled on the `CONTINENT` state change | Verified |
| Skip during any flight | Timeline killed; 0.7 s veil cut; map reveal and destination card | Verified |
| Escape during `ATLAS` | Runs `onBack()` and leaves the map | Verified |
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
| `cloudOpacity` | director tweens | `earth.setCloudOpacity` | 0.3 → 1.0 → 0.4 |
| `regionVisibility` | director tweens | `main.updateHotspot` | 0 → 0.14 → 0.1 |
| `veil` | director tweens | `ui.setVeil` | 0 → 0.9 → 0 → 0.34 → 0 |
| `coronaScale` | director tweens | `solar.setCorona` | 1 → 0.85 → 1 |
| `orbitLineFade` | director tweens | `solar.setOrbitLines` | 0 → 1 → 0 |
| `punch` | `main.onHotspotClick` | `main.updateHotspot` | 0 → 1 → 0 |
| `atlasA` / `atlasB` | director tweens | `src/atlas.js` | `{u, v, zoom, opacity}`, opacity 0 → 1 → 0 |

`atlasA` maps `asia-satellite.jpg`, `atlasB` maps `coxs-bazar.jpg`. Both are plain
objects owned by the director; `Atlas.update()` converts them into texture
`offset`/`repeat` each frame. `ATLAS.levels` in `src/config.js` holds their tuned
`start`/`end` values.

**MUST NOT** — Leave a visible region marker while `MODE` is `SOLAR` after recovery.
In the current prototype this is guaranteed by `restoreSolarState()` driving
`regionVisibility` to 0 over 0.9 s. The single scalar is a prototype choice, not a
permanent model: if multi-region work tracks visibility per region, the same
requirement applies to each region.

**MUST NOT** — Leave a map plate visible in any mode. `main.updateHotspot()` bails
out while `director.atlasVisible`, and `restoreSolarState()` fades both plates to 0,
so an interrupted flight can never strand a plate over a live Earth view.

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
| 23.5 | `06 · continent` | Veil lifts onto the flat Asia map; drag and wheel stop responding |
| 26.7 | `07 · country` | Dive onto Bangladesh, destination card appears |
| 32.4 | `08 · locality` | Beach plate settles |
| 35.2 | `08 · locality` | Motion settled |

Hotspot click from free orbit: `04` at 0, `05` at 4.5, `06` at 9.0, `07` at 12.2,
`08` at 17.9, settled at 20.7.

Back button from the map: `06` at 0, `02` at 3.1, `01` at 6.9, settled at 11.6
(the 0.5 s plate fade precedes the return). From elsewhere: `06` at 0, `02` at 2.6,
`01` at 6.4, settled at 11.1.

Skip control: hidden until a category, the place, or the region hotspot starts a
flight; it then reaches `08 · locality` in 0.7 s with the destination card shown.

### 9.2 Interruption matrix

Reload the page between destructive tests to return to the baseline.

| Test | Action and timing | Expected |
| --- | --- | --- |
| I1 | Drag 1 s after selecting a category | Readout stays `01`; hint "Flight interrupted · manual control restored"; no destination card; panel should be visible — **if it is not, Q2 is confirmed** |
| I2 | Drag ~3 s after selection | Mode `SOLAR`; panel returns; `dist > 6` |
| I3 | Drag ~8.5 s after selection | Mode `EXPLORE`; hotspot armed |
| I4 | Wheel during cloud entry (~20 s) | Mode `EXPLORE`; veil fades out; region marker fades |
| I5 | Drag/wheel after `06 · continent` appears (~24 s) | No effect at all — controls are disabled; the flight continues to the map |
| I6 | Wheel ~3 s into the Back transition | Manual control restored; panel returns; readout is not `01`; no stuck state |
| I7 | Press Escape during any flight | Nothing happens |
| I8 | Click Back during any flight | Nothing happens |
| I9 | Press Escape on the finished map | Leaves the map and returns to the solar system |
| I10 | After any interruption, inspect `__jukebox.director` | `isFlying === false`, `locked === false`, `rig.dist` unchanged by recovery |
| I11 | After I3/I4, click the hotspot | Flight continues to the map; destination card appears at the end |

Probe available in the console (exposed by `main.js`):

```js
__jukebox.mode                    // 'solar' | 'explore' | 'flying' | 'atlas'
__jukebox.director.isFlying       // false after a successful interrupt
__jukebox.director.locked
__jukebox.director.atlasVisible   // true while a map plate is on screen
__jukebox.director.atlasA         // { u, v, zoom, opacity }
__jukebox.director.rig            // { dist, az, el, fov, focus, offX, offY }
```

### 9.3 Contract regression set

Minimum evidence required after any change to protected behaviour **or** to the
baseline choreography:

1. §9.1 checkpoints in order, with no readout skip or repeat.
2. I2, I3, I4, I5, I6, I7, I8, I9, I10 pass.
3. The destination card appears only after successful completion, never after an
   interruption.
4. The Skip control is hidden outside `FLYING`, and skipping reaches `08 · locality`
   with the destination card shown.
5. `git diff` shows no change outside the intended files.

---

## 10. Observations on the current prototype (Q1–Q11)

None of these is a requirement, and none may be promoted to one without a separate
decision. They describe the current prototype so that (a) nobody mistakes a
temporary limitation for intended design, and (b) future work starts from an
accurate description.

Status vocabulary:

- **Confirmed source fact** — statically true in the current code (Q2, Q3, Q5, Q6,
  Q9, Q10, Q11).
- **Suspected defect** — statically reachable but not yet exercised in a browser
  (Q4, Q7, Q8). Runtime validation is required before treating one as either a bug
  or acceptable behaviour.

Fixing any of them is normal prototype work: it needs review, and the §9.3
regression set if protected behaviour is touched. It does not require preserving the
current approach.

| ID | Finding | Evidence | Status |
| --- | --- | --- | --- |
| Q1 | *Resolved in Phase 2 alpha.* The `shortened` flag and the `settle` floor are gone; `buildRegionSequence()` is now the single region tail used by both entry paths, and its duration is exactly the sum of `continent + country + dissolve + locality` | `camera-director.js → buildRegionSequence` | Resolved |
| Q2 | **Early-interrupt panel race.** `onSelect()` schedules `hidePanel(1.6)` at 1700 ms and never clears it. An interrupt before 1.7 s calls `showPanel()`, then the stale timer fades the panel out again. Because `.panel-inner` keeps `pointer-events: auto`, the invisible panel may remain clickable | `main.js` 1700 ms timer; `ui.js → hidePanel`; `styles.css .panel-inner` | **Suspected defect — runtime validation required** |
| Q3 | **Unguarded camera tweens vs. manual input.** `introDolly` writes `dist`/`fov`/`offX`/`offY` for 5.2 s with no input guard, so wheel zoom during it is overwritten each frame; it also starts at `dist = 15.2`, above the user maximum of 15. `enterFreeOrbit` similarly tweens `el` for 3.4 s and can fight a drag | `camera-director.js` introDolly/enterFreeOrbit; `controls.js` clamps | Confirmed source fact |
| Q4 | **Stale region target.** `buildRegionSequence()` runs synchronously at click time and captures `regionAzTilt`/`regionElTilt`. Earth keeps spinning at `spinScale ≈ 0.55` for the next 14.5 s, so the target azimuth is sampled before the descent begins | `camera-director.js` construction order; `earth.getRegionAzElTilt()` | **Suspected defect — visual impact not measured** |
| Q5 | **Composition persists after interrupt.** `restoreSolarState()` does not reset `focus`, `offX`, or `offY`. Interrupting near the region leaves the look target biased toward the region point and the framing offset applied | `camera-director.js → restoreSolarState` | Confirmed source fact |
| Q6 | Completion ordering differs between paths: the flight paths clear `locked` then call back; the return path also calls `setState(SOLAR_SYSTEM)` between them | `camera-director.js` onComplete blocks | Confirmed source fact |
| Q7 | **Return has no `pendingComplete`.** `returnToSolarSystem()` passes its callback directly to the timeline, so `killTimeline()` cannot route it, and an interrupted return never fires it. Panel restoration then depends entirely on `onUserIntent()` | `camera-director.js → returnToSolarSystem` | **Suspected defect — relies on a second code path** |
| Q8 | **Invisible hotspot after interrupting a return.** When a return is interrupted with `dist < 6`, `hotspotArmed` becomes `true` while `regionVisibility` tweens to 0, leaving a hittable marker that is fading or invisible | `main.onUserIntent`; `restoreSolarState`; `main.updateHotspot` | **Suspected defect — runtime validation required** |
| Q9 | **Overlapping return tweens.** The stage-2 tween runs 2.6–7.0 s and the final tween starts at 5.4 s; both target `dist`, `fov`, `focus`, `el`, and `az` on the same object for 1.6 s. GSAP resolves the conflict by render order, so the outcome is not explicit in the code | `camera-director.js` 2.6 s and 5.4 s blocks | Confirmed source fact; runtime effect unmeasured |
| Q10 | `director.onComplete` is initialised but never assigned, so `enterFreeOrbit()`'s `if (this.onComplete)` branch is dead | `camera-director.js:47`; no assignment in `src/` | Confirmed source fact |
| Q11 | **The map has only two scales, so the beach hand-off is not a true continuous zoom.** At `asia.end.zoom = 9` the 1887×1962 plate shows a ~120 px tall window stretched to the frame (~8× upscale, and ~11× by the end of the dissolve), while `coxs-bazar.jpg` at `zoom 1.15` is close to 1:1. The 1.7 s cross-fade hides the cut but not the scale ratio, so the arrival can read as a fall rather than a dive. A third intermediate plate is the real fix | `ATLAS.levels` in `config.js`; `src/atlas.js → update()` window math | Confirmed source fact; visual severity unmeasured across viewports |

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
| Applies to | Phase 2 alpha prototype, single region, at the baseline commit |
| Baseline commit | Phase 2 alpha (`feat: add a flat continent map stage after cloud entry`) |
| Previous baseline | `8ab5577` (Phase 1) |
| Files verified | `src/camera-director.js`, `src/atlas.js`, `src/main.js`, `src/controls.js`, `src/earth.js`, `src/ui.js`, `src/config.js`, `styles.css` |
| Method | Direct source reading, plus a headless-Chrome scrub of the real timeline (`src/atlas.js` window math, state order, Back path) at 1600×900 and 760×1000 |
| Runtime-confirmed items | Atlas framing, zoom, and dissolve; state order `05 → 06 → 07 → 08`; Back via `exitAtlas`; zero console errors in both aspects |

---

## 13. Prototype scope and future extensibility

Phase 2 alpha is not final or fully polished. The camera system currently serves
**one** region, and several choices reflect that. Recording them as baseline does not
make them permanent.

| Current choice | Status | Why it is expected to change |
| --- | --- | --- |
| One region with fixed `regionAzTilt` / `regionElTilt` | Temporary | Multi-region support needs per-region targets |
| Region target sampled once at click (`buildRegionSequence`) | Temporary | Targets must stay correct while Earth rotates (Q4) |
| Fixed `focus` / `offX` / `offY` framing values | Temporary | Framing must adapt per region and per aspect |
| `regionVisibility` as one scalar | Temporary | Several regions may be visible or fading together |
| A single `REGION_EL` elevation offset | Temporary | Elevation must be derived per region |
| Two hard-coded atlas plates with hand-tuned `u`/`v`/`zoom` | Temporary | A real map stage needs georeferencing and more zoom levels (Q11) |
| Atlas plates attached to the camera with no depth | Temporary | A production map stage may need a different projection or a tile pyramid |
| Exact durations in §5 | Baseline | Cinematic timing is a design decision, revisitable through §11.2 |

What must survive multi-region work:

- §7.3–§7.4 interruption recovery, unchanged in substance.
- Timeline cancellation and stale-callback cancellation (§6.5, §7.4).
- `locked` restoration, and the guarantee that `MODE` never sticks in `FLYING`.
- Escape and Back staying inert during `FLYING`.
- No completion callback firing after an interruption.
- The flat map staying inert while visible, and leaving only through a path that
  re-enables controls when the plate is gone.

What need not survive: everything in the table above, plus Q1–Q11, which may be
fixed or redesigned as the prototype matures.

This section is descriptive. It does not implement or require any specific
multi-region design; it only states which current limitations the contract does not
entrench.

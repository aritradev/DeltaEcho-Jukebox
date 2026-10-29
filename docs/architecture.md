# Architecture

This document describes how the Earth Information Jukebox is put together at
runtime: the module boundaries, the two state machines, the render loop order, and
the conventions that keep the code predictable.

Related documents:

- [`../README.md`](../README.md) — what the project is and how to run it
- [`workflow.md`](workflow.md) — how to make and verify changes
- [`context-architecture.md`](context-architecture.md) — how documentation is
  organized for humans and agents

---

## 1. Design constraints

The project deliberately stays small and dependency-free at the tooling level.

| Constraint | Consequence |
| --- | --- |
| Vanilla ES modules, no bundler | `index.html` loads `src/main.js` directly; relative imports only |
| No npm dependencies | Three.js and GSAP are vendored under `vendor/` |
| Import map for `three` | Modules write `import * as THREE from 'three'` |
| Static hosting only | `server.mjs` exists for local development; no API layer |
| Single scene, single canvas | No routing, no multiple pages |

Anything that requires a build step, a framework, or a runtime service is out of
scope for the current phase.

---

## 2. Runtime topology

```text
index.html
  ├── import map: "three" -> ./vendor/three.module.js
  ├── styles.css
  └── src/main.js  (module entry)
        ├── three            (vendor)
        ├── gsap             (vendor/gsap/index.js)
        └── ./src/*.js       (application modules)
```

There is no server-side rendering and no client-side router. The browser owns all
state; the only server responsibility is delivering bytes with correct MIME types.

---

## 3. Startup sequence

`App.init()` in `src/main.js` runs in a fixed order. The order matters: the camera
director needs a fully built world, and the director is what drives the intro.

```text
new UI(handlers)                 wire DOM callbacks (select, back, enter)
buildRenderer()                  WebGLRenderer, ACES tone mapping, sRGB output
buildScene()                     Scene + PerspectiveCamera (added to scene)
bindEvents()                     resize, pointer, click, keydown
AssetLoader.loadAll()            await all textures, report progress
buildWorld()                     starfield, solar system, lights, earth, region
  └── CameraDirector(...)        computes framing, owns the rig
      └── ExplorerControls(...)  input, attached to the same canvas
director.apply()                 place the camera before the first frame
ui.showEnter()                   enable the "Enter the observatory" button
clock.start(); loop()            animation begins
```

Textures are loaded **before** the world is built. Modules therefore receive a
plain `textures` map rather than performing their own async loading. If you add a
texture, register it in `src/assets.js`, not in the consuming module.

The app instance is exposed as `window.__jukebox` for debugging.

---

## 4. Module map

| Module | Owns | Depends on |
| --- | --- | --- |
| `src/main.js` | App composition, UI↔scene wiring, mode machine, render loop, hotspot raycasting | everything below |
| `src/config.js` | All tuning constants: render, sun, planets, Earth, clouds, atmosphere, region, states, timelines, categories | — |
| `src/utils.js` | Math and DOM-canvas helpers, spherical conversions, seeded RNG | three |
| `src/assets.js` | Texture manifest and loading, progress callbacks, derived roughness map | three, config |
| `src/starfield.js` | Galaxy backdrop, star shells, parallax response to camera | three, utils |
| `src/sun.js` | Procedural sun: baked noise, surface shader, glow, rays, flares | three, utils |
| `src/solar-system.js` | Sun placement, planet orbits and spins, Saturn ring, orbit lines, corona | three, config, sun |
| `src/earth.js` | Earth surface, night lights, clouds, atmosphere/haze shaders, framing helpers | three, config, utils |
| `src/region.js` | Region footprint, beam, particles, reticle, hotspot hit target | three, config, utils |
| `src/camera-director.js` | Camera rig, keyframes, transitions, derived scene parameters | three, gsap, config, utils |
| `src/controls.js` | Drag/scroll/pinch input mapped to the rig, intent signaling | three, config |
| `src/ui.js` | All DOM reads/writes and overlay animation | gsap, config |

### Direction of dependencies

```text
main.js  ──>  ui.js, controls.js, camera-director.js, region.js,
              earth.js, solar-system.js, starfield.js, assets.js, config.js

camera-director.js ──> earth.js (queries), region.js (queries), config.js
earth.js / region.js / solar-system.js ──> config.js, utils.js
config.js ──> (nothing)
```

Rendering modules do not import `main.js` and do not touch the DOM. `ui.js` owns
the overlay elements; the only exceptions are cursor-state body classes, which
`main.js` (`grab`, `pointing`) and `controls.js` (`grabbing`) toggle while
dragging. `main.js` is the only module that mutates `MODE`.

---

## 5. Two state machines

There are two distinct concepts, and conflating them causes bugs.

### 5.1 Camera states — `STATES` in `src/config.js`

The *narrative* progression. `CameraDirector` owns the transition between them and
emits `onStateChange`, which updates the readout label.

```text
SOLAR_SYSTEM -> EARTH_APPROACH -> EARTH_ORBIT -> REGION_APPROACH
             -> CLOUD_ENTRY -> REGION_REVEAL -> REGION_HOTSPOT
```

These are sequential keyframes, not user-controllable modes. Backwards travel
replays the framing in reverse rather than stepping the enum backwards.

### 5.2 Interaction modes — `MODE` in `src/main.js`

The *input* posture. This machine decides what a click does and whether the UI is
interactive.

| Mode | Meaning | Click behaviour |
| --- | --- | --- |
| `SOLAR` | Wide observatory view, panel available | Clicking Earth begins `EXPLORE` |
| `EXPLORE` | Free orbit around Earth | Hotspot click continues to the region |
| `FLYING` | A scripted camera transition is running | Clicking is ignored |
| `REGION` | Region locked, destination card shown | Hotspot click punches in |

Rules that follow from this split:

- Never start a scripted transition while `mode === FLYING`.
- `onUserIntent()` may interrupt a flight; when it does, the mode becomes
  `EXPLORE` if the rig is close (`dist < 6`), otherwise `SOLAR`.
- `hotspotArmed` gates whether the region can be hovered or clicked.

---

## 6. Render loop

`App.loop` runs every frame in this order. Preserve the order when adding systems,
because several systems read parameters produced earlier in the same frame.

```text
delta = min(clock.getDelta(), 0.05)     clamp to avoid tab-switch jumps
elapsed += delta

solar.update(elapsed)                   orbital positions
solar.setOrbitLines(director.orbitLineFade)
solar.setCorona(director.coronaScale)

earth.refresh()                         world matrices for the spin group
earth.setSpinRate(director.spinScale)
earth.update(delta, elapsed, rig.dist)  shader uniforms, cloud evolution
earth.setCloudOpacity(director.cloudOpacity)
earth.setNormalScale(...)               detail normals ramp with proximity

sunLight.position.copy(solar.sunPosition)

controls.update(delta)                  user input -> rig
director.apply()                        rig -> camera position/quaternion
scene.updateMatrixWorld(true)

updateHotspot(delta)                    raycast, region uniforms, anchor label
starfield.update(elapsed, camera)       parallax
ui.setVeil(director.veil)               transition veil opacity

renderer.render(scene, camera)
```

The director is the single writer of camera transforms. Anything that moves the
camera must express intent through `director.rig` or a director method.

---

## 7. Camera system

`CameraDirector` maintains a small, animatable rig:

| Field | Meaning |
| --- | --- |
| `dist` | Distance from Earth centre, in Earth radii |
| `az` | Azimuth around Earth, radians |
| `el` | Elevation, radians |
| `fov` | Camera field of view |
| `focus` | Look-at bias toward the region |
| `offX`, `offY` | Screen-space framing offsets for UI composition |

`apply()` converts rig values into a world position using
`sphericalToVector3`, orients the camera, and writes the result. GSAP tweens the
rig object, never the camera directly.

Derived scene parameters are also owned here and read by the loop:

```text
spinScale, cloudOpacity, veil, regionVisibility, coronaScale, orbitLineFade, punch
```

`beginFlight`, `continueToRegion`, `enterFreeOrbit`, and `returnToSolarSystem`
build GSAP timelines; `interrupt()` kills the active timeline and reports whether a
flight was actually cancelled. `solveSunFraming()` runs once at startup to choose
the Earth spin and wide azimuth that puts the Sun and the Bay of Bengal in a
consistent composition.

`WIDE` (top of the file) is the canonical solar-system framing. Changing it shifts
the whole opening shot; changing `REGION_EL` shifts the regional shot.

---

## 8. Earth rendering stack

`src/earth.js` layers several meshes on the same sphere, from inside out:

| Layer | Purpose |
| --- | --- |
| Surface | Day map, normal map, roughness map; standard material |
| Night | Emissive city lights, additive, blended by sun direction |
| Clouds | Separate sphere with evolving cloud shader, opacity from the director |
| Atmosphere | Rim glow plus haze, both distance-driven |
| Region marker | Built separately in `region.js`, attached to the Earth frame |

Local sun direction is computed in Earth space and shared with the atmosphere and
cloud shaders, so lighting stays consistent as the planet orbits and spins.

### Coordinate convention

`latLonToVector3(lat, lon, radius)` maps geographic coordinates onto the sphere
using the same equirectangular convention as the textures:

```text
phi   = (90 - lat) * DEG     // polar angle from +Y
theta = (lon + 180) * DEG    // azimuth around Y
```

The Bay of Bengal is `lat 16.5`, `lon 89.0`. `config.js` also defines the cap angle,
shell scale, beam dimensions, and particle budget for its marker.

Because Earth is tilted (`EARTH.axisTiltDeg`), framing code often needs
*tilt-aware* queries (`getRegionAzElTilt`, `getLocalSunDirectionTilt`) instead of
the untilted ones. Use the tilt-aware variants whenever computing camera azimuth.

---

## 9. Region marker

`RegionMarker` builds five pieces: footprint cap, vertical beam, particle stream,
reticle, and an invisible hit target used for raycasting.

Visibility is not a boolean. `main.js` computes it per frame from three factors:

```text
distance factor   smoothstep(9, 4, rig.dist)
facing factor     smoothstep(0.06, 0.5, region.facingScore(camera.position))
punch             director.punch (click feedback)
```

The result is passed into `region.update(...)`. The hotspot is only interactive
when `hotspotArmed` is true and both factors are above their thresholds. The HTML
anchor label is positioned by projecting the region's world position to screen
space — never by absolute CSS coordinates.

---

## 10. UI layer

`src/ui.js` is the only DOM owner. It caches elements in the constructor, builds
the category buttons from `CATEGORIES`, and exposes intention-revealing methods
(`setProgress`, `showDestination`, `hidePanel`, `setVeil`, `setAnchor`, …) rather
than letting callers poke at nodes.

Overlay elements in `index.html`, back to front:

```text
#scene            WebGL canvas
#veil, #veil-noise    transition scrim
#vignette, #grain     film treatment
#masthead         brand
#readout          state + target telemetry
#panel            category picker / "Explore a place"
#selection-note   immediate feedback after a choice
#anchor           projected hotspot label
#destination      region card (Listen disabled in Phase 1)
#backbar          return control
#hint             transient messages
#loader           progress + entry gate
```

Body classes `grab`, `grabbing`, and `pointing` are the cursor contract: `main.js`
toggles `grab`/`pointing` by mode and hover, `controls.js` toggles `grabbing`
during a drag.

---

## 11. Assets

`AssetLoader` declares three groups: Earth maps, body maps, and the galaxy map.
Progress is reported as a ratio and mapped by the App onto the loader bar.

Two textures are intentionally unreferenced: `galaxy.jpg` (superseded by
`galaxy.webp`) and `moon.jpg` (no Moon body yet). `sun.jpg` is loaded but ignored
while `SUN.procedural` is `true`. Do not delete these as drive-by cleanup; their
removal is a product decision.

---

## 12. Performance notes

- `RENDER.maxPixelRatio` caps device pixel ratio at 2.
- `RENDER.far` is 12,000, so depth precision is finite; keep new geometry inside
  the existing scale rather than pushing the far plane.
- The starfield uses a fixed number of shells and points; it is a backdrop, not a
  simulation.
- The sun bakes its noise cube once at startup (`SUN.quality.bakeSize`) and then
  animates cheaply in shaders. Reducing `quality` values is the first lever on
  low-end GPUs.
- The render loop clamps `delta` to 50 ms. Do not introduce unbounded per-frame
  allocations in `update` methods; reuse scratch vectors as the existing modules do.

---

## 13. Extension points

Where to make common changes:

| Goal | Change |
| --- | --- |
| Retune framing or timing | `src/config.js` (`TIMELINE`, `WIDE`, `REGION_EL`) |
| Add a planet | `PLANETS` entry + texture in `assets/textures/` + `BODY_MAPS` in `assets.js` |
| Add a region | `REGION` config plus a per-region lookup; the marker currently assumes one |
| Adjust UI copy or layout | `index.html` for structure, `styles.css` for appearance, `ui.js` for behaviour |
| Change transition behaviour | `camera-director.js` timelines |
| Add audio or data | New module, wired from `main.js`; keep `ui.js` DOM-only |

---

## 14. Known limitations

- One hard-coded region; no data model for multiple regions.
- No persistence, no URL state, no deep links.
- No automated tests, linter, or CI.
- No error boundary beyond the startup `catch` that rewrites the loader subtitle.
- `mulberry32` exists in both `utils.js` and `sun.js`; `sun.js` keeps a private copy
  to stay self-contained. Consolidating them is safe but not urgent.
- `EARTH` duplicates the Earth entry in `PLANETS`; `PLANETS` is the source of truth
  for orbital motion, `EARTH` for Earth-specific rendering constants.

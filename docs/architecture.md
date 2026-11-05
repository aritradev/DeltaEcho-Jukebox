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
new UI(handlers)                 wire DOM callbacks (select, back, skip)
SpaceDive.start()                WebGL2 dive behind the loader text
AssetLoader.loadAll()            await all textures, report progress
buildRenderer()                  WebGLRenderer, ACES tone mapping, sRGB output
buildScene()                     Scene + PerspectiveCamera (added to scene)
buildWorld()                     starfield, solar system, lights, earth, region
  └── CameraDirector(...)        computes framing, owns the rig
      └── ExplorerControls(...)  input, attached to the same canvas
      └── Atlas(...)             flat-map plates, parented to the camera
  └── director.apply()           place the camera before the first frame
bindEvents()                     resize, pointer, click, keydown
renderer.compile(); render()     warm shaders/textures behind the loader
onEnter()                        boost the dive, fade the loader, start intro
clock.start(); loop()            animation begins
```

Textures are loaded **before** the world is built. Modules therefore receive a
plain `textures` map rather than performing their own async loading. If you add a
texture, register it in `src/assets.js`, not in the consuming module.

The loader auto-reveals when loading finishes; there is no Enter button.
`SpaceDive` runs only during loading and its GL context is disposed after the fade.

The app instance is exposed as `window.__jukebox` for debugging.

---

## 4. Module map

| Module | Owns | Depends on |
| --- | --- | --- |
| `src/main.js` | App composition, UI↔scene wiring, mode machine, render loop, hotspot raycasting | everything below |
| `src/config.js` | All tuning constants: render, sun, planets, Earth, clouds, atmosphere, region, states, timelines, categories | — |
| `src/utils.js` | Math and DOM-canvas helpers, spherical conversions, seeded RNG | three |
| `src/assets.js` | Texture manifest and loading, progress callbacks, derived roughness map | three, config |
| `src/space-dive.js` | Loading-screen WebGL2 dive; starts before textures, disposed after the reveal | — |
| `src/starfield.js` | Baked nebula sky, star shells, parallax response to camera | three, utils |
| `src/sun.js` | Procedural sun: baked noise, surface shader, glow, rays, flares | three, utils |
| `src/solar-system.js` | Sun placement, planet orbits and spins, Saturn ring, orbit lines, corona | three, config, sun |
| `src/earth.js` | Earth surface, night lights, clouds, atmosphere/haze shaders, framing helpers | three, config, utils |
| `src/region.js` | Region footprint, beam, particles, reticle, hotspot hit target | three, config, utils |
| `src/atlas.js` | Flat map stage: camera-attached plates, per-frame window math | three, config, utils |
| `src/camera-director.js` | Camera rig, keyframes, transitions, derived scene parameters | three, gsap, config, utils |
| `src/controls.js` | Drag/scroll/pinch input mapped to the rig, intent signaling | three, config |
| `src/ui.js` | All DOM reads/writes and overlay animation | gsap, config |

### Direction of dependencies

```text
main.js  ──>  ui.js, controls.js, camera-director.js, atlas.js, region.js,
              earth.js, solar-system.js, starfield.js, assets.js, config.js

camera-director.js ──> earth.js (queries), region.js (queries), config.js
atlas.js ──> config.js, utils.js
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
             -> CLOUD_ENTRY -> CONTINENT -> COUNTRY -> LOCALITY
```

These are sequential keyframes, not user-controllable modes. Backwards travel
replays the framing in reverse rather than stepping the enum backwards.

`CONTINENT`, `COUNTRY`, and `LOCALITY` are the flat-map stage: the camera stops
being the protagonist and `src/atlas.js` takes over the picture. The last three
states are still emitted by the same director timeline, so the readout and the
completion callback behave exactly as before.

### 5.2 Interaction modes — `MODE` in `src/main.js`

The *input* posture. This machine decides what a click does and whether the UI is
interactive.

| Mode | Meaning | Click behaviour |
| --- | --- | --- |
| `SOLAR` | Wide observatory view, panel available | Clicking Earth begins `EXPLORE` |
| `EXPLORE` | Free orbit around Earth | Hotspot click continues to the region |
| `FLYING` | A scripted camera transition is running | Clicking is ignored |
| `ATLAS` | Flat map is on screen, destination card shown | No drag or zoom; Back/Escape leaves |

Rules that follow from this split:

- Never start a scripted transition while `mode === FLYING`.
- `onUserIntent()` may interrupt a flight; when it does, the mode becomes
  `EXPLORE` if the rig is close (`dist < 6`), otherwise `SOLAR`.
- Interruption recovery guarantees are specified in
  [`camera-transitions.md`](camera-transitions.md) §7.
- `hotspotArmed` gates whether the region can be hovered or clicked.
- Entering `ATLAS` disables `ExplorerControls`; only the Back callback re-enables
  them. The map is never interactive, which is why it needs no drag handling of its
  own.

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
atlas.sync([atlasA, atlasB])            hand the map state to the renderer module
atlas.update()                          state -> texture offset/repeat, visibility
scene.updateMatrixWorld(true)

updateHotspot(delta)                    raycast, region uniforms, anchor label
starfield.update(elapsed, camera)       parallax
ui.setVeil(director.veil)               transition veil opacity

renderer.render(scene, camera)
```

The director is the single writer of camera transforms. Anything that moves the
camera must express intent through `director.rig` or a director method.

`atlas.update()` runs after `director.apply()` because the plates scale to the
camera's current FOV and aspect; running it earlier would draw a one-frame-stale
window while a transition is changing `fov`.

---

## 7. Camera system

`CameraDirector` owns an animatable rig — `dist`, `az`, `el`, `fov`, `focus`,
`offX`, `offY` — and converts it to a camera transform in `apply()`. GSAP tweens
the rig; nothing tweens the camera. It also owns the scene parameters the render
loop reads: `spinScale`, `cloudOpacity`, `veil`, `regionVisibility`,
`coronaScale`, `orbitLineFade`, `punch`, and the two map states `atlasA` / `atlasB`
(`{ u, v, zoom, opacity }`).

The map states are not camera transforms. `src/atlas.js` reads them and writes only
texture `offset`/`repeat` on camera-attached planes, so the rig contract in §6 still
holds with the map on screen.

`WIDE` (top of the file) is the canonical solar-system framing and `REGION_EL`
shifts the regional shot.

The transition choreography, exact timings, interruption recovery, and cleanup
guarantees are specified in [`camera-transitions.md`](camera-transitions.md). That
document owns the current camera behaviour; this section is an orientation only.
Its timings are a dated baseline, not a freeze.

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

The Bay of Bengal / Cox's Bazar region is `lat 21.43`, `lon 91.97`. `config.js` also
defines the cap angle, shell scale, beam dimensions, and particle budget for its
marker.

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
#destination      region card (Listen disabled in Phase 2 alpha)
#backbar          return control
#hint             transient messages
#loader           progress + space-dive reveal
```

Body classes `grab`, `grabbing`, and `pointing` are the cursor contract: `main.js`
toggles `grab`/`pointing` by mode and hover, `controls.js` toggles `grabbing`
during a drag.

---

## 11. Assets

`AssetLoader` declares four groups: Earth maps, body maps, the backdrop map, and the
atlas maps. The backdrop group is `smoke.png`, the cloud sprite the nebula sky is
painted from. The atlas group is derived from `ATLAS.levels` in `config.js`, so
adding a map level there is enough to get it loaded. Progress is reported as a ratio
and mapped by the App onto the loader bar.

Three textures are intentionally unreferenced: `galaxy.jpg` and `galaxy.webp`
(earlier galaxy backdrops, replaced by the baked nebula) and `moon.jpg` (no Moon
body yet). `sun.jpg` is loaded but ignored while `SUN.procedural` is `true`. Do not
delete these as drive-by cleanup; their removal is a product decision.

---

## 12. Performance notes

- `RENDER.maxPixelRatio` caps device pixel ratio at 2.
- `RENDER.far` is 12,000, so depth precision is finite; keep new geometry inside
  the existing scale rather than pushing the far plane.
- The starfield uses a fixed number of shells and points; it is a backdrop, not a
  simulation.
- The nebula sky is baked once at startup into a single equirectangular texture and
  drawn as one inward-facing sphere, so it costs one draw call and no per-frame
  overdraw. The bake stamps a few hundred `smoke.png` sprites into a float buffer;
  that is load-time work, not frame work. `NEBULA` in `src/starfield.js` holds the
  tuning (`gain`, sprite count, cluster layout).
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
| Reframe a map level | `src/config.js` (`ATLAS.levels.<key>.start/end`) |
| Add a map level | `ATLAS.levels` entry + image in `assets/textures/`; `assets.js` loads it automatically |
| Add a planet | `PLANETS` entry + texture in `assets/textures/` + `BODY_MAPS` in `assets.js` |
| Add a region | `REGION` config plus a per-region lookup; the marker currently assumes one |
| Adjust UI copy or layout | `index.html` for structure, `styles.css` for appearance, `ui.js` for behaviour |
| Change transition behaviour | `camera-director.js` timelines |
| Add audio or data | New module, wired from `main.js`; keep `ui.js` DOM-only |

---

## 14. Known limitations

- One hard-coded region; no data model for multiple regions.
- The flat map has two fixed plates with hand-tuned windows; there is no
  georeferencing, tiling, or intermediate scale, so the beach hand-off is a
  cross-fade rather than a continuous zoom.
- No persistence, no URL state, no deep links.
- No automated tests, linter, or CI.
- No error boundary beyond the startup `catch` that rewrites the loader subtitle.
- `mulberry32` exists in both `utils.js` and `sun.js`; `sun.js` keeps a private copy
  to stay self-contained. Consolidating them is safe but not urgent.
- `EARTH` duplicates the Earth entry in `PLANETS`; `PLANETS` is the source of truth
  for orbital motion, `EARTH` for Earth-specific rendering constants.

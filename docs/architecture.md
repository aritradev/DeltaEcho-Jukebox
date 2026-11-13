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
| Single main scene and canvas | The journey has no routing; `studio.html` is a separate static page with its own canvas |

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
        ├── procedural-texture-worker.js  (module worker)
        └── ./src/*.js       (application modules)

studio.html
  ├── studio.css
  └── src/studio.js
        ├── filmstrip.js
        ├── sonify.js
        └── studio-sky.js  (nebula/starfield backdrop)
```

There is no server-side rendering and no client-side router. The browser owns all
state; the only server responsibility is delivering bytes with correct MIME types.
The two pages share the static server, dataset assets, and audio conventions, but
do not share runtime state or navigation.

---

## 3. Startup sequence

`App.init()` in `src/main.js` runs in a fixed order. The order matters: the camera
director needs a fully built world, and the director is what drives the intro.

```text
new SignalAudio()                Web Audio graph, built lazily on first gesture
new UI(handlers)                 wire DOM callbacks (select, back, skip, audio, year)
SpaceDive.start()                WebGL2 dive behind the loader text
AssetLoader.loadCritical()       await Earth/planet textures, report completed count
AssetLoader.buildRoughness()     derive the roughness map in its own yielded stage
buildRenderer(); buildScene()
buildWorld()                     starfield, solar system, lights, earth, region
  └── CloudPass.create()         starts worker generation immediately
  └── Starfield.create()         worker-generated nebula, yield, then texture build
  └── await cloud pass           puff/field textures were generating in parallel
  └── CameraDirector(...)        computes framing, owns the rig
      └── ExplorerControls(...)  input, attached to the same canvas
      └── Atlas(...)             flat-map plates, parented to the camera
  └── director.apply()           place the camera before the first frame
bindEvents()                     resize, pointer, click, keydown
compileAsync(); render()         compile shaders, upload opening-frame textures
onEnter()                        boost the dive, stop it when the overlay hides,
                                 then prefetch atlas maps in the background
clock.start(); loop()            animation begins
```

Critical textures are loaded **before** the world is built, so modules receive a
plain `textures` map rather than performing their own async loading. Atlas maps are
the exception: they load after the reveal through `AssetLoader.loadAtlas()`, which
deduplicates requests and caches by file name. If you add a critical texture,
register it in `src/assets.js`, not in the consuming module.

Progress reflects requests that have completed, including failures. Each heavy
stage yields to the browser between stages, and procedural generation batches are
yielded so the loader animation keeps painting. Eagerly uploading every texture was
measured as a loader-time regression, so the loader waits for shader compilation and
one opening render; any texture not used in that frame uploads when first needed.

The loader auto-reveals when the opening scene is ready; there is no Enter button.
`SpaceDive` runs only during loading and its GL context is disposed after the fade.

A return from `studio.html` records `sessionStorage['jukebox:warmed']`. On the next
`index.html` load, an inline head script sets `is-warm-return` before first paint,
which hides the loader. `App.init()` then skips `SpaceDive`, `onEnter()` skips the
loader fade and `introDolly`, and the camera is placed at the wide framing
immediately. A back-forward-cache restore calls the same instant dismissal from
`pageshow` instead of re-running `init()`.

The app instance is exposed as `window.__jukebox` for debugging.

---

## 4. Module map

| Module | Owns | Depends on |
| --- | --- | --- |
| `src/main.js` | App composition, UI↔scene wiring, mode machine, render loop, hotspot raycasting | everything below |
| `src/config.js` | All tuning constants: render, sun, planets, Earth, clouds, atmosphere, states, timelines, atlas | — |
| `src/region-imagery.js` | Locality plate files, acquisition dates, source credits, and display caveats | — |
| `src/regions.js` | Generated destination index: coordinates, colours, availability, per-region yearly signals, comparison pairs | — |
| `src/utils.js` | Math and DOM-canvas helpers, spherical conversions, seeded RNG | three |
| `src/assets.js` | Critical texture manifest/loading, lazy atlas loading, progress callbacks, derived roughness map | three, config |
| `src/procedural-textures.js` | Deterministic pixel generation for the nebula and cloud sprites; no DOM or Three imports | — |
| `src/procedural-texture-job.js` | Runs generation in a module worker, validates transferred buffers, falls back cooperatively, enforces a timeout | procedural-textures |
| `src/procedural-texture-worker.js` | Module worker entry that returns transferred pixel buffers | procedural-textures |
| `src/space-dive.js` | Loading-screen WebGL2 dive; starts before textures, disposed after the reveal | — |
| `src/starfield.js` | Baked nebula sky, star shells, parallax response to camera | three, utils, procedural-texture-job |
| `src/filmstrip.js` | Studio filmstrip presets (MODIS monthly + two annual EIC series), dates, loading, per-frame measurement | — |
| `src/sonify.js` | Maps Studio filmstrip/weather features to sound parameters | filmstrip |
| `src/studio.js` | Studio playback clock, dataset switching, timeline/scanline, weather readout, provenance, failure retry | filmstrip, sonify, studio-sky |
| `src/studio-sky.js` | Lightweight 2D canvas backdrop for the Studio: bakes the shared nebula once and drifts a star field; CSS radial fallback | procedural-texture-job, procedural-textures |
| `src/sun.js` | Procedural sun: baked noise, surface shader, glow, rays, flares | three, utils |
| `src/solar-system.js` | Sun placement, planet orbits and spins, Saturn ring, orbit lines, corona | three, config, sun |
| `src/earth.js` | Earth surface, night lights, clouds, atmosphere/haze shaders, framing helpers | three, config, utils |
| `src/region.js` | Region footprint, beam, particles, reticle, hotspot hit target, retargeting | three, config, utils |
| `src/atlas.js` | Flat map stage: camera-attached plates, per-frame window math, placeholder plates | three, config, utils |
| `src/cloud-pass.js` | Camera-space cloud billboards and backdrops for the globe→map handoff; procedural textures | three, utils |
| `src/camera-director.js` | Camera rig, keyframes, transitions, region retargeting, derived scene parameters | three, gsap, config, utils |
| `src/controls.js` | Drag/scroll/pinch input mapped to the rig, intent signaling | three, config |
| `src/signal-audio.js` | Web Audio graph for the ten signals: continuous layers, plucks, arpeggio, percussion | regions |
| `src/ui.js` | All DOM reads/writes, place explorer, signal panel, mobile sheet, year/compare state | gsap, regions |

### Direction of dependencies

```text
main.js  ──>  ui.js, controls.js, camera-director.js, atlas.js, cloud-pass.js,
              region.js, regions.js, earth.js, solar-system.js, starfield.js,
              assets.js, signal-audio.js, config.js

camera-director.js ──> earth.js (queries), region.js (queries), config.js
atlas.js ──> config.js, utils.js
cloud-pass.js / starfield.js ──> utils.js, procedural-texture-job.js
earth.js / region.js / solar-system.js ──> config.js, utils.js
signal-audio.js ──> regions.js
ui.js ──> regions.js (including COMPARISON_PAIRS)
studio.js ──> filmstrip.js, sonify.js, studio-sky.js
studio-sky.js ──> procedural-texture-job.js, procedural-textures.js
config.js / regions.js ──> (nothing)
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
| `EXPLORE` | Free orbit around Earth; place panel stays usable | Hotspot click or place selection continues to the region |
| `FLYING` | A scripted camera transition is running | Clicking is ignored |
| `ATLAS` | Flat map is on screen, destination card shown | No drag or zoom; Back/Escape returns to the flight's origin (orbit or wide) |

Map preparation is not an interaction mode. While `main.pendingSelection` is set,
the app stays in `SOLAR` or `EXPLORE`, the panel and globe remain usable, and the
status banner offers Cancel (and Retry after failure). A monotonically increasing
`selectionToken` makes only the latest choice eligible to call `applyRegion()` and
enter `FLYING`. Escape, Back, drag intent, and entering free orbit all cancel a
pending selection before their normal mode handling. Flight timelines themselves
start only after the required plate and shader work are ready, so no camera
transition is ever waiting on a network request mid-flight.

Rules that follow from this split:

- Never start a scripted transition while `mode === FLYING`.
- Never set `FLYING` while a map request is still pending; cancel or supersede it
  instead.
- `onUserIntent()` may interrupt a flight; when it does, the mode becomes
  `EXPLORE` if the rig is close (`dist < 6`), otherwise `SOLAR`.
- `returnMode` records whether the current flight started in `EXPLORE` or `SOLAR`.
  `onBack()` uses it to choose `exitAtlasToOrbit()` or `exitAtlas()`, so a
  destination chosen from Earth orbit returns to that orbit framing and re-enables
  the panel; a destination chosen from the wide view returns wide.
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
updateQuality(now)                      sample frame gaps -> adjust renderer DPR
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
director.apply(delta)                   rig -> camera position/quaternion
audio.update()                          schedule rhythmic layers against the audio clock
atlas.sync([atlasA, atlasB])            hand the map state to the renderer module
atlas.update()                          state -> texture offset/repeat, visibility
cloudPass.update(delta, director.cloudPass)  billboard cloud intensity
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

`updateQuality()` samples actual frame gaps in a three-second window and uses the
80th percentile. Slow frames lower the canvas pixel ratio in 0.25 steps (floor 0.75)
and lower the ceiling so a known-slow tier is not retried; sustained fast frames
raise it back toward the ceiling. Samples are discarded while the tab is hidden,
during flights, while a map is preparing, after gaps over one second (suspension or
tab switch), and during an eight-second cooldown. Sub-second slow frames still count,
so a device rendering at a few frames per second can actually trigger a reduction.
It changes only the renderer buffer, starfield pixel ratio, and region
marker pixel ratio — never DOM size, camera transforms, or framing.

---

## 7. Camera system

`CameraDirector` owns an animatable rig — `dist`, `az`, `el`, `fov`, `focus`,
`offX`, `offY` — and converts it to a camera transform in `apply()`. GSAP tweens
the rig; nothing tweens the camera. It also owns the scene parameters the render
loop reads: `spinScale`, `cloudOpacity`, `cloudPass`, `veil`, `regionVisibility`,
`coronaScale`, `orbitLineFade`, `punch`, and the two map states `atlasA` / `atlasB`
(`{ u, v, zoom, opacity }`).

The map states are not camera transforms. `src/atlas.js` reads them and writes only
texture `offset`/`repeat` on camera-attached planes, so the rig contract in §6 still
holds with the map on screen.

`cloudPass` is a single intensity scalar. `src/cloud-pass.js` reads it and animates
its own camera-attached billboards; like the atlas it never writes a camera
transform, so the same contract holds while the clouds are up.

`WIDE` (top of the file) is the canonical solar-system framing and `REGION_EL`
shifts the regional shot. The wide `offX` is aspect-aware: `getWideFraming()` fades
it to zero in portrait so Earth stays centred above the mobile sheet, and
`refreshWideFraming()` reapplies it after rotation while the camera is parked.

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

The default Cox's Bazar region is `lat 21.43`, `lon 91.97`. The eight destinations and
their coordinates live in `src/regions.js`. `config.js` defines the cap angle, shell
scale, beam dimensions, and particle budget shared by the marker for every region.

Because Earth is tilted (`EARTH.axisTiltDeg`), framing code often needs
*tilt-aware* queries (`getRegionAzElTilt`, `getLocalSunDirectionTilt`) instead of
the untilted ones. Use the tilt-aware variants whenever computing camera azimuth.

---

## 9. Region marker

`RegionMarker` builds five pieces: footprint cap, vertical beam, particle stream,
reticle, and an invisible hit target used for raycasting. All eight destinations share
the same geometry; `setRegion()` moves the existing root to new coordinates rather
than rebuilding it. `main.selectDestination()` installs the selected locality plate
before warming textures and compiling shaders; `main.applyRegion()` then calls
`director.setRegion()` before the flight begins. `Atlas` owns only generated fallback
plates, so cached NASA image textures are never disposed when switching regions.

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

`src/ui.js` is the only DOM owner. It caches elements in the constructor, builds the
place explorer from `REGIONS` and the signal rows from `SIGNALS`, and exposes
intention-revealing methods (`setProgress`, `showDestination`, `showSignals`,
`setYear`, `hidePanel`, `setVeil`, `setAnchor`, …) rather than letting callers poke
at nodes.

The panel has two views. `#places-view` is the Geographic Explorer: search, country
groups, and destination rows. `#signals-view` is the destination view: ten layer
toggles, live yearly values, and the year/compare bar. Its header is also the region
switcher: the destination name and chevron open a grouped list of all eight
destinations, and choosing one calls `onSwitchRegion` → `main.js`
`switchDestinationInAtlas()`, which swaps the plate, marker, readout, panel, and
audio target without leaving the flat-map stage. `setYear()` is the single entry
point for both the slider and the compare timer; it updates the panel and notifies
`main.js`, which forwards the year to `SignalAudio`.

Below 820px, and in short landscape windows (≤560px tall, ≤1024px wide), the same
panel becomes a three-snap bottom sheet. `ui.js` owns the `peek`/`half`/`full`/
`hidden` state, writes `data-sheet` and `data-view`, and is the only module allowed
to change panel visibility. `main.js` only requests mode transitions. Desktop keeps
the original GSAP opacity/transform panel; mobile uses height transitions and the
FULL-only scrim. The interaction contract is
[`mobile-sheet.md`](mobile-sheet.md).

The Places view keeps destinations ahead of secondary copy on small screens: search
and the compact Sound Lab link share the first row, while the HALF sheet hides the
guidance sentence and country heading. Signals render missing values as `N/A` and
disable that layer; a short explanation distinguishes absent data from zero.

The persistent audio toolbar exposes state, an explicit Play/Pause button, mute, and
volume. Play/Pause calls `SignalAudio.togglePlay()`, which suspends or resumes the
context in place. Mute/volume feed a final `userGain` stage after the compressor, so
camera fades cannot override the user's choice, and they stay independent of
Play/Pause. The UI moves focus away from the button before hiding it.

Overlay elements in `index.html`, back to front:

```text
#scene            WebGL canvas
#veil, #veil-noise    transition scrim
#vignette, #grain     film treatment
#masthead         brand
#readout          state + target telemetry
#audio-controls   persistent state, Play/Pause, mute, volume
#sheet-scrim      FULL-state sheet scrim (mobile)
#panel            place explorer / destination signal explorer / bottom sheet
#selection-note   immediate feedback after a choice
#anchor           projected hotspot label
#backbar          return control
#hint             transient messages
#loader           progress + space-dive reveal
```

`#map-status` lives inside the Places scroll and reports map preparation, failure,
Retry, and Cancel without changing the interaction mode.

Body classes `grab`, `grabbing`, and `pointing` are the cursor contract: `main.js`
toggles `grab`/`pointing` by mode and hover, `controls.js` toggles `grabbing`
during a drag.

---

## 11. Assets

`AssetLoader` has two paths. `loadCritical()` requests Earth maps, body maps, and
`smoke.png` (the cloud sprite the nebula sky is painted from). `earth_normal.jpg`
and `earth_specular.jpg` are optional: a failure is recorded as a warning and the
loader reports reduced surface detail. Any other failure rejects with the missing
file list. Progress is the number of completed requests divided by the critical
total, so it cannot jump ahead of the network.

`loadAtlas(regionId)` runs after the reveal. It always requests the Asia plate and
the selected region's locality plate from `src/region-imagery.js`. Requests are
deduplicated through a map of in-flight promises, successful textures are cached by
file name, and a failed entry is removed so Retry can request it again. Adding a
region image therefore requires a texture, an entry in `REGION_IMAGERY`, and the
same region ID in the generated region index.

`assets/data/bd_6_regions_1985_2026_champion_jukebox.json` is not loaded at runtime.
`tools/build-regions.mjs` reads it, plus the NASA EIC gallery export
(`assets/data/nasa_eic_gallery_2000_2026_frames_and_cv_sonification.json`), and
writes `src/regions.js`, which the browser imports directly. The Studio separately
loads its POWER JSON and measures the selected filmstrip image on that page.

`src/starfield.js` and `src/cloud-pass.js` do not add loader entries: their textures
are generated from `src/procedural-textures.js`. The generator returns plain
`Uint8ClampedArray` pixel buffers; `src/procedural-texture-job.js` runs it in a
module worker, transfers the buffers back, validates dimensions, and terminates the
worker. If `Worker` is unavailable it runs the same generator in 8 ms cooperative
slices. A worker that never answers is terminated after 20 seconds so the loader can
show an actionable failure instead of waiting forever.

Three textures are intentionally unreferenced: `galaxy.jpg` and `galaxy.webp`
(earlier galaxy backdrops, replaced by the baked nebula) and `moon.jpg` (no Moon
body yet). `sun.jpg` is retained but not requested while `SUN.procedural` is `true`.
`coxs-bazar-decade.jpg`, `everest-filmstrip-2000-2026.jpg`, and
`wildfires-filmstrip-2000-2026.jpg` are used only by the Studio. Do not delete
textures as drive-by cleanup; their removal is a product decision.

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
  tuning (`gain`, sprite count, cluster layout). Pixel generation runs off the main
  thread when a module worker is available.
- The cloud pass's puff and field textures use the same worker path. Nebula and
  cloud jobs start together in separate workers, so their wall-clock generation
  overlaps while the main thread assembles the rest of the scene.
- Atlas images are outside the startup critical path and load after the reveal.
  Only the Asia plate and Cox's Bazar plate are prefetched; the other regional
  plates load on selection and remain cached. Flight preparation warms the newly
  available textures before creating its timeline; it does not eagerly upload every
  startup texture.
- `RENDER.quality*` controls adaptive resolution. The first mobile ratio is capped
  at 1.5; slow sampling lowers DPR to a 0.75 floor, and a ceiling prevents retrying
  a tier that was already slow. The canvas CSS size and camera framing do not change.
- The sun bakes its noise cube once at startup (`SUN.quality.bakeSize`) and then
  animates cheaply in shaders. Reducing `quality` values is the first lever on
  low-end GPUs.
- The render loop clamps `delta` to 50 ms. Do not introduce unbounded per-frame
  allocations in `update` methods; reuse scratch vectors as the existing modules do.
- `server.mjs` sends `Cache-Control: no-cache` for pages, scripts, and data so
  edits show up on reload, and a one-hour `max-age` for `assets/textures/` and
  `vendor/` so a Studio round-trip reuses decoded textures and vendored modules.
  Repeat measurements are not production cache-hit benchmarks; a host must
  configure compression and long-lived immutable asset caching.

---

## 13. Extension points

Where to make common changes:

| Goal | Change |
| --- | --- |
| Retune framing or timing | `src/config.js` (`TIMELINE`, `WIDE`, `REGION_EL`) |
| Reframe a map level | `src/config.js` (`ATLAS.levels.<key>.start/end`) |
| Add a map level | `ATLAS.levels` entry + image in `assets/textures/` + matching entry in `AssetLoader.loadAtlas()` |
| Add or replace a region plate | Texture in `assets/textures/` + entry in `src/region-imagery.js` |
| Add a planet | `PLANETS` entry + texture in `assets/textures/` + `BODY_MAPS` in `assets.js` |
| Add a destination | Add it to the source dataset and `META` (or `EIC_THEMES` for an EIC theme) in `tools/build-regions.mjs`, then regenerate `src/regions.js` |
| Change a signal mapping | `SIGNALS` in `tools/build-regions.mjs`, then regenerate; tune the voice in `signal-audio.js` |
| Adjust UI copy or layout | `index.html` for structure, `styles.css` for appearance, `ui.js` for behaviour |
| Change transition behaviour | `camera-director.js` timelines |
| Add a data source | A loader/generator that writes a module, wired from `main.js`; keep `ui.js` DOM-only |

---

## 14. Known limitations

- Eight destinations share one marker, one camera framing, and one atlas window. The
  data model supports more, but framing is not yet per-region.
- All eight destinations have locality plates. The five NASA HLS L30 plates and the
  two NASA SVS EIC plates are fixed-date views rather than imagery for the selected
  signal year; the grouped Kutubdia & Saint Martin plate shows Kutubdia only.
  `makeRegionPlate()` remains the fallback for a region without a configured plate;
  a failed configured download uses the inline Retry/Cancel path.
- The two NASA EIC destinations only carry signals for 2000–2026; their year slider
  and comparison list are filtered to available years. Their values are image-derived
  proxies from NASA EIC annual computer-vision metrics, not in-situ measurements, and
  `seaLevel` is unavailable.
- The flat map has two layers with hand-tuned windows: the Asia plate and one of
  eight locality plates. There is no georeferencing, tiling, or intermediate scale,
  so the place hand-off is a cross-fade rather than a continuous zoom.
- Audio is fully synthesized. It does not stream recordings, and there is no
  analyser or export path.
- No persistence, no URL state, and no deep links into a specific destination.
- No automated tests, linter, or CI are committed.
- Startup failures rewrite the loader subtitle and expose a reload control; map
  failures expose inline Retry/Cancel; the Studio exposes filmstrip retry. There is
  still no global error boundary for later runtime failures, and the worker has no
  automatic regeneration fallback after a failure (the retry is a page reload).
- `mulberry32` exists in both `utils.js` and `sun.js`; `sun.js` keeps a private copy
  to stay self-contained. Consolidating them is safe but not urgent.
- `EARTH` duplicates the Earth entry in `PLANETS`; `PLANETS` is the source of truth
  for orbital motion, `EARTH` for Earth-specific rendering constants.

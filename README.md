# Earth Information Jukebox

A cinematic, browser-based journey from the Solar System to Earth, down through the
clouds to a flat continent map, and finally into a single place: **Cox's Bazar** on
the Bay of Bengal.

This repository contains **Phase 2 alpha**, a visual prototype. There is no audio, no
external data feed, and no backend. The "Listen" action is intentionally disabled;
the work here is the camera choreography, the rendered Earth, the map descent, and
the UI that frames the eventual listening experience.

---

## Quick start

Requirements:

- **Node.js 18+** — used only to serve static files.
- A **WebGL2-capable** browser with ES module and import map support.

There is no build step, no package manager, and nothing to install. Three.js and
GSAP are vendored in `vendor/`.

```powershell
# from the repository root
node server.mjs
```

Then open <http://localhost:5173/>.

To use a different port, set `PORT`:

```powershell
$env:PORT = 8080
node server.mjs
```

If the chosen port is already taken, the server walks forward to the next free one
and prints the URL it actually bound to (up to 10 attempts).

### Why a server instead of opening `index.html`

The app uses ES modules, an import map, and `fetch`-loaded textures. Browsers
block those under the `file://` protocol, so a local HTTP server is required.

`server.mjs` is a dependency-free static file server. It resolves paths under the
repository root, rejects traversal outside it, sets content types, and sends
`Cache-Control: no-cache` so edits show up on reload.

---

## Project structure

```text
.
├── index.html              Page shell: canvases, overlays, panel, loader
├── styles.css              All UI styling and overlay effects
├── server.mjs              Zero-dependency static file server (port 5173)
├── src/
│   ├── main.js             App composition, mode/state machine, render loop
│   ├── config.js           Central tuning: render, planets, region, atlas, states, timelines
│   ├── assets.js           Texture loading with progress reporting
│   ├── utils.js            Math helpers (clamp, lerp, smoothstep, seeded RNG)
│   ├── starfield.js        Baked nebula sky and star points
│   ├── sun.js              Procedural sun surface, corona, and flares
│   ├── solar-system.js     Planet orbits, Saturn ring, shared sun position
│   ├── earth.js            Earth surface, night lights, clouds, atmosphere shader
│   ├── region.js           Cox's Bazar marker, beam, particles, hotspot hit area
│   ├── atlas.js            Flat map stage: camera-attached plates, window math
│   ├── cloud-pass.js       Camera-space cloud billboards for the globe→map handoff
│   ├── camera-director.js  Keyframed camera states and transitions
│   ├── controls.js         Drag-to-rotate and scroll-to-zoom input
│   ├── space-dive.js       WebGL2 dive effect for the loading screen
│   └── ui.js               DOM bindings: loader, panel, readout, destination card
├── assets/textures/        20 texture images (17 currently referenced)
└── vendor/
    ├── three.module.js     Three.js r170
    └── gsap/               GSAP 3.12.5 (core, CSSPlugin, ESM index)
```

---

## How it works

`src/main.js` owns an `App` class that wires everything together:

1. Start the `SpaceDive` WebGL2 effect behind the loader text.
2. Load all textures through `AssetLoader`, reporting progress to the loader overlay.
3. Build the renderer, scene, camera, and world: starfield, solar system, Earth, region marker.
4. Create the `CameraDirector`, which owns the camera timeline.
5. Warm shaders and textures with one render while the loader is still opaque.
6. Auto-reveal: boost the dive, fade the loader, dispose its GL context, and start the intro.
7. Run the animation loop, advancing planetary motion, shaders, and the director.

There is no Enter button; the app reveals itself as soon as the textures are ready.

### Camera states

The journey is a fixed sequence defined in `STATES` (`src/config.js`), driven by
`CameraDirector` (`src/camera-director.js`):

| State | What the viewer sees |
| --- | --- |
| `solar system` | Wide view of the Sun and eight planets |
| `earth approach` | Camera closes on Earth |
| `earth orbit` | Earth fills the frame; clouds and atmosphere strengthen |
| `region approach` | Descent toward Cox's Bazar |
| `cloud entry` | Passes through the cloud layer |
| `continent` | Globe hands over to the flat Asia map behind the cloud pass |
| `country` | Map dives onto Bangladesh |
| `locality` | Beach plate settles on Cox's Bazar; destination card shown |

The last three stages are a flat-map stage, not a camera move: `src/atlas.js` draws
two camera-attached plates and animates only their texture windows, so the camera
keeps a single writer. The globe→map swap is hidden by `src/cloud-pass.js`, a
camera-space cloud field that is faded out over the map. Drag and scroll are inert
once the map appears; Back and Escape return to the solar system.

User input (drag/scroll) hands control to `ExplorerControls` while the globe is on
screen. Returning via the on-screen back button replays the reverse framing, and the
cloud pass fades in as the map dissolves so the climb back out passes through the
same cloud layer.

### Configuration

Nearly every visual constant lives in `src/config.js`: render settings, sun and
planet definitions, cloud and atmosphere response curves, the region's coordinates,
the map levels (`ATLAS.levels`), state identifiers, and transition durations. Prefer
editing that file over scattering magic numbers through modules.

---

## Assets

`assets/textures/` holds 20 images. Seventeen are referenced by `src/assets.js` and
`src/config.js`.

`smoke.png` is the cloud sprite that the nebula sky is painted from; the backdrop
is baked from it once at startup, so no other sky image is needed at runtime. The
cloud pass generates its puff and cloud-field textures procedurally, so it adds no
files to the asset manifest.

The map stage uses two plates:

| File | Role |
| --- | --- |
| `asia-satellite.jpg` | Continent level (1887×1962), framed and tuned in `ATLAS.levels.asia` |
| `coxs-bazar.jpg` | Locality level (2504×1936), `ATLAS.levels.coxs` |

Both are `.jpg` so `assets.js` assigns them `SRGBColorSpace`.

Three files are currently unreferenced but intentionally retained:

| File | Note |
| --- | --- |
| `galaxy.jpg` | An earlier galaxy backdrop, no longer used |
| `galaxy.webp` | Replaced by the baked nebula, which paints from `smoke.png` |
| `moon.jpg` | No Moon body exists in `PLANETS` yet |

`sun.jpg` is loaded but unused while `SUN.procedural` is `true`.

These are preserved for future phases; removing them is a separate decision, not
routine cleanup.

---

## Vendored dependencies

| Library | Version | Location |
| --- | --- | --- |
| Three.js | r170 | `vendor/three.module.js` |
| GSAP | 3.12.5 | `vendor/gsap/` |

Both are committed as-is. Do not reformat or patch vendored files; upstream
formatting differences are expected and are not project lint failures.

`vendor/gsap/CSSPlugin.js` in particular contains upstream indentation that Git
may report as "space before tab in indent" during `git diff --check`. That warning
is accepted.

---

## Conventions

- Plain ES modules. No bundler, transpiler, or framework.
- Text files use LF line endings, enforced by `.gitattributes`.
- Images are marked binary in `.gitattributes`.
- All paths in `index.html` and `styles.css` are relative, so the app runs from
  any subdirectory of a static host.

Additional documentation, including the module architecture and change workflow,
lives in `docs/`. Agent-facing guidance is in `AGENTS.md`.

---

## Status and limitations

- Phase 2 alpha is a visual prototype: no audio playback, no observation data, no
  network calls at runtime.
- A single hard-coded region (Cox's Bazar) is available.
- The map stage has only two zoom levels, so the final Bangladesh-to-beach hand-off
  is a cross-fade rather than a continuous dive (see `docs/camera-transitions.md`
  Q11).
- No test suite, linter, or CI is configured.
- No license file is present. Treat the code as all rights reserved until a
  license is chosen.

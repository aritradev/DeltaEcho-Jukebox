# Earth Information Jukebox

A cinematic, browser-based journey from the Solar System to Earth, then down to a
single region: the **Bay of Bengal**.

This repository contains **Phase 1**, a visual prototype. There is no audio, no
external data feed, and no backend. The "Listen" action is intentionally disabled;
the work here is the camera choreography, the rendered Earth, and the UI that
frames the eventual listening experience.

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
│   ├── config.js           Central tuning: render, planets, region, states, timelines
│   ├── assets.js           Texture loading with progress reporting
│   ├── utils.js            Math helpers (clamp, lerp, smoothstep, seeded RNG)
│   ├── starfield.js        Galaxy backdrop and star points
│   ├── sun.js              Procedural sun surface, corona, and flares
│   ├── solar-system.js     Planet orbits, Saturn ring, shared sun position
│   ├── earth.js            Earth surface, night lights, clouds, atmosphere shader
│   ├── region.js           Bay of Bengal marker, beam, particles, hotspot hit area
│   ├── camera-director.js  Keyframed camera states and transitions
│   ├── controls.js         Drag-to-rotate and scroll-to-zoom input
│   └── ui.js               DOM bindings: loader, panel, readout, destination card
├── assets/textures/        17 texture images (15 currently referenced)
└── vendor/
    ├── three.module.js     Three.js r170
    └── gsap/               GSAP 3.12.5 (core, CSSPlugin, ESM index)
```

---

## How it works

`src/main.js` owns an `App` class that wires everything together:

1. Build the renderer, scene, and camera.
2. Load all textures through `AssetLoader`, reporting progress to the loader overlay.
3. Construct the world: starfield, solar system, Earth, region marker.
4. Create the `CameraDirector`, which owns the camera timeline.
5. Start the animation loop, advancing planetary motion, shaders, and the director.

### Camera states

The journey is a fixed sequence defined in `STATES` (`src/config.js`), driven by
`CameraDirector` (`src/camera-director.js`):

| State | What the viewer sees |
| --- | --- |
| `solar system` | Wide view of the Sun and eight planets |
| `earth approach` | Camera closes on Earth |
| `earth orbit` | Earth fills the frame; clouds and atmosphere strengthen |
| `region approach` | Descent toward the Bay of Bengal |
| `cloud entry` | Passes through the cloud layer |
| `region reveal` | Region marker and beam appear |
| `region hotspot` | Region locks; destination card becomes available |

User input (drag/scroll) hands control to `ExplorerControls`. Returning via the
on-screen back button replays the reverse framing.

### Configuration

Nearly every visual constant lives in `src/config.js`: render settings, sun and
planet definitions, cloud and atmosphere response curves, the region's
coordinates, state identifiers, and transition durations. Prefer editing that
file over scattering magic numbers through modules.

---

## Assets

`assets/textures/` holds 17 images. Fifteen are referenced by
`src/assets.js` and `src/config.js`.

Two files are currently unreferenced but intentionally retained:

| File | Note |
| --- | --- |
| `galaxy.jpg` | Superseded by `galaxy.webp`, which is the texture actually loaded |
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

- Phase 1 is a visual prototype: no audio playback, no observation data, no
  network calls at runtime.
- A single hard-coded region (Bay of Bengal) is available.
- No test suite, linter, or CI is configured.
- No license file is present. Treat the code as all rights reserved until a
  license is chosen.

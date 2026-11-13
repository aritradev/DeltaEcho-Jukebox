# Earth Information Jukebox

A cinematic, browser-based journey from the Solar System to Earth, down through the
clouds to a flat map, and finally into one of **eight destinations**: six Bangladesh
regions from the Champion Edition dataset, plus Mount Everest and the Pacific
Northwest wildfires from the NASA Earth Information Center gallery. Each destination
exposes ten environmental signals, a year selector, a configurable comparison
interval, and a Web Audio sonification layer.

This repository contains the complete application. There is no external data feed and no
backend: the Champion Edition JSON and the NASA EIC gallery export are committed as
data, and the browser reads a compact generated index. The focus remains the camera
choreography, the rendered Earth, the map descent, and the panel that turns each
place into a listenable mix.

---

## Quick start

Requirements:

- **Node.js 18+** — used only to serve static files.
- A **WebGL2-capable** browser with ES module, import map, and module worker
  support. If workers are unavailable, procedural textures are generated on the
  main thread in yielded slices.

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
`Cache-Control: no-cache` for pages, scripts, and data so edits show up on reload.
Textures under `assets/textures/` and vendored libraries under `vendor/` are served
with a one-hour `max-age` so a return from the Studio reuses them instead of
decoding them again.

---

## Project structure

```text
.
├── index.html              Page shell: canvases, overlays, panel, loader
├── styles.css              All UI styling and overlay effects
├── studio.html             Separate Sonification Lab page
├── studio.css              Studio layout and controls
├── server.mjs              Zero-dependency static file server (port 5173)
├── tools/
│   └── build-regions.mjs   One-off data tool: dataset JSON -> src/regions.js
├── src/
│   ├── main.js             App composition, mode/state machine, render loop
│   ├── config.js           Central tuning: render, planets, atlas, states, timelines
│   ├── assets.js           Critical texture loading, lazy atlas loading, progress
│   ├── procedural-textures.js       Deterministic nebula/cloud pixel generators
│   ├── procedural-texture-job.js    Worker orchestration and cooperative fallback
│   ├── procedural-texture-worker.js Module worker entry point
│   ├── utils.js            Math helpers (clamp, lerp, smoothstep, seeded RNG)
│   ├── starfield.js        Baked nebula sky and star points
│   ├── sun.js              Procedural sun surface, corona, and flares
│   ├── solar-system.js     Planet orbits, Saturn ring, shared sun position
│   ├── earth.js            Earth surface, night lights, clouds, atmosphere shader
│   ├── region.js           Region marker, beam, particles, hotspot hit area
│   ├── regions.js          Generated region index: coordinates, colours, yearly signals
│   ├── atlas.js            Flat map stage: camera-attached plates, window math
│   ├── region-imagery.js   Locality plate files, dates, and source credits
│   ├── cloud-pass.js       Camera-space cloud billboards for the globe→map handoff
│   ├── camera-director.js  Keyframed camera states and transitions
│   ├── controls.js         Drag-to-rotate and scroll-to-zoom input
│   ├── space-dive.js       WebGL2 dive effect for the loading screen
│   ├── signal-audio.js     Web Audio synth for the ten environmental signals
│   ├── filmstrip.js        Studio filmstrip presets: loading, dates, measurement
│   ├── sonify.js           Studio sonification helper
│   ├── studio-sky.js       Studio nebula/starfield backdrop with CSS fallback
│   ├── studio.js           Studio playback, dataset switching, timeline readout
│   └── ui.js               DOM bindings: loader, explorer, signals, mobile sheet
├── assets/
│   ├── data/               Champion Edition and Studio datasets
│   └── textures/           Texture images
└── vendor/
    ├── three.module.js     Three.js r170
    └── gsap/               GSAP 3.12.5 (core, CSSPlugin, ESM index)
```

---

## How it works

`src/main.js` owns an `App` class that wires everything together:

1. Start the `SpaceDive` WebGL2 effect behind the loader text.
2. Load the critical Earth and planet textures with `AssetLoader`. Progress counts
   completed requests, not started ones; the optional normal and specular maps may
   fail with a visible warning.
3. Build the renderer, scene, camera, and world. The nebula and cloud textures are
   generated concurrently in module workers from deterministic pixel buffers, with
   a yielded main-thread fallback if module workers are unavailable.
4. Create the `CameraDirector`, which owns the camera timeline.
5. Compile shaders and render the opening frame behind the loader. Only textures
   the opening frame uses are uploaded; the Asia and Cox's Bazar plates are not in
   the startup critical path.
6. Auto-reveal: boost the dive, fade the loader, dispose its GL context, and start
   the intro. Atlas maps then load in the background.
7. Run the animation loop, advancing planetary motion, shaders, the director, audio,
   and adaptive render-resolution sampling.

There is no Enter button; the app reveals itself as soon as the opening scene is
ready. Selecting a place first prepares its map imagery without leaving the current
mode or disabling the explorer, then retargets the marker, camera, and atlas plate
and starts the same flight used by the original Cox's Bazar prototype. A failed map
request shows Retry and Cancel instead of starting a stale flight, and a newer
selection supersedes an older pending one. Audio is prepared inside the selection
gesture and faded in only when the destination is reached.

The audio toolbar stays available across views. Its mute and volume controls apply
after the flight-fade stage, so a user who has muted the experience does not hear it
return during a camera sequence. Once a destination is open, a Play/Pause button
suspends or resumes the audio graph in place; mute and volume keep working
independently. When a browser blocks audio, the same button retries playback
instead of failing silently.

The destination header in `#signals-view` is also a switcher: the region name and
chevron open a grouped list of all eight destinations. Choosing one calls
`switchDestinationInAtlas()` in `main.js`, which loads that locality plate, moves
the marker and readout, refreshes the signal panel, and retargets the audio without
flying back to the solar system. The same control is pinned at the top of the mobile
HALF and FULL sheet.

### Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus place search |
| `↑` `↓` | Move through the destination list |
| `Enter` | Select the highlighted destination |
| `Esc` | Cancel map preparation; skip an outbound flight; leave the map or free orbit once there |

### Mobile explorer

At widths up to 820px — and in short landscape windows up to 1024px wide and 560px
tall — the place/signals panel becomes a three-snap bottom sheet:

- **PEEK** is the 64px default summary plus the bottom safe-area inset.
- **HALF** is the browsing height. Places and Signals use different heights because
  Signals must keep the year bar visible.
- **FULL** expands with a scrim. The globe stays visible in PEEK and HALF, and a
  touch on it while HALF collapses the sheet without interrupting the drag.
- Flights hide the sheet. Landing in the atlas opens it at HALF with Signals; Back
  restores PEEK with Places.

The sheet is touch-first but the PEEK bar is a keyboard-accessible disclosure
control, and Escape collapses FULL → HALF → PEEK before leaving the destination.
In Places, the search field and a compact Sound Lab link share the first row, and
HALF suppresses secondary guidance and the country header so destination rows stay
visible. The complete state, geometry, and interaction contract is in
[`docs/mobile-sheet.md`](docs/mobile-sheet.md).

### Sonification Lab

`studio.html` is a separate, linkable page with three selectable NASA filmstrips:
a 130-frame monthly MODIS decade for Cox's Bazar (March 2000–December 2010), and
27-frame annual NASA EIC series for Mount Everest and the Pacific Northwest
wildfires (2000–2026). Cox's Bazar also reads local NASA POWER weather; all three
use GISTEMP global-anomaly audio detuning. A vertical scanline on the frame shows
playback position, and the dataset selector swaps strips without reloading the
page. It is a listening and provenance tool, not a second copy of the cinematic
journey. Controls stay disabled until its assets and analysis are ready, and a
failed filmstrip can be retried without reloading the page. The Lab reuses the
home page's baked nebula and starfield atmosphere on a lightweight `#studio-sky`
canvas, with a CSS radial fallback; its transport and readout panels are translucent
so the backdrop remains visible behind the data. A prominent **Sonification Lab**
button in the home page masthead links here on both desktop and mobile. A
**Back** control in the Lab masthead returns to the observatory; when the home page
is still in tab history it restores the cached scene instead of replaying the
loader.

### Camera states

The journey is a fixed sequence defined in `STATES` (`src/config.js`), driven by
`CameraDirector` (`src/camera-director.js`):

| State | What the viewer sees |
| --- | --- |
| `solar system` | Wide view of the Sun and eight planets |
| `earth approach` | Camera closes on Earth |
| `earth orbit` | Earth fills the frame; clouds and atmosphere strengthen |
| `region approach` | Descent toward the selected destination |
| `cloud entry` | Passes through the cloud layer |
| `continent` | Globe hands over to the flat Asia map behind the cloud pass |
| `country` | Map dives onto Bangladesh |
| `locality` | Local plate settles on the destination; signal panel shown |

The last three stages are a flat-map stage, not a camera move: `src/atlas.js` draws
two camera-attached plates and animates only their texture windows, so the camera
keeps a single writer. The globe→map swap is hidden by `src/cloud-pass.js`, a
camera-space cloud field that is faded out over the map. Drag and scroll are inert
once the map appears; Back and Escape return to the view the flight started from —
the Earth orbit if you launched from there, otherwise the solar system — while
Escape during an outbound flight skips ahead. Every destination now has a locality
plate: Cox's Bazar keeps its existing high-resolution image, the five other
Bangladesh destinations use NASA HLS L30 Landsat true-colour plates, and Mount
Everest and the wildfires use representative NASA SVS EIC plates. The grouped
Kutubdia & Saint Martin plate
shows Kutubdia; Saint Martin is not shown in that plate. A region with no configured
plate uses a generated survey fallback; a failed image download offers Retry/Cancel.

User input (drag/scroll) hands control to `ExplorerControls` while the globe is on
screen. The place explorer stays usable in free orbit, and a destination chosen there
returns to that orbit framing (same azimuth) with the panel re-enabled. Returning via
the on-screen back button replays the reverse framing, and the cloud pass fades in as
the map dissolves so the climb back out passes through the same cloud layer.

### Configuration

Nearly every visual constant lives in `src/config.js`: render settings, sun and
planet definitions, cloud and atmosphere response curves, the map levels
(`ATLAS.levels`), state identifiers, and transition durations. Prefer editing that
file over scattering magic numbers through modules.

Geographic data lives in `src/regions.js`. It is generated by
`node tools/build-regions.mjs`; edit the source JSON and regenerate rather than
hand-editing the generated file. Each region carries coordinates, a colour, an
`unavailable` list, and one row of ten signals per available year: 1985–2026 for
the six Bangladesh regions, and 2000–2026 for the two NASA EIC regions. The
generator also emits `COMPARISON_PAIRS`, and the UI filters those pairs down to
years a destination actually has.

---

## Assets

`assets/data/bd_6_regions_1985_2026_champion_jukebox.json` is the source for the six
Bangladesh destinations and their signals. The two NASA EIC destinations are
derived from `assets/data/nasa_eic_gallery_2000_2026_frames_and_cv_sonification.json`.
Do not add or mix in the older seven-region dataset.

`assets/textures/` holds 30 images. Twenty-six are referenced at runtime by the main
journey or the Studio.

`smoke.png` is the cloud sprite that the nebula sky is painted from; the backdrop
is baked from it at startup, so no other sky image is needed. The cloud pass
generates its puff and cloud-field textures procedurally, so it adds no files to
the asset manifest.

The map stage uses the Asia plate plus one locality plate per destination:

| File | Region | Source |
| --- | --- | --- |
| `asia-satellite.jpg` | Continent | Existing 1887×1962 plate |
| `coxs-bazar.jpg` | Cox's Bazar | Existing high-resolution plate; capture date unknown |
| `chattogram-hls.jpg` | Chittagong | NASA HLS L30, 9 Feb 2025 |
| `dhaka-hls.jpg` | Dhaka | NASA HLS L30, 15 Jan 2025 |
| `sylhet-hls.jpg` | Sylhet | NASA HLS L30, 9 Feb 2025 |
| `sundarbans-hls.jpg` | Sundarbans | NASA HLS L30, 27 Mar 2025 |
| `kutubdia-saint-martin-hls.jpg` | Kutubdia & Saint Martin | NASA HLS L30, 16 Jan 2025; shows Kutubdia |
| `everest-hls.jpg` | Mount Everest & Khumbu | NASA SVS ID 4834 / GIBS; representative glacier plate |
| `wildfire-viirs.jpg` | Pacific NW Wildfires | NASA SVS ID 5113 / FIRMS VIIRS; peak fire-season plate |

The five HLS plates are NASA's Landsat-only L30 product, served through NASA GIBS
and graded locally for display. Landsat data is courtesy of USGS. The provided
Bangladesh Landsat crops were used to confirm site and season; their 8 km extent
was too small for a full-screen plate. Every plate is `.jpg` and uses
`SRGBColorSpace`. Region images are requested on selection and cached by file name,
so a destination does not re-download a plate it has already used.
`src/region-imagery.js` records the file, acquisition date, credit, and display
caveat for each region. `coxs-bazar-decade.jpg`,
`everest-filmstrip-2000-2026.jpg`, and `wildfires-filmstrip-2000-2026.jpg` supply
the three Studio filmstrips.

Three files are currently unreferenced but intentionally retained:

| File | Note |
| --- | --- |
| `galaxy.jpg` | An earlier galaxy backdrop, no longer used |
| `galaxy.webp` | Replaced by the baked nebula, which paints from `smoke.png` |
| `moon.jpg` | No Moon body exists in `PLANETS` yet |

`sun.jpg` is retained but not requested while `SUN.procedural` is `true`.

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

- The app covers eight destinations: six Bangladesh regions from the
  Champion Edition dataset plus Mount Everest and the Pacific Northwest wildfires
  from the NASA EIC gallery. Every destination has ten synthesized signal layers,
  layer toggles, a year selector, and a comparison interval chosen from
  `#compare-pair-select`. All data and assets are local; there are no external
  runtime services.
- The two NASA EIC destinations only carry signals for 2000–2026. Their year slider
  and comparison pairs are restricted to that range, so 1985–1999 is not offered
  for them. Their values are image-derived proxies from NASA EIC annual
  computer-vision metrics, not in-situ measurements; `seaLevel` remains
  unavailable. The generator documents the proxy formulas.
- The development server sends `Cache-Control: no-cache` for pages, scripts, and
  data, and a one-hour `max-age` for textures and vendored libraries. Repeat loads
  of those assets are not a production cache benchmark; compression, hashed assets,
  and longer-lived caching are hosting decisions that have not been applied.
- All eight destinations now have a locality plate. The HLS and EIC plates are
  fixed-date views, not imagery for the selected signal year. The Kutubdia &
  Saint Martin plate shows Kutubdia only.
- All destinations share one region marker, one camera framing, and one atlas
  window; the new plates use the existing window rather than per-region
  georeferencing.
- Rain density uses an annual range in the audio layer because the dataset's
  `[0, 900]` mapping range describes monthly records, while the panel reads annual
  totals.
- The map stage has only two zoom levels, so the final Bangladesh-to-place hand-off
  is a cross-fade rather than a continuous dive (see `docs/camera-transitions.md`
  Q11).
- No test suite, linter, or CI is configured.
- No license file is present. Treat the code as all rights reserved until a
  license is chosen.

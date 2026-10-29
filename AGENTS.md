# AGENTS.md

Guidance for anyone — human or automated — changing this repository.

Read this first, then the document that matches your task:

| Document | Use it for |
| --- | --- |
| [`README.md`](README.md) | What the project is, how to run it, file layout |
| [`docs/architecture.md`](docs/architecture.md) | Module boundaries, state machines, render loop, conventions |
| [`docs/camera-transitions.md`](docs/camera-transitions.md) | Camera baseline timings, cinematic sequence, interruption guarantees, manual checks |
| [`docs/workflow.md`](docs/workflow.md) | How to make, verify, and commit a change |
| [`docs/context-architecture.md`](docs/context-architecture.md) | Where documentation lives and how to keep it accurate |

---

## Project snapshot

- **Phase 1** of the Earth Information Jukebox: a cinematic Solar System → Earth →
  Bay of Bengal visual prototype.
- Vanilla JavaScript ES modules. No framework, no bundler, no transpiler.
- No npm dependencies. Three.js and GSAP are vendored (versions in `README.md`).
- No backend. `server.mjs` is a static file server for local development only.
- No test suite, linter, or CI yet, so verification is manual.

---

## Hard rules

1. **Do not add a build step.** No bundler, package manager, TypeScript, or
   framework. `index.html` loads `src/main.js` directly through an import map.
2. **Do not edit `vendor/`.** Three.js and GSAP are committed as distributed.
   Upstream formatting is not a lint failure. In particular, `git diff --check`
   reports "space before tab in indent" in `vendor/gsap/CSSPlugin.js`; that is
   accepted and must not be fixed.
3. **Do not modify `assets/textures/`** unless the task is explicitly about art.
   `galaxy.jpg`, `moon.jpg`, and `sun.jpg` are currently unused but intentionally
   kept. Removing them is a product decision, not cleanup.
4. **Keep text files LF and images binary** as declared in `.gitattributes`. Do not
   introduce CRLF or reformat whole files.
5. **No secrets.** No API keys, tokens, credentials, or `.env` files in the repo.
6. **Stage and commit only from the repository root.** Never run `git add` from a
   parent directory.
7. **Do not touch sibling copies** of this project elsewhere on disk. This
   repository is the only authoritative copy.
8. **Camera behaviour is documented and regression-checked.** The cinematic camera
   experience and its interruption-recovery guarantees are specified in
   [`docs/camera-transitions.md`](docs/camera-transitions.md). Timings and targets
   there are a dated baseline, not permanent requirements: intentional changes are
   allowed through review, but must keep the reliability guarantees, pass the
   regression checks in §9.3, and update that document in the same commit.

---

## Commands

```powershell
# Run locally (required: the app needs HTTP, not file://)
node server.mjs                  # http://localhost:5173
$env:PORT = 8080; node server.mjs

# Repository state
git status --short
git log --oneline
git diff --cached --stat

# Whitespace check, ignoring the accepted vendor warning
git diff --cached --check -- . ':(exclude)vendor'
```

There is no `npm install`, no `npm test`, and no `npm run build`.

---

## Where to change what

| Task | File |
| --- | --- |
| Visual tuning, timings, camera framing constants | `src/config.js` |
| Camera choreography and transitions | `src/camera-director.js` |
| Input handling (drag, zoom, pinch) | `src/controls.js` |
| Earth materials, clouds, atmosphere | `src/earth.js` |
| Region marker geometry and shaders | `src/region.js` |
| Sun surface, corona, flares | `src/sun.js` |
| Planet orbits, Saturn ring, orbit lines | `src/solar-system.js` |
| Starfield and galaxy backdrop | `src/starfield.js` |
| Texture loading | `src/assets.js` |
| Overlay text, buttons, layout | `index.html` + `ui.js` |
| Overlay appearance | `styles.css` |
| App wiring, modes, render loop | `src/main.js` |
| Shared math helpers | `src/utils.js` |

Two rules that prevent most regressions:

- **Only `main.js` may change `MODE`.** `FLYING` means a scripted transition is
  running; do not start another one.
- **Only `CameraDirector` writes camera transforms.** Express camera intent through
  `director.rig` or a director method, never by setting `camera.position` directly.

---

## Verification checklist

No automated tests exist. Before calling a change done:

1. `node server.mjs` starts without errors.
2. The loader completes and "Enter the observatory" becomes enabled.
3. Console has no errors or WebGL shader compile failures.
4. The intro dolly completes and the solar system is framed.
5. Selecting Ocean / Atmosphere / Land flies to the region and shows the
   destination card.
6. Dragging rotates, scrolling zooms, and interrupting a flight restores manual
   control.
7. The back button (and Escape, once in the region) returns to the solar system.
8. Clicking Earth from the wide view enters free orbit.
9. Resizing the window keeps the scene and overlays aligned.
10. `git status` shows only the files you intended to change.

If your change touches shaders, also check on a second GPU or browser if possible;
shader issues often appear only on one driver.

---

## Common pitfalls

| Symptom | Cause / fix |
| --- | --- |
| Blank page, module errors | Opened via `file://`; run `node server.mjs` |
| `Failed to resolve module specifier "three"` | Import map missing or malformed in `index.html` |
| Camera jumps or fights the user | Something wrote `camera.position` outside `CameraDirector` |
| Region label drifts | Anchor must be positioned by projecting world space, not fixed CSS |
| Region appears on the wrong side of Earth | Used untilted queries; use `getRegionAzElTilt` / `getLocalSunDirectionTilt` |
| Motion explodes after tab switch | `delta` must stay clamped (`Math.min(delta, 0.05)`) |
| Git reports whitespace warnings | Expected in `vendor/gsap/CSSPlugin.js`; do not fix |

---

## Documentation expectations

- Update `README.md` when run instructions, structure, or dependencies change.
- Update `docs/architecture.md` when module responsibilities or data flow change.
- Keep documents describing the code **as it is**, not as it is planned to be.
- Prefer a short accurate document over a long speculative one.
- Do not create new top-level documents without a reason; extend the existing set.

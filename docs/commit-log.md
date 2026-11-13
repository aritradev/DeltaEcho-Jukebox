# Commit log

A short record of every commit in this repository: what it contains, what it
changed, and what reverting it would do. Kept so a specific version can be restored
on request.

Newest last. Update this file whenever a commit is added.

| # | Commit | Date | Summary | Files |
| --- | --- | --- | --- | --- |
| 1 | `e2118e3` | 2026-10-29 | `chore: establish project baseline` | whole app: `src/`, `vendor/`, `assets/`, `index.html`, `styles.css`, `server.mjs`, config |
| 2 | `9e2debd` | 2026-10-29 | `docs: add project README` | `README.md` |
| 3 | `9ec925a` | 2026-10-29 | `docs: add agent guide and architecture notes` | `AGENTS.md`, `docs/architecture.md` |
| 4 | `8ab5577` | 2026-10-29 | `docs: add workflow and context architecture guides` | `docs/workflow.md`, `docs/context-architecture.md`, small fixes in `AGENTS.md` + `docs/architecture.md` |
| 5 | `413534e` | 2026-10-29 | `docs: add camera transition contract` | `docs/camera-transitions.md` (new), links in `AGENTS.md`, `docs/architecture.md`, `docs/workflow.md`, `docs/context-architecture.md` |
| 6 | `1a0b4c7` | 2026-10-29 | `docs: add commit log` | `docs/commit-log.md` (this file) |
| 7 | this commit | 2026-10-30 | `feat: replace galaxy backdrop with a baked nebula sky` | `src/starfield.js`, `src/assets.js`, `src/main.js`, `assets/textures/smoke.png` (new), `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/commit-log.md` |
| 8 | working tree | 2026-11-13 | `feat: add eight destinations, comparison pairs, and a three-dataset Studio` | `tools/build-regions.mjs`, `src/regions.js`, `src/region-imagery.js`, `src/ui.js`, `src/studio.js`, `src/filmstrip.js`, `index.html`, `styles.css`, `studio.html`, `studio.css`, `assets/data/nasa_eic_gallery_2000_2026_frames_and_cv_sonification.json`, `assets/textures/everest-*`, `assets/textures/wildfire*`, docs |
| 9 | working tree | 2026-11-13 | `feat: add a Sonification Lab button, shared studio sky, in-place region switcher, and Play/Pause` | `index.html`, `styles.css`, `src/ui.js`, `src/main.js`, `src/signal-audio.js`, `studio.html`, `studio.css`, `src/studio-sky.js` (new), `src/studio.js`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/mobile-sheet.md`, `docs/commit-log.md` |

---

## 1. `e2118e3` — project baseline

The application itself, committed in one go: Three.js/GSAP vendor bundles, textures,
`index.html`, `styles.css`, the static `server.mjs`, and all of `src/`
(`main.js`, `camera-director.js`, `controls.js`, `earth.js`, `region.js`,
`solar-system.js`, `starfield.js`, `sun.js`, `ui.js`, `assets.js`, `config.js`,
`utils.js`).

**Reverting removes the entire app.** Only do this to start over.

## 2. `9e2debd` — README

Adds `README.md`: what the project is, how to run it, file layout, vendored versions.

Documentation only. Safe to revert; nothing else references it except other docs.

## 3. `9ec925a` — agent guide and architecture

Adds `AGENTS.md` (rules, commands, where to change what) and
`docs/architecture.md` (module boundaries, state machine, render loop).

Documentation only. Reverting also removes the rules other docs point at.

## 4. `8ab5577` — workflow and context-architecture

Adds `docs/workflow.md` and `docs/context-architecture.md`; adjusts two lines in
`AGENTS.md` and `docs/architecture.md` to point at them.

This is the **baseline commit** cited by the camera contract. Documentation only.

## 5. `413534e` — camera transition contract

Adds `docs/camera-transitions.md` (camera behaviour: protected reliability
guarantees, baseline timings, interruption recovery, manual checks, Q1–Q10,
multi-region notes) and wires it into the four existing docs.

Documentation only, no code change. Safe to revert; the app behaves identically.

## 6. `1a0b4c7` — commit log

Adds this file. Documentation only.

## 7. baked nebula sky

Replaces the `galaxy.webp` sphere backdrop with a nebula baked from
`assets/textures/smoke.png`, matching the reference build's muted purple/maroon
look.

- `src/starfield.js`: the old synthetic-gradient backdrop is gone. `NEBULA` holds
  the tuning; `buildSmokeBrush` turns `smoke.png` into a density map;
  `buildNebulaTexture` stamps ~250 sprites into a float buffer and bakes one
  2048×1024 equirectangular texture, drawn on an inward-facing sphere.
- `src/assets.js`: `GALAXY_MAPS = ['galaxy.webp']` becomes
  `BACKDROP_MAPS = ['smoke.png']`.
- `src/main.js`: one line, passing the `smoke.png` texture to `Starfield`.
- `assets/textures/smoke.png`: new 29 KB brush asset.

Nothing else changed: camera, controls, config, planets, Earth, sun, region and the
mode machine are untouched. Star shells keep the same seed and count.

**Background only.** Reverting restores the `galaxy.webp` backdrop and leaves the
rest of the app identical. `galaxy.webp`, `galaxy.jpg` and `moon.jpg` are untouched
and still present, so no asset is lost either way. To revert just the code:

```powershell
git revert <hash>
# or, to drop the files by hand:
git checkout e2118e3 -- src/starfield.js src/assets.js src/main.js
Remove-Item assets/textures/smoke.png
```

---

## 8. Working tree — eight destinations and a three-dataset Studio

Uncommitted at the time of writing; this section records the intent so it can be
turned into a commit without re-deriving it.

- `tools/build-regions.mjs` now reads the NASA EIC gallery export as a second source.
  `mount_everest` and `global_wildfires` are derived as image-based proxies for
  2000–2026 (27 annual rows each); the six Bangladesh regions keep their 1985–2026
  rows. `COMPARISON_PAIRS` and per-region `countryId` are emitted from the same run.
- `src/regions.js` is regenerated: 8 regions, 3 countries, 16 comparison pairs.
- `src/region-imagery.js` gains EIC locality plates and the proxy caveat.
- `index.html` / `src/ui.js` / `styles.css`: `#compare-pair-select` drives the two
  play buttons and the compare target years; rows show a Δ while comparing; the
  voice-guide toggle and Signals-view arrow/`c` keys are wired; the stale
  `#destination` block is gone; year range and pair options are filtered to the
  active region's available years.
- `studio.html` / `studio.css` / `src/filmstrip.js` / `src/studio.js`: three
  filmstrip presets, a `#dataset-select` switcher with a stale-load guard and cache,
  per-preset dates and provenance, a weather block that hides for the EIC series,
  and a vertical playback scanline over `#frame`.
- `README.md`, `AGENTS.md`, `docs/architecture.md` describe the eight destinations,
  the EIC proxy limitation, and the Studio presets.

**Reverting** this working-tree change means restoring the files above to their
previous state; there is no commit hash yet. The EIC JSON and the four new textures
would also need to be removed to return to the six-destination build.

---

## 9. Working tree — Lab button, shared sky, region switcher, Play/Pause

Uncommitted at the time of writing, stacked on entry 8.

- `index.html` / `styles.css`: a standalone `.mast-lab-btn` in `#masthead` links to
  the Lab on desktop and mobile (≥44px tall on phones). The Signals header
  (`#signal-region` plus a chevron) is now the trigger for a grouped
  `#region-switcher-menu` listing all eight destinations. `#audio-resume` is
  replaced by a persistent `#audio-toggle`.
- `src/ui.js`: builds and synchronises the switcher (roles, arrow/Home/End/Escape,
  outside-click close), keeps it visible at the top of the mobile HALF/FULL sheet,
  and rewrites `setAudioState()` for Play/Pause. Escape closes the switcher first.
- `src/main.js`: `onSwitchRegion` → `switchDestinationInAtlas()` swaps plate,
  marker, readout, panel, and audio target without leaving the flat-map stage;
  `onToggleAudio` → `toggleDestinationAudio()`.
- `src/signal-audio.js`: `togglePlay()` suspends/resumes the context; mute and
  volume stay independent.
- `src/studio-sky.js` (new) + `studio.html` + `studio.css` + `src/studio.js`: a
  fixed `#studio-sky` canvas bakes the same procedural nebula from `smoke.png` and
  drifts a star field, with a CSS radial fallback; `#vignette`/`#grain` and
  translucent `.transport`/`.frame`/`.readout` panels sit over it.
- Typography rises by 2px across both pages, the desktop `.panel` widens to
  `min(390px, 33vw)`, the audio toolbar to `min(420px, calc(100% - 28px))`, and the
  mobile sheet gains the taller Signals heights and short-landscape switcher row.
- `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/mobile-sheet.md` describe
  the new controls, backdrop, and sheet contract.

**Reverting** restores the previous toolbar (Resume), removes the switcher and the
Studio backdrop, and drops the typography pass. There is no commit hash yet.

---

## How to revert

```powershell
# inspect what a commit did
git show 413534e
git show --stat 413534e

# undo a commit, keeping history (creates a new revert commit)
git revert 413534e

# restore one file to its state at a commit
git checkout 8ab5577 -- docs/architecture.md

# compare two versions of a file
git diff 8ab5577 413534e -- docs/architecture.md
```

Notes:

- Commits 2–6 are documentation only. Reverting any of them cannot break the app.
- Entry 8 is an uncommitted working-tree change; there is no hash to revert until it
  is committed. Entry 9 stacks on top of it and is also uncommitted.
- Commit 7 changes only the sky backdrop. Reverting it restores the `galaxy.webp`
  sphere and does not touch camera, planets, Earth, or UI behaviour.
- Commit 1 is the whole application. Never revert it unless you intend to delete the
  project files.
- `docs/camera-transitions.md` records a dated baseline, so restoring an older
  version of that file restores that description, not the camera code. Camera code
  lives in `src/camera-director.js` and has never changed since `e2118e3`.
- No remote is configured; everything is local on `main`.

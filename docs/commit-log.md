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
| 6 | this commit | 2026-10-29 | `docs: add commit log` | `docs/commit-log.md` (this file) |

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

Adds `docs/camera-transitions.md` (Phase 1 camera behaviour: protected reliability
guarantees, baseline timings, interruption recovery, manual checks, Q1–Q10,
multi-region notes) and wires it into the four existing docs.

Documentation only, no code change. Safe to revert; the app behaves identically.

## 6. commit log

Adds this file. Documentation only.

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

- Commits 2–5 are documentation only. Reverting any of them cannot break the app.
- Commit 1 is the whole application. Never revert it unless you intend to delete the
  project files.
- `docs/camera-transitions.md` records a dated baseline, so restoring an older
  version of that file restores that description, not the camera code. Camera code
  lives in `src/camera-director.js` and has never changed since `e2118e3`.
- No remote is configured; everything is local on `main`.

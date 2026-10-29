# Workflow

How changes move from an idea to a commit in this repository. The project is
small, single-branch, and has no automation, so the discipline here *is* the safety
net.

Related:

- [`../AGENTS.md`](../AGENTS.md) — rules and where to change what
- [`architecture.md`](architecture.md) — module boundaries and conventions
- [`context-architecture.md`](context-architecture.md) — how documentation is organized

---

## 1. Current repository setup

| Item | State |
| --- | --- |
| Default branch | `main` |
| Remote | **None configured** |
| Commit hooks | None |
| CI | None |
| Tests / linter | None |
| Baseline commit | `e2118e3 chore: establish project baseline` |

Because there is no remote, a commit is local history only. There is also no
automated gate: nothing will catch a broken shader, a stray file, or a secret
except your own checks.

Consequences:

- Commit deliberately, in small units. Each commit should be independently
  understandable.
- Do not rely on "CI will catch it". Run the manual checklist in
  [`../AGENTS.md`](../AGENTS.md#verification-checklist).
- Never rewrite published history — but note that none exists yet, so `main` is
  still free to be curated.

---

## 2. Before you start

1. **Confirm the repository root.**

   ```powershell
   git rev-parse --show-toplevel
   # must be the JUKEBOX project directory
   ```

2. **Confirm a clean starting point.**

   ```powershell
   git status --short
   ```

   Anything already modified is not yours. Ask before including it.

3. **Read the relevant document.** Most tasks are covered by one section of
   [`architecture.md`](architecture.md). Reading it is faster than rediscovering
   the conventions by trial and error.

4. **Decide the scope.** One logical change per commit. If you find yourself
   editing documentation, a shader, and the build setup, that is three commits.

---

## 3. Making the change

### Keep the architecture intact

- No bundler, framework, package manager, or TypeScript.
- New behaviour goes in the module that already owns that concern, or in a new
  module explicitly wired from `main.js`.
- Constants belong in `config.js`, not inline in update loops.
- `main.js` is the only writer of `MODE`; `CameraDirector` is the only writer of
  camera transforms; `ui.js` owns overlay DOM.

### Touch the minimum

- Do not reformat files you are not changing semantically. A diff should be readable.
- Do not "clean up" unused textures or vendor files as a side effect.
- Do not add dependencies for something a few lines of vanilla JS can do.

### Preserve line endings

Text files are LF, images are binary, enforced by `.gitattributes`. Do not
introduce CRLF. If an editor rewrites line endings, fix it before staging.

---

## 4. Verifying

### Static checks

```powershell
# no whitespace errors in project-authored files
git diff --check -- . ':(exclude)vendor'

# review exactly what will be committed
git diff --cached --stat
git diff --cached
```

`vendor/gsap/CSSPlugin.js` produces "space before tab in indent" warnings by
design. They are accepted; never edit that file to silence them.

### Runtime checks

Run the app and walk the checklist:

```powershell
node server.mjs   # http://localhost:5173
```

Minimum bar for any visible change:

1. Loader completes; no console errors or shader compile failures.
2. Intro dolly lands on the solar system.
3. A category selection completes the flight and shows the destination card.
4. Drag, zoom, and flight interruption behave.
5. Back / Escape returns to the solar system.
6. Window resize keeps overlays aligned.

If your change is documentation-only, verify links resolve and statements match
the code. Do not claim a runtime check you did not perform.

---

## 5. Staging

Stage explicitly, from the repository root:

```powershell
git add -- path/to/file another/file
git status --short
git diff --cached
```

Prefer naming paths over `git add .`. Before committing, confirm:

- [ ] Every staged path is inside the project and intended.
- [ ] No unstaged changes are being left behind unintentionally.
- [ ] No secrets, credentials, `.env` files, or editor droppings are staged.
- [ ] New text files are LF; new images are binary.
- [ ] Documentation updated if behaviour, commands, or structure changed.

A quick secret scan that prints only filenames:

```powershell
git grep --cached -l -I -E '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{36}|xox[baprs]-[0-9A-Za-z-]+'
```

An empty result is the expected outcome. Do not paste secret values into reports;
report filenames only.

---

## 6. Commit messages

Use Conventional Commits with a lowercase summary, no trailing period, imperative
mood:

```text
<type>: <summary>
```

| Type | Use for |
| --- | --- |
| `feat` | New user-visible behaviour |
| `fix` | Correcting broken behaviour |
| `docs` | Documentation only |
| `chore` | Repository setup, tooling, housekeeping |
| `refactor` | Restructuring with no behaviour change |
| `perf` | Performance work |
| `style` | Formatting only — rare here; avoid mixing with logic |

Examples already in history:

```text
chore: establish project baseline
docs: add project README
docs: add agent guide and architecture notes
```

A body is optional. Use one when the *why* is not obvious; explain motivation and
trade-offs, not a restatement of the diff.

---

## 7. After committing

```powershell
git log --oneline -3
git status --short      # must be clean
git show --stat HEAD
```

Confirm the commit contains what you intended and nothing else. If it does not,
and the commit is local and unpushed, fix it with `git commit --amend` or an
interactive rebase. Do not amend a commit you have already shared.

---

## 8. Rolling back

| Situation | Action |
| --- | --- |
| Uncommitted change is wrong | `git restore -- <path>` |
| Staged but not committed | `git restore --staged -- <path>` |
| Last commit is wrong, not shared | `git commit --amend` or `git reset --soft HEAD~1` |
| Commit is bad but history should stay | `git revert <sha>` |

Avoid `git reset --hard` on anything you have not verified is expendable. This
repository has no remote backup, so a hard reset is a real loss.

---

## 9. Documentation debt

A change is not finished until its documentation is true.

| If you changed | Update |
| --- | --- |
| Run instructions, structure, dependencies | `README.md` |
| Module responsibilities, data flow, state machines | `docs/architecture.md` |
| Team rules, commands, verification steps | `AGENTS.md` or this file |
| Where documentation lives or how it is maintained | `docs/context-architecture.md` |

When in doubt, prefer correcting an existing sentence over adding a new section,
and prefer deleting a stale claim over hedging it.

---

## 10. Definition of done

- The change is scoped to one logical purpose.
- The app runs and the relevant checklist items pass.
- Project-authored files pass the whitespace check.
- `vendor/`, unrelated assets, and sibling copies are untouched.
- Staged contents were reviewed explicitly.
- The commit message explains the change.
- Affected documentation matches the new reality.
- The working tree is clean afterwards.

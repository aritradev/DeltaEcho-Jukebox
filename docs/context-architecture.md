# Context architecture

This repository is small enough to read end to end, but not small enough to read
end to end *every time*. This document explains how project knowledge is layered
so that a person — or an AI agent with a limited context window — can load only
what a task requires, and still be correct.

Related:

- [`../AGENTS.md`](../AGENTS.md) — the entry point and hard rules
- [`../README.md`](../README.md) — what the project is and how to run it
- [`architecture.md`](architecture.md) — how the code works
- [`workflow.md`](workflow.md) — how to change it

---

## 1. The problem this solves

Most documentation rot happens in one of two ways:

1. **Nothing is written down**, so every contributor rediscovers conventions by
   trial and error, and an agent guesses.
2. **Everything is written down everywhere**, so copies drift and the reader cannot
   tell which statement is current.

The fix is the same in both cases: give each fact exactly one home, and give each
audience a short path to the layer it needs.

---

## 2. Layers

Load in order. Stop as soon as you have what you need.

| Layer | Document | Answers | Typical size |
| --- | --- | --- | --- |
| 0 | [`AGENTS.md`](../AGENTS.md) | What are the rules? Where do I change things? | ~140 lines |
| 1 | [`README.md`](../README.md) | What is this? How do I run it? What is in the tree? | ~170 lines |
| 2 | [`architecture.md`](architecture.md) | How do the modules, states, and render loop fit together? | ~350 lines |
| 3 | This file, [`workflow.md`](workflow.md) | How is knowledge and work organized? | ~230 lines each |
| 4 | Source files | What does the code actually do, line by line? | varies |
| 5 | `git log` | Why did it become this way? | varies |

### Reading paths by task

| Task | Path |
| --- | --- |
| Fix a shader artefact | `AGENTS.md` → `architecture.md` §8 (Earth stack) or §9 (region) → the module |
| Adjust camera timing | `AGENTS.md` → `architecture.md` §7 → `config.js`, `camera-director.js` |
| Add a planet | `AGENTS.md` → `architecture.md` §13 → `config.js`, `assets.js` |
| Change UI copy | `README.md` (structure) → `index.html`, `ui.js` |
| Onboard a new contributor | `README.md` → `architecture.md` §1–§6 → `workflow.md` |
| Commit a change | `workflow.md` §4–§7 |

### What not to read

- `vendor/three.module.js` and `vendor/gsap/*` — minified upstream code. Trust the
  documented version and treat the API as standard Three.js / GSAP.
- Entire large modules when you need one method — use search:
  `git grep -n "setCloudOpacity" -- src`.

---

## 3. Single source of truth

When two documents could state the same fact, only one owns it.

| Fact | Owner | Everyone else |
| --- | --- | --- |
| Library versions | `README.md` → Vendored dependencies | reference, do not restate |
| Run commands and ports | `README.md` → Quick start | repeat only the short form |
| Tuning constants and their values | `src/config.js` | describe the knob, not the number |
| Module responsibilities | `docs/architecture.md` §4 | one-line mentions |
| Rules and prohibitions | `AGENTS.md` | link |
| Commit conventions | `docs/workflow.md` §6 | link |
| Verification steps | `docs/workflow.md` §4 | link |

**Never copy a numeric constant into prose.** Writing "the far plane is 12,000" is
acceptable only as a description of *why* the value matters; the moment it is used
as the authoritative value, it will drift. Prefer "the far plane is set in `RENDER`".

### Conflict resolution

If documentation and code disagree, **the running code is correct**. Fix the
document in the same change that revealed the mismatch. Do not "fix" the code to
match a stale sentence without confirming intent.

---

## 4. Document responsibilities

| Document | Owns | Must not contain |
| --- | --- | --- |
| `AGENTS.md` | Rules, prohibitions, task→file map, pitfalls, verification checklist | Deep internals, long tutorials |
| `README.md` | Product description, quick start, structure, dependency versions, limitations | Implementation detail, workflow rules |
| `docs/architecture.md` | Module map, state machines, loop order, coordinate conventions, extension points | Setup instructions, commit policy |
| `docs/workflow.md` | Branch/staging/commit/review/rollback process, definition of done | Architecture explanation |
| `docs/context-architecture.md` | How knowledge is layered, owned, and maintained | Project-specific technical detail |

If a new fact does not fit one of these, that is a signal: either it belongs in an
existing section, or the change does not need documentation.

---

## 5. Writing rules

- **Describe what is, not what is planned.** Aspirational docs are indistinguishable
  from bugs. Phase-2 intentions belong in a task tracker, not here.
- **Be specific.** "Handle errors properly" is noise; "`app.init()` catches startup
  failure and rewrites the loader subtitle" is knowledge.
- **Prefer tables and short lists** for enumerable facts.
- **State the why** for non-obvious decisions (why vendored, why no bundler, why
  `delta` is clamped).
- **Name symbols exactly** as they appear in code, so `git grep` finds them.
- **Keep headings stable.** Section numbers such as §7 are referenced from other
  documents; renumbering breaks links and reading paths.

---

## 6. Maintenance loop

Documentation is part of the change, not a follow-up.

1. **Before** editing code, grep the docs for the symbol or constant you are about
   to change:

   ```powershell
   git grep -n "cloudOpacity" -- '*.md' src
   ```

2. **After** the change, update every hit that is now false.
3. **Delete** claims that no longer apply. A removed sentence is better than a
   hedged one.
4. **Check links** if you added or moved a file:

   ```powershell
   git grep -n "](.*\.md" -- '*.md'
   ```

5. **Verify commands** you document by running them. Never document an untested
   command.

### Change → document trigger table

| Change | Update |
| --- | --- |
| New module, or a module's responsibility shifts | `architecture.md` §4, §13 |
| New or renamed config constant | `architecture.md` (description), `AGENTS.md` if it is a rule |
| New runtime dependency or version bump | `README.md` |
| New command, port, or environment variable | `README.md`, `workflow.md` |
| New prohibition or pitfall | `AGENTS.md` |
| New commit or review rule | `workflow.md` |
| New document | `AGENTS.md` table, this file §2 |

---

## 7. Adding a document

Create a new document only when all of the following hold:

1. It has a distinct audience or purpose not served by the existing set.
2. It will be maintained — a document nobody updates is worse than none.
3. It can be linked from `AGENTS.md` and this file in the same change.

Then:

- Put it under `docs/` unless it is a repository convention file (`README.md`,
  `AGENTS.md`).
- Give it a single H1 matching its filename.
- Add it to the layer table (§2) and to the `AGENTS.md` document table.
- State what it owns and what it does not.

Avoid creating: changelogs generated from `git log`, design documents for
unimplemented features, duplicated setup instructions, or "notes" files with no
owner.

---

## 8. Context budget guidance

For agents working with a limited window:

| Budget | Load |
| --- | --- |
| Minimal | `AGENTS.md` only — enough for most small, well-scoped edits |
| Standard | `AGENTS.md` + the single relevant `architecture.md` section |
| Deep | Add the target module and its direct imports |
| Full | Only for cross-cutting refactors; read the module graph, not every line |

Practical rules:

- Read targeted line ranges, not whole vendored or large files.
- Prefer `git grep -n "<symbol>"` over reading a 400-line module to find one method.
- Read `config.js` before assuming a value; it is short and authoritative.
- Do not infer behaviour from filenames alone — `sun.js` also builds corona and
  flares; `region.js` also builds particles and hit targets.

---

## 9. Anti-patterns

| Anti-pattern | Why it hurts | Instead |
| --- | --- | --- |
| Copying constants into prose | Drifts silently | Name the symbol and its file |
| Documenting planned features as current | Reader cannot distinguish intent from reality | Describe current state; track plans elsewhere |
| One giant document | Cannot be loaded selectively | Layer by audience, as here |
| Per-file comment dumps | Duplicates code, rots fastest | Document boundaries and invariants |
| Screenshots of UI text | Stale and unsearchable | Quote the string or name the element |
| "See the code" with no pointer | Adds no information | Cite module + symbol |
| Renumbering sections | Breaks cross-references | Append sections; keep numbers stable |

---

## 10. Reviewing documentation changes

A documentation change is reviewed like code:

- [ ] Statements are true of the current commit.
- [ ] Facts live in their owning document only.
- [ ] Links resolve.
- [ ] Commands were run.
- [ ] No section numbers referenced elsewhere were renumbered.
- [ ] The diff removes at least as much stale text as it adds, where applicable.
- [ ] `AGENTS.md` still points to every document a contributor needs.

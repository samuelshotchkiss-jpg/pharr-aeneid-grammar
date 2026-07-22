# CLAUDE.md — operating conventions

Project context for Claude Code. The full system design is in **DESIGN.md** —
read it for architecture, the editorial-voice system, the term/glossary data,
and the feature specs. This file is just the house rules.

## What this project is
A digital scholarly edition of Pharr's *Aeneid* grammar appendix, produced as
both an interactive web page and a print PDF from a **single source**. Audience:
a 10th-grade Latin class with limited grammar background.

## How we work
- **One focused work stream per session.** Each session does one task (a single
  build thread), then stops. Don't carry multiple features in one session.
- **Parallel sessions, one per thread — not `/clear` between tasks.** Different
  dimensions of the project run in separate Claude Code sessions, switched from
  the desktop sidebar (Ctrl+Tab). Each keeps its own context and its own saved
  transcript, so a thread can be picked up whenever it's relevant. Starting a
  session reads this file + DESIGN.md, so each one is self-orienting.
- **Shared `main` is the common ground.** Sessions share this one working folder
  and commit straight to `main`; there is no per-session branch to merge. Because
  the folder is shared, don't edit the same files in two live sessions at once —
  keep concurrent threads on non-overlapping files, and commit promptly so a
  switched-to session starts from a clean, current tree. (Git worktrees would add
  true simultaneous isolation if that's ever needed; not in use today.)
- **Commit is the handoff; push is publish + backup.** State passes between
  local sessions through committed files and clear commit messages, not
  conversation history (the sessions share this folder, so a local commit is
  enough to hand off). `main` now also has a GitHub remote (`origin`):
  **pushing to it auto-deploys the live site** (GitHub Pages, ~1 min) and is the
  only offsite backup. So commit at meaningful points, and push when the tree is
  in a coherent state. Because a push is *public*, don't push a knowingly-broken
  intermediate state — or fix forward fast, since rebuilds are ~1 min. Repo and
  live URL are in `PROJECT-STATUS.md`.
- **Work in reviewable increments** with verification between them, not one
  giant rewrite. For large changes, propose the plan before executing.

## Local preview & verification
This edition is one very large HTML page (~3,000 lines, hundreds of paradigm
tables and inline SVGs). The preview **screenshot** tool reliably times out on
it — a capture performance limit, not a page error (console stays clean), and
scrolling to an element first doesn't help. Don't burn turns retrying it.

Verify **quantitatively** instead (more precise anyway): `preview_eval` for
`scrollWidth` / `getBoundingClientRect()` positions and to reconstruct the
rendered reading order; `preview_inspect` for computed styles. Prove
content-neutral changes by diffing parsed content (text length, element counts,
positions) at the relevant breakpoints — never by eye.

Related: the static server (`.claude/launch.json` → `static`, port 8765; a
second `static-8766` config exists for when another live session already holds
8765) usually needs a `preview_start` at session start.

**Caching is solved at the server — don't re-solve it per session.** Both
configs run `build/serve.py`, a stdlib, dependency-free static server that sends
`Cache-Control: no-store` on every response, so a plain reload
(`location.href = 'index.html?v=<ts>'`, or `location.reload()`) always fetches
the current JS/CSS. This exists because the stock `python -m http.server` sends
no `Cache-Control`, and Chromium then served **stale JS**: `index.html?v=` busts
only the HTML, and the `<script src="js/…">` subresource is *not* revalidated by
a normal reload — so edits to `js/*.js` silently kept running the old file and
verification tested the wrong code. With `serve.py` a normal reload is enough.
If you still hit a stale asset (a session left on the old server, or a
pre-existing cache entry from before the switch), clear it once with a
network-forced fetch — `await fetch('js/tooltips.js', {cache:'reload'})` — or
bump a `?v=<ts>` query on the offending `<script>`/`<link>`; then reload.

## Tooling (Node / dependencies)
- **JS tooling runs on Node (now installed).** The validator and parser are
  runnable directly; prefer running JS checks via Node over reimplementing them
  elsewhere. `js/defmarkup.js` is UMD (`module.exports` under CommonJS), so it can
  be `require`d straight from a Node one-liner.
- **Be sparing with npm dependencies.** This is a student-facing project; each
  dependency is third-party code in the toolchain. Prefer dependency-free
  scripts; add a package only when it clearly earns its place.

## Hard rules
- **Content-neutral refactors must be provably content-neutral.** When a change
  is supposed to alter only structure/location/styling (e.g. CSS separation,
  reformatting), verify by **diff that no rendered content changed** — compare
  parsed content, not raw files (raw files are *meant* to differ). If anything
  outside the intended change differs, stop and surface it.
- **Single-source integrity.** Shared content is edited once; web and print are
  separate presentation/behavior layers over it. If the same *content* edit
  would have to be made twice, that content belongs in the shared core. See
  DESIGN.md §2.
- **The editorial voice must stay distinct.** Ochre is reserved for the editor's
  voice (`.ed`, `.edbox`, `.edpanel`); never blur it into Pharr's text. In
  print it must survive grayscale via a redundant non-color channel (DESIGN.md
  §6c). "Mr. Hotchkiss" in editorial notes is the editor referring to himself —
  intentional, never an external attribution to question.
- **Don't rebuild what exists.** Preserve established class names and the
  editorial/term systems; extend rather than duplicate.
- **Cross-references use § numbers, not page numbers.**

## Definition mini-markup (glossary.json)
Definition text in `data/glossary.json` is **student-facing and is never
rendered as HTML.** To style terms and Latin inside a definition, the JSON uses
a controlled sentinel notation that the renderer interprets, building DOM via
`createElement`/`textContent` only. Arbitrary HTML in a definition renders as
literal characters and can never execute (`<b>x</b>` shows those eight
characters). **One grammar, one parser:** `js/defmarkup.js` is the single
implementation, shared by the web tooltip and the (future) print glossary, and
executed by the validator — so the renderers and the checker can't drift.

- **Sigils (flat — spans do *not* nest):**
  - `[[direct object]]` → `<span class="term">` (grammatical term)
  - `<<cum>>` → `<span class="la">` (Latin)
  - Only the *doubled* forms are structural; a lone `<` `>` `[` `]` is literal
    text (so stray `<` stays literal, never HTML).
  - **No link syntax, by design.** Links stay structured data in dedicated
    fields (`definition_location`, `insertion_point`, `subclasses`, …). Any
    future link need gets a considered field, never an inline sentinel.
  - Add a class later by adding one row to `SIGILS` in `js/defmarkup.js`.
- **Escape rule:** a backslash makes the next character literal, so it can't be
  part of a sigil: `\[ \] \< \> \\` → `[ ] < > \`. To write a literal doubled
  sigil, escape it: `\[\[` → `[[`, `\<\<` → `<<`. A trailing backslash is
  malformed.
- **Markup-bearing fields:** `definition` and `editor_expansion` (prose).
  Structured fields (subclass names, etc.) are plain text.
- **Errors are typos to catch, not input to absorb.** Primary guard:
  `.venv/Scripts/python build/validate_markup.py` scans the whole file and
  reports every malformed/nested/mismatched/unterminated/empty sentinel with
  term, field, and position (`--selftest` proves the parser). Run it after
  editing definitions / before commit. Backstop: the web renderer fails loudly
  (console error + visible `.gloss-markup-error`) rather than mis-rendering.

## Judgment-laden work: propose, don't impose
For anything touching the editor's voice, scholarly stance, or ambiguous
term-detection (notably tooltip **polysemy** — "voice," "mood," "case,"
"person," "perfect" are also ordinary words), surface candidates with rationale
and let the user rule. Don't auto-apply these.

## Build steps that rewrite content (run, review the diff, commit)

Two scripts edit `index.html` / `data/glossary.json` in place. Both are
**idempotent** — re-running changes nothing — and both are meant to be run, then
read as a diff, then committed:

- `build/index_glossary_links.py --apply` — marks index lemmas that name a
  glossary term, adds the terms the index lacks, classifies the rest by language.
  Run it after adding a glossary entry.
- `build/render_pdf.py` — the PDF. It injects the inline editor expansions and
  the printed glossary in the Chromium render path, so **`js/edexpansions.js` and
  `build/glossary_print.js` must both keep working** or print silently says less
  than the data holds. That exact failure went unnoticed for weeks.

**A stale PDF is invisible.** `build/out/pharr-appendix.pdf` is gitignored, so
nothing warns you it is old; rebuild it after any content change. If Acrobat has
it open, Windows blocks the write and the render fails with `PermissionError` —
close it.

## Verify quantitatively — the screenshot tool will not help

Capture times out on this page (and on the vocabulary app), so **measure**:
`getBoundingClientRect`, `getComputedStyle`, `elementFromPoint`, element counts.
Two traps found this way, both of which would have passed a glance:

- **`requestAnimationFrame` callbacks do not fire in a throttled preview pane.** A
  visual nicety deferred to rAF silently never ran — precisely when someone was
  looking at it. Prefer synchronous work after the element is visible; reading
  `scrollHeight` forces layout, so no frame wait is needed.
- **Dispatch events at the element that is really under the cursor.** A dismiss
  test aimed at `.page` "passed" because a backdrop sat on top of it and a real
  click never reached `.page` at all. `document.elementFromPoint` first.

## Key files
- `DESIGN.md` — full system design and build order.
- `PROJECT-STATUS.md` — plain-language status (hosting, repo + live URL,
  licensing) for code-blind sessions.
- `COPYRIGHT.md` — the three-way license split; `LICENSE-CONTENT` (CC BY-NC-SA
  4.0) and `LICENSE-CODE` (AGPL-3.0) hold the full terms.
- `data/glossary.json` — single source for all term definitions (DESIGN.md calls
  it `pharr_grammatical_terms_N.json`, its historical name);
  feeds both web tooltips and the printed glossary. Pharr's definitions are
  read-only.
- `js/defmarkup.js` — the shared definition mini-markup parser (notation above).
- `build/validate_markup.py` — standalone markup validator (runs that parser).
- (HTML content core + CSS; web JS and print CSS layers as built.)

## Build order
See DESIGN.md §8. Each item is its own session.

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
- **Commit is the handoff.** State passes between sessions through committed files
  and clear commit messages, not conversation history. Commit at meaningful points.
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

Related: the static server (`.claude/launch.json` → `static`) usually needs a
`preview_start` at session start, and the browser caches the page/CSS — force a
fresh load via `index.html?v=<ts>` and by re-setting each stylesheet `<link>`
href with a `?t=<ts>` query.

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

## Key files
- `DESIGN.md` — full system design and build order.
- `pharr_grammatical_terms_N.json` — single source for all term definitions;
  feeds both web tooltips and the printed glossary. Pharr's definitions are
  read-only.
- `js/defmarkup.js` — the shared definition mini-markup parser (notation above).
- `build/validate_markup.py` — standalone markup validator (runs that parser).
- (HTML content core + CSS; web JS and print CSS layers as built.)

## Build order
See DESIGN.md §8. Each item is its own session.

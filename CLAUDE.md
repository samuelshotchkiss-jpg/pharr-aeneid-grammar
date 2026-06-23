# CLAUDE.md — operating conventions

Project context for Claude Code. The full system design is in **DESIGN.md** —
read it for architecture, the editorial-voice system, the term/glossary data,
and the feature specs. This file is just the house rules.

## What this project is
A digital scholarly edition of Pharr's *Aeneid* grammar appendix, produced as
both an interactive web page and a print PDF from a **single source**. Audience:
a 10th-grade Latin class with limited grammar background.

## How we work
- **One focused work stream per session.** Do the one task, then stop. Between
  tasks the user runs `/clear`; the next session starts fresh and reads this
  file + DESIGN.md. Don't try to carry multiple features in one session.
- **Commit is the handoff.** State passes to the next session through committed
  files and clear commit messages, not through conversation history. Commit at
  meaningful points; the user commits before clearing.
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
- (HTML content core + CSS; web JS and print CSS layers as built.)

## Build order
See DESIGN.md §8. Each item is its own session.

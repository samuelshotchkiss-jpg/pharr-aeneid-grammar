# Pharr's Grammatical Appendix — Digital Scholarly Edition

A modernized, accessible edition of the grammatical appendix to Clyde Pharr's
*Vergil's Aeneid, Books I–VI* (1930, public domain), reset for advanced Latin
students.

**📖 Live edition:** https://samuelshotchkiss-jpg.github.io/pharr-aeneid-grammar/
— served by GitHub Pages from this repo's `main` branch; a push auto-rebuilds it
in about a minute.

## Goal: single source → two outputs

One body of content produces two presentations, with no second copy of the text:

- **Web** — an interactive page (left nav with search + table of contents,
  JSON-driven grammatical tooltips, a search page).
- **Print/PDF** — a paged-media document (pagination, print-safe color
  translation, the glossary appended in print).

Shared content lives once; web and print are CSS/JS *layers* attached over it.

## Layout

```
index.html        The single content source (structure + content only).
css/
  core.css        Shared presentation: :root tokens, type, section layout,
                  inline roles, editorial system, tables/paradigms, scansion.
  web.css         Screen-only layer  (linked media="screen").
  print.css       Paged-media layer  (linked media="print").
js/
  defmarkup.js    Definition mini-markup parser (shared: web tooltip + print
                  glossary + validator, so they can't drift).
  nav.js          Left navigation, search, table of contents.
  tooltips.js     JSON-driven grammatical tooltips.
data/
  glossary.json   178 grammatical terms; feeds web tooltips AND printed glossary.
build/            PDF pipeline (Python + headless Chromium):
  render_pdf.py      Render index.html -> build/out/pharr-appendix.pdf.
  glossary_print.js  Builds the print glossary at render time, from glossary.json.
  validate_markup.py Validates the glossary definition mini-markup.
```

## Preview the web edition locally

Opening `index.html` straight off disk (`file://`) renders the layout, but the
tooltips and search fetch `data/glossary.json`, which browsers block over
`file://`. Serve the folder over HTTP instead — it is plain static files, with
no build step:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000/>. (Any static file server works.)

## Build the print PDF

The PDF is rendered locally by headless Chromium (via Playwright) from the same
`index.html` + `core.css` the web edition uses — `print.css` is the only
print-specific layer, and the glossary is built into the PDF at render time. The
PDF is **not** part of the deployed site (`build/out/` is gitignored); build it
on demand.

One-time setup, from the repo root:

```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m playwright install chromium
```

Render:

```powershell
.venv\Scripts\python build\render_pdf.py
```

That writes `build/out/pharr-appendix.pdf` and prints the page count. Handy
flags:

- `--out build\out\draft.pdf` — write elsewhere (e.g. to compare two versions
  side by side without overwriting the main one).
- `--url http://localhost:8000/index.html` — render a server-hosted copy
  instead of the local file (the default loads over `file://`).

> **Windows heads-up:** each run **overwrites** the output file, and Windows
> locks a PDF that's currently open in a viewer (Acrobat, Edge, etc.). If you
> see `PermissionError: [Errno 13] Permission denied: 'build\out\pharr-appendix.pdf'`,
> close the open PDF and re-run — or render to a different `--out`.

> On macOS/Linux the interpreter lives at `.venv/bin/python` instead of
> `.venv\Scripts\python`; everything else is the same.

## Editorial conventions (preserve these)

- **Editorial voice (ours)** is the ochre family, three tiers: `.ed` (inline),
  `.edbox` (note), `.edpanel` (panel).
- **Pharr's own notes** use `.editnote` — deliberately blue-grey, never ochre,
  so the two voices never blur.
- Section numbers match Pharr's originals; the index and cross-references
  (`#sN` anchors) depend on them.

## Working conventions

- **Version control replaces the old filename-increment workflow.** Revisions
  are tracked by git history and diff, not by renaming files. The repo lives on
  GitHub; **pushing to `main` publishes the live site** (above) and is the
  offsite backup — so push coherent states, not knowingly-broken ones.
- **Content-neutral refactors must be provably content-neutral**: the rendered
  page is identical before and after; only structure/location changes.
- Work in **reviewable increments** with verification between them.

## Repository & deployment

```bash
git clone https://github.com/samuelshotchkiss-jpg/pharr-aeneid-grammar.git
```

- **One `main` branch, deployed as-is.** GitHub Pages serves `main` from the
  repository root — there is **no CI build step**, so the files on `main` *are*
  the live site. A push rebuilds it in about a minute; check the **Actions** tab
  for the deploy status. (Because a push is immediately public, push coherent
  states — see *Working conventions* above.)
- **What ships vs. what doesn't.** The deployed site is `index.html`, `css/`,
  `js/`, and `data/`. The print PDF, the `.venv`, and `build/out/` are **not**
  deployed (and are gitignored) — the PDF is a local build (see above), not a
  release artifact.
- **Proposing changes.** Fork and open a pull request; mind the three-way
  licensing split below when contributing content vs. code.

## Licensing

This repository combines three bodies of material under three terms — see
[`COPYRIGHT.md`](COPYRIGHT.md) for the full breakdown:

- **Pharr's grammatical text** (1930) — **public domain**.
- **Editorial content** we added (notes, glossary definitions, design prose,
  `index.html`, `data/glossary.json`, docs) — **CC BY-NC-SA 4.0**
  ([`LICENSE-CONTENT`](LICENSE-CONTENT)).
- **Code and toolchain** (`css/`, `js/`, `build/`) — **AGPL-3.0**
  ([`LICENSE-CODE`](LICENSE-CODE)).

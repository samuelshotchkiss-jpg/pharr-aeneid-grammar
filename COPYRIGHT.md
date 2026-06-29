# Copyright and licensing

This repository deliberately combines three bodies of material under three
different terms. Please read this file before reusing any part of it.

## 1. Pharr's grammatical text — public domain

The grammatical appendix to Clyde Pharr's *Vergil's Aeneid, Books I–VI*
(D. C. Heath & Co., 1930) is in the **public domain**. Pharr's section text,
paradigm tables, and section numbering are reproduced here as a faithful
modernized setting and carry no copyright restriction.

## 2. Editorial content — CC BY-NC-SA 4.0

Everything *we* added around Pharr's text — the editorial voice and notes
(`.ed`, `.edbox`, `.edpanel`), the glossary definitions and editor expansions,
the design prose, and the overall selection and arrangement of the edition — is
licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International License** (see [`LICENSE-CONTENT`](LICENSE-CONTENT)).

Files in this bucket:

- `index.html` — the content source. Its substance is Pharr's public-domain
  text plus our editorial prose; the edition as a whole is licensed as content,
  not code. (Pharr's portions remain public domain in their own right.)
- `data/glossary.json` — the grammatical term definitions and editor expansions.
- `DESIGN.md`, `README.md`, and this file — project documentation.

Summary: https://creativecommons.org/licenses/by-nc-sa/4.0/

## 3. Code and toolchain — GPL-3.0

The presentation and behavior layers, and the build tooling, are licensed under
the **GNU General Public License, version 3** (see [`LICENSE-CODE`](LICENSE-CODE)).

Files in this bucket:

- `css/` — the shared presentation and the screen/print layers.
- `js/` — web behaviors (navigation, tooltips, the definition mini-markup parser).
- `build/` — the PDF pipeline, CSS extraction, and the markup validator.

## A note on combining the two licenses

CC BY-NC-SA 4.0 and GPL-3.0 are not compatible *within a single file*. In this
project they never share a file: content lives in HTML/JSON/Markdown, code lives
in CSS/JS/Python. If you extract material, keep that boundary — reuse the code
under GPL-3.0 and the content under CC BY-NC-SA 4.0, and attribute Pharr's
underlying text as public domain.

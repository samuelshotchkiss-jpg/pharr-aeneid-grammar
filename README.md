# Pharr's Grammatical Appendix — Digital Scholarly Edition

A modernized, accessible edition of the grammatical appendix to Clyde Pharr's
*Vergil's Aeneid, Books I–VI* (1930, public domain), reset for advanced Latin
students.

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
js/               Web-only behaviors (nav, tooltips, search). [planned]
data/
  glossary.json   178 grammatical terms; feeds web tooltips AND printed glossary.
build/            PDF pipeline. [planned]
```

## Editorial conventions (preserve these)

- **Editorial voice (ours)** is the ochre family, three tiers: `.ed` (inline),
  `.edbox` (note), `.edpanel` (panel).
- **Pharr's own notes** use `.editnote` — deliberately blue-grey, never ochre,
  so the two voices never blur.
- Section numbers match Pharr's originals; the index and cross-references
  (`#sN` anchors) depend on them.

## Working conventions

- **Version control replaces the old filename-increment workflow.** Revisions
  are tracked by git history and diff, not by renaming files.
- **Content-neutral refactors must be provably content-neutral**: the rendered
  page is identical before and after; only structure/location changes.
- Work in **reviewable increments** with verification between them.

#!/usr/bin/env python
"""Render the edition to a print PDF with headless Chromium (Playwright).

The print PDF is produced from the SAME index.html + shared core.css that the
web edition uses (DESIGN.md §2 single-source); print.css (media="print") is the
only print-specific layer. Chromium is the engine because the whole visual
system -- box-shadow table frames, the CSS-grid conjugations, flex set-pieces,
gradient hatching -- was authored and verified against it, so the PDF matches
the approved screen rendering with no second-engine divergence (DESIGN.md §6).

Usage (from the project root, with the venv active or by full path):
    .venv/Scripts/python build/render_pdf.py                 # default in/out
    .venv/Scripts/python build/render_pdf.py --in index.html --out build/out/edition.pdf
    .venv/Scripts/python build/render_pdf.py --url http://localhost:8765/index.html

By default the page is loaded over file:// -- the print layer needs no server,
since the JS-driven features that require http(s) (tooltips, glossary fetch)
are screen-only and hidden in print. Pass --url to render a served copy instead.

Page numbers: modern (new-headless) Chromium DOES honor CSS `@page` margin
boxes, so the running page number comes straight from print.css
(`@bottom-center{content:counter(page)}`) -- no print-API footer template (an
earlier assumption that Chromium ignored margin boxes was wrong, and a footer
template here just double-printed the number). Keeping it in CSS is also
single-source-clean and correct for any other paged engine.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

# Repo root (parent of build/), so data/JS paths resolve regardless of cwd.
ROOT = pathlib.Path(__file__).resolve().parent.parent


def _append_glossary(page) -> None:
    """Build the print glossary (DESIGN.md §6d) from data/glossary.json and
    insert it before the back-of-book index, in the live Chromium render path.

    Print-only: this runs only here, so index.html / the web edition are
    untouched. Definitions render through the SAME shared parser the web tooltip
    uses (js/defmarkup.js), so the two cannot drift -- and that parser thus runs
    in the actual print path. Content comes solely from glossary.json.
    """
    data = json.loads((ROOT / "data" / "glossary.json").read_text(encoding="utf-8"))
    # defmarkup.js is already loaded by index.html; re-add defensively so the
    # build also works against any HTML that doesn't include it.
    page.add_script_tag(path=str(ROOT / "js" / "defmarkup.js"))
    page.add_script_tag(path=str(ROOT / "build" / "glossary_print.js"))
    stats = page.evaluate("(data) => window.PharrBuildPrintGlossary(data)", data)
    print(f"glossary: {stats['entries']} entries + {stats['sees']} cross-references")


def render(source: str, out_path: pathlib.Path, *, is_url: bool) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    target = source if is_url else pathlib.Path(source).resolve().as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # wait until network is idle so deferred scripts settle before printing.
        page.goto(target, wait_until="networkidle")
        _append_glossary(page)
        page.pdf(
            path=str(out_path),
            print_background=True,        # tints, gradients, box-shadow frames
            prefer_css_page_size=True,    # honor @page size:Letter + margins
        )                                 # page numbers via print.css @bottom-center
        browser.close()
    print(f"wrote {out_path}  ({out_path.stat().st_size:,} bytes)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Render the edition to a print PDF.")
    ap.add_argument("--in", dest="src", default="index.html",
                    help="HTML file to render (default: index.html)")
    ap.add_argument("--url", dest="url", default=None,
                    help="Render a served URL instead of a local file.")
    ap.add_argument("--out", dest="out", default="build/out/pharr-appendix.pdf",
                    help="Output PDF path (default: build/out/pharr-appendix.pdf)")
    args = ap.parse_args(argv)

    if args.url:
        render(args.url, pathlib.Path(args.out), is_url=True)
    else:
        src = pathlib.Path(args.src)
        if not src.exists():
            print(f"error: {src} not found", file=sys.stderr)
            return 1
        render(args.src, pathlib.Path(args.out), is_url=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

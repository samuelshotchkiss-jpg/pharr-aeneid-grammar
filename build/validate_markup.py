#!/usr/bin/env python
"""Validate the definition mini-markup in data/glossary.json.

This is the PRIMARY guard for the notation (the renderers' loud-failure is only
a backstop). The glossary is AUTHORED content, so a malformed sentinel means a
typo to catch before commit/build -- not untrusted input to absorb.

No drift by construction: this runs the SAME parser the web tooltip and the
(future) print glossary use -- js/defmarkup.js -- executed in Chromium via
Playwright (already a project dependency). There is one grammar implementation;
the validator cannot disagree with the renderers about what is malformed.

It scans every markup-bearing field of every entry and reports each malformed /
nested / mismatched / unterminated / empty sentinel with the term, field,
character position, and message. Exit status is nonzero if anything is wrong, so
it can gate a commit or a build.

Usage (from the project root):
    .venv/Scripts/python build/validate_markup.py
    .venv/Scripts/python build/validate_markup.py --in data/glossary.json
    .venv/Scripts/python build/validate_markup.py --selftest   # prove the parser
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

# Fields whose value is mini-markup prose. Keep in step with the renderers:
# tooltips.js parses `definition` and `editor_expansion` through defmarkup.js.
MARKUP_FIELDS = ("definition", "editor_expansion")

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARSER_JS = ROOT / "js" / "defmarkup.js"

# Each is (label, text, should_be_ok). Drives --selftest; documents the grammar.
SELFTEST_CASES = [
    ("plain text",            "an ordinary definition",            True),
    ("term span",             "the [[direct object]] of a verb",   True),
    ("latin span",            "as in <<cum>>",                     True),
    ("both, adjacent",        "[[ablative]] of <<means>>",         True),
    ("escaped doubled sigil", r"write \[\[ and \<\< literally",    True),
    ("escaped single",        r"a \\ and a \< stay literal",       True),
    ("lone angle/bracket",    "x < y and a [ b are literal",       True),
    ("literal-looking html",  "<b>x</b> shows as text",            True),
    ("nested sigil",          "[[a <<b>> c]]",                     False),
    ("unterminated",          "the [[direct object",               False),
    ("unmatched close",       "stray ]] here",                     False),
    ("mismatched close",      "[[term>>",                          False),
    ("empty span",            "[[]] nothing",                      False),
    ("dangling escape",       "ends with a backslash\\",           False),
]


def _eval_validate(page, items):
    """Run PharrDefMarkup.validate over every item in one round-trip."""
    return page.evaluate(
        """(items) => items.map(it => {
              const err = window.PharrDefMarkup.validate(it.text);
              return err ? { ...it, message: err.message, index: err.index } : null;
           }).filter(Boolean)""",
        items,
    )


def _with_parser(fn):
    """Load js/defmarkup.js into a blank Chromium page, then call fn(page)."""
    js = PARSER_JS.read_text(encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.add_script_tag(content=js)
        try:
            return fn(page)
        finally:
            browser.close()


def run_selftest() -> int:
    items = [{"label": lbl, "text": txt, "expect_ok": ok}
             for (lbl, txt, ok) in SELFTEST_CASES]

    def go(page):
        errs = {e["label"]: e for e in _eval_validate(page, items)}
        failures = 0
        for lbl, txt, expect_ok in SELFTEST_CASES:
            got_err = errs.get(lbl)
            ok = (got_err is None) if expect_ok else (got_err is not None)
            mark = "PASS" if ok else "FAIL"
            detail = "" if got_err is None else f"  -> {got_err['message']}"
            print(f"  [{mark}] {lbl}: {txt!r}{detail}")
            if not ok:
                failures += 1
        return failures

    failures = _with_parser(go)
    print()
    if failures:
        print(f"selftest: {failures} case(s) FAILED")
        return 1
    print(f"selftest: all {len(SELFTEST_CASES)} cases passed")
    return 0


def validate_file(src: pathlib.Path) -> int:
    if not src.exists():
        print(f"error: {src} not found", file=sys.stderr)
        return 2
    data = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        print(f"error: {src} is not a JSON array of entries", file=sys.stderr)
        return 2

    items, n_fields = [], 0
    for i, entry in enumerate(data):
        if not isinstance(entry, dict):
            continue
        term = entry.get("term") or f"(entry #{i})"
        for field in MARKUP_FIELDS:
            val = entry.get(field)
            if isinstance(val, str) and val:
                n_fields += 1
                items.append({"term": term, "field": field, "text": val})

    errors = _with_parser(lambda page: _eval_validate(page, items)) if items else []

    if errors:
        print(f"{len(errors)} malformed sentinel(s) in {src}:\n")
        for e in errors:
            print(f"  {e['term']!r} . {e['field']}: {e['message']}")
            # show the offending slice for quick eyeballing
            txt = next((it["text"] for it in items
                        if it["term"] == e["term"] and it["field"] == e["field"]), "")
            idx = e.get("index", -1)
            if isinstance(idx, int) and idx >= 0:
                lo, hi = max(0, idx - 20), min(len(txt), idx + 20)
                print(f"      …{txt[lo:hi]}…")
        print()
        return 1

    print(f"OK: {n_fields} markup field(s) across {len(data)} entries -- no errors.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate definition mini-markup.")
    ap.add_argument("--in", dest="src", default="data/glossary.json",
                    help="glossary JSON to scan (default: data/glossary.json)")
    ap.add_argument("--selftest", action="store_true",
                    help="run the parser over built-in good/bad cases and exit")
    args = ap.parse_args(argv)

    if args.selftest:
        return run_selftest()
    return validate_file(pathlib.Path(args.src))


if __name__ == "__main__":
    raise SystemExit(main())

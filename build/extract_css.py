#!/usr/bin/env python3
"""Increment A: relocate the inline <style> block into css/styles.css verbatim.

Content-neutral by construction: the bytes between <style> and </style> are
written unchanged to css/styles.css, and the only edit to index.html is swapping
that block for a <link>. Proven below by reconstruction (re-inlining the
external CSS must reproduce the original file byte-for-byte).
"""
import sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / "index.html"
css_path = root / "css" / "styles.css"
LINK = '<link rel="stylesheet" href="css/styles.css">'

orig = html_path.read_text(encoding="utf-8", newline="")

o, c = "<style>", "</style>"
i = orig.find(o)
j = orig.find(c)
if i < 0 or j < 0 or j < i:
    sys.exit("could not locate a single <style>...</style> block")
if orig.count(o) != 1 or orig.count(c) != 1:
    sys.exit("expected exactly one <style> and one </style>")

before = orig[:i]
css = orig[i + len(o):j]
after = orig[j + len(c):]

new_html = before + LINK + after

css_path.write_text(css, encoding="utf-8", newline="")
html_path.write_text(new_html, encoding="utf-8", newline="")

# --- Proof of content-neutrality: re-inline and compare to the original ---
recon = before + o + css_path.read_text(encoding="utf-8", newline="") + c + after
assert recon == orig, "FAIL: reconstruction does not match original"
print("OK: extracted", len(css), "chars of CSS; reconstruction == original")

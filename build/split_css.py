#!/usr/bin/env python3
"""Increment B: split css/styles.css into core / web / print layers.

The source has exactly two media scopes: print-only (@page + @media print) and
all-media (everything else). The only provably content-neutral split right now
follows that seam:

  core.css   all currently-unscoped rules            (linked: all media)
  print.css  the @page rule + @media print block      (linked: media="print")
  web.css    screen-only layer -- created empty of rules; the source has no
             screen-specific rules to move here yet   (linked: media="screen")

Neutrality is proven by *normalized equivalence*: stripping CSS comments and
whitespace, the concatenation core+print must equal styles.css (declarations and
their cascade order unchanged), and web must contain no declarations. The
@media print wrapper is kept inside print.css (redundant under media="print" but
harmless, and keeps the file correct if ever loaded unscoped).
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
css = root / "css"
styles = (css / "styles.css").read_text(encoding="utf-8", newline="")

MARK = "/* ---- print ---- */"
cut = styles.find(MARK)
if cut < 0 or styles.count(MARK) != 1:
    sys.exit("could not locate a single print-section marker")

core_rules = styles[:cut]      # all-media rules (ends with the blank line)
print_rules = styles[cut:]     # @page + @media print, verbatim

CORE_HDR = (
    "/* =========================================================================\n"
    "   core.css -- SHARED layer (web + print)\n"
    "   Linked for all media. Holds everything not specific to one medium:\n"
    "   :root tokens, typography, section layout, inline roles, the editorial\n"
    "   system, tables/paradigms, scansion, braces. See the navigation map below.\n"
    "   Screen-only page chrome still lives here for now; it migrates to web.css\n"
    "   when the web layer is built (verified then by render-diff vs. print).\n"
    "   ========================================================================= */\n"
)
WEB_HDR = (
    "/* =========================================================================\n"
    "   web.css -- SCREEN-ONLY layer        (linked media=\"screen\")\n"
    "   Presentation/behavior that must NOT reach the printed page: page chrome,\n"
    "   the minimizable left nav (TOC + search), term tooltips, the search page,\n"
    "   hover/:target affordances.\n"
    "   Intentionally empty of rules today -- the source had no screen-scoped\n"
    "   rules. Screen-only styling lands here as the web features are built.\n"
    "   ========================================================================= */\n"
)
PRINT_HDR = (
    "/* =========================================================================\n"
    "   print.css -- PAGED-MEDIA layer      (linked media=\"print\")\n"
    "   @page geometry + print overrides + page-break control. Print color\n"
    "   translation and the appended glossary will be added here.\n"
    "   The @media print wrapper is kept deliberately: redundant under a\n"
    "   media=\"print\" link, but keeps this file correct if loaded unscoped.\n"
    "   ========================================================================= */\n"
)

(css / "core.css").write_text(CORE_HDR + core_rules, encoding="utf-8", newline="")
(css / "web.css").write_text(WEB_HDR, encoding="utf-8", newline="")
(css / "print.css").write_text(PRINT_HDR + print_rules, encoding="utf-8", newline="")

# ---- Proof of content-neutrality: normalized declarations + order unchanged ----
def norm(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)  # drop comments
    return re.sub(r"\s+", "", s)                        # drop whitespace

core = (css / "core.css").read_text(encoding="utf-8", newline="")
web = (css / "web.css").read_text(encoding="utf-8", newline="")
prnt = (css / "print.css").read_text(encoding="utf-8", newline="")

assert norm(web) == "", "FAIL: web.css contains CSS declarations"
assert norm(core) + norm(prnt) == norm(styles), "FAIL: core+print != styles.css (normalized)"
print("OK: core+print reproduce styles.css declarations in order; web has none")
print(f"   core={len(core_rules)} print={len(print_rules)} chars (rules, excl. headers)")

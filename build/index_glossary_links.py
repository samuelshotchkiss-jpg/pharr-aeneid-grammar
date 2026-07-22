#!/usr/bin/env python
"""index_glossary_links.py -- wire the back-of-book index to the glossary.

    .venv/Scripts/python build/index_glossary_links.py            # dry run
    .venv/Scripts/python build/index_glossary_links.py --apply    # rewrite index.html

WHAT AND WHY. The index is the reader's front door -- it is what the search
dropdown mirrors (nav.js `collectIndex` clones the live `.idx` nodes), so
anything done here reaches BOTH the printed index and the dropdown with no second
code path. That is the whole reason to edit the index rather than special-case the
dropdown: one source, three surfaces (page, dropdown, PDF).

THREE THINGS IT DOES

1. MARKS a lemma that names a glossary term, by exact match on the term or any
   ';'-split variant, or by prefix where Pharr appends a qualifier ("Ablative,
   Syntax" is the ablative). The lemma gains `data-gloss="<slug>"`, which the web
   layer turns into a click opening that term's glossary landing.

2. ADDS the glossary terms the index does not carry at all. Every one has a
   `definition_location` (Pharr defines it) or an `insertion_point` (the editor
   placed it), so each gets a real section link like any other entry -- no "see
   glossary" fallback is needed. Added entries are marked `.idx-added` and print
   in editorial ochre, because they are ours and not Pharr's.

3. CLASSES the rest `.lemma-plain`, so the default styling can stop implying
   Latin. It does NOT try to say which of them are Latin: the editor found
   "Anticipation, clauses of", "Appointing, verbs of, with two accusatives" and
   "At" (the English preposition, "translated by prep. with abl.") in the first
   column alone -- neither Latin, nor glossary terms, nor the same kind of thing
   as each other. That classification is a later judgment pass.

   Recorded for that pass: CAPITALISATION looks like a strong prior. Pharr leaves
   Latin lowercase (a, absum, ac si, ad) and capitalises English topic headings
   (Ability, Abounding, Accompaniment) -- 348 against 242 in the unmatched set.
   Latin proper nouns will break it, so it is a prior to review, not a rule.

IDEMPOTENT: re-running finds the markers already present and changes nothing.
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
GLOSSARY = ROOT / "data" / "glossary.json"


# EVERY class pattern here tolerates extra classes -- `class="idx[^"]*"`, never
# `class="idx"`. Anchoring on the closing quote bit twice in one sitting: once on
# the lemma span (which gains `lemma-term` when marked), and once on the entry
# itself (which gains `idx-added`). The second was worse, because it meant the
# script could not see its own additions: a re-run reported "25 to add" and
# duplicated all of them, while claiming success. Idempotence is not a nice
# property here, it is the difference between a rerunnable build step and a
# footgun.
IDX_P = r'<p class="idx[^"]*"[^>]*>(.*?)</p>'
IDX_BLOCK = r'[ \t]*<p class="idx[^"]*"[^>]*>.*?</p>\n?'


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", html.unescape(re.sub(r"<[^>]+>", "", s)).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", "", s).strip()


def slugify(s: str) -> str:
    """Must match slugify() in js/tooltips.js and the toolkit's sync_grammar_terms.py."""
    f = unicodedata.normalize("NFD", str(s or "").lower())
    f = "".join(c for c in f if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", f).strip("-")


def variant_keys(e: dict) -> list[str]:
    out = [fold(e["term"])]
    for v in (e.get("variants") or "").split(";"):
        v = re.sub(r"\s*\([^)]*\)", "", v).strip()
        if v:
            out.append(fold(v))
    return [k for k in out if k]


def secnum(s: str) -> str | None:
    m = re.search(r"(\d+)", s or "")
    return m.group(1) if m else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    ap.add_argument("--apply", action="store_true", help="write index.html (default: dry run)")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    t = INDEX.read_text(encoding="utf-8")
    gloss = json.loads(GLOSSARY.read_text(encoding="utf-8"))

    by_key: dict[str, dict] = {}
    for e in gloss:
        for k in variant_keys(e):
            by_key.setdefault(k, e)

    entries = list(re.finditer(IDX_P, t, re.S))
    # The class pattern must tolerate EXTRA CLASSES. After marking, a span reads
    # class="lemma lemma-term", and a regex anchored on the closing quote --
    # class="lemma" -- stops matching it. That bug made every sort key come back
    # empty on the second pass, so all 25 additions sorted past the end of the
    # list and were silently dropped, with the script reporting success.
    lemma_re = re.compile(r'<span class="lemma[^"]*"[^>]*>(.*?)</span>', re.S)

    marked, plain, seen_terms = [], [], set()
    for m in entries:
        lm = lemma_re.search(m.group(1))
        if not lm:
            continue
        raw = html.unescape(re.sub(r"<[^>]+>", "", lm.group(1))).strip()
        key = fold(raw)
        hit = by_key.get(key)
        if hit is None:                       # Pharr's qualifier suffix: "Ablative, Syntax"
            for k, e in by_key.items():
                if len(k) > 3 and key.startswith(k + " "):
                    hit = e
                    break
        if hit:
            marked.append((raw, hit["term"]))
            seen_terms.add(hit["term"])
        else:
            plain.append(raw)

    missing = [e for e in gloss if e["term"] not in seen_terms]

    print(f"index entries          : {len(entries)}")
    print(f"  lemma names a term   : {len(marked)}  -> gains data-gloss + a glossary click")
    print(f"  everything else      : {len(plain)}  -> .lemma-plain (styling only; NOT classified)")
    print()
    print(f"glossary terms         : {len(gloss)}")
    print(f"  already in the index : {len(seen_terms)}")
    print(f"  TO BE ADDED (ochre)  : {len(missing)}")
    noloc = [e for e in missing
             if not secnum(e.get("definition_location") or "")
             and not secnum(e.get("insertion_point") or "")]
    print(f"  of those, with no section at all: {len(noloc)}"
          f"{'  <- would need a see-glossary fallback' if noloc else '  (none: every one links)'}")
    print()
    print("sample of what would be ADDED:")
    for e in missing[:12]:
        n = secnum(e.get("definition_location") or "") or secnum(e.get("insertion_point") or "")
        src = "Pharr" if secnum(e.get("definition_location") or "") else "editor"
        print(f"   {e['term']:<28} §{n:<5} ({src})")
    if not a.apply:
        print("\nDRY RUN -- nothing written. Re-run with --apply.")
        return 0

    # --- 1/3: mark every lemma, in place ------------------------------------
    def mark(mo: re.Match) -> str:
        inner = mo.group(1)
        lm = lemma_re.search(inner)
        if not lm or 'data-gloss=' in lm.group(0) or 'lemma-plain' in lm.group(0):
            return mo.group(0)                       # idempotent
        raw = html.unescape(re.sub(r"<[^>]+>", "", lm.group(1))).strip()
        key = fold(raw)
        hit = by_key.get(key)
        if hit is None:
            for k, e in by_key.items():
                if len(k) > 3 and key.startswith(k + " "):
                    hit = e
                    break
        if hit:
            new_span = (f'<span class="lemma lemma-term" data-gloss="{slugify(hit["term"])}"'
                        f' title="Open the glossary entry for {html.escape(hit["term"])}">'
                        f'{lm.group(1)}</span>')
        else:
            new_span = f'<span class="lemma lemma-plain">{lm.group(1)}</span>'
        return mo.group(0).replace(lm.group(0), new_span, 1)

    t2 = re.sub(IDX_P, mark, t, flags=re.S)

    # --- 2/3: build the entries to add --------------------------------------
    def entry_html(e: dict) -> str:
        n = secnum(e.get("definition_location") or "") or secnum(e.get("insertion_point") or "")
        return (f'<p class="idx idx-added"><span class="lemma lemma-term lemma-added"'
                f' data-gloss="{slugify(e["term"])}"'
                f' title="Open the glossary entry for {html.escape(e["term"])}">'
                f'{html.escape(e["term"])}</span>, <a href="#s{n}">{n}</a></p>')

    # --- 3/3: splice them in alphabetical position ---------------------------
    blocks = list(re.finditer(IDX_BLOCK, t2, re.S))
    keyed = []
    for b in blocks:
        lm = lemma_re.search(b.group(0))
        raw = html.unescape(re.sub(r"<[^>]+>", "", lm.group(1))).strip() if lm else ""
        keyed.append((fold(raw), b))
    assert any(k for k, _ in keyed), (
        "every sort key came back empty -- lemma_re is not matching the marked spans")

    # Offset for each addition: before the first existing entry that sorts after
    # it, or after the last entry if it sorts last. Applied right-to-left so an
    # earlier insertion cannot invalidate a later offset.
    end_of_last = keyed[-1][1].end()
    placements: list[tuple[int, str]] = []
    for e in missing:
        k = fold(e["term"])
        nxt = next(((kk, b) for kk, b in keyed if kk > k), None)
        at = nxt[1].start() if nxt else end_of_last
        placements.append((at, "    " + entry_html(e) + "\n"))

    t3 = t2
    for at, frag in sorted(placements, key=lambda p: -p[0]):
        t3 = t3[:at] + frag + t3[at:]

    INDEX.write_text(t3, encoding="utf-8")
    print(f"\nWROTE {INDEX.name}")
    print(f"   lemmas marked : {len(re.findall(r'lemma-term', t3))} term / "
          f"{len(re.findall(r'lemma-plain', t3))} plain")
    print(f"   entries added : {len(re.findall(r'idx-added', t3))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

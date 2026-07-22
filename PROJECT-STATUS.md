# Project status — where things stand

A plain-language summary of how this edition is set up, written for a reader who
is thinking about the *content and scholarship* rather than the code. No
technical knowledge assumed. (For the engineering details, see `DESIGN.md` and
`CLAUDE.md`; for the exact license terms, see `COPYRIGHT.md`.)

## What this is

A digital scholarly edition of the grammatical appendix to Clyde Pharr's
*Vergil's Aeneid, Books I–VI* (1930), modernized and made accessible for a
10th-grade Latin class. One body of content produces **two outputs**: an
interactive web page and a print-ready PDF. The text is written once; the screen
and print versions are just two different "skins" over that single source, so
there's never a second copy to keep in sync.

## It's now published online (as of 2026-06-29)

- **Live website:** https://samuelshotchkiss-jpg.github.io/pharr-aeneid-grammar/
  Anyone with the link can read it. Students don't need accounts or software —
  it opens in any browser.
- **Source repository (GitHub):**
  https://github.com/samuelshotchkiss-jpg/pharr-aeneid-grammar
  This is the public home where all the project's files live and where the
  history of every revision is kept.
- **How updates go live:** the website is generated automatically from the
  repository. When a change is saved ("committed") to the repository's main
  copy, the public site rebuilds itself within about a minute. There is no
  separate "upload the site" step.

## The three layers of content (and who owns what)

The edition deliberately mixes three kinds of material, each under its own terms:

1. **Pharr's original grammar** (his 1930 text, tables, and section numbers) is
   **public domain** — free for anyone to use, no permission needed.
2. **Our editorial additions** — the editor's notes and voice, the glossary
   definitions, the design write-ups, and the arrangement of the whole edition —
   are under a **Creative Commons "BY-NC-SA"** license. In plain terms: others
   may share and adapt this material, but they must credit it, may **not** use it
   commercially, and must release their adaptations under the same terms.
3. **The code** (the styling and interactive machinery, plus the PDF-building
   tools) is under the **AGPL** software license. In plain terms: anyone may use
   and modify the code, but they must keep it open — no one can take it,
   make it proprietary, and close it off. The "Affero" twist also covers the
   case where someone runs a modified version as a website: they'd have to share
   their changes too.

The practical upshot: nobody can take this edition and sell it or lock it away.
Other teachers and open educational projects, however, remain free to use and
build on it — which is the kind of reuse the project wants to encourage.

### Why this licensing split, briefly

We considered making the code "non-commercial" to match the content, but that
would have *blocked* a lot of legitimate educational reuse (teachers at
tuition-charging schools, nonprofits, and especially inclusion in open
educational-resource libraries), while the open-source AGPL already prevents the
thing we actually care about: closed, proprietary versions of the code. The
content stays non-commercial; the code stays open.

## How the work is organized

- The project runs as **separate focused conversations**, each handling one
  thread (for example: the glossary, the print layout, or — like the session
  that wrote this file — publishing and licensing). They share one set of files.
- **Saving to the repository is how the threads hand off to each other.** State
  passes through committed files and their descriptions, not through any single
  conversation's memory. So this very document is the kind of handoff that lets a
  later conversation pick up cleanly.

## What the edition gained in July 2026 — the vocabulary link-up

The class also has a **vocabulary app** (a separate project). Its definitions tag
grammatical terms, and those tags now open the matching entry *here*. Three
things were built or fixed to make that work, and they changed this edition too:

- **A glossary entry is now addressable.** A link of the form `…/#term=ablative`
  opens that entry directly, as a panel over the page. Before, an entry could
  only be reached by clicking the word inside Pharr's text — which is no use to
  a reader arriving from somewhere else.
- **The "Kinds" menus were completed.** Each case entry lists the constructions
  Pharr treats, every one linking to its section: **62** of them across the
  ablative, dative, genitive and accusative, up from 34. The accusative had none
  at all. A link can therefore land on *"ablative"* with *"ablative of
  separation §340"* already picked out.
- **The index is wired to the glossary.** Clicking an index word that names a
  grammatical term opens its entry; clicking the numbers still jumps to the
  section, as before. 25 terms the index never carried were added, in editorial
  ochre. Index words are now coloured by what they are — Latin, grammatical term,
  or English heading — where they used to be one undifferentiated blue.

**Two things that were quietly wrong and are now fixed**, both worth knowing
because they were invisible rather than broken: the editor's expansions of
Pharr's terser definitions **were never reaching the printed glossary** (24
entries, including *ablative*, which printed as "the case of adverbial relation"
and nothing else), and every one of 139 invisible anchor points was reserving a
blank line of space on screen — about a page of accumulated whitespace.

**Each case entry now ends by answering the question a stuck student actually
has:** *how will I recognise one?* It gives the honest answer — that the ending
depends on the declension — then the one rule that does hold (the accusative
singular always ends in **-m**; dative and ablative plurals are always
identical), then points at §32–33, where Pharr tabulates the lot.

## Owed by the editor — content drafted for you, not by you

Some of the prose now in the edition was **drafted by Claude in the editor's
voice**. It is accurate and it validates, but the voice is borrowed. These are
yours to revise or discard, and nothing depends on them staying as they are:

- **The seven "How will you spot one?" notes** at the end of each case entry
  (nominative, genitive, dative, accusative, ablative, vocative, locative). Every
  ending in them was read off §32's tables and checked, and each note gives only
  the one generalisation that actually holds for that case — but the phrasing,
  the choice of which rule is worth a beginner's attention, and the tone are all
  open. *Editor, 2026-07-21: "I'll probably tinker with your entries myself."*
- **The 25 index entries added in ochre**, and where they sort. They were placed
  alphabetically and each carries a real section link, but whether they earn
  their place in the index is an editorial call.

Both live in `data/glossary.json` (`editor_expansion` for the notes; the index
entries are regenerated from the glossary by
`build/index_glossary_links.py --apply`). **Edit the JSON, re-run that script,
rebuild the PDF** — do not hand-edit the entries in `index.html`, since the next
run of the script will overwrite them.

## Editorial conventions worth remembering

- The **editor's voice** is visually distinct (an ochre color family, in three
  tiers of emphasis) and is kept deliberately separate from Pharr's own text,
  including in the grayscale print version.
- **Pharr's own footnotes** use a different blue-grey style, so his voice and
  ours never blur together.
- **Cross-references use Pharr's section numbers** (§), never page numbers — so
  they stay stable across both the web and print versions.

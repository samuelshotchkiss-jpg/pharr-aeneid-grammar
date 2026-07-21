# DESIGN.md — Pharr *Aeneid* Grammar: Digital Scholarly Edition

A reference for the project's architecture, conventions, and planned work.
This is a **map, not a build order**: it describes the whole intended system,
including parts not yet built. Each feature is built in its own focused
conversation; this document supplies the shared context so individual task
prompts can stay short and point here.

Sections marked **[settled]** are decided. Sections marked **[open]** are
deferred to their build thread — don't treat them as final, and don't
re-litigate the settled ones without reason.

---

## 1. What this project is

A digital scholarly edition of Pharr's grammatical appendix to the *Aeneid*,
prepared for a 10th-grade Latin class whose students read at roughly grade
level but have substantial gaps in grammar (including English grammar). The
edition adds an editorial layer over Pharr's 1930 text: term glosses,
comprehension aids, and occasional critical-thinking asides in the editor's
voice.

Two outputs are produced from one source:
- an **interactive web page**, and
- a **print-oriented PDF** (for handouts; cost and page count matter).

---

## 2. Single-source architecture **[settled in principle; structure per setup thread]**

The governing goal: **maintain the content once.** Shared content lives in one
place; output-specific presentation and behavior are separate layers over it.

- **Shared core (edit once):** Pharr's text, the editorial notes/boxes/panels,
  the paradigm tables, and the term/glossary data (`pharr_grammatical_terms_N.json`).
- **Web layer:** external CSS + JavaScript (nav panel, tooltips, search). Adds
  interactivity; adds no content.
- **Print layer:** print/paged-media CSS, page-break control, the glossary
  rendered at the back, print-safe color. Adds no content.

**The leak test:** if the same *content* edit ever has to be made in two
places, the architecture has sprung a leak and that content belongs in the
shared core. Output-specific *additions* (e.g. page breaks) are expected and
fine; duplicated *content* is the thing to avoid.

**Cross-references use section (§) numbers, not page numbers.** A grammar is
navigated by paragraph number, and § numbers are part of the content, so they
are identical and stable across both outputs (e.g. "see §290" reads the same on
web and in print). There is no page-reference system to generate; this removes a
whole category of output-specific divergence and is a point in favor of
single-source.

**PDF approach [settled]:** single HTML→PDF pipeline (headless Chrome /
Playwright print), **not** LaTeX. LaTeX would paginate better but breaks
single-source by requiring a second representation of the content; least-
maintenance single-source was chosen as the priority. Accept "good with clean
row-breaks and repeated headers" on the largest tables rather than LaTeX-
perfect; special-case an individual table only if it proves unacceptable.

---

## 3. Editorial voice system **[settled]**

The editorial layer must always be visually distinguishable from Pharr's own
text. Established classes:

- `.ed` — inline gloss / one-line aside (italic ochre).
- `.edbox` — light note box (soft background, 4px rule); `.edbox b` for upright
  labels.
- `.edpanel` — heavy panel (fuller background, 5px rule) with `.edpanel-h`
  title and `.edpanel-key` keyword.
- (Pharr's own notes use a separate blue-grey treatment; **ochre is reserved
  for the editor's voice** and must stay exclusive to it.)

Existing panels include a front-matter "How to read this edition," a "Finite
and Infinite Forms" panel between §115–116, and a defective-verbs edpanel.
Editorial asides are deliberately conservative and occasionally flippant
(e.g. the §409 caesura note), inviting critical thinking. "Mr. Hotchkiss" in
such notes is the editor referring to himself in the third person — an
intentional deflationary device, never an external attribution.

---

## 4. Term / glossary data **[settled]**

`pharr_grammatical_terms_N.json` is the single source for all definitions. Per
term it records: the term and its variants; domain/parent; whether Pharr
defines it; the definition and its source (Pharr's or editor's); Pharr's
definition location and/or the editorial insertion point; and the in-situ
note decision and rationale. A single `definition` field holds whichever
definition applies, distinguished by `definition_source`; Pharr entries are
read-only. This JSON feeds **both** the web tooltips and the printed glossary.

**Variants.** A term's `variants` field is a **semicolon-separated** list of
the forms that count as the same term (e.g. `appositive; appositional`,
plus paradigm abbreviations like `Nom.`/`Subj.`). The web layer's match set for
a term is its `term` plus those variants; this is the single source for "what
counts as the same term" in term-search and tooltips.

**Subclasses.** Some entries also carry a `subclasses` field: a list of
`{name, section}` objects naming the specific constructions/uses that fall under
the headword (e.g. the ablative's *ablative of means* §331, the subjunctive's
*jussive* §254). A structural pass split these **out of** `variants`, so
`variants` now means *true variants only* (alternate forms that are the same
term for matching) while `subclasses` holds the named sub-constructions with
their own § locations. The web tooltip (§5c) renders an entry's subclasses as a
clickable list after the definition, each linking to its section. Subclasses are
**not** separately term-matched in the body text: where the headword is part of
the phrase (*ablative* of means) it is already clickable, and every body
occurrence of a subjunctive sub-use (*jussive*, *hortatory*, …) sits beside a
clickable *subjunctive* — so the popup list is the single discovery path (ruled
in the §5c tooltip thread). Removing a string from `variants` to `subclasses` therefore
also drops its standalone clickability — intended for *accusative and infinitive*.

**Delivery / loading [settled].** Two distinct things power search, and only
one needs this file:
- The **full-text index** (free-text search + the §5d results page) is built at
  load time from the live document — no data file, no fetch — so it works
  whether the page is opened as a file or served.
- The **term database** (`data/glossary.json`) is loaded by the web layer for
  the term-aware features (`openTerm` "all instances", and the §5c tooltips).
  It is `fetch`ed with `cache:'no-cache'` (so an edit shows up on reload), which
  means the edition **must be served over http(s)** — browsers block `fetch` of
  a local file, so a `file://` open has a working frame but no term lookups. A
  failed load (file://, missing/malformed file, server down, or a script-blocking
  browser extension) surfaces a plain "term list didn't load" notice rather than
  empty results. If the edition ever needs to run as loose double-click files,
  switch loading to a generated `data/glossary.js` sidecar
  (`window.PHARR_GLOSSARY`, included via `<script>`, with `fetch` as fallback) —
  keeps the JSON canonical, adds a small regenerate-on-edit build step. The
  loader contract itself (`window.PharrSearch`) is in §8 / the search-page thread.

---

## 5. Web layer **[feature specs settled; implementation per build threads]**

Built in separate thread-sized pieces, in dependency order. The CSS separation
(foundational refactor) comes first and must be content-neutral.

### 5a. Navigation panel
Left side of the screen, **minimizable**. Search bar at top, table of contents
below. A **mobile variant is always minimized**; tables and other content must
remain legible on mobile as well as desktop.

### 5b. Search bar behavior
Defaults to displaying the **index** contents as a dropdown. Pressing Enter
runs a standard full-text search of the page. (See also the search page, 5d.)

### 5c. Grammatical tooltips
At each occurrence of a term or its variants, the user can click the word to
get a popup showing that term's full glossary definition.
- Clickability is **invisible or only faintly visible** so as not to disturb
  the existing emphasis hierarchy; **hover highlighting** signals selectability.
- The tooltip has a close **×**, but clicking **anywhere else** also closes it.
- Generously sized while keeping the rest of the page visible; **scrolls** if
  the definition is long.
- The definition includes: a link to Pharr's definition location (if he defines
  the term), a link to the editorial insertion point (if we defined it), an
  optional editor's expansion of a terse Pharr definition (`editor_expansion`,
  ochre voice), a clickable list of the entry's `subclasses` (each linking to
  its § section), and an option to open a search showing **all instances** of
  the term and its variants.
- **Polysemy is a judgment problem [open — needs editor rulings]:** many
  grammatical terms are also ordinary English words ("voice," "mood," "case,"
  "person," "number," "perfect"). Auto-linking every occurrence will produce
  false tooltips. The term-detection should **propose** ambiguous occurrences
  for the editor to rule on, and/or use a stoplist of known-polysemous terms
  linked only at genuine technical uses. This must not be fully automated.

### 5d. Search page
Opens from the tooltip's "all instances" option (and reachable from the nav
search). Shows all occurrences of a term and its variants in the text.

---

## 6. Print layer **[approach settled; page-break tuning open]**

### 6a. Page count
Was 77 pages at last conversion; **now 99** (pre-glossary, as of the print-layer
build). 100 pages is a **soft** target (color-printing cost; not intimidating
students), **not a hard cap** — the glossary (§6d) is worth exceeding it.
Recount anytime by reading the rendered PDF's page total (`pypdfium2`).

### 6b. Pagination via CSS paged media
- `break-inside: avoid` to keep tables and titled boxes from splitting.
- `break-after: avoid` on headings to prevent orphaned titles at page bottom.
- `break-before` to start major sections fresh.
- Large multi-page verb tables: aim for clean **row-boundary** breaks with the
  **header row repeated** on continuation. Fine break placement is **[open]**
  and where HTML is weakest; don't over-invest.

### 6c. Color translation **[principle settled]**
The print stylesheet has **two distinct jobs**, not a blanket desaturation:
- **Translate functional color** (paradigm tables — singular/plural,
  term-highlighting): the color there is for clarity and is easy to swap for a
  print-clear equivalent (patterns, weights, rules, or a restrained scheme).
- **Preserve editorial-voice color with redundancy:** the ochre voice
  distinction *must survive print*, including a likely **grayscale photocopy**.
  Keep ochre (or a print-safe near-ochre that stays distinct in CMYK and in
  grayscale) **and** back it with a non-color channel (ruled margin/sidebar,
  italic + indent, a labeled "Editor's note" rule) so the voice distinction is
  **redundantly encoded** and never depends on color alone.

### 6d. Glossary
The term JSON is rendered as a glossary in the back matter, placed **after the
body text and before the back-of-book index** (the reference glossary precedes
the locator index). Built print-only at render time from `data/glossary.json`
through the shared mini-markup parser; see the glossary build thread.

---

## 7. Working conventions **[settled]**

- **Version control by git**, not filename incrementing. Commit at meaningful
  points; use diffs as the record of what changed. (This replaces the old
  per-chat upload/download/rename workflow now that development is in Claude
  Code against a persistent tree.) The tree now has a GitHub remote (`origin`),
  and **pushing `main` auto-publishes the live site** (GitHub Pages) as well as
  backing the work up offsite — so a local commit hands off between sessions,
  and a push is the publish/backup step. Hosting + licensing details:
  `PROJECT-STATUS.md` and `COPYRIGHT.md`.
- **Content-neutral refactors must be provably content-neutral:** verify by
  diff that only structure/location changed, not rendered output. (Parsed-
  content comparison, not raw-file comparison — raw files are *meant* to
  differ on a refactor.)
- **One focused work stream per conversation.** Decompose work into
  thread-sized tasks in dependency order; run one per session. A "layer" may be
  several threads (the web layer alone is nav / tooltips / search). Threads run
  as separate, parallel Claude Code sessions — switched from the desktop sidebar,
  each with its own transcript — rather than `/clear`-ing one chat between them.
  All sessions share one working folder and commit to `main`, so keep concurrent
  threads on non-overlapping files and commit at meaningful points.
- **Work in reviewable increments with verification between them**, not one
  giant rewrite.
- **Don't rebuild what exists.** Preserve established class names and the
  editorial system; extend rather than duplicate.
- **Propose-then-rule for judgment-laden passes** (tooltip polysemy, anything
  touching the editor's voice or scholarly stance): surface candidates with
  rationale; the editor decides.

---

## 8. Build order (dependency-ordered; each its own thread)

1. **[done]** Project setup + structure recommendation.
2. **[done]** CSS separation (content-neutral foundational refactor) — core /
   web / print layers split and linked.
3. **[done]** Web: navigation panel (5a) + search bar dropdown behavior (5b) —
   `js/nav.js` + web-layer CSS; ToC derived from the live headings.
4. **[done]** Web: grammatical tooltips (5c) — `js/tooltips.js`, runtime
   web-layer (no content-core edits); glossary-driven detection (first
   occurrence per section per link-key, distinct variants get their own link
   bar the subjunctive sub-uses), editor-ruled polysemy stoplist, popup with
   definition + §-location links + "all instances". Headings/titles and table
   cells are eligible; Latin/glosses/section-nums/back-index/anchors are not.
   Opens the §5d page via `window.PharrSearch.openTerm(term)`. (Follow-up:
   add label abbreviations — Nom./Subj./sg. … — to glossary `variants` so
   abbreviated paradigm-cell labels resolve.)
5. **[done]** Web: search page (5d) — `window.PharrSearch` modal; all
   occurrences of a query or a term's variant set, grouped by section and
   navigable to each occurrence. Shared by the nav bar (5b) and the tooltips
   (5c). Contract: `openQuery(text)` / `openTerm(term)` (term = canonical
   `term` string from `glossary.json`; variants resolved there); deep links
   `#find=<text>` and `#all=<term-slug>`.

   5e. **[done]** Web: **glossary deep links (`#term=<slug>`)** — a glossary
   entry openable by URL, with no in-text occurrence to anchor to (pinned
   near the top of the viewport). Built for an **outside consumer**: the ECE
   dictionary tags grammatical terms in its definitions and links here, so a
   student reading *ūtor* "with the ablative" can reach the ablative entry.

   **Why the entry and not a §.** The entry is the *hub* — Pharr's definition,
   the editor's expansion, and the **Kinds** menu, each Kind already pointing
   at its §. §30 alone ("the case of adverbial relation") answers no question a
   student who is lost actually has. Sections are the spokes; a link that
   commits to one spoke commits to a claim about which construction is at play,
   and usually can't know.

   **TWO MODES, and the difference is behavioral, not decorative.** *Annotation*
   (clicked in the text) is subordinate to a visible word: it sits beside it,
   wears no frame, and light-dismisses, because getting out of the way is its
   job. *Landing* (arrived by URL) has no word on screen — the panel is the whole
   reason the reader is here. Every affordance the annotation gets right becomes
   a lie, and one of them bites: **light-dismiss destroys the only thing they
   came for and strands them at the top of a 3,000-line appendix with no way back
   but a reload.** So the landing gets a dimmed backdrop, a full frame, a
   "Glossary" eyebrow, `aria-modal`, focus, and **no dismissal on an outside
   click at all** — not even on the backdrop. The argument that a click on a dim
   overlay is "obviously deliberate" was tried and was wrong (editor, 2026-07-21):
   it is the same reflex that loses the panel, and losing it is the entire
   failure this mode exists to prevent. The ways out are the corner ×, a labelled
   **Close** in the actions row, and Escape — each aimed at the panel rather than
   at the page. `setMode()` is the single switch, so the two modes cannot drift
   apart.

   Contract: `window.PharrGloss.openTerm(slug)` → bool · `.slug(text)` (the
   canonical slug function, so a consumer derives ids the same way) · `.has()`
   · `.close()`. Slugs are **derived, never authored** — folding + lowercase +
   hyphens — and resolve in priority order against the canonical `term`, a
   `variants` entry, then a **`subclasses` name**. A subclass resolves to its
   *parent* entry with that Kind marked: the narrow section assumes the student
   already knows what an ablative is, which is the assumption that sent them
   looking. An unresolvable slug renders a visible "no such entry" state —
   never a silent no-op, because the links are written in another repo.
6. **[done]** Print: paged-media CSS + color translation (6b, 6c) —
   Playwright/Chromium pipeline (`build/render_pdf.py`), grayscale-safe
   all-sans typography with the editorial voice redundantly encoded, and
   paged-media break rules (titles kept with their tables, repeated table
   headers, no forced section breaks). Print is fully neutral except the
   editorial ochre, which is retained.
7. Print: glossary rendering from JSON (6d).
8. **[done]** Current page-count conversion (6a) — 99 pages (pre-glossary).

**In progress (emergent — not in the original order): Mobile / responsive
legibility.** A screen-only pass (≤820px) that collapses the wide paradigm
tables and multi-column conjugations, adds sticky case-label columns, and fits
oversized tables so the page reads without horizontal panning on phones. It
began as the §5a "must stay legible on mobile" requirement and grew into its own
thread; it edits `index.html` table markup plus core/web CSS (and touches
`js/nav.js`). Status and specifics live in the **"Mobile:"** commit series, not
here.

**Approved, not yet done (editor, 2026-07-21) — add the Kinds a *dictionary*
needs.** The Kinds menus omit exactly the sections an incoming `#term=` link
wants: `ablative` has no **§342** (Ablative with Special Verbs — Pharr names
*ūtor, fruor* there) and no **§339** (Ablative with Prepositions); `dative` has
no **§297** (Special Verbs) and no **§298** (Compounds); `genitive` has **no
Kinds at all**, though **§288** and **§289** use *meminit malōrum* and *miserēre*
as their own examples.

**Why this is an addition and not a reversal:** the menus were curated, but
LLM-curated, and curated to clarify *Pharr's text*. The dictionary is a new
purpose, and it asks a different question of the same data — so the omission was
never a ruling against these sections. (Editor's call, recorded because a
successor will otherwise read the curated list as deliberate exclusion.)

**Sequenced after** the vocabulary toolkit's prose-tagging sweep, so the full
population of incoming links is known before their targets are tuned.

**Logged, not urgent (editor, 2026-07-21) — break the cases out in the table of
contents.** The ToC lists "Cases" as one syntax section; with the Kinds menus now
complete (62 constructions across four cases), a reader who wants the ablative has
to know it lives inside a block whose only label is "Cases". Listing nominative,
genitive, dative, accusative, ablative, vocative and locative as their own ToC
entries would match how the glossary now behaves. Deferred: it touches `nav.js`'s
ToC derivation, which reads the live headings.

**Next for the glossary (editor, 2026-07-21) — reach a Glossary entry from
*inside* this app, as the ultimate failsafe.** Today a landing (§5e) is only
reachable from an inbound `#term=` link: close it, or arrive with a typo, and
there is no way back except editing the URL. Two parts:

- **The search bar should find glossary entries**, so any term is reachable
  without leaving the appendix. This is what makes the landing recoverable, and
  it is why nothing else about the landing needs to defend against dismissal.
- **Glossary entries should appear in the back-of-book index**, with their own
  markup distinguishing them from ordinary index entries.

**The hard part is the overlap**, and it wants a clear, elegant answer rather
than a merge: an index entry points at *occurrences in Pharr's text*, while a
glossary entry is *a definition of the term itself* — often for a term Pharr
uses without defining. The same word will legitimately want both, and the reader
must be able to tell which is which and why they might want the other.

Deferred / future: a possible student-facing rewrite of Pharr's own
(sometimes sparse or old-fashioned) definitions; any further content passes.

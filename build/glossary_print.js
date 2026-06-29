/* =========================================================================
   glossary_print.js -- build the PRINT glossary from data/glossary.json.

   PURPOSE (DESIGN.md §6d, build order item 7)
   -------------------------------------------
   The single term database (data/glossary.json) is rendered as an alphabetical
   glossary appended to the END of the print PDF. This module runs in the
   Chromium PAGE context during the PDF render (build/render_pdf.py injects it
   after load and calls window.PharrBuildPrintGlossary). It is PRINT-ONLY: the
   web edition's index.html never loads it, so the screen output is untouched.

   SINGLE SOURCE, NO DRIFT
   -----------------------
   - Content comes ONLY from glossary.json (the canonical term database). No
     glossary content is authored into index.html; the body is not changed.
   - Definition text is rendered through the SHARED mini-markup parser
     (js/defmarkup.js -> window.PharrDefMarkup): [[term]] -> <span class="term">,
     <<Latin>> -> <span class="la">. The web tooltip and this print glossary use
     the one parser, so they cannot drift. Markup is built with createElement /
     textContent only -- never innerHTML -- exactly as in the web path.

   WHAT IT RENDERS (per the build prompt)
   --------------------------------------
   - Grammatical terms only. domain == "rhetoric" is EXCLUDED: Pharr's §411-447
     rhetorical-figures section is already a glossary, so re-glossing duplicates.
   - Alphabetical by term. Each entry: headword, alternate labels (true
     variants), source-marked definition, primary § location, and -- for entries
     that carry them -- a §-cross-referenced list of subclasses (named uses).
   - Editorial definitions are marked distinctly from Pharr's (keyed off
     definition_source) with a redundant, grayscale-safe signature: an "Editor"
     label + an ochre left bar (styling lives in css/print.css §6d).
   - True variants appear as "(also ...)" on the entry AND as "see" pointers
     interfiled at their own alphabetical position (e.g. "substantive -- see
     noun"). Only meaningful variants get a pointer: plurals, abbreviations, and
     adjacent-sorting suffix forms are filtered out (they'd be alphabetical
     noise next to the headword).
   - § cross-references render as text that is ALSO a live internal link
     (#s<N>): reads on paper, clickable in the on-screen PDF. § numbers, never
     page numbers (settled convention).
   ========================================================================= */
(function (root) {
  'use strict';

  var EXCLUDE_DOMAINS = { rhetoric: true };

  /* ---- helpers ---------------------------------------------------------- */

  function norm(s) { return String(s == null ? '' : s).toLowerCase().trim(); }

  // Section string ("§331", "§394a", "§128.6") -> bare integer anchor "331".
  // Sub-letters/decimals resolve to the integer section anchor (id="s<N>"),
  // matching how the body and back-index link (e.g. text "394a" -> #s394).
  function secNum(s) {
    if (!s) return null;
    var m = String(s).match(/(\d+)/);
    return m ? m[1] : null;
  }

  // Slug for entry ids / see-target links. Terms are unique, so slugs are too.
  function slug(term) {
    return 'gloss-' + norm(term)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip macrons/accents
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // A § link: text label that is also a live internal anchor link.
  function secLink(doc, label, ref) {
    var n = secNum(ref);
    if (!n) { var sp = doc.createElement('span'); sp.textContent = label; return sp; }
    var a = doc.createElement('a');
    a.className = 'g-sec';
    a.setAttribute('href', '#s' + n);
    a.textContent = label;
    return a;
  }

  /* ---- variant handling ------------------------------------------------- *
     Two independent decisions, deliberately NOT conflated:

     (a) ALTERNATE LABELS shown on the headword -- "(also ...)". Inclusive: we
         list every listed variant EXCEPT noise that adds nothing to read:
           - abbreviations (contain ".")            -- Nom., sg., Perf.
           - parenthetical annotations (contain "(") -- editorial notes, not
             clean lemmas (e.g. "infinitives (in Pharr's broad sense)")
           - plurals / short inflections, of the headword OR of an already-kept
             variant (so "substantive" stays but "substantives" / "nouns" go).
         These survivors are candidateVariants(); the FULL set is shown in the
         parenthesis -- so e.g. predicate substantive / attribute / nominative
         all appear under "predicate noun".

     (b) "see" POINTERS from a variant's own alphabetical slot. A pointer only
         earns its place if it lands AWAY from its headword -- if scanning the
         alphabet you'd hit the headword anyway, the pointer is noise. Concretely
         (in build()): drop the pointer when NO other entry sorts between the
         variant and its headword (immediate neighbours). So "substantive" (far
         from "noun") keeps its pointer; "predicate substantive" (right beside
         "predicate noun") and "concessive" (just before "concessive clause")
         do not; "degrees of comparison" (entries intervene before "comparison")
         does. This is purely positional -- no lemma is privileged over another.   */

  // Plural / short-suffix relation: one string is a prefix of the other and at
  // most 3 chars longer (case/cases, substantive/substantives, clause/clauses).
  // NOT a 4-char-prefix fuzzy match -- that would wrongly fuse distinct sibling
  // labels like "predicate attribute" and "predicate substantive".
  function isInflection(a, b) {
    a = norm(a); b = norm(b);
    if (a === b) return true;
    var s = a.length <= b.length ? a : b;
    var l = a.length <= b.length ? b : a;
    return l.indexOf(s) === 0 && (l.length - s.length) <= 3;
  }

  function candidateVariants(entry) {
    var vs = String(entry.variants || '').split(';')
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .filter(function (v) { return v.indexOf('.') === -1; })          // abbreviations
      .filter(function (v) { return v.indexOf('(') === -1; })          // annotations
      .filter(function (v) { return !isInflection(entry.term, v); });  // plural of headword
    var out = [];
    vs.forEach(function (v) {
      if (!out.some(function (k) { return isInflection(k, v); })) out.push(v); // plural of a kept variant
    });
    return out;
  }

  /* ---- entry rendering -------------------------------------------------- */

  function renderEntry(doc, entry) {
    var DM = root.PharrDefMarkup;
    var isEd = entry.definition_source === 'editor';

    var el = doc.createElement('div');
    el.className = 'g-entry' + (isEd ? ' g-editorial' : '');
    el.id = slug(entry.term);

    // headword line: term  (also ...)  [Editor|Pharr · §loc]
    var head = doc.createElement('div');
    head.className = 'g-head';

    var term = doc.createElement('span');
    term.className = 'g-term';
    term.textContent = entry.term;
    head.appendChild(term);

    var alts = candidateVariants(entry);
    if (alts.length) {
      var alt = doc.createElement('span');
      alt.className = 'g-alt';
      alt.textContent = ' (also ' + alts.join(', ') + ')';
      head.appendChild(alt);
    }

    // source + primary location tag (grayscale-safe: the WORD carries it)
    var tag = doc.createElement('span');
    tag.className = 'g-src' + (isEd ? ' g-ed' : '');
    tag.appendChild(doc.createTextNode(isEd ? 'Editor' : 'Pharr'));
    var loc = entry.definition_location || entry.insertion_point || '';
    if (secNum(loc)) {
      tag.appendChild(doc.createTextNode(' · '));
      tag.appendChild(secLink(doc, '§' + secNum(loc), loc));
    }
    head.appendChild(tag);
    el.appendChild(head);

    // definition -- THROUGH THE SHARED PARSER (never innerHTML)
    var def = doc.createElement('div');
    def.className = 'g-def';
    def.appendChild(DM.toFragment(entry.definition || '', doc)); // may throw -> fail loudly
    el.appendChild(def);

    // subclasses: §-cross-referenced list of named uses (e.g. ablative's uses)
    var subs = entry.subclasses || [];
    if (subs.length) {
      var box = doc.createElement('div');
      box.className = 'g-subs';
      var lbl = doc.createElement('span');
      lbl.className = 'g-subs-h';
      lbl.textContent = 'Particular uses: ';
      box.appendChild(lbl);
      subs.forEach(function (sc, i) {
        var n = secNum(sc.section);
        var item = doc.createElement(n ? 'a' : 'span');
        item.className = 'g-sub';
        if (n) item.setAttribute('href', '#s' + n);
        item.appendChild(doc.createTextNode(sc.name + ' '));
        var sn = doc.createElement('span');
        sn.className = 'g-sub-sec';
        sn.textContent = '§' + (n || sc.section);
        item.appendChild(sn);
        box.appendChild(item);
        if (i < subs.length - 1) box.appendChild(doc.createTextNode(' ')); // em space
      });
      el.appendChild(box);
    }

    return el;
  }

  function renderSee(doc, fromLabel, toEntry) {
    var el = doc.createElement('div');
    el.className = 'g-see';
    var t = doc.createElement('span');
    t.className = 'g-term g-see-term';
    t.textContent = fromLabel;
    el.appendChild(t);
    el.appendChild(doc.createTextNode(' '));
    var see = doc.createElement('span');
    see.className = 'g-see-word';
    see.textContent = 'see ';
    el.appendChild(see);
    var a = doc.createElement('a');
    a.className = 'g-see-to';
    a.setAttribute('href', '#' + slug(toEntry.term));
    a.textContent = toEntry.term;
    el.appendChild(a);
    return el;
  }

  /* ---- top-level build -------------------------------------------------- */

  function build(data, opts) {
    opts = opts || {};
    var doc = root.document;
    if (!root.PharrDefMarkup) throw new Error('PharrDefMarkup parser not loaded');

    var entries = (data || []).filter(function (e) {
      return e && e.term && !EXCLUDE_DOMAINS[e.domain];
    });

    var cmp = function (a, b) {
      return a.localeCompare(b, 'en', { sensitivity: 'base' });
    };

    // Sorted keys of the real entries, for the pointer-adjacency test (b).
    var entryKeys = entries.map(function (e) { return norm(e.term); }).sort(cmp);

    // True when NO entry sorts strictly between two keys -- they are immediate
    // alphabetical neighbours with nothing of their own to scan past.
    function noEntryBetween(k1, k2) {
      var lo = cmp(k1, k2) <= 0 ? k1 : k2;
      var hi = cmp(k1, k2) <= 0 ? k2 : k1;
      return !entryKeys.some(function (k) { return cmp(k, lo) > 0 && cmp(k, hi) < 0; });
    }

    // Build a unified alphabetical sequence: definition entries + "see" rows.
    // Every entry shows its full label set (a). A variant earns a "see" row only
    // when it sorts AWAY from its headword (b: an entry sorts between them) -- and
    // when several of one entry's pointers cluster together (mutually adjacent,
    // nothing between them), only the shortest survives, so look-alike phrase
    // forms collapse to their general lemma (e.g. "contracted perfects" /
    // "contracted verb forms" fold into "contracted"), while genuinely distant
    // siblings (direct object / indirect object) each keep their pointer.
    var items = [];
    entries.forEach(function (e) {
      var ek = norm(e.term);
      items.push({ key: ek, kind: 'entry', entry: e });

      var ptrs = candidateVariants(e)
        .filter(function (v) { return !noEntryBetween(norm(v), ek); })
        .sort(function (a, b) { return a.length - b.length || cmp(norm(a), norm(b)); });
      var kept = [];
      ptrs.forEach(function (v) {
        if (!kept.some(function (k) { return noEntryBetween(norm(v), norm(k)); }))
          kept.push(v);
      });
      kept.forEach(function (v) {
        items.push({ key: norm(v), kind: 'see', label: v, entry: e });
      });
    });
    items.sort(function (a, b) {
      var c = cmp(a.key, b.key);
      return c !== 0 ? c : (a.kind === 'entry' ? -1 : 1);
    });

    // container
    var sec = doc.createElement('section');
    sec.className = 'glossary';
    sec.id = 'glossary';

    var h = doc.createElement('h2');
    h.className = 'h2 g-title';
    h.id = 'glossary-title';
    h.textContent = 'Glossary of Grammatical Terms';
    sec.appendChild(h);

    var intro = doc.createElement('p');
    intro.className = 'g-intro';
    intro.textContent =
      'Definitions marked “Editor” were written for this edition; the ' +
      'rest are Pharr’s own. A section mark (§) is a live link into the ' +
      'text. Pharr’s rhetorical figures (§§411–447) form their ' +
      'own glossary in the body and are not repeated here.';
    sec.appendChild(intro);

    var list = doc.createElement('div');
    list.className = 'g-list';
    items.forEach(function (it) {
      list.appendChild(it.kind === 'entry'
        ? renderEntry(doc, it.entry)
        : renderSee(doc, it.label, it.entry));
    });
    sec.appendChild(list);

    // append at the very end of the document, inside .page so it inherits the
    // page's width/typography (the back-index is the last child of .page today).
    var host = (opts.host && doc.querySelector(opts.host)) ||
               doc.querySelector('.page') || doc.body;
    host.appendChild(sec);

    return {
      entries: entries.length,
      sees: items.filter(function (i) { return i.kind === 'see'; }).length
    };
  }

  root.PharrBuildPrintGlossary = build;
})(typeof self !== 'undefined' ? self : this);

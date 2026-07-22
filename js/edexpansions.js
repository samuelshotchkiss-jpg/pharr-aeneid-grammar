/* =========================================================================
   edexpansions.js -- render editor_expansion inline, as an .edbox, at the
   section the term is defined in. SHARED by the web layer and the print build.

   WHY THIS EXISTS. An `editor_expansion` normally reaches the reader through
   the glossary: the tooltip on screen (§5c) and the printed glossary at the back
   (§6d). Seven terms cannot use that route -- `domain: "rhetoric"` is excluded
   from the printed glossary on purpose, because Pharr's §411-447 figures section
   is already a glossary and re-glossing it would duplicate the whole thing. So
   those seven expansions reached the tooltip and NOTHING ELSE: nowhere in print,
   and nowhere in the body a reader is actually reading.

   WHY NOT REWRITE THEM AS in_situ NOTES. That was the first proposal and it was
   wrong. An in_situ note is a parenthesis inside Pharr's own sentence -- §312's
   is twenty words and syntactically embedded. These seven run 37-58 words and
   all share a two-part shape: an ENGLISH ANALOGUE first ("fair is foul, and foul
   is fair"; "the team ARE arguing"; "I like coffee, she tea"), then a walk
   through Pharr's own Latin. Compressing that into a parenthesis would delete
   the English half, which is the half that teaches. The cost of the rewrite was
   not effort; it was content. (Editor's call, 2026-07-21.)

   WHY NOT AUTHOR THE BOXES INTO index.html. Cheapest option, and it trips the
   leak test in DESIGN.md §2: the same prose would then live in glossary.json AND
   in the body, and the next edit would have to be made twice. Rendering from the
   single source keeps that impossible.

   THE RULE -- one persistent home per expansion, so nothing is said twice:
     in the printed glossary  -> the entries the glossary carries (17)
     inline here, as an edbox -> the entries it excludes (7, all rhetoric)
     the tooltip              -> either, on demand
   Generalising this to all 24 would put the ablative's expansion in the body,
   the glossary AND the tooltip. So it is deliberately scoped by that rule and
   not by domain.

   Definitions render through the SAME shared parser as everywhere else
   (js/defmarkup.js), so the three surfaces cannot drift, and malformed markup
   fails loudly rather than mis-rendering.
   ========================================================================= */
(function (root) {
  'use strict';

  // An expansion is rendered inline exactly when the printed glossary will NOT
  // carry it. Kept as one predicate so the two files cannot disagree about who
  // is responsible for a given term.
  var GLOSSARY_EXCLUDES = { rhetoric: true };

  function secNum(s) {
    if (!s) return null;
    var m = String(s).match(/(\d+)/);
    return m ? m[1] : null;
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* Build one .edbox for an entry, or null if it has nothing to say. */
  function buildBox(doc, entry) {
    var DM = root.PharrDefMarkup;
    if (!DM || !DM.toFragment) throw new Error('PharrDefMarkup parser not loaded');
    var exp = (entry.editor_expansion || '').trim();
    if (!exp) return null;

    var box = doc.createElement('div');
    box.className = 'edbox edbox-exp';
    box.id = 'edexp-' + slug(entry.term);

    var label = doc.createElement('b');
    label.textContent = entry.term + '. ';
    box.appendChild(label);
    box.appendChild(DM.toFragment(exp, doc));   // may throw -> fail loudly
    return box;
  }

  /* Insert after the .sec block that carries the term's definition section, so
     the box follows Pharr's own sentence rather than interrupting it. */
  function placeAfter(doc, n) {
    var stub = doc.getElementById('s' + n);
    if (!stub) return null;
    var node = stub;
    // the section body may be the element itself or the next block along
    if (!node.classList || !node.classList.contains('sec')) {
      var probe = node.nextElementSibling;
      while (probe && !(probe.classList && probe.classList.contains('sec'))) {
        probe = probe.nextElementSibling;
      }
      node = probe || stub;
    }
    return node;
  }

  function build(data, doc) {
    doc = doc || root.document;
    var placed = 0, skipped = 0;
    (data || []).forEach(function (entry) {
      if (!entry || !entry.term) return;
      if (!GLOSSARY_EXCLUDES[entry.domain]) return;          // the glossary has it
      var n = secNum(entry.definition_location || entry.insertion_point);
      if (!n) { skipped++; return; }
      var box = buildBox(doc, entry);
      if (!box) return;
      if (doc.getElementById(box.id)) return;                // idempotent
      var anchor = placeAfter(doc, n);
      if (!anchor || !anchor.parentNode) { skipped++; return; }
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      placed++;
    });
    return { placed: placed, skipped: skipped };
  }

  root.PharrBuildEdExpansions = build;
})(typeof window !== 'undefined' ? window : this);

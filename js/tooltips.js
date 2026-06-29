/* =========================================================================
   tooltips.js -- WEB LAYER (DESIGN.md §5c grammatical tooltips). Adds no
   content: it augments the live DOM at runtime by wrapping selected term
   occurrences in a faint, clickable <span class="gloss-term">, and shows a
   popup with that term's glossary definition on activation. The print layer
   never runs JS, and the wrappers carry no print styling, so the PDF is
   text-identical; index.html is never edited.

   Two phases, kept separate (per the build prompt):
     1. DETECTION -- decide which occurrences become clickable. Driven entirely
        by data/glossary.json (term + ';'-split variants). Editor rulings from
        the detection thread are encoded in the CONFIG block below.
     2. DISPLAY  -- the popup: definition, links to Pharr's definition / the
        editorial insertion point, and "all instances" via PharrSearch.

   "All instances" calls the §5d contract:  window.PharrSearch.openTerm(term)
   with the canonical JSON `term`; variants are resolved on the search side.
   ========================================================================= */
(function () {
  'use strict';

  /* =======================================================================
     CONFIG -- the editor's detection rulings (see commit / DESIGN.md §5c).
     ======================================================================= */

  // Eligibility: an occurrence is NOT clickable inside any of these.
  // (Headings/titles and table cells ARE eligible -- editor ruling: a student
  // shown the "subjunctive" of a verb may need to look the term up there.)
  var INELIG_TAGS = { A: 1, SCRIPT: 1, STYLE: 1, BUTTON: 1 };
  var INELIG_CLASS = {
    sn: 1, secbadge: 1,            // section-number markers (pure numerals)
    la: 1,                         // Latin text -- terms are English
    gl: 1,                         // glosses -- English translations of Latin
    idx: 1, lemma: 1, indexcols: 1,// back-of-book index (reference apparatus)
    scanmarks: 1, legend: 1,       // scansion glyphs; the colour-key legend
    'gloss-term': 1               // never nest inside an existing wrapper
  };

  // Polysemy stoplist: dual-use terms are linked normally EXCEPT where these
  // patterns mark a genuinely ordinary-English use. Keyed by canonical term.
  // Each regex is tested against the host text node; a candidate match that
  // falls inside a stop-hit is skipped. (Counts verified against the corpus.)
  var STOPLIST = {
    'case':                 [/\bin\s+(?:this|that|any|either)\s+case\b/gi],
    'question':             [/\banswers?\s+the\s+question\b/gi,
                             /\banswered\s+the\s+question\b/gi],
    'foot':                 [/\bfeet\s+high\b/gi],      // measurement, not metre
    'voice':                [/\bvoice\s+of\s+the\s+people\b/gi],
    'conditional sentence': [/\bcondition\s+at\s+the\s+time\b/gi],
    // "Part." is the participle abbreviation in the conjugation tables, but
    // "part" is also a common noun. Suppress the abbreviation match where the
    // ordinary word is meant: Pharr's "principal parts", the partitive
    // "part(s) of ...", and adverbial "in part".
    'participle':           [/\bprincipal\s+parts?\b/gi,
                             /\bparts?\s+of\b/gi,
                             /\bin\s+part\b/gi]
  };

  // Extra surface forms to match for a canonical term, beyond JSON variants.
  // ('scanning' is the lone, technical occurrence of the scansion family;
  //  'scan'/'scans' do not occur.)
  var EXTRA_FORMS = { 'scansion': ['scanning'] };

  // Two-voice popup: when an entry carries an optional `editor_expansion`
  // (a student-facing gloss on Pharr's laconic definition), the popup shows
  // Pharr's text first, then this in the editor's ochre voice. Forward-
  // compatible -- a no-op until entries gain the field. Tooltips are digital
  // only, so the print-grayscale redundancy rule (DESIGN.md §6c) does not
  // apply here; ochre alone is fine. (Label is the editor's to rename.)
  var ED_EXPANSION_FIELD = 'editor_expansion';
  var ED_EXPANSION_LABEL = 'In plainer terms';

  // Subclasses: an entry's `subclasses` (list of {name, section}) are specific
  // constructions/uses that were split out of `variants` in the JSON pass. The
  // popup lists them after the definition, each linking to its section. (Label
  // is the editor's to rename.)
  var SUBCLASS_LABEL = 'Kinds';

  /* =======================================================================
     Small helpers
     ======================================================================= */
  var FOLD = (function () {
    var from = 'āēīōūȳăĕĭŏŭ', to = 'aeiouyaeiou', m = {};
    for (var i = 0; i < from.length; i++) m[from[i]] = to[i];
    return function (s) { return s.replace(/[āēīōūȳăĕĭŏŭ]/g, function (c) { return m[c]; }); };
  })();
  var STOPWORDS = { of: 1, the: 1, a: 1, an: 1, and: 1, or: 1, with: 1, 'in': 1, to: 1, by: 1, s: 1 };

  function sigWords(s) {
    var w = FOLD(s.toLowerCase()).replace(/[^a-z\s]/g, ' ').split(/\s+/);
    var out = [];
    for (var i = 0; i < w.length; i++) if (w[i] && !STOPWORDS[w[i]]) out.push(w[i]);
    return out;
  }
  // two words "the same" allowing simple plural / irregular foot~feet
  function wordMatch(a, b) {
    if (a === b) return true;
    if ((a === 'feet' && b === 'foot') || (a === 'foot' && b === 'feet')) return true;
    if (a === b + 's' || a === b + 'es' || b === a + 's' || b === a + 'es') return true;
    if (b.charAt(b.length - 1) === 'y' && a === b.slice(0, -1) + 'ies') return true;
    if (a.charAt(a.length - 1) === 'y' && b === a.slice(0, -1) + 'ies') return true;
    return false;
  }
  // a variant is distinct (own link) iff it adds a content word absent from term
  function isDistinct(term, variant) {
    var tw = sigWords(term), vw = sigWords(variant);
    for (var i = 0; i < vw.length; i++) {
      var matched = false;
      for (var j = 0; j < tw.length; j++) if (wordMatch(vw[i], tw[j])) { matched = true; break; }
      if (!matched) return true;
    }
    return false;
  }
  // link key for a distinct variant: folded + last-word de-pluralised, so e.g.
  // "substantive"/"substantives" and "condition"/"conditions" coincide.
  function distinctKey(form) {
    var w = FOLD(form.toLowerCase()).replace(/\s+/g, ' ').trim().split(' ');
    var last = w[w.length - 1];
    if (last.length > 3 && last.charAt(last.length - 1) === 's' && last.slice(-2) !== 'ss')
      w[w.length - 1] = last.slice(0, -1);
    return w.join(' ');
  }
  function secDigits(loc) { var m = (loc || '').match(/\d+/); return m ? m[0] : ''; }

  // Render JSON-sourced definition text through the shared mini-markup parser
  // (js/defmarkup.js): [[term]] / <<Latin>> become known-safe class spans built
  // from text nodes -- JSON text is NEVER innerHTML'd (DESIGN.md §4; CLAUDE.md).
  // Backstop per the build prompt: malformed markup fails LOUDLY (console + a
  // visible inline error) rather than silently mis-rendering authored content.
  // The standalone validator (build/validate_markup.py) is the primary guard.
  function setMarkup(el, str) {
    el.textContent = '';
    el.classList.remove('gloss-markup-error');
    str = str || '';
    if (!str) return;
    var DM = window.PharrDefMarkup;
    if (!DM || !DM.toFragment) { el.textContent = str; return; }  // parser absent
    try {
      el.appendChild(DM.toFragment(str, document));
    } catch (err) {
      if (window.console && console.error)
        console.error('[defmarkup] ' + (err && err.message) + '\n  in: ' + str);
      el.classList.add('gloss-markup-error');
      el.textContent = '⚠ definition markup error: ' + (err && err.message);
    }
  }

  /* =======================================================================
     PHASE 1 -- detection
     ======================================================================= */
  var ENTRIES = null;          // glossary array
  var MATCHERS = null;         // [{form, low, len, entry, key, isStop}] longest-first
  var BY_TERM = null;          // canonical term -> entry

  function variantForms(e) {
    var out = [e.term];
    if (e.variants) {
      e.variants.split(';').forEach(function (v) {
        v = v.replace(/\s*\([^)]*\)/g, '').trim();
        if (v) out.push(v);
      });
    }
    if (EXTRA_FORMS[e.term]) out = out.concat(EXTRA_FORMS[e.term]);
    return out;
  }

  function buildMatchers(entries) {
    BY_TERM = {};
    var list = [];
    entries.forEach(function (e) {
      BY_TERM[e.term] = e;
      var forms = variantForms(e);
      var seen = {};
      forms.forEach(function (form) {
        var low = form.toLowerCase();
        if (seen[low]) return; seen[low] = 1;
        var key;
        if (form !== e.term && isDistinct(e.term, form)) key = e.term + '' + distinctKey(form);
        else key = e.term;
        list.push({ form: form, low: low, len: low.length, entry: e, key: key });
      });
    });
    // longest first so multi-word variants win over the bare headword
    list.sort(function (a, b) { return b.len - a.len; });
    return list;
  }

  function isWordChar(c) { return /[a-z0-9]/i.test(c) || 'āēīōūȳăĕĭŏŭ'.indexOf(c) >= 0; }

  // ineligible if any ancestor (up to stopEl) is an excluded tag/class
  function ineligible(node, stopEl) {
    for (var p = node.parentNode; p && p !== stopEl.parentNode; p = p.parentNode) {
      if (p.nodeType !== 1) continue;
      if (INELIG_TAGS[p.tagName]) return true;
      var cl = p.classList;
      if (cl) for (var k in INELIG_CLASS) if (cl.contains(k)) return true;
    }
    return false;
  }

  // section bucket: a new bucket starts at each heading and each numbered .sec
  function isBucketStart(node) {
    if (node.nodeType !== 1) return false;
    if (/^H[1-4]$/.test(node.tagName)) return true;
    if (node.classList && node.classList.contains('sec') && node.querySelector &&
        node.querySelector(':scope > .sn')) return true;
    return false;
  }

  var seenKeys;   // Set of bucket+ +key

  function scan(page) {
    seenKeys = {};
    var bucket = 0;
    Array.prototype.forEach.call(page.children, function (child) {
      if (isBucketStart(child)) bucket++;
      if (child.nodeType !== 1) return;
      scanBlock(child, bucket);
    });
  }

  // collect eligible text nodes of a block (document order), then wrap.
  function scanBlock(block, bucket) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !/\S/.test(n.nodeValue)) continue;
      if (ineligible(n, block)) continue;
      nodes.push(n);
    }
    nodes.forEach(function (node) { wrapMatches(node, bucket); });
  }

  // find chosen matches in one text node and wrap them (right-to-left).
  function wrapMatches(node, bucket) {
    var text = node.nodeValue, low = text.toLowerCase();
    // 1) gather every whole-word, non-stoplisted candidate across all matchers
    var cands = [];
    for (var mi = 0; mi < MATCHERS.length; mi++) {
      var m = MATCHERS[mi], from = 0, k;
      while ((k = low.indexOf(m.low, from)) !== -1) {
        from = k + 1;
        var end = k + m.len;
        var before = k > 0 ? text.charAt(k - 1) : ' ';
        var after = end < text.length ? text.charAt(end) : ' ';
        if (isWordChar(before) || isWordChar(after)) continue;   // whole word
        if (inStop(m.entry.term, text, k, end)) continue;
        cands.push({ start: k, end: end, len: m.len, entry: m.entry, key: m.key });
      }
    }
    if (!cands.length) return;
    // 2) earliest first; at a tie the longer form wins (multi-word > headword)
    cands.sort(function (a, b) { return a.start - b.start || b.len - a.len; });
    // 3) greedily claim non-overlapping, first-per-(bucket,key) in doc order
    var chosen = [], claimedEnd = -1;
    for (var ci = 0; ci < cands.length; ci++) {
      var c2 = cands[ci];
      if (c2.start < claimedEnd) continue;            // overlaps a kept match
      var bk = bucket + ' ' + c2.key;
      if (seenKeys[bk]) continue;                     // already linked this key
      seenKeys[bk] = 1;
      claimedEnd = c2.end;
      chosen.push(c2);
    }
    if (!chosen.length) return;
    // wrap from the end so earlier offsets stay valid
    for (var i = chosen.length - 1; i >= 0; i--) {
      var c = chosen[i];
      var after = node.splitText(c.end);            // node keeps [.., c.end)
      var mid = node.splitText(c.start);            // mid = [c.start, c.end)
      var span = document.createElement('span');
      span.className = 'gloss-term';
      span.setAttribute('tabindex', '0');
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', 'Definition of ' + c.entry.term);
      span.setAttribute('data-term', c.entry.term);
      mid.parentNode.replaceChild(span, mid);
      span.appendChild(mid);
      void after;
    }
  }

  function inStop(term, text, s, e) {
    var pats = STOPLIST[term];
    if (!pats) return false;
    for (var i = 0; i < pats.length; i++) {
      pats[i].lastIndex = 0; var mm;
      while ((mm = pats[i].exec(text))) {
        if (s < mm.index + mm[0].length && e > mm.index) return true;
        if (mm.index === pats[i].lastIndex) pats[i].lastIndex++;
      }
    }
    return false;
  }

  /* =======================================================================
     PHASE 2 -- display (the popup)
     ======================================================================= */
  var pop, popTermEl, popSrcEl, popDefEl, popEdEl, popSubEl, popLinksEl, openAnchor = null;

  function buildPopup() {
    pop = document.createElement('div');
    pop.className = 'gloss-pop no-print';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    pop.hidden = true;

    var head = document.createElement('div'); head.className = 'gloss-pop-head';
    popTermEl = document.createElement('span'); popTermEl.className = 'gloss-pop-term';
    popSrcEl = document.createElement('span'); popSrcEl.className = 'gloss-pop-src';
    var close = document.createElement('button');
    close.className = 'gloss-pop-close'; close.type = 'button';
    close.setAttribute('aria-label', 'Close definition'); close.innerHTML = '&times;';
    close.addEventListener('click', closePopup);
    head.appendChild(popTermEl); head.appendChild(popSrcEl); head.appendChild(close);

    popDefEl = document.createElement('p'); popDefEl.className = 'gloss-pop-def';
    popEdEl = document.createElement('div'); popEdEl.className = 'gloss-pop-ed'; popEdEl.hidden = true;
    popSubEl = document.createElement('div'); popSubEl.className = 'gloss-pop-sub'; popSubEl.hidden = true;
    popLinksEl = document.createElement('div'); popLinksEl.className = 'gloss-pop-links';

    pop.appendChild(head); pop.appendChild(popDefEl); pop.appendChild(popEdEl);
    pop.appendChild(popSubEl); pop.appendChild(popLinksEl);
    document.body.appendChild(pop);
  }

  function jumpTo(id) {
    var t = document.getElementById(id);
    if (!t) return;
    closePopup();
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + id);
    t.classList.remove('nav-flash'); void t.offsetWidth; t.classList.add('nav-flash');
    window.setTimeout(function () { t.classList.remove('nav-flash'); }, 1600);
  }

  function linkEl(label, id) {
    var a = document.createElement('a');
    a.href = '#' + id; a.textContent = label;
    a.addEventListener('click', function (ev) { ev.preventDefault(); jumpTo(id); });
    return a;
  }

  function renderPopup(entry) {
    popTermEl.textContent = entry.term;
    var src = entry.definition_source === 'editor' ? "Editor's note" :
              entry.definition_source === 'Pharr' ? 'Pharr' : '';
    popSrcEl.textContent = src;
    if (entry.definition) setMarkup(popDefEl, entry.definition);
    else { popDefEl.classList.remove('gloss-markup-error'); popDefEl.textContent = '(no definition recorded)'; }

    // Optional editor's expansion of Pharr's terse definition (ochre voice).
    var exp = (entry[ED_EXPANSION_FIELD] || '').trim();
    popEdEl.textContent = '';
    if (exp) {
      var lbl = document.createElement('b'); lbl.className = 'gloss-pop-ed-label';
      lbl.textContent = ED_EXPANSION_LABEL;
      popEdEl.appendChild(lbl);
      popEdEl.appendChild(document.createTextNode(' '));
      // editor_expansion is JSON-sourced prose too: render it through the same
      // mini-markup parser (into a span so a markup error scopes to this field).
      var expSpan = document.createElement('span');
      setMarkup(expSpan, exp);
      popEdEl.appendChild(expSpan);
      popEdEl.hidden = false;
    } else {
      popEdEl.hidden = true;
    }

    // Subclasses: clickable list of constructions/uses, each linking to its §.
    popSubEl.textContent = '';
    var subs = Array.isArray(entry.subclasses) ? entry.subclasses : [];
    if (subs.length) {
      var slab = document.createElement('span'); slab.className = 'gloss-pop-sub-label';
      slab.textContent = SUBCLASS_LABEL + ':';
      popSubEl.appendChild(slab);
      var slist = document.createElement('span'); slist.className = 'gloss-pop-sub-list';
      subs.forEach(function (sc) {
        if (!sc || !sc.name) return;
        var id = 's' + secDigits(sc.section);
        var hasAnchor = sc.section && document.getElementById(id);
        var item = document.createElement(hasAnchor ? 'a' : 'span');
        item.className = 'gloss-pop-sub-item';
        item.appendChild(document.createTextNode(sc.name));
        if (sc.section) {
          var secEl = document.createElement('span'); secEl.className = 'gloss-pop-sub-sec';
          secEl.textContent = ' ' + sc.section;
          item.appendChild(secEl);
        }
        if (hasAnchor) {
          item.href = '#' + id;
          item.addEventListener('click', function (ev) { ev.preventDefault(); jumpTo(id); });
        }
        slist.appendChild(item);
      });
      popSubEl.appendChild(slist);
      popSubEl.hidden = false;
    } else {
      popSubEl.hidden = true;
    }

    popLinksEl.textContent = '';
    var loc = secDigits(entry.definition_location), ins = secDigits(entry.insertion_point);
    if (entry.pharr_defines && loc && document.getElementById('s' + loc))
      popLinksEl.appendChild(linkEl('Pharr’s definition (§' + loc + ')', 's' + loc));
    if (entry.definition_source === 'editor' && ins && document.getElementById('s' + ins))
      popLinksEl.appendChild(linkEl('Editor’s note (§' + ins + ')', 's' + ins));

    var all = document.createElement('button');
    all.type = 'button'; all.className = 'gloss-pop-allbtn';
    all.textContent = 'All instances →';
    all.addEventListener('click', function () {
      var term = entry.term;
      closePopup();
      if (window.PharrSearch && window.PharrSearch.openTerm) {
        // returns Promise<boolean>; for a real term it is true. A false means
        // the term DB didn't resolve it -- openTerm already shows its own
        // fallback/notice, so we just let it be.
        try { window.PharrSearch.openTerm(term); } catch (e) {}
      }
    });
    popLinksEl.appendChild(all);
  }

  function positionPopup(anchor) {
    // measure first (it is rendered but off-screen-safe), then place in document
    // coords so it tracks the word on scroll.
    pop.style.left = '0px'; pop.style.top = '-9999px'; pop.hidden = false;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var r = anchor.getBoundingClientRect();
    var gap = 6, margin = 8;
    var left = r.left + window.scrollX;
    left = Math.max(window.scrollX + margin,
           Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - margin));
    var below = r.bottom + window.scrollY + gap;
    var above = r.top + window.scrollY - ph - gap;
    var roomBelow = (r.bottom + gap + ph) <= window.innerHeight;
    var top = roomBelow || above < window.scrollY ? below : above;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function openPopup(anchor) {
    var entry = BY_TERM[anchor.getAttribute('data-term')];
    if (!entry) return;
    openAnchor = anchor;
    renderPopup(entry);
    positionPopup(anchor);
    pop.scrollTop = 0;
  }
  function closePopup() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (openAnchor) { try { openAnchor.focus({ preventScroll: true }); } catch (e) {} }
    openAnchor = null;
  }

  function wire() {
    // delegate activation from any .gloss-term
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.gloss-term');
      if (t) { e.preventDefault(); openPopup(t); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePopup(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement &&
          document.activeElement.classList &&
          document.activeElement.classList.contains('gloss-term')) {
        e.preventDefault(); openPopup(document.activeElement);
      }
    });
    // light-dismiss: a click anywhere outside the popup and not on a term closes
    document.addEventListener('mousedown', function (e) {
      if (pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.gloss-term')) return;
      closePopup();
    });
  }

  /* =======================================================================
     Boot
     ======================================================================= */
  function start() {
    var page = document.querySelector('.page');
    if (!page) return;
    fetch('data/glossary.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (arr) {
        ENTRIES = Array.isArray(arr) ? arr : [];
        if (!ENTRIES.length) return;            // no terms -> no tooltips, page fine
        MATCHERS = buildMatchers(ENTRIES);
        buildPopup();
        scan(page);
        wire();
      })
      .catch(function () { /* term DB unavailable (file://, offline): no tooltips */ });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* =========================================================================
   nav.js -- WEB LAYER entry point (screen behavior; adds no content)
   Builds and injects the left navigation panel (DESIGN.md 5a) and its
   search-bar behavior (5b):
     - Table of contents derived from the live document headings
       (h2.h2 + nested h3.h3) so it can never drift from the content.
     - Search bar that defaults to a dropdown mirror of the existing
       in-page Index (.idx entries, with their real links), and on Enter
       runs a minimal inline full-text search over ALL visible document
       text -- prose, tables, headings/titles, and editorial set-pieces.
   All injected nodes carry .no-print, so the print layer's existing
   `.no-print{display:none}` rule keeps them out of the PDF. Styling lives
   in css/web.css (media=screen). This file edits no shared content; it
   only augments the DOM at runtime.

   The search bar's Enter and the future grammatical tooltips' "all instances"
   link share one target: the §5d search page (window.PharrSearch, below). It
   lists every occurrence of a query, or of a term's whole variant set (variants
   resolved from data/glossary.json), grouped by section and navigable to each
   exact occurrence. Deep-linkable via #find=<text> and #all=<term-slug>.
   ========================================================================= */
(function () {
  'use strict';

  var MOBILE_Q = '(max-width: 820px)';
  var STORE_KEY = 'pharr-nav-collapsed';

  // shared state (assigned in init, used by the §5d search-page functions)
  var searchIndex = null, searchPage = null, spTitle = null, spCount = null, spBody = null;

  function mql() { return window.matchMedia(MOBILE_Q); }
  function isMobile() { return mql().matches; }

  /* ---- small DOM helper ------------------------------------------------ */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (attrs[k] === true) n.setAttribute(k, '');
        else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) {
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  /* ---- navigate + flash a target -------------------------------------- */
  function goTo(id, ev) {
    if (ev) ev.preventDefault();
    var t = document.getElementById(id);
    if (!t) return;
    if (isMobile()) setCollapsed(true);      // overlay: get out of the way
    closeOverlays();
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + id);
    t.classList.remove('nav-flash');
    // reflow so the animation restarts if the same target is chosen twice
    void t.offsetWidth;
    t.classList.add('nav-flash');
    window.setTimeout(function () { t.classList.remove('nav-flash'); }, 1600);
  }

  /* =====================================================================
     Table of contents -- derived from the document's heading structure.
     h2.h2 already carry stable ids; h3.h3 get runtime ids (ids are not
     rendered content, so this stays content-neutral). Regenerated on load,
     so it tracks the content automatically.
     ===================================================================== */
  function buildToc(page) {
    var nav = el('nav', { class: 'nav-toc', id: 'nav-toc', 'aria-label': 'Table of contents' });
    // THREE levels. The h4s were always in the document -- 46 of them -- and the
    // ToC simply never looked at them, so "Cases" was one line covering 70
    // sections and "Moods in Subordinate Sentences" one line covering 37. The
    // things a reader actually searches for (Ablative, Purpose Clauses,
    // Conditional Sentences) were authored as headings and unreachable from the
    // ToC. Nothing is added to the content here; the derivation just reads what
    // was already written.
    var heads = page.querySelectorAll('h2.h2, h3.h3, h4.h4');
    var topList = el('ul', { class: 'toc-l1' });
    var curSub = null, curSub3 = null;
    var seen = {};

    function ensureId(h) {
      if (h.id) return h.id;
      var base = 'h-' + (slug(h.textContent) || 'sec');
      var id = base, i = 2;
      while (seen[id] || document.getElementById(id)) { id = base + '-' + (i++); }
      seen[id] = 1;
      h.id = id;
      return id;
    }

    Array.prototype.forEach.call(heads, function (h) {
      var id = ensureId(h);
      var label = h.textContent.trim();
      var a = el('a', { href: '#' + id, text: label });
      a.addEventListener('click', function (e) { goTo(id, e); });

      if (h.tagName === 'H2') {
        var li = el('li', { class: 'toc-i1' }, [a]);
        curSub = el('ul', { class: 'toc-l2' });
        curSub3 = null;
        li.appendChild(curSub);
        topList.appendChild(li);
      } else if (h.tagName === 'H3') {
        var sub = curSub || topList;          // stray h3 before any h2 (none today)
        var li3 = el('li', { class: 'toc-i2' }, [a]);
        curSub3 = el('ul', { class: 'toc-l3' });
        li3.appendChild(curSub3);
        sub.appendChild(li3);
      } else {
        // An h4 with no h3 above it falls back up the chain rather than being
        // dropped -- §41's "I. Consonant Stems" must not vanish because someone
        // later restructures the heading above it.
        (curSub3 || curSub || topList).appendChild(el('li', { class: 'toc-i3' }, [a]));
      }
    });

    nav.appendChild(topList);
    return nav;
  }

  /* =====================================================================
     Search dropdown -- a filtered live mirror of the in-page Index.
     We read the existing .idx entries (single source) and clone the
     matches so their real #sNN links keep working.
     ===================================================================== */
  /* =====================================================================
     Search normalisation -- maps what the user TYPES onto what's INDEXED.
     Two rules, applied per language because Latin carries its own markup
     (.la words/examples + .hw headwords/lemmas), distinct from English:
       - diacritic-neutral EVERYWHERE: macrons/breves/accents are stripped,
         so a student who can't type "puellā" still finds it as "puella".
       - i<->j and u<->v equivalent only in LATIN runs: editions differ on the
         semivowels, so "iubeo"/"jubeo" and "uides"/"vides" all hit the Latin
         "jubeō"/"vidēs" -- while English "voice" vs "joice" stay distinct.
     Every mapping is single-char -> single-char (the source uses precomposed
     macrons -- verified), so folds are length-preserving: a hit offset in a
     folded string still points at the matching slice of the raw text.
     The non-breaking hyphen (U+2011) in Latin endings folds to "-" so a typed
     "-ōnis" still matches. .la / .hw mark the Latin runs the i/j,u/v rule rides.
     ===================================================================== */
  var DIACRITIC = {
    'ā':'a','ă':'a','â':'a','ä':'a','á':'a','à':'a','ã':'a',
    'ē':'e','ĕ':'e','ê':'e','ë':'e','é':'e','è':'e',
    'ī':'i','ĭ':'i','î':'i','ï':'i','í':'i','ì':'i',
    'ō':'o','ŏ':'o','ô':'o','ö':'o','ó':'o','ò':'o','õ':'o',
    'ū':'u','ŭ':'u','û':'u','ü':'u','ú':'u','ù':'u',
    'ȳ':'y','ŷ':'y','ÿ':'y','ý':'y'
  };
  function foldChar(c, latin) {
    c = c.toLowerCase();
    if (DIACRITIC[c]) c = DIACRITIC[c];
    else if (c === '‑') c = '-';                 // U+2011 -> hyphen-minus
    if (latin) { if (c === 'j') c = 'i'; else if (c === 'v') c = 'u'; }
    return c;
  }
  function foldStr(s, latin) {
    var out = '';
    for (var i = 0; i < s.length; i++) out += foldChar(s[i], latin);
    return out;
  }
  // Is this text node inside Latin-language markup (so the i/j, u/v rule rides)?
  function inLatin(node) {
    return !!(node.parentElement && node.parentElement.closest('.la, .hw'));
  }
  // Fold an element's text into {raw, eng, lat}, char-aligned. eng folds
  // diacritics only; lat additionally folds i/j & u/v, but only in Latin runs.
  function foldElement(elm) {
    var raw = '', eng = '', lat = '';
    var w = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = w.nextNode())) {
      var t = n.nodeValue, latin = inLatin(n);
      for (var i = 0; i < t.length; i++) {
        var c = t[i];
        raw += c;
        eng += foldChar(c, false);
        lat += foldChar(c, latin);
      }
    }
    return { raw: raw, eng: eng, lat: lat };
  }

  function collectIndex(page) {
    var out = [];
    page.querySelectorAll('.indexcols .idx').forEach(function (p) {
      var lemma = (p.querySelector('.lemma') || p).textContent.trim();
      // key = the headword (Latin/topic), so allow the i/j,u/v fold; all = the
      // whole entry, diacritic-fold only (it mixes Latin forms and English).
      out.push({ lemma: lemma, key: foldStr(lemma, true), all: foldStr(p.textContent, false), node: p });
    });
    return out;
  }

  var INDEX_CAP = 60;  // entries rendered at once; typing narrows the rest

  function renderDropdown(box, entries, q) {
    box.textContent = '';
    var qt = q.trim();
    var qEng = foldStr(qt, false), qLat = foldStr(qt, true);
    var matches = entries.filter(function (e) {
      return !qt || e.key.indexOf(qLat) !== -1 || e.all.indexOf(qEng) !== -1;
    });

    if (!matches.length) {
      box.appendChild(el('div', { class: 'nav-dd-empty', text: qt
        ? 'No index entry matches “' + qt + '”. Press Enter to search the full text.'
        : 'The index is empty.' }));
      return;
    }

    var head = el('div', { class: 'nav-dd-head' });
    head.textContent = qt
      ? matches.length + ' index match' + (matches.length === 1 ? '' : 'es')
      : 'Index · ' + entries.length + ' entries — type to filter, or Enter to search the text';
    box.appendChild(head);

    var list = el('div', { class: 'nav-dd-list' });
    matches.slice(0, INDEX_CAP).forEach(function (e) {
      var item = e.node.cloneNode(true);   // keeps the live links
      item.classList.add('nav-dd-item');
      list.appendChild(item);
    });
    box.appendChild(list);

    if (matches.length > INDEX_CAP) {
      box.appendChild(el('div', { class: 'nav-dd-more',
        text: '+' + (matches.length - INDEX_CAP) + ' more — keep typing to narrow' }));
    }
  }

  /* =====================================================================
     Enter search -- inline full-text over ALL visible document text:
     prose (.sec), tables, headings/titles, editorial panels, and the verb /
     scansion set-pieces. The document is flat under .page, so we index each
     content block once. Tables are SIBLINGS of their .sec (not children), so
     a .sec-only walk missed every paradigm and example grid -- this indexes
     them by their own block and anchors each to the section it belongs to.

     Anchor: a block's own id, else the nearest preceding sibling with an id
     (the section anchor). Label: the current section's number (headings show
     a "§" glyph, since they precede their sections). The dense back-of-book
     Index (.indexcols) is left to the dropdown above, so it isn't re-indexed
     here and can't flood the results.

     textContent is viewport-independent, so a block is found whether it's in
     its desktop or collapsed-mobile layout. The mobile layout adds a few
     duplicate STRUCTURAL labels (case copies, § badges); those can only ever
     repeat short labels, never the Latin/English content, so the index stays
     clean. Built once at init (the content is static).
     5d: this whole results view is the placeholder the search page replaces.
     ===================================================================== */
  function buildSearchIndex(page) {
    var idx = [];
    var ctxId = '', ctxLabel = '§', pendingId = '';
    Array.prototype.forEach.call(page.children, function (node) {
      if (node.classList && node.classList.contains('indexcols')) return; // dropdown covers it
      var tag = node.tagName;
      if (node.id) ctxId = node.id;
      else if (pendingId) ctxId = pendingId;

      // a bare anchor stub (span carrying an id but no text) anchors the next block
      if (tag === 'SPAN' && node.id && !node.textContent.trim()) { pendingId = node.id; return; }

      var text = node.textContent;
      if (!text || !text.trim()) { pendingId = ''; return; }
      var f = foldElement(node);                         // {raw, eng, lat}, char-aligned

      if (/^H[1-4]$/.test(tag)) {                        // heading / title
        ctxLabel = '§';                                  // headings precede their §s
        idx.push({ el: node, id: node.id || ctxId, label: '§', raw: f.raw, eng: f.eng, lat: f.lat });
      } else if (node.classList && node.classList.contains('sec')) {
        var sn = node.querySelector('.sn');
        var num = sn ? sn.textContent.replace(/[.\s]+$/, '') : ctxLabel;
        ctxLabel = num;
        idx.push({ el: node, id: node.id || pendingId || ctxId, label: num, raw: f.raw, eng: f.eng, lat: f.lat });
      } else {                                           // table / panel / set-piece / other
        idx.push({ el: node, id: node.id || ctxId, label: ctxLabel, raw: f.raw, eng: f.eng, lat: f.lat });
      }
      pendingId = '';
    });
    return idx;
  }

  /* =====================================================================
     5d -- "all instances" search. Reuses the §5b folding + per-block index:
     finds EVERY occurrence (not just the first per block) of a query, or of a
     term's whole variant set, and groups them by section. Two callers share
     it -- the nav search bar (free text) and the tooltips' "all instances"
     link (a term + its glossary variants). See window.PharrSearch below.
     ===================================================================== */
  function isWordChar(c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'); }

  // all offsets of needle in hay; wholeWord requires non-letter edges (folded
  // text is lowercase ascii, so [a-z0-9] is the word class).
  function findHits(hay, needle, wholeWord, out) {
    if (!needle) return;
    var from = 0, k, n = needle.length;
    while ((k = hay.indexOf(needle, from)) !== -1) {
      var ok = !wholeWord ||
        ((k === 0 || !isWordChar(hay[k - 1])) &&
         (k + n >= hay.length || !isWordChar(hay[k + n])));
      if (ok) out.push({ start: k, len: n });
      from = k + 1;
    }
  }

  // every occurrence of any folded query in one block, overlaps/dups merged
  function occurrencesIn(it, qfolds, wholeWord) {
    var hits = [];
    qfolds.forEach(function (q) {
      findHits(it.eng, q.eng, wholeWord, hits);   // English path (v/j distinct)
      findHits(it.lat, q.lat, wholeWord, hits);   // Latin path (i/j, u/v merged)
    });
    if (!hits.length) return hits;
    hits.sort(function (a, b) { return a.start - b.start || b.len - a.len; });
    var merged = [], end = -1;
    hits.forEach(function (h) { if (h.start >= end) { merged.push(h); end = h.start + h.len; } });
    return merged;
  }

  function searchAll(index, queries, wholeWord) {
    var qfolds = [];
    (queries || []).forEach(function (q) {
      var t = (q || '').trim();
      if (t) qfolds.push({ eng: foldStr(t, false), lat: foldStr(t, true) });
    });
    var groups = [], total = 0;
    if (!qfolds.length) return { groups: groups, total: total };
    for (var i = 0; i < index.length; i++) {
      var occ = occurrencesIn(index[i], qfolds, wholeWord);
      if (occ.length) { groups.push({ entry: index[i], occ: occ }); total += occ.length; }
    }
    return { groups: groups, total: total };
  }

  function makeSnippet(text, at, len) {
    var start = Math.max(0, at - 38), end = Math.min(text.length, at + len + 50);
    // collapse whitespace in the CONTEXT only (table textContent runs cells
    // together with newlines); the matched slice is shown verbatim. Done after
    // slicing, so display tidying never shifts the match offsets.
    var ws = function (s) { return s.replace(/\s+/g, ' '); };
    var frag = document.createDocumentFragment();
    if (start > 0) frag.appendChild(document.createTextNode('…'));
    frag.appendChild(document.createTextNode(ws(text.slice(start, at))));
    frag.appendChild(el('mark', { text: text.slice(at, at + len) }));
    frag.appendChild(document.createTextNode(ws(text.slice(at + len, end))));
    if (end < text.length) frag.appendChild(document.createTextNode('…'));
    return frag;
  }

  /* ---- navigate to one exact occurrence inside its block -------------- */
  // build a DOM Range for [start, start+len) of a block's raw text. The raw
  // string was concatenated from the same SHOW_TEXT walk, so offsets line up.
  function rangeAt(blockEl, start, len) {
    var w = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null, false);
    var n, pos = 0, r = document.createRange(), started = false;
    while ((n = w.nextNode())) {
      var L = n.nodeValue.length;
      if (!started && start < pos + L) { r.setStart(n, start - pos); started = true; }
      if (started && start + len <= pos + L) { r.setEnd(n, start + len - pos); return r; }
      pos += L;
    }
    if (started && n) { r.setEnd(n, n.nodeValue.length); return r; }
    return null;
  }

  function highlightRange(range) {
    if (window.CSS && CSS.highlights && window.Highlight) {       // no DOM mutation
      try {
        CSS.highlights.set('pharr-occ', new Highlight(range.cloneRange()));
        window.setTimeout(function () { try { CSS.highlights.delete('pharr-occ'); } catch (e) {} }, 2400);
        return true;
      } catch (e) {}
    }
    return false;
  }

  function goToOccurrence(blockEl, start, len) {
    if (isMobile()) setCollapsed(true);
    var range = rangeAt(blockEl, start, len);
    if (!range) { if (blockEl.id) goTo(blockEl.id); return; }
    var rect = range.getBoundingClientRect();
    var top = window.scrollY + rect.top - Math.max(64, Math.round(window.innerHeight * 0.32));
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (!highlightRange(range)) {                                 // fallback: flash the block
      blockEl.classList.remove('nav-flash'); void blockEl.offsetWidth; blockEl.classList.add('nav-flash');
      window.setTimeout(function () { blockEl.classList.remove('nav-flash'); }, 1600);
    }
  }

  /* ---- render the search page ----------------------------------------- */
  function groupLabel(lbl) { return /^\d/.test(lbl) ? '§' + lbl : lbl; }

  function renderSearchPage(label, queries, wholeWord) {
    var res = searchAll(searchIndex, queries, wholeWord);
    spTitle.textContent = (wholeWord ? 'All instances of “' : 'Search: “') + label + '”';
    spCount.textContent = res.total
      ? res.total + ' occurrence' + (res.total === 1 ? '' : 's') + ' in ' +
        res.groups.length + ' section' + (res.groups.length === 1 ? '' : 's')
      : 'No occurrences found.';
    spBody.textContent = '';
    spBody.scrollTop = 0;

    if (wholeWord && queries.length > 1) {
      spBody.appendChild(el('div', { class: 'sp-variants', text: 'Forms searched: ' + queries.join(', ') }));
    }
    res.groups.forEach(function (g) {
      var it = g.entry, grp = el('div', { class: 'sp-group' });
      var gh = el('button', { class: 'sp-group-head', type: 'button' }, [
        el('span', { class: 'sp-group-num', text: groupLabel(it.label) }),
        el('span', { class: 'sp-group-count', text: g.occ.length + '×' })
      ]);
      if (it.id) gh.addEventListener('click', function () { closeSearchPage(); goTo(it.id); });
      grp.appendChild(gh);
      g.occ.forEach(function (o) {
        var row = el('button', { class: 'sp-occ', type: 'button' });
        row.appendChild(makeSnippet(it.raw, o.start, o.len));
        row.addEventListener('click', function () { closeSearchPage(); goToOccurrence(it.el, o.start, o.len); });
        grp.appendChild(row);
      });
      spBody.appendChild(grp);
    });
    if (!res.total) {
      spBody.appendChild(el('div', { class: 'sp-empty', text: 'Nothing in the text matches “' + label + '”.' }));
    }
  }

  function openSearchPage(label, queries, wholeWord, hash) {
    if (!searchPage) return;
    renderSearchPage(label, queries, wholeWord);
    searchPage.hidden = false;
    document.body.classList.add('sp-open');
    if (hash) { try { history.replaceState(null, '', '#' + hash); } catch (e) {} }
  }
  function closeSearchPage() {
    if (!searchPage) return;
    searchPage.hidden = true;
    document.body.classList.remove('sp-open');
    if (/^#(find|all)=/.test(location.hash)) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
  }

  // shown when a term lookup is asked for but the term database failed to load
  function showTermsNotLoaded(label) {
    if (!searchPage) return;
    spTitle.textContent = label ? 'All instances of “' + label + '”' : 'All instances';
    spCount.textContent = '';
    spBody.textContent = '';
    spBody.appendChild(el('div', { class: 'sp-error',
      text: 'The term list didn’t load, so this term’s forms can’t be looked up. Try reloading the page.' }));
    searchPage.hidden = false;
    document.body.classList.add('sp-open');
  }

  /* ---- term database (variant source) + public entry points ----------- */
  var TERMS = null, TERMS_PROMISE = null, TERMS_OK = false;
  function loadTerms() {
    if (TERMS) return Promise.resolve(TERMS);
    if (TERMS_PROMISE) return TERMS_PROMISE;
    // 'no-cache' = always revalidate against the server. The static dev server
    // sends no Cache-Control, so a plain fetch is heuristically cached and a
    // glossary.json edit silently fails to show up on reload. Revalidating keeps
    // the term data (and so variant resolution) current; it's a tiny file, and
    // a 304 when unchanged is cheap. TERMS_OK records whether the load actually
    // succeeded (it can fail: file:// blocks the fetch, the file is missing or
    // malformed, the server is down) so a term search can say so plainly rather
    // than silently returning nothing.
    TERMS_PROMISE = fetch('data/glossary.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (a) { TERMS = Array.isArray(a) ? a : []; TERMS_OK = TERMS.length > 0; return TERMS; })
      .catch(function () { TERMS = []; TERMS_OK = false; return TERMS; });
    return TERMS_PROMISE;
  }
  // a term's full match set = the canonical term + its ';'-split variants
  // (editorial parentheticals like "(in Pharr's broad sense)" stripped).
  function variantSet(entry) {
    var out = [entry.term];
    if (entry.variants) {
      entry.variants.split(';').forEach(function (v) {
        v = v.replace(/\s*\([^)]*\)/g, '').trim();
        if (v) out.push(v);
      });
    }
    return out;
  }
  function resolveTerm(s) {
    var key = (s || '').trim().toLowerCase();
    if (!key || !TERMS) return null;
    for (var i = 0; i < TERMS.length; i++) {
      var e = TERMS[i];
      if (e.term.toLowerCase() === key || slug(e.term) === key) return e;
      var vs = variantSet(e);
      for (var j = 1; j < vs.length; j++) { if (vs[j].toLowerCase() === key) return e; }
    }
    return null;
  }

  /* Public contract shared by the nav bar (§5b) and the tooltips (§5c). */
  window.PharrSearch = {
    // Free text (substring, Latin-aware). Used by the nav search bar.
    openQuery: function (text) {
      var t = (text || '').trim();
      if (t) openSearchPage(t, [t], false, 'find=' + encodeURIComponent(t));
    },
    // "All instances" of a term. `term` is the canonical `term` string from
    // glossary.json (case-insensitive; a variant or the term-slug also
    // resolves). Variants are resolved here from the JSON; whole-word match.
    // Returns Promise<boolean> (true when the term was found in the JSON).
    openTerm: function (term) {
      return loadTerms().then(function () {
        if (!TERMS_OK) { showTermsNotLoaded(String(term || '').trim()); return false; }
        var e = resolveTerm(term);
        if (e) { openSearchPage(e.term, variantSet(e), true, 'all=' + slug(e.term)); return true; }
        var lit = String(term || '').trim();
        if (lit) openSearchPage(lit, [lit], true, null);   // literal fallback
        return false;
      });
    },
    close: closeSearchPage
  };

  // Deep links: #find=<text> (free) and #all=<term-slug> (term all-instances).
  function handleSearchHash() {
    var h = location.hash || '';
    if (/^#find=/.test(h)) window.PharrSearch.openQuery(decodeURIComponent(h.slice(6)));
    else if (/^#all=/.test(h)) window.PharrSearch.openTerm(decodeURIComponent(h.slice(5)));
  }

  /* ---- panel open/close state ----------------------------------------- */
  var panel, openBtn, backdrop;

  function setCollapsed(collapsed) {
    document.body.classList.toggle('nav-collapsed', collapsed);
    if (openBtn) openBtn.setAttribute('aria-expanded', String(!collapsed));
    if (!isMobile()) {
      try { localStorage.setItem(STORE_KEY, collapsed ? '1' : '0'); } catch (e) {}
    }
  }

  function closeOverlays() {
    var dd = document.getElementById('nav-dropdown');
    if (dd) dd.hidden = true;
  }

  /* ---- build & inject -------------------------------------------------- */
  function init() {
    var page = document.querySelector('.page');
    if (!page || document.getElementById('navpanel')) return;

    var input = el('input', {
      type: 'search', id: 'nav-search-input', class: 'nav-search-input',
      placeholder: 'Search the appendix…', autocomplete: 'off',
      'aria-label': 'Search the appendix', spellcheck: 'false'
    });
    var searchWrap = el('div', { class: 'nav-search' }, [
      input,
      el('button', { class: 'nav-min', type: 'button', 'aria-label': 'Hide navigation panel', title: 'Hide panel', html: '&laquo;' })
    ]);
    var dropdown = el('div', { class: 'nav-dropdown no-print', id: 'nav-dropdown', hidden: true });

    // Go-to-§ box: type a section number, jump straight there.
    var gotoInput = el('input', {
      type: 'text', id: 'nav-goto-input', class: 'nav-goto-input',
      inputmode: 'numeric', placeholder: 'e.g. 290', autocomplete: 'off',
      'aria-label': 'Section number to jump to'
    });
    var gotoMsg = el('div', { class: 'nav-goto-msg', id: 'nav-goto-msg', role: 'status', 'aria-live': 'polite', hidden: true });
    var gotoForm = el('form', { class: 'nav-goto-row', id: 'nav-goto-form' }, [
      el('label', { class: 'nav-goto-label', for: 'nav-goto-input', html: 'Go to &sect;' }),
      gotoInput,
      el('button', { class: 'nav-goto-btn', type: 'submit', text: 'Go' })
    ]);
    var gotoBox = el('div', { class: 'nav-goto no-print', id: 'nav-goto' }, [gotoForm, gotoMsg]);

    var toc = buildToc(page);

    panel = el('aside', { class: 'navpanel no-print', id: 'navpanel', 'aria-label': 'Navigation' }, [
      searchWrap, dropdown, gotoBox, toc
    ]);
    openBtn = el('button', { class: 'nav-open no-print', id: 'nav-open', type: 'button',
      'aria-label': 'Show navigation panel', title: 'Navigation', 'aria-controls': 'navpanel', html: '&#9776;' });
    backdrop = el('div', { class: 'nav-backdrop no-print', id: 'nav-backdrop' });

    // §5d search page (modal results overlay), hidden until a search opens it.
    spTitle = el('div', { class: 'sp-title', id: 'sp-title' });
    spCount = el('div', { class: 'sp-count', id: 'sp-count' });
    spBody = el('div', { class: 'sp-body', id: 'sp-body' });
    var spClose = el('button', { class: 'sp-close', type: 'button', 'aria-label': 'Close search results', html: '&times;' });
    var spPanel = el('div', { class: 'sp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sp-title' }, [
      el('div', { class: 'sp-head' }, [el('div', { class: 'sp-head-text' }, [spTitle, spCount]), spClose]),
      spBody
    ]);
    var spBackdrop = el('div', { class: 'sp-backdrop' });
    searchPage = el('div', { class: 'search-page no-print', id: 'search-page', hidden: true }, [spBackdrop, spPanel]);

    document.body.appendChild(panel);
    document.body.appendChild(openBtn);
    document.body.appendChild(backdrop);
    document.body.appendChild(searchPage);

    var entries = collectIndex(page);
    searchIndex = buildSearchIndex(page);       // built once; content is static

    spClose.addEventListener('click', closeSearchPage);
    spBackdrop.addEventListener('click', closeSearchPage);

    /* wiring ------------------------------------------------------------ */
    openBtn.addEventListener('click', function () { setCollapsed(false); input.focus(); });
    searchWrap.querySelector('.nav-min').addEventListener('click', function () { setCollapsed(true); });
    backdrop.addEventListener('click', function () { setCollapsed(true); });

    // go-to-§: a digit run is the section; "34c" -> 34, "§290"/"s290" -> 290.
    gotoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var m = (gotoInput.value || '').match(/\d+/);
      if (!m) { gotoMsg.textContent = 'Type a section number, e.g. 290.'; gotoMsg.hidden = false; return; }
      var id = 's' + m[0];
      if (document.getElementById(id)) { gotoMsg.hidden = true; goTo(id); }
      else { gotoMsg.textContent = 'There’s no §' + m[0] + ' here.'; gotoMsg.hidden = false; }
    });

    function showDropdown() {
      renderDropdown(dropdown, entries, input.value);
      dropdown.hidden = false;
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', showDropdown);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!input.value.trim()) return;
        dropdown.hidden = true;
        window.PharrSearch.openQuery(input.value);   // §5d page
      } else if (e.key === 'Escape') {
        closeOverlays();
        input.blur();
      }
    });

    // clicking a cloned index link should behave like a ToC jump
    dropdown.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      goTo(a.getAttribute('href').slice(1), e);
    });

    // click outside the search area closes the dropdown/results
    document.addEventListener('click', function (e) {
      if (panel.contains(e.target) && !searchWrap.contains(e.target)) closeOverlays();
      else if (!panel.contains(e.target)) closeOverlays();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (searchPage && !searchPage.hidden) { closeSearchPage(); return; }
      if (isMobile() && !document.body.classList.contains('nav-collapsed')) setCollapsed(true);
    });

    // deep links: open the search page from #find=… / #all=… on load and on
    // later hash changes (set silently via replaceState, so no feedback loop).
    window.addEventListener('hashchange', handleSearchHash);
    handleSearchHash();

    /* initial state ----------------------------------------------------- */
    function applyMode() {
      if (isMobile()) {
        setCollapsed(true);                 // mobile is always minimized to start
      } else {
        var stored = null;
        try { stored = localStorage.getItem(STORE_KEY); } catch (e) {}
        setCollapsed(stored === '1');       // desktop default: open
      }
    }
    applyMode();
    // keep the mode sane when crossing the breakpoint
    var m = mql();
    (m.addEventListener ? m.addEventListener.bind(m, 'change') : m.addListener.bind(m))(applyMode);
    // re-assert once the viewport width is final (guards browsers that
    // under-report innerWidth at DOMContentLoaded)
    window.addEventListener('load', applyMode);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* =========================================================================
   nav.js -- WEB LAYER entry point (screen behavior; adds no content)
   Builds and injects the left navigation panel (DESIGN.md 5a) and its
   search-bar behavior (5b):
     - Table of contents derived from the live document headings
       (h2.h2 + nested h3.h3) so it can never drift from the content.
     - Search bar that defaults to a dropdown mirror of the existing
       in-page Index (.idx entries, with their real links), and on Enter
       runs a minimal inline full-text search of the section text.
   All injected nodes carry .no-print, so the print layer's existing
   `.no-print{display:none}` rule keeps them out of the PDF. Styling lives
   in css/web.css (media=screen). This file edits no shared content; it
   only augments the DOM at runtime.

   5d hook: the Enter-search results are intentionally minimal/inline. The
   future "all instances" search page (5d) will replace renderSearchResults()
   / wire the `.nav-allinstances` affordance -- search for "5d:" below.
   ========================================================================= */
(function () {
  'use strict';

  var MOBILE_Q = '(max-width: 820px)';
  var STORE_KEY = 'pharr-nav-collapsed';

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
    var heads = page.querySelectorAll('h2.h2, h3.h3');
    var topList = el('ul', { class: 'toc-l1' });
    var curSub = null;
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
        li.appendChild(curSub);
        topList.appendChild(li);
      } else {
        var sub = curSub || topList;          // stray h3 before any h2 (none today)
        sub.appendChild(el('li', { class: 'toc-i2' }, [a]));
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
  function collectIndex(page) {
    var out = [];
    page.querySelectorAll('.indexcols .idx').forEach(function (p) {
      var lemma = (p.querySelector('.lemma') || p).textContent.trim();
      out.push({ lemma: lemma, key: lemma.toLowerCase(), all: p.textContent.toLowerCase(), node: p });
    });
    return out;
  }

  var INDEX_CAP = 60;  // entries rendered at once; typing narrows the rest

  function renderDropdown(box, entries, q) {
    box.textContent = '';
    var query = q.trim().toLowerCase();
    var matches = entries.filter(function (e) {
      return !query || e.key.indexOf(query) !== -1 || e.all.indexOf(query) !== -1;
    });

    if (!matches.length) {
      box.appendChild(el('div', { class: 'nav-dd-empty', text: query
        ? 'No index entry matches “' + q.trim() + '”. Press Enter to search the full text.'
        : 'The index is empty.' }));
      return;
    }

    var head = el('div', { class: 'nav-dd-head' });
    head.textContent = query
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
     Enter search -- minimal inline full-text over the section text.
     5d: this whole results view is the placeholder the search page replaces.
     ===================================================================== */
  function searchSections(page, query) {
    var q = query.trim().toLowerCase();
    var res = [];
    if (!q) return res;
    page.querySelectorAll('.sec').forEach(function (sec) {
      var text = sec.textContent;
      var hit = text.toLowerCase().indexOf(q);
      if (hit === -1) return;
      var id = sec.id;
      if (!id) {
        var stub = sec.previousElementSibling;   // some §s anchor via a stub span
        if (stub && stub.id) id = stub.id;
      }
      var sn = sec.querySelector('.sn');
      res.push({
        id: id,
        label: sn ? sn.textContent.replace(/[.\s]+$/, '') : '§',
        snippet: makeSnippet(text, hit, q.length)
      });
    });
    return res;
  }

  function makeSnippet(text, at, len) {
    var start = Math.max(0, at - 38), end = Math.min(text.length, at + len + 50);
    var frag = document.createDocumentFragment();
    if (start > 0) frag.appendChild(document.createTextNode('…'));
    frag.appendChild(document.createTextNode(text.slice(start, at)));
    frag.appendChild(el('mark', { text: text.slice(at, at + len) }));
    frag.appendChild(document.createTextNode(text.slice(at + len, end)));
    if (end < text.length) frag.appendChild(document.createTextNode('…'));
    return frag;
  }

  function renderSearchResults(box, page, query) {
    box.textContent = '';
    var hits = searchSections(page, query);

    var head = el('div', { class: 'nav-res-head' });
    head.textContent = hits.length
      ? hits.length + ' section' + (hits.length === 1 ? '' : 's') + ' contain “' + query.trim() + '”'
      : 'No section text matches “' + query.trim() + '”';
    box.appendChild(head);

    var CAP = 40;
    hits.slice(0, CAP).forEach(function (h) {
      var row = el('a', { class: 'nav-res-item', href: h.id ? '#' + h.id : '#' });
      row.appendChild(el('span', { class: 'nav-res-num', text: h.label }));
      var snip = el('span', { class: 'nav-res-snip' });
      snip.appendChild(h.snippet);
      row.appendChild(snip);
      if (h.id) row.addEventListener('click', function (e) { goTo(h.id, e); });
      box.appendChild(row);
    });
    if (hits.length > CAP) {
      box.appendChild(el('div', { class: 'nav-dd-more', text: '+' + (hits.length - CAP) + ' more sections' }));
    }

    // 5d: the search page ("all instances") opens from here.
    box.appendChild(el('div', { class: 'nav-allinstances',
      text: 'A full “all instances” search page is coming (§5d).' }));
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
    var rs = document.getElementById('nav-results');
    if (dd) dd.hidden = true;
    if (rs) rs.hidden = true;
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
    var results = el('div', { class: 'nav-results no-print', id: 'nav-results', hidden: true });
    var toc = buildToc(page);

    panel = el('aside', { class: 'navpanel no-print', id: 'navpanel', 'aria-label': 'Navigation' }, [
      searchWrap, dropdown, results, toc
    ]);
    openBtn = el('button', { class: 'nav-open no-print', id: 'nav-open', type: 'button',
      'aria-label': 'Show navigation panel', title: 'Navigation', 'aria-controls': 'navpanel', html: '&#9776;' });
    backdrop = el('div', { class: 'nav-backdrop no-print', id: 'nav-backdrop' });

    document.body.appendChild(panel);
    document.body.appendChild(openBtn);
    document.body.appendChild(backdrop);

    var entries = collectIndex(page);

    /* wiring ------------------------------------------------------------ */
    openBtn.addEventListener('click', function () { setCollapsed(false); input.focus(); });
    searchWrap.querySelector('.nav-min').addEventListener('click', function () { setCollapsed(true); });
    backdrop.addEventListener('click', function () { setCollapsed(true); });

    function showDropdown() {
      results.hidden = true;
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
        renderSearchResults(results, page, input.value);
        results.hidden = false;
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
      if (e.key === 'Escape' && isMobile() && !document.body.classList.contains('nav-collapsed')) {
        setCollapsed(true);
      }
    });

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

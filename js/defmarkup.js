/* =========================================================================
   defmarkup.js -- the definition mini-markup notation (shared parser).

   PURPOSE & SECURITY PRINCIPLE
   ----------------------------
   Definition text in data/glossary.json is STUDENT-FACING and must never be
   rendered as HTML. To still style terms and Latin inside a definition, the
   JSON uses a controlled sentinel notation that THIS parser interprets,
   building DOM with createElement / textContent only. Arbitrary HTML in a
   definition therefore renders as literal characters and can never execute --
   `<b>x</b>` in a definition shows the eight characters `<b>x</b>`, it does not
   make text bold. JSON text is never innerHTML'd. (See CLAUDE.md.)

   THE NOTATION (flat, per-class sigils -- spans do NOT nest)
   ---------------------------------------------------------
     [[direct object]]  -> <span class="term">direct object</span>
     <<cum>>            -> <span class="la">cum</span>
   To add another styled class later, add ONE row to SIGILS below; the parser
   is generic over the table. There is deliberately NO link syntax -- links are
   structured data in dedicated JSON fields, never inline markup.

   ESCAPE RULE
   -----------
   A backslash makes the next character literal, so it can never be part of a
   sigil:  \[ \] \< \> \\  ->  [ ] < > \ .  To write a literal doubled sigil,
   escape it:  \[\[ -> [[ ,  \<\< -> << . A backslash before any other char
   simply yields that char (e.g. \a -> a). A trailing backslash is malformed.

   ANGLE-BRACKET / STRAY-BRACKET HANDLING
   --------------------------------------
   Only the DOUBLED forms ([[ ]] << >>) are structural. A single < > [ ] is
   ordinary text and is emitted as a text node, so a stray "<" stays literal
   (it is never HTML-parsed). This is a parsing convenience, not a security
   boundary -- nothing here is ever treated as HTML.

   ERROR MODEL (two layers, both used)
   -----------------------------------
   This is AUTHORED content: malformed markup means a typo to catch, not
   untrusted input to absorb. tokenize() THROWS a DefMarkupError (with a
   character index) on the first malformed / nested / mismatched / unterminated
   sigil. The renderer lets that surface (fails loudly), and the standalone
   validator (build/validate_markup.py) runs this exact parser over the whole
   file via validate().

   This module is UMD-ish: it self-installs as window.PharrDefMarkup in the
   browser (web tooltip + the eventual print glossary, both Chromium) and as
   module.exports under CommonJS, so every consumer shares ONE grammar and the
   renderers cannot drift from each other or from the validator.
   ========================================================================= */
(function (root, factory) {
  'use strict';
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.PharrDefMarkup = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- Notation table. EXTENSION POINT: add a row to support a new class. ----
     Each row maps a doubled open/close pair to the className of the span the
     renderer builds. Pairs must be two characters and must not collide. */
  var SIGILS = [
    { open: '[[', close: ']]', className: 'term' },  // grammatical term
    { open: '<<', close: '>>', className: 'la'   }   // Latin text
  ];
  var ESCAPE = '\\';

  // Fast two-char lookups derived from the table.
  var BY_OPEN = {}, BY_CLOSE = {};
  SIGILS.forEach(function (s) { BY_OPEN[s.open] = s; BY_CLOSE[s.close] = s; });

  /* ---- Error type: carries a character index for precise reporting. ---- */
  function DefMarkupError(message, index) {
    this.name = 'DefMarkupError';
    this.index = index;
    this.message = message + ' (at position ' + index + ')';
  }
  DefMarkupError.prototype = Object.create(Error.prototype);
  DefMarkupError.prototype.constructor = DefMarkupError;

  /* ---- Tokenizer. Returns [{type, value}] where type is 'text' or a
     className ('term' / 'la' / ...). Throws DefMarkupError on malformed input.
     Pure string logic: no DOM, so it runs identically in browser and Node. ---- */
  function tokenize(str) {
    if (str == null) return [];
    str = String(str);
    var tokens = [];
    var buf = '';                 // text outside a span, or content inside one
    var open = null;              // current SIGIL row when inside a span, else null
    var openIndex = -1;           // index of the opener, for unterminated errors
    var i = 0, n = str.length;

    function flushText() {
      if (buf) { tokens.push({ type: 'text', value: buf }); buf = ''; }
    }

    while (i < n) {
      var c = str.charAt(i);

      // Escape: next char is taken literally and cannot start/finish a sigil.
      if (c === ESCAPE) {
        if (i + 1 >= n)
          throw new DefMarkupError('dangling escape: "\\" with nothing to escape', i);
        buf += str.charAt(i + 1);
        i += 2;
        continue;
      }

      var two = c + (i + 1 < n ? str.charAt(i + 1) : '');
      var opener = BY_OPEN[two];
      var closer = BY_CLOSE[two];

      if (opener) {
        if (open)
          throw new DefMarkupError(
            'nested sigil: "' + two + '" inside a "' + open.className + '" span ' +
            '(spans cannot nest)', i);
        flushText();
        open = opener;
        openIndex = i;
        i += 2;
        continue;
      }

      if (closer) {
        if (!open)
          throw new DefMarkupError(
            'unmatched closing sigil "' + two + '" with no open span', i);
        if (closer !== open)
          throw new DefMarkupError(
            'mismatched sigil: "' + two + '" closes a "' + closer.className +
            '" span but a "' + open.className + '" span is open', i);
        if (buf.length === 0)
          throw new DefMarkupError(
            'empty "' + open.className + '" span', openIndex);
        tokens.push({ type: open.className, value: buf });
        buf = '';
        open = null;
        i += 2;
        continue;
      }

      // Ordinary character (incl. a lone < > [ ] ): literal text.
      buf += c;
      i += 1;
    }

    if (open)
      throw new DefMarkupError(
        'unterminated "' + open.className + '" span (missing "' + open.close + '")',
        openIndex);
    flushText();
    return tokens;
  }

  /* ---- DOM renderer. Builds a DocumentFragment via createTextNode /
     createElement+textContent ONLY -- never innerHTML. Throws (fails loudly)
     on malformed markup; callers decide how to surface it. ---- */
  function toFragment(str, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('toFragment requires a document');
    var tokens = tokenize(str);                  // may throw DefMarkupError
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'text') {
        frag.appendChild(doc.createTextNode(t.value));
      } else {
        var span = doc.createElement('span');
        span.className = t.type;                  // 'term' / 'la' -> existing CSS
        span.textContent = t.value;               // text node, never HTML
        frag.appendChild(span);
      }
    }
    return frag;
  }

  /* ---- Convenience: clear an element and render markup into it. ---- */
  function renderInto(el, str, doc) {
    doc = doc || (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    el.textContent = '';
    el.appendChild(toFragment(str, doc));
    return el;
  }

  /* ---- Non-throwing check for the validator: null if clean, else the error
     ({message, index}) of the first problem. ---- */
  function validate(str) {
    try { tokenize(str); return null; }
    catch (e) {
      if (e instanceof DefMarkupError) return { message: e.message, index: e.index };
      return { message: String(e && e.message || e), index: -1 };
    }
  }

  return {
    SIGILS: SIGILS,
    DefMarkupError: DefMarkupError,
    tokenize: tokenize,
    toFragment: toFragment,
    renderInto: renderInto,
    validate: validate
  };
});

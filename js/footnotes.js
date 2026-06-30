/* footnotes.js -- WEB LAYER (screen behaviour only; adds no content)
 *
 * Pharr's footnotes (DESIGN.md, footnote thread) are authored once in the shared
 * core as an in-text call (a.fn-call) + a block-anchored note (.footnote). They
 * are VISIBLE BY DEFAULT, so with JS off -- or in the print render, which never
 * clicks -- the note is simply an inline aside that prints. This script is the
 * "extra": it makes each note collapsible by clicking its in-text symbol, and
 * keeps the call's aria-expanded in sync so the dotted re-open cue (web.css) and
 * assistive tech both track the state. Pure progressive enhancement.
 */
(function () {
  function init() {
    var calls = document.querySelectorAll('a.fn-call');
    Array.prototype.forEach.call(calls, function (call) {
      var href = call.getAttribute('href');           // e.g. "#fn-1"
      var note = href && document.querySelector(href);
      if (!note) return;
      call.setAttribute('role', 'button');
      call.setAttribute('aria-expanded', 'true');
      if (note.id) call.setAttribute('aria-controls', note.id);
      if (!call.title) call.title = 'Show or hide this note';
      call.addEventListener('click', function (e) {
        e.preventDefault();
        var collapsed = note.classList.toggle('is-collapsed');
        call.setAttribute('aria-expanded', String(!collapsed));
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

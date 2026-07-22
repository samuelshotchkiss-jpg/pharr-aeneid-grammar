/* Web-layer boot for edexpansions.js. The print build calls
   PharrBuildEdExpansions itself from render_pdf.py, in the Chromium render path;
   this is the screen half. Kept separate from the module so the module stays a
   pure function of (data, document) and both callers use it identically.

   Same fetch contract as the tooltips (§4): cache:'no-cache' so an edit to
   glossary.json shows up on reload, and a failed load is silent -- an absent
   expansion box costs a reader nothing, whereas a console error on file:// would
   be noise. */
(function () {
  'use strict';
  function start() {
    if (!window.PharrBuildEdExpansions || !window.PharrDefMarkup) return;
    fetch('data/glossary.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (arr) { if (Array.isArray(arr)) window.PharrBuildEdExpansions(arr); })
      .catch(function () { /* file://, offline, missing: no boxes, page fine */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

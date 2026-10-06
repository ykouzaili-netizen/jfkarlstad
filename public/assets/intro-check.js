/* JFK – avgör innan sidan ritas om introt ska visas (laddas blockerande i <head>, därför så litet som möjligt).
 *
 * Introt visas bara när någon kommer till startsidan utifrån: direkt, från en sökmotor eller en länk på en
 * annan webbplats. Inte när man klickar sig tillbaka till startsidan, laddar om sidan eller går bakåt.
 * Inget sparas hos besökaren (ingen kaka, ingen lagring) – därför behöver integritetspolicyn inte ändras.
 * Hoppas alltid över vid "minska rörelse". Lägg till ?intro i adressen för att se introt när som helst.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  try {
    var force = /[?&]intro\b/.test(location.search);
    if (!force) {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (location.hash) return;
      var nav = window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav && nav.type !== "navigate") return;
      if (document.referrer) {
        try { if (new URL(document.referrer).origin === location.origin) return; } catch (e) { /* okänd adress */ }
      }
    }
    root.classList.add("intro-on");
  } catch (e) {
    /* Hellre ingen intro än en trasig sida. */
  }
})();

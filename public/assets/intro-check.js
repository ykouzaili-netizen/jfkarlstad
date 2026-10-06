/* JFK – avgör innan sidan ritas om introt ska visas (laddas blockerande i <head>, därför så litet som möjligt).
 *
 * Introt visas bara när någon kommer till startsidan utifrån: direkt, från en sökmotor eller en länk på en
 * annan webbplats. Inte när man klickar sig tillbaka till startsidan, laddar om sidan eller går bakåt.
 * Inget sparas hos besökaren (ingen kaka, ingen lagring) – därför behöver integritetspolicyn inte ändras.
 * Hoppas alltid över vid "minska rörelse". Lägg till ?intro (eller ?intro=<utseende>) i adressen för att se det.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  try {
    var m = location.search.match(/[?&]intro(?:=([a-z]+))?\b/);
    var force = !!m;
    // /?intro=ridan visar ett visst utseende (för att jämföra i Utseende → Rörelse).
    if (m && m[1]) root.setAttribute("data-intro-preview", m[1]);
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

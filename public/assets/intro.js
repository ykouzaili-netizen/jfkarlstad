/* JFK – introt när man kommer till startsidan (Utseende → Rörelse → Intro).
 *
 * intro-check.js har redan avgjort att introt ska visas (klassen intro-on på <html>, som gör skärmen svart
 * från första bildrutan). Här hämtas logotypen (intro-logo.svg, byggd från föreningens EPS) och animeras i
 * samma rytm som förebilden: en guldpunkt växer till en ring, vågen ritas, lagerkransen växer, JFK glider upp
 * och bågtexten skrivs fram. Sedan tonar den svarta skärmen bort och startsidan syns under.
 *
 * Sidan laddas hela tiden under introt. Ett klick, en tangent eller ett skroll hoppar över det.
 * Går något fel tonar skärmen bort ändå (CSS-reserv i site.css efter några sekunder).
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var box = document.querySelector("[data-intro]");
  if (!box || !root.classList.contains("intro-on")) return;

  var EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  var HOLD_UNTIL = 2150;   // när logotypen är klar och övertoningen börjar (ms)
  var FADE = 650;          // övertoningen till sidan
  var done = false, timers = [], raf = 0;

  root.classList.add("intro-run"); // pausar toppens egna animationer och låser skrollningen

  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function anim(el, frames, opts) {
    if (!el || !el.animate) return null;
    return el.animate(frames, Object.assign({ fill: "both", easing: EASE }, opts));
  }

  /** Slutet: den svarta skärmen tonar bort medan toppens animationer startar. */
  function finish(quick) {
    if (done) return;
    done = true;
    timers.forEach(window.clearTimeout);
    cancelAnimationFrame(raf);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.removeEventListener(ev, skip, true); });
    root.classList.remove("intro-run");
    var ms = quick ? 300 : FADE;
    var logo = box.querySelector(".intro-logo");
    anim(logo, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.06)" }], { duration: ms * 0.8 });
    var a = anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease" });
    var end = function () { root.classList.remove("intro-on"); box.remove(); };
    if (a) a.onfinish = end; else end();
  }
  function skip() { finish(true); }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.addEventListener(ev, skip, { capture: true, passive: true }); });

  function play(svgText) {
    if (done) return;
    box.innerHTML = svgText; // vår egen fil från samma webbplats
    var svg = box.querySelector("svg");
    if (!svg) return finish(true);
    var q = function (s) { return svg.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(svg.querySelectorAll(s)); };

    // 1. Punkten växer fram och pulserar ut i en ring, som ett sigill.
    anim(q(".i-dot"), [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1.4)", opacity: 1, offset: 0.45 }, { transform: "scale(0)", opacity: 0 }], { duration: 760 });
    anim(q(".i-ring"), [{ transform: "scale(0.04)", opacity: 0 }, { transform: "scale(0.25)", opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 0 }], { duration: 1100, delay: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });

    // 2. Vågen: trådarna ritas, stommen och skålarna stiger fram (dämpat, som i originalet).
    anim(q(".i-stomme"), [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 300 });
    qa(".i-trad").forEach(function (t, i) {
      var len = t.getTotalLength ? t.getTotalLength() : 200;
      t.style.strokeDasharray = len;
      anim(t, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 650, delay: 620 + i * 80, easing: "ease-out" });
    });
    qa(".i-skal").forEach(function (s, i) {
      anim(s, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 1000 + i * 80 });
    });

    // 3. Lagerkransen växer från botten: stjälkarna avtäcks av en växande cirkel, bladen slår ut i samma takt.
    var grow = q(".i-grow"), t0 = 0, GROW_FROM = 320, GROW_MS = 1150, R = 340;
    function step(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, Math.max(0, (now - t0 - GROW_FROM) / GROW_MS));
      var e = 1 - Math.pow(1 - p, 3);
      grow.setAttribute("r", (e * R).toFixed(1));
      if (p < 1 && !done) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    qa(".i-blad").forEach(function (leaf) {
      var b = leaf.getBBox();
      // Avståndet från kransens nederkant (mitten) avgör när bladet slår ut.
      var dx = b.x + b.width / 2 - 207.3, dy = b.y + b.height / 2 - 430;
      var dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
      var at = GROW_FROM + (1 - Math.pow(1 - Math.min(1, dist), 1 / 3)) * GROW_MS;
      anim(leaf, [{ opacity: 0, transform: "scale(0.2) rotate(-12deg)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: at - 60 });
    });

    // 4. J, F och K glider upp en i taget (som ordmärket i förebilden).
    qa(".i-bokstav").forEach(function (l, i) {
      anim(l, [{ transform: "translateY(165px)" }, { transform: "none" }], { duration: 900, delay: 700 + i * 110 });
    });

    // 5. Bågtexten skrivs fram från vänster.
    qa(".i-tecken").forEach(function (g, i) {
      anim(g, [{ opacity: 0, transform: "translateY(-5px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 1050 + i * 24, easing: "ease-out" });
    });

    box.classList.add("is-playing");
    later(function () { finish(false); }, HOLD_UNTIL);
  }

  var src = box.getAttribute("data-intro");
  fetch(src, { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error("intro"); return r.text(); })
    .then(play)
    .catch(function () { finish(true); });
  // Säkerhetsnät om något hänger sig.
  later(function () { finish(true); }, 6000);
})();

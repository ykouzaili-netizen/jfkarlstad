/* JFK – introt när man kommer till startsidan (Utseende → Rörelse → Intro).
 *
 * intro-check.js har redan avgjort att introt ska visas (klassen intro-on på <html>, som gör skärmen mörk
 * från första bildrutan). Här hämtas logotypen (intro-logo.svg, byggd från föreningens EPS – delarna heter
 * i-vagen/i-vl/i-vr, i-krans, i-jfk och i-bagtext) och spelas upp i det utseende som valts:
 *
 *   sigill    Guldpunkt som pulserar ut i en ring, vågen ritas, kransen växer, JFK glider upp, bågtexten skrivs.
 *   ridan     Logotypen träder fram i mörkret – sedan lyfts den mörka ridån uppåt och avtäcker sidan.
 *   vagen     Vågskålarna väger upp och ned och stannar i jämvikt, sedan kommer JFK och kransen.
 *   stampel   Ljust papper: logotypen stämplas ned med en duns och lämnar en bläckring.
 *   kransen   Lagerbladen flyger in från alla håll och sätter sig på plats runt JFK.
 *   blanda    Ett av utseendena ovan, olika varje gång.
 *
 * Sidan laddas hela tiden under introt. Ett klick, en tangent eller ett skroll hoppar över det.
 * Går något fel tonar skärmen bort ändå (CSS-reserv i site.css efter några sekunder).
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var box = document.querySelector("[data-intro]");
  if (!box || !root.classList.contains("intro-on")) return;

  var STYLES = ["sigill", "ridan", "vagen", "stampel", "kransen"];
  var style = root.getAttribute("data-intro-preview") || box.getAttribute("data-style") || "sigill";
  if (style === "blanda") style = STYLES[Math.floor(Math.random() * STYLES.length)];
  if (STYLES.indexOf(style) < 0) style = "sigill";
  box.setAttribute("data-style", style);

  var EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  var done = false, timers = [], raf = 0, svg = null;

  root.classList.add("intro-run"); // pausar toppens egna animationer och låser skrollningen

  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function anim(el, frames, opts) {
    if (!el || !el.animate) return null;
    return el.animate(frames, Object.assign({ fill: "both", easing: EASE }, opts));
  }
  function q(s) { return svg.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(svg.querySelectorAll(s)); }
  function center(el) { var b = el.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  function showStems() { var g = q(".i-grow"); if (g) g.setAttribute("r", "600"); }

  /** Slutet. Standard: logotypen och den mörka skärmen tonar bort. Ridån lyfts i stället uppåt. */
  function finish(quick) {
    if (done) return;
    done = true;
    timers.forEach(window.clearTimeout);
    cancelAnimationFrame(raf);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.removeEventListener(ev, skip, true); });
    root.classList.remove("intro-run");
    var logo = box.querySelector(".intro-logo");
    var a;
    if (style === "ridan" && !quick) {
      box.classList.add("is-lifting");
      anim(logo, [{ transform: "none", opacity: 1 }, { transform: "translateY(-22vh) scale(0.82)", opacity: 0 }], { duration: 900, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
      a = anim(box, [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration: 1050, easing: "cubic-bezier(0.76, 0, 0.24, 1)" });
    } else {
      var ms = quick ? 300 : 650;
      anim(logo, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.06)" }], { duration: ms * 0.8 });
      a = anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease" });
    }
    var end = function () { root.classList.remove("intro-on"); box.remove(); };
    if (a) a.onfinish = end; else end();
  }
  function skip() { finish(true); }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.addEventListener(ev, skip, { capture: true, passive: true }); });

  /* ---------- Utseendena. Varje funktion returnerar när övergången till sidan ska börja (ms). ---------- */

  var PLAYS = {
    sigill: function () {
      anim(q(".i-dot"), [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1.4)", opacity: 1, offset: 0.45 }, { transform: "scale(0)", opacity: 0 }], { duration: 760 });
      anim(q(".i-ring"), [{ transform: "scale(0.04)", opacity: 0 }, { transform: "scale(0.25)", opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 0 }], { duration: 1100, delay: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
      anim(q(".i-stomme"), [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 300 });
      qa(".i-trad").forEach(function (t, i) {
        var len = t.getTotalLength ? t.getTotalLength() : 200;
        t.style.strokeDasharray = len;
        anim(t, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 650, delay: 620 + i * 80, easing: "ease-out" });
      });
      qa(".i-skal").forEach(function (s, i) {
        anim(s, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 1000 + i * 80 });
      });
      growWreath(320, 1150);
      qa(".i-bokstav").forEach(function (l, i) {
        anim(l, [{ transform: "translateY(165px)" }, { transform: "none" }], { duration: 900, delay: 700 + i * 110 });
      });
      writeArc(1050, 24);
      return 2150;
    },

    ridan: function () {
      showStems();
      // Hela logotypen träder fram ur mörkret, lite oskarp och stor, och skärps.
      anim(svg, [{ opacity: 0, transform: "scale(1.08)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 1100, delay: 120 });
      qa(".i-bokstav").forEach(function (l, i) {
        anim(l, [{ transform: "translateY(165px)" }, { transform: "none" }], { duration: 950, delay: 380 + i * 110 });
      });
      writeArc(700, 22);
      return 1850;
    },

    vagen: function () {
      showStems();
      svg.classList.add("is-bright"); // vågen är huvudpersonen här
      anim(q(".i-stomme"), [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 700, delay: 100 });
      qa(".i-skal, .i-trad").forEach(function (el) { anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 250 }); });
      // Skålarna väger: vänster ned, höger upp – fram och tillbaka med avtagande utslag tills de står i jämvikt.
      var swing = [0, 1, -0.7, 0.42, -0.2, 0.07, 0];
      var frames = function (dir) { return swing.map(function (v) { return { transform: "translateY(" + (v * 16 * dir).toFixed(2) + "px)" }; }); };
      anim(q(".i-vl"), frames(1), { duration: 1500, delay: 350, easing: "ease-in-out" });
      anim(q(".i-vr"), frames(-1), { duration: 1500, delay: 350, easing: "ease-in-out" });
      qa(".i-bokstav").forEach(function (l, i) {
        anim(l, [{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 1450 + i * 90 });
      });
      qa(".i-blad, .i-stjalk").forEach(function (el) {
        var c = center(el);
        anim(el, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 1350 + Math.abs(c.x - 207) * 1.6 });
      });
      writeArc(1650, 16);
      return 2550;
    },

    stampel: function () {
      showStems();
      // Stämpeln slår ned: från stor och sned till sin plats, med en liten studs.
      anim(svg, [
        { opacity: 0, transform: "scale(2.3) rotate(-9deg)" },
        { opacity: 1, transform: "scale(0.94) rotate(0.6deg)", offset: 0.72 },
        { opacity: 1, transform: "scale(1.015)", offset: 0.86 },
        { opacity: 1, transform: "none" },
      ], { duration: 620, delay: 260, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)" });
      later(function () {
        box.animate([{ transform: "translate(0, 0)" }, { transform: "translate(1.5px, 3px)" }, { transform: "translate(-1px, -1px)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
      }, 700);
      // Bläcket sprider sig i en ring när stämpeln lyfts.
      anim(q(".i-ring"), [{ transform: "scale(0.62)", opacity: 0 }, { transform: "scale(0.66)", opacity: 0.9, offset: 0.1 }, { transform: "scale(1.05)", opacity: 0 }], { duration: 1100, delay: 700, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
      return 1900;
    },

    kransen: function () {
      // Bladen flyger in utifrån – varje blad från sitt eget håll – och sätter sig på plats, nedifrån och upp.
      growWreath(150, 1300);
      qa(".i-blad").forEach(function (leaf, i) {
        var c = center(leaf);
        var dx = c.x - 207.3, dy = c.y - 215, len = Math.sqrt(dx * dx + dy * dy) || 1;
        var far = 170 + (i % 4) * 30;
        var tx = dx / len * far, ty = dy / len * far, rot = (i % 2 ? 1 : -1) * (60 + (i % 3) * 25);
        var order = Math.max(0, 430 - c.y); // nedersta först
        anim(leaf, [
          { opacity: 0, transform: "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px) rotate(" + rot + "deg) scale(0.5)" },
          { opacity: 1, transform: "none" },
        ], { duration: 900, delay: 150 + order * 4.2 });
      });
      anim(q(".i-vagen"), [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 900, easing: "ease" });
      // JFK sluter sig: bokstäverna kommer ihop från bredare avstånd.
      qa(".i-bokstav").forEach(function (l, i) {
        var dx = (i - 1) * 46;
        anim(l, [{ opacity: 0, transform: "translateX(" + dx + "px)" }, { opacity: 1, transform: "none" }], { duration: 1000, delay: 1050 });
      });
      writeArc(1350, 18);
      return 2350;
    },
  };

  /** Kransens stjälkar avtäcks av en växande cirkel nerifrån, och bladen slår ut i samma takt. */
  function growWreath(from, ms) {
    var grow = q(".i-grow"), t0 = 0, R = 340;
    function step(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, Math.max(0, (now - t0 - from) / ms));
      grow.setAttribute("r", ((1 - Math.pow(1 - p, 3)) * R).toFixed(1));
      if (p < 1 && !done) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    if (style !== "sigill") return;
    qa(".i-blad").forEach(function (leaf) {
      var c = center(leaf);
      var dx = c.x - 207.3, dy = c.y - 430;
      var dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
      var at = from + (1 - Math.pow(1 - dist, 1 / 3)) * ms;
      anim(leaf, [{ opacity: 0, transform: "scale(0.2) rotate(-12deg)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: at - 60 });
    });
  }

  /** Bågtexten "Juridiska Föreningen i Karlstad" skrivs fram bokstav för bokstav från vänster. */
  function writeArc(from, step) {
    qa(".i-tecken").forEach(function (g, i) {
      anim(g, [{ opacity: 0, transform: "translateY(-5px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: from + i * step, easing: "ease-out" });
    });
  }

  function play(svgText) {
    if (done) return;
    box.innerHTML = svgText; // vår egen fil från samma webbplats
    svg = box.querySelector("svg");
    if (!svg) return finish(true);
    svg.classList.add("v-" + style);
    box.classList.add("is-playing");
    var at = PLAYS[style]();
    later(function () { finish(false); }, at);
  }

  var src = box.getAttribute("data-intro");
  fetch(src, { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error("intro"); return r.text(); })
    .then(play)
    .catch(function () { finish(true); });
  // Säkerhetsnät om något hänger sig.
  later(function () { finish(true); }, 6500);
})();

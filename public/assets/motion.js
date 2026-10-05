/* JFK – rörelse och animationer (progressiv förbättring).
 *
 * Nivån väljs i adminpanelen (Utseende → Rörelse) och står i <html data-motion="full|lugn|av">.
 * Vid "Av" laddas inte filen alls. Grundregler:
 *  - Inget döljs i HTML/CSS. Skriptet döljer bara sådant som ligger nedanför skärmen, och visar det
 *    när besökaren skrollar dit. Går något fel syns sidan precis som utan skriptet.
 *  - "Minska rörelse" i telefonen/datorn går alltid före – då gör skriptet ingenting.
 *  - Allt som följer skrollningen körs i en enda requestAnimationFrame och rör bara transform/opacity.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var level = root.getAttribute("data-motion");
  if (level !== "full" && level !== "lugn") return;
  if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;
  var FULL = level === "full";

  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- 1. Innehåll som kommer fram ---------- */

  // Rubriker där orden glider upp ett i taget (i Lugn: bara en toning).
  var HEADINGS = "main :is(.section-title, .cta-title, .insta-title)";
  // Enstaka block som glider upp.
  var BLOCKS = [
    ".section-lead", ".section-link", ".prose", ".page-section-lead", ".intro-copy > .arrow-link",
    ".cta-panel", ".partner-footer", ".empty-state", ".insta-profile", ".insta-actions", ".insta-feed",
    ".insta-empty", ".about-intro-grid > *", ".content-photo", ".aside-card", ".form-card",
  ].map(function (s) { return "main " + s; }).join(",");
  // Listor och rutnät: barnen kommer fram ett efter ett.
  var GROUPS = [
    ".card-grid", ".value-grid", ".partner-main", ".stat-grid", ".honor-grid", ".rep-grid", ".position-grid",
    ".person-grid", ".package-grid", ".gallery-grid", ".committee-grid", ".cm-grid", ".step-list",
    ".purpose-list", ".job-list", ".doc-list", ".faq-list", ".contact-list", ".check-list",
  ].map(function (s) { return "main " + s + " > *"; }).join(",");
  // Bilder som avtäcks (bara i Full).
  var IMAGES = "main .intro-media > div, main .content-photo";
  // Delar av sidan där inget ska röra sig (karuseller, band, toppen, genvägsmenyn, kalendern).
  var SKIP = ".hero, .section-nav, [data-carousel], [data-marquee], .wordband, .cal-grid";

  var vh = window.innerHeight;

  /** Ligger elementet nedanför skärmen just nu? Avsnitt längre ned är inte uppritade än
   *  (content-visibility), så då frågar vi avsnittet i stället för elementet. */
  function below(el) {
    var section = el.closest("main > *");
    if (section) {
      var r = section.getBoundingClientRect();
      if (r.top > vh) return true;
      if (r.bottom < 0) return false;
    }
    return el.getBoundingClientRect().top > vh * 0.94;
  }

  /** Delar upp rubrikens text i ord: <span class="sw"><span>ord</span></span>. Bara rena textrubriker. */
  function splitWords(el) {
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType !== 3) return false;
    var words = el.textContent.trim().split(/\s+/);
    if (!words.length || words.length > 24) return false;
    el.textContent = "";
    words.forEach(function (w, n) {
      if (n) el.appendChild(document.createTextNode(" "));
      var outer = document.createElement("span");
      var inner = document.createElement("span");
      outer.className = "sw";
      inner.textContent = w;
      inner.style.setProperty("--wi", String(n));
      outer.appendChild(inner);
      el.appendChild(outer);
    });
    return true;
  }

  var marked = new Set();
  /** Ligger elementet i något som redan kommer fram, eller i en hopfälld ruta (<details>)?
   *  Innehåll i en stängd <details> ritas inte och skulle annars vara osynligt när rutan öppnas. */
  function covered(el) {
    for (var n = el.parentElement; n && n.tagName !== "MAIN"; n = n.parentElement) {
      if (marked.has(n) || n.tagName === "DETAILS") return true;
    }
    return false;
  }
  function mark(el, kind, delay) {
    if (marked.has(el) || el.closest(SKIP) || covered(el)) return;
    if (!below(el)) return;
    marked.add(el);
    el.classList.add("rv");
    if (kind) el.classList.add(kind);
    if (delay) el.style.setProperty("--rv-delay", delay + "s");
  }

  // Startsidan: avsnittens rubriker numreras 01, 02 … i den ordning styrelsen har lagt avsnitten.
  if (FULL && document.querySelector("main > .hero")) {
    $$("main > section .section-title").forEach(function (h, i) { h.setAttribute("data-n", (i < 9 ? "0" : "") + (i + 1)); });
  }

  // Listorna först: ett kort kommer fram som en helhet, utan att texten i det animeras för sig.
  $$(GROUPS).forEach(function (el) {
    var i = Array.prototype.indexOf.call(el.parentNode.children, el);
    // Kolumnvis fördröjning: i ett rutnät med tre kolumner kommer rad två i samma takt som rad ett.
    mark(el, "", Math.min(i % 4, 3) * 0.09);
  });
  $$(HEADINGS).forEach(function (h) {
    if (h.closest(SKIP) || covered(h) || !below(h)) return;
    mark(h, FULL && splitWords(h) ? "rv-words" : "");
  });
  if (FULL) $$(IMAGES).forEach(function (el) { mark(el, "rv-img"); });
  $$(BLOCKS).forEach(function (el) { mark(el, ""); });

  function done(el) {
    el.classList.remove("rv", "rv-words", "rv-img", "is-in");
    el.style.removeProperty("--rv-delay");
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      io.unobserve(el);
      el.classList.add("is-in");
      if (el.querySelector(".stat-value") || el.classList.contains("stat")) countUp(el.querySelector(".stat-value"));
      // När animationen är klar tas klasserna bort, så att kortens egna hover-effekter gäller igen.
      var wait = (parseFloat(el.style.getPropertyValue("--rv-delay")) || 0) * 1000 + (el.classList.contains("rv-words") ? 2200 : 1900);
      window.setTimeout(function () { done(el); }, wait);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  marked.forEach(function (el) { io.observe(el); });

  // Säkerhetsnät: skrollar man förbi (t.ex. med "Till toppen" eller ett ankare) ska inget bli kvar osynligt.
  window.addEventListener("hashchange", function () { marked.forEach(function (el) { el.classList.add("is-in"); }); });
  window.addEventListener("beforeprint", function () { marked.forEach(done); });

  /* ---------- 2. Siffror som räknas upp ---------- */

  function countUp(el) {
    if (!el || el.getAttribute("data-counted")) return;
    el.setAttribute("data-counted", "1");
    var original = el.textContent;
    var m = original.match(/^(\D*?)(\d[\d\s ]*)(.*)$/);
    if (!m) return;
    var target = parseInt(m[2].replace(/\D/g, ""), 10);
    if (!isFinite(target) || target < 2) return;
    var grouped = /[\s ]/.test(m[2].trim());
    // Årtal (t.ex. "2011") räknas från några år tidigare i stället för från noll.
    var isYear = !grouped && target >= 1800 && target <= 2100;
    var from = isYear ? target - 15 : 0;
    var fmt = grouped && window.Intl ? new Intl.NumberFormat("sv-SE") : null;
    var start = null;
    var dur = isYear ? 1200 : 1600;
    function frame(t) {
      if (start === null) start = t;
      var p = clamp((t - start) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      var v = Math.round(from + (target - from) * eased);
      el.textContent = p < 1 ? m[1] + (fmt ? fmt.format(v) : String(v)) + m[3] : original;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }
  // Statistikrutor som redan syns när sidan öppnas räknas när de kommer in i bild.
  var statIo = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { statIo.unobserve(e.target); countUp(e.target); } });
  }, { threshold: 0.6 });
  $$("main .stat-value").forEach(function (el) { if (!marked.has(el.closest(".stat"))) statIo.observe(el); });

  /* ---------- 3. Knappar: texten rullar vid hovring ---------- */

  if (FULL && window.matchMedia("(hover: hover)").matches) {
    $$("a.btn").forEach(function (btn) {
      if (btn.querySelector(".btn-roll") || btn.closest(".insta-feed")) return;
      var a = document.createElement("span");
      a.className = "btn-roll-a";
      while (btn.firstChild) a.appendChild(btn.firstChild);
      var b = a.cloneNode(true);
      b.className = "btn-roll-b";
      b.setAttribute("aria-hidden", "true");
      $$(".sr-only, [id]", b).forEach(function (n) { if (n.classList.contains("sr-only")) n.remove(); else n.removeAttribute("id"); });
      var wrap = document.createElement("span");
      wrap.className = "btn-roll";
      wrap.appendChild(a);
      wrap.appendChild(b);
      btn.appendChild(wrap);
    });
  }

  /* ---------- 4. Allt som följer skrollningen ---------- */

  var header = document.querySelector("[data-header]");
  var hero = FULL ? document.querySelector("main > .hero") : null;
  var bands = FULL ? $$("[data-wordband]") : [];
  var canHide = header && !document.querySelector(".section-nav");
  var lastY = window.scrollY;
  var heroH = 0;

  // Ridån: bara när toppen får plats ungefär på skärmen (inte i liggande mobil).
  if (hero) {
    if (vh < 520) hero = null;
    else root.classList.add("has-curtain");
  }

  function measure() {
    vh = window.innerHeight;
    if (hero) {
      heroH = hero.offsetHeight;
      // Är toppen högre än skärmen stannar den först när dess nederkant syns, så att inget döljs.
      hero.style.setProperty("--hero-top", Math.min(0, vh - heroH) + "px");
    }
    var long = document.documentElement.scrollHeight > vh * 2.6;
    root.classList.toggle("has-progress", !!header && long && !hero);
  }

  function frame() {
    ticking = false;
    var y = window.scrollY;
    if (hero) {
      var hp = clamp(y / (heroH || 1), 0, 1);
      hero.style.setProperty("--hp", hp.toFixed(4));
      // Helt täckt: göm toppen, så att den inte skymtar i glipor mellan avsnitten längre ned (och inte ritas i onödan).
      hero.classList.toggle("is-covered", hp >= 1);
    }

    if (header) {
      var dy = y - lastY;
      var menuOpen = root.classList.contains("menu-open") || header.contains(document.activeElement) && document.activeElement !== document.body;
      var threshold = hero ? heroH * 0.9 : 240;
      if (!canHide || menuOpen || y < threshold || dy < -4) header.classList.remove("is-hidden");
      else if (dy > 6) header.classList.add("is-hidden");
      if (root.classList.contains("has-progress")) {
        var max = document.documentElement.scrollHeight - vh;
        header.style.setProperty("--read", clamp(y / (max || 1), 0, 1).toFixed(4));
      }
    }

    bands.forEach(function (row) {
      var box = row.getBoundingClientRect();
      if (box.bottom < -200 || box.top > vh + 200) return;
      // 0 när raden kommer in nedtill, 1 när den lämnar upptill.
      var p = (vh - box.top) / (vh + box.height);
      var dir = parseFloat(row.getAttribute("data-wordband")) || 1;
      var track = row.firstElementChild;
      var x = dir < 0 ? -4 - p * 22 : -30 + p * 22;
      track.style.transform = "translate3d(" + x.toFixed(3) + "%,0,0)";
    });

    lastY = y;
  }

  var ticking = false;
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(frame); } }
  measure();
  frame();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { measure(); onScroll(); });
  window.addEventListener("load", function () { measure(); onScroll(); });
  // Tangentbord: kommer fokus in i sidhuvudet visas det direkt.
  if (header) header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });
})();

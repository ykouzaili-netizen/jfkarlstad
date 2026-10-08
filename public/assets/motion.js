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
    ".hk-vitrine", ".hm-catalog", ".hd-coins",
    ".purpose-list", ".job-list", ".doc-list", ".faq-list", ".contact-list", ".check-list",
  ].map(function (s) { return "main " + s + " > *"; }).join(",");
  // Bilder som avtäcks (bara i Full).
  var IMAGES = "main .intro-media > div, main .content-photo";
  // Delar av sidan där inget ska röra sig (karuseller, band, toppen, genvägsmenyn, kalendern).
  var SKIP = ".hero, .section-nav, [data-carousel], [data-marquee], .wordband, .cal-grid, [data-deck], .hb-panels, .hb-rack";

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

  /* ---------- 4. Genvägsmenyn: markera rubriken man hoppar till ---------- */

  /** Lägger en gul överstrykning under rubriken när man har kommit fram, och tar bort den efter en stund. */
  function markHeading(h) {
    if (!h) return;
    var mark = h.querySelector(":scope > .jump-mark");
    if (!mark) {
      mark = document.createElement("span");
      mark.className = "jump-mark";
      while (h.firstChild) mark.appendChild(h.firstChild);
      h.appendChild(mark);
    }
    mark.classList.remove("is-on", "is-off");
    void mark.offsetWidth; // börja om om man klickar igen
    mark.classList.add("is-on");
    window.clearTimeout(mark._t);
    mark._t = window.setTimeout(function () {
      mark.classList.add("is-off");
      mark._t = window.setTimeout(function () { mark.classList.remove("is-on", "is-off"); }, 950);
    }, 1900);
  }

  /** Väntar tills skrollningen har stannat (scrollend där det finns, annars en kort paus). */
  function whenScrollStops(fn) {
    var done = false, timer;
    function finish() { if (done) return; done = true; window.removeEventListener("scroll", reset); fn(); }
    function reset() { window.clearTimeout(timer); timer = window.setTimeout(finish, 160); }
    if ("onscrollend" in window) window.addEventListener("scrollend", finish, { once: true });
    window.addEventListener("scroll", reset, { passive: true });
    reset();
    window.setTimeout(finish, 2500);
  }

  $$("[data-section-nav] a[href^='#'], main a[href^='#']:not([href='#'])").forEach(function (a) {
    a.addEventListener("click", function () {
      var target = document.getElementById(a.getAttribute("href").slice(1));
      if (!target) return;
      var h = /^H[1-4]$/.test(target.tagName) ? target : target.querySelector("h2, h3");
      if (h) whenScrollStops(function () { markHeading(h); });
    });
  });

  /* ---------- 5. Rullande ord: de rörliga utseendena ---------- */

  function two(n) { return (n < 10 ? "0" : "") + n; }

  // Ordbyte: sista ordet byts var 2,6 sekund medan avsnittet syns. En kopia av första ordet sist i listan
  // gör att bytet tillbaka till början också glider uppåt.
  (FULL ? $$("[data-wb-swap]") : []).forEach(function (box) {
    var slot = box.querySelector(".wb-swap-slot");
    var track = box.querySelector(".wb-swap-track");
    var counter = box.querySelector("[data-wb-swap-n]");
    var n = track.children.length;
    if (n < 2) return;
    track.appendChild(track.children[0].cloneNode(true));
    var INTERVAL = 2600, i = 0, inView = false;
    box.classList.add("is-live");
    box.style.setProperty("--wb-int", INTERVAL + "ms");
    function fit() { slot.style.setProperty("--wb-w", track.children[i].offsetWidth + "px"); }
    function tick() { slot.classList.remove("is-ticking"); void slot.offsetWidth; slot.classList.add("is-ticking"); }
    function show() {
      track.style.transform = "translate3d(0," + (-i * 100 / (n + 1)).toFixed(4) + "%,0)";
      fit();
      counter.textContent = two((i % n) + 1);
      tick();
    }
    // Framme vid kopian: hoppa osynligt tillbaka till det riktiga första ordet.
    function rewind() {
      if (i !== n) return;
      track.style.transition = "none";
      i = 0;
      track.style.transform = "translate3d(0,0,0)";
      void track.offsetWidth;
      track.style.transition = "";
    }
    track.addEventListener("transitionend", function (e) { if (e.target === track) rewind(); });
    window.setInterval(function () {
      if (!inView || document.hidden) return;
      rewind(); // om transitionend uteblev (t.ex. i en bakgrundsflik)
      i++;
      show();
    }, INTERVAL);
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      box.classList.toggle("is-paused", !inView);
    }, { threshold: 0.3 }).observe(box);
    show();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener("resize", fit);
  });

  // Strålkastare
  var spot = FULL ? document.querySelector("[data-wb-spot]") : null;
  var spotSec = spot && spot.closest(".wordband");
  var spotWords = spot ? $$(".wb-spot-word", spot) : [];
  var spotLine = 0;
  if (spot && spotWords.length > 1) {
    spotSec.classList.add("is-live");
    spotSec.style.setProperty("--n", String(spotWords.length));
  } else spot = null;

  /** Kör `fn` med jämna mellanrum, men bara medan `el` syns och fliken är aktiv. */
  function whileVisible(el, threshold, onChange) {
    var visible = false;
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (onChange) onChange(visible);
    }, { threshold: threshold }).observe(el);
    return function () { return visible && !document.hidden; };
  }
  function wait(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }
  async function until(ok) { while (!ok()) await wait(250); }
  function lowerFirst(w) { return /^[A-ZÅÄÖ][a-zåäö]/.test(w) ? w.charAt(0).toLocaleLowerCase("sv") + w.slice(1) : w; }

  // Paragrafen: ordet raderas och nästa skrivs, och paragrafnumret räknas upp.
  (FULL ? $$("[data-wb-law]") : []).forEach(function (box) {
    var words = box.getAttribute("data-words").split("\n").filter(Boolean).map(lowerFirst);
    var out = box.querySelector("[data-wb-law-word]");
    var num = box.querySelector("[data-wb-law-n]");
    if (words.length < 2) return;
    var line = box.querySelector(".wb-law-line");
    box.classList.add("is-live");
    // Meningen står på en rad. Storleken räknas ut så att den längsta varianten (längsta ordet och högsta
    // paragrafnumret) får plats – då ändras aldrig höjden när orden byts och sidan nedanför står still.
    function fit() {
      var keepWord = out.textContent, keepNum = num.textContent;
      line.style.setProperty("--law-fit", "1");
      num.textContent = String(words.length);
      var widest = 0;
      words.forEach(function (w) { out.textContent = w; widest = Math.max(widest, line.scrollWidth); });
      out.textContent = keepWord;
      num.textContent = keepNum;
      var room = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
      line.style.setProperty("--law-fit", Math.min(1, room / (widest || 1) * 0.98).toFixed(4));
    }
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener("resize", fit);
    var ok = whileVisible(box, 0.4);
    (async function () {
      for (var w = 1, n = 1; ; w = (w + 1) % words.length) {
        await wait(2200);
        await until(ok);
        box.classList.add("is-typing");
        while (out.textContent.length) { out.textContent = out.textContent.slice(0, -1); await wait(38); }
        n = w === 0 ? 1 : n + 1;
        num.textContent = String(n);
        await wait(260);
        for (var i = 1; i <= words[w].length; i++) { out.textContent = words[w].slice(0, i); await wait(70 + Math.random() * 60); }
        box.classList.remove("is-typing");
      }
    })();
  });

  /* ---------- 6. Allt som följer skrollningen ---------- */

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
    if (spot) spotLine = spotWords[0].offsetHeight;
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

    if (spot) {
      var sr = spotSec.getBoundingClientRect();
      if (sr.bottom > -50 && sr.top < vh + 50) {
        // 0 när scenen fastnar upptill, 1 när den släpper – då har alla ord passerat mitten.
        var a = clamp(-sr.top / ((sr.height - vh) || 1), 0, 1) * (spotWords.length - 1);
        spot.style.transform = "translate3d(0," + (((spotWords.length - 1) / 2 - a) * spotLine).toFixed(2) + "px,0)";
        spotWords.forEach(function (w, k) {
          var d = Math.abs(k - a);
          w.style.setProperty("--d", d.toFixed(3));
          w.classList.toggle("is-on", d < 0.5);
        });
      }
    }

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

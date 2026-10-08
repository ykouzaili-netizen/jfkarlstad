/* JFK – progressiv förbättring. Sidan fungerar utan JavaScript; detta gör menyerna smidigare. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var DESKTOP = window.matchMedia("(min-width: 1100px)");

  /* ---------- Mobilmeny ---------- */
  var toggle = document.querySelector("[data-menu-toggle]");
  var nav = document.querySelector("[data-nav]");
  var label = toggle && toggle.querySelector(".menu-label");
  // Texterna kan ändras i adminpanelen och skickas med som data-attribut.
  var labelOpen = (toggle && toggle.getAttribute("data-label-open")) || "Meny";
  var labelClose = (toggle && toggle.getAttribute("data-label-close")) || "Stäng";

  function setMenu(open) {
    root.classList.toggle("menu-open", open);
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? labelClose : labelOpen;
  }

  if (toggle && nav) {
    // Utan JS är knappen en länk till sidkartan i sidfoten. Med JS blir den en riktig menyknapp.
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      setMenu(!root.classList.contains("menu-open"));
    });
    toggle.addEventListener("keydown", function (e) {
      if (e.key === " ") { e.preventDefault(); toggle.click(); }
    });
    nav.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (a && !DESKTOP.matches) setMenu(false);
    });
    DESKTOP.addEventListener("change", function () { setMenu(false); });
  }

  /* ---------- Undermenyer ---------- */
  var subs = Array.prototype.slice.call(document.querySelectorAll("[data-sub]"));

  function closeSubs(except) {
    subs.forEach(function (li) {
      if (li === except) return;
      li.classList.remove("is-open");
      var b = li.querySelector(".sub-toggle");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  subs.forEach(function (li) {
    var btn = li.querySelector(".sub-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var open = !li.classList.contains("is-open");
      if (DESKTOP.matches) closeSubs(li);
      li.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    li.addEventListener("focusout", function (e) {
      if (DESKTOP.matches && !li.contains(e.relatedTarget)) {
        li.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  });

  document.addEventListener("click", function (e) {
    if (DESKTOP.matches && !(e.target.closest && e.target.closest("[data-sub]"))) closeSubs();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openSub = subs.filter(function (li) { return li.classList.contains("is-open"); })[0];
    if (openSub && DESKTOP.matches) {
      closeSubs();
      var b = openSub.querySelector(".sub-toggle");
      if (b) b.focus();
    } else if (root.classList.contains("menu-open")) {
      setMenu(false);
      if (toggle) toggle.focus();
    }
  });

  /* ---------- Formulär: fokusera felsammanfattningen ---------- */
  var summary = document.querySelector("[data-focus]");
  if (summary) summary.focus();

  /* ---------- JF Påverka: dölj namn/e-post vid anonymt inskick ---------- */
  var anon = document.getElementById("falt-anonym");
  if (anon) {
    var identity = document.querySelectorAll(".js-identity");
    var syncAnon = function () {
      identity.forEach(function (el) {
        el.classList.toggle("is-hidden", anon.checked);
        el.querySelectorAll("input").forEach(function (i) { i.disabled = anon.checked; });
      });
    };
    anon.addEventListener("change", syncAnon);
    syncAnon();
  }

  /* ---------- Dokument: filtrera direkt medan man skriver ---------- */
  var docForm = document.querySelector("[data-doc-filter]");
  if (docForm) {
    var qInput = docForm.querySelector("input[name=q]");
    var catSelect = docForm.querySelector("select[name=kategori]");
    var counter = document.querySelector("[data-doc-count]");
    var countAll = (counter && counter.getAttribute("data-count-all")) || "{antal} dokument";
    var countMatch = (counter && counter.getAttribute("data-count-match")) || "{antal} dokument matchar";
    var filterDocs = function () {
      var q = (qInput.value || "").trim().toLocaleLowerCase("sv");
      var cat = catSelect.value;
      var shown = 0;
      document.querySelectorAll("[data-doc-year]").forEach(function (section) {
        var visibleInYear = 0;
        section.querySelectorAll("[data-doc]").forEach(function (item) {
          var ok = (!q || item.getAttribute("data-doc").indexOf(q) !== -1) && (!cat || item.getAttribute("data-cat") === cat);
          item.hidden = !ok;
          if (ok) visibleInYear++;
        });
        section.hidden = visibleInYear === 0;
        shown += visibleInYear;
      });
      if (counter) counter.textContent = (q || cat ? countMatch : countAll).replace("{antal}", String(shown));
      var empty = document.querySelector("[data-doc-empty]");
      if (empty) empty.hidden = shown !== 0;
    };
    qInput.addEventListener("input", filterDocs);
    catSelect.addEventListener("change", filterDocs);
  }

  /* ---------- Kopiera länk (kalenderprenumerationen) ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    var source = btn.parentNode.querySelector("[data-copy-source]");
    if (!source || !navigator.clipboard) return;
    btn.hidden = false;
    var text = btn.querySelector("span");
    var original = text ? text.textContent : "";
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(source.value).then(function () {
        if (text) text.textContent = btn.getAttribute("data-copied") || original;
        setTimeout(function () { if (text) text.textContent = original; }, 2500);
      }, function () {
        source.focus();
        source.select();
      });
    });
    source.addEventListener("focus", function () { source.select(); });
  });

  /* ---------- Vanliga frågor: öppna frågan som länken pekar på ---------- */
  var openFromHash = function () {
    if (!/^#fraga-\d+$/.test(location.hash)) return;
    var item = document.getElementById(location.hash.slice(1));
    if (item && item.tagName === "DETAILS") {
      item.open = true;
      item.scrollIntoView({ block: "start" });
    }
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  /* ---------- Kalendern: ruta med detaljer när man pekar på ett evenemang ----------
     Bara för mus/styrplatta. Utan JS (eller på pekskärm) är evenemanget en vanlig länk till sin sida. */
  var calGrid = document.querySelector(".cal-grid");
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (calGrid && canHover && !document.body.classList.contains("is-preview")) {
    var pop = document.createElement("div");
    pop.className = "cal-pop";
    pop.hidden = true;
    document.body.appendChild(pop);
    var current = null, hideTimer = null, showTimer = null;

    var place = function (chip) {
      var r = chip.getBoundingClientRect();
      var w = pop.offsetWidth, h = pop.offsetHeight;
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var left = Math.min(Math.max(12, r.left), vw - w - 12);
      var top = r.bottom + 8;
      pop.classList.toggle("is-above", top + h > vh - 12 && r.top - h - 8 > 12);
      if (pop.classList.contains("is-above")) top = r.top - h - 8;
      pop.style.left = (left + window.scrollX) + "px";
      pop.style.top = (top + window.scrollY) + "px";
    };
    var show = function (chip) {
      clearTimeout(hideTimer);
      if (current === chip && !pop.hidden) return;
      var src = document.getElementById(chip.getAttribute("data-pop"));
      if (!src) return;
      pop.innerHTML = src.innerHTML;
      pop.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
      pop.classList.toggle("is-members", chip.classList.contains("is-members"));
      pop.hidden = false;
      current = chip;
      place(chip);
    };
    var hide = function () { pop.hidden = true; current = null; };
    var hideSoon = function () { clearTimeout(showTimer); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 180); };

    calGrid.addEventListener("mouseover", function (e) {
      var chip = e.target.closest && e.target.closest("[data-pop]");
      if (!chip) return;
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { show(chip); }, pop.hidden ? 120 : 0);
    });
    calGrid.addEventListener("mouseout", function (e) {
      if (e.target.closest && e.target.closest("[data-pop]")) hideSoon();
    });
    pop.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    pop.addEventListener("mouseleave", hideSoon);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pop.hidden) hide(); });
    window.addEventListener("resize", hide);
  }

  /* ---------- Sektionsmenyn: markera avsnittet man läser ---------- */
  var sectionNav = document.querySelector("[data-section-nav]");
  if (sectionNav && "IntersectionObserver" in window) {
    var navLinks = Array.prototype.slice.call(sectionNav.querySelectorAll("a[href^='#']"));
    var targets = navLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var setActive = function (id) {
      navLinks.forEach(function (a) {
        var on = a.getAttribute("href") === "#" + id;
        a.classList.toggle("is-active", on);
        if (on) {
          a.setAttribute("aria-current", "true");
          var list = a.closest("ul");
          if (list && list.scrollWidth > list.clientWidth) list.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
        } else a.removeAttribute("aria-current");
      });
    };
    // Varje länk hör till avsnittet (<section>) som innehåller rubriken den pekar på.
    var sections = targets.map(function (t) { return t ? t.closest("section") || t : null; });
    var visible = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = sections.indexOf(en.target);
        if (i !== -1) visible[i] = en.isIntersecting;
      });
      for (var i = 0; i < sections.length; i++) {
        if (visible[i]) { setActive(targets[i].id); return; }
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach(function (sec) { if (sec) io.observe(sec); });
  }

  /* ---------- Skugga under sidhuvudet vid scroll ---------- */
  var header = document.querySelector("[data-header]");
  if (header) {
    var ticking = false;
    var update = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }
})();

/* Bildspel (Instagram på startsidan): pilar, piltangenter och valfri automatisk bläddring.
   Utan JS går det att skrolla i sidled ändå. Automatisk bläddring stannar vid hovring, fokus och egen
   bläddring, och körs aldrig för den som valt minskad rörelse. */
(function () {
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector("[data-carousel-track]");
    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    if (!track) return;

    function step() {
      var item = track.querySelector("li");
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      var w = item ? item.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
      // Bläddra så många hela inlägg som får plats, minst ett
      return Math.max(w, Math.floor(track.clientWidth / w) * w);
    }
    function atEnd() { return track.scrollLeft + track.clientWidth >= track.scrollWidth - 4; }
    // Bildspelet har inget slut: efter sista bilden kommer den första igen (och tvärtom).
    function update() {}
    function atStart() { return track.scrollLeft <= 4; }
    function go(dir) {
      if (dir > 0 && atEnd()) track.scrollTo({ left: 0, behavior: "smooth" });
      else if (dir < 0 && atStart()) track.scrollTo({ left: track.scrollWidth, behavior: "smooth" });
      else track.scrollBy({ left: dir * step(), behavior: "smooth" });
    }

    if (prev) prev.addEventListener("click", function () { stop(); go(-1); });
    if (next) next.addEventListener("click", function () { stop(); go(1); });
    track.addEventListener("scroll", update, { passive: true });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); stop(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stop(); go(-1); }
    });
    window.addEventListener("resize", update);
    update();

    // Automatisk bläddring
    var timer = null, paused = false, stopped = false;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function tick() {
      if (paused || stopped || document.hidden) return;
      if (atEnd()) track.scrollTo({ left: 0, behavior: "smooth" }); else go(1);
    }
    function stop() { stopped = true; if (timer) clearInterval(timer); }
    if (root.hasAttribute("data-autoplay") && !reduce) {
      timer = setInterval(tick, 5000);
      root.addEventListener("mouseenter", function () { paused = true; });
      root.addEventListener("mouseleave", function () { paused = false; });
      root.addEventListener("focusin", function () { paused = true; });
      root.addEventListener("focusout", function () { paused = false; });
      track.addEventListener("touchstart", stop, { passive: true });
      track.addEventListener("wheel", function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) stop(); }, { passive: true });
    }
  });
})();

/* Rullande Instagram-band: längden på animationen följer antal inlägg och vald hastighet, och knappen
   Pausa/Spela stoppar rörelsen (WCAG 2.2.2 – rörligt innehåll ska gå att pausa). */
(function () {
  document.querySelectorAll("[data-marquee]").forEach(function (root) {
    var track = root.querySelector("[data-marquee-track], .insta-track");
    // Bandet består av två lika halvor; en varvlängd = antalet inlägg i en halva.
    var half = track ? track.children.length / 2 : 0;
    var seconds = Number(root.getAttribute("data-seconds")) || 5;
    root.style.setProperty("--insta-duration", Math.max(12, half * seconds) + "s");
    root.style.setProperty("--marquee-duration", Math.max(12, half * seconds) + "s");
    // Minskad rörelse: bandet står still men är fortfarande en loop – raden går att skrolla oändligt åt
    // båda hållen (de två halvorna är identiska, så vi hoppar en halva när man når en kant).
    var viewport = root.querySelector(".insta-marquee-viewport, .marquee-viewport");
    if (viewport && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Exakt avstånd mellan första inlägget och dess kopia (scrollWidth räknar inte med sista marginalen).
      var halfWidth = function () {
        var items = track.children, n = items.length / 2;
        return n >= 1 ? items[n].offsetLeft - items[0].offsetLeft : track.scrollWidth / 2;
      };
      var wrapping = false;
      var start = function () { viewport.scrollLeft = halfWidth(); };
      if (document.readyState === "complete") start(); else window.addEventListener("load", start);
      viewport.addEventListener("scroll", function () {
        if (wrapping) return;
        var h = halfWidth(), max = viewport.scrollWidth - viewport.clientWidth;
        if (viewport.scrollLeft <= 1 || viewport.scrollLeft >= max - 1) {
          wrapping = true;
          viewport.scrollLeft += viewport.scrollLeft <= 1 ? h : -h;
          requestAnimationFrame(function () { wrapping = false; });
        }
      }, { passive: true });
    }
    var btn = root.querySelector("[data-marquee-toggle], [data-motion-toggle]");
    var label = root.querySelector("[data-marquee-label], [data-motion-label]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var paused = root.classList.toggle("is-paused");
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      if (label) label.textContent = paused ? btn.getAttribute("data-play-label") : btn.getAttribute("data-pause-label");
    });
  });
})();

/* Bildspel som tonar mellan bilderna (JFK Idrott). Byter bild var X:e sekund, stannar vid hovring, fokus och
   paus, och byter aldrig av sig självt för den som valt minskad rörelse. Prickarna väljer bild direkt. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-fader]").forEach(function (root) {
    var slides = root.querySelectorAll(".fader-slide");
    var dots = root.querySelectorAll("[data-fader-dot]");
    if (slides.length < 2) return;
    var current = 0, hover = false, paused = false;
    var seconds = Number(root.getAttribute("data-seconds")) || 5;
    function show(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (sl, j) {
        sl.classList.toggle("is-active", j === current);
        if (j === current) sl.removeAttribute("aria-hidden"); else sl.setAttribute("aria-hidden", "true");
      });
      dots.forEach(function (d, j) {
        d.classList.toggle("is-active", j === current);
        if (j === current) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
      });
    }
    dots.forEach(function (d) {
      d.addEventListener("click", function () { show(Number(d.getAttribute("data-fader-dot"))); });
    });
    root.addEventListener("mouseenter", function () { hover = true; });
    root.addEventListener("mouseleave", function () { hover = false; });
    root.addEventListener("focusin", function () { hover = true; });
    root.addEventListener("focusout", function () { hover = false; });
    var btn = root.querySelector("[data-motion-toggle]");
    var label = root.querySelector("[data-motion-label]");
    if (btn) {
      if (reduce) btn.hidden = true;
      btn.addEventListener("click", function () {
        paused = !paused;
        root.classList.toggle("is-paused", paused);
        btn.setAttribute("aria-pressed", paused ? "true" : "false");
        if (label) label.textContent = paused ? btn.getAttribute("data-play-label") : btn.getAttribute("data-pause-label");
      });
    }
    if (!reduce) {
      setInterval(function () {
        if (!hover && !paused && !document.hidden && !root.classList.contains("is-offscreen")) show(current + 1);
      }, seconds * 1000);
    }
  });
})();

/* Bildspel och rullande band: alla bilder laddas när bildspelet närmar sig skärmen. Webbläsarens
   loading="lazy" laddar annars bara bilder som syns – och bilderna utanför bandets ruta "syns" aldrig
   förrän de glider in, så bandet visade tomma rutor (som såg ut som ett slut på loopen). */
(function () {
  var shows = document.querySelectorAll("[data-marquee], [data-fader], [data-carousel]");
  if (!shows.length) return;
  function loadAll(el) {
    el.querySelectorAll("img[loading=lazy]").forEach(function (img) { img.loading = "eager"; });
  }
  if (!("IntersectionObserver" in window)) { shows.forEach(loadAll); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { loadAll(e.target); io.unobserve(e.target); }
    });
  }, { rootMargin: "800px 0px" });
  shows.forEach(function (el) { io.observe(el); });
})();

/* Pausa rullande band och bildspel som inte syns på skärmen – sparar batteri och gör skrollningen jämnare. */
(function () {
  if (!("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { e.target.classList.toggle("is-offscreen", !e.isIntersecting); });
  });
  document.querySelectorAll("[data-marquee], [data-fader]").forEach(function (el) { io.observe(el); });
})();

/* Utskotten på Engagera dig: ett utfällt kort i taget, skrolla till det som öppnas, och öppna rätt kort
   direkt om adressen slutar med #utskott-namn (länkarna från Om oss). */
(function () {
  var cards = document.querySelectorAll("[data-cm]");
  if (!cards.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function reveal(card) {
    requestAnimationFrame(function () {
      var top = card.getBoundingClientRect().top;
      var header = document.querySelector(".site-header");
      var offset = (header ? header.getBoundingClientRect().height : 0) + 16;
      if (top < offset || top > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + top - offset, behavior: reduce ? "auto" : "smooth" });
      }
    });
  }
  cards.forEach(function (card) {
    card.addEventListener("toggle", function () {
      if (!card.open) return;
      cards.forEach(function (other) { if (other !== card) other.open = false; });
      reveal(card);
      if (history.replaceState) history.replaceState(null, "", "#" + card.id);
    });
  });
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!/^utskott-/.test(id)) return;
    var card = document.getElementById(id);
    if (card && card.hasAttribute("data-cm")) card.open = true;
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();

/* Nedräkningar på Engagera dig: till att anmälan öppnar (sidan laddas om vid noll så att formuläret visas)
   och till att den stänger (ovanför formuläret). */
(function () {
  // Alla nedräkningar på sidan. data-countdown-reload = ladda om vid noll (anmälan öppnar);
  // annars stannar den på 00 så att den som fyller i formuläret inte tappar sin text.
  var timers = [];
  Array.prototype.forEach.call(document.querySelectorAll("[data-countdown]"), function (el) {
    var target = Date.parse(el.getAttribute("data-countdown") || "");
    if (!isFinite(target)) return;
    timers.push({
      target: target, reload: el.hasAttribute("data-countdown-reload"),
      d: el.querySelector("[data-countdown-d]"), h: el.querySelector("[data-countdown-h]"), m: el.querySelector("[data-countdown-m]"),
    });
  });
  if (!timers.length) return;
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function tick() {
    timers.forEach(function (t) {
      var ms = Math.max(0, t.target - Date.now());
      if (ms <= 0 && t.reload && !t.done) { t.done = true; window.location.reload(); return; }
      t.d.textContent = two(Math.floor(ms / 86400000));
      t.h.textContent = two(Math.floor((ms % 86400000) / 3600000));
      t.m.textContent = two(Math.floor((ms % 3600000) / 60000));
    });
  }
  tick();
  setInterval(tick, 15000);
})();

/* Bildspel: bilderna tonar över var sjätte sekund. Stannar när bildspelet inte syns, när fliken är dold,
   när man pekar på det och när man trycker på pausknappen. Står still för den som valt minskad rörelse
   eller rörelse "Av" (Utseende → Rörelse) – då visas den första bilden. */
(function () {
  var shows = document.querySelectorAll("[data-slides]");
  if (!shows.length) return;
  var level = document.documentElement.getAttribute("data-motion");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || level === "av") return;
  shows.forEach(function (box) {
    var slides = Array.prototype.filter.call(box.children, function (el) { return el.classList.contains("slide"); });
    if (slides.length < 2) return;
    var section = box.closest("section");
    var outside = section && section.querySelector("[data-slides-control]");
    var btn = outside || box.querySelector("[data-slides-pause]");
    var i = 0, paused = false, hover = false, visible = true;
    box.classList.add("is-live");
    // Ladda alla bilder i förväg, så att nästa bild aldrig tonar in tom.
    slides.forEach(function (img) { img.loading = "eager"; });
    function label() {
      btn.setAttribute("aria-pressed", String(paused));
      var sr = btn.querySelector(".sr-only");
      if (sr) sr.textContent = paused ? "Spela bildspelet" : "Pausa bildspelet";
    }
    if (btn) {
      btn.hidden = false;
      label();
      btn.addEventListener("click", function () { paused = !paused; label(); });
    }
    // Pekskärm: pausknappen i bilden visas först när man trycker på bilden och döljs igen efter en stund.
    if (btn && !outside) {
      var hideTimer = null;
      var hideLater = function () {
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(function () { box.classList.remove("show-controls"); }, 4000);
      };
      box.addEventListener("click", function (e) {
        if (btn.contains(e.target)) { hideLater(); return; }
        if (box.classList.toggle("show-controls")) hideLater();
        else window.clearTimeout(hideTimer);
      });
    }
    box.addEventListener("mouseenter", function () { hover = true; });
    box.addEventListener("mouseleave", function () { hover = false; });
    // Räknas som synligt först när minst halva bildspelet är i bild. Varje bild visas sex sekunder
    // av tid då den faktiskt syns – så den första bilden står kvar tills läsaren har skrollat fram och sett den.
    if ("IntersectionObserver" in window) {
      visible = false;
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting && es[0].intersectionRatio >= 0.5;
      }, { threshold: [0, 0.5] }).observe(box);
    }
    var shown = 0, STEP = 250;
    window.setInterval(function () {
      if (paused || hover || !visible || document.hidden) return;
      shown += STEP;
      if (shown < 6000) return;
      shown = 0;
      slides[i].classList.remove("is-active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("is-active");
    }, STEP);
  });
})();

(function () {
  "use strict";
  var root = document.documentElement;
  /* ---------- Om oss: hedersmedlemmar och utmärkelser (src/pages/honors.ts) ----------
     Utan skriptet syns allt: korten i en rad, alla band med sina medaljer under varandra och mynten med
     baksidan under framsidan. Här blir det bläddring, flikar och mynt som vänds. */
  var calm = root.getAttribute("data-motion") === "av" || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var scrollMode = calm ? "auto" : "smooth";

  // Kabinettet: pilar till porträttgalleriet
  document.querySelectorAll("[data-scroller]").forEach(function (list) {
    var nav = list.parentNode.querySelector("[data-scroller-nav]");
    if (!nav) return;
    var btns = nav.querySelectorAll("button");
    function update() {
      var max = list.scrollWidth - list.clientWidth - 2;
      nav.hidden = max <= 0;
      btns[0].disabled = list.scrollLeft <= 2;
      btns[1].disabled = list.scrollLeft >= max;
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var item = list.firstElementChild;
        var gap = parseFloat(getComputedStyle(list).columnGap) || 0;
        var step = item ? item.getBoundingClientRect().width + gap : list.clientWidth * 0.8;
        list.scrollBy({ left: Number(b.getAttribute("data-dir")) * step, behavior: scrollMode });
      });
    });
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  // Ordensbandet: banden blir flikar
  document.querySelectorAll("[data-tabs]").forEach(function (rack) {
    var tabs = Array.prototype.slice.call(rack.querySelectorAll("[data-tab]"));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("data-tab")); });
    if (tabs.length < 2 || panels.some(function (p) { return !p; })) return;
    panels[0].parentNode.classList.add("is-tabbed");
    rack.setAttribute("role", "tablist");
    tabs.forEach(function (t, i) {
      t.setAttribute("role", "tab");
      t.id = "flik-" + panels[i].id;
      t.setAttribute("aria-controls", panels[i].id);
      t.removeAttribute("aria-current");
      panels[i].setAttribute("role", "tabpanel");
      panels[i].setAttribute("aria-labelledby", t.id);
      panels[i].tabIndex = 0;
    });
    function select(i, animate) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        panels[j].classList.remove("is-entering");
      });
      if (animate) { void panels[i].offsetWidth; panels[i].classList.add("is-entering"); }
      // Håll vald flik i bild när banden går att svepa i sidled (mobil)
      var t = tabs[i], left = t.offsetLeft - rack.offsetLeft;
      if (left < rack.scrollLeft || left + t.offsetWidth > rack.scrollLeft + rack.clientWidth) rack.scrollTo({ left: left - 16, behavior: scrollMode });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function (e) { e.preventDefault(); select(i, true); });
      t.addEventListener("keydown", function (e) {
        var to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        to = (to + tabs.length) % tabs.length;
        select(to, true);
        tabs[to].focus();
      });
    });
    var start = panels.findIndex(function (p) { return "#" + p.id === location.hash; });
    select(start < 0 ? 0 : start, false);
  });

  // Kortleken: bläddra bland hedersmedlemmarna
  document.querySelectorAll("[data-deck]").forEach(function (deck) {
    var cards = Array.prototype.slice.call(deck.querySelectorAll("[data-deck-card]"));
    var n = cards.length;
    var controls = deck.querySelector("[data-deck-controls]");
    if (n < 2 || !controls) return;
    var current = deck.querySelector("[data-deck-current]");
    var index = deck.parentNode.querySelector(".hd-index");
    var links = index ? Array.prototype.slice.call(index.querySelectorAll("[data-deck-go]")) : [];
    var status = document.createElement("p");
    status.className = "sr-only";
    status.setAttribute("aria-live", "polite");
    deck.appendChild(status);
    var at = 0;

    function layout(announce) {
      cards.forEach(function (c, i) {
        var pos = (i - at + n) % n;
        var front = pos === 0;
        c.setAttribute("data-pos", pos <= 3 ? String(pos) : "ute");
        c.setAttribute("aria-hidden", String(!front));
        c.inert = !front;
      });
      if (current) current.textContent = String(at + 1);
      links.forEach(function (a, i) { a.setAttribute("aria-current", String(i === at)); });
      var name = cards[at].querySelector(".hd-name");
      if (announce && name) status.textContent = name.textContent + ", " + (at + 1) + " av " + n;
    }
    function go(to, dir) {
      to = (to + n) % n;
      if (to === at) return;
      var moving = dir > 0 ? cards[at] : cards[to];
      var cls = dir > 0 ? "is-thrown" : "is-returning";
      at = to;
      moving.classList.remove("is-thrown", "is-returning");
      void moving.offsetWidth;
      moving.classList.add(cls);
      window.setTimeout(function () { moving.classList.remove(cls); }, 650);
      layout(true);
    }
    deck.classList.add("is-ready");
    controls.hidden = false;
    layout(false);

    deck.querySelector("[data-deck-prev]").addEventListener("click", function () { go(at - 1, -1); });
    deck.querySelector("[data-deck-next]").addEventListener("click", function () { go(at + 1, 1); });
    deck.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1, 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1, -1); }
    });
    links.forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        go(i, i > at ? 1 : -1);
        var r = deck.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) deck.scrollIntoView({ behavior: scrollMode, block: "center" });
      });
    });
    // Svep (eller dra med musen) åt vänster för nästa, åt höger för föregående
    var stack = deck.querySelector("[data-deck-cards]");
    var startX = null, startY = 0;
    stack.addEventListener("pointerdown", function (e) { startX = e.clientX; startY = e.clientY; });
    stack.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) go(at + 1, 1); else go(at - 1, -1);
    });
    stack.addEventListener("pointercancel", function () { startX = null; });
  });

  // Kortleken: mynten vänds för att visa baksidan
  document.querySelectorAll(".hd-coin").forEach(function (coin) {
    var inner = coin.querySelector("[data-flip]");
    var btn = coin.querySelector("[data-flip-btn]");
    if (!inner || !btn) return;
    var front = inner.querySelector(".hd-front");
    var back = inner.querySelector(".hd-back");
    function set(on) {
      inner.classList.toggle("is-flipped", on);
      btn.setAttribute("aria-expanded", String(on));
      front.inert = on;
      back.inert = !on;
      front.setAttribute("aria-hidden", String(on));
      back.setAttribute("aria-hidden", String(!on));
    }
    coin.classList.add("is-ready");
    btn.hidden = false;
    set(false);
    btn.addEventListener("click", function () { set(!inner.classList.contains("is-flipped")); });
    front.addEventListener("click", function () { set(true); });
  });
})();

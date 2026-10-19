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

/* Hedersmedlemmar, Porträttgalleriet: tidslinjen fylls och punkterna blir ifyllda när man scrollar förbi.
   Utan JS (eller med minskad rörelse) är allt ifyllt från början. */
(function () {
  var g = document.querySelector("[data-hg]");
  if (!g || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var rows = g.querySelectorAll(".hg-row"), line = g.querySelector(".hg-line i"), on = false, queued = false;
  g.classList.add("is-live");
  function frame() {
    queued = false;
    // Först alla mätningar, sedan alla ändringar (ingen tvingad omräkning mitt i bildrutan).
    var r = g.getBoundingClientRect(), mid = innerHeight * 0.62, seen = [];
    for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); seen.push(b.top + b.height / 2 < mid); }
    var p = Math.min(1, Math.max(0, (mid - r.top) / r.height));
    if (line) line.style.transform = "scaleY(" + p.toFixed(4) + ")";
    for (var j = 0; j < rows.length; j++) if (rows[j].classList.contains("is-seen") !== seen[j]) rows[j].classList.toggle("is-seen", seen[j]);
  }
  function onScroll() { if (on && !queued) { queued = true; requestAnimationFrame(frame); } }
  new IntersectionObserver(function (e) { on = e[0].isIntersecting; if (on) onScroll(); }, { rootMargin: "200px 0px" }).observe(g);
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  // Tidigare år fälls ut/ihop: linjen och punkterna räknas om medan höjden ändras.
  g.addEventListener("toggle", function () { var t = performance.now(); (function tick() { frame(); if (performance.now() - t < 800) requestAnimationFrame(tick); })(); }, true);
  frame();
})();

/* Diplomen i Porträttgalleriet: klick på den mörka ytan utanför diplomet stänger det (krysset och Esc fungerar alltid),
   och ett diplom som öppnas igen börjar alltid från toppen. */
document.addEventListener("click", function (e) {
  var t = e.target;
  if (t instanceof HTMLElement && t.classList.contains("hg-dialog") && t.hidePopover) t.hidePopover();
});
document.addEventListener("toggle", function (e) {
  var t = e.target;
  if (t instanceof HTMLElement && t.classList.contains("hg-dialog") && e.newState === "open") t.scrollTop = 0;
}, true);

/* Årets pedagog, Plaketterna: välj ett år (de andra tonas ned) och porträtten lutar sig efter pekaren.
   Utan JS syns alla år och årsvalet är dolt. */
(function () {
  var filter = document.querySelector("[data-pd-filter]"), grid = document.querySelector("[data-pd-grid]");
  if (filter && grid) {
    filter.hidden = false;
    filter.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var y = b.getAttribute("data-y");
      filter.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      grid.querySelectorAll(".pd-card").forEach(function (c) {
        var hit = !y || c.getAttribute("data-years").split(" ").indexOf(y) >= 0;
        c.classList.toggle("is-out", !hit);
        c.classList.toggle("is-hit", !!y && hit);
      });
    });
  }
  if (!grid || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
  grid.addEventListener("pointermove", function (e) {
    var f = e.target.closest(".pd-face");
    if (!f) return;
    var r = f.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, p = f.firstElementChild;
    p.style.setProperty("--ry", ((x - 0.5) * 16).toFixed(1) + "deg");
    p.style.setProperty("--rx", ((0.5 - y) * 16).toFixed(1) + "deg");
    p.style.setProperty("--sx", Math.round(x * 100) + "%");
    p.style.setProperty("--sy", Math.round(y * 100) + "%");
  });
  grid.addEventListener("pointerout", function (e) {
    var f = e.target.closest(".pd-face");
    if (f && !f.contains(e.relatedTarget)) { f.firstElementChild.style.removeProperty("--rx"); f.firstElementChild.style.removeProperty("--ry"); }
  });
})();

/* Diplomen för Årets pedagog: pilarna byter diplom. Utan JS öppnas nästa ovanpå (popovertarget);
   med JS stängs det nuvarande först så att bara ett är öppet och Esc/klick utanför stänger allt. */
document.addEventListener("click", function (e) {
  var b = e.target instanceof Element && e.target.closest(".dp-step[popovertarget]");
  if (!b) return;
  var cur = b.closest("[popover]"), next = document.getElementById(b.getAttribute("popovertarget"));
  if (!cur || !next || !cur.hidePopover) return;
  e.preventDefault();
  cur.hidePopover();
  next.showPopover();
  var same = next.querySelector(".dp-step--" + (b.classList.contains("dp-step--prev") ? "prev" : "next") + ":not([disabled])");
  (same || next.querySelector(".dp-close")).focus();
});

/* Bildgalleriet: byt album och år utan att ladda om sidan. Länkarna fungerar som vanligt utan JS. */
(function () {
  var gal = document.querySelector("[data-gal]");
  if (!gal) return;
  function pick(list, attr, value) {
    list.forEach(function (el) {
      var on = el.getAttribute(attr) === value;
      if (el.tagName === "A") { if (on) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current"); }
      else el.hidden = !on;
    });
  }
  gal.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-gal-album], a[data-gal-year]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    var shown;
    if (a.hasAttribute("data-gal-album")) {
      var album = a.getAttribute("data-gal-album");
      pick(gal.querySelectorAll("a[data-gal-album]"), "data-gal-album", album);
      pick(gal.querySelectorAll("[data-gal-panel]"), "data-gal-panel", album);
      var panel = gal.querySelector('[data-gal-panel="' + album + '"]');
      shown = panel && panel.querySelector("[data-gal-year-panel]:not([hidden])");
    } else {
      var p = a.closest("[data-gal-panel]"), year = a.getAttribute("data-gal-year");
      pick(p.querySelectorAll("a[data-gal-year]"), "data-gal-year", year);
      pick(p.querySelectorAll("[data-gal-year-panel]"), "data-gal-year-panel", year);
      shown = p.querySelector('[data-gal-year-panel="' + year + '"]');
    }
    if (shown) { shown.classList.remove("is-in"); void shown.offsetWidth; shown.classList.add("is-in"); }
    if (history.replaceState) history.replaceState(null, "", a.getAttribute("href"));
  });
})();

/* Biografen: spelaren från YouTube laddas först när besökaren trycker på play (innan dess kontaktas inte YouTube),
   och programmet byter film utan att ladda om sidan. Utan JS: knappen öppnar filmen på YouTube, programmet är länkar. */
(function () {
  var hall = document.querySelector("[data-cine]");
  if (!hall) return;
  function stop(screen) {
    var frame = screen.querySelector("[data-cine-frame]");
    if (frame && frame.hasAttribute("data-orig")) { frame.innerHTML = frame.getAttribute("data-orig"); frame.removeAttribute("data-orig"); }
    screen.classList.remove("is-playing");
  }
  hall.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var play = e.target.closest(".cine-play");
    if (play) {
      e.preventDefault();
      var frame = play.closest("[data-cine-frame]"), screen = play.closest("[data-cine-screen]");
      var f = document.createElement("iframe");
      f.src = play.getAttribute("data-embed");
      f.title = play.getAttribute("data-title") || "Film";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      frame.setAttribute("data-orig", frame.innerHTML);
      frame.innerHTML = "";
      frame.appendChild(f);
      screen.classList.add("is-playing");
      f.focus();
      return;
    }
    var pick = e.target.closest("[data-cine-pick]");
    if (!pick) return;
    e.preventDefault();
    var id = pick.getAttribute("data-cine-pick");
    hall.querySelectorAll("[data-cine-screen]").forEach(function (s) {
      var on = s.getAttribute("data-cine-screen") === id;
      if (!on) stop(s);
      s.hidden = !on;
      if (on) { s.classList.remove("is-in"); void s.offsetWidth; s.classList.add("is-in"); if (s.getBoundingClientRect().top < 0) s.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    hall.querySelectorAll("[data-cine-pick]").forEach(function (a) { if (a === pick) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (history.replaceState) history.replaceState(null, "", pick.getAttribute("href"));
  });
})();

/* Bildgalleriet: en bild öppnas i en ruta på sidan med Ladda ned, Öppna i ny flik och krysset. Klick utanför bilden,
   krysset eller Esc stänger; pilarna (knapparna, piltangenterna eller ett svep) byter bild inom samma album och år.
   Utan JS (eller med Ctrl/Cmd-klick) öppnas bilden i ny flik som vanligt. */
(function () {
  var gal = document.querySelector("[data-gal]");
  var dlg = gal && gal.querySelector("[data-gal-lb]");
  if (!dlg || typeof dlg.showModal !== "function") return;
  var img = dlg.querySelector("[data-gal-lb-img]"), cap = dlg.querySelector("[data-gal-lb-caption]");
  var remove = dlg.querySelector("[data-gal-lb-remove]");
  var capText = dlg.querySelector("[data-gal-lb-text]"), capPhoto = dlg.querySelector("[data-gal-lb-photo]");
  var count = dlg.querySelector("[data-gal-lb-count]"), dl = dlg.querySelector("[data-gal-lb-download]"), open = dlg.querySelector("[data-gal-lb-open]");
  var prev = dlg.querySelector('[data-gal-lb-step="-1"]'), next = dlg.querySelector('[data-gal-lb-step="1"]');
  var template = dlg.getAttribute("data-count") || "{nr} / {antal}";
  var shareBtn = dlg.querySelector("[data-gal-lb-share]"), note = dlg.querySelector("[data-gal-lb-note]");
  var playBtn = dlg.querySelector("[data-gal-lb-play]"), playLabel = dlg.querySelector("[data-gal-lb-play-label]");
  var progress = dlg.querySelector("[data-gal-lb-progress]");
  var fsBtn = dlg.querySelector("[data-gal-lb-fs]"), fsLabel = dlg.querySelector("[data-gal-lb-fs-label]");
  var list = [], index = 0, opener = null, timer = null, noteTimer = null, savedY = 0;
  var SLIDE_MS = 5000;

  // Adressen till bilden som visas: samma sida med album, år och bild (servern väljer rätt album, site.js öppnar bilden)
  function imageUrl(a) {
    var panel = a.closest("[data-gal-panel]"), year = a.closest("[data-gal-year-panel]");
    var q = "?album=" + encodeURIComponent(panel ? panel.getAttribute("data-gal-panel") : "") +
      (year ? "&ar=" + encodeURIComponent(year.getAttribute("data-gal-year-panel")) : "") +
      "&bild=" + encodeURIComponent(a.getAttribute("data-gal-id"));
    return location.origin + location.pathname + q + "#bildgalleri";
  }
  function say(text) {
    note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.textContent = ""; }, 2500);
  }

  // Bildspel: nästa bild var femte sekund, med en tunn tidslinje överst. Pausas när fliken döljs eller rutan stängs.
  function setPlaying(on) {
    clearTimeout(timer);
    timer = null;
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playLabel.textContent = dlg.getAttribute(on ? "data-pause" : "data-play");
    dlg.classList.toggle("is-playing", on);
    progress.hidden = !on;
    if (on) tick();
  }
  function tick() {
    clearTimeout(timer);
    var bar = progress.firstElementChild;
    bar.classList.remove("is-running");
    void bar.offsetWidth;
    bar.classList.add("is-running");
    timer = setTimeout(function () { show(index + 1); }, SLIDE_MS); // show() startar nästa varv så länge bildspelet går
  }
  playBtn.addEventListener("click", function () { setPlaying(!dlg.classList.contains("is-playing")); });
  document.addEventListener("visibilitychange", function () { if (document.hidden && dlg.classList.contains("is-playing")) setPlaying(false); });

  // Helskärm (t.ex. bildspel på en projektor). Knappen visas bara där webbläsaren kan det – inte på iPhone.
  // Det är bildrutans innehåll som går i helskärm: en dialogruta får inte göra det själv, och går hela sidan i
  // helskärm hamnar sidan ovanpå bildrutan. I helskärm tonas knapparna bort efter tre sekunder utan rörelse.
  var root = dlg.querySelector("[data-gal-lb-inner]");
  var canFs = !!(document.fullscreenEnabled && root && root.requestFullscreen);
  var isFs = function () { return document.fullscreenElement === root; };
  fsBtn.hidden = !canFs;
  var idleTimer = null;
  function wake() {
    dlg.classList.remove("is-idle");
    clearTimeout(idleTimer);
    if (isFs()) idleTimer = setTimeout(function () { dlg.classList.add("is-idle"); }, 3000);
  }
  function syncFs() {
    var on = isFs();
    dlg.classList.toggle("is-fullscreen", on);
    fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    var text = fsBtn.getAttribute(on ? "data-exit" : "data-enter");
    fsLabel.textContent = text;
    fsBtn.title = text;
    wake();
  }
  if (canFs) {
    fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else root.requestFullscreen().catch(function () {});
    });
    document.addEventListener("fullscreenchange", syncFs);
    dlg.addEventListener("pointermove", wake);
    dlg.addEventListener("keydown", wake);
  }

  shareBtn.addEventListener("click", function () {
    var a = list[index], url = imageUrl(a);
    if (navigator.share) {
      navigator.share({ title: dlg.getAttribute("data-share-title") || document.title, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { say(dlg.getAttribute("data-copied") || ""); }, function () { window.prompt("", url); });
    } else {
      window.prompt("", url);
    }
  });

  function show(i) {
    index = (i + list.length) % list.length;
    var a = list[index], thumb = a.querySelector("img");
    img.removeAttribute("srcset");
    img.src = thumb ? thumb.currentSrc || thumb.src : a.href; // det som redan är laddat visas direkt …
    if (thumb && thumb.getAttribute("srcset")) {
      img.sizes = "(min-width: 1400px) 1400px, 100vw"; // … och den skarpa versionen tar över
      img.srcset = thumb.getAttribute("srcset");
    }
    img.alt = thumb ? thumb.alt : "";
    var text = a.getAttribute("data-gal-caption") || "", photo = a.getAttribute("data-gal-photo") || "";
    capText.textContent = text;
    capPhoto.textContent = photo;
    cap.hidden = !text && !photo;
    if (remove) {
      var body = (remove.getAttribute("data-body") || "").replace("{adress}", a.href);
      remove.href = remove.getAttribute("href").split("?")[0] + "?subject=" + encodeURIComponent(remove.getAttribute("data-subject") || "") + "&body=" + encodeURIComponent(body.replace(/\r?\n/g, "\r\n"));
    }
    dl.href = a.href;
    dl.setAttribute("download", a.getAttribute("data-gal-name") || "");
    open.href = a.href;
    var label = template.replace("{nr}", String(index + 1)).replace("{antal}", String(list.length));
    count.textContent = list.length > 1 ? label : "";
    dlg.setAttribute("aria-label", label);
    prev.hidden = next.hidden = playBtn.hidden = list.length < 2;
    // Adressfältet visar bilden, så att den kan kopieras eller bokmärkas direkt
    if (history.replaceState && dlg.open) history.replaceState(null, "", imageUrl(a));
    // Nästa bild laddas i förväg (bildspelet och pilarna känns direkta)
    var nextThumb = list.length > 1 && list[(index + 1) % list.length].querySelector("img");
    if (nextThumb && nextThumb.getAttribute("srcset")) { var pre = new Image(); pre.sizes = img.sizes; pre.srcset = nextThumb.getAttribute("srcset"); }
    if (dlg.classList.contains("is-playing")) tick();
  }
  function close() { if (dlg.open) dlg.close(); }

  // Sidans läge sparas när rutan öppnas och återställs exakt när den stängs. Vissa webbläsare (t.ex. Safari)
  // flyttar annars sidan när fokus lämnas tillbaka eller när skrollspärren släpps. Utan animation, även om sidan
  // annars skrollar mjukt.
  function restoreScroll() {
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
  }
  function openAt(a) {
    var panel = a.closest("[data-gal-year-panel]") || gal;
    list = Array.prototype.slice.call(panel.querySelectorAll("a[data-gal-item]"));
    opener = a;
    savedY = window.scrollY;
    document.documentElement.classList.add("gal-lb-open");
    dlg.showModal();
    show(list.indexOf(a));
  }
  gal.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-gal-item]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openAt(a);
  });
  // En delad länk (?bild=12) öppnar bilden direkt
  var wanted = new URLSearchParams(location.search).get("bild");
  var target = wanted && gal.querySelector('a[data-gal-item][data-gal-id="' + wanted.replace(/[^0-9]/g, "") + '"]');
  if (target) {
    target.scrollIntoView({ block: "center", behavior: "instant" });
    openAt(target);
  }
  dlg.addEventListener("close", function () {
    setPlaying(false);
    if (document.fullscreenElement === root) document.exitFullscreen().catch(function () {});
    clearTimeout(idleTimer);
    dlg.classList.remove("is-idle");
    if (history.replaceState) {
      var q = new URLSearchParams(location.search);
      q.delete("bild");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + "#bildgalleri");
    }
    document.documentElement.classList.remove("gal-lb-open");
    img.removeAttribute("srcset");
    img.removeAttribute("src");
    if (opener) opener.focus({ preventScroll: true });
    restoreScroll();
    requestAnimationFrame(function () { restoreScroll(); setTimeout(restoreScroll, 60); });
  });
  dlg.addEventListener("click", function (e) {
    var step = e.target.closest("[data-gal-lb-step]");
    if (step) { show(index + Number(step.getAttribute("data-gal-lb-step"))); return; }
    if (e.target.closest("[data-gal-lb-close]")) { close(); return; }
    // Klick på den mörka ytan runt bilden (inte på bilden, bildtexten eller knapparna) stänger
    if (!e.target.closest("img, a, button, figcaption")) close();
  });
  dlg.addEventListener("keydown", function (e) {
    if (list.length < 2) return;
    if ((e.key === "f" || e.key === "F") && canFs && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); fsBtn.click(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
  });
  var x0 = null;
  dlg.addEventListener("touchstart", function (e) { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    if (x0 === null || list.length < 2) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
})();

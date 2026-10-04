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
    function update() {
      if (prev) prev.disabled = track.scrollLeft <= 4;
      if (next) next.disabled = atEnd();
    }
    function go(dir) { track.scrollBy({ left: dir * step(), behavior: "smooth" }); }

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
        if (!hover && !paused && !document.hidden) show(current + 1);
      }, seconds * 1000);
    }
  });
})();

/*
 * Merch- och märkestävlingen (/tavling) – laddas bara på den sidan.
 * Sidan fungerar utan det här skriptet; skriptet lägger till:
 *  1. Läget och nedräkningen – byter läge av sig själv när tiden passerar (samma regler som src/lib/competition.ts).
 *  2. Flikarna – riktiga flikar med tangentbord och adresser som går att dela (#regler, #delta, #regel-3 …).
 *  3. Ämnesraden och kopieringsknapparna i kortet "Skicka in ditt bidrag".
 * Varje del ligger i en egen IIFE, som i site.js.
 */

/* ── 1. Läget och nedräkningen ─────────────────────────────────────────── */
(function () {
  var root = document.querySelector("[data-tavling]");
  if (!root) return;

  var t = {
    open: Date.parse(root.getAttribute("data-open")),
    deadlineEnd: Date.parse(root.getAttribute("data-deadline-end")),
    voteStart: Date.parse(root.getAttribute("data-vote-start")),
    voteEndEnd: Date.parse(root.getAttribute("data-vote-end-end")),
  };
  if ([t.open, t.deadlineEnd, t.voteStart, t.voteEndEnd].some(isNaN)) return;

  // Webbläsarens klocka kan gå fel. Sidan bär serverns tid (data-now); skiljer den mer än en minut används den.
  var server = Date.parse(root.getAttribute("data-now"));
  var skew = !isNaN(server) && Math.abs(server - Date.now()) > 60000 ? server - Date.now() : 0;

  function phaseAt(now) {
    if (now < t.open) return "before";
    if (now < t.deadlineEnd) return "open";
    if (now < t.voteStart) return "between";
    if (now < t.voteEndEnd) return "voting";
    return "done";
  }
  function targetFor(phase) {
    if (phase === "before" || phase === "open") return t.deadlineEnd;
    if (phase === "between") return t.voteStart;
    if (phase === "voting") return t.voteEndEnd;
    return null;
  }
  function progressAt(now) {
    var p = [t.open, t.deadlineEnd, t.voteStart, t.voteEndEnd];
    if (now <= p[0]) return 0;
    for (var i = 0; i < p.length - 1; i++) {
      if (now < p[i + 1]) return (i + (p[i + 1] > p[i] ? (now - p[i]) / (p[i + 1] - p[i]) : 1)) / (p.length - 1);
    }
    return 1;
  }

  /* data-states="before:soon open:open …" → data-state, och barnen med data-when visas bara i rätt tillstånd. */
  function applyPhase(phase) {
    var owners = [root].concat(Array.prototype.slice.call(root.querySelectorAll("[data-states]")));
    owners.forEach(function (el) {
      var map = {};
      (el.getAttribute("data-states") || "").split(" ").forEach(function (pair) {
        var i = pair.indexOf(":");
        if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
      });
      var state = map[phase] || "";
      if (el.getAttribute("data-state") === state) return;
      el.setAttribute("data-state", state);
      el.querySelectorAll("[data-when]").forEach(function (child) {
        var owner = child.parentElement && child.parentElement.closest("[data-states]");
        if (owner !== el) return;
        child.hidden = (" " + child.getAttribute("data-when") + " ").indexOf(" " + state + " ") === -1;
      });
    });
  }

  var nums = {};
  root.querySelectorAll("[data-unit]").forEach(function (el) { nums[el.getAttribute("data-unit")] = el; });
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setNum(unit, value) {
    var el = nums[unit];
    if (!el) return;
    var text = unit === "d" ? String(value) : String(value).padStart(2, "0");
    if (el.textContent === text) return;
    el.textContent = text;
    var label = el.nextElementSibling;
    if (label && label.hasAttribute("data-one")) label.textContent = value === 1 ? label.getAttribute("data-one") : label.getAttribute("data-many");
    if (!reduce) {
      el.classList.remove("is-tick");
      void el.offsetWidth; // starta om animationen
      el.classList.add("is-tick");
    }
  }

  var lastPhase = null;
  var lastProgress = -1;
  function tick() {
    var now = Date.now() + skew;
    var phase = phaseAt(now);
    if (phase !== lastPhase) {
      applyPhase(phase);
      lastPhase = phase;
    }
    var target = targetFor(phase);
    if (target !== null) {
      var total = Math.max(0, Math.floor((target - now) / 1000));
      setNum("d", Math.floor(total / 86400));
      setNum("h", Math.floor((total % 86400) / 3600));
      setNum("m", Math.floor((total % 3600) / 60));
      setNum("s", total % 60);
    }
    var p = Math.round(progressAt(now) * 1000) / 1000;
    if (p !== lastProgress) {
      root.style.setProperty("--t-progress", String(p));
      lastProgress = p;
    }
  }

  var timer = null;
  function start() {
    stop();
    tick();
    // Synka mot hela sekunder så att siffrorna byts samtidigt som klockan.
    timer = setTimeout(function loop() {
      tick();
      timer = setTimeout(loop, 1000 - ((Date.now() + skew) % 1000));
    }, 1000 - ((Date.now() + skew) % 1000));
  }
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  start();
})();

/* ── 2. Flikarna ───────────────────────────────────────────────────────── */
(function () {
  var root = document.querySelector("[data-tavling]");
  var nav = root && root.querySelector("[data-tabs]");
  if (!nav) return;
  var tabs = Array.prototype.slice.call(nav.querySelectorAll("[data-tab]"));
  var panels = tabs.map(function (tab) { return document.getElementById(tab.getAttribute("data-tab")); });
  if (panels.some(function (p) { return !p; })) return;

  nav.setAttribute("role", "tablist");
  tabs.forEach(function (tab, i) {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[i].id);
    panels[i].setAttribute("role", "tabpanel");
    panels[i].setAttribute("tabindex", "-1");
  });
  root.classList.add("has-tabs");

  var bar = root.querySelector(".t-tabs-bar");

  function select(index, opts) {
    opts = opts || {};
    tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.setAttribute("tabindex", on ? "0" : "-1");
      panels[i].hidden = !on;
    });
    if (opts.focusTab) tabs[index].focus();
    if (opts.updateUrl !== false) {
      var hash = "#" + panels[index].id;
      if (location.hash !== hash) history.replaceState(null, "", index === 0 ? location.pathname + location.search : hash);
    }
    if (opts.scroll) {
      // Rulla så att flikraden hamnar under sidhuvudet (bara om den är utanför bilden).
      var top = bar.getBoundingClientRect().top;
      var header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
      if (top < header - 1 || top > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + top - header, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      panels[index].focus({ preventScroll: true });
    }
  }

  /** Vilken flik innehåller ankaret? (#regler, #regel-3, #vinnare …) */
  function indexForHash(hash) {
    var id = decodeURIComponent((hash || "").replace(/^#/, ""));
    if (!id) return -1;
    var el = document.getElementById(id);
    if (!el) return -1;
    for (var i = 0; i < panels.length; i++) if (panels[i] === el || panels[i].contains(el)) return i;
    return -1;
  }

  function fromHash(scroll) {
    var i = indexForHash(location.hash);
    if (i < 0) return false;
    select(i, { updateUrl: false });
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (scroll && target && target !== panels[i]) target.scrollIntoView();
    else if (scroll) select(i, { updateUrl: false, scroll: true });
    return true;
  }

  if (!fromHash(true)) select(0, { updateUrl: false });

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      select(i);
    });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      select(next, { focusTab: true });
    });
  });

  // Knapparna i toppen och "Nästa: …" längst ned i flikarna.
  root.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest("a[data-tab-link]");
    if (!link) return;
    var i = indexForHash(link.getAttribute("href"));
    if (i < 0) return;
    e.preventDefault();
    select(i, { scroll: true });
  });

  window.addEventListener("hashchange", function () { fromHash(true); });
})();

/* ── 3. Ämnesraden och kopieringsknapparna ─────────────────────────────── */
(function () {
  var root = document.querySelector("[data-tavling]");
  if (!root) return;

  var box = root.querySelector("[data-subject]");
  var out = root.querySelector("[data-subject-out]");
  var link = root.querySelector("[data-subject-link]");
  if (box && out) {
    var pattern = box.getAttribute("data-pattern") || "";
    var email = box.getAttribute("data-email") || "";
    var fallbackName = box.getAttribute("data-name-fallback") || "";
    var name = box.querySelector("[data-subject-name]");
    var update = function () {
      var checked = box.querySelector("input[type=radio]:checked");
      var who = (name && name.value.replace(/\s+/g, " ").trim()) || fallbackName;
      var subject = pattern.replace(/\{kategori\}/g, checked ? checked.value : "").replace(/\{namn\}/g, who);
      out.textContent = subject;
      if (link) link.href = "mailto:" + email + "?subject=" + encodeURIComponent(subject);
    };
    box.addEventListener("input", update);
    box.addEventListener("change", update);
    update();
  }

  // Kopiera – visas bara om webbläsaren kan kopiera.
  var canCopy = !!(navigator.clipboard && window.isSecureContext) || (document.queryCommandSupported && document.queryCommandSupported("copy"));
  if (!canCopy) return;
  var copiedText = root.getAttribute("data-copied") || "Kopierat!";

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  root.querySelectorAll("[data-copy]").forEach(function (btn) {
    var source = root.querySelector('[data-copy-source="' + btn.getAttribute("data-copy") + '"]');
    if (!source) return;
    var label = btn.querySelector("[data-copy-label]");
    var original = label ? label.textContent : "";
    var live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    btn.appendChild(live);
    var reset = null;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      copy(source.textContent.trim()).then(function () {
        btn.classList.add("is-copied");
        if (label) label.textContent = copiedText;
        live.textContent = copiedText;
        clearTimeout(reset);
        reset = setTimeout(function () {
          btn.classList.remove("is-copied");
          if (label) label.textContent = original;
          live.textContent = "";
        }, 2200);
      }, function () {});
    });
  });
})();

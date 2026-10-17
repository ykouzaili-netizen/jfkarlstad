/*
 * Merch- och märkestävlingen (/tavling) – laddas bara på den sidan.
 * Sidan fungerar utan det här skriptet; skriptet lägger till:
 *  1. Läget och nedräkningen – byter läge av sig själv när tiden passerar (samma regler som src/lib/competition.ts).
 *  2. Flikarna – riktiga flikar med tangentbord och adresser som går att dela (#regler, #delta, #regel-3 …).
 *  3. Ämnesraden och kopieringsknapparna i kortet "Skicka in ditt bidrag".
 *  4. Bidragen: filtret Alla / Märke / Merch.
 *  5. Testa din design: bilden visas på märket eller tröjan (stannar i webbläsaren, laddas aldrig upp).
 *  6. Sprid tävlingen: en färdig bild till Instagram (story 9:16 eller inlägg 4:5) med nedräkningen,
 *     med styrelsens bakgrundsbild eller en egen som besökaren väljer (stannar i webbläsaren).
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

  root.querySelectorAll("[data-copy], [data-copy-value]").forEach(function (btn) {
    var fixed = btn.getAttribute("data-copy-value");
    var source = fixed ? null : root.querySelector('[data-copy-source="' + btn.getAttribute("data-copy") + '"]');
    if (!fixed && !source) return;
    var label = btn.querySelector("[data-copy-label]");
    var original = label ? label.textContent : "";
    var live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    btn.appendChild(live);
    var reset = null;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      copy(fixed || source.textContent.trim()).then(function () {
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

/* ── 4. Bidragen: filtret ──────────────────────────────────────────────── */
(function () {
  var filter = document.querySelector("[data-entry-filter]");
  if (!filter) return;
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-entries] [data-category]"));
  var buttons = Array.prototype.slice.call(filter.querySelectorAll("[data-filter]"));
  filter.hidden = false;
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var cat = btn.getAttribute("data-filter");
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      items.forEach(function (li) { li.hidden = !!cat && li.getAttribute("data-category") !== cat; });
    });
  });
})();

/* ── 5. Testa din design ───────────────────────────────────────────────── */
(function () {
  var box = document.querySelector("[data-try]");
  if (!box || !window.URL || !URL.createObjectURL) return;
  var stage = box.querySelector("[data-try-stage]");
  var input = box.querySelector("[data-try-input]");
  var label = box.querySelector("[data-try-label]");
  var images = box.querySelectorAll("[data-try-img]");
  var current = null;
  box.hidden = false;

  box.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "t-try-kind") stage.setAttribute("data-try-stage", t.value);
    if (t === input && input.files && input.files[0]) {
      var file = input.files[0];
      if (!/^image\//.test(file.type)) return;
      if (current) URL.revokeObjectURL(current);
      current = URL.createObjectURL(file);
      images.forEach(function (img) { img.setAttribute("href", current); });
      stage.classList.add("has-image");
      if (label && label.getAttribute("data-again")) label.textContent = label.getAttribute("data-again");
    }
  });
})();

/* ── 6. Sprid tävlingen: bild till Instagram (story 9:16 eller inlägg 4:5) ─ */
(function () {
  var card = document.querySelector("[data-share]");
  var root = document.querySelector("[data-tavling]");
  var canvasOk = !!document.createElement("canvas").getContext;
  if (!card || !root || !canvasOk) return;
  var button = card.querySelector("[data-share-button]");
  var preview = card.querySelector("[data-share-preview]");
  var fileInput = card.querySelector("[data-share-input]");
  var resetBtn = card.querySelector("[data-share-reset]");
  var ownUrl = null; // egen bakgrund vald av besökaren (stannar i webbläsaren)
  var previewUrl = null;
  card.hidden = false;

  // Måtten för de två formaten. Allt annat räknas fram så att innehållet hamnar i mitten.
  var FORMATS = {
    story: { W: 1080, H: 1920, logo: 300, kicker: 38, title: 112, lh: 128, label: 40, box: [620, 420], num: 300, unit: 52, date: 46, pill: [640, 110, 46], site: 34, gap: 1 },
    post: { W: 1080, H: 1350, logo: 150, kicker: 32, title: 92, lh: 104, label: 34, box: [500, 250], num: 180, unit: 40, date: 38, pill: [560, 92, 40], site: 28, gap: 0.62 },
  };

  function format() {
    var c = card.querySelector("input[name=t-share-format]:checked");
    return c && FORMATS[c.value] ? c.value : "story";
  }
  function visibleText(sel) {
    var el = Array.prototype.slice.call(root.querySelectorAll(sel)).find(function (x) { return !x.hidden && x.offsetParent !== null; });
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }
  function forms(spec) {
    var p = (spec || "").split("|");
    return [p[0] || "", p[1] || p[0] || ""];
  }
  /** Det som är kvar i den största hela enheten: [siffra, enhet]. */
  function left() {
    var d = +(root.querySelector("[data-unit=d]") || {}).textContent || 0;
    var h = +(root.querySelector("[data-unit=h]") || {}).textContent || 0;
    var m = +(root.querySelector("[data-unit=m]") || {}).textContent || 0;
    var u = (card.getAttribute("data-units") || "").split(";");
    if (d > 0) return [d, forms(u[0])[d === 1 ? 0 : 1]];
    if (h > 0) return [h, forms(u[1])[h === 1 ? 0 : 1]];
    return [Math.max(1, m), forms(u[2])[m === 1 ? 0 : 1]];
  }
  function wrap(ctx, text, max) {
    var words = text.split(" "), lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  var cache = {};
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (cache[src]) return cache[src];
    cache[src] = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
    return cache[src];
  }
  /** Webbplatsens färger (Utseende) – samma som sidan, så att bilden alltid matchar paletten. */
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (name, fallback) { return (cs.getPropertyValue(name) || "").trim() || fallback; };
    return { bg: v("--c-primary", "#141414"), on: v("--c-on-primary", "#ffffff"), accent: v("--c-accent", "#f1cc4d"), onAccent: v("--c-on-accent", "#141414") };
  }
  /** "#rrggbb" + genomskinlighet → "rgba(…)" (canvas förstår inte color-mix). */
  function alpha(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")" : hex;
  }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function spaced(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }
  /** Rita bilden i ett format, med eller utan bakgrundsbild. */
  function draw(fmt) {
    var F = FORMATS[fmt], W = F.W, H = F.H;
    var c0 = palette();
    var light = /^#?f/i.test(c0.on);
    var bgSrc = ownUrl || card.getAttribute("data-bg") || "";
    return Promise.all([loadImage(bgSrc), loadImage(light ? "/assets/tavling/jfk-logotyp-ljus.png" : "/assets/tavling/jfk-logotyp.png")]).then(function (imgs) {
      var bg = imgs[0], logo = imgs[1];
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var ctx = c.getContext("2d");
      ctx.fillStyle = c0.bg; ctx.fillRect(0, 0, W, H);
      if (bg) {
        // Bakgrundsbilden fyller hela ytan och mörkläggs med primärfärgen så att texten syns.
        var s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
        var bw = bg.naturalWidth * s, bh = bg.naturalHeight * s;
        ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
        ctx.fillStyle = alpha(c0.bg, 0.74); ctx.fillRect(0, 0, W, H);
        var shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
        shade.addColorStop(0, alpha(c0.bg, 0)); shade.addColorStop(1, alpha(c0.bg, 0.7));
        ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      } else {
        var glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 1100);
        glow.addColorStop(0, alpha(c0.accent, 0.2)); glow.addColorStop(1, alpha(c0.accent, 0));
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = alpha(c0.on, 0.05); ctx.lineWidth = 2;
        for (var x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (var y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }
      // söm i guld uppe till höger
      ctx.save(); ctx.strokeStyle = alpha(c0.accent, 0.6); ctx.lineWidth = 6; ctx.setLineDash([26, 20]);
      ctx.beginPath(); ctx.arc(W + 140, -60, 420 * F.gap + 120, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

      ctx.textAlign = "center";
      var y0 = 120 * F.gap + 50;
      if (logo) { ctx.drawImage(logo, (W - F.logo) / 2, y0, F.logo, F.logo * 1.011); y0 += F.logo + 90 * F.gap + 20; }
      ctx.fillStyle = c0.accent; ctx.font = "700 " + F.kicker + 'px "DM Sans", system-ui, sans-serif';
      spaced(ctx, 8); ctx.fillText((card.getAttribute("data-kicker") || "").toUpperCase(), W / 2, y0); spaced(ctx, 0);

      ctx.font = "700 " + F.title + 'px "Playfair Display", Georgia, serif';
      var ty = y0 + F.title + 30;
      wrap(ctx, card.getAttribute("data-title") || "", W - 160).forEach(function (l) {
        var parts = l.split("&"), cx = W / 2 - ctx.measureText(l).width / 2;
        ctx.textAlign = "left";
        parts.forEach(function (p, i) {
          if (i) { ctx.fillStyle = c0.accent; ctx.fillText("&", cx, ty); cx += ctx.measureText("&").width; }
          ctx.fillStyle = c0.on; ctx.fillText(p, cx, ty); cx += ctx.measureText(p).width;
        });
        ctx.textAlign = "center";
        ty += F.lh;
      });

      var lf = left();
      var by = ty + 70 * F.gap + 10;
      ctx.fillStyle = c0.accent; ctx.font = "700 " + F.label + 'px "DM Sans", system-ui, sans-serif';
      spaced(ctx, 6); ctx.fillText(visibleText(".t-countdown-label > span").toUpperCase(), W / 2, by); spaced(ctx, 0);
      var bw2 = F.box[0], bh2 = F.box[1], bx = (W - bw2) / 2, bY = by + 40;
      ctx.fillStyle = alpha(c0.on, bg ? 0.1 : 0.06); ctx.strokeStyle = alpha(c0.on, 0.16); ctx.lineWidth = 3;
      rounded(ctx, bx, bY, bw2, bh2, 44); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c0.on; ctx.font = "700 " + F.num + 'px "DM Sans", system-ui, sans-serif';
      ctx.fillText(String(lf[0]), W / 2, bY + bh2 * 0.7);
      ctx.fillStyle = alpha(c0.on, 0.8); ctx.font = "600 " + F.unit + 'px "DM Sans", system-ui, sans-serif';
      ctx.fillText((card.getAttribute("data-left") || "{enhet}").replace("{enhet}", lf[1]), W / 2, bY + bh2 * 0.9);
      ctx.fillStyle = c0.on; ctx.font = "500 " + F.date + 'px "DM Sans", system-ui, sans-serif';
      ctx.fillText(visibleText(".t-countdown-when > span"), W / 2, bY + bh2 + F.date + 40 * F.gap + 10);

      var pw = F.pill[0], ph = F.pill[1], py = H - ph - (F.site + 90 * F.gap + 30);
      ctx.fillStyle = c0.accent; rounded(ctx, (W - pw) / 2, py, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = c0.onAccent; ctx.font = "700 " + F.pill[2] + 'px "DM Sans", system-ui, sans-serif';
      ctx.fillText(location.host.replace(/^www\./, "") + location.pathname, W / 2, py + ph / 2 + F.pill[2] * 0.36);
      ctx.fillStyle = alpha(c0.on, 0.72); ctx.font = "500 " + F.site + 'px "DM Sans", system-ui, sans-serif';
      ctx.fillText(card.getAttribute("data-site") || "", W / 2, H - (60 * F.gap + 20));
      return c;
    });
  }

  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('700 112px "Playfair Display"'), document.fonts.load('700 300px "DM Sans"'), document.fonts.load('500 46px "DM Sans"')]).catch(function () {})
    : Promise.resolve();
  function toBlob(c) { return new Promise(function (resolve) { c.toBlob(resolve, "image/png"); }); }

  /** Förhandsvisningen i kortet – ritas om när formatet eller bakgrunden ändras. */
  var pending = 0;
  function refresh() {
    var id = ++pending;
    var fmt = format();
    card.setAttribute("data-format", fmt);
    return fontsReady.then(function () { return draw(fmt); }).then(toBlob).then(function (blob) {
      if (id !== pending || !blob || !preview) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl;
    });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); refresh(); }
    }, { rootMargin: "200px" });
    io.observe(card);
  } else refresh();

  card.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "t-share-format") refresh();
    if (t === fileInput && fileInput.files && fileInput.files[0] && /^image\//.test(fileInput.files[0].type)) {
      if (ownUrl) URL.revokeObjectURL(ownUrl);
      ownUrl = URL.createObjectURL(fileInput.files[0]);
      if (resetBtn) resetBtn.hidden = false;
      refresh();
    }
  });
  if (resetBtn) resetBtn.addEventListener("click", function () {
    if (ownUrl) URL.revokeObjectURL(ownUrl);
    ownUrl = null;
    if (fileInput) fileInput.value = "";
    resetBtn.hidden = true;
    refresh();
  });

  button.addEventListener("click", function () {
    button.disabled = true;
    var fmt = format();
    fontsReady
      .then(function () { return draw(fmt); })
      .then(toBlob)
      .then(function (blob) {
        if (!blob) return;
        var name = fmt === "post" ? "jfk-tavling-inlagg.png" : "jfk-tavling-story.png";
        var file = window.File ? new File([blob], name, { type: "image/png" }) : null;
        // På mobilen: dela direkt (t.ex. till Instagram). Annars: ladda ned filen.
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
          return navigator.share({ files: [file] }).catch(function () {});
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      })
      .then(function () { button.disabled = false; }, function () { button.disabled = false; });
  });
})();

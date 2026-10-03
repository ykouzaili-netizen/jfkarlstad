/* JFK adminpanel – små förbättringar. Allt fungerar även utan JavaScript. */
(function () {
  "use strict";

  /* Mobilmeny */
  var menuBtn = document.querySelector("[data-admin-menu]");
  var nav = document.getElementById("adminmeny");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  /* Bekräftelse innan radering m.m. */
  document.querySelectorAll("form[data-confirm]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm(form.getAttribute("data-confirm"))) e.preventDefault();
    });
  });
  document.querySelectorAll("[data-confirm-click]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      if (!window.confirm(btn.getAttribute("data-confirm-click"))) e.preventDefault();
    });
  });

  /* ---------- Uppladdning: förhandsvisning och automatisk komprimering av stora bilder ----------
     Servern tar emot högst data-max byte per bild (5 MB). Är bilden större – eller onödigt stor i pixlar –
     skalas den ned och sparas om här i webbläsaren innan formuläret skickas. Originalet lämnar aldrig datorn. */
  var MAX_SIDE = 2560;        // längsta sida i pixlar – räcker gott för helskärm på webben
  var RESIZE_ABOVE = 3200;    // bilder större än så skalas ned även om de är under gränsen …
  var RESIZE_MIN_BYTES = 1.5 * 1024 * 1024; // … men bara om filen också är tyngre än 1,5 MB

  function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB"; }

  function setStatus(name, text, kind) {
    var el = document.querySelector('[data-upload-status="' + name + '"]');
    if (!el) return;
    el.textContent = text || "";
    el.className = "upload-status" + (kind ? " is-" + kind : "");
  }

  function setBusy(form, delta) {
    if (!form) return;
    var n = (parseInt(form.getAttribute("data-busy") || "0", 10) || 0) + delta;
    form.setAttribute("data-busy", String(Math.max(0, n)));
    form.querySelectorAll('button[type="submit"]').forEach(function (b) { b.disabled = n > 0; });
  }

  function showPreview(name, file) {
    var img = document.querySelector('[data-preview="' + name + '"]');
    if (img && file && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      img.src = URL.createObjectURL(file);
      img.hidden = false;
      img.alt = "Vald bild";
    }
  }

  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return decodeWithImg(file); });
    }
    return decodeWithImg(file);
  }
  function decodeWithImg(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("decode")); };
      img.src = URL.createObjectURL(file);
    });
  }

  function hasAlpha(source, w, h) {
    var c = document.createElement("canvas");
    c.width = Math.min(64, w); c.height = Math.min(64, h);
    var ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, c.width, c.height);
    var d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  var webpOk = (function () {
    try { var c = document.createElement("canvas"); c.width = c.height = 1; return c.toDataURL("image/webp").indexOf("data:image/webp") === 0; }
    catch (e) { return false; }
  })();

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  async function compress(source, file, max) {
    var w0 = source.width, h0 = source.height;
    var transparent = /png|webp|gif/.test(file.type) && hasAlpha(source, w0, h0);
    var type = transparent ? (webpOk ? "image/webp" : "image/png") : "image/jpeg";
    var target = max * 0.95;
    var scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    var qualities = type === "image/png" ? [undefined] : [0.86, 0.8, 0.72, 0.64, 0.55];
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var best = null;
    while (true) {
      canvas.width = Math.max(1, Math.round(w0 * scale));
      canvas.height = Math.max(1, Math.round(h0 * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (var i = 0; i < qualities.length; i++) {
        var blob = await toBlob(canvas, type, qualities[i]);
        if (!blob) throw new Error("encode");
        best = { blob: blob, w: canvas.width, h: canvas.height };
        if (blob.size <= target) return best;
      }
      if (Math.max(canvas.width, canvas.height) < 800) return best; // ge upp – returnera minsta försöket
      scale *= 0.8;
    }
  }

  /* Mindre version (max 800 px) till mobiler och kort. Läggs i det dolda fältet "<namn>__liten". */
  var SMALL_SIDE = 800;
  async function makeSmall(source, file) {
    var w0 = source.width, h0 = source.height;
    if (Math.max(w0, h0) <= SMALL_SIDE * 1.15) return null; // originalet är redan litet nog
    var scale = SMALL_SIDE / Math.max(w0, h0);
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    var ctx = canvas.getContext("2d");
    var transparent = /png|webp|gif/.test(file.type) && hasAlpha(source, w0, h0);
    var type = webpOk ? "image/webp" : transparent ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    var blob = await toBlob(canvas, type, type === "image/png" ? undefined : 0.8);
    return blob && blob.size < 1024 * 1024 ? blob : null;
  }

  function companion(name, attr) { return document.querySelector("[" + attr + '="' + name + '"]'); }

  function setSmall(name, blob, originalName) {
    var input = companion(name, "data-small-for");
    if (!input || !window.DataTransfer) return;
    var dt = new DataTransfer();
    if (blob) {
      var ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
      dt.items.add(new File([blob], "liten-" + originalName.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type }));
    }
    input.files = dt.files;
  }

  function setDims(name, w, h) {
    var input = companion(name, "data-dims-for");
    if (input) input.value = w && h ? w + "x" + h : "";
  }

  function replaceFile(input, blob, originalName) {
    var ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    var name = originalName.replace(/\.[^.]+$/, "") + "." + ext;
    var dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: blob.type, lastModified: Date.now() }));
    input.files = dt.files;
    return input.files[0];
  }

  document.querySelectorAll("[data-upload]").forEach(function (input) {
    input.addEventListener("change", async function () {
      var name = input.getAttribute("data-upload");
      var kind = input.getAttribute("data-kind") || "image";
      var max = parseInt(input.getAttribute("data-max") || "0", 10) || 5 * 1024 * 1024;
      var file = input.files && input.files[0];
      setStatus(name, "");
      setSmall(name, null, "");
      setDims(name, 0, 0);
      var bank = companion(name, "data-bank-for");
      if (bank && file) bank.value = "";
      if (!file) return;

      if (kind === "pdf") {
        if (file.size > max) {
          input.value = "";
          setStatus(name, "PDF:en är " + mb(file.size) + " – max är " + mb(max) + ". Gör filen mindre först, t.ex. med ”Spara som PDF → Minsta storlek” i Word eller ”Exportera → Reduce File Size” i Förhandsvisning på Mac.", "error");
        } else {
          setStatus(name, "Vald: " + file.name + " (" + mb(file.size) + ")", "ok");
        }
        return;
      }

      var isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
      var isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      if (isSvg) {
        if (file.size > max) { input.value = ""; setStatus(name, "SVG-filen är " + mb(file.size) + " – max " + mb(max) + ". Spara den som PNG i stället.", "error"); }
        return;
      }

      var form = input.form;
      setBusy(form, 1);
      try {
        var source = await decode(file);
        var dims = { w: source.width, h: source.height };
        var tooBig = file.size > max;
        var tooManyPixels = Math.max(dims.w, dims.h) > RESIZE_ABOVE && file.size > RESIZE_MIN_BYTES;
        var isGif = file.type === "image/gif";
        var finish = async function (f, w, h) {
          setDims(name, w, h);
          if (!isGif) {
            try { setSmall(name, await makeSmall(source, f), f.name); } catch (e) { setSmall(name, null, ""); }
          }
        };
        if (!tooBig && !isHeic && (!tooManyPixels || isGif)) {
          showPreview(name, file);
          await finish(file, dims.w, dims.h);
          return;
        }
        if (!window.DataTransfer) throw new Error("datatransfer");
        setStatus(name, "Komprimerar bilden …", "busy");
        var res = await compress(source, file, max);
        if (res.blob.size > max) throw new Error("toolarge");
        if (!tooBig && !isHeic && res.blob.size >= file.size) { showPreview(name, file); setStatus(name, ""); await finish(file, dims.w, dims.h); return; }
        var newFile = replaceFile(input, res.blob, file.name);
        await finish(newFile, res.w, res.h);
        showPreview(name, newFile);
        setStatus(
          name,
          (tooBig ? "Bilden var " + mb(file.size) + " och har komprimerats till " : "Bilden har optimerats för webben: ") +
            mb(newFile.size) + " (" + res.w + " × " + res.h + " px)." + (isGif ? " Animationen försvinner." : ""),
          "ok"
        );
      } catch (err) {
        input.value = "";
        var msg = isHeic
          ? "Den här webbläsaren kan inte läsa HEIC-bilder. Spara bilden som JPG (eller välj ”Mest kompatibel” i iPhonens kamerainställningar) och försök igen."
          : (err && err.message === "toolarge")
            ? "Bilden gick inte att komprimera under " + mb(max) + ". Prova en mindre bild."
            : "Bilden kunde inte bearbetas i den här webbläsaren. Förminska den till under " + mb(max) + " och försök igen.";
        setStatus(name, msg, "error");
      } finally {
        setBusy(form, -1);
      }
    });
  });

  /* Visa/dölj lösenord */
  document.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute("data-toggle-password"));
    if (!input) return;
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Dölj" : "Visa";
      btn.setAttribute("aria-pressed", String(show));
    });
  });

  /* Kopiera inbjudningslänk */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = btn.parentElement.querySelector("[data-copy-source]");
      if (!src) return;
      src.select();
      (navigator.clipboard ? navigator.clipboard.writeText(src.value) : Promise.reject()).then(
        function () { btn.textContent = "Kopierad!"; },
        function () { document.execCommand("copy"); btn.textContent = "Kopierad!"; }
      );
    });
  });

  /* Filter som skickas direkt */
  document.querySelectorAll("[data-autosubmit]").forEach(function (el) {
    el.addEventListener("change", function () { el.form.submit(); });
  });

  /* Varna för osparade ändringar */
  document.querySelectorAll("form[data-dirty-check]").forEach(function (form) {
    var dirty = false;
    form.addEventListener("input", function () { dirty = true; });
    form.addEventListener("change", function () { dirty = true; });
    form.addEventListener("submit", function () { dirty = false; });
    window.addEventListener("beforeunload", function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  });

  /* Skala en iframe så att en hel datorsida (1280 px) eller mobil (390 px) får plats i rutan. */
  function fitFrame(viewport, frame, device) {
    var W = viewport.clientWidth, H = viewport.clientHeight;
    if (!W || !H) return;
    var dw = device === "mobile" ? 390 : 1280;
    var scale = Math.min(1, W / dw);
    frame.style.width = dw + "px";
    frame.style.height = Math.round(H / scale) + "px";
    frame.style.transform = "scale(" + scale + ")";
    frame.style.left = Math.max(0, Math.round((W - dw * scale) / 2)) + "px";
  }

  /* Klickbar webbplats: markera det som pekas på och visa var det ändras. Klick anropar onPick(elementet). */
  function installEditMap(d, onPick) {
    if (!d || !d.body || d.body.getAttribute("data-map-ready")) return;
    d.body.setAttribute("data-map-ready", "1");
    d.body.classList.add("is-editmap");
    var label = d.createElement("div");
    label.className = "em-label";
    label.hidden = true;
    d.body.appendChild(label);
    var current = null;
    // Sidan visas förminskad i rutan – gör etiketten och ramen lika stora oavsett skala.
    function rescale() {
      try {
        var win = d.defaultView;
        var s = win.frameElement.getBoundingClientRect().width / win.innerWidth || 1;
        d.documentElement.style.setProperty("--em", String(Math.max(1, 1 / s)));
      } catch (e) { /* ignorera */ }
    }
    rescale();
    d.defaultView.addEventListener("resize", rescale);
    function target(node) {
      while (node && node.nodeType !== 1) node = node.parentNode;
      return node && node.closest ? node.closest("[data-eu]") : null;
    }
    function show(el) {
      if (current === el) return;
      if (current) current.classList.remove("em-hover");
      current = el;
      if (!el) { label.hidden = true; return; }
      el.classList.add("em-hover");
      var r = el.getBoundingClientRect();
      var win = d.defaultView;
      label.textContent = "Ändra: " + (el.getAttribute("data-el") || "");
      label.hidden = false;
      var em = parseFloat(d.documentElement.style.getPropertyValue("--em")) || 1;
      var top = r.top + win.scrollY - 30 * em;
      if (top < win.scrollY + 4) top = r.bottom + win.scrollY + 6;
      label.style.top = Math.max(0, top) + "px";
      label.style.left = Math.max(4, Math.min(r.left + win.scrollX, win.scrollX + win.innerWidth - 330 * em)) + "px";
    }
    d.addEventListener("mouseover", function (e) { show(target(e.target)); });
    d.addEventListener("mouseleave", function () { show(null); });
    d.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var el = target(e.target);
      if (el) onPick(el);
    }, true);
    d.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  }

  /* ---------- Förhandsvisning bredvid redigeringen ----------
     Formulärets osparade värden skickas till /admin/forhandsvisning och den riktiga sidan visas i en iframe.
     Inget sparas. Färger och typsnitt på Utseende uppdateras direkt utan att sidan laddas om. */
  var livePreview = (function () {
    var pane = document.querySelector("[data-live-preview]");
    if (!pane) return null;
    var form = document.getElementById(pane.getAttribute("data-form"));
    var frame = pane.querySelector("[data-lp-frame]");
    var viewport = pane.querySelector("[data-lp-viewport]");
    var loading = pane.querySelector("[data-lp-loading]");
    var stateEl = pane.querySelector("[data-lp-state]");
    var pageSelect = pane.querySelector("[data-lp-page]");
    var openBtn = document.querySelector("[data-lp-open]");
    var page = pane.getAttribute("data-page") || "/";
    var device = "desktop";
    var lastY = 0;
    // På mobil visas förhandsvisningen i mobilläge från början
    if (window.innerWidth < 700) {
      device = "mobile";
      pane.classList.add("is-mobile");
      pane.querySelectorAll("[data-lp-device]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lp-device") === "mobile")); });
    }
    var scrollTarget = null;
    var themeVars = null;
    var timer = null;
    var blobUrls = {};

    var post = document.createElement("form");
    post.method = "post";
    post.target = frame.name;
    post.hidden = true;
    post.setAttribute("accept-charset", "UTF-8");
    document.body.appendChild(post);

    function add(name, value) {
      var i = document.createElement("input");
      i.type = "hidden"; i.name = name; i.value = value;
      post.appendChild(i);
    }

    function fileFor(key) {
      var inputs = form.querySelectorAll("input[type=file]");
      for (var i = 0; i < inputs.length; i++) {
        var k = inputs[i].getAttribute("data-setting") || inputs[i].name;
        if (k === key) return inputs[i].files && inputs[i].files[0];
      }
      return null;
    }

    function collect() {
      post.textContent = "";
      add("_csrf", pane.getAttribute("data-csrf"));
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled || el.name.charAt(0) === "_" || /__(ta_bort|liten|matt|bank)$/.test(el.name)) return;
        if (el.type === "file") {
          var key = el.getAttribute("data-setting") || el.name;
          var remove = form.elements[el.name + "__ta_bort"];
          var bank = form.elements[el.name + "__bank"];
          if (remove && remove.checked) add(key, "");
          else if (el.files && el.files[0]) add(key, "__fh__" + key);
          else if (bank && bank.value) add(key, bank.value);
          return;
        }
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
        if (el.type === "submit" || el.type === "button") return;
        add(el.name, el.value);
      });
    }

    function setState(text) { if (stateEl) stateEl.textContent = text; }

    function refresh() {
      clearTimeout(timer);
      try { lastY = frame.contentWindow.scrollY || 0; } catch (e) { lastY = 0; }
      collect();
      post.action = "/admin/forhandsvisning?sida=" + encodeURIComponent(page);
      setState("Uppdaterar …");
      post.submit();
    }
    function refreshSoon(delay) { clearTimeout(timer); timer = setTimeout(refresh, delay || 500); }

    function doc() { try { return frame.contentDocument; } catch (e) { return null; } }

    function applyTheme(d) {
      if (!themeVars || !d) return;
      Object.keys(themeVars).forEach(function (k) { d.documentElement.style.setProperty(k, themeVars[k]); });
    }

    function swapImages(d) {
      d.querySelectorAll("img").forEach(function (img) {
        var m = /fh:([A-Za-z0-9_%.-]+?)--/.exec(img.getAttribute("src") || "");
        if (!m) return;
        var key = decodeURIComponent(m[1]);
        var file = fileFor(key);
        if (!file) return;
        if (!blobUrls[key] || blobUrls[key].file !== file) {
          if (blobUrls[key]) URL.revokeObjectURL(blobUrls[key].url);
          blobUrls[key] = { file: file, url: URL.createObjectURL(file) };
        }
        img.src = blobUrls[key].url;
      });
    }

    /* Scrolla förhandsvisningen till texten som redigeras (alla texter är märkta med data-ek). */
    function scrollToField(name, smooth) {
      var d = doc();
      if (!d || !name) return;
      var el = d.querySelector('[data-ek="' + name.replace(/"/g, "") + '"]');
      if (!el) return;
      var win = frame.contentWindow;
      var rect = el.getBoundingClientRect();
      var inHeader = el.closest(".site-header");
      if (!inHeader) {
        var top = rect.top + win.scrollY - Math.max(90, (win.innerHeight - rect.height) / 3);
        win.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
      }
      el.classList.remove("fh-flash");
      void el.offsetWidth;
      el.classList.add("fh-flash");
    }

    frame.addEventListener("load", function () {
      var d = doc();
      if (!d || !d.body) return;
      loading.hidden = true;
      setState("");
      swapImages(d);
      applyTheme(d);
      if (scrollTarget) { scrollToField(scrollTarget, false); scrollTarget = null; }
      else frame.contentWindow.scrollTo(0, lastY);
      if (pane.hasAttribute("data-edit-map")) {
        installEditMap(d, function (el) {
          var key = el.getAttribute("data-ek");
          if (key && window.jfkFocusField && window.jfkFocusField(key)) return;
          var url = el.getAttribute("data-eu");
          if (url) window.location.href = url;
        });
      }
    });

    function layout() { fitFrame(viewport, frame, device); }
    if (window.ResizeObserver) new ResizeObserver(layout).observe(viewport);
    window.addEventListener("resize", layout);

    pane.querySelectorAll("[data-lp-device]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        device = btn.getAttribute("data-lp-device");
        pane.querySelectorAll("[data-lp-device]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        pane.classList.toggle("is-mobile", device === "mobile");
        layout();
      });
    });

    if (pageSelect) {
      pageSelect.addEventListener("change", function () {
        page = pageSelect.value;
        lastY = 0;
        frame.title = "Förhandsvisning av " + pageSelect.options[pageSelect.selectedIndex].text;
        refresh();
      });
    }
    var pageLabel = pane.querySelector("[data-lp-label]");
    function setPage(path, label) {
      if (!path || path === page) return;
      page = path;
      lastY = 0;
      if (pageLabel && label) pageLabel.textContent = label;
      if (label) frame.title = "Förhandsvisning av " + label;
      refresh();
    }

    // Uppdatera när något ändras. Färger och typsnitt sköts direkt av Utseende-koden nedan.
    function isThemeField(t) { return t.hasAttribute("data-color") || t.hasAttribute("data-color-hex") || t.name === "font_heading"; }
    form.addEventListener("input", function (e) {
      if (isThemeField(e.target) || e.target.type === "file") return;
      refreshSoon(e.target.tagName === "TEXTAREA" ? 700 : 450);
    });
    form.addEventListener("change", function (e) {
      if (isThemeField(e.target)) return;
      if (e.target.type === "file" || /__(ta_bort|bank)$/.test(e.target.name)) {
        scrollTarget = e.target.getAttribute("data-setting") || e.target.name.replace(/__(ta_bort|bank)$/, "");
        refreshSoon(150);
      } else if (e.target.type === "checkbox" || e.target.type === "radio" || e.target.tagName === "SELECT") {
        refreshSoon(150);
      }
    });
    form.addEventListener("focusin", function (e) {
      var name = e.target.getAttribute("data-setting") || e.target.name;
      if (name && !isThemeField(e.target)) scrollToField(name, true);
    });

    // Mobil/smal skärm: förhandsvisningen öppnas som ett eget lager
    function setOpen(open) {
      pane.classList.toggle("is-open", open);
      document.documentElement.classList.toggle("lp-locked", open);
      if (openBtn) openBtn.setAttribute("aria-expanded", String(open));
      if (open) { layout(); pane.querySelector("[data-lp-close]").focus(); }
      else if (openBtn) openBtn.focus();
    }
    if (openBtn) openBtn.addEventListener("click", function () { setOpen(true); });
    pane.querySelector("[data-lp-close]").addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pane.classList.contains("is-open")) setOpen(false); });

    layout();
    refresh();

    return {
      setTheme: function (vars) { themeVars = vars; applyTheme(doc()); },
      refresh: refresh,
      refreshSoon: refreshSoon,
      setPage: setPage,
      scrollToField: scrollToField,
    };
  })();
  window.jfkPreview = livePreview;

  /* ---------- Översikt: klickbar webbplats ---------- */
  (function () {
    var map = document.querySelector("[data-site-map]");
    if (!map) return;
    var frame = map.querySelector("[data-map-frame]");
    var viewport = map.querySelector("[data-lp-viewport]");
    var loading = map.querySelector("[data-lp-loading]");
    var select = map.querySelector("[data-map-page]");
    var device = window.innerWidth < 700 ? "mobile" : "desktop";
    function layout() { fitFrame(viewport, frame, device); }
    map.querySelectorAll("[data-lp-device]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lp-device") === device));
      btn.addEventListener("click", function () {
        device = btn.getAttribute("data-lp-device");
        map.querySelectorAll("[data-lp-device]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        map.classList.toggle("is-mobile", device === "mobile");
        layout();
      });
    });
    map.classList.toggle("is-mobile", device === "mobile");
    select.addEventListener("change", function () {
      loading.hidden = false;
      frame.src = "/admin/webbplatsen?sida=" + encodeURIComponent(select.value);
    });
    frame.addEventListener("load", function () {
      loading.hidden = true;
      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      installEditMap(d, function (el) { window.location.href = el.getAttribute("data-eu"); });
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(viewport);
    window.addEventListener("resize", layout);
    layout();
  })();

  /* ---------- Texter och sidor ---------- */
  (function () {
    var form = document.querySelector("form[data-accordion]");
    if (!form) return;
    var sections = Array.prototype.slice.call(form.querySelectorAll("[data-section]"));
    var openLink = document.querySelector("[data-open-page]");
    var preview = window.jfkPreview;

    function activate(sec) {
      if (preview) preview.setPage(sec.getAttribute("data-preview-path"), sec.getAttribute("data-preview-label"));
      if (openLink) openLink.href = sec.getAttribute("data-preview-path") || openLink.href;
    }
    // Ett avsnitt öppet åt gången håller sidan överskådlig.
    sections.forEach(function (sec) {
      sec.addEventListener("toggle", function () {
        if (!sec.open) return;
        sections.forEach(function (o) { if (o !== sec) o.open = false; });
        activate(sec);
        var top = sec.getBoundingClientRect().top;
        if (top < 70) window.scrollTo({ top: window.scrollY + top - 80 });
      });
    });

    // "Återställ originaltexten" syns bara när texten skiljer sig från originalet.
    form.querySelectorAll("[data-reset]").forEach(function (btn) {
      var field = form.elements[btn.getAttribute("data-reset")];
      if (!field) return;
      var def = btn.getAttribute("data-default");
      var wrap = btn.closest("[data-text-field]");
      function sync() {
        var changed = field.value.trim() !== def.trim();
        btn.hidden = !changed;
        if (wrap) wrap.classList.toggle("is-changed", changed);
      }
      field.addEventListener("input", sync);
      btn.addEventListener("click", function () {
        field.value = def;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      });
      sync();
    });

    // Hoppa till ett fält (från förhandsvisningen eller en länk med &falt=…)
    window.jfkFocusField = function (key) {
      var field = form.elements[key];
      var wrap = form.querySelector('[data-text-field="' + key + '"]');
      if (!wrap) return false;
      var sec = wrap.closest("[data-section]");
      var more = wrap.closest(".more-texts");
      if (sec && !sec.open) sec.open = true;
      if (more) more.open = true;
      wrap.classList.remove("is-flash");
      void wrap.offsetWidth;
      wrap.classList.add("is-flash");
      wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      var input = field && field.focus ? field : wrap.querySelector("input, textarea, select");
      if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 250);
      return true;
    };
    var target = form.querySelector(".text-field.is-target");
    if (target) setTimeout(function () { window.jfkFocusField(target.getAttribute("data-text-field")); }, 50);
  })();

  /* ---------- Menyn: flytta, byt namn och dölj ---------- */
  (function () {
    var form = document.querySelector("form[data-menu-editor]");
    if (!form) return;
    var json = form.querySelector("[data-menu-json]");
    var preview = window.jfkPreview;

    function rowsIn(list) { return Array.prototype.filter.call(list.children, function (li) { return li.matches("[data-menu-item]"); }); }

    function build() {
      var top = form.querySelector("[data-menu-list]");
      var items = rowsIn(top).map(function (li) {
        var row = li.querySelector("[data-menu-row]");
        var out = itemFrom(row);
        var sub = li.querySelector("[data-menu-list]");
        if (sub) out.children = rowsIn(sub).map(function (c) { return itemFrom(c.querySelector("[data-menu-row]")); });
        return out;
      });
      json.value = JSON.stringify(items);
    }
    function itemFrom(row) {
      var id = row.querySelector("input[type=hidden]").value;
      var label = row.querySelector("[data-menu-label]");
      var visible = row.querySelector("[data-menu-visible]");
      var out = { id: id };
      if (label.value.trim() && label.value.trim() !== label.placeholder) out.label = label.value.trim();
      if (!visible.checked) out.hidden = true;
      return out;
    }
    function syncButtons() {
      form.querySelectorAll("[data-menu-list]").forEach(function (list) {
        var rows = rowsIn(list);
        rows.forEach(function (li, i) {
          var row = li.querySelector("[data-menu-row]");
          row.querySelector('[data-move="up"]').disabled = i === 0;
          row.querySelector('[data-move="down"]').disabled = i === rows.length - 1;
        });
      });
    }
    function changed() { build(); syncButtons(); if (preview) preview.refreshSoon(300); }

    form.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-move]");
      if (!btn) return;
      e.preventDefault();
      var li = btn.closest("[data-menu-item]");
      var list = li.parentNode;
      if (btn.getAttribute("data-move") === "up" && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      else if (btn.getAttribute("data-move") === "down" && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      changed();
      form.dispatchEvent(new Event("change"));
      var again = li.querySelector('[data-menu-row] [data-move="' + btn.getAttribute("data-move") + '"]');
      (again && !again.disabled ? again : li.querySelector("[data-menu-label]")).focus();
    });
    form.addEventListener("input", function (e) { if (e.target.matches("[data-menu-label]")) build(); });
    form.addEventListener("change", function (e) {
      if (e.target.matches && e.target.matches("[data-menu-visible]")) {
        e.target.closest("[data-menu-row]").classList.toggle("is-hidden", !e.target.checked);
        changed();
      }
    });
    build();
  })();

  /* ---------- Bildbanken: välj en bild som redan finns ---------- */
  (function () {
    var dialog = document.querySelector("[data-bank-dialog]");
    var buttons = document.querySelectorAll("[data-bank-open]");
    if (!dialog || !buttons.length || typeof dialog.showModal !== "function") return;
    var body = dialog.querySelector("[data-bank-body]");
    var field = null;
    var loaded = false;
    buttons.forEach(function (b) {
      b.hidden = false;
      b.addEventListener("click", function () {
        field = b.getAttribute("data-bank-open");
        dialog.showModal();
        if (loaded) return;
        fetch("/admin/bildbank/valj", { credentials: "same-origin" })
          .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
          .then(function (htmlText) { body.innerHTML = htmlText; loaded = true; })
          .catch(function () { body.textContent = "Bildbanken kunde inte laddas. Försök igen."; });
      });
    });
    dialog.querySelector("[data-bank-close]").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) { dialog.close(); return; }
      var pick = e.target.closest && e.target.closest("[data-bank-key]");
      if (!pick || !field) return;
      var hidden = document.querySelector('[data-bank-for="' + field + '"]');
      var file = document.querySelector('[data-upload="' + field + '"]');
      if (hidden) hidden.value = pick.getAttribute("data-bank-key");
      if (file) file.value = "";
      setSmall(field, null, "");
      setDims(field, 0, 0);
      var remove = document.querySelector('input[name="' + field + '__ta_bort"]');
      if (remove) remove.checked = false;
      var img = document.querySelector('[data-preview="' + field + '"]');
      if (img) { img.src = pick.getAttribute("data-bank-src"); img.hidden = false; img.alt = "Vald bild"; }
      var nameEl = pick.querySelector(".bank-pick-name");
      setStatus(field, "Vald från bildbanken: " + (nameEl ? nameEl.textContent : "bild") + ". Klicka på Spara.", "ok");
      dialog.close();
      if (hidden) hidden.dispatchEvent(new Event("change", { bubbles: true }));
    });
  })();

  /* Skriv ut (statistiken) */
  document.querySelectorAll("[data-print]").forEach(function (b) {
    b.hidden = false;
    b.addEventListener("click", function () { window.print(); });
  });

  /* ---------- Utseende: live-förhandsvisning och kontrastkontroll ---------- */
  var editor = document.querySelector("[data-theme-editor]");
  if (!editor) return;
  var contrastBox = document.querySelector("[data-contrast]");
  var HEX = /^#[0-9a-f]{6}$/i;

  function lum(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
      .reduce(function (acc, v, i) { return acc + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function on(bg) { return ratio(bg, "#141414") >= ratio(bg, "#ffffff") ? "#141414" : "#ffffff"; }
  function val(key) {
    var el = editor.querySelector('[data-color="' + key + '"]');
    return el && HEX.test(el.value) ? el.value : "#000000";
  }
  function fmt(r) { return r.toFixed(1).replace(".", ","); }

  function update() {
    var c = {
      bg: val("color_background"), surface: val("color_surface"), text: val("color_text"),
      primary: val("color_primary"), accent: val("color_accent"), button: val("color_button"),
    };
    var vars = {
      "--c-bg": c.bg, "--c-surface": c.surface, "--c-text": c.text,
      "--c-primary": c.primary, "--c-on-primary": on(c.primary),
      "--c-accent": c.accent, "--c-on-accent": on(c.accent),
      "--c-button": c.button, "--c-on-button": on(c.button),
    };
    var font = editor.querySelector("input[name=font_heading]:checked");
    if (font) {
      vars["--font-display"] = font.getAttribute("data-font");
      vars["--display-scale"] = font.getAttribute("data-font-scale");
    }
    if (livePreview) livePreview.setTheme(vars);

    var checks = [
      [ratio(c.text, c.bg), 4.5, "Text på bakgrunden"],
      [ratio(c.text, c.surface), 4.5, "Text på kort och ytor"],
      [ratio(on(c.button), c.button), 4.5, "Text på knapparna"],
      [ratio(on(c.primary), c.primary), 4.5, "Text på primärfärgen"],
      [ratio(c.accent, c.primary), 3, "Accentfärgen på primärfärgen (rubriketiketter)"],
    ];
    var warnings = checks.filter(function (x) { return x[0] < x[1]; });
    contrastBox.textContent = "";
    var box = document.createElement("div");
    if (warnings.length) {
      box.className = "alert alert-warn";
      var t = document.createElement("p"); t.className = "alert-title"; t.textContent = "Kontrastvarning"; box.appendChild(t);
      var ul = document.createElement("ul");
      warnings.forEach(function (w) {
        var li = document.createElement("li");
        li.textContent = w[2] + ": kontrasten är " + fmt(w[0]) + ":1 (minst " + fmt(w[1]) + ":1 krävs för att vara lättläst).";
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var p = document.createElement("p"); p.textContent = "Du kan spara ändå, men texten kan bli svårläst – särskilt i mobilen och för personer med nedsatt syn."; box.appendChild(p);
    } else {
      box.className = "alert alert-ok";
      box.textContent = "Alla kontraster uppfyller WCAG AA. Snyggt!";
    }
    contrastBox.appendChild(box);
  }

  editor.querySelectorAll("[data-color]").forEach(function (picker) {
    var key = picker.getAttribute("data-color");
    var hex = editor.querySelector('[data-color-hex="' + key + '"]');
    picker.addEventListener("input", function () { if (hex) hex.value = picker.value; update(); });
    if (hex) {
      hex.addEventListener("input", function () {
        var v = hex.value.trim();
        if (v && v[0] !== "#") v = "#" + v;
        if (HEX.test(v)) { picker.value = v.toLowerCase(); update(); }
      });
    }
  });
  editor.querySelectorAll("input[name=font_heading]").forEach(function (r) { r.addEventListener("change", update); });
  update();
})();

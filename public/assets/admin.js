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
        // Fält som börjar med _ är interna – utom sidans uppbyggnad (ordning, dolda avsnitt, textstilar).
        var layoutField = /^__(sida_id|ordning|visa__|stil_)/.test(el.name);
        if (!el.name || el.disabled || (el.name.charAt(0) === "_" && !layoutField) || /__(ta_bort|liten|matt|bank)$/.test(el.name)) return;
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

/* Justera bild: fokuspunkt (klick, dra eller piltangenter), zoom och passform med direkt förhandsvisning. */
(function () {
  var editor = document.querySelector("[data-fit-editor]");
  if (!editor) return;
  var canvas = editor.querySelector("[data-fit-canvas]");
  var img = canvas.querySelector("img");
  var marker = editor.querySelector("[data-fit-marker]");
  var xIn = editor.querySelector("[data-fit-x]");
  var yIn = editor.querySelector("[data-fit-y]");
  var zoom = editor.querySelector("[data-fit-zoom]");
  var zoomOut = editor.querySelector("[data-fit-zoom-out]");
  var zoomField = editor.querySelector("[data-fit-zoom-field]");
  var previews = editor.querySelectorAll("[data-fit-preview]");

  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function mode() { var r = editor.querySelector("[data-fit-mode]:checked"); return r ? r.value : "fyll"; }

  function render() {
    var x = clamp(Number(xIn.value)), y = clamp(Number(yIn.value)), z = Number(zoom.value) || 1;
    var whole = mode() === "hela";
    // Markören ligger över själva bilden (som kan vara smalare än rutan runt den).
    var cr = canvas.getBoundingClientRect(), ir = img.getBoundingClientRect();
    marker.style.left = (ir.left - cr.left + (ir.width * x) / 100) + "px";
    marker.style.top = (ir.top - cr.top + (ir.height * y) / 100) + "px";
    marker.hidden = whole;
    zoomOut.textContent = Math.round(z * 100) + " %";
    zoom.disabled = whole;
    zoomField.classList.toggle("is-disabled", whole);
    previews.forEach(function (p) {
      p.style.objectFit = whole ? "contain" : "cover";
      p.style.objectPosition = whole ? "50% 50%" : x + "% " + y + "%";
      p.style.transformOrigin = x + "% " + y + "%";
      p.style.transform = !whole && z > 1 ? "scale(" + z + ")" : "none";
      p.style.background = whole ? "#fff" : "";
    });
  }

  function setFromPointer(e) {
    var r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    xIn.value = clamp(((e.clientX - r.left) / r.width) * 100);
    yIn.value = clamp(((e.clientY - r.top) / r.height) * 100);
    render();
  }

  var dragging = false;
  canvas.addEventListener("pointerdown", function (e) {
    if (mode() === "hela") return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    setFromPointer(e);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", function (e) { if (dragging) setFromPointer(e); });
  canvas.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("pointercancel", function () { dragging = false; });

  marker.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 10 : 2;
    var d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    xIn.value = clamp(Number(xIn.value) + d[0]);
    yIn.value = clamp(Number(yIn.value) + d[1]);
    render();
  });

  [xIn, yIn, zoom].forEach(function (el) { el.addEventListener("input", render); });
  editor.querySelectorAll("[data-fit-mode]").forEach(function (r) { r.addEventListener("change", render); });
  window.addEventListener("resize", render);
  if (img.complete) render(); else img.addEventListener("load", render);
})();

/* Texter och sidor: flytta avsnitt (dra i handtaget, piltangenter eller knapparna), visa/dölj avsnitt och sidor,
   och textstilar. Ordningen skrivs i det dolda fältet __ordning; förhandsvisningen uppdateras via input-händelser. */
(function () {
  var form = document.querySelector("#texter-form");
  if (!form) return;
  var orderInput = form.querySelector("[data-block-order]");
  var live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  form.appendChild(live);

  function groups() { return Array.prototype.slice.call(form.querySelectorAll(".sec-group[data-block]")); }
  function sectionTitle(g) { var t = g.querySelector(".text-section-title"); return t ? t.textContent : ""; }

  function saveOrder(moved) {
    if (!orderInput) return;
    var gs = groups();
    orderInput.value = gs.map(function (g) { return g.getAttribute("data-block"); }).join(",");
    if (moved) orderInput.dispatchEvent(new Event("input", { bubbles: true }));
    if (moved) live.textContent = sectionTitle(moved) + " ligger nu på plats " + (gs.indexOf(moved) + 1) + " av " + gs.length + ".";
    gs.forEach(function (g, i) {
      var up = g.querySelector('[data-move="up"]'), down = g.querySelector('[data-move="down"]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === gs.length - 1;
    });
  }

  function move(g, dir) {
    var gs = groups(), i = gs.indexOf(g), j = i + dir;
    if (j < 0 || j >= gs.length) return false;
    if (dir < 0) gs[j].before(g); else gs[j].after(g);
    g.classList.add("is-moved");
    setTimeout(function () { g.classList.remove("is-moved"); }, 700);
    saveOrder(g);
    return true;
  }

  // Knapparna i avsnittet och piltangenterna på handtaget
  form.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-move]");
    if (!btn) return;
    var g = btn.closest(".sec-group");
    if (move(g, btn.getAttribute("data-move") === "up" ? -1 : 1)) btn.focus();
  });
  form.addEventListener("keydown", function (e) {
    var h = e.target.closest("[data-drag-handle]");
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    if (move(h.closest(".sec-group"), e.key === "ArrowUp" ? -1 : 1)) h.focus();
  });

  // Dra med mus eller finger
  var drag = null;
  form.addEventListener("pointerdown", function (e) {
    var h = e.target.closest("[data-drag-handle]");
    if (!h || e.button > 0) return;
    var g = h.closest(".sec-group");
    drag = { g: g, h: h, startY: e.clientY, moved: false };
    h.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  form.addEventListener("pointermove", function (e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.startY) < 4) return;
    if (!drag.moved) { drag.moved = true; drag.g.classList.add("is-dragging"); form.classList.add("is-sorting"); }
    // Byt plats när pekaren passerar mitten av grannavsnittet
    var gs = groups(), i = gs.indexOf(drag.g);
    var prev = gs[i - 1], next = gs[i + 1];
    if (prev && e.clientY < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) prev.before(drag.g);
    else if (next && e.clientY > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) next.after(drag.g);
    // Rulla sidan när man drar nära kanten
    if (e.clientY < 80) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
  });
  function endDrag() {
    if (!drag) return;
    drag.g.classList.remove("is-dragging");
    form.classList.remove("is-sorting");
    if (drag.moved) saveOrder(drag.g);
    drag = null;
  }
  form.addEventListener("pointerup", endDrag);
  form.addEventListener("pointercancel", endDrag);

  // Visa/dölj avsnitt
  form.addEventListener("change", function (e) {
    if (e.target.matches("[data-block-visible]")) {
      var g = e.target.closest(".sec-group");
      g.classList.toggle("is-hidden", !e.target.checked);
      var meta = g.querySelector(".text-section-meta"), badge = g.querySelector("[data-hidden-badge]");
      if (!e.target.checked && !badge && meta) {
        badge = document.createElement("span");
        badge.className = "badge-hidden";
        badge.setAttribute("data-hidden-badge", "");
        badge.textContent = "Dold";
        meta.prepend(document.createTextNode(" · "));
        meta.prepend(badge);
      } else if (e.target.checked && badge) {
        var sep = badge.nextSibling;
        badge.remove();
        if (sep && sep.nodeType === 3) sep.remove();
      }
    }
    if (e.target.matches("[data-page-visible]")) {
      var box = e.target.closest("[data-page-visibility]");
      box.classList.toggle("is-hidden", !e.target.checked);
      box.querySelector("[data-visible-hint]").textContent = e.target.checked
        ? "Sidan visas när du sparar. Stäng av för att dölja den helt – inga texter försvinner."
        : "Sidan döljs när du sparar. Besökare får ”Sidan finns inte”, och länkarna till den tas bort från menyn och sidfoten.";
    }
  });

  // Textstilar: visa vald storlek och återställ
  form.addEventListener("input", function (e) {
    if (!e.target.matches("[data-style-size]")) return;
    var out = e.target.parentNode.querySelector("[data-style-size-out]");
    if (out) out.textContent = e.target.value + " %";
  });
  form.addEventListener("click", function (e) {
    var r = e.target.closest("[data-style-reset]");
    if (!r) return;
    var box = r.closest("[data-text-style]");
    var size = box.querySelector("[data-style-size]");
    size.value = 100;
    size.dispatchEvent(new Event("input", { bubbles: true }));
    var std = box.querySelector('[data-style-align][value=""]');
    std.checked = true;
    std.dispatchEvent(new Event("change", { bubbles: true }));
  });

  saveOrder(null);
})();

// Valfria färgfält (t.ex. Engagera dig → Formuläret): färgväljaren och hexkoden hålls i synk,
// "Standard" tömmer fältet så att sajtens vanliga färg används.
(function () {
  var HEX = /^#[0-9a-f]{6}$/i;
  function parts(el) {
    var box = el.closest("[data-color-pick]");
    return box && { box: box, pick: box.querySelector('input[type="color"]'), text: box.querySelector('input[type="text"]'), clear: box.querySelector("[data-color-clear]") };
  }
  function state(p) {
    var auto = !HEX.test(p.text.value);
    p.box.classList.toggle("is-auto", auto);
    p.clear.hidden = p.text.value === "";
  }
  function changed(p) {
    p.text.dispatchEvent(new Event("input", { bubbles: true }));
    p.text.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.addEventListener("input", function (e) {
    var p = e.target.matches && e.target.matches("[data-color-pick] input") && parts(e.target);
    if (!p) return;
    if (e.target === p.pick) {
      p.text.value = p.pick.value;
      state(p);
      changed(p);
    } else if (e.target === p.text) {
      if (HEX.test(p.text.value)) p.pick.value = p.text.value.toLowerCase();
      state(p);
    }
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-color-clear]");
    var p = btn && parts(btn);
    if (!p) return;
    p.text.value = "";
    state(p);
    changed(p);
    p.text.focus();
  });
})();

// Egna färger i Texter och sidor:
//  1. Snabbval – sajtens färger (Utseende) som rutor att klicka på vid varje färgfält.
//  2. Fråga i stället för automatik – byter man bakgrund (eller detaljfärg) och andra färger i avsnittet
//     då blir svåra att se, frågar panelen om de ska anpassas och visar exakt vad som ändras. Inget ändras utan ja.
//  3. Kontrastvarning – visas när rubrik eller text blir svårläst med de färger som faktiskt är valda.
(function () {
  var form = document.getElementById("texter-form");
  if (!form) return;
  var HEX = /^#[0-9a-f]{6}$/i;
  var INK = "#141414", PAPER = "#ffffff";
  var siteBg = form.getAttribute("data-site-bg") || "#ffffff";
  var siteText = form.getAttribute("data-site-text") || INK;
  var siteAccent = form.getAttribute("data-site-accent") || "#f1cc4d";
  var palette = [];
  try { palette = JSON.parse(form.getAttribute("data-site-palette") || "[]"); } catch (e) { palette = []; }

  function lum(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function readableOn(bg) { return ratio(bg, INK) >= ratio(bg, PAPER) ? INK : PAPER; }
  function nameOf(hex) {
    if (hex === INK) return "svart";
    if (hex === PAPER) return "vit";
    for (var i = 0; i < palette.length; i++) if (palette[i][1] === hex) return palette[i][0].toLowerCase();
    return hex;
  }
  var fmt = function (n) { return n.toFixed(1).replace(".", ","); };

  function input(name) { return form.querySelector('input[type="text"][name="' + name + '"]'); }
  function val(name) {
    var el = input(name);
    return el && HEX.test(el.value) ? el.value.toLowerCase() : "";
  }
  function wrapOf(el) { return el.closest(".field, .field-color") || el.parentNode; }
  function labelOf(name) {
    var l = wrapOf(input(name)).querySelector(".field-label");
    var txt = l ? l.childNodes[0].textContent : name;
    // "Stängd – färg: själva låset" → "Själva låset"
    txt = txt.replace(/^.*?färg:\s*/i, "").trim();
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  var applying = false;
  function setColor(name, hex) {
    var el = input(name);
    if (!el) return;
    el.value = hex;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ---------- 1. Snabbval ---------- */
  form.querySelectorAll("[data-color-pick]").forEach(function (pick) {
    var text = pick.querySelector('input[type="text"]');
    if (!text || !palette.length) return;
    var row = document.createElement("div");
    row.className = "color-swatches";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Sajtens färger");
    var lbl = document.createElement("span");
    lbl.className = "color-swatches-label";
    lbl.textContent = "Sajtens färger:";
    row.appendChild(lbl);
    palette.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch";
      b.title = p[0] + " (" + p[1] + ")";
      b.setAttribute("aria-label", "Använd " + p[0].toLowerCase() + " " + p[1]);
      b.setAttribute("data-swatch", p[1]);
      b.style.backgroundColor = p[1];
      b.addEventListener("click", function () { setColor(text.name, p[1]); });
      row.appendChild(b);
    });
    pick.after(row);
  });
  function markSwatches() {
    form.querySelectorAll(".color-swatches").forEach(function (row) {
      var text = row.previousElementSibling && row.previousElementSibling.querySelector('input[type="text"]');
      var v = text && HEX.test(text.value) ? text.value.toLowerCase() : "";
      row.querySelectorAll("[data-swatch]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-swatch") === v)); });
    });
  }

  /* ---------- Grupper: …_c_bg tillsammans med avsnittets övriga färgfält ---------- */
  var TEXTLIKE = ["text", "title", "link"];
  var groups = Array.prototype.slice.call(form.querySelectorAll('input[type="text"][name$="_c_bg"]')).map(function (el) {
    var prefix = el.name.slice(0, -5);
    var has = function (k) { return !!input(prefix + "_c_" + k); };
    var textParts = TEXTLIKE.filter(has);
    var lastName = prefix + "_c_" + (textParts[textParts.length - 1] || "bg");
    var warn = document.createElement("p");
    warn.className = "alert alert-warn contrast-hint";
    warn.setAttribute("role", "status");
    warn.hidden = true;
    wrapOf(input(lastName)).after(warn);
    return { prefix: prefix, textParts: textParts, hasAccent: has("accent"), hasIcon: has("icon"), warn: warn, ask: null };
  });

  /* ---------- 2. Fråga om anpassning ---------- */
  function proposals(g, changed) {
    var out = [];
    if (changed === "bg") {
      var bg = val(g.prefix + "_c_bg");
      if (!bg) return out;
      var target = readableOn(bg);
      g.textParts.forEach(function (k) {
        var name = g.prefix + "_c_" + k;
        if (ratio(val(name) || siteText, bg) < 4.5) out.push({ name: name, hex: target });
      });
      if (g.hasAccent) {
        var an = g.prefix + "_c_accent";
        if (ratio(val(an) || siteAccent, bg) < 1.6) out.push({ name: an, hex: target, why: "syns inte mot bakgrunden" });
      }
    } else if (changed === "accent" && g.hasIcon) {
      var acc = val(g.prefix + "_c_accent");
      var icon = g.prefix + "_c_icon";
      if (acc && ratio(val(icon) || readableOn(siteAccent), acc) < 3) out.push({ name: icon, hex: readableOn(acc) });
    }
    return out.filter(function (p) { return val(p.name) !== p.hex; });
  }
  function closeAsk(g) { if (g.ask) { g.ask.remove(); g.ask = null; } }
  function ask(g, changed) {
    closeAsk(g);
    var list = proposals(g, changed);
    if (!list.length) return;
    var box = document.createElement("div");
    box.className = "color-ask";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Anpassa färgerna");
    var q = document.createElement("p");
    q.className = "color-ask-q";
    q.textContent = changed === "bg"
      ? "Vill du anpassa de andra färgerna i avsnittet så att de syns mot den nya bakgrunden?"
      : "Vill du anpassa låset så att det syns mot den nya färgen?";
    box.appendChild(q);
    var ul = document.createElement("ul");
    list.forEach(function (p) {
      var li = document.createElement("li");
      var dot = document.createElement("span");
      dot.className = "color-ask-dot";
      dot.style.backgroundColor = p.hex;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(labelOf(p.name) + " blir " + nameOf(p.hex)));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    var actions = document.createElement("div");
    actions.className = "color-ask-actions";
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "btn btn-primary btn-sm";
    yes.textContent = "Ja, anpassa";
    var no = document.createElement("button");
    no.type = "button";
    no.className = "btn btn-outline btn-sm";
    no.textContent = "Nej, behåll som det är";
    yes.addEventListener("click", function () {
      applying = true;
      list.forEach(function (p) { setColor(p.name, p.hex); });
      applying = false;
      closeAsk(g);
      refresh();
      var first = input(list[0].name);
      if (first) first.focus();
    });
    no.addEventListener("click", function () {
      closeAsk(g);
      var el = input(g.prefix + "_c_" + changed);
      if (el) el.focus();
    });
    actions.appendChild(yes);
    actions.appendChild(no);
    box.appendChild(actions);
    g.ask = box;
    // Under fältet som ändrades
    var anchor = wrapOf(input(g.prefix + "_c_" + changed));
    var sw = anchor.querySelector(".color-swatches");
    anchor.appendChild(box);
    if (sw) sw.after(box);
  }

  /* ---------- 3. Kontrastvarning (bara de färger som faktiskt är valda) ---------- */
  function check(g) {
    var bg = val(g.prefix + "_c_bg") || siteBg;
    var worst = null;
    g.textParts.forEach(function (k) {
      var r = ratio(val(g.prefix + "_c_" + k) || siteText, bg);
      if (!worst || r < worst.r) worst = { r: r, k: k };
    });
    if (!worst || worst.r >= 4.5) { g.warn.hidden = true; return; }
    g.warn.textContent = labelOf(g.prefix + "_c_" + worst.k) + " blir svårläst – kontrasten mot bakgrunden är " + fmt(worst.r) +
      ":1 (minst 4,5:1 behövs). Välj en ljusare eller mörkare färg, eller klicka på svart eller vit bland sajtens färger.";
    g.warn.hidden = false;
  }
  function refresh() { groups.forEach(check); markSwatches(); }

  form.addEventListener("input", function (e) {
    if (e.target.name && /_c_[a-z]+$/.test(e.target.name)) refresh();
  });
  form.addEventListener("change", function (e) {
    var m = e.target.name && e.target.name.match(/^(.*)_c_(bg|accent)$/);
    if (!m || applying || e.target.type !== "text") return;
    var g = groups.filter(function (x) { return x.prefix === m[1]; })[0];
    if (g) ask(g, m[2]);
  });
  form.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-color-clear]")) setTimeout(refresh, 0); });
  refresh();
})();

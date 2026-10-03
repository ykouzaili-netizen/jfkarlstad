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
        if (!tooBig && !isHeic && (!tooManyPixels || isGif)) {
          showPreview(name, file);
          return;
        }
        if (!window.DataTransfer) throw new Error("datatransfer");
        setStatus(name, "Komprimerar bilden …", "busy");
        var res = await compress(source, file, max);
        if (res.blob.size > max) throw new Error("toolarge");
        if (!tooBig && !isHeic && res.blob.size >= file.size) { showPreview(name, file); setStatus(name, ""); return; }
        var newFile = replaceFile(input, res.blob, file.name);
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

  /* ---------- Utseende: live-förhandsvisning och kontrastkontroll ---------- */
  var editor = document.querySelector("[data-theme-editor]");
  if (!editor) return;
  var preview = document.querySelector("[data-preview-root]");
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
    var set = function (k, v) { preview.style.setProperty(k, v); };
    set("--p-bg", c.bg); set("--p-surface", c.surface); set("--p-text", c.text);
    set("--p-primary", c.primary); set("--p-on-primary", on(c.primary));
    set("--p-accent", c.accent); set("--p-on-accent", on(c.accent));
    set("--p-button", c.button); set("--p-on-button", on(c.button));
    var font = editor.querySelector("input[name=font_heading]:checked");
    if (font) {
      set("--p-font", font.getAttribute("data-font"));
      set("--p-scale", font.getAttribute("data-font-scale"));
    }

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

/* JFK adminpanel – små förbättringar. Allt fungerar även utan JavaScript. */

/* ---------- Fotodatum ur bildens uppgifter (EXIF) ----------
   window.jfkTakenAt(fil) ger "YYYY-MM-DDTHH:MM" (kamerans lokala tid) eller null. Läser DateTimeOriginal
   (annars DateTimeDigitized) i JPG, HEIC, WebP och PNG. Bara början av filen läses – i HEIC kan uppgifterna
   ligga längre in, därför läses hela filen för den. Används när bilder laddas upp (innan de komprimeras, eftersom
   komprimeringen tar bort uppgifterna) och av "Läs fotodatum ur bilderna" i bildgalleriet. */
(function () {
  "use strict";
  var HEAD = 512 * 1024;

  function tiffDate(v, t) {
    if (t + 8 > v.byteLength) return null;
    var le = v.getUint16(t) === 0x4949;
    if (!le && v.getUint16(t) !== 0x4d4d) return null;
    var u16 = function (o) { return v.getUint16(o, le); };
    var u32 = function (o) { return v.getUint32(o, le); };
    var entries = function (ifd) {
      var out = {};
      if (ifd <= 0 || t + ifd + 2 > v.byteLength) return out;
      var count = u16(t + ifd);
      for (var i = 0; i < count && i < 500; i++) {
        var e = t + ifd + 2 + i * 12;
        if (e + 12 > v.byteLength) break;
        out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
      }
      return out;
    };
    var ascii = function (en) {
      if (!en || en.type !== 2 || en.count < 19) return null;
      var o = en.count > 4 ? t + u32(en.at) : en.at;
      if (o + 19 > v.byteLength) return null;
      var str = "";
      for (var i = 0; i < 19; i++) str += String.fromCharCode(v.getUint8(o + i));
      return str;
    };
    var ifd0 = entries(u32(t + 4));
    var ptr = ifd0[0x8769];
    if (!ptr) return null;
    var exif = entries(u32(ptr.at));
    var raw = ascii(exif[0x9003]) || ascii(exif[0x9004]);
    var m = raw && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    return m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5];
  }

  function find(bytes, pattern, from) {
    outer: for (var i = from || 0; i <= bytes.length - pattern.length; i++) {
      for (var j = 0; j < pattern.length; j++) if (bytes[i + j] !== pattern[j]) continue outer;
      return i;
    }
    return -1;
  }
  var EXIF_HEAD = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

  function parse(buf) {
    var v = new DataView(buf), bytes = new Uint8Array(buf);
    if (v.byteLength < 12) return null;
    // JPG: gå igenom segmenten till APP1 med "Exif\0\0"
    if (v.getUint16(0) === 0xffd8) {
      var o = 2;
      while (o + 4 <= v.byteLength && v.getUint8(o) === 0xff) {
        var marker = v.getUint8(o + 1), len = v.getUint16(o + 2);
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0xe1 && find(bytes.subarray(o + 4, o + 10), EXIF_HEAD) === 0) return tiffDate(v, o + 10);
        o += 2 + len;
      }
      return null;
    }
    // WebP: chunken "EXIF" (med eller utan "Exif\0\0" först)
    if (find(bytes.subarray(0, 4), [0x52, 0x49, 0x46, 0x46]) === 0) {
      var w = find(bytes, [0x45, 0x58, 0x49, 0x46], 12);
      if (w > 0) {
        var start = w + 8;
        if (find(bytes.subarray(start, start + 6), EXIF_HEAD) === 0) start += 6;
        return tiffDate(v, start);
      }
      return null;
    }
    // PNG (eXIf) och HEIC: leta upp "Exif\0\0" följt av en TIFF-början, annars eXIf-chunken direkt
    var at = 0;
    while ((at = find(bytes, EXIF_HEAD, at)) >= 0) {
      var r = tiffDate(v, at + 6);
      if (r) return r;
      at += 6;
    }
    var png = find(bytes, [0x65, 0x58, 0x49, 0x66]); // "eXIf"
    return png > 0 ? tiffDate(v, png + 4) : null;
  }

  window.jfkTakenAt = function (blob) {
    if (!blob || !blob.slice || !blob.arrayBuffer && !window.FileReader) return Promise.resolve(null);
    var heic = /heic|heif/i.test(blob.type || "") || /\.(heic|heif)$/i.test(blob.name || "");
    var part = heic ? blob : blob.slice(0, HEAD);
    var read = part.arrayBuffer ? part.arrayBuffer() : new Promise(function (ok, fail) {
      var fr = new FileReader();
      fr.onload = function () { ok(fr.result); };
      fr.onerror = fail;
      fr.readAsArrayBuffer(part);
    });
    return read.then(function (buf) { try { return parse(buf); } catch (e) { return null; } }, function () { return null; });
  };
  window.jfkParseTaken = function (buf) { try { return parse(buf); } catch (e) { return null; } };
})();

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

  /* Mindre versioner till webbplatsen: 800 px bred ("liten", mobiler och kort) och 1600 px bred ("mellan", datorer).
     Bredden – inte längsta sidan – avgör, så att webbläsarens val i srcset (800w/1600w) stämmer även för stående bilder.
     Läggs i de dolda fälten "<namn>__liten" och "<namn>__mellan". WebP när webbläsaren kan, annars JPG (PNG vid genomskinlighet). */
  var VARIANT_WIDTHS = { liten: 800, mellan: 1600 };
  var VARIANT_MAX_BYTES = { liten: 1024 * 1024, mellan: 2.5 * 1024 * 1024 };
  async function makeVariant(source, transparent, size) {
    var target = VARIANT_WIDTHS[size];
    var w0 = source.width, h0 = source.height;
    if (w0 <= target * 1.1) return null; // originalet är redan smalt nog – webbplatsen använder det i stället
    var canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = Math.max(1, Math.round(h0 * target / w0));
    var ctx = canvas.getContext("2d");
    var type = webpOk ? "image/webp" : transparent ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    var blob = await toBlob(canvas, type, type === "image/png" ? undefined : (size === "liten" ? 0.8 : 0.82));
    canvas.width = canvas.height = 0; // frigör minnet direkt (viktigt på mobiler när många bilder görs i rad)
    return blob && blob.size <= VARIANT_MAX_BYTES[size] ? blob : null;
  }
  function isTransparent(source, file) { return /png|webp|gif/.test(file.type || "") && hasAlpha(source, source.width, source.height); }

  function companion(name, attr) { return document.querySelector("[" + attr + '="' + name + '"]'); }

  function variantFile(blob, prefix, originalName) {
    var ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    return new File([blob], prefix + "-" + (originalName || "bild").replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
  }

  function setVariant(name, attr, blob, prefix, originalName) {
    var input = companion(name, attr);
    if (!input || !window.DataTransfer) return;
    var dt = new DataTransfer();
    if (blob) dt.items.add(variantFile(blob, prefix, originalName));
    input.files = dt.files;
  }
  function setSmall(name, blob, originalName) { setVariant(name, "data-small-for", blob, "liten", originalName); }
  function setMedium(name, blob, originalName) { setVariant(name, "data-medium-for", blob, "mellan", originalName); }

  /* Fotodatum: det dolda fältet `${namn}__tagen` får datumet (eller "saknas") så att servern vet att bilden är läst.
     Ett synligt datumfält i samma formulär (Fotograferad) fylls i om det är tomt eller fylldes i härifrån förut. */
  function setTaken(input, name, value, read) {
    var hidden = companion(name, "data-taken-for");
    if (!hidden) return;
    hidden.value = read ? value || "saknas" : "";
    var form = input.form, field = form && form.querySelector('input[type="datetime-local"][name="taken_at"]');
    if (!field) return;
    var auto = field.hasAttribute("data-taken-auto");
    if (value && (!field.value || auto)) {
      field.value = value;
      field.setAttribute("data-taken-auto", "");
    } else if (!value && auto) {
      field.value = "";
      field.removeAttribute("data-taken-auto");
    }
    field.addEventListener("input", function () { field.removeAttribute("data-taken-auto"); }, { once: true });
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

  /* ---------- Beskärning och svartvitt (porträtt) ----------
     Fält med data-crop (bredd/höjd, t.ex. 0.75 = 3:4) öppnar en ruta där man drar och zoomar bilden under en fast ram.
     data-gray-if="kind=hedersmedlem" gör bilden svartvit när fältet kind har det värdet. Resultatet ersätter filen
     i formuläret – originalet lämnar aldrig datorn. Avbryter man används hela bilden (svartvit om det behövs). */
  function grayWanted(input) {
    var cond = input.getAttribute("data-gray-if");
    if (!cond || !input.form) return false;
    var parts = cond.split("="), field = input.form.elements[parts[0]];
    if (!field) return false;
    var value = field.value;
    if (field.length && !field.tagName) { // RadioNodeList
      value = "";
      Array.prototype.forEach.call(field, function (r) { if (r.checked) value = r.value; });
    }
    return value === parts[1];
  }

  function toGray(canvas) {
    var ctx = canvas.getContext("2d");
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  var MAX_CROP_SIDE = 2000;
  function drawRegion(source, sx, sy, sw, sh, gray) {
    var k = Math.min(1, MAX_CROP_SIDE / Math.max(sw, sh));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * k));
    c.height = Math.max(1, Math.round(sh * k));
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return gray ? toGray(c) : c;
  }

  /** Visar beskärningsrutan. Svarar med en canvas (utsnittet), eller null om bilden ska användas som den är. */
  function editImage(source, ratio, gray, fileName) {
    var W = source.width, H = source.height;
    if (!ratio || !window.HTMLDialogElement) {
      return Promise.resolve(gray ? drawRegion(source, 0, 0, W, H, true) : null);
    }
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "crop-dialog";
      dlg.setAttribute("aria-labelledby", "crop-title");
      dlg.innerHTML =
        '<form method="dialog" class="crop-inner">' +
        '<h2 class="crop-title" id="crop-title">Beskär porträttet</h2>' +
        '<p class="crop-help">Dra i bilden för att flytta den och zooma med reglaget (eller mushjulet). Piltangenterna flyttar, + och − zoomar.' + (gray ? " Fotot sparas svartvitt." : "") + "</p>" +
        '<div class="crop-stage" tabindex="0" aria-label="Utsnitt – dra eller använd piltangenterna"><img class="crop-img" alt="" draggable="false"><span class="crop-grid" aria-hidden="true"></span></div>' +
        '<label class="crop-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>' +
        '<div class="crop-actions"><button class="btn btn-primary" value="ok">Använd utsnittet</button><button class="btn btn-outline" value="whole">Använd hela bilden</button></div>' +
        "</form>";
      document.body.appendChild(dlg);
      var stage = dlg.querySelector(".crop-stage"), img = dlg.querySelector(".crop-img"), zoom = dlg.querySelector('input[type="range"]');
      if (gray) img.classList.add("is-gray");
      // Förhandsbilden: en nedskalad kopia (snabbare att flytta på mobiler)
      var pv = document.createElement("canvas"), pk = Math.min(1, 1400 / Math.max(W, H));
      pv.width = Math.round(W * pk); pv.height = Math.round(H * pk);
      pv.getContext("2d").drawImage(source, 0, 0, pv.width, pv.height);
      img.src = pv.toDataURL("image/jpeg", 0.85);

      var frameW = 0, frameH = 0, base = 1, z = 1, x = 0, y = 0;
      function layout() {
        // Ramen får plats både på bredden och på höjden (mobil på tvären, låga laptopskärmar)
        frameW = Math.floor(Math.min(stage.parentNode.clientWidth, window.innerHeight * 0.55 * ratio));
        frameH = frameW / ratio;
        stage.style.width = frameW + "px";
        stage.style.height = frameH + "px";
        base = Math.max(frameW / W, frameH / H); // täcker ramen
        clamp();
        paint();
      }
      function clamp() {
        var s = base * z, iw = W * s, ih = H * s;
        x = Math.min(0, Math.max(frameW - iw, x));
        y = Math.min(0, Math.max(frameH - ih, y));
      }
      function paint() {
        var s = base * z;
        img.style.width = W * s + "px";
        img.style.height = H * s + "px";
        img.style.transform = "translate(" + x + "px," + y + "px)";
      }
      function zoomTo(nz, cx, cy) {
        nz = Math.min(4, Math.max(1, nz));
        cx = cx == null ? frameW / 2 : cx; cy = cy == null ? frameH / 2 : cy;
        var s0 = base * z, s1 = base * nz;
        x = cx - (cx - x) * (s1 / s0);
        y = cy - (cy - y) * (s1 / s0);
        z = nz;
        zoom.value = String(z);
        clamp(); paint();
      }
      dlg.showModal();
      requestAnimationFrame(function () {
        layout();
        // Börja centrerat, lite uppåt (ansiktet brukar vara i övre delen)
        var s = base * z;
        x = (frameW - W * s) / 2; y = (frameH - H * s) / 3;
        clamp(); paint();
        stage.focus();
      });
      window.addEventListener("resize", layout);

      var drag = null;
      stage.addEventListener("pointerdown", function (e) {
        drag = { x0: e.clientX, y0: e.clientY, x: x, y: y };
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("is-dragging");
      });
      stage.addEventListener("pointermove", function (e) {
        if (!drag) return;
        x = drag.x + (e.clientX - drag.x0); y = drag.y + (e.clientY - drag.y0);
        clamp(); paint();
      });
      var stop = function () { drag = null; stage.classList.remove("is-dragging"); };
      stage.addEventListener("pointerup", stop);
      stage.addEventListener("pointercancel", stop);
      stage.addEventListener("wheel", function (e) {
        e.preventDefault();
        var r = stage.getBoundingClientRect();
        zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      stage.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 40 : 10;
        if (e.key === "ArrowLeft") x += step; else if (e.key === "ArrowRight") x -= step;
        else if (e.key === "ArrowUp") y += step; else if (e.key === "ArrowDown") y -= step;
        else if (e.key === "+" || e.key === "=") return zoomTo(z * 1.1);
        else if (e.key === "-") return zoomTo(z / 1.1);
        else return;
        e.preventDefault();
        clamp(); paint();
      });
      zoom.addEventListener("input", function () { zoomTo(parseFloat(zoom.value)); });

      dlg.addEventListener("close", function () {
        window.removeEventListener("resize", layout);
        var s = base * z;
        var out = dlg.returnValue === "ok"
          ? drawRegion(source, -x / s, -y / s, frameW / s, frameH / s, gray)
          : gray ? drawRegion(source, 0, 0, W, H, true) : null;
        dlg.remove();
        resolve(out);
      });
    });
  }

  document.querySelectorAll("[data-upload]").forEach(function (input) {
    input.addEventListener("change", async function () {
      var name = input.getAttribute("data-upload");
      var kind = input.getAttribute("data-kind") || "image";
      var max = parseInt(input.getAttribute("data-max") || "0", 10) || 5 * 1024 * 1024;
      var file = input.files && input.files[0];
      setStatus(name, "");
      setSmall(name, null, "");
      setMedium(name, null, "");
      setDims(name, 0, 0);
      setTaken(input, name, null, false);
      var bank = companion(name, "data-bank-for");
      if (bank && file) bank.value = "";
      if (!file) return;
      if (input.multiple && input.files.length > 1) {
        // Flera bilder: de förbereds och laddas upp en i taget när formuläret skickas (se nedan).
        var pv = document.querySelector('[data-preview="' + name + '"]');
        if (pv) pv.hidden = true;
        setStatus(name, input.files.length + " bilder valda. De laddas upp en i taget när du klickar på Skapa – bildbeskrivning, bildtext och album gäller alla.", "ok");
        return;
      }

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
        // Fotodatumet läses ur originalet – komprimering och beskärning tar bort det
        if (companion(name, "data-taken-for") && window.jfkTakenAt) setTaken(input, name, await window.jfkTakenAt(file), true);
        var source = await decode(file);
        // Porträtt: beskär (data-crop) och/eller gör svartvit (data-gray-if) innan något annat
        var cropRatio = parseFloat(input.getAttribute("data-crop") || "0");
        var gray = grayWanted(input);
        if ((cropRatio || gray) && window.DataTransfer && !/image\/gif/.test(file.type)) {
          setStatus(name, "Beskär bilden …", "busy");
          var edited = await editImage(source, cropRatio, gray, file.name);
          if (edited) {
            var eBlob = await toBlob(edited, "image/jpeg", 0.9);
            if (eBlob) {
              file = replaceFile(input, eBlob, file.name);
              source = edited;
              setStatus(name, (cropRatio ? "Bilden är beskuren" : "Bilden är klar") + (gray ? " och svartvit" : "") + " (" + edited.width + " × " + edited.height + " px).", "ok");
            }
          } else setStatus(name, "");
        }
        var dims = { w: source.width, h: source.height };
        var tooBig = file.size > max;
        var tooManyPixels = Math.max(dims.w, dims.h) > RESIZE_ABOVE && file.size > RESIZE_MIN_BYTES;
        var isGif = file.type === "image/gif";
        var finish = async function (f, w, h) {
          setDims(name, w, h);
          if (!isGif) {
            var transparent = isTransparent(source, f);
            try { setSmall(name, await makeVariant(source, transparent, "liten"), f.name); } catch (e) { setSmall(name, null, ""); }
            try { setMedium(name, await makeVariant(source, transparent, "mellan"), f.name); } catch (e) { setMedium(name, null, ""); }
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

  /* ---------- Flera bilder på en gång (t.ex. galleriet) ----------
     Varje bild förbereds här (komprimeras vid behov, mindre versioner görs) och skickas för sig till samma
     adress som formuläret – precis som om man hade laddat upp dem en och en. Utan JS tar servern emot alla på en gång. */
  async function prepareImage(file, max) {
    var source = await decode(file);
    var w = source.width, h = source.height, out = file;
    var isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    var isGif = file.type === "image/gif";
    var tooManyPixels = Math.max(w, h) > RESIZE_ABOVE && file.size > RESIZE_MIN_BYTES;
    if (file.size > max || isHeic || (tooManyPixels && !isGif)) {
      var res = await compress(source, file, max);
      if (res.blob.size > max) throw new Error("toolarge");
      if (file.size > max || isHeic || res.blob.size < file.size) {
        var ext = res.blob.type === "image/webp" ? "webp" : res.blob.type === "image/png" ? "png" : "jpg";
        out = new File([res.blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: res.blob.type });
        w = res.w; h = res.h;
      }
    }
    var small = null, medium = null;
    if (!isGif) {
      var transparent = isTransparent(source, out);
      try { small = await makeVariant(source, transparent, "liten"); } catch (e) { small = null; }
      try { medium = await makeVariant(source, transparent, "mellan"); } catch (e) { medium = null; }
    }
    if (source.close) source.close();
    return { file: out, small: small, medium: medium, w: w, h: h };
  }

  document.querySelectorAll("form").forEach(function (form) {
    var input = form.querySelector("input[data-upload][multiple]");
    if (!input || !window.fetch || !window.FormData) return;
    form.addEventListener("submit", async function (e) {
      if (!input.files || input.files.length < 2) return;
      e.preventDefault();
      var name = input.getAttribute("data-upload");
      var max = parseInt(input.getAttribute("data-max") || "0", 10) || 5 * 1024 * 1024;
      var files = Array.prototype.slice.call(input.files);
      var buttons = form.querySelectorAll('button[type="submit"]');
      buttons.forEach(function (b) { b.disabled = true; });
      var box = document.createElement("div");
      box.className = "bulk-progress";
      box.setAttribute("role", "status");
      box.innerHTML = '<p class="bulk-progress-text"></p><progress max="' + files.length + '" value="0"></progress><ul class="bulk-progress-errors"></ul>';
      var actions = form.querySelector(".admin-form-actions");
      form.insertBefore(box, actions);
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      var text = box.querySelector(".bulk-progress-text"), bar = box.querySelector("progress"), errs = box.querySelector(".bulk-progress-errors");
      var ok = 0, failed = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        text.textContent = "Laddar upp bild " + (i + 1) + " av " + files.length + " – " + f.name + " …";
        try {
          var prep = await prepareImage(f, max);
          var fd = new FormData(form);
          var taken = window.jfkTakenAt ? await window.jfkTakenAt(f) : null;
          fd.delete(name); fd.delete(name + "__liten"); fd.delete(name + "__mellan"); fd.delete(name + "__matt"); fd.delete(name + "__bank"); fd.delete(name + "__tagen");
          if (companion(name, "data-taken-for")) fd.append(name + "__tagen", taken || "saknas");
          fd.append(name, prep.file, prep.file.name);
          if (prep.small) fd.append(name + "__liten", variantFile(prep.small, "liten", prep.file.name));
          if (prep.medium) fd.append(name + "__mellan", variantFile(prep.medium, "mellan", prep.file.name));
          fd.append(name + "__matt", prep.w + "x" + prep.h);
          var res = await fetch(form.action, { method: "POST", body: fd, credentials: "same-origin", headers: { "X-Bulk-Upload": "1" } });
          var out = await res.json().catch(function () { return {}; });
          if (!res.ok || !out.ok) throw new Error("server");
          ok++;
        } catch (err) {
          failed++;
          var li = document.createElement("li");
          li.textContent = f.name + ": " + (err && err.message === "toolarge" ? "gick inte att komprimera tillräckligt." : /heic|heif/i.test(f.name) ? "den här webbläsaren kan inte läsa HEIC – spara bilden som JPG." : "kunde inte laddas upp.");
          errs.appendChild(li);
        }
        bar.value = i + 1;
      }
      var list = form.action.replace(/\/ny(\?.*)?$/, "");
      var url = list + "?klart=" + (failed ? "flera-delvis" : "flera") + "&antal=" + ok + "&misslyckade=" + failed;
      if (!failed) { location.href = url; return; }
      text.textContent = ok + " av " + files.length + " bilder laddades upp. De här gick inte:";
      var go = document.createElement("a");
      go.className = "btn btn-primary"; go.href = url; go.textContent = "Till listan";
      box.appendChild(go);
      buttons.forEach(function (b) { b.disabled = false; });
    });
  });

  /* ---------- Bildbanken → Gör bilderna snabbare ----------
     Gör de mindre versionerna (800 och 1600 px breda) av befintliga bilder: hämtar originalet, skalar om det här
     och skickar versionerna till servern en bild i taget. Avbryts det (sidan stängs) fortsätter man där man slutade. */
  (function () {
    var card = document.querySelector("[data-optimize]");
    if (!card || !window.fetch || !window.FormData) return;
    var items;
    try { items = JSON.parse(card.getAttribute("data-optimize")) || []; } catch (e) { return; }
    var btn = card.querySelector("[data-optimize-start]");
    var bar = card.querySelector("[data-optimize-progress]");
    var status = card.querySelector("[data-optimize-status]");
    var csrf = card.querySelector('input[name="_csrf"]');
    if (!btn || !items.length) return;
    btn.hidden = false;

    function say(text, kind) { status.textContent = text; status.className = "upload-status" + (kind ? " is-" + kind : ""); }
    function decodeBlob(blob) {
      if (window.createImageBitmap) return createImageBitmap(blob).catch(function () { return decodeWithImg(blob); });
      return decodeWithImg(blob);
    }

    async function one(item) {
      var res = await fetch("/media/" + encodeURI(item.k), { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("hämta");
      var blob = await res.blob();
      var source = await decodeBlob(blob);
      var transparent = /png|webp/.test(blob.type) && hasAlpha(source, source.width, source.height);
      var fd = new FormData();
      fd.append("_csrf", csrf ? csrf.value : "");
      fd.append("nyckel", item.k);
      fd.append("matt", source.width + "x" + source.height);
      if (item.s) {
        var small = await makeVariant(source, transparent, "liten");
        if (small) fd.append("liten", variantFile(small, "liten", item.k));
      }
      var medium = await makeVariant(source, transparent, "mellan");
      if (medium) fd.append("mellan", variantFile(medium, "mellan", item.k));
      if (source.close) source.close();
      var r = await fetch("/admin/bildbank/optimera", { method: "POST", body: fd, credentials: "same-origin" });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data.ok) throw new Error(data.error || "spara");
    }

    btn.addEventListener("click", async function () {
      btn.disabled = true;
      bar.hidden = false;
      var failed = 0, stop = null;
      window.addEventListener("beforeunload", warn);
      for (var i = 0; i < items.length; i++) {
        say("Optimerar bild " + (i + 1) + " av " + items.length + " …", "busy");
        try { await one(items[i]); }
        catch (e) {
          failed++;
          if (/Sessionen/.test(e.message)) { stop = e.message; break; }
        }
        bar.value = i + 1;
      }
      window.removeEventListener("beforeunload", warn);
      if (stop) { say(stop, "error"); btn.disabled = false; return; }
      if (failed) {
        say("Klart, men " + failed + (failed === 1 ? " bild" : " bilder") + " gick inte att optimera. Ladda om sidan och försök igen.", "error");
        btn.disabled = false;
      } else {
        say("Klart! Alla bilder är optimerade. Webbplatsen visar nu de mindre versionerna.", "ok");
        btn.hidden = true;
      }
    });
    function warn(e) { e.preventDefault(); e.returnValue = ""; }
  })();

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
      setMedium(field, null, "");
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

// Bildspel under bildfälten: visa/dölj panelen efter valet och visa nästa plats för en ny bild.
(function () {
  document.querySelectorAll("[data-slides-edit]").forEach(function (box) {
    var panel = box.querySelector("[data-slides-panel]");
    var more = box.querySelector("[data-slides-more]");
    function sync() {
      var on = box.querySelector("[data-slides-mode]:checked");
      panel.hidden = !(on && on.value === "spel");
    }
    function updateMore() { more.hidden = !box.querySelector("[data-slides-add][hidden]"); }
    box.addEventListener("change", function (e) { if (e.target.matches("[data-slides-mode]")) sync(); });
    more.addEventListener("click", function () {
      var next = box.querySelector("[data-slides-add][hidden]");
      if (next) {
        next.hidden = false;
        var input = next.querySelector("input[type=file]");
        if (input) input.focus();
      }
      updateMore();
    });
    sync();
    updateMore();
  });
})();

// Utseende → Rörelse: introts utseenden visas bara när introt är påslaget.
(function () {
  var toggle = document.querySelector("[data-intro-toggle]");
  var styles = document.querySelector("[data-intro-styles]");
  if (!toggle || !styles) return;
  function sync() { styles.hidden = !toggle.checked; }
  toggle.addEventListener("change", sync);
  sync();
})();

// Jobbformuläret: fältet för arbetsgivarens namn behövs bara när arbetsgivaren inte valts i listan.
(function () {
  var pick = document.querySelector('select[name="employer_pick"]');
  var name = document.querySelector('input[name="employer"]');
  var wrap = name && (name.closest(".field") || name.parentNode);
  if (!pick || !wrap) return;
  function sync() { wrap.hidden = pick.value !== ""; }
  pick.addEventListener("change", sync);
  sync();
})();

// Fält som bara visas vid ett visst val (showIf i resources.ts), t.ex. Dokument: länk eller PDF.
(function () {
  document.querySelectorAll("form.admin-form").forEach(function (form) {
    var blocks = form.querySelectorAll("[data-show-if]");
    if (!blocks.length) return;
    function sync(focusNew) {
      blocks.forEach(function (box) {
        var on = form.querySelector('input[name="' + box.dataset.showIf + '"]:checked');
        var show = !!on && box.dataset.showValue.split("|").indexOf(on.value) !== -1;
        var wasHidden = box.hidden;
        box.hidden = !show;
        if (focusNew && show && wasHidden) {
          var input = box.querySelector("input:not([type=hidden]):not([type=checkbox]), textarea, select");
          if (input && input.type !== "file") input.focus();
        }
      });
    }
    form.addEventListener("change", function (e) {
      if (e.target.type === "radio" && form.querySelector('[data-show-if="' + e.target.name + '"]')) sync(true);
    });
    sync(false);
  });
})();

// Ordnar och medaljer: förhandsvisningen överst följer valet av bild.
(function () {
  var img = document.querySelector("[data-medal-preview-img]");
  var form = img && img.closest("form");
  if (!form) return;
  form.addEventListener("change", function (e) {
    if (e.target.name === "design") {
      var choice = e.target.closest(".choice");
      var art = choice && choice.querySelector("img");
      var src = art ? art.getAttribute("src") : img.getAttribute("data-photo");
      img.hidden = !src;
      if (src) img.src = src;
    } else if (e.target.name === "image_key" && e.target.files && e.target.files[0]) {
      // Visa den valda filen direkt, innan den sparas
      img.src = URL.createObjectURL(e.target.files[0]);
      img.hidden = false;
    }
  });
})();

/* ---------- Rader som går att lägga till och ta bort (partnerns "Fler länkar") ----------
   Utan JavaScript visas alla sparade rader plus två tomma; tömda rader sparas inte. Här visas bara en tom rad,
   "+ Lägg till länk" lägger till fler (högst data-repeater-max) och "Ta bort" tar bort raden. */
(function () {
  "use strict";
  document.querySelectorAll("[data-repeater]").forEach(function (box) {
    var list = box.querySelector("[data-repeater-list]");
    var tpl = box.querySelector("[data-repeater-template]");
    var add = box.querySelector("[data-repeater-add]");
    if (!list || !tpl || !add) return;
    var max = parseInt(box.getAttribute("data-repeater-max") || "10", 10);
    var rows = function () { return Array.prototype.slice.call(list.querySelectorAll("[data-repeater-row]")); };
    var empty = function (row) {
      return Array.prototype.every.call(row.querySelectorAll("input:not([type=hidden])"), function (i) { return !i.value.trim(); });
    };
    var renumber = function () {
      rows().forEach(function (row, i) {
        var n = String(i + 1);
        var num = row.querySelector(".link-row-num");
        if (num) num.textContent = n;
        row.querySelectorAll(".sr-only").forEach(function (s) { if (/^\(länk/.test(s.textContent)) s.textContent = "(länk " + n + ")"; });
      });
      var count = rows().length;
      add.hidden = count >= max;
      rows().forEach(function (row) { row.querySelector("[data-repeater-remove]").hidden = false; });
    };
    var uid = 0;
    var addRow = function (focus) {
      uid++;
      var frag = tpl.content.cloneNode(true);
      frag.querySelectorAll("[id],[for]").forEach(function (el) {
        ["id", "for"].forEach(function (a) {
          var v = el.getAttribute(a);
          if (v) el.setAttribute(a, v.replace("__N__", "ny" + uid));
        });
      });
      var row = frag.querySelector("[data-repeater-row]");
      row.classList.add("is-new");
      // Handtaget för att dra raden (se "Dra och släpp" nedan) visas bara när listan går att sortera
      row.querySelectorAll("[data-sort-handle]").forEach(function (h) { h.hidden = !list.classList.contains("is-sortable"); });
      list.appendChild(frag);
      renumber();
      if (focus) row.querySelector("input:not([type=hidden])").focus();
    };
    // Bara en tom rad i taget – de extra tomma raderna från servern behövs inte när det finns en knapp
    var blanks = rows().filter(empty);
    blanks.slice(1).forEach(function (r) { r.remove(); });
    if (!rows().length) addRow(false);
    add.addEventListener("click", function () {
      var last = rows()[rows().length - 1];
      if (last && empty(last)) { last.querySelector("input:not([type=hidden])").focus(); return; }
      addRow(true);
    });
    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-repeater-remove]");
      if (!btn) return;
      var row = btn.closest("[data-repeater-row]");
      var all = rows();
      var i = all.indexOf(row);
      if (all.length === 1) {
        row.querySelectorAll("input").forEach(function (inp) { inp.value = ""; });
        row.querySelector("input:not([type=hidden])").focus();
      } else {
        row.remove();
        var next = rows()[Math.min(i, rows().length - 1)];
        (next ? next.querySelector("input:not([type=hidden])") : add).focus();
      }
      renumber();
      // Formuläret har ändrats (varningen "osparade ändringar" ska slå till)
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Raderna har flyttats med dra och släpp
    list.addEventListener("sortable:moved", function () {
      renumber();
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    renumber();
  });
})();

/* ---------- Dra och släpp (listor som går att sortera och partnerns länkrader) ----------
   [data-sortable] innehåller rader med [data-sort-id] och ett handtag [data-sort-handle]. Raden dras med mus
   eller finger, eller flyttas med piltangenterna på handtaget. Bara rader med samma data-sort-group byter plats
   (t.ex. medaljer i samma grupp). Med data-sort-url sparas den nya ordningen direkt (POST ids=1,2,3); annars
   (länkraderna i ett formulär) skickas händelsen "sortable:moved" och ordningen sparas med formuläret.
   Utan JavaScript finns knapparna Flytta upp/ned kvar. */
(function () {
  "use strict";
  document.querySelectorAll("[data-sortable]").forEach(function (box) {
    var url = box.getAttribute("data-sort-url");
    var items = function () { return Array.prototype.slice.call(box.children).filter(function (el) { return el.hasAttribute("data-sort-id"); }); };
    var group = function (el) { return el.getAttribute("data-sort-group") || ""; };
    var peers = function (el) { return items().filter(function (x) { return group(x) === group(el); }); };
    box.classList.add("is-sortable");
    box.querySelectorAll("[data-sort-handle]").forEach(function (h) { h.hidden = false; });

    // Statusrad för listor som sparas direkt
    var status = null;
    if (url) {
      status = document.createElement("p");
      status.className = "sort-status";
      status.setAttribute("role", "status");
      var holder = box.closest(".admin-card") || box;
      holder.parentNode.insertBefore(status, holder.nextSibling);
    }
    var say = function (text, bad) {
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("is-error", !!bad);
    };

    // Knapparna Flytta upp/ned: första och sista i gruppen kan inte flyttas längre
    var refreshButtons = function () {
      items().forEach(function (el) {
        var ps = peers(el), i = ps.indexOf(el);
        var up = el.querySelector('input[name="riktning"][value="upp"]');
        var down = el.querySelector('input[name="riktning"][value="ned"]');
        if (up) up.parentNode.querySelector("button").disabled = i <= 0;
        if (down) down.parentNode.querySelector("button").disabled = i === ps.length - 1;
      });
    };

    var timer = null;
    var save = function (el) {
      if (!url) {
        box.dispatchEvent(new CustomEvent("sortable:moved", { bubbles: true }));
        return;
      }
      refreshButtons();
      clearTimeout(timer);
      say("Sparar ordningen …");
      timer = setTimeout(function () {
        var body = new FormData();
        body.append("_csrf", box.getAttribute("data-csrf") || "");
        body.append("ids", peers(el).map(function (x) { return x.getAttribute("data-sort-id"); }).join(","));
        fetch(url, { method: "POST", body: body, credentials: "same-origin" })
          .then(function (res) {
            if (res.ok) { box.dispatchEvent(new CustomEvent("sortable:saved", { bubbles: true })); return say("Ordningen är sparad."); }
            return res.text().then(function (t) { say(t || "Ordningen kunde inte sparas. Ladda om sidan och försök igen.", true); });
          })
          .catch(function () { say("Ordningen kunde inte sparas – kontrollera internetanslutningen och försök igen.", true); });
      }, 350);
    };

    var flash = function (el) {
      el.classList.remove("is-moved");
      void el.offsetWidth;
      el.classList.add("is-moved");
    };
    var move = function (el, dir) {
      var ps = peers(el), i = ps.indexOf(el), j = i + dir;
      if (j < 0 || j >= ps.length) return false;
      if (dir < 0) ps[j].before(el); else ps[j].after(el);
      flash(el);
      save(el);
      return true;
    };

    box.addEventListener("keydown", function (e) {
      var h = e.target.closest("[data-sort-handle]");
      if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      var el = h.closest("[data-sort-id]");
      if (move(el, e.key === "ArrowUp" ? -1 : 1)) h.focus();
    });
    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-sort-handle]")) e.preventDefault();
    });

    var drag = null;
    box.addEventListener("pointerdown", function (e) {
      var h = e.target.closest("[data-sort-handle]");
      if (!h || e.button > 0) return;
      var el = h.closest("[data-sort-id]");
      drag = { el: el, h: h, startY: e.clientY, moved: false };
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    box.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientY - drag.startY) < 4) return;
      if (!drag.moved) { drag.moved = true; drag.el.classList.add("is-dragging"); box.classList.add("is-sorting"); }
      var ps = peers(drag.el), i = ps.indexOf(drag.el);
      var prev = ps[i - 1], next = ps[i + 1];
      if (prev && e.clientY < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) prev.before(drag.el);
      else if (next && e.clientY > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) next.after(drag.el);
      if (e.clientY < 80) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
    });
    var end = function () {
      if (!drag) return;
      drag.el.classList.remove("is-dragging");
      box.classList.remove("is-sorting");
      if (drag.moved) { flash(drag.el); save(drag.el); }
      drag.h.focus();
      drag = null;
    };
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
  });
})();

/* Länkkontroll: kontrollera alla länkar i omgångar (servern tar högst 15 åt gången) och uppdatera tabellen direkt. */
(function () {
  var form = document.querySelector("[data-link-check]");
  if (!form || !window.fetch) return;
  var BATCH = 15;
  var LABELS = { ok: "Fungerar", trasig: "Fungerar inte", osaker: "Kontrollera själv", ny: "Inte kontrollerad" };
  var rows = Array.prototype.slice.call(document.querySelectorAll("[data-link-row]"));
  var progress = document.querySelector("[data-link-progress]");
  var bar = progress && progress.querySelector("progress");
  var ptext = progress && progress.querySelector("[data-link-progress-text]");
  var last = document.querySelector("[data-link-last]");
  var button = form.querySelector("button");
  var busy = false;

  function recount() {
    ["ok", "trasig", "osaker"].forEach(function (v) {
      var el = document.querySelector('[data-count="' + v + '"]');
      if (el) el.textContent = String(document.querySelectorAll(".lc-row-" + v).length);
    });
  }
  function setRow(row, r) {
    var pill = row.querySelector(".lc-pill"), msg = row.querySelector(".lc-msg");
    row.className = "lc-row lc-row-" + r.verdict;
    pill.className = "pill lc-pill lc-" + r.verdict;
    pill.textContent = LABELS[r.verdict] || r.verdict;
    msg.textContent = r.verdict === "ok" ? "" : r.message;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !rows.length) return;
    busy = true;
    button.disabled = true;
    var done = 0, failed = false;
    if (progress) { progress.hidden = false; bar.max = rows.length; bar.value = 0; }
    rows.forEach(function (row) {
      var pill = row.querySelector(".lc-pill");
      pill.classList.add("is-checking");
      pill.textContent = "Väntar …";
    });
    var chunks = [];
    for (var i = 0; i < rows.length; i += BATCH) chunks.push(rows.slice(i, i + BATCH));
    var next = function (k) {
      if (k >= chunks.length) return finish();
      var chunk = chunks[k];
      chunk.forEach(function (row) { row.querySelector(".lc-pill").textContent = "Kontrollerar …"; });
      if (ptext) ptext.textContent = "Kontrollerar " + Math.min(done + chunk.length, rows.length) + " av " + rows.length + " …";
      var data = new FormData();
      data.append("_csrf", form.getAttribute("data-csrf"));
      data.append("urls", chunk.map(function (r) { return r.getAttribute("data-link-row"); }).join("\n"));
      if (k === chunks.length - 1) data.append("sista", "1");
      fetch("/admin/lankar/kontroll", { method: "POST", body: data, credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.error || "Fel"); return j; }); })
        .then(function (j) {
          chunk.forEach(function (row) {
            var r = j.results[row.getAttribute("data-link-row")];
            if (r) setRow(row, r);
          });
          done += chunk.length;
          if (bar) bar.value = done;
          recount();
          next(k + 1);
        })
        .catch(function (err) {
          failed = true;
          if (ptext) ptext.textContent = "Kontrollen avbröts: " + (err && err.message && err.message !== "Fel" ? err.message : "försök igen om en stund.");
          finish();
        });
    };
    var finish = function () {
      busy = false;
      button.disabled = false;
      rows.forEach(function (row) {
        var pill = row.querySelector(".lc-pill");
        if (pill.classList.contains("is-checking")) { pill.classList.remove("is-checking"); pill.className = "pill lc-pill lc-ny"; pill.textContent = LABELS.ny; }
      });
      if (!failed) {
        if (progress) progress.hidden = true;
        if (last) last.textContent = "Kontrollerad just nu – " + rows.length + " länkar.";
        // Visa trasiga länkar överst
        var tbody = rows[0] && rows[0].parentNode, order = { trasig: 0, osaker: 1, ny: 2, ok: 3 };
        if (tbody) rows.slice().sort(function (a, b) {
          var va = order[a.className.replace(/.*lc-row-/, "")], vb = order[b.className.replace(/.*lc-row-/, "")];
          return va - vb;
        }).forEach(function (r) { tbody.appendChild(r); });
      }
    };
    next(0);
  });
})();

/* Bildgalleriet: när en bild har dragits får albumet "Egen ordning" och knappen Återställ visas direkt. */
(function () {
  document.querySelectorAll("[data-gl-group]").forEach(function (group) {
    group.addEventListener("sortable:saved", function () {
      var pill = group.querySelector("[data-gl-mode]");
      if (pill) { pill.textContent = "Egen ordning"; pill.className = "pill pill-plan"; }
      var reset = group.querySelector("[data-gl-reset]");
      if (reset) reset.hidden = false;
      var fresh = group.querySelector(".gl-fresh");
      if (fresh) fresh.remove();
    });
  });
})();

/* Bildgalleriet: "Läs fotodatum ur bilderna" för äldre bilder. Början av varje originalbild hämtas (samma sajt),
   datumet läses med jfkTakenAt och skickas i omgångar om tio. Inget annat ändras. */
(function () {
  var box = document.querySelector("[data-exif-backfill]");
  if (!box || !window.fetch || !window.jfkParseTaken) return;
  var start = box.querySelector("[data-exif-start]");
  var status = box.querySelector("[data-exif-status]");
  var items = Array.prototype.slice.call(box.querySelectorAll("[data-exif-id]"));
  if (!start || !items.length) return;
  start.hidden = false;
  var LIMIT = 512 * 1024;

  // Läs högst LIMIT byte av bilden och avbryt sedan hämtningen (uppgifterna ligger i början av filen).
  function head(url) {
    var ctrl = window.AbortController ? new AbortController() : null;
    return fetch(url, { credentials: "same-origin", signal: ctrl ? ctrl.signal : undefined, headers: { Range: "bytes=0-" + (LIMIT - 1) } }).then(function (res) {
      if (!res.ok) throw new Error("http");
      if (!res.body || !res.body.getReader) return res.arrayBuffer();
      var reader = res.body.getReader(), parts = [], size = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.value) { parts.push(r.value); size += r.value.length; }
          if (r.done || size >= LIMIT) {
            if (!r.done) { try { reader.cancel(); } catch (e) {} if (ctrl) ctrl.abort(); }
            var out = new Uint8Array(size), o = 0;
            parts.forEach(function (p) { out.set(p, o); o += p.length; });
            return out.buffer;
          }
          return pump();
        });
      }
      return pump();
    });
  }

  function send(batch) {
    var body = new FormData();
    body.append("_csrf", box.getAttribute("data-csrf") || "");
    batch.forEach(function (b) { body.append("id", b.id); body.append("tagen", b.taken || ""); });
    return fetch("/admin/galleri/fotodatum", { method: "POST", body: body, credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("server");
      return res.json();
    });
  }

  start.addEventListener("click", async function () {
    start.disabled = true;
    var found = 0, failed = 0, batch = [];
    for (var i = 0; i < items.length; i++) {
      status.textContent = "Läser bild " + (i + 1) + " av " + items.length + " …";
      var id = items[i].getAttribute("data-exif-id"), src = items[i].getAttribute("data-exif-src");
      try {
        var taken = window.jfkParseTaken(await head(src));
        if (taken) found++;
        batch.push({ id: id, taken: taken });
      } catch (e) {
        failed++; // Bilden gick inte att hämta – den hoppas över och kan läsas nästa gång.
      }
      if (batch.length === 10 || (i === items.length - 1 && batch.length)) {
        try { await send(batch); } catch (e) {
          status.textContent = "Datumen kunde inte sparas. Ladda om sidan och försök igen.";
          status.classList.add("is-error");
          start.disabled = false;
          return;
        }
        batch = [];
      }
    }
    var checked = items.length - failed;
    status.textContent = (found
      ? "Klart! " + (found === 1 ? "1 bild" : found + " bilder") + " fick sitt fotodatum"
      : "Klart! Ingen av bilderna hade något fotodatum sparat") +
      (checked - found > 0 ? ", " + (checked - found) + " saknade datum och sorteras efter när de laddades upp" : "") +
      (failed ? ". " + failed + " gick inte att läsa" : "") + ". Sidan laddas om …";
    setTimeout(function () { location.reload(); }, 2200);
  });
})();

/* Bildgalleriet: Ändra flera. Räknar de markerade, "Markera alla" per album, och raden längst ned följer med
   när man skrollar så fort något är markerat. Utan JS fungerar formuläret som vanligt. */
(function () {
  var form = document.querySelector("[data-gl-bulk]");
  if (!form) return;
  var count = form.querySelector("[data-gl-count]");
  var picks = function () { return Array.prototype.slice.call(document.querySelectorAll('input.gl-pick[form="gl-bulk"]')); };
  document.querySelectorAll("[data-gl-all]").forEach(function (b) { b.hidden = false; });
  function update() {
    var n = picks().filter(function (b) { return b.checked; }).length;
    form.classList.toggle("is-active", n > 0);
    count.innerHTML = n ? "<strong>" + (n === 1 ? "1 bild markerad" : n + " bilder markerade") + "</strong> – välj vad som ska ändras." : "<strong>Ändra flera bilder:</strong> markera dem i listan.";
    form.querySelectorAll('button[name="atgard"]').forEach(function (btn) { btn.disabled = n === 0; });
    document.querySelectorAll("[data-gl-all]").forEach(function (all) {
      var boxes = all.closest("table").querySelectorAll("input.gl-pick"), on = 0;
      boxes.forEach(function (b) { if (b.checked) on++; });
      all.checked = on > 0 && on === boxes.length;
      all.indeterminate = on > 0 && on < boxes.length;
    });
    document.querySelectorAll("input.gl-pick").forEach(function (b) { b.closest("tr").classList.toggle("is-picked", b.checked); });
  }
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-gl-all]")) {
      e.target.closest("table").querySelectorAll("input.gl-pick").forEach(function (b) { b.checked = e.target.checked; });
    }
    if (e.target.matches("[data-gl-all], input.gl-pick")) update();
  });
  update();
})();

/* Bildgalleriet: "Ladda ned (zip)". Listan med bilder hämtas från /admin/galleri/zip, varje originalbild hämtas och
   packas här i webbläsaren (zip utan komprimering – JPG går ändå inte att packa mindre), sedan laddas filen ned.
   Inget skickas någon annanstans. */
(function () {
  var buttons = document.querySelectorAll("[data-gl-zip]");
  if (!buttons.length || !window.fetch || !window.Blob || !window.TextEncoder) return;
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosTime(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  function zip(entries) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, t = dosTime(new Date());
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, t.time, true); h.setUint16(12, t.date, true); h.setUint32(14, crc, true);
      h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, e.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, t.time, true); c.setUint16(14, t.date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + size;
    });
    var csize = central.reduce(function (s, p) { return s + p.byteLength; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: "application/zip" });
  }
  buttons.forEach(function (btn) {
    btn.hidden = false;
    var label = btn.innerHTML;
    btn.addEventListener("click", async function () {
      if (btn.disabled) return;
      btn.disabled = true;
      var say = function (text) { btn.textContent = text; };
      try {
        say("Förbereder …");
        var res = await fetch(btn.getAttribute("data-gl-zip"), { credentials: "same-origin" });
        if (!res.ok) throw new Error("lista");
        var files = (await res.json()).files || [], entries = [];
        for (var i = 0; i < files.length; i++) {
          say("Hämtar " + (i + 1) + " av " + files.length + " …");
          var r = await fetch(files[i].src, { credentials: "same-origin" });
          if (!r.ok) continue; // en bild som inte går att hämta hoppas över
          entries.push({ name: files[i].name, data: new Uint8Array(await r.arrayBuffer()) });
        }
        if (!entries.length) throw new Error("tom");
        say("Packar …");
        var url = URL.createObjectURL(zip(entries));
        var a = document.createElement("a");
        a.href = url; a.download = btn.getAttribute("data-zip-name") || "bilder.zip";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        say(entries.length < files.length ? "Klar – " + (files.length - entries.length) + " bilder saknades" : "Klar!");
        setTimeout(function () { btn.innerHTML = label; btn.disabled = false; }, 4000);
      } catch (e) {
        say("Gick inte – försök igen");
        setTimeout(function () { btn.innerHTML = label; btn.disabled = false; }, 4000);
      }
    });
  });
})();

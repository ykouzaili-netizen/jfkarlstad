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

  /* Förhandsvisning av vald bild */
  document.querySelectorAll("[data-upload]").forEach(function (input) {
    input.addEventListener("change", function () {
      var name = input.getAttribute("data-upload");
      var img = document.querySelector('[data-preview="' + name + '"]');
      var file = input.files && input.files[0];
      if (img && file && /^image\//.test(file.type) && file.type !== "image/svg+xml") {
        img.src = URL.createObjectURL(file);
        img.hidden = false;
        img.alt = "Vald bild";
      }
      if (file && file.size > 20 * 1024 * 1024) {
        window.alert("Filen är större än 20 MB och kommer inte att kunna laddas upp.");
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

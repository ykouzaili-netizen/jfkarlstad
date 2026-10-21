/*
 * JFK Butik – varukorgen i webbläsaren (laddas bara på /butik, se src/pages/shop.ts).
 * Korgen sparas i localStorage ("jfk-butik-korg"). Den är bara en hjälp tills kassan är kopplad: priserna och
 * produkterna kontrolleras mot sidans egen lista (#shop-data) när varukorgen visas.
 * Varje del ligger i en egen IIFE, som i site.js.
 */

(function () {
  "use strict";
  var KEY = "jfk-butik-korg";

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter(function (i) { return i && typeof i.id === "number"; }) : [];
    } catch (e) {
      return [];
    }
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 50))); } catch (e) { /* privat läge – korgen sparas inte */ }
    updateCount(items);
  }
  function count(items) {
    return items.reduce(function (n, i) { return n + (i.qty || 0); }, 0);
  }
  function updateCount(items) {
    var n = count(items || read());
    document.querySelectorAll("[data-shop-count]").forEach(function (el) {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  }
  function kr(n) {
    return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " kr";
  }

  window.jfkShop = { read: read, write: write, kr: kr, updateCount: updateCount };
  updateCount();
})();

/* Färg, storlek och "Lägg i korgen" vid varje produkt. */
(function () {
  "use strict";
  var shop = window.jfkShop;
  if (!shop) return;
  var toast = document.querySelector("[data-shop-toast]");
  var toastItem = document.querySelector("[data-shop-toast-item]");
  var timer = 0;

  function showToast(text) {
    if (!toast) return;
    if (toastItem) toastItem.textContent = text;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 6000);
  }

  document.querySelectorAll("form[data-shop-buy]").forEach(function (form) {
    var button = form.querySelector(".shop-add");
    var needsSize = form.getAttribute("data-needs-size") === "1";
    var chosen = form.querySelector("[data-shop-chosen]");

    function selected(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked') || form.querySelector('input[type="hidden"][name="' + name + '"]');
      return el ? el.value : "";
    }
    function luminance(hex) {
      var n = parseInt(hex.slice(1), 16);
      var ch = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    }
    /* Teckningen byter färg med färgvalet (bara när det inte finns något foto). */
    function recolor() {
      var input = form.querySelector('input[name="farg"]:checked');
      var hex = input && input.getAttribute("data-hex");
      if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
      document.querySelectorAll('[data-shop-drawing="' + form.getAttribute("data-id") + '"]').forEach(function (d) {
        d.style.setProperty("--g", hex);
        var dark = luminance(hex) < 0.35;
        d.classList.toggle("is-dark", dark);
        var logo = d.querySelector("img[data-logo-dark]");
        if (logo) logo.src = logo.getAttribute(dark ? "data-logo-light" : "data-logo-dark");
      });
    }
    function refresh() {
      if (chosen) chosen.textContent = selected("farg");
      recolor();
      if (!button) return;
      var ready = !needsSize || selected("storlek");
      button.disabled = !ready;
      button.textContent = ready ? button.getAttribute("data-label") : button.getAttribute("data-choose");
    }
    form.addEventListener("change", refresh);
    refresh();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var size = selected("storlek");
      if (needsSize && !size) return;
      var color = selected("farg");
      var id = Number(form.getAttribute("data-id"));
      var items = shop.read();
      var same = items.find(function (i) { return i.id === id && i.size === size && i.color === color; });
      if (same) same.qty = Math.min(20, (same.qty || 1) + 1);
      else items.push({ id: id, size: size, color: color, qty: 1 });
      shop.write(items);
      var name = form.getAttribute("data-name") || "";
      showToast([name, color, size].filter(Boolean).join(", "));
    });
  });
})();

/* Varukorgen (/butik/varukorg). */
(function () {
  "use strict";
  var shop = window.jfkShop;
  var root = document.querySelector("[data-shop-cart]");
  var dataEl = document.getElementById("shop-data");
  if (!shop || !root || !dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent || "{}"); } catch (e) { return; }
  var catalog = new Map((data.catalog || []).map(function (p) { return [p.id, p]; }));
  var t = data.texts || {};
  var empty = root.querySelector("[data-shop-cart-empty]");
  var sum = document.querySelector("[data-shop-cart-sum]");
  var totalEl = document.querySelector("[data-shop-cart-total]");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render() {
    // Produkter som inte längre går att beställa (t.ex. ett släpp som har stängt) tas bort ur korgen.
    var items = shop.read().filter(function (i) { return catalog.has(i.id); });
    shop.write(items);
    root.querySelectorAll(".shop-cart-group").forEach(function (g) { g.remove(); });
    if (empty) empty.hidden = items.length > 0;
    if (sum) sum.hidden = items.length === 0;

    var groups = new Map();
    items.forEach(function (item, index) {
      var p = catalog.get(item.id);
      if (!groups.has(p.group)) groups.set(p.group, { label: p.groupLabel, rows: [] });
      groups.get(p.group).rows.push({ item: item, p: p, index: index });
    });

    var total = 0;
    // Släppen först, sortimentet sist.
    Array.from(groups.keys()).sort(function (a, b) { return (a === "alltid") - (b === "alltid"); }).forEach(function (key) {
      var g = groups.get(key);
      var box = el("section", "shop-cart-group" + (key === "alltid" ? " is-always" : ""));
      box.appendChild(el("h2", null, key === "alltid" ? t.groupAlways : String(t.groupDrop || "").replace("{slapp}", g.label)));
      var list = el("ul");
      g.rows.forEach(function (row) {
        var li = el("li", "shop-cart-item");
        var name = el("span", "shop-cart-item-name");
        var link = el("a", null, row.p.name);
        link.href = "/butik/" + row.p.slug;
        name.appendChild(link);
        var details = [row.item.color, row.item.size].filter(Boolean).join(" · ");
        if (details) name.appendChild(el("span", null, details));
        li.appendChild(name);

        var qty = el("span", "shop-qty");
        var minus = el("button", null, "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "Minska antal: " + row.p.name);
        var out = el("output", null, String(row.item.qty));
        out.setAttribute("aria-label", "Antal");
        var plus = el("button", null, "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "Öka antal: " + row.p.name);
        minus.addEventListener("click", function () { change(row.index, -1); });
        plus.addEventListener("click", function () { change(row.index, 1); });
        qty.append(minus, out, plus);
        li.appendChild(qty);

        var line = row.p.price * row.item.qty;
        total += line;
        li.appendChild(el("span", "shop-cart-price", shop.kr(line)));
        var remove = el("button", "shop-cart-remove", t.remove);
        remove.type = "button";
        remove.setAttribute("aria-label", t.remove + ": " + row.p.name);
        remove.addEventListener("click", function () { change(row.index, -999); });
        li.appendChild(remove);
        list.appendChild(li);
      });
      box.appendChild(list);
      root.appendChild(box);
    });
    if (totalEl) totalEl.textContent = shop.kr(total);
  }

  function change(index, delta) {
    var items = shop.read().filter(function (i) { return catalog.has(i.id); });
    var item = items[index];
    if (!item) return;
    item.qty = Math.min(20, (item.qty || 1) + delta);
    if (item.qty <= 0) items.splice(index, 1);
    shop.write(items);
    render();
  }

  render();
})();

/* Produktens bilder i helbild (/butik/:produkt). Samma bildruta som i bildgalleriet (gal-lb i site.css): pilar,
   piltangenter och svep byter bild, Esc/krysset/klick bredvid bilden stänger, och Helskärm finns där webbläsaren
   kan det. Utan JS (eller med Ctrl/Cmd-klick) öppnas bilden som en vanlig länk. */
(function () {
  "use strict";
  var dlg = document.querySelector("[data-shop-lb]");
  if (!dlg || typeof dlg.showModal !== "function") return;
  var items = Array.prototype.slice.call(document.querySelectorAll("a[data-shop-lb-item]"));
  if (!items.length) return;
  var img = dlg.querySelector("[data-shop-lb-img]"), cap = dlg.querySelector("[data-shop-lb-caption]");
  var count = dlg.querySelector("[data-shop-lb-count]");
  var prev = dlg.querySelector('[data-shop-lb-step="-1"]'), next = dlg.querySelector('[data-shop-lb-step="1"]');
  var root = dlg.querySelector("[data-shop-lb-inner]");
  var fsBtn = dlg.querySelector("[data-shop-lb-fs]"), fsLabel = dlg.querySelector("[data-shop-lb-fs-label]");
  var template = dlg.getAttribute("data-count") || "{nr} / {antal}";
  var index = 0, opener = null, savedY = 0;

  function show(i) {
    index = (i + items.length) % items.length;
    var a = items[index], thumb = a.querySelector("img");
    img.removeAttribute("srcset");
    img.src = thumb ? thumb.currentSrc || thumb.src : a.href; // det som redan är laddat visas direkt …
    if (thumb && thumb.getAttribute("srcset")) {
      img.sizes = "(min-width: 1400px) 1400px, 100vw"; // … och den skarpa versionen tar över
      img.srcset = thumb.getAttribute("srcset");
    }
    img.alt = thumb ? thumb.alt : "";
    var text = a.getAttribute("data-caption") || "";
    cap.textContent = text;
    cap.hidden = !text;
    var label = template.replace("{nr}", String(index + 1)).replace("{antal}", String(items.length));
    count.textContent = items.length > 1 ? label : "";
    dlg.setAttribute("aria-label", label);
    prev.hidden = next.hidden = items.length < 2;
    var nextThumb = items.length > 1 && items[(index + 1) % items.length].querySelector("img");
    if (nextThumb && nextThumb.getAttribute("srcset")) { var pre = new Image(); pre.sizes = img.sizes; pre.srcset = nextThumb.getAttribute("srcset"); }
  }

  // Helskärm: bildrutans innehåll går i helskärm (en dialogruta får inte göra det själv). Inte på iPhone.
  var canFs = !!(document.fullscreenEnabled && root && root.requestFullscreen);
  fsBtn.hidden = !canFs;
  function syncFs() {
    var on = document.fullscreenElement === root;
    dlg.classList.toggle("is-fullscreen", on);
    fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    var text = fsBtn.getAttribute(on ? "data-exit" : "data-enter");
    fsLabel.textContent = text;
    fsBtn.title = text;
  }
  if (canFs) {
    fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else root.requestFullscreen().catch(function () {});
    });
    document.addEventListener("fullscreenchange", syncFs);
  }

  function restoreScroll() {
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
  }
  items.forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      opener = a;
      savedY = window.scrollY;
      document.documentElement.classList.add("gal-lb-open");
      dlg.showModal();
      show(items.indexOf(a));
    });
  });
  dlg.addEventListener("close", function () {
    if (document.fullscreenElement === root) document.exitFullscreen().catch(function () {});
    document.documentElement.classList.remove("gal-lb-open");
    img.removeAttribute("srcset");
    img.removeAttribute("src");
    if (opener) opener.focus({ preventScroll: true });
    restoreScroll();
    requestAnimationFrame(function () { restoreScroll(); setTimeout(restoreScroll, 60); });
  });
  dlg.addEventListener("click", function (e) {
    var step = e.target.closest("[data-shop-lb-step]");
    if (step) { show(index + Number(step.getAttribute("data-shop-lb-step"))); return; }
    if (e.target.closest("[data-shop-lb-close]")) { dlg.close(); return; }
    if (!e.target.closest("img, button, figcaption")) dlg.close(); // klick bredvid bilden
  });
  dlg.addEventListener("keydown", function (e) {
    if ((e.key === "f" || e.key === "F") && canFs && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); fsBtn.click(); return; }
    if (items.length < 2) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
  });
  var x0 = null;
  dlg.addEventListener("touchstart", function (e) { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    if (x0 === null || items.length < 2) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
})();

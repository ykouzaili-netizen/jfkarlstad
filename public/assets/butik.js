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

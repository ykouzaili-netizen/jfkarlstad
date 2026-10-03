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

  function setMenu(open) {
    root.classList.toggle("menu-open", open);
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Stäng" : "Meny";
    toggle.setAttribute("aria-label", open ? "Stäng menyn" : "Öppna menyn");
  }

  if (toggle && nav) {
    // Utan JS är knappen en länk till sidkartan i sidfoten. Med JS blir den en riktig menyknapp.
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Öppna menyn");
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
    var filterDocs = function () {
      var q = (qInput.value || "").trim().toLowerCase();
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
      if (counter) counter.textContent = shown + " dokument" + (q || cat ? " matchar" : "");
    };
    qInput.addEventListener("input", filterDocs);
    catSelect.addEventListener("change", filterDocs);
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

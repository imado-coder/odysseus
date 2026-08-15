/* ==========================================================================
   theme.js — the only script the storefront loads.
   No framework, no dependencies, no polyfills. Every controller is opt-in via
   a data attribute, so a section that does not use one costs nothing.
   ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
     Disclosure: categories mega menu.
     Wired by markup contract — the trigger carries aria-controls pointing at
     the panel. Escape closes and returns focus, outside click closes, and
     tabbing past the panel closes it.
     ---------------------------------------------------------------------- */
  function initDisclosure(trigger) {
    var panel = document.getElementById(trigger.getAttribute("aria-controls"));
    if (!panel) return;

    function setOpen(open) {
      trigger.setAttribute("aria-expanded", String(open));
      panel.dataset.open = String(open);
      if (open) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    }

    function close(returnFocus) {
      if (trigger.getAttribute("aria-expanded") !== "true") return;
      setOpen(false);
      if (returnFocus) trigger.focus();
    }

    setOpen(trigger.getAttribute("aria-expanded") === "true");

    trigger.addEventListener("click", function () {
      setOpen(trigger.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close(true);
    });

    document.addEventListener("focusin", function (e) {
      if (!panel.contains(e.target) && e.target !== trigger) close(false);
    });

    document.addEventListener("pointerdown", function (e) {
      if (!panel.contains(e.target) && !trigger.contains(e.target)) close(false);
    });
  }

  /* ----------------------------------------------------------------------
     Horizontal scroller: next/previous controls.
     Scrolls by one viewport of the track, and hides the control once the
     track has no more room to travel.
     ---------------------------------------------------------------------- */
  function initScroller(root) {
    var track = root.querySelector("[data-scroller-track]");
    var next = root.querySelector("[data-scroller-next]");
    if (!track || !next) return;

    function sync() {
      var atEnd =
        Math.abs(track.scrollLeft) + track.clientWidth >= track.scrollWidth - 2;
      next.hidden = atEnd;
    }

    next.addEventListener("click", function () {
      // Direction-aware: scrollLeft runs negative in RTL.
      var dir = getComputedStyle(track).direction === "rtl" ? -1 : 1;
      track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
    });

    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    sync();
  }

  /* ----------------------------------------------------------------------
     Load more: flips the button into a busy state while the next page is
     fetched. The fetch itself is owned by the section that uses it; this
     only guarantees the button reports its state to assistive tech.
     ---------------------------------------------------------------------- */
  function initLoadMore(btn) {
    var busyLabel = btn.dataset.busyLabel || "";
    var idleLabel = btn.querySelector("[data-loadmore-label]");

    btn.addEventListener("click", function () {
      if (btn.getAttribute("aria-busy") === "true") return;
      btn.setAttribute("aria-busy", "true");
      if (idleLabel && busyLabel) idleLabel.textContent = busyLabel;
      btn.dispatchEvent(
        new CustomEvent("loadmore:request", { bubbles: true })
      );
    });

    btn.addEventListener("loadmore:done", function () {
      btn.removeAttribute("aria-busy");
      if (idleLabel && btn.dataset.idleLabel) {
        idleLabel.textContent = btn.dataset.idleLabel;
      }
    });
  }

  /* ----------------------------------------------------------------------
     Sticky column that is taller than the viewport.
     Pins the bottom edge instead of the top so nothing is unreachable.
     ---------------------------------------------------------------------- */
  function initStickyFit(el) {
    var gap = parseInt(el.dataset.stickyGap || "16", 10);

    function measure() {
      // Clear first so the measurement is not skewed by the current offset.
      el.style.removeProperty("--sticky-top");
      var overflow = el.offsetHeight - window.innerHeight;
      el.style.setProperty(
        "--sticky-top",
        (overflow > -gap ? -(overflow + gap) : gap) + "px"
      );
    }

    measure();
    window.addEventListener("resize", measure, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(el);
  }


  /* ----------------------------------------------------------------------
     Cash-on-delivery lead form.

     Wilaya drives commune; both drive the shipping line; shipping and
     quantity drive the total. Tariffs come from the form's data-tariffs
     attribute (JSON keyed by wilaya code, `[home, desk]` in centimes-free
     dinars) so the merchant — later the app — owns the pricing, not this file.
     ---------------------------------------------------------------------- */
  function initCodForm(form) {
    var wilaya = form.querySelector("[data-cod-wilaya]");
    var commune = form.querySelector("[data-cod-commune]");
    var qty = form.querySelector("[data-cod-qty]");
    var status = form.querySelector("[data-cod-status]");
    var submit = form.querySelector("[data-cod-submit]");
    var out = {
      ship: form.querySelector("[data-cod-out-ship]"),
      sub: form.querySelector("[data-cod-out-sub]"),
      total: form.querySelector("[data-cod-out-total]"),
    };
    var opts = [].slice.call(form.querySelectorAll("[data-cod-delivery]"));
    var unit = parseInt(form.dataset.unitPrice || "0", 10);
    var tariffs = {};
    try {
      tariffs = JSON.parse(form.dataset.tariffs || "{}");
    } catch (e) {
      tariffs = {};
    }
    var fallback = JSON.parse(form.dataset.tariffFallback || "[600,350]");
    var locations = window.DZ_LOCATIONS || [];
    var lang = document.documentElement.lang === "ar" ? "ar" : "fr";

    function money(n) {
      return new Intl.NumberFormat("fr-DZ").format(n) + " DA";
    }

    function label(entry) {
      return lang === "ar" ? entry.ar || entry[0] : entry.fr || entry[1];
    }

    /* Populate wilayas once, from the shared dataset. */
    if (wilaya && !wilaya.dataset.filled) {
      locations.forEach(function (w) {
        var o = document.createElement("option");
        o.value = w.c;
        o.textContent = w.c + " — " + label(w);
        wilaya.appendChild(o);
      });
      wilaya.dataset.filled = "1";
    }

    function fillCommunes() {
      if (!commune) return;
      var w = locations.filter(function (x) {
        return x.c === wilaya.value;
      })[0];
      commune.innerHTML = "";
      var first = document.createElement("option");
      first.value = "";
      first.textContent = w
        ? commune.dataset.placeholder || "Choisir…"
        : commune.dataset.placeholderEmpty || "Choisissez d'abord la wilaya";
      commune.appendChild(first);
      if (w) {
        w.m.forEach(function (m) {
          var o = document.createElement("option");
          o.value = m[1];
          o.textContent = lang === "ar" ? m[0] : m[1];
          commune.appendChild(o);
        });
      }
      commune.disabled = !w;
    }

    function shippingFor() {
      var t = tariffs[wilaya && wilaya.value] || fallback;
      var deskChosen = opts.some(function (o) {
        return o.checked && o.value === "desk";
      });
      return deskChosen ? t[1] : t[0];
    }

    function recalc() {
      var n = Math.max(1, parseInt((qty && qty.value) || "1", 10));
      var sub = unit * n;
      var chosen = wilaya && wilaya.value;
      var ship = chosen ? shippingFor() : null;

      /* Reflect the per-wilaya price on the two delivery cards too. */
      var t = tariffs[chosen] || fallback;
      opts.forEach(function (o) {
        var priceEl = o.parentNode.querySelector("[data-cod-opt-price]");
        if (!priceEl) return;
        priceEl.textContent = chosen
          ? money(o.value === "desk" ? t[1] : t[0])
          : priceEl.dataset.idle || "—";
      });

      if (out.sub) out.sub.textContent = money(sub);
      if (out.ship) {
        out.ship.textContent = chosen ? money(ship) : "—";
        out.ship.classList.toggle("cod__muted", !chosen);
      }
      if (out.total) out.total.textContent = money(sub + (ship || 0));
    }

    function fieldOf(el) {
      return el.closest(".field") || el.closest(".cod__fieldset");
    }

    function setInvalid(el, on) {
      var f = fieldOf(el);
      if (!f) return;
      if (on) f.setAttribute("data-invalid", "");
      else f.removeAttribute("data-invalid");
      el.setAttribute("aria-invalid", on ? "true" : "false");
    }

    function validate() {
      var bad = [];
      form.querySelectorAll("[data-cod-required]").forEach(function (el) {
        var v = (el.value || "").trim();
        var ok = !!v;
        if (ok && el.dataset.codPattern) {
          ok = new RegExp(el.dataset.codPattern).test(v.replace(/[\s.-]/g, ""));
        }
        setInvalid(el, !ok);
        if (!ok) bad.push(el);
      });
      return bad;
    }

    if (wilaya) {
      wilaya.addEventListener("change", function () {
        fillCommunes();
        recalc();
        setInvalid(wilaya, false);
      });
    }
    if (qty) qty.addEventListener("change", recalc);
    opts.forEach(function (o) {
      o.addEventListener("change", recalc);
    });

    form.querySelectorAll("[data-cod-required]").forEach(function (el) {
      el.addEventListener("input", function () {
        if (fieldOf(el) && fieldOf(el).hasAttribute("data-invalid")) validate();
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bad = validate();
      if (bad.length) {
        status.dataset.state = "error";
        status.textContent =
          form.dataset.msgInvalid || "Merci de corriger les champs en rouge.";
        bad[0].focus();
        bad[0].scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      status.removeAttribute("data-state");
      submit.setAttribute("aria-busy", "true");

      var payload = Object.fromEntries(new FormData(form).entries());
      var endpoint = form.dataset.endpoint;

      /* Without an endpoint the theme has nowhere to send the lead yet; the
         app supplies it later. Emit the event either way so anything else on
         the page (pixels, analytics) can observe the submission. */
      form.dispatchEvent(
        new CustomEvent("cod:submit", { bubbles: true, detail: payload })
      );

      if (!endpoint) {
        submit.removeAttribute("aria-busy");
        status.dataset.state = "success";
        status.textContent =
          form.dataset.msgPending ||
          "Formulaire valide. En attente de la connexion à l'application COD.";
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          status.dataset.state = "success";
          status.textContent =
            form.dataset.msgSuccess || "Commande enregistrée. Nous vous appelons bientôt.";
          form.reset();
          fillCommunes();
          recalc();
        })
        .catch(function () {
          status.dataset.state = "error";
          status.textContent =
            form.dataset.msgFail || "Envoi impossible. Réessayez ou appelez-nous.";
        })
        .then(function () {
          submit.removeAttribute("aria-busy");
        });
    });

    fillCommunes();
    recalc();
  }

  /* ----------------------------------------------------------------------
     Bottom sheet, used by the mobile COD entry point.
     ---------------------------------------------------------------------- */
  function initSheet(trigger) {
    var sheet = document.getElementById(trigger.getAttribute("aria-controls"));
    if (!sheet) return;
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      sheet.dataset.open = "true";
      document.body.style.overflow = "hidden";
      var first = sheet.querySelector("input, select, textarea, button");
      if (first) first.focus();
    }

    function close() {
      if (sheet.dataset.open !== "true") return;
      sheet.dataset.open = "false";
      document.body.style.removeProperty("overflow");
      if (lastFocus) lastFocus.focus();
    }

    trigger.addEventListener("click", open);
    sheet.querySelectorAll("[data-sheet-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }


  /* ----------------------------------------------------------------------
     COD form reveal.
     The merchant chooses whether the form is on the page from the start or
     sits behind an order button. Either way the mobile bar can open it.
     ---------------------------------------------------------------------- */
  function initCodReveal(wrap) {
    var btn = wrap.querySelector("[data-cod-reveal]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      openCod(wrap);
    });
  }

  function openCod(wrap) {
    wrap.dataset.open = "true";
    var first = wrap.querySelector("input, select, textarea");
    if (first) {
      first.scrollIntoView({ block: "center", behavior: "smooth" });
      // Focusing immediately fights the smooth scroll on iOS.
      setTimeout(function () {
        first.focus({ preventScroll: true });
      }, 380);
    }
  }

  /* ----------------------------------------------------------------------
     Mobile order bar.
     Follows the customer down the page, jumps them to the form, and gets out
     of the way once the form is actually on screen.
     ---------------------------------------------------------------------- */
  function initOrderBar(bar) {
    var wrap = document.querySelector("[data-cod-wrap]");
    var btn = bar.querySelector("[data-order-jump]");

    if (btn && wrap) {
      btn.addEventListener("click", function () {
        openCod(wrap);
      });
    }

    if (!wrap || !("IntersectionObserver" in window)) return;

    /* Only step aside once the form is actually open and on screen. While it
       is still collapsed behind the order button, the bar is the only way in
       and must stay put. */
    var io = new IntersectionObserver(
      function (entries) {
        var formOpen = wrap.dataset.mode !== "button" || wrap.dataset.open === "true";
        bar.dataset.hidden = String(entries[0].isIntersecting && formOpen);
      },
      { rootMargin: "-30% 0px -15% 0px" }
    );
    io.observe(wrap);
  }


  /* ----------------------------------------------------------------------
     Gallery slider counter. Scrolling and snapping are the browser's job;
     this only reports which image is showing.
     ---------------------------------------------------------------------- */
  function initGallery(root) {
    var slider = root.querySelector("[data-gallery-slider]");
    var out = root.querySelector("[data-gallery-index]");
    var dots = [].slice.call(root.querySelectorAll("[data-gallery-dot]"));
    if (!slider) return;

    function sync() {
      var i = Math.round(Math.abs(slider.scrollLeft) / slider.clientWidth);
      if (out) out.textContent = i + 1;
      dots.forEach(function (d, n) {
        if (n === i) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
    }

    slider.addEventListener("scroll", function () {
      clearTimeout(slider._t);
      slider._t = setTimeout(sync, 60);
    }, { passive: true });

    dots.forEach(function (d, n) {
      d.addEventListener("click", function () {
        slider.scrollTo({ left: n * slider.clientWidth, behavior: "smooth" });
      });
    });

    sync();
  }

  function boot() {
    document.querySelectorAll("[data-sticky-fit]").forEach(initStickyFit);
    document.querySelectorAll("[data-disclosure]").forEach(initDisclosure);
    document.querySelectorAll("[data-scroller]").forEach(initScroller);
    document.querySelectorAll("[data-loadmore]").forEach(initLoadMore);
    document.querySelectorAll("[data-cod-form]").forEach(initCodForm);
    document.querySelectorAll("[data-sheet-open]").forEach(initSheet);
    document.querySelectorAll("[data-cod-wrap]").forEach(initCodReveal);
    document.querySelectorAll("[data-order-bar]").forEach(initOrderBar);
    document.querySelectorAll("[data-gallery]").forEach(initGallery);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

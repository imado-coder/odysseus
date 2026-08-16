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


  /* ----------------------------------------------------------------------
     Scroll reveal. Adds .js to the root so the CSS only hides things when
     script is actually running — no script, no invisible page.
     ---------------------------------------------------------------------- */
  function initReveal() {
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js");

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    document
      .querySelectorAll("[data-reveal], [data-reveal-stagger]")
      .forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------------------------
     Cart.
     Held in localStorage so the basket survives a reload, which matters when
     a customer is comparing products before ordering. In the theme the same
     shape is fed by Shopify's /cart.js; the contract below is what the
     drawer renders either way.
     ---------------------------------------------------------------------- */
  var KEY = "souq:cart";

  function readCart() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }

  function writeCart(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("cart:change", { detail: items }));
  }

  function cartCount(items) {
    return items.reduce(function (n, i) { return n + i.qty; }, 0);
  }

  function cartTotal(items) {
    return items.reduce(function (n, i) { return n + i.price * i.qty; }, 0);
  }

  function money(n) {
    return new Intl.NumberFormat("fr-DZ").format(n) + " DA";
  }

  /* The ghost image that arcs to the cart. Purely decorative — if anything
     here is unavailable the item is still added. */
  function flyToCart(fromEl) {
    var target = document.querySelector("[data-cart-open]");
    var img = fromEl && fromEl.closest(".pgc, .pdp__gallery, .citem");
    img = img && img.querySelector("img");
    if (!target || !img || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var a = img.getBoundingClientRect();
    var b = target.getBoundingClientRect();
    var ghost = img.cloneNode();
    ghost.className = "fly";
    ghost.style.insetInlineStart = a.left + "px";
    ghost.style.insetBlockStart = a.top + "px";
    ghost.style.setProperty("--fly-x", b.left - a.left + b.width / 2 - 37 + "px");
    ghost.style.setProperty("--fly-y", b.top - a.top + b.height / 2 - 37 + "px");
    document.body.appendChild(ghost);

    requestAnimationFrame(function () { ghost.classList.add("fly--go"); });
    setTimeout(function () {
      ghost.remove();
      target.classList.add("cart-hit");
      setTimeout(function () { target.classList.remove("cart-hit"); }, 440);
    }, 600);
  }

  function toast(message) {
    var el = document.querySelector("[data-toast]");
    if (!el) return;
    el.querySelector("[data-toast-text]").textContent = message;
    el.dataset.open = "true";
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.dataset.open = "false"; }, 2600);
  }

  function initAddToCart() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-add-to-cart]");
      if (!btn) return;
      e.preventDefault();

      var items = readCart();
      var id = btn.dataset.addToCart;
      var found = items.filter(function (i) { return i.id === id; })[0];

      if (found) {
        found.qty += 1;
      } else {
        items.push({
          id: id,
          title: btn.dataset.title || "",
          price: parseInt(btn.dataset.price || "0", 10),
          image: btn.dataset.image || "",
          option: btn.dataset.option || "",
          qty: 1,
        });
      }

      writeCart(items);
      flyToCart(btn);
      btn.dataset.added = "true";
      setTimeout(function () { delete btn.dataset.added; }, 400);
      toast(btn.dataset.toast || "Ajouté au panier");
    });
  }

  /* ----------------------------------------------------------------------
     Cart drawer. Two steps: the basket, then the order form.
     ---------------------------------------------------------------------- */
  function initCartDrawer(drawer) {
    var body = drawer.querySelector("[data-cart-items]");
    var foot = drawer.querySelector("[data-cart-foot]");
    var threshold = parseInt(drawer.dataset.freeShipping || "8000", 10);
    var lastFocus = null;

    function render() {
      var items = readCart();
      var total = cartTotal(items);

      document.querySelectorAll("[data-cart-count]").forEach(function (el) {
        var n = cartCount(items);
        el.textContent = n;
        el.hidden = n === 0;
      });

      var countEl = drawer.querySelector("[data-drawer-count]");
      if (countEl) countEl.textContent = cartCount(items) + " article(s)";

      if (!items.length) {
        body.innerHTML =
          '<div class="drawer__empty">' +
          '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 3h2.2l2.2 10.4a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.55L20 7H6.2"/><circle cx="9.5" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>' +
          '<p class="drawer__empty-title">Votre panier est vide</p>' +
          "<p>Ajoutez des articles pour passer commande.</p></div>";
        foot.hidden = true;
        return;
      }

      foot.hidden = false;

      var remaining = Math.max(0, threshold - total);
      var pct = Math.min(100, (total / threshold) * 100);
      var ship =
        '<div class="freeship' + (remaining ? "" : " freeship--done") + '">' +
        (remaining
          ? "Plus que <b>" + money(remaining) + "</b> pour la livraison gratuite"
          : "Livraison gratuite débloquée") +
        '<span class="freeship__bar"><span class="freeship__fill" style="inline-size:' + pct + '%"></span></span></div>';

      body.innerHTML =
        ship +
        items
          .map(function (i) {
            return (
              '<div class="citem" data-line="' + i.id + '">' +
              '<span class="citem__media">' +
              (i.image ? '<img src="' + i.image + '" alt="" width="72" height="72">' : "") +
              "</span><div><p class=\"citem__title\">" + i.title + "</p>" +
              (i.option ? '<p class="citem__opt">' + i.option + "</p>" : "") +
              '<div class="citem__row">' +
              '<span class="qty__control"><button class="qty__btn" type="button" data-line-minus="' + i.id + '" aria-label="Retirer un">&minus;</button>' +
              '<input class="qty__input" type="number" value="' + i.qty + '" min="1" data-line-qty="' + i.id + '" aria-label="Quantité">' +
              '<button class="qty__btn" type="button" data-line-plus="' + i.id + '" aria-label="Ajouter un">+</button></span>' +
              '<span class="citem__price">' + money(i.price * i.qty) + "</span>" +
              '<button class="citem__remove" type="button" data-line-remove="' + i.id + '" aria-label="Supprimer">' +
              '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>' +
              "</button></div></div></div>"
            );
          })
          .join("");

      var subEl = drawer.querySelector("[data-cart-sub]");
      var totEl = drawer.querySelector("[data-cart-total]");
      if (subEl) subEl.textContent = money(total);
      if (totEl) totEl.textContent = money(total);

      var form = drawer.querySelector("[data-cod-form]");
      if (form) form.dataset.unitPrice = String(total);

      var recap = drawer.querySelector("[data-cod-recap]");
      if (recap) {
        recap.innerHTML =
          '<span class="cod-recap__thumbs">' +
          items.slice(0, 3).map(function (i) {
            return i.image ? '<img src="' + i.image + '" alt="" width="34" height="34">' : "";
          }).join("") +
          "</span><span>" + cartCount(items) + " article(s)</span>" +
          '<span class="cod-recap__total">' + money(total) + "</span>";
      }
    }

    function open() {
      lastFocus = document.activeElement;
      drawer.dataset.open = "true";
      drawer.dataset.step = "cart";
      document.body.style.overflow = "hidden";
      render();
      var c = drawer.querySelector(".drawer__close");
      if (c) c.focus();
    }

    function close() {
      drawer.dataset.open = "false";
      document.body.style.removeProperty("overflow");
      if (lastFocus) lastFocus.focus();
    }

    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-cart-open]")) { e.preventDefault(); open(); return; }
      if (e.target.closest("[data-drawer-close]")) { close(); return; }
      if (e.target.closest("[data-cart-checkout]")) { drawer.dataset.step = "form"; return; }
      if (e.target.closest("[data-cart-back]")) { drawer.dataset.step = "cart"; return; }

      var minus = e.target.closest("[data-line-minus]");
      var plus = e.target.closest("[data-line-plus]");
      var rm = e.target.closest("[data-line-remove]");
      if (!minus && !plus && !rm) return;

      var id = (minus || plus || rm).dataset.lineMinus ||
        (minus || plus || rm).dataset.linePlus ||
        (minus || plus || rm).dataset.lineRemove;
      var items = readCart();

      if (rm) {
        var row = drawer.querySelector('[data-line="' + id + '"]');
        if (row) row.dataset.removing = "true";
        items = items.filter(function (i) { return i.id !== id; });
        setTimeout(function () { writeCart(items); }, 180);
        return;
      }

      items.forEach(function (i) {
        if (i.id !== id) return;
        i.qty = Math.max(1, i.qty + (plus ? 1 : -1));
      });
      writeCart(items);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.dataset.open === "true") close();
    });

    document.addEventListener("cart:change", render);
    render();
  }


  /* Countdown on a promo panel.
     The deadline is a merchant-typed local datetime ("2026-12-31 23:59"),
     which Safari refuses to parse in that form — so it is parsed by hand.
     A promo whose deadline has passed hides itself rather than sitting at
     zero, which reads as a broken page. */
  function initCountdown(el) {
    var raw = (el.dataset.countdown || "").trim();
    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
    if (!m) return;

    var end = new Date(
      +m[1], +m[2] - 1, +m[3], +(m[4] || 23), +(m[5] || 59), 0
    ).getTime();

    var out = el.querySelector("[data-countdown-out]");
    if (!out) return;

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    function tick() {
      var left = end - Date.now();
      if (left <= 0) {
        var panel = el.closest(".bb__promo");
        if (panel) panel.hidden = true;
        else el.hidden = true;
        clearInterval(timer);
        return;
      }
      var s = Math.floor(left / 1000);
      var d = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var mi = Math.floor((s % 3600) / 60);
      var se = s % 60;
      out.textContent = (d > 0 ? d + ":" : "") + pad(h) + ":" + pad(mi) + ":" + pad(se);
    }

    var timer = setInterval(tick, 1000);
    tick();
  }

  function boot() {
    document.querySelectorAll("[data-sticky-fit]").forEach(initStickyFit);
    document.querySelectorAll("[data-disclosure]").forEach(initDisclosure);
    document.querySelectorAll("[data-scroller]").forEach(initScroller);
    document.querySelectorAll("[data-loadmore]").forEach(initLoadMore);
    document.querySelectorAll("[data-cod-form]").forEach(initCodForm);
    document.querySelectorAll("[data-sheet-open]").forEach(initSheet);
    document.querySelectorAll("[data-cod-wrap]").forEach(initCodReveal);
    document.querySelectorAll("[data-countdown]").forEach(initCountdown);
    document.querySelectorAll("[data-order-bar]").forEach(initOrderBar);
    document.querySelectorAll("[data-gallery]").forEach(initGallery);
    initReveal();
    initAddToCart();
    document.querySelectorAll("[data-cart-drawer]").forEach(initCartDrawer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

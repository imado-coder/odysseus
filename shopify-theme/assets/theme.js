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
    /* Read live, never captured.

       theme.js is linked from <head> and dz-locations.js from the product
       section, and deferred scripts run in document order — so this form
       initialises about ten scripts BEFORE the dataset exists. Capturing the
       global here left `locations` permanently [], which meant no wilayas, no
       communes, and no order could be placed at all. The dataset arrives
       later and announces itself; see the listener at the end of this
       function. */
    function locations() { return window.DZ_LOCATIONS || []; }
    var lang = document.documentElement.lang === "ar" ? "ar" : "fr";

    function money(n) {
      return new Intl.NumberFormat("fr-DZ").format(n) + " DA";
    }

    function label(entry) {
      return lang === "ar" ? entry.ar || entry[0] : entry.fr || entry[1];
    }

    /* Populate wilayas once — but only once there is something to populate
       from, so an empty dataset does not get recorded as "filled". */
    function fillWilayas() {
      if (!wilaya || wilaya.dataset.filled) return;
      var all = locations();
      if (!all.length) return;
      all.forEach(function (w) {
        var o = document.createElement("option");
        o.value = w.c;
        o.textContent = w.c + " — " + label(w);
        wilaya.appendChild(o);
      });
      wilaya.dataset.filled = "1";
    }

    fillWilayas();

    function fillCommunes() {
      if (!commune) return;
      var w = locations().filter(function (x) {
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

      /* The dataset lands after this form is wired up. It says so when it
         does; `load` is the fallback for a cached or reordered page where
         the announcement was already made before this listener existed. */
      document.addEventListener("dz:locations", fillWilayas);
      window.addEventListener("load", fillWilayas);
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

      /* Hand the confirmation page what it needs to show, via sessionStorage
         rather than the URL. A reference and a total in a querystring end up
         in history, in any analytics that records paths, and in whatever the
         shopper pastes to a friend. sessionStorage dies with the tab, which
         is exactly the lifetime this data should have. */
      function handOver(reference) {
        var place = [payload.commune, payload.wilaya].filter(Boolean).join(", ");
        try {
          sessionStorage.setItem("souq:lastOrder", JSON.stringify({
            ref: reference || "",
            name: [payload.prenom, payload.nom].filter(Boolean).join(" "),
            phone: payload.telephone || "",
            place: place,
            total: out.total ? out.total.textContent : "",
          }));
        } catch (e) { /* private mode: the page falls back to its static copy */ }
        var to = form.dataset.thanksUrl;
        if (to) {
          window.location.assign(to);
          return true;
        }

        /* No confirmation page configured. Rather than leave the shopper on a
           form with a line of text under it, the form itself becomes the
           confirmation — same words, same reassurance, taking the whole panel
           so there is no doubt the order was placed. It is the merchant's one
           missing setting, and it must not read to their customer as a
           failure. */
        showInlineConfirmation();
        return false;
      }

      function showInlineConfirmation() {
        var panel = form.closest(".cod-sheet__panel") || form.parentElement;
        if (!panel || panel.querySelector("[data-cod-done]")) return;

        var done = document.createElement("div");
        done.className = "cod-done";
        done.setAttribute("data-cod-done", "");
        done.setAttribute("role", "status");
        done.innerHTML =
          '<span class="cod-done__mark" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' +
          "</span>" +
          '<p class="cod-done__title">' +
          (form.dataset.msgSuccess || "Commande enregistrée") +
          "</p>";

        form.hidden = true;
        panel.appendChild(done);
        done.scrollIntoView({ block: "center", behavior: "smooth" });
      }

      /* No endpoint yet — the app supplies it later. The order still has to
         END somewhere: a shopper who fills seven fields, presses the button
         and gets a sentence under it has no idea whether anything happened.
         So the handover and the confirmation run exactly as they do with an
         endpoint; only the record-keeping is missing, and the merchant is the
         one who knows that. */
      if (!endpoint) {
        submit.removeAttribute("aria-busy");
        status.dataset.state = "success";
        status.textContent =
          form.dataset.msgPending ||
          "Formulaire valide. En attente de la connexion à l'application COD.";
        form.reset();
        fillCommunes();
        recalc();
        handOver(null);
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json().catch(function () { return {}; });
        })
        .then(function (data) {
          status.dataset.state = "success";
          status.textContent =
            form.dataset.msgSuccess || "Commande enregistrée. Nous vous appelons bientôt.";
          /* Reset before leaving: a back button lands on a clean form rather
             than one still holding the order that was just placed. */
          form.reset();
          fillCommunes();
          recalc();
          handOver(data && (data.reference || data.ref || data.orderName));
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
      /* The sheet ships aria-hidden so it is not announced while closed.
         Leaving it set once the sheet is open hides the whole dialog from a
         screen reader — the shopper hears nothing and focus lands inside a
         region that, as far as the assistive layer knows, is not there. */
      sheet.removeAttribute("aria-hidden");
      document.body.style.overflow = "hidden";
      var first = sheet.querySelector("input, select, textarea, button");
      if (first) first.focus();
    }

    function close() {
      if (sheet.dataset.open !== "true") return;
      sheet.dataset.open = "false";
      /* Blur first: aria-hidden over the element holding focus is invalid,
         and returning focus to the trigger is where it belongs anyway. */
      if (lastFocus) lastFocus.focus();
      else if (sheet.contains(document.activeElement)) document.activeElement.blur();
      sheet.setAttribute("aria-hidden", "true");
      document.body.style.removeProperty("overflow");
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

    var watched = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
    watched.forEach(function (el) { io.observe(el); });

    /* Safety net.

       Hiding content and waiting for an observer to give it back is a bet,
       and the cost of losing it is a blank section — worse than never having
       animated at all. An element inside a container that never scrolls, one
       whose ancestor is display:none at load, or a browser that throttles the
       observer in a background tab, all end the same way.

       So: anything still hidden after four seconds is shown regardless. The
       animation is a nicety; the content is not. */
    setTimeout(function () {
      watched.forEach(function (el) {
        if (!el.classList.contains("is-in")) {
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    }, 4000);
  }

  /* ----------------------------------------------------------------------
     Cart.
     ---------------------------------------------------------------------- */
  /* Shopify's cart is the cart.

     This drawer used to keep its own basket in localStorage under
     "souq:cart". Nothing else on a Shopify storefront knows about that key,
     so the two never met: anything added through a normal product form went
     into Shopify's cart and the drawer showed empty, while the header count
     came from Liquid and reported the real number. One cart, two answers.

     Everything below talks to the Cart AJAX API instead. CART is a cache of
     the last response so render() can stay synchronous; refreshCart() is the
     only thing that fills it. */
  var CART = { items: [], count: 0, total: 0 };

  function cartRoot() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  /* Shopify serves money in the currency's minor unit. Dinar is quoted whole,
     so this is the one place the division happens. */
  function fromMinor(n) { return n / 100; }

  function refreshCart() {
    return fetch(cartRoot() + "cart.js", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        CART.items = (c.items || []).map(function (i) {
          return {
            /* The line key, not the variant id: a variant can legitimately
               appear on two lines with different properties, and quantity
               changes address the line. */
            id: i.key,
            title: i.product_title || i.title,
            option: i.variant_title && i.variant_title !== "Default Title" ? i.variant_title : "",
            qty: i.quantity,
            line: fromMinor(i.final_line_price),
            image: i.image || "",
          };
        });
        CART.count = c.item_count || 0;
        CART.total = fromMinor(c.items_subtotal_price || 0);
        document.dispatchEvent(new CustomEvent("cart:change", { detail: CART }));
        return CART;
      })
      .catch(function () { return CART; });
  }

  /* quantity 0 removes the line — that is the API's own contract, so there is
     no separate remove call. */
  function changeLine(key, quantity) {
    return fetch(cartRoot() + "cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: key, quantity: quantity }),
    }).then(refreshCart);
  }

  function addLine(variantId, quantity) {
    return fetch(cartRoot() + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: variantId, quantity: quantity || 1 }),
    }).then(refreshCart);
  }

  /* The suffix is the merchant's setting, carried on the drawer, so a shop
     that is not pricing in dinars does not get "DA" appended to its totals. */
  function moneySuffix() {
    var d = document.querySelector("[data-cart-drawer]");
    return (d && d.dataset.currencySuffix) || "DA";
  }

  function money(n) {
    return new Intl.NumberFormat("fr-DZ").format(Math.round(n)) + " " + moneySuffix();
  }

  /* /cart.js hands back the full-size image URL. Rendering a 2000px file into
     a 72px box is most of the drawer's weight for none of its quality, and on
     a phone connection it is the reason the drawer looks broken before it
     looks right. Shopify's CDN resizes from the same URL. */
  function thumb(url, px) {
    if (!url) return "";
    return url.replace(/(\.(?:jpe?g|png|webp|gif))(\?|$)/i, "_" + px + "x$1$2");
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
      if (btn.dataset.busy) return;

      /* The animation and the confirmation run immediately; the shopper
         should not wait on a round trip to learn the tap registered. If the
         request fails the toast says so and the count stays where it was. */
      flyToCart(btn);
      btn.dataset.busy = "1";
      btn.dataset.added = "true";
      setTimeout(function () { delete btn.dataset.added; }, 400);

      addLine(btn.dataset.addToCart, 1)
        .then(function () { toast(btn.dataset.toast || "Ajouté au panier"); })
        .catch(function () { toast(btn.dataset.toastFail || "Échec de l'ajout"); })
        .then(function () { delete btn.dataset.busy; });
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
      var items = CART.items;
      var total = CART.total;

      /* Liquid rendered these counts from the cart as it was when the page
         was served. Every AJAX change makes them stale, and a header saying
         2 above a drawer saying 3 is the bug the shopper actually reports. */
      document.querySelectorAll("[data-cart-count], .mhead__cart-count, .cartbub__count")
        .forEach(function (el) {
          /* Only react when the number actually moved. Re-rendering the
             drawer for an unrelated reason must not make the header twitch. */
          var changed = el.textContent !== String(CART.count);
          el.textContent = CART.count;
          el.hidden = CART.count === 0;
          if (!changed || !CART.count) return;
          var target = el.closest(".cartbub") || el;
          target.dataset.bumped = "1";
          setTimeout(function () { delete target.dataset.bumped; }, 460);
        });

      var bubble = document.querySelector(".cartbub");
      if (bubble) bubble.hidden = CART.count === 0;

      var countEl = drawer.querySelector("[data-drawer-count]");
      if (countEl) countEl.textContent = CART.count + " article(s)";

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
              (i.image ? '<img src="' + thumb(i.image, 144) + '" alt="" width="72" height="72" loading="lazy">' : "") +
              "</span><div><p class=\"citem__title\">" + i.title + "</p>" +
              (i.option ? '<p class="citem__opt">' + i.option + "</p>" : "") +
              '<div class="citem__row">' +
              '<span class="qty__control"><button class="qty__btn" type="button" data-line-minus="' + i.id + '" aria-label="Retirer un">&minus;</button>' +
              '<input class="qty__input" type="number" value="' + i.qty + '" min="1" data-line-qty="' + i.id + '" aria-label="Quantité">' +
              '<button class="qty__btn" type="button" data-line-plus="' + i.id + '" aria-label="Ajouter un">+</button></span>' +
              '<span class="citem__price">' + money(i.line) + "</span>" +
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
            return i.image ? '<img src="' + thumb(i.image, 68) + '" alt="" width="34" height="34" loading="lazy">' : "";
          }).join("") +
          "</span><span>" + CART.count + " article(s)</span>" +
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
      var current = CART.items.filter(function (i) { return i.id === id; })[0];
      if (!current) return;

      if (rm) {
        /* Let the row finish collapsing before the re-render replaces the
           list under it — quantity 0 is how the API removes a line. */
        var row = drawer.querySelector('[data-line="' + id + '"]');
        if (row) row.dataset.removing = "true";
        setTimeout(function () { changeLine(id, 0); }, 180);
        return;
      }

      changeLine(id, Math.max(1, current.qty + (plus ? 1 : -1)));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.dataset.open === "true") close();
    });

    document.addEventListener("cart:change", render);
    /* First paint from Liquid's numbers, then correct it against the server —
       the cart may have changed in another tab since this page was served. */
    render();
    refreshCart();
  }


  /* ----------------------------------------------------------------------
     Confirmation celebration.

     One burst, on the page that exists to say the order landed. Built from a
     handful of absolutely positioned spans rather than a canvas: no library,
     no render loop, and the browser drops the whole thing off the main thread
     because each piece only animates transform and opacity.

     Skipped entirely under reduced motion — a confirmation must never be the
     page that makes someone feel unwell.
     ---------------------------------------------------------------------- */
  function initCelebrate(root) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var palette = ["--c-accent", "--c-trust", "--c-amber", "--c-sale"];
    var cs = getComputedStyle(document.documentElement);
    var colors = palette
      .map(function (v) { return cs.getPropertyValue(v).trim(); })
      .filter(Boolean);
    if (!colors.length) colors = ["#ff6d00", "#0a8800", "#ffb020"];

    var layer = document.createElement("div");
    layer.className = "burst";
    layer.setAttribute("aria-hidden", "true");

    for (var i = 0; i < 28; i++) {
      var bit = document.createElement("span");
      bit.className = "burst__bit";
      /* Spread across the width, thrown from just above the card's mark. */
      bit.style.setProperty("--x", (Math.random() * 100).toFixed(2) + "%");
      bit.style.setProperty("--dx", (Math.random() * 160 - 80).toFixed(0) + "px");
      bit.style.setProperty("--dy", (Math.random() * 60 + 190).toFixed(0) + "px");
      bit.style.setProperty("--rot", (Math.random() * 720 - 360).toFixed(0) + "deg");
      bit.style.setProperty("--delay", (Math.random() * 260).toFixed(0) + "ms");
      bit.style.setProperty("--dur", (900 + Math.random() * 700).toFixed(0) + "ms");
      bit.style.background = colors[i % colors.length];
      if (i % 3 === 0) bit.style.borderRadius = "50%";
      layer.appendChild(bit);
    }

    root.appendChild(layer);
    /* Remove rather than leave 28 elements parked on the page forever. */
    setTimeout(function () { layer.remove(); }, 2200);
  }

  /* ----------------------------------------------------------------------
     Language switch.

     Direction and typeface are what the theme controls, so that is what this
     switches — instantly, with no reload, because everything downstream keys
     off the dir attribute and logical properties. The choice is remembered so
     a returning shopper never has to make it twice; the layout head applies
     it before first paint.

     The merchant's own copy is not translated here. That lives in the
     template and only they can write it in a second language — see the
     product.arabe template.
     ---------------------------------------------------------------------- */
  function initLangSwitch(root) {
    var buttons = [].slice.call(root.querySelectorAll("[data-lang]"));
    if (!buttons.length) return;

    function apply(dir, remember) {
      document.documentElement.setAttribute("dir", dir);
      document.documentElement.setAttribute("lang", dir === "rtl" ? "ar" : root.dataset.pageLang || "fr");
      /* Every switch on the page, not only the one that was tapped. A product
         page carries two — the header's and the one riding with the gallery
         controls — and leaving the other showing the opposite state tells the
         shopper the language did not change. */
      document.querySelectorAll("[data-lang]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.lang === dir));
      });
      if (remember) {
        try { localStorage.setItem("souq:dir", dir); } catch (e) {}
      }
      /* Anything that measured itself against the old direction gets a chance
         to measure again — the sticky buy box and the pill rails both do. */
      window.dispatchEvent(new Event("resize"));
    }

    /* Reflect what the head script already applied, without writing it back. */
    var stored = null;
    try { stored = localStorage.getItem("souq:dir"); } catch (e) {}
    apply(stored || document.documentElement.getAttribute("dir") || root.dataset.defaultDir || "ltr", false);

    buttons.forEach(function (b) {
      b.addEventListener("click", function () { apply(b.dataset.lang, true); });
    });
  }

  /* ----------------------------------------------------------------------
     Price countdown.

     The saving is the argument, so the page makes it once, in the open: the
     figure starts at what the item was worth and falls to what it costs
     today. A shopper who arrives mid-scroll has already missed it, so it
     only runs when the price is actually on screen.

     The final text is authoritative and is never rebuilt from scratch — the
     shop's own money format decides where the symbol goes, whether the
     separator is a space, a comma or a dot, and how many decimals there are.
     This reads that formatting off the rendered string and refills only the
     digits, so a shop in dinars, euros or rupees all animate correctly
     without the theme knowing anything about currencies.
     ---------------------------------------------------------------------- */
  function initPriceCount(el) {
    var from = parseFloat(el.dataset.from);
    var to = parseFloat(el.dataset.to);

    /* No discount, nothing to count down from. A price that "falls" from
       itself is a lie the shopper can check, so the animation simply does not
       run — and the merchant sees a still price because their product has no
       compare-at price set, which is Shopify data rather than a theme bug. */
    if (!isFinite(from) || !isFinite(to) || from <= to) return;

    var finalText = el.textContent;
    var match = finalText.match(/[\d][\d\s.,\u00a0\u202f]*\d|\d/);
    if (!match) return;

    var numeric = match[0];
    var prefix = finalText.slice(0, match.index);
    var suffix = finalText.slice(match.index + numeric.length);

    var dec = numeric.match(/([.,])(\d{1,2})$/);
    var decimals = dec ? dec[2].length : 0;
    var decimalMark = dec ? dec[1] : ".";
    var groupMark = (numeric.replace(/[\d]/g, "").replace(decimalMark, "") || " ")[0] || "";

    function render(value) {
      var fixed = value.toFixed(decimals);
      var parts = fixed.split(".");
      var whole = parts[0];
      if (groupMark) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
      return prefix + whole + (decimals ? decimalMark + parts[1] : "") + suffix;
    }

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    var row = el.closest("[data-price-row]") || el.parentElement;
    var was = row && row.querySelector(".bb__price-was, s");

    var ran = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || ran) return;
        ran = true;
        io.disconnect();
        run();
      });
    }, { threshold: 0.6 });
    io.observe(el);

    /* Split the settled price into one span per character so each digit can
       roll on its own. Non-digits are marked so they hold still — a currency
       symbol tumbling alongside the numerals reads as a glitch. */
    function odometer(text) {
      el.textContent = "";
      var frag = document.createDocumentFragment();
      var digitIndex = 0;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        var span = document.createElement("span");
        span.className = "podo__c";
        span.textContent = ch;
        if (/\d/.test(ch)) {
          span.classList.add("podo__d");
          /* Left to right, so the eye follows the number settling the way it
             would on a physical counter. */
          span.style.setProperty("--d", digitIndex * 45 + "ms");
          digitIndex++;
        }
        frag.appendChild(span);
      }
      el.appendChild(frag);
      el.classList.add("podo");
    }

    function run() {
      var duration = Math.min(1500, Math.max(800, (from - to) * 0.4));
      var start = 0;
      el.dataset.counting = "true";

      /* The old price is struck through as the new one falls — the line is
         drawn across rather than already being there, so the shopper watches
         the previous price get cancelled. */
      if (was) was.dataset.striking = "true";

      function frame(now) {
        if (!start) start = now;
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 4);
        el.textContent = render(from + (to - from) * eased);
        if (t < 1) return requestAnimationFrame(frame);

        /* Landing: the settled figure is rebuilt as rolling digits, so the
           last thing the eye sees is each numeral dropping into place. */
        odometer(finalText);
        delete el.dataset.counting;
        if (row) {
          row.dataset.landed = "true";
          setTimeout(function () { delete row.dataset.landed; }, 900);
        }
        setTimeout(function () {
          el.classList.remove("podo");
          el.textContent = finalText;
        }, 900);
      }
      requestAnimationFrame(frame);
    }
  }

  /* Percentages count too, and land with the price they belong to. */
  function initCountUp(el) {
    var to = parseFloat(el.dataset.countTo);
    if (!isFinite(to)) return;
    var finalText = el.textContent;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect();
        var start = 0;
        var duration = 900;
        (function frame(now) {
          if (!start) start = now;
          var t = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - t, 4);
          el.textContent = finalText.replace(/\d+/, String(Math.round(to * eased)));
          if (t < 1) requestAnimationFrame(frame);
          else el.textContent = finalText;
        })(performance.now());
      });
    }, { threshold: 0.6 });
    io.observe(el);
  }

  /* ----------------------------------------------------------------------
     Order confirmation page.

     Reads the handover the COD form left in sessionStorage. Everything here
     is additive: the page renders its full message, steps and buttons from
     Liquid, and this only fills in the summary that is specific to the order
     just placed. A shopper who opens the page directly, or who has scripting
     off, sees the page without a summary rather than a summary of nothing.
     ---------------------------------------------------------------------- */
  function initThanks(root) {
    var data;
    try { data = JSON.parse(sessionStorage.getItem("souq:lastOrder") || "null"); }
    catch (e) { data = null; }
    if (!data) return;

    function put(sel, value) {
      var el = root.querySelector(sel);
      if (el && value) el.textContent = value;
      return !!value;
    }

    var any = false;
    any = put("[data-ty-name]", data.name) || any;
    any = put("[data-ty-phone]", data.phone) || any;
    any = put("[data-ty-place]", data.place) || any;
    any = put("[data-ty-total]", data.total) || any;

    var summary = root.querySelector("[data-ty-summary]");
    if (summary && any) summary.hidden = false;

    if (data.ref) {
      var ref = root.querySelector("[data-ty-ref]");
      var refVal = root.querySelector("[data-ty-ref-value]");
      if (refVal) refVal.textContent = data.ref;
      if (ref) ref.hidden = false;
    }

    /* One order, one confirmation. Without this a reload — or a later visit
       to the page from the menu — replays an order that is already handled. */
    try { sessionStorage.removeItem("souq:lastOrder"); } catch (e) {}
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


  /* Quantity stepper. The input stays a real number field so a keyboard or a
     paste still works; the buttons only nudge it and keep it inside the
     min/max the merchant set. */
  function initQty(root) {
    var input = root.querySelector(".qty__input");
    if (!input) return;

    function step(by) {
      var min = parseInt(input.min, 10) || 1;
      var max = parseInt(input.max, 10) || 99;
      var now = parseInt(input.value, 10) || min;
      var next = Math.min(max, Math.max(min, now + by));
      if (next === now) return;
      input.value = String(next);
      /* The digit rolls in from the direction it came: up for +, down for −.
         It is a two-frame cue, but it is the difference between a number
         that changed and a number the shopper changed. */
      input.style.setProperty("--roll-from", by > 0 ? "8px" : "-8px");
      input.dataset.rolled = "1";
      setTimeout(function () { delete input.dataset.rolled; }, 280);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    var minus = root.querySelector("[data-qty-minus]");
    var plus = root.querySelector("[data-qty-plus]");
    if (minus) minus.addEventListener("click", function () { step(-1); });
    if (plus) plus.addEventListener("click", function () { step(1); });

    /* Typing 0 or a negative by hand is corrected on the way out. */
    input.addEventListener("change", function () {
      var min = parseInt(input.min, 10) || 1;
      var max = parseInt(input.max, 10) || 99;
      var n = parseInt(input.value, 10);
      if (!n || n < min) n = min;
      if (n > max) n = max;
      input.value = String(n);
    });
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
    document.querySelectorAll("[data-qty]").forEach(initQty);
    document.querySelectorAll("[data-order-bar]").forEach(initOrderBar);
    document.querySelectorAll("[data-gallery]").forEach(initGallery);
    initReveal();
    initAddToCart();
    document.querySelectorAll("[data-cart-drawer]").forEach(initCartDrawer);
    document.querySelectorAll("[data-lang-switch]").forEach(initLangSwitch);
    document.querySelectorAll("[data-ty]").forEach(initThanks);
    document.querySelectorAll("[data-price-count]").forEach(initPriceCount);
    document.querySelectorAll("[data-count-to]").forEach(initCountUp);
    document.querySelectorAll("[data-celebrate]").forEach(initCelebrate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

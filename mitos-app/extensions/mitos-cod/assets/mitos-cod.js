/* ==========================================================================
   mitos-cod.js — the cash-on-delivery lead form, as an app block.

   Ported from the theme's theme.js (initCodForm + codQuote). The order flow is
   deliberately unchanged: wilaya drives commune, both drive the shipping line,
   shipping and quantity drive the total, and the app is asked for the real
   shipping table so the price shown is the price charged.

   Three things had to change to run inside a theme we did not write:

   1. The hooks are `data-mitos-cod-*`, not `data-cod-*`. A merchant running
      our own theme *and* this app would otherwise have two initialisers bind
      the same form — theme.js scans for `[data-cod-form]` on every page — and
      the submit handler would fire twice for one tap.

   2. The confirmation is built here. The theme revealed a card that lives in
      its product section; a merchant's theme has no such element, so the form
      turns into its own confirmation rather than depending on markup that is
      not there.

   3. The currency is passed in rather than hardcoded. The theme served one
      shop; a block ships to whoever installs it.
   ========================================================================== */
(function () {
  "use strict";

  /* One request per endpoint+product per page, shared by every form on it.
     A product page can carry more than one block, and they all want the same
     answer — asking twice would show the shopper two numbers. */
  var quoteCache = {};

  /* The 58 wilayas and their 1,541 communes are 54 kB — far too much to sit
     in the script the schema loads on every page that carries the block. It
     is fetched once, on demand, and only where a form actually exists.

     Loading it from here rather than from a <script> tag in the block also
     makes it exactly once: the merchant may place the block twice on a page,
     and two tags would parse the same 54 kB twice. The file announces itself
     with `dz:locations` when it lands, which is what the forms listen for. */
  var locationsLoader = null;

  function loadLocations(url) {
    if (window.DZ_LOCATIONS && window.DZ_LOCATIONS.length) return;
    if (locationsLoader || !url) return;
    locationsLoader = document.createElement("script");
    locationsLoader.src = url;
    locationsLoader.defer = true;
    document.head.appendChild(locationsLoader);
  }

  function initCodForm(form) {
    if (form.dataset.mitosBound) return;
    form.dataset.mitosBound = "1";

    var wilaya = form.querySelector("[data-mitos-cod-wilaya]");
    var commune = form.querySelector("[data-mitos-cod-commune]");
    var qty = form.querySelector("[data-mitos-cod-qty]");
    var status = form.querySelector("[data-mitos-cod-status]");
    var submit = form.querySelector("[data-mitos-cod-submit]");
    var out = {
      ship: form.querySelector("[data-mitos-cod-out-ship]"),
      sub: form.querySelector("[data-mitos-cod-out-sub]"),
      total: form.querySelector("[data-mitos-cod-out-total]"),
    };
    var opts = [].slice.call(form.querySelectorAll("[data-mitos-cod-delivery]"));

    var unit = parseInt(form.dataset.unitPrice || "0", 10);
    var currency = form.dataset.currency || "DA";

    var tariffs = {};
    try {
      tariffs = JSON.parse(form.dataset.tariffs || "{}");
    } catch (e) {
      tariffs = {};
    }

    var fallback;
    try {
      fallback = JSON.parse(form.dataset.tariffFallback || "[600,350]");
    } catch (e) {
      fallback = [600, 350];
    }
    if (!Array.isArray(fallback) || fallback.length < 2) fallback = [600, 350];

    /* Read live, never captured.

       The dataset is a separate asset and may still be in flight when this
       form is wired up. Capturing the global here would leave `locations`
       permanently empty — no wilayas, no communes, and no order can be
       placed at all. It announces itself when it lands; see the listeners
       below. */
    function locations() {
      return window.DZ_LOCATIONS || [];
    }

    var lang = (document.documentElement.lang || "").toLowerCase()
      .indexOf("ar") === 0 ? "ar" : "fr";

    function money(n) {
      return new Intl.NumberFormat("fr-DZ").format(n) + " " + currency;
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

    function fillCommunes() {
      if (!commune) return;
      var w = locations().filter(function (x) {
        return x.c === (wilaya && wilaya.value);
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

    /* Quantity breaks, keyed by quantity. Filled from the app; empty until it
       answers, and empty forever for a product with no offers — in both cases
       the arithmetic below is exactly what it was before offers existed. */
    var offers = {};

    function recalc() {
      var n = Math.max(1, parseInt((qty && qty.value) || "1", 10));
      /* An offer price is the total for the whole quantity, not a unit price.
         The server re-reads the same row and charges from it, so this is a
         display of the merchant's number, never the source of it. */
      var sub = offers[n] != null ? offers[n] : unit * n;
      var chosen = wilaya && wilaya.value;
      var ship = chosen ? shippingFor() : null;

      /* Reflect the per-wilaya price on the two delivery cards too. */
      var t = tariffs[chosen] || fallback;
      opts.forEach(function (o) {
        var priceEl = o.parentNode.querySelector("[data-mitos-cod-opt-price]");
        if (!priceEl) return;
        priceEl.textContent = chosen
          ? money(o.value === "desk" ? t[1] : t[0])
          : priceEl.dataset.idle || "—";
      });

      if (out.sub) out.sub.textContent = money(sub);
      if (out.ship) {
        out.ship.textContent = chosen ? money(ship) : "—";
        out.ship.classList.toggle("mitos-cod__muted", !chosen);
      }
      if (out.total) out.total.textContent = money(sub + (ship || 0));
    }

    function fieldOf(el) {
      return el.closest(".mitos-field") || el.closest(".mitos-cod__fieldset");
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
      form.querySelectorAll("[data-mitos-cod-required]").forEach(function (el) {
        var v = (el.value || "").trim();
        var ok = !!v;
        if (ok && el.dataset.mitosCodPattern) {
          ok = new RegExp(el.dataset.mitosCodPattern)
            .test(v.replace(/[\s.-]/g, ""));
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

      /* The dataset can land after this form is wired up. It says so when it
         does; `load` is the fallback for a cached or reordered page where the
         announcement was already made before this listener existed. */
      document.addEventListener("dz:locations", fillWilayas);
      window.addEventListener("load", fillWilayas);
    }
    if (qty) qty.addEventListener("change", recalc);
    opts.forEach(function (o) {
      o.addEventListener("change", recalc);
    });

    form.querySelectorAll("[data-mitos-cod-required]").forEach(function (el) {
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
      status.textContent = "";
      submit.setAttribute("aria-busy", "true");

      var payload = Object.fromEntries(new FormData(form).entries());
      var endpoint = form.dataset.endpoint;

      /* One key per order, not per tap.

         The app refuses a second lead carrying a key it has already seen, so
         a double-tap on a slow connection cannot become two orders. The key
         therefore has to survive a retry — it is minted once and kept on the
         form — and it has to be dropped after a success, or the same customer
         ordering the same product again next month would be waved away as a
         duplicate and never reach the merchant. */
      if (!form.dataset.orderKey) {
        form.dataset.orderKey =
          window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
      }
      payload.idempotencyKey = form.dataset.orderKey;

      /* Emitted whether or not there is an endpoint, so anything else on the
         page (pixels, analytics) can observe the submission. */
      form.dispatchEvent(
        new CustomEvent("cod:submit", { bubbles: true, detail: payload })
      );

      /* Hand the confirmation page what it needs to show, via sessionStorage
         rather than the URL. A reference and a total in a querystring end up
         in history, in any analytics that records paths, and in whatever the
         shopper pastes to a friend. sessionStorage dies with the tab, which
         is exactly the lifetime this data should have. */
      function handOver(reference) {
        /* The wilaya field carries the code ("16"); the shopper needs the
           name they picked. */
        var wName = "";
        if (wilaya && wilaya.selectedIndex > 0) {
          wName = (wilaya.options[wilaya.selectedIndex].textContent || "")
            .replace(/^\s*\d+\s*[—-]\s*/, "")
            .trim();
        }
        var place = [payload.commune, wName || payload.wilaya]
          .filter(Boolean)
          .join(", ");
        var summary = {
          ref: reference || "",
          name: [payload.prenom, payload.nom].filter(Boolean).join(" "),
          /* Grouped the way a phone number is read here, not as ten unbroken
             digits — this line is what the shopper checks to be sure we will
             reach them. */
          phone:
            (payload.telephone || "")
              .replace(/\D/g, "")
              .replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4") ||
            (payload.telephone || ""),
          place: place,
          total: out.total ? out.total.textContent : "",
        };
        try {
          sessionStorage.setItem("souq:lastOrder", JSON.stringify(summary));
        } catch (err) {
          /* private mode: the confirmation below still shows the order */
        }
        var to = form.dataset.thanksUrl;
        if (to) {
          window.location.assign(to);
          return;
        }
        showConfirmation(summary);
      }

      /* No confirmation page configured — and in a merchant's theme there
         usually is not one. Rather than leave the shopper on a form with a
         line of text under it, the form becomes the confirmation and takes
         the whole panel, so there is no doubt the order was placed. */
      function showConfirmation(summary) {
        var body = form.querySelector("[data-mitos-cod-body]");
        if (!body) return;

        var done = document.createElement("div");
        done.className = "mitos-cod-done";
        done.setAttribute("role", "status");

        var mark = document.createElement("div");
        mark.className = "mitos-cod-done__mark";
        mark.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M4 12.5l5 5L20 7" stroke="currentColor" stroke-width="2.5" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>';

        var title = document.createElement("p");
        title.className = "mitos-cod-done__title";
        title.textContent =
          form.dataset.msgSuccess ||
          "Commande enregistrée. Nous vous appelons bientôt.";

        done.appendChild(mark);
        done.appendChild(title);

        /* The reference and the total are what the shopper writes down or
           screenshots, so they are shown rather than only stored. */
        var lines = [];
        if (summary.ref) lines.push(summary.ref);
        if (summary.total) lines.push(summary.total);
        if (summary.place) lines.push(summary.place);
        if (lines.length) {
          var recap = document.createElement("p");
          recap.className = "mitos-cod__reassure";
          recap.textContent = lines.join(" · ");
          done.appendChild(recap);
        }

        body.replaceChildren(done);
        var heading = done.querySelector(".mitos-cod-done__title");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
        done.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      /* No endpoint means the merchant cleared a setting that ships filled
         in, so the lead has nowhere to go.

         It is shown as a notice, not as a confirmation, and the form is left
         exactly as the shopper typed it. Drawing the success panel here —
         which is what happens if this branch falls through — would tell a
         customer their order was placed when nothing was sent anywhere, and
         they would wait for a call that is never coming. Nothing is reset
         either: if the merchant fixes the setting, the shopper can send the
         same form rather than typing it again. */
      if (!endpoint) {
        submit.removeAttribute("aria-busy");
        status.dataset.state = "notice";
        status.textContent =
          form.dataset.msgPending ||
          "Formulaire valide. Connectez l'application COD pour enregistrer la commande.";
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (data) {
          status.dataset.state = "success";
          status.textContent =
            form.dataset.msgSuccess ||
            "Commande enregistrée. Nous vous appelons bientôt.";

          /* The order landed, so the next submission is a new order.

             This is dropped before the confirmation is drawn, not after.
             Anything that throws while rendering — and the confirmation is
             the one place here that touches layout — would otherwise leave
             the key on the form, and the *next* order this shopper places
             would carry a key the app has already seen and be discarded as a
             duplicate. Clearing first costs nothing: a failed send never
             reaches this branch, so the key still survives a retry. */
          delete form.dataset.orderKey;

          /* Capture first, then clear: resetting empties the wilaya and takes
             recalc() back to zero, so the total has to be read while the form
             still holds the order. */
          handOver(data && (data.reference || data.ref || data.orderName));
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

    loadLocations(form.dataset.locationsUrl);
    fillWilayas();
    fillCommunes();
    recalc();

    /* The shipping table has to come from the app, not from a block setting.

       The app is what actually charges: it recomputes shipping from the
       merchant's own table and ignores whatever the storefront sent. If the
       setting and the table ever disagree, the shopper is quoted one price and
       charged another — and the merchant has to remember to edit two places to
       change one number.

       So the setting is the fallback and the app is the source. This runs
       after the first paint and never blocks it: on a slow or failed request
       the form keeps working on the setting's figures, which is what it did
       before this existed. */
    codQuote(form).then(function (quote) {
      if (!quote) return;
      if (quote.rates && Object.keys(quote.rates).length) tariffs = quote.rates;
      if (quote.offers && quote.offers.length) {
        quote.offers.forEach(function (o) {
          offers[o.quantity] = o.price;
        });
        paintOffers(quote.offers);
      }
      recalc();
    });

    /* The offers are drawn into the quantity control that already exists
       rather than beside a second one: two places to choose a quantity is two
       chances to send a number the customer did not mean. */
    function paintOffers(list) {
      if (!qty) return;
      var host = form.querySelector("[data-mitos-cod-offers]");
      if (!host) return;

      host.innerHTML = list
        .map(function (o) {
          return (
            '<button class="mitos-cod-offer" type="button" data-offer-qty="' +
            o.quantity +
            '"' +
            (o.featured ? ' data-featured="true"' : "") +
            ">" +
            '<span class="mitos-cod-offer__n">' + o.quantity + "×</span>" +
            '<span class="mitos-cod-offer__p">' + money(o.price) + "</span>" +
            (o.badge
              ? '<span class="mitos-cod-offer__badge">' + escapeHtml(o.badge) + "</span>"
              : "") +
            "</button>"
          );
        })
        .join("");

      host.hidden = false;

      host.addEventListener("click", function (e) {
        var b = e.target.closest("[data-offer-qty]");
        if (!b) return;
        qty.value = b.getAttribute("data-offer-qty");
        markOffer();
        recalc();
      });

      markOffer();
      qty.addEventListener("change", markOffer);
    }

    function markOffer() {
      var host = form.querySelector("[data-mitos-cod-offers]");
      if (!host) return;
      var n = String(Math.max(1, parseInt(qty.value || "1", 10)));
      [].forEach.call(host.querySelectorAll("[data-offer-qty]"), function (b) {
        b.setAttribute(
          "aria-pressed",
          b.getAttribute("data-offer-qty") === n ? "true" : "false"
        );
      });
    }
  }

  /* The badge is the merchant's own text coming back from the app. It is the
     only offer field written into markup rather than set as textContent, so
     it is the only one that needs escaping. */
  function escapeHtml(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function codQuote(form) {
    var endpoint = form.dataset.endpoint;
    var shopField = form.querySelector('[name="shop"]');
    var shop = shopField && shopField.value;
    if (!endpoint || !shop) return Promise.resolve(null);

    /* Shipping table and quantity breaks in one request: the form needs both
       before it can show a total, and two round trips on a phone connection
       is two chances to show the customer a number that then changes. */
    var productField = form.querySelector('[name="product_id"]');
    var product = productField && productField.value;

    var url =
      endpoint +
      (endpoint.indexOf("?") === -1 ? "?" : "&") +
      "shop=" +
      encodeURIComponent(shop) +
      (product
        ? "&product=gid://shopify/Product/" + encodeURIComponent(product)
        : "");

    if (!quoteCache[url]) {
      quoteCache[url] = fetch(url, { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (d) {
          return d || null;
        })
        .catch(function () {
          return null;
        });
    }
    return quoteCache[url];
  }

  function initAll(root) {
    (root || document)
      .querySelectorAll("[data-mitos-cod-form]")
      .forEach(initCodForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initAll();
    });
  } else {
    initAll();
  }

  /* The theme editor tears a section down and rebuilds it on every settings
     change. Without these the merchant edits one field, the form goes inert,
     and the block looks broken in exactly the place they are judging it. */
  document.addEventListener("shopify:section:load", function (e) {
    initAll(e.target);
  });
  document.addEventListener("shopify:block:select", function (e) {
    initAll(e.target);
  });
})();

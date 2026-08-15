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

  function boot() {
    document.querySelectorAll("[data-sticky-fit]").forEach(initStickyFit);
    document.querySelectorAll("[data-disclosure]").forEach(initDisclosure);
    document.querySelectorAll("[data-scroller]").forEach(initScroller);
    document.querySelectorAll("[data-loadmore]").forEach(initLoadMore);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

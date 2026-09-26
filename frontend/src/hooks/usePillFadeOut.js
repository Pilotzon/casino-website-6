import { useEffect } from "react";

/* The pills row used to hide its left edge behind a static gradient mask
   (Crash) / mask-image on the shared row. Now the OUTGOING pill fades
   ITSELF: as a pill's right edge enters the left fade zone of the scroller,
   that pill's own opacity steps down and reaches zero exactly when it has
   scrolled out. Every other pill stays fully opaque and the gaps between
   pills are never touched (they are a fixed `gap`, independent of width).

   `scrollRef` — the horizontal scroller wrapping the pills row
   (`historyScroll` in every pills game).
   `trigger`  — anything that changes the row (the newest pill's slide key),
   so the fade re-arms on every addition and tracks the row's arrival slide
   frame by frame. */
const FADE_ZONE_PX = 28;
const SLIDE_TRACK_MS = 420;

export default function usePillFadeOut(scrollRef, trigger) {
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || typeof window === "undefined" || !window.requestAnimationFrame) return undefined;

    let raf = 0;
    let trackUntil = 0;

    const apply = () => {
      raf = 0;
      const base = el.getBoundingClientRect();
      // no layout (jsdom / hidden): leave every pill untouched
      if (!base.width) return;
      const row = el.firstElementChild;
      if (!row) return;
      for (const pill of row.children) {
        const right = pill.getBoundingClientRect().right - base.left;
        if (right >= FADE_ZONE_PX) {
          if (pill.style.opacity !== "") pill.style.opacity = "";
        } else {
          pill.style.opacity = String(Math.max(0, Math.min(1, right / FADE_ZONE_PX)));
        }
      }
      if (performance.now() < trackUntil) raf = requestAnimationFrame(apply);
    };

    const kick = (ms = SLIDE_TRACK_MS) => {
      trackUntil = performance.now() + ms;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onChange = () => kick(0);
    kick();
    el.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [trigger]);
}

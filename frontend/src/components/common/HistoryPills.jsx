import { useEffect, useRef } from "react";
import { IconArticle } from "./Icons";
import usePillFadeOut from "../../hooks/usePillFadeOut";
import usePillSlide from "../../hooks/usePillSlide";

/**
 * Shared round-history row used by Crash, Dice, Limbo, and Wheel. Newest-first
 * ordering, arrival slide, outgoing-pill fade, placeholder footprint, mobile
 * scrolling, and the optional "My bets / You" meta slot all live here.
 */
export default function HistoryPills({
  items = [],
  getKey = (item, index) => item?.id ?? item?._pillId ?? index,
  getValue = (item) => item?.value ?? item?.multiplier ?? "",
  getTone = (item) => item?.won ? "win" : "loss",
  placeholder = "0.00×",
  showMeta = true,
  metaLabel = "‹ You",
  metaTitle = "My bets",
  onMetaClick,
  placement = "flow",
  ariaLabel = "Recent rounds",
}) {
  const scrollRef = useRef(null);
  const newestKey = items.length ? getKey(items[0], 0) : null;
  const { pillsRef, slideKey, slideFrom } = usePillSlide(newestKey);
  usePillFadeOut(scrollRef, slideKey);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const newest = scroller.firstElementChild?.firstElementChild;
    if (newest && typeof newest.scrollIntoView === "function") {
      newest.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [newestKey]);

  return (
    <div
      className={`ui-history-row${placement === "overlay" ? " ui-history-row--overlay" : ""}`}
      aria-label={ariaLabel}
    >
      <div className="ui-history-scroll" ref={scrollRef}>
        <div
          key={slideKey}
          ref={pillsRef}
          className="ui-history-pills"
          style={slideFrom ? { "--pill-slide-from": `${slideFrom}px` } : undefined}
        >
          {items.length === 0 ? (
            <span className="ui-hist-pill ui-hist-gray ui-hist-placeholder">{placeholder}</span>
          ) : (
            items.map((item, index) => {
              const tone = getTone(item, index);
              return (
                <span
                  key={getKey(item, index)}
                  className={`ui-hist-pill ${tone === "win" ? "ui-hist-green" : "ui-hist-gray"}`}
                >
                  {getValue(item, index)}
                </span>
              );
            })
          )}
        </div>
      </div>
      {showMeta ? (
        <div className="ui-history-meta">
          <button className="ui-history-icon" type="button" aria-label={metaTitle} onClick={onMetaClick}>
            <IconArticle size={18} />
          </button>
          <span className="ui-history-you">{metaLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

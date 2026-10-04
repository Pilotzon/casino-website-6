import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import GameWinPopup from "../common/GameWinPopup";
import { BetAmountField, SidebarSelectField, SidebarModeToggle, SidebarBetButton } from "../common/SidebarControls";
import HoverStatField from "../common/HoverStatField";
import HistoryPills from "../common/HistoryPills";
import useActiveBetFlag from "../../hooks/useActiveBetFlag";
import useGameDisabled from "../../hooks/useGameDisabled";
import BetLockBadge from "../common/BetLockBadge";
import DisabledGameStage from "./DisabledGameStage";
import { gamesAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import styles from "./wheel.module.css";
import Modal from "../common/Modal";
import CurrencyIcon from "../common/CurrencyIcon";
import { IconChartPieSlice } from "../common/Icons";

const RISK_LEVELS = ["low", "medium", "high"];
const SEGMENT_OPTIONS = [10, 20, 30, 40, 50];

function titleCase(s) {
  return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
}
function formatMoney(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}
function isMobileNow() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
}

/* Fast ease-out: launches hard, then a long lazy settle. */
const SPIN_BEZIER = [0.1, 0.8, 0.08, 1];

export default function Wheel({ gameRow, soundEnabled, soundVolume }) {
  const { updateBalance } = useAuth();
  const toast = useToast();

  const [betAmount, setBetAmount] = useState("");
  const [betError, setBetError] = useState("");
  const { isDisabled, isMobileDisabled, isLocked, disabledTitle, disabledDesc, betErrorMessage } = useGameDisabled(gameRow);
  const [betLockedError, setBetLockedError] = useState("");
  useEffect(() => {
    if (isLocked && String(betAmount).trim() !== "") setBetLockedError(betErrorMessage);
    else setBetLockedError("");
  }, [betAmount, isLocked, betErrorMessage]);
  const [riskLevel, setRiskLevel] = useState("medium");
  const [segments, setSegments] = useState(10);

  const [loadingLayout, setLoadingLayout] = useState(false);
  const [wheelLayout, setWheelLayout] = useState([]);
  const [layoutRetry, setLayoutRetry] = useState(0);

  const [spinning, setSpinning] = useState(false);
  // Round history for the top pills (newest first, capped)
  const [history, setHistory] = useState([]);
  // Stable pill ids: the slide keys on the newest pill's IDENTITY (the row
  // is capped, so its length stops changing while new pills keep arriving)
  const pillSeqRef = useRef(0);

  const [rotation, setRotation] = useState(0);

  // The pointer is fully static — no rotation or bounce animation.
  const [hoverIdx, setHoverIdx] = useState(null);
  const [hoverMultiplier, setHoverMultiplier] = useState(null);

  const [cellModalOpen, setCellModalOpen] = useState(false);
  const [cellModalMultiplier, setCellModalMultiplier] = useState(null);

  const [showWinPopup, setShowWinPopup] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [winMult, setWinMult] = useState(0);

  const animRef = useRef(0);
  const spinDurationRef = useRef(5000);
  const bet = useMemo(() => parseFloat(betAmount) || 0, [betAmount]);
  const layoutReady = Array.isArray(wheelLayout) && wheelLayout.length === Number(segments);
  const isMobile = isMobileNow();

  useEffect(() => {
    if (betError && bet > 0) setBetError("");
  }, [bet, betError]);

  const adjustBet = (factor) => {
    const curr = parseFloat(betAmount);
    const next = (Number.isFinite(curr) ? curr : 0) * factor;
    setBetAmount(next.toFixed(2));
  };

  const retryLayout = () => {
    setLayoutRetry((retry) => retry + 1);
    toast.error("Retrying wheel layout connection.");
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingLayout(true);
      setWheelLayout([]);
      try {
        const res = await gamesAPI.getWheelLayout({ riskLevel, segments });
        const payloadWheel = res.data?.wheel ?? res.data?.result?.wheel;
        const w = payloadWheel || res.data?.data?.wheel || res.data?.layout?.wheel;
        if (!Array.isArray(w) || w.length !== Number(segments)) {
          throw new Error("Bad wheel layout response");
        }
        if (!cancelled) setWheelLayout(w);
      } catch (e) {
        if (!cancelled) {
          const message = e.response?.data?.message || e.message || "Failed to load wheel layout";
          const isNetworkError = !e.response && (e.code || /network|fetch|timeout|connection/i.test(message));
          toast.error(isNetworkError ? "Connection failed. Please try again." : message);
        }
      } finally {
        if (!cancelled) setLoadingLayout(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [riskLevel, segments, layoutRetry, toast]);

  const cells = useMemo(() => {
    const map = new Map();
    for (const seg of wheelLayout) {
      const m = Number(seg?.multiplier);
      if (!Number.isFinite(m)) continue;
      const key = m.toFixed(8);
      if (!map.has(key)) map.set(key, { multiplier: m, color: seg?.color || "#406C82", weight: 0 });
      map.get(key).weight += 1;
    }
    const arr = [...map.values()].sort((a, b) => a.multiplier - b.multiplier);
    return arr.slice(0, 6);
  }, [wheelLayout]);

  const infoForMultiplier = useCallback(
    (mult) => {
      if (mult == null) return null;
      const cell = cells.find((c) => c.multiplier === mult);
      if (!cell) return null;
      const chanceNum = Number(cell.weight) || 0;
      const chanceDen = Number(segments) || 1;
      const payout = bet * cell.multiplier;
      const profit = payout - bet;
      return { multiplier: cell.multiplier, profit, chanceNum, chanceDen, color: cell.color };
    },
    [cells, segments, bet]
  );

  const activeMultiplier = useMemo(() => {
    if (isMobile) return cellModalOpen ? cellModalMultiplier : null;
    return hoverMultiplier;
  }, [isMobile, cellModalOpen, cellModalMultiplier, hoverMultiplier]);

  const activeInfo = useMemo(() => infoForMultiplier(activeMultiplier), [infoForMultiplier, activeMultiplier]);

  const activeIdx = useMemo(() => {
    if (!activeMultiplier) return null;
    return cells.findIndex((c) => c.multiplier === activeMultiplier);
  }, [cells, activeMultiplier]);

  const arrowLeftPercent = useMemo(() => {
    if (activeIdx == null || cells.length === 0) return 50;
    const cols = cells.length;
    const idx = Math.max(0, Math.min(cols - 1, activeIdx));
    return ((idx + 0.5) / cols) * 100;
  }, [activeIdx, cells.length]);

  useEffect(() => {
    setHoverIdx(null);
    setHoverMultiplier(null);
    setCellModalOpen(false);
    setCellModalMultiplier(null);
    setShowWinPopup(false);
    setWinAmount(0);
    setWinMult(0);
    setHistory([]);
  }, [riskLevel, segments]);

  const handleSpin = useCallback(async () => {
    const b = parseFloat(betAmount);
    if (!b || b <= 0) {
      setBetError("Enter a valid bet amount");
      return;
    }
    if (!layoutReady) {
      setLayoutRetry((retry) => retry + 1);
      toast.error("Wheel layout is unavailable. Retrying now.");
      return;
    }

    setBetError("");
    setSpinning(true);
    setShowWinPopup(false);
    setWinAmount(0);
    setWinMult(0);

    const my = ++animRef.current;

    try {
      const res = await gamesAPI.playWheel({ betAmount: b, riskLevel, segments });
      const data = res.data?.result;

      const len = Number(segments);
      const segAngle = 360 / len;
      const landedIndex = data.landedIndex;

      // Center of the landed segment
      const centerOfSegment = landedIndex * segAngle + segAngle / 2;
      const targetRotMod360 = ((360 - centerOfSegment) % 360 + 360) % 360;

      const fullSpins = 8;
      const fromRot = rotation;
      const durationMs = 2800 + Math.random() * 900;
      spinDurationRef.current = durationMs;

      // Add some jitter so it doesn't always land perfectly centered
      const maxJitter = segAngle * 0.35;
      const jitter = (Math.random() * 2 - 1) * maxJitter;

      // Calculate final rotation
      const currentMod = ((fromRot % 360) + 360) % 360;
      let delta = targetRotMod360 + jitter - currentMod;
      while (delta < 0) delta += 360;
      delta += fullSpins * 360;
      const toRot = fromRot + delta;

      // Set the rotation - wheel will animate via CSS transition
      setRotation(toRot);

      // After spin completes, show result
      setTimeout(() => {
        if (animRef.current !== my) return;
        setSpinning(false);

        if (data?.balance != null) updateBalance(data.balance);

        const won = Number(data?.payout || 0) > 0;
        setHistory((prev) => [{ multiplier: data?.multiplier, won, _pillId: ++pillSeqRef.current }, ...prev].slice(0, 10));

        if (won) {
          setWinAmount(Number(data.payout || 0));
          setWinMult(Number(data.multiplier || 0));
          setShowWinPopup(true);
          setTimeout(() => {
            if (animRef.current === my) setShowWinPopup(false);
          }, 1400);
        }
      }, durationMs + 400);

    } catch (err) {
      const message = err.response?.data?.message || err.message || "Spin failed";
      const isNetworkError = !err.response && (err.code || /network|fetch|timeout|connection/i.test(message));
      toast.error(isNetworkError ? "Connection failed. Please try again." : message);
      setSpinning(false);
    }
  }, [betAmount, layoutReady, riskLevel, segments, wheelLayout, rotation, updateBalance, toast]);
  // Warn before a page refresh while a bet is live (see RefreshGuard).
  useActiveBetFlag("wheel", spinning);


  const onCellEnterDesktop = (c, idx) => {
    if (isMobile) return;
    setHoverIdx(idx);
    setHoverMultiplier(c.multiplier);
  };
  const onCellLeaveDesktop = () => {
    if (isMobile) return;
    setHoverIdx(null);
    setHoverMultiplier(null);
  };
  const onCellClick = (c) => {
    if (!isMobile) return;
    setCellModalMultiplier(c.multiplier);
    setCellModalOpen(true);
  };

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <SidebarModeToggle />

        <BetAmountField
          label="Bet Amount"
          meta="$0.00"
          value={betAmount}
          onChange={(e) => { const val = e.target.value; if (/^\d*\.?\d*$/.test(val)) setBetAmount(val); }}
          onHalf={() => adjustBet(0.5)}
          onDouble={() => adjustBet(2)}
          type="text"
          inputMode="decimal"
          disabled={spinning}
          quickAdjustDisabled={isLocked || spinning}
          onBlur={() => { const num = parseFloat(betAmount); setBetAmount(Number.isFinite(num) ? num.toFixed(2) : ""); }}
          errors={[betLockedError, betError]}
        />

        <SidebarSelectField
          label="Difficulty"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          disabled={spinning}
          options={RISK_LEVELS.map((r) => ({ value: r, label: titleCase(r) }))}
        />

        <SidebarSelectField
          label="Segments"
          value={segments}
          onChange={(e) => setSegments(Number(e.target.value))}
          disabled={spinning}
          options={SEGMENT_OPTIONS.map((s) => ({ value: s, label: s }))}
        />

        <span className="ui-bet-wrap">
          <SidebarBetButton
            onClick={layoutReady ? handleSpin : retryLayout}
            data-bet-sound="true"
            disabled={isLocked || spinning || loadingLayout || (layoutReady && bet <= 0)}
            title={isLocked ? betErrorMessage : undefined}
            type="button"
          >
            {loadingLayout ? "Loading..." : !layoutReady ? "Retry Layout" : spinning ? "Spinning..." : "Bet"}
          </SidebarBetButton>
          <BetLockBadge locked={isLocked} title={disabledTitle} description={disabledDesc} />
        </span>
      </div>

      <div className={styles.gameStage}>
        {isLocked ? (
          <DisabledGameStage title={disabledTitle} message={disabledDesc} mobile={isMobileDisabled} />
        ) : (
          <>
        {/* Win popup — direct child of the stage so it is always dead
            centred over the whole game area as a true overlay. */}
        {showWinPopup && winAmount > 0 && (
          <GameWinPopup multiplier={winMult || 0} amountText={formatMoney(winAmount)} />
        )}

        <div className={styles.boardWrap}>
          {/* Always rendered: an invisible placeholder pill reserves the
              row's space until the first real pill swaps in — the row never
              grows, so content below never jumps. Newest-first, exactly like
              Crash (row-reverse puts the first pill at the right). */}
          <HistoryPills
          items={history}
          getValue={(h) => `${Number(h.multiplier).toFixed(2)}×`}
          placeholder="0.00×"
        />

          <div className={styles.wheelStage}>

            {/* .wheelBox is a strict 1:1 square sized from the smaller of the
                stage's width/height; the pointer is anchored to it (not to the
                viewport) and the wheel itself fills it, so it can never be
                stretched into an oval regardless of the panel's proportions. */}
            <div className={`${styles.wheelBox} ${spinning ? styles.spinning : ""}`}>
              <div className={styles.pointerWrap} aria-hidden="true">
                <div className={styles.pointerPin}>
                  <div className={styles.pointerPinInner} />
                </div>
                <div className={styles.pointerDrop} />
              </div>

              <div
                className={styles.wheelOuter}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning
                    ? `transform ${spinDurationRef.current / 1000}s cubic-bezier(${SPIN_BEZIER.join(", ")})`
                    : "none",
                }}
              >
                <div className={styles.rim} />
                <div className={styles.ring}>
                  {(wheelLayout.length ? wheelLayout : Array.from({ length: segments })).map((seg, i) => {
                    const segAngle = 360 / Number(segments);
                    const angle = i * segAngle;
                    const skew = 90 - segAngle;
                    return (
                      <div
                        key={i}
                        className={styles.segment}
                        style={{
                          transform: `rotate(${angle}deg) skewY(-${skew}deg)`,
                          backgroundColor: seg?.color || "#406C82",
                        }}
                      />
                    );
                  })}
                </div>
                <div className={styles.innerPlate}>
                  <div className={styles.innerCircle} />
                </div>
              </div>
            </div>
          </div>

          {!isMobile && (
            <div className={`${styles.hoverPanel} ${activeInfo ? styles.hoverPanelVisible : ""}`}>
              <div className={styles.hoverBoxes}>
                <HoverStatField
                  label="Multiplier"
                  value={(activeInfo ? activeInfo.multiplier : 0).toFixed(2)}
                  suffix="×"
                />
                <HoverStatField
                  label="Profit on Win"
                  value={formatMoney(activeInfo ? activeInfo.profit : 0)}
                  suffix={<CurrencyIcon />}
                />
                <HoverStatField
                  label="Chance"
                  value={activeInfo ? `${activeInfo.chanceNum}/${activeInfo.chanceDen}` : `0/${segments}`}
                />
              </div>
              <div className={styles.hoverArrow} style={{ left: `${arrowLeftPercent}%` }} aria-hidden="true" />
            </div>
          )}

          <div className={styles.multStrip} style={{ gridTemplateColumns: `repeat(${Math.max(1, cells.length)}, 1fr)` }}>
            {cells.map((c, idx) => {
              const isActive =
                (!isMobile && hoverMultiplier === c.multiplier) ||
                (isMobile && cellModalOpen && cellModalMultiplier === c.multiplier);

              return (
                <button
                  key={String(c.multiplier)}
                  type="button"
                  className={styles.multCardBtn}
                  onMouseEnter={() => onCellEnterDesktop(c, idx)}
                  onMouseLeave={onCellLeaveDesktop}
                  onClick={() => onCellClick(c)}
                >
                  <div className={`${styles.multCard} ${isActive ? styles.multCardActive : ""}`}>
                    <div className={styles.multValue}>{Number(c.multiplier).toFixed(2)}×</div>
                    <div className={styles.multFill} style={{ background: c.color }} />
                    <div className={styles.multBar} style={{ background: c.color }} />
                  </div>
                </button>
              );
            })}
          </div>

          <Modal
            isOpen={isMobile && cellModalOpen && !!activeInfo}
            onClose={() => {
              setCellModalOpen(false);
              setCellModalMultiplier(null);
            }}
            title="Multiplier"
            icon={<IconChartPieSlice />}
            description="This segment's payout for your bet."
          >
            {activeInfo && (
              <>
                <div className={styles.modalNumber}>{activeInfo.multiplier.toFixed(2)}×</div>
                <div className={styles.modalGrid}>
                  <div className={styles.modalItem}>
                    <div className={styles.modalItemLabel}>Chance</div>
                    <div className={styles.modalItemValue}>{activeInfo.chanceNum}/{activeInfo.chanceDen}</div>
                  </div>
                  <div className={styles.modalItem}>
                    <div className={styles.modalItemLabel}>Profit on Win</div>
                    <div className={styles.modalItemValue}>${formatMoney(activeInfo.profit)}</div>
                  </div>
                </div>

                <button
                  className={styles.modalBtnPrimary}
                  onClick={() => {
                    setCellModalOpen(false);
                    setCellModalMultiplier(null);
                  }}
                  type="button"
                >
                  Close
                </button>
              </>
            )}
          </Modal>

        </div>
          </>
        )}
      </div>
    </div>
  );
}
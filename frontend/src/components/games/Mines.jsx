import { useEffect, useMemo, useRef, useState } from "react";
import GameWinPopup from "../common/GameWinPopup";
import { BetAmountField, SidebarReadOnlyField, SidebarSelectField, SidebarModeToggle, SidebarBetButton } from "../common/SidebarControls";
import useActiveBetFlag from "../../hooks/useActiveBetFlag";
import useGameDisabled from "../../hooks/useGameDisabled";
import BetLockBadge from "../common/BetLockBadge";
import DisabledGameStage from "./DisabledGameStage";
import BetError from "../common/BetError";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { gamesAPI } from "../../services/api";
import styles from "./mines.module.css";

import gemImg from "../../assets/mines/gem.png";
import mineImg from "../../assets/mines/mine.png";

import useGameAudio from "../../hooks/useGameAudio";

// ✅ Mines sounds
import gem1Mp3 from "../../assets/mines/Gem.mp3";
import gem2Mp3 from "../../assets/mines/Gem-2.mp3";
import gem3Mp3 from "../../assets/mines/Gem-3.mp3";
import mineMp3 from "../../assets/mines/Mine.mp3";

const GRID_SIZE = 5;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
// Full click animation: 450ms cover flight + the icon zoom (starts 392ms
// in, runs 300ms) — the rest of the board reveals only after this.
const CLICK_ANIM_MS = 700;
// Post-round darkening: the auto-revealed tiles keep full opacity for one
// second after the round ends, then FADE into the dimmed state (0.3s).
const POST_ROUND_DIM_MS = 1000;
// Gem/mine stings wait for the icon's zoom-in to begin — this MUST match
// the animation-delay on .icon in mines.module.css (392ms).
const ICON_REVEAL_DELAY_MS = 392;

const format8 = (n) => Number(n || 0).toFixed(2); // 2 decimals everywhere

function Mines({ gameRow, soundEnabled = true, soundVolume = 0.8 }) {
  const { user, isAuthenticated, updateBalance, openLoginModal } = useAuth();
  const toast = useToast();

  const sfx = useGameAudio(
    {
      gem1: gem1Mp3,
      gem2: gem2Mp3,
      gem3: gem3Mp3,
      mine: mineMp3,
    },
    { enabled: soundEnabled, volume: soundVolume }
  );

  const [betAmount, setBetAmount] = useState("");
  const { isDisabled, isMobileDisabled, isLocked, disabledTitle, disabledDesc, betErrorMessage } = useGameDisabled(gameRow);
  const [betLockedError, setBetLockedError] = useState("");
  useEffect(() => {
    if (isLocked && String(betAmount).trim() !== "") setBetLockedError(betErrorMessage);
    else setBetLockedError("");
  }, [betAmount, isLocked, betErrorMessage]);

  const [betError, setBetError] = useState(null);

  // inline bet errors clear themselves as soon as they are resolved

  useEffect(() => {

    setBetError((cur) => {

      if (!cur) return cur;

      if (cur === "Log in to place a bet") return isAuthenticated ? null : cur;

      const amt = parseFloat(betAmount) || 0;

      return amt > 0 && amt <= (user?.balance ?? 0) ? null : cur;

    });

  }, [betAmount, isAuthenticated, user?.balance]);
  const [mineCount, setMineCount] = useState(3);

  const [roundId, setRoundId] = useState(null);
  const [inProgress, setInProgress] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [cells, setCells] = useState(() => Array.from({ length: CELL_COUNT }, () => "hidden"));
  const [revealedCells, setRevealedCells] = useState([]);
  const [minePositions, setMinePositions] = useState(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);

  const [clickedCell, setClickedCell] = useState(null);
  const animRef = useRef(0);
  // Sound generation: bumped ONLY on reset (never per click), so every
  // click's sting survives rapid clicking — stings stack/overlap instead
  // of cancelling each other, and only a new round voids pending ones.
  const soundGenRef = useRef(0);

  // ✅ track whether round ended by loss (hit mine)
  const [didLose, setDidLose] = useState(false);
  // tile the player clicked when the mine hit (stays full opacity)
  const [lossMineIdx, setLossMineIdx] = useState(null);

  // post-round darkening: auto-revealed tiles stay bright for 1s after the
  // round ends, then fade to the dimmed state (a new round voids the timer)
  const [postRoundDim, setPostRoundDim] = useState(false);
  const postRoundTokenRef = useRef(0);

  // ✅ Win popup (Limbo-like) for cashout
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [lastCashoutPayout, setLastCashoutPayout] = useState(0);
  const [lastCashoutMult, setLastCashoutMult] = useState(1);

  /**
   * ✅ Gem streak + Gem-3 rule
   * - streak 1 => Gem
   * - streak 2 => Gem-2
   * - streak 3 => Gem-3, then for ONLY the next 2 gems => Gem-3
   * After those 2 gems are consumed, return to normal logic (still streaking).
   *
   * Important: while consuming those 2 extra Gem-3 clicks, we must NOT re-arm the buff.
   */
  const gemStreakRef = useRef(0);
  const gem3BuffRemainingRef = useRef(0); // 0..2
  const gem3BuffLockRef = useRef(false); // true while consuming the 2 post-3rd Gem-3s

  const ended = minePositions != null;

  const gemsFound = revealedCells.length;
  const gemsLeft = CELL_COUNT - mineCount - gemsFound;

  const bet = useMemo(() => parseFloat(betAmount) || 0, [betAmount]);
  const profit = useMemo(() => bet * currentMultiplier - bet, [bet, currentMultiplier]);

  const canReveal = inProgress && !isBusy && !ended;
  const canCashout = inProgress && !isBusy && !ended && gemsFound > 0;

  const resetGemSoundState = () => {
    gemStreakRef.current = 0;
    gem3BuffRemainingRef.current = 0;
    gem3BuffLockRef.current = false;
  };

  const reset = () => {
    animRef.current += 1;
    soundGenRef.current += 1;
    postRoundTokenRef.current += 1;
    setPostRoundDim(false);
    setCells(Array.from({ length: CELL_COUNT }, () => "hidden"));
    setRevealedCells([]);
    setMinePositions(null);
    setCurrentMultiplier(1.0);
    setRoundId(null);
    setInProgress(false);
    setClickedCell(null);
    setDidLose(false);
    setLossMineIdx(null);

    setShowWinPopup(false);
    setLastCashoutPayout(0);
    setLastCashoutMult(1);

    resetGemSoundState();
  };

  // Darken the auto-revealed tiles starting exactly one second after the
  // round ends (loss OR cashout) — a brief fade, never an instant dim. The
  // tiles the player pressed are never dimmed (see `dimmed` in the render).
  const armPostRoundDim = () => {
    const myToken = ++postRoundTokenRef.current;
    setTimeout(() => {
      if (postRoundTokenRef.current === myToken) setPostRoundDim(true);
    }, POST_ROUND_DIM_MS);
  };

  const adjustBet = (factor) => {
    const curr = parseFloat(betAmount) || 0;
    setBetAmount((curr * factor).toFixed(2));
  };

  const start = async () => {
    if (!isAuthenticated) { setBetError("Log in to place a bet"); return; }
    if (isBusy) return;

    if (!Number.isFinite(bet) || bet <= 0) { setBetError("Invalid bet amount"); return; }
    if (bet > user.balance) { setBetError("Insufficient balance"); return; }

    setIsBusy(true);
    try {
      reset();
      const res = await gamesAPI.startMines({ betAmount: bet, mineCount, gridSize: GRID_SIZE });
      const gs = res.data.gameState;

      setRoundId(gs.roundId);
      setInProgress(true);
      setCurrentMultiplier(Number(gs.currentMultiplier) || 1.0);
      setRevealedCells(gs.revealedCells || []);
      setDidLose(false);

      if (typeof gs.balanceAfterBet === "number") updateBalance(gs.balanceAfterBet);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to start");
      reset();
    } finally {
      setIsBusy(false);
    }
  };

  // Resolves WHICH gem sting this reveal earns (streak/buff bookkeeping
  // stays synchronous so rapid clicks keep their order) — the caller
  // plays the returned key once the icon's zoom-in actually begins.
  const pickGemSound = () => {
    // Increment streak on every gem
    const streak = gemStreakRef.current + 1;
    gemStreakRef.current = streak;

    // If we're in the "ONLY next 2 gems" phase after a 3rd gem,
    // we must play Gem-3 and consume the buff, without re-arming.
    if (gem3BuffLockRef.current && gem3BuffRemainingRef.current > 0) {
      gem3BuffRemainingRef.current -= 1;

      if (gem3BuffRemainingRef.current <= 0) {
        // buff consumption finished; unlock (normal logic resumes for future gems)
        gem3BuffLockRef.current = false;
      }
      return "gem3";
    }

    // Normal mapping for streak counts
    if (streak === 1) {
      return "gem1";
    }
    if (streak === 2) {
      return "gem2";
    }

    // streak >= 3:
    // On exactly the 3rd gem in a row: play Gem-3 and start the "next 2 gems" lock/buff.
    if (streak === 3) {
      gem3BuffRemainingRef.current = 2;
      gem3BuffLockRef.current = true;
      return "gem3";
    }

    // For streak 4+ when NOT in the locked buff window:
    // You didn't specify additional sounds, so default back to Gem.
    return "gem1";
  };

  const reveal = async (idx) => {
    if (!canReveal) return;
    if (cells[idx] !== "hidden") return;
    if (!roundId) return;

    setIsBusy(true);
    setClickedCell(idx);
    const myAnim = ++animRef.current;
    // sounds key on the round generation, NOT the click animation: rapid
    // clicks each keep their own sting (they stack/overlap via cloned
    // audio nodes) instead of cancelling each other out
    const mySound = soundGenRef.current;

    try {
      const res = await gamesAPI.revealMinesCell({ roundId, cellIndex: idx });
      const data = res.data;

      // click returns to place then icon pops
      await new Promise((r) => setTimeout(r, 90));
      if (animRef.current !== myAnim) return;

      if (data.hitMine) {
        // reset streak/buff on mine
        resetGemSoundState();
        // the round is over NOW — the auto-revealed tiles darken only
        // starting one second from this moment (see armPostRoundDim)
        armPostRoundDim();

        // A mine hit reveals the ENTIRE board — but sequenced: the clicked
        // tile plays its own click animation first, and only once it has
        // fully finished do the other tiles reveal (auto-revealed tiles
        // render dimmed; the fatal tile stays full opacity).
        const mineSet = new Set(Array.isArray(data.minePositions) ? data.minePositions : [idx]);
        setLossMineIdx(idx);
        setCells((prev) => {
          const next = [...prev];
          next[idx] = "mine";
          return next;
        });

        // the mine sting starts when the icon's zoom-in begins, not on click
        setTimeout(() => {
          if (soundGenRef.current === mySound) sfx.play("mine", { volume: 1 });
        }, ICON_REVEAL_DELAY_MS);

        await new Promise((r) => setTimeout(r, CLICK_ANIM_MS));
        if (animRef.current !== myAnim) return;

        setCells((prev) => {
          const next = [...prev];
          for (let i = 0; i < CELL_COUNT; i++) {
            if (next[i] === "hidden") next[i] = mineSet.has(i) ? "mine" : "gem";
          }
          return next;
        });

        if (Array.isArray(data.minePositions)) {
          setMinePositions(data.minePositions);
        } else {
          setMinePositions([]);
        }

        setInProgress(false);
        setDidLose(true);
        return;
      }

      // ✅ confirmed gem -> resolve the correct gem sound, then play it
      // only once the icon's zoom-in actually begins (not on click)
      const gemKey = pickGemSound();

      setCells((prev) => {
        const next = [...prev];
        next[idx] = "gem";
        return next;
      });

      setTimeout(() => {
        if (soundGenRef.current === mySound) sfx.play(gemKey, { volume: 1 });
      }, ICON_REVEAL_DELAY_MS);

      setRevealedCells(data.revealedCells || []);
      setCurrentMultiplier(Number(data.currentMultiplier) || 1.0);
    } catch (e) {
      toast.error(e.response?.data?.message || "Reveal failed");
    } finally {
      setIsBusy(false);
      setTimeout(() => {
        if (animRef.current === myAnim) setClickedCell(null);
      }, 220);
    }
  };

  const cashout = async () => {
    if (!canCashout) return;
    if (!roundId) return;

    setIsBusy(true);
    try {
      const res = await gamesAPI.cashoutMines({ roundId });
      const data = res.data;

      // Cashout reveals the ENTIRE board, same as a mine hit: every mine
      // plus every unpressed gem, all at once.
      const cashoutMineSet = new Set(Array.isArray(data.minePositions) ? data.minePositions : []);
      setMinePositions(data.minePositions || []);
      setCells((prev) => {
        const next = [...prev];
        for (let i = 0; i < CELL_COUNT; i++) {
          if (next[i] === "hidden") next[i] = cashoutMineSet.has(i) ? "mine" : "gem";
        }
        return next;
      });

      setCurrentMultiplier(Number(data.multiplier) || currentMultiplier);
      setInProgress(false);
      setDidLose(false);
      // the round is over NOW — the auto-revealed tiles darken only
      // starting one second from this moment (see armPostRoundDim)
      armPostRoundDim();

      // ✅ show win popup for cashout
      const payout = Number(data.payout || 0);
      setLastCashoutPayout(payout);
      setLastCashoutMult(Number(data.multiplier) || currentMultiplier);
      setShowWinPopup(true);

      // streak ends on cashout
      resetGemSoundState();

      if (typeof data.balance === "number") updateBalance(data.balance);

    } catch (e) {
      toast.error(e.response?.data?.message || "Cashout failed");
    } finally {
      setIsBusy(false);
    }
  };

  const randomPick = async () => {
    if (!canReveal) return;
    const hidden = [];
    for (let i = 0; i < CELL_COUNT; i++) if (cells[i] === "hidden") hidden.push(i);
    if (!hidden.length) return;
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    await reveal(pick);
  };
  // Warn before a page refresh while a bet is live (see RefreshGuard).
  useActiveBetFlag("mines", inProgress);


  const mainLabel = !inProgress ? "Bet" : "Cashout";
  const mainDisabled = isLocked || isBusy || (inProgress && !canCashout);

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <SidebarModeToggle />

        <BetAmountField
          label="Bet Amount"
          meta="$0.00"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          onHalf={() => adjustBet(0.5)}
          onDouble={() => adjustBet(2)}
          disabled={isBusy || inProgress}
          quickAdjustDisabled={isLocked || isBusy || inProgress}
          errors={[betLockedError, betError]}
        />

        <SidebarSelectField
          label="Mines"
          value={mineCount}
          onChange={(e) => setMineCount(parseInt(e.target.value, 10))}
          disabled={isBusy || inProgress}
          options={Array.from({ length: 24 }, (_, i) => ({ value: i + 1, label: i + 1 }))}
        />

        <SidebarReadOnlyField
          label="Gems"
          value={String(gemsLeft)}
        />

        <span className="ui-bet-wrap">
          <SidebarBetButton
            onClick={() => (inProgress ? cashout() : start())}
            disabled={mainDisabled} title={isLocked ? betErrorMessage : undefined} data-bet-sound="true"
            type="button"
            >
          {mainLabel}
          </SidebarBetButton>
          <BetLockBadge locked={isLocked} title={disabledTitle} description={disabledDesc} />
        </span>

        <SidebarBetButton variant="secondary" disabled={!canReveal} onClick={randomPick}>
          Random Pick
        </SidebarBetButton>

        <SidebarReadOnlyField
          label={`Total Profit (${currentMultiplier.toFixed(2)}×)`}
          meta="$0.00"
          value={format8(profit)}
          currency
          groupStyle={{ marginTop: "0" }}
        />
      </div>

      <div className={styles.gameStage}>
        {isLocked ? (
          <DisabledGameStage title={disabledTitle} message={disabledDesc} mobile={isMobileDisabled} />
        ) : (
          <>
        {/* ✅ Win popup (Limbo-like) */}
        {showWinPopup && !didLose && lastCashoutPayout > 0 && (
          <GameWinPopup multiplier={lastCashoutMult || 0} amountText={format8(lastCashoutPayout)} />
        )}

        <div className={styles.grid}>
          {Array.from({ length: CELL_COUNT }, (_, i) => {
            const st = cells[i];
            const isRevealed = st === "gem" || st === "mine";
            // Tiles the player pressed (gems + the fatal mine) stay full
            // opacity; everything auto-revealed at round end (loss OR
            // cashout) darkens to 0.7 — but only from ONE SECOND after the
            // round ends, fading in (postRoundDim + the .tile opacity
            // transition). On a mine hit the rest reveal only after the
            // clicked tile's animation fully finishes.
            const userPressed = revealedCells.includes(i) || i === lossMineIdx;
            const dimmed = ended && postRoundDim && isRevealed && !userPressed;

            return (
              <button
                key={i}
                type="button"
                className={`${styles.tile} ${isRevealed ? styles.tileRevealed : ""} ${dimmed ? styles.tileDimmed : ""}`}
                onClick={() => reveal(i)}
                disabled={!canReveal || isRevealed}
              >
                <span className={styles.cover} aria-hidden="true" />
                {st === "gem" && (
                  <img className={styles.icon} src={gemImg} alt="" />
                )}
                {st === "mine" && (
                  <img className={styles.icon} src={mineImg} alt="" />
                )}
              </button>
            );
          })}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Mines;
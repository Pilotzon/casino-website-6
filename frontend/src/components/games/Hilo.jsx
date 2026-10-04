import { useEffect, useState } from "react";
import { BetAmountField, SidebarReadOnlyField, SidebarModeToggle, SidebarBetButton } from "../common/SidebarControls";
import useGameDisabled from "../../hooks/useGameDisabled";
import BetLockBadge from "../common/BetLockBadge";
import DisabledGameStage from "./DisabledGameStage";
import BetError from "../common/BetError";
import CurrencyIcon from "../common/CurrencyIcon";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import styles from "./hilo.module.css";

/* ============================================================================
 * Hilo — SCAFFOLDING SHELL (no gameplay yet).
 *
 * Registered in the system (backend seed + routes, lobby card, /games/hilo)
 * and rendered with the STANDARD betting panel every other game uses — same
 * sidebar, same controls, same disabled-by-admin behaviour — plus an
 * info/placeholder stage.
 *
 * There is deliberately NO engine behind it: pressing Bet never calls the API
 * (the route answers 501 — see backend/src/routes/games.js), never touches the
 * balance and never starts a round. It just tells the player the game is
 * coming soon. When the real game lands, replace the stage and the click
 * handler; the shell around them already matches the rest of the lobby.
 * ==========================================================================*/
export default function Hilo({ gameRow, soundEnabled = true }) {
  const { user, isAuthenticated, openLoginModal } = useAuth();
  const toast = useToast();
  const { isMobileDisabled, isLocked, disabledTitle, disabledDesc, betErrorMessage } = useGameDisabled(gameRow);

  const [betAmount, setBetAmount] = useState("");
  const [betError, setBetError] = useState(null);
  const [betLockedError, setBetLockedError] = useState("");

  useEffect(() => {
    if (isLocked && String(betAmount).trim() !== "") setBetLockedError(betErrorMessage);
    else setBetLockedError("");
  }, [betAmount, isLocked, betErrorMessage]);

  // inline bet errors clear themselves as soon as they are resolved
  useEffect(() => {
    setBetError((cur) => {
      if (!cur) return cur;
      if (cur === "Log in to place a bet") return isAuthenticated ? null : cur;
      const amt = parseFloat(betAmount) || 0;
      return amt > 0 && amt <= (user?.balance ?? 0) ? null : cur;
    });
  }, [betAmount, isAuthenticated, user?.balance]);

  const adjustBet = (val) => {
    const curr = parseFloat(betAmount) || 0;
    setBetAmount((curr * val).toFixed(2));
  };

  // Scaffolding: the button is wired to the standard validation flow but the
  // game cannot be played yet, so it stops at the notice.
  const handleBet = () => {
    if (isLocked) { setBetLockedError(betErrorMessage); return; }
    if (!isAuthenticated) { openLoginModal(); return; }
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) { setBetError("Invalid bet amount"); return; }
    if (amount > (user?.balance ?? 0)) { setBetError("Insufficient balance"); return; }
    toast.info("Hilo is coming soon — betting opens with the release.");
  };

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
          quickAdjustDisabled={isLocked}
          errors={[betLockedError, betError]}
        />

        <span className="ui-bet-wrap">
          <SidebarBetButton
            onClick={handleBet}
            disabled={isLocked}
            data-bet-sound="true"
            title={isLocked ? betErrorMessage : undefined}
          >
            Bet
          </SidebarBetButton>
          <BetLockBadge locked={isLocked} title={disabledTitle} description={disabledDesc} />
        </span>

        <SidebarReadOnlyField
          label="Profit on Win"
          meta="$0.00"
          value="0.00"
          currency
        />
      </div>

      <div className={styles.gameStage}>
        {isLocked ? (
          <DisabledGameStage title={disabledTitle} message={disabledDesc} mobile={isMobileDisabled} />
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.cardStack} aria-hidden="true">
              <span className={`${styles.card} ${styles.cardPrev}`} />
              <span className={`${styles.card} ${styles.cardNext}`} />
              <span className={styles.arrowUp}>▲</span>
              <span className={styles.arrowDown}>▼</span>
            </div>
            <div className={styles.placeholderTitle}>Hilo</div>
            <p className={styles.placeholderText}>
              Call the next card higher or lower. Every correct call runs your
              multiplier — one wrong guess and the round is over.
            </p>
            <div className={styles.placeholderTags}>
              <span className={styles.softPill}>Cards</span>
              <span className={styles.softPill}>Streak</span>
              <span className={styles.softPill}>Casino Originals</span>
            </div>
            <div className={styles.comingSoon}>Coming soon — betting is not live yet</div>
          </div>
        )}
      </div>
    </div>
  );
}

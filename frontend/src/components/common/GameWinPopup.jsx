import CurrencyIcon from "./CurrencyIcon";

/** Canonical centered win/cash-out popup shared by the active games. */
export default function GameWinPopup({
  multiplier,
  amount,
  multiplierText,
  amountText,
  variant = "default",
  role = "status",
  ariaLive = "polite",
  ariaLabel = "Round result",
}) {
  const mult = multiplierText ?? `${Number(multiplier || 0).toFixed(2)}×`;
  const payout = amountText ?? Number(amount || 0).toFixed(2);

  return (
    <div className={`ui-win-popup ui-win-popup--${variant}`} role={role} aria-live={ariaLive} aria-label={ariaLabel}>
      <div className="ui-win-popup-mult">{mult}</div>
      <div className="ui-win-popup-divider" aria-hidden="true" />
      <div className="ui-win-popup-amount">{payout}<CurrencyIcon /></div>
    </div>
  );
}

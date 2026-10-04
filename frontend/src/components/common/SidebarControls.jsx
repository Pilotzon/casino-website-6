import { useId } from "react";
import BetError from "./BetError";
import CurrencyIcon from "./CurrencyIcon";

const joinClassNames = (...values) => values.filter(Boolean).join(" ");

/** A label/meta row paired with one of the canonical sidebar controls. */
export function SidebarField({ label, meta, htmlFor, children, style }) {
  return (
    <div className="sidebar-control-group" style={style}>
      <div className="sidebar-label-row">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {meta != null ? <span>{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Bet amount, currency mark, quick-adjust pair, and inline validation. */
export function BetAmountField({
  label = "Bet Amount",
  meta,
  value,
  onChange,
  onHalf,
  onDouble,
  errors = [],
  disabled = false,
  quickAdjustDisabled = disabled,
  id: idProp,
  placeholder = "0.00",
  step = "0.00000001",
  type = "number",
  min,
  max,
  inputMode,
  name,
  autoComplete = "off",
  showQuickAdjust = true,
  currency = true,
  readOnly = false,
  onBlur,
  onKeyDown,
  ariaLabel,
}) {
  const generatedId = useId();
  const id = idProp || `bet-amount-${generatedId}`;
  const messages = (Array.isArray(errors) ? errors : [errors]).filter(Boolean);

  return (
    <SidebarField label={label} meta={meta} htmlFor={id}>
      <div className={joinClassNames("sidebar-input-group", messages.length && "sidebar-input-group--error")}>
        <div className="sidebar-input-wrapper">
          <input
            id={id}
            name={name}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            step={step}
            min={min}
            max={max}
            inputMode={inputMode}
            autoComplete={autoComplete}
            disabled={disabled}
            readOnly={readOnly}
            aria-label={ariaLabel}
            aria-invalid={messages.length > 0 || undefined}
          />
          {currency ? <CurrencyIcon className="sidebar-currency-icon" /> : null}
        </div>
        {showQuickAdjust ? (
          <div className="sidebar-split-buttons">
            <button type="button" onClick={onHalf} disabled={quickAdjustDisabled} aria-label="Halve bet">½</button>
            <span className="sidebar-divider" aria-hidden="true" />
            <button type="button" onClick={onDouble} disabled={quickAdjustDisabled} aria-label="Double bet">2×</button>
          </div>
        ) : null}
      </div>
      {messages.map((message, index) => <BetError key={`${message}-${index}`} message={message} />)}
    </SidebarField>
  );
}

/** Consistent readonly value/profit control with the input hover highlight. */
export function SidebarReadOnlyField({
  label,
  value,
  meta,
  currency = false,
  suffix,
  id: idProp,
  ariaLabel,
  className,
  groupStyle,
}) {
  const generatedId = useId();
  const id = idProp || `readonly-${generatedId}`;

  return (
    <SidebarField label={label} meta={meta} htmlFor={id} style={groupStyle}>
      <div className={joinClassNames("sidebar-readonly-input", "ui-hover-field", className)}>
        <input id={id} type="text" value={value} readOnly aria-label={ariaLabel || label} />
        {currency ? <CurrencyIcon className="sidebar-currency-icon" /> : null}
        {suffix != null ? <span className="sidebar-input-suffix">{suffix}</span> : null}
      </div>
    </SidebarField>
  );
}

/** Canonical sidebar select using the same label, field surface, and tokens. */
export function SidebarSelectField({
  label,
  meta,
  value,
  onChange,
  options,
  disabled = false,
  id: idProp,
  name,
  ariaLabel,
}) {
  const generatedId = useId();
  const id = idProp || `select-${generatedId}`;
  return (
    <SidebarField label={label} meta={meta} htmlFor={id}>
      <div className="sidebar-readonly-input ui-select-caret">
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel || label}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </SidebarField>
  );
}

/** Shared Manual/Auto mode control (including the disabled Auto treatment). */
export function SidebarModeToggle({ active = "manual", onChange, autoDisabled = true }) {
  return (
    <div className="sidebar-mode-toggle" role="group" aria-label="Betting mode">
      <button
        type="button"
        className={joinClassNames("sidebar-mode-btn", active === "manual" && "sidebar-mode-active")}
        aria-pressed={active === "manual"}
        onClick={onChange ? () => onChange("manual") : undefined}
      >
        Manual
      </button>
      <button
        type="button"
        className={joinClassNames("sidebar-mode-btn", autoDisabled && "sidebar-mode-auto-disabled", active === "auto" && "sidebar-mode-active")}
        aria-pressed={active === "auto"}
        disabled={autoDisabled}
        onClick={onChange ? () => onChange("auto") : undefined}
      >
        Auto
      </button>
    </div>
  );
}

/** Shared primary/secondary sidebar action button. */
export function SidebarBetButton({
  children,
  variant = "primary",
  className,
  type = "button",
  ...props
}) {
  const buttonClass = variant === "secondary"
    ? "sidebar-secondary-button"
    : variant === "cashout"
      ? "sidebar-bet-button sidebar-bet-button--cashout"
      : "sidebar-bet-button";
  return (
    <button type={type} className={joinClassNames(buttonClass, className)} {...props}>
      {children}
    </button>
  );
}

/** Reusable icon-led action used by Blackjack, Flip, and RPS sidebars. */
export function SidebarActionButton({
  children,
  label,
  icon,
  iconSize = 18,
  iconColor,
  marker,
  markerColor,
  layout = "center",
  active = false,
  className,
  type = "button",
  ...props
}) {
  const iconStyle = icon ? {
    "--ui-action-mask": `url("${icon}")`,
    "--ui-action-icon-size": `${iconSize}px`,
    ...(iconColor ? { "--ui-action-icon-color": iconColor } : {}),
  } : undefined;
  const markerStyle = markerColor ? { "--ui-action-marker-color": markerColor } : undefined;

  return (
    <button
      type={type}
      className={joinClassNames(
        "ui-action-button",
        `ui-action-button--${layout}`,
        active && "ui-action-active",
        className
      )}
      {...props}
    >
      <span className="ui-action-button-label">{label ?? children}</span>
      {icon ? <span className="ui-action-button-icon" style={iconStyle} aria-hidden="true" /> : null}
      {marker ? <span className={`ui-action-button-marker ui-action-button-marker--${marker}`} style={markerStyle} aria-hidden="true" /> : null}
    </button>
  );
}

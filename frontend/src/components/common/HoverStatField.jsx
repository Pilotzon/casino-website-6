const joinClassNames = (...values) => values.filter(Boolean).join(" ");

/** Reusable labelled, readonly field used in hover stats panels. */
export default function HoverStatField({
  label,
  value,
  suffix,
  ariaLabel,
  className,
  fieldClassName,
  inputClassName,
  suffixClassName,
}) {
  return (
    <div className={joinClassNames("ui-hover-box", className)}>
      <div className="ui-hover-label">{label}</div>
      <div className={joinClassNames("ui-hover-field", fieldClassName)}>
        <input
          className={joinClassNames(
            "ui-hover-input",
            suffix != null && "ui-hover-input--with-suffix",
            inputClassName
          )}
          type="text"
          readOnly
          value={value == null ? "" : String(value)}
          aria-label={ariaLabel || label}
        />
        {suffix != null ? (
          <span className={joinClassNames("ui-hover-suffix", suffixClassName)}>
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

import React from "react";
import { STATUS_COLORS } from "../constants/settings.js";

export function Box({ title, children }) {
  return (
    <div className="box">
      <div className="box-header">
        <h3>{title}</h3>
      </div>
      <div className="box-body">{children}</div>
    </div>
  );
}

export const Field = React.memo(function Field({
  label,
  hint,
  children,
}) {
  return (
    <div className="field">
      <label className="field-label">
        <span>{label}</span>

        {hint && (
          <span className="field-hint">
            {" "}
            — {hint}
          </span>
        )}
      </label>

      {children}
    </div>
  );
});

export const UnitInput = React.memo(
  function UnitInput({
    value,
    onChange,
    onBlur,
    placeholder,
    unit = "",
    disabled = false,
    inputMode = "text",
  }) {
    return (
      <div className="unit-input">
        <input
          className="unit-input__field"
          type="text"
          inputMode={inputMode}
          value={value || ""}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={(e) =>
            e.currentTarget.select()
          }
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />

        {unit && (
          <span className="unit-input__suffix">
            {unit}
          </span>
        )}
      </div>
    );
  }
);

export const Pill = React.memo(
  function Pill({ children }) {
    return (
      <span className="pill">
        {children}
      </span>
    );
  }
);

export function StatusBadge({ status }) {
  const s =
    STATUS_COLORS[status] ||
    STATUS_COLORS.Draft;

  return (
    <span
      className="status-badge"
      style={{
        background: s.bg,
        color: s.text,
        borderColor: s.border,
      }}
    >
      {status || "Draft"}
    </span>
  );
}
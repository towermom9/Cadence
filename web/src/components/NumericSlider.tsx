import { useEffect, useState } from "react";

export interface NumericSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  zeroLabel?: string;
  disabled?: boolean;
  ariaLabel: string;
  inputAriaLabel?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number, source: "slider" | "input") => void;
  className?: string;
}

export function NumericSlider({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  zeroLabel,
  disabled = false,
  ariaLabel,
  inputAriaLabel,
  formatValue,
  onChange,
  className = "",
}: NumericSliderProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [value, editing]);

  const clampAndNormalize = (raw: number): number => {
    if (!Number.isFinite(raw)) return value;
    const clamped = Math.max(min, Math.min(max, raw));
    if (step > 1) {
      const snapped = min + Math.round((clamped - min) / step) * step;
      return Math.max(min, Math.min(max, snapped));
    }
    return Math.round(clamped);
  };

  const commitDraft = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setDraft(String(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clampAndNormalize(parsed);
    setDraft(String(next));
    if (next !== value) {
      onChange(next, "input");
    }
  };

  const displayHint =
    zeroLabel && value === 0
      ? zeroLabel
      : formatValue
        ? formatValue(value)
        : null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            setDraft(String(next));
            onChange(next, "slider");
          }}
          aria-label={ariaLabel}
          style={{ accentColor: "var(--cadence-accent)" }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-not-allowed"
        />

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={editing ? draft : String(value)}
            onFocus={(e) => {
              setEditing(true);
              setDraft(String(value));
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              commitDraft(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setEditing(false);
                setDraft(String(value));
                e.currentTarget.blur();
              }
            }}
            aria-label={inputAriaLabel || `${ariaLabel} exact value`}
            className="w-16 bg-transparent text-right text-xs font-semibold tabular-nums text-white focus:outline-none disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {suffix && <span className="text-[11px] font-medium text-zinc-400">{suffix}</span>}
        </div>
      </div>

      {displayHint && (
        <p className="text-right text-[11px] font-medium text-zinc-400">{displayHint}</p>
      )}
    </div>
  );
}

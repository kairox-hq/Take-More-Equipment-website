"use client";

import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * The form kit.
 *
 * The storefront has exactly one form control — the catalogue's sort select —
 * so its classes are the whole vocabulary this brand had for inputs. Everything
 * below is built from that same language: card background, hairline border,
 * accent on focus, font-light text. Nothing new was invented.
 *
 * Density is where the ops app departs from the site: rounded-xl instead of the
 * storefront's 32px panels, and labels sized to be read at arm's length on a
 * phone in a warehouse rather than admired on a landing page.
 */

const CONTROL =
  "w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm font-light " +
  "text-white/90 placeholder:text-muted/60 hover:border-white/20 " +
  "focus:border-accent focus:outline-none transition-colors " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-xs font-medium tracking-wide text-white/80">
          {label}
          {required && <span className="text-accent ml-1">*</span>}
        </span>
        {hint && <span className="text-[11px] font-light text-muted">{hint}</span>}
      </span>
      {children}
      {error && <span className="block mt-1 text-[11px] text-status-sold">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={5}
      {...props}
      className={`${CONTROL} resize-y leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

/**
 * Money in, cents out.
 *
 * Staff type rands because that is what is written on the auction sheet; the
 * database stores cents because that is what does not accumulate rounding
 * error. This is the only place in the app where the two meet.
 */
export function RandInput({
  valueCents,
  onChangeCents,
  onFocus,
  onBlur,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
}) {
  /**
   * While the box has focus it shows what was TYPED, not the cents echoed back.
   *
   * Rendering `String(valueCents / 100)` on every keystroke meant "12." became
   * "12" before the next digit could be typed, so nobody could enter R12.50 at
   * all. The text is the box's own while it is being edited; the cents are
   * synced back from the parent only once it is left.
   */
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(valueCents === null ? "" : String(valueCents / 100));

  useEffect(() => {
    if (!focused) setText(valueCents === null ? "" : String(valueCents / 100));
  }, [valueCents, focused]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-light text-muted pointer-events-none">
        R
      </span>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onChange={(e) => {
          // A decimal comma is what half the keyboards in this country offer.
          const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
          setText(raw);
          if (raw === "" || raw === ".") return onChangeCents(null);
          const rands = Number.parseFloat(raw);
          onChangeCents(Number.isFinite(rands) ? Math.round(rands * 100) : null);
        }}
        className={`${CONTROL} pl-7 ${className}`}
      />
    </div>
  );
}

/**
 * The one figure on this form that a buyer will read.
 *
 * A hairline of accent and a soft bloom underneath it — enough that the eye
 * lands here first among eight identical boxes, not so much that it reads as an
 * error state or as the focus ring it sits next to. `focus:` still wins, so
 * nothing is lost when the field is actually being typed into.
 */
// Written as literal rgba rather than an opacity utility because Tailwind scans
// source text for whole class names — and #30A8B0 is the accent from the shared
// preset, spelled out here only because a box-shadow colour cannot reference it.
export const PUBLIC_FIELD_HALO =
  "border-accent/50 shadow-[0_0_0_3px_rgba(48,168,176,0.07),0_0_18px_-6px_rgba(48,168,176,0.45)]";

/** Multi-select chips. Used for tags, where a dropdown would cost more taps. */
export function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={on ? `Remove ${option.label} tag` : `Add ${option.label} tag`}
            onClick={() => onToggle(option.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
              on
                ? "border-accent/70 bg-accent/10 text-accent"
                : "border-border text-white/70 hover:border-white/25"
            }`}
          >
            {option.label}
            {on && <span aria-hidden="true" className="ml-1.5">×</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  variant = "primary",
  loading,
  children,
  ...props
}: InputHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  children: ReactNode;
}) {
  const styles = {
    primary: "bg-accent text-background hover:opacity-90",
    secondary: "border border-border text-white/90 hover:border-white/25",
    ghost: "text-muted hover:text-white",
    danger: "border border-status-sold/40 text-status-sold hover:bg-status-sold/10",
  }[variant];

  return (
    <button
      {...(props as object)}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium
        transition-all disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${props.className ?? ""}`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-card border border-border rounded-2xl ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5">
          <div>
            {title && <h2 className="text-sm font-medium tracking-tight">{title}</h2>}
            {subtitle && (
              <p className="text-xs font-light text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** The accent dash that opens every section on the storefront. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center space-x-3 mb-3">
      <div className="w-5 h-1 rounded-full bg-accent" />
      <span className="text-accent uppercase text-xs tracking-wider font-normal">
        {children}
      </span>
    </div>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Loader2 } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Field({ label, hint, optional, children, htmlFor }: {
  label: string; hint?: string; optional?: boolean; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-faint">isteğe bağlı</span>}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-xl border border-line bg-field px-3.5 text-[15px] text-ink placeholder:text-faint outline-none transition focus:border-accent";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, "h-11", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputBase, "resize-y py-2.5 leading-relaxed", props.className)} />;
}

export function Chips<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T | ""; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-9 rounded-full border px-3.5 text-sm transition",
              on ? "border-accent bg-accent-wash text-accent-strong" : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function OptionCard({ icon: Icon, title, desc, selected, onClick, children }: {
  icon?: LucideIcon; title: string; desc?: string; selected: boolean; onClick: () => void; children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        "relative flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition",
        selected ? "border-accent bg-accent-wash" : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon className={cx("size-5 shrink-0", selected ? "text-accent" : "text-muted")} aria-hidden />}
        <span className="font-semibold">{title}</span>
      </span>
      {desc && <span className="text-sm leading-relaxed text-muted">{desc}</span>}
      {children}
      {selected && (
        <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-accent text-on-accent">
          <Check className="size-3.5" aria-hidden />
        </span>
      )}
    </button>
  );
}

export function Button({ variant = "primary", busy, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline"; busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent-strong",
        variant === "outline" && "border border-line-strong text-ink hover:border-accent",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-ink",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "accent"; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tone === "neutral" && "border-line text-muted",
        tone === "ok" && "border-ok/40 text-ok",
        tone === "warn" && "border-warn/40 text-warn",
        tone === "bad" && "border-bad/40 text-bad",
        tone === "accent" && "border-accent-border text-accent-strong",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={cx(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "neutral" && "border-line bg-panel-2 text-muted",
        tone === "warn" && "border-warn/30 bg-warn/5 text-warn",
        tone === "bad" && "border-bad/30 bg-bad/5 text-bad",
      )}
    >
      {children}
    </div>
  );
}

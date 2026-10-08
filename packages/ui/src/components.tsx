import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

/* Componentes base no estilo shadcn/ui, partilhados pelos apps. */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:brightness-110 active:brightness-95 shadow-sm",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-[filter,background-color] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg placeholder:text-muted/70",
        "focus:border-brand focus:outline-none focus:ring-4 focus:ring-ring/30 transition-shadow",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...props} />;
}

type BadgeTone = "neutral" | "success" | "warning" | "info" | "danger" | "brand";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
  danger: "bg-danger/12 text-danger",
  brand: "bg-brand/12 text-brand",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Alert({ tone = "danger", className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "danger" | "info" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-sm",
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-info/10 text-info",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** Marca do produto (wordmark), usada nos ecrãs de login. */
export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-brand text-brand-fg">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3M21 14v.01M14 21h7v-4" />
        </svg>
      </span>
      {name}
    </span>
  );
}

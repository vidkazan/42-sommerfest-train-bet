import type { ButtonHTMLAttributes, CSSProperties, MouseEventHandler, ReactNode } from "react";
import { colors, type TransportType } from "./tokens";

export type BadgeVariant = "secondary" | "primary" | "red" | "green" | "yellow" | "orange" | "blue" | "accent" | "construction" | "clear";
const badgeColors: Record<BadgeVariant, string> = { secondary: "color-mix(in srgb, var(--chew-fill-tertiary) 30%, transparent)", primary: colors.fill.tertiary, red: colors.fill.red, green: colors.fill.green, yellow: colors.fill.yellow, orange: "#f97316", blue: colors.transport.u, accent: colors.fill.accent, construction: "#8b5cf6", clear: "transparent" };

export function formatDelayMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "—";
  return `${minutes >= 0 ? "+" : "−"}${Math.abs(minutes)}min`;
}

export function DelayBadge({ minutes, className = "", style }: { minutes: number | null | undefined; className?: string; style?: CSSProperties }) {
  return <Badge variant="primary" className={`ds-delay-badge ${className}`.trim()} style={style}>{formatDelayMinutes(minutes)}</Badge>;
}

export function Badge({ children, variant = "primary", gradient, className = "", style: customStyle, onClick, "aria-expanded": ariaExpanded }: { children: ReactNode; variant?: BadgeVariant; gradient?: [string, string]; className?: string; style?: CSSProperties; onClick?: MouseEventHandler<HTMLButtonElement>; "aria-expanded"?: boolean }) {
  const style: CSSProperties = { background: gradient ? `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})` : badgeColors[variant], ...customStyle };
  if (onClick) return <button type="button" className={`ds-badge ${className}`.trim()} style={style} onClick={onClick} aria-expanded={ariaExpanded}>{children}</button>;
  return <span className={`ds-badge ${className}`.trim()} style={style}>{children}</span>;
}
export function BadgeButton({ children, className = "", ...props }: { children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ds-badge ds-badge-button ${className}`.trim()} {...props}>{children}</button>;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ds-card ${className}`.trim()}>{children}</section>;
}
export function Notice({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`ds-notice ${className}`.trim()}>{children}</p>;
}
export function StatusBadge({ children, variant = "neutral" }: { children: ReactNode; variant?: "neutral" | "info" | "success" | "danger" | "muted" }) {
  return <span className={`ds-status ds-status--${variant}`}>{children}</span>;
}
export function Button({ children, variant = "primary", className = "", ...props }: { children: ReactNode; variant?: "primary" | "secondary"; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ds-button ds-button--${variant} ${className}`.trim()} {...props}>{children}</button>;
}
export function Label({ children, large = false, background = "transparent" }: { children: ReactNode; large?: boolean; background?: string }) {
  return <span className={large ? "ds-text-big" : "ds-text-medium"} style={{ background, borderRadius: ".375rem", padding: ".125rem .25rem" }}>{children}</span>;
}
export function SegmentedControl<T extends string>({ items, value, onChange, renderItem = (item) => item }: { items: readonly T[]; value: T; onChange: (value: T) => void; renderItem?: (item: T) => ReactNode }) {
  return <div className="ds-segmented-control" role="tablist">{items.map((item) => <button className="ds-segmented-control__item" data-selected={item === value} key={item} onClick={() => onChange(item)} role="tab" aria-selected={item === value} type="button">{renderItem(item)}</button>)}</div>;
}
export function TransportIcon({ type, label, decorative = false, className = "" }: { type: TransportType; label?: string; decorative?: boolean; className?: string }) {
  const accessibleLabel = label ?? `${type} transport`;
  return <svg className={`ds-icon ${className}`.trim()} width="24" height="24" viewBox="0 0 24 24" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : accessibleLabel} aria-hidden={decorative ? true : undefined}>
    <rect x="1" y="1" width="22" height="22" rx="6" fill={colors.transport[type]} />
    <path d="M6 16V7.5C6 6.67 6.67 6 7.5 6h9C17.33 6 18 6.67 18 7.5V16M6 12h12M8 18h2M14 18h2" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 8h3v2H8zM13 8h3v2h-3z" fill="white" />
    <circle cx="8" cy="16" r="1" fill="white" /><circle cx="16" cy="16" r="1" fill="white" />
  </svg>;
}

export function TrainIcon({ label = "Train", decorative = false, className = "" }: { label?: string; decorative?: boolean; className?: string }) {
  return <TransportIcon type="re" label={label} decorative={decorative} className={className} />;
}

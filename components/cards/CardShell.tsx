"use client";
/** The one visual frame every inline console card sits in, so cards stay consistent without a design system. */
import type { ReactNode } from "react";

export interface CardShellProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function CardShell({ title, children, footer }: CardShellProps) {
  return (
    <section className="my-2 rounded-xl border border-black/10 bg-white/70 p-3 text-sm shadow-sm backdrop-blur dark:border-white/15 dark:bg-white/5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{title}</h3>
      <div className="space-y-2">{children}</div>
      {footer ? <div className="mt-3 flex flex-wrap gap-2">{footer}</div> : null}
    </section>
  );
}

export function CardButton({
  children,
  onClick,
  type = "button",
  disabled,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  href?: string;
}) {
  const className =
    "inline-flex items-center rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
  if (href) {
    return (
      <a className={className} href={href} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <button className={className} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function CardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block opacity-70">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-black/40 dark:focus:border-white/50";

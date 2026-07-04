"use client";

import { LoaderCircle } from "lucide-react";

export function LoadingStateBadge({
  active,
  label = "正在加载",
  className = "",
}: {
  active: boolean;
  label?: string;
  className?: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`inline-flex h-8 items-center gap-2 rounded-full border border-[var(--border,var(--dash-line))] bg-[var(--panel,var(--dash-card))] px-3 text-xs font-semibold text-[var(--muted,var(--dash-muted))] shadow-sm ${className}`}
    >
      <LoaderCircle size={14} className="animate-spin text-[var(--accent,var(--dash-accent))]" />
      {label}
    </span>
  );
}

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`loading-skeleton ${className}`} />;
}

export function LoadingPanelOverlay({
  active,
  label = "正在加载",
  className = "",
}: {
  active: boolean;
  label?: string;
  className?: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`absolute inset-0 z-20 grid place-items-center rounded-[inherit] border border-[var(--border,var(--dash-line))] bg-[var(--loading-overlay-bg,rgba(255,255,255,0.78))] ${className}`}
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border,var(--dash-line))] bg-[var(--panel,var(--dash-card))] px-4 py-2 text-sm font-semibold text-[var(--text,var(--dash-text))] shadow-lg">
        <LoaderCircle size={16} className="animate-spin text-[var(--accent,var(--dash-accent))]" />
        {label}
      </span>
    </div>
  );
}

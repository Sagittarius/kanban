"use client";

import { X } from "lucide-react";
import type { ChangelogEntry } from "@/lib/changelog";

type ChangelogDialogProps = {
  appVersion: string;
  entries: ChangelogEntry[];
  onClose: () => void;
  variant?: "kanban" | "dashboard";
};

export default function ChangelogDialog({
  appVersion,
  entries,
  onClose,
  variant = "kanban",
}: ChangelogDialogProps) {
  const dashboard = variant === "dashboard";
  const theme = dashboard
    ? {
        border: "border-[var(--dash-line)]",
        panel: "bg-[var(--dash-panel-strong)]",
        panelSoft: "bg-[var(--dash-card)]",
        text: "text-[var(--dash-text)]",
        muted: "text-[var(--dash-muted)]",
        accent: "text-[var(--dash-accent)]",
        accentBorder: "border-[var(--dash-accent)]/25",
        accentSoft: "bg-[var(--dash-accent-soft)]",
        hover: "hover:bg-[var(--dash-hover)]",
        hoverText: "hover:text-[var(--dash-text)]",
        shadow: "shadow-[0_26px_80px_var(--dash-shadow)]",
      }
    : {
        border: "border-[var(--border)]",
        panel: "bg-[var(--panel)]",
        panelSoft: "bg-[var(--panel-soft)]",
        text: "text-[var(--text)]",
        muted: "text-[var(--muted)]",
        accent: "text-[var(--accent)]",
        accentBorder: "border-[var(--accent)]/20",
        accentSoft: "bg-[var(--accent-soft)]",
        hover: "hover:bg-[var(--card-section)]",
        hoverText: "hover:text-[var(--text)]",
        shadow: "shadow-2xl",
      };

  const currentVersion = appVersion.replace(/@.+$/, "");

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-dialog-title"
        className={`flex max-h-[min(84vh,860px)] w-full max-w-[820px] flex-col overflow-hidden rounded-3xl border ${theme.border} ${theme.panel} ${theme.shadow}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-4 border-b ${theme.border} px-6 py-5`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border ${theme.accentBorder} ${theme.accentSoft} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${theme.accent}`}>
                版本记录
              </span>
              <span className={`inline-flex items-center rounded-full border ${theme.border} ${theme.panelSoft} px-2.5 py-1 text-xs font-semibold ${theme.muted}`}>
                当前 {appVersion}
              </span>
            </div>
            <h2 id="changelog-dialog-title" className={`mt-3 text-xl font-semibold ${theme.text}`}>Changelog</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-2xl border ${theme.border} ${theme.panelSoft} ${theme.muted} transition ${theme.hover} ${theme.hoverText}`}
            title="关闭"
            aria-label="关闭版本记录"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {entries.map((entry) => (
              <section key={`${entry.version}-${entry.date}`} className={`rounded-2xl border ${theme.border} ${theme.panelSoft} p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className={`text-base font-semibold ${theme.text}`}>{entry.version}</h3>
                    {entry.date ? <p className={`mt-1 text-xs ${theme.muted}`}>{entry.date}</p> : null}
                  </div>
                  {entry.version === appVersion || entry.version === currentVersion ? (
                    <span className={`inline-flex items-center rounded-full border ${theme.accentBorder} ${theme.accentSoft} px-2.5 py-1 text-xs font-semibold ${theme.accent}`}>
                      当前版本
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-2">
                  {entry.items.map((item, index) => (
                    <li key={`${entry.version}-${index}`} className={`flex items-start gap-2 text-sm leading-6 ${theme.text}`}>
                      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current ${theme.accent} opacity-80`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

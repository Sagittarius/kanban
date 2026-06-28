"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

export type ConfirmDialogTone = "default" | "danger";

export type ConfirmDialogAction = {
  title: string;
  message: string;
  tone?: ConfirmDialogTone;
  actionLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  onConfirm: () => Promise<void> | void;
};

export default function ConfirmDialog({
  title,
  message,
  tone = "default",
  actionLabel = "确认",
  cancelLabel = "取消",
  showCancel = true,
  onClose,
  onConfirm,
}: ConfirmDialogAction & {
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 text-[var(--text)] shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              tone === "danger"
                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "bg-[var(--accent-soft)] text-[var(--accent)]"
            }`}
          >
            {tone === "danger" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          {showCancel ? (
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onConfirm()}
            className={`h-10 rounded-xl px-4 text-sm font-semibold text-white transition hover:opacity-90 ${
              tone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--accent)]"
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Search, X } from "lucide-react";
import { SEARCH_MULTI_SELECT_DROPDOWN_ATTR, SEARCH_MULTI_SELECT_ROOT_ATTR } from "@/lib/select-surface";
import { selectItemMatchesQuery } from "@/lib/select-search";

export type MultiSelectOption = {
  value: string;
  label: string;
  meta?: string;
  colorDotClass?: string;
};

export default function SearchMultiSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "搜索",
  summaryLabel = "全部",
  className = "",
  panelClassName = "",
  compact = false,
}: {
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  summaryLabel?: string;
  className?: string;
  panelClassName?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selected = useMemo(() => options.filter((option) => value.includes(option.value)), [options, value]);
  const selectedValueSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    return options.filter((option) => selectItemMatchesQuery(option, query));
  }, [options, query]);
  const filteredValues = useMemo(() => filtered.map((option) => option.value), [filtered]);
  const allFilteredSelected = filteredValues.length > 0 && filteredValues.every((item) => selectedValueSet.has(item));
  const bulkActionLabel = allFilteredSelected ? "反选" : "全选";

  function toggle(nextValue: string) {
    onChange(value.includes(nextValue) ? value.filter((item) => item !== nextValue) : [...value, nextValue]);
  }

  function selectFiltered() {
    if (filteredValues.length === 0) return;
    onChange([...value, ...filteredValues.filter((item) => !selectedValueSet.has(item))]);
  }

  function invertFilteredSelection() {
    if (filteredValues.length === 0) return;
    const filteredValueSet = new Set(filteredValues);
    const keptValues = value.filter((item) => !filteredValueSet.has(item));
    const addedValues = filteredValues.filter((item) => !selectedValueSet.has(item));
    onChange([...keptValues, ...addedValues]);
  }

  function toggleBulkSelection() {
    if (allFilteredSelected) {
      invertFilteredSelection();
      return;
    }
    selectFiltered();
  }

  const selectStyle = {
    "--sms-border": "var(--border, var(--dash-line, #d9dee7))",
    "--sms-input": "var(--input, var(--dash-card, #ffffff))",
    "--sms-panel": "var(--panel, var(--dash-panel, #ffffff))",
    "--sms-panel-soft": "var(--panel-soft, var(--dash-track, #f1f3f7))",
    "--sms-hover": "var(--hover, var(--dash-card, #eef1f5))",
    "--sms-text": "var(--text, var(--dash-text, #17191f))",
    "--sms-muted": "var(--muted, var(--dash-muted, #687083))",
    "--sms-accent": "var(--accent, var(--dash-accent, #5e6ad2))",
    "--sms-accent-soft": "var(--accent-soft, var(--dash-accent-soft, rgba(94, 106, 210, 0.16)))",
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      {...{ [SEARCH_MULTI_SELECT_ROOT_ATTR]: "true" }}
      style={selectStyle}
      className={`relative ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-10 w-full items-center gap-1.5 rounded-md border border-[var(--sms-border)] bg-[var(--sms-input)] px-3 py-2 text-left text-sm text-[var(--sms-text)] transition hover:bg-[var(--sms-panel-soft)] ${compact ? "min-h-10" : ""}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {selected.length > 0 ? (
            selected.slice(0, compact ? 2 : 4).map((option) => (
              <span
                key={option.value}
                className="inline-flex max-w-[150px] items-center gap-1 rounded bg-[var(--sms-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--sms-accent)]"
              >
                {option.colorDotClass ? <span className={`h-2 w-2 rounded-full ${option.colorDotClass}`} /> : null}
                <span className="truncate">{option.label}</span>
              </span>
            ))
          ) : (
            <span className="truncate text-sm leading-5 text-[var(--sms-muted)]">{placeholder}</span>
          )}
          {selected.length > (compact ? 2 : 4) ? (
            <span className="rounded-full bg-[var(--sms-panel-soft)] px-2 py-1 text-xs font-medium text-[var(--sms-muted)]">
              +{selected.length - (compact ? 2 : 4)}
            </span>
          ) : null}
        </div>
        {selected.length > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            title={`清空${summaryLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--sms-muted)] transition hover:bg-[var(--sms-panel-soft)] hover:text-[var(--sms-text)]"
          >
            <X size={14} />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          {...{ [SEARCH_MULTI_SELECT_DROPDOWN_ATTR]: "true" }}
          className={`absolute right-0 top-full z-[80] mt-1 w-full min-w-0 max-w-[min(92vw,360px)] rounded-md border border-[var(--sms-border)] bg-[var(--sms-panel)] shadow-lg ${panelClassName}`}
        >
          <div className="border-b border-[var(--sms-border)] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sms-muted)]" size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded border border-[var(--sms-border)] bg-[var(--sms-input)] py-0 pl-8 pr-8 text-sm leading-8 text-[var(--sms-text)] outline-none placeholder:text-[var(--sms-muted)]"
              />
              {query ? (
                <button
                  type="button"
                  title="重置搜索"
                  onClick={() => setQuery("")}
                  className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--sms-muted)] transition hover:bg-[var(--sms-panel-soft)] hover:text-[var(--sms-text)]"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-b border-[var(--sms-border)] bg-[var(--sms-panel-soft)]/55 px-2 py-2">
            <button
              type="button"
              disabled={filteredValues.length === 0}
              onClick={toggleBulkSelection}
              className={`inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:border-[var(--sms-border)] disabled:bg-[var(--sms-panel)] disabled:text-[var(--sms-muted)] disabled:opacity-60 ${
                allFilteredSelected
                  ? "border-[var(--sms-border)] bg-[var(--sms-panel)] text-[var(--sms-text)] hover:border-[var(--sms-accent)] hover:text-[var(--sms-accent)]"
                  : "border-[var(--sms-accent)] bg-[var(--sms-accent)] text-white hover:opacity-90"
              }`}
            >
              {allFilteredSelected ? <span className="h-3 w-3 rounded-sm border border-current" /> : <Check size={13} />}
              {bulkActionLabel}
              <span className={`rounded px-1.5 py-0.5 text-[11px] leading-none ${allFilteredSelected ? "bg-[var(--sms-panel-soft)] text-[var(--sms-muted)]" : "bg-white/18 text-white"}`}>
                {filteredValues.length}
              </span>
            </button>
          </div>

          <div className="max-h-[180px] space-y-1 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--sms-muted)]">无匹配项</p>
            ) : (
              filtered.map((option) => {
                const active = selectedValueSet.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-[var(--sms-accent)] bg-[var(--sms-accent-soft)] text-[var(--sms-accent)] shadow-sm"
                        : "border-transparent text-[var(--sms-text)] hover:border-[var(--sms-border)] hover:bg-[var(--sms-panel-soft)]"
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                        active ? "border-[var(--sms-accent)] bg-[var(--sms-accent)] text-white" : "border-[var(--sms-border)]"
                      }`}
                    >
                      {active ? <Check size={11} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {option.colorDotClass ? <span className={`h-2.5 w-2.5 rounded-full ${option.colorDotClass}`} /> : null}
                          <span className="block truncate">{option.label}</span>
                        </span>
                        {option.meta ? <span className="mt-0.5 block text-xs text-[var(--sms-muted)]">{option.meta}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

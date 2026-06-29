"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  clearable = false,
  disabled = false,
  className = "",
}: {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.meta ?? "", option.value].some((item) => item.toLowerCase().includes(normalizedQuery))
      )
    : options;

  const selectStyle = {
    "--select-border": "var(--border, var(--dash-line, #d9dee7))",
    "--select-input": "var(--input, var(--dash-card, #ffffff))",
    "--select-panel": "var(--panel, var(--dash-panel, #ffffff))",
    "--select-panel-soft": "var(--panel-soft, var(--dash-track, #f1f3f7))",
    "--select-text": "var(--text, var(--dash-text, #17191f))",
    "--select-muted": "var(--muted, var(--dash-muted, #687083))",
    "--select-accent": "var(--accent, var(--dash-accent, #0f766e))",
    "--select-accent-soft": "var(--accent-soft, var(--dash-accent-soft, rgba(15, 118, 110, 0.14)))",
  } as CSSProperties;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function updateDropdownPosition() {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    if (!container || !rect) return false;

    const themedHost = container.closest(".kanban-theme");
    setPortalHost(themedHost);
    if (!themedHost) {
      setDropdownStyle({});
      return false;
    }

    const viewportPadding = 12;
    const maxWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
    const width = Math.min(Math.max(rect.width, 260), maxWidth);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    setDropdownStyle({ left, top: rect.bottom + 4, width });
    return true;
  }

  useEffect(() => {
    if (!open) return;
    const usesFixedPortal = updateDropdownPosition();
    if (!usesFixedPortal) return;

    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open]);

  function pick(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  function openDropdown() {
    updateDropdownPosition();
  }

  const dropdown = open && !disabled ? (
    <div
      ref={dropdownRef}
      className={`z-[80] overflow-hidden rounded-md border border-[var(--select-border)] bg-[var(--select-panel)] shadow-lg ${
        portalHost ? "fixed" : "absolute right-0 top-full mt-1 w-full min-w-[260px] max-w-[min(92vw,360px)]"
      }`}
      style={portalHost ? { ...selectStyle, ...dropdownStyle } : selectStyle}
    >
      <div className="flex gap-2 border-b border-[var(--select-border)] p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--select-muted)]" size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            className="w-full rounded border border-[var(--select-border)] bg-[var(--select-input)] py-1.5 pl-8 pr-8 text-sm text-[var(--select-text)] outline-none placeholder:text-[var(--select-muted)] focus:border-[var(--select-accent)]"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              title="清空搜索"
              aria-label="清空搜索"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--select-muted)] transition hover:bg-[var(--select-panel-soft)] hover:text-[var(--select-text)]"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
        {clearable && value ? (
          <button
            type="button"
            title="重置选择"
            onClick={() => pick("")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded border border-[var(--select-border)] text-[var(--select-muted)] transition hover:bg-[var(--select-panel-soft)] hover:text-[var(--select-text)]"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      <div className="max-h-[220px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-[var(--select-muted)]">无匹配项</p>
        ) : (
          filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => pick(option.value)}
              className={`flex w-full min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-sm transition ${
                option.value === value ? "bg-[var(--select-accent-soft)] text-[var(--select-accent)]" : "text-[var(--select-text)] hover:bg-[var(--select-panel-soft)]"
              }`}
            >
              <span className="min-w-0 truncate font-medium">{option.label}</span>
              {option.meta ? <span className="shrink-0 text-[11px] text-[var(--select-muted)]">{option.meta}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} style={selectStyle} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!open) openDropdown();
          setOpen((current) => !current);
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--select-border)] bg-[var(--select-input)] px-3 py-2 text-left text-base leading-6 text-[var(--select-text)] outline-none transition hover:bg-[var(--select-panel-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`min-w-0 truncate text-base leading-6 ${selected ? "" : "text-[var(--select-muted)]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[var(--select-muted)]" />
      </button>
      {dropdown && portalHost ? createPortal(dropdown, portalHost) : dropdown}
    </div>
  );
}

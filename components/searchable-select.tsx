"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { SEARCHABLE_SELECT_DROPDOWN_ATTR, SEARCHABLE_SELECT_ROOT_ATTR } from "@/lib/select-surface";
import { selectItemMatchesQuery } from "@/lib/select-search";

export type SearchableSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type SearchableSelectDropdownMode = "inline" | "portal";

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = "",
  dropdownMode = "inline",
}: {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  dropdownMode?: SearchableSelectDropdownMode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxIdRef = useRef(`searchable-select-listbox-${Math.random().toString(36).slice(2, 10)}`);
  const usePortal = dropdownMode === "portal";
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(
    () => options.filter((option) => selectItemMatchesQuery(option, query)),
    [options, query]
  );

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
        closeDropdown();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const updateDropdownPosition = useCallback(function updateDropdownPosition() {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    if (!container || !rect) return false;
    if (!usePortal) {
      setPortalHost(null);
      setDropdownStyle({});
      return false;
    }

    const themedHost = container.closest(".kanban-theme");
    setPortalHost(themedHost);
    if (!themedHost) {
      setDropdownStyle({});
      return false;
    }

    const viewportPadding = 12;
    const maxWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
    const width = Math.min(rect.width, maxWidth);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
    setDropdownStyle({ left, top: rect.bottom + 4, width });
    return true;
  }, [usePortal]);

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
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    const selectedIndex = filtered.findIndex((option) => option.value === value);
    setActiveIndex(filtered.length === 0 ? -1 : selectedIndex >= 0 ? selectedIndex : 0);
  }, [filtered, open, value]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const next = dropdownRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    next?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function pick(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function openDropdown() {
    setQuery("");
    updateDropdownPosition();
    setOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  function closeDropdown() {
    setOpen(false);
    setActiveIndex(-1);
    setQuery("");
  }

  function moveActive(step: 1 | -1) {
    if (filtered.length === 0) return;
    setActiveIndex((current) => {
      if (current < 0) return step === 1 ? 0 : filtered.length - 1;
      return (current + step + filtered.length) % filtered.length;
    });
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      moveActive(-1);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(filtered.length > 0 ? 0 : -1);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(filtered.length > 0 ? filtered.length - 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        event.preventDefault();
        pick(filtered[activeIndex].value);
      }
      return;
    }
    if (event.key === "Tab" && open && activeIndex >= 0 && filtered[activeIndex]) {
      pick(filtered[activeIndex].value);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeDropdown();
      triggerRef.current?.focus();
    }
  }

  const renderInPortal = usePortal && Boolean(portalHost);
  const dropdown = open && !disabled ? (
    <div
      ref={dropdownRef}
      {...{ [SEARCHABLE_SELECT_DROPDOWN_ATTR]: "true" }}
      className={`overflow-hidden rounded-md border border-[var(--select-border)] bg-[var(--select-panel)] shadow-lg ${
        renderInPortal ? "z-[170]" : "z-[80]"
      } ${
        renderInPortal ? "fixed" : "absolute right-0 top-full mt-1 w-full min-w-0 max-w-[min(92vw,360px)]"
      }`}
      style={renderInPortal ? { ...selectStyle, ...dropdownStyle } : selectStyle}
    >
      <div className="flex gap-2 border-b border-[var(--select-border)] p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--select-muted)]" size={14} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleListKeyDown}
            placeholder="搜索"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxIdRef.current}
            aria-activedescendant={activeIndex >= 0 ? `${listboxIdRef.current}-option-${activeIndex}` : undefined}
            aria-autocomplete="list"
            className="h-8 w-full rounded border border-[var(--select-border)] bg-[var(--select-input)] py-0 pl-8 pr-8 text-sm leading-8 text-[var(--select-text)] outline-none placeholder:text-[var(--select-muted)] focus:border-[var(--select-accent)]"
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
      </div>
      <div id={listboxIdRef.current} role="listbox" aria-label={placeholder} className="max-h-[220px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-[var(--select-muted)]">无匹配项</p>
        ) : (
          filtered.map((option, index) => (
            (() => {
              const isActive = activeIndex === index;
              const isSelected = option.value === value;
              return (
                <button
                  id={`${listboxIdRef.current}-option-${index}`}
                  key={option.value}
                  type="button"
                  onClick={() => pick(option.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                  data-option-index={index}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full min-w-0 items-center gap-3 rounded px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "bg-[var(--select-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                      : isSelected
                        ? "bg-[var(--select-accent-soft)] text-[var(--select-accent)]"
                        : "text-[var(--select-text)] hover:bg-[var(--select-panel-soft)]"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                  {option.meta ? (
                    <span className={`shrink-0 text-[11px] ${isActive ? "text-white/78" : isSelected ? "text-[var(--select-accent)]/80" : "text-[var(--select-muted)]"}`}>
                      {option.meta}
                    </span>
                  ) : null}
                  {isSelected ? <Check size={14} className={`shrink-0 ${isActive ? "text-white" : "text-[var(--select-accent)]"}`} /> : null}
                </button>
              );
            })()
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      {...{ [SEARCHABLE_SELECT_ROOT_ATTR]: "true" }}
      style={selectStyle}
      className={`relative ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            closeDropdown();
            return;
          }
          openDropdown();
        }}
        onKeyDown={handleListKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxIdRef.current : undefined}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--select-border)] bg-[var(--select-input)] px-3 py-2 text-left text-base text-[var(--select-text)] outline-none transition hover:bg-[var(--select-panel-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`min-w-0 truncate text-base ${selected ? "" : "text-[var(--select-muted)]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[var(--select-muted)]" />
      </button>
      {dropdown && renderInPortal && portalHost ? createPortal(dropdown, portalHost) : dropdown}
    </div>
  );
}

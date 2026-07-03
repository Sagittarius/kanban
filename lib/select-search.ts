import { match as pinyinMatch } from "pinyin-pro";

export type SelectSearchItem = {
  value: string;
  label: string;
  meta?: string;
};

export type SearchMatchRange = {
  start: number;
  end: number;
};

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

export function normalizeSelectQuery(query: string) {
  return query.trim().toLowerCase();
}

export function selectItemMatchesQuery(item: SelectSearchItem, query: string) {
  const normalized = normalizeSelectQuery(query);
  if (!normalized) return true;

  const compactQuery = normalized.replace(/\s+/g, "");
  const parts = [item.label, item.meta ?? "", item.value].filter(Boolean);
  const candidates = parts.length > 1 ? [...parts, parts.join("")] : parts;

  return candidates.some((candidate) => textMatchesSelectQuery(candidate, normalized, compactQuery));
}

export function textMatchesSelectQuery(text: string, query: string, compactQuery = normalizeSelectQuery(query).replace(/\s+/g, "")) {
  const normalizedQuery = normalizeSelectQuery(query);
  if (!normalizedQuery) return true;

  return textMatchesCandidate(text, normalizedQuery, compactQuery);
}

export function getSelectSearchMatchRanges(text: string, query: string): SearchMatchRange[] {
  const normalizedQuery = normalizeSelectQuery(query);
  if (!normalizedQuery) return [];

  const directRanges = collectDirectRanges(text, normalizedQuery);
  if (directRanges.length > 0) return directRanges;

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  if (compactQuery !== normalizedQuery) {
    const compactRanges = collectDirectRanges(text, compactQuery);
    if (compactRanges.length > 0) return compactRanges;
  }

  if (!CJK_RE.test(text) || !compactQuery) return [];

  try {
    const matchedIndexes = pinyinMatch(text, compactQuery);
    return indexesToRanges(matchedIndexes ?? []);
  } catch {
    return [];
  }
}

function textMatchesCandidate(candidate: string, normalizedQuery: string, compactQuery: string) {
  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate.includes(normalizedQuery)) return true;
  if (compactQuery !== normalizedQuery && normalizedCandidate.includes(compactQuery)) return true;
  if (!CJK_RE.test(candidate) || !compactQuery) return false;

  try {
    return Boolean(pinyinMatch(candidate, compactQuery));
  } catch {
    return false;
  }
}

function collectDirectRanges(text: string, normalizedQuery: string): SearchMatchRange[] {
  if (!normalizedQuery) return [];

  const ranges: SearchMatchRange[] = [];
  const normalizedText = text.toLowerCase();
  let cursor = 0;
  while (cursor < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) break;
    ranges.push({ start: index, end: index + normalizedQuery.length });
    cursor = index + Math.max(normalizedQuery.length, 1);
  }
  return ranges;
}

function indexesToRanges(indexes: number[]) {
  if (indexes.length === 0) return [];

  const sorted = Array.from(new Set(indexes))
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b);
  const ranges: SearchMatchRange[] = [];

  for (const index of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && index <= last.end) {
      last.end = Math.max(last.end, index + 1);
    } else {
      ranges.push({ start: index, end: index + 1 });
    }
  }

  return ranges;
}

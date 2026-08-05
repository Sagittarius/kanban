export function requirementTreeUrl(baseUrl: string | undefined | null, reference: string | undefined | null) {
  const base = baseUrl?.trim() ?? "";
  const value = reference?.trim() ?? "";
  if (!base || !value) {
    return "";
  }

  return `${base}${encodeURIComponent(value)}`;
}

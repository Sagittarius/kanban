export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_TIMEZONE;
  }

  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function todayKeyInTimeZone(timeZone = DEFAULT_TIMEZONE) {
  const normalized = normalizeTimeZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: normalized,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeInTimeZone(value: string, timeZone = DEFAULT_TIMEZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: normalizeTimeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function logTimeZone() {
  return normalizeTimeZone(process.env.TZ ?? process.env.KANBAN_DEFAULT_TIMEZONE ?? DEFAULT_TIMEZONE);
}

export function formatZonedTimestamp(value: Date | string | number = new Date(), timeZone = logTimeZone()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const normalized = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: normalized,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  const offset = String(parts.timeZoneName ?? "GMT+00:00").replace(/^GMT/, "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond ?? "000"}${offset}`;
}

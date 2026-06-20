export const timezoneOptions = [
  ["Asia/Shanghai", "上海 UTC+8"],
  ["Asia/Tokyo", "东京"],
  ["Europe/London", "伦敦"],
  ["Europe/Berlin", "柏林"],
  ["America/Los_Angeles", "洛杉矶"],
  ["America/New_York", "纽约"],
] as const;

export const avatarOptions = [
  { key: "zodiac-aries", label: "白羊座", src: "/avatars/zodiac-aries.svg" },
  { key: "zodiac-taurus", label: "金牛座", src: "/avatars/zodiac-taurus.svg" },
  { key: "zodiac-gemini", label: "双子座", src: "/avatars/zodiac-gemini.svg" },
  { key: "zodiac-cancer", label: "巨蟹座", src: "/avatars/zodiac-cancer.svg" },
  { key: "zodiac-leo", label: "狮子座", src: "/avatars/zodiac-leo.svg" },
  { key: "zodiac-virgo", label: "处女座", src: "/avatars/zodiac-virgo.svg" },
  { key: "zodiac-libra", label: "天秤座", src: "/avatars/zodiac-libra.svg" },
  { key: "zodiac-scorpio", label: "天蝎座", src: "/avatars/zodiac-scorpio.svg" },
  { key: "zodiac-sagittarius", label: "射手座", src: "/avatars/zodiac-sagittarius.svg" },
  { key: "zodiac-capricorn", label: "摩羯座", src: "/avatars/zodiac-capricorn.svg" },
  { key: "zodiac-aquarius", label: "水瓶座", src: "/avatars/zodiac-aquarius.svg" },
  { key: "zodiac-pisces", label: "双鱼座", src: "/avatars/zodiac-pisces.svg" },
  { key: "avatar-aurora", label: "极光", src: "/avatars/avatar-aurora.svg" },
  { key: "avatar-coral", label: "珊瑚", src: "/avatars/avatar-coral.svg" },
  { key: "avatar-forest", label: "森林", src: "/avatars/avatar-forest.svg" },
  { key: "avatar-midnight", label: "夜色", src: "/avatars/avatar-midnight.svg" },
] as const;

export const themePresets = [
  { id: "linear", label: "Linear" },
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "atlassian", label: "Atlassian" },
] as const;

export type ThemeId = (typeof themePresets)[number]["id"];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === "linear" || value === "github" || value === "notion" || value === "atlassian";
}

export function timezoneLabel(value: string) {
  return timezoneOptions.find(([timezone]) => timezone === value)?.[1] ?? value;
}

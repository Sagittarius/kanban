import fs from "node:fs";
import path from "node:path";

export type ChangelogEntry = {
  version: string;
  date: string;
  items: string[];
};

export function readChangelogEntries() {
  const filePath = path.join(process.cwd(), "CHANGELOG.md");
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)(?:\s+-\s+(.+))?$/);
    if (headingMatch) {
      if (current) {
        entries.push(current);
      }
      current = {
        version: headingMatch[1].trim(),
        date: headingMatch[2]?.trim() ?? "",
        items: [],
      };
      continue;
    }

    const itemMatch = line.match(/^\-\s+(.+)$/);
    if (itemMatch && current) {
      current.items.push(itemMatch[1].trim());
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

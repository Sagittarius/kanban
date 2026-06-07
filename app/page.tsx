import KanbanApp from "@/components/kanban-app";
import { createSeedBoard } from "@/lib/board-data";

function todayKeyInChina() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default function Home() {
  return (
    <KanbanApp
      initialBoard={createSeedBoard()}
      todayKey={todayKeyInChina()}
    />
  );
}

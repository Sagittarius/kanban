import KanbanApp from "@/components/kanban-app";
import { createSeedBoard } from "@/lib/board-data";

export default function Home() {
  return (
    <KanbanApp
      initialBoard={createSeedBoard()}
      todayKey={new Date().toISOString().slice(0, 10)}
    />
  );
}

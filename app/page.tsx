import AuthenticatedShell from "@/components/authenticated-shell";
import KanbanApp from "@/components/kanban-app";
import LoginPage from "@/components/login-page";
import TimezoneBoundary from "@/components/timezone-boundary";
import { createSeedBoard } from "@/lib/board-data";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { getOptionalSessionUser, resolveActiveBoard } from "@/lib/server-session";
import { todayKeyInTimeZone } from "@/lib/timezone";

export default async function Home() {
  const user = await getOptionalSessionUser();
  if (!user) {
    return <LoginPage />;
  }

  const repo = await getKanbanRepository();
  const activeBoard = await resolveActiveBoard(user);
  const boards = await repo.listBoardsForUser(user);

  return (
    <AuthenticatedShell user={user} boards={boards} activeBoardId={activeBoard.id}>
      <TimezoneBoundary timezone={user.timezone}>
        <KanbanApp initialBoard={createSeedBoard()} todayKey={todayKeyInTimeZone(user.timezone)} />
      </TimezoneBoundary>
    </AuthenticatedShell>
  );
}

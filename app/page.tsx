import MaintenancePage from "@/components/maintenance-page";
import KanbanRuntimeGuard from "@/components/kanban-runtime-guard";
import { getAppVersion, getImageTag } from "@/lib/app-meta";
import { createSeedBoard } from "@/lib/board-data";
import { readMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

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

export default async function Home() {
  const maintenanceState = await readMaintenanceState();
  const appVersion = getAppVersion();
  const imageTag = getImageTag();

  if (maintenanceState) {
    return (
      <MaintenancePage
        initialState={maintenanceState}
        appVersion={appVersion}
        imageTag={imageTag}
      />
    );
  }

  return (
    <KanbanRuntimeGuard
      initialBoard={createSeedBoard()}
      todayKey={todayKeyInChina()}
      appVersion={appVersion}
      imageTag={imageTag}
    />
  );
}

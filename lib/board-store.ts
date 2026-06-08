import { getKanbanRepository, type CurrentUser } from "@/lib/repositories/kanban-repository";

export async function getBoard(user: CurrentUser, boardId: string) {
  return (await getKanbanRepository()).getBoard(user, boardId);
}

export async function getSystemSettings(user: CurrentUser) {
  return (await getKanbanRepository()).getSystemSettings(user);
}

export async function updateSystemSettings(user: CurrentUser, input: unknown) {
  return (await getKanbanRepository()).updateSystemSettings(user, input as never);
}

export async function createProject(user: CurrentUser, boardId: string, input: unknown) {
  return (await getKanbanRepository()).createProject(user, boardId, input as never);
}

export async function updateProject(user: CurrentUser, boardId: string, id: string, input: unknown) {
  return (await getKanbanRepository()).updateProject(user, boardId, id, input as never);
}

export async function deleteProject(user: CurrentUser, boardId: string, id: string) {
  return (await getKanbanRepository()).deleteProject(user, boardId, id);
}

export async function createTask(user: CurrentUser, boardId: string, input: unknown) {
  return (await getKanbanRepository()).createTask(user, boardId, input as never);
}

export async function updateTask(user: CurrentUser, boardId: string, id: string, input: unknown) {
  return (await getKanbanRepository()).updateTask(user, boardId, id, input as never);
}

export async function deleteTask(user: CurrentUser, boardId: string, id: string) {
  return (await getKanbanRepository()).deleteTask(user, boardId, id);
}

export async function reorderTasks(user: CurrentUser, boardId: string, input: unknown) {
  return (await getKanbanRepository()).reorderTasks(user, boardId, input as never);
}

export async function createSubtask(user: CurrentUser, boardId: string, taskId: string, input: unknown) {
  return (await getKanbanRepository()).createSubtask(user, boardId, taskId, input as never);
}

export async function updateSubtask(user: CurrentUser, boardId: string, taskId: string, subtaskId: string, input: unknown) {
  return (await getKanbanRepository()).updateSubtask(user, boardId, taskId, subtaskId, input as never);
}

export async function deleteSubtask(user: CurrentUser, boardId: string, taskId: string, subtaskId: string) {
  return (await getKanbanRepository()).deleteSubtask(user, boardId, taskId, subtaskId);
}

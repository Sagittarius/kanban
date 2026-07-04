import type { UserRole } from "@/lib/auth-models";

// Shared role predicates for page and UI gates. Repository-level guards remain
// the source of truth for data access and write permissions.
const ADMIN_ACCESS_ROLES = new Set<UserRole>([
  "super_admin",
  "project_manager",
  "development_manager",
]);

export function isSuperAdminRole(role: UserRole | undefined | null) {
  return role === "super_admin";
}

export function canAccessAdmin(role: UserRole | undefined | null) {
  return role ? ADMIN_ACCESS_ROLES.has(role) : false;
}

export function canManageKanbanProjects(role: UserRole | undefined | null) {
  return role ? role !== "team_member" : false;
}

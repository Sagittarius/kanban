export function isAuthFeatureEnabled() {
  return process.env.KANBAN_AUTH_ENABLED === "true";
}

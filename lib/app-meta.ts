const FALLBACK_APP_VERSION = "1.1.0";

export function getAppVersion() {
  if (process.env.KANBAN_APP_VERSION) {
    return process.env.KANBAN_APP_VERSION;
  }

  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  return FALLBACK_APP_VERSION;
}

export function getImageTag() {
  return process.env.KANBAN_IMAGE_TAG ?? `kanban:${getAppVersion()}`;
}

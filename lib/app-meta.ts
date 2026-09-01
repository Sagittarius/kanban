const FALLBACK_APP_VERSION = "1.5.6";

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
  const configuredTag = process.env.KANBAN_IMAGE_TAG;
  const appVersion = getAppVersion();

  if (!configuredTag) {
    return `kanban:${appVersion}`;
  }

  return configuredTag.replaceAll("{version}", appVersion);
}

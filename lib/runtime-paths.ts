import os from "os";
import path from "path";

const APP_DATA_FOLDER_NAME = "JobMAXIMALIST";

function getWindowsLocalAppDataDirectory(): string {
  return process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), "AppData", "Local");
}

function getMacAppSupportDirectory(): string {
  return path.join(os.homedir(), "Library", "Application Support");
}

function getLinuxAppDataDirectory(): string {
  return process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share");
}

export function isPackagedRuntime(): boolean {
  return process.env.JOBMAX_RUNTIME_MODE === "packaged" || Boolean(process.env.JOBMAX_APP_DATA_DIR?.trim());
}

export function isOnboardingTestProfile(): boolean {
  const explicitDirectory = process.env.JOBMAX_APP_DATA_DIR?.trim();
  if (!explicitDirectory) return false;

  const normalized = path.resolve(explicitDirectory).replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/.local-profiles/onboarding-test") || normalized.includes("/.local-profiles/onboarding-test/");
}

export function getAppDataRootDirectory(): string {
  const explicitDirectory = process.env.JOBMAX_APP_DATA_DIR?.trim();
  if (explicitDirectory) {
    return path.resolve(explicitDirectory);
  }

  if (process.platform === "win32") {
    return path.join(getWindowsLocalAppDataDirectory(), APP_DATA_FOLDER_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(getMacAppSupportDirectory(), APP_DATA_FOLDER_NAME);
  }

  return path.join(getLinuxAppDataDirectory(), APP_DATA_FOLDER_NAME);
}

function getSourceRootDirectory(): string {
  return process.cwd();
}

export function getRuntimeRootDirectory(): string {
  return isPackagedRuntime() ? getAppDataRootDirectory() : getSourceRootDirectory();
}

export function getRuntimeDataDirectory(): string {
  return isPackagedRuntime()
    ? path.join(getAppDataRootDirectory(), "data")
    : path.join(getSourceRootDirectory(), "data");
}

export function getRuntimeDatabaseFilePath(): string {
  return isPackagedRuntime()
    ? path.join(getAppDataRootDirectory(), "database", "jobmaximalist.db")
    : path.join(getSourceRootDirectory(), "prisma", "dev.db");
}

export function getRuntimeConfigFilePath(): string {
  return path.join(getRuntimeDataDirectory(), "url-radar-config.json");
}

export function getRuntimeConfigBackupFilePath(): string {
  return path.join(getRuntimeDataDirectory(), "url-radar-config.backup.json");
}

export function getRuntimeStateFilePath(): string {
  return path.join(getRuntimeDataDirectory(), "url-radar-state.json");
}

export function getRuntimeStateBackupFilePath(): string {
  return path.join(getRuntimeDataDirectory(), "url-radar-state.backup.json");
}

export function getRuntimeLogsDirectory(): string {
  return path.join(getAppDataRootDirectory(), "logs");
}

export function getRuntimeBrowserDirectory(): string {
  return path.join(getAppDataRootDirectory(), "browsers");
}

export function getRuntimePaths() {
  return {
    mode: isPackagedRuntime() ? "packaged" : "source",
    rootDirectory: getRuntimeRootDirectory(),
    dataDirectory: getRuntimeDataDirectory(),
    databaseFilePath: getRuntimeDatabaseFilePath(),
    configFilePath: getRuntimeConfigFilePath(),
    configBackupFilePath: getRuntimeConfigBackupFilePath(),
    stateFilePath: getRuntimeStateFilePath(),
    stateBackupFilePath: getRuntimeStateBackupFilePath(),
    browserDirectory: getRuntimeBrowserDirectory(),
    logsDirectory: getRuntimeLogsDirectory()
  } as const;
}

export function toPrismaSqliteUrl(filePath: string): string {
  const normalizedPath = path.resolve(filePath).replace(/\\/g, "/");
  return normalizedPath.startsWith("/") ? `file:${normalizedPath}` : `file:/${normalizedPath}`;
}

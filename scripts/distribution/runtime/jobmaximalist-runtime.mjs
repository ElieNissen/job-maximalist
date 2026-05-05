import fs from "fs/promises";
import path from "path";
import os from "os";
import net from "net";
import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const appDirectory = path.dirname(__filename);
const bundleRootDirectory = path.resolve(appDirectory, "..");
const seedDatabasePath = path.join(bundleRootDirectory, "Initial Data", "jobmaximalist.db");
const browserInstallDirectoryName = "browsers";
const databaseFileName = "jobmaximalist.db";
const waitingPageFileName = "Ouverture de JobMAXIMALIST.html";
const appName = "JobMAXIMALIST";

function getAppDataDirectory() {
  const explicitDirectory = process.env.JOBMAX_APP_DATA_DIR?.trim();
  if (explicitDirectory) return path.resolve(explicitDirectory);

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), "AppData", "Local"), appName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }

  return path.join(process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share"), appName);
}

function toPrismaSqliteUrl(filePath) {
  const normalizedPath = path.resolve(filePath).replace(/\\/g, "/");
  return normalizedPath.startsWith("/") ? `file:${normalizedPath}` : `file:/${normalizedPath}`;
}

function getRuntimeLayout() {
  const appDataDirectory = getAppDataDirectory();
  const dataDirectory = path.join(appDataDirectory, "data");
  const databaseDirectory = path.join(appDataDirectory, "database");
  const browserDirectory = path.join(appDataDirectory, browserInstallDirectoryName);
  const logsDirectory = path.join(appDataDirectory, "logs");

  return {
    appDataDirectory,
    dataDirectory,
    databaseDirectory,
    databaseFilePath: path.join(databaseDirectory, databaseFileName),
    browserDirectory,
    logsDirectory,
    configFilePath: path.join(dataDirectory, "url-radar-config.json"),
    stateFilePath: path.join(dataDirectory, "url-radar-state.json"),
    waitingPagePath: path.join(appDataDirectory, waitingPageFileName),
    logFilePath: path.join(logsDirectory, "runtime.log")
  };
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.size;
  } catch {
    return 0;
  }
}

async function hasValidSqliteHeader(targetPath) {
  if (!(await pathExists(targetPath))) return false;

  let handle;
  try {
    handle = await fs.open(targetPath, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === 16 && buffer.toString("utf8", 0, 15) === "SQLite format 3";
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

async function appendLog(layout, message) {
  await ensureDirectory(layout.logsDirectory);
  await fs.appendFile(layout.logFilePath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

async function renameCorruptedJsonFile(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    JSON.parse(raw);
    return false;
  } catch (error) {
    if (!(await pathExists(targetPath))) return false;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.rename(targetPath, `${targetPath}.corrupted-${timestamp}`);
    return true;
  }
}

async function prepareWritableDirectories(layout) {
  await Promise.all([
    ensureDirectory(layout.appDataDirectory),
    ensureDirectory(layout.dataDirectory),
    ensureDirectory(layout.databaseDirectory),
    ensureDirectory(layout.browserDirectory),
    ensureDirectory(layout.logsDirectory)
  ]);
}

async function ensureHealthyDatabase(layout) {
  const exists = await pathExists(layout.databaseFilePath);
  const size = await getFileSize(layout.databaseFilePath);

  if (!exists || size === 0) {
    await ensureDirectory(path.dirname(layout.databaseFilePath));
    await fs.copyFile(seedDatabasePath, layout.databaseFilePath);
    return {
      copiedSeedDatabase: true,
      repairedDatabase: false
    };
  }

  if (await hasValidSqliteHeader(layout.databaseFilePath)) {
    return {
      copiedSeedDatabase: false,
      repairedDatabase: false
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await ensureDirectory(path.dirname(layout.databaseFilePath));
  await fs.rename(layout.databaseFilePath, `${layout.databaseFilePath}.corrupted-${timestamp}`);
  await fs.copyFile(seedDatabasePath, layout.databaseFilePath);
  return {
    copiedSeedDatabase: false,
    repairedDatabase: true
  };
}

function getPlaywrightEnvironment(layout) {
  return {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: layout.browserDirectory
  };
}

async function hasInstalledChromium(layout) {
  const playwright = require("playwright");

  try {
    const executablePath = playwright.chromium.executablePath();
    return Boolean(executablePath) && (await pathExists(executablePath));
  } catch {
    return false;
  }
}

async function ensureChromiumInstalled(layout) {
  if (await hasInstalledChromium(layout)) {
    return false;
  }

  await appendLog(layout, "Installing Chromium for Playwright.");

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve("playwright/cli"), "install", "chromium"], {
      cwd: appDirectory,
      env: getPlaywrightEnvironment(layout),
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      void appendLog(layout, chunk.toString("utf8").trim());
    });

    child.stderr.on("data", (chunk) => {
      void appendLog(layout, chunk.toString("utf8").trim());
    });

    child.on("exit", async (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      await appendLog(layout, `Chromium installation failed with code ${code ?? "unknown"}.`);
      reject(new Error("Chromium installation failed"));
    });

    child.on("error", reject);
  });

  return true;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findOpenPort() {
  for (let port = 3000; port <= 3010; port += 1) {
    if (await isPortFree(port)) return port;
  }

  throw new Error("No free port was found between 3000 and 3010.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(targetUrl, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(targetUrl, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if (response.ok) return;
    } catch {
      // keep waiting
    }

    await sleep(1000);
  }

  throw new Error("The local server did not become ready in time.");
}

function openWithSystem(targetPath) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", targetPath], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [targetPath], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function writeWaitingPage(layout, targetUrl) {
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ouverture de JobMAXIMALIST</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f2eb;
        color: #1f1a16;
        font-family: "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid rgba(74, 64, 57, 0.14);
        border-radius: 24px;
        background: #fffdfa;
        box-shadow: 0 12px 28px rgba(52, 42, 35, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.4rem;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.55;
      }
      code {
        font-family: Consolas, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Preparation de JobMAXIMALIST</h1>
      <p>Le premier demarrage peut prendre un peu plus de temps.</p>
      <p>L'application prepare ses donnees locales et peut telecharger son moteur de navigation.</p>
      <p>Quand tout est pret, JobMAXIMALIST s'ouvrira automatiquement sur <code>${escapeHtml(targetUrl)}</code>.</p>
      <p>Gardez Internet actif pendant cette preparation.</p>
    </main>
  </body>
</html>`;

  await fs.writeFile(layout.waitingPagePath, html, "utf8");
}

async function showErrorDialog(title, message) {
  if (process.platform === "win32") {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}')`
      ],
      { stdio: "ignore", detached: true }
    ).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("osascript", ["-e", `display dialog "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" buttons {"OK"} default button "OK"`], {
      stdio: "ignore",
      detached: true
    }).unref();
    return;
  }

  console.error(`${title}: ${message}`);
}

async function showInfoDialog(title, message) {
  if (process.platform === "win32") {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}')`
      ],
      { stdio: "ignore", detached: true }
    ).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("osascript", ["-e", `display dialog "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" buttons {"OK"} default button "OK"`], {
      stdio: "ignore",
      detached: true
    }).unref();
    return;
  }
}

function buildServerEnvironment(layout, port) {
  return {
    ...process.env,
    ...getPlaywrightEnvironment(layout),
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    JOBMAX_RUNTIME_MODE: "packaged",
    JOBMAX_APP_DATA_DIR: layout.appDataDirectory,
    DATABASE_URL: toPrismaSqliteUrl(layout.databaseFilePath)
  };
}

async function startServer(layout, port) {
  const logHandle = await fs.open(layout.logFilePath, "a");

  const child = spawn(process.execPath, [path.join(appDirectory, "server.js")], {
    cwd: appDirectory,
    env: buildServerEnvironment(layout, port),
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd]
  });

  child.unref();
  await logHandle.close();
}

async function runStartCommand() {
  const layout = getRuntimeLayout();
  await prepareWritableDirectories(layout);
  await appendLog(layout, "Starting JobMAXIMALIST runtime.");

  const { copiedSeedDatabase, repairedDatabase } = await ensureHealthyDatabase(layout);
  const repairedConfig = await renameCorruptedJsonFile(layout.configFilePath);
  const repairedState = await renameCorruptedJsonFile(layout.stateFilePath);
  const hasBrowser = await hasInstalledChromium(layout);
  const port = await findOpenPort();
  const targetUrl = `http://127.0.0.1:${port}`;

  const shouldShowWaitingPage = copiedSeedDatabase || repairedDatabase || repairedConfig || repairedState || !hasBrowser;
  if (shouldShowWaitingPage) {
    await writeWaitingPage(layout, targetUrl);
    openWithSystem(layout.waitingPagePath);
  }

  await ensureChromiumInstalled(layout);
  await startServer(layout, port);
  await waitForServer(targetUrl);
  openWithSystem(targetUrl);
}

async function runRepairCommand() {
  const layout = getRuntimeLayout();
  await prepareWritableDirectories(layout);

  const { copiedSeedDatabase, repairedDatabase } = await ensureHealthyDatabase(layout);
  const repairedConfig = await renameCorruptedJsonFile(layout.configFilePath);
  const repairedState = await renameCorruptedJsonFile(layout.stateFilePath);
  const installedBrowser = await ensureChromiumInstalled(layout);

  const changes = [];
  if (copiedSeedDatabase) changes.push("base locale recreee");
  if (repairedDatabase) changes.push("base locale reparee");
  if (repairedConfig) changes.push("configuration reset");
  if (repairedState) changes.push("historique local reset");
  if (installedBrowser) changes.push("moteur de navigation reinstalle");

  const message =
    changes.length > 0
      ? `Reparation terminee : ${changes.join(", ")}.`
      : "Aucune reparation n'etait necessaire.";

  await appendLog(layout, message);
  await showInfoDialog("JobMAXIMALIST", message);
}

async function runOpenDataCommand() {
  const layout = getRuntimeLayout();
  await prepareWritableDirectories(layout);
  openWithSystem(layout.appDataDirectory);
}

async function main() {
  const command = process.argv[2] ?? "start";

  try {
    if (command === "start") {
      await runStartCommand();
      return;
    }

    if (command === "repair") {
      await runRepairCommand();
      return;
    }

    if (command === "open-data") {
      await runOpenDataCommand();
      return;
    }

    throw new Error(`Unsupported command: ${command}`);
  } catch (error) {
    const layout = getRuntimeLayout();
    await prepareWritableDirectories(layout);
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    await appendLog(layout, message);
    await showErrorDialog("JobMAXIMALIST", message);
    process.exit(1);
  }
}

await main();

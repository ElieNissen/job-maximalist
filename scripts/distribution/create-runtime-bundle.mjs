import fs from "fs/promises";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function getArgument(name, fallback) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function resetDirectory(directoryPath) {
  await fs.rm(directoryPath, { recursive: true, force: true });
  await ensureDirectory(directoryPath);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyNodeRuntime(targetDirectory) {
  const nodeBinaryName = process.platform === "win32" ? "node.exe" : "node";
  const targetPath = path.join(targetDirectory, nodeBinaryName);
  await ensureDirectory(targetDirectory);
  await fs.copyFile(process.execPath, targetPath);
  if (process.platform !== "win32") {
    await fs.chmod(targetPath, 0o755);
  }
}

async function copyRequiredDirectory(sourcePath, targetPath) {
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Required runtime dependency is missing: ${path.relative(repoRoot, sourcePath)}`);
  }

  await ensureDirectory(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function copyRuntimeDependencies(targetNodeModulesDirectory) {
  const dependencies = [
    {
      sourcePath: path.join(repoRoot, "node_modules", "playwright"),
      targetPath: path.join(targetNodeModulesDirectory, "playwright")
    },
    {
      sourcePath: path.join(repoRoot, "node_modules", "playwright-core"),
      targetPath: path.join(targetNodeModulesDirectory, "playwright-core")
    },
    {
      sourcePath: path.join(repoRoot, "node_modules", "@prisma", "client"),
      targetPath: path.join(targetNodeModulesDirectory, "@prisma", "client")
    },
    {
      sourcePath: path.join(repoRoot, "node_modules", ".prisma", "client"),
      targetPath: path.join(targetNodeModulesDirectory, ".prisma", "client")
    }
  ];

  for (const dependency of dependencies) {
    await copyRequiredDirectory(dependency.sourcePath, dependency.targetPath);
  }
}

async function generateSeedDatabase(seedDatabasePath) {
  await ensureDirectory(path.dirname(seedDatabasePath));
  await fs.rm(seedDatabasePath, { force: true });

  const templateDatabasePath = path.join(repoRoot, "prisma", "dev.db");
  if (!(await pathExists(templateDatabasePath))) {
    throw new Error("Missing prisma/dev.db. Run `npm run prisma:push` once before packaging installers.");
  }

  const sourceDatabase = new DatabaseSync(templateDatabasePath, {
    open: true,
    readOnly: true
  });
  const targetDatabase = new DatabaseSync(seedDatabasePath);

  try {
    const schemaObjects = sourceDatabase
      .prepare(
        `SELECT type, name, sql
         FROM sqlite_master
         WHERE sql IS NOT NULL
           AND type IN ('table', 'index', 'trigger', 'view')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY
           CASE type
             WHEN 'table' THEN 0
             WHEN 'index' THEN 1
             WHEN 'trigger' THEN 2
             ELSE 3
           END,
           name`
      )
      .all();

    for (const object of schemaObjects) {
      targetDatabase.exec(`${object.sql};`);
    }
  } finally {
    targetDatabase.close();
    sourceDatabase.close();
  }
}

async function main() {
  const targetPlatform = getArgument("--platform", process.platform);
  const stageRoot = path.join(repoRoot, "dist", "_build", targetPlatform);
  const appRoot = path.join(stageRoot, "Application Files", "JobMAXIMALIST");
  const appDirectory = path.join(appRoot, "Application");
  const nodeRuntimeDirectory = path.join(appRoot, "Node Runtime");
  const initialDataDirectory = path.join(appRoot, "Initial Data");
  const standaloneDirectory = path.join(repoRoot, ".next", "standalone");
  const staticDirectory = path.join(repoRoot, ".next", "static");
  const publicDirectory = path.join(repoRoot, "public");
  const runtimeScriptSource = path.join(repoRoot, "scripts", "distribution", "runtime", "jobmaximalist-runtime.mjs");

  if (!(await pathExists(path.join(standaloneDirectory, "server.js")))) {
    throw new Error("Standalone build missing. Run `npm run build` first.");
  }

  await resetDirectory(stageRoot);
  await ensureDirectory(appDirectory);

  await fs.cp(standaloneDirectory, appDirectory, { recursive: true });
  await fs.cp(staticDirectory, path.join(appDirectory, ".next", "static"), { recursive: true });
  await fs.cp(publicDirectory, path.join(appDirectory, "public"), { recursive: true });
  await fs.copyFile(runtimeScriptSource, path.join(appDirectory, "jobmaximalist-runtime.mjs"));
  await copyRuntimeDependencies(path.join(appDirectory, "node_modules"));

  await copyNodeRuntime(nodeRuntimeDirectory);
  await generateSeedDatabase(path.join(initialDataDirectory, "jobmaximalist.db"));

  const metadata = {
    generatedAt: new Date().toISOString(),
    targetPlatform,
    nodeBinary: process.execPath
  };

  await fs.writeFile(path.join(stageRoot, "runtime-bundle-metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

  process.stdout.write(stageRoot);
}

main().catch((error) => {
  console.error("[JobMAXIMALIST] Runtime bundle creation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

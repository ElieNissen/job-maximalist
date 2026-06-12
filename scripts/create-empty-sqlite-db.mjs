import fs from "fs/promises";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getArgument(name) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return null;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createEmptyDatabase(outputPath) {
  const sourcePath = path.join(repoRoot, "prisma", "dev.db");
  const resolvedOutputPath = path.resolve(repoRoot, outputPath);

  if (!(await pathExists(sourcePath))) {
    throw new Error("Missing prisma/dev.db. Launch the regular app once before creating a test profile database.");
  }

  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.rm(resolvedOutputPath, { force: true });

  const sourceDatabase = new DatabaseSync(sourcePath, {
    open: true,
    readOnly: true
  });
  const targetDatabase = new DatabaseSync(resolvedOutputPath);

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

  process.stdout.write(resolvedOutputPath);
}

const outputPath = getArgument("--output");

if (!outputPath) {
  console.error("Usage: node scripts/create-empty-sqlite-db.mjs --output <database-path>");
  process.exit(1);
}

createEmptyDatabase(outputPath).catch((error) => {
  console.error("[JobMAXIMALIST] Empty database creation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

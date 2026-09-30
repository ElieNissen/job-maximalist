import fs from "fs/promises";
import path from "path";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { deterministicHash } from "@/lib/hash";
import { getRuntimeDataDirectory } from "@/lib/runtime-paths";
import { captureEvidence } from "@/lib/scraping-recipes";

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Connection = { browser: Browser; page: Page; timer: ReturnType<typeof setTimeout>; finishing: boolean };
const globalSessions = globalThis as typeof globalThis & { jobmaxSourceSessions?: Map<string, Connection>; jobmaxSessionOpening?: Set<string> };
const connections = globalSessions.jobmaxSourceSessions ??= new Map<string, Connection>();
const opening = globalSessions.jobmaxSessionOpening ??= new Set<string>();
const writes = new Map<string, Promise<unknown>>();
function mutateSession(url: string, operation: () => Promise<void>) {
  const origin = originOf(url);
  const next = (writes.get(origin) ?? Promise.resolve()).catch(() => undefined).then(operation);
  writes.set(origin, next);
  void next.finally(() => { if (writes.get(origin) === next) writes.delete(origin); }).catch(() => undefined);
  return next;
}
function originOf(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Adresse de site invalide.");
  return parsed.origin;
}
function sessionPath(url: string) { return path.join(getRuntimeDataDirectory(), "browser-sessions", `${deterministicHash(originOf(url))}.json`); }
async function readSession(url: string): Promise<SessionState | undefined> {
  try { return JSON.parse(await fs.readFile(sessionPath(url), "utf8")); } catch { return undefined; }
}
export async function newSourcePage(browser: Browser, url: string, options: BrowserContextOptions = {}) {
  const storageState = await readSession(url);
  return browser.newPage({ ...options, ...(storageState ? { storageState } : {}) });
}
export async function sourceSessionStatus(url: string): Promise<"opening" | "connecting" | "saved" | "none"> {
  const origin = originOf(url);
  if (opening.has(origin)) return "opening";
  if (connections.has(origin)) return "connecting";
  return await readSession(url) ? "saved" : "none";
}
export async function beginSourceConnection(url: string) {
  const origin = originOf(url);
  const existing = connections.get(origin);
  if (existing) { await existing.page.bringToFront(); return; }
  if (opening.has(origin)) return;
  opening.add(origin);
  let browser: Browser | undefined;
  try {
    const { chromium } = await import("playwright");
    // Visible only after the user's explicit "Se connecter" action. Passwords never enter the app or model.
    browser = await chromium.launch({ headless: false, timeout: 15000 });
    const page = await newSourcePage(browser, url);
    const timer = setTimeout(() => { void cancelSourceConnection(url); }, 10 * 60 * 1000);
    const connection = { browser, page, timer, finishing: false };
    connections.set(origin, connection);
    browser.on("disconnected", () => {
      clearTimeout(timer);
      if (connections.get(origin) === connection) connections.delete(origin);
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.bringToFront();
  } catch {
    await browser?.close().catch(() => undefined);
    throw new Error("Impossible d’ouvrir la fenêtre de connexion. Vérifie que Chromium est installé.");
  } finally { opening.delete(origin); }
}
export async function finishSourceConnection(url: string) {
  const connection = connections.get(originOf(url));
  if (!connection) throw new Error("Ouvre d’abord la fenêtre de connexion.");
  if (connection.finishing) throw new Error("Vérification de la connexion en cours.");
  connection.finishing = true;
  try {
    // Verify the configured search, not whichever SSO tab the user finished on.
    const evidence = await captureEvidence(connection.page, url);
    if (evidence.loginRequired || evidence.blocked) throw new Error("Le site demande encore une connexion ou une vérification. Termine-la dans la fenêtre ouverte, puis réessaie.");
    if (new URL(connection.page.url()).origin !== originOf(url)) throw new Error("La connexion n’est pas encore revenue sur le site demandé.");
    const state = await connection.page.context().storageState({ indexedDB: true });
    // The context is dedicated to this site and is never the user's everyday browser profile.
    await mutateSession(url, async () => {
      if (connections.get(originOf(url)) !== connection) throw new Error("Connexion annulée. Aucune session enregistrée.");
      await fs.mkdir(path.dirname(sessionPath(url)), { recursive: true, mode: 0o700 });
      await fs.writeFile(`${sessionPath(url)}.tmp`, JSON.stringify(state), { mode: 0o600 });
      await fs.rename(`${sessionPath(url)}.tmp`, sessionPath(url));
    });
    await cancelSourceConnection(url);
  } finally { connection.finishing = false; }
}
export async function cancelSourceConnection(url: string) {
  const origin = originOf(url);
  const connection = connections.get(origin);
  if (!connection) return;
  connections.delete(origin); clearTimeout(connection.timer);
  await connection.browser.close().catch(() => undefined);
}
export async function forgetSourceSession(url: string) {
  await cancelSourceConnection(url);
  await mutateSession(url, async () => {
    await fs.unlink(sessionPath(url)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    await fs.unlink(`${sessionPath(url)}.tmp`).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  });
}

import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ directory: "", config: { assistanceMode: "auto", urls: ["https://example.org/jobs/search"] }, capture: vi.fn(), extract: vi.fn(), close: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/runtime-paths", () => ({ getRuntimeDataDirectory: () => mocks.directory }));
vi.mock("@/lib/url-radar-config", () => ({ getUrlRadarConfig: async () => mocks.config }));
vi.mock("playwright", () => ({ chromium: { launch: async () => ({ newPage: async () => ({}), close: mocks.close }) } }));
vi.mock("@/lib/scraping-recipes", async (original) => ({ ...await original<typeof import("@/lib/scraping-recipes")>(), captureEvidence: mocks.capture, extractWithRecipe: mocks.extract }));

const url = "https://example.org/jobs/search";
const recipe = { version: 1, kind: "dom", container: "article", endpoint: "", title: "h2", company: ".company", location: "", url: "a", urlPrefix: "", description: "", date: "" };
const globals = globalThis as typeof globalThis & { jobmaxAssistance?: { tail: Promise<unknown> } };
const finish = async () => { await globals.jobmaxAssistance?.tail; };
beforeEach(async () => {
  delete globals.jobmaxAssistance; vi.resetModules(); vi.clearAllMocks();
  mocks.directory = await mkdtemp(path.join(os.tmpdir(), "jobmax-repair-"));
  mocks.config = { assistanceMode: "auto", urls: [url] };
  mocks.capture.mockResolvedValue({ html: "<article><h2>Designer</h2><a href='/jobs/12'>Apply</a></article>", text: "2 jobs", links: [], samples: [], hasJobs: true, empty: false, blocked: false });
  mocks.extract.mockResolvedValue([{ title: "Designer", url: "https://example.org/jobs/12" }]);
  mocks.close.mockResolvedValue(undefined);
  mocks.fetch.mockImplementation(async (endpoint: string) => new Response(JSON.stringify(endpoint.endsWith("/api/tags") ? { models: [{ name: "qwen3.5:4b" }] } : endpoint.endsWith("/api/chat") ? { message: { content: JSON.stringify(recipe) } } : {})));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(async () => { await finish(); vi.unstubAllGlobals(); await rm(mocks.directory, { recursive: true, force: true }); delete globals.jobmaxAssistance; });
describe("local repair lifecycle", () => {
  it("learns once, persists, reuses without inference and unloads the model", async () => {
    const api = await import("@/lib/local-assistance");
    const completed = vi.fn().mockResolvedValue(undefined);
    await api.scheduleRepair(url, false, completed); await finish();
    expect(completed).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(path.join(mocks.directory, "scraping-recipes.json"), "utf8"))[url].recipe).toEqual(recipe);
    const before = mocks.fetch.mock.calls.length;
    expect(await api.trySavedRecipe(url)).toHaveLength(1);
    expect(mocks.fetch.mock.calls).toHaveLength(before);
    const generation = mocks.fetch.mock.calls.find(([endpoint]) => endpoint.endsWith("/api/chat"));
    expect(JSON.parse(generation![1].body)).toMatchObject({ keep_alive: 0, model: "qwen3.5:4b" });
  });
  it("asks only when offers exist, and waits for manual approval", async () => {
    mocks.config.assistanceMode = "ask";
    const api = await import("@/lib/local-assistance");
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("needs_permission");
    await api.scheduleRepair(url, true, vi.fn()); await finish();
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("repaired");
  });
  it("does not ask or infer for genuinely empty pages", async () => {
    mocks.config.assistanceMode = "ask";
    mocks.capture.mockResolvedValue({ empty: true, blocked: false, hasJobs: false });
    const api = await import("@/lib/local-assistance");
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("empty");
  });
  it("does nothing with assistance disabled", async () => {
    mocks.config.assistanceMode = "off";
    const api = await import("@/lib/local-assistance");
    await api.scheduleRepair(url, true, vi.fn()); await finish();
    expect(mocks.capture).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves the working recipe on failed validation and respects cooldown", async () => {
    const api = await import("@/lib/local-assistance");
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    mocks.extract.mockResolvedValue([]);
    await api.scheduleRepair(url, true, vi.fn()); await finish();
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("failed");
    await api.trySavedRecipe(url);
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("incomplete");
    const before = mocks.capture.mock.calls.length;
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    expect(mocks.capture.mock.calls).toHaveLength(before);
    expect(JSON.parse(await readFile(path.join(mocks.directory, "scraping-recipes.json"), "utf8"))[url].recipe).toEqual(recipe);
  });
  it("requests reconnection for an expired session without invoking the model", async () => {
    const api = await import("@/lib/local-assistance");
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    mocks.capture.mockResolvedValue({ loginRequired: true, blocked: true, empty: false });
    const before = mocks.fetch.mock.calls.length;
    expect(await api.trySavedRecipe(url)).toBeNull();
    await api.scheduleRepair(url, false, vi.fn()); await finish();
    expect(mocks.fetch.mock.calls).toHaveLength(before);
    expect((await api.assistanceStatus()).sources[url]?.status).toBe("connection_required");
  });
});

"use client";

import { useEffect, useState } from "react";
import type { AtsConfig, PolitepolConfig } from "@/lib/types";

type AtsStatusResponse = {
  totalVisibleAtsJobs: number;
  totalAtsJobs: number;
  excludedReasons: Record<string, number>;
  statsBySource: Record<string, number>;
  runs: Array<{
    id: string;
    source: string;
    target: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    newCount: number;
    error: string | null;
  }>;
};

type AtsJobsResponse = {
  items: Array<{ id: string; title: string; company: string; location: string; url: string; source: string; postedAt: string; scrapedAt: string }>;
  total: number;
};

type AtsRefreshResponse = {
  ok: boolean;
  totalNew: number;
  summary?: Record<string, { newCount: number; errors: string[] }>;
  discovery?: Record<string, number>;
  error?: string;
};

type PolitepolStatusResponse = {
  totalVisible: number;
  totalInDb: number;
  excludedReasons: Record<string, number>;
  runs: Array<{
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    newCount: number;
    error: string | null;
  }>;
};

type PolitepolJobsResponse = {
  items: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    source: string;
    postedAt: string;
    scrapedAt: string;
    excludedReason: string | null;
  }>;
  total: number;
};

type PolitepolRefreshResponse = {
  ok: boolean;
  totalNew: number;
  summary?: Record<string, { newCount: number; errors: string[]; parsedCount: number }>;
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function AtsRadarTab() {
  const [config, setConfig] = useState<AtsConfig>({
    enabled: true,
    intervalMinutes: 60,
    sources: ["greenhouse", "lever", "smartrecruiters"],
    targets: [],
    autoDiscoveryEnabled: true,
    discoveryMaxTargetsPerSource: 20,
    discordWebhookUrl: ""
  });
  const [status, setStatus] = useState<AtsStatusResponse>({
    totalVisibleAtsJobs: 0,
    totalAtsJobs: 0,
    excludedReasons: {},
    statsBySource: {},
    runs: []
  });
  const [jobs, setJobs] = useState<AtsJobsResponse>({ items: [], total: 0 });
  const [lastRefresh, setLastRefresh] = useState<AtsRefreshResponse | null>(null);

  const [politepolConfig, setPolitepolConfig] = useState<PolitepolConfig>({
    enabled: true,
    intervalMinutes: 60,
    feedUrls: ["https://politepaul.com/fd/wglJ5MNWqwlq.json"]
  });
  const [politepolStatus, setPolitepolStatus] = useState<PolitepolStatusResponse>({
    totalVisible: 0,
    totalInDb: 0,
    excludedReasons: {},
    runs: []
  });
  const [politepolJobs, setPolitepolJobs] = useState<PolitepolJobsResponse>({ items: [], total: 0 });
  const [lastPolitepolRefresh, setLastPolitepolRefresh] = useState<PolitepolRefreshResponse | null>(null);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [politepolSaving, setPolitepolSaving] = useState(false);
  const [politepolRunning, setPolitepolRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [configRes, statusRes, jobsRes, ppConfigRes, ppStatusRes, ppJobsRes] = await Promise.all([
        fetch("/api/ats/config", { cache: "no-store" }),
        fetch("/api/ats/status", { cache: "no-store" }),
        fetch("/api/ats/jobs?page=1&pageSize=20", { cache: "no-store" }),
        fetch("/api/politepol/config", { cache: "no-store" }),
        fetch("/api/politepol/status", { cache: "no-store" }),
        fetch("/api/politepol/jobs?page=1&pageSize=20&includeExcluded=1", { cache: "no-store" })
      ]);

      if (configRes.ok) {
        const payload = await configRes.json();
        setConfig(payload);
      }
      if (statusRes.ok) {
        const payload = await statusRes.json();
        setStatus({
          totalVisibleAtsJobs: payload.totalVisibleAtsJobs ?? 0,
          totalAtsJobs: payload.totalAtsJobs ?? 0,
          excludedReasons: payload.excludedReasons ?? {},
          statsBySource: payload.statsBySource ?? {},
          runs: payload.runs ?? []
        });
      }
      if (jobsRes.ok) {
        const payload = await jobsRes.json();
        setJobs({ items: payload.items ?? [], total: payload.total ?? 0 });
      }
      if (ppConfigRes.ok) {
        setPolitepolConfig(await ppConfigRes.json());
      }
      if (ppStatusRes.ok) {
        const payload = await ppStatusRes.json();
        setPolitepolStatus({
          totalVisible: payload.totalVisible ?? 0,
          totalInDb: payload.totalInDb ?? 0,
          excludedReasons: payload.excludedReasons ?? {},
          runs: payload.runs ?? []
        });
      }
      if (ppJobsRes.ok) {
        const payload = await ppJobsRes.json();
        setPolitepolJobs({ items: payload.items ?? [], total: payload.total ?? 0 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    }
  }

  async function saveConfig() {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch("/api/ats/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error("Save config failed");
      setConfig(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save error");
    } finally {
      setSaving(false);
    }
  }

  async function savePolitepolConfig() {
    try {
      setPolitepolSaving(true);
      setError(null);
      const response = await fetch("/api/politepol/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(politepolConfig)
      });
      if (!response.ok) throw new Error("Save PolitePol config failed");
      setPolitepolConfig(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "PolitePol save error");
    } finally {
      setPolitepolSaving(false);
    }
  }

  async function runRefresh() {
    try {
      setRunning(true);
      setError(null);

      let response = await fetch("/api/ats/refresh", { method: "POST" });
      if (response.status === 404 || response.status === 405) {
        response = await fetch("/api/ats/refresh", { method: "GET" });
      }

      const payload = (await response.json()) as AtsRefreshResponse;
      setLastRefresh(payload);

      if (!payload?.ok) {
        throw new Error(payload?.error ?? "ATS refresh failed");
      }

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh error");
    } finally {
      setRunning(false);
    }
  }

  async function runPolitepolRefresh() {
    try {
      setPolitepolRunning(true);
      setError(null);

      let response = await fetch("/api/politepol/refresh", { method: "POST" });
      if (response.status === 404 || response.status === 405) {
        response = await fetch("/api/politepol/refresh", { method: "GET" });
      }

      const payload = (await response.json()) as PolitepolRefreshResponse;
      setLastPolitepolRefresh(payload);

      if (!payload?.ok) {
        throw new Error(payload?.error ?? "PolitePol refresh failed");
      }

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PolitePol refresh error");
    } finally {
      setPolitepolRunning(false);
    }
  }

  async function testDiscord() {
    try {
      setError(null);
      const response = await fetch("/api/ats/notify/test", { method: "POST" });
      const payload = await response.json();
      if (!payload?.ok) throw new Error(payload?.error ?? "Discord test failed");
      alert("Discord notification sent successfully");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discord test error");
    }
  }

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <strong>ATS Jobs visibles: {status.totalVisibleAtsJobs}</strong>
        <button type="button" onClick={runRefresh} disabled={running} style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "white", cursor: "pointer" }}>
          {running ? "Refresh ATS en cours..." : "Refresh ATS maintenant"}
        </button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <strong>Diagnostic ATS</strong>
        <div style={{ marginTop: 8 }}>Total ATS en base: {status.totalAtsJobs}</div>
        <div>Visibles apres filtres: {status.totalVisibleAtsJobs}</div>
        <div style={{ marginTop: 8 }}>Par source: {Object.entries(status.statsBySource).map(([k, v]) => `${k}: ${v}`).join(" | ") || "-"}</div>
        <div style={{ marginTop: 8 }}>
          Exclusions: {Object.entries(status.excludedReasons).map(([k, v]) => `${k}: ${v}`).join(" | ") || "aucune"}
        </div>
        {lastRefresh ? (
          <div style={{ marginTop: 10 }}>
            Dernier refresh ATS: +{lastRefresh.totalNew} nouveaux
            <div>Discovery: {Object.entries(lastRefresh.discovery ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | ") || "-"}</div>
            <div>
              Summary: {Object.entries(lastRefresh.summary ?? {}).map(([k, v]) => `${k}: +${v.newCount} (errors: ${v.errors.length})`).join(" | ") || "-"}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>PolitePol Feeds</h2>
        <div style={{ marginBottom: 8 }}>Total PolitePol en base: {politepolStatus.totalInDb}</div>
        <div style={{ marginBottom: 8 }}>Visibles apres filtres: {politepolStatus.totalVisible}</div>
        <div style={{ marginBottom: 12 }}>
          Exclusions PolitePol: {Object.entries(politepolStatus.excludedReasons).map(([k, v]) => `${k}: ${v}`).join(" | ") || "aucune"}
        </div>

        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={politepolConfig.enabled}
            onChange={(e) => setPolitepolConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          {" "}Enabled
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Refresh interval (minutes)
          <input
            type="number"
            value={politepolConfig.intervalMinutes}
            min={15}
            onChange={(e) => setPolitepolConfig((prev) => ({ ...prev, intervalMinutes: Number(e.target.value) || 60 }))}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <div style={{ marginTop: 12, marginBottom: 8 }}>Feed URLs (1 URL par ligne)</div>
        <textarea
          rows={5}
          value={politepolConfig.feedUrls.join("\n")}
          onChange={(e) =>
            setPolitepolConfig((prev) => ({
              ...prev,
              feedUrls: e.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            }))
          }
          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="button" onClick={savePolitepolConfig} disabled={politepolSaving} style={{ padding: "8px 12px" }}>
            {politepolSaving ? "Saving..." : "Save PolitePol config"}
          </button>
          <button type="button" onClick={runPolitepolRefresh} disabled={politepolRunning} style={{ padding: "8px 12px" }}>
            {politepolRunning ? "Refreshing..." : "Refresh PolitePol maintenant"}
          </button>
        </div>

        {lastPolitepolRefresh ? (
          <div style={{ marginTop: 10 }}>
            Dernier refresh PolitePol: +{lastPolitepolRefresh.totalNew} nouveaux
            <div>
              Summary: {Object.entries(lastPolitepolRefresh.summary ?? {}).map(([k, v]) => `${k}: +${v.newCount} (parsed: ${v.parsedCount}, errors: ${v.errors.length})`).join(" | ") || "-"}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {politepolStatus.runs.slice(0, 5).map((run) => (
            <div key={run.id} style={{ fontSize: 13 }}>
              {run.status} | +{run.newCount} | started: {formatDate(run.startedAt)} | ended: {formatDate(run.endedAt)}
              {run.error ? <div style={{ color: "#a11" }}>error: {run.error}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Derniers jobs PolitePol (brut)</h3>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
          Cette liste montre les derniers jobs ingeres, meme exclus par les filtres. Raison d'exclusion affichee si applicable.
        </div>
        <div style={{ marginBottom: 8 }}>Total brut: {politepolJobs.total}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {politepolJobs.items.length === 0 ? <div>Aucun job PolitePol en base.</div> : null}
          {politepolJobs.items.map((job) => (
            <article key={job.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{job.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{job.company} | {job.location} | {job.source}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Publiee: {formatDate(job.postedAt)} | Ajoutee: {formatDate(job.scrapedAt)}
              </div>
              {job.excludedReason ? <div style={{ color: "#a11", fontSize: 13 }}>Exclu: {job.excludedReason}</div> : <div style={{ color: "#0a6", fontSize: 13 }}>Visible</div>}
              <a href={job.url} target="_blank" rel="noreferrer">Open job</a>
            </article>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>ATS Radar Configuration</h2>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          {" "}Enabled
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Refresh interval (minutes)
          <input
            type="number"
            value={config.intervalMinutes}
            min={15}
            onChange={(e) => setConfig((prev) => ({ ...prev, intervalMinutes: Number(e.target.value) || 60 }))}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={config.autoDiscoveryEnabled}
            onChange={(e) => setConfig((prev) => ({ ...prev, autoDiscoveryEnabled: e.target.checked }))}
          />
          {" "}Auto-discovery ATS targets (recommended)
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Max discovered targets per source
          <input
            type="number"
            value={config.discoveryMaxTargetsPerSource}
            min={5}
            max={50}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                discoveryMaxTargetsPerSource: Number(e.target.value) || 20
              }))
            }
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <div style={{ marginBottom: 8 }}>Sources</div>
        {(["greenhouse", "lever", "smartrecruiters"] as const).map((source) => (
          <label key={source} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={config.sources.includes(source)}
              onChange={(e) => {
                setConfig((prev) => {
                  const sources = e.target.checked
                    ? Array.from(new Set([...prev.sources, source]))
                    : prev.sources.filter((s) => s !== source);
                  return { ...prev, sources };
                });
              }}
            />
            {" "}{source}
          </label>
        ))}

        <div style={{ marginTop: 12, marginBottom: 8 }}>Manual targets (1 URL per line, optional)</div>
        <textarea
          rows={6}
          value={config.targets.join("\n")}
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              targets: e.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            }))
          }
          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
        />

        <div style={{ marginTop: 12, marginBottom: 8 }}>Discord webhook URL</div>
        <input
          type="text"
          value={config.discordWebhookUrl ?? ""}
          onChange={(e) => setConfig((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="button" onClick={saveConfig} disabled={saving} style={{ padding: "8px 12px" }}>
            {saving ? "Saving..." : "Save config"}
          </button>
          <button type="button" onClick={testDiscord} style={{ padding: "8px 12px" }}>
            Test Discord
          </button>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {status.runs.slice(0, 10).map((run) => (
            <div key={run.id} style={{ fontSize: 14 }}>
              {run.source} | {run.status} | +{run.newCount} | {run.target}
              <div style={{ color: "var(--muted)" }}>started: {formatDate(run.startedAt)} | ended: {formatDate(run.endedAt)}</div>
              {run.error ? <div style={{ color: "#a11" }}>error: {run.error}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {jobs.items.map((job) => (
          <article key={job.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <h3 style={{ margin: "0 0 6px 0" }}>{job.title}</h3>
            <div style={{ color: "var(--muted)", marginBottom: 6 }}>{job.company} | {job.location} | {job.source}</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
              Publiee: {formatDate(job.postedAt)} | Ajoutee: {formatDate(job.scrapedAt)}
            </div>
            <a href={job.url} target="_blank" rel="noreferrer">Open job</a>
          </article>
        ))}
      </div>

      {error ? <div style={{ color: "#a11", marginTop: 12 }}>Error: {error}</div> : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JobSource } from "@/lib/types";

type Job = {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  contractType: "CDI" | "CDD" | "OTHER";
  url: string;
  postedAt: string;
  viewed: boolean;
  saved: boolean;
};

type ConnectorStatus = {
  source: JobSource;
  lastStatus: "SUCCESS" | "PARTIAL" | "FAILED" | "NEVER";
  lastError: string | null;
  lastRunAt: string | null;
};

type JobApiResponse = {
  items: Job[];
  total: number;
  newSinceLastRefresh: number;
  lastRefreshAt: string | null;
  lastRunId: string | null;
  memory: { allJobs: number; saved: number; viewed: number };
  connectors: ConnectorStatus[];
};

type RefreshResponse = {
  ok: boolean;
  totalNew: number;
  summary: Record<string, { newCount: number; errors: string[] }>;
  error?: string;
};

const UI_FILTERS = {
  keywordsInclude: ["Product Designer", "UX/UI Designer", "UX Designer"],
  keywordsExclude: ["senior", "lead", "manager", "engineer", "brand", "intern", "stage", "alternance"],
  locations: ["Ile-de-France", "Paris"],
  contractTypes: ["CDI", "CDD"],
  sources: [
    "linkedin",
    "wttj",
    "indeed",
    "hellowork",
    "service_public",
    "hiring_cafe",
    "licorne_society",
    "career_sites",
    "politepol"
  ] as JobSource[]
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function JobRadarTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<JobApiResponse>({
    items: [],
    total: 0,
    newSinceLastRefresh: 0,
    lastRefreshAt: null,
    lastRunId: null,
    memory: { allJobs: 0, saved: 0, viewed: 0 },
    connectors: []
  });
  const lastNotifiedRunId = useRef<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("keywordsInclude", UI_FILTERS.keywordsInclude.join(","));
    params.set("keywordsExclude", UI_FILTERS.keywordsExclude.join(","));
    params.set("locations", UI_FILTERS.locations.join(","));
    params.set("contractTypes", UI_FILTERS.contractTypes.join(","));
    params.set("sources", UI_FILTERS.sources.join(","));
    params.set("page", "1");
    params.set("pageSize", "30");
    params.set("postedSinceHours", "168");
    return params.toString();
  }, []);

  async function fetchJobs() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/jobs?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossible de charger les offres");

      const data: JobApiResponse = await response.json();
      setJobs(data.items);
      setMeta(data);

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        data.newSinceLastRefresh > 0 &&
        data.lastRunId &&
        data.lastRunId !== lastNotifiedRunId.current
      ) {
        new Notification("Nouvelles offres", {
          body: `${data.newSinceLastRefresh} nouvelles offres detectees.`
        });
        lastNotifiedRunId.current = data.lastRunId;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function refreshNow() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/jobs/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: UI_FILTERS.sources })
      });
      const payload = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Refresh failed");
      }
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  async function updateStatus(id: string, viewed: boolean, saved: boolean) {
    await fetch(`/api/jobs/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewed, saved })
    });
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, viewed, saved } : job)));
  }

  useEffect(() => {
    fetchJobs();
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const poll = setInterval(fetchJobs, 5 * 60 * 1000);
    const hourlyRefresh = setInterval(refreshNow, 60 * 60 * 1000);
    return () => {
      clearInterval(poll);
      clearInterval(hourlyRefresh);
    };
  }, [query]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div>
          <div>Offres visibles: {meta.total}</div>
          <div>Nouvelles au dernier refresh: {meta.newSinceLastRefresh}</div>
          <div>Dernier refresh: {formatDate(meta.lastRefreshAt)}</div>
        </div>
        <button type="button" onClick={refreshNow} disabled={loading} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>
          {loading ? "Chargement..." : "Refresh maintenant"}
        </button>
      </div>

      {error ? <div style={{ color: "#a11", marginBottom: 12 }}>Erreur: {error}</div> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {jobs.map((job) => (
          <article key={job.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, opacity: job.viewed ? 0.75 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 style={{ margin: "0 0 6px 0" }}>{job.title}</h3>
                <div style={{ color: "var(--muted)" }}>{job.company} | {job.location}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>
                <div>{job.source.toUpperCase()}</div>
                <div>{job.contractType}</div>
                <div>{formatDate(job.postedAt)}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <a href={job.url} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none" }}>Ouvrir l'offre</a>
              <button type="button" onClick={() => updateStatus(job.id, !job.viewed, job.saved)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "white", cursor: "pointer" }}>
                {job.viewed ? "Marquer non vue" : "Marquer vue"}
              </button>
              <button type="button" onClick={() => updateStatus(job.id, job.viewed, !job.saved)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: job.saved ? "#d8efe5" : "white", cursor: "pointer" }}>
                {job.saved ? "Retirer sauvegarde" : "Sauvegarder"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

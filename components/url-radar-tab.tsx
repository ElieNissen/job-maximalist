"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { JobsColumn } from "@/components/url-radar/jobs-column";
import { OnboardingModal } from "@/components/url-radar/onboarding-modal";
import { SecondaryPanel } from "@/components/url-radar/secondary-panel";
import { MainTabSwitch, SectionTabs } from "@/components/url-radar/section-tabs";
import { SourceFilterBar } from "@/components/url-radar/source-filter-bar";
import type {
  JobCluster,
  MainTab,
  SourceFilterOption,
  UrlRadarConfig,
  UrlRadarJobsResponse,
  UrlRadarRefreshResponse,
  UrlRadarStatusResponse,
  UtilitySection
} from "@/components/url-radar/types";
import { buildSourceOptions, clusterJobs, sourceMatchesFilter } from "@/components/url-radar/utils";
import { cloneUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";

const JOBS_ENDPOINT = "/api/url-radar/jobs?page=1&pageSize=500&includeExcluded=1";
const PAGE_ENTRANCE_DURATION_MS = 1240;
const SOURCE_TRANSITION_DURATION_MS = 340;
const TAB_ENTRANCE_DURATION_MS = 1240;

type ThemeMode = "light" | "dark";
type EntranceState = "preparing" | "entering" | "settled";
type SourceTransitionDirection = "forward" | "backward";
type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> };
};

const EMPTY_CONFIG: UrlRadarConfig = {
  enabled: true,
  intervalMinutes: 60,
  urls: [""],
  filters: cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
  removedUrlsHistory: [],
  onboardingCompletedAt: null,
  onboardingDismissedAt: null
};

const EMPTY_JOBS: UrlRadarJobsResponse = {
  items: [],
  total: 0,
  newSinceLastRefresh: 0,
  lastRefreshAt: null,
  lastRunStartedAt: null,
  lastRunId: null,
  memory: { allJobs: 0, saved: 0, viewed: 0 }
};

const EMPTY_STATUS: UrlRadarStatusResponse = {
  totalInDb: 0,
  totalVisible: 0,
  excludedReasons: {},
  lastRunSummary: {},
  lastRunAt: null,
  lastRunStartedAt: null,
  runs: []
};

function normalizeConfig(config: UrlRadarConfig): UrlRadarConfig {
  return {
    ...config,
    urls: config.urls.length > 0 ? config.urls : [""],
    filters: cloneUrlRadarFilters(config.filters ?? URL_RADAR_DEFAULT_FILTERS),
    removedUrlsHistory: Array.isArray(config.removedUrlsHistory) ? config.removedUrlsHistory : [],
    onboardingCompletedAt: config.onboardingCompletedAt ?? null,
    onboardingDismissedAt: config.onboardingDismissedAt ?? null,
    isOnboardingTestProfile: config.isOnboardingTestProfile
  };
}

function getSourceFilterIndex(options: SourceFilterOption[], filter: string | null): number {
  if (!filter) return 0;
  const optionIndex = options.findIndex((option) => option.key === filter);
  return optionIndex >= 0 ? optionIndex + 1 : 0;
}

function getSourceTransitionDirection(options: SourceFilterOption[], previousFilter: string | null, nextFilter: string | null): SourceTransitionDirection {
  const previousIndex = getSourceFilterIndex(options, previousFilter);
  const nextIndex = getSourceFilterIndex(options, nextFilter);
  return nextIndex >= previousIndex ? "forward" : "backward";
}

export default function UrlRadarTab() {
  const [config, setConfig] = useState<UrlRadarConfig>(EMPTY_CONFIG);
  const [jobsData, setJobsData] = useState<UrlRadarJobsResponse>(EMPTY_JOBS);
  const [status, setStatus] = useState<UrlRadarStatusResponse>(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [entranceState, setEntranceState] = useState<EntranceState>("preparing");
  const [tabEntranceActive, setTabEntranceActive] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("visible");
  const [visibleSourceFilter, setVisibleSourceFilter] = useState<string | null>(null);
  const [excludedSourceFilter, setExcludedSourceFilter] = useState<string | null>(null);
  const [utilitySection, setUtilitySection] = useState<UtilitySection | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<"wizard" | "setup">("wizard");
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] = useState(false);
  const [testOnboardingReopenHandled, setTestOnboardingReopenHandled] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const lastNotifiedRunId = useRef<string | null>(null);
  const tabEntranceTimeoutRef = useRef<number | null>(null);

  const visibleItems = useMemo(() => jobsData.items.filter((job) => !job.excludedReason), [jobsData.items]);
  const excludedItems = useMemo(() => jobsData.items.filter((job) => Boolean(job.excludedReason)), [jobsData.items]);
  const visibleClusters = useMemo(() => clusterJobs(visibleItems), [visibleItems]);
  const excludedClusters = useMemo(() => clusterJobs(excludedItems), [excludedItems]);
  const configuredSourceUrls = useMemo(() => config.urls.map((url) => url.trim()).filter(Boolean), [config.urls]);
  const hasConfiguredSourceUrls = configuredSourceUrls.length > 0;
  const visibleSourceOptions = useMemo(() => buildSourceOptions(visibleClusters), [visibleClusters]);
  const excludedSourceOptions = useMemo(() => buildSourceOptions(excludedClusters, configuredSourceUrls), [configuredSourceUrls, excludedClusters]);

  const filteredVisibleClusters = useMemo(
    () => visibleClusters.filter((cluster) => sourceMatchesFilter(cluster, visibleSourceFilter)),
    [visibleClusters, visibleSourceFilter]
  );
  const filteredExcludedClusters = useMemo(
    () => excludedClusters.filter((cluster) => sourceMatchesFilter(cluster, excludedSourceFilter)),
    [excludedClusters, excludedSourceFilter]
  );

  const { newClusters, olderClusters } = useMemo(() => {
    const start = jobsData.lastRunStartedAt ? new Date(jobsData.lastRunStartedAt).getTime() : null;
    const end = jobsData.lastRefreshAt ? new Date(jobsData.lastRefreshAt).getTime() : null;

    const fresh: JobCluster[] = [];
    const older: JobCluster[] = [];

    for (const cluster of filteredVisibleClusters) {
      const seenTime = new Date(cluster.firstSeenAt).getTime();
      const isNew = start !== null && end !== null && seenTime >= start && seenTime <= end;
      if (isNew) fresh.push(cluster);
      else older.push(cluster);
    }

    return { newClusters: fresh, olderClusters: older };
  }, [filteredVisibleClusters, jobsData.lastRefreshAt, jobsData.lastRunStartedAt]);

  const loadAll = useCallback(async () => {
    try {
      const [configRes, jobsRes, statusRes] = await Promise.all([
        fetch("/api/url-radar/config", { cache: "no-store" }),
        fetch(JOBS_ENDPOINT, { cache: "no-store" }),
        fetch("/api/url-radar/status", { cache: "no-store" })
      ]);

      if (configRes.ok) {
        const nextConfig = (await configRes.json()) as UrlRadarConfig;
        setConfig(normalizeConfig(nextConfig));
      }

      if (jobsRes.ok) {
        const payload = await jobsRes.json();
        const nextJobs: UrlRadarJobsResponse = {
          items: (payload.items ?? []).map((item: UrlRadarJobsResponse["items"][number]) => ({
            ...item,
            excludedKeywords: Array.isArray(item.excludedKeywords) ? item.excludedKeywords : []
          })),
          total: payload.total ?? 0,
          newSinceLastRefresh: payload.newSinceLastRefresh ?? 0,
          lastRefreshAt: payload.lastRefreshAt ?? null,
          lastRunStartedAt: payload.lastRunStartedAt ?? null,
          lastRunId: payload.lastRunId ?? null,
          memory: payload.memory ?? { allJobs: 0, saved: 0, viewed: 0 }
        };
        setJobsData(nextJobs);

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          nextJobs.newSinceLastRefresh > 0 &&
          nextJobs.lastRunId &&
          nextJobs.lastRunId !== lastNotifiedRunId.current
        ) {
          new Notification("JobMAXIMALIST - Nouvelles offres", {
            body: `${nextJobs.newSinceLastRefresh} nouvelles offres détectées.`
          });
          lastNotifiedRunId.current = nextJobs.lastRunId;
        }
      }

      if (statusRes.ok) {
        const payload = await statusRes.json();
        setStatus({
          totalInDb: payload.totalInDb ?? 0,
          totalVisible: payload.totalVisible ?? 0,
          excludedReasons: payload.excludedReasons ?? {},
          lastRunSummary: payload.lastRunSummary ?? {},
          lastRunAt: payload.lastRunAt ?? null,
          lastRunStartedAt: payload.lastRunStartedAt ?? null,
          runs: payload.runs ?? []
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Load failed");
    } finally {
      setHasLoadedOnce(true);
    }
  }, []);

  const refreshNow = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let response = await fetch("/api/url-radar/refresh", { method: "POST" });
      if (response.status === 404 || response.status === 405) {
        response = await fetch("/api/url-radar/refresh", { method: "GET" });
      }

      const payload = (await response.json()) as UrlRadarRefreshResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Refresh URL Radar failed");
      await loadAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  const saveConfig = useCallback(
    async (nextConfig: UrlRadarConfig) => {
      try {
        setSaving(true);
        setError(null);
        const cleanedUrls = nextConfig.urls.map((url) => url.trim()).filter(Boolean);
        const response = await fetch("/api/url-radar/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...nextConfig, urls: cleanedUrls })
        });
        if (!response.ok) throw new Error("Save failed");
        const savedConfig = (await response.json()) as UrlRadarConfig;
        setConfig(normalizeConfig(savedConfig));
        await loadAll();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadAll]
  );

  const updateClusterStatus = useCallback(async (cluster: JobCluster, viewed: boolean, saved: boolean) => {
    const clusterIds = new Set(cluster.ids);
    const previousViewed = cluster.viewed;
    const previousSaved = cluster.saved;

    setError(null);
    setJobsData((prev) => ({
      ...prev,
      items: prev.items.map((job) => (clusterIds.has(job.id) ? { ...job, viewed, saved } : job))
    }));

    try {
      const responses = await Promise.all(
        cluster.ids.map((id) =>
          fetch(`/api/url-radar/jobs/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewed, saved })
          })
        )
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("Status update failed");
      }
    } catch (cause) {
      setJobsData((prev) => ({
        ...prev,
        items: prev.items.map((job) => (clusterIds.has(job.id) ? { ...job, viewed: previousViewed, saved: previousSaved } : job))
      }));
      setError(cause instanceof Error ? cause.message : "Status update failed");
    }
  }, []);

  const markClusterOpened = useCallback(
    (cluster: JobCluster) => {
      void updateClusterStatus(cluster, true, cluster.saved);
    },
    [updateClusterStatus]
  );

  const toggleSaved = useCallback(
    (cluster: JobCluster) => updateClusterStatus(cluster, cluster.viewed, !cluster.saved),
    [updateClusterStatus]
  );

  const toggleUtilitySection = useCallback((section: UtilitySection) => {
    setUtilitySection((prev) => (prev === section ? null : section));
  }, []);

  const openOnboarding = useCallback(() => {
    setUtilitySection(null);
    setOnboardingDismissedThisSession(false);
    setOnboardingMode("setup");
    setOnboardingOpen(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissedThisSession(true);
    setOnboardingOpen(false);
    void saveConfig({
      ...config,
      onboardingDismissedAt: new Date().toISOString()
    });
  }, [config, saveConfig]);

  const completeOnboarding = useCallback(
    async (nextConfig: UrlRadarConfig) => {
      const saved = await saveConfig(nextConfig);
      if (!saved) return false;

      setOnboardingDismissedThisSession(false);
      setOnboardingOpen(false);
      await refreshNow();
      return true;
    },
    [refreshNow, saveConfig]
  );

  const updateMainTab = useCallback(
    (nextTab: MainTab) => {
      if (nextTab === mainTab) return;

      setMainTab(nextTab);

      if (!hasLoadedOnce) return;
      if (tabEntranceTimeoutRef.current !== null) {
        window.clearTimeout(tabEntranceTimeoutRef.current);
      }

      setTabEntranceActive(true);
      tabEntranceTimeoutRef.current = window.setTimeout(() => {
        setTabEntranceActive(false);
        tabEntranceTimeoutRef.current = null;
      }, TAB_ENTRANCE_DURATION_MS);
    },
    [hasLoadedOnce, mainTab]
  );

  const runSourceFilterTransition = useCallback(
    (direction: SourceTransitionDirection, applyFilterChange: () => void) => {
      if (typeof document === "undefined" || !hasLoadedOnce) {
        applyFilterChange();
        return;
      }

      const root = document.documentElement;
      const clearTransitionDirection = (expectedValue: string) => {
        if (root.dataset.radarSourceTransition === expectedValue) {
          delete root.dataset.radarSourceTransition;
        }
      };
      const viewTransitionDocument = document as ViewTransitionDocument;

      if (viewTransitionDocument.startViewTransition) {
        const transitionValue = direction;
        root.dataset.radarSourceTransition = transitionValue;

        try {
          const transition = viewTransitionDocument.startViewTransition(() => {
            flushSync(applyFilterChange);
          });
          transition.finished.then(
            () => clearTransitionDirection(transitionValue),
            () => clearTransitionDirection(transitionValue)
          );
          return;
        } catch {
          clearTransitionDirection(transitionValue);
        }
      }

      const fallbackTransitionValue = `${direction}-fallback`;
      root.dataset.radarSourceTransition = fallbackTransitionValue;
      applyFilterChange();
      window.setTimeout(() => clearTransitionDirection(fallbackTransitionValue), SOURCE_TRANSITION_DURATION_MS);
    },
    [hasLoadedOnce]
  );

  const updateVisibleSourceFilter = useCallback(
    (nextFilter: string | null) => {
      if (nextFilter === visibleSourceFilter) return;
      const direction = getSourceTransitionDirection(visibleSourceOptions, visibleSourceFilter, nextFilter);
      runSourceFilterTransition(direction, () => setVisibleSourceFilter(nextFilter));
    },
    [runSourceFilterTransition, visibleSourceFilter, visibleSourceOptions]
  );

  const updateExcludedSourceFilter = useCallback(
    (nextFilter: string | null) => {
      if (nextFilter === excludedSourceFilter) return;
      const direction = getSourceTransitionDirection(excludedSourceOptions, excludedSourceFilter, nextFilter);
      runSourceFilterTransition(direction, () => setExcludedSourceFilter(nextFilter));
    },
    [excludedSourceFilter, excludedSourceOptions, runSourceFilterTransition]
  );

  useEffect(() => {
    loadAll();
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [loadAll]);

  useEffect(() => {
    const refreshStatus = window.setInterval(loadAll, 5 * 60 * 1000);

    return () => {
      window.clearInterval(refreshStatus);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!config.enabled) return undefined;

    const intervalMs = Math.max(30, config.intervalMinutes) * 60 * 1000;
    const scheduledRefresh = window.setInterval(refreshNow, intervalMs);

    return () => {
      window.clearInterval(scheduledRefresh);
    };
  }, [config.enabled, config.intervalMinutes, refreshNow]);

  useEffect(() => {
    if (!hasLoadedOnce) return undefined;

    setEntranceState("entering");
    const timeout = window.setTimeout(() => setEntranceState("settled"), PAGE_ENTRANCE_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [hasLoadedOnce]);

  useEffect(() => {
    return () => {
      if (tabEntranceTimeoutRef.current !== null) {
        window.clearTimeout(tabEntranceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (visibleSourceFilter && !visibleSourceOptions.some((option) => option.key === visibleSourceFilter)) {
      setVisibleSourceFilter(null);
    }
  }, [visibleSourceFilter, visibleSourceOptions]);

  useEffect(() => {
    if (excludedSourceFilter && !excludedSourceOptions.some((option) => option.key === excludedSourceFilter)) {
      setExcludedSourceFilter(null);
    }
  }, [excludedSourceFilter, excludedSourceOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem("url-radar-theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setThemeMode(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("url-radar-theme", themeMode);

    const previousOverflow = document.body.style.overflow;
    if (utilitySection || (onboardingOpen && onboardingMode !== "wizard")) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [onboardingMode, onboardingOpen, utilitySection, themeMode]);

  useEffect(() => {
    if (!hasLoadedOnce || utilitySection) return;

    const forceTestOnboarding =
      typeof window !== "undefined" &&
      config.isOnboardingTestProfile === true &&
      new URLSearchParams(window.location.search).get("onboarding") === "1" &&
      !testOnboardingReopenHandled;

    if (forceTestOnboarding) {
      setOnboardingMode("wizard");
      setOnboardingOpen(true);
      setTestOnboardingReopenHandled(true);
      return;
    }

    if (!hasConfiguredSourceUrls && !config.onboardingCompletedAt && !config.onboardingDismissedAt && !onboardingDismissedThisSession) {
      setOnboardingMode("wizard");
      setOnboardingOpen(true);
    }
  }, [
    config.isOnboardingTestProfile,
    config.onboardingCompletedAt,
    config.onboardingDismissedAt,
    hasConfiguredSourceUrls,
    hasLoadedOnce,
    onboardingDismissedThisSession,
    testOnboardingReopenHandled,
    utilitySection
  ]);

  if (onboardingOpen && onboardingMode === "wizard") {
    return <OnboardingModal config={config} mode={onboardingMode} saving={saving} onComplete={completeOnboarding} onDismiss={dismissOnboarding} />;
  }

  return (
    <div className="radar-shell" data-ui-variant="editorial-board">
      <div className="radar-navigation-band">
        <div className="radar-navigation-shell">
          <SectionTabs
            loading={loading}
            onRefresh={refreshNow}
            openUtilitySection={utilitySection}
            onToggleUtilitySection={toggleUtilitySection}
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
          />
        </div>
      </div>

      <SecondaryPanel
        openSection={utilitySection}
        onClose={() => setUtilitySection(null)}
        config={config}
        jobs={jobsData.items}
        status={status}
        saving={saving}
        onSaveConfig={saveConfig}
      />

      {onboardingOpen ? <OnboardingModal config={config} mode={onboardingMode} saving={saving} onComplete={completeOnboarding} onDismiss={dismissOnboarding} /> : null}

      <div className={["radar-content-shell", hasLoadedOnce ? "is-ready" : "is-preparing", entranceState === "entering" ? "is-entering" : "", entranceState === "settled" ? "has-entered" : "", tabEntranceActive ? "is-tab-switching" : ""].filter(Boolean).join(" ")}>
        <div className="radar-primary-filters">
          <MainTabSwitch currentTab={mainTab} onChange={updateMainTab} />
        </div>

        <div key={mainTab} className="radar-main-panel">
          <SourceFilterBar
            options={mainTab === "visible" ? visibleSourceOptions : excludedSourceOptions}
            activeFilter={mainTab === "visible" ? visibleSourceFilter : excludedSourceFilter}
            onChange={mainTab === "visible" ? updateVisibleSourceFilter : updateExcludedSourceFilter}
            totalCount={mainTab === "visible" ? visibleClusters.length : excludedClusters.length}
          />

          <div className="radar-results-pane">
            {error ? <div className="radar-inline-error radar-error-banner">Erreur: {error}</div> : null}

            <JobsColumn
              currentTab={mainTab}
              newClusters={newClusters}
              olderClusters={olderClusters}
              excludedClusters={filteredExcludedClusters}
              lastRefreshAt={jobsData.lastRefreshAt}
              motionKey={`${mainTab}-${mainTab === "visible" ? (visibleSourceFilter ?? "all") : (excludedSourceFilter ?? "all")}`}
              showSetupPrompt={!hasConfiguredSourceUrls && !onboardingOpen}
              onOpenOnboarding={openOnboarding}
              onOpenCluster={markClusterOpened}
              onToggleSaved={toggleSaved}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";
import type { CSSProperties } from "react";
import {
  Add01Icon,
  Cancel01Icon,
  Layers02Icon,
  Tick02Icon,
  Undo02Icon
} from "@hugeicons/core-free-icons";
import { SlidingTabRow, type SlidingTabOption } from "@/components/url-radar/section-tabs";
import { getHostFromUrl, getUrlSourceMeta } from "@/lib/url-radar-sources";
import {
  cloneUrlRadarFilters,
  sanitizeUrlRadarFilters,
  URL_RADAR_CONTRACT_CHOICES,
  URL_RADAR_DEFAULT_FILTERS,
  URL_RADAR_TOGGLE_GROUPS
} from "@/lib/url-radar-filters";
import { matchesFilters } from "@/lib/filtering";
import type { JobSearchFilters, NormalizedJob } from "@/lib/types";
import type {
  RemovedUrlHistoryEntry,
  UrlRadarConfig,
  UrlRadarJob,
  UrlRadarStatusResponse,
  UtilitySection
} from "@/components/url-radar/types";
import { formatDate } from "@/components/url-radar/utils";

type SecondaryPanelProps = {
  openSection: UtilitySection | null;
  onClose: () => void;
  config: UrlRadarConfig;
  jobs: UrlRadarJob[];
  status: UrlRadarStatusResponse;
  saving: boolean;
  onSaveConfig: (config: UrlRadarConfig) => Promise<boolean>;
};

type DiagnosticState = {
  label: string;
  host: string;
  lastRunAt: string | null;
  runSummary?: UrlRadarStatusResponse["lastRunSummary"][string];
};

type SettingsTab = "urls" | "sources" | "filters";

const SETTINGS_TAB_OPTIONS: readonly SlidingTabOption<SettingsTab>[] = [
  { label: "URLs", value: "urls" },
  { label: "Diagnostic", value: "sources" },
  { label: "Filtres avancés", value: "filters" }
];

const REFRESH_INTERVAL_MINUTES = [30, 60, 120] as const;

type RefreshIntervalMinutes = (typeof REFRESH_INTERVAL_MINUTES)[number];
type RefreshIntervalChoice = `${RefreshIntervalMinutes}` | "none";

const REFRESH_INTERVAL_OPTIONS: ReadonlyArray<{ value: RefreshIntervalChoice; label: string }> = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 heure" },
  { value: "120", label: "2 heures" },
  { value: "none", label: "Pas d'actualisation" }
];

function getClosestRefreshIntervalMinutes(intervalMinutes: number): RefreshIntervalMinutes {
  const safeInterval = Number.isFinite(intervalMinutes) ? intervalMinutes : 60;
  return REFRESH_INTERVAL_MINUTES.reduce((best, current) =>
    Math.abs(current - safeInterval) < Math.abs(best - safeInterval) ? current : best
  );
}

function getRefreshIntervalChoice(config: UrlRadarConfig): RefreshIntervalChoice {
  if (!config.enabled) return "none";
  return `${getClosestRefreshIntervalMinutes(config.intervalMinutes)}` as RefreshIntervalChoice;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function pushRemovedUrlHistory(history: RemovedUrlHistoryEntry[], url: string): RemovedUrlHistoryEntry[] {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return history;

  const key = normalizeKey(trimmedUrl);
  const nextEntry = { url: trimmedUrl, removedAt: new Date().toISOString() };
  const nextHistory = [nextEntry, ...history.filter((entry) => normalizeKey(entry.url) !== key)];
  return nextHistory.slice(0, 30);
}

function removeFromRemovedUrlHistory(history: RemovedUrlHistoryEntry[], url: string): RemovedUrlHistoryEntry[] {
  const key = normalizeKey(url);
  return history.filter((entry) => normalizeKey(entry.url) !== key);
}

type FilterImpactSummary = {
  knownJobs: number;
  currentVisible: number;
  draftVisible: number;
  becameVisible: number;
  becameExcluded: number;
};

function hasExcludedKeywords(excluded: string[], keywords: readonly string[]): boolean {
  const excludedSet = new Set(excluded.map(normalizeKey));
  return keywords.every((keyword) => excludedSet.has(normalizeKey(keyword)));
}

function toggleExcludedKeywords(excluded: string[], keywords: readonly string[], shouldAllow: boolean): string[] {
  const keywordSet = new Set(keywords.map(normalizeKey));

  if (shouldAllow) {
    return excluded.filter((item) => !keywordSet.has(normalizeKey(item)));
  }

  const next = [...excluded];
  const seen = new Set(next.map(normalizeKey));
  for (const keyword of keywords) {
    const key = normalizeKey(keyword);
    if (seen.has(key)) continue;
    next.push(keyword);
    seen.add(key);
  }
  return next;
}

function LayersIcon() {
  return <HugeiconsIcon icon={Layers02Icon} size={16} strokeWidth={2} className="radar-dialog-icon" />;
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="radar-close-button" onClick={onClick} aria-label="Fermer">
      <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} className="radar-button-icon" />
    </button>
  );
}

function SourceDiagnosticsCard({
  url,
  runSummary,
  lastRunAt,
  onOpenDiagnostic
}: {
  url: string;
  runSummary?: UrlRadarStatusResponse["lastRunSummary"][string];
  lastRunAt: string | null;
  onOpenDiagnostic: (diagnostic: DiagnosticState) => void;
}) {
  const meta = getUrlSourceMeta(url || "");
  const host = getHostFromUrl(url);

  return (
    <article className="radar-source-card">
      <div className="radar-source-card__summary">
        <div>
          <strong className="radar-source-card__title">{meta.label}</strong>
          <div className="radar-source-card__metrics">
            <span>Parsed {runSummary?.parsed ?? 0}</span>
            <span>Nouvelles {runSummary?.visible ?? 0}</span>
            <span>Erreurs {runSummary?.errors?.length ?? 0}</span>
          </div>
        </div>
        {runSummary?.selectedMethod ? <span className="radar-count-pill">{runSummary.selectedMethod}</span> : null}
      </div>

      <button
        type="button"
        className="radar-inline-button radar-inline-button--diagnostic"
        onClick={() => onOpenDiagnostic({ label: meta.label, host: host || "URL vide", runSummary, lastRunAt })}
      >
        Voir le diagnostic
      </button>
    </article>
  );
}

function DiagnosticOverlay({ diagnostic, onClose }: { diagnostic: DiagnosticState; onClose: () => void }) {
  return (
    <div className="radar-detail-overlay" role="presentation" onClick={onClose}>
      <section
        className="radar-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Diagnostic ${diagnostic.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="radar-modal__header">
          <div className="radar-modal__title-wrap">
            <div className="radar-modal__icon">
              <LayersIcon />
            </div>
            <div>
              <strong className="radar-modal__title">{diagnostic.label}</strong>
              <div className="radar-modal__subtitle">Site: {diagnostic.host}</div>
            </div>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="radar-mini-stack">
          <div>Dernier check: {formatDate(diagnostic.lastRunAt)}</div>
          {diagnostic.runSummary?.selectedMethod ? <div>Méthode retenue: {diagnostic.runSummary.selectedMethod}</div> : null}
          {diagnostic.runSummary?.attempts?.length ? (
            <>
              <strong>Méthodes testées</strong>
              {diagnostic.runSummary.attempts.map((attempt, attemptIndex) => (
                <div key={`${diagnostic.host}-attempt-${attemptIndex}`} className="radar-attempt-row">
                  <span>{attempt.method}</span>
                  <span>
                    {attempt.status} | {attempt.parsed} détectées | {attempt.visible} visibles
                    {typeof attempt.qualityScore === "number" ? ` | score ${attempt.qualityScore}` : ""}
                    {attempt.note ? ` | ${attempt.note}` : ""}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div>Aucune tentative détaillée sur le dernier cycle.</div>
          )}
          {diagnostic.runSummary?.errors?.length ? <div className="radar-inline-error">{diagnostic.runSummary.errors.join(" | ")}</div> : null}
        </div>
      </section>
    </div>
  );
}

function EditableTokenList({
  label,
  addLabel,
  placeholder,
  items,
  onChange
}: {
  label: string;
  addLabel: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [newTokenKey, setNewTokenKey] = useState<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const inputCharacterWidth = Math.min(Math.max(inputValue.length + 12, placeholder.length + 3, 22), 52);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current === null) return;
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };

  const openAddField = () => {
    clearCloseTimeout();
    setIsClosing(false);
    setIsAdding(true);
  };

  const closeAddField = () => {
    clearCloseTimeout();
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setInputValue("");
      setIsAdding(false);
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, 190);
  };

  const addItem = () => {
    const value = inputValue.trim();
    if (!value) {
      closeAddField();
      return;
    }
    const key = normalizeKey(value);
    if (items.some((item) => normalizeKey(item) === key)) {
      closeAddField();
      return;
    }
    clearCloseTimeout();
    onChange([...items, value]);
    setInputValue("");
    setIsAdding(false);
    setIsClosing(false);
    setNewTokenKey(key);
  };

  const removeItem = (item: string) => {
    onChange(items.filter((current) => normalizeKey(current) !== normalizeKey(item)));
  };

  useEffect(() => {
    if (!newTokenKey) return undefined;
    const timeout = window.setTimeout(() => setNewTokenKey(null), 420);
    return () => window.clearTimeout(timeout);
  }, [newTokenKey]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  return (
    <section className="radar-filter-group radar-token-group">
      <div className="radar-token-group__header">
        <div className="radar-token-group__title-row">
          <strong>{label}</strong>
        </div>
      </div>

      <div className="radar-filter-token-cloud" aria-label={label}>
        {items.length > 0 ? (
          items.map((item) => (
            <span key={`${label}-${item}`} className={`radar-filter-token${normalizeKey(item) === newTokenKey ? " is-new" : ""}`}>
              <span>{item}</span>
              <button type="button" className="radar-filter-token__remove" onClick={() => removeItem(item)} aria-label={`Supprimer ${item}`}>
                <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.4} />
              </button>
            </span>
          ))
        ) : (
          <span className="radar-token-empty">Aucun filtre</span>
        )}
      </div>

      {isAdding ? (
        <form
          className={`radar-token-add${isClosing ? " is-closing" : " is-open"}`}
          style={{ "--token-input-width": `${inputCharacterWidth}ch` } as CSSProperties}
          onSubmit={(event) => {
            event.preventDefault();
            addItem();
          }}
        >
          <div className="radar-token-add__field">
            <input
              type="text"
              value={inputValue}
              autoFocus
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeAddField();
                }
              }}
              placeholder={placeholder}
            />
            <button type="submit" className="radar-token-add__save" aria-label={`Valider ${label}`}>
              <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="radar-filter-action radar-token-add-trigger" onClick={openAddField}>
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={2.2} aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  compact = false
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className={`radar-checkbox-row${checked ? " is-checked" : ""}${compact ? " radar-checkbox-row--compact" : ""}`}>
      <input className="radar-checkbox-row__input" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="radar-checkbox-row__control" aria-hidden="true" />
      <span className="radar-checkbox-row__label">{label}</span>
    </label>
  );
}

function RefreshIntervalSelector({
  draftConfig,
  setDraftConfig
}: {
  draftConfig: UrlRadarConfig;
  setDraftConfig: Dispatch<SetStateAction<UrlRadarConfig>>;
}) {
  const selectedValue = getRefreshIntervalChoice(draftConfig);

  const updateRefreshInterval = (value: RefreshIntervalChoice) => {
    setDraftConfig((prev) => {
      if (value === "none") {
        return { ...prev, enabled: false };
      }

      return {
        ...prev,
        enabled: true,
        intervalMinutes: Number(value)
      };
    });
  };

  return (
    <section className="radar-filter-group radar-refresh-settings" aria-labelledby="radar-refresh-settings-title">
      <div className="radar-filter-preferences__header">
        <strong id="radar-refresh-settings-title">Actualisation automatique</strong>
      </div>

      <div className="radar-filter-preferences__row radar-refresh-options" role="radiogroup" aria-labelledby="radar-refresh-settings-title">
        {REFRESH_INTERVAL_OPTIONS.map((option) => {
          const checked = selectedValue === option.value;

          return (
            <label key={option.value} className={`radar-checkbox-row radar-checkbox-row--compact radar-radio-row${checked ? " is-checked" : ""}`}>
              <input
                className="radar-checkbox-row__input"
                type="radio"
                name="url-radar-refresh-interval"
                value={option.value}
                checked={checked}
                onChange={() => updateRefreshInterval(option.value)}
              />
              <span className="radar-checkbox-row__control" aria-hidden="true" />
              <span className="radar-checkbox-row__label">{option.label}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function toNormalizedJob(job: UrlRadarJob): NormalizedJob {
  return {
    source: job.source,
    sourceJobId: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    contractType: job.contractType,
    url: job.url,
    postedAt: new Date(job.postedAt),
    experienceHint: job.experienceHint
  };
}

function buildFilterImpactSummary(jobs: UrlRadarJob[], currentFilters: JobSearchFilters, draftFilters: JobSearchFilters): FilterImpactSummary {
  const normalizedJobs = jobs.map(toNormalizedJob);

  let currentVisible = 0;
  let draftVisible = 0;
  let becameVisible = 0;
  let becameExcluded = 0;

  for (const job of normalizedJobs) {
    const currentMatch = matchesFilters(job, currentFilters).excludedReason === null;
    const draftMatch = matchesFilters(job, draftFilters).excludedReason === null;

    if (currentMatch) currentVisible += 1;
    if (draftMatch) draftVisible += 1;
    if (!currentMatch && draftMatch) becameVisible += 1;
    if (currentMatch && !draftMatch) becameExcluded += 1;
  }

  return {
    knownJobs: normalizedJobs.length,
    currentVisible,
    draftVisible,
    becameVisible,
    becameExcluded
  };
}

function filtersAreEqual(left: JobSearchFilters, right: JobSearchFilters): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function FilterImpactBanner({ summary }: { summary: FilterImpactSummary }) {
  const delta = summary.draftVisible - summary.currentVisible;
  const absDelta = Math.abs(delta);
  const visibleLabel =
    delta > 0
      ? `+${delta} offre${delta > 1 ? "s" : ""} visible${delta > 1 ? "s" : ""}`
      : delta < 0
        ? `-${absDelta} offre${absDelta > 1 ? "s" : ""} visible${absDelta > 1 ? "s" : ""}`
        : "Aucun changement sur les offres visibles";

  return (
    <div className="radar-filter-impact-sticky">
      <div className="radar-filter-impact-banner" role="status" aria-live="polite">
        <div className="radar-filter-impact-banner__main">{visibleLabel}</div>
      </div>
    </div>
  );
}

function FiltersPanel({
  jobs,
  currentFilters,
  draftConfig,
  setDraftConfig
}: {
  jobs: UrlRadarJob[];
  currentFilters: JobSearchFilters;
  draftConfig: UrlRadarConfig;
  setDraftConfig: Dispatch<SetStateAction<UrlRadarConfig>>;
}) {
  const { filters } = draftConfig;
  const effectiveDraftFilters = useMemo(() => sanitizeUrlRadarFilters(filters), [filters]);
  const hasFilterChanges = useMemo(() => !filtersAreEqual(currentFilters, effectiveDraftFilters), [currentFilters, effectiveDraftFilters]);
  const impactSummary = useMemo(
    () => buildFilterImpactSummary(jobs, currentFilters, effectiveDraftFilters),
    [jobs, currentFilters, effectiveDraftFilters]
  );

  const allowSeniorLead = !hasExcludedKeywords(filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.seniorLead);
  const allowManagement = !hasExcludedKeywords(filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.management);

  return (
    <div className="radar-form-grid radar-form-grid--filters">
      {hasFilterChanges ? <FilterImpactBanner summary={impactSummary} /> : null}

      <div className="radar-filter-reset-row">
        <button
          type="button"
          className="radar-filter-action radar-inline-button--filters-reset"
          onClick={() => setDraftConfig((prev) => ({ ...prev, filters: cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS) }))}
        >
          <HugeiconsIcon icon={Undo02Icon} size={15} strokeWidth={2.1} aria-hidden="true" />
          Réinitialiser les filtres
        </button>
      </div>

      <section className="radar-filter-group radar-filter-preferences">
        <div className="radar-filter-preferences__header">
          <strong>Types d’offres acceptés</strong>
        </div>

        <div className="radar-filter-preferences__row">
          {URL_RADAR_CONTRACT_CHOICES.map((contractType) => (
            <ToggleRow
              key={contractType}
              label={contractType}
              checked={filters.contractTypes.includes(contractType)}
              compact
              onChange={(checked) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  filters: {
                    ...prev.filters,
                    contractTypes: checked
                      ? [...prev.filters.contractTypes, contractType].filter((value, index, array) => array.indexOf(value) === index)
                      : prev.filters.contractTypes.filter((value) => value !== contractType)
                  }
                }))
              }
            />
          ))}
          <span className="radar-filter-preferences__divider" aria-hidden="true" />
          <ToggleRow
            label="Senior / lead"
            checked={allowSeniorLead}
            compact
            onChange={(checked) =>
              setDraftConfig((prev) => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  keywordsExclude: toggleExcludedKeywords(prev.filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.seniorLead, checked)
                }
              }))
            }
          />
          <ToggleRow
            label="Management"
            checked={allowManagement}
            compact
            onChange={(checked) =>
              setDraftConfig((prev) => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  keywordsExclude: toggleExcludedKeywords(prev.filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.management, checked)
                }
              }))
            }
          />
        </div>
      </section>

      <div className="radar-token-groups-grid">
        <EditableTokenList
          label="Mots inclus"
          addLabel="Ajouter un mot recherché"
          placeholder="Mot recherché"
          items={filters.keywordsInclude}
          onChange={(keywordsInclude) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsInclude } }))}
        />

        <EditableTokenList
          label="Mots exclus"
          addLabel="Ajouter un mot exclu"
          placeholder="Mot à exclure"
          items={filters.keywordsExclude}
          onChange={(keywordsExclude) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsExclude } }))}
        />

        <EditableTokenList
          label="Localisations"
          addLabel="Ajouter une zone"
          placeholder="Zone"
          items={filters.locations}
          onChange={(locations) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, locations } }))}
        />
      </div>
    </div>
  );
}

function UrlsSettingsPanel({ draftConfig, setDraftConfig }: { draftConfig: UrlRadarConfig; setDraftConfig: Dispatch<SetStateAction<UrlRadarConfig>> }) {
  const updateUrlAt = (index: number, value: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      urls: prev.urls.map((url, currentIndex) => (currentIndex === index ? value : url))
    }));
  };

  const addUrlField = () => {
    setDraftConfig((prev) => ({ ...prev, urls: [...prev.urls, ""] }));
  };

  const removeUrlField = (index: number) => {
    setDraftConfig((prev) => {
      const removedUrl = prev.urls[index]?.trim() ?? "";
      const nextUrls = prev.urls.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...prev,
        urls: nextUrls.length > 0 ? nextUrls : [""],
        removedUrlsHistory: removedUrl ? pushRemovedUrlHistory(prev.removedUrlsHistory, removedUrl) : prev.removedUrlsHistory
      };
    });
  };

  const restoreUrl = (url: string) => {
    setDraftConfig((prev) => {
      const exists = prev.urls.some((currentUrl) => normalizeKey(currentUrl) === normalizeKey(url));
      return {
        ...prev,
        urls: exists ? prev.urls : [...prev.urls.filter(Boolean), url],
        removedUrlsHistory: removeFromRemovedUrlHistory(prev.removedUrlsHistory, url)
      };
    });
  };

  return (
    <div className="radar-form-grid radar-form-grid--urls">
      <RefreshIntervalSelector draftConfig={draftConfig} setDraftConfig={setDraftConfig} />

      <div className="radar-url-list">
        {draftConfig.urls.map((url, index) => (
          <div key={`url-field-${index}`} className="radar-url-row">
            <input type="text" value={url} onChange={(event) => updateUrlAt(index, event.target.value)} placeholder="https://..." />
            <button type="button" className="radar-inline-button" onClick={() => removeUrlField(index)}>
              Suppr.
            </button>
          </div>
        ))}
      </div>

      <div className="radar-inline-actions">
        <button type="button" className="radar-inline-button" onClick={addUrlField}>
          Ajouter une URL
        </button>
      </div>

      {draftConfig.removedUrlsHistory.length > 0 ? (
        <section className="radar-filter-group">
          <div className="radar-filter-group__header">
            <strong>Supprimées récemment</strong>
            <span className="radar-secondary-note">Tu peux restaurer une source retirée sans la recopier.</span>
          </div>
          <div className="radar-filter-list">
            {draftConfig.removedUrlsHistory.map((entry) => (
              <div key={`${entry.url}|${entry.removedAt}`} className="radar-filter-token-row">
                <div className="radar-mini-stack">
                  <span>{getUrlSourceMeta(entry.url).label}</span>
                  <span className="radar-secondary-note">{entry.url}</span>
                </div>
                <button type="button" className="radar-inline-button" onClick={() => restoreUrl(entry.url)}>
                  Restaurer
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function SecondaryPanel({ openSection, onClose, config, jobs, status, saving, onSaveConfig }: SecondaryPanelProps) {
  const [diagnostic, setDiagnostic] = useState<DiagnosticState | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("urls");
  const [draftConfig, setDraftConfig] = useState<UrlRadarConfig>(config);
  const currentFilters = useMemo(() => sanitizeUrlRadarFilters(config.filters ?? URL_RADAR_DEFAULT_FILTERS), [config.filters]);

  useEffect(() => {
    if (openSection) {
      setDraftConfig({
        ...config,
        urls: config.urls.length > 0 ? [...config.urls] : [""],
        filters: cloneUrlRadarFilters(config.filters ?? URL_RADAR_DEFAULT_FILTERS)
      });
    }
    if (!openSection) {
      setDiagnostic(null);
      setSettingsTab("urls");
    }
  }, [config, openSection]);

  const modalTitle = "Réglages";

  const canSave = useMemo(() => !saving, [saving]);

  if (!openSection) return null;

  return (
    <div className="radar-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="radar-modal radar-modal--settings" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={(event) => event.stopPropagation()}>
        <div className="radar-modal__header">
          <div className="radar-modal__title-wrap">
            <div>
              <strong className="radar-modal__title">{modalTitle}</strong>
            </div>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <SlidingTabRow
          ariaLabel="Sections des réglages"
          className="radar-settings-tabs"
          buttonClassName="radar-settings-tab-button"
          value={settingsTab}
          onChange={setSettingsTab}
          options={SETTINGS_TAB_OPTIONS}
        />

        <div key={settingsTab} className="radar-settings-panel">
          {settingsTab === "urls" ? (
            <UrlsSettingsPanel draftConfig={draftConfig} setDraftConfig={setDraftConfig} />
          ) : settingsTab === "sources" ? (
            <div className="radar-source-list">
              {draftConfig.urls.map((rawUrl, index) => {
                const url = rawUrl.trim();
                return (
                  <SourceDiagnosticsCard
                    key={`source-${index}`}
                    url={url}
                    runSummary={url ? status.lastRunSummary[url] : undefined}
                    lastRunAt={status.lastRunAt}
                    onOpenDiagnostic={setDiagnostic}
                  />
                );
              })}
            </div>
          ) : (
            <FiltersPanel jobs={jobs} currentFilters={currentFilters} draftConfig={draftConfig} setDraftConfig={setDraftConfig} />
          )}
        </div>

        <div className="radar-inline-actions radar-inline-actions--footer">
          <button type="button" className="radar-inline-button" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="radar-primary-action radar-primary-action--small"
            disabled={!canSave}
            onClick={async () => {
              const saved = await onSaveConfig(draftConfig);
              if (saved) onClose();
            }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>

        {diagnostic ? <DiagnosticOverlay diagnostic={diagnostic} onClose={() => setDiagnostic(null)} /> : null}
      </section>
    </div>
  );
}

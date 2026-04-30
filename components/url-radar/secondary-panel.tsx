import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Layers02Icon } from "@hugeicons/core-free-icons";
import { getHostFromUrl, getUrlSourceMeta } from "@/lib/url-radar-sources";
import {
  cloneUrlRadarFilters,
  sanitizeUrlRadarFilters,
  URL_RADAR_CONTRACT_CHOICES,
  URL_RADAR_DEFAULT_FILTERS,
  URL_RADAR_POSTED_SINCE_CHOICES,
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

function SettingsTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`radar-tab-button radar-settings-tab-button${active ? " is-active" : ""}`} onClick={onClick}>
      {label}
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
  placeholder,
  items,
  onChange
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const addItem = () => {
    const value = inputValue.trim();
    if (!value) return;
    const key = normalizeKey(value);
    if (items.some((item) => normalizeKey(item) === key)) {
      setInputValue("");
      return;
    }
    onChange([...items, value]);
    setInputValue("");
  };

  return (
    <section className="radar-filter-group">
      <div className="radar-filter-group__header">
        <strong>{label}</strong>
      </div>

      <div className="radar-filter-list">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={`${label}-${item}`} className="radar-filter-token-row">
              <span>{item}</span>
              <button
                type="button"
                className="radar-inline-button"
                onClick={() => onChange(items.filter((current) => normalizeKey(current) !== normalizeKey(item)))}
              >
                Suppr.
              </button>
            </div>
          ))
        ) : (
          <div className="radar-secondary-note">Aucun élément</div>
        )}
      </div>

      <div className="radar-url-row radar-url-row--compact">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="radar-inline-button" onClick={addItem}>
          Ajouter
        </button>
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`radar-checkbox-row${checked ? " is-checked" : ""}`}>
      <input className="radar-checkbox-row__input" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="radar-checkbox-row__control" aria-hidden="true" />
      <span className="radar-checkbox-row__label">{label}</span>
    </label>
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
  const allowInternships = !hasExcludedKeywords(filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.internships);

  return (
    <div className="radar-form-grid radar-form-grid--filters">
      {hasFilterChanges ? <FilterImpactBanner summary={impactSummary} /> : null}

      <section className="radar-filter-group">
        <div className="radar-filter-group__header">
          <strong>Options rapides</strong>
          <span className="radar-secondary-note">Raccourcis sûrs basés sur les exclusions actuelles.</span>
        </div>
        <div className="radar-filter-group__checks">
          <ToggleRow
            label="Autoriser senior / lead"
            checked={allowSeniorLead}
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
            label="Autoriser management"
            checked={allowManagement}
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
          <ToggleRow
            label="Autoriser stages / alternance"
            checked={allowInternships}
            onChange={(checked) =>
              setDraftConfig((prev) => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  keywordsExclude: toggleExcludedKeywords(prev.filters.keywordsExclude, URL_RADAR_TOGGLE_GROUPS.internships, checked)
                }
              }))
            }
          />
        </div>
      </section>

      <EditableTokenList
        label="Mots inclus"
        placeholder="Ajouter un mot ou une expression"
        items={filters.keywordsInclude}
        onChange={(keywordsInclude) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsInclude } }))}
      />

      <EditableTokenList
        label="Mots exclus"
        placeholder="Ajouter un mot ou une expression à exclure"
        items={filters.keywordsExclude}
        onChange={(keywordsExclude) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsExclude } }))}
      />

      <EditableTokenList
        label="Localisations"
        placeholder="Ajouter une ville, région ou zone"
        items={filters.locations}
        onChange={(locations) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, locations } }))}
      />

      <section className="radar-filter-group">
        <div className="radar-filter-group__header">
          <strong>Contrats</strong>
        </div>
        <div className="radar-filter-group__checks">
          {URL_RADAR_CONTRACT_CHOICES.map((contractType) => (
            <ToggleRow
              key={contractType}
              label={contractType}
              checked={filters.contractTypes.includes(contractType)}
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
        </div>
      </section>

      <section className="radar-filter-group">
        <div className="radar-filter-group__header">
          <strong>Ancienneté max</strong>
          <span className="radar-secondary-note">Laisse sur aucune limite pour conserver le comportement actuel.</span>
        </div>
        <label className="radar-field">
          <select
            value={filters.postedSinceHours ?? ""}
            onChange={(event) => {
              const nextValue = event.target.value ? Number(event.target.value) : undefined;
              setDraftConfig((prev) => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  postedSinceHours: Number.isFinite(nextValue) ? nextValue : undefined
                }
              }));
            }}
          >
            {URL_RADAR_POSTED_SINCE_CHOICES.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="radar-inline-actions">
        <button
          type="button"
          className="radar-inline-button"
          onClick={() => setDraftConfig((prev) => ({ ...prev, filters: cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS) }))}
        >
          Réinitialiser aux filtres par défaut
        </button>
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
    <div className="radar-form-grid">
      <ToggleRow label="Actualisation active" checked={draftConfig.enabled} onChange={(checked) => setDraftConfig((prev) => ({ ...prev, enabled: checked }))} />

      <label className="radar-field">
        <span>Intervalle (minutes)</span>
        <input
          type="number"
          min={15}
          value={draftConfig.intervalMinutes}
          onChange={(event) => setDraftConfig((prev) => ({ ...prev, intervalMinutes: Number(event.target.value) || 60 }))}
        />
      </label>

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

        <div className="radar-tab-row radar-settings-tabs">
          <SettingsTabButton label="URLs" active={settingsTab === "urls"} onClick={() => setSettingsTab("urls")} />
          <SettingsTabButton label="Diagnostic" active={settingsTab === "sources"} onClick={() => setSettingsTab("sources")} />
          <SettingsTabButton label="Filtres avancés" active={settingsTab === "filters"} onClick={() => setSettingsTab("filters")} />
        </div>

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

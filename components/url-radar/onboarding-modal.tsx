import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowUpRight02Icon,
  Cancel01Icon,
  Tick02Icon
} from "@hugeicons/core-free-icons";
import {
  cloneUrlRadarFilters,
  getUrlRadarContractLabel,
  URL_RADAR_CONTRACT_CHOICES,
  URL_RADAR_DEFAULT_FILTERS
} from "@/lib/url-radar-filters";
import type { EditableContractType } from "@/lib/url-radar-filters";
import type { UrlRadarConfig } from "@/components/url-radar/types";

type OnboardingMode = "wizard" | "setup";
type OnboardingStepId = "urls" | "keywords" | "preferences";
type StepDirection = "forward" | "backward";

type OnboardingModalProps = {
  config: UrlRadarConfig;
  mode: OnboardingMode;
  saving: boolean;
  onComplete: (config: UrlRadarConfig) => Promise<boolean>;
  onDismiss: () => void;
};

type TokenEditorProps = {
  addLabel: string;
  emptyLabel: string;
  inputLabel: string;
  items: string[];
  placeholder: string;
  suggestions: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
};

const KEYWORD_SUGGESTIONS = ["Product manager", "Développeur", "Data analyst", "Marketing", "Customer success", "Designer"];
const EXCLUDED_SUGGESTIONS = ["stage", "alternance", "senior", "lead", "management"];
const LOCATION_SUGGESTIONS = ["Paris", "Lyon", "Remote", "France", "Europe"];

const JOB_SITE_SUGGESTIONS = [
  { label: "LinkedIn", url: "https://www.linkedin.com/jobs/" },
  { label: "Welcome to the Jungle", url: "https://www.welcometothejungle.com/fr/jobs" },
  { label: "APEC", url: "https://www.apec.fr/candidat/recherche-emploi.html/emploi" },
  { label: "HelloWork", url: "https://www.hellowork.com/fr-fr/emploi/recherche.html" },
  { label: "Indeed", url: "https://fr.indeed.com/" },
  { label: "Free-Work", url: "https://www.free-work.com/fr/tech-it/jobs" }
];

const WIZARD_STEPS: ReadonlyArray<{ id: OnboardingStepId; label: string; title: string; description: string }> = [
  {
    id: "urls",
    label: "URLs",
    title: "Sources à suivre",
    description: "Colle les pages de résultats que JobMAXIMALIST devra relire à ta place."
  },
  {
    id: "keywords",
    label: "Mots-clés",
    title: "Mots à garder ou couper",
    description: "Précise ce que tu recherches, puis écarte les termes qui créent du bruit."
  },
  {
    id: "preferences",
    label: "Préférences",
    title: "Zones et contrats",
    description: "Limite les résultats aux localisations et types d’offres qui t’intéressent."
  }
];

function normalizeDraftConfig(config: UrlRadarConfig): UrlRadarConfig {
  return {
    ...config,
    urls: config.urls.length > 0 ? [...config.urls] : [""],
    filters: cloneUrlRadarFilters(config.filters ?? URL_RADAR_DEFAULT_FILTERS),
    removedUrlsHistory: Array.isArray(config.removedUrlsHistory) ? config.removedUrlsHistory : [],
    onboardingCompletedAt: config.onboardingCompletedAt ?? null,
    onboardingDismissedAt: config.onboardingDismissedAt ?? null
  };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function addUniqueValue(items: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return items;

  const existingKeys = new Set(items.map(normalizeKey));
  if (existingKeys.has(normalizeKey(trimmed))) return items;
  return [...items, trimmed];
}

function removeValue(items: string[], value: string): string[] {
  const key = normalizeKey(value);
  return items.filter((item) => normalizeKey(item) !== key);
}

function isValidUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function OnboardingTokenEditor({ addLabel, emptyLabel, inputLabel, items, placeholder, suggestions, onAdd, onRemove }: TokenEditorProps) {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [newTokenKey, setNewTokenKey] = useState<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const suggestionKeys = new Set(items.map(normalizeKey));
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

  const addItem = (value: string) => {
    const key = normalizeKey(value);
    onAdd(value);
    if (key) setNewTokenKey(key);
  };

  const submitInput = () => {
    const value = inputValue.trim();
    if (!value) {
      closeAddField();
      return;
    }

    addItem(value);
    clearCloseTimeout();
    setInputValue("");
    setIsAdding(false);
    setIsClosing(false);
  };

  useEffect(() => {
    if (!newTokenKey) return undefined;
    const timeout = window.setTimeout(() => setNewTokenKey(null), 420);
    return () => window.clearTimeout(timeout);
  }, [newTokenKey]);

  useEffect(() => () => clearCloseTimeout(), []);

  return (
    <div className="radar-onboarding-token-block">
      <div className="radar-filter-token-cloud" aria-label={inputLabel}>
        {items.length > 0 ? (
          items.map((item) => (
            <span key={item} className={`radar-filter-token${normalizeKey(item) === newTokenKey ? " is-new" : ""}`}>
              <span>{item}</span>
              <button type="button" className="radar-filter-token__remove" onClick={() => onRemove(item)} aria-label={`Retirer ${item}`}>
                <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="radar-token-empty">{emptyLabel}</span>
        )}
      </div>

      {isAdding ? (
        <form
          className={`radar-token-add${isClosing ? " is-closing" : " is-open"}`}
          style={{ "--token-input-width": `${inputCharacterWidth}ch` } as CSSProperties}
          onSubmit={(event) => {
            event.preventDefault();
            submitInput();
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
            <button type="submit" className="radar-token-add__save" aria-label={`Ajouter ${inputLabel}`}>
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

      <div className="radar-onboarding-suggestion-block">
        <span className="radar-onboarding-helper-label">Suggestions</span>
        <div className="radar-onboarding-suggestions" aria-label={addLabel}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="radar-chip radar-onboarding-suggestion"
              disabled={suggestionKeys.has(normalizeKey(suggestion))}
              onClick={() => addItem(suggestion)}
            >
              <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2.2} aria-hidden="true" />
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingLogo() {
  return (
    <div className="radar-onboarding-logo" aria-label="JobMAXIMALIST">
      <img src="/job-maximalist-logo.svg" alt="JobMAXIMALIST" className="radar-onboarding-logo__asset radar-onboarding-logo__asset--light" />
      <img src="/job-maximalist-logo-dark.svg" alt="JobMAXIMALIST" className="radar-onboarding-logo__asset radar-onboarding-logo__asset--dark" />
    </div>
  );
}

export function OnboardingModal({ config, mode, saving, onComplete, onDismiss }: OnboardingModalProps) {
  const [draftConfig, setDraftConfig] = useState<UrlRadarConfig>(() => normalizeDraftConfig(config));
  const [stepIndex, setStepIndex] = useState(0);
  const [stepDirection, setStepDirection] = useState<StepDirection>("forward");
  const [urlContinueAttempted, setUrlContinueAttempted] = useState(false);

  useEffect(() => {
    setDraftConfig(normalizeDraftConfig(config));
  }, [config]);

  const trimmedUrls = useMemo(() => draftConfig.urls.map((url) => url.trim()), [draftConfig.urls]);
  const validUrls = useMemo(() => trimmedUrls.filter(isValidUrl), [trimmedUrls]);
  const hasInvalidUrl = trimmedUrls.some((url) => url.length > 0 && !isValidUrl(url));
  const hasValidUrl = validUrls.length > 0;
  const canComplete = hasValidUrl && !hasInvalidUrl && !saving;
  const activeStep = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];
  const isWizard = mode === "wizard";
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  const updateUrlAt = (index: number, value: string) => {
    if (urlContinueAttempted) setUrlContinueAttempted(false);
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
      const nextUrls = prev.urls.filter((_, currentIndex) => currentIndex !== index);
      return { ...prev, urls: nextUrls.length > 0 ? nextUrls : [""] };
    });
  };

  const toggleContract = (contractType: EditableContractType, checked: boolean) => {
    setDraftConfig((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        contractTypes: checked
          ? [...prev.filters.contractTypes, contractType].filter((value, index, array) => array.indexOf(value) === index)
          : prev.filters.contractTypes.filter((value) => value !== contractType)
      }
    }));
  };

  const goToStep = (nextIndex: number) => {
    if (nextIndex === stepIndex || nextIndex < 0 || nextIndex >= WIZARD_STEPS.length) return;
    setStepDirection(nextIndex > stepIndex ? "forward" : "backward");
    setStepIndex(nextIndex);
  };

  const continueFromCurrentStep = () => {
    if (activeStep.id === "urls" && (!hasValidUrl || hasInvalidUrl)) {
      setUrlContinueAttempted(true);
      return;
    }

    goToStep(stepIndex + 1);
  };

  const completeOnboarding = async () => {
    if (!canComplete) {
      setUrlContinueAttempted(true);
      return;
    }

    await onComplete({
      ...draftConfig,
      urls: validUrls,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingDismissedAt: null
    });
  };

  const urlsSection = (
    <section className="radar-onboarding-section radar-onboarding-section--wide">
      <div className="radar-onboarding-section__header">
        <strong>URLs de recherche</strong>
        <span>Copie l’adresse après avoir lancé une recherche sur un site d’emploi. Le radar suivra exactement cette page.</span>
      </div>

      <div className="radar-url-list radar-onboarding-url-list">
        {draftConfig.urls.map((url, index) => (
          <div key={`onboarding-url-${index}`} className="radar-url-row">
            <input type="text" value={url} onChange={(event) => updateUrlAt(index, event.target.value)} placeholder="https://www.site-emploi.com/recherche?..." />
            <button type="button" className="radar-inline-button" onClick={() => removeUrlField(index)}>
              Suppr.
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="radar-filter-action radar-token-add-trigger" onClick={addUrlField}>
        <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={2.2} aria-hidden="true" />
        Ajouter une URL
      </button>

      {hasInvalidUrl ? <p className="radar-onboarding-error">Chaque URL remplie doit commencer par http:// ou https://.</p> : null}
      {urlContinueAttempted && !hasValidUrl ? <p className="radar-onboarding-error">Ajoute au moins une URL de résultats pour continuer.</p> : null}

      <div className="radar-onboarding-suggestion-block">
        <span className="radar-onboarding-helper-label">Ouvrir un site pour créer une recherche</span>
        <div className="radar-onboarding-site-grid" aria-label="Sites d’emploi utiles">
          {JOB_SITE_SUGGESTIONS.map((site) => (
            <a key={site.url} className="radar-onboarding-site-link" href={site.url} target="_blank" rel="noreferrer">
              <span>{site.label}</span>
              <HugeiconsIcon icon={ArrowUpRight02Icon} size={14} strokeWidth={2.3} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );

  const keywordsSection = (
    <>
      <section className="radar-onboarding-section">
        <div className="radar-onboarding-section__header">
          <strong>Mots recherchés</strong>
          <span>Optionnel. Si tu laisses vide, toutes les offres détectées dans tes URLs restent candidates.</span>
        </div>
        <OnboardingTokenEditor
          addLabel="Ajouter un mot recherché"
          emptyLabel="Aucun mot recherché"
          inputLabel="mots recherchés"
          items={draftConfig.filters.keywordsInclude}
          placeholder="Ex. product manager"
          suggestions={KEYWORD_SUGGESTIONS}
          onAdd={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsInclude: addUniqueValue(prev.filters.keywordsInclude, value) } }))}
          onRemove={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsInclude: removeValue(prev.filters.keywordsInclude, value) } }))}
        />
      </section>

      <section className="radar-onboarding-section">
        <div className="radar-onboarding-section__header">
          <strong>Mots exclus</strong>
          <span>Optionnel. Les offres contenant ces termes seront rangées dans les exclues.</span>
        </div>
        <OnboardingTokenEditor
          addLabel="Ajouter un mot exclu"
          emptyLabel="Aucun mot exclu"
          inputLabel="mots exclus"
          items={draftConfig.filters.keywordsExclude}
          placeholder="Ex. stage"
          suggestions={EXCLUDED_SUGGESTIONS}
          onAdd={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsExclude: addUniqueValue(prev.filters.keywordsExclude, value) } }))}
          onRemove={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, keywordsExclude: removeValue(prev.filters.keywordsExclude, value) } }))}
        />
      </section>
    </>
  );

  const preferencesSection = (
    <>
      <section className="radar-onboarding-section">
        <div className="radar-onboarding-section__header">
          <strong>Localisations</strong>
          <span>Optionnel. Ajoute une ville, une zone ou “Remote” si tu veux limiter les résultats.</span>
        </div>
        <OnboardingTokenEditor
          addLabel="Ajouter une localisation"
          emptyLabel="Aucune localisation"
          inputLabel="localisations"
          items={draftConfig.filters.locations}
          placeholder="Ex. Paris"
          suggestions={LOCATION_SUGGESTIONS}
          onAdd={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, locations: addUniqueValue(prev.filters.locations, value) } }))}
          onRemove={(value) => setDraftConfig((prev) => ({ ...prev, filters: { ...prev.filters, locations: removeValue(prev.filters.locations, value) } }))}
        />
      </section>

      <section className="radar-onboarding-section">
        <div className="radar-onboarding-section__header">
          <strong>Types d’offres</strong>
          <span>Tu pourras modifier ce choix dans les filtres avancés.</span>
        </div>
        <div className="radar-filter-preferences__row">
          {URL_RADAR_CONTRACT_CHOICES.map((contractType) => {
            const checked = draftConfig.filters.contractTypes.includes(contractType);
            return (
              <label key={contractType} className={`radar-checkbox-row radar-checkbox-row--compact${checked ? " is-checked" : ""}`}>
                <input className="radar-checkbox-row__input" type="checkbox" checked={checked} onChange={(event) => toggleContract(contractType, event.target.checked)} />
                <span className="radar-checkbox-row__control" aria-hidden="true" />
                <span className="radar-checkbox-row__label">{getUrlRadarContractLabel(contractType)}</span>
              </label>
            );
          })}
        </div>
      </section>
    </>
  );

  const stepContent = activeStep.id === "urls" ? urlsSection : activeStep.id === "keywords" ? keywordsSection : preferencesSection;
  const setupSections: Array<{ key: string; content: ReactNode }> = [
    { key: "urls", content: urlsSection },
    { key: "keywords", content: <div className="radar-onboarding-setup-stack">{keywordsSection}</div> },
    { key: "preferences", content: <div className="radar-onboarding-setup-stack">{preferencesSection}</div> }
  ];

  if (isWizard) {
    return (
      <main className="radar-onboarding-page" aria-label="Onboarding JobMAXIMALIST">
        <div className="radar-onboarding-page__chrome">
          <OnboardingLogo />
        </div>

        <nav className="radar-onboarding-stepper" aria-label="Étapes de configuration">
          {WIZARD_STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`radar-onboarding-step${index === stepIndex ? " is-active" : ""}${index < stepIndex ? " is-complete" : ""}`}
              onClick={() => goToStep(index)}
            >
              <span>{index + 1}</span>
              {step.label}
            </button>
          ))}
        </nav>

        <section className="radar-onboarding-wizard">
          <aside className="radar-onboarding-progress" aria-label="Progression de l’onboarding">
            <div>
              <span className="radar-onboarding-eyebrow">Étape {stepIndex + 1} sur {WIZARD_STEPS.length}</span>
              <h1>{activeStep.title}</h1>
              <p>{activeStep.description}</p>
            </div>
          </aside>

          <div className="radar-onboarding-stage">
            <div key={activeStep.id} className={`radar-onboarding-step-panel is-${stepDirection}`}>
              {stepContent}
            </div>

            <div className="radar-onboarding-footer">
              <button type="button" className="radar-inline-button" disabled={stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}>
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2.2} aria-hidden="true" />
                Retour
              </button>

              <div className="radar-onboarding-footer__primary">
                <button type="button" className="radar-inline-button" onClick={onDismiss}>
                  Configurer plus tard
                </button>
                {isLastStep ? (
                  <button type="button" className="radar-primary-action radar-primary-action--small" disabled={saving} onClick={completeOnboarding}>
                    <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.4} aria-hidden="true" />
                    {saving ? "Enregistrement..." : "Enregistrer et lancer la recherche"}
                  </button>
                ) : (
                  <button type="button" className="radar-primary-action radar-primary-action--small" onClick={continueFromCurrentStep}>
                    Continuer
                    <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="radar-modal-backdrop radar-onboarding-backdrop" role="presentation" onClick={onDismiss}>
      <section className="radar-modal radar-onboarding-modal radar-onboarding-modal--setup" role="dialog" aria-modal="true" aria-label="Configurer ma veille" onClick={(event) => event.stopPropagation()}>
        <div className="radar-modal__header radar-onboarding-header">
          <div className="radar-modal__title-wrap">
            <div>
              <span className="radar-onboarding-eyebrow">Configuration</span>
              <strong className="radar-modal__title">Configurer ma veille</strong>
            </div>
          </div>
          <button type="button" className="radar-close-button" onClick={onDismiss} aria-label="Fermer la configuration">
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} className="radar-button-icon" aria-hidden="true" />
          </button>
        </div>

        <div className="radar-onboarding-intro">
          <p>Ajoute tes URLs, puis affine les filtres. Rien n’est imposé par défaut, le radar suit uniquement ce que tu configures.</p>
        </div>

        <div className="radar-onboarding-setup-grid">
          {setupSections.map((section) => (
            <div key={section.key} className={`radar-onboarding-setup-card radar-onboarding-setup-card--${section.key}`}>
              {section.content}
            </div>
          ))}
        </div>

        <div className="radar-inline-actions radar-inline-actions--footer radar-onboarding-footer">
          <button type="button" className="radar-inline-button" onClick={onDismiss}>
            Annuler
          </button>
          <button type="button" className="radar-primary-action radar-primary-action--small" disabled={!canComplete} onClick={completeOnboarding}>
            <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.4} aria-hidden="true" />
            {saving ? "Enregistrement..." : "Enregistrer et lancer la recherche"}
          </button>
        </div>
      </section>
    </div>
  );
}

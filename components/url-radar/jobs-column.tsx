import type { ReactNode } from "react";
import { JobCard } from "@/components/url-radar/job-card";
import type { CSSProperties } from "react";
import type { JobCluster, MainTab } from "@/components/url-radar/types";
import { formatRelativeSameDayOrDate } from "@/components/url-radar/utils";

type JobsColumnProps = {
  currentTab: MainTab;
  newClusters: JobCluster[];
  olderClusters: JobCluster[];
  excludedClusters: JobCluster[];
  lastRefreshAt: string | null;
  motionKey: string;
  showSetupPrompt?: boolean;
  onOpenOnboarding?: () => void;
  onOpenCluster: (cluster: JobCluster) => void;
  onToggleSaved: (cluster: JobCluster) => void;
};

function RefreshMeta({ delayMs = 0, stamp }: { delayMs?: number; stamp?: string | null }) {
  if (!stamp) return null;

  return (
    <span className={["radar-refresh-meta", delayMs > 0 ? "is-delayed" : ""].filter(Boolean).join(" ")} style={{ "--refresh-delay": `${delayMs}ms` } as CSSProperties}>
      <span className="radar-refresh-meta__separator" aria-hidden="true" />
      <span className="radar-refresh-meta__text">Actualisé {stamp}</span>
    </span>
  );
}

function getAnimatedWordsDurationMs(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;
  return 360 + (wordCount - 1) * 60 + 700;
}

function AnimatedWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span className="radar-text-reveal" aria-label={text}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          aria-hidden="true"
          className="radar-text-reveal__word"
          style={{ "--word-delay": `${360 + index * 60}ms` } as CSSProperties}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

function EmptyState({
  motionKey,
  onOpenOnboarding,
  showSetupPrompt = false,
  stamp,
  variant
}: {
  motionKey: string;
  onOpenOnboarding?: () => void;
  showSetupPrompt?: boolean;
  stamp?: string | null;
  variant: "no-new" | "no-visible" | "no-excluded";
}) {
  if (variant === "no-excluded") {
    return (
      <div className="radar-empty-state">
        <strong>
          <AnimatedWords key={`${motionKey}-Aucune offre exclue`} text="Aucune offre exclue" />
        </strong>
      </div>
    );
  }

  const label = variant === "no-visible" ? "Aucune offre détectée" : "Aucune nouvelle offre";

  return (
    <div className="radar-empty-state radar-empty-state--graphic">
      <div className="radar-empty-state__callout">
        <span className="radar-empty-state__bubble">
          <span>
            {variant === "no-new" ? label : <AnimatedWords key={`${motionKey}-${label}`} text={label} />}
          </span>
          <RefreshMeta stamp={stamp} />
        </span>
      </div>
      {showSetupPrompt && onOpenOnboarding ? (
        <div className="radar-empty-state__setup">
          <p>Ajoute tes URLs de recherche pour commencer à détecter des offres.</p>
          <button type="button" className="radar-primary-action radar-primary-action--small" onClick={onOpenOnboarding}>
            Configurer ma veille
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SectionBlock({
  children,
  heading,
  motionKey,
  stamp,
  transitionCards = false
}: {
  children: ReactNode;
  heading: string;
  motionKey: string;
  stamp?: string | null;
  transitionCards?: boolean;
}) {
  const refreshDelayMs = heading ? getAnimatedWordsDurationMs(heading) : 0;

  return (
    <section className="radar-list-section">
      {heading || stamp ? (
        <div className="radar-list-section__header">
          {heading ? (
            <h2 className="radar-section-title">
              <AnimatedWords key={`${motionKey}-${heading}`} text={heading} />
            </h2>
          ) : null}
          <RefreshMeta delayMs={refreshDelayMs} stamp={stamp} />
        </div>
      ) : null}
      <div className={["radar-job-list", transitionCards ? "radar-cards-transition-target" : ""].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}

export function JobsColumn({
  currentTab,
  newClusters,
  olderClusters,
  excludedClusters,
  lastRefreshAt,
  motionKey,
  showSetupPrompt = false,
  onOpenOnboarding,
  onOpenCluster,
  onToggleSaved
}: JobsColumnProps) {
  const refreshStamp = formatRelativeSameDayOrDate(lastRefreshAt);

  if (currentTab === "excluded") {
    if (excludedClusters.length === 0) {
      return <EmptyState motionKey={motionKey} variant="no-excluded" />;
    }

    return (
      <SectionBlock
        heading={`${excludedClusters.length} offre${excludedClusters.length > 1 ? "s" : ""} exclue${excludedClusters.length > 1 ? "s" : ""}`}
        motionKey={motionKey}
        stamp={refreshStamp}
        transitionCards
      >
        {excludedClusters.map((cluster) => (
          <JobCard key={cluster.key} cluster={cluster} showExcludedReason onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />
        ))}
      </SectionBlock>
    );
  }

  if (newClusters.length === 0 && olderClusters.length === 0) {
    return <EmptyState motionKey={motionKey} onOpenOnboarding={onOpenOnboarding} showSetupPrompt={showSetupPrompt} stamp={refreshStamp} variant="no-visible" />;
  }

  return (
    <div className="radar-list-stack">
      <SectionBlock
        heading={newClusters.length > 0 ? `${newClusters.length} nouvelle${newClusters.length > 1 ? "s" : ""} offre${newClusters.length > 1 ? "s" : ""}` : ""}
        motionKey={`${motionKey}-new`}
        stamp={newClusters.length > 0 ? refreshStamp : null}
        transitionCards={newClusters.length > 0}
      >
        {newClusters.length > 0 ? (
          newClusters.map((cluster) => <JobCard key={cluster.key} cluster={cluster} onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />)
        ) : (
          <EmptyState motionKey={`${motionKey}-new`} stamp={refreshStamp} variant="no-new" />
        )}
      </SectionBlock>

      {olderClusters.length > 0 ? (
        <SectionBlock
          heading={`${olderClusters.length} offre${olderClusters.length > 1 ? "s" : ""} déjà détectée${olderClusters.length > 1 ? "s" : ""}`}
          motionKey={`${motionKey}-older`}
          transitionCards={newClusters.length === 0}
        >
          {olderClusters.map((cluster) => <JobCard key={cluster.key} cluster={cluster} onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />)}
        </SectionBlock>
      ) : null}
    </div>
  );
}

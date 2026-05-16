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
  onOpenCluster: (cluster: JobCluster) => void;
  onToggleSaved: (cluster: JobCluster) => void;
};

function RefreshMeta({ stamp }: { stamp?: string | null }) {
  if (!stamp) return null;

  return (
    <span className="radar-refresh-meta">
      <span className="radar-refresh-meta__separator" aria-hidden="true" />
      <span className="radar-refresh-meta__text">Actualisé {stamp}</span>
    </span>
  );
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
  stamp,
  variant
}: {
  stamp?: string | null;
  variant: "no-new" | "no-visible" | "no-excluded";
}) {
  if (variant === "no-excluded") {
    return (
      <div className="radar-empty-state">
        <strong>
          <AnimatedWords text="Aucune offre exclue" />
        </strong>
      </div>
    );
  }

  return (
    <div className="radar-empty-state radar-empty-state--graphic">
      <div className="radar-empty-state__callout">
        <span className="radar-empty-state__bubble">
          <span>
            <AnimatedWords text={variant === "no-visible" ? "Aucune offre détectée" : "Aucune nouvelle offre"} />
          </span>
          <RefreshMeta stamp={stamp} />
        </span>
      </div>
    </div>
  );
}

function SectionBlock({ heading, stamp, children }: { heading: string; stamp?: string | null; children: ReactNode }) {
  return (
    <section className="radar-list-section">
      {heading || stamp ? (
        <div className="radar-list-section__header">
          {heading ? (
            <h2 className="radar-section-title">
              <AnimatedWords text={heading} />
            </h2>
          ) : null}
          <RefreshMeta stamp={stamp} />
        </div>
      ) : null}
      <div className="radar-job-list">{children}</div>
    </section>
  );
}

export function JobsColumn({
  currentTab,
  newClusters,
  olderClusters,
  excludedClusters,
  lastRefreshAt,
  onOpenCluster,
  onToggleSaved
}: JobsColumnProps) {
  const refreshStamp = formatRelativeSameDayOrDate(lastRefreshAt);

  if (currentTab === "excluded") {
    if (excludedClusters.length === 0) {
      return <EmptyState variant="no-excluded" />;
    }

    return (
      <SectionBlock
        heading={`${excludedClusters.length} offre${excludedClusters.length > 1 ? "s" : ""} exclue${excludedClusters.length > 1 ? "s" : ""}`}
        stamp={refreshStamp}
      >
        {excludedClusters.map((cluster) => (
          <JobCard key={cluster.key} cluster={cluster} showExcludedReason onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />
        ))}
      </SectionBlock>
    );
  }

  if (newClusters.length === 0 && olderClusters.length === 0) {
    return <EmptyState stamp={refreshStamp} variant="no-visible" />;
  }

  return (
    <div className="radar-list-stack">
      <SectionBlock
        heading={newClusters.length > 0 ? `${newClusters.length} nouvelle${newClusters.length > 1 ? "s" : ""} offre${newClusters.length > 1 ? "s" : ""}` : ""}
        stamp={newClusters.length > 0 ? refreshStamp : null}
      >
        {newClusters.length > 0 ? (
          newClusters.map((cluster) => <JobCard key={cluster.key} cluster={cluster} onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />)
        ) : (
          <EmptyState stamp={refreshStamp} variant="no-new" />
        )}
      </SectionBlock>

      {olderClusters.length > 0 ? (
        <SectionBlock heading={`${olderClusters.length} offre${olderClusters.length > 1 ? "s" : ""} déjà détectée${olderClusters.length > 1 ? "s" : ""}`}>
          {olderClusters.map((cluster) => <JobCard key={cluster.key} cluster={cluster} onOpenCluster={onOpenCluster} onToggleSaved={onToggleSaved} />)}
        </SectionBlock>
      ) : null}
    </div>
  );
}

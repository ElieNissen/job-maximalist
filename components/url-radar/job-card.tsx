import type { CSSProperties } from "react";
import type { JobCluster } from "@/components/url-radar/types";
import { sourceColorFromUrl, sourceLabelFromUrl, sourceTextColorFromUrl } from "@/components/url-radar/utils";

const EXCLUSION_REASON_META: Record<string, { label: string; code: string; tone: string }> = {
  no_include_keyword_match: { label: "Titre hors cible", code: "T", tone: "title" },
  excluded_keyword: { label: "Mot clé exclu", code: "X", tone: "keyword" },
  location_mismatch: { label: "Lieu hors zone", code: "L", tone: "location" },
  contract_type_mismatch: { label: "Contrat hors cible", code: "C", tone: "contract" },
  source_mismatch: { label: "Source désactivée", code: "S", tone: "generic" },
  posted_too_old: { label: "Trop ancienne", code: "D", tone: "generic" }
};

function formatCompactDate(value: string): string {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function compactTitle(rawTitle: string): string {
  const normalized = rawTitle.replace(/\s+/g, " ").trim();
  const beforeEllipsis = normalized.split("...")[0]?.trim() || normalized;
  const shortened = beforeEllipsis.length > 130 ? `${beforeEllipsis.slice(0, 127).trimEnd()}…` : beforeEllipsis;
  return shortened;
}

function buildMetaItems(cluster: JobCluster): string[] {
  const items: string[] = [`Publiée ${formatCompactDate(cluster.postedAt)}`];

  if (cluster.contractType && cluster.contractType !== "CDI" && cluster.contractType !== "OTHER") {
    items.push(cluster.contractType);
  }

  if (cluster.experienceHint) {
    items.push(`Exp. ${cluster.experienceHint}`);
  }

  const posted = new Date(cluster.postedAt).getTime();
  const detected = new Date(cluster.firstSeenAt).getTime();
  if (Number.isFinite(posted) && Number.isFinite(detected) && Math.abs(detected - posted) > 30 * 60 * 1000) {
    items.push(`Ajoutée ${formatCompactDate(cluster.firstSeenAt)}`);
  }

  return items;
}

function buildReasonItems(cluster: JobCluster): Array<{ label: string; code: string; tone: string }> {
  return cluster.excludedReasons.map((reason) => EXCLUSION_REASON_META[reason] ?? { label: reason.replace(/_/g, " "), code: "?", tone: "generic" });
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="radar-bookmark-icon">
      <path
        d="M7 4.75h10a1 1 0 0 1 1 1V20l-6-3.7L6 20V5.75a1 1 0 0 1 1-1Z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type JobCardProps = {
  cluster: JobCluster;
  showExcludedReason?: boolean;
  onOpenCluster: (cluster: JobCluster) => void;
  onToggleSaved: (cluster: JobCluster) => void;
};

export function JobCard({ cluster, showExcludedReason = false, onOpenCluster, onToggleSaved }: JobCardProps) {
  const primaryUrl = cluster.sources[0]?.url ?? "#";
  const metaItems = buildMetaItems(cluster);
  const reasonItems = buildReasonItems(cluster);
  const displayTitle = compactTitle(cluster.title);

  const openPrimaryUrl = () => {
    if (!primaryUrl || primaryUrl === "#") return;
    onOpenCluster(cluster);
    window.open(primaryUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <article
      className={`radar-job-card${cluster.saved ? " is-bookmarked" : ""}${showExcludedReason ? " is-excluded" : ""}`}
      role="link"
      tabIndex={0}
      aria-label={`Ouvrir ${displayTitle}`}
      onClick={openPrimaryUrl}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPrimaryUrl();
        }
      }}
    >
      <div className="radar-job-card__topline">
        <div className="radar-job-card__pills">
          {cluster.sources.map((sourceItem) => (
            <a
              key={`${sourceItem.source}|${sourceItem.url}`}
              href={sourceItem.url}
              target="_blank"
              rel="noreferrer"
              className="radar-chip radar-chip--source is-active"
              style={
                {
                  "--chip-active-bg": sourceColorFromUrl(sourceItem.source, sourceItem.url),
                  "--chip-active-text": sourceTextColorFromUrl(sourceItem.url)
                } as CSSProperties
              }
              onClick={(event) => event.stopPropagation()}
            >
              {sourceLabelFromUrl(sourceItem.source, sourceItem.url)}
            </a>
          ))}
          {cluster.sources.length > 1 ? <span className="radar-secondary-note">Regroupée ({cluster.sources.length})</span> : null}
        </div>

        <button
          type="button"
          className={`radar-bookmark-button${cluster.saved ? " is-active" : ""}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSaved(cluster);
          }}
          aria-label={cluster.saved ? "Retirer le favori" : "Ajouter aux favoris"}
        >
          <BookmarkIcon active={cluster.saved} />
        </button>
      </div>

      <div className="radar-job-card__body">
        <div className="radar-job-card__content">
          <h3 className="radar-job-card__title">{displayTitle}</h3>
          <p className="radar-job-card__company">{cluster.company}</p>
          <p className="radar-job-card__location">{cluster.location}</p>
        </div>
      </div>

      <div className="radar-job-card__meta-row">
        {metaItems.map((item) => (
          <span key={`${cluster.key}-${item}`} className="radar-meta-chip">
            {item}
          </span>
        ))}

        {showExcludedReason
          ? reasonItems.map((reason) => (
              <span key={`${cluster.key}-${reason.code}-${reason.label}`} className={`radar-reason-chip radar-reason-chip--${reason.tone}`}>
                <span className="radar-reason-chip__icon">{reason.code}</span>
                <span>{reason.label}</span>
              </span>
            ))
          : null}
      </div>
    </article>
  );
}

import type { UiVariantDefinition } from "@/components/url-radar/ui-variants";
import { formatDate } from "@/components/url-radar/utils";

type RadarOverviewProps = {
  variant: UiVariantDefinition;
  visibleCount: number;
  newCount: number;
  excludedCount: number;
  sourceCount: number;
  memoryCount: number;
  lastRefreshAt: string | null;
  loading: boolean;
  onRefresh: () => void;
};

export function RadarOverview({
  variant,
  visibleCount,
  newCount,
  excludedCount,
  sourceCount,
  memoryCount,
  lastRefreshAt,
  loading,
  onRefresh
}: RadarOverviewProps) {
  return (
    <section className="radar-hero radar-panel radar-surface-primary">
      <div className="radar-hero__content">
        <div className="radar-hero__copy">
          <span className="radar-eyebrow">{variant.eyebrow}</span>
          <h1 className="radar-hero__title">URL Radar</h1>
          <p className="radar-hero__text">
            Toutes tes recherches d'offres dans une seule vue. Les doublons sont regroupes, l'historique reste local et le tri garde les memes regles.
          </p>
          <div className="radar-meta-row">
            <span className="radar-meta-pill">{variant.focus}</span>
            <span className="radar-meta-pill">Derniere actualisation: {formatDate(lastRefreshAt)}</span>
          </div>
        </div>

        <div className="radar-hero__actions">
          <div className="radar-hero__variant-note">
            <strong>{variant.name}</strong>
            <span>{variant.description}</span>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className="radar-primary-action">
            {loading ? "Actualisation..." : "Actualiser"}
          </button>
        </div>
      </div>

      <div className="radar-kpi-grid">
        <div className="radar-kpi-card">
          <span className="radar-kpi-card__label">Offres retenues</span>
          <strong className="radar-kpi-card__value">{visibleCount}</strong>
        </div>
        <div className="radar-kpi-card">
          <span className="radar-kpi-card__label">Nouvelles ce cycle</span>
          <strong className="radar-kpi-card__value">{newCount}</strong>
        </div>
        <div className="radar-kpi-card">
          <span className="radar-kpi-card__label">Sources actives</span>
          <strong className="radar-kpi-card__value">{sourceCount}</strong>
        </div>
        <div className="radar-kpi-card">
          <span className="radar-kpi-card__label">Historique local</span>
          <strong className="radar-kpi-card__value">{memoryCount}</strong>
        </div>
        <div className="radar-kpi-card radar-kpi-card--subtle">
          <span className="radar-kpi-card__label">Exclues</span>
          <strong className="radar-kpi-card__value">{excludedCount}</strong>
        </div>
      </div>
    </section>
  );
}

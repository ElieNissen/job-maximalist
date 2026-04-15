import type { UiVariant, UiVariantDefinition } from "@/components/url-radar/ui-variants";

type VariantSelectorProps = {
  currentVariant: UiVariant;
  variants: UiVariantDefinition[];
  onChange: (variant: UiVariant) => void;
};

export function VariantSelector({ currentVariant, variants, onChange }: VariantSelectorProps) {
  return (
    <section className="radar-panel radar-surface-secondary">
      <div className="radar-section-heading">
        <div>
          <span className="radar-section-kicker">Propositions visuelles</span>
          <h2 className="radar-section-title">Choisis la presentation qui te convient le mieux</h2>
        </div>
        <p className="radar-section-note">Le style change, pas les donnees ni les filtres.</p>
      </div>

      <div className="radar-variant-grid">
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => onChange(variant.id)}
            className={`radar-variant-card${currentVariant === variant.id ? " is-active" : ""}`}
          >
            <span className="radar-variant-card__eyebrow">{variant.eyebrow}</span>
            <strong className="radar-variant-card__title">{variant.name}</strong>
            <span className="radar-variant-card__description">{variant.description}</span>
            <span className="radar-variant-card__footer">
              <span>{variant.density}</span>
              <span>{variant.focus}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

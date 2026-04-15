export type UiVariant = "soft-console" | "editorial-board" | "studio-panels" | "calm-ops";

export type UiVariantDefinition = {
  id: UiVariant;
  name: string;
  eyebrow: string;
  description: string;
  density: string;
  focus: string;
};

export const DEFAULT_UI_VARIANT: UiVariant = "soft-console";
export const UI_VARIANT_STORAGE_KEY = "url-radar-ui-variant";

export const UI_VARIANTS: UiVariantDefinition[] = [
  {
    id: "soft-console",
    name: "Soft Console",
    eyebrow: "Equilibre",
    description: "Le mix le plus propre entre lecture, controles et densite.",
    density: "Moyenne",
    focus: "Surfaces douces et hierarchie nette"
  },
  {
    id: "editorial-board",
    name: "Editorial Board",
    eyebrow: "Lecture",
    description: "Plus d'air, plus de contraste typographique, moins de bruit visuel.",
    density: "Respirante",
    focus: "Les offres passent avant tout"
  },
  {
    id: "studio-panels",
    name: "Studio Panels",
    eyebrow: "Produit",
    description: "Des panneaux plus segmentes, presque comme un outil premium de design ops.",
    density: "Cadree",
    focus: "Controles lisibles et modules distincts"
  },
  {
    id: "calm-ops",
    name: "Calm Ops",
    eyebrow: "Compact",
    description: "Une version plus operationnelle pour absorber beaucoup d'offres sans fatigue.",
    density: "Dense",
    focus: "Vue d'ensemble rapide"
  }
];

export function isUiVariant(value: string | null | undefined): value is UiVariant {
  return UI_VARIANTS.some((variant) => variant.id === value);
}

export function getUiVariantDefinition(variant: UiVariant): UiVariantDefinition {
  return UI_VARIANTS.find((item) => item.id === variant) ?? UI_VARIANTS[0];
}

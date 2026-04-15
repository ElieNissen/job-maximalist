import type { ReactNode } from "react";
import type { MainTab, UtilitySection } from "@/components/url-radar/types";

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="radar-button-icon">
      <path
        d="M5 7h8m3 0h3M5 17h3m3 0h8M13 7a2 2 0 1 0 0 .01M8 17a2 2 0 1 0 0 .01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="radar-button-icon">
      <path
        d="M19 6.5V11h-4.5m-4 6.5A6.5 6.5 0 1 1 18.5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="radar-button-icon">
      <path d="M20 12.2A8.2 8.2 0 1 1 11.8 4 6.7 6.7 0 0 0 20 12.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="radar-button-icon">
      <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.8v2.3M12 18.9v2.3M21.2 12h-2.3M5.1 12H2.8M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

type SectionTabsProps = {
  currentTab: MainTab;
  onChange: (tab: MainTab) => void;
  loading: boolean;
  onRefresh: () => void;
  openUtilitySection: UtilitySection | null;
  onToggleUtilitySection: (section: UtilitySection) => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
};

function UtilityButton({
  label,
  icon,
  active,
  onClick
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`radar-utility-button${active ? " is-active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

export function SectionTabs({
  currentTab,
  onChange,
  loading,
  onRefresh,
  openUtilitySection,
  onToggleUtilitySection,
  themeMode,
  onToggleTheme
}: SectionTabsProps) {
  return (
    <div className="radar-toolbar">
      <div className="radar-tab-row" role="tablist" aria-label="Sections du radar">
        <button
          type="button"
          className={`radar-tab-button${currentTab === "visible" ? " is-active" : ""}`}
          onClick={() => onChange("visible")}
        >
          <span>Offres</span>
        </button>
        <button
          type="button"
          className={`radar-tab-button${currentTab === "excluded" ? " is-active" : ""}`}
          onClick={() => onChange("excluded")}
        >
          <span>Exclues</span>
        </button>
      </div>

      <div className="radar-toolbar__actions">
        <button type="button" className="radar-icon-toggle" onClick={onToggleTheme} aria-label={themeMode === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}>
          <ThemeIcon dark={themeMode === "dark"} />
        </button>
        <UtilityButton
          label="Réglages"
          icon={<SlidersIcon />}
          active={openUtilitySection === "settings"}
          onClick={() => onToggleUtilitySection("settings")}
        />
        <button type="button" className="radar-primary-action radar-primary-action--small" onClick={onRefresh} disabled={loading}>
          <RefreshIcon />
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>
    </div>
  );
}

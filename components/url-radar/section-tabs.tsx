import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Refresh01Icon, SlidersHorizontalIcon, Sun03Icon } from "@hugeicons/core-free-icons";
import type { MainTab, UtilitySection } from "@/components/url-radar/types";

function SlidersIcon() {
  return <HugeiconsIcon icon={SlidersHorizontalIcon} size={16} strokeWidth={2} className="radar-button-icon" />;
}

function RefreshIcon({ loading }: { loading: boolean }) {
  return <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={2} className={`radar-button-icon${loading ? " is-spinning" : ""}`} />;
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return <HugeiconsIcon icon={dark ? Moon02Icon : Sun03Icon} size={16} strokeWidth={2} className="radar-button-icon" />;
}

type SectionTabsProps = {
  loading: boolean;
  onRefresh: () => void;
  openUtilitySection: UtilitySection | null;
  onToggleUtilitySection: (section: UtilitySection) => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
};

type MainTabSwitchProps = {
  currentTab: MainTab;
  onChange: (tab: MainTab) => void;
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

export function MainTabSwitch({ currentTab, onChange }: MainTabSwitchProps) {
  return (
    <div className="radar-tab-row radar-main-tab-row" role="tablist" aria-label="Sections du radar">
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
  );
}

export function SectionTabs({ loading, onRefresh, openUtilitySection, onToggleUtilitySection, themeMode, onToggleTheme }: SectionTabsProps) {
  return (
    <div className="radar-toolbar">
      <div className="radar-toolbar__brand">
        <img src="/job-maximalist-logo.svg" alt="Job Maximalist" className="radar-toolbar__logo" />
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
        <button
          type="button"
          className={`radar-primary-action radar-primary-action--small${loading ? " is-loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshIcon loading={loading} />
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>
    </div>
  );
}

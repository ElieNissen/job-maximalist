import { useEffect, useRef, useState, type ReactNode } from "react";
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

export type SlidingTabOption<T extends string> = {
  label: string;
  value: T;
};

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

type SlidingTabRowProps<T extends string> = {
  ariaLabel: string;
  buttonClassName?: string;
  className?: string;
  onChange: (value: T) => void;
  options: readonly SlidingTabOption<T>[];
  value: T;
};

type TabIndicatorState = {
  left: number;
  ready: boolean;
  width: number;
};

const MAIN_TAB_OPTIONS: readonly SlidingTabOption<MainTab>[] = [
  { label: "Offres", value: "visible" },
  { label: "Exclues", value: "excluded" }
];

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

export function SlidingTabRow<T extends string>({ ariaLabel, buttonClassName, className, onChange, options, value }: SlidingTabRowProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<TabIndicatorState>({ left: 0, ready: false, width: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frame = 0;

    const updateIndicator = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const activeButton = buttonRefs.current[value];
        if (!activeButton) return;

        setIndicator({
          left: activeButton.offsetLeft,
          ready: true,
          width: activeButton.offsetWidth
        });
      });
    };

    updateIndicator();

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateIndicator) : null;

    if (resizeObserver) {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      for (const option of options) {
        const button = buttonRefs.current[option.value];
        if (button) {
          resizeObserver.observe(button);
        }
      }
    }

    window.addEventListener("resize", updateIndicator);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateIndicator);
      resizeObserver?.disconnect();
    };
  }, [options, value]);

  return (
    <div ref={containerRef} className={["radar-tab-row", className].filter(Boolean).join(" ")} role="tablist" aria-label={ariaLabel}>
      <span
        aria-hidden="true"
        className={`radar-tab-row__indicator${indicator.ready ? " is-visible" : ""}`}
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`
        }}
      />

      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[option.value] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={["radar-tab-button", buttonClassName, active ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MainTabSwitch({ currentTab, onChange }: MainTabSwitchProps) {
  return <SlidingTabRow ariaLabel="Sections du radar" className="radar-main-tab-row" value={currentTab} onChange={onChange} options={MAIN_TAB_OPTIONS} />;
}

export function SectionTabs({ loading, onRefresh, openUtilitySection, onToggleUtilitySection, themeMode, onToggleTheme }: SectionTabsProps) {
  const logoSrc = themeMode === "dark" ? "/job-maximalist-logo-dark.svg" : "/job-maximalist-logo.svg";

  return (
    <div className="radar-toolbar">
      <div className="radar-toolbar__brand">
        <img src={logoSrc} alt="Job Maximalist" className="radar-toolbar__logo" />
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

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SourceFilterOption } from "@/components/url-radar/types";

type SourceFilterBarProps = {
  options: SourceFilterOption[];
  activeFilter: string | null;
  onChange: (value: string | null) => void;
  totalCount: number;
};

const ALL_FILTER_KEY = "__all__";
const CHIP_MOTION_DURATION = 360;

export function SourceFilterBar({ options, activeFilter, onChange, totalCount }: SourceFilterBarProps) {
  const activeKey = activeFilter ?? ALL_FILTER_KEY;
  const previousActiveKeyRef = useRef(activeKey);
  const [motionKeys, setMotionKeys] = useState<{ entering: string | null; leaving: string | null }>({
    entering: null,
    leaving: null
  });

  useEffect(() => {
    const previousActiveKey = previousActiveKeyRef.current;
    if (previousActiveKey === activeKey) return undefined;

    previousActiveKeyRef.current = activeKey;
    setMotionKeys({ entering: activeKey, leaving: previousActiveKey });

    const timeout = window.setTimeout(() => {
      setMotionKeys({ entering: null, leaving: null });
    }, CHIP_MOTION_DURATION);

    return () => window.clearTimeout(timeout);
  }, [activeKey]);

  const buildFilterChipClassName = (key: string) =>
    [
      "radar-chip",
      "radar-chip--filter",
      activeKey === key ? "is-active" : "",
      key === ALL_FILTER_KEY ? "is-all-filter" : "",
      key === ALL_FILTER_KEY && activeKey === key ? "is-neutral" : "",
      motionKeys.entering === key ? "is-filter-entering" : "",
      motionKeys.leaving === key ? "is-filter-leaving" : ""
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="radar-filter-strip">
      <div className="radar-chip-row">
        <button type="button" onClick={() => onChange(null)} className={buildFilterChipClassName(ALL_FILTER_KEY)}>
          <span>Tous</span>
          {totalCount > 0 ? <strong>{totalCount}</strong> : null}
        </button>

        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={buildFilterChipClassName(option.key)}
            style={
              {
                "--chip-active-bg": option.color,
                "--chip-active-text": option.textColor
              } as CSSProperties
            }
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

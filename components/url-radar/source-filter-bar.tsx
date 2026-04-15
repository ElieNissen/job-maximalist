import type { CSSProperties } from "react";
import type { SourceFilterOption } from "@/components/url-radar/types";

type SourceFilterBarProps = {
  options: SourceFilterOption[];
  activeFilter: string | null;
  onChange: (value: string | null) => void;
  totalCount: number;
};

export function SourceFilterBar({ options, activeFilter, onChange, totalCount }: SourceFilterBarProps) {
  return (
    <div className="radar-filter-strip">
      <div className="radar-chip-row">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`radar-chip${activeFilter === null ? " is-active is-neutral" : ""}`}
        >
          <span>Tous</span>
          {totalCount > 0 ? <strong>{totalCount}</strong> : null}
        </button>

        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`radar-chip${activeFilter === option.key ? " is-active" : ""}`}
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

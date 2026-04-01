import type { Feature } from "../types";
import { featureLength, formatBp, getRangeLabel, truncate } from "./utils";

type LegendPanelProps = {
  plasmidLength: number;
  features: Feature[];
  visibleIds: Set<string>;
  selectedIds: Set<string>;
  hoveredId: string | null;
  onFeatureClick: (feature: Feature, event: React.MouseEvent<HTMLButtonElement>) => void;
  onFeatureHover: (feature: Feature | null, event?: React.MouseEvent<HTMLElement>) => void;
  onToggleVisibility: (featureId: string) => void;
  onSetVisible: (mode: "all" | "none") => void;
  onToggleLegend: () => void;
};

export default function LegendPanel(props: LegendPanelProps) {
  const { plasmidLength, features, visibleIds, selectedIds, hoveredId, onFeatureClick, onFeatureHover, onToggleVisibility, onSetVisible, onToggleLegend } = props;

  return (
    <aside className="pv-legend-panel">
      <div className="pv-legend-header">
        <div>
          <h3>Annotations</h3>
          <p>{features.length} visible features</p>
        </div>
        <div className="pv-legend-actions">
          <button type="button" className="pv-ghost-button" onClick={onToggleLegend}>Hide legend</button>
          <button type="button" className="pv-ghost-button" onClick={() => onSetVisible("none")}>Hide all</button>
          <button type="button" className="pv-ghost-button" onClick={() => onSetVisible("all")}>Show all</button>
        </div>
      </div>

      <div className="pv-legend-table" role="list">
        {features.map((feature) => {
          const selected = selectedIds.has(feature.id);
          const visible = visibleIds.has(feature.id);
          const hovered = hoveredId === feature.id;
          return (
            <div key={feature.id} className={`pv-legend-row${selected ? " selected" : ""}${hovered ? " hovered" : ""}${visible ? "" : " hidden"}`} role="listitem">
              <button
                type="button"
                className="pv-legend-select"
                onClick={(event) => onFeatureClick(feature, event)}
                onMouseEnter={(event) => onFeatureHover(feature, event)}
                onMouseMove={(event) => onFeatureHover(feature, event)}
                onMouseLeave={() => onFeatureHover(null)}
              >
                <span className="pv-legend-swatch" style={{ backgroundColor: feature.color }} />
                <span className="pv-legend-name">{truncate(feature.name, 28)}</span>
                <span className="pv-legend-type">{truncate(feature.type, 18)}</span>
                <span className="pv-legend-range">{getRangeLabel(feature, plasmidLength)}</span>
                <span className="pv-legend-length">{formatBp(featureLength(feature, plasmidLength))}</span>
              </button>
              <button type="button" className={`pv-visibility-toggle${visible ? " on" : ""}`} onClick={() => onToggleVisibility(feature.id)}>
                {visible ? "Shown" : "Hidden"}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

import type { Feature } from "../types";
import FeatureArc from "./FeatureArc";
import FeatureLabel from "./FeatureLabel";
import { buildLabelLayouts, computeDerivedFeatures, featureLength, polar, projectPosition, rgba, shouldDisplayLabel } from "./utils";
import type { DerivedFeature } from "./utils";

type PlasmidMapProps = {
  plasmidLength: number;
  plasmidName: string;
  strandedness: string;
  features: Feature[];
  visibleIds: Set<string>;
  selectedIds: Set<string>;
  hoveredId: string | null;
  labelFontSize: number;
  labelSpacing: number;
  originBase: number;
  flipped: boolean;
  zoom: number;
  legendVisible: boolean;
  highlightedSpan?: { start: number; end: number } | null;
  highlightMode: "region" | "backbone";
  onFeatureEnter: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onFeatureMove: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onFeatureLeave: () => void;
  onFeatureClick: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
};

const VIEWBOX = 860;
const CENTER = VIEWBOX / 2;

export default function PlasmidMap(props: PlasmidMapProps) {
  const {
    plasmidLength,
    plasmidName,
    strandedness,
    features,
    visibleIds,
    selectedIds,
    hoveredId,
    labelFontSize,
    labelSpacing,
    originBase,
    flipped,
    zoom,
    legendVisible,
    highlightedSpan,
    highlightMode,
    onFeatureEnter,
    onFeatureMove,
    onFeatureLeave,
    onFeatureClick,
  } = props;

  const derivedFeatures = computeDerivedFeatures({
    plasmid: {
      id: "viewer",
      name: plasmidName,
      fileName: plasmidName,
      length: plasmidLength,
      sequence: "",
      topology: "circular",
      strandedness: strandedness === "ss" ? "ss" : "ds",
      features,
    },
    visibleIds,
    selectedIds,
    hoveredId,
    colorByType: false,
    focusSelection: false,
    originBase,
    flipped,
  });
  const backboneSpan =
    highlightMode === "backbone" && highlightedSpan
      ? {
          start: (highlightedSpan.end + 1) % plasmidLength,
          end: (highlightedSpan.start - 1 + plasmidLength) % plasmidLength,
          length:
            plasmidLength -
            (highlightedSpan.start <= highlightedSpan.end
              ? highlightedSpan.end - highlightedSpan.start + 1
              : plasmidLength - highlightedSpan.start + highlightedSpan.end + 1),
        }
      : null;
  const displayFeatures = backboneSpan
    ? derivedFeatures.map((derived) => ({
        ...derived,
        state:
          featureOverlapsSpan(derived.feature, backboneSpan.start, backboneSpan.end, plasmidLength) ||
          selectedIds.has(derived.feature.id) ||
          hoveredId === derived.feature.id
            ? derived.state
            : "muted" as const,
      }))
    : derivedFeatures;

  const baseRadius = legendVisible ? 178 + zoom * 16 : 150 + zoom * 10;
  const labelRadius = legendVisible ? 320 + zoom * 48 : 360 + zoom * 60;
  const labels = displayFeatures.filter((derived) =>
    shouldDisplayLabel({ derived, selectedIds, hoveredId }),
  );
  const labelFeatures =
    selectedIds.size > 0
      ? labels.map((derived) => ({
          ...derived,
          state:
            selectedIds.has(derived.feature.id) || hoveredId === derived.feature.id
              ? derived.state
              : "muted" as const,
        }))
      : labels.map((derived) => ({
          ...derived,
          state: hoveredId === derived.feature.id ? derived.state : "default" as const,
        }));
  const labelLayouts = buildLabelLayouts({
    features: labelFeatures,
    center: CENTER,
    outerRadius: baseRadius + 28,
    labelRadius,
    minGap: (legendVisible ? 26 : 30) * labelSpacing,
    lineHeight: labelFontSize + 3,
  });
  const labelMap = new Map(labelLayouts.map((layout) => [layout.featureId, layout]));
  const selectedFeature = derivedFeatures.find((feature) => selectedIds.has(feature.feature.id));

  return (
    <svg className="pv-map-svg" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} role="img" aria-label={`${plasmidName} plasmid map`}>
      <defs>
        <filter id="pvSelectionGlow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={baseRadius + 12} className="pv-ring-base" />
      <circle cx={CENTER} cy={CENTER} r={baseRadius - 56} className="pv-ring-core" />

      {highlightedSpan ? renderSpanHighlight({ center: CENTER, baseRadius, plasmidLength, highlightedSpan, highlightMode, originBase, flipped }) : null}

      {displayFeatures.map((derived) => (
        <FeatureArc
          key={derived.feature.id}
          center={CENTER}
          baseRadius={baseRadius}
          laneOffset={14}
          thickness={derived.state === "selected" ? 16 : 13}
          plasmidLength={plasmidLength}
          originBase={originBase}
          flipped={flipped}
          derived={derived}
          onMouseEnter={onFeatureEnter}
          onMouseMove={onFeatureMove}
          onMouseLeave={onFeatureLeave}
          onClick={onFeatureClick}
        />
      ))}

      {labelFeatures.map((derived) => {
        const layout = labelMap.get(derived.feature.id);
        if (!layout) return null;
        return (
          <FeatureLabel
            key={derived.feature.id}
            derived={derived}
            layout={layout}
            fontSize={labelFontSize}
            lineHeight={labelFontSize + 3}
            onMouseEnter={onFeatureEnter}
            onMouseMove={onFeatureMove}
            onMouseLeave={onFeatureLeave}
            onClick={onFeatureClick}
          />
        );
      })}

      <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="pv-center-label">
        {plasmidName}
      </text>
      <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="pv-center-meta">
        {plasmidLength.toLocaleString()} bp
      </text>
      <text
        x={CENTER}
        y={CENTER + 40}
        textAnchor="middle"
        className={backboneSpan ? "pv-center-submeta backbone" : "pv-center-submeta"}
      >
        {backboneSpan
          ? `${backboneSpan.length.toLocaleString()} bp backbone selected`
          : selectedIds.size > 0
          ? `${selectedIds.size} selected${selectedFeature ? ` · ${featureLength(selectedFeature.feature, plasmidLength).toLocaleString()} bp focus` : ""}`
          : `${features.length} annotations · ${strandedness.toUpperCase()}DNA`}
      </text>
    </svg>
  );
}

function featureOverlapsSpan(feature: Feature, start: number, end: number, plasmidLength: number): boolean {
  const featurePositions = expandSpan(feature.start, feature.end, plasmidLength);
  const spanPositions = expandSpan(start, end, plasmidLength);
  for (const position of featurePositions) {
    if (spanPositions.has(position)) return true;
  }
  return false;
}

function expandSpan(start: number, end: number, plasmidLength: number): Set<number> {
  const positions = new Set<number>();
  if (start <= end) {
    for (let position = start; position <= end; position += 1) positions.add(position);
    return positions;
  }
  for (let position = start; position < plasmidLength; position += 1) positions.add(position);
  for (let position = 0; position <= end; position += 1) positions.add(position);
  return positions;
}

function renderSpanHighlight(args: {
  center: number;
  baseRadius: number;
  plasmidLength: number;
  highlightedSpan: { start: number; end: number };
  highlightMode: "region" | "backbone";
  originBase: number;
  flipped: boolean;
}) {
  const { center, baseRadius, plasmidLength, highlightedSpan, highlightMode, originBase, flipped } = args;
  const color = highlightMode === "region" ? "#ea580c" : "#0f766e";
  const radius = baseRadius - 26;

  const spanFeature: DerivedFeature = {
    feature: {
      id: "highlight",
      name: "highlight",
      type: "highlight",
      start: highlightMode === "region" ? highlightedSpan.start : (highlightedSpan.end + 1) % plasmidLength,
      end:
        highlightMode === "region"
          ? highlightedSpan.end
          : (highlightedSpan.start - 1 + plasmidLength) % plasmidLength,
      color,
    },
    startAngle: 0,
    endAngle: 0,
    midAngle: 0,
    span: 0,
    lane: 0,
    color,
    state: "default",
    isVisible: true,
    isFocused: false,
  };

  const startAngle =
    (projectPosition(spanFeature.feature.start, Math.max(1, plasmidLength), originBase, flipped) / Math.max(1, plasmidLength)) * Math.PI * 2 - Math.PI / 2;
  const span =
    spanFeature.feature.start <= spanFeature.feature.end
      ? spanFeature.feature.end - spanFeature.feature.start + 1
      : plasmidLength - spanFeature.feature.start + spanFeature.feature.end + 1;
  const endAngle =
    (projectPosition(spanFeature.feature.start + span, Math.max(1, plasmidLength), originBase, flipped) / Math.max(1, plasmidLength)) * Math.PI * 2 - Math.PI / 2;
  const startPoint = polar(center, center, radius, startAngle);
  const endPoint = polar(center, center, radius, endAngle);
  const largeArc = span / Math.max(1, plasmidLength) > 0.5 ? 1 : 0;
  const path = `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} ${flipped ? 0 : 1} ${endPoint.x} ${endPoint.y}`;

  return (
    <>
      <path d={path} stroke={rgba(color, 0.18)} strokeWidth={26} fill="none" strokeLinecap="round" />
      <path d={path} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" />
    </>
  );
}

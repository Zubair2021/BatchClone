import type { Feature } from "./types";

type CircularMapProps = {
  sequenceLength: number;
  features: Feature[];
  selectedFeatureIds: string[];
  highlightedSpan?: { start: number; end: number } | null;
  title?: string;
  onFeatureClick: (featureId: string) => void;
};

const SIZE = 420;
const CENTER = SIZE / 2;
const FEATURE_RADIUS = 138;
const HIGHLIGHT_RADIUS = 104;
const LABEL_RADIUS = 170;

export default function CircularMap(props: CircularMapProps) {
  const { sequenceLength, features, selectedFeatureIds, highlightedSpan, title, onFeatureClick } = props;
  const selected = new Set(selectedFeatureIds);
  const sortedFeatures = [...features].sort((a, b) => midpoint(a.start, a.end, sequenceLength) - midpoint(b.start, b.end, sequenceLength));

  if (!sequenceLength) {
    return <div className="empty-map">Load a plasmid to inspect its circular map.</div>;
  }

  return (
    <div className="map-shell">
      <svg className="circular-map" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={CENTER} cy={CENTER} r={150} className="map-backbone" />
        {highlightedSpan ? (
          <path
            d={describeArc(highlightedSpan.start, highlightedSpan.end, sequenceLength, HIGHLIGHT_RADIUS)}
            className="selected-arc"
            strokeWidth={22}
          />
        ) : null}
        {sortedFeatures.map((feature, index) => {
          const isSelected = selected.has(feature.id);
          const labelAnglePosition = midpoint(feature.start, feature.end, sequenceLength);
          const labelRadius = LABEL_RADIUS + (index % 2 === 0 ? 0 : 18);
          const labelPoint = polarPosition(labelAnglePosition, sequenceLength, labelRadius);
          const anchorPoint = polarPosition(labelAnglePosition, sequenceLength, FEATURE_RADIUS + 10);
          return (
            <g key={feature.id}>
              <path
                d={describeArc(feature.start, feature.end, sequenceLength, FEATURE_RADIUS)}
                stroke={isSelected ? "#111827" : feature.color}
                strokeWidth={isSelected ? 18 : 14}
                className="feature-arc"
                onClick={() => onFeatureClick(feature.id)}
              />
              <line
                x1={anchorPoint.x}
                y1={anchorPoint.y}
                x2={labelPoint.x}
                y2={labelPoint.y - 4}
                className={`feature-leader ${isSelected ? "selected" : ""}`}
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                className={`feature-label ${isSelected ? "selected" : ""}`}
                onClick={() => onFeatureClick(feature.id)}
              >
                {truncate(feature.name, 18)}
              </text>
            </g>
          );
        })}
        <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="map-center-title">
          {title ?? "Plasmid"}
        </text>
        <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="map-center-meta">
          {sequenceLength.toLocaleString()} bp
        </text>
      </svg>
      <div className="map-caption">Click one or more labeled features directly on the map.</div>
    </div>
  );
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function midpoint(start: number, end: number, length: number): number {
  if (start <= end) return Math.round((start + end) / 2);
  const wrapped = end + length;
  return Math.round(((start + wrapped) / 2) % length);
}

function polarPosition(position: number, length: number, radius: number) {
  const ratio = length <= 1 ? 0 : position / length;
  const angle = ratio * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function describeArc(start: number, end: number, length: number, radius: number): string {
  if (length <= 1) return "";
  if (start > end) {
    const first = describeArc(start, length - 1, length, radius);
    const second = describeArc(0, end, length, radius);
    return `${first} ${second}`;
  }

  const startPoint = polarPosition(start, length, radius);
  const endPoint = polarPosition(end, length, radius);
  const sweep = end - start;
  const largeArc = sweep / length > 0.5 ? 1 : 0;
  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`;
}

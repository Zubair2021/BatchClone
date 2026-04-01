import type { Feature } from "../types";
import { polar, rgba, statefulColor, type DerivedFeature } from "./utils";

type FeatureArcProps = {
  center: number;
  baseRadius: number;
  laneOffset: number;
  thickness: number;
  plasmidLength: number;
  derived: DerivedFeature;
  onMouseEnter: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onMouseMove: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
  onClick: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
};

export default function FeatureArc(props: FeatureArcProps) {
  const { center, baseRadius, laneOffset, thickness, plasmidLength, derived, onMouseEnter, onMouseMove, onMouseLeave, onClick } = props;
  const radius = baseRadius + derived.lane * laneOffset;
  const stroke = statefulColor(derived.color, derived.state);
  const glow = derived.state === "selected" ? rgba(derived.color, 0.24) : derived.state === "hovered" ? rgba(derived.color, 0.16) : "transparent";
  const arrow = buildArrowHead({
    center,
    radius,
    angle: directionAngle(derived, plasmidLength),
    color: stroke,
    strand: derived.feature.strand,
    thickness,
  });

  return (
    <g
      className="pv-feature-hit"
      onMouseEnter={(event) => onMouseEnter(derived.feature, event)}
      onMouseMove={(event) => onMouseMove(derived.feature, event)}
      onMouseLeave={onMouseLeave}
      onClick={(event) => onClick(derived.feature, event)}
    >
      {derived.state !== "muted" ? <path d={describeArc(derived, center, radius, plasmidLength)} stroke={glow} strokeWidth={thickness + 8} fill="none" strokeLinecap="round" /> : null}
      <path
        d={describeArc(derived, center, radius, plasmidLength)}
        stroke={stroke}
        strokeWidth={derived.state === "selected" ? thickness + 2 : derived.state === "hovered" ? thickness + 1 : thickness}
        fill="none"
        strokeLinecap="round"
      />
      {arrow}
    </g>
  );
}

function describeArc(derived: DerivedFeature, center: number, radius: number, plasmidLength: number): string {
  const span = derived.span;
  const start = derived.feature.start;
  const endPosition = (start + span) % plasmidLength;
  const startPoint = polar(center, center, radius, derived.startAngle);
  const endPoint = polar(center, center, radius, derived.endAngle);
  const largeArc = span / Math.max(1, plasmidLength) > 0.5 ? 1 : 0;

  if (derived.feature.start > derived.feature.end) {
    const wrappedMid = polar(center, center, radius, Math.PI * 1.5);
    return [
      `M ${startPoint.x} ${startPoint.y}`,
      `A ${radius} ${radius} 0 1 1 ${wrappedMid.x} ${wrappedMid.y}`,
      `M ${polar(center, center, radius, -Math.PI / 2).x} ${polar(center, center, radius, -Math.PI / 2).y}`,
      `A ${radius} ${radius} 0 0 1 ${endPoint.x} ${endPoint.y}`,
    ].join(" ");
  }

  if (endPosition === start) {
    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 1 1 ${endPoint.x} ${endPoint.y}`;
  }

  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`;
}

function directionAngle(derived: DerivedFeature, plasmidLength: number): number {
  if (derived.feature.strand === -1) {
    return ((derived.feature.start + Math.min(derived.span * 0.18, plasmidLength * 0.03)) / plasmidLength) * Math.PI * 2 - Math.PI / 2;
  }
  return ((derived.feature.start + derived.span - Math.min(derived.span * 0.18, plasmidLength * 0.03)) / plasmidLength) * Math.PI * 2 - Math.PI / 2;
}

function buildArrowHead(args: {
  center: number;
  radius: number;
  angle: number;
  color: string;
  strand?: number;
  thickness: number;
}) {
  const { center, radius, angle, color, strand, thickness } = args;
  if (!strand) return null;

  const tip = polar(center, center, radius, angle);
  const tangentAngle = strand === -1 ? angle - Math.PI / 2 : angle + Math.PI / 2;
  const normalLeft = polar(tip.x, tip.y, thickness * 0.7, tangentAngle);
  const normalRight = polar(tip.x, tip.y, thickness * 0.7, tangentAngle + Math.PI);
  const base = polar(center, center, radius + (strand === -1 ? 6 : -6), angle);

  return <polygon points={`${tip.x},${tip.y} ${normalLeft.x},${normalLeft.y} ${base.x},${base.y} ${normalRight.x},${normalRight.y}`} fill={color} />;
}

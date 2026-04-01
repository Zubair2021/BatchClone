import type { Feature } from "../types";
import { truncate, type DerivedFeature, type LabelLayout } from "./utils";

type FeatureLabelProps = {
  derived: DerivedFeature;
  layout: LabelLayout;
  onMouseEnter: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onMouseMove: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
  onClick: (feature: Feature, event: React.MouseEvent<SVGGElement>) => void;
};

export default function FeatureLabel(props: FeatureLabelProps) {
  const { derived, layout, onMouseEnter, onMouseMove, onMouseLeave, onClick } = props;
  const lines = wrapLabel(derived.feature.name, 18);

  return (
    <g
      className={`pv-label-group ${derived.state}`}
      onMouseEnter={(event) => onMouseEnter(derived.feature, event)}
      onMouseMove={(event) => onMouseMove(derived.feature, event)}
      onMouseLeave={onMouseLeave}
      onClick={(event) => onClick(derived.feature, event)}
    >
      <path
        d={`M ${layout.anchorX} ${layout.anchorY} L ${layout.elbowX} ${layout.elbowY} L ${layout.labelX + (layout.side === "right" ? -8 : 8)} ${layout.labelY}`}
        className="pv-label-leader"
      />
      <text x={layout.labelX} y={layout.labelY - 2} textAnchor={layout.textAnchor} className="pv-label-title">
        {lines.map((line, index) => (
          <tspan key={`${derived.feature.id}-${index}`} x={layout.labelX} dy={index === 0 ? 0 : 12}>
            {index === lines.length - 1 ? truncate(line, 18) : line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function wrapLabel(value: string, maxLineLength: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [value];
  const lines: string[] = [];
  let current = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const next = words[index];
    if (`${current} ${next}`.length <= maxLineLength) {
      current = `${current} ${next}`;
      continue;
    }
    lines.push(current);
    current = next;
    if (lines.length === 1) break;
  }

  const remainingStart = lines.length === 1 ? words.indexOf(current) : words.length;
  if (remainingStart < words.length - 1) {
    current = [current, ...words.slice(remainingStart + 1)].join(" ");
  }
  lines.push(current);
  return lines.slice(0, 2);
}

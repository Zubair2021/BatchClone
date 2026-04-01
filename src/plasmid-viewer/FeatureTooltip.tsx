import type { Feature } from "../types";
import { featureLength, formatBp, getRangeLabel, getStrandLabel } from "./utils";

type FeatureTooltipProps = {
  feature: Feature | null;
  plasmidLength: number;
  x: number;
  y: number;
};

export default function FeatureTooltip(props: FeatureTooltipProps) {
  const { feature, plasmidLength, x, y } = props;

  if (!feature) return null;

  return (
    <div className="pv-tooltip" style={{ left: x, top: y }}>
      <strong>{feature.name}</strong>
      <dl>
        <div>
          <dt>Range</dt>
          <dd>{getRangeLabel(feature, plasmidLength)}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{formatBp(featureLength(feature, plasmidLength))}</dd>
        </div>
        <div>
          <dt>Direction</dt>
          <dd>{getStrandLabel(feature.strand)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{feature.type}</dd>
        </div>
      </dl>
    </div>
  );
}

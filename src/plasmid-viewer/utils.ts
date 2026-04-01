import type { Feature, Plasmid } from "../types";

export type FeatureState = "default" | "hovered" | "selected" | "muted";

export type LabelLayout = {
  featureId: string;
  side: "left" | "right";
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  labelX: number;
  labelY: number;
  textAnchor: "start" | "end";
  lane: number;
  lineCount: number;
};

export type DerivedFeature = {
  feature: Feature;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
  lane: number;
  color: string;
  state: FeatureState;
  isVisible: boolean;
  isFocused: boolean;
};

const TYPE_COLORS: Record<string, string> = {
  cds: "#0f766e",
  promoter: "#c2410c",
  terminator: "#7c3aed",
  origin: "#0369a1",
  orf: "#0f766e",
  primer_bind: "#475569",
  primer: "#475569",
  enhancer: "#be123c",
  misc_feature: "#4f46e5",
  insert: "#b91c1c",
  marker: "#166534",
};

export function formatBp(value: number): string {
  return `${value.toLocaleString()} bp`;
}

export function featureLength(feature: Feature, plasmidLength?: number): number {
  if (plasmidLength && feature.start > feature.end) {
    return plasmidLength - feature.start + feature.end + 1;
  }
  return Math.max(1, feature.end - feature.start + 1);
}

export function angleForPosition(position: number, length: number): number {
  return (position / Math.max(1, length)) * Math.PI * 2 - Math.PI / 2;
}

export function clampAngle(angle: number): number {
  let value = angle;
  while (value < -Math.PI / 2) value += Math.PI * 2;
  while (value > Math.PI * 1.5) value -= Math.PI * 2;
  return value;
}

export function midpoint(feature: Feature, plasmidLength: number): number {
  if (feature.start <= feature.end) {
    return (feature.start + feature.end) / 2;
  }
  return ((feature.start + feature.end + plasmidLength) / 2) % plasmidLength;
}

export function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function normalizeType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, "_");
}

export function resolveFeatureColor(feature: Feature, colorByType: boolean): string {
  if (!colorByType) return feature.color;
  return TYPE_COLORS[normalizeType(feature.type)] ?? feature.color;
}

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((char) => `${char}${char}`).join("") : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mix(hex: string, target: string, weight: number): string {
  const from = hexToRgb(hex);
  const to = hexToRgb(target);
  const blend = (a: number, b: number) => Math.round(a * (1 - weight) + b * weight);
  return `rgb(${blend(from.r, to.r)}, ${blend(from.g, to.g)}, ${blend(from.b, to.b)})`;
}

export function statefulColor(base: string, state: FeatureState): string {
  if (state === "selected") return mix(base, "#08111f", 0.18);
  if (state === "hovered") return mix(base, "#08111f", 0.08);
  if (state === "muted") return mix(base, "#f8fafc", 0.48);
  return base;
}

export function computeFeatureLane(feature: Feature, allFeatures: Feature[], plasmidLength: number): number {
  const window = Math.max(18, plasmidLength * 0.012);
  const conflicts: number[] = [];
  const currentMid = midpoint(feature, plasmidLength);

  for (const candidate of allFeatures) {
    if (candidate.id === feature.id) continue;
    const candidateMid = midpoint(candidate, plasmidLength);
    const delta = circularDistance(currentMid, candidateMid, plasmidLength);
    if (delta > window) continue;
    conflicts.push(computeRawSpan(candidate, plasmidLength));
  }

  if (!conflicts.length) return 0;
  const lane = Math.min(2, Math.floor(conflicts.length / 2));
  return lane;
}

function circularDistance(a: number, b: number, total: number) {
  const delta = Math.abs(a - b);
  return Math.min(delta, total - delta);
}

export function computeRawSpan(feature: Feature, plasmidLength: number): number {
  return feature.start <= feature.end
    ? feature.end - feature.start + 1
    : plasmidLength - feature.start + feature.end + 1;
}

export function computeDerivedFeatures(args: {
  plasmid: Plasmid;
  visibleIds: Set<string>;
  selectedIds: Set<string>;
  hoveredId: string | null;
  colorByType: boolean;
  focusSelection: boolean;
}): DerivedFeature[] {
  const { plasmid, visibleIds, selectedIds, hoveredId, colorByType, focusSelection } = args;
  const visibleFeatures = plasmid.features.filter((feature) => visibleIds.has(feature.id));

  return visibleFeatures
    .map((feature) => {
      const span = computeRawSpan(feature, plasmid.length);
      const mid = midpoint(feature, plasmid.length);
      const isSelected = selectedIds.has(feature.id);
      const isHovered = hoveredId === feature.id;
      const hasSelection = selectedIds.size > 0;
      let state: FeatureState = "default";
      if (isSelected) state = "selected";
      else if (isHovered) state = "hovered";
      else if ((hasSelection || focusSelection) && !isSelected) state = "muted";

      return {
        feature,
        startAngle: angleForPosition(feature.start, plasmid.length),
        endAngle: angleForPosition((feature.start + span) % plasmid.length, plasmid.length),
        midAngle: angleForPosition(mid, plasmid.length),
        span,
        lane: computeFeatureLane(feature, visibleFeatures, plasmid.length),
        color: resolveFeatureColor(feature, colorByType),
        state,
        isVisible: visibleIds.has(feature.id),
        isFocused: isSelected || isHovered,
      };
    })
    .sort((a, b) => a.span - b.span);
}

export function getRangeLabel(feature: Feature, plasmidLength: number): string {
  const start = feature.start + 1;
  const end = feature.end + 1;
  if (feature.start > feature.end && plasmidLength > 0) {
    return `${start}-${plasmidLength}, 1-${end}`;
  }
  return `${start}-${end}`;
}

export function getStrandLabel(strand?: number): string {
  if (strand === 1) return "Forward";
  if (strand === -1) return "Reverse";
  return "Undirected";
}

export function shouldDisplayLabel(args: {
  derived: DerivedFeature;
  collapseMinorAnnotations: boolean;
  selectedIds: Set<string>;
  hoveredId: string | null;
  plasmidLength: number;
}): boolean {
  const { derived, collapseMinorAnnotations, selectedIds, hoveredId, plasmidLength } = args;
  if (selectedIds.has(derived.feature.id) || hoveredId === derived.feature.id) return true;
  if (collapseMinorAnnotations) {
    return derived.span >= plasmidLength * 0.012;
  }
  return true;
}

export function buildLabelLayouts(args: {
  features: DerivedFeature[];
  center: number;
  outerRadius: number;
  labelRadius: number;
  minGap: number;
  lineHeight: number;
}): LabelLayout[] {
  const { features, center, outerRadius, labelRadius, minGap, lineHeight } = args;
  const left: LabelLayout[] = [];
  const right: LabelLayout[] = [];
  const perSideCount = Math.max(1, Math.ceil(features.length / 2));
  const dynamicGap = Math.max(minGap, Math.min(52, 24 + perSideCount * 1.2));

  for (const derived of features) {
    const anchor = polar(center, center, outerRadius + derived.lane * 14, clampAngle(derived.midAngle));
    const elbow = polar(center, center, labelRadius - 18 + derived.lane * 12, clampAngle(derived.midAngle));
    const side = Math.cos(derived.midAngle) >= 0 ? "right" : "left";
    const targetX = side === "right" ? center + labelRadius + derived.lane * 24 : center - labelRadius - derived.lane * 24;
    const lineCount = estimateLabelLineCount(derived.feature.name, 18);

    const layout: LabelLayout = {
      featureId: derived.feature.id,
      side,
      anchorX: anchor.x,
      anchorY: anchor.y,
      elbowX: elbow.x,
      elbowY: elbow.y,
      labelX: targetX,
      labelY: elbow.y,
      textAnchor: side === "right" ? "start" : "end",
      lane: derived.lane,
      lineCount,
    };

    if (side === "right") right.push(layout);
    else left.push(layout);
  }

  return [...distributeLayouts(left, center, dynamicGap, lineHeight), ...distributeLayouts(right, center, dynamicGap, lineHeight)];
}

function distributeLayouts(layouts: LabelLayout[], center: number, minGap: number, lineHeight: number): LabelLayout[] {
  const sorted = [...layouts].sort((a, b) => a.labelY - b.labelY);
  const minY = center - 300;
  const maxY = center + 300;

  for (let index = 0; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    if (!previous) {
      sorted[index] = {
        ...sorted[index],
        labelY: clamp(sorted[index].labelY, minY, maxY),
      };
      continue;
    }
    const previousHeight = Math.max(lineHeight, previous.lineCount * lineHeight);
    const currentHeight = Math.max(lineHeight, sorted[index].lineCount * lineHeight);
    sorted[index] = {
      ...sorted[index],
      labelY: Math.max(sorted[index].labelY, previous.labelY + previousHeight + Math.max(minGap, currentHeight * 0.25)),
    };
  }

  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const next = sorted[index + 1];
    if (!next) continue;
    if (next.labelY > maxY) {
      sorted[index + 1] = { ...next, labelY: maxY };
    }
    const currentHeight = Math.max(lineHeight, sorted[index].lineCount * lineHeight);
    const nextHeight = Math.max(lineHeight, next.lineCount * lineHeight);
    const requiredGap = currentHeight + Math.max(minGap, nextHeight * 0.25);
    if (sorted[index].labelY > next.labelY - requiredGap) {
      sorted[index] = { ...sorted[index], labelY: next.labelY - requiredGap };
    }
  }

  return sorted.map((layout) => ({
    ...layout,
    labelY: clamp(layout.labelY, minY, maxY),
  }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatSequence(sequence: string) {
  return sequence.match(/.{1,60}/g)?.map((line, index) => `${String(index * 60 + 1).padStart(6, " ")} ${line}`).join("\n") ?? "";
}

export function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

export function featureContainsPosition(feature: Feature, position: number, plasmidLength: number): boolean {
  if (plasmidLength <= 0) return false;
  if (feature.start <= feature.end) {
    return position >= feature.start && position <= feature.end;
  }
  return position >= feature.start || position <= feature.end;
}

export function estimateLabelLineCount(value: string, maxLineLength: number): number {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let current = words[0] ?? "";
  let lines = 1;

  for (let index = 1; index < words.length; index += 1) {
    const next = words[index] ?? "";
    if (`${current} ${next}`.length <= maxLineLength) {
      current = `${current} ${next}`;
      continue;
    }
    lines += 1;
    current = next;
    if (lines >= 2) break;
  }

  return Math.min(2, lines);
}

import { anyToJson } from "@teselagen/bio-parsers";
import type {
  AssemblyFragment,
  AssemblyMethod,
  BoundaryInclusion,
  Feature,
  Plasmid,
  PrimerCheck,
  PrimerDiagnostics,
  PrimerDiagnosticStatus,
  PrimerPairDiagnostics,
  PrimerRecord,
  RegionRule,
  SeamlessAssemblyPrimers,
  SelectionMode,
} from "./types";

const FEATURE_COLORS = [
  "#2563eb",
  "#d97706",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#be123c",
];

type ParserResult = {
  success: boolean;
  messages?: string[];
  parsedSequence?: {
    name?: string;
    description?: string;
    circular?: boolean;
    sequence?: string;
    features?: Array<{
      name?: string;
      type?: string;
      start?: number;
      end?: number;
      strand?: number;
    }>;
  };
};

export async function parsePlasmidFile(file: File): Promise<Plasmid> {
  const rawText = await file.text();
  const parsedResult = (await anyToJson(file, { fileName: file.name })) as ParserResult[] | ParserResult;
  const parsed = Array.isArray(parsedResult) ? parsedResult : [parsedResult];
  const firstSuccess = parsed.find((entry) => entry.success && entry.parsedSequence);
  const parserSequence = firstSuccess?.parsedSequence?.sequence ?? "";
  const fallbackSequence = sanitizeSequence(rawText);
  const sequence = sanitizeSequence(parserSequence) || fallbackSequence;
  if (!sequence) {
    const messages = parsed.flatMap((entry) => entry.messages ?? []);
    throw new Error(messages[0] ?? `Unable to parse ${file.name}`);
  }

  const raw = firstSuccess?.parsedSequence;
  const features = (raw?.features ?? [])
    .map((feature, index) => normalizeFeature(feature, index, sequence.length))
    .filter((feature): feature is Feature => feature !== null);

  return {
    id: crypto.randomUUID(),
    name: raw?.name?.trim() || file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    length: sequence.length,
    sequence,
    topology: raw?.circular === false ? "linear" : "circular",
    strandedness: "ds",
    description: raw?.description,
    features,
  };
}

type ParsedFeature = {
  name?: string;
  type?: string;
  start?: number;
  end?: number;
  strand?: number;
};

function normalizeFeature(feature: ParsedFeature, index: number, sequenceLength: number): Feature | null {
  if (!Number.isFinite(feature.start) || !Number.isFinite(feature.end) || sequenceLength <= 0) {
    return null;
  }

  const start = normalizeCoordinate(feature.start ?? 0, sequenceLength);
  const end = normalizeCoordinate(feature.end ?? 0, sequenceLength);
  return {
    id: crypto.randomUUID(),
    name: feature.name?.trim() || `Feature ${index + 1}`,
    type: feature.type?.trim() || "misc_feature",
    start,
    end,
    strand: feature.strand,
    color: FEATURE_COLORS[index % FEATURE_COLORS.length],
  };
}

function normalizeCoordinate(value: number, sequenceLength: number): number {
  const rounded = Math.round(value);
  if (rounded >= 1 && rounded <= sequenceLength) return rounded - 1;
  return ((rounded % sequenceLength) + sequenceLength) % sequenceLength;
}

export function sanitizeSequence(sequence: string): string {
  return sequence
    .replace(/^>.*$/gm, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function extractSelectedSequence(
  plasmid: Plasmid,
  span: { start: number; end: number } | null,
): string {
  if (!span) return "";
  const { sequence, topology } = plasmid;
  if (topology === "linear" || span.start <= span.end) {
    return sequence.slice(span.start, span.end + 1);
  }
  return sequence.slice(span.start) + sequence.slice(0, span.end + 1);
}

export function extractFragmentSequence(
  sequence: string,
  selectionMode: SelectionMode,
  start: number,
  end: number,
  openAt: number,
): string {
  if (!sequence.length) return "";
  if (selectionMode === "whole-plasmid") {
    const safeOpen = clampBase(openAt, sequence.length);
    return sequence.slice(safeOpen) + sequence.slice(0, safeOpen);
  }

  const safeStart = clampBase(start, sequence.length);
  const safeEnd = clampBase(end, sequence.length);
  if (safeStart <= safeEnd) {
    return sequence.slice(safeStart, safeEnd + 1);
  }
  return sequence.slice(safeStart) + sequence.slice(0, safeEnd + 1);
}

export function clampBase(value: number, length: number): number {
  if (!length) return 0;
  if (Number.isNaN(value)) return 0;
  const rounded = Math.round(value);
  return Math.min(length - 1, Math.max(0, rounded));
}

export function fragmentLength(
  selectionMode: SelectionMode,
  sequenceLength: number,
  start: number,
  end: number,
): number {
  if (!sequenceLength) return 0;
  if (selectionMode === "whole-plasmid") return sequenceLength;
  if (start <= end) return end - start + 1;
  return sequenceLength - start + end + 1;
}

export function reverseComplement(sequence: string): string {
  const map: Record<string, string> = {
    A: "T",
    T: "A",
    G: "C",
    C: "G",
    R: "Y",
    Y: "R",
    M: "K",
    K: "M",
    S: "S",
    W: "W",
    B: "V",
    V: "B",
    D: "H",
    H: "D",
    N: "N",
  };
  return sequence
    .toUpperCase()
    .split("")
    .reverse()
    .map((base) => map[base] ?? "N")
    .join("");
}

export function calculateWallaceTm(sequence: string): number {
  const upper = sequence.toUpperCase();
  let at = 0;
  let gc = 0;
  for (const base of upper) {
    if (base === "A" || base === "T") at += 1;
    if (base === "G" || base === "C") gc += 1;
  }
  return at * 2 + gc * 4;
}

export function calculateGcPercent(sequence: string): number {
  if (!sequence.length) return 0;
  let gc = 0;
  for (const base of sequence.toUpperCase()) {
    if (base === "G" || base === "C") gc += 1;
  }
  return (gc / sequence.length) * 100;
}

export function calculatePrimerTm(sequence: string, sodiumMolar = 0.05): number {
  if (!sequence.length) return 0;
  const gcPercent = calculateGcPercent(sequence);
  return 81.5 + 16.6 * Math.log10(sodiumMolar) + 0.41 * gcPercent - 675 / sequence.length;
}

function longestHomopolymer(sequence: string): number {
  if (!sequence.length) return 0;
  let maxRun = 1;
  let run = 1;
  for (let index = 1; index < sequence.length; index += 1) {
    if (sequence[index] === sequence[index - 1]) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  return maxRun;
}

function longest3PrimeComplement(a: string, b: string, limit = 8): number {
  if (!a.length || !b.length) return 0;
  const suffix = a.slice(-Math.min(limit, a.length));
  let best = 0;
  for (let suffixStart = 0; suffixStart < suffix.length; suffixStart += 1) {
    for (let start = 0; start < b.length; start += 1) {
      let matched = 0;
      while (
        suffixStart + matched < suffix.length &&
        start + matched < b.length &&
        reverseComplement(suffix[suffixStart + matched]) === b[start + matched]
      ) {
        matched += 1;
      }
      best = Math.max(best, matched);
    }
  }
  return best;
}

function estimateHairpinRisk(sequence: string): number {
  if (sequence.length < 8) return 0;
  let best = 0;
  for (let stemLength = 4; stemLength <= Math.min(8, Math.floor(sequence.length / 2)); stemLength += 1) {
    const tail = sequence.slice(-stemLength);
    for (let start = 0; start <= sequence.length - stemLength - 3; start += 1) {
      const candidate = sequence.slice(start, start + stemLength);
      const loopSize = sequence.length - (start + stemLength);
      if (loopSize < 3) continue;
      let matched = 0;
      while (
        matched < stemLength &&
        reverseComplement(tail[stemLength - matched - 1]) === candidate[matched]
      ) {
        matched += 1;
      }
      best = Math.max(best, matched);
    }
  }
  return best;
}

function statusFromChecks(checks: PrimerCheck[]): PrimerDiagnosticStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function summarizeStatus(status: PrimerDiagnosticStatus): string {
  if (status === "pass") return "PCR-ready";
  if (status === "warn") return "Usable with caution";
  return "High-risk";
}

function evaluatePrimerDiagnostics(sequence: string, tm: number): PrimerDiagnostics {
  const gcPercent = calculateGcPercent(sequence);
  const lastBase = sequence.slice(-1);
  const lastFive = sequence.slice(-5);
  const gcClampCount = lastFive.split("").filter((base) => base === "G" || base === "C").length;
  const homopolymer = longestHomopolymer(sequence);
  const selfDimer3Prime = longest3PrimeComplement(sequence, sequence.slice(0, -1));
  const hairpinRisk = estimateHairpinRisk(sequence);

  const checks: PrimerCheck[] = [
    {
      label: "Length",
      status: sequence.length >= 18 && sequence.length <= 30 ? "pass" : sequence.length >= 16 && sequence.length <= 34 ? "warn" : "fail",
      detail: `${sequence.length} nt`,
    },
    {
      label: "Tm",
      status: tm >= 58 && tm <= 66 ? "pass" : tm >= 55 && tm <= 70 ? "warn" : "fail",
      detail: `${tm.toFixed(1)}°C`,
    },
    {
      label: "GC",
      status: gcPercent >= 35 && gcPercent <= 65 ? "pass" : gcPercent >= 30 && gcPercent <= 70 ? "warn" : "fail",
      detail: `${gcPercent.toFixed(1)}%`,
    },
    {
      label: "3' clamp",
      status:
        (lastBase === "G" || lastBase === "C") && gcClampCount >= 1 && gcClampCount <= 3
          ? "pass"
          : "warn",
      detail: `${lastBase || "?"} end, ${gcClampCount}/5 G/C`,
    },
    {
      label: "Runs",
      status: homopolymer <= 4 ? "pass" : homopolymer <= 5 ? "warn" : "fail",
      detail: `${homopolymer} bp homopolymer`,
    },
    {
      label: "Self-dimer",
      status: selfDimer3Prime <= 4 ? "pass" : selfDimer3Prime <= 6 ? "warn" : "fail",
      detail: `${selfDimer3Prime} bp 3' complement`,
    },
    {
      label: "Hairpin",
      status: hairpinRisk <= 4 ? "pass" : hairpinRisk <= 6 ? "warn" : "fail",
      detail: `${hairpinRisk} bp stem risk`,
    },
  ];

  const status = statusFromChecks(checks);
  return {
    length: sequence.length,
    tm,
    gcPercent,
    checks,
    status,
    summary: summarizeStatus(status),
  };
}

function evaluatePrimerPair(forward: string, reverse: string, forwardTm: number, reverseTm: number): PrimerPairDiagnostics {
  const tmDelta = Math.abs(forwardTm - reverseTm);
  const hetero3Prime = Math.max(longest3PrimeComplement(forward, reverse), longest3PrimeComplement(reverse, forward));
  const checks: PrimerCheck[] = [
    {
      label: "Tm match",
      status: tmDelta <= 3 ? "pass" : tmDelta <= 6 ? "warn" : "fail",
      detail: `${tmDelta.toFixed(1)}°C delta`,
    },
    {
      label: "Cross-dimer",
      status: hetero3Prime <= 4 ? "pass" : hetero3Prime <= 6 ? "warn" : "fail",
      detail: `${hetero3Prime} bp 3' complement`,
    },
  ];
  const status = statusFromChecks(checks);
  return {
    tmDelta,
    checks,
    status,
    summary: summarizeStatus(status),
  };
}

type PrimerCandidate = {
  segment: string;
  tm: number;
  diagnostics: PrimerDiagnostics;
  score: number;
};

type PrimerPairCandidate = {
  forward: PrimerCandidate;
  reverse: PrimerCandidate;
  diagnostics: PrimerPairDiagnostics;
  score: number;
};

function scorePrimerCandidate(diagnostics: PrimerDiagnostics, targetTm: number): number {
  let score = Math.abs(diagnostics.tm - targetTm) * 2.5 + Math.abs(diagnostics.gcPercent - 50) * 0.35;
  if (diagnostics.status === "warn") score += 4;
  if (diagnostics.status === "fail") score += 12;
  for (const check of diagnostics.checks) {
    if (check.status === "warn") score += 1;
    if (check.status === "fail") score += 5;
  }
  return score;
}

export function pickAnnealSegment(
  sequence: string,
  side: "start" | "end",
  targetTm = 60,
): { segment: string; tm: number; diagnostics: PrimerDiagnostics } {
  const candidates = getPrimerCandidates(sequence, side, targetTm);
  const best = candidates[0];
  if (best) {
    return { segment: best.segment, tm: best.tm, diagnostics: best.diagnostics };
  }

  const fallback = side === "start" ? sequence : sequence.slice(0);
  const tm = calculatePrimerTm(fallback);
  return { segment: fallback, tm, diagnostics: evaluatePrimerDiagnostics(fallback, tm) };
}

function getPrimerCandidates(sequence: string, side: "start" | "end", targetTm = 60): PrimerCandidate[] {
  const minLength = Math.min(18, sequence.length);
  const maxLength = Math.min(32, sequence.length);
  const candidates: PrimerCandidate[] = [];

  for (let length = Math.max(12, minLength); length <= maxLength; length += 1) {
    const segment =
      side === "start" ? sequence.slice(0, length) : sequence.slice(sequence.length - length);
    const tm = calculatePrimerTm(segment);
    const diagnostics = evaluatePrimerDiagnostics(segment, tm);
    const score = scorePrimerCandidate(diagnostics, targetTm);
    candidates.push({ segment, tm, diagnostics, score });
  }

  return candidates.sort((a, b) => a.score - b.score);
}

function pickPrimerPair(
  sequence: string,
  targetTm = 60,
): {
  forward: { segment: string; tm: number; diagnostics: PrimerDiagnostics };
  reverse: { segment: string; tm: number; diagnostics: PrimerDiagnostics };
  pairDiagnostics: PrimerPairDiagnostics;
} {
  const forwardCandidates = getPrimerCandidates(sequence, "start", targetTm).slice(0, 8);
  const reverseCandidates = getPrimerCandidates(sequence, "end", targetTm).slice(0, 8);
  let best: PrimerPairCandidate | null = null;

  for (const forward of forwardCandidates) {
    for (const reverseTemplate of reverseCandidates) {
      const reverse = {
        ...reverseTemplate,
        segment: reverseComplement(reverseTemplate.segment),
      };
      const diagnostics = evaluatePrimerPair(forward.segment, reverse.segment, forward.tm, reverseTemplate.tm);
      let score = forward.score + reverseTemplate.score + Math.abs(forward.tm - reverseTemplate.tm) * 1.75;
      if (diagnostics.status === "warn") score += 3;
      if (diagnostics.status === "fail") score += 10;
      for (const check of diagnostics.checks) {
        if (check.status === "warn") score += 1;
        if (check.status === "fail") score += 4;
      }
      if (!best || score < best.score) {
        best = { forward, reverse, diagnostics, score };
      }
    }
  }

  if (best) {
    return {
      forward: best.forward,
      reverse: best.reverse,
      pairDiagnostics: best.diagnostics,
    };
  }

  const forward = pickAnnealSegment(sequence, "start", targetTm);
  const reverseTemplate = pickAnnealSegment(sequence, "end", targetTm);
  return {
    forward,
    reverse: {
      segment: reverseComplement(reverseTemplate.segment),
      tm: reverseTemplate.tm,
      diagnostics: reverseTemplate.diagnostics,
    },
    pairDiagnostics: evaluatePrimerPair(forward.segment, reverseComplement(reverseTemplate.segment), forward.tm, reverseTemplate.tm),
  };
}

function pickBackbonePrimerPair(
  vectorSequence: string,
  leftKeptEnd: number,
  rightKeptStart: number,
  targetTm = 60,
): {
  forward: { segment: string; tm: number; diagnostics: PrimerDiagnostics };
  reverse: { segment: string; tm: number; diagnostics: PrimerDiagnostics };
  pairDiagnostics: PrimerPairDiagnostics;
} {
  const windowSize = Math.min(60, Math.max(24, vectorSequence.length));
  const forwardWindow = sliceCircular(vectorSequence, rightKeptStart, windowSize);
  const reverseWindow = sliceCircular(vectorSequence, leftKeptEnd - windowSize + 1, windowSize);
  const forward = pickAnnealSegment(forwardWindow, "start", targetTm);
  const reverseTemplate = pickAnnealSegment(reverseWindow, "end", targetTm);
  const reverse = {
    segment: reverseComplement(reverseTemplate.segment),
    tm: reverseTemplate.tm,
    diagnostics: reverseTemplate.diagnostics,
  };

  return {
    forward,
    reverse,
    pairDiagnostics: evaluatePrimerPair(forward.segment, reverse.segment, forward.tm, reverse.tm),
  };
}

export function overlapLengthForMethod(method: AssemblyMethod): number {
  return method === "gibson" ? 20 : 15;
}

export function sliceCircular(sequence: string, start: number, length: number): string {
  if (!sequence.length || length <= 0) return "";
  const normalizedStart = ((start % sequence.length) + sequence.length) % sequence.length;
  if (length >= sequence.length) {
    const rotated = sequence.slice(normalizedStart) + sequence.slice(0, normalizedStart);
    return rotated.slice(0, length);
  }
  const doubled = sequence + sequence;
  return doubled.slice(normalizedStart, normalizedStart + length);
}

export function spanFromFeatures(
  features: Feature[],
  selectedFeatureIds: string[],
): { start: number; end: number; names: string[] } | null {
  const selected = features.filter((feature) => selectedFeatureIds.includes(feature.id));
  if (!selected.length) return null;
  return {
    start: Math.min(...selected.map((feature) => feature.start)),
    end: Math.max(...selected.map((feature) => feature.end)),
    names: selected.map((feature) => feature.name),
  };
}

export function featureMatches(feature: Feature, pattern: RegExp): boolean {
  return pattern.test(feature.name) || pattern.test(feature.type);
}

export function findFeature(features: Feature[], pattern: RegExp): Feature | null {
  return features.find((feature) => featureMatches(feature, pattern)) ?? null;
}

export function regionBetweenFeatures(
  first: Feature,
  second: Feature,
  sequenceLength: number,
): { start: number; end: number; names: string[] } {
  const start = (first.end + 1) % sequenceLength;
  const end = (second.start - 1 + sequenceLength) % sequenceLength;
  return {
    start,
    end,
    names: [`between ${first.name}`, `before ${second.name}`],
  };
}

export function spanBetweenFeatures(
  first: Feature,
  second: Feature,
  sequenceLength: number,
  inclusion: BoundaryInclusion,
): { start: number; end: number; names: string[] } {
  const includeLeft = inclusion === "include-both" || inclusion === "include-left";
  const includeRight = inclusion === "include-both" || inclusion === "include-right";
  const start = includeLeft ? first.start : (first.end + 1) % sequenceLength;
  const end = includeRight ? second.end : (second.start - 1 + sequenceLength) % sequenceLength;
  return {
    start,
    end,
    names: [`${first.name} -> ${second.name}`, inclusion],
  };
}

export function resolveRegionRule(
  plasmid: Plasmid,
  rule: RegionRule | null,
): { start: number; end: number; names: string[] } | null {
  if (!rule) return null;
  if (rule.mode === "feature") {
    return spanFromFeatures(plasmid.features, rule.featureIds);
  }
  const left = plasmid.features.find((feature) => feature.id === rule.leftFeatureId);
  const right = plasmid.features.find((feature) => feature.id === rule.rightFeatureId);
  if (!left || !right) return null;
  return spanBetweenFeatures(left, right, plasmid.length, rule.inclusion);
}

export function findFeaturesByPattern(plasmid: Plasmid, pattern: RegExp): Feature[] {
  return plasmid.features.filter((feature) => featureMatches(feature, pattern));
}

export function replacedLength(
  plasmid: Plasmid,
  span: { start: number; end: number } | null,
): number {
  if (!span) return 0;
  if (plasmid.topology === "linear" || span.start <= span.end) {
    return span.end - span.start + 1;
  }
  return plasmid.length - span.start + span.end + 1;
}

export function buildAssembledPlasmid(args: {
  vector: Plasmid;
  replaceSpan: { start: number; end: number; names: string[] };
  insertSequence: string;
  insertName: string;
  insertSource?: Plasmid | null;
  insertSpan?: { start: number; end: number; names: string[] } | null;
}): Plasmid {
  const { vector, replaceSpan, insertSequence, insertName, insertSource, insertSpan } = args;
  const before = vector.sequence.slice(0, replaceSpan.start);
  const after = vector.sequence.slice(replaceSpan.end + 1);
  const assembledSequence =
    vector.topology === "linear" || replaceSpan.start <= replaceSpan.end
      ? `${before}${insertSequence}${after}`
      : `${insertSequence}${vector.sequence.slice(replaceSpan.end + 1, replaceSpan.start)}`;

  const removedSize = replacedLength(vector, replaceSpan);
  const shift = insertSequence.length - removedSize;

  const keptFeatures =
    vector.topology === "linear" || replaceSpan.start <= replaceSpan.end
      ? vector.features
          .filter((feature) => feature.end < replaceSpan.start || feature.start > replaceSpan.end)
          .map((feature) => ({
            ...feature,
            start: feature.start > replaceSpan.end ? feature.start + shift : feature.start,
            end: feature.end > replaceSpan.end ? feature.end + shift : feature.end,
          }))
      : [];

  const insertFeature: Feature = {
    id: crypto.randomUUID(),
    name: insertName,
    type: "insert",
    start: vector.topology === "linear" || replaceSpan.start <= replaceSpan.end ? replaceSpan.start : 0,
    end:
      (vector.topology === "linear" || replaceSpan.start <= replaceSpan.end ? replaceSpan.start : 0) +
      Math.max(0, insertSequence.length - 1),
    color: "#f97316",
  };

  const insertChildFeatures =
    insertSource && insertSpan
      ? insertSource.features
          .filter((feature) => feature.start >= insertSpan.start && feature.end <= insertSpan.end)
          .map((feature) => ({
            ...feature,
            id: crypto.randomUUID(),
            start:
              (vector.topology === "linear" || replaceSpan.start <= replaceSpan.end ? replaceSpan.start : 0) +
              (feature.start - insertSpan.start),
            end:
              (vector.topology === "linear" || replaceSpan.start <= replaceSpan.end ? replaceSpan.start : 0) +
              (feature.end - insertSpan.start),
          }))
      : [];

  return {
    id: crypto.randomUUID(),
    name: `${vector.name} assembled`,
    fileName: "",
    length: assembledSequence.length,
    sequence: assembledSequence,
    topology: vector.topology,
    strandedness: "ds",
    description: `Assembled from ${vector.name} with ${insertName}`,
    features: [insertFeature, ...insertChildFeatures, ...keptFeatures],
  };
}

export function designSeamlessReplacementPrimers(args: {
  vectorSequence: string;
  replaceStart: number;
  replaceEnd: number;
  insertSequence: string;
  method: AssemblyMethod;
}): SeamlessAssemblyPrimers {
  const { vectorSequence, replaceStart, replaceEnd, insertSequence, method } = args;
  const overlapLength = overlapLengthForMethod(method);
  const vectorLength = vectorSequence.length;
  const safeReplaceStart = clampBase(replaceStart, vectorLength);
  const safeReplaceEnd = clampBase(replaceEnd, vectorLength);
  const rightBoundaryStart = (safeReplaceEnd + 1) % vectorLength;
  const leftBoundaryEnd = (safeReplaceStart - 1 + vectorLength) % vectorLength;

  const leftVectorOverlap = sliceCircular(
    vectorSequence,
    safeReplaceStart - overlapLength,
    overlapLength,
  );
  const rightVectorOverlap = sliceCircular(vectorSequence, rightBoundaryStart, overlapLength);
  const insertStartOverlap = insertSequence.slice(0, Math.min(overlapLength, insertSequence.length));
  const insertEndOverlap = insertSequence.slice(
    Math.max(0, insertSequence.length - overlapLength),
    insertSequence.length,
  );

  const vectorPair = pickBackbonePrimerPair(vectorSequence, leftBoundaryEnd, rightBoundaryStart);
  const insertPair = pickPrimerPair(insertSequence);
  const vectorForwardAnneal = vectorPair.forward;
  const vectorReverseAnneal = vectorPair.reverse.segment;
  const insertForwardAnneal = insertPair.forward;
  const insertReverseAnneal = insertPair.reverse.segment;

  return {
    overlapLength,
    replaceStart: safeReplaceStart,
    replaceEnd: safeReplaceEnd,
    insertLength: insertSequence.length,
    // Backbone is generated by inverse PCR, so these are plain annealing primers.
    vectorForwardPrimer: vectorForwardAnneal.segment,
    vectorReversePrimer: vectorReverseAnneal,
    insertForwardPrimer: `${leftVectorOverlap}${insertForwardAnneal.segment}`,
    // Reverse-primer tails must be reverse-complemented relative to the desired product junction.
    insertReversePrimer: `${reverseComplement(rightVectorOverlap)}${insertReverseAnneal}`,
    vectorForwardAnneal: vectorForwardAnneal.segment,
    vectorReverseAnneal,
    insertForwardAnneal: insertForwardAnneal.segment,
    insertReverseAnneal,
    vectorForwardTm: vectorForwardAnneal.tm,
    vectorReverseTm: vectorPair.reverse.tm,
    insertForwardTm: insertForwardAnneal.tm,
    insertReverseTm: insertPair.reverse.tm,
    leftVectorOverlap,
    rightVectorOverlap,
    insertStartOverlap,
    insertEndOverlap,
    vectorForwardDiagnostics: vectorForwardAnneal.diagnostics,
    vectorReverseDiagnostics: vectorPair.reverse.diagnostics,
    insertForwardDiagnostics: insertForwardAnneal.diagnostics,
    insertReverseDiagnostics: insertPair.reverse.diagnostics,
    vectorPairDiagnostics: vectorPair.pairDiagnostics,
    insertPairDiagnostics: insertPair.pairDiagnostics,
  };
}

export function resolveVectorReplacementBetweenFeatures(
  plasmid: Plasmid,
  left: Feature,
  right: Feature,
  inclusion: BoundaryInclusion,
): {
  replaceStart: number;
  replaceEnd: number;
  leftKeptEnd: number;
  rightKeptStart: number;
  names: string[];
} {
  const length = plasmid.length;
  const keepLeft = inclusion === "include-left" || inclusion === "include-both";
  const keepRight = inclusion === "include-right" || inclusion === "include-both";
  const leftKeptEnd = keepLeft ? left.end : (left.start - 1 + length) % length;
  const rightKeptStart = keepRight ? right.start : (right.end + 1) % length;
  return {
    replaceStart: (leftKeptEnd + 1) % length,
    replaceEnd: (rightKeptStart - 1 + length) % length,
    leftKeptEnd,
    rightKeptStart,
    names: [`${left.name} -> ${right.name}`, `keep ${keepLeft ? left.name : "outside-left"}`, `keep ${keepRight ? right.name : "outside-right"}`],
  };
}

export function designPrimersFromVectorJunctions(args: {
  vectorSequence: string;
  leftKeptEnd: number;
  rightKeptStart: number;
  insertSequence: string;
  method: AssemblyMethod;
}): SeamlessAssemblyPrimers {
  const { vectorSequence, leftKeptEnd, rightKeptStart, insertSequence, method } = args;
  const overlapLength = overlapLengthForMethod(method);
  const leftVectorOverlap = sliceCircular(
    vectorSequence,
    leftKeptEnd - overlapLength + 1,
    overlapLength,
  );
  const rightVectorOverlap = sliceCircular(vectorSequence, rightKeptStart, overlapLength);
  const insertStartOverlap = insertSequence.slice(0, Math.min(overlapLength, insertSequence.length));
  const insertEndOverlap = insertSequence.slice(
    Math.max(0, insertSequence.length - overlapLength),
    insertSequence.length,
  );

  const vectorPair = pickBackbonePrimerPair(vectorSequence, leftKeptEnd, rightKeptStart);
  const insertPair = pickPrimerPair(insertSequence);
  const vectorForwardAnneal = vectorPair.forward;
  const vectorReverseAnneal = vectorPair.reverse.segment;
  const insertForwardAnneal = insertPair.forward;
  const insertReverseAnneal = insertPair.reverse.segment;

  return {
    overlapLength,
    replaceStart: (leftKeptEnd + 1) % vectorSequence.length,
    replaceEnd: (rightKeptStart - 1 + vectorSequence.length) % vectorSequence.length,
    insertLength: insertSequence.length,
    vectorForwardPrimer: vectorForwardAnneal.segment,
    vectorReversePrimer: vectorReverseAnneal,
    insertForwardPrimer: `${leftVectorOverlap}${insertForwardAnneal.segment}`,
    insertReversePrimer: `${reverseComplement(rightVectorOverlap)}${insertReverseAnneal}`,
    vectorForwardAnneal: vectorForwardAnneal.segment,
    vectorReverseAnneal,
    insertForwardAnneal: insertForwardAnneal.segment,
    insertReverseAnneal,
    vectorForwardTm: vectorForwardAnneal.tm,
    vectorReverseTm: vectorPair.reverse.tm,
    insertForwardTm: insertForwardAnneal.tm,
    insertReverseTm: insertPair.reverse.tm,
    leftVectorOverlap,
    rightVectorOverlap,
    insertStartOverlap,
    insertEndOverlap,
    vectorForwardDiagnostics: vectorForwardAnneal.diagnostics,
    vectorReverseDiagnostics: vectorPair.reverse.diagnostics,
    insertForwardDiagnostics: insertForwardAnneal.diagnostics,
    insertReverseDiagnostics: insertPair.reverse.diagnostics,
    vectorPairDiagnostics: vectorPair.pairDiagnostics,
    insertPairDiagnostics: insertPair.pairDiagnostics,
  };
}

export function buildPrimers(
  fragments: AssemblyFragment[],
  method: AssemblyMethod,
): PrimerRecord[] {
  if (fragments.length < 2) return [];
  const overlapLength = overlapLengthForMethod(method);

  return fragments.map((fragment, index) => {
    const previous = fragments[(index - 1 + fragments.length) % fragments.length];
    const next = fragments[(index + 1) % fragments.length];
    const leftOverlap = previous.sequence.slice(-Math.min(overlapLength, previous.sequence.length));
    const rightOverlap = next.sequence.slice(0, Math.min(overlapLength, next.sequence.length));
    const forwardAnneal = pickAnnealSegment(fragment.sequence, "start");
    const reverseAnneal = pickAnnealSegment(fragment.sequence, "end");
    const reverseAnnealRc = reverseComplement(reverseAnneal.segment);

    return {
      fragmentId: fragment.id,
      fragmentLabel: fragment.label,
      sourceName: fragment.sourceName,
      leftOverlap,
      rightOverlap,
      annealForward: forwardAnneal.segment,
      annealReverse: reverseAnnealRc,
      forwardTm: forwardAnneal.tm,
      reverseTm: reverseAnneal.tm,
      forwardPrimer: `${leftOverlap}${forwardAnneal.segment}`,
      reversePrimer: `${rightOverlap}${reverseAnnealRc}`,
    };
  });
}

export function estimateAssemblyLength(fragments: AssemblyFragment[]): number {
  return fragments.reduce((total, fragment) => total + fragment.length, 0);
}

export function summarizeSelection(
  selectionMode: SelectionMode,
  start: number,
  end: number,
  openAt: number,
): string {
  if (selectionMode === "whole-plasmid") {
    return `Whole plasmid opened at ${openAt + 1}`;
  }
  if (start <= end) {
    return `${start + 1}-${end + 1}`;
  }
  return `${start + 1}-${end + 1} (wraps origin)`;
}

export function buildFragmentFromSource(args: {
  id?: string;
  role: "vector" | "insert";
  label: string;
  plasmid: Plasmid;
  selectionMode: SelectionMode;
  start: number;
  end: number;
  openAt: number;
  selectedFeatureNames: string[];
}): AssemblyFragment {
  const {
    id,
    role,
    label,
    plasmid,
    selectionMode,
    start,
    end,
    openAt,
    selectedFeatureNames,
  } = args;

  const sequence = extractFragmentSequence(plasmid.sequence, selectionMode, start, end, openAt);
  return {
    id: id ?? crypto.randomUUID(),
    role,
    label,
    sourceId: plasmid.id,
    sourceName: plasmid.name,
    selectionMode,
    start,
    end,
    openAt,
    length: fragmentLength(selectionMode, plasmid.length, start, end),
    sequence,
    selectedFeatureNames,
  };
}

export function parseCommand(command: string, plasmids: Plasmid[]): {
  role: "vector" | "insert";
  label?: string;
  sourceId?: string;
  selectionMode?: SelectionMode;
  start?: number;
  end?: number;
  openAt?: number;
  selectedFeatureIds?: string[];
  error?: string;
} {
  const normalized = command.trim();
  if (!normalized) {
    return { role: "insert", error: "Command is empty." };
  }

  const plasmid = plasmids.find((entry) =>
    normalized.toLowerCase().includes(entry.name.toLowerCase()),
  );
  if (!plasmid) {
    return {
      role: "insert",
      error: "Command must mention a loaded plasmid by name.",
    };
  }

  const feature = plasmid.features.find((entry) =>
    normalized.toLowerCase().includes(entry.name.toLowerCase()),
  );
  const rangeMatch = normalized.match(/(\d+)\s*[-:]\s*(\d+)/);
  const openMatch = normalized.match(/open(?:ed)?(?: at)?\s+(\d+)/i);
  const role = /\bvector\b/i.test(normalized) ? "vector" : "insert";

  if (feature) {
    return {
      role,
      label: feature.name,
      sourceId: plasmid.id,
      selectionMode: role === "vector" && /\bwhole\b/i.test(normalized) ? "whole-plasmid" : "range",
      start: feature.start,
      end: feature.end,
      openAt: openMatch ? Math.max(0, Number(openMatch[1]) - 1) : feature.start,
      selectedFeatureIds: [feature.id],
    };
  }

  if (/\bwhole\b/i.test(normalized) || /\bfull\b/i.test(normalized)) {
    return {
      role,
      label: plasmid.name,
      sourceId: plasmid.id,
      selectionMode: "whole-plasmid",
      start: 0,
      end: plasmid.length - 1,
      openAt: openMatch ? Math.max(0, Number(openMatch[1]) - 1) : 0,
      selectedFeatureIds: [],
    };
  }

  if (rangeMatch) {
    return {
      role,
      label: `${plasmid.name} fragment`,
      sourceId: plasmid.id,
      selectionMode: "range",
      start: Math.max(0, Number(rangeMatch[1]) - 1),
      end: Math.max(0, Number(rangeMatch[2]) - 1),
      openAt: 0,
      selectedFeatureIds: [],
    };
  }

  return {
    role,
    error:
      "Command was parsed to a plasmid, but it still needs either a feature name, a range like 120-980, or 'whole/open at'.",
  };
}

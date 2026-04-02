import { useEffect, useMemo, useState } from "react";
import PlasmidViewer from "./PlasmidViewer";
import { demoDonorPlasmids, demoVectorPlasmids } from "./plasmid-viewer/mockData";
import {
  buildAssembledPlasmid,
  clampBase,
  designPrimersFromVectorJunctions,
  extractSelectedSequence,
  findFeature,
  findFeaturesByPattern,
  parsePlasmidFile,
  replacedLength,
  resolveRegionRule,
  sanitizeSequence,
  sliceCircular,
  spanBetweenFeatures,
} from "./sequence";
import type {
  AssemblyMethod,
  BoundaryInclusion,
  Feature,
  Plasmid,
  PrimerCheck,
  PrimerDiagnostics,
  PrimerDiagnosticStatus,
  PrimerPairDiagnostics,
  RegionRule,
  SeamlessAssemblyPrimers,
} from "./types";

type SourceMode = "plasmid" | "sequence";
type RuleMode = "feature" | "between";
type BatchDetailSnapshot = {
  donorName: string;
  matchedLeft: string;
  matchedRight: string;
  vectorName: string;
  vectorLength: number;
  vectorAmpliconLength: number;
  insertLength: number;
  assembledLength: number;
  assembledPlasmid: Plasmid;
  primers: SeamlessAssemblyPrimers;
};

type BatchRow = {
  donorId: string;
  donorName: string;
  matchedLeft: string;
  matchedRight: string;
  vectorLength: number;
  vectorAmpliconLength: number;
  insertLength: number;
  assembledLength: number;
  vectorForwardPrimer: string;
  vectorForwardPrimerLength: number;
  vectorForwardPrimerTm: number;
  vectorReversePrimer: string;
  vectorReversePrimerLength: number;
  vectorReversePrimerTm: number;
  insertForwardPrimer: string;
  insertForwardPrimerLength: number;
  insertForwardPrimerTm: number;
  insertReversePrimer: string;
  insertReversePrimerLength: number;
  insertReversePrimerTm: number;
  vectorDiagnosticSummary: string;
  insertDiagnosticSummary: string;
  vectorReview: string;
  insertReview: string;
  status: string;
  detail: BatchDetailSnapshot | null;
};

type LibraryKind = "vector" | "donor";

const DEFAULT_INCLUSION: BoundaryInclusion = "include-both";
const BATCH_DETAIL_STORAGE_KEY = "gibson-assembly-batch-detail";

function debugLog(event: string, detail?: unknown) {
  console.debug(`[BatchClone] ${event}`, detail ?? "");
}

function plasmidSignature(plasmid: Plasmid) {
  return `${plasmid.fileName}::${plasmid.name}::${plasmid.length}::${plasmid.sequence}`;
}

function createManualPlasmid(args: {
  name: string;
  sequence: string;
  topology?: Plasmid["topology"];
  strandedness?: Plasmid["strandedness"];
}): Plasmid | null {
  const sequence = sanitizeSequence(args.sequence);
  if (!sequence.length) return null;
  return {
    id: "manual-sequence",
    name: args.name.trim() || "Manual sequence",
    fileName: "",
    length: sequence.length,
    sequence,
    topology: args.topology ?? "linear",
    strandedness: args.strandedness ?? "ss",
    features: [],
  };
}

export default function App() {
  const [plasmids, setPlasmids] = useState<Plasmid[]>([]);
  const [vectorLibraryIds, setVectorLibraryIds] = useState<string[]>([]);
  const [donorLibraryIds, setDonorLibraryIds] = useState<string[]>([]);
  const [vectorMode, setVectorMode] = useState<SourceMode>("plasmid");
  const [vectorPlasmidId, setVectorPlasmidId] = useState("");
  const [insertPlasmidId, setInsertPlasmidId] = useState("");
  const [manualVectorName, setManualVectorName] = useState("Custom vector");
  const [manualVectorSequence, setManualVectorSequence] = useState("");
  const [manualVectorTopology, setManualVectorTopology] = useState<Plasmid["topology"]>("linear");
  const [manualVectorStrandedness, setManualVectorStrandedness] = useState<Plasmid["strandedness"]>("ss");
  const [manualVectorReplaceStart, setManualVectorReplaceStart] = useState("1");
  const [manualVectorReplaceEnd, setManualVectorReplaceEnd] = useState("1");
  const [vectorVisibleIds, setVectorVisibleIds] = useState<string[]>([]);
  const [insertVisibleIds, setInsertVisibleIds] = useState<string[]>([]);
  const [vectorRuleMode, setVectorRuleMode] = useState<RuleMode>("between");
  const [insertRuleMode, setInsertRuleMode] = useState<RuleMode>("feature");
  const [vectorRule, setVectorRule] = useState<RegionRule | null>(null);
  const [insertRule, setInsertRule] = useState<RegionRule | null>(null);
  const [insertMode, setInsertMode] = useState<SourceMode>("plasmid");
  const [manualInsertName, setManualInsertName] = useState("Custom insert");
  const [manualInsertSequence, setManualInsertSequence] = useState("");
  const [manualInsertStrandedness, setManualInsertStrandedness] = useState<Plasmid["strandedness"]>("ss");
  const [assemblyMethod, setAssemblyMethod] = useState<AssemblyMethod>("gibson");
  const [batchFeatureQuery, setBatchFeatureQuery] = useState("");
  const [batchLeftQuery, setBatchLeftQuery] = useState("T7");
  const [batchRightQuery, setBatchRightQuery] = useState("HDV");
  const [batchMode, setBatchMode] = useState<RuleMode>("between");
  const [batchInclusion, setBatchInclusion] = useState<BoundaryInclusion>(DEFAULT_INCLUSION);
  const [batchDonorIds, setBatchDonorIds] = useState<string[]>([]);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<BatchDetailSnapshot | null>(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("batchDetail");
    if (!id) return null;
    try {
      const raw = window.localStorage.getItem(`${BATCH_DETAIL_STORAGE_KEY}:${id}`);
      return raw ? (JSON.parse(raw) as BatchDetailSnapshot) : null;
    } catch {
      return null;
    }
  });
  const [selectedBatchView, setSelectedBatchView] = useState<"diagnostics" | "assembly" | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Load vector and donor files to begin.");

  const vectorSources = useMemo(() => plasmids.filter((plasmid) => vectorLibraryIds.includes(plasmid.id)), [plasmids, vectorLibraryIds]);
  const donorSources = useMemo(() => plasmids.filter((plasmid) => donorLibraryIds.includes(plasmid.id)), [plasmids, donorLibraryIds]);
  const manualVectorPlasmid = useMemo(
    () =>
      createManualPlasmid({
        name: manualVectorName,
        sequence: manualVectorSequence,
        topology: manualVectorTopology,
        strandedness: manualVectorStrandedness,
      }),
    [manualVectorName, manualVectorSequence, manualVectorStrandedness, manualVectorTopology],
  );
  const vectorPlasmid =
    vectorMode === "sequence"
      ? manualVectorPlasmid
      : plasmids.find((plasmid) => plasmid.id === vectorPlasmidId) ?? null;
  const insertPlasmid = plasmids.find((plasmid) => plasmid.id === insertPlasmidId) ?? null;

  const manualVectorSpan = useMemo(() => {
    if (!manualVectorPlasmid) return null;
    const startValue = Number.parseInt(manualVectorReplaceStart, 10);
    const endValue = Number.parseInt(manualVectorReplaceEnd, 10);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
    const start = clampBase(startValue - 1, manualVectorPlasmid.length);
    const end = clampBase(endValue - 1, manualVectorPlasmid.length);
    return {
      start,
      end,
      names: ["Manual replacement window"],
    };
  }, [manualVectorPlasmid, manualVectorReplaceEnd, manualVectorReplaceStart]);

  const vectorSpan = useMemo(
    () => {
      if (!vectorPlasmid) return null;
      if (vectorMode === "sequence") return manualVectorSpan;
      return resolveRegionRule(vectorPlasmid, vectorRule);
    },
    [manualVectorSpan, vectorMode, vectorPlasmid, vectorRule],
  );
  const vectorBackbonePlan = useMemo(() => {
    if (!vectorPlasmid) return null;
    if (vectorMode === "sequence") {
      if (!manualVectorSpan) return null;
      return {
        replaceStart: manualVectorSpan.start,
        replaceEnd: manualVectorSpan.end,
        leftKeptEnd: (manualVectorSpan.start - 1 + vectorPlasmid.length) % vectorPlasmid.length,
        rightKeptStart: (manualVectorSpan.end + 1) % vectorPlasmid.length,
        names: manualVectorSpan.names,
      };
    }
    if (!vectorRule) return null;
    if (vectorRule.mode === "between") {
      const left = vectorPlasmid.features.find((feature) => feature.id === vectorRule.leftFeatureId);
      const right = vectorPlasmid.features.find((feature) => feature.id === vectorRule.rightFeatureId);
      if (!left || !right) return null;
      const backboneSpan = spanBetweenFeatures(left, right, vectorPlasmid.length, vectorRule.inclusion);
      return {
        replaceStart: (backboneSpan.end + 1) % vectorPlasmid.length,
        replaceEnd: (backboneSpan.start - 1 + vectorPlasmid.length) % vectorPlasmid.length,
        leftKeptEnd: backboneSpan.end,
        rightKeptStart: backboneSpan.start,
        names: backboneSpan.names,
      };
    }
    return vectorSpan
      ? {
          replaceStart: vectorSpan.start,
          replaceEnd: vectorSpan.end,
          leftKeptEnd: (vectorSpan.start - 1 + vectorPlasmid.length) % vectorPlasmid.length,
          rightKeptStart: (vectorSpan.end + 1) % vectorPlasmid.length,
          names: vectorSpan.names,
        }
      : null;
  }, [manualVectorSpan, vectorMode, vectorPlasmid, vectorRule, vectorSpan]);
  const insertSpan = useMemo(
    () => (insertPlasmid ? resolveRegionRule(insertPlasmid, insertRule) : null),
    [insertPlasmid, insertRule],
  );

  useEffect(() => {
    if (insertMode !== "plasmid" || !insertPlasmid || !insertRule) return;

    if (insertRule.mode === "feature") {
      setBatchFeatureQuery("");
      setBatchLeftQuery("");
      setBatchRightQuery("");
      return;
    }

    const leftFeature = insertPlasmid.features.find((feature) => feature.id === insertRule.leftFeatureId);
    const rightFeature = insertPlasmid.features.find((feature) => feature.id === insertRule.rightFeatureId);
    if (!leftFeature || !rightFeature) return;
    setBatchMode("between");
    setBatchLeftQuery(leftFeature.name);
    setBatchRightQuery(rightFeature.name);
    setBatchInclusion(insertRule.inclusion);
  }, [insertMode, insertPlasmid, insertRule]);

  const vectorSelectionSequence = useMemo(
    () => {
      if (!vectorPlasmid || !vectorBackbonePlan) return "";
      const removed = replacedLength(vectorPlasmid, {
        start: vectorBackbonePlan.replaceStart,
        end: vectorBackbonePlan.replaceEnd,
      });
      const backboneLength = Math.max(0, vectorPlasmid.length - removed);
      return sliceCircular(vectorPlasmid.sequence, vectorBackbonePlan.rightKeptStart, backboneLength);
    },
    [vectorBackbonePlan, vectorPlasmid],
  );
  const vectorPanelSequenceText = vectorSpan ? vectorSelectionSequence : vectorPlasmid?.sequence ?? "";

  const insertSequence = useMemo(() => {
    if (insertMode === "sequence") return sanitizeSequence(manualInsertSequence);
    if (!insertPlasmid) return "";
    return extractSelectedSequence(insertPlasmid, insertSpan);
  }, [insertMode, manualInsertSequence, insertPlasmid, insertSpan]);

  const insertLabel =
    insertMode === "sequence"
      ? manualInsertName
      : insertSpan?.names.join(" · ") || insertPlasmid?.name || "Insert";

  const primers = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan || !insertSequence) return null;
    return designPrimersFromVectorJunctions({
      vectorSequence: vectorPlasmid.sequence,
      leftKeptEnd: vectorBackbonePlan.leftKeptEnd,
      rightKeptStart: vectorBackbonePlan.rightKeptStart,
      insertSequence,
      method: assemblyMethod,
    });
  }, [assemblyMethod, insertSequence, vectorBackbonePlan, vectorPlasmid]);

  const assembledPlasmid = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan || !insertSequence) return null;
    return buildAssembledPlasmid({
      vector: vectorPlasmid,
      replaceSpan: {
        start: vectorBackbonePlan.replaceStart,
        end: vectorBackbonePlan.replaceEnd,
        names: vectorBackbonePlan.names,
      },
      insertSequence,
      insertName: insertLabel,
      insertSource: insertMode === "plasmid" ? insertPlasmid : null,
      insertSpan: insertMode === "plasmid" ? insertSpan : null,
      primers,
    });
  }, [insertLabel, insertMode, insertPlasmid, insertSequence, insertSpan, primers, vectorBackbonePlan, vectorPlasmid]);

  const validation = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan || !insertSequence || !primers) return null;
    const removed = replacedLength(vectorPlasmid, {
      start: vectorBackbonePlan.replaceStart,
      end: vectorBackbonePlan.replaceEnd,
    });
    const primerStatus = combineStatuses([
      primers.vectorForwardDiagnostics.status,
      primers.vectorReverseDiagnostics.status,
      primers.insertForwardDiagnostics.status,
      primers.insertReverseDiagnostics.status,
      primers.vectorPairDiagnostics.status,
      primers.insertPairDiagnostics.status,
    ]);
    return {
      success:
        insertSequence.length > 0 &&
        primers.overlapLength <= Math.min(insertSequence.length, 40) &&
        primerStatus !== "fail",
      primerStatus,
      removed,
      backboneAmpliconLength: Math.max(0, vectorPlasmid.length - removed),
      insertAmpliconLength: insertSequence.length,
      assembledLength: vectorPlasmid.length - removed + insertSequence.length,
    };
  }, [insertSequence, primers, vectorBackbonePlan, vectorPlasmid]);

  const donorPlasmids = useMemo(() => donorSources.filter((plasmid) => plasmid.id !== vectorPlasmidId), [donorSources, vectorPlasmidId]);

  const commonFeatureNames = useMemo(() => {
    const selectedDonors = donorPlasmids.filter((plasmid) => batchDonorIds.includes(plasmid.id));
    if (!selectedDonors.length) return [] as string[];
    const counts = new Map<string, { name: string; count: number }>();
    selectedDonors.forEach((plasmid) => {
      const seen = new Set<string>();
      plasmid.features.forEach((feature) => {
        const key = feature.name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const current = counts.get(key);
        counts.set(key, { name: feature.name, count: (current?.count ?? 0) + 1 });
      });
    });
    return [...counts.values()]
      .filter((entry) => entry.count === selectedDonors.length)
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  }, [batchDonorIds, donorPlasmids]);

  const batchBackbonePrimers = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan) return null;
    return designPrimersFromVectorJunctions({
      vectorSequence: vectorPlasmid.sequence,
      leftKeptEnd: vectorBackbonePlan.leftKeptEnd,
      rightKeptStart: vectorBackbonePlan.rightKeptStart,
      insertSequence: "AT",
      method: assemblyMethod,
    });
  }, [assemblyMethod, vectorBackbonePlan, vectorPlasmid]);

  const batchVectorAmpliconLength = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan) return 0;
    return (
      vectorPlasmid.length -
      replacedLength(vectorPlasmid, {
        start: vectorBackbonePlan.replaceStart,
        end: vectorBackbonePlan.replaceEnd,
      })
    );
  }, [vectorBackbonePlan, vectorPlasmid]);

  const batchRows = useMemo(() => {
    if (!vectorPlasmid || !vectorBackbonePlan || !batchDonorIds.length) return [] as BatchRow[];
    const makeEmptyRow = (donorName: string, patch: Partial<BatchRow> = {}): BatchRow => ({
      donorId: "",
      donorName,
      matchedLeft: "",
      matchedRight: "",
      vectorLength: vectorPlasmid.length,
      vectorAmpliconLength: batchVectorAmpliconLength,
      insertLength: 0,
      assembledLength: 0,
      vectorForwardPrimer: batchBackbonePrimers?.vectorForwardPrimer ?? "",
      vectorForwardPrimerLength: batchBackbonePrimers?.vectorForwardPrimer.length ?? 0,
      vectorForwardPrimerTm: batchBackbonePrimers?.vectorForwardTm ?? 0,
      vectorReversePrimer: batchBackbonePrimers?.vectorReversePrimer ?? "",
      vectorReversePrimerLength: batchBackbonePrimers?.vectorReversePrimer.length ?? 0,
      vectorReversePrimerTm: batchBackbonePrimers?.vectorReverseTm ?? 0,
      insertForwardPrimer: "",
      insertForwardPrimerLength: 0,
      insertForwardPrimerTm: 0,
      insertReversePrimer: "",
      insertReversePrimerLength: 0,
      insertReversePrimerTm: 0,
      vectorDiagnosticSummary: batchBackbonePrimers
        ? summarizePrimerSet(batchBackbonePrimers, "vector")
        : "Vector primer set unavailable",
      insertDiagnosticSummary: "Insert primer set unavailable",
      vectorReview: batchBackbonePrimers ? describePrimerSetReview(batchBackbonePrimers, "vector") : "Vector pair unavailable",
      insertReview: "Insert pair unavailable",
      status: "Review",
      detail: null,
      ...patch,
    });

    return donorPlasmids
      .filter((plasmid) => batchDonorIds.includes(plasmid.id))
      .map((donor) => {
        if (batchMode === "feature") {
          const matches = batchFeatureQuery.trim() ? findFeaturesByPattern(donor, new RegExp(batchFeatureQuery, "i")) : [];
          if (!matches.length) {
            return makeEmptyRow(donor.name, { status: `No match for "${batchFeatureQuery}"` });
          }
          if (matches.length > 1) {
            return makeEmptyRow(donor.name, { status: `Ambiguous: ${matches.length} matching features` });
          }
          const match = matches[0];
          const seq = extractSelectedSequence(donor, { start: match.start, end: match.end });
          const designed = designPrimersFromVectorJunctions({
            vectorSequence: vectorPlasmid.sequence,
            leftKeptEnd: vectorBackbonePlan.leftKeptEnd,
            rightKeptStart: vectorBackbonePlan.rightKeptStart,
            insertSequence: seq,
            method: assemblyMethod,
          });
          const assembledPlasmid = buildAssembledPlasmid({
            vector: vectorPlasmid,
            replaceSpan: {
              start: vectorBackbonePlan.replaceStart,
              end: vectorBackbonePlan.replaceEnd,
              names: vectorBackbonePlan.names,
            },
            insertSequence: seq,
            insertName: match.name,
            insertSource: donor,
            insertSpan: { start: match.start, end: match.end, names: [match.name] },
            primers: designed,
          });
          return {
            donorId: donor.id,
            donorName: donor.name,
            matchedLeft: match.name,
            matchedRight: "",
            vectorLength: vectorPlasmid.length,
            vectorAmpliconLength: batchVectorAmpliconLength,
            insertLength: seq.length,
            assembledLength: batchVectorAmpliconLength + seq.length,
            vectorForwardPrimer: designed.vectorForwardPrimer,
            vectorForwardPrimerLength: designed.vectorForwardPrimer.length,
            vectorForwardPrimerTm: designed.vectorForwardTm,
            vectorReversePrimer: designed.vectorReversePrimer,
            vectorReversePrimerLength: designed.vectorReversePrimer.length,
            vectorReversePrimerTm: designed.vectorReverseTm,
            insertForwardPrimer: designed.insertForwardPrimer,
            insertForwardPrimerLength: designed.insertForwardPrimer.length,
            insertForwardPrimerTm: designed.insertForwardTm,
            insertReversePrimer: designed.insertReversePrimer,
            insertReversePrimerLength: designed.insertReversePrimer.length,
            insertReversePrimerTm: designed.insertReverseTm,
            vectorDiagnosticSummary: summarizePrimerSet(designed, "vector"),
            insertDiagnosticSummary: summarizePrimerSet(designed, "insert"),
            vectorReview: describePrimerSetReview(designed, "vector"),
            insertReview: describePrimerSetReview(designed, "insert"),
            status: summarizeBatchStatus(designed),
            detail: {
              donorName: donor.name,
              matchedLeft: match.name,
              matchedRight: "",
              vectorName: vectorPlasmid.name,
              vectorLength: vectorPlasmid.length,
              vectorAmpliconLength: batchVectorAmpliconLength,
              insertLength: seq.length,
              assembledLength: batchVectorAmpliconLength + seq.length,
              assembledPlasmid,
              primers: designed,
            },
          };
        }

        const leftMatches = batchLeftQuery.trim() ? findFeaturesByPattern(donor, new RegExp(batchLeftQuery, "i")) : [];
        const rightMatches = batchRightQuery.trim() ? findFeaturesByPattern(donor, new RegExp(batchRightQuery, "i")) : [];
        if (!leftMatches.length || !rightMatches.length) {
          return makeEmptyRow(donor.name, { status: "Missing one or both boundary features" });
        }
        if (leftMatches.length > 1 || rightMatches.length > 1) {
          return makeEmptyRow(donor.name, {
            matchedLeft: leftMatches.map((feature) => feature.name).join("; "),
            matchedRight: rightMatches.map((feature) => feature.name).join("; "),
            status: "Ambiguous boundary features. Review this plasmid manually.",
          });
        }
        const left = leftMatches[0];
        const right = rightMatches[0];
        const rule: RegionRule = {
          mode: "between",
          leftFeatureId: left.id,
          rightFeatureId: right.id,
          inclusion: batchInclusion,
        };
        const span = resolveRegionRule(donor, rule);
        if (!span) {
          return makeEmptyRow(donor.name, {
            matchedLeft: left.name,
            matchedRight: right.name,
            status: "Could not resolve donor region",
          });
        }
        const seq = extractSelectedSequence(donor, span);
        const designed = designPrimersFromVectorJunctions({
          vectorSequence: vectorPlasmid.sequence,
          leftKeptEnd: vectorBackbonePlan.leftKeptEnd,
          rightKeptStart: vectorBackbonePlan.rightKeptStart,
          insertSequence: seq,
          method: assemblyMethod,
        });
        const assembledPlasmid = buildAssembledPlasmid({
          vector: vectorPlasmid,
          replaceSpan: {
            start: vectorBackbonePlan.replaceStart,
            end: vectorBackbonePlan.replaceEnd,
            names: vectorBackbonePlan.names,
          },
          insertSequence: seq,
          insertName: `${left.name} -> ${right.name}`,
          insertSource: donor,
          insertSpan: span,
          primers: designed,
        });
        return {
          donorId: donor.id,
          donorName: donor.name,
          matchedLeft: left.name,
          matchedRight: right.name,
          vectorLength: vectorPlasmid.length,
          vectorAmpliconLength: batchVectorAmpliconLength,
          insertLength: seq.length,
          assembledLength: batchVectorAmpliconLength + seq.length,
          vectorForwardPrimer: designed.vectorForwardPrimer,
          vectorForwardPrimerLength: designed.vectorForwardPrimer.length,
          vectorForwardPrimerTm: designed.vectorForwardTm,
          vectorReversePrimer: designed.vectorReversePrimer,
          vectorReversePrimerLength: designed.vectorReversePrimer.length,
          vectorReversePrimerTm: designed.vectorReverseTm,
          insertForwardPrimer: designed.insertForwardPrimer,
          insertForwardPrimerLength: designed.insertForwardPrimer.length,
          insertForwardPrimerTm: designed.insertForwardTm,
          insertReversePrimer: designed.insertReversePrimer,
          insertReversePrimerLength: designed.insertReversePrimer.length,
          insertReversePrimerTm: designed.insertReverseTm,
          vectorDiagnosticSummary: summarizePrimerSet(designed, "vector"),
          insertDiagnosticSummary: summarizePrimerSet(designed, "insert"),
          vectorReview: describePrimerSetReview(designed, "vector"),
          insertReview: describePrimerSetReview(designed, "insert"),
          status: summarizeBatchStatus(designed),
          detail: {
            donorName: donor.name,
            matchedLeft: left.name,
            matchedRight: right.name,
            vectorName: vectorPlasmid.name,
            vectorLength: vectorPlasmid.length,
            vectorAmpliconLength: batchVectorAmpliconLength,
            insertLength: seq.length,
            assembledLength: batchVectorAmpliconLength + seq.length,
            assembledPlasmid,
            primers: designed,
          },
        };
      });
  }, [
    assemblyMethod,
    batchBackbonePrimers,
    batchDonorIds,
    batchFeatureQuery,
    batchInclusion,
    batchLeftQuery,
    batchMode,
    batchRightQuery,
    batchVectorAmpliconLength,
    donorPlasmids,
    vectorBackbonePlan,
    vectorPlasmid,
  ]);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>, library: LibraryKind) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    debugLog("handleFiles:start", { library, files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })) });
    setLoading(true);
    try {
      const parsed = await Promise.all(files.map((file) => parsePlasmidFile(file)));
      debugLog("handleFiles:parsed", { library, parsed: parsed.map((plasmid) => ({ name: plasmid.name, length: plasmid.length, features: plasmid.features.length })) });
      applyLoadedPlasmids(parsed, library, `${files.length} ${library} file${files.length > 1 ? "s" : ""}`);
    } catch (error) {
      debugLog("handleFiles:error", error);
      setStatus(error instanceof Error ? error.message : "Failed to load files.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function applyLoadedPlasmids(parsed: Plasmid[], library: LibraryKind, sourceLabel: string) {
    debugLog("applyLoadedPlasmids:start", { library, sourceLabel, count: parsed.length });
    const existingSignatures = new Set(plasmids.map(plasmidSignature));
    const seenParsed = new Set<string>();
    const uniqueParsed = parsed.filter((plasmid) => {
      const signature = plasmidSignature(plasmid);
      if (existingSignatures.has(signature) || seenParsed.has(signature)) return false;
      seenParsed.add(signature);
      return true;
    });
    if (!uniqueParsed.length) {
      debugLog("applyLoadedPlasmids:skipped-duplicates", { library, sourceLabel });
      setStatus(`Skipped ${sourceLabel}: those plasmids are already loaded.`);
      return;
    }

    setPlasmids((current) => [...current, ...uniqueParsed]);
    if (library === "vector") {
      setVectorMode("plasmid");
      setVectorLibraryIds((current) => [...current, ...uniqueParsed.map((plasmid) => plasmid.id)]);
      const firstVector = uniqueParsed[0] ?? null;
      if (firstVector) {
        setVectorPlasmidId(firstVector.id);
        setVectorVisibleIds(firstVector.features.map((feature) => feature.id));
        const hammerhead = findFeature(firstVector.features, /hammerhead/i);
        const hdv = findFeature(firstVector.features, /\bhdv\b|ribozyme/i);
        if (hammerhead && hdv) {
          setVectorRule({ mode: "between", leftFeatureId: hammerhead.id, rightFeatureId: hdv.id, inclusion: DEFAULT_INCLUSION });
        }
      }
    } else {
      setInsertMode("plasmid");
      setDonorLibraryIds((current) => [...current, ...uniqueParsed.map((plasmid) => plasmid.id)]);
      const firstDonor = uniqueParsed[0] ?? null;
      if (firstDonor) {
        setInsertPlasmidId(firstDonor.id);
        setInsertVisibleIds(firstDonor.features.map((feature) => feature.id));
        const t7 = findFeature(firstDonor.features, /\bt7\b/i);
        const hdv = findFeature(firstDonor.features, /\bhdv\b|ribozyme/i);
        if (t7 && hdv) {
          setInsertRule({
            mode: "between",
            leftFeatureId: t7.id,
            rightFeatureId: hdv.id,
            inclusion: DEFAULT_INCLUSION,
          });
          setInsertRuleMode("between");
        }
      }
    }
    setBatchDonorIds((current) => [...new Set([...current, ...uniqueParsed.filter(() => library === "donor").map((plasmid) => plasmid.id)])]);
    debugLog("applyLoadedPlasmids:complete", { library, loaded: uniqueParsed.map((plasmid) => plasmid.name) });
    setStatus(`Loaded ${uniqueParsed.length} new ${library} file${uniqueParsed.length === 1 ? "" : "s"} from ${sourceLabel}. Use the legends on the right of each map to define extraction rules.`);
  }

  async function handleLoadExampleSet() {
    setLoading(true);
    debugLog("handleLoadExampleSet:start");
    try {
      const { vectors, donors } = cloneDemoSet();
      applyLoadedPlasmids(vectors, "vector", `${vectors.length} bundled demo vectors`);
      applyLoadedPlasmids(donors, "donor", `${donors.length} bundled demo donors`);
    } catch (error) {
      debugLog("handleLoadExampleSet:error", error);
      setStatus(error instanceof Error ? error.message : "Could not load the bundled demo set.");
    } finally {
      setLoading(false);
    }
  }


  function updatePlasmidMeta(id: string, patch: Partial<Plasmid>) {
    setPlasmids((current) => current.map((plasmid) => (plasmid.id === id ? { ...plasmid, ...patch, length: patch.sequence?.length ?? plasmid.length } : plasmid)));
  }

  function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentReport() {
    if (!primers || !validation || !vectorPlasmid || !vectorBackbonePlan) return;
    downloadFile(
      "assembly-report.json",
      JSON.stringify(
        {
          vector: vectorPlasmid.name,
          vectorRule,
          vectorSpan: vectorBackbonePlan,
          insertRule,
          insertLabel,
          method: assemblyMethod,
          validation,
          primers,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  function exportBatchCsv() {
    if (!batchRows.length || !vectorPlasmid || !vectorBackbonePlan || !batchBackbonePrimers) return;
    const lines = [
      [
        "Vector",
        "Insert_plasmid",
        "Row_type",
        "Left_boundary",
        "Right_boundary",
        "Description",
        "Backbone_forward_primer",
        "Backbone_forward_len_nt",
        "Backbone_forward_tm_c",
        "Backbone_reverse_primer",
        "Backbone_reverse_len_nt",
        "Backbone_reverse_tm_c",
        "Insert_forward_primer",
        "Insert_forward_len_nt",
        "Insert_forward_tm_c",
        "Insert_reverse_primer",
        "Insert_reverse_len_nt",
        "Insert_reverse_tm_c",
        "Backbone_review",
        "Insert_review",
        "Status",
        "Vector_length_bp",
        "Vector_amplicon_bp",
        "Insert_bp",
        "Assembled_plasmid_bp",
      ].join(","),
      [
        csv(vectorPlasmid.name),
        csv(""),
        csv("backbone"),
        csv(""),
        csv(""),
        csv(`${summarizePrimerSet(batchBackbonePrimers, "vector")}. ${batchVectorAmpliconLength.toLocaleString()} bp backbone PCR.`),
        csv(batchBackbonePrimers.vectorForwardPrimer),
        batchBackbonePrimers.vectorForwardPrimer.length,
        batchBackbonePrimers.vectorForwardTm.toFixed(1),
        csv(batchBackbonePrimers.vectorReversePrimer),
        batchBackbonePrimers.vectorReversePrimer.length,
        batchBackbonePrimers.vectorReverseTm.toFixed(1),
        csv(""),
        csv(""),
        csv(""),
        csv(""),
        csv(""),
        csv(""),
        csv(describePrimerSetReview(batchBackbonePrimers, "vector")),
        csv(""),
        csv(summarizePrimerSet(batchBackbonePrimers, "vector")),
        vectorPlasmid.length,
        batchVectorAmpliconLength,
        "",
        "",
      ].join(","),
      ...batchRows.map((row) =>
        [
          csv(vectorPlasmid.name),
          csv(row.donorName),
          csv("insert"),
          csv(row.matchedLeft),
          csv(row.matchedRight),
          csv(`${row.insertDiagnosticSummary}. ${row.insertLength.toLocaleString()} bp insert PCR.`),
          csv(""),
          "",
          "",
          csv(""),
          "",
          "",
          csv(row.insertForwardPrimer),
          row.insertForwardPrimerLength || "",
          row.insertForwardPrimerTm ? row.insertForwardPrimerTm.toFixed(1) : "",
          csv(row.insertReversePrimer),
          row.insertReversePrimerLength || "",
          row.insertReversePrimerTm ? row.insertReversePrimerTm.toFixed(1) : "",
          csv(row.vectorReview),
          csv(row.insertReview),
          csv(row.status),
          row.vectorLength,
          row.vectorAmpliconLength,
          row.insertLength || "",
          row.assembledLength || "",
        ].join(","),
      ),
    ];
    downloadFile("batch-assembly-primers-snapgene.csv", lines.join("\n"), "text/csv");
  }

  function openBatchDetail(detail: BatchDetailSnapshot | null, view: "diagnostics" | "assembly") {
    if (!detail) return;
    setSelectedBatchDetail(detail);
    setSelectedBatchView(view);
  }

  function openBatchDetailInNewTab(detail: BatchDetailSnapshot | null) {
    if (!detail || typeof window === "undefined") return;
    const detailId = `${detail.donorName}-${Date.now()}`;
    window.localStorage.setItem(`${BATCH_DETAIL_STORAGE_KEY}:${detailId}`, JSON.stringify(detail));
    const url = new URL(window.location.href);
    url.searchParams.set("batchDetail", detailId);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-content">
          <div className="hero-brand">
            <div className="hero-logo" aria-hidden="true">
              <span className="hero-logo-ring" />
              <span className="hero-logo-core">BC</span>
            </div>
            <div className="hero-wordmark">
              <p className="eyebrow">BatchClone</p>
              <span>Primer design for repeatable assembly workflows</span>
            </div>
          </div>
          <h1>Design Primers for Batch Cloning</h1>
          <p className="hero-copy">
            Build assembly-ready primer sets from annotated vectors and donor constructs with a workflow tuned
            for repeated cloning jobs. Define junction rules once, inspect the map visually, and export batch
            results with matched features, diagnostics, and assembled plasmid previews.
          </p>
          <div className="hero-metrics" aria-label="Project summary">
            <div className="hero-metric">
              <span className="hero-metric-label">Vectors loaded</span>
              <strong>{vectorSources.length}</strong>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-label">Donors loaded</span>
              <strong>{donorSources.length}</strong>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-label">Assembly modes</span>
              <strong>Gibson + In-Fusion</strong>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <div className="upload-stack">
            <label className="upload-button">
              <input type="file" accept=".gb,.gbk,.dna,.fa,.fasta,.fas,.seq" multiple onChange={(event) => void handleFiles(event, "vector")} disabled={loading} />
              {loading ? "Loading..." : "Load vector files"}
            </label>
            <label className="upload-button donor-upload">
              <input type="file" accept=".gb,.gbk,.dna,.fa,.fasta,.fas,.seq" multiple onChange={(event) => void handleFiles(event, "donor")} disabled={loading} />
              {loading ? "Loading..." : "Load donor files"}
            </label>
            <button type="button" className="secondary-button" onClick={() => void handleLoadExampleSet()} disabled={loading}>
              {loading ? "Loading..." : "Load example set"}
            </button>
          </div>
          <div className="status">{status}</div>
        </div>
      </header>

      <main className="workflow-stack">
        <RulePanel
          title="1. Vector Rule"
          plasmid={vectorPlasmid}
          sourceMode={vectorMode}
          setSourceMode={setVectorMode}
          ruleMode={vectorRuleMode}
          setRuleMode={setVectorRuleMode}
          rule={vectorRule}
          setRule={setVectorRule}
          visibleIds={vectorVisibleIds}
          setVisibleIds={setVectorVisibleIds}
          onSelectPlasmid={(id) => {
            const plasmid = plasmids.find((entry) => entry.id === id) ?? null;
            setVectorPlasmidId(id);
            setVectorVisibleIds(plasmid?.features.map((feature) => feature.id) ?? []);
            setVectorRule(null);
          }}
          plasmidOptions={vectorSources}
          plasmidId={vectorPlasmidId}
          onUpdatePlasmidMeta={updatePlasmidMeta}
          highlightedSpan={
            vectorBackbonePlan
              ? {
                  start: vectorBackbonePlan.replaceStart,
                  end: vectorBackbonePlan.replaceEnd,
                  names: vectorBackbonePlan.names,
                }
              : null
          }
          sequenceText={vectorPanelSequenceText}
          manualSequenceName={manualVectorName}
          setManualSequenceName={setManualVectorName}
          manualSequenceText={manualVectorSequence}
          setManualSequenceText={setManualVectorSequence}
          manualTopology={manualVectorTopology}
          setManualTopology={setManualVectorTopology}
          manualStrandedness={manualVectorStrandedness}
          setManualStrandedness={setManualVectorStrandedness}
          manualRegionStart={manualVectorReplaceStart}
          setManualRegionStart={setManualVectorReplaceStart}
          manualRegionEnd={manualVectorReplaceEnd}
          setManualRegionEnd={setManualVectorReplaceEnd}
        />

        <section>
        <RulePanel
          title="2. Insert Rule"
          plasmid={insertPlasmid}
          ruleMode={insertRuleMode}
          setRuleMode={setInsertRuleMode}
          rule={insertRule}
          setRule={setInsertRule}
          visibleIds={insertVisibleIds}
          setVisibleIds={setInsertVisibleIds}
          onSelectPlasmid={(id) => {
            const plasmid = plasmids.find((entry) => entry.id === id) ?? null;
            setInsertPlasmidId(id);
            setInsertVisibleIds(plasmid?.features.map((feature) => feature.id) ?? []);
            setInsertRule(null);
          }}
          plasmidOptions={donorSources}
          plasmidId={insertPlasmidId}
          onUpdatePlasmidMeta={updatePlasmidMeta}
          highlightedSpan={insertSpan}
          sequenceText={insertMode === "plasmid" ? insertSequence : sanitizeSequence(manualInsertSequence)}
          sourceMode={insertMode}
          setSourceMode={setInsertMode}
          manualSequenceName={manualInsertName}
          setManualSequenceName={setManualInsertName}
          manualSequenceText={manualInsertSequence}
          setManualSequenceText={setManualInsertSequence}
          manualStrandedness={manualInsertStrandedness}
          setManualStrandedness={setManualInsertStrandedness}
          autoAdjustBoundarySelection
          donorBrowser={
            <div className="donor-browser">
              <div className="panel-header">
                <h3>Donor Plasmids</h3>
                <span>{donorPlasmids.length} available</span>
              </div>
              <div className="donor-scroll">
                {donorPlasmids.map((plasmid) => (
                  <button
                    key={plasmid.id}
                    type="button"
                    className={`donor-card ${insertPlasmidId === plasmid.id ? "active" : ""}`}
                    onClick={() => {
                      setInsertPlasmidId(plasmid.id);
                      setInsertVisibleIds(plasmid.features.map((feature) => feature.id));
                      setInsertRule(null);
                    }}
                  >
                    <strong>{plasmid.name}</strong>
                    <span>{plasmid.length.toLocaleString()} bp</span>
                    <span>{plasmid.features.length} features</span>
                    <span>{plasmid.topology}</span>
                  </button>
                ))}
              </div>
            </div>
          }
        />
        </section>
      </main>

      <section className="panel output-panel">
        <div className="panel-header">
          <h2>3. Assembled Construct + Primers</h2>
          <div className="assembly-controls">
            <select value={assemblyMethod} onChange={(event) => setAssemblyMethod(event.target.value as AssemblyMethod)}>
              <option value="gibson">Gibson Assembly</option>
              <option value="in-fusion">In-Fusion</option>
            </select>
            <button type="button" className="secondary-button" disabled={!primers} onClick={exportCurrentReport}>Save current report</button>
          </div>
        </div>

        {assembledPlasmid && primers && validation ? (
          <>
            <div className="validation-grid">
              <div className="metric-card"><strong>Status</strong><span>{validation.success ? "Assembly-ready" : "Review primer diagnostics"}</span></div>
              <div className="metric-card"><strong>Backbone amplicon</strong><span>{validation.backboneAmpliconLength.toLocaleString()} bp</span></div>
              <div className="metric-card"><strong>Insert amplicon</strong><span>{validation.insertAmpliconLength.toLocaleString()} bp</span></div>
              <div className="metric-card"><strong>Final construct</strong><span>{validation.assembledLength.toLocaleString()} bp</span></div>
            </div>

            <PlasmidViewer
              plasmid={assembledPlasmid}
              selectedFeatureIds={assembledPlasmid.features.filter((feature) => feature.type === "insert" || feature.type === "primer_bind").map((feature) => feature.id)}
              visibleFeatureIds={assembledPlasmid.features.map((feature) => feature.id)}
              highlightedSpan={assembledPlasmid.features.find((feature) => feature.type === "insert") ?? null}
              sequenceText={assembledPlasmid.sequence}
              sequenceLabel={assembledPlasmid.name}
            />

            <div className="primer-grid">
              <PrimerCard
                title="Backbone PCR"
                subtitle={`${validation.backboneAmpliconLength.toLocaleString()} bp amplicon (${vectorPlasmid!.length.toLocaleString()} bp vector minus ${validation.removed.toLocaleString()} bp replacement window)`}
                forward={primers.vectorForwardPrimer}
                reverse={primers.vectorReversePrimer}
                forwardTm={primers.vectorForwardTm}
                reverseTm={primers.vectorReverseTm}
                forwardDiagnostics={primers.vectorForwardDiagnostics}
                reverseDiagnostics={primers.vectorReverseDiagnostics}
                pairDiagnostics={primers.vectorPairDiagnostics}
              />
              <PrimerCard
                title="Insert PCR"
                subtitle={`${validation.insertAmpliconLength.toLocaleString()} bp amplicon`}
                forward={primers.insertForwardPrimer}
                reverse={primers.insertReversePrimer}
                forwardTm={primers.insertForwardTm}
                reverseTm={primers.insertReverseTm}
                forwardDiagnostics={primers.insertForwardDiagnostics}
                reverseDiagnostics={primers.insertReverseDiagnostics}
                pairDiagnostics={primers.insertPairDiagnostics}
              />
              <article className="primer-card">
                <h3>Junction Check</h3>
                <p>{primers.overlapLength} bp homology on insert primers</p>
                <div className="primer-row"><span>Left</span><code>{primers.leftVectorOverlap}</code></div>
                <div className="primer-row"><span>Right</span><code>{primers.rightVectorOverlap}</code></div>
                <div className="primer-row"><span>Insert 5&apos;</span><code>{primers.insertStartOverlap}</code></div>
                <div className="primer-row"><span>Insert 3&apos;</span><code>{primers.insertEndOverlap}</code></div>
              </article>
            </div>

            <BatchPanel
              batchRows={batchRows}
              batchBackbonePrimers={batchBackbonePrimers}
              batchMode={batchMode}
              setBatchMode={setBatchMode}
              batchLeftQuery={batchLeftQuery}
              setBatchLeftQuery={setBatchLeftQuery}
              batchRightQuery={batchRightQuery}
              setBatchRightQuery={setBatchRightQuery}
              batchFeatureQuery={batchFeatureQuery}
              setBatchFeatureQuery={setBatchFeatureQuery}
              batchInclusion={batchInclusion}
              setBatchInclusion={setBatchInclusion}
              commonFeatureNames={commonFeatureNames}
              donorPlasmids={donorPlasmids}
              batchDonorIds={batchDonorIds}
              setBatchDonorIds={setBatchDonorIds}
              exportBatchCsv={exportBatchCsv}
              onOpenDetail={openBatchDetail}
            />
          </>
        ) : (
          <div className="empty-state">Define vector and insert rules to render the assembled construct and primer set.</div>
        )}
        {vectorPlasmid && vectorBackbonePlan && !assembledPlasmid ? (
          <BatchPanel
            batchRows={batchRows}
            batchBackbonePrimers={batchBackbonePrimers}
            batchMode={batchMode}
            setBatchMode={setBatchMode}
            batchLeftQuery={batchLeftQuery}
            setBatchLeftQuery={setBatchLeftQuery}
            batchRightQuery={batchRightQuery}
            setBatchRightQuery={setBatchRightQuery}
            batchFeatureQuery={batchFeatureQuery}
            setBatchFeatureQuery={setBatchFeatureQuery}
            batchInclusion={batchInclusion}
            setBatchInclusion={setBatchInclusion}
            commonFeatureNames={commonFeatureNames}
            donorPlasmids={donorPlasmids}
            batchDonorIds={batchDonorIds}
            setBatchDonorIds={setBatchDonorIds}
            exportBatchCsv={exportBatchCsv}
            onOpenDetail={openBatchDetail}
          />
        ) : null}
      </section>
      {selectedBatchDetail && selectedBatchView === "diagnostics" ? (
        <BatchDiagnosticsModal
          detail={selectedBatchDetail}
          onClose={() => {
            setSelectedBatchDetail(null);
            setSelectedBatchView(null);
          }}
        />
      ) : null}
      {selectedBatchDetail && selectedBatchView === "assembly" ? (
        <BatchAssemblyModal
          detail={selectedBatchDetail}
          onClose={() => {
            setSelectedBatchDetail(null);
            setSelectedBatchView(null);
          }}
          onOpenNewTab={() => openBatchDetailInNewTab(selectedBatchDetail)}
        />
      ) : null}
    </div>
  );
}

function cloneBundledMock(plasmid: Plasmid, name: string): Plasmid {
  return {
    ...plasmid,
    id: crypto.randomUUID(),
    name,
    fileName: `${name}.gb`,
    features: plasmid.features.map((feature) => ({ ...feature, id: crypto.randomUUID() })),
  };
}

function cloneDemoSet() {
  return {
    vectors: demoVectorPlasmids.map((plasmid) => cloneBundledMock(plasmid, plasmid.name)),
    donors: demoDonorPlasmids.map((plasmid) => cloneBundledMock(plasmid, plasmid.name)),
  };
}

function RulePanel(props: {
  title: string;
  plasmid: Plasmid | null;
  plasmidId: string;
  plasmidOptions: Plasmid[];
  ruleMode: RuleMode;
  setRuleMode: (mode: RuleMode) => void;
  rule: RegionRule | null;
  setRule: (rule: RegionRule | null) => void;
  visibleIds: string[];
  setVisibleIds: React.Dispatch<React.SetStateAction<string[]>>;
  onSelectPlasmid: (id: string) => void;
  onUpdatePlasmidMeta: (id: string, patch: Partial<Plasmid>) => void;
  highlightedSpan: { start: number; end: number; names: string[] } | null;
  sequenceText: string;
  footerAction?: React.ReactNode;
  donorBrowser?: React.ReactNode;
  sourceMode?: SourceMode;
  setSourceMode?: (mode: SourceMode) => void;
  manualSequenceName?: string;
  setManualSequenceName?: (value: string) => void;
  manualSequenceText?: string;
  setManualSequenceText?: (value: string) => void;
  manualTopology?: Plasmid["topology"];
  setManualTopology?: (value: Plasmid["topology"]) => void;
  manualStrandedness?: Plasmid["strandedness"];
  setManualStrandedness?: (value: Plasmid["strandedness"]) => void;
  manualRegionStart?: string;
  setManualRegionStart?: (value: string) => void;
  manualRegionEnd?: string;
  setManualRegionEnd?: (value: string) => void;
  autoAdjustBoundarySelection?: boolean;
}) {
  const {
    title,
    plasmid,
    plasmidId,
    plasmidOptions,
    ruleMode,
    setRuleMode,
    rule,
    setRule,
    visibleIds,
    setVisibleIds,
    onSelectPlasmid,
    onUpdatePlasmidMeta,
    highlightedSpan,
    sequenceText,
    footerAction,
    donorBrowser,
    sourceMode,
    setSourceMode,
    manualSequenceName,
    setManualSequenceName,
    manualSequenceText,
    setManualSequenceText,
    manualTopology,
    setManualTopology,
    manualStrandedness,
    setManualStrandedness,
    manualRegionStart,
    setManualRegionStart,
    manualRegionEnd,
    setManualRegionEnd,
    autoAdjustBoundarySelection = false,
  } = props;

  const selectedFeatureIds =
    rule?.mode === "feature"
      ? rule.featureIds
      : rule?.mode === "between"
        ? [rule.leftFeatureId, rule.rightFeatureId]
        : [];

  function handleFeatureSelect(featureId: string, event: { multi: boolean }) {
    if (!plasmid) return;

    if (autoAdjustBoundarySelection) {
      const currentIds =
        rule?.mode === "between"
          ? [rule.leftFeatureId, rule.rightFeatureId].filter(Boolean)
          : rule?.mode === "feature"
            ? rule.featureIds
            : [];
      let nextIds: string[];
      if (currentIds.includes(featureId)) {
        nextIds = currentIds.filter((id) => id !== featureId);
      } else if (currentIds.length >= 2) {
        nextIds = [featureId];
      } else {
        nextIds = [...currentIds, featureId];
      }

      if (!nextIds.length) {
        setRuleMode("feature");
        setRule(null);
        return;
      }

      if (nextIds.length === 1) {
        setRuleMode("feature");
        setRule({ mode: "feature", featureIds: nextIds });
        return;
      }

      setRuleMode("between");
      setRule({
        mode: "between",
        leftFeatureId: nextIds[0],
        rightFeatureId: nextIds[1],
        inclusion: rule?.mode === "between" ? rule.inclusion : DEFAULT_INCLUSION,
      });
      return;
    }

    if (ruleMode === "feature") {
      const nextIds =
        rule?.mode === "feature"
          ? rule.featureIds.includes(featureId)
            ? rule.featureIds.filter((id) => id !== featureId)
            : event.multi
              ? [...rule.featureIds, featureId]
              : [featureId]
          : [featureId];
      setRule({ mode: "feature", featureIds: nextIds });
      return;
    }

    if (ruleMode === "between" && rule?.mode === "between") {
      if (!rule.leftFeatureId || rule.leftFeatureId === featureId) {
        setRule({ ...rule, leftFeatureId: featureId });
      } else if (!rule.rightFeatureId || rule.rightFeatureId === featureId) {
        setRule({ ...rule, rightFeatureId: featureId });
      } else {
        setRule({ ...rule, leftFeatureId: featureId, rightFeatureId: "" });
      }
      return;
    }

    setRule({ mode: "between", leftFeatureId: featureId, rightFeatureId: "", inclusion: DEFAULT_INCLUSION });
  }

  function handleResetSelection() {
    setRule(null);
  }

  const selectionSummary = highlightedSpan
    ? `${title.startsWith("1.") ? "Vector backbone selected" : "Selected insert region"}: ${highlightedSpan.names.join(" · ")} · ${sequenceText.length.toLocaleString()} bp`
    : null;

  return (
    <section className="panel rule-panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <span>{highlightedSpan ? `${highlightedSpan.start + 1}-${highlightedSpan.end + 1}` : "No region selected"}</span>
      </div>

      {setSourceMode ? (
        <div className="toggle-row">
          <button type="button" className={sourceMode === "plasmid" ? "toggle-button active" : "toggle-button"} onClick={() => setSourceMode("plasmid")}>
            {title.startsWith("1.") ? "From file" : "From donor"}
          </button>
          <button type="button" className={sourceMode === "sequence" ? "toggle-button active" : "toggle-button"} onClick={() => setSourceMode("sequence")}>
            Paste sequence
          </button>
        </div>
      ) : null}

      {!setSourceMode || sourceMode === "plasmid" ? (
        <>
          {donorBrowser}
          <div className="meta-grid">
            <label className="stacked-field">
              Source
              <select value={plasmidId} onChange={(event) => onSelectPlasmid(event.target.value)}>
                <option value="">Choose source</option>
                {plasmidOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            {plasmid?.topology === "linear" ? (
              <label className="stacked-field">
                Linear import
                <button type="button" className="secondary-button" onClick={() => onUpdatePlasmidMeta(plasmid.id, { topology: "circular" })}>
                  Convert to circular
                </button>
              </label>
            ) : null}
            {plasmid?.strandedness === "ss" ? (
              <label className="stacked-field">
                Single-stranded import
                <button type="button" className="secondary-button" onClick={() => onUpdatePlasmidMeta(plasmid.id, { strandedness: "ds" })}>
                  Convert to dsDNA
                </button>
              </label>
            ) : null}
          </div>

          <div className="rule-grid">
            <label className="stacked-field">
              Extraction mode
              <select value={ruleMode} onChange={(event) => {
                const mode = event.target.value as RuleMode;
                setRuleMode(mode);
                setRule(null);
              }}>
                <option value="feature">Named feature(s)</option>
                <option value="between">Between two features</option>
              </select>
            </label>
            {ruleMode === "between" ? (
              <>
                <label className="stacked-field">
                  Left boundary
                  <select
                    value={rule?.mode === "between" ? rule.leftFeatureId : ""}
                    onChange={(event) =>
                      setRule({
                        mode: "between",
                        leftFeatureId: event.target.value,
                        rightFeatureId: rule?.mode === "between" ? rule.rightFeatureId : "",
                        inclusion: rule?.mode === "between" ? rule.inclusion : DEFAULT_INCLUSION,
                      })
                    }
                  >
                    <option value="">Choose feature</option>
                    {plasmid?.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}
                  </select>
                </label>
                <label className="stacked-field">
                  Right boundary
                  <select
                    value={rule?.mode === "between" ? rule.rightFeatureId : ""}
                    onChange={(event) =>
                      setRule({
                        mode: "between",
                        leftFeatureId: rule?.mode === "between" ? rule.leftFeatureId : "",
                        rightFeatureId: event.target.value,
                        inclusion: rule?.mode === "between" ? rule.inclusion : DEFAULT_INCLUSION,
                      })
                    }
                  >
                    <option value="">Choose feature</option>
                    {plasmid?.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}
                  </select>
                </label>
                <label className="stacked-field">
                  Include / exclude flanks
                  <select
                    value={rule?.mode === "between" ? rule.inclusion : DEFAULT_INCLUSION}
                    onChange={(event) =>
                      setRule({
                        mode: "between",
                        leftFeatureId: rule?.mode === "between" ? rule.leftFeatureId : "",
                        rightFeatureId: rule?.mode === "between" ? rule.rightFeatureId : "",
                        inclusion: event.target.value as BoundaryInclusion,
                      })
                    }
                  >
                    <option value="exclude-both">Exclude both</option>
                    <option value="include-both">Include both</option>
                    <option value="include-left">Include left only</option>
                    <option value="include-right">Include right only</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <PlasmidViewer
            plasmid={plasmid}
            selectedFeatureIds={selectedFeatureIds}
            visibleFeatureIds={visibleIds}
            highlightedSpan={highlightedSpan}
            highlightMode={title.startsWith("1.") ? "backbone" : "region"}
            selectionSummary={selectionSummary}
            sequenceText={sequenceText}
            onFeatureSelect={handleFeatureSelect}
            onVisibleFeatureIdsChange={setVisibleIds}
            onResetSelection={handleResetSelection}
          />
        </>
      ) : (
        <div className="sequence-editor">
          <label className="stacked-field">
            {title.startsWith("1.") ? "Vector name" : "Insert name"}
            <input value={manualSequenceName ?? ""} onChange={(event) => setManualSequenceName?.(event.target.value)} />
          </label>
          <label className="stacked-field">
            {title.startsWith("1.") ? "Vector sequence" : "Insert sequence"}
            <textarea
              value={manualSequenceText ?? ""}
              onChange={(event) => setManualSequenceText?.(event.target.value)}
              placeholder={title.startsWith("1.") ? "Paste vector sequence or FASTA" : "Paste insert sequence or FASTA"}
            />
          </label>
          <div className="meta-grid">
            {manualStrandedness === "ss" ? (
              <label className="stacked-field">
                Single-stranded input
                <button type="button" className="secondary-button" onClick={() => setManualStrandedness?.("ds")}>
                  Convert to dsDNA
                </button>
              </label>
            ) : null}
            {title.startsWith("1.") && manualTopology === "linear" ? (
              <label className="stacked-field">
                Linear input
                <button type="button" className="secondary-button" onClick={() => setManualTopology?.("circular")}>
                  Convert to circular
                </button>
              </label>
            ) : null}
          </div>
          {title.startsWith("1.") ? (
            <>
              <div className="selection-summary">
                <strong>Pasted sequence defaults:</strong> linear ssDNA. Promote it only if you want cloning assumptions applied.
              </div>
              <div className="meta-grid">
                <label className="stacked-field">
                  Replacement start
                  <input value={manualRegionStart ?? ""} onChange={(event) => setManualRegionStart?.(event.target.value)} placeholder="1-based" />
                </label>
                <label className="stacked-field">
                  Replacement end
                  <input value={manualRegionEnd ?? ""} onChange={(event) => setManualRegionEnd?.(event.target.value)} placeholder="1-based" />
                </label>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="selection-summary">
        {highlightedSpan ? <><strong>{title.startsWith("1.") ? "Vector backbone selected:" : "Selected insert region:"}</strong> {highlightedSpan.names.join(" · ")} · {sequenceText.length.toLocaleString()} bp</> : "Define a rule from the legend to highlight the extracted region."}
      </div>
      {footerAction ? <div className="rule-footer">{footerAction}</div> : null}
    </section>
  );
}

function PrimerCard(props: {
  title: string;
  subtitle: string;
  forward: string;
  reverse: string;
  forwardTm: number;
  reverseTm: number;
  forwardDiagnostics: PrimerDiagnostics;
  reverseDiagnostics: PrimerDiagnostics;
  pairDiagnostics: PrimerPairDiagnostics;
}) {
  return (
    <article className="primer-card">
      <h3>{props.title}</h3>
      <p>{props.subtitle}</p>
      <div className="primer-row"><span>Forward</span><code>{props.forward}</code></div>
      <div className="primer-row muted"><span>Tm</span><span>{props.forwardTm.toFixed(1)}°C</span></div>
      <div className="primer-row muted"><span>Checks</span><span>{renderCheckSummary(props.forwardDiagnostics.checks)}</span></div>
      <div className="primer-row"><span>Reverse</span><code>{props.reverse}</code></div>
      <div className="primer-row muted"><span>Tm</span><span>{props.reverseTm.toFixed(1)}°C</span></div>
      <div className="primer-row muted"><span>Checks</span><span>{renderCheckSummary(props.reverseDiagnostics.checks)}</span></div>
      <div className="primer-row muted"><span>Pair</span><span>{renderCheckSummary(props.pairDiagnostics.checks)}</span></div>
      <div className="primer-issue-list">
        <div className="primer-issue">
          <strong>Forward issues</strong>
          <span>{describeDiagnosticIssues(props.forwardDiagnostics)}</span>
        </div>
        <div className="primer-issue">
          <strong>Reverse issues</strong>
          <span>{describeDiagnosticIssues(props.reverseDiagnostics)}</span>
        </div>
        <div className="primer-issue">
          <strong>Pair issues</strong>
          <span>{describePairIssues(props.pairDiagnostics)}</span>
        </div>
      </div>
    </article>
  );
}

function BatchPanel(props: {
  batchRows: BatchRow[];
  batchBackbonePrimers: SeamlessAssemblyPrimers | null;
  batchMode: RuleMode;
  setBatchMode: (mode: RuleMode) => void;
  batchLeftQuery: string;
  setBatchLeftQuery: (value: string) => void;
  batchRightQuery: string;
  setBatchRightQuery: (value: string) => void;
  batchFeatureQuery: string;
  setBatchFeatureQuery: (value: string) => void;
  batchInclusion: BoundaryInclusion;
  setBatchInclusion: (value: BoundaryInclusion) => void;
  commonFeatureNames: string[];
  donorPlasmids: Plasmid[];
  batchDonorIds: string[];
  setBatchDonorIds: React.Dispatch<React.SetStateAction<string[]>>;
  exportBatchCsv: () => void;
  onOpenDetail: (detail: BatchDetailSnapshot | null, view: "diagnostics" | "assembly") => void;
}) {
  const {
    batchRows,
    batchBackbonePrimers,
    batchMode,
    setBatchMode,
    batchLeftQuery,
    setBatchLeftQuery,
    batchRightQuery,
    setBatchRightQuery,
    batchFeatureQuery,
    setBatchFeatureQuery,
    batchInclusion,
    setBatchInclusion,
    commonFeatureNames,
    donorPlasmids,
    batchDonorIds,
    setBatchDonorIds,
    exportBatchCsv,
    onOpenDetail,
  } = props;
  const batchFeatureOptions = useMemo(
    () => mergeCurrentFeatureOption(commonFeatureNames, batchFeatureQuery),
    [batchFeatureQuery, commonFeatureNames],
  );
  const batchLeftOptions = useMemo(
    () => mergeCurrentFeatureOption(commonFeatureNames, batchLeftQuery),
    [batchLeftQuery, commonFeatureNames],
  );
  const batchRightOptions = useMemo(
    () => mergeCurrentFeatureOption(commonFeatureNames, batchRightQuery),
    [batchRightQuery, commonFeatureNames],
  );

  return (
    <section className="batch-panel">
      <div className="panel-header">
        <h3>Batch Mode</h3>
        <button type="button" className="secondary-button" disabled={!batchRows.length} onClick={exportBatchCsv}>Save batch CSV</button>
      </div>
      <div className="selection-summary">
        <strong>Batch vector backbone:</strong>{" "}
        {batchBackbonePrimers
          ? `${batchBackbonePrimers.vectorForwardPrimer} / ${batchBackbonePrimers.vectorReversePrimer} (${summarizePrimerSet(batchBackbonePrimers, "vector")})`
          : "Define the vector rule above first."}
      </div>
      <div className="batch-config-grid">
        <label className="stacked-field">
          Batch extraction mode
          <select value={batchMode} onChange={(event) => setBatchMode(event.target.value as RuleMode)}>
            <option value="between">Between two features</option>
            <option value="feature">Named feature</option>
          </select>
        </label>
        {batchMode === "between" ? (
          <>
            <label className="stacked-field">
              Left boundary
              <select value={batchLeftQuery} onChange={(event) => setBatchLeftQuery(event.target.value)}>
                <option value="">Choose common feature</option>
                {batchLeftOptions.map((name) => <option key={`left-${name}`} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="stacked-field">
              Right boundary
              <select value={batchRightQuery} onChange={(event) => setBatchRightQuery(event.target.value)}>
                <option value="">Choose common feature</option>
                {batchRightOptions.map((name) => <option key={`right-${name}`} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="stacked-field">
              Inclusion
              <select value={batchInclusion} onChange={(event) => setBatchInclusion(event.target.value as BoundaryInclusion)}>
                <option value="exclude-both">Exclude both</option>
                <option value="include-both">Include both</option>
                <option value="include-left">Include left only</option>
                <option value="include-right">Include right only</option>
              </select>
            </label>
          </>
        ) : (
          <label className="stacked-field">
            Common feature
            <select value={batchFeatureQuery} onChange={(event) => setBatchFeatureQuery(event.target.value)}>
              <option value="">Choose common feature</option>
              {batchFeatureOptions.map((name) => <option key={`feature-${name}`} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="selection-summary">
        <strong>Common donor features:</strong> {commonFeatureNames.length ? commonFeatureNames.join(", ") : "No shared feature names across selected donors."}
      </div>
      <div className="feature-check-grid">
        {donorPlasmids.map((plasmid) => (
          <label key={plasmid.id} className="feature-check">
            <input type="checkbox" checked={batchDonorIds.includes(plasmid.id)} onChange={() => setBatchDonorIds((current) => current.includes(plasmid.id) ? current.filter((id) => id !== plasmid.id) : [...current, plasmid.id])} />
            <span>{plasmid.name}</span>
            <em>{plasmid.length.toLocaleString()} bp</em>
          </label>
        ))}
      </div>
      <div className="batch-table-scroll">
      <div className="batch-table">
        <div className="batch-row batch-head">
          <span>Donor</span>
          <span>View assembled</span>
          <span>Left</span>
          <span>Right</span>
          <span>Vector len</span>
          <span>Vector PCR bp</span>
          <span>Insert bp</span>
          <span>Final bp</span>
          <span>Vector F primer</span>
          <span>Vector F len</span>
          <span>Vector F Tm</span>
          <span>Vector R primer</span>
          <span>Vector R len</span>
          <span>Vector R Tm</span>
          <span>Backbone review</span>
          <span>Insert F primer</span>
          <span>Insert F len</span>
          <span>Insert F Tm</span>
          <span>Insert R primer</span>
          <span>Insert R len</span>
          <span>Insert R Tm</span>
          <span>Insert review</span>
          <span>Diagnostics</span>
          <span>Status</span>
        </div>
        {batchRows.map((row) => (
          <div key={`${row.donorName}-${row.status}-${row.matchedLeft}-${row.matchedRight}`} className="batch-row">
            <span className="batch-donor-cell">{row.donorName}</span>
            <span>
              <button
                type="button"
                className="secondary-button batch-diagnostics-button"
                onClick={() => row.detail && onOpenDetail(row.detail, "assembly")}
                disabled={!row.detail}
              >
                View assembled
              </button>
            </span>
            <span>{row.matchedLeft || "—"}</span>
            <span>{row.matchedRight || "—"}</span>
            <span>{row.vectorLength ? row.vectorLength.toLocaleString() : "—"}</span>
            <span>{row.vectorAmpliconLength ? row.vectorAmpliconLength.toLocaleString() : "—"}</span>
            <span>{row.insertLength ? row.insertLength.toLocaleString() : "—"}</span>
            <span>{row.assembledLength ? row.assembledLength.toLocaleString() : "—"}</span>
            <code>{row.vectorForwardPrimer || "—"}</code>
            <span>{row.vectorForwardPrimerLength || "—"}</span>
            <span>{row.vectorForwardPrimerTm ? `${row.vectorForwardPrimerTm.toFixed(1)}°C` : "—"}</span>
            <code>{row.vectorReversePrimer || "—"}</code>
            <span>{row.vectorReversePrimerLength || "—"}</span>
            <span>{row.vectorReversePrimerTm ? `${row.vectorReversePrimerTm.toFixed(1)}°C` : "—"}</span>
            <span className="batch-reasons">{row.vectorReview}</span>
            <code>{row.insertForwardPrimer || "—"}</code>
            <span>{row.insertForwardPrimerLength || "—"}</span>
            <span>{row.insertForwardPrimerTm ? `${row.insertForwardPrimerTm.toFixed(1)}°C` : "—"}</span>
            <code>{row.insertReversePrimer || "—"}</code>
            <span>{row.insertReversePrimerLength || "—"}</span>
            <span>{row.insertReversePrimerTm ? `${row.insertReversePrimerTm.toFixed(1)}°C` : "—"}</span>
            <span className="batch-reasons">{row.insertReview}</span>
            <span>
              <button
                type="button"
                className="secondary-button batch-diagnostics-button"
                onClick={() => row.detail && onOpenDetail(row.detail, "diagnostics")}
                disabled={!row.detail}
              >
                View diagnostics
              </button>
            </span>
            <span title={`${row.vectorDiagnosticSummary}. ${row.insertDiagnosticSummary}`}>{row.status}</span>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}

function BatchDiagnosticsModal(props: {
  detail: BatchDetailSnapshot;
  onClose: () => void;
}) {
  const { detail, onClose } = props;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-shell diagnostics" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{detail.donorName} diagnostics</h2>
            <span>{detail.vectorName} backbone · {detail.insertLength.toLocaleString()} bp insert</span>
          </div>
          <div className="assembly-controls">
            <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="validation-grid">
          <div className="metric-card"><strong>Vector length</strong><span>{detail.vectorLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Backbone PCR</strong><span>{detail.vectorAmpliconLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Insert PCR</strong><span>{detail.insertLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Final construct</strong><span>{detail.assembledLength.toLocaleString()} bp</span></div>
        </div>

        <div className="primer-grid">
          <PrimerCard
            title="Backbone PCR"
            subtitle={`${detail.vectorAmpliconLength.toLocaleString()} bp amplicon`}
            forward={detail.primers.vectorForwardPrimer}
            reverse={detail.primers.vectorReversePrimer}
            forwardTm={detail.primers.vectorForwardTm}
            reverseTm={detail.primers.vectorReverseTm}
            forwardDiagnostics={detail.primers.vectorForwardDiagnostics}
            reverseDiagnostics={detail.primers.vectorReverseDiagnostics}
            pairDiagnostics={detail.primers.vectorPairDiagnostics}
          />
          <PrimerCard
            title="Insert PCR"
            subtitle={`${detail.insertLength.toLocaleString()} bp amplicon`}
            forward={detail.primers.insertForwardPrimer}
            reverse={detail.primers.insertReversePrimer}
            forwardTm={detail.primers.insertForwardTm}
            reverseTm={detail.primers.insertReverseTm}
            forwardDiagnostics={detail.primers.insertForwardDiagnostics}
            reverseDiagnostics={detail.primers.insertReverseDiagnostics}
            pairDiagnostics={detail.primers.insertPairDiagnostics}
          />
        </div>
      </section>
    </div>
  );
}

function BatchAssemblyModal(props: {
  detail: BatchDetailSnapshot;
  onClose: () => void;
  onOpenNewTab: () => void;
}) {
  const { detail, onClose, onOpenNewTab } = props;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-shell large" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{detail.donorName}</h2>
            <span>{detail.vectorName} backbone · {detail.assembledLength.toLocaleString()} bp assembled plasmid</span>
          </div>
          <div className="assembly-controls">
            <button type="button" className="secondary-button" onClick={onOpenNewTab}>Open in new tab</button>
            <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="validation-grid">
          <div className="metric-card"><strong>Vector length</strong><span>{detail.vectorLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Backbone PCR</strong><span>{detail.vectorAmpliconLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Insert PCR</strong><span>{detail.insertLength.toLocaleString()} bp</span></div>
          <div className="metric-card"><strong>Final construct</strong><span>{detail.assembledLength.toLocaleString()} bp</span></div>
        </div>

        <PlasmidViewer
          plasmid={detail.assembledPlasmid}
          selectedFeatureIds={detail.assembledPlasmid.features.filter((feature) => feature.type === "insert" || feature.type === "primer_bind").map((feature) => feature.id)}
          visibleFeatureIds={detail.assembledPlasmid.features.map((feature) => feature.id)}
          highlightedSpan={detail.assembledPlasmid.features.find((feature) => feature.type === "insert") ?? null}
          sequenceText={detail.assembledPlasmid.sequence}
          sequenceLabel={detail.assembledPlasmid.name}
        />

      </section>
    </div>
  );
}

function csv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function combineStatuses(statuses: PrimerDiagnosticStatus[]): PrimerDiagnosticStatus {
  if (statuses.some((status) => status === "fail")) return "fail";
  if (statuses.some((status) => status === "warn")) return "warn";
  return "pass";
}

function statusIcon(status: PrimerDiagnosticStatus): string {
  if (status === "pass") return "✓";
  if (status === "warn") return "△";
  return "✕";
}

function renderCheckSummary(checks: PrimerCheck[]): React.ReactNode {
  return (
    <span className="check-badge-row">
      {checks.map((check) => (
        <span key={`${check.label}-${check.status}`} className={`check-badge ${check.status}`} title={check.detail}>
          {statusIcon(check.status)} {check.label}
        </span>
      ))}
    </span>
  );
}

function summarizePrimerSet(primers: SeamlessAssemblyPrimers, kind: "vector" | "insert"): string {
  const status =
    kind === "vector"
      ? combineStatuses([
          primers.vectorForwardDiagnostics.status,
          primers.vectorReverseDiagnostics.status,
          primers.vectorPairDiagnostics.status,
        ])
      : combineStatuses([
          primers.insertForwardDiagnostics.status,
          primers.insertReverseDiagnostics.status,
          primers.insertPairDiagnostics.status,
        ]);
  if (status === "pass") return "PCR-ready";
  if (status === "warn") return "Ready with cautions";
  return "Needs review";
}

function summarizeBatchStatus(primers: SeamlessAssemblyPrimers): string {
  const overall = combineStatuses([
    primers.vectorForwardDiagnostics.status,
    primers.vectorReverseDiagnostics.status,
    primers.vectorPairDiagnostics.status,
    primers.insertForwardDiagnostics.status,
    primers.insertReverseDiagnostics.status,
    primers.insertPairDiagnostics.status,
  ]);
  if (overall === "pass") return "Ready";
  if (overall === "warn") return "Ready with cautions";
  return "Needs review";
}

function describeDiagnosticIssues(diagnostics: PrimerDiagnostics): string {
  const flagged = diagnostics.checks.filter((check) => check.status !== "pass");
  if (!flagged.length) return "All checks passed";
  return flagged.map((check) => `${check.label} (${check.detail})`).join("; ");
}

function describePairIssues(diagnostics: PrimerPairDiagnostics): string {
  const flagged = diagnostics.checks.filter((check) => check.status !== "pass");
  if (!flagged.length) return "All checks passed";
  return flagged.map((check) => `${check.label} (${check.detail})`).join("; ");
}

function describePrimerSetReview(primers: SeamlessAssemblyPrimers, kind: "vector" | "insert"): string {
  const forward = kind === "vector" ? primers.vectorForwardDiagnostics : primers.insertForwardDiagnostics;
  const reverse = kind === "vector" ? primers.vectorReverseDiagnostics : primers.insertReverseDiagnostics;
  const pair = kind === "vector" ? primers.vectorPairDiagnostics : primers.insertPairDiagnostics;

  const parts = [
    { label: "F", text: describeDiagnosticIssues(forward) },
    { label: "R", text: describeDiagnosticIssues(reverse) },
    { label: "Pair", text: describePairIssues(pair) },
  ].filter((entry) => entry.text !== "All checks passed");

  if (!parts.length) return "All checks passed";
  return parts.map((entry) => `${entry.label}: ${entry.text}`).join(" | ");
}

function mergeCurrentFeatureOption(options: string[], currentValue: string): string[] {
  const normalizedCurrent = currentValue.trim();
  if (!normalizedCurrent) return options;
  const seen = new Set<string>();
  return [normalizedCurrent, ...options].filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

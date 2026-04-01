export type Feature = {
  id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  strand?: number;
  color: string;
};

export type Plasmid = {
  id: string;
  name: string;
  fileName: string;
  length: number;
  sequence: string;
  topology: "circular" | "linear";
  strandedness: "ds" | "ss";
  description?: string;
  features: Feature[];
};

export type AssemblyMethod = "gibson" | "in-fusion";

export type SelectionMode = "range" | "whole-plasmid";

export type FragmentDraft = {
  role: "vector" | "insert";
  label: string;
  sourceId: string;
  selectionMode: SelectionMode;
  start: number;
  end: number;
  openAt: number;
  selectedFeatureIds: string[];
};

export type AssemblyFragment = {
  id: string;
  role: "vector" | "insert";
  label: string;
  sourceId: string;
  sourceName: string;
  selectionMode: SelectionMode;
  start: number;
  end: number;
  openAt: number;
  length: number;
  sequence: string;
  selectedFeatureNames: string[];
};

export type PrimerRecord = {
  fragmentId: string;
  fragmentLabel: string;
  sourceName: string;
  forwardPrimer: string;
  reversePrimer: string;
  annealForward: string;
  annealReverse: string;
  forwardTm: number;
  reverseTm: number;
  leftOverlap: string;
  rightOverlap: string;
};

export type PrimerDiagnosticStatus = "pass" | "warn" | "fail";

export type PrimerCheck = {
  label: string;
  status: PrimerDiagnosticStatus;
  detail: string;
};

export type PrimerDiagnostics = {
  length: number;
  tm: number;
  gcPercent: number;
  checks: PrimerCheck[];
  status: PrimerDiagnosticStatus;
  summary: string;
};

export type PrimerPairDiagnostics = {
  tmDelta: number;
  checks: PrimerCheck[];
  status: PrimerDiagnosticStatus;
  summary: string;
};

export type SeamlessAssemblyPrimers = {
  overlapLength: number;
  replaceStart: number;
  replaceEnd: number;
  insertLength: number;
  vectorForwardPrimer: string;
  vectorReversePrimer: string;
  insertForwardPrimer: string;
  insertReversePrimer: string;
  vectorForwardAnneal: string;
  vectorReverseAnneal: string;
  insertForwardAnneal: string;
  insertReverseAnneal: string;
  vectorForwardTm: number;
  vectorReverseTm: number;
  insertForwardTm: number;
  insertReverseTm: number;
  leftVectorOverlap: string;
  rightVectorOverlap: string;
  insertStartOverlap: string;
  insertEndOverlap: string;
  vectorForwardDiagnostics: PrimerDiagnostics;
  vectorReverseDiagnostics: PrimerDiagnostics;
  insertForwardDiagnostics: PrimerDiagnostics;
  insertReverseDiagnostics: PrimerDiagnostics;
  vectorPairDiagnostics: PrimerPairDiagnostics;
  insertPairDiagnostics: PrimerPairDiagnostics;
};

export type BoundaryInclusion = "exclude-both" | "include-both" | "include-left" | "include-right";

export type RegionRule =
  | {
      mode: "feature";
      featureIds: string[];
    }
  | {
      mode: "between";
      leftFeatureId: string;
      rightFeatureId: string;
      inclusion: BoundaryInclusion;
    };

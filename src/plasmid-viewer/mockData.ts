import type { Feature, Plasmid } from "../types";

type FeatureInput = Omit<Feature, "id">;

function makeFeature(input: FeatureInput, index: number): Feature {
  return {
    ...input,
    id: `${normalizeId(input.name)}-${index}`,
  };
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function generateSequence(length: number, seed: number): string {
  const motifs = [
    "ATGGCCGACTACGTTGACCA",
    "GCTTACCGATGAGTTCAGGA",
    "CCGTAACGATCTGGCATCAA",
    "TACGGCATGCTAGACCTGAA",
    "GATCCGTTACGAGCTTGGAA",
    "CGTACCATGGACTTACCGGA",
  ];
  let sequence = "";
  for (let index = 0; sequence.length < length; index += 1) {
    sequence += motifs[(index + seed) % motifs.length];
  }
  return sequence.slice(0, length);
}

function buildPlasmid(args: {
  id: string;
  name: string;
  fileName: string;
  length: number;
  topology?: Plasmid["topology"];
  strandedness?: Plasmid["strandedness"];
  featureSeed: number;
  features: FeatureInput[];
  description?: string;
}): Plasmid {
  const { id, name, fileName, length, topology = "circular", strandedness = "ds", featureSeed, features, description } = args;
  return {
    id,
    name,
    fileName,
    length,
    topology,
    strandedness,
    sequence: generateSequence(length, featureSeed),
    description,
    features: features.map((feature, index) => makeFeature(feature, index)),
  };
}

export const demoVectorPlasmids: Plasmid[] = [
  buildPlasmid({
    id: "demo-vector-ribo-a",
    name: "pBatchClone-RiboA",
    fileName: "pBatchClone-RiboA.gb",
    length: 7280,
    featureSeed: 1,
    description: "Synthetic demo vector with ribozyme-flanked replacement window for batch cloning.",
    features: [
      { name: "ColE1 ori", type: "origin", start: 110, end: 882, strand: 1, color: "#0369a1" },
      { name: "AmpR", type: "CDS", start: 1180, end: 2038, strand: 1, color: "#15803d" },
      { name: "lac promoter", type: "promoter", start: 2240, end: 2368, strand: 1, color: "#c2410c" },
      { name: "Hammerhead ribozyme", type: "misc_feature", start: 2920, end: 3006, strand: 1, color: "#ea580c" },
      { name: "Screening barcode", type: "misc_feature", start: 3050, end: 3132, strand: 1, color: "#4f46e5" },
      { name: "Placeholder cargo", type: "misc_feature", start: 3138, end: 3544, strand: 1, color: "#0f766e" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3600, end: 3718, strand: 1, color: "#7c3aed" },
      { name: "BGH polyA", type: "terminator", start: 3840, end: 4052, strand: 1, color: "#7c3aed" },
    ],
  }),
  buildPlasmid({
    id: "demo-vector-ribo-b",
    name: "pBatchClone-RiboB",
    fileName: "pBatchClone-RiboB.gb",
    length: 7540,
    featureSeed: 3,
    description: "Alternative synthetic demo vector with the same junction logic and different backbone context.",
    features: [
      { name: "p15A ori", type: "origin", start: 180, end: 980, strand: 1, color: "#0369a1" },
      { name: "KanR", type: "CDS", start: 1280, end: 2074, strand: 1, color: "#15803d" },
      { name: "Tet promoter", type: "promoter", start: 2420, end: 2554, strand: 1, color: "#c2410c" },
      { name: "Hammerhead ribozyme", type: "misc_feature", start: 3088, end: 3172, strand: 1, color: "#ea580c" },
      { name: "Assembly window", type: "misc_feature", start: 3196, end: 3658, strand: 1, color: "#0f766e" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3726, end: 3842, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3950, end: 4176, strand: 1, color: "#7c3aed" },
    ],
  }),
];

export const demoDonorPlasmids: Plasmid[] = [
  buildPlasmid({
    id: "demo-donor-alpha",
    name: "pDemo-Insert-Alpha",
    fileName: "pDemo-Insert-Alpha.gb",
    length: 4680,
    featureSeed: 2,
    description: "Synthetic donor carrying Alpha payload between T7 and HDV.",
    features: [
      { name: "pUC ori", type: "origin", start: 120, end: 888, strand: 1, color: "#0369a1" },
      { name: "SpecR", type: "CDS", start: 1110, end: 1902, strand: 1, color: "#15803d" },
      { name: "T7 promoter", type: "promoter", start: 2140, end: 2188, strand: 1, color: "#c2410c" },
      { name: "Kozak leader", type: "misc_feature", start: 2198, end: 2236, strand: 1, color: "#4f46e5" },
      { name: "Alpha cargo", type: "CDS", start: 2240, end: 3218, strand: 1, color: "#0f766e" },
      { name: "3xFLAG", type: "misc_feature", start: 3224, end: 3295, strand: 1, color: "#4338ca" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3330, end: 3448, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3490, end: 3722, strand: 1, color: "#7c3aed" },
    ],
  }),
  buildPlasmid({
    id: "demo-donor-beta",
    name: "pDemo-Insert-Beta",
    fileName: "pDemo-Insert-Beta.gb",
    length: 4820,
    featureSeed: 4,
    description: "Synthetic donor carrying Beta payload between shared batch features.",
    features: [
      { name: "pUC ori", type: "origin", start: 120, end: 888, strand: 1, color: "#0369a1" },
      { name: "SpecR", type: "CDS", start: 1110, end: 1902, strand: 1, color: "#15803d" },
      { name: "T7 promoter", type: "promoter", start: 2140, end: 2188, strand: 1, color: "#c2410c" },
      { name: "Kozak leader", type: "misc_feature", start: 2198, end: 2236, strand: 1, color: "#4f46e5" },
      { name: "Beta cargo", type: "CDS", start: 2240, end: 3384, strand: 1, color: "#0f766e" },
      { name: "TwinStrep", type: "misc_feature", start: 3390, end: 3467, strand: 1, color: "#4338ca" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3502, end: 3620, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3660, end: 3892, strand: 1, color: "#7c3aed" },
    ],
  }),
  buildPlasmid({
    id: "demo-donor-gamma",
    name: "pDemo-Insert-Gamma",
    fileName: "pDemo-Insert-Gamma.gb",
    length: 4550,
    featureSeed: 0,
    description: "Synthetic donor carrying Gamma payload between shared batch boundaries.",
    features: [
      { name: "pUC ori", type: "origin", start: 120, end: 888, strand: 1, color: "#0369a1" },
      { name: "SpecR", type: "CDS", start: 1110, end: 1902, strand: 1, color: "#15803d" },
      { name: "T7 promoter", type: "promoter", start: 2140, end: 2188, strand: 1, color: "#c2410c" },
      { name: "Kozak leader", type: "misc_feature", start: 2198, end: 2236, strand: 1, color: "#4f46e5" },
      { name: "Gamma cargo", type: "CDS", start: 2240, end: 3090, strand: 1, color: "#0f766e" },
      { name: "mCherry linker", type: "misc_feature", start: 3098, end: 3196, strand: 1, color: "#be123c" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3230, end: 3348, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3388, end: 3620, strand: 1, color: "#7c3aed" },
    ],
  }),
  buildPlasmid({
    id: "demo-donor-delta",
    name: "pDemo-Insert-Delta",
    fileName: "pDemo-Insert-Delta.gb",
    length: 4980,
    featureSeed: 5,
    description: "Synthetic donor carrying Delta payload and shared flanks for batch extraction.",
    features: [
      { name: "pUC ori", type: "origin", start: 120, end: 888, strand: 1, color: "#0369a1" },
      { name: "SpecR", type: "CDS", start: 1110, end: 1902, strand: 1, color: "#15803d" },
      { name: "T7 promoter", type: "promoter", start: 2140, end: 2188, strand: 1, color: "#c2410c" },
      { name: "Kozak leader", type: "misc_feature", start: 2198, end: 2236, strand: 1, color: "#4f46e5" },
      { name: "Delta cargo", type: "CDS", start: 2240, end: 3498, strand: 1, color: "#0f766e" },
      { name: "V5 tag", type: "misc_feature", start: 3504, end: 3565, strand: 1, color: "#4338ca" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3600, end: 3718, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3758, end: 3990, strand: 1, color: "#7c3aed" },
    ],
  }),
  buildPlasmid({
    id: "demo-donor-epsilon",
    name: "pDemo-Insert-Epsilon",
    fileName: "pDemo-Insert-Epsilon.gb",
    length: 4720,
    featureSeed: 6,
    description: "Synthetic donor carrying Epsilon payload for batch primer-design demos.",
    features: [
      { name: "pUC ori", type: "origin", start: 120, end: 888, strand: 1, color: "#0369a1" },
      { name: "SpecR", type: "CDS", start: 1110, end: 1902, strand: 1, color: "#15803d" },
      { name: "T7 promoter", type: "promoter", start: 2140, end: 2188, strand: 1, color: "#c2410c" },
      { name: "Kozak leader", type: "misc_feature", start: 2198, end: 2236, strand: 1, color: "#4f46e5" },
      { name: "Epsilon cargo", type: "CDS", start: 2240, end: 3270, strand: 1, color: "#0f766e" },
      { name: "6xHis", type: "misc_feature", start: 3278, end: 3337, strand: 1, color: "#4338ca" },
      { name: "HDV ribozyme", type: "misc_feature", start: 3370, end: 3488, strand: 1, color: "#7c3aed" },
      { name: "SV40 polyA", type: "terminator", start: 3528, end: 3760, strand: 1, color: "#7c3aed" },
    ],
  }),
];

import type { ImportedPort } from "../import/types";
import type { Point, Subnet } from "./types";

/**
 * The IT-side network map: what an Nmap scan says the network looks like. Deliberately its own
 * model rather than an OtProject — an internet cloud or an inferred gateway has no Purdue zone,
 * no criticality and no security controls, and a link needs to record how it was evidenced.
 * Subnet and ImportedPort are reused as-is because both are genuinely technology-neutral.
 */

/** Device classes drawn with the standard network-map symbols. */
export type ItNodeKind =
  | "internet"
  | "firewall"
  | "router"
  | "switch"
  | "load-balancer"
  | "server"
  | "database"
  | "workstation"
  | "printer"
  | "wireless-ap"
  | "unknown";

/** Vertical bands of the map, from the outside in. */
export type ItTier = "internet" | "perimeter" | "core" | "gateway" | "host";

/**
 * How a link was established, strongest evidence first. `traceroute` is observed fact;
 * `asserted` is the operator saying so, which outranks our reasoning but is not scan output;
 * `same-subnet` is a safe structural assumption; `inferred` is our reasoning and is drawn
 * as such so nobody mistakes it for scan output.
 */
export type ItLinkEvidence = "traceroute" | "observed-flow" | "asserted" | "same-subnet" | "inferred";

export interface ItNode {
  id: string;
  kind: ItNodeKind;
  tier: ItTier;
  name: string;
  /** `synthetic` nodes were never scanned; they are drawn as ghosts and left out of inventory. */
  origin: "scanned" | "synthetic";
  ip?: string;
  hostname?: string;
  mac?: string;
  vendor?: string;
  os?: string;
  ports: ImportedPort[];
  subnetId?: string;
  position: Point;
  /** 0..1. Below 1 means some part of this node was reasoned rather than observed. */
  confidence: number;
  /** Plain-English why, shown in the inspector. */
  rationale: string;
}

export interface ItLink {
  id: string;
  source: string;
  target: string;
  evidence: ItLinkEvidence;
  label?: string;
  rttMs?: number;
  hopIndex?: number;
}

export interface ItMap {
  id: string;
  name: string;
  createdAt: string;
  nodes: ItNode[];
  links: ItLink[];
  subnets: Subnet[];
  warnings: string[];
}

export const IT_TIER_ORDER: ItTier[] = ["internet", "perimeter", "core", "gateway", "host"];

const KIND_LABELS: Record<ItNodeKind, string> = {
  internet: "Internet",
  firewall: "Firewall",
  router: "Router",
  switch: "Switch",
  "load-balancer": "Load balancer",
  server: "Server",
  database: "Database",
  workstation: "Workstation",
  printer: "Printer",
  "wireless-ap": "Wireless AP",
  unknown: "Unknown device"
};

export function itKindLabel(kind: ItNodeKind): string {
  return KIND_LABELS[kind];
}

/**
 * How a link is described wherever one is shown — the inspector, the promoted OT conduit's name,
 * its notes. An exhaustive `Record` rather than a `switch` with a default, so adding an evidence
 * value is a compile error here instead of silently reading "Inferred from addressing".
 */
const EVIDENCE_LABELS: Record<ItLinkEvidence, string> = {
  traceroute: "Traced by the scan",
  "observed-flow": "Observed traffic",
  asserted: "Drawn by the operator",
  "same-subnet": "Same subnet",
  inferred: "Inferred from addressing"
};

/** True when a link came out of a scan rather than out of the operator or our own reasoning. */
export const isScanEvidence = (evidence: ItLinkEvidence) =>
  evidence === "traceroute" || evidence === "observed-flow";

export function itEvidenceLabel(evidence: ItLinkEvidence): string {
  return EVIDENCE_LABELS[evidence];
}

/**
 * Whether an id belongs to a link rather than a node. Link ids are minted as `link:<a>-><b>` and
 * node ids as `it:<ip>` or `subnet:<cidr>`, so the two namespaces cannot collide and one selection
 * id can address either.
 */
export const isItLinkId = (id: string) => id.startsWith("link:");

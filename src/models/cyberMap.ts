import type { ImportFormat, ImportedPort, ImportedScript, ParsedImport, PortSilence } from "../import/types";
import type { ScanTime } from "../import/scanTime";
import type { ItAccessState, ItEvent, ItVantage } from "./itEngagement";
import type { ItLinkEvidence, ItNodeKind } from "./itMap";
import type {
  Asset,
  CafOverride,
  CafPrincipleId,
  Conduit,
  EngagementContext,
  Point,
  RiskTreatment,
  Subnet,
  ZoneId
} from "./types";

/**
 * The converged document: one estate, from the internet edge to Purdue Level 0.
 *
 * Alchemist has carried two models. `OtProject` is entirely authored — every asset and conduit is
 * something a person typed, so re-importing means merge-or-replace and an imported asset is
 * indistinguishable from a hand-drawn one. `ItEngagement` is the opposite: scans are the source of
 * truth and everything drawn is recomputed from them, with a thin authored layer keyed by stable
 * ids on top.
 *
 * This takes the second shape, because it is the one that survives contact with more data. Derived
 * output is disposable, so improving the synthesis improves every saved map; the authored layer is
 * a judgement nobody should lose to a re-import.
 *
 * The projected asset is deliberately a structural superset of `Asset`, and the projected
 * connection of `Conduit`. That is what lets `assessProject`, `assessSecurityLevels` and
 * `assessRisk` run over a converged estate without being rewritten.
 */

export const CYBER_MAP_SCHEMA_VERSION = 3;

export type AssetId = string;

/**
 * One import, holding its own parse.
 *
 * Generalises `ItScan`. Kept whole rather than folded into a single blob for the same reason: the
 * merge works, and that is the trap — it destroys which source said what, and provenance is the
 * thing a converged inventory is most often asked to defend.
 */
export interface ImportSource {
  id: string;
  /** Monotonic, assigned at import. Ordering is by this and never by a timestamp. */
  sequence: number;
  name: string;
  format: ImportFormat;
  /** Where it was collected from. A scan has a vantage; an inventory export does not. */
  vantage: ItVantage;
  time: ScanTime | null;
  parsed: ParsedImport;
  assetCount: number;
}

/**
 * What a person decided about an asset, over whatever the sources said.
 *
 * Every field is optional and every one wins over the derived value. Nothing here is ever computed:
 * if the projection could work it out, it does not belong in the document.
 */
export interface AssetOverride {
  name?: string;
  type?: Asset["type"];
  zone?: Asset["zone"];
  criticality?: Asset["criticality"];
  consequence?: number;
  owner?: string;
  notes?: string;
  subnetId?: string;
  lifecycleStatus?: Asset["lifecycleStatus"];
  backupStatus?: Asset["backupStatus"];
  controls?: Partial<Asset["controls"]>;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  siteArea?: string;
  criticalProcessTag?: string;
}

/**
 * What a person decided about a connection, over whatever the evidence implied.
 *
 * The symmetric twin of `AssetOverride`, and needed for the same reason. A scan shows that two
 * hosts can reach each other; it never shows the firewall rule that allowed it, whether the flow is
 * inspected, or who owns the exception. Those are the fields an assessment turns on, and before
 * this the only way to record one was to redraw the connection by hand — which threw away the
 * evidence grading that made it trustworthy in the first place.
 */
export interface ConnectionOverride {
  name?: string;
  protocol?: string;
  port?: string;
  protocolFamily?: Conduit["protocolFamily"];
  direction?: Conduit["direction"];
  control?: Conduit["control"];
  firewallRule?: Conduit["firewallRule"];
  inspected?: boolean;
  logged?: boolean;
  encrypted?: boolean;
  jumpHostRequired?: boolean;
  ruleOwner?: string;
  businessJustification?: string;
  reviewDate?: string;
  expiryDate?: string;
  temporaryAccess?: boolean;
  businessCritical?: boolean;
  notes?: string;
}

/**
 * The engagement's governance context and the assessor's standing judgements.
 *
 * Carried on the document rather than recomputed because none of it is derivable: who commissioned
 * the work, what SL-T a zone was assigned after a risk assessment, which CAF principle the assessor
 * overrode and why, and what treatment each risk was given. `OtProject` already held these, and the
 * converged document has to hold them too or the analysis suite loses half of what it reports.
 */
export interface MapGovernance {
  engagement?: EngagementContext;
  zoneTargets?: Partial<Record<ZoneId, number>>;
  cafOverrides?: Partial<Record<CafPrincipleId, CafOverride>>;
  riskTreatments?: Record<string, RiskTreatment>;
}

/** A connection a person drew, as opposed to one the evidence implies. */
export interface UserConnection {
  id: string;
  source: AssetId;
  target: AssetId;
  label?: string;
  note?: string;
  protocol?: string;
  port?: string;
  encrypted?: boolean;
  direction?: Conduit["direction"];
  firewallRule?: Conduit["firewallRule"];
}

export interface CyberMapDocument {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sources: ImportSource[];
  /** Authored metadata, keyed by the id `resolveIdentities` mints. */
  assetOverrides: Record<AssetId, AssetOverride>;
  connections: UserConnection[];
  /** Authored metadata over a *derived* connection, keyed by the id the projection mints. */
  connectionOverrides: Record<string, ConnectionOverride>;
  /** What the operator did. Access and attack edges are folded from this and never stored. */
  events: ItEvent[];
  /**
   * Dragged positions, kept per arrangement.
   *
   * One flat map was wrong, and visibly so: a position authored while looking at Purdue lanes says
   * nothing about where a device belongs in a topology diagram, and honouring it there stranded
   * every dragged device in a row above the subnet boxes that were supposed to contain them.
   * Keyed by arrangement, each one starts clean and keeps what was arranged in it.
   */
  layouts: Record<string, Record<AssetId, Point>>;
  subnetOverrides: Record<string, { name?: string; vlan?: string }>;
  governance: MapGovernance;
}

/**
 * An asset as projected: everything `Asset` carries, plus where it came from.
 *
 * Structurally an `Asset`, so the assessment engines accept it unchanged.
 */
export interface MapAsset extends Asset {
  /** `imported` is derived from sources and overridable; `authored` is owned outright. */
  provenance: "imported" | "authored";
  /** The network-map symbol a scan classified it as, when one did. */
  deviceKind?: ItNodeKind;
  /**
   * The OS a scan reported, verbatim.
   *
   * A field rather than a line in `notes`, because the operating-system overlay has to bucket it
   * and parsing it back out of prose would make the overlay depend on the wording of a comment.
   */
  os?: string;
  ports: ImportedPort[];
  /** Host-level NSE results (`-sC`). Port-level ones travel on the ports. */
  scripts?: ImportedScript[];
  /** Ports that answered nothing but were named — a device in the path is dropping traffic. */
  filteredPorts?: ImportedPort[];
  silence?: PortSilence;
  identifiers: { ips: string[]; macs: string[]; hostnames: string[] };
  /** 0..1. Below 1 means some part of this asset was reasoned rather than observed. */
  confidence: number;
  rationale: string;
  /** Which imports saw it, so a claim can be traced back to a file. */
  sourceIds: string[];
}

/** A connection as projected. Structurally a `Conduit`, plus how it came to be drawn. */
export interface MapConnection extends Conduit {
  provenance: "imported" | "authored";
  evidence: ItLinkEvidence;
}

export interface ProjectedMap {
  assets: MapAsset[];
  connections: MapConnection[];
  subnets: Subnet[];
  warnings: string[];
  /** Folded from the journal, never stored. */
  access: Map<AssetId, ItAccessState>;
}

export function newCyberMap(name = "Untitled map"): CyberMapDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: CYBER_MAP_SCHEMA_VERSION,
    id: `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    sources: [],
    assetOverrides: {},
    connections: [],
    connectionOverrides: {},
    events: [],
    layouts: {},
    subnetOverrides: {},
    governance: {}
  };
}

export function newImportSource(
  parsed: ParsedImport,
  name: string,
  sequence: number,
  vantage: ItVantage
): ImportSource {
  return {
    id: `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sequence,
    name,
    format: parsed.format,
    vantage,
    time: parsed.startedAt ?? null,
    parsed,
    assetCount: parsed.hosts.length
  };
}

/**
 * The next sequence number. Sources and events share one space so a report can interleave them,
 * and it reads the highest in use rather than counting, so removing one never reuses a number.
 */
export function nextMapSequence(doc: CyberMapDocument): number {
  return [...doc.sources, ...doc.events].reduce((top, entry) => Math.max(top, entry.sequence), 0) + 1;
}

/** The `link:` prefix is what tells a connection id from an asset id in a single selection slot. */
export function newUserConnection(source: AssetId, target: AssetId, rest: Partial<UserConnection> = {}): UserConnection {
  return { id: `link:user:${source}->${target}`, source, target, ...rest };
}

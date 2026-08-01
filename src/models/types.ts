export const PROJECT_SCHEMA_VERSION = 2;

export type ZoneId =
  | "level5"
  | "level4"
  | "level3"
  | "level2"
  | "level1"
  | "level0";

export type AssetTypeId =
  | "enterprise-it"
  | "firewall"
  | "jump-host"
  | "historian"
  | "engineering-workstation"
  | "hmi"
  | "scada"
  | "plc-rtu"
  | "safety-system"
  | "field-device"
  | "wireless-gateway"
  | "vendor-remote"
  | "cloud-service";

export type Criticality = "low" | "medium" | "high" | "critical";

export type LifecycleStatus = "supported" | "limited" | "obsolete" | "unknown";

export type BackupStatus = "verified" | "configured" | "missing" | "unknown";

export type ConduitDirection = "source-to-target" | "target-to-source" | "bidirectional";

export type FirewallRule = "explicit" | "any-any" | "unknown";

export type ConduitControl = "routed" | "firewalled" | "jump-host" | "data-diode";

export type ProtocolFamilyId =
  | "auto"
  | "https-tls"
  | "http"
  | "modbus"
  | "opc"
  | "dnp3"
  | "ethernet-ip"
  | "profinet"
  | "s7"
  | "rdp"
  | "ssh"
  | "smb"
  | "dns-ntp"
  | "mqtt"
  | "vpn"
  | "unknown"
  | "other";

export type CanvasMode = "clean" | "protocol" | "risk" | "boundary" | "reachability";

/**
 * How the topology is laid out on the canvas. "network" is a free-form layout
 * grouped by subnet (the default authoring view); "purdue" projects the same
 * assets into Purdue-level lanes by their `zone`. The model is identical in both
 * — Purdue is a view, not a separate layout.
 */
export type LayoutMode = "network" | "purdue";

export type ScoreCategory =
  | "segmentation"
  | "remoteAccess"
  | "identity"
  | "monitoring"
  | "resilience"
  | "legacyExposure"
  | "safetyImpact"
  | "documentation";

export type Severity = "critical" | "high" | "medium" | "low";

export interface ZoneDefinition {
  id: ZoneId;
  name: string;
  shortName: string;
  levelLabel: string;
  riskRank: number;
  description: string;
  color: string;
}

export interface AssetTypeDefinition {
  id: AssetTypeId;
  label: string;
  defaultZone: ZoneId;
  icon: string;
  description: string;
  baseProtocols: string[];
}

export interface SecurityControls {
  mfa: boolean;
  allowListing: boolean;
  endpointProtection: boolean;
  patchingProgram: boolean;
  backups: boolean;
  defaultCredentialsDisabled: boolean;
  networkMonitoring: boolean;
  centralLogging: boolean;
  remoteAccessApproved: boolean;
  safetyValidated: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A logical network segment (L2/L3). Orthogonal to the Purdue `zone`: a subnet
 * typically maps to one zone but the two are independent attributes. Assets are
 * grouped into a labelled container per subnet in the network layout.
 */
export interface Subnet {
  id: string;
  name: string;
  cidr: string;
  vlan: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetTypeId;
  zone: ZoneId;
  subnetId?: string;
  ipAddress: string;
  vlan: string;
  protocols: string[];
  criticality: Criticality;
  consequence?: number;
  owner: string;
  notes: string;
  position: Point;
  controls: SecurityControls;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  lifecycleStatus: LifecycleStatus;
  siteArea: string;
  patchWindow: string;
  backupStatus: BackupStatus;
  criticalProcessTag: string;
}

export interface Conduit {
  id: string;
  source: string;
  target: string;
  name: string;
  protocol: string;
  port: string;
  protocolFamily: ProtocolFamilyId;
  direction: ConduitDirection;
  control: ConduitControl;
  firewallRule: FirewallRule;
  trustBoundary: boolean;
  inspected: boolean;
  logged: boolean;
  encrypted: boolean;
  jumpHostRequired: boolean;
  ruleOwner: string;
  businessJustification: string;
  reviewDate: string;
  expiryDate: string;
  monitoringSource: string;
  inspectionPoint: string;
  temporaryAccess: boolean;
  businessCritical: boolean;
  notes: string;
}

export interface ProjectAssumption {
  id: string;
  label: string;
}

// --- GRC: NCSC CAF compliance, governance context, and risk treatment ---

export type CafObjectiveId = "A" | "B" | "C" | "D";

export type CafPrincipleId =
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "C1"
  | "C2"
  | "D1"
  | "D2";

export type CafStatus = "achieved" | "partial" | "not-achieved" | "not-assessed";

/** Consultant's authoritative status for a CAF principle — overrides the derived status. */
export interface CafOverride {
  status: CafStatus;
  note?: string;
}

/** Engagement / governance context that frames a consultancy assessment and report. */
export interface EngagementContext {
  organisation: string;
  sector: string;
  regime: string;
  assessor: string;
  assessmentDate: string;
  scope: string;
  limitations: string;
}

export type RiskTreatmentDecision = "mitigate" | "accept" | "transfer" | "avoid";

export interface RiskTreatment {
  decision: RiskTreatmentDecision;
  owner: string;
  targetDate: string;
  notes: string;
  /** Residual risk score (1–25) after treatment, set by the assessor. */
  residual?: number;
}

export interface OtProject {
  schemaVersion: number;
  id: string;
  name: string;
  updatedAt: string;
  assets: Asset[];
  conduits: Conduit[];
  subnets?: Subnet[];
  assumptions: ProjectAssumption[];
  zoneTargets?: Partial<Record<ZoneId, number>>;
  engagement?: EngagementContext;
  cafOverrides?: Partial<Record<CafPrincipleId, CafOverride>>;
  riskTreatments?: Record<string, RiskTreatment>;
}

export interface PathRisk {
  severity: Severity;
  title: string;
  detail: string;
  conduitId?: string;
  assetId?: string;
}

export interface ReachabilityResult {
  sourceId: string;
  targetId: string;
  reachable: boolean;
  pathAssetIds: string[];
  pathConduitIds: string[];
  risks: PathRisk[];
  explanation: string;
}

export interface Finding {
  id: string;
  category: ScoreCategory;
  severity: Severity;
  title: string;
  detail: string;
  remediation: string;
  affectedAssetIds: string[];
  affectedConduitIds: string[];
  references: string[];
  techniques?: string[];
}

export interface CategoryScore {
  category: ScoreCategory;
  label: string;
  score: number;
  summary: string;
}

/**
 * How much of an architecture the project actually declares. Below the threshold there is nothing
 * to rate: with no conduits, segmentation — the heaviest category — is undefined, and every
 * `Array.every` control check passes vacuously.
 */
export interface AssessmentCoverage {
  assets: number;
  conduits: number;
  zonesModelled: number;
  sufficient: boolean;
}

export interface SecurityAssessment {
  overallScore: number;
  /** `insufficient` means the model is too sparse to rate, not that it scored badly. */
  band: "strong" | "fair" | "weak" | "critical" | "insufficient";
  categoryScores: CategoryScore[];
  findings: Finding[];
  coverage: AssessmentCoverage;
}

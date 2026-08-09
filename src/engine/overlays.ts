import { getAssetType, zones } from "../data/catalog";
import { assessSecurityLevels } from "./securityLevels";
import { exposureFromUntrusted } from "./reachability";
import { assessProject } from "./scoring";
import type { MapAsset, MapConnection, ProjectedMap } from "../models/cyberMap";
import type { Finding, OtProject, SecurityAssessment, Severity } from "../models/types";
import { movementFrom, type MovementView } from "./movement";
import type { ItEvent } from "../models/itEngagement";
import type { SecurityLevelAssessment } from "./securityLevels";

/**
 * The overlay registry: what recolours the one canvas, instead of switching to another view.
 *
 * Alchemist had two mode unions — `CanvasMode` for the OT canvas, `ItCanvasMode` for the IT one —
 * and each was a closed set of strings that a `switch` somewhere else turned into colours, with the
 * legend written out by hand beside it. Every mode was three edits in three files, and the legend
 * could say something the canvas did not do. Here an overlay owns its buckets *as data* and
 * `bucketFor` can only return one of them, so the legend is the bucket list and the two cannot
 * disagree by construction.
 *
 * ## Encoding, not palette
 *
 * The brand is monochrome and `--signal` is the one colour, reserved for danger. Nine overlays over
 * that is a real tension, and the resolution is that hue is not the channel:
 *
 * - **Ordinal** overlays (level, criticality, severity, exposure) use a single-hue ink ramp. Only
 *   the top band of an overlay that actually means danger takes `--signal` — a ramp with a red top
 *   on "operating system" would be asserting that one OS is dangerous.
 * - **Categorical** overlays (OS, asset class) use a repeatable pattern with a legend, never hue
 *   alone. Colour-only encoding is on the accessibility backlog for the rest of the app; adding
 *   nine more of it here would be adding to the debt while claiming to pay it.
 *
 * Ordinal weight is `0..1`, and the consumer decides what ink that is. Nothing here knows about CSS.
 */

export type OverlayId =
  | "purdue"
  | "criticality"
  | "vulnerability"
  | "exposure"
  | "boundary"
  | "attack"
  | "sl62443"
  | "os"
  | "assetClass"
  | "movement";

/**
 * How a categorical bucket is drawn. Repeatable fills rather than hues, so a reader who cannot
 * separate two colours can still separate two buckets.
 */
export type OverlayPattern = "solid" | "hatch" | "cross-hatch" | "dots" | "grid" | "outline";

export interface OverlayBucket {
  id: string;
  label: string;
  /** Where on the ink ramp, 0 (faintest) to 1 (strongest). Categorical buckets sit at 0. */
  weight: number;
  /** The one red band. Only ever set on an overlay whose top band genuinely means danger. */
  signal: boolean;
  /** Set on categorical buckets only; ordinal buckets encode with weight. */
  pattern?: OverlayPattern;
}

export interface OverlayContext {
  map: ProjectedMap;
  /** What the selected foothold reaches. Empty until an operator picks one. */
  movement: MovementView;
  project: OtProject;
  assessment: SecurityAssessment;
  securityLevels: SecurityLevelAssessment;
  /** 2 = reachable from untrusted without a broker, 1 = only through one, 0 = not reachable. */
  exposure: Map<string, 0 | 1 | 2>;
  findingsByAsset: Map<string, Finding[]>;
}

export interface Overlay {
  id: OverlayId;
  label: string;
  /** What the overlay is answering. Shown on the control, so it is a question, not a restatement. */
  description: string;
  appliesTo: "asset" | "connection" | "both";
  /**
   * The buckets, faintest first. This *is* the legend — there is no second list to keep in step,
   * which is the whole reason the registry exists.
   */
  buckets: OverlayBucket[];
  bucketFor(subject: MapAsset | MapConnection, context: OverlayContext): OverlayBucket | null;
}

/**
 * Builds an ordinal ramp: evenly spaced weights, faintest first.
 *
 * `signalTop` is opt-in per overlay rather than automatic. An ordinal overlay is not necessarily a
 * severity — Purdue level and OS are ordered and neither has a dangerous end — and a red top band
 * on one of those would be the canvas asserting a judgement the data does not contain.
 */
function ramp(entries: Array<[string, string]>, signalTop = false): OverlayBucket[] {
  return entries.map(([id, label], index) => ({
    id,
    label,
    // A single-entry ramp would divide by zero; it also has no gradient to express, so it sits full.
    weight: entries.length === 1 ? 1 : index / (entries.length - 1),
    signal: signalTop && index === entries.length - 1
  }));
}

function categories(entries: Array<[string, string, OverlayPattern]>): OverlayBucket[] {
  return entries.map(([id, label, pattern]) => ({ id, label, weight: 0, signal: false, pattern }));
}

const byId = (buckets: OverlayBucket[], id: string): OverlayBucket | null =>
  buckets.find((bucket) => bucket.id === id) ?? null;

const isAsset = (subject: MapAsset | MapConnection): subject is MapAsset => "zone" in subject;
const isConnection = (subject: MapAsset | MapConnection): subject is MapConnection => "source" in subject;

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];

/** The worst severity among the findings that name this asset, or null when none do. */
function worstSeverity(assetId: string, context: OverlayContext): Severity | null {
  const found = context.findingsByAsset.get(assetId) ?? [];
  return found.reduce<Severity | null>((worst, finding) => {
    if (!worst || SEVERITY_ORDER.indexOf(finding.severity) > SEVERITY_ORDER.indexOf(worst)) {
      return finding.severity;
    }
    return worst;
  }, null);
}

/**
 * Coarse OS families.
 *
 * Deliberately coarse: a scan reports "Microsoft Windows Server 2012 R2" and "Windows 7", and an
 * overlay with a bucket per build string is a legend nobody can read. Version detail belongs in the
 * inspector, where it can be read as text.
 */
function osFamily(os: string | undefined): string {
  const text = (os ?? "").toLowerCase();
  if (!text) {
    return "unknown";
  }
  if (text.includes("windows")) {
    return "windows";
  }
  if (text.includes("linux") || text.includes("unix") || text.includes("bsd")) {
    return "unix";
  }
  if (text.includes("ios") || text.includes("junos") || text.includes("router") || text.includes("switch")) {
    return "network";
  }
  return "other";
}

/** Asset classes grouped into families, because thirteen patterns is not a legend anyone reads. */
const ASSET_FAMILY: Record<string, string> = {
  "enterprise-it": "computing",
  "jump-host": "computing",
  historian: "computing",
  "engineering-workstation": "computing",
  hmi: "supervisory",
  scada: "supervisory",
  "plc-rtu": "control",
  "safety-system": "control",
  "field-device": "field",
  firewall: "network",
  "wireless-gateway": "network",
  "vendor-remote": "external",
  "cloud-service": "external"
};

export const overlays: Overlay[] = [
  {
    id: "purdue",
    label: "Purdue level",
    description: "How far out from the process each asset sits",
    appliesTo: "asset",
    // Restates the lane on purpose: it is the reference overlay, the one that teaches a reader that
    // a darker card means further out before they trust the ramp on anything less obvious.
    buckets: ramp(
      [...zones].reverse().map((zone) => [zone.id, zone.name] as [string, string])
    ),
    bucketFor(subject) {
      return isAsset(subject) ? byId(this.buckets, subject.zone) : null;
    }
  },
  {
    id: "criticality",
    label: "Asset criticality",
    description: "What it would cost to lose each asset",
    appliesTo: "asset",
    buckets: ramp(
      [
        ["low", "Low"],
        ["medium", "Medium"],
        ["high", "High"],
        ["critical", "Critical"]
      ],
      true
    ),
    bucketFor(subject) {
      return isAsset(subject) ? byId(this.buckets, subject.criticality) : null;
    }
  },
  {
    id: "vulnerability",
    label: "Vulnerability severity",
    description: "The worst finding naming each asset",
    appliesTo: "asset",
    buckets: ramp(
      [
        ["none", "No finding"],
        ["low", "Low"],
        ["medium", "Medium"],
        ["high", "High"],
        ["critical", "Critical"]
      ],
      true
    ),
    bucketFor(subject, context) {
      if (!isAsset(subject)) {
        return null;
      }
      // "No finding" is its own faintest band rather than an absent bucket: an asset nothing has
      // been said about must not disappear from an overlay whose subject is what is wrong.
      return byId(this.buckets, worstSeverity(subject.id, context) ?? "none");
    }
  },
  {
    id: "exposure",
    label: "Internet exposure",
    description: "What an untrusted starting point can reach",
    appliesTo: "asset",
    buckets: ramp(
      [
        ["none", "Not reachable"],
        ["brokered", "Only through a broker"],
        ["direct", "Reachable without a broker"]
      ],
      true
    ),
    bucketFor(subject, context) {
      if (!isAsset(subject)) {
        return null;
      }
      const exposure = context.exposure.get(subject.id) ?? 0;
      return byId(this.buckets, exposure === 2 ? "direct" : exposure === 1 ? "brokered" : "none");
    }
  },
  {
    id: "boundary",
    label: "Firewall boundaries",
    description: "Which crossings have a rule anyone can point to",
    appliesTo: "connection",
    buckets: ramp(
      [
        ["internal", "Stays inside a zone"],
        ["explicit", "Crosses, rule documented"],
        ["unknown", "Crosses, rule unknown"],
        ["any-any", "Crosses, any-any"]
      ],
      true
    ),
    bucketFor(subject) {
      if (!isConnection(subject)) {
        return null;
      }
      if (!subject.trustBoundary) {
        return byId(this.buckets, "internal");
      }
      return byId(this.buckets, subject.firewallRule === "explicit" ? "explicit" : subject.firewallRule);
    }
  },
  {
    id: "attack",
    label: "ATT&CK coverage",
    description: "How many ATT&CK for ICS techniques the findings implicate",
    appliesTo: "asset",
    // No signal band. A technique count is coverage of the model, not a measure of danger, and
    // painting the best-understood assets red would invert what the overlay is for.
    buckets: ramp([
      ["none", "No technique mapped"],
      ["some", "1-2 techniques"],
      ["many", "3 or more techniques"]
    ]),
    bucketFor(subject, context) {
      if (!isAsset(subject)) {
        return null;
      }
      const techniques = new Set(
        (context.findingsByAsset.get(subject.id) ?? []).flatMap((finding) => finding.techniques ?? [])
      );
      return byId(this.buckets, techniques.size === 0 ? "none" : techniques.size < 3 ? "some" : "many");
    }
  },
  {
    id: "sl62443",
    label: "62443 zones",
    description: "Where each zone's architecture signal sits against its target",
    appliesTo: "asset",
    buckets: ramp(
      [
        ["met", "Signal meets target"],
        ["short", "One level short"],
        ["far", "Two or more short"],
        ["unmodelled", "Zone not modelled"]
      ],
      true
    ),
    bucketFor(subject, context) {
      if (!isAsset(subject)) {
        return null;
      }
      const zone = context.securityLevels.zones.find((entry) => entry.zone === subject.zone);
      // The internet is not a zone of the system under consideration, so it has no signal at all —
      // and no bucket, rather than a flattering one.
      if (!zone) {
        return null;
      }
      if (!zone.modelled) {
        return byId(this.buckets, "unmodelled");
      }
      const gap = zone.target - zone.achieved;
      return byId(this.buckets, gap <= 0 ? "met" : gap === 1 ? "short" : "far");
    }
  },
  {
    id: "os",
    label: "Operating system",
    description: "What each asset runs, where a scan could tell",
    appliesTo: "asset",
    buckets: categories([
      ["windows", "Windows", "hatch"],
      ["unix", "Linux / Unix", "cross-hatch"],
      ["network", "Network OS", "grid"],
      ["other", "Other", "dots"],
      ["unknown", "Not identified", "outline"]
    ]),
    bucketFor(subject) {
      return isAsset(subject) ? byId(this.buckets, osFamily(subject.os)) : null;
    }
  },
  {
    id: "movement",
    label: "Movement from here",
    description: "What the selected asset can reach",
    appliesTo: "asset",
    // No signal band. Distance from a foothold is not danger, and painting the next hop red would
    // be the map telling an operator where to go.
    buckets: ramp([
      ["unreachable", "Not reachable from here"],
      ["far", "3 or more hops"],
      ["near", "2 hops"],
      ["adjacent", "Adjacent"],
      ["foothold", "Where you are"]
    ]),
    bucketFor(subject, context) {
      if (!isAsset(subject) || !context.movement.fromId) {
        return null;
      }
      if (subject.id === context.movement.fromId) {
        return byId(this.buckets, "foothold");
      }
      const hop = context.movement.hops.find((entry) => entry.assetId === subject.id);
      if (!hop) {
        return byId(this.buckets, "unreachable");
      }
      return byId(this.buckets, hop.distance === 1 ? "adjacent" : hop.distance === 2 ? "near" : "far");
    }
  },
  {
    id: "assetClass",
    label: "Asset type",
    description: "What each asset does",
    appliesTo: "asset",
    buckets: categories([
      ["network", "Network", "grid"],
      ["computing", "Computing", "hatch"],
      ["supervisory", "Supervisory", "cross-hatch"],
      ["control", "Control", "solid"],
      ["field", "Field", "dots"],
      ["external", "External", "outline"]
    ]),
    bucketFor(subject) {
      if (!isAsset(subject)) {
        return null;
      }
      return byId(this.buckets, ASSET_FAMILY[getAssetType(subject.type).id] ?? "computing");
    }
  }
];

export function getOverlay(id: OverlayId): Overlay {
  const overlay = overlays.find((entry) => entry.id === id);
  if (!overlay) {
    throw new Error(`unknown overlay: ${id}`);
  }
  return overlay;
}

/**
 * Everything the overlays need, computed once.
 *
 * Built here rather than per overlay because three of them want assessment output and two want a
 * graph walk, and recomputing those per overlay switch would put a full `assessProject` on the
 * click. The whole context is derived, so it is rebuilt whenever the map is and cached nowhere.
 */
export function buildOverlayContext(
  map: ProjectedMap,
  project: OtProject,
  /** The asset the operator is working from, if they have named one. */
  footholdId: string | null = null,
  events: ItEvent[] = []
): OverlayContext {
  const assessment = assessProject(project);
  const findingsByAsset = new Map<string, Finding[]>();
  for (const finding of assessment.findings) {
    for (const assetId of finding.affectedAssetIds) {
      findingsByAsset.set(assetId, [...(findingsByAsset.get(assetId) ?? []), finding]);
    }
  }

  return {
    map,
    movement: movementFrom(map, footholdId, events),
    project,
    assessment,
    securityLevels: assessSecurityLevels(project, project.zoneTargets),
    exposure: exposureFromUntrusted(project),
    findingsByAsset
  };
}

/**
 * A bucket per subject, for the overlays that apply to it.
 *
 * `null` means the overlay has nothing to say about this subject — a connection under an
 * asset-only overlay, or the internet under a 62443 one — and the consumer should draw it plain
 * rather than reaching for a default bucket, which would be inventing a claim.
 */
export function bucketsFor(
  overlay: Overlay,
  subjects: Array<MapAsset | MapConnection>,
  context: OverlayContext
): Map<string, OverlayBucket> {
  const result = new Map<string, OverlayBucket>();
  for (const subject of subjects) {
    const bucket = overlay.bucketFor(subject, context);
    if (bucket) {
      result.set(subject.id, bucket);
    }
  }
  return result;
}

import { getAssetType, getZone } from "../data/catalog";
import { cvesFromScripts } from "../import/nse";
import { itKindLabel } from "../models/itMap";
import { inCidr, parseCidr } from "./ipv4";
import type { AssetId, MapAsset, ProjectedMap } from "../models/cyberMap";
import type { ItAccessState } from "../models/itEngagement";
import type { Subnet } from "../models/types";

/**
 * Asking the map a question.
 *
 * The estate is assembled from Nmap output, and the questions somebody puts to Nmap output are
 * always the same shape: who has 445 open, what is running an old OpenSSH, what is in the
 * management VLAN, what do I already own. Until now the only filter was a substring over four
 * fields, which can answer none of them — the data was all there and none of it was reachable.
 *
 * Built like `overlays.ts`, and for the same reason: `QUERY_FIELDS` is simultaneously the parser's
 * field table and the help text the sidebar renders, so the two cannot drift apart. A field added
 * here is documented by existing.
 */

export type QueryFieldId =
  | "port"
  | "service"
  | "product"
  | "os"
  | "cidr"
  | "access"
  | "cve"
  | "kind"
  | "evidence";

/** How a term's value is compared with what the asset says. */
export type QueryMatchMode = "numeric" | "substring" | "exact" | "cidr";

export interface QueryContext {
  subnets: Subnet[];
  access: Map<AssetId, ItAccessState>;
}

export interface QueryFieldSpec {
  id: QueryFieldId;
  /** What is typed before the colon. The first is canonical; the rest are accepted aliases. */
  prefixes: string[];
  mode: QueryMatchMode;
  /** One line for the help block. */
  hint: string;
  example: string;
  /**
   * Everything on this asset the field can be compared against, lowercased.
   *
   * An empty list means the asset has nothing to say — which under negation is a *match*.
   */
  valuesOf(asset: MapAsset, context: QueryContext): string[];
}

/**
 * How well attested an asset is.
 *
 * `evidence` on a *connection* means who observed it. An asset has no such field: what it carries
 * is where it came from and how much of it was reasoned. Somebody typing `evidence:inferred` is
 * asking which of these the scan did not actually see, and that is the honest answer to give them.
 */
function attestationOf(asset: MapAsset): string[] {
  if (asset.provenance === "authored") {
    return ["authored", "mine", "yours"];
  }
  return asset.confidence < 1 ? ["inferred", "guessed"] : ["scanned", "observed"];
}

const lower = (values: Array<string | number | undefined>): string[] =>
  values.filter((value) => value !== undefined && value !== "").map((value) => String(value).toLowerCase());

export const QUERY_FIELDS: QueryFieldSpec[] = [
  {
    id: "port",
    prefixes: ["port"],
    mode: "numeric",
    // Not `filteredPorts`. The model is explicit that `ports` means "this host is running this" and
    // a filtered port is the opposite claim; folding them together would turn a segmentation
    // finding into an exposed service.
    hint: "An open port. Ranges and lists work.",
    example: "port:445,3389",
    valuesOf: (asset) => asset.ports.map((port) => String(port.port))
  },
  {
    id: "service",
    prefixes: ["service", "svc"],
    mode: "substring",
    hint: "What answered on a port.",
    example: "service:smb",
    valuesOf: (asset) => lower(asset.ports.map((port) => port.service))
  },
  {
    id: "product",
    prefixes: ["product", "version", "ver"],
    mode: "substring",
    hint: "The version banner Nmap read.",
    example: 'product:"openssh 8."',
    valuesOf: (asset) => lower(asset.ports.map((port) => port.product))
  },
  {
    id: "os",
    prefixes: ["os"],
    mode: "substring",
    // The verbatim string, not the overlay's family bucket: the overlay groups for a legend, and
    // somebody searching wants to find "Server 2012 R2" by typing part of it.
    hint: "The operating system a scan reported.",
    example: "os:windows",
    valuesOf: (asset) => lower([asset.os])
  },
  {
    id: "cidr",
    prefixes: ["cidr", "subnet", "net"],
    mode: "cidr",
    hint: "A range, by real mask. Also matches a segment by name or VLAN.",
    example: "cidr:10.10.2.0/24",
    valuesOf: (asset, context) => {
      const subnet = context.subnets.find((entry) => entry.id === asset.subnetId);
      return lower([...asset.identifiers.ips, asset.ipAddress, subnet?.cidr, subnet?.name, subnet?.vlan]);
    }
  },
  {
    id: "access",
    prefixes: ["access"],
    mode: "exact",
    hint: "What you hold on it. `any` means anything above none.",
    example: "access:admin",
    valuesOf: (asset, context) => {
      const state = context.access.get(asset.id) ?? "none";
      return state === "none" ? ["none"] : [state, "any"];
    }
  },
  {
    id: "cve",
    prefixes: ["cve"],
    mode: "substring",
    hint: "An identifier an NSE script named.",
    example: "cve:2017",
    valuesOf: (asset) =>
      lower(cvesFromScripts([...(asset.scripts ?? []), ...asset.ports.flatMap((port) => port.scripts ?? [])]))
  },
  {
    id: "kind",
    prefixes: ["kind", "device"],
    mode: "substring",
    hint: "The symbol it is drawn as.",
    example: "kind:firewall",
    valuesOf: (asset) => lower([asset.deviceKind, asset.deviceKind ? itKindLabel(asset.deviceKind) : undefined])
  },
  {
    id: "evidence",
    prefixes: ["evidence", "seen"],
    mode: "substring",
    hint: "How well attested it is: scanned, inferred or authored.",
    example: "evidence:inferred",
    valuesOf: (asset) => attestationOf(asset)
  }
];

const FIELD_BY_PREFIX = new Map<string, QueryFieldSpec>(
  QUERY_FIELDS.flatMap((field) => field.prefixes.map((prefix) => [prefix, field] as const))
);

export interface QueryTerm {
  /** Null for a bare word: a substring over everything a reader might recognise the asset by. */
  field: QueryFieldId | null;
  /** Alternatives within one term. OR inside a term, AND between terms. */
  values: string[];
  negated: boolean;
}

export interface ParsedQuery {
  terms: QueryTerm[];
  /** Prefixes that looked like a field and are not one. Never an error — see the sidebar. */
  unknownFields: string[];
  empty: boolean;
}

/** Splits on whitespace but keeps a quoted phrase whole, so `product:"OpenSSH 8.9"` survives. */
function tokenise(input: string): string[] {
  return input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
}

const unquote = (value: string) => value.replace(/"/g, "").trim();

export function parseQuery(input: string): ParsedQuery {
  const terms: QueryTerm[] = [];
  const unknownFields: string[] = [];

  for (const token of tokenise(input)) {
    const negated = token.startsWith("-") && token.length > 1;
    const body = negated ? token.slice(1) : token;
    const scoped = body.match(/^([A-Za-z]+):(.*)$/s);
    const field = scoped ? FIELD_BY_PREFIX.get(scoped[1].toLowerCase()) : undefined;

    if (scoped && !field) {
      // Reported, but still searched as text. `10.0.0.1:445` and `http://example` are not typos,
      // and refusing them would make the box feel like it was arguing with the operator.
      unknownFields.push(scoped[1]);
    }

    const raw = field ? scoped![2] : body;
    const values = unquote(raw)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    // A field with nothing after it is somebody mid-keystroke, not a query for the empty string.
    if (values.length === 0) {
      continue;
    }
    terms.push({ field: field?.id ?? null, values, negated });
  }

  return { terms, unknownFields, empty: terms.length === 0 };
}

/** Everything a reader might recognise an asset by, for a term with no field on it. */
function bareValues(asset: MapAsset): string[] {
  return lower([
    asset.name,
    asset.ipAddress,
    getAssetType(asset.type).label,
    getZone(asset.zone).name,
    asset.manufacturer,
    ...asset.identifiers.hostnames,
    ...asset.identifiers.macs
  ]);
}

/** `445`, `445,3389`, `1-1024`. A range is the reason this is not just an exact string compare. */
function numericMatch(values: string[], term: string): boolean {
  const range = term.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return values.some((value) => {
      const port = Number(value);
      return port >= Math.min(from, to) && port <= Math.max(from, to);
    });
  }
  return values.includes(term);
}

function matchesValue(mode: QueryMatchMode, values: string[], term: string): boolean {
  switch (mode) {
    case "numeric":
      return numericMatch(values, term);
    case "exact":
      return values.includes(term);
    case "cidr": {
      const cidr = parseCidr(term);
      // Not an address at all — `cidr:management` is somebody naming a segment, so fall back to
      // matching the segment's own name and VLAN, which `valuesOf` put in the same list.
      return cidr
        ? values.some((value) => inCidr(value, cidr))
        : values.some((value) => value.includes(term));
    }
    default:
      return values.some((value) => value.includes(term));
  }
}

/**
 * `cve:` sweeps the full text of every script on the host, so the values are cached per asset.
 *
 * A `WeakMap` is sound here because `projectMap` is memoised on the document: the `MapAsset` objects
 * are referentially stable between keystrokes, which is the same property the canvas's node cache
 * already depends on. This is what lets the box run on every keystroke without a debounce — and a
 * debounce would be worse than the cost, because results that lag the caret feel broken.
 */
const valueCache = new WeakMap<MapAsset, Map<QueryFieldId | "bare", string[]>>();

function valuesFor(asset: MapAsset, field: QueryFieldId | null, context: QueryContext): string[] {
  const key = field ?? "bare";
  let cached = valueCache.get(asset);
  if (!cached) {
    cached = new Map();
    valueCache.set(asset, cached);
  }
  const hit = cached.get(key);
  if (hit) {
    return hit;
  }
  const computed = field
    ? QUERY_FIELDS.find((spec) => spec.id === field)!.valuesOf(asset, context)
    : bareValues(asset);
  cached.set(key, computed);
  return computed;
}

export function matchesQuery(asset: MapAsset, query: ParsedQuery, context: QueryContext): boolean {
  return query.terms.every((term) => {
    const spec = term.field ? QUERY_FIELDS.find((field) => field.id === term.field) : undefined;
    const values = valuesFor(asset, term.field, context);
    // OR within the term, so `port:445,3389` is one question rather than two.
    const hit = term.values.some((value) => matchesValue(spec?.mode ?? "substring", values, value));
    // An asset with nothing to say about a field matches its negation: `-port:445` has to include
    // the hosts with no open ports at all, or the query silently loses half the estate.
    return term.negated ? !hit : hit;
  });
}

export interface QueryResult {
  /** Matching ids. Read `active` rather than this being non-empty — an empty query matches nothing. */
  matched: ReadonlySet<AssetId>;
  /** False when nothing was typed. Nothing may be dimmed while this is false. */
  active: boolean;
  unknownFields: string[];
  total: number;
}

export function buildQueryContext(map: ProjectedMap): QueryContext {
  return { subnets: map.subnets, access: map.access };
}

export function runQuery(input: string, assets: MapAsset[], context: QueryContext): QueryResult {
  const query = parseQuery(input);
  if (query.empty) {
    return { matched: new Set(), active: false, unknownFields: query.unknownFields, total: assets.length };
  }
  const matched = new Set<AssetId>();
  for (const asset of assets) {
    if (matchesQuery(asset, query, context)) {
      matched.add(asset.id);
    }
  }
  return { matched, active: true, unknownFields: query.unknownFields, total: assets.length };
}

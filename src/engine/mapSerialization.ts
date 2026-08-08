import {
  CYBER_MAP_SCHEMA_VERSION,
  type AssetOverride,
  type CyberMapDocument,
  type ImportSource,
  type UserConnection
} from "../models/cyberMap";
import { DEFAULT_VANTAGE, IT_ACCESS_LADDER, IT_EVENT_KINDS, type ItEvent, type ItVantage } from "../models/itEngagement";
import type { ScanTime } from "../import/scanTime";
import type { Point } from "../models/types";

export type CyberMapParse = { ok: true; doc: CyberMapDocument } | { ok: false; errors: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isPoint = (value: unknown): value is Point =>
  isObject(value) && typeof value.x === "number" && typeof value.y === "number";

/**
 * Validation is strict about sources and lenient about everything a person authored.
 *
 * A source is the evidence: nothing else can reconstruct it, so one without a parse is not a
 * recoverable partial record. An override, a position or a drawn connection references a *derived*
 * asset, so a dangling one is the ordinary result of removing a source — rejecting the document
 * would make source removal unrecoverable. The projection warns about those instead.
 */
function validateSource(value: unknown, index: number): string[] {
  if (!isObject(value)) {
    return [`Source ${index + 1} must be an object.`];
  }
  const errors: string[] = [];
  for (const field of ["id", "name", "format"]) {
    if (!isString(value[field])) {
      errors.push(`Source ${index + 1} is missing string field "${field}".`);
    }
  }
  if (typeof value.sequence !== "number") {
    errors.push(`Source ${index + 1} is missing a numeric sequence.`);
  }
  if (!isObject(value.parsed) || !Array.isArray((value.parsed as Record<string, unknown>).hosts)) {
    errors.push(`Source ${index + 1} has no parsed hosts.`);
  }
  return errors;
}

/** A time is kept only if fully formed: a half-read one prints as confident with its caveats gone. */
function readScanTime(value: unknown): ScanTime | null {
  if (!isObject(value) || !isString(value.iso) || !Number.isFinite(Date.parse(value.iso))) {
    return null;
  }
  if (value.source !== "file" && value.source !== "operator") {
    return null;
  }
  if (value.precision !== "second" && value.precision !== "minute" && value.precision !== "day") {
    return null;
  }
  return {
    iso: value.iso,
    source: value.source,
    precision: value.precision,
    ...(value.tzAssumed === true ? { tzAssumed: true as const } : {})
  };
}

function readVantage(value: unknown): ItVantage {
  if (isObject(value)) {
    if (value.kind === "node" && isString(value.nodeId)) {
      return { kind: "node", nodeId: value.nodeId };
    }
    if (value.kind === "external" && isString(value.label)) {
      return { kind: "external", label: value.label };
    }
  }
  return DEFAULT_VANTAGE;
}

/** Journal entries, read strictly enough that nothing half-formed reaches a report timeline. */
function readEvents(value: unknown): ItEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isObject(entry) || !isString(entry.id) || !isString(entry.title) || typeof entry.sequence !== "number") {
      return [];
    }
    if (!isString(entry.kind) || !(IT_EVENT_KINDS as readonly string[]).includes(entry.kind)) {
      return [];
    }
    const grants =
      isString(entry.grants) && (IT_ACCESS_LADDER as readonly string[]).includes(entry.grants)
        ? (entry.grants as ItEvent["grants"])
        : undefined;
    return [
      {
        id: entry.id,
        sequence: entry.sequence,
        kind: entry.kind as ItEvent["kind"],
        at: readScanTime(entry.at),
        title: entry.title,
        ...(isString(entry.sourceNodeId) ? { sourceNodeId: entry.sourceNodeId } : {}),
        ...(isString(entry.targetNodeId) ? { targetNodeId: entry.targetNodeId } : {}),
        ...(grants ? { grants } : {}),
        ...(isString(entry.cve) ? { cve: entry.cve } : {}),
        ...(isString(entry.attackTechnique) ? { attackTechnique: entry.attackTechnique } : {}),
        ...(isString(entry.note) ? { note: entry.note } : {})
      }
    ];
  });
}

function readConnections(value: unknown): UserConnection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) =>
    isObject(entry) && isString(entry.id) && isString(entry.source) && isString(entry.target)
      ? [entry as unknown as UserConnection]
      : []
  );
}

function readOverrides(value: unknown): Record<string, AssetOverride> {
  if (!isObject(value)) {
    return {};
  }
  const overrides: Record<string, AssetOverride> = {};
  for (const [id, override] of Object.entries(value)) {
    if (isObject(override)) {
      overrides[id] = override as AssetOverride;
    }
  }
  return overrides;
}

export function parseCyberMapJson(raw: string): CyberMapParse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["The saved map is not valid JSON."] };
  }
  if (!isObject(value)) {
    return { ok: false, errors: ["The saved map must be an object."] };
  }

  const errors: string[] = [];
  for (const field of ["id", "name", "createdAt", "updatedAt"]) {
    if (!isString(value[field])) {
      errors.push(`The map is missing string field "${field}".`);
    }
  }
  if (typeof value.schemaVersion !== "number") {
    errors.push("The map is missing a numeric schemaVersion.");
  } else if (value.schemaVersion > CYBER_MAP_SCHEMA_VERSION) {
    errors.push(
      `This map was saved by a newer version of Alchemist (schema ${value.schemaVersion}). Refusing to read it rather than silently dropping what it holds.`
    );
  }
  if (!Array.isArray(value.sources)) {
    errors.push("The map is missing a sources array.");
  } else {
    value.sources.forEach((source, index) => errors.push(...validateSource(source, index)));
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const positions: Record<string, Point> = {};
  if (isObject(value.positions)) {
    for (const [id, point] of Object.entries(value.positions)) {
      if (isPoint(point)) {
        positions[id] = { x: point.x, y: point.y };
      }
    }
  }

  return {
    ok: true,
    doc: {
      schemaVersion: CYBER_MAP_SCHEMA_VERSION,
      id: value.id as string,
      name: value.name as string,
      createdAt: value.createdAt as string,
      updatedAt: value.updatedAt as string,
      sources: (value.sources as ImportSource[]).map((source) => ({
        ...source,
        vantage: readVantage((source as { vantage?: unknown }).vantage),
        time: readScanTime((source as { time?: unknown }).time)
      })),
      assetOverrides: readOverrides(value.assetOverrides),
      connections: readConnections(value.connections),
      events: readEvents(value.events),
      positions,
      subnetOverrides: isObject(value.subnetOverrides)
        ? (value.subnetOverrides as Record<string, { name?: string; vlan?: string }>)
        : {}
    }
  };
}

export function serializeCyberMap(doc: CyberMapDocument): string {
  return JSON.stringify({ ...doc, schemaVersion: CYBER_MAP_SCHEMA_VERSION });
}

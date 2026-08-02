import {
  DEFAULT_VANTAGE,
  IT_ENGAGEMENT_SCHEMA_VERSION,
  type ItEngagement,
  type ItScan,
  type ItUserLink,
  type ItVantage
} from "../models/itEngagement";
import type { Point } from "../models/types";
import type { ScanTime } from "../import/scanTime";

export type ItEngagementParse = { ok: true; engagement: ItEngagement } | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isPoint(value: unknown): value is Point {
  return isObject(value) && typeof value.x === "number" && typeof value.y === "number";
}

function validateScan(value: unknown, index: number): string[] {
  if (!isObject(value)) {
    return [`Scan ${index + 1} must be an object.`];
  }
  const errors: string[] = [];
  for (const field of ["id", "name", "format"]) {
    if (!isString(value[field])) {
      errors.push(`Scan ${index + 1} is missing string field "${field}".`);
    }
  }
  if (typeof value.sequence !== "number") {
    errors.push(`Scan ${index + 1} is missing a numeric sequence.`);
  }
  // The parse is the evidence. Everything drawn is recomputed from it, so a scan without one is
  // not a recoverable partial record — it is an empty stage in the engagement.
  if (!isObject(value.parsed) || !Array.isArray((value.parsed as Record<string, unknown>).hosts)) {
    errors.push(`Scan ${index + 1} has no parsed hosts.`);
  }
  return errors;
}

/**
 * Authored links are read leniently: anything without two string endpoints is skipped, and the
 * rest are kept even if they name nodes no current scan produced. `projectEngagement` decides what
 * to do about a dangling one, because only it knows which nodes exist.
 */
function readUserLinks(value: unknown): ItUserLink[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isObject(entry) || !isString(entry.id) || !isString(entry.source) || !isString(entry.target)) {
      return [];
    }
    return [
      {
        id: entry.id,
        source: entry.source,
        target: entry.target,
        ...(isString(entry.label) ? { label: entry.label } : {}),
        ...(isString(entry.note) ? { note: entry.note } : {})
      }
    ];
  });
}

/**
 * A time is only kept if it is fully formed. A half-read one would print as a confident timestamp
 * with its caveats missing, which is worse than the honest "time not recorded".
 */
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

/** A missing or malformed vantage falls back to external rather than failing the parse: it is a
 *  label on the evidence, not the evidence. Scans saved before vantage existed read this way. */
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

/**
 * Validates stored engagement JSON.
 *
 * Strict about the scans, because they are the evidence and nothing else can reconstruct them.
 * Tolerant about the authored layer: a position for a node id that no longer exists is dropped
 * silently rather than failing the parse. That is the opposite of `validateProject`, and
 * deliberately so — an OT conduit references authored assets, so a dangling one is corruption,
 * while an authored position references a *derived* node, so a dangling one is the ordinary result
 * of removing a scan. Rejecting it would make scan removal unrecoverable.
 */
export function parseItEngagementJson(raw: string): ItEngagementParse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["The saved engagement is not valid JSON."] };
  }

  if (!isObject(value)) {
    return { ok: false, errors: ["The saved engagement must be an object."] };
  }

  const errors: string[] = [];
  for (const field of ["id", "name", "createdAt", "updatedAt"]) {
    if (!isString(value[field])) {
      errors.push(`The engagement is missing string field "${field}".`);
    }
  }
  if (typeof value.schemaVersion !== "number") {
    errors.push("The engagement is missing a numeric schemaVersion.");
  } else if (value.schemaVersion > IT_ENGAGEMENT_SCHEMA_VERSION) {
    errors.push(
      `This engagement was saved by a newer version of Alchemist (schema ${value.schemaVersion}). Refusing to read it rather than silently dropping what it holds.`
    );
  }
  if (!Array.isArray(value.scans)) {
    errors.push("The engagement is missing a scans array.");
  } else {
    value.scans.forEach((scan, index) => errors.push(...validateScan(scan, index)));
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
    engagement: {
      schemaVersion: IT_ENGAGEMENT_SCHEMA_VERSION,
      id: value.id as string,
      name: value.name as string,
      createdAt: value.createdAt as string,
      updatedAt: value.updatedAt as string,
      scans: (value.scans as ItScan[]).map((scan) => ({
        ...scan,
        vantage: readVantage((scan as { vantage?: unknown }).vantage),
        time: readScanTime((scan as { time?: unknown }).time)
      })),
      userLinks: readUserLinks(value.userLinks),
      positions
    }
  };
}

export function serializeItEngagement(engagement: ItEngagement): string {
  return JSON.stringify({ ...engagement, schemaVersion: IT_ENGAGEMENT_SCHEMA_VERSION });
}

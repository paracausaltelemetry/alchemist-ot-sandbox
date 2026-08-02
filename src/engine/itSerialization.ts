import { IT_ENGAGEMENT_SCHEMA_VERSION, type ItEngagement, type ItScan } from "../models/itEngagement";
import type { Point } from "../models/types";

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
      scans: value.scans as ItScan[],
      positions
    }
  };
}

export function serializeItEngagement(engagement: ItEngagement): string {
  return JSON.stringify({ ...engagement, schemaVersion: IT_ENGAGEMENT_SCHEMA_VERSION });
}

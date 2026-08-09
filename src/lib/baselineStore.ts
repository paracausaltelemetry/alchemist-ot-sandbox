import { parseProjectJson, serializeProject } from "../engine/serialization";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./safeStorage";
import type { OtProject } from "../models/types";

/**
 * The remediation baseline: a snapshot to measure the current assessment against.
 *
 * Its own slot rather than a corner of the project store, because it is not a document — it is one
 * frozen copy of whatever was being assessed at the moment somebody pressed the button, and it
 * outlives the store it used to live in.
 *
 * Keyed on the document, so switching estate does not diff one against another's baseline. Stored
 * as a serialized `OtProject` because that is what `diffAssessments` compares, and the converged
 * document projects to exactly that.
 */

const BASELINE_PREFIX = "alchemist-baseline:";

const keyFor = (documentId: string) => `${BASELINE_PREFIX}${documentId}`;

export function getBaseline(documentId: string): OtProject | null {
  const raw = safeGetItem(keyFor(documentId));
  if (!raw) {
    return null;
  }
  const parsed = parseProjectJson(raw);
  // A baseline that will not parse is silently absent rather than an error: it is a convenience
  // snapshot, and refusing to show the assessment because an old comparison went stale would be
  // punishing the operator for a feature they may not even be using.
  return parsed.ok ? parsed.project : null;
}

export function setBaseline(documentId: string, project: OtProject): void {
  safeSetItem(keyFor(documentId), serializeProject(project));
}

export function clearBaseline(documentId: string): void {
  safeRemoveItem(keyFor(documentId));
}

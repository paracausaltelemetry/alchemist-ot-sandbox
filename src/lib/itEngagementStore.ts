import { parseItEngagementJson, serializeItEngagement } from "../engine/itSerialization";
import { reportStorageFailure, safeGetItem, safeRemoveItem, safeSetItem } from "./safeStorage";
import type { ItEngagement } from "../models/itEngagement";

/**
 * The engagement's localStorage slot. Mirrors `projectStore`'s never-overwrite-corrupt rule, with
 * three deliberate differences.
 *
 * 1. **Nothing is seeded.** `projectStore` seeds the bundled sample when it finds no assessment,
 *    because an empty workbench is useless. An engagement store must not invent an engagement:
 *    a fabricated record of work nobody did is the one thing this document cannot contain.
 * 2. **One slot, not a registry.** There is no engagement picker yet, so an index and a current
 *    pointer would be three keys serving one entry. `projectStore`'s shape is the model to copy
 *    when a picker exists.
 * 3. **A storage budget, which `projectStore` never needed.** An accepted import is up to 24MB
 *    and localStorage is about 5MB, so a save can genuinely fail here. Raw scan text is never
 *    stored — only the `ParsedImport` — and a refused write is reported rather than swallowed.
 */

const ENGAGEMENT_KEY = "alchemist-it-engagement";

/**
 * True once stored JSON has failed to parse. A corrupt payload must never be written over:
 * replacing it destroys whatever might have been salvageable, and the operator would find an empty
 * map where their engagement used to be with no explanation.
 */
let corrupt = false;

export function isEngagementCorrupt(): boolean {
  return corrupt;
}

export function loadEngagement(): ItEngagement | null {
  const raw = safeGetItem(ENGAGEMENT_KEY);
  if (!raw) {
    return null;
  }
  const parsed = parseItEngagementJson(raw);
  if (!parsed.ok) {
    corrupt = true;
    reportStorageFailure("corrupt", `the saved engagement could not be read; it has been left untouched. ${parsed.errors[0]}`);
    return null;
  }
  corrupt = false;
  return parsed.engagement;
}

/** Returns false when the write was refused or failed, so the caller can say so and offer an export. */
export function saveEngagement(engagement: ItEngagement): boolean {
  if (corrupt) {
    return false;
  }
  return safeSetItem(ENGAGEMENT_KEY, serializeItEngagement({ ...engagement, updatedAt: new Date().toISOString() }));
}

export function clearEngagement(): void {
  corrupt = false;
  safeRemoveItem(ENGAGEMENT_KEY);
}

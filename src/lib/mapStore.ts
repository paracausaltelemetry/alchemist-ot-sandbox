import { parseCyberMapJson, serializeCyberMap } from "../engine/mapSerialization";
import { reportStorageFailure, safeGetItem, safeRemoveItem, safeSetItem } from "./safeStorage";
import type { CyberMapDocument } from "../models/cyberMap";

/**
 * The converged map's localStorage slot.
 *
 * v3 is a clean break: it never reads `alchemist-project:*` or `alchemist-it-engagement`, and it
 * never deletes them either. The upgrade destroys no bytes, so an older build can still open and
 * export whatever was there — which is the whole safety net for starting clean.
 *
 * Keeps the two rules the earlier stores settled: a corrupt payload is never written over, and a
 * refused write is reported rather than swallowed. An accepted import is up to 24MB against roughly
 * 5MB of localStorage, so saving can genuinely fail here; only the `ParsedImport` is stored, never
 * the raw file text.
 */

const MAP_KEY = "alchemist-cyber-map";

let corrupt = false;

export function isMapCorrupt(): boolean {
  return corrupt;
}

export function loadCyberMap(): CyberMapDocument | null {
  const raw = safeGetItem(MAP_KEY);
  if (!raw) {
    return null;
  }
  const parsed = parseCyberMapJson(raw);
  if (!parsed.ok) {
    // Never overwritten: replacing it destroys whatever might have been salvageable, and the
    // operator would find an empty map where their estate used to be with no explanation.
    corrupt = true;
    reportStorageFailure("corrupt", `the saved map could not be read; it has been left untouched. ${parsed.errors[0]}`);
    return null;
  }
  corrupt = false;
  return parsed.doc;
}

/** Returns false when the write was refused, so the caller can say so and offer an export. */
export function saveCyberMap(doc: CyberMapDocument): boolean {
  if (corrupt) {
    return false;
  }
  return safeSetItem(MAP_KEY, serializeCyberMap({ ...doc, updatedAt: new Date().toISOString() }));
}

export function clearCyberMap(): void {
  corrupt = false;
  safeRemoveItem(MAP_KEY);
}

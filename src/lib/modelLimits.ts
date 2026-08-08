/**
 * Soft ceilings on model size. The topology canvas renders every asset and
 * conduit as a React Flow node/edge with no virtualization, so very large
 * models degrade interaction. These are advisory only — nothing is blocked;
 * the user is warned so an oversized import is a considered choice.
 */
export const SOFT_ASSET_LIMIT = 150;
export const SOFT_CONDUIT_LIMIT = 300;

/**
 * Largest file we will read into a string. `FileReader.readAsText` pulls the whole file onto the
 * main thread before any parser sees it, and the 600-asset cap in `assemble.ts` only applies
 * *after* parsing — so without this a 500MB scan simply freezes the tab with no explanation.
 */
export const MAX_IMPORT_BYTES = 24 * 1024 * 1024;

/** A refusal message when a file is too large to read, else null. */
export function oversizeFileError(file: { name: string; size: number }): string | null {
  if (file.size <= MAX_IMPORT_BYTES) {
    return null;
  }
  const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${file.name} is ${mb(file.size)}, over the ${mb(MAX_IMPORT_BYTES)} limit. Split the scan or filter it before importing.`;
}

/**
 * A warning when a model is large enough to hurt canvas performance, else null. The nouns are
 * caller-supplied because the same limits describe an OT project (assets and conduits) and an IT
 * map (devices and links).
 */
export function oversizeWarning(
  nodeCount: number,
  linkCount: number,
  nouns: { node: string; link: string } = { node: "assets", link: "conduits" }
): string | null {
  const parts: string[] = [];
  if (nodeCount > SOFT_ASSET_LIMIT) parts.push(`${nodeCount} ${nouns.node} (recommended under ${SOFT_ASSET_LIMIT})`);
  if (linkCount > SOFT_CONDUIT_LIMIT) parts.push(`${linkCount} ${nouns.link} (recommended under ${SOFT_CONDUIT_LIMIT})`);
  if (!parts.length) return null;
  return `Large model: ${parts.join(" and ")}. The canvas may feel sluggish; analysis is unaffected.`;
}

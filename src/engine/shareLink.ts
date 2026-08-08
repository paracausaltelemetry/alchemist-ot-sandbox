import type { OtProject } from "../models/types";
import { parseProjectJson, serializeProject, type ValidationResult } from "./serialization";

/**
 * Encodes a project into a compact, self-contained URL fragment so a model can be shared or
 * reloaded without a backend. The JSON is gzip-compressed with the built-in CompressionStream
 * (no dependency) and base64url-encoded. Everything stays in the browser.
 */

export const SHARE_HASH_PREFIX = "#share=";

/** Hashes longer than this risk hitting browser/proxy URL limits; the caller can warn. */
export const MAX_SHARE_PAYLOAD = 30000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** The base64url payload for a project (without the `#share=` prefix). */
export async function encodeProjectToShare(project: OtProject): Promise<string> {
  return toBase64Url(await gzip(serializeProject(project)));
}

/** Decodes a base64url payload back into a validated project. */
export async function decodeProjectFromShare(payload: string): Promise<ValidationResult> {
  try {
    return parseProjectJson(await gunzip(fromBase64Url(payload)));
  } catch {
    return { ok: false, project: null, errors: ["Could not decode the shared link."] };
  }
}

/** A full shareable URL for the current page that loads the given project. */
export async function buildShareUrl(project: OtProject): Promise<string> {
  const payload = await encodeProjectToShare(project);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${SHARE_HASH_PREFIX}${payload}`;
}

/** The `#share=` payload from a hash string, or null if absent. */
export function sharePayloadFromHash(hash: string): string | null {
  return hash.startsWith(SHARE_HASH_PREFIX) ? hash.slice(SHARE_HASH_PREFIX.length) : null;
}

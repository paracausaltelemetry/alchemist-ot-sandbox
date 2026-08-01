import { sampleProject } from "../data/sampleProject";
import { safeGetItem, safeSetItem, safeRemoveItem, reportStorageFailure } from "./safeStorage";
import { parseProjectJson, serializeProject } from "../engine/serialization";
import type { OtProject } from "../models/types";

/**
 * A small localStorage registry of named assessments: an index of metadata, a per-project payload,
 * and a pointer to the current one. The single legacy slot is migrated in on first use, so existing
 * work is never lost. Pure DOM/localStorage; the workbench reaches it through projectStorage.
 */

export interface SavedProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
}

const INDEX_KEY = "alchemist-projects";
const CURRENT_KEY = "alchemist-current-project";
const PAYLOAD_PREFIX = "alchemist-project:";
const BASELINE_PREFIX = "alchemist-baseline:";
const LEGACY_KEY = "alchemist-ot-sandbox-project";

function clone(project: OtProject): OtProject {
  return JSON.parse(JSON.stringify(project)) as OtProject;
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function payloadKey(id: string): string {
  return `${PAYLOAD_PREFIX}${id}`;
}

function baselineKey(id: string): string {
  return `${BASELINE_PREFIX}${id}`;
}

function readIndex(): SavedProjectMeta[] {
  try {
    const raw = safeGetItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as SavedProjectMeta[]) : [];
  } catch {
    return [];
  }
}

/**
 * Payload ids whose stored JSON would not parse. A corrupt payload must never be written over:
 * silently replacing it with the sample destroys whatever might have been salvageable, and the
 * user would see the sample project where their work used to be with no explanation.
 */
const corrupt = new Set<string>();

export function isCorrupt(id: string): boolean {
  return corrupt.has(id);
}

function writeIndex(index: SavedProjectMeta[]): void {
  safeSetItem(INDEX_KEY, JSON.stringify(index));
}

function readPayload(id: string): OtProject | null {
  const raw = safeGetItem(payloadKey(id));
  if (!raw) {
    return null;
  }
  const parsed = parseProjectJson(raw);
  if (!parsed.ok) {
    corrupt.add(id);
    reportStorageFailure("corrupt", `saved assessment ${id} could not be read; it has been left untouched.`);
    return null;
  }
  corrupt.delete(id);
  return parsed.project;
}

/** Returns false when the write was refused or failed, so callers can tell the user. */
function writePayload(id: string, project: OtProject): boolean {
  if (corrupt.has(id)) {
    return false;
  }
  return safeSetItem(payloadKey(id), serializeProject(project));
}

function addEntry(project: OtProject): SavedProjectMeta {
  const meta: SavedProjectMeta = { id: newId(), name: project.name || "Untitled assessment", updatedAt: new Date().toISOString() };
  writePayload(meta.id, project);
  writeIndex([meta, ...readIndex()]);
  return meta;
}

/** Ensures a registry exists (migrating the legacy slot or seeding the sample) and returns the current id. */
function ensureInitialised(): string {
  const current = safeGetItem(CURRENT_KEY);
  const index = readIndex();
  if (current && index.some((meta) => meta.id === current) && readPayload(current)) {
    return current;
  }
  if (index.length > 0 && readPayload(index[0].id)) {
    safeSetItem(CURRENT_KEY, index[0].id);
    return index[0].id;
  }

  // Seed from the legacy single slot if present, otherwise the bundled sample.
  let project = clone(sampleProject);
  const legacy = safeGetItem(LEGACY_KEY);
  if (legacy) {
    const parsed = parseProjectJson(legacy);
    if (parsed.ok) {
      project = parsed.project;
    }
  }
  const meta = addEntry(project);
  safeSetItem(CURRENT_KEY, meta.id);
  return meta.id;
}

export function getCurrentProjectId(): string {
  return ensureInitialised();
}

export function listProjects(): SavedProjectMeta[] {
  ensureInitialised();
  return readIndex();
}

export function getCurrentProject(): OtProject {
  const id = ensureInitialised();
  return readPayload(id) ?? clone(sampleProject);
}

/**
 * Persists the working project into the current entry, keeping its index name and timestamp in
 * sync. Returns false when the payload could not be written — the index is then left alone too,
 * so the picker never advertises a name or timestamp that the stored content does not match.
 */
export function saveCurrentProject(project: OtProject): boolean {
  const id = ensureInitialised();
  if (!writePayload(id, project)) {
    return false;
  }
  writeIndex(
    readIndex().map((meta) =>
      meta.id === id ? { ...meta, name: project.name || meta.name, updatedAt: new Date().toISOString() } : meta
    )
  );
  return true;
}

export function openProject(id: string): void {
  if (readPayload(id)) {
    safeSetItem(CURRENT_KEY, id);
  }
}

/** Creates a new saved assessment from a project and makes it current; returns its id. */
export function createProject(project: OtProject): string {
  const meta = addEntry(project);
  safeSetItem(CURRENT_KEY, meta.id);
  return meta.id;
}

export function duplicateProject(id: string): string | null {
  const project = readPayload(id);
  if (!project) {
    return null;
  }
  const copy = { ...clone(project), name: `${project.name || "Assessment"} copy` };
  const meta = addEntry(copy);
  return meta.id;
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim() || "Untitled assessment";
  writeIndex(readIndex().map((meta) => (meta.id === id ? { ...meta, name: trimmed } : meta)));
  const project = readPayload(id);
  if (project) {
    writePayload(id, { ...project, name: trimmed });
  }
}

export function deleteProject(id: string): void {
  safeRemoveItem(payloadKey(id));
  safeRemoveItem(baselineKey(id));
  const index = readIndex().filter((meta) => meta.id !== id);
  writeIndex(index);
  if (safeGetItem(CURRENT_KEY) === id) {
    if (index.length > 0) {
      safeSetItem(CURRENT_KEY, index[0].id);
    } else {
      safeRemoveItem(CURRENT_KEY);
    }
  }
}

/** The remediation baseline snapshot for the current assessment, if one has been set. */
export function getBaseline(): OtProject | null {
  const raw = safeGetItem(baselineKey(ensureInitialised()));
  if (!raw) {
    return null;
  }
  const parsed = parseProjectJson(raw);
  return parsed.ok ? parsed.project : null;
}

export function setBaseline(project: OtProject): void {
  safeSetItem(baselineKey(ensureInitialised()), serializeProject(project));
}

export function clearBaseline(): void {
  safeRemoveItem(baselineKey(ensureInitialised()));
}

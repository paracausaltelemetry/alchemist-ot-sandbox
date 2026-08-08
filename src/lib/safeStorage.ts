/**
 * localStorage access that fails closed instead of throwing.
 *
 * Reads matter as much as writes. With site data blocked, *touching*
 * `window.localStorage` throws a SecurityError — not just the call — and the
 * store is read during App's state initialiser, so an unguarded read kills the
 * app on mount into the ErrorBoundary, whose recovery button calls
 * `localStorage.clear()` and throws in turn. That is unrecoverable.
 *
 * Writes degrade to "not persisted" rather than destroying saved work. Failures
 * are reported to any listener so the UI can say so, instead of leaving someone
 * working on an assessment that quietly stopped saving.
 */

export type StorageFailure =
  /** Storage is blocked or absent; nothing will persist this session. */
  | "unavailable"
  /** Storage is full. The edit was not saved but existing data is intact. */
  | "quota"
  /** A stored payload could not be parsed. It is left untouched, never overwritten. */
  | "corrupt";

type Listener = (failure: StorageFailure, detail: string) => void;

const listeners = new Set<Listener>();
const reported = new Set<StorageFailure>();

/** Subscribe to storage problems. Each kind is reported once per session. */
export function onStorageFailure(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportStorageFailure(failure: StorageFailure, detail: string): void {
  if (reported.has(failure)) {
    return;
  }
  reported.add(failure);
  console.warn(`Alchemist storage: ${detail}`);
  for (const listener of listeners) {
    listener(failure, detail);
  }
}

/** Quota errors are recoverable by deleting an assessment; a blocked store is not. */
function classify(error: unknown): StorageFailure {
  const name = error instanceof Error ? error.name : "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ? "quota" : "unavailable";
}

const DETAIL: Record<StorageFailure, string> = {
  unavailable: "browser storage is unavailable, so nothing will be saved this session.",
  quota: "browser storage is full, so the last change was not saved. Delete an assessment to free space.",
  corrupt: "a saved assessment could not be read. It has been left untouched rather than overwritten."
};

/** Returns the stored value, or null if absent or storage is unreadable. */
export function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    reportStorageFailure(classify(error), DETAIL[classify(error)]);
    return null;
  }
}

/** Returns true if the value was stored, false if storage was unavailable. */
export function safeSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const failure = classify(error);
    reportStorageFailure(failure, DETAIL[failure]);
    return false;
  }
}

/** Returns true if the key was removed (or already absent), false on failure. */
export function safeRemoveItem(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    const failure = classify(error);
    reportStorageFailure(failure, DETAIL[failure]);
    return false;
  }
}

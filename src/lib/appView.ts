export type AppView = "home" | "map";

/** Remembers the last view so a reload keeps you where you were. */
export const LAST_VIEW_STORAGE_KEY = "alchemist-last-view";

/**
 * Decides the initial top-level view. An explicit hash wins; otherwise fall back to the remembered
 * last view, and finally to the home dashboard for a first-time visitor.
 *
 * `#app` and `#it` were the two apps Alchemist used to ship. They resolve to the map rather than to
 * home, because every link into either of them — a bookmark, a note in a ticket, the main site —
 * meant "open the tool", and the map is the tool now.
 */
export function initialView(hash: string, lastView: AppView | null): AppView {
  if (hash === "#map" || hash === "#app" || hash === "#it") {
    return "map";
  }
  if (hash === "#home") {
    return "home";
  }
  return lastView ?? "home";
}

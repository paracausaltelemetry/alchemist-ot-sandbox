export type AppView = "home" | "app" | "it";

/** Remembers the last view so a reload keeps you where you were. */
export const LAST_VIEW_STORAGE_KEY = "alchemist-last-view";

/**
 * Decides the initial top-level view. An explicit hash wins (`#app` / `#home`); otherwise fall back
 * to the remembered last view, and finally to the home dashboard for a first-time visitor.
 */
export function initialView(hash: string, lastView: AppView | null): AppView {
  if (hash === "#app") {
    return "app";
  }
  if (hash === "#it") {
    return "it";
  }
  if (hash === "#home") {
    return "home";
  }
  return lastView ?? "home";
}

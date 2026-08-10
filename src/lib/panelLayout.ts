import { safeGetItem, safeSetItem } from "./safeStorage";

/**
 * Which of the shell's panels are open, remembered between sessions.
 *
 * Separate from the map document on purpose. How wide somebody likes their sidebar is not part of
 * the estate they are describing, and putting it in the document would make it travel with an
 * export and land on somebody else's screen.
 */
export interface PanelLayout {
  sidebar: boolean;
  inspector: boolean;
  /**
   * Closed to begin with. Warnings, movement and the event log are places to look something up
   * rather than things to read, and a third of the screen spent on a list nobody asked for is a
   * third less map — which is the thing they came for.
   */
  bottom: boolean;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { sidebar: true, inspector: true, bottom: false };

const KEY = "alchemist-map-panels";

export function readPanelLayout(): PanelLayout {
  const raw = safeGetItem(KEY);
  if (!raw) {
    return DEFAULT_PANEL_LAYOUT;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      sidebar: typeof parsed.sidebar === "boolean" ? parsed.sidebar : DEFAULT_PANEL_LAYOUT.sidebar,
      inspector: typeof parsed.inspector === "boolean" ? parsed.inspector : DEFAULT_PANEL_LAYOUT.inspector,
      bottom: typeof parsed.bottom === "boolean" ? parsed.bottom : DEFAULT_PANEL_LAYOUT.bottom
    };
  } catch {
    // A preference is not worth reporting a storage failure over; the defaults are a fine answer.
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function writePanelLayout(layout: PanelLayout): void {
  safeSetItem(KEY, JSON.stringify(layout));
}

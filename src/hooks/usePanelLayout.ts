import { useCallback, useEffect, useState } from "react";
import type { LayoutMode } from "../models/types";
import { safeGetItem, safeSetItem } from "../lib/safeStorage";

export interface PanelLayout {
  paletteOpen: boolean;
  inspectorOpen: boolean;
  dockOpen: boolean;
  dockHeight: number;
  layoutMode: LayoutMode;
}

const STORAGE_KEY = "alchemist-panel-layout";
const MIN_DOCK = 7;
const MAX_DOCK = 42;
const DEFAULT_LAYOUT: PanelLayout = {
  paletteOpen: true,
  inspectorOpen: true,
  dockOpen: false,
  dockHeight: 12,
  layoutMode: "network"
};

function clampDock(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_LAYOUT.dockHeight;
  }
  return Math.min(MAX_DOCK, Math.max(MIN_DOCK, Math.round(value * 10) / 10));
}

function loadLayout(): PanelLayout {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_LAYOUT;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      paletteOpen: parsed.paletteOpen ?? DEFAULT_LAYOUT.paletteOpen,
      inspectorOpen: parsed.inspectorOpen ?? DEFAULT_LAYOUT.inspectorOpen,
      dockOpen: parsed.dockOpen ?? DEFAULT_LAYOUT.dockOpen,
      dockHeight: clampDock(parsed.dockHeight ?? DEFAULT_LAYOUT.dockHeight),
      layoutMode: parsed.layoutMode === "purdue" ? "purdue" : DEFAULT_LAYOUT.layoutMode
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Persisted workspace layout: which side rails are collapsed and how tall the
 * analysis dock is (in rem). Mirrors the localStorage pattern used for the
 * project and theme.
 */
export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(() => loadLayout());

  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const togglePalette = useCallback(() => setLayout((current) => ({ ...current, paletteOpen: !current.paletteOpen })), []);
  const toggleInspector = useCallback(
    () => setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen })),
    []
  );
  const toggleDock = useCallback(() => setLayout((current) => ({ ...current, dockOpen: !current.dockOpen })), []);
  const setDockHeight = useCallback(
    (height: number) => setLayout((current) => ({ ...current, dockHeight: clampDock(height), dockOpen: true })),
    []
  );
  const setLayoutMode = useCallback(
    (layoutMode: LayoutMode) => setLayout((current) => ({ ...current, layoutMode })),
    []
  );

  return { layout, togglePalette, toggleInspector, toggleDock, setDockHeight, setLayoutMode };
}

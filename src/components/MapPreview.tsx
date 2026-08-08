import { useCallback, useMemo, useState } from "react";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { projectMap } from "../engine/mapProjection";
import { newCyberMap, newImportSource, nextMapSequence, type CyberMapDocument } from "../models/cyberMap";
import { loadCyberMap, saveCyberMap } from "../lib/mapStore";
import type { Point } from "../models/types";
import { MapCanvas } from "./MapCanvas";
import { SiteMasthead } from "./SiteMasthead";

/**
 * A bare frame around `MapCanvas`, reachable at `#map`.
 *
 * Not the converged workspace — the sidebars, the inspector and the bottom panel are a later
 * phase. This exists because a canvas that nothing renders cannot be looked at, and on this
 * codebase the defects that matter have overwhelmingly been the ones only a browser can see: a
 * handle that rendered transparent, a CSS token that does not exist, a print rule that would have
 * printed a blank page. None of those failed a test.
 *
 * Deliberately holds the document in component state rather than the store's single slot until the
 * workspace exists: a preview route should not be able to overwrite a real estate on first paint.
 */
export function MapPreview({
  theme,
  onToggleTheme,
  isMobile
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  isMobile: boolean;
}) {
  const [doc, setDoc] = useState<CyberMapDocument>(() => loadCyberMap() ?? newCyberMap("Estate"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInferred, setShowInferred] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);

  const map = useMemo(() => projectMap(doc), [doc]);

  const commit = useCallback((next: CyberMapDocument) => {
    setDoc(next);
    saveCyberMap(next);
  }, []);

  const loadSample = useCallback(() => {
    const base = newCyberMap("Sample estate");
    const source = newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
      kind: "external",
      label: "External"
    });
    commit({ ...base, sources: [source] });
    setFitSignal((signal) => signal + 1);
  }, [commit]);

  const placeAsset = useCallback(
    (id: string, position: Point, zone: CyberMapDocument["assetOverrides"][string]["zone"]) =>
      commit({
        ...doc,
        positions: { ...doc.positions, [id]: position },
        assetOverrides: { ...doc.assetOverrides, [id]: { ...doc.assetOverrides[id], zone } }
      }),
    [commit, doc]
  );

  const selected = selectedId ? map.assets.find((asset) => asset.id === selectedId) : undefined;

  return (
    <div className="site-frame map-preview">
      <SiteMasthead theme={theme} onToggleTheme={onToggleTheme} isMobile={isMobile} />
      <main className="map-preview-main">
        {map.assets.length === 0 ? (
          <div className="canvas-empty">
            <strong>Nothing imported yet</strong>
            <p>Load the sample scan to see the converged map.</p>
            <button type="button" className="text-button" onClick={loadSample}>
              Load the sample scan
            </button>
          </div>
        ) : (
          <MapCanvas
            map={map}
            selectedId={selectedId}
            positions={doc.positions}
            fitSignal={fitSignal}
            showInferred={showInferred}
            onSelect={setSelectedId}
            onPlaceAsset={placeAsset}
            onToggleInferred={() => setShowInferred((shown) => !shown)}
          />
        )}
        {map.warnings.length > 0 ? (
          <ul className="map-preview-warnings" aria-label="Map warnings">
            {map.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {selected ? (
          <p className="map-preview-selection">
            <strong>{selected.name}</strong> — {selected.zone}, confidence {selected.confidence.toFixed(2)}.{" "}
            {selected.rationale}
          </p>
        ) : null}
      </main>
    </div>
  );
}

import { useMemo, useState } from "react";
import { getAssetType, getZone } from "../data/catalog";
import { importFormatLabels } from "../import/types";
import { vantageLabel } from "../models/itEngagement";
import type { CyberMapDocument, MapAsset } from "../models/cyberMap";

/**
 * The left sidebar: what was imported, what came out of it, and what is being drawn.
 *
 * The asset list matters more than it looks. A converged estate is hundreds of cards, and a canvas
 * with no index is only searchable by eye — which is exactly the failure the two old views had, and
 * why an asset you could not find was an asset you assumed was not there.
 */

interface MapSidebarProps {
  doc: CyberMapDocument;
  assets: MapAsset[];
  selectedId: string | null;
  showInferred: boolean;
  onSelect: (id: string) => void;
  /** A scan run from a host names that host, and an id is not a name a reader recognises. */
  nameOf: (assetId: string) => string;
  onToggleInferred: () => void;
  onLoadSample: () => void;
  onImportFile: (file: File) => void;
  onRemoveSource: (sourceId: string) => void;
}

export function MapSidebar({
  doc,
  assets,
  selectedId,
  showInferred,
  onSelect,
  nameOf,
  onToggleInferred,
  onLoadSample,
  onImportFile,
  onRemoveSource
}: MapSidebarProps) {
  const [filter, setFilter] = useState("");

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const listed = [...assets].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (!needle) {
      return listed;
    }
    // Address, name and class all searched, because an assessor arrives with whichever one they
    // happen to have: an IP from a scan, a hostname from a ticket, "firewall" from a conversation.
    return listed.filter((asset) =>
      [asset.name, asset.ipAddress, getAssetType(asset.type).label, getZone(asset.zone).name]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [assets, filter]);

  return (
    <aside className="map-sidebar" aria-label="Sources and assets">
      <section>
        <h3>Sources</h3>
        {doc.sources.length === 0 ? (
          <p className="muted">Nothing imported yet.</p>
        ) : (
          <ul className="map-source-list">
            {doc.sources.map((source) => (
              <li key={source.id}>
                <strong>{source.name}</strong>
                <small>
                  {importFormatLabels[source.format]} · {source.assetCount} host
                  {source.assetCount === 1 ? "" : "s"} · {vantageLabel(source.vantage, nameOf)}
                </small>
                <button
                  type="button"
                  className="text-button compact"
                  onClick={() => onRemoveSource(source.id)}
                  title="Remove this import and everything derived from it"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="map-sidebar-actions">
          <label className="text-button compact">
            Import
            <input
              type="file"
              accept=".xml,.txt,.csv,.json,.nessus"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportFile(file);
                }
                // Cleared so re-importing the same file fires a change event at all.
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="text-button compact" onClick={onLoadSample}>
            Load sample
          </button>
        </div>
      </section>

      <section>
        <h3>Layers</h3>
        <label className="map-layer-toggle">
          <input type="checkbox" checked={showInferred} onChange={onToggleInferred} />
          <span>Links we inferred</span>
        </label>
      </section>

      <section className="map-sidebar-assets">
        <h3>
          Assets <small>{matches.length === assets.length ? assets.length : `${matches.length} of ${assets.length}`}</small>
        </h3>
        <input
          className="map-asset-filter"
          type="search"
          value={filter}
          placeholder="Filter by name, address or class"
          aria-label="Filter assets"
          onChange={(event) => setFilter(event.target.value)}
        />
        {matches.length === 0 ? (
          <p className="muted">Nothing matches that.</p>
        ) : (
          <ul className="map-asset-list">
            {matches.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className={asset.id === selectedId ? "is-selected" : ""}
                  onClick={() => onSelect(asset.id)}
                >
                  <strong>{asset.name}</strong>
                  <small>
                    {getZone(asset.zone).shortName} · {asset.ipAddress || "no address"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

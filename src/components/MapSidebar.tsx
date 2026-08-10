import { PanelLeftClose } from "lucide-react";
import { QUERY_FIELDS, type QueryResult } from "../engine/mapQuery";
import { useEffect, useMemo, useRef } from "react";
import { getZone } from "../data/catalog";
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
  /** Adds a device nothing scanned — the half of enumeration that arrives as hearsay. */
  onAddDevice: () => void;
  onImportFile: (file: File) => void;
  onRemoveSource: (sourceId: string) => void;
  /** Absent until something has been imported — an engagement report over nothing is not a document. */
  onExportReport?: () => void;
  /** Folds the panel down to a rail, for when the map wants the width more than the list does. */
  onCollapse: () => void;
  /** The query, owned by the workspace so the canvas and this list cannot disagree about it. */
  query: string;
  onQueryChange: (query: string) => void;
  result: QueryResult;
  /** Frames the matches on the canvas — three hits in two hundred nodes is still a hunt. */
  onFitMatches: () => void;
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
  onAddDevice,
  onImportFile,
  onRemoveSource,
  onExportReport,
  onCollapse,
  query,
  onQueryChange,
  result,
  onFitMatches
}: MapSidebarProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);

  /**
   * `/` puts the caret in the search box, the way every tool that has a search box does it.
   *
   * Ignored while something else has focus that takes text, or a slash typed into the event note
   * would teleport the caret out of the sentence being written.
   */
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (typing) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const matches = useMemo(() => {
    const listed = [...assets].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    // The list is the query's result set; the canvas dims to the same set. Filtering here and
    // matching there from two different computations is how the two would come to disagree.
    return result.active ? listed.filter((asset) => result.matched.has(asset.id)) : listed;
  }, [assets, result]);

  return (
    <aside className="map-sidebar" aria-label="Sources and assets">
      {/* A titlebar rather than a button floated over the panel: absolutely positioned, it sat on
          top of whatever the panel's first line happened to be. */}
      <div className="panel-heading">
        <span>Sources and assets</span>
        <button type="button" className="panel-collapse" aria-expanded title="Hide this panel" onClick={onCollapse}>
          <PanelLeftClose size={15} aria-hidden="true" />
          <span className="visually-hidden">Hide sources and assets</span>
        </button>
      </div>
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
          <button type="button" className="text-button compact" onClick={onAddDevice}>
            Add device
          </button>
          <button type="button" className="text-button compact" onClick={onLoadSample}>
            Load sample
          </button>
          {onExportReport ? (
            <button type="button" className="text-button compact" onClick={onExportReport} title="Download the engagement record as Markdown">
              Report
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <h3>Layers</h3>
        <label className="map-layer-toggle">
          <input type="checkbox" checked={showInferred} onChange={onToggleInferred} />
          <span>Links we inferred</span>
        </label>
      </section>

      <details className="map-query-help">
        <summary>What you can search</summary>
        <dl>
          {QUERY_FIELDS.map((field) => (
            <div key={field.id}>
              <dt>{field.example}</dt>
              <dd>{field.hint}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Terms narrow together. Put <code>-</code> in front to exclude, and commas between
          alternatives.
        </p>
      </details>

      <section className="map-sidebar-assets">
        <h3>
          Assets{" "}
          <small aria-live="polite">
            {matches.length === assets.length ? assets.length : `${matches.length} of ${assets.length}`}
          </small>
        </h3>
        <input
          ref={searchRef}
          className="map-asset-filter"
          type="search"
          value={query}
          placeholder="port:445  -cidr:10.10.9.0/24"
          aria-label="Search the estate"
          onChange={(event) => onQueryChange(event.target.value)}
          // On the input rather than on `window`: connect mode already owns Escape globally, and
          // two handlers for one key means whichever mounted last silently wins.
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              onQueryChange("");
            }
          }}
        />

        {/* A prefix that is not a field is not an error — it was searched as text, and saying which
            fields exist is more use than refusing. Rendered from the registry, so it cannot list a
            field the parser does not have. */}
        {result.unknownFields.length > 0 ? (
          <p className="muted map-query-hint">
            No field called <code>{result.unknownFields[0]}</code> — searched as text. Fields:{" "}
            {QUERY_FIELDS.map((field) => field.prefixes[0]).join(", ")}.
          </p>
        ) : null}

        {result.active ? (
          <div className="map-query-actions">
            <button type="button" className="text-button compact" onClick={onFitMatches} disabled={matches.length === 0}>
              Fit to matches
            </button>
            <button type="button" className="text-button compact" onClick={() => onQueryChange("")}>
              Clear
            </button>
          </div>
        ) : null}

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

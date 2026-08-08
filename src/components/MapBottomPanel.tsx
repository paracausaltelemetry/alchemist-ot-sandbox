import { useState } from "react";
import { EVENT_KIND_LABELS, type ItEvent } from "../models/itEngagement";
import type { Finding } from "../models/types";

/**
 * The bottom panel: what the map is warning about, what the rules found, and what was done.
 *
 * These had nowhere to go before. `projectMap` has always produced warnings and `assessProject`
 * findings, and on the map neither was rendered anywhere — output nobody could see, which is the
 * same as output that does not exist. A connection whose endpoints vanished used to disappear in
 * silence.
 */

type BottomTab = "warnings" | "findings" | "events";

interface MapBottomPanelProps {
  warnings: string[];
  findings: Finding[];
  events: ItEvent[];
  selectedId: string | null;
  /** Findings carry asset ids, and `it:10.10.2.30` is not something a reader recognises. */
  nameOf: (assetId: string) => string;
  onSelect: (id: string) => void;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export function MapBottomPanel({ warnings, findings, events, selectedId, nameOf, onSelect }: MapBottomPanelProps) {
  // Opens on whatever has something to say. A panel that always opens on an empty tab teaches the
  // reader that it is empty, and they stop looking.
  const [tab, setTab] = useState<BottomTab>(warnings.length > 0 ? "warnings" : "findings");

  const ranked = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const tabs: Array<{ id: BottomTab; label: string; count: number }> = [
    { id: "warnings", label: "Warnings", count: warnings.length },
    { id: "findings", label: "Findings", count: findings.length },
    { id: "events", label: "Events", count: events.length }
  ];

  return (
    <section className="map-bottom" aria-label="Warnings, findings and events">
      <div className="map-bottom-tabs" role="tablist" aria-label="Bottom panel">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? "active" : ""}
            onClick={() => setTab(entry.id)}
          >
            {entry.label} <small>{entry.count}</small>
          </button>
        ))}
      </div>

      <div className="map-bottom-body">
        {tab === "warnings" ? (
          warnings.length === 0 ? (
            <p className="muted">Nothing to report about how this map was assembled.</p>
          ) : (
            <ul className="map-bottom-list">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "findings" ? (
          ranked.length === 0 ? (
            <p className="muted">No rule fired. On a freshly imported estate that mostly means little is modelled yet.</p>
          ) : (
            <ul className="map-bottom-list">
              {ranked.map((finding) => (
                <li key={finding.id}>
                  <strong>{finding.severity}</strong> {finding.title}
                  {finding.affectedAssetIds.length > 0 ? (
                    <span className="map-bottom-affected">
                      {finding.affectedAssetIds.map((assetId) => (
                        <button
                          key={assetId}
                          type="button"
                          className={assetId === selectedId ? "is-selected" : ""}
                          onClick={() => onSelect(assetId)}
                        >
                          {nameOf(assetId)}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "events" ? (
          events.length === 0 ? (
            <p className="muted">Nothing recorded.</p>
          ) : (
            <ul className="map-bottom-list">
              {[...events]
                .sort((a, b) => a.sequence - b.sequence)
                .map((event) => (
                  <li key={event.id}>
                    <strong>{EVENT_KIND_LABELS[event.kind]}</strong> {event.title}
                  </li>
                ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  );
}

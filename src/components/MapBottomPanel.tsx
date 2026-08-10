import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { ACCESS_LABELS, EVENT_KIND_LABELS, type ItEvent } from "../models/itEngagement";
import type { MovementView } from "../engine/movement";

/**
 * How this map was assembled, and what was done to the estate.
 *
 * Both had nowhere to go before: `projectMap` has always produced warnings and nothing rendered
 * them, so a connection whose endpoints vanished disappeared in silence.
 *
 * Findings deliberately live in the analysis panel and not here. Two lists of findings that can
 * disagree is precisely the failure this programme keeps fixing, and the assessment is the one that
 * can say why a rule fired.
 */

type BottomTab = "movement" | "warnings" | "events";

interface MapBottomPanelProps {
  warnings: string[];
  /** What the named foothold reaches. `fromId` is null until the operator names one. */
  movement: MovementView;
  footholdName: string | null;
  events: ItEvent[];
  /** An event names an asset id, and `it:10.10.2.30` is not something a reader recognises. */
  nameOf: (assetId: string) => string;
  onSelect: (id: string) => void;
  onRecordEvent: () => void;
  onDeleteEvent: (eventId: string) => void;
  /** Closed by default: it is a place to look things up, not a thing to read. */
  open: boolean;
  onToggleOpen: () => void;
}

export function MapBottomPanel({
  warnings,
  movement,
  footholdName,
  events,
  nameOf,
  onSelect,
  onRecordEvent,
  onDeleteEvent,
  open,
  onToggleOpen
}: MapBottomPanelProps) {
  // Opens on whatever has something to say. A panel that always opens on an empty tab teaches the
  // reader that it is empty, and they stop looking.
  const [tab, setTab] = useState<BottomTab>("movement");

  const tabs: Array<{ id: BottomTab; label: string; count: number }> = [
    { id: "movement", label: "Movement", count: movement.hops.length },
    { id: "warnings", label: "Warnings", count: warnings.length },
    { id: "events", label: "Events", count: events.length }
  ];

  return (
    <section className={`map-bottom${open ? "" : " is-collapsed"}`} aria-label="Warnings, findings and events">
      <div className="map-bottom-tabs" role="tablist" aria-label="Bottom panel">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={open && tab === entry.id}
            className={open && tab === entry.id ? "active" : ""}
            // Picking a tab on a shut panel means "show me that", not "select it and stay shut".
            onClick={() => {
              setTab(entry.id);
              if (!open || tab === entry.id) {
                onToggleOpen();
              }
            }}
          >
            {entry.label} <small>{entry.count}</small>
          </button>
        ))}
        <button
          type="button"
          className="map-bottom-toggle"
          aria-expanded={open}
          title={open ? "Collapse this panel" : "Expand this panel"}
          onClick={onToggleOpen}
        >
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          <span className="visually-hidden">{open ? "Collapse" : "Expand"} warnings, findings and events</span>
        </button>
      </div>

      <div className="map-bottom-body" hidden={!open}>
        {tab === "movement" ? (
          movement.fromId === null ? (
            <p className="muted">
              Pick an asset and choose <strong>Work from here</strong> to see what it reaches.
            </p>
          ) : (
            <>
              <p className="muted">
                From <strong>{footholdName}</strong>: {movement.hops.length} reachable,{" "}
                {movement.unreachable.length} not.
              </p>
              <ul className="map-bottom-list">
                {movement.hops.map((hop) => (
                  <li key={hop.assetId}>
                    <strong>{nameOf(hop.assetId)}</strong>
                    <span className="map-bottom-affected">
                      <button type="button" onClick={() => onSelect(hop.assetId)}>
                        {hop.distance === 1 ? "adjacent" : `${hop.distance} hops`}
                      </button>
                      {/* The route's weakest link, not the nearest one. An inferred hop is a guess
                          about addressing, and a list that hid that would be worth acting on right
                          up until it was wrong. */}
                      <span className="map-hop-evidence" data-evidence={hop.weakestEvidence}>
                        {hop.weakestEvidence}
                      </span>
                      {hop.access !== "none" ? (
                        <span className="map-hop-access">{ACCESS_LABELS[hop.access]}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

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

        {tab === "events" ? (
          <>
            <div className="map-bottom-actions">
              <button type="button" className="text-button compact" onClick={onRecordEvent}>
                Record what you did
              </button>
            </div>
            {events.length === 0 ? (
              <p className="muted">Nothing recorded.</p>
            ) : (
              <ul className="map-bottom-list">
                {[...events]
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((event) => (
                    <li key={event.id}>
                      <strong>{EVENT_KIND_LABELS[event.kind]}</strong> {event.title}
                      {event.targetNodeId ? <span className="map-bottom-affected">
                        <button type="button" onClick={() => onSelect(event.targetNodeId!)}>
                          {nameOf(event.targetNodeId)}
                        </button>
                      </span> : null}
                      <button
                        type="button"
                        className="text-button compact"
                        onClick={() => onDeleteEvent(event.id)}
                        title="Delete this entry, withdrawing the access and the attack edge it granted"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

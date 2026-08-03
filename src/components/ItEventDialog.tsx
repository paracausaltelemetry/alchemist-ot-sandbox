import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  ACCESS_LABELS,
  EVENT_KIND_LABELS,
  EXTERNAL_ORIGIN,
  IT_ACCESS_LADDER,
  IT_EVENT_KINDS,
  type ItAccessState,
  type ItEvent,
  type ItEventKind
} from "../models/itEngagement";
import type { ItNode } from "../models/itMap";

export type ItEventDraft = Pick<
  ItEvent,
  "kind" | "title" | "sourceNodeId" | "targetNodeId" | "grants" | "cve" | "attackTechnique" | "note"
>;

interface ItEventDialogProps {
  open: boolean;
  nodes: ItNode[];
  /** Pre-fills the endpoints when the entry was started by drawing a line between two hosts. */
  initial?: { sourceNodeId?: string; targetNodeId?: string };
  onConfirm: (draft: ItEventDraft) => void;
  onCancel: () => void;
}

/**
 * Records one stage of the engagement.
 *
 * Every field except the title is optional, because the alternative is an operator who stops
 * writing entries mid-engagement. What is *not* optional is the distinction the fixed `kind` set
 * carries: "SMB open on 10.10.2.40" is a scanner line, and "SMB on 10.10.2.40, exploited at stage 4
 * for SYSTEM" is a pentest, and only the second is worth putting in front of a client.
 *
 * CVE and technique are free text on purpose. A catalogue picker would make the common case — a
 * finding with no CVE and no neat ATT&CK id — the awkward one.
 */
export function ItEventDialog({ open, nodes, initial, onConfirm, onCancel }: ItEventDialogProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [kind, setKind] = useState<ItEventKind>("exploit");
  const [title, setTitle] = useState("");
  const [sourceNodeId, setSourceNodeId] = useState<string>(EXTERNAL_ORIGIN);
  const [targetNodeId, setTargetNodeId] = useState<string>("");
  const [grants, setGrants] = useState<ItAccessState | "">("");
  const [cve, setCve] = useState("");
  const [attackTechnique, setAttackTechnique] = useState("");
  const [note, setNote] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setKind("exploit");
    setTitle("");
    setSourceNodeId(initial?.sourceNodeId ?? EXTERNAL_ORIGIN);
    setTargetNodeId(initial?.targetNodeId ?? "");
    setGrants("");
    setCve("");
    setAttackTechnique("");
    setNote("");
    titleRef.current?.focus();
  }, [open, initial?.sourceNodeId, initial?.targetNodeId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const trimmed = title.trim();

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="confirm-dialog it-event-dialog" ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="it-event-title">
        <strong id="it-event-title">Record what you did</strong>

        <label className="it-link-field">
          <span>What happened</span>
          <input
            ref={titleRef}
            value={title}
            maxLength={90}
            placeholder="Exploited SMB for SYSTEM"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="it-event-row">
          <label className="it-link-field">
            <span>Stage</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as ItEventKind)}>
              {IT_EVENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {EVENT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="it-link-field">
            <span>Access reached</span>
            <select value={grants} onChange={(event) => setGrants(event.target.value as ItAccessState | "")}>
              <option value="">Nothing gained</option>
              {IT_ACCESS_LADDER.filter((state) => state !== "none").map((state) => (
                <option key={state} value={state}>
                  {ACCESS_LABELS[state]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="it-event-row">
          <label className="it-link-field">
            <span>From</span>
            <select value={sourceNodeId} onChange={(event) => setSourceNodeId(event.target.value)}>
              <option value={EXTERNAL_ORIGIN}>Outside the map</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>

          <label className="it-link-field">
            <span>Against</span>
            <select value={targetNodeId} onChange={(event) => setTargetNodeId(event.target.value)}>
              <option value="">No single host</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="it-event-row">
          <label className="it-link-field">
            <span>CVE (optional)</span>
            <input value={cve} maxLength={30} placeholder="CVE-2017-0144" onChange={(event) => setCve(event.target.value)} />
          </label>
          <label className="it-link-field">
            <span>Technique (optional)</span>
            <input
              value={attackTechnique}
              maxLength={60}
              placeholder="Pass-the-hash"
              onChange={(event) => setAttackTechnique(event.target.value)}
            />
          </label>
        </div>

        <label className="it-link-field">
          <span>Notes (optional)</span>
          <textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
        </label>

        {/*
          Stated rather than designed around. An event has to name hosts that are on the map, so
          "found a domain controller I could never reach" has nowhere to go in this version. Saying
          so is better than letting the operator discover it when the report comes out short.
        */}
        <p className="muted">
          Only hosts already on the map can be named. Something you found but never reached has no
          place to go yet.
        </p>

        <div className="confirm-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="text-button primary"
            disabled={trimmed.length === 0}
            onClick={() =>
              onConfirm({
                kind,
                title: trimmed,
                sourceNodeId,
                ...(targetNodeId ? { targetNodeId } : {}),
                ...(grants ? { grants } : {}),
                ...(cve.trim() ? { cve: cve.trim() } : {}),
                ...(attackTechnique.trim() ? { attackTechnique: attackTechnique.trim() } : {}),
                ...(note.trim() ? { note: note.trim() } : {})
              })
            }
          >
            Record it
          </button>
        </div>
      </div>
    </div>
  );
}

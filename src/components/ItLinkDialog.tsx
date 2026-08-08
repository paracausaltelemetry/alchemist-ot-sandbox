import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ItLinkDialogProps {
  open: boolean;
  sourceName: string;
  targetName: string;
  onConfirm: (label: string, note: string) => void;
  /** Chosen when the line records an action rather than a cable; hands off to the journal form. */
  onRecordAction: () => void;
  onCancel: () => void;
}

type LinkPurpose = "connectivity" | "action";

/**
 * Asked whenever the operator draws a link.
 *
 * The map already distinguishes what the scan traced from what we inferred; a drawn link is a third
 * thing, and it needs saying what it is or the map becomes an undifferentiated pile of lines that
 * nobody can read back at reporting time. A label is required for exactly that reason — an unnamed
 * line is a line whose meaning is gone by the time the report is written.
 */
export function ItLinkDialog({ open, sourceName, targetName, onConfirm, onRecordAction, onCancel }: ItLinkDialogProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [purpose, setPurpose] = useState<LinkPurpose>("action");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPurpose("action");
      setLabel("");
      setNote("");
      // Focused on open rather than via `autoFocus`, which jsx-a11y rejects: the dialog is modal
      // and the operator has just finished a drag, so the caret belongs in the one field there is.
      labelRef.current?.focus();
    }
  }, [open]);

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

  const trimmed = label.trim();

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="confirm-dialog it-link-dialog" ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="it-link-dialog-title">
        <strong id="it-link-dialog-title">What is this line?</strong>
        <p>
          {sourceName} &rarr; {targetName}.
        </p>

        {/*
          The question that keeps the map readable. Without it every drawn line means "these two are
          related somehow", and by reporting time nobody can tell a cable from a compromise. Recording
          an action is the default because it is why the operator is drawing between two hosts at all.
        */}
        <fieldset className="import-mode">
          <label className="toggle-row">
            <input
              type="radio"
              name="it-link-purpose"
              checked={purpose === "action"}
              onChange={() => setPurpose("action")}
            />
            <span>Something I did — records a stage of the engagement</span>
          </label>
          <label className="toggle-row">
            <input
              type="radio"
              name="it-link-purpose"
              checked={purpose === "connectivity"}
              onChange={() => setPurpose("connectivity")}
            />
            <span>Connectivity — a path the scan could not see</span>
          </label>
        </fieldset>

        {purpose === "connectivity" ? (
          <>
            <label className="it-link-field">
              <span>What is it</span>
              <input
                ref={labelRef}
                value={label}
                maxLength={60}
                placeholder="Management VLAN trunk"
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>

            <label className="it-link-field">
              <span>How you know (optional)</span>
              <textarea
                value={note}
                rows={2}
                placeholder="Seen in the switch config on core-rtr."
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </>
        ) : null}

        <div className="confirm-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="text-button primary"
            disabled={purpose === "connectivity" && trimmed.length === 0}
            onClick={() => (purpose === "action" ? onRecordAction() : onConfirm(trimmed, note.trim()))}
          >
            {purpose === "action" ? "Describe what you did" : "Draw link"}
          </button>
        </div>
      </div>
    </div>
  );
}

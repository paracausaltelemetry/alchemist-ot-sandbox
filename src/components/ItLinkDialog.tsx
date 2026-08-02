import { useEffect, useRef, useState } from "react";

interface ItLinkDialogProps {
  open: boolean;
  sourceName: string;
  targetName: string;
  onConfirm: (label: string, note: string) => void;
  onCancel: () => void;
}

/**
 * Asked whenever the operator draws a link.
 *
 * The map already distinguishes what the scan traced from what we inferred; a drawn link is a third
 * thing, and it needs saying what it is or the map becomes an undifferentiated pile of lines that
 * nobody can read back at reporting time. A label is required for exactly that reason — an unnamed
 * line is a line whose meaning is gone by the time the report is written.
 */
export function ItLinkDialog({ open, sourceName, targetName, onConfirm, onCancel }: ItLinkDialogProps) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
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
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="it-link-dialog-title">
        <strong id="it-link-dialog-title">Describe this link</strong>
        <p>
          {sourceName} &rarr; {targetName}. The map will draw it as something you observed, distinct from what the scan
          traced and from what Alchemist inferred.
        </p>

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

        <div className="confirm-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="text-button primary"
            disabled={trimmed.length === 0}
            onClick={() => onConfirm(trimmed, note.trim())}
          >
            Draw link
          </button>
        </div>
      </div>
    </div>
  );
}

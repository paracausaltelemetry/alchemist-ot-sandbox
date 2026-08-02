import { useEffect, useState } from "react";
import { type ItVantage } from "../models/itEngagement";
import type { ItNode } from "../models/itMap";

export type ItImportMode = "add" | "replace";

interface ItScanDialogProps {
  open: boolean;
  /** What the pending file said, so the operator can see what they are about to add. */
  filename: string;
  hostCount: number;
  scanCount: number;
  /** Hosts already on the map, offered as the place this scan was run from. */
  nodes: ItNode[];
  onConfirm: (mode: ItImportMode, vantage: ItVantage) => void;
  onCancel: () => void;
}

const EXTERNAL_PRESETS = ["External", "Client VPN", "Internal dropbox", "Tester laptop"];

/**
 * Asked on the second and every later import: is this another stage of the same engagement, or a
 * fresh start?
 *
 * A second scan silently replacing the first is what the view used to do, and it is the wrong
 * default for a record of an engagement — the whole reason to scan again from a compromised host
 * is to see what the first scan could not. So "add" is the default and "replace" has to be chosen.
 *
 * The vantage is asked here rather than inferred because nothing in a scan file records where it
 * was run from, and a segmentation claim means different things from a VPN, from a dropbox on the
 * client LAN, and from a machine inside the segment being described.
 */
export function ItScanDialog({ open, filename, hostCount, scanCount, nodes, onConfirm, onCancel }: ItScanDialogProps) {
  const [mode, setMode] = useState<ItImportMode>("add");
  const [vantageId, setVantageId] = useState<string>("external:External");

  useEffect(() => {
    if (open) {
      setMode("add");
      setVantageId("external:External");
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

  const vantage: ItVantage = vantageId.startsWith("node:")
    ? { kind: "node", nodeId: vantageId.slice(5) }
    : { kind: "external", label: vantageId.slice("external:".length) || "External" };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="it-scan-dialog-title">
        <strong id="it-scan-dialog-title">Add this scan to the engagement</strong>
        <p>
          {filename} found {hostCount} {hostCount === 1 ? "host" : "hosts"}. This engagement already has {scanCount}{" "}
          {scanCount === 1 ? "scan" : "scans"}.
        </p>

        <fieldset className="import-mode">
          <label className="toggle-row">
            <input type="radio" name="it-import-mode" checked={mode === "add"} onChange={() => setMode("add")} />
            <span>Add as a new scan — the map updates with whatever this scan revealed</span>
          </label>
          <label className="toggle-row">
            <input type="radio" name="it-import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
            <span>Replace the engagement — discards every earlier scan</span>
          </label>
        </fieldset>

        <label className="it-vantage-field">
          <span>Run from</span>
          <select value={vantageId} onChange={(event) => setVantageId(event.target.value)}>
            <optgroup label="Outside the map">
              {EXTERNAL_PRESETS.map((label) => (
                <option key={label} value={`external:${label}`}>
                  {label}
                </option>
              ))}
            </optgroup>
            {nodes.length > 0 ? (
              <optgroup label="A host on the map">
                {nodes.map((node) => (
                  <option key={node.id} value={`node:${node.id}`}>
                    {node.name}
                    {node.ip ? ` (${node.ip})` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <div className="confirm-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="text-button primary" onClick={() => onConfirm(mode, vantage)}>
            {mode === "add" ? "Add scan" : "Replace"}
          </button>
        </div>
      </div>
    </div>
  );
}

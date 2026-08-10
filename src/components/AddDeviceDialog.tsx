import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { assetTypes } from "../data/catalog";
import type { AssetTypeId } from "../models/types";

interface AddDeviceDialogProps {
  open: boolean;
  onConfirm: (device: { name: string; ipAddress: string; type: AssetTypeId; note: string }) => void;
  onCancel: () => void;
}

/**
 * A device somebody knows about that no scan has seen.
 *
 * Enumeration finds hosts before it finds packets from them — a domain controller named in an LDAP
 * reply, a jump host somebody mentioned, a PLC on a drawing pinned to a wall. Until now the only
 * way onto this map was through a scan file, which made the map useless during the part of the job
 * where you are still finding things.
 *
 * The address is optional and the reason is the same: half of what turns up early is a name without
 * an address, and refusing it would be refusing the finding. Given one, the device lands in the
 * segment its address belongs to, exactly as a scanned host does.
 */
export function AddDeviceDialog({ open, onConfirm, onCancel }: AddDeviceDialogProps) {
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [type, setType] = useState<AssetTypeId>("enterprise-it");
  const [note, setNote] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setIpAddress("");
      setType("enterprise-it");
      setNote("");
      nameRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const trimmed = name.trim();

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-dialog it-link-dialog"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-title"
      >
        <strong id="add-device-title">Add a device</strong>
        <p>Something you know is there that no scan has reached yet.</p>

        <label className="it-link-field">
          <span>What it is called</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="dc-02, jump-host, unknown PLC"
          />
        </label>

        <label className="it-link-field">
          <span>Address, if you have one</span>
          <input
            value={ipAddress}
            onChange={(event) => setIpAddress(event.target.value)}
            placeholder="10.10.2.15"
          />
        </label>

        <label className="it-link-field">
          <span>Kind</span>
          <select value={type} onChange={(event) => setType(event.target.value as AssetTypeId)}>
            {assetTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="it-link-field">
          <span>How you know</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Named in an LDAP referral from dc-1"
          />
        </label>

        {/* Where it came from matters more here than anywhere else on the map: this is the one
            asset with no file behind it, and in a month the note is the only evidence there is. */}
        <p className="muted">
          It will be marked as yours, not as something a scan found, and it survives every re-import.
        </p>

        <div className="confirm-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="text-button primary"
            disabled={trimmed.length === 0}
            onClick={() => onConfirm({ name: trimmed, ipAddress: ipAddress.trim(), type, note: note.trim() })}
          >
            Add it
          </button>
        </div>
      </div>
    </div>
  );
}

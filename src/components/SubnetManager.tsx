import { Plus, Trash2, X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useEffect, useRef } from "react";
import type { Asset, Subnet } from "../models/types";

interface SubnetManagerProps {
  open: boolean;
  subnets: Subnet[];
  assets: Asset[];
  onClose: () => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Subnet>) => void;
  onRemove: (id: string) => void;
}

/**
 * Lightweight create/edit/delete surface for network subnets. Subnets are logical
 * segments grouped as labelled containers in the network layout; deleting one leaves its
 * assets unassigned (handled by the caller). Reuses the shared modal-overlay styling.
 */
export function SubnetManager({ open, subnets, assets, onClose, onAdd, onUpdate, onRemove }: SubnetManagerProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const memberCount = (subnetId: string) => assets.filter((asset) => asset.subnetId === subnetId).length;

  return (
    <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="subnet-manager"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Manage subnets"
      >
        <div className="subnet-manager-head">
          <div>
            <strong>Subnets</strong>
            <p>Group assets into logical network segments shown as containers in the network layout.</p>
          </div>
          <button type="button" className="rail-collapse" onClick={onClose} title="Close" aria-label="Close subnet manager">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="subnet-manager-list">
          {subnets.length === 0 ? (
            <p className="muted subnet-manager-empty">No subnets yet. Add one, then assign assets from the inspector.</p>
          ) : (
            subnets.map((subnet) => (
              <div className="subnet-manager-row" key={subnet.id}>
                <label className="field">
                  <span>Name</span>
                  <input value={subnet.name} onChange={(event) => onUpdate(subnet.id, { name: event.target.value })} />
                </label>
                <label className="field">
                  <span>CIDR</span>
                  <input
                    value={subnet.cidr}
                    placeholder="10.0.0.0/24"
                    onChange={(event) => onUpdate(subnet.id, { cidr: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>VLAN</span>
                  <input value={subnet.vlan} onChange={(event) => onUpdate(subnet.id, { vlan: event.target.value })} />
                </label>
                <span className="subnet-manager-count" title="Assets assigned">
                  {memberCount(subnet.id)}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  title="Delete subnet"
                  aria-label={`Delete subnet ${subnet.name}`}
                  onClick={() => onRemove(subnet.id)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="subnet-manager-actions">
          <button type="button" className="text-button primary" onClick={onAdd}>
            <Plus size={15} aria-hidden="true" />
            Add subnet
          </button>
        </div>
      </div>
    </div>
  );
}

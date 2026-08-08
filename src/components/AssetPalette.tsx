import { ChevronsLeft } from "lucide-react";
import { assetTypes } from "../data/catalog";
import type { AssetTypeId } from "../models/types";
import { AssetGlyph } from "./AssetGlyph";

const groups = [
  {
    label: "Enterprise and access",
    types: ["enterprise-it", "cloud-service", "vendor-remote", "firewall", "jump-host"] satisfies AssetTypeId[]
  },
  {
    label: "Operations",
    types: ["historian", "engineering-workstation", "hmi", "scada"] satisfies AssetTypeId[]
  },
  {
    label: "Control and process",
    types: ["plc-rtu", "safety-system", "field-device", "wireless-gateway"] satisfies AssetTypeId[]
  }
];

interface AssetPaletteProps {
  onAddAsset: (typeId: AssetTypeId) => void;
  onCollapse: () => void;
}

export function AssetPalette({ onAddAsset, onCollapse }: AssetPaletteProps) {
  return (
    <aside className="asset-palette" aria-label="Asset palette">
      <div className="panel-heading">
        <span>Asset Palette</span>
        <div className="panel-heading-actions">
          <small>Click or drag</small>
          <button type="button" className="rail-collapse" onClick={onCollapse} title="Collapse palette" aria-label="Collapse asset palette">
            <ChevronsLeft size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {groups.map((group) => (
        <section className="palette-group" key={group.label}>
          <h2>{group.label}</h2>
          <div className="palette-list">
            {group.types.map((typeId) => {
              const type = assetTypes.find((item) => item.id === typeId)!;
              return (
                <button
                  type="button"
                  draggable
                  className="palette-item"
                  key={type.id}
                  title={type.description}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/alchemist-asset-type", type.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAddAsset(type.id)}
                >
                  <AssetGlyph icon={type.icon} />
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}

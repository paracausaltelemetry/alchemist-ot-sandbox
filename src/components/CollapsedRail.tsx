import { ChevronsLeft, ChevronsRight } from "lucide-react";

interface CollapsedRailProps {
  panelClassName: string;
  label: string;
  side: "left" | "right";
  onExpand: () => void;
}

/**
 * The thin stand-in shown when a side rail (palette or inspector) is collapsed.
 * Keeps the panel's grid placement via panelClassName and offers a single
 * expand affordance with a vertical label.
 */
export function CollapsedRail({ panelClassName, label, side, onExpand }: CollapsedRailProps) {
  const ExpandIcon = side === "left" ? ChevronsRight : ChevronsLeft;
  return (
    <aside className={`${panelClassName} is-collapsed`} aria-label={`${label} (collapsed)`}>
      <button type="button" className="rail-expand" onClick={onExpand} title={`Expand ${label}`} aria-expanded={false}>
        <ExpandIcon size={16} aria-hidden="true" />
        <span className="rail-label">{label}</span>
      </button>
    </aside>
  );
}

import { PanelLeftOpen, PanelRightOpen } from "lucide-react";

/**
 * What is left of a collapsed sidebar.
 *
 * A rail rather than nothing at all: a panel that vanishes completely takes its own way back with
 * it, and the operator is left hunting a menu for a thing they closed by accident. Two centimetres
 * of edge keeps the affordance where the panel was.
 */
export function PanelRail({
  side,
  label,
  onExpand
}: {
  side: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  return (
    <div className="panel-rail" data-side={side}>
      <button type="button" onClick={onExpand} aria-expanded={false} title={`Show ${label.toLowerCase()}`}>
        <Icon size={15} aria-hidden="true" />
        <span className="visually-hidden">Show {label.toLowerCase()}</span>
      </button>
      <span className="panel-rail-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

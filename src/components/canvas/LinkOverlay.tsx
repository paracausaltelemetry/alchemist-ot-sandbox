import type { Point } from "../../models/types";

/**
 * One drawn link. Both canvases route their own paths — the OT canvas from conduits, the IT
 * canvas from scan evidence — and hand the result here so the SVG layer itself stays shared.
 * The class names are load-bearing: `nodes-edges.css` and `canvas-modes.css` style them.
 */
export interface LinkOverlayItem {
  id: string;
  path: string;
  color: string;
  opacity: number;
  /** Arrowheads: omit for an undirected link. */
  markerStart?: boolean;
  markerEnd?: boolean;
  dash?: string;
  selected: boolean;
  highlighted: boolean;
  label?: string;
  labelX?: number;
  labelY?: number;
  /** Whether the label slot is showing, which the CSS keys off separately from the text itself. */
  labelVisible?: boolean;
  /** Small circles marking where the link crosses a trust boundary. */
  markers?: Point[];
}

interface LinkOverlayProps {
  items: LinkOverlayItem[];
  width: number;
  height: number;
  onSelect: (id: string) => void;
}

export function LinkOverlay({ items, width, height, onSelect }: LinkOverlayProps) {
  return (
    <svg className="conduit-overlay" aria-hidden="true" style={{ width, height }}>
      <defs>
        <marker
          id="conduit-arrow"
          viewBox="0 0 12 12"
          refX="10.5"
          refY="6"
          markerWidth="11"
          markerHeight="11"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1.5,1.5 L11,6 L1.5,10.5 z" fill="context-stroke" />
        </marker>
      </defs>
      {items.map((item) => (
        <g
          className={`conduit-overlay-edge ${item.labelVisible ? "label-visible" : ""} ${item.selected ? "is-selected" : ""} ${
            item.highlighted ? "is-highlighted" : ""
          }`}
          key={item.id}
        >
          {item.highlighted || item.selected ? (
            <path
              className="conduit-overlay-underlay"
              d={item.path}
              style={{ stroke: item.highlighted ? "#e5484d" : "var(--accent)" }}
            />
          ) : null}
          <path
            className="conduit-overlay-path"
            d={item.path}
            markerStart={item.markerStart ? "url(#conduit-arrow)" : undefined}
            markerEnd={item.markerEnd ? "url(#conduit-arrow)" : undefined}
            style={{ stroke: item.color, opacity: item.opacity, strokeDasharray: item.dash }}
          />
          {item.highlighted || item.selected ? <path className="conduit-overlay-flow" d={item.path} /> : null}
          <path
            className="conduit-overlay-hitbox"
            d={item.path}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item.id);
            }}
          />
          {(item.markers ?? []).map((marker, index) => (
            <circle
              className="conduit-overlay-boundary"
              cx={marker.x}
              cy={marker.y}
              key={`${item.id}-marker-${index}`}
              r="5"
              style={{ stroke: item.color }}
            />
          ))}
          {item.label ? (
            <text
              className="conduit-overlay-label"
              x={(item.labelX ?? 0) + 8}
              y={(item.labelY ?? 0) - 8}
              style={{ fill: item.color }}
            >
              {item.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

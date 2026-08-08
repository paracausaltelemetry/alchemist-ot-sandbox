import { bucketStyle } from "./canvas/overlayStyle";
import type { Overlay } from "../engine/overlays";

/**
 * The active overlay's key, rendered from the overlay's own bucket list.
 *
 * There is no second list to maintain. Both canvases used to write their legend out by hand beside
 * the switch that coloured the canvas, which is how a legend comes to describe something the canvas
 * stopped doing. Here the legend is the buckets, and the canvas can only draw a bucket.
 */

export function MapLegend({ overlay }: { overlay: Overlay }) {
  return (
    <aside className="map-legend" aria-label={`${overlay.label} legend`}>
      <h4>{overlay.label}</h4>
      <ul>
        {overlay.buckets.map((bucket) => (
          <li key={bucket.id}>
            <i
              className="map-legend-swatch"
              data-pattern={bucket.pattern ?? "ramp"}
              data-signal={bucket.signal ? "true" : undefined}
              style={bucketStyle(bucket)}
              aria-hidden="true"
            />
            {bucket.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

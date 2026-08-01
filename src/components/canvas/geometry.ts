import type { Point } from "../../models/types";

/**
 * The drawing area the flow-space layers (zone bands, subnet boxes, the link overlay) have to
 * cover. React Flow only sizes the nodes themselves, so anything painted behind or between them
 * needs an explicit extent, and it has to grow with the content or long topologies get clipped.
 */
export interface OverlayExtent {
  bandWidth: number;
  overlayWidth: number;
  overlayHeight: number;
}

export interface OverlayExtentOptions {
  nodeWidth: number;
  nodeHeight: number;
  minBandWidth?: number;
  minOverlayWidth?: number;
  minOverlayHeight?: number;
}

export function overlayExtent(positions: Iterable<Point>, options: OverlayExtentOptions): OverlayExtent {
  const { nodeWidth, nodeHeight, minBandWidth = 1900, minOverlayWidth = 2600, minOverlayHeight = 1450 } = options;

  let maxX = 0;
  let maxY = 0;
  for (const position of positions) {
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }

  return {
    bandWidth: Math.max(minBandWidth, maxX + nodeWidth + 600),
    overlayWidth: Math.max(minOverlayWidth, maxX + nodeWidth + 400),
    overlayHeight: Math.max(minOverlayHeight, maxY + nodeHeight + 400)
  };
}

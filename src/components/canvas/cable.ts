import { DEVICE_WIDTH } from "../../data/mapLayout";
import type { Point } from "../../models/types";

/**
 * Where a cable meets a device.
 *
 * A node is 128x104 but the symbol is a ~50px plate near the top, with the name and address
 * underneath. Anchoring at the node's centre would have every cable terminate in the hostname,
 * which looks like a mistake and obscures the one field a reader is scanning for.
 *
 * The routing itself lives in `engine/tubeRouting`. This is only the geometry of the endpoint,
 * shared by the canvas and the printed stage maps so a cable meets a symbol the same way in both.
 */

/** Distance from a node's top-left to the centre of its symbol plate. See `.map-device` styles. */
export const SYMBOL_CENTRE_X = DEVICE_WIDTH / 2;
export const SYMBOL_CENTRE_Y = 31;

/** Half the plate, plus a little air so the line stops short of the border rather than touching. */
const SYMBOL_RADIUS = 29;

/** Half the plate itself, for anything that needs the symbol's footprint rather than its edge. */
export const SYMBOL_HALF = 25;

export const symbolCentre = (position: Point): Point => ({
  x: position.x + SYMBOL_CENTRE_X,
  y: position.y + SYMBOL_CENTRE_Y
});

/**
 * Trims the line back to the edge of each symbol, so an arrow head sits beside the icon rather
 * than under it.
 *
 * Trimmed against a square, because the plate is a square. A constant-radius circular trim stops
 * the line at the same distance in every direction, which on a diagonal is *inside* the plate's
 * corner — the cable would run under the border and out the other side. Scaling by the larger of
 * the two deltas puts the endpoint on the plate's boundary whichever way the cable leaves.
 */
export function trimToPlate(from: Point, towards: Point): Point {
  const dx = towards.x - from.x;
  const dy = towards.y - from.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (span === 0) {
    return from;
  }
  const scale = SYMBOL_RADIUS / span;
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}


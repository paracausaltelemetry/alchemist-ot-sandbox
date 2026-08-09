import { DEVICE_WIDTH } from "../../data/mapLayout";
import type { Point } from "../../models/types";

/**
 * A cable between two device symbols.
 *
 * Straight, and anchored to the symbol rather than to the node.
 *
 * The orthogonal router this replaces was written for 212px cards, where a right-angled path
 * between two box edges reads as a considered route. Between symbols it does not: the elbows land
 * in the middle of a subnet enclosure and the eye follows the corner instead of the connection.
 * Every network diagram anybody has drawn by hand uses a straight line, and the reason is that a
 * straight line between two icons has exactly one reading.
 *
 * A node is 128x104 but the symbol is a ~50px plate near the top, with the name and address
 * underneath. Anchoring at the node's centre would have every cable terminate in the label text,
 * which looks like a mistake and obscures the one field a reader is scanning for.
 */

/** Distance from a node's top-left to the centre of its symbol plate. See `.map-device` styles. */
export const SYMBOL_CENTRE_X = DEVICE_WIDTH / 2;
export const SYMBOL_CENTRE_Y = 31;

/** Half the plate, plus a little air so the line stops short of the border rather than touching. */
const SYMBOL_RADIUS = 29;

export interface Cable {
  path: string;
  labelX: number;
  labelY: number;
}

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
function trim(from: Point, towards: Point): Point {
  const dx = towards.x - from.x;
  const dy = towards.y - from.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (span === 0) {
    return from;
  }
  const scale = SYMBOL_RADIUS / span;
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export function cableBetween(sourceAt: Point, targetAt: Point): Cable {
  const from = trim(symbolCentre(sourceAt), symbolCentre(targetAt));
  const to = trim(symbolCentre(targetAt), symbolCentre(sourceAt));

  return {
    path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    labelX: (from.x + to.x) / 2,
    labelY: (from.y + to.y) / 2
  };
}

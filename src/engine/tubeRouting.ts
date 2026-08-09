import type { MapEnclosure } from "../data/mapLayout";
import { trimToPlate } from "../components/canvas/cable";
import type { Point } from "../models/types";

/**
 * Cable routing, in the manner of a transit diagram.
 *
 * Straight symbol-to-symbol lines were an improvement on right-angled routes between card edges,
 * and they stop being one the moment a router serves four hosts: four diagonals fanning out of one
 * icon at four different angles, crossing the enclosure border at four different places. The eye
 * has nothing to follow.
 *
 * A tube map solves this with three rules, and they are the ones applied here.
 *
 *  1. **Octolinear.** Every segment is horizontal, vertical, or at 45 degrees. Nothing else. An
 *     arbitrary angle carries no information, and a reader who has learned that lines only run
 *     three ways can follow one across a crossing without tracing it.
 *  2. **Trunk and spur.** Cables heading into the same segment share one drop and one horizontal
 *     run, then spur off individually. This is what makes it read as cable management rather than
 *     as string art: the shared part of the journey is drawn once.
 *  3. **Lanes.** Cables sharing a corridor sit side by side at a fixed pitch rather than on top of
 *     one another, the way the Circle and Hammersmith & City lines do between Paddington and
 *     Liverpool Street. Overlaid, two cables look like one; offset, the count is readable.
 *
 * Deliberately not a general graph router. It exploits the fact that this layout has exactly one
 * shape — a spine of routing kit above a row of subnet enclosures — because a general router
 * produces defensible paths that no two of which look alike, and uniformity is the entire point.
 */

/** Pitch between cables sharing a corridor. Wide enough to read at the default zoom. */
const LANE_PITCH = 7;

/** How far above an enclosure its trunk line runs. */
const TRUNK_OFFSET = 22;

/**
 * Corner radius. One value, everywhere.
 *
 * Uniformity is the point: a diagram whose corners vary looks hand-drawn, and the reader starts
 * reading meaning into the variation. Only clamped when a segment is genuinely too short to hold
 * the arc, which the layout's spacing makes rare.
 */
const CORNER = 10;

export interface CableEnd {
  /** Centre of the device's symbol. */
  at: Point;
  /** The enclosure it sits in, when it sits in one. */
  enclosureId?: string;
}

export interface CableRequest {
  id: string;
  from: CableEnd;
  to: CableEnd;
}

export interface RoutedCable {
  id: string;
  path: string;
  labelX: number;
  labelY: number;
}

const isHorizontal = (a: Point, b: Point) => Math.abs(a.y - b.y) < 0.5;
const isVertical = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5;

/**
 * The corridor a cable occupies, as a key.
 *
 * Two cables share a lane group when they run along the same trunk — the same horizontal line, or
 * the same vertical drop. Rounded to the pitch so that two routes computed a fraction apart still
 * count as the same corridor; without the rounding, bundling silently never happens.
 */
function corridorOf(points: Point[]): string | null {
  // A straight run is all corridor. Three cables between four devices on one spine lie exactly on
  // top of each other otherwise, which is the Circle and Hammersmith & City problem in its purest
  // form: the picture shows one line where there are three.
  const trunk = points.length === 2 ? points : points.slice(1, -1);
  if (trunk.length < 2) {
    return null;
  }
  const [a, b] = trunk;
  if (isHorizontal(a, b)) {
    return `h:${Math.round(a.y / LANE_PITCH)}`;
  }
  if (isVertical(a, b)) {
    return `v:${Math.round(a.x / LANE_PITCH)}`;
  }
  return null;
}

/**
 * The polyline for one cable, before lanes are applied.
 *
 * Three shapes, in order of preference:
 *
 * - **Straight**, when the two ends already line up. Two spine devices at the same height are
 *   joined by one horizontal segment, which is both the shortest path and the clearest.
 * - **Trunk and spur**, when one end is inside an enclosure. Drop to the trunk line above the box,
 *   run along it, then spur down. Every cable into that box uses the same trunk, so they bundle.
 * - **A single dogleg** otherwise: out, across, in. Never more than two corners, because a third
 *   makes a route that has to be traced rather than read.
 */
function polylineFor(request: CableRequest, enclosures: Map<string, MapEnclosure>): Point[] {
  const { from, to } = request;

  if (isHorizontal(from.at, to.at) || isVertical(from.at, to.at)) {
    return [from.at, to.at];
  }

  // Prefer the destination's trunk: a cable is normally arriving somewhere, and the shared part of
  // the journey is the arrival.
  const box = enclosures.get(to.enclosureId ?? "") ?? enclosures.get(from.enclosureId ?? "");
  const trunkY = box ? box.y - TRUNK_OFFSET : (from.at.y + to.at.y) / 2;

  return [from.at, { x: from.at.x, y: trunkY }, { x: to.at.x, y: trunkY }, to.at];
}

/**
 * Shifts a polyline sideways into its lane.
 *
 * Applied to the trunk only. Moving the endpoints too would pull every cable off the symbol it is
 * attached to, which is the one place a cable must be exact.
 */
function toLane(points: Point[], offset: number): Point[] {
  if (offset === 0) {
    return points;
  }

  // A straight run shifts whole. Its ends come off the symbol's centre line by the offset, which is
  // well inside the plate, so the cable still meets the icon — and three of them now read as three.
  if (points.length === 2) {
    const [a, b] = points;
    return isHorizontal(a, b)
      ? [
          { x: a.x, y: a.y + offset },
          { x: b.x, y: b.y + offset }
        ]
      : [
          { x: a.x + offset, y: a.y },
          { x: b.x + offset, y: b.y }
        ];
  }

  if (points.length < 4) {
    return points;
  }
  const [start, ...rest] = points;
  const end = rest.pop()!;
  const [a, b] = rest;

  if (isHorizontal(a, b)) {
    const y = a.y + offset;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  const x = a.x + offset;
  return [start, { x, y: start.y }, { x, y: end.y }, end];
}

/**
 * Coordinates land on whole units.
 *
 * A stroke on a half-unit boundary is spread across two device pixels by the rasteriser, which is
 * most of what "fuzzy" means for a line drawing. The trims and lane offsets produce fractions, so
 * they are rounded out here rather than left for the renderer to smear.
 */
const snap = (value: number) => Math.round(value);

/**
 * A true quarter-circle corner.
 *
 * `Q` was wrong for this: a quadratic through the corner point is not a circular arc, so two
 * corners of the same nominal radius have visibly different curvature depending on how the control
 * point falls. `A` asks the renderer for a circle, which is what a transit diagram draws and what
 * makes every corner on the map look like every other one.
 */
function corner(previous: Point, at: Point, next: Point): string {
  const into = Math.hypot(at.x - previous.x, at.y - previous.y);
  const outOf = Math.hypot(next.x - at.x, next.y - at.y);
  const radius = Math.min(CORNER, into / 2, outOf / 2);
  if (radius < 1) {
    return `L ${snap(at.x)} ${snap(at.y)}`;
  }

  const towards = (a: Point, b: Point, distance: number): Point => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) / length) * distance, y: a.y + ((b.y - a.y) / length) * distance };
  };

  const start = towards(at, previous, radius);
  const finish = towards(at, next, radius);
  // Which way the corner turns decides the sweep; get it wrong and the arc bulges outward into a
  // loop rather than cutting the corner.
  const cross = (at.x - previous.x) * (next.y - at.y) - (at.y - previous.y) * (next.x - at.x);
  const sweep = cross > 0 ? 1 : 0;

  return `L ${snap(start.x)} ${snap(start.y)} A ${radius} ${radius} 0 0 ${sweep} ${snap(finish.x)} ${snap(finish.y)}`;
}

function toPath(points: Point[]): string {
  const [head, ...rest] = points;
  let path = `M ${snap(head.x)} ${snap(head.y)}`;
  for (let index = 0; index < rest.length; index += 1) {
    const at = rest[index];
    const next = rest[index + 1];
    path += next ? ` ${corner(points[index], at, next)}` : ` L ${snap(at.x)} ${snap(at.y)}`;
  }
  return path;
}

/**
 * Pulls both ends back to the edge of their symbol plate.
 *
 * Done after lanes rather than before, because the lane offset changes the direction the cable
 * leaves by — trim first and the endpoint sits at the wrong point on the plate.
 */
function trimEnds(points: Point[]): Point[] {
  if (points.length < 2) {
    return points;
  }
  const next = [...points];
  next[0] = trimToPlate(next[0], next[1]);
  next[next.length - 1] = trimToPlate(next[next.length - 1], next[next.length - 2]);
  return next;
}

/** The midpoint of the longest segment: the one stretch with room for a label. */
function labelAt(points: Point[]): Point {
  let best = { at: points[0], length: -1 };
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best.length) {
      best = { at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, length };
    }
  }
  return best.at;
}

export function routeCables(requests: CableRequest[], enclosures: MapEnclosure[]): RoutedCable[] {
  const boxes = new Map(enclosures.map((box) => [box.id, box] as const));
  const drafted = requests.map((request) => ({ request, points: polylineFor(request, boxes) }));

  // --- Lanes ---------------------------------------------------------------
  // Grouped by corridor, then ordered within the group so the assignment is stable: a cable must
  // not change lane because an unrelated one was added, or the whole diagram reshuffles on import.
  const byCorridor = new Map<string, string[]>();
  for (const { request, points } of drafted) {
    const corridor = corridorOf(points);
    if (corridor) {
      byCorridor.set(corridor, [...(byCorridor.get(corridor) ?? []), request.id]);
    }
  }
  for (const [corridor, ids] of byCorridor) {
    byCorridor.set(corridor, [...ids].sort());
  }

  return drafted.map(({ request, points }) => {
    const corridor = corridorOf(points);
    const lane = corridor ? byCorridor.get(corridor)! : [];
    const index = lane.indexOf(request.id);
    // Centred on the corridor, so a single cable sits exactly where it would have without lanes and
    // adding a second pushes both apart rather than shunting the first sideways.
    const offset = index < 0 ? 0 : (index - (lane.length - 1) / 2) * LANE_PITCH;
    const laid = trimEnds(toLane(points, offset));

    const label = labelAt(laid);
    return { id: request.id, path: toPath(laid), labelX: label.x, labelY: label.y };
  });
}

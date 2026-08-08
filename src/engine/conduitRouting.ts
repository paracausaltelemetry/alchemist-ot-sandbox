import type { Point } from "../models/types";

export interface RouteBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrthogonalRoute {
  path: string;
  labelX: number;
  labelY: number;
  boundaryX: number;
  boundaryY: number;
  points: Point[];
}

function center(box: RouteBox): Point {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function roundedOrthogonalPath(points: Point[], radius = 18) {
  if (points.length < 2) {
    return "";
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const nextLength = Math.hypot(next.x - current.x, next.y - current.y);
    const bendRadius = Math.min(radius, previousLength / 2, nextLength / 2);

    if (bendRadius <= 0) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const incoming = {
      x: current.x - Math.sign(current.x - previous.x) * bendRadius,
      y: current.y - Math.sign(current.y - previous.y) * bendRadius
    };
    const outgoing = {
      x: current.x + Math.sign(next.x - current.x) * bendRadius,
      y: current.y + Math.sign(next.y - current.y) * bendRadius
    };

    path += ` L ${incoming.x} ${incoming.y} Q ${current.x} ${current.y} ${outgoing.x} ${outgoing.y}`;
  }

  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function routeLabel(points: Point[]) {
  const midpointIndex = Math.floor((points.length - 1) / 2);
  const first = points[midpointIndex];
  const second = points[midpointIndex + 1] ?? first;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

export function routeOrthogonalConduit(source: RouteBox, target: RouteBox, trackOffset: number): OrthogonalRoute {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const useHorizontalRoute = Math.abs(dx) >= Math.abs(dy) * 0.55;
  const outsidePadding = 86;
  let points: Point[];

  if (useHorizontalRoute) {
    const sourceOnLeft = sourceCenter.x <= targetCenter.x;
    const start: Point = {
      x: sourceOnLeft ? source.x + source.width : source.x,
      y: sourceCenter.y + trackOffset
    };
    const end: Point = {
      x: sourceOnLeft ? target.x : target.x + target.width,
      y: targetCenter.y + trackOffset
    };
    const gap = sourceOnLeft ? target.x - (source.x + source.width) : source.x - (target.x + target.width);
    const channelX =
      gap > outsidePadding
        ? (start.x + end.x) / 2
        : sourceOnLeft
          ? Math.max(source.x + source.width, target.x + target.width) + outsidePadding
          : Math.min(source.x, target.x) - outsidePadding;

    points = [
      start,
      { x: channelX, y: start.y },
      { x: channelX, y: end.y },
      end
    ];
  } else {
    const sourceAbove = sourceCenter.y <= targetCenter.y;
    const start: Point = {
      x: sourceCenter.x + trackOffset,
      y: sourceAbove ? source.y + source.height : source.y
    };
    const end: Point = {
      x: targetCenter.x + trackOffset,
      y: sourceAbove ? target.y : target.y + target.height
    };
    const gap = sourceAbove ? target.y - (source.y + source.height) : source.y - (target.y + target.height);
    const channelY =
      gap > outsidePadding
        ? (start.y + end.y) / 2
        : sourceAbove
          ? Math.max(source.y + source.height, target.y + target.height) + outsidePadding
          : Math.min(source.y, target.y) - outsidePadding;

    points = [
      start,
      { x: start.x, y: channelY },
      { x: end.x, y: channelY },
      end
    ];
  }

  const label = routeLabel(points);
  return {
    path: roundedOrthogonalPath(points),
    labelX: label.x,
    labelY: label.y,
    boundaryX: label.x,
    boundaryY: label.y,
    points
  };
}

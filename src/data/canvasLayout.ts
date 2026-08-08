import { zones } from "./catalog";
import type { Point, Subnet, ZoneId } from "../models/types";

export const ZONE_ROW_HEIGHT = 118;
export const ZONE_BAND_Y_OFFSET = -18;
export const ZONE_BAND_HEIGHT = 104;
export const ASSET_NODE_WIDTH = 212;
export const ASSET_NODE_HEIGHT = 96;
export const DEFAULT_VIEWPORT = { x: 210, y: 58, zoom: 0.74 };
export const CANVAS_GRID_X = 48;
export const CANVAS_GRID_Y = ZONE_ROW_HEIGHT;
// Left edge for assets — keeps them clear of the Purdue zone-label gutter.
export const ASSET_MIN_X = 48;

export function zoneIndex(zoneId: ZoneId) {
  return Math.max(
    0,
    zones.findIndex((zone) => zone.id === zoneId)
  );
}

export function assetYForZone(zoneId: ZoneId) {
  return zoneIndex(zoneId) * ZONE_ROW_HEIGHT + ZONE_BAND_Y_OFFSET + (ZONE_BAND_HEIGHT - ASSET_NODE_HEIGHT) / 2;
}

export function inferZoneFromY(y: number): ZoneId {
  const index = Math.min(zones.length - 1, Math.max(0, Math.round((y - ZONE_BAND_Y_OFFSET) / ZONE_ROW_HEIGHT)));
  return zones[index].id;
}

export function snapPointToZone(point: Point, zoneId: ZoneId): Point {
  return {
    x: snapX(Math.max(ASSET_MIN_X, point.x - ASSET_NODE_WIDTH / 2)),
    y: assetYForZone(zoneId)
  };
}

export function snapX(x: number) {
  return Math.max(ASSET_MIN_X, Math.round(x / CANVAS_GRID_X) * CANVAS_GRID_X);
}

export function snapAssetPosition(point: Point): Point {
  const zone = inferZoneFromY(point.y + ASSET_NODE_HEIGHT / 2);
  return {
    x: snapX(point.x),
    y: assetYForZone(zone)
  };
}

export const ASSET_MIN_GAP = 24;

// Horizontal step used when packing a Purdue lane left-to-right.
const PURDUE_PACK_STEP = ASSET_NODE_WIDTH + ASSET_MIN_GAP;

/** Snaps a free (network-layout) point to the canvas grid on both axes — no zone lanes. */
export function snapToGrid(point: Point): Point {
  return {
    x: snapX(point.x),
    y: Math.round(point.y / CANVAS_GRID_X) * CANVAS_GRID_X
  };
}

/**
 * Projects assets into Purdue lanes: every asset gets `y = assetYForZone(zone)` and is
 * packed left-to-right within its lane (ordered by current free x, then id, for stability).
 * Returns a map of assetId -> projected position. The free `position` is never mutated —
 * this is a pure view transform so toggling back to the network layout is lossless.
 */
export function projectPurduePositions(
  assets: Array<{ id: string; zone: ZoneId; position: Point }>
): Map<string, Point> {
  const byZone = new Map<ZoneId, Array<{ id: string; x: number }>>();
  for (const asset of assets) {
    const lane = byZone.get(asset.zone) ?? [];
    lane.push({ id: asset.id, x: asset.position.x });
    byZone.set(asset.zone, lane);
  }

  const projected = new Map<string, Point>();
  for (const [zoneId, lane] of byZone) {
    lane.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
    const y = assetYForZone(zoneId);
    lane.forEach((entry, index) => {
      projected.set(entry.id, { x: ASSET_MIN_X + index * PURDUE_PACK_STEP, y });
    });
  }
  return projected;
}

/**
 * Returns a grid-snapped point near `desired` that does not 2D-overlap any other asset.
 * Used when adding/dropping in the free network layout so a new node never spawns on top
 * of an existing one; it nudges right by one column at a time until clear.
 */
export function resolveFreePosition(
  desired: Point,
  movingId: string | null,
  assets: Array<{ id: string; position: Point }>
): Point {
  const others = assets.filter((asset) => asset.id !== movingId).map((asset) => asset.position);
  const collides = (point: Point) =>
    others.some(
      (other) =>
        Math.abs(other.x - point.x) < ASSET_NODE_WIDTH + ASSET_MIN_GAP &&
        Math.abs(other.y - point.y) < ASSET_NODE_HEIGHT + ASSET_MIN_GAP
    );

  let point = snapToGrid(desired);
  for (let step = 0; step < 400 && collides(point); step += 1) {
    point = { x: snapX(point.x + CANVAS_GRID_X), y: point.y };
  }
  return point;
}

export const SUBNET_BOX_PAD = 22;
export const SUBNET_LABEL_HEIGHT = 26;

export interface SubnetBox {
  id: string;
  name: string;
  cidr: string;
  vlan: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes a labelled bounding box around each subnet's member assets for the network
 * layout. Subnets with no members are skipped. The box is padded and reserves a label
 * strip above the assets.
 */
export function subnetBoundingBoxes(
  assets: Array<{ subnetId?: string; position: Point }>,
  subnets: Subnet[],
  pad = SUBNET_BOX_PAD
): SubnetBox[] {
  return subnets.flatMap((subnet) => {
    const members = assets.filter((asset) => asset.subnetId === subnet.id);
    if (members.length === 0) {
      return [];
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const member of members) {
      minX = Math.min(minX, member.position.x);
      minY = Math.min(minY, member.position.y);
      maxX = Math.max(maxX, member.position.x + ASSET_NODE_WIDTH);
      maxY = Math.max(maxY, member.position.y + ASSET_NODE_HEIGHT);
    }

    return [
      {
        id: subnet.id,
        name: subnet.name,
        cidr: subnet.cidr,
        vlan: subnet.vlan,
        x: minX - pad,
        y: minY - pad - SUBNET_LABEL_HEIGHT,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2 + SUBNET_LABEL_HEIGHT
      }
    ];
  });
}

/* All network-layout geometry is a multiple of CANVAS_GRID_X (48) so the canvas's
   snap-to-grid never nudges a freshly laid-out node — tiers stay exactly on the
   ghost zone bands. */
export const NETWORK_TOP_MARGIN = 48;
export const NETWORK_TIER_STEP = 192;
export const SUBNET_COLUMN_GAP = 96;
const NETWORK_BAND_START_X = 96;
const NETWORK_COL_STEP = 240;

/** Y for a Purdue zone in the free network layout — generous tiers so subnet boxes clear each other. */
export function networkTierY(zoneId: ZoneId): number {
  return NETWORK_TOP_MARGIN + zoneIndex(zoneId) * NETWORK_TIER_STEP;
}

const UNGROUPED_BAND = "__ungrouped__";
const LAYOUT_SWEEPS = 3;

interface LayoutBand {
  key: string;
  /** tier index -> ordered member ids */
  tiers: Map<number, string[]>;
  x: number;
  widthCols: number;
}

/**
 * Arranges assets into a tidy, readable network map. Subnets keep exclusive horizontal
 * column-bands (separated by SUBNET_COLUMN_GAP so the containers never overlap) and Purdue
 * levels read as rows, but both the band order and the member order within each band tier
 * are chosen by the conduit graph: repeated barycentre sweeps pull connected assets towards
 * each other, so conduits run short and straight instead of zig-zagging across the canvas.
 * Each tier is centred within its band for the natural funnel silhouette. Deterministic —
 * used for scenario/import loads and the canvas "Arrange" action.
 */
export function layoutTiered(
  assets: Array<{ id: string; zone: ZoneId; subnetId?: string }>,
  subnets: Array<{ id: string }>,
  conduits: Array<{ source: string; target: string }>
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (assets.length === 0) {
    return positions;
  }

  const validSubnetIds = new Set(subnets.map((subnet) => subnet.id));
  const bandKeyOf = (asset: { subnetId?: string }) =>
    asset.subnetId && validSubnetIds.has(asset.subnetId) ? asset.subnetId : UNGROUPED_BAND;

  const present = new Set(assets.map((asset) => asset.id));
  const neighbours = new Map<string, string[]>();
  const addEdge = (from: string, to: string) => {
    const list = neighbours.get(from);
    if (list) {
      list.push(to);
    } else {
      neighbours.set(from, [to]);
    }
  };
  for (const conduit of conduits) {
    if (conduit.source === conduit.target || !present.has(conduit.source) || !present.has(conduit.target)) {
      continue;
    }
    addEdge(conduit.source, conduit.target);
    addEdge(conduit.target, conduit.source);
  }

  // Build bands in declared subnet order (refined below), members per tier ordered by id
  // so the whole layout is deterministic before the first sweep.
  const bandByAsset = new Map<string, string>();
  const bandKeys: string[] = [];
  for (const subnet of subnets) {
    if (assets.some((asset) => bandKeyOf(asset) === subnet.id)) {
      bandKeys.push(subnet.id);
    }
  }
  if (assets.some((asset) => bandKeyOf(asset) === UNGROUPED_BAND)) {
    bandKeys.push(UNGROUPED_BAND);
  }
  const bands: LayoutBand[] = bandKeys.map((key) => ({ key, tiers: new Map(), x: 0, widthCols: 1 }));
  const bandLookup = new Map(bands.map((band) => [band.key, band]));
  for (const asset of [...assets].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = bandKeyOf(asset);
    bandByAsset.set(asset.id, key);
    const band = bandLookup.get(key)!;
    const tier = zoneIndex(asset.zone);
    const members = band.tiers.get(tier);
    if (members) {
      members.push(asset.id);
    } else {
      band.tiers.set(tier, [asset.id]);
    }
  }

  const tierY = (tier: number) => NETWORK_TOP_MARGIN + tier * NETWORK_TIER_STEP;

  const assignBandTier = (band: LayoutBand, tier: number) => {
    const members = band.tiers.get(tier)!;
    // Centre the tier within its band, rounded to the canvas grid so snapping is a no-op.
    const centring = ((band.widthCols - members.length) * NETWORK_COL_STEP) / 2;
    const startX = band.x + Math.round(centring / CANVAS_GRID_X) * CANVAS_GRID_X;
    members.forEach((id, index) => {
      positions.set(id, { x: startX + index * NETWORK_COL_STEP, y: tierY(tier) });
    });
  };

  const assignAll = () => {
    let bandX = NETWORK_BAND_START_X;
    for (const band of bands) {
      band.widthCols = Math.max(1, ...Array.from(band.tiers.values(), (members) => members.length));
      band.x = bandX;
      for (const tier of band.tiers.keys()) {
        assignBandTier(band, tier);
      }
      bandX += band.widthCols * NETWORK_COL_STEP + SUBNET_COLUMN_GAP;
    }
  };

  const meanNeighbourX = (id: string): number | null => {
    const links = neighbours.get(id);
    if (!links || links.length === 0) {
      return null;
    }
    let sum = 0;
    for (const other of links) {
      sum += positions.get(other)!.x;
    }
    return sum / links.length;
  };

  // One down (or up) pass of the classic barycentre heuristic: reorder each tier towards the
  // mean x of its neighbours, re-assigning that tier's positions immediately so the next tier
  // in the pass sees the updated coordinates.
  const sweepMembers = (descending: boolean) => {
    const tierIndices = [...new Set(bands.flatMap((band) => [...band.tiers.keys()]))].sort((a, b) =>
      descending ? b - a : a - b
    );
    for (const tier of tierIndices) {
      for (const band of bands) {
        const members = band.tiers.get(tier);
        if (!members || members.length < 2) {
          continue;
        }
        const keyed = members.map((id, index) => ({ id, index, key: meanNeighbourX(id) ?? positions.get(id)!.x }));
        keyed.sort((a, b) => a.key - b.key || a.index - b.index);
        members.splice(0, members.length, ...keyed.map((item) => item.id));
        assignBandTier(band, tier);
      }
    }
  };

  // Reorder whole bands by where their external conduits pull them, so heavily linked
  // subnets sit next to each other (and the ungrouped band lands where it connects).
  const sweepBands = () => {
    if (bands.length < 2) {
      return;
    }
    const keyed = bands.map((band, index) => {
      let sum = 0;
      let count = 0;
      let memberSum = 0;
      let memberCount = 0;
      for (const members of band.tiers.values()) {
        for (const id of members) {
          memberSum += positions.get(id)!.x;
          memberCount += 1;
          for (const other of neighbours.get(id) ?? []) {
            if (bandByAsset.get(other) !== band.key) {
              sum += positions.get(other)!.x;
              count += 1;
            }
          }
        }
      }
      const centre = memberCount > 0 ? memberSum / memberCount : 0;
      return { band, index, key: count > 0 ? sum / count : centre };
    });
    keyed.sort((a, b) => a.key - b.key || a.index - b.index);
    bands.splice(0, bands.length, ...keyed.map((item) => item.band));
  };

  assignAll();
  for (let sweep = 0; sweep < LAYOUT_SWEEPS; sweep += 1) {
    sweepMembers(false);
    sweepMembers(true);
    sweepBands();
    assignAll();
  }

  return positions;
}

/**
 * Returns a grid-snapped x near `desiredX` that does not overlap any other asset in the
 * same zone (assets share a y per zone, so overlap is purely horizontal). Searches outward
 * from the desired column, preferring the nearest free slot. Used on add and on drop so
 * assets can never sit on top of each other.
 */
export function resolveAssetX(
  desiredX: number,
  zoneId: ZoneId,
  movingId: string | null,
  assets: Array<{ id: string; zone: ZoneId; position: Point }>
): number {
  const others = assets
    .filter((asset) => asset.id !== movingId && asset.zone === zoneId)
    .map((asset) => asset.position.x);
  const minSeparation = ASSET_NODE_WIDTH + ASSET_MIN_GAP;
  const overlaps = (x: number) => others.some((otherX) => Math.abs(x - otherX) < minSeparation);

  const start = snapX(desiredX);
  if (!overlaps(start)) {
    return start;
  }
  for (let delta = CANVAS_GRID_X; delta <= 8000; delta += CANVAS_GRID_X) {
    const right = snapX(start + delta);
    if (!overlaps(right)) {
      return right;
    }
    const left = snapX(start - delta);
    if (left >= ASSET_MIN_X && !overlaps(left)) {
      return left;
    }
  }
  return start;
}

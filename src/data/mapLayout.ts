import { ASSET_MIN_GAP, ASSET_MIN_X, ASSET_NODE_HEIGHT, ASSET_NODE_WIDTH, ZONE_BAND_HEIGHT, ZONE_ROW_HEIGHT } from "./canvasLayout";
import { zones } from "./catalog";
import type { Point, Subnet, ZoneId } from "../models/types";

/**
 * Where the map puts an asset.
 *
 * One rule: the canvas reads top-down in bands, and an asset's band is decided by the active
 * grouping. Two groupings, because two people are looking at this map and they do not think alike.
 *
 * - **Subnet** is the default, and the one an operator enumerating a network actually holds in
 *   their head. They arrived with an address, they are working out what else is on that wire, and
 *   the question "what is next to this box" has a concrete answer that does not require anyone to
 *   have decided what the box is *for* yet.
 * - **Purdue** is a lens over the same estate. It answers a different question — how far from the
 *   process — and it is the right one at reporting time, but it demands a judgement about every
 *   asset before it can draw anything, and on a freshly imported estate those judgements are
 *   guesses.
 *
 * Positions are not stored. Only what someone dragged is, so improving this function improves every
 * saved map, and re-importing never moves an asset a person placed.
 */

export type MapGrouping = "subnet" | "purdue";

/** Horizontal pitch of a lane slot, matching the OT canvas so the two read the same. */
export const MAP_SLOT_STEP = ASSET_NODE_WIDTH + ASSET_MIN_GAP;

/** Assets with no subnet get their own trailing band rather than being dropped or guessed at. */
export const UNSEGMENTED_LANE = "unsegmented";

export interface MapLayoutAsset {
  id: string;
  zone: ZoneId;
  subnetId?: string;
}

export interface MapBand {
  id: string;
  label: string;
  /** Second line: the CIDR, or the Purdue level's name. Empty when there is nothing to add. */
  detail: string;
  y: number;
  height: number;
  /** Only the Purdue bands carry one; a subnet has no inherent colour and inventing one is noise. */
  color?: string;
}

export interface MapLayout {
  positions: Map<string, Point>;
  bands: MapBand[];
}

function slotX(index: number): number {
  return ASSET_MIN_X + index * MAP_SLOT_STEP;
}

/**
 * The slot an authored position sits in, or null when it was dropped between slots.
 *
 * Half a step of tolerance: a node nudged one grid column off its slot is still occupying it, and
 * treating it as free would pack another asset directly underneath.
 */
function slotFor(x: number): number | null {
  const index = Math.round((x - ASSET_MIN_X) / MAP_SLOT_STEP);
  if (index < 0) {
    return null;
  }
  return Math.abs(slotX(index) - x) <= MAP_SLOT_STEP / 2 ? index : null;
}

const bandY = (index: number) => index * ZONE_ROW_HEIGHT;
const assetY = (index: number) => bandY(index) + (ZONE_BAND_HEIGHT - ASSET_NODE_HEIGHT) / 2;

/**
 * The bands, in reading order, and which one each asset belongs to.
 *
 * Purdue draws every level whether or not it holds anything, because an empty level is a statement:
 * it says nobody has described that part of the estate. Subnet draws only the segments that exist,
 * because there is no canonical list of subnets an estate ought to have.
 */
function lanesFor(
  grouping: MapGrouping,
  assets: MapLayoutAsset[],
  subnets: Subnet[]
): { order: string[]; labels: Map<string, { label: string; detail: string; color?: string }>; laneOf: (asset: MapLayoutAsset) => string } {
  if (grouping === "purdue") {
    return {
      order: zones.map((zone) => zone.id),
      labels: new Map(
        zones.map((zone) => [zone.id, { label: zone.shortName, detail: zone.name, color: zone.color }])
      ),
      laneOf: (asset) => asset.zone
    };
  }

  const byId = new Map(subnets.map((subnet) => [subnet.id, subnet]));
  const used = new Set(assets.map((asset) => (asset.subnetId && byId.has(asset.subnetId) ? asset.subnetId : UNSEGMENTED_LANE)));
  const order = [
    ...subnets.filter((subnet) => used.has(subnet.id)).map((subnet) => subnet.id),
    ...(used.has(UNSEGMENTED_LANE) ? [UNSEGMENTED_LANE] : [])
  ];

  const labels = new Map(
    subnets.map((subnet) => [subnet.id, { label: subnet.name, detail: [subnet.cidr, subnet.vlan ? `VLAN ${subnet.vlan}` : ""].filter(Boolean).join(" · ") }])
  );
  labels.set(UNSEGMENTED_LANE, {
    label: "No subnet",
    // Named rather than silently mixed into a neighbouring band: an asset whose address nothing
    // placed is a gap in the enumeration, and it should look like one.
    detail: "Nothing placed these on a segment"
  });

  return { order, labels, laneOf: (asset) => (asset.subnetId && byId.has(asset.subnetId) ? asset.subnetId : UNSEGMENTED_LANE) };
}

/**
 * Positions every asset: authored ones verbatim, the rest packed into the free slots of their band.
 *
 * Ordering within a band is by id, not by insertion — the projection rebuilds its asset list from
 * scratch on every load, so anything order-dependent would shuffle the map when a source is added.
 */
export function layoutMap(
  assets: MapLayoutAsset[],
  authored: Record<string, Point> = {},
  grouping: MapGrouping = "subnet",
  subnets: Subnet[] = []
): MapLayout {
  const { order, labels, laneOf } = lanesFor(grouping, assets, subnets);
  const rowOf = new Map(order.map((id, index) => [id, index] as const));

  const inLane = new Map<string, MapLayoutAsset[]>();
  for (const asset of assets) {
    const lane = laneOf(asset);
    inLane.set(lane, [...(inLane.get(lane) ?? []), asset]);
  }

  const positions = new Map<string, Point>();
  for (const [lane, members] of inLane) {
    const row = rowOf.get(lane);
    if (row === undefined) {
      continue;
    }

    const taken = new Set<number>();
    const unplaced: MapLayoutAsset[] = [];

    for (const asset of members) {
      const position = authored[asset.id];
      if (!position) {
        unplaced.push(asset);
        continue;
      }
      positions.set(asset.id, position);
      const slot = slotFor(position.x);
      if (slot !== null) {
        taken.add(slot);
      }
    }

    const y = assetY(row);
    let slot = 0;
    for (const asset of unplaced.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      while (taken.has(slot)) {
        slot += 1;
      }
      taken.add(slot);
      positions.set(asset.id, { x: slotX(slot), y });
    }
  }

  const bands: MapBand[] = order.map((lane, index) => ({
    id: lane,
    label: labels.get(lane)?.label ?? lane,
    detail: labels.get(lane)?.detail ?? "",
    color: labels.get(lane)?.color,
    y: bandY(index),
    height: ZONE_BAND_HEIGHT
  }));

  return { positions, bands };
}

/** The band an authored drop landed in, so dragging between bands means something. */
export function bandAt(y: number, bands: MapBand[]): MapBand | null {
  if (bands.length === 0) {
    return null;
  }
  const index = Math.min(bands.length - 1, Math.max(0, Math.round(y / ZONE_ROW_HEIGHT)));
  return bands[index];
}

/** Where a band's assets sit, so a drop can be snapped to it. */
export function bandAssetY(band: MapBand): number {
  return band.y + (ZONE_BAND_HEIGHT - ASSET_NODE_HEIGHT) / 2;
}

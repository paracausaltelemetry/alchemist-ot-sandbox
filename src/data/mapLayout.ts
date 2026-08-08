import { ASSET_MIN_GAP, ASSET_MIN_X, ASSET_NODE_WIDTH, assetYForZone } from "./canvasLayout";
import type { Point, ZoneId } from "../models/types";

/**
 * Where the converged map puts an asset.
 *
 * One rule: the estate reads top-down from the internet to Level 0, so an asset's lane is its zone
 * and nothing else. `projectPurduePositions` already does this for the OT canvas, but it repacks
 * every asset on every call — the converged map has to let a dragged asset stay where it was put,
 * which means the packer has to route around the positions a person authored rather than overwrite
 * them.
 *
 * Derived positions are not stored. Only what someone dragged is, so improving this function
 * improves every saved map, and re-importing never moves an asset a person placed.
 */

/** Horizontal pitch of a lane slot, matching the OT canvas so the two read the same. */
export const MAP_SLOT_STEP = ASSET_NODE_WIDTH + ASSET_MIN_GAP;

export interface MapLayoutAsset {
  id: string;
  zone: ZoneId;
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

/**
 * Positions every asset: authored ones verbatim, the rest packed into the free slots of their lane.
 *
 * Ordering within a lane is by id, not by insertion — the projection rebuilds its asset list from
 * scratch on every load, so anything order-dependent would shuffle the map when a source is added.
 */
export function layoutMapAssets(
  assets: MapLayoutAsset[],
  authored: Record<string, Point> = {}
): Map<string, Point> {
  const byZone = new Map<ZoneId, MapLayoutAsset[]>();
  for (const asset of assets) {
    byZone.set(asset.zone, [...(byZone.get(asset.zone) ?? []), asset]);
  }

  const positions = new Map<string, Point>();
  for (const [zone, lane] of byZone) {
    const taken = new Set<number>();
    const unplaced: MapLayoutAsset[] = [];

    for (const asset of lane) {
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

    const y = assetYForZone(zone);
    let slot = 0;
    for (const asset of unplaced.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      while (taken.has(slot)) {
        slot += 1;
      }
      taken.add(slot);
      positions.set(asset.id, { x: slotX(slot), y });
    }
  }

  return positions;
}

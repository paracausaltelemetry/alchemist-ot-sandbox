import { ASSET_NODE_HEIGHT, ZONE_BAND_HEIGHT, ZONE_ROW_HEIGHT } from "./canvasLayout";
import { zones } from "./catalog";
import type { Point, Subnet, ZoneId } from "../models/types";

/**
 * Where the map puts a device.
 *
 * Two ways of arranging the same estate, because two people are looking at it.
 *
 * - **Topology** is the default and the one this tool is for: subnets drawn as enclosures with
 *   their devices inside, and the routers, firewalls and the internet on a spine above them. It is
 *   the picture somebody sketches on a whiteboard from an Nmap run, and it needs no judgement about
 *   any device before it can draw one.
 * - **Purdue** keeps the horizontal lanes. It answers a different question — how far from the
 *   process — and it is the right one at reporting time, but it demands a decision about every
 *   asset first, and on a freshly imported estate those decisions are guesses.
 *
 * Positions are not stored. Only what someone dragged is, so improving this function improves every
 * saved map, and re-importing never moves a device a person placed.
 */

export type MapGrouping = "topology" | "purdue";

/**
 * A device is a symbol with a label under it, not a form.
 *
 * Small enough that a /24 is a picture rather than a scroll: the old 212x96 card fitted twelve
 * across a screen, which is a spreadsheet with rounded corners. What a reader needs at a glance is
 * the shape of the thing and its address; everything else is a click away in the inspector.
 */
export const DEVICE_WIDTH = 128;
export const DEVICE_HEIGHT = 104;

const DEVICE_GAP_X = 20;

/**
 * Vertical room between devices, and the slack under the last row of an enclosure.
 *
 * Generous because the service chips are drawn *below* the declared node height when that layer is
 * on: `DEVICE_HEIGHT` is what React Flow reserves, and the chips are the one part of a device whose
 * size depends on what the scan found rather than on the design. Reserving the worst case in
 * `DEVICE_HEIGHT` itself would leave a band of whitespace under every device on a map where nobody
 * has turned services on, which is the common case.
 */
const DEVICE_GAP_Y = 46;

/** Padding inside a subnet enclosure, and the room its label needs at the top. */
const ENCLOSURE_PAD = 20;
const ENCLOSURE_HEADER = 34;
const ENCLOSURE_GAP = 44;

/** Roughly a widescreen canvas at default zoom; enclosures wrap past it rather than run off. */
const TARGET_ROW_WIDTH = 1500;

/** Devices that route, filter or represent the outside world sit on the spine, not in a subnet. */
const SPINE_KINDS = new Set(["internet", "firewall", "router", "load-balancer"]);

export const UNSEGMENTED_LANE = "unsegmented";

export interface MapLayoutAsset {
  id: string;
  zone: ZoneId;
  subnetId?: string;
  /** The network-map class a scan gave it, which is what decides spine versus enclosure. */
  deviceKind?: string;
}

/** A labelled box drawn around a subnet's devices. */
export interface MapEnclosure {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A full-width horizontal band, used by the Purdue arrangement only. */
export interface MapBand {
  id: string;
  label: string;
  detail: string;
  y: number;
  height: number;
  color?: string;
}

export interface MapLayout {
  positions: Map<string, Point>;
  enclosures: MapEnclosure[];
  bands: MapBand[];
}

const columnsFor = (count: number) => Math.max(1, Math.min(6, Math.ceil(Math.sqrt(count))));

function enclosureSize(count: number): { width: number; height: number; columns: number } {
  const columns = columnsFor(count);
  const rows = Math.ceil(count / columns);
  return {
    columns,
    width: ENCLOSURE_PAD * 2 + columns * DEVICE_WIDTH + (columns - 1) * DEVICE_GAP_X,
    // `DEVICE_GAP_Y` rather than `ENCLOSURE_PAD` under the last row, for the same reason: the chips
    // hang below the node and must not spill out of the box that is supposed to contain them.
    height: ENCLOSURE_HEADER + ENCLOSURE_PAD + DEVICE_GAP_Y + rows * DEVICE_HEIGHT + (rows - 1) * DEVICE_GAP_Y
  };
}

/** Stable ordering inside a box: the projection rebuilds its asset list on every load. */
const byId = (a: MapLayoutAsset, b: MapLayoutAsset) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function purdueLayout(assets: MapLayoutAsset[], authored: Record<string, Point>): MapLayout {
  const rowOf = new Map(zones.map((zone, index) => [zone.id as string, index] as const));
  const positions = new Map<string, Point>();
  const byZone = new Map<string, MapLayoutAsset[]>();

  for (const asset of assets) {
    byZone.set(asset.zone, [...(byZone.get(asset.zone) ?? []), asset]);
  }

  for (const [zone, members] of byZone) {
    const row = rowOf.get(zone) ?? 0;
    const y = row * ZONE_ROW_HEIGHT + (ZONE_BAND_HEIGHT - DEVICE_HEIGHT) / 2;
    let column = 0;
    for (const asset of [...members].sort(byId)) {
      const placed = authored[asset.id];
      if (placed) {
        positions.set(asset.id, placed);
        continue;
      }
      positions.set(asset.id, { x: ENCLOSURE_PAD + column * (DEVICE_WIDTH + DEVICE_GAP_X), y });
      column += 1;
    }
  }

  return {
    positions,
    enclosures: [],
    // Every level, held or not: an empty one says nobody has described that part of the estate.
    bands: zones.map((zone, index) => ({
      id: zone.id,
      label: zone.shortName,
      detail: zone.name,
      color: zone.color,
      y: index * ZONE_ROW_HEIGHT,
      height: ZONE_BAND_HEIGHT
    }))
  };
}

function topologyLayout(
  assets: MapLayoutAsset[],
  authored: Record<string, Point>,
  subnets: Subnet[]
): MapLayout {
  const known = new Map(subnets.map((subnet) => [subnet.id, subnet]));

  // The spine reads across the top the way a whiteboard sketch does: the outside world and the
  // kit that joins segments together, above the segments themselves.
  const spine = assets.filter((asset) => SPINE_KINDS.has(asset.deviceKind ?? "")).sort(byId);
  const spineIds = new Set(spine.map((asset) => asset.id));

  const grouped = new Map<string, MapLayoutAsset[]>();
  for (const asset of assets) {
    if (spineIds.has(asset.id)) {
      continue;
    }
    const lane = asset.subnetId && known.has(asset.subnetId) ? asset.subnetId : UNSEGMENTED_LANE;
    grouped.set(lane, [...(grouped.get(lane) ?? []), asset]);
  }

  const positions = new Map<string, Point>();
  const spineHeight = spine.length > 0 ? DEVICE_HEIGHT + ENCLOSURE_GAP : 0;

  // --- Enclosures, wrapped into rows ---------------------------------------
  const order = [
    ...subnets.filter((subnet) => grouped.has(subnet.id)).map((subnet) => subnet.id),
    ...(grouped.has(UNSEGMENTED_LANE) ? [UNSEGMENTED_LANE] : [])
  ];

  const enclosures: MapEnclosure[] = [];
  let cursorX = 0;
  let cursorY = spineHeight;
  let rowHeight = 0;

  for (const lane of order) {
    const members = [...(grouped.get(lane) ?? [])].sort(byId);
    const { width, height, columns } = enclosureSize(members.length);

    if (cursorX > 0 && cursorX + width > TARGET_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + ENCLOSURE_GAP;
      rowHeight = 0;
    }

    const subnet = known.get(lane);
    enclosures.push({
      id: lane,
      label: subnet ? subnet.name : "No subnet",
      detail: subnet
        ? [subnet.cidr, subnet.vlan ? `VLAN ${subnet.vlan}` : ""].filter(Boolean).join(" · ")
        : // Named rather than quietly mixed in with a neighbour: a device whose address nothing
          // placed is a hole in the enumeration, and it should look like one.
          "Nothing placed these on a segment",
      x: cursorX,
      y: cursorY,
      width,
      height
    });

    members.forEach((asset, index) => {
      const placed = authored[asset.id];
      if (placed) {
        positions.set(asset.id, placed);
        return;
      }
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(asset.id, {
        x: cursorX + ENCLOSURE_PAD + column * (DEVICE_WIDTH + DEVICE_GAP_X),
        y: cursorY + ENCLOSURE_HEADER + ENCLOSURE_PAD + row * (DEVICE_HEIGHT + DEVICE_GAP_Y)
      });
    });

    cursorX += width + ENCLOSURE_GAP;
    rowHeight = Math.max(rowHeight, height);
  }

  // --- Spine, placed over the segment each device serves ---------------------
  //
  // A router addressed on 10.10.2.0/24 belongs above that box, not wherever it happened to fall in
  // an alphabetical row. Getting this wrong is what makes an auto-drawn network diagram look
  // auto-drawn: the lines cross for no reason and the reader stops trusting the arrangement.
  const boxById = new Map(enclosures.map((box) => [box.id, box] as const));
  const spineSlots = new Set<number>();
  const unanchored: MapLayoutAsset[] = [];

  const claim = (preferred: number): number => {
    let x = Math.max(0, Math.round(preferred));
    // Nudge right until clear, so two routers on one segment sit side by side rather than stacked.
    while ([...spineSlots].some((taken) => Math.abs(taken - x) < DEVICE_WIDTH + DEVICE_GAP_X)) {
      x += DEVICE_WIDTH + DEVICE_GAP_X;
    }
    spineSlots.add(x);
    return x;
  };

  for (const asset of spine) {
    const placed = authored[asset.id];
    if (placed) {
      positions.set(asset.id, placed);
      continue;
    }
    const box = asset.subnetId ? boxById.get(asset.subnetId) : undefined;
    if (!box) {
      unanchored.push(asset);
      continue;
    }
    positions.set(asset.id, { x: claim(box.x + box.width / 2 - DEVICE_WIDTH / 2), y: 0 });
  }

  // The internet and anything else with no segment of its own: off to the left, ahead of the
  // estate, which is where a reader looks for the outside world.
  let edgeX = -(DEVICE_WIDTH + ENCLOSURE_GAP);
  for (const asset of unanchored) {
    positions.set(asset.id, { x: edgeX, y: 0 });
    edgeX -= DEVICE_WIDTH + DEVICE_GAP_X;
  }

  return { positions, enclosures, bands: [] };
}

export function layoutMap(
  assets: MapLayoutAsset[],
  authored: Record<string, Point> = {},
  grouping: MapGrouping = "topology",
  subnets: Subnet[] = []
): MapLayout {
  return grouping === "purdue" ? purdueLayout(assets, authored) : topologyLayout(assets, authored, subnets);
}

/**
 * The Purdue band a drop landed in.
 *
 * Only meaningful under that arrangement: a topology enclosure is derived from an address, and a
 * drag into another one would be asserting an address the sources contradict on the next load.
 */
export function bandAt(y: number, bands: MapBand[]): MapBand | null {
  if (bands.length === 0) {
    return null;
  }
  const index = Math.min(bands.length - 1, Math.max(0, Math.round(y / ZONE_ROW_HEIGHT)));
  return bands[index];
}

export function bandAssetY(band: MapBand): number {
  return band.y + (ZONE_BAND_HEIGHT - ASSET_NODE_HEIGHT) / 2;
}

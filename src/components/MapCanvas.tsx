import {
  Handle,
  Position,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  type OnNodeDrag,
  useReactFlow
} from "@xyflow/react";
import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { CANVAS_GRID_X, ZONE_BAND_Y_OFFSET, ZONE_ROW_HEIGHT, snapX } from "../data/canvasLayout";
import { getAssetType } from "../data/catalog";
import {
  DEVICE_HEIGHT,
  DEVICE_WIDTH,
  bandAssetY,
  bandAt,
  layoutMap,
  type MapGrouping
} from "../data/mapLayout";
import { symbolCentre } from "./canvas/cable";
import { routeCables, type CableRequest } from "../engine/tubeRouting";
import { isScanEvidence, itKindLabel, type ItLinkEvidence } from "../models/itMap";
import { ACCESS_LABELS, type ItAccessState } from "../models/itEngagement";
import { bucketsFor, overlays, type Overlay, type OverlayBucket, type OverlayContext, type OverlayId } from "../engine/overlays";
import type { ImportedPort } from "../import/types";
import type { MapAsset, MapConnection, ProjectedMap } from "../models/cyberMap";
import type { Point } from "../models/types";
import { AssetGlyph } from "./AssetGlyph";
import { MapLegend } from "./MapLegend";
import { bucketStyle } from "./canvas/overlayStyle";
import { NetworkSymbol } from "./NetworkSymbol";
import { FlowFrame } from "./canvas/FlowFrame";
import { LinkOverlay, type LinkOverlayItem } from "./canvas/LinkOverlay";
import { overlayExtent } from "./canvas/geometry";
import { useFlowNodes } from "./canvas/useFlowNodes";

/**
 * One canvas for the whole estate, from the internet edge down to Purdue Level 0.
 *
 * Alchemist drew two: an OT canvas over an authored `OtProject`, and an IT canvas over a
 * scan-derived `ItMap`. They shared a React Flow core and nothing else, including their idea of
 * what a device is — so a firewall between the corporate network and the plant had to be modelled
 * twice, and the crossing itself, which is the interesting part, could not be drawn at all.
 *
 * This renders a `ProjectedMap`, which carries both vocabularies at once: every asset has an OT
 * class and a Purdue zone, and a scanned one also keeps the network-map symbol its evidence
 * justified. Both are drawn. A card that shows a router glyph *and* sits in the Enterprise IT lane
 * is telling the operator two true things, and neither canvas could say both.
 *
 * Vertical position is meaning, not decoration: an asset's lane is its zone. Horizontal position is
 * not, so it is free for a person to arrange, and `layoutMapAssets` packs around what they chose.
 */

interface MapCanvasProps {
  map: ProjectedMap;
  selectedId: string | null;
  /** Only what a person dragged, in this arrangement. Everything else is derived every load. */
  positions: Record<string, Point>;
  /** Discards this arrangement's dragged positions and lets the layout decide again. */
  onRearrange: () => void;
  fitSignal: number;
  /** Hides the links inferred from addressing, leaving what a scan actually observed. */
  showInferred: boolean;
  /** Prints the top open services under each symbol instead of a bare count. */
  showServices: boolean;
  onToggleServices: () => void;
  /** Which overlay recolours the map. There is no "no overlay" — asset type is the plain read. */
  overlayId: OverlayId;
  /**
   * What the horizontal bands mean: subnets, or Purdue levels.
   *
   * Subnet is the default. It is what somebody enumerating a network holds in their head, and it
   * needs no judgement about any asset before it can draw one.
   */
  grouping: MapGrouping;
  onGroupingChange: (grouping: MapGrouping) => void;
  /** Everything the overlays need, built once by the owner so switching is not a re-assessment. */
  overlayContext: OverlayContext;
  onOverlayChange: (id: OverlayId) => void;
  onSelect: (id: string | null) => void;
  /**
   * Where an asset was put, and the zone that lane means — always together.
   *
   * One callback rather than a move and a re-zone, because under Purdue grouping they are one act:
   * the band *is* the zone. Two callbacks meant two state updates from one handler, the second
   * built from the document the first had already replaced, so the position was silently discarded
   * and the card sprang back to the packer's slot.
   *
   * `zone` is absent under subnet grouping. A subnet band is derived from an asset's address, and
   * dragging a card into another one would be asserting a different address — a claim the drag
   * does not carry and the sources would contradict on the next load.
   */
  onPlaceAsset: (id: string, position: Point, zone?: MapAsset["zone"]) => void;
  onToggleInferred: () => void;
  /** Fired when one asset's handle is dragged onto another, or two are clicked in connect mode. */
  onConnect: (source: string, target: string) => void;
  connectMode: boolean;
  connectSourceId: string | null;
  onToggleConnect: () => void;
}

type MapNodeData = {
  asset: MapAsset;
  selected: boolean;
  access: ItAccessState | null;
  /** Null when the active overlay has nothing to say about this asset. */
  bucket: OverlayBucket | null;
  connectMode: boolean;
  connectSource: boolean;
  showServices: boolean;
};

type MapFlowNode = Node<MapNodeData, "mapAsset">;

/**
 * The services worth putting under a symbol before it stops being a symbol.
 *
 * Four, then a count. The point of showing ports on the canvas is recognising a box at a glance —
 * "that is the SMB one" — not reading its scan output, which is what the inspector is for.
 */
const SERVICE_CHIP_LIMIT = 4;

/**
 * The name where the scan resolved one, the number where it did not.
 *
 * `microsoft-ds` is recognised at a glance and `445` has to be decoded, so the name wins — but a
 * bare number is a real answer and printing "unknown" for it would be worse than useless.
 */
const serviceLabel = (port: ImportedPort) => port.service || String(port.port);

/** Everything the scan found, for the tooltip: the canvas shows four, the truth is all of them. */
const serviceSummary = (ports: ImportedPort[]) =>
  ports.length === 0
    ? "No open services recorded"
    : ports
        .map((port) => `${port.port}/${port.transport ?? "tcp"} ${port.service ?? ""}`.trim())
        .join("\n");

/**
 * One device, drawn the way a network diagram draws one: a symbol with a label under it.
 *
 * This was a 212x96 card carrying an OT asset class, a Purdue chip and a criticality border. On a
 * map assembled from a scan that is mostly assertion — a scanned host has no criticality anybody
 * decided and no level anybody confirmed — and twelve of them filled a screen, which makes a /24 a
 * scroll rather than a picture. What survives is what the scan actually said: what kind of box it
 * is, what it answers on, and what it is called.
 *
 * Memoised with a referentially stable `data`, for the reason the card was: a real estate puts
 * hundreds of these down, and moving one rebuilds the whole node array.
 */
const MapDeviceNode = memo(function MapDeviceNode({ data }: NodeProps<MapFlowNode>) {
  const { asset, selected, access, bucket, connectMode, connectSource, showServices } = data;
  const type = getAssetType(asset.type);
  const inferred = asset.confidence < 1;
  const services = asset.ports.slice(0, SERVICE_CHIP_LIMIT);

  return (
    <div
      className={`map-device${selected ? " is-selected" : ""}${inferred ? " is-ghost" : ""}${
        access ? ` has-access` : ""
      }${connectMode ? " is-connectable" : ""}${connectSource ? " is-connect-source" : ""}`}
      style={bucket ? bucketStyle(bucket) : undefined}
      title={`${asset.rationale || asset.name}

${serviceSummary(asset.ports)}`}
    >
      <Handle id="in" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="out" type="source" position={Position.Right} className="flow-handle" />

      <div className="map-device-symbol">
        {/* The scan's own classification when it made one, and the OT glyph only as a fallback:
            on this canvas the question is what kind of box it is on the wire. */}
        {asset.deviceKind ? <NetworkSymbol kind={asset.deviceKind} size={30} /> : <AssetGlyph icon={type.icon} size={26} />}
        {bucket ? (
          <span
            className="map-node-overlay"
            data-pattern={bucket.pattern ?? "ramp"}
            data-signal={bucket.signal ? "true" : undefined}
            title={bucket.label}
          />
        ) : null}
        {access ? <span className="map-device-access" title={ACCESS_LABELS[access]} /> : null}
      </div>

      <strong className="map-device-name">{asset.name}</strong>
      <span className="map-device-addr">{asset.ipAddress || (inferred ? "inferred" : "no address")}</span>

      {/* Always something, because "how exposed is this box" is the question the map is asked most
          and an empty space under a device answers it ambiguously: nothing found, or nothing
          shown? The count reads at any zoom; the names need the layer on. */}
      {showServices && services.length > 0 ? (
        <span className="map-device-services">
          {services.map((port) => (
            <span key={`${port.port}-${port.transport ?? "tcp"}`} data-transport={port.transport ?? "tcp"}>
              {serviceLabel(port)}
            </span>
          ))}
          {asset.ports.length > services.length ? (
            <span className="is-more">+{asset.ports.length - services.length}</span>
          ) : null}
        </span>
      ) : (
        <span className="map-device-portcount" data-open={asset.ports.length > 0 ? "yes" : "no"}>
          {asset.ports.length > 0 ? `${asset.ports.length} open` : "none found"}
        </span>
      )}
    </div>
  );
});

const nodeTypes = { mapAsset: MapDeviceNode };

/** Links are drawn from their evidence: observed solid, reasoning dashed. Shared with the IT map. */
const EVIDENCE_DASH: Record<ItLinkEvidence, string | undefined> = {
  traceroute: undefined,
  "observed-flow": undefined,
  attack: "12 4",
  asserted: undefined,
  "same-subnet": "1 5",
  inferred: "8 6"
};

/** Must clear `.conduit-overlay-path`'s own `stroke-width: 5.4`, or the drawn link is the thinnest. */
const ASSERTED_STROKE_WIDTH = 8;

function MapCanvasInner({
  map,
  selectedId,
  positions,
  onRearrange,
  fitSignal,
  showInferred,
  showServices,
  onToggleServices,
  overlayId,
  grouping,
  onGroupingChange,
  overlayContext,
  onOverlayChange,
  onSelect,
  onPlaceAsset,
  onToggleInferred,
  onConnect,
  connectMode,
  connectSourceId,
  onToggleConnect
}: MapCanvasProps) {
  const reactFlow = useReactFlow();
  const [isDragging, setIsDragging] = useState(false);

  const overlay = useMemo<Overlay>(() => overlays.find((entry) => entry.id === overlayId) ?? overlays[0], [overlayId]);
  const assetBuckets = useMemo(
    () => bucketsFor(overlay, map.assets, overlayContext),
    [map.assets, overlay, overlayContext]
  );
  const connectionBuckets = useMemo(
    () => bucketsFor(overlay, map.connections, overlayContext),
    [map.connections, overlay, overlayContext]
  );

  const { positions: laidOut, bands, enclosures } = useMemo(
    () => layoutMap(map.assets, positions, grouping, map.subnets),
    [grouping, map.assets, map.subnets, positions]
  );

  const flowCache = useRef(new Map<string, { source: MapAsset; flow: MapFlowNode }>());

  const flowSource = useMemo<MapFlowNode[]>(() => {
    const cache = flowCache.current;
    const next = map.assets.map((asset) => {
      const selected = selectedId === asset.id;
      const access = map.access.get(asset.id) ?? null;
      const bucket = assetBuckets.get(asset.id) ?? null;
      const connectSource = connectSourceId === asset.id;
      const position = laidOut.get(asset.id) ?? asset.position;

      const cached = cache.get(asset.id);
      if (
        cached &&
        cached.source === asset &&
        cached.flow.data.selected === selected &&
        cached.flow.data.access === access &&
        // Explicit, like every other field in this hit test: one left out is one that never updates
        // once a card has been drawn, so switching overlay would leave the old band in place.
        cached.flow.data.bucket === bucket &&
        cached.flow.data.connectMode === connectMode &&
        cached.flow.data.connectSource === connectSource &&
        cached.flow.data.showServices === showServices &&
        cached.flow.position.x === position.x &&
        cached.flow.position.y === position.y
      ) {
        return cached.flow;
      }

      const flow: MapFlowNode = {
        id: asset.id,
        type: "mapAsset" as const,
        position,
        // What the scan said, in the order a reader needs it: the name, what kind of box, where.
        // The symbol carries the first two visually and a screen reader gets nothing from an icon.
        ariaLabel: `${asset.name}, ${asset.deviceKind ? itKindLabel(asset.deviceKind) : getAssetType(asset.type).label}${
          asset.ipAddress ? `, ${asset.ipAddress}` : ""
        }${asset.ports.length > 0 ? `, ${asset.ports.length} open services` : ""}. Press Enter to select.`,
        width: DEVICE_WIDTH,
        height: DEVICE_HEIGHT,
        style: { width: DEVICE_WIDTH, minHeight: DEVICE_HEIGHT },
        data: { asset, selected, access, bucket, connectMode, connectSource, showServices }
      };
      cache.set(asset.id, { source: asset, flow });
      return flow;
    });

    if (cache.size > next.length) {
      const live = new Set(next.map((flow) => flow.id));
      for (const id of [...cache.keys()]) {
        if (!live.has(id)) {
          cache.delete(id);
        }
      }
    }
    return next;
  }, [assetBuckets, connectMode, connectSourceId, laidOut, map.access, map.assets, selectedId, showServices]);

  // Snap x to the grid and y to the band its centre falls in: vertical position *is* the grouping
  // here, so a free y would let a card sit between two bands and mean nothing.
  const snapToLane = useCallback(
    (point: Point): Point => {
      const band = bandAt(point.y + DEVICE_HEIGHT / 2, bands);
      return { x: snapX(point.x), y: band ? bandAssetY(band) : point.y };
    },
    [bands]
  );

  // Returns the node itself when snapping is a no-op — spreading unconditionally would hand React
  // Flow a new object for every node on every change and undo the memo on the card.
  const normaliseNode = useCallback(
    (node: MapFlowNode): MapFlowNode => {
      const snapped = snapToLane(node.position);
      if (snapped.x === node.position.x && snapped.y === node.position.y) {
        return node;
      }
      return { ...node, position: snapped };
    },
    [snapToLane]
  );

  const [flowNodes, handleNodesChange] = useFlowNodes<MapFlowNode>(flowSource, normaliseNode);

  const livePositions = useMemo(() => new Map(flowNodes.map((node) => [node.id, node.position])), [flowNodes]);

  const contentExtent = useMemo(
    () => overlayExtent(livePositions.values(), { nodeWidth: DEVICE_WIDTH, nodeHeight: DEVICE_HEIGHT }),
    [livePositions]
  );

  const linkItems = useMemo<LinkOverlayItem[]>(() => {
    const enclosureOf = new Map(map.assets.map((asset) => [asset.id, asset.subnetId] as const));

    const drawn = map.connections.filter(
      (connection) =>
        (showInferred || connection.evidence !== "inferred") &&
        livePositions.has(connection.source) &&
        livePositions.has(connection.target)
    );

    // Routed as a set, not one at a time: lanes exist because cables know about each other.
    const requests: CableRequest[] = drawn.map((connection) => ({
      id: connection.id,
      from: { at: symbolCentre(livePositions.get(connection.source)!), enclosureId: enclosureOf.get(connection.source) },
      to: { at: symbolCentre(livePositions.get(connection.target)!), enclosureId: enclosureOf.get(connection.target) }
    }));
    const routes = new Map(routeCables(requests, enclosures).map((cable) => [cable.id, cable] as const));

    return drawn.flatMap((connection: MapConnection) => {
      const route = routes.get(connection.id);
      if (!route) {
        return [];
      }

      const observed = isScanEvidence(connection.evidence);
      const asserted = connection.evidence === "asserted" || connection.evidence === "attack";
      const bucket = connectionBuckets.get(connection.id) ?? null;

      // Dash stays evidence and only evidence. An overlay says what a line *means*; the dash says
      // where it came from, and letting an overlay take that channel would make a scanned link and
      // a guessed one indistinguishable the moment anyone changed overlay.
      return [
        {
          id: connection.id,
          path: route.path,
          labelX: route.labelX,
          labelY: route.labelY,
          label: connection.name,
          labelVisible: observed || asserted,
          color: bucket?.signal ? "var(--signal)" : observed || asserted ? "var(--text)" : "var(--muted)",
          // Under a connection overlay the ramp carries the reading, so weight sets the opacity and
          // the faintest bucket still stays legible rather than disappearing.
          opacity: bucket ? 0.35 + bucket.weight * 0.6 : observed || asserted ? 0.9 : 0.55,
          markerEnd: true,
          dash: EVIDENCE_DASH[connection.evidence],
          strokeWidth: asserted ? ASSERTED_STROKE_WIDTH : undefined,
          selected: selectedId === connection.id,
          // A conduit that leaves its zone is the thing an assessment is most often about, so the
          // canvas says so without being asked to switch to a boundary view.
          highlighted: connection.trustBoundary
        }
      ];
    });
  }, [connectionBuckets, enclosures, livePositions, map.assets, map.connections, selectedId, showInferred]);

  /**
   * The zone a drop landed in, and only when the bands are Purdue.
   *
   * Under subnet grouping a drag says nothing about an asset's level, and inferring one from the
   * band would silently re-zone every card an operator tidied up.
   */
  const zoneDroppedInto = useCallback(
    (position: Point): MapAsset["zone"] | undefined => {
      if (grouping !== "purdue") {
        return undefined;
      }
      const band = bandAt(position.y + DEVICE_HEIGHT / 2, bands);
      return (band?.id as MapAsset["zone"]) ?? undefined;
    },
    [bands, grouping]
  );

  const commitNodePosition = useCallback<OnNodeDrag<MapFlowNode>>(
    (_, node) => {
      setIsDragging(false);
      const position = snapToLane(node.position);
      onPlaceAsset(node.id, position, zoneDroppedInto(position));
    },
    [onPlaceAsset, snapToLane, zoneDroppedInto]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nodeEl = (event.target as HTMLElement)?.closest?.(".react-flow__node");
      const id = nodeEl?.getAttribute("data-id");
      if (!id) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(id);
        return;
      }
      // Up and down move a whole lane, because a half-lane move is not a position this canvas has.
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-CANVAS_GRID_X, 0],
        ArrowRight: [CANVAS_GRID_X, 0],
        ArrowUp: [0, -ZONE_ROW_HEIGHT],
        ArrowDown: [0, ZONE_ROW_HEIGHT]
      };
      const move = delta[event.key];
      if (!move) return;
      event.preventDefault();
      const current = livePositions.get(id);
      if (!current) return;
      const position = snapToLane({ x: current.x + move[0], y: current.y + move[1] });
      handleNodesChange([{ id, type: "position", position, dragging: false }]);
      onPlaceAsset(id, position, zoneDroppedInto(position));
    },
    [handleNodesChange, livePositions, onPlaceAsset, onSelect, snapToLane, zoneDroppedInto]
  );

  const minimapNodeColor = useCallback(() => "#8e979c", []);

  const counts = useMemo(() => {
    return {
      assets: map.assets.length,
      subnets: map.subnets.length,
      crossings: map.connections.filter((connection) => connection.trustBoundary).length,
      inferred: map.assets.filter((asset) => asset.confidence < 1).length
    };
  }, [map.assets, map.connections, map.subnets]);

  return (
    <FlowFrame<MapFlowNode>
      nodes={flowNodes}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeDragStart={() => setIsDragging(true)}
      onNodeDragStop={commitNodePosition}
      onNodeClick={onSelect}
      onConnect={onConnect}
      // In connect mode a pane click would clear the half-drawn link's first endpoint, which is the
      // one click most likely to be a miss rather than an intention.
      onPaneClick={() => {
        if (!connectMode) {
          onSelect(null);
        }
      }}
      onKeyDown={handleKeyDown}
      snapGrid={[CANVAS_GRID_X, ZONE_ROW_HEIGHT]}
      fitSignal={fitSignal}
      minimapNodeColor={minimapNodeColor}
      sectionLabel="Estate map"
      frameClassName={`map-frame ${isDragging ? "is-dragging" : ""}${connectMode ? " is-wiring" : ""}`}
      toolbar={
        <div className="canvas-titlebar">
          <div>
            <h2>Estate map</h2>
            <p>
              {connectMode
                ? connectSourceId
                  ? "Select the asset at the other end."
                  : "Select the asset this connection starts from."
                : grouping === "purdue"
                  ? `${overlay.description}. Drag a device into another band to re-level it.`
                  : `${overlay.description}. Subnets are drawn as the scan found them.`}
            </p>
            <div className="canvas-stats" aria-label="Map summary">
              <span>
                <strong>{counts.assets}</strong> assets
              </span>
              <span>
                <strong>{counts.subnets}</strong> subnets
              </span>
              <span>
                <strong>{counts.crossings}</strong> segment crossings
              </span>
              {counts.inferred > 0 ? (
                <span>
                  <strong>{counts.inferred}</strong> inferred
                </span>
              ) : null}
            </div>
          </div>
          <div className="canvas-actions" aria-label="Map controls">
            {/* A select rather than a segmented control: nine buttons is a second toolbar, and the
                overlays are one choice from a list, which is what a select already means. */}
            <div className="map-overlay-picker">
              <select
                aria-label="Group bands by"
                value={grouping}
                onChange={(event) => onGroupingChange(event.target.value as MapGrouping)}
              >
                <option value="topology">Layout: network topology</option>
                <option value="purdue">Layout: Purdue levels</option>
              </select>
            </div>
            {/* `aria-label` rather than a wrapping `<label>`: a label element's accessible name is
                its whole text content, and a select's options are inside it — so the wrapped
                version announced "Overlay" followed by all nine option labels. */}
            <div className="map-overlay-picker">
              <select
                aria-label="Overlay"
                value={overlayId}
                onChange={(event) => onOverlayChange(event.target.value as OverlayId)}
              >
                {overlays.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`text-button compact${showServices ? " is-active" : ""}`}
              aria-pressed={showServices}
              title="Print the top open services under each device"
              onClick={onToggleServices}
            >
              Services
            </button>
            <button
              type="button"
              className={`text-button compact${showInferred ? "" : " primary"}`}
              aria-pressed={!showInferred}
              title={showInferred ? "Hide the links we inferred, leaving only what the scan saw" : "Show inferred links again"}
              onClick={onToggleInferred}
            >
              {showInferred ? "Hide inferred" : "Show inferred"}
            </button>
            <button
              type="button"
              className={`text-button compact${connectMode ? " is-active" : ""}`}
              title="Draw a connection by selecting two assets"
              aria-pressed={connectMode}
              onClick={onToggleConnect}
            >
              Connect
            </button>
            <button
              type="button"
              className="text-button compact"
              title="Discard what you dragged in this layout and let it arrange itself"
              onClick={onRearrange}
            >
              Arrange
            </button>
            <button
              type="button"
              className="text-button compact"
              title="Fit the map in view"
              onClick={() => void reactFlow.fitView({ padding: 0.16 })}
            >
              Fit
            </button>
          </div>
        </div>
      }
      overlay={<MapLegend overlay={overlay} />}
    >
      {/* Subnet enclosures: the boxes a network diagram draws around a segment. Behind the link
          overlay so a cable crossing a segment reads as crossing it. */}
      {enclosures.length > 0 ? (
        <div className="map-enclosure-layer" aria-hidden="true">
          {enclosures.map((enclosure) => (
            <div
              className="map-enclosure"
              key={enclosure.id}
              style={{ left: enclosure.x, top: enclosure.y, width: enclosure.width, height: enclosure.height }}
            >
              <span className="map-enclosure-label">
                <strong>{enclosure.label}</strong>
                <small>{enclosure.detail}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div
        className="zone-band-layer"
        aria-hidden="true"
        style={{ "--zone-band-width": `${contentExtent.bandWidth}px` } as CSSProperties}
      >
        {bands.map((band) => (
          <div
            className="zone-band-node"
            key={band.id}
            style={
              {
                "--zone-band-y": `${band.y + ZONE_BAND_Y_OFFSET}px`,
                "--zone-band-height": `${band.height}px`,
                // A subnet has no inherent colour and inventing one would be noise; the band still
                // reads because it is bounded and labelled.
                ...(band.color ? { "--zone-band-color": band.color } : {})
              } as CSSProperties
            }
          >
            <strong>{band.label}</strong>
            <span>{band.detail}</span>
          </div>
        ))}
      </div>
      <LinkOverlay
        items={linkItems}
        width={contentExtent.overlayWidth}
        height={contentExtent.overlayHeight}
        onSelect={onSelect}
      />
    </FlowFrame>
  );
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

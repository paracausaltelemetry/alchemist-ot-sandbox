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
import {
  ASSET_NODE_HEIGHT,
  ASSET_NODE_WIDTH,
  CANVAS_GRID_X,
  ZONE_BAND_HEIGHT,
  ZONE_BAND_Y_OFFSET,
  ZONE_ROW_HEIGHT,
  assetYForZone,
  inferZoneFromY,
  snapX
} from "../data/canvasLayout";
import { getAssetType, getZone, zones } from "../data/catalog";
import { layoutMapAssets } from "../data/mapLayout";
import { routeOrthogonalConduit } from "../engine/conduitRouting";
import { isScanEvidence, itKindLabel, type ItLinkEvidence } from "../models/itMap";
import { ACCESS_LABELS, type ItAccessState } from "../models/itEngagement";
import { bucketsFor, overlays, type Overlay, type OverlayBucket, type OverlayContext, type OverlayId } from "../engine/overlays";
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
  /** Only what a person dragged. Everything else is derived every load. */
  positions: Record<string, Point>;
  fitSignal: number;
  /** Hides the links inferred from addressing, leaving what a scan actually observed. */
  showInferred: boolean;
  /** Which overlay recolours the map. There is no "no overlay" — Purdue level is the plain read. */
  overlayId: OverlayId;
  /** Everything the overlays need, built once by the owner so switching is not a re-assessment. */
  overlayContext: OverlayContext;
  onOverlayChange: (id: OverlayId) => void;
  onSelect: (id: string | null) => void;
  /**
   * Where an asset was put, and the zone that lane means — always together.
   *
   * One callback rather than a move and a re-zone, because they are one act here: the lane *is*
   * the zone. Two callbacks meant two state updates from one handler, the second built from the
   * document the first had already replaced, so the position was silently discarded and the card
   * sprang back to the packer's slot.
   */
  onPlaceAsset: (id: string, position: Point, zone: MapAsset["zone"]) => void;
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
};

type MapFlowNode = Node<MapNodeData, "mapAsset">;

/**
 * Both vocabularies on one line, unless they are saying the same thing.
 *
 * "Firewall · Firewall" is what you get when a card prints the scan's device class next to the OT
 * asset class and the two agree, which reads as a rendering fault rather than as agreement.
 */
function describeClass(asset: MapAsset, typeLabel: string): string {
  if (!asset.deviceKind) {
    return typeLabel;
  }
  const kindLabel = itKindLabel(asset.deviceKind);
  // The internet has no OT asset class. The model has to give it one to keep the shape, but the
  // card should not go on to assert it — "Internet · Enterprise IT" is the map claiming the outside
  // world is part of the estate, which is the thing the band exists to deny.
  if (asset.deviceKind === "internet" || kindLabel === typeLabel) {
    return kindLabel;
  }
  return `${kindLabel} · ${typeLabel}`;
}

/**
 * Memoised with a referentially stable `data`, for the reason both previous canvases were: a real
 * estate puts hundreds of cards down, and moving one rebuilds the whole node array.
 */
const MapAssetCard = memo(function MapAssetCard({ data }: NodeProps<MapFlowNode>) {
  const { asset, selected, access, bucket, connectMode, connectSource } = data;
  const type = getAssetType(asset.type);
  const zone = getZone(asset.zone);
  const inferred = asset.confidence < 1;

  return (
    <div
      className={`asset-node map-node criticality-${asset.criticality}${selected ? " is-selected" : ""}${
        inferred ? " is-ghost" : ""
      }${access ? ` it-node-access-${access}` : ""}${connectMode ? " is-connectable" : ""}${
        connectSource ? " is-connect-source" : ""
      }`}
      style={{ "--zone-color": zone.color, ...(bucket ? bucketStyle(bucket) : {}) } as CSSProperties}
    >
      {/* The overlay reads as a band across the top of the card rather than as a recolour of it:
          the card's own wash already carries the zone, and two washes fighting reads as neither.
          A null bucket draws nothing at all, because the overlay having no answer is not a band. */}
      {bucket ? (
        <span
          className="map-node-overlay"
          data-pattern={bucket.pattern ?? "ramp"}
          data-signal={bucket.signal ? "true" : undefined}
          title={bucket.label}
        />
      ) : null}
      <Handle id="in" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="out" type="source" position={Position.Right} className="flow-handle" />
      <span className="asset-node-zone" title={`${zone.levelLabel}: ${zone.name}`}>
        {zone.shortName}
      </span>
      <div className="asset-node-head">
        {/* Both vocabularies. The OT glyph says what it does to the process; the network symbol
            says what the scan saw it as. Dropping either would be choosing a side again. */}
        <div className="asset-node-icon">
          {asset.deviceKind ? <NetworkSymbol kind={asset.deviceKind} size={20} /> : <AssetGlyph icon={type.icon} size={18} />}
        </div>
        <div className="asset-node-heading">
          <strong className="asset-node-name" title={asset.rationale || asset.name}>
            {asset.name}
          </strong>
          <span className="asset-node-type">{describeClass(asset, type.label)}</span>
        </div>
      </div>
      <div className="asset-node-foot">
        <small className="asset-node-addr" title={asset.ipAddress || "No address"}>
          {asset.ipAddress || (inferred ? "inferred" : "no address")}
        </small>
        <span className="asset-node-badges">
          {access ? <span className="asset-badge tone-warn">{ACCESS_LABELS[access]}</span> : null}
          {asset.provenance === "authored" ? <span className="asset-badge tone-info">yours</span> : null}
          {asset.ports.length > 0 ? (
            <span className="asset-badge tone-info" title={`${asset.ports.length} open services`}>
              {asset.ports.length}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
});

const nodeTypes = { mapAsset: MapAssetCard };

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
  fitSignal,
  showInferred,
  overlayId,
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

  const laidOut = useMemo(() => layoutMapAssets(map.assets, positions), [map.assets, positions]);

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
        cached.flow.position.x === position.x &&
        cached.flow.position.y === position.y
      ) {
        return cached.flow;
      }

      const zone = getZone(asset.zone);
      const flow: MapFlowNode = {
        id: asset.id,
        type: "mapAsset" as const,
        position,
        ariaLabel: `${asset.name}, ${getAssetType(asset.type).label}, ${zone.name}${
          asset.ipAddress ? `, ${asset.ipAddress}` : ""
        }. Press Enter to select.`,
        width: ASSET_NODE_WIDTH,
        height: ASSET_NODE_HEIGHT,
        style: { width: ASSET_NODE_WIDTH, minHeight: ASSET_NODE_HEIGHT },
        data: { asset, selected, access, bucket, connectMode, connectSource }
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
  }, [assetBuckets, connectMode, connectSourceId, laidOut, map.access, map.assets, selectedId]);

  // Snap x to the grid and y to the lane its centre falls in: vertical position *is* the zone here,
  // so a free y would let a card sit between two levels and mean nothing.
  const snapToLane = useCallback((point: Point): Point => {
    return { x: snapX(point.x), y: assetYForZone(inferZoneFromY(point.y + ASSET_NODE_HEIGHT / 2)) };
  }, []);

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
    () => overlayExtent(livePositions.values(), { nodeWidth: ASSET_NODE_WIDTH, nodeHeight: ASSET_NODE_HEIGHT }),
    [livePositions]
  );

  const linkItems = useMemo<LinkOverlayItem[]>(() => {
    const box = (id: string) => {
      const position = livePositions.get(id);
      return position
        ? { x: position.x, y: position.y, width: ASSET_NODE_WIDTH, height: ASSET_NODE_HEIGHT }
        : null;
    };

    return map.connections.flatMap((connection: MapConnection) => {
      if (!showInferred && connection.evidence === "inferred") {
        return [];
      }
      const source = box(connection.source);
      const target = box(connection.target);
      if (!source || !target) {
        return [];
      }

      const route = routeOrthogonalConduit(source, target, 0);
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
  }, [connectionBuckets, livePositions, map.connections, selectedId, showInferred]);

  const commitNodePosition = useCallback<OnNodeDrag<MapFlowNode>>(
    (_, node) => {
      setIsDragging(false);
      const position = snapToLane(node.position);
      // Dropping a card in another lane is how you re-zone an asset here — the lane is the zone, so
      // recording the position without the zone would put the card somewhere its data denies.
      onPlaceAsset(node.id, position, inferZoneFromY(position.y + ASSET_NODE_HEIGHT / 2));
    },
    [onPlaceAsset, snapToLane]
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
      onPlaceAsset(id, position, inferZoneFromY(position.y + ASSET_NODE_HEIGHT / 2));
    },
    [handleNodesChange, livePositions, onPlaceAsset, onSelect, snapToLane]
  );

  const minimapNodeColor = useCallback(() => "#8e979c", []);

  const counts = useMemo(() => {
    const zonesUsed = new Set(map.assets.map((asset) => asset.zone));
    return {
      assets: map.assets.length,
      zones: zonesUsed.size,
      crossings: map.connections.filter((connection) => connection.trustBoundary).length,
      inferred: map.assets.filter((asset) => asset.confidence < 1).length
    };
  }, [map.assets, map.connections]);

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
      frameClassName={`map-frame ${isDragging ? "is-dragging" : ""}`}
      toolbar={
        <div className="canvas-titlebar">
          <div>
            <h2>Estate map</h2>
            <p>
              {connectMode
                ? connectSourceId
                  ? "Select the asset at the other end."
                  : "Select the asset this connection starts from."
                : `${overlay.description}. Drag a card into another band to re-zone it.`}
            </p>
            <div className="canvas-stats" aria-label="Map summary">
              <span>
                <strong>{counts.assets}</strong> assets
              </span>
              <span>
                <strong>{counts.zones}</strong> levels in use
              </span>
              <span>
                <strong>{counts.crossings}</strong> boundary crossings
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
      <div
        className="zone-band-layer"
        aria-hidden="true"
        style={{ "--zone-band-width": `${contentExtent.bandWidth}px` } as CSSProperties}
      >
        {zones.map((zone, index) => (
          <div
            className="zone-band-node"
            key={zone.id}
            style={
              {
                "--zone-band-y": `${index * ZONE_ROW_HEIGHT + ZONE_BAND_Y_OFFSET}px`,
                "--zone-band-height": `${ZONE_BAND_HEIGHT}px`,
                "--zone-band-color": zone.color
              } as CSSProperties
            }
          >
            <strong>
              {zone.levelLabel} - {zone.shortName}
            </strong>
            <span>{zone.name}</span>
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

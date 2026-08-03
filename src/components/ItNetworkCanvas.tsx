import { Handle, Position, ReactFlowProvider, type Node, type NodeProps, type OnNodeDrag, useReactFlow } from "@xyflow/react";
import { Eye, ShieldAlert, Waypoints, type LucideIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { CANVAS_GRID_X, snapToGrid } from "../data/canvasLayout";
import { IT_NODE_HEIGHT, IT_NODE_WIDTH, itBandBoxes } from "../data/itLayout";
import { routeOrthogonalConduit } from "../engine/conduitRouting";
import { isScanEvidence, itKindLabel, type ItLink, type ItMap, type ItNode } from "../models/itMap";
import { ACCESS_LABELS, type ItAccessState } from "../models/itEngagement";
import type { Point } from "../models/types";
import { FlowFrame } from "./canvas/FlowFrame";
import { LinkOverlay, type LinkOverlayItem } from "./canvas/LinkOverlay";
import { overlayExtent } from "./canvas/geometry";
import { useFlowNodes } from "./canvas/useFlowNodes";
import { NetworkSymbol } from "./NetworkSymbol";

/**
 * The IT network map. Built on the same React Flow core as the OT canvas but sharing none of
 * its vocabulary: no Purdue zones, no advisory score, no conduits. Nodes are drawn with the
 * standard network-map symbols, and links carry the evidence that produced them so an inferred
 * uplink never looks like something the scan actually saw.
 */

export type ItCanvasMode = "topology" | "exposure" | "services";
export type ItRisk = "high" | "medium";

interface ItNetworkCanvasProps {
  map: ItMap;
  selectedId: string | null;
  canvasMode: ItCanvasMode;
  riskByNodeId: Map<string, ItRisk>;
  /** Folded from the journal. Empty until the operator records something. */
  accessByNodeId: Map<string, ItAccessState>;
  fitSignal: number;
  onSelect: (id: string | null) => void;
  onCanvasModeChange: (mode: ItCanvasMode) => void;
  onMoveNode: (id: string, position: Point) => void;
  onRearrange: () => void;
  showInferred: boolean;
  onToggleInferred: () => void;
  /** Fired when the operator drags one node's handle onto another. */
  onConnect: (source: string, target: string) => void;
  connectMode: boolean;
  connectSourceId: string | null;
  onToggleConnect: () => void;
}

type ItNodeData = {
  node: ItNode;
  selected: boolean;
  risk: ItRisk | null;
  access: ItAccessState | null;
  showServices: boolean;
  dimmed: boolean;
  connectMode: boolean;
  connectSource: boolean;
};

type ItFlowNode = Node<ItNodeData, "itNode">;

const viewModeOptions: Array<{ mode: ItCanvasMode; label: string; Icon: LucideIcon; title: string }> = [
  { mode: "topology", label: "Topology", Icon: Waypoints, title: "The network as the scan describes it" },
  { mode: "exposure", label: "Exposure", Icon: ShieldAlert, title: "Emphasise internet-facing and risky hosts" },
  { mode: "services", label: "Services", Icon: Eye, title: "Show the services each host exposes" }
];

/** The services worth putting on a card before it gets noisy. */
const SERVICE_CHIP_LIMIT = 3;

/**
 * Memoised, with a referentially stable `data` object built below: a real /24 puts 300 cards on
 * the canvas, and moving one node rebuilds the whole node array. Measured on a 300-host map,
 * this takes a node move from ~178ms to ~127ms. The remainder is React Flow resetting its own
 * store, which would need a larger change to avoid.
 */
const ItNodeCard = memo(function ItNodeCard({ data }: NodeProps<ItFlowNode>) {
  const { node, risk, access, showServices, dimmed, selected, connectMode, connectSource } = data;
  const ghost = node.origin === "synthetic";
  const services = node.ports.slice(0, SERVICE_CHIP_LIMIT);

  return (
    <div
      className={`it-node${ghost ? " is-ghost" : ""}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${
        risk ? ` it-node-risk-${risk}` : ""
      }${access ? ` it-node-access-${access}` : ""}${connectMode ? " is-connectable" : ""}${
        connectSource ? " is-connect-source" : ""
      }`}
    >
      <Handle id="in" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="out" type="source" position={Position.Right} className="flow-handle" />
      <div className="it-node-symbol">
        <NetworkSymbol kind={node.kind} />
      </div>
      <div className="it-node-body">
        <strong className="it-node-name" title={node.rationale}>
          {node.name}
        </strong>
        <span className="it-node-kind">{itKindLabel(node.kind)}</span>
        {showServices && services.length > 0 ? (
          <span className="it-node-services">
            {services.map((port) => (
              <span key={`${port.port}-${port.transport ?? "tcp"}`}>{port.service || port.port}</span>
            ))}
            {node.ports.length > services.length ? <span>+{node.ports.length - services.length}</span> : null}
          </span>
        ) : (
          <span className="it-node-addr">{node.ip || (ghost ? "inferred" : "no address")}</span>
        )}
      </div>
      {access ? <span className="it-node-access">{ACCESS_LABELS[access]}</span> : null}
      {ghost ? <span className="it-node-chip">inferred</span> : null}
      {!ghost && node.ports.length > 0 && !showServices ? (
        <span className="it-node-chip">{node.ports.length}</span>
      ) : null}
    </div>
  );
});

const nodeTypes = { itNode: ItNodeCard };

/** Links are drawn from their evidence: observed paths solid, reasoning dashed. */
const EVIDENCE_DASH: Record<ItLink["evidence"], string | undefined> = {
  traceroute: undefined,
  "observed-flow": undefined,
  // Long dash, short gap: reads as deliberate movement rather than as uncertainty, which is what
  // every other dashed line on this canvas means.
  attack: "12 4",
  asserted: undefined,
  "same-subnet": "1 5",
  inferred: "8 6"
};

/**
 * An operator-drawn link is solid — they are asserting it, not guessing — but heavier, so it is
 * distinguishable from scan output without reaching for colour. Weight rather than hue because
 * `--signal` is the only colour on this canvas and it means danger.
 *
 * This has to clear `.conduit-overlay-path`'s own `stroke-width: 5.4`, not sit at some value that
 * merely looks bold in isolation: an override below the stylesheet's base makes the operator's link
 * the *thinnest* line on the canvas, which is the opposite of the intent and reads as a mistake.
 */
const ASSERTED_STROKE_WIDTH = 8;

function ItNetworkCanvasInner({
  map,
  selectedId,
  canvasMode,
  riskByNodeId,
  accessByNodeId,
  fitSignal,
  onSelect,
  onCanvasModeChange,
  onMoveNode,
  onRearrange,
  showInferred,
  onToggleInferred,
  onConnect,
  connectMode,
  connectSourceId,
  onToggleConnect
}: ItNetworkCanvasProps) {
  const reactFlow = useReactFlow();
  const [isDragging, setIsDragging] = useState(false);

  const showServices = canvasMode === "services";
  const isExposure = canvasMode === "exposure";

  // Moving one node rebuilds the array but leaves every other ItNode referentially untouched,
  // so reuse the flow node we built last time whenever nothing about it changed. Together with
  // the memo on the card this is what keeps a 300-host map responsive.
  const flowCache = useRef(new Map<string, { source: ItNode; flow: ItFlowNode }>());

  const flowSource = useMemo<ItFlowNode[]>(() => {
    const cache = flowCache.current;
    const next = map.nodes.map((node) => {
      const risk = riskByNodeId.get(node.id) ?? null;
      const access = accessByNodeId.get(node.id) ?? null;
      const selected = selectedId === node.id;
      const connectSource = connectSourceId === node.id;
      // In exposure mode everything unflagged recedes so the flagged hosts carry the view.
      const dimmed = isExposure && !risk;

      const cached = cache.get(node.id);
      if (
        cached &&
        cached.source === node &&
        cached.flow.data.selected === selected &&
        cached.flow.data.risk === risk &&
        // Explicit, like every other field here: one left out is one that never updates on a node
        // once it has been drawn, so recording an action would leave the old decoration in place.
        cached.flow.data.access === access &&
        cached.flow.data.connectMode === connectMode &&
        cached.flow.data.connectSource === connectSource &&
        cached.flow.data.showServices === showServices &&
        cached.flow.data.dimmed === dimmed
      ) {
        return cached.flow;
      }

      const flow: ItFlowNode = {
        id: node.id,
        type: "itNode" as const,
        position: node.position,
        // Read out on the focusable wrapper React Flow gives each node.
        ariaLabel: `${node.name}, ${itKindLabel(node.kind)}${node.ip ? `, ${node.ip}` : ""}. Press Enter to select.`,
        width: IT_NODE_WIDTH,
        height: IT_NODE_HEIGHT,
        style: { width: IT_NODE_WIDTH, minHeight: IT_NODE_HEIGHT },
        data: { node, selected, risk, access, showServices, dimmed, connectMode, connectSource },
        zIndex: risk ? 10 : 5
      };
      cache.set(node.id, { source: node, flow });
      return flow;
    });

    // Drop cache entries for nodes that are no longer on the map.
    if (cache.size > next.length) {
      const live = new Set(next.map((flow) => flow.id));
      for (const id of [...cache.keys()]) {
        if (!live.has(id)) {
          cache.delete(id);
        }
      }
    }
    return next;
  }, [accessByNodeId, connectMode, connectSourceId, isExposure, map.nodes, riskByNodeId, selectedId, showServices]);

  // Return the node itself when snapping is a no-op. Every change runs this over the whole
  // array, so spreading unconditionally would hand React Flow 305 new objects for one move and
  // undo the memo on the card.
  const normaliseNode = useCallback((node: ItFlowNode): ItFlowNode => {
    const snapped = snapToGrid(node.position);
    if (snapped.x === node.position.x && snapped.y === node.position.y) {
      return node;
    }
    return { ...node, position: snapped };
  }, []);

  const [flowNodes, handleNodesChange] = useFlowNodes<ItFlowNode>(flowSource, normaliseNode);

  const livePositions = useMemo(
    () => new Map(flowNodes.map((node) => [node.id, node.position])),
    [flowNodes]
  );

  const positionedNodes = useMemo(
    () => map.nodes.map((node) => ({ ...node, position: livePositions.get(node.id) ?? node.position })),
    [livePositions, map.nodes]
  );

  const bandBoxes = useMemo(
    () => itBandBoxes(positionedNodes, livePositions, map.subnets),
    [livePositions, map.subnets, positionedNodes]
  );

  const contentExtent = useMemo(
    () => overlayExtent(livePositions.values(), { nodeWidth: IT_NODE_WIDTH, nodeHeight: IT_NODE_HEIGHT }),
    [livePositions]
  );

  const linkItems = useMemo<LinkOverlayItem[]>(() => {
    const byId = new Map(positionedNodes.map((node) => [node.id, node]));

    return map.links.flatMap((link) => {
      // Hiding inference leaves only what the scan actually observed.
      if (!showInferred && link.evidence === "inferred") {
        return [];
      }
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target) {
        return [];
      }

      const box = (node: ItNode) => ({
        x: node.position.x,
        y: node.position.y,
        width: IT_NODE_WIDTH,
        height: IT_NODE_HEIGHT
      });
      const route = routeOrthogonalConduit(box(source), box(target), 0);
      const observed = isScanEvidence(link.evidence);
      // An operator-drawn link reads at full strength alongside scan output: they saw it happen.
      // It is not swallowed by "Hide inferred" either, which hides our reasoning, not theirs.
      const asserted = link.evidence === "asserted";

      return [
        {
          id: link.id,
          path: route.path,
          labelX: route.labelX,
          labelY: route.labelY,
          label: link.evidence === "traceroute" && link.rttMs !== undefined ? `${link.rttMs.toFixed(1)} ms` : link.label,
          labelVisible: observed || asserted,
          color: observed || asserted ? "var(--text)" : "var(--muted)",
          opacity: isExposure ? 0.4 : observed || asserted ? 0.9 : 0.55,
          markerEnd: true,
          dash: EVIDENCE_DASH[link.evidence],
          strokeWidth: asserted ? ASSERTED_STROKE_WIDTH : undefined,
          selected: selectedId === link.id,
          highlighted: false
        }
      ];
    });
  }, [isExposure, map.links, positionedNodes, selectedId, showInferred]);

  const commitNodePosition = useCallback<OnNodeDrag<ItFlowNode>>(
    (_, node) => {
      setIsDragging(false);
      onMoveNode(node.id, snapToGrid(node.position));
    },
    [onMoveNode]
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
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-CANVAS_GRID_X, 0],
        ArrowRight: [CANVAS_GRID_X, 0],
        ArrowUp: [0, -CANVAS_GRID_X],
        ArrowDown: [0, CANVAS_GRID_X]
      };
      const move = delta[event.key];
      if (!move) return;
      event.preventDefault();
      const current = livePositions.get(id);
      if (!current) return;
      const position = { x: current.x + move[0], y: current.y + move[1] };
      // Move it the same way a drag does — through React Flow's own change pipeline — then
      // record it. The owner keeps dragged positions out of React state on purpose.
      handleNodesChange([{ id, type: "position", position, dragging: false }]);
      onMoveNode(id, position);
    },
    [handleNodesChange, livePositions, onMoveNode, onSelect]
  );

  const minimapNodeColor = useCallback(
    (node: Node) => (riskByNodeId.has(node.id) ? "var(--signal)" : "#8e979c"),
    [riskByNodeId]
  );

  const counts = useMemo(() => {
    const scanned = map.nodes.filter((node) => node.origin === "scanned");
    return {
      hosts: scanned.filter((node) => node.tier === "host").length,
      routers: scanned.filter((node) => node.tier !== "host").length,
      inferred: map.nodes.length - scanned.length,
      observed: map.links.filter((link) => link.evidence === "traceroute").length
    };
  }, [map.links, map.nodes]);

  return (
    <FlowFrame<ItFlowNode>
      nodes={flowNodes}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeDragStart={() => setIsDragging(true)}
      onNodeDragStop={commitNodePosition}
      onNodeClick={onSelect}
      onConnect={onConnect}
      onPaneClick={() => { if (!connectMode) onSelect(null); }}
      onKeyDown={handleKeyDown}
      snapGrid={[CANVAS_GRID_X, CANVAS_GRID_X]}
      fitSignal={fitSignal}
      minimapNodeColor={minimapNodeColor}
      sectionLabel="Network map"
      frameClassName={`it-map-frame mode-${canvasMode} ${isDragging ? "is-dragging" : ""}`}
      toolbar={
        <div className="canvas-titlebar">
          <div>
            <h2>Network map</h2>
            <p>
              {connectMode
                ? connectSourceId
                  ? "Select the host at the other end."
                  : "Select the host this link starts from."
                : counts.observed > 0
                  ? "Solid links were traced by the scan; dashed links are inferred from addressing. Drag from a host's edge to draw your own."
                  : "Links are inferred from addressing. Re-run Nmap with --traceroute to map the real paths, or drag from a host's edge to draw your own."}
            </p>
            <div className="canvas-stats" aria-label="Map summary">
              <span>
                <strong>{counts.hosts}</strong> hosts
              </span>
              <span>
                <strong>{counts.routers}</strong> network devices
              </span>
              <span>
                <strong>{map.subnets.length}</strong> subnets
              </span>
              {counts.inferred > 0 ? (
                <span>
                  <strong>{counts.inferred}</strong> inferred
                </span>
              ) : null}
            </div>
          </div>
          <div className="canvas-actions" aria-label="Map controls">
            <div className="segmented-control" aria-label="Map view mode">
              {viewModeOptions.map(({ mode, label, Icon, title }) => (
                <button
                  key={mode}
                  type="button"
                  className={canvasMode === mode ? "active" : ""}
                  onClick={() => onCanvasModeChange(mode)}
                  title={title}
                >
                  <Icon size={13} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`text-button compact${showInferred ? "" : " primary"}`}
              title={showInferred ? "Hide the links we inferred, leaving only what the scan saw" : "Show inferred links again"}
              aria-pressed={!showInferred}
              onClick={onToggleInferred}
            >
              {showInferred ? "Hide inferred" : "Show inferred"}
            </button>
            <button
              type="button"
              className={`text-button compact${connectMode ? " is-active" : ""}`}
              title="Draw a link by clicking two hosts"
              aria-pressed={connectMode}
              onClick={onToggleConnect}
            >
              Connect
            </button>
            <button type="button" className="text-button compact" title="Re-run the layout" onClick={onRearrange}>
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
      overlay={
        <div className="it-map-legend" aria-label="Map legend">
          <span>
            <i data-evidence="traceroute" /> traced
          </span>
          <span>
            <i data-evidence="asserted" /> you drew
          </span>
          <span>
            <i data-evidence="same-subnet" /> same subnet
          </span>
          <span>
            <i data-evidence="inferred" /> inferred
          </span>
          <span>
            <i data-evidence="attack" /> you did
          </span>
          <span>
            <i data-access="admin" /> access held
          </span>
          <span>
            <i data-risk="high" /> exposed
          </span>
          <span>
            <i data-risk="medium" /> risky service
          </span>
        </div>
      }
    >
      {bandBoxes.length > 0 ? (
        <div className="subnet-layer" aria-hidden="true">
          {bandBoxes.map((box) => (
            <div
              className="subnet-box"
              key={box.id}
              style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
            >
              <span className="subnet-box-label">
                <strong>{box.name}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <LinkOverlay
        items={linkItems}
        width={contentExtent.overlayWidth}
        height={contentExtent.overlayHeight}
        onSelect={onSelect}
      />
    </FlowFrame>
  );
}

export function ItNetworkCanvas(props: ItNetworkCanvasProps) {
  return (
    <ReactFlowProvider>
      <ItNetworkCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

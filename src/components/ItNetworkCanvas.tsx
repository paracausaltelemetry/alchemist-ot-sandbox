import { ReactFlowProvider, type Node, type NodeProps, type OnNodeDrag, useReactFlow } from "@xyflow/react";
import { Eye, ShieldAlert, Waypoints, type LucideIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { CANVAS_GRID_X, snapToGrid } from "../data/canvasLayout";
import { IT_NODE_HEIGHT, IT_NODE_WIDTH, itBandBoxes } from "../data/itLayout";
import { routeOrthogonalConduit } from "../engine/conduitRouting";
import { itKindLabel, type ItLink, type ItMap, type ItNode } from "../models/itMap";
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
  fitSignal: number;
  onSelect: (id: string | null) => void;
  onCanvasModeChange: (mode: ItCanvasMode) => void;
  onMoveNode: (id: string, position: Point) => void;
  onRearrange: () => void;
  showInferred: boolean;
  onToggleInferred: () => void;
}

type ItNodeData = {
  node: ItNode;
  selected: boolean;
  risk: ItRisk | null;
  showServices: boolean;
  dimmed: boolean;
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
  const { node, risk, showServices, dimmed, selected } = data;
  const ghost = node.origin === "synthetic";
  const services = node.ports.slice(0, SERVICE_CHIP_LIMIT);

  return (
    <div
      className={`it-node${ghost ? " is-ghost" : ""}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${
        risk ? ` it-node-risk-${risk}` : ""
      }`}
    >
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
  "same-subnet": "1 5",
  inferred: "8 6"
};

function ItNetworkCanvasInner({
  map,
  selectedId,
  canvasMode,
  riskByNodeId,
  fitSignal,
  onSelect,
  onCanvasModeChange,
  onMoveNode,
  onRearrange,
  showInferred,
  onToggleInferred
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
      const selected = selectedId === node.id;
      // In exposure mode everything unflagged recedes so the flagged hosts carry the view.
      const dimmed = isExposure && !risk;

      const cached = cache.get(node.id);
      if (
        cached &&
        cached.source === node &&
        cached.flow.data.selected === selected &&
        cached.flow.data.risk === risk &&
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
        data: { node, selected, risk, showServices, dimmed },
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
  }, [isExposure, map.nodes, riskByNodeId, selectedId, showServices]);

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
      const observed = link.evidence === "traceroute" || link.evidence === "observed-flow";

      return [
        {
          id: link.id,
          path: route.path,
          labelX: route.labelX,
          labelY: route.labelY,
          label: link.evidence === "traceroute" && link.rttMs !== undefined ? `${link.rttMs.toFixed(1)} ms` : link.label,
          labelVisible: observed,
          color: observed ? "var(--text)" : "var(--muted)",
          opacity: isExposure ? 0.4 : observed ? 0.9 : 0.55,
          markerEnd: true,
          dash: EVIDENCE_DASH[link.evidence],
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
      onPaneClick={() => onSelect(null)}
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
              {counts.observed > 0
                ? "Solid links were traced by the scan; dashed links are inferred from addressing."
                : "Links are inferred from addressing. Re-run Nmap with --traceroute to map the real paths."}
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
            <i data-evidence="same-subnet" /> same subnet
          </span>
          <span>
            <i data-evidence="inferred" /> inferred
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

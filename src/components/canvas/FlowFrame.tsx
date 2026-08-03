import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  useReactFlow
} from "@xyflow/react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { CANVAS_GRID_X, DEFAULT_VIEWPORT } from "../../data/canvasLayout";
import type { Point } from "../../models/types";

/**
 * The React Flow plumbing both canvases sit on: the flow itself, the dot grid, the minimap, the
 * controls, and the flow-space portal that background layers and the link overlay draw into.
 *
 * Everything domain-specific arrives through slots — `toolbar` above the frame, `overlay` in
 * screen space over it, `children` in flow space inside the viewport portal — so neither canvas
 * has to know anything about the other. Callers must already be inside a `ReactFlowProvider`,
 * which is what lets them use `useReactFlow` for their own toolbars.
 */

interface FlowFrameProps<T extends Node> {
  nodes: T[];
  nodeTypes: NodeTypes;
  onNodesChange: (changes: NodeChange<T>[]) => void;
  onNodeDragStart?: () => void;
  onNodeDragStop?: OnNodeDrag<T>;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
  onSelectionChange?: (nodes: Node[]) => void;
  onConnect?: (source: string, target: string) => void;
  /** Keyboard handling for the focusable node wrappers React Flow renders. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Drag-and-drop from a palette: the frame resolves the drop point into flow coordinates. */
  dropMimeType?: string;
  onDropAt?: (payload: string, position: Point) => void;
  snapGrid: [number, number];
  fitSignal: number;
  /** Changing this refits the view — used when a layout switch reflows every node. */
  refitKey?: string;
  minimapNodeColor: (node: Node) => string;
  sectionLabel: string;
  /**
   * A readable equivalent of what the canvas draws, rendered visually hidden inside this region.
   *
   * React Flow is absolutely positioned divs with no reading order, so the region's `aria-label`
   * was the only thing behind it — a name for a picture nobody could see the contents of.
   */
  textEquivalent?: ReactNode;
  frameClassName?: string;
  toolbar?: ReactNode;
  overlay?: ReactNode;
  children?: ReactNode;
}

export function FlowFrame<T extends Node>({
  nodes,
  nodeTypes,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  onNodeClick,
  onPaneClick,
  onSelectionChange,
  onConnect,
  onKeyDown,
  dropMimeType,
  onDropAt,
  snapGrid,
  fitSignal,
  refitKey,
  minimapNodeColor,
  sectionLabel,
  textEquivalent,
  frameClassName = "",
  toolbar,
  overlay,
  children
}: FlowFrameProps<T>) {
  const reactFlow = useReactFlow();

  // A layout switch reflows every node, so refit the view to the new arrangement. Skip the
  // first run to preserve the default viewport on load.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const frame = window.requestAnimationFrame(() => void reactFlow.fitView({ padding: 0.16, duration: 320 }));
    return () => window.cancelAnimationFrame(frame);
  }, [refitKey, reactFlow]);

  // Explicit refit requests from the app (load a scenario, import, or auto-arrange) frame the
  // freshly positioned topology. Skips 0 so the initial render keeps the default viewport.
  useEffect(() => {
    if (fitSignal === 0) {
      return;
    }
    const frame = window.requestAnimationFrame(() => void reactFlow.fitView({ padding: 0.16, duration: 320 }));
    return () => window.cancelAnimationFrame(frame);
  }, [fitSignal, reactFlow]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (onConnect && connection.source && connection.target) {
        onConnect(connection.source, connection.target);
      }
    },
    [onConnect]
  );

  // Stable identity is required: React Flow re-invokes onSelectionChange whenever the handler
  // reference changes, so an inline arrow here causes an infinite render loop.
  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => onSelectionChange?.(selected),
    [onSelectionChange]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!dropMimeType || !onDropAt) {
        return;
      }
      const payload = event.dataTransfer.getData(dropMimeType);
      if (!payload) {
        return;
      }
      onDropAt(payload, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [dropMimeType, onDropAt, reactFlow]
  );

  return (
    // Drag-and-drop placement from the asset palette is pointer-only; adding
    // assets also works via the palette's click buttons (desktop-only canvas).
    <section
      className="canvas-shell"
      aria-label={sectionLabel}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {toolbar}
      {textEquivalent}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={`react-flow-frame ${frameClassName}`} onKeyDown={onKeyDown}>
        {overlay}
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onConnect={handleConnect}
          onNodeClick={(_, node) => onNodeClick(node.id)}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange ? handleSelectionChange : undefined}
          defaultViewport={DEFAULT_VIEWPORT}
          minZoom={0.45}
          maxZoom={1.5}
          deleteKeyCode={null}
          connectionRadius={38}
          snapGrid={snapGrid}
          autoPanOnNodeDrag={false}
          proOptions={{ hideAttribution: true }}
        >
          <ViewportPortal>{children}</ViewportPortal>
          <Background
            className="snap-grid-background"
            color="#64717d"
            gap={CANVAS_GRID_X}
            size={1.1}
            variant={BackgroundVariant.Dots}
          />
          <MiniMap
            className="canvas-minimap"
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={minimapNodeColor}
            maskColor="rgba(10, 11, 12, 0.55)"
          />
          <Controls position="bottom-left" />
        </ReactFlow>
      </div>
    </section>
  );
}

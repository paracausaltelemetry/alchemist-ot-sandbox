import { applyNodeChanges, useNodesState, type Node, type NodeChange } from "@xyflow/react";
import { useCallback, useEffect } from "react";

/**
 * Keeps React Flow's node state in step with the nodes derived from the project, and puts every
 * change through a caller-supplied `normalise` so a dragged node is snapped (and any position
 * mirrored into node data) before it is stored.
 *
 * Extracted so both canvases share one copy: the resync effect and the normalise-after-apply
 * order are easy to get subtly wrong, and a second hand-rolled version would drift.
 */
export function useFlowNodes<T extends Node>(
  source: T[],
  normalise: (node: T) => T
): [T[], (changes: NodeChange<T>[]) => void] {
  const [flowNodes, setFlowNodes] = useNodesState<T>(source);

  useEffect(() => {
    setFlowNodes(source);
  }, [source, setFlowNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<T>[]) => {
      setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes).map((node) => normalise(node as T)));
    },
    [normalise, setFlowNodes]
  );

  return [flowNodes, handleNodesChange];
}

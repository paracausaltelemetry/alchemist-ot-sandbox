// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopologyCanvas } from "./TopologyCanvas";
import { sampleProject } from "../data/sampleProject";
import { assessProject } from "../engine/scoring";

/**
 * A guard on the extraction of the shared canvas core, not a test of the canvas. React Flow
 * needs real layout to render, which jsdom cannot provide beyond the stubs in vitest.setup —
 * so this checks that the chrome mounts and the nodes reach the flow, and stops there.
 * Geometry is covered by the pure layout tests. Do not grow this file.
 */
function renderCanvas() {
  const noop = () => {};
  return render(
    <TopologyCanvas
      project={sampleProject}
      assessment={assessProject(sampleProject)}
      selectedId={null}
      highlightedConduitIds={[]}
      canvasMode="clean"
      layoutMode="network"
      connectMode={false}
      connectSourceId={null}
      canUndo={false}
      canRedo={false}
      onSelect={noop}
      onAssetClick={vi.fn()}
      onCreateAsset={noop}
      onCreateConduit={noop}
      onProjectChange={noop}
      onCanvasModeChange={noop}
      onLayoutModeChange={noop}
      onManageSubnets={noop}
      onAutoArrange={noop}
      fitSignal={0}
      onToggleConnectMode={noop}
      onFindingSelect={noop}
      onRenameAsset={noop}
      onSelectionChange={noop}
      onUndo={noop}
      onRedo={noop}
    />
  );
}

describe("TopologyCanvas", () => {
  it("renders the canvas shell and its toolbar", () => {
    renderCanvas();
    expect(screen.getByRole("region", { name: "Topology canvas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Network Layout" })).toBeInTheDocument();
  });

  it("passes the project's assets through to the flow", () => {
    const { container } = renderCanvas();
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(sampleProject.assets.length);
  });

  it("draws a conduit overlay path for each conduit", () => {
    const { container } = renderCanvas();
    expect(container.querySelectorAll(".conduit-overlay-path")).toHaveLength(sampleProject.conduits.length);
  });
});

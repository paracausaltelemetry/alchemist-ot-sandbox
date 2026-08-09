import { describe, expect, it } from "vitest";
import { buildMapStageMaps } from "./mapStageMaps";
import { stageNodesBySource } from "./mapStageNodes";
import { projectMap } from "./mapProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newCyberMap, newImportSource, nextMapSequence, type CyberMapDocument } from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";

function withSample(): CyberMapDocument {
  const base = newCyberMap("Stages");
  return {
    ...base,
    sources: [
      newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
        kind: "external",
        label: "External"
      })
    ]
  };
}

function withTwoEvents(doc: CyberMapDocument): CyberMapDocument {
  const projected = projectMap(doc);
  const [first, second] = projected.assets;
  const one = newItEvent("exploit", "Foothold", nextMapSequence(doc), {
    targetNodeId: first.id,
    grants: "user"
  });
  const withOne = { ...doc, events: [one] };
  const two = newItEvent("lateral-movement", "Pivoted", nextMapSequence(withOne), {
    sourceNodeId: first.id,
    targetNodeId: second.id,
    grants: "admin"
  });
  return { ...doc, events: [one, two] };
}

describe("stage maps", () => {
  it("draws nothing for a document with no sources", () => {
    expect(buildMapStageMaps(newCyberMap())).toEqual([]);
  });

  it("gives one picture per import and one per action, in sequence", () => {
    const doc = withTwoEvents(withSample());
    const stages = buildMapStageMaps(doc);

    expect(stages).toHaveLength(doc.sources.length + doc.events.length);
    expect(stages.map((stage) => stage.sequence)).toEqual([...stages.map((s) => s.sequence)].sort((a, b) => a - b));
  });

  it("is cumulative, so the reader follows one estate rather than several", () => {
    const stages = buildMapStageMaps(withTwoEvents(withSample()));
    for (let index = 1; index < stages.length; index += 1) {
      // Every asset from the previous stage is still here; a later stage may add more.
      const before = stages[index - 1].assets.map((asset) => asset.id);
      const now = new Set(stages[index].assets.map((asset) => asset.id));
      for (const id of before) {
        expect(now.has(id)).toBe(true);
      }
    }
  });

  it("never shows an attack edge before it happened", () => {
    const doc = withTwoEvents(withSample());
    const stages = buildMapStageMaps(doc);
    const attacksAt = stages.map((stage) => stage.connections.filter((entry) => entry.evidence === "attack").length);

    // The first import predates every action, so its picture carries none.
    expect(attacksAt[0]).toBe(0);
    expect(attacksAt[attacksAt.length - 1]).toBeGreaterThan(0);
    expect([...attacksAt].sort((a, b) => a - b)).toEqual(attacksAt);
  });

  it("mints its attack edges from a blank connection rather than copying another one", () => {
    // Copying a derived connection would carry that one's firewall rule and boundary flag onto an
    // arrow that has neither, and the report tabulates both.
    const stages = buildMapStageMaps(withTwoEvents(withSample()));
    const attack = stages.at(-1)!.connections.find((entry) => entry.evidence === "attack")!;

    expect(attack.trustBoundary).toBe(false);
    expect(attack.firewallRule).toBe("unknown");
    expect(attack.control).toBe("routed");
  });

  it("emphasises what an import revealed, and what access was held after an action", () => {
    const doc = withTwoEvents(withSample());
    const stages = buildMapStageMaps(doc);
    const revealed = stageNodesBySource(doc).get(doc.sources[0].sequence)!.revealed;

    expect(stages[0].emphasise).toEqual(revealed);
    expect(stages.at(-1)!.emphasise!.size).toBeGreaterThan(0);
    expect(stages.at(-1)!.subtitle).toMatch(/Access held after this stage/);
  });

  it("holds every card still across the sequence, so nothing has to be hunted for", () => {
    // Positions come from one layout over the whole estate. Re-laying out each stage's subset would
    // move a card between pictures because a later import changed how a lane packs.
    const stages = buildMapStageMaps(withTwoEvents(withSample()));
    const first = stages[0].positions;
    for (const stage of stages) {
      expect(stage.positions).toBe(first);
    }
  });
});

import { describe, expect, it } from "vitest";
import type { Finding } from "../models/types";
import { groupFindings } from "./findingGroups";

const finding = (id: string, conduitId: string, title = "Boundary flow lacks inspection or logging"): Finding => ({
  id,
  category: "monitoring",
  severity: "high",
  title,
  detail: `Finding ${id}`,
  remediation: "Enable inspection and logging.",
  affectedAssetIds: [],
  affectedConduitIds: [conduitId],
  references: []
});

describe("groupFindings", () => {
  it("groups repeated rule hits without losing individual findings", () => {
    const result = groupFindings([finding("a", "c1"), finding("b", "c2")]);

    expect(result).toHaveLength(1);
    expect(result[0].findings.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result[0].affectedConduitIds).toEqual(["c1", "c2"]);
  });

  it("keeps findings with different titles separate", () => {
    expect(groupFindings([finding("a", "c1"), finding("b", "c2", "Any-any boundary rule")])).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { conduitParallelOffsets } from "./conduitVisuals";
import type { Conduit } from "../models/types";

function conduit(id: string, protocol: string): Conduit {
  return {
    id,
    source: "scada",
    target: "plc",
    name: id,
    protocol,
    port: "",
    protocolFamily: "auto",
    direction: "source-to-target",
    control: "firewalled",
    firewallRule: "explicit",
    trustBoundary: true,
    inspected: true,
    logged: true,
    encrypted: true,
    jumpHostRequired: false,
    ruleOwner: "OT",
    businessJustification: "Required",
    reviewDate: "",
    expiryDate: "",
    monitoringSource: "",
    inspectionPoint: "",
    temporaryAccess: false,
    businessCritical: false,
    notes: ""
  };
}

describe("conduit visual layout", () => {
  it("places multiple conduits between the same assets on separate side-by-side tracks", () => {
    const offsets = conduitParallelOffsets([conduit("https", "HTTPS"), conduit("modbus", "Modbus TCP"), conduit("opc", "OPC UA")], 12);
    const values = [...offsets.values()].sort((a, b) => a - b);

    expect(values).toEqual([-12, 0, 12]);
  });

  it("treats reverse source and target as the same visual bundle", () => {
    const reverse = { ...conduit("reverse", "RDP"), source: "plc", target: "scada" };
    const offsets = conduitParallelOffsets([conduit("forward", "HTTPS"), reverse], 10);

    expect(new Set(offsets.values()).size).toBe(2);
  });
});

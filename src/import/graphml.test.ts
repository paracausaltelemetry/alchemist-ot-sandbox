import { describe, expect, it } from "vitest";
import { parseGraphml } from "./graphml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="d0" for="node" attr.name="ip" attr.type="string"/>
  <key id="d1" for="node" attr.name="vendor" attr.type="string"/>
  <graph edgedefault="directed">
    <node id="n0"><data key="d0">10.0.1.10</data><data key="d1">Rockwell</data></node>
    <node id="n1"><data key="d0">10.0.2.5</data></node>
    <edge source="n1" target="n0"><data key="port">44818</data></edge>
  </graph>
</graphml>`;

describe("parseGraphml", () => {
  it("resolves <key> names so node data maps to ip/vendor and builds flows from edges", () => {
    const result = parseGraphml(SAMPLE);
    expect(result.hosts).toHaveLength(2);
    const responder = result.hosts.find((host) => host.ip === "10.0.1.10");
    expect(responder?.vendor).toBe("Rockwell");
    expect(responder?.ports.map((port) => port.port)).toContain(44818);

    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]).toMatchObject({ sourceIp: "10.0.2.5", targetIp: "10.0.1.10", port: 44818 });
  });
});

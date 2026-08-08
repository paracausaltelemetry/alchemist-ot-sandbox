import { describe, expect, it } from "vitest";
import { parseZeekConn } from "./zeek";

const TSV = [
  "#separator \\x09",
  "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice",
  "1.0\tC1\t10.0.2.5\t40000\t10.0.1.10\t502\ttcp\tmodbus",
  "1.1\tC2\t10.0.2.5\t40001\t10.0.1.10\t502\ttcp\tmodbus"
].join("\n");

const JSON_LINES = [
  '{"id.orig_h":"10.0.2.5","id.orig_p":40000,"id.resp_h":"10.0.1.10","id.resp_p":502,"proto":"tcp","service":"modbus"}',
  '{"id.orig_h":"10.0.2.5","id.orig_p":40002,"id.resp_h":"10.0.3.7","id.resp_p":44818,"proto":"tcp","service":"enip"}'
].join("\n");

describe("parseZeekConn", () => {
  it("parses the classic TSV format and records responder service ports", () => {
    const result = parseZeekConn(TSV);
    expect(result.flows).toHaveLength(2);
    expect(result.hosts.map((host) => host.ip).sort()).toEqual(["10.0.1.10", "10.0.2.5"]);
    const responder = result.hosts.find((host) => host.ip === "10.0.1.10");
    expect(responder?.ports[0]).toMatchObject({ port: 502, service: "modbus" });
  });

  it("parses JSON-lines format", () => {
    const result = parseZeekConn(JSON_LINES);
    expect(result.flows.map((flow) => flow.targetIp).sort()).toEqual(["10.0.1.10", "10.0.3.7"]);
    expect(result.flows[0]).toMatchObject({ sourceIp: "10.0.2.5", port: 502, service: "modbus" });
  });
});

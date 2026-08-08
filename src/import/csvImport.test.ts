import { describe, expect, it } from "vitest";
import { parseInventoryCsv } from "./csvImport";

describe("parseInventoryCsv", () => {
  it("maps an asset inventory via header aliases, splitting protocols and numeric ports", () => {
    const csv = ["name,ip,type,vlan,protocols,criticality,vendor", "HMI-1,10.0.3.20,HMI,300,OPC UA;HTTPS,high,", "PLC-2,10.0.1.11,PLC,110,502,critical,Siemens"].join(
      "\n"
    );
    const result = parseInventoryCsv(csv);
    expect(result.hosts).toHaveLength(2);

    const hmi = result.hosts[0];
    expect(hmi.typeHint).toBe("hmi");
    expect(hmi.vlan).toBe("300");
    expect(hmi.protocolsHint).toEqual(["OPC UA", "HTTPS"]);
    expect(hmi.criticalityHint).toBe("high");

    const plc = result.hosts[1];
    expect(plc.typeHint).toBe("plc-rtu");
    expect(plc.ports.map((port) => port.port)).toEqual([502]);
    expect(plc.vendor).toBe("Siemens");
  });

  it("detects a connections CSV from source/target columns and yields flows", () => {
    const csv = "source,target,port,protocol\n10.0.2.5,10.0.1.10,502,modbus\n";
    const result = parseInventoryCsv(csv);
    expect(result.hosts).toEqual([]);
    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]).toMatchObject({ sourceIp: "10.0.2.5", targetIp: "10.0.1.10", port: 502 });
  });
});

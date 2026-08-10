import { describe, expect, it } from "vitest";
import { describePort, orderedServices, serviceSummary } from "./services";
import type { ImportedPort } from "../../import/types";

const port = (partial: Partial<ImportedPort> & { port: number }): ImportedPort => ({
  transport: "tcp",
  ...partial
});

describe("how a scanned port is written down", () => {
  it("shows the version Nmap reported, which is the finding", () => {
    // `product` has been parsed out of both Nmap formats since the first importer and shown
    // nowhere. "ssh" is a fact about a port; "OpenSSH 8.9" is something an operator can look up.
    expect(describePort(port({ port: 22, service: "ssh", product: "OpenSSH 8.9" }))).toContain("OpenSSH 8.9");
  });

  it("says why a port matters rather than leaving the reader to know", () => {
    expect(describePort(port({ port: 23, service: "telnet" }))).toMatch(/—/);
  });

  it("still names a port nothing identified", () => {
    expect(describePort(port({ port: 8081 }))).toContain("8081/tcp");
  });

  it("keeps the transport, because a UDP answer is a weaker claim than a TCP one", () => {
    expect(describePort(port({ port: 161, transport: "udp", service: "snmp" }))).toContain("161/udp");
  });

  it("sorts by port number so the same services make the same shape on every host", () => {
    // Scan order is arrival order and differs between runs. Sorted, a reader recognises a Windows
    // box by its pattern without reading a word of it.
    const ports = [port({ port: 445 }), port({ port: 22 }), port({ port: 139 })];
    expect(orderedServices(ports).map((entry) => entry.port)).toEqual([22, 139, 445]);
    expect(ports.map((entry) => entry.port)).toEqual([445, 22, 139]);
  });

  it("says nothing answered rather than showing an empty tooltip", () => {
    expect(serviceSummary([])).toBe("No open services recorded");
  });

  it("puts every port in the summary, however many the canvas draws", () => {
    const many = Array.from({ length: 14 }, (_, index) => port({ port: 1000 + index }));
    expect(serviceSummary(many).split("\n")).toHaveLength(14);
  });
});

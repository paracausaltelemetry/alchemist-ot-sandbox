import { describe, expect, it } from "vitest";
import { projectMap } from "./mapProjection";
import { newAuthoredAsset, newCyberMap, newImportSource, newUserConnection } from "../models/cyberMap";
import { parseNmapXml } from "../import/nmap";
import { DEFAULT_VANTAGE } from "../models/itEngagement";
import type { CyberMapDocument } from "../models/cyberMap";

const SCAN = `<?xml version="1.0"?>
<nmaprun><host><status state="up"/><address addr="10.10.2.30" addrtype="ipv4"/><hostnames><hostname name="db-1"/></hostnames>
<ports><port protocol="tcp" portid="1433"><state state="open"/><service name="ms-sql-s"/></port></ports></host></nmaprun>`;

function scanned(): CyberMapDocument {
  const doc = newCyberMap();
  return { ...doc, sources: [newImportSource(parseNmapXml(SCAN), "scan.xml", 1, DEFAULT_VANTAGE)] };
}

describe("devices somebody added by hand", () => {
  it("appears on the estate alongside what was scanned", () => {
    const doc = scanned();
    const device = newAuthoredAsset({ name: "jump-host", ipAddress: "10.10.2.9" });
    const map = projectMap({ ...doc, authoredAssets: [device] });

    expect(map.assets.map((asset) => asset.name)).toContain("jump-host");
    expect(map.assets.find((asset) => asset.id === device.id)?.provenance).toBe("authored");
  });

  it("lands in the segment its address belongs to, like a scanned host", () => {
    const doc = scanned();
    const device = newAuthoredAsset({ name: "jump-host", ipAddress: "10.10.2.9" });
    const map = projectMap({ ...doc, authoredAssets: [device] });

    const scannedHost = map.assets.find((asset) => asset.name === "db-1");
    expect(map.assets.find((asset) => asset.id === device.id)?.subnetId).toBe(scannedHost?.subnetId);
  });

  it("is an assertion, not a guess", () => {
    // Confidence below one means *inferred*, which the canvas dims and the inferred filter hides.
    // A device somebody put there on purpose is the one thing on the map nothing can recreate.
    const device = newAuthoredAsset({ name: "heard about it" });
    const map = projectMap({ ...scanned(), authoredAssets: [device] });
    expect(map.assets.find((asset) => asset.id === device.id)?.confidence).toBe(1);
  });

  it("survives re-importing the scan it was added alongside", () => {
    const doc = scanned();
    const device = newAuthoredAsset({ name: "jump-host" });
    const withDevice = { ...doc, authoredAssets: [device] };
    const reimported = {
      ...withDevice,
      sources: [...withDevice.sources, newImportSource(parseNmapXml(SCAN), "scan-again.xml", 2, DEFAULT_VANTAGE)]
    };

    expect(projectMap(reimported).assets.filter((asset) => asset.name === "jump-host")).toHaveLength(1);
  });

  it("shows on a map that has no scans at all", () => {
    // Enumeration turns up devices before it turns up packets. A map holding only what somebody has
    // sketched is still a map, and returning nothing for it made the feature useless on day one.
    const a = newAuthoredAsset({ name: "dc-02" });
    const b = newAuthoredAsset({ name: "jump-host" });
    const map = projectMap({
      ...newCyberMap(),
      authoredAssets: [a, b],
      connections: [newUserConnection(a.id, b.id, { label: "RDP" })]
    });

    expect(map.assets).toHaveLength(2);
    expect(map.connections).toHaveLength(1);
  });

  it("can be renamed by an override, like anything else on the map", () => {
    const device = newAuthoredAsset({ name: "unknown host" });
    const map = projectMap({
      ...scanned(),
      authoredAssets: [device],
      assetOverrides: { [device.id]: { name: "dc-02" } }
    });
    expect(map.assets.find((asset) => asset.id === device.id)?.name).toBe("dc-02");
  });
});

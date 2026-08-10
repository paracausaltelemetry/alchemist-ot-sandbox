import { describe, expect, it } from "vitest";
import { readSilence } from "./portSilence";
import { parseNmapXml } from "../import/nmap";
import { parseNmapNormal } from "../import/nmapText";

describe("reading what the silent ports said", () => {
  it("calls a host behind a dropped range filtered", () => {
    expect(readSilence({ closed: 0, filtered: 997 }).verdict).toBe("filtered");
  });

  it("calls a host that refused every probe reachable", () => {
    // Closed is the host itself answering. It got the packet and sent one back, which is the
    // opposite finding to silence even though neither is a service.
    const reading = readSilence({ closed: 997, filtered: 0 });
    expect(reading.verdict).toBe("reachable");
    expect(reading.summary).toContain("no filtering");
  });

  it("does not claim a firewall from a handful of dropped ports", () => {
    expect(readSilence({ closed: 900, filtered: 97 }).verdict).toBe("mixed");
  });

  it("says it does not know rather than assuming an open path", () => {
    // A greppable export never reports this, and neither does a scan of six named ports. Reading
    // that as "nothing was filtered" would be inventing evidence from a file's silence.
    expect(readSilence(undefined).verdict).toBe("unknown");
  });

  it("counts individually named filtered ports towards the reading", () => {
    expect(readSilence({ closed: 0, filtered: 0 }, [{ port: 22 }, { port: 3389 }]).verdict).toBe("filtered");
  });
});

describe("port states from Nmap XML", () => {
  const XML = `<?xml version="1.0"?>
<nmaprun><host><status state="up"/><address addr="10.0.4.9" addrtype="ipv4"/><ports>
  <extraports state="filtered" count="996"/>
  <extraports state="closed" count="1"/>
  <port protocol="tcp" portid="22"><state state="open"/><service name="ssh"/></port>
  <port protocol="tcp" portid="3389"><state state="filtered"/><service name="ms-wbt-server"/></port>
  <port protocol="tcp" portid="80"><state state="closed"/><service name="http"/></port>
</ports></host></nmaprun>`;

  it("keeps filtered ports out of the open list", () => {
    // Everything downstream reads `ports` as "this host is running this". A filtered port is the
    // opposite claim, and inferring an asset type from one would classify a host by a guess.
    const [host] = parseNmapXml(XML).hosts;
    expect(host.ports.map((port) => port.port)).toEqual([22]);
    expect(host.filteredPorts?.map((port) => port.port)).toEqual([3389]);
  });

  it("reads the extraports counts, which is where the real numbers are", () => {
    const [host] = parseNmapXml(XML).hosts;
    // 996 filtered from extraports; 1 + the individually listed closed port.
    expect(host.silence).toEqual({ closed: 2, filtered: 996 });
  });

  it("treats open|filtered as a non-answer, not a service", () => {
    const xml = XML.replace('<state state="filtered"/>', '<state state="open|filtered"/>');
    const [host] = parseNmapXml(xml).hosts;
    expect(host.ports.map((port) => port.port)).toEqual([22]);
    expect(host.filteredPorts?.map((port) => port.port)).toEqual([3389]);
  });
});

describe("port states from normal output", () => {
  it("reads the Not shown line", () => {
    const text = `Nmap scan report for 10.0.4.9
Host is up (0.0011s latency).
Not shown: 996 filtered tcp ports (no-response), 2 closed tcp ports (reset)
PORT     STATE    SERVICE
22/tcp   open     ssh
3389/tcp filtered ms-wbt-server
`;
    const [host] = parseNmapNormal(text).hosts;
    expect(host.silence).toEqual({ closed: 2, filtered: 996 });
    expect(host.ports.map((port) => port.port)).toEqual([22]);
    expect(host.filteredPorts?.map((port) => port.port)).toEqual([3389]);
  });

  it("counts a closed row in the table when the scan listed one", () => {
    const text = `Nmap scan report for 10.0.4.10
PORT   STATE  SERVICE
80/tcp closed http
`;
    const [host] = parseNmapNormal(text).hosts;
    expect(host.silence).toEqual({ closed: 1, filtered: 0 });
    expect(host.ports).toEqual([]);
  });
});

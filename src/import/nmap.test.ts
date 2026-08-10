import { describe, expect, it } from "vitest";
import { parseNmapXml } from "./nmap";

const SAMPLE = `<?xml version="1.0"?>
<!DOCTYPE nmaprun>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.1.10" addrtype="ipv4"/>
    <address addr="00:1b:1b:00:00:01" addrtype="mac" vendor="Siemens"/>
    <hostnames><hostname name="plc-1" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="502"><state state="open"/><service name="modbus"/></port>
      <port protocol="tcp" portid="102"><state state="open"/><service name="iso-tsap"/></port>
      <port protocol="tcp" portid="23"><state state="closed"/><service name="telnet"/></port>
    </ports>
    <os><osmatch name="Embedded Linux" accuracy="90"/></os>
  </host>
  <host>
    <status state="down"/>
    <address addr="10.0.1.99" addrtype="ipv4"/>
  </host>
</nmaprun>`;

describe("parseNmapXml", () => {
  it("extracts up hosts with ip, mac vendor, hostname, os and open ports only", () => {
    const result = parseNmapXml(SAMPLE);
    expect(result.hosts).toHaveLength(1);
    const host = result.hosts[0];
    expect(host.ip).toBe("10.0.1.10");
    expect(host.mac).toBe("00:1b:1b:00:00:01");
    expect(host.vendor).toBe("Siemens");
    expect(host.hostname).toBe("plc-1");
    expect(host.os).toBe("Embedded Linux");
    expect(host.ports.map((port) => port.port)).toEqual([502, 102]);
  });

  it("warns about skipped down hosts and yields no flows", () => {
    const result = parseNmapXml(SAMPLE);
    expect(result.flows).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/down/i);
  });

  it("yields no traces when the scan had no traceroute", () => {
    expect(parseNmapXml(SAMPLE).traces).toEqual([]);
  });
});

const TRACED = `<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.10.2.30" addrtype="ipv4"/>
    <hostnames><hostname name="db-1"/></hostnames>
    <ports><port protocol="tcp" portid="3306"><state state="open"/><service name="mysql"/></port></ports>
    <distance value="2"/>
    <trace port="443" proto="tcp">
      <hop ttl="3" ipaddr="10.10.2.30" host="db-1" rtt="1.40"/>
      <hop ttl="1" ipaddr="10.10.1.1" rtt="0.35"/>
      <hop ttl="bogus" ipaddr="10.10.9.9"/>
      <hop ttl="2" ipaddr="10.10.2.1" host="core-rtr" rtt="1.20"/>
    </trace>
  </host>
</nmaprun>`;

describe("parseNmapXml traceroute", () => {
  const result = parseNmapXml(TRACED);

  it("captures the network distance", () => {
    expect(result.hosts[0].distance).toBe(2);
  });

  it("orders hops by ttl, drops the target hop and skips malformed ttls", () => {
    expect(result.traces).toEqual([
      {
        targetIp: "10.10.2.30",
        targetHostname: "db-1",
        port: 443,
        proto: "tcp",
        hops: [
          { ttl: 1, ip: "10.10.1.1", rttMs: 0.35 },
          { ttl: 2, ip: "10.10.2.1", hostname: "core-rtr", rttMs: 1.2 }
        ]
      }
    ]);
  });
});

describe("service versions", () => {
  it("joins the three attributes Nmap splits a banner across", () => {
    // `product` on its own is "OpenSSH", which narrows nothing; the version is what an operator
    // takes to an advisory, and `extrainfo` is often what dates the host.
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.0.5" addrtype="ipv4"/><ports><port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="8.9p1" extrainfo="Ubuntu 4ubuntu0.5"/></port></ports></host></nmaprun>`;
    const [host] = parseNmapXml(xml).hosts;
    expect(host.ports[0].product).toBe("OpenSSH 8.9p1 (Ubuntu 4ubuntu0.5)");
  });

  it("leaves a port nothing was fingerprinted on without an invented version", () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.0.6" addrtype="ipv4"/><ports><port protocol="tcp" portid="9100"><state state="open"/><service name="jetdirect"/></port></ports></host></nmaprun>`;
    const [host] = parseNmapXml(xml).hosts;
    expect(host.ports[0].product).toBeUndefined();
  });
});

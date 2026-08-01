import { describe, expect, it } from "vitest";
import { detectFormat } from "./index";
import { parseNmapGreppable, parseNmapNormal } from "./nmapText";

const NORMAL = `# Nmap 7.94 scan initiated Mon
Nmap scan report for web-1.example (203.0.113.10)
Host is up (0.0012s latency).
Not shown: 997 closed ports
PORT     STATE SERVICE
22/tcp   open  ssh     OpenSSH 8.9
80/tcp   open  http    nginx 1.24
445/tcp  open  microsoft-ds
MAC Address: AA:BB:CC:DD:EE:FF (Dell Inc.)
OS details: Linux 5.15

Nmap scan report for 10.0.0.9
Host is up.
PORT     STATE SERVICE
3389/tcp open  ms-wbt-server

Nmap scan report for 10.0.0.50
Host seems down.
`;

const GREPPABLE = `# Nmap 7.94 scan initiated -oG
Host: 203.0.113.10 (web-1.example)	Status: Up
Host: 203.0.113.10 (web-1.example)	Ports: 22/open/tcp//ssh//OpenSSH/, 80/open/tcp//http///, 445/open/tcp//microsoft-ds///	Ignored State: closed (997)
Host: 10.0.0.9 ()	Ports: 3389/open/tcp//ms-wbt-server///, 23/closed/tcp//telnet///
Host: 10.0.0.50 ()	Status: Down
`;

describe("parseNmapNormal", () => {
  it("extracts hosts, open ports, vendor and OS, skipping down hosts", () => {
    const result = parseNmapNormal(NORMAL);
    expect(result.hosts).toHaveLength(2);
    const web = result.hosts[0];
    expect(web.ip).toBe("203.0.113.10");
    expect(web.hostname).toBe("web-1.example");
    expect(web.vendor).toBe("Dell Inc.");
    expect(web.os).toBe("Linux 5.15");
    expect(web.ports.map((port) => port.port).sort((a, b) => a - b)).toEqual([22, 80, 445]);
    expect(web.ports.find((port) => port.port === 22)?.product).toBe("OpenSSH 8.9");
    expect(result.hosts[1].ip).toBe("10.0.0.9");
    expect(result.hosts[1].ports).toHaveLength(1);
  });

  it("is auto-detected", () => {
    expect(detectFormat("scan.txt", NORMAL)).toBe("nmap-normal");
  });
});

const NORMAL_TRACE = `Nmap scan report for db-1 (10.10.2.30)
Host is up.
PORT     STATE SERVICE
3306/tcp open  mysql
Network Distance: 3 hops

TRACEROUTE (using port 443/tcp)
HOP RTT      ADDRESS
1   0.35 ms  10.10.1.1
2   ...
3   1.20 ms  core-rtr (10.10.2.1)
4   1.40 ms  10.10.2.30

Nmap scan report for 10.10.1.5
Host is up.
PORT     STATE SERVICE
22/tcp   open  ssh
`;

describe("parseNmapNormal traceroute", () => {
  const result = parseNmapNormal(NORMAL_TRACE);

  it("keeps parsing hosts after a traceroute block", () => {
    expect(result.hosts.map((host) => host.ip)).toEqual(["10.10.2.30", "10.10.1.5"]);
    expect(result.hosts[1].ports.map((port) => port.port)).toEqual([22]);
  });

  it("captures the network distance", () => {
    expect(result.hosts[0].distance).toBe(3);
  });

  it("records hops, keeps timed-out ttls and drops the target hop", () => {
    expect(result.traces).toEqual([
      {
        targetIp: "10.10.2.30",
        targetHostname: "db-1",
        port: 443,
        proto: "tcp",
        hops: [
          { ttl: 1, rttMs: 0.35, ip: "10.10.1.1" },
          { ttl: 2, timedOut: true },
          { ttl: 3, rttMs: 1.2, ip: "10.10.2.1", hostname: "core-rtr" }
        ]
      }
    ]);
  });

  it("does not leave the port table open across a traceroute", () => {
    // The hop rows must not be mistaken for port rows on the host that follows.
    expect(result.hosts[0].ports.map((port) => port.port)).toEqual([3306]);
  });
});

const COLLAPSED = `Nmap scan report for db-1 (10.10.2.30)
Host is up.

TRACEROUTE (using port 443/tcp)
HOP RTT      ADDRESS
1   0.42 ms  10.10.1.1
2   1.18 ms  dist-rtr (10.10.2.1)
3   1.31 ms  10.10.2.30

Nmap scan report for hmi-1 (10.10.2.40)
Host is up.

TRACEROUTE (using port 5900/tcp)
HOP RTT      ADDRESS
-   Hops 1-2 are the same as for 10.10.2.30
3   1.44 ms  10.10.2.40

Nmap scan report for orphan (10.10.2.50)
Host is up.

TRACEROUTE (using port 80/tcp)
HOP RTT      ADDRESS
-   Hops 1-2 are the same as for 192.0.2.9
3   1.60 ms  10.10.2.50
`;

describe("parseNmapNormal collapsed traceroute", () => {
  const result = parseNmapNormal(COLLAPSED);

  it("copies the shared prefix in from the path it refers to", () => {
    const second = result.traces?.find((trace) => trace.targetIp === "10.10.2.40");
    expect(second?.hops).toEqual([
      { ttl: 1, rttMs: 0.42, ip: "10.10.1.1" },
      { ttl: 2, rttMs: 1.18, ip: "10.10.2.1", hostname: "dist-rtr" }
    ]);
  });

  it("keeps the routers, so a collapsed path is worth as much as a printed one", () => {
    const printed = result.traces?.find((trace) => trace.targetIp === "10.10.2.30");
    const collapsed = result.traces?.find((trace) => trace.targetIp === "10.10.2.40");
    expect(collapsed?.hops.map((hop) => hop.ip)).toEqual(printed?.hops.map((hop) => hop.ip));
  });

  it("warns rather than inventing hops when the referenced path is not in the file", () => {
    const orphan = result.traces?.find((trace) => trace.targetIp === "10.10.2.50");
    expect(orphan).toBeUndefined();
    expect(result.warnings.join(" ")).toMatch(/192\.0\.2\.9/);
  });
});

describe("parseNmapGreppable", () => {
  it("extracts open ports per host and ignores closed and down", () => {
    const result = parseNmapGreppable(GREPPABLE);
    expect(result.hosts).toHaveLength(2);
    const web = result.hosts.find((host) => host.ip === "203.0.113.10");
    expect(web?.hostname).toBe("web-1.example");
    expect(web?.ports.map((port) => port.port).sort((a, b) => a - b)).toEqual([22, 80, 445]);
    const host9 = result.hosts.find((host) => host.ip === "10.0.0.9");
    expect(host9?.ports.map((port) => port.port)).toEqual([3389]);
  });

  it("is auto-detected", () => {
    expect(detectFormat("scan.gnmap", GREPPABLE)).toBe("nmap-grep");
  });

  it("never yields traces — greppable output does not carry traceroute", () => {
    expect(parseNmapGreppable(GREPPABLE).traces).toEqual([]);
  });
});

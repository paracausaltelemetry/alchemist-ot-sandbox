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
});

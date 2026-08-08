import { describe, expect, it } from "vitest";
import { parseNmapGreppable, parseNmapNormal } from "./nmapText";
import { parseNmapXml } from "./nmap";
import { formatScanTime, scanTimeCaveat, scanTimeFromCtime, scanTimeFromNormal } from "./scanTime";

/** The local wall-clock instant a parser should land on, whatever this machine's timezone is. */
const local = (y: number, m: number, d: number, hh: number, mm: number, ss = 0) =>
  new Date(y, m - 1, d, hh, mm, ss).toISOString();

describe("scan time from Nmap XML", () => {
  it("prefers the Unix timestamp, which needs no timezone assumption", () => {
    const xml = `<?xml version="1.0"?>
<nmaprun scanner="nmap" start="1712224800" startstr="Thu Apr  4 10:00:00 2024">
  <host><status state="up"/><address addr="10.0.0.1" addrtype="ipv4"/></host>
</nmaprun>`;
    const parsed = parseNmapXml(xml);

    expect(parsed.startedAt).toEqual({ iso: new Date(1712224800 * 1000).toISOString(), source: "file", precision: "second" });
    expect(parsed.startedAt?.tzAssumed).toBeUndefined();
  });

  it("falls back to startstr when there is no epoch", () => {
    const xml = `<?xml version="1.0"?>
<nmaprun startstr="Thu Apr  4 10:00:00 2024">
  <host><status state="up"/><address addr="10.0.0.1" addrtype="ipv4"/></host>
</nmaprun>`;
    expect(parseNmapXml(xml).startedAt).toEqual({
      iso: local(2024, 4, 4, 10, 0, 0),
      source: "file",
      precision: "second",
      tzAssumed: true
    });
  });

  it("records no time when the run element carries none", () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.0.1" addrtype="ipv4"/></host></nmaprun>`;
    expect(parseNmapXml(xml).startedAt).toBeUndefined();
  });
});

describe("scan time from greppable output", () => {
  it("reads the initiated header the host loop skips over", () => {
    // The parser drops every line starting with "#", which is where the only timestamp lives.
    const text = `# Nmap 7.94 scan initiated Thu Apr  4 10:00:00 2024 as: nmap -oG - 10.0.0.0/24
Host: 10.0.0.1 (gw)\tStatus: Up
Host: 10.0.0.1 (gw)\tPorts: 22/open/tcp//ssh///
# Nmap done at Thu Apr  4 10:02:00 2024`;
    expect(parseNmapGreppable(text).startedAt).toEqual({
      iso: local(2024, 4, 4, 10, 0, 0),
      source: "file",
      precision: "second",
      tzAssumed: true
    });
  });
});

describe("scan time from normal output", () => {
  it("reads the real -oN banner", () => {
    // The repo's own -oN fixture used the greppable header, which no -oN file actually carries.
    const text = `Starting Nmap 7.94 ( https://nmap.org ) at 2024-04-04 10:00 BST
Nmap scan report for 10.0.0.1
Host is up (0.0010s latency).
PORT   STATE SERVICE
22/tcp open  ssh`;
    expect(parseNmapNormal(text).startedAt).toEqual({
      iso: local(2024, 4, 4, 10, 0),
      source: "file",
      precision: "minute",
      tzAssumed: true
    });
  });

  it("ignores the timezone abbreviation rather than trusting it", () => {
    // CST is three different offsets, and engines disagree on all of them. Same wall clock either way.
    const bst = scanTimeFromNormal("Starting Nmap 7.94 ( https://nmap.org ) at 2024-04-04 10:00 BST");
    const cst = scanTimeFromNormal("Starting Nmap 7.94 ( https://nmap.org ) at 2024-04-04 10:00 CST");
    expect(bst?.iso).toBe(cst?.iso);
    expect(bst?.tzAssumed).toBe(true);
  });

  it("keeps seconds when the banner has them", () => {
    expect(scanTimeFromNormal("Starting Nmap 7.94 at 2024-04-04 10:00:30 BST")?.precision).toBe("second");
  });

  it("records no time when there is no banner", () => {
    const text = `Nmap scan report for 10.0.0.1
Host is up.`;
    expect(parseNmapNormal(text).startedAt).toBeUndefined();
  });
});

describe("reading and presenting a scan time", () => {
  it("rejects a ctime string it cannot fully parse", () => {
    expect(scanTimeFromCtime("Thu Apr 4 2024")).toBeNull();
    expect(scanTimeFromCtime("Thu Xxx  4 10:00:00 2024")).toBeNull();
  });

  it("shows no more precision than it has", () => {
    const minute = formatScanTime({ iso: local(2024, 4, 4, 10, 0), source: "file", precision: "minute" });
    const second = formatScanTime({ iso: local(2024, 4, 4, 10, 0, 30), source: "file", precision: "second" });
    expect(second.length).toBeGreaterThan(minute.length);
  });

  it("says when a time was assumed or entered rather than read", () => {
    expect(scanTimeCaveat({ iso: local(2024, 4, 4, 10, 0), source: "file", precision: "minute" })).toBe("");
    expect(scanTimeCaveat({ iso: local(2024, 4, 4, 10, 0), source: "file", precision: "minute", tzAssumed: true })).toBe(
      "timezone assumed local"
    );
    expect(scanTimeCaveat({ iso: local(2024, 4, 4, 10, 0), source: "operator", precision: "minute" })).toBe(
      "entered by hand"
    );
  });
});

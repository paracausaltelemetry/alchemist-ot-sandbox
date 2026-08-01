import { describe, expect, it } from "vitest";
import { detectFormat, parseByFormat } from "./index";
import type { ImportFormat } from "./types";

describe("detectFormat", () => {
  it("recognises the formats it claims to support", () => {
    expect(detectFormat("scan.xml", "<nmaprun scanner='nmap'>")).toBe("nmap-xml");
    expect(detectFormat("scan.txt", "Nmap scan report for host (10.0.0.1)\n")).toBe("nmap-normal");
    expect(detectFormat("scan.gnmap", "Host: 10.0.0.1 (h)\tStatus: Up\n")).toBe("nmap-grep");
    expect(detectFormat("conn.log", "#fields\tts\tid.orig_h\tid.resp_h\n")).toBe("zeek-conn");
    expect(detectFormat("net.graphml", "<graphml><graph/></graphml>")).toBe("graphml");
  });

  it("takes a .csv or .tsv extension at face value", () => {
    expect(detectFormat("inventory.csv", "whatever\n")).toBe("csv-inventory");
    expect(detectFormat("inventory.tsv", "whatever\n")).toBe("csv-inventory");
  });

  it("recognises an inventory by its header row when the extension says nothing", () => {
    expect(detectFormat("export", "name,ip,type,zone\nPLC-1,10.0.0.1,plc-rtu,level1\n")).toBe("csv-inventory");
    expect(detectFormat("flows", "source,target,port\n10.0.0.1,10.0.0.2,502\n")).toBe("csv-inventory");
  });

  it("refuses prose rather than guessing CSV", () => {
    // The old rule was "contains a comma and a newline", which matched READMEs, changelogs and
    // logs — so an unparseable file came back as a confident wrong parse instead of a refusal.
    expect(detectFormat("README.md", "# Project\n\nA tool for modelling networks, zones and flows.\n")).toBeNull();
    expect(detectFormat("app.log", "2026-01-01 INFO started, listening\n2026-01-01 INFO ready\n")).toBeNull();
    expect(detectFormat("notes.txt", "Ring the vendor, ask about the firewall\nThen check the logs\n")).toBeNull();
  });
});

describe("parseByFormat", () => {
  it("never returns undefined for a format outside the union", () => {
    // Reachable from stored or shared data carrying an unknown format string. Returning undefined
    // meant the caller read `.hosts` off nothing and threw.
    const result = parseByFormat("anything", "not-a-format" as ImportFormat);
    expect(result.hosts).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/unrecognised/i);
  });
});

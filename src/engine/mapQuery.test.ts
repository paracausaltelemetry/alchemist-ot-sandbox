import { describe, expect, it } from "vitest";
import { QUERY_FIELDS, buildQueryContext, parseQuery, runQuery } from "./mapQuery";
import { projectMap } from "./mapProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newAuthoredAsset, newCyberMap, newImportSource } from "../models/cyberMap";
import { DEFAULT_VANTAGE } from "../models/itEngagement";
import type { QueryContext } from "./mapQuery";
import type { MapAsset } from "../models/cyberMap";

const asset = (partial: Partial<MapAsset> & { id: string }): MapAsset =>
  ({
    name: partial.id,
    type: "enterprise-it",
    zone: "level4",
    ipAddress: "",
    manufacturer: "",
    notes: "",
    provenance: "imported",
    ports: [],
    identifiers: { ips: [], macs: [], hostnames: [] },
    confidence: 1,
    rationale: "",
    sourceIds: [],
    ...partial
  }) as MapAsset;

const context: QueryContext = { subnets: [], access: new Map() };

const run = (query: string, assets: MapAsset[], ctx: QueryContext = context) =>
  [...runQuery(query, assets, ctx).matched];

describe("reading a query", () => {
  it("keeps a quoted phrase whole", () => {
    expect(parseQuery('product:"OpenSSH 8.9"').terms).toEqual([
      { field: "product", values: ["openssh 8.9"], negated: false }
    ]);
  });

  it("takes a leading minus as negation", () => {
    expect(parseQuery("-port:445").terms[0]).toMatchObject({ field: "port", negated: true });
  });

  it("reads a comma list as alternatives inside one term", () => {
    expect(parseQuery("port:445,3389").terms[0].values).toEqual(["445", "3389"]);
  });

  it("drops a field with nothing after it rather than searching for the empty string", () => {
    // Somebody mid-keystroke has typed `port:` and means nothing by it yet.
    expect(parseQuery("port:").empty).toBe(true);
  });

  it("searches an unknown prefix as text, and says so", () => {
    // `10.0.0.1:445` and `http://example` are not typos. Refusing them would make the box feel like
    // it was arguing with the operator.
    const parsed = parseQuery("porta:445");
    expect(parsed.unknownFields).toEqual(["porta"]);
    expect(parsed.terms[0].field).toBeNull();
    expect(parsed.terms[0].values).toEqual(["porta:445"]);
  });

  it("accepts every alias the help advertises", () => {
    for (const field of QUERY_FIELDS) {
      for (const prefix of field.prefixes) {
        expect(parseQuery(`${prefix}:x`).terms[0].field).toBe(field.id);
      }
    }
  });
});

describe("the fields", () => {
  const host = asset({
    id: "a",
    name: "file-1",
    ipAddress: "10.10.2.30",
    os: "Windows Server 2012 R2",
    deviceKind: "server",
    manufacturer: "Dell",
    identifiers: { ips: ["10.10.2.30"], macs: ["00:11:22:33:44:55"], hostnames: ["file-1.corp"] },
    ports: [
      { port: 445, transport: "tcp", service: "microsoft-ds", product: "Samba 4.15" },
      { port: 22, transport: "tcp", service: "ssh", product: "OpenSSH 8.9p1" }
    ],
    filteredPorts: [{ port: 3389, service: "ms-wbt-server" }],
    scripts: [{ id: "smb-vuln-ms17-010", output: "VULNERABLE IDs: CVE:CVE-2017-0143" }]
  });
  const bare = asset({ id: "b", name: "quiet" });

  it("finds a port, a list and a range", () => {
    expect(run("port:445", [host, bare])).toEqual(["a"]);
    expect(run("port:80,445", [host, bare])).toEqual(["a"]);
    expect(run("port:1-100", [host, bare])).toEqual(["a"]);
    expect(run("port:1000-2000", [host, bare])).toEqual([]);
  });

  it("does not answer port: with a filtered port", () => {
    // `ports` means "running this"; a filtered port is the opposite claim. Blurring them turns a
    // segmentation finding into an exposed service.
    expect(run("port:3389", [host])).toEqual([]);
  });

  it("matches a service and a version by substring", () => {
    expect(run("service:smb", [host])).toEqual([]);
    expect(run("service:microsoft", [host])).toEqual(["a"]);
    expect(run('product:"openssh 8."', [host])).toEqual(["a"]);
  });

  it("matches the OS string as written, not a family bucket", () => {
    expect(run("os:2012", [host])).toEqual(["a"]);
    expect(run("os:windows", [host])).toEqual(["a"]);
  });

  it("matches a CVE an NSE script named", () => {
    expect(run("cve:2017", [host])).toEqual(["a"]);
    expect(run("cve:cve-2017-0143", [host])).toEqual(["a"]);
    expect(run("cve:2021", [host])).toEqual([]);
  });

  it("matches a device kind by id and by label", () => {
    const firewall = asset({ id: "fw", deviceKind: "firewall" });
    expect(run("kind:firewall", [host, firewall])).toEqual(["fw"]);
    expect(run("device:server", [host, firewall])).toEqual(["a"]);
  });

  it("says how well attested an asset is", () => {
    const inferred = asset({ id: "guess", confidence: 0.5 });
    const mine = asset({ id: "mine", provenance: "authored" });
    expect(run("evidence:scanned", [host, inferred, mine])).toEqual(["a"]);
    expect(run("evidence:inferred", [host, inferred, mine])).toEqual(["guess"]);
    expect(run("evidence:authored", [host, inferred, mine])).toEqual(["mine"]);
  });

  it("searches names, hostnames, MACs and vendor with a bare word", () => {
    // All four are on the asset and shown in the inspector; none were searchable before.
    expect(run("file-1.corp", [host, bare])).toEqual(["a"]);
    expect(run("00:11:22", [host, bare])).toEqual(["a"]);
    expect(run("dell", [host, bare])).toEqual(["a"]);
  });
});

describe("ranges and segments", () => {
  const inside = asset({ id: "in", ipAddress: "10.10.2.30", identifiers: { ips: ["10.10.2.30"], macs: [], hostnames: [] } });
  const outside = asset({ id: "out", ipAddress: "10.10.9.30", identifiers: { ips: ["10.10.9.30"], macs: [], hostnames: [] } });

  it("matches by real mask, not by text", () => {
    expect(run("cidr:10.10.2.0/24", [inside, outside])).toEqual(["in"]);
    expect(run("cidr:10.10.0.0/16", [inside, outside])).toEqual(["in", "out"]);
    // /21 reaches 10.10.7.255, so it holds .2.30 and not .9.30 — the case a text compare on the
    // first three octets cannot decide either way.
    expect(run("cidr:10.10.0.0/21", [inside, outside])).toEqual(["in"]);
  });

  it("falls back to the segment's name when the term is not an address", () => {
    const ctx: QueryContext = {
      subnets: [{ id: "s", name: "Management", cidr: "10.10.9.0/24", vlan: "99" }],
      access: new Map()
    };
    const managed = asset({ id: "m", subnetId: "s" });
    expect(run("subnet:management", [managed, inside], ctx)).toEqual(["m"]);
    expect(run("subnet:99", [managed, inside], ctx)).toEqual(["m"]);
  });
});

describe("what you already hold", () => {
  const ctx: QueryContext = {
    subnets: [],
    access: new Map([
      ["admin-host", "admin" as const],
      ["seen", "identified" as const]
    ])
  };
  const assets = [asset({ id: "admin-host" }), asset({ id: "seen" }), asset({ id: "untouched" })];

  it("matches a rung exactly", () => {
    expect(run("access:admin", assets, ctx)).toEqual(["admin-host"]);
  });

  it("takes `any` as anything above none", () => {
    expect(run("access:any", assets, ctx)).toEqual(["admin-host", "seen"]);
  });

  it("counts an asset nothing was recorded against as none", () => {
    expect(run("access:none", assets, ctx)).toEqual(["untouched"]);
  });
});

describe("combining terms", () => {
  const web = asset({ id: "web", ipAddress: "10.10.1.5", ports: [{ port: 443, service: "https" }] });
  const db = asset({ id: "db", ipAddress: "10.10.2.5", ports: [{ port: 1433, service: "ms-sql-s" }] });
  const quiet = asset({ id: "quiet", ipAddress: "10.10.2.9" });

  it("narrows with each term", () => {
    expect(run("cidr:10.10.2.0/24 port:1433", [web, db, quiet])).toEqual(["db"]);
  });

  it("matches an asset that has nothing to say about a negated field", () => {
    // The rule most easily got wrong: "not running SMB" has to include "running nothing at all",
    // or a negated query silently loses half the estate.
    expect(run("-port:443", [web, db, quiet])).toEqual(["db", "quiet"]);
  });

  it("treats an empty query as inactive rather than as matching nothing", () => {
    const result = runQuery("   ", [web, db], context);
    expect(result.active).toBe(false);
    expect(result.matched.size).toBe(0);
  });
});

describe("against the sample estate", () => {
  const doc = {
    ...newCyberMap(),
    sources: [newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", 1, DEFAULT_VANTAGE)],
    authoredAssets: [newAuthoredAsset({ name: "rumoured-dc", ipAddress: "10.10.1.9" })]
  };
  const map = projectMap(doc);
  const ctx = buildQueryContext(map);
  const names = (query: string) =>
    map.assets.filter((entry) => runQuery(query, map.assets, ctx).matched.has(entry.id)).map((entry) => entry.name).sort();

  it("answers the question the tool exists for", () => {
    // A golden over the real projection: this is what catches a change to the pipeline quietly
    // changing what a query returns.
    expect(names("port:445")).toEqual(["dc-1", "file-1"]);
  });

  it("finds the segment", () => {
    expect(names("cidr:10.10.2.0/24")).toEqual(["db-1", "dist-rtr", "hmi-legacy"]);
  });

  it("separates what was scanned from what was reasoned or claimed", () => {
    expect(names("evidence:authored")).toEqual(["rumoured-dc"]);
    expect(names("evidence:inferred").length).toBeGreaterThan(0);
  });
});

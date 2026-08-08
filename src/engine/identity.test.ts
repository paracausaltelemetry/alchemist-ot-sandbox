import { describe, expect, it } from "vitest";
import { normaliseMac, resolveIdentities, type HostIdentifiers } from "./identity";

/** Records that describe one machine should resolve to one key, and only then. */
const keysOf = (records: HostIdentifiers[]) => {
  const resolved = resolveIdentities(records);
  return records.map((record) => resolved.keyFor(record));
};

describe("normaliseMac", () => {
  it("reads a MAC however it was written", () => {
    for (const written of ["00:1A:2B:3C:4D:5E", "00-1a-2b-3c-4d-5e", "001A.2B3C.4D5E", "001a2b3c4d5e"]) {
      expect(normaliseMac(written)).toBe("001a2b3c4d5e");
    }
  });

  it("rejects anything that is not twelve hex digits", () => {
    expect(normaliseMac("00:1a:2b")).toBeUndefined();
    expect(normaliseMac("not a mac")).toBeUndefined();
    expect(normaliseMac(undefined)).toBeUndefined();
  });
});

describe("resolving one machine from several sightings", () => {
  it("joins a name-only sighting to an address-only one", () => {
    // The pivot case: an external scan resolves web-1 by name, the internal scan by address.
    const [outside, inside] = keysOf([{ hostname: "web-1" }, { ip: "198.51.100.10", hostname: "web-1" }]);
    expect(outside).toBe(inside);
    expect(inside).toBe("198.51.100.10");
  });

  it("joins across a MAC when the addresses differ", () => {
    // A laptop that moved subnet between scans. Nothing before this could see it was one machine.
    const keys = keysOf([
      { ip: "10.0.1.50", mac: "00:1a:2b:3c:4d:5e" },
      { ip: "10.0.9.14", mac: "00-1a-2b-3c-4d-5e" }
    ]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("joins transitively through a shared identifier", () => {
    // MAC+IP, then IP+hostname: neither pair shares everything, but they are one machine.
    const keys = keysOf([
      { mac: "aa:bb:cc:dd:ee:ff", ip: "10.0.0.5" },
      { ip: "10.0.0.5", hostname: "hist-1" },
      { hostname: "hist-1" }
    ]);
    expect(new Set(keys).size).toBe(1);
  });

  it("merges a MAC-keyed inventory row with an address-keyed scan", () => {
    // The reason vendor feeds can be merged at all: they key on MAC and Nmap keys on address.
    const keys = keysOf([{ ip: "10.0.0.7", mac: "01:02:03:04:05:06" }, { mac: "010203040506" }]);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe("what must not be merged", () => {
  it("keeps two MACs on one address apart", () => {
    // DHCP reuse or a NAT. Folding these together invents a machine that never existed.
    const keys = keysOf([
      { ip: "10.0.0.20", mac: "aa:aa:aa:aa:aa:aa" },
      { ip: "10.0.0.20", mac: "bb:bb:bb:bb:bb:bb" }
    ]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("says so rather than merging quietly", () => {
    const { warnings } = resolveIdentities([
      { ip: "10.0.0.20", mac: "aa:aa:aa:aa:aa:aa" },
      { ip: "10.0.0.20", mac: "bb:bb:bb:bb:bb:bb" }
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/10\.0\.0\.20 was seen with 2 different MAC addresses/);
  });

  it("does not let a contested address drag a third machine in with it", () => {
    const keys = keysOf([
      { ip: "10.0.0.20", mac: "aa:aa:aa:aa:aa:aa", hostname: "old-laptop" },
      { ip: "10.0.0.20", mac: "bb:bb:bb:bb:bb:bb", hostname: "new-laptop" }
    ]);
    expect(new Set(keys).size).toBe(2);
  });

  it("keeps one hostname answered by two machines apart", () => {
    // "localhost" and "printer" turn up on more than one host in real inventories.
    const keys = keysOf([
      { hostname: "printer", mac: "11:11:11:11:11:11", ip: "10.0.0.31" },
      { hostname: "printer", mac: "22:22:22:22:22:22", ip: "10.0.0.32" }
    ]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("leaves a record with no identifiers unkeyed rather than inventing one", () => {
    expect(keysOf([{}])).toEqual([""]);
  });
});

describe("the key itself", () => {
  it("prefers the address, so ids already in use do not change", () => {
    // MAC joins records; it does not rename them. Every saved position and journal entry is keyed
    // on the address today, and a rename would orphan all of them.
    expect(keysOf([{ ip: "10.0.0.9", mac: "aa:bb:cc:dd:ee:ff", hostname: "hist-1" }])).toEqual(["10.0.0.9"]);
  });

  it("falls back to the hostname, then to the MAC", () => {
    expect(keysOf([{ hostname: "web-1", mac: "aa:bb:cc:dd:ee:ff" }])).toEqual(["web-1"]);
    expect(keysOf([{ mac: "AA:BB:CC:DD:EE:FF" }])).toEqual(["aabbccddeeff"]);
  });

  it("picks one address deterministically when a machine has several", () => {
    const records = [
      { mac: "aa:bb:cc:dd:ee:ff", ip: "10.0.9.14" },
      { mac: "aa:bb:cc:dd:ee:ff", ip: "10.0.1.50" }
    ];
    const first = keysOf(records);
    const reversed = keysOf([...records].reverse());
    expect(new Set([...first, ...reversed]).size).toBe(1);
  });

  it("is stable when the same source is read twice", () => {
    const records = [{ ip: "10.0.0.1", hostname: "gw" }, { hostname: "gw" }, { mac: "00:00:00:00:00:01" }];
    expect(keysOf(records)).toEqual(keysOf(records));
  });

  it("ignores case and surrounding whitespace", () => {
    const keys = keysOf([{ hostname: "WEB-1" }, { hostname: " web-1 " }]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("reports what it merged, so the merge can be checked rather than trusted", () => {
    const { identities } = resolveIdentities([
      { ip: "10.0.1.50", mac: "00:1a:2b:3c:4d:5e", hostname: "laptop" },
      { ip: "10.0.9.14", mac: "00:1a:2b:3c:4d:5e" }
    ]);
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      id: "10.0.1.50",
      ips: ["10.0.1.50", "10.0.9.14"],
      macs: ["001a2b3c4d5e"],
      hostnames: ["laptop"]
    });
  });
});

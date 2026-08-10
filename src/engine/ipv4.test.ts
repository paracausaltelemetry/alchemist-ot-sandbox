import { describe, expect, it } from "vitest";
import { inCidr, parseCidr, parseIpv4 } from "./ipv4";

const cidr = (value: string) => parseCidr(value)!;

describe("reading an address as a number", () => {
  it("reads the ends of the range", () => {
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("255.255.255.255")).toBe(4294967295);
  });

  it("refuses an octet that is not one", () => {
    expect(parseIpv4("10.10.2.256")).toBeNull();
    expect(parseIpv4("10.10.2")).toBeNull();
    expect(parseIpv4("10.10.2.1.1")).toBeNull();
  });

  it("refuses an empty octet rather than reading it as zero", () => {
    // `Number("")` is 0, so a lenient parse turns the typo `10..0.1` into a real address and the
    // query quietly matches a host nobody asked about.
    expect(parseIpv4("10..0.1")).toBeNull();
    expect(parseIpv4("...")).toBeNull();
  });

  it("refuses text that merely contains an address", () => {
    expect(parseIpv4("host-10.0.0.1")).toBeNull();
    expect(parseIpv4("10.0.0.1:445")).toBeNull();
  });

  it("says nothing about a v6 address rather than guessing", () => {
    expect(parseIpv4("fe80::1")).toBeNull();
  });
});

describe("reading a range", () => {
  it("takes a bare address as a single host", () => {
    // `cidr:10.10.2.5` should mean that host, not nothing at all.
    expect(parseCidr("10.10.2.5")).toEqual({ base: parseIpv4("10.10.2.5"), bits: 32 });
  });

  it("clears the host bits somebody left on", () => {
    // Mid-engagement, `10.10.2.5/24` means "that subnet". Rejecting it on a technicality helps
    // nobody, and reading it literally would match one host under a mask that says otherwise.
    expect(parseCidr("10.10.2.5/24")).toEqual(parseCidr("10.10.2.0/24"));
  });

  it("handles /0 and /32 without going negative", () => {
    // JavaScript's bitwise operators are signed, so an unguarded shift turns /1 into a negative
    // base and every comparison against it fails.
    expect(parseCidr("0.0.0.0/0")).toEqual({ base: 0, bits: 0 });
    expect(parseCidr("128.0.0.0/1")!.base).toBe(parseIpv4("128.0.0.0"));
    expect(parseCidr("10.10.2.5/32")!.bits).toBe(32);
  });

  it("refuses a prefix length that is not one", () => {
    expect(parseCidr("10.10.2.0/33")).toBeNull();
    expect(parseCidr("10.10.2.0/x")).toBeNull();
    expect(parseCidr("not-an-address/24")).toBeNull();
  });
});

describe("containment", () => {
  it("holds the addresses at both edges of a range", () => {
    expect(inCidr("10.10.2.0", cidr("10.10.2.0/24"))).toBe(true);
    expect(inCidr("10.10.2.255", cidr("10.10.2.0/24"))).toBe(true);
  });

  it("excludes the addresses just outside it", () => {
    expect(inCidr("10.10.1.255", cidr("10.10.2.0/24"))).toBe(false);
    expect(inCidr("10.10.3.0", cidr("10.10.2.0/24"))).toBe(false);
  });

  it("works on masks that are not /24, which is the whole reason for the module", () => {
    // Comparing address text can answer /8, /16 and /24 and nothing else. This is the case strings
    // cannot do.
    expect(inCidr("10.10.2.5", cidr("10.10.0.0/16"))).toBe(true);
    expect(inCidr("10.10.130.5", cidr("10.10.128.0/18"))).toBe(true);
    expect(inCidr("10.10.127.5", cidr("10.10.128.0/18"))).toBe(false);
  });

  it("puts everything inside /0 and only one host inside /32", () => {
    expect(inCidr("198.51.100.4", cidr("0.0.0.0/0"))).toBe(true);
    expect(inCidr("10.10.2.5", cidr("10.10.2.5/32"))).toBe(true);
    expect(inCidr("10.10.2.6", cidr("10.10.2.5/32"))).toBe(false);
  });

  it("excludes an asset with no address at all", () => {
    expect(inCidr(undefined, cidr("10.0.0.0/8"))).toBe(false);
    expect(inCidr("", cidr("10.0.0.0/8"))).toBe(false);
  });
});

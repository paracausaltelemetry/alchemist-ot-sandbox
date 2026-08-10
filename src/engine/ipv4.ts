/**
 * IPv4 as numbers.
 *
 * Everywhere else in this codebase an address is handled as a string, and for what those places ask
 * — "is this RFC1918", "which /24 is it in" — a prefix test is the right tool and the clearest one.
 * Containment is the question strings cannot answer: `10.10.2.5` is inside `10.10.0.0/16` and no
 * amount of comparing the text of the two says so.
 *
 * Deliberately IPv4 only. A v6 address is not a range anybody types at a keyboard during an
 * engagement, and half-supporting it would be worse than saying so.
 */

const OCTETS = 4;

/** An address as a 32-bit number, or null when it is not one. */
export function parseIpv4(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parts = value.trim().split(".");
  if (parts.length !== OCTETS) {
    return null;
  }
  let result = 0;
  for (const part of parts) {
    // `Number("")` is 0 and `Number(" 8 ")` is 8, so the shape is checked before the value: an
    // empty octet is a typo, not a zero, and `10..0.1` must not read as `10.0.0.1`.
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    result = result * 256 + octet;
  }
  return result;
}

export interface Cidr {
  /** The network address, with the host bits already cleared. */
  base: number;
  /** Prefix length, 0–32. */
  bits: number;
}

/**
 * `10.10.2.0/24` into a comparable range.
 *
 * A bare address is accepted as a /32, so `cidr:10.10.2.5` means that one host rather than nothing.
 * Host bits are masked off, so `10.10.2.5/24` is read as the network somebody meant rather than
 * rejected on a technicality nobody cares about mid-engagement.
 */
export function parseCidr(value: string): Cidr | null {
  const [address, suffix] = value.trim().split("/");
  const base = parseIpv4(address);
  if (base === null) {
    return null;
  }
  if (suffix === undefined) {
    return { base, bits: 32 };
  }
  if (!/^\d{1,2}$/.test(suffix)) {
    return null;
  }
  const bits = Number(suffix);
  if (bits > 32) {
    return null;
  }
  return { base: maskOf(base, bits), bits };
}

/** `>>> 0` throughout: JavaScript's bitwise operators are signed, and /1 would come out negative. */
function maskOf(address: number, bits: number): number {
  if (bits === 0) {
    return 0;
  }
  return (address & (-1 << (32 - bits))) >>> 0;
}

export function inCidr(ip: string | undefined, cidr: Cidr): boolean {
  const address = parseIpv4(ip);
  return address !== null && maskOf(address, cidr.bits) === cidr.base;
}

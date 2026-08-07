/**
 * Which records describe the same machine.
 *
 * Every import path has answered this with `ip || hostname`, in two separate copies
 * (`assemble.ts` and `itTopology.ts`). That is wrong in both directions once more than one source
 * feeds the map:
 *
 *  - it **splits** a host that one source knew by name and another by address — patched once, for
 *    the pivot case, by an alias pass that only understood hostname-to-IP;
 *  - and it has never used the MAC address at all, so a laptop that moved subnets between scans is
 *    two assets, and a vendor inventory keyed on MAC cannot be merged with a scan keyed on IP.
 *
 * This resolves identity properly: union-find over every identifier a record carries, so joins are
 * transitive. A record with MAC+IP and another with IP+hostname end up one machine.
 *
 * Two deliberate asymmetries:
 *
 * 1. **MAC joins but does not name.** The canonical id still prefers IP, then hostname, so ids are
 *    unchanged for every record that already had one. MAC only adds edges to the graph.
 * 2. **A contested address does not join.** An IP seen with two different MACs is DHCP reuse or a
 *    NAT, not one host. Folding those together would invent a machine that never existed, so the
 *    address stops being usable as a join key and the records stay apart.
 */

export interface HostIdentifiers {
  ip?: string;
  mac?: string;
  hostname?: string;
}

export interface ResolvedIdentity {
  /** Stable key for the machine. Prefers IP, then hostname, then MAC. */
  id: string;
  ips: string[];
  macs: string[];
  hostnames: string[];
}

export interface IdentityResolution {
  /** The canonical key for a record, or `""` when it carries no identifier at all. */
  keyFor(record: HostIdentifiers): string;
  identities: ResolvedIdentity[];
  /** Addresses seen with more than one MAC, which is worth telling the operator about. */
  warnings: string[];
}

/** MACs are written a dozen ways. Compare them by their digits alone. */
export function normaliseMac(mac: string | undefined): string | undefined {
  if (!mac) {
    return undefined;
  }
  const digits = mac.toLowerCase().replace(/[^0-9a-f]/g, "");
  return digits.length === 12 ? digits : undefined;
}

const norm = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
};

const ipToken = (ip: string) => `ip:${ip}`;
const macToken = (mac: string) => `mac:${mac}`;
const hostToken = (hostname: string) => `host:${hostname}`;

class DisjointSet {
  private parent = new Map<string, string>();

  find(token: string): string {
    let root = this.parent.get(token) ?? token;
    if (root === token) {
      this.parent.set(token, token);
      return token;
    }
    root = this.find(root);
    this.parent.set(token, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

/**
 * Groups records by the machine they describe.
 *
 * Runs in two passes because the second depends on the first: which addresses are contested can
 * only be known once every MAC-bearing record has been read.
 */
export function resolveIdentities(records: HostIdentifiers[]): IdentityResolution {
  const parts = records.map((record) => ({
    ip: norm(record.ip),
    mac: normaliseMac(record.mac),
    hostname: norm(record.hostname)
  }));

  // Which MACs each address and name has been seen with. An address claimed by two MACs cannot
  // identify a machine, and neither can a hostname two different machines answer to.
  const macsByIp = new Map<string, Set<string>>();
  const macsByHostname = new Map<string, Set<string>>();
  for (const part of parts) {
    if (!part.mac) {
      continue;
    }
    if (part.ip) {
      macsByIp.set(part.ip, (macsByIp.get(part.ip) ?? new Set()).add(part.mac));
    }
    if (part.hostname) {
      macsByHostname.set(part.hostname, (macsByHostname.get(part.hostname) ?? new Set()).add(part.mac));
    }
  }

  const contestedIps = new Set([...macsByIp].filter(([, macs]) => macs.size > 1).map(([ip]) => ip));
  const contestedHostnames = new Set(
    [...macsByHostname].filter(([, macs]) => macs.size > 1).map(([hostname]) => hostname)
  );

  const sets = new DisjointSet();
  for (const part of parts) {
    const tokens: string[] = [];
    if (part.mac) {
      tokens.push(macToken(part.mac));
    }
    // A contested identifier still belongs to *this* record — it just cannot be used to reach
    // another one, so it is namespaced to the MAC that claimed it here.
    if (part.ip) {
      tokens.push(contestedIps.has(part.ip) && part.mac ? `ip:${part.ip}@${part.mac}` : ipToken(part.ip));
    }
    if (part.hostname) {
      tokens.push(
        contestedHostnames.has(part.hostname) && part.mac
          ? `host:${part.hostname}@${part.mac}`
          : hostToken(part.hostname)
      );
    }
    for (let index = 1; index < tokens.length; index += 1) {
      sets.union(tokens[0], tokens[index]);
    }
  }

  // Gather each class, then name it.
  const classes = new Map<string, { ips: Set<string>; macs: Set<string>; hostnames: Set<string> }>();
  const rootFor = (part: (typeof parts)[number]): string | null => {
    const anchor = part.mac
      ? macToken(part.mac)
      : part.ip
        ? ipToken(part.ip)
        : part.hostname
          ? hostToken(part.hostname)
          : null;
    return anchor ? sets.find(anchor) : null;
  };

  for (const part of parts) {
    const root = rootFor(part);
    if (!root) {
      continue;
    }
    const entry = classes.get(root) ?? { ips: new Set(), macs: new Set(), hostnames: new Set() };
    if (part.ip) entry.ips.add(part.ip);
    if (part.mac) entry.macs.add(part.mac);
    if (part.hostname) entry.hostnames.add(part.hostname);
    classes.set(root, entry);
  }

  // IP first, then hostname, then MAC — so every record that already had a key keeps it, and MAC
  // only ever adds edges. A machine with several addresses takes the lowest for determinism.
  //
  // A contested identifier is skipped when naming, not just when joining: two machines that share
  // an address are correctly held apart above, and would then both be *called* that address, which
  // collapses them again one step later.
  const idByRoot = new Map<string, string>();
  const identities: ResolvedIdentity[] = [];
  for (const [root, entry] of classes) {
    const ips = [...entry.ips].sort();
    const macs = [...entry.macs].sort();
    const hostnames = [...entry.hostnames].sort();
    const id =
      ips.find((ip) => !contestedIps.has(ip)) ??
      hostnames.find((hostname) => !contestedHostnames.has(hostname)) ??
      macs[0] ??
      ips[0] ??
      hostnames[0] ??
      "";
    idByRoot.set(root, id);
    identities.push({ id, ips, macs, hostnames });
  }
  identities.sort((a, b) => a.id.localeCompare(b.id));

  const warnings: string[] = [];
  for (const ip of [...contestedIps].sort()) {
    warnings.push(
      `${ip} was seen with ${macsByIp.get(ip)?.size} different MAC addresses, so it has been left as separate assets rather than merged.`
    );
  }

  return {
    keyFor(record) {
      const part = {
        ip: norm(record.ip),
        mac: normaliseMac(record.mac),
        hostname: norm(record.hostname)
      };
      const root = rootFor(part);
      return root ? (idByRoot.get(root) ?? "") : "";
    },
    identities,
    warnings
  };
}

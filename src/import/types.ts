import type { AssetTypeId } from "../models/types";
import type { ScanTime } from "./scanTime";

export type ImportFormat = "nmap-xml" | "nmap-normal" | "nmap-grep" | "zeek-conn" | "graphml" | "csv-inventory";

export const importFormatLabels: Record<ImportFormat, string> = {
  "nmap-xml": "Nmap XML",
  "nmap-normal": "Nmap normal output",
  "nmap-grep": "Nmap greppable",
  "zeek-conn": "Zeek conn.log",
  graphml: "Grassmarlin / GraphML",
  "csv-inventory": "CSV inventory"
};

/**
 * One NSE script result, kept as the script said it.
 *
 * `-sC` output is the richest thing an Nmap run produces and the least structured: every script
 * writes its own format, and there are hundreds of them. Parsing each one into fields would be a
 * project in itself and would silently drop whatever we had not written a reader for, so the text
 * is kept whole and only the few scripts worth acting on are interpreted.
 */
export interface ImportedScript {
  /** The script name, e.g. `smb-os-discovery`, `http-title`, `ssl-cert`. */
  id: string;
  output: string;
}

export interface ImportedPort {
  port: number;
  transport?: string;
  service?: string;
  product?: string;
  /** NSE results for this port (`-sC` / `--script`). */
  scripts?: ImportedScript[];
}

/** One hop of a traceroute, nearest hop first. A hop that timed out keeps its ttl so distance stays correct. */
export interface ImportedHop {
  ttl: number;
  ip?: string;
  hostname?: string;
  rttMs?: number;
  timedOut?: boolean;
}

/**
 * A traceroute towards one scanned host. The target itself is excluded, so every hop is an
 * intermediate device: real, named evidence of the routed path between the scanner and the host.
 */
export interface ImportedTrace {
  targetIp?: string;
  targetHostname?: string;
  hops: ImportedHop[];
  port?: number;
  proto?: string;
}

/**
 * What a scan learned about the ports that did *not* answer.
 *
 * Nmap distinguishes two silences and the difference is the whole finding. `closed` means the host
 * answered with a refusal — it is reachable, and nothing is listening. `filtered` means nothing came
 * back at all, which is a device in the path dropping traffic. A host showing 997 filtered and 3
 * open is behind a firewall; a host showing 997 closed and 3 open is not.
 *
 * Counts rather than a port list, because that is how Nmap reports it (`Not shown: 997 closed tcp
 * ports`, `<extraports>`), and because 65,000 rows of "nothing here" is not a finding.
 */
export interface PortSilence {
  closed: number;
  filtered: number;
}

/** A normalized host extracted from any source format, before mapping to a full Asset. */
export interface ImportedHost {
  ip?: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  os?: string;
  vlan?: string;
  /**
   * How sure Nmap was about `os`, 0–100.
   *
   * Worth keeping because the OS string is shown as though it were a fact. A 100% match on a full
   * TCP/IP fingerprint and an 85% guess from two open ports read identically once the percentage is
   * dropped, and the second one is regularly wrong.
   */
  osAccuracy?: number;
  /**
   * What Nmap thought the *kind* of device was — `router`, `firewall`, `printer`, `WAP`,
   * `general purpose`.
   *
   * This is the useful half of OS detection. The fingerprint database knows a Cisco ASA from a
   * Windows box, where our own classifier is guessing from open ports and a hostname, and it has
   * been sitting unread in `<osclass type>` and the `Device type:` line all along.
   */
  deviceTypeHint?: string;
  ports: ImportedPort[];
  /** Router hops between the scanner and this host, when the scan reported one. */
  distance?: number;
  /** Explicit overrides carried from a CSV inventory (column values). */
  typeHint?: AssetTypeId;
  zoneHint?: string;
  criticalityHint?: string;
  protocolsHint?: string[];
  notes?: string;
  /** Host-level NSE results — Nmap's `<hostscript>`, which is not tied to any one port. */
  scripts?: ImportedScript[];
  /**
   * Ports Nmap named individually as filtered.
   *
   * Kept apart from `ports` rather than flagged inside it. Everything downstream — asset-type
   * inference, the risk grading, the service dots — reads `ports` as "this host is running this",
   * and a filtered port is the opposite claim: nobody knows what is behind it. One shared list with
   * a state field would have every one of those consumers get it right or quietly get it wrong.
   */
  filteredPorts?: ImportedPort[];
  /** How many ports the scan swept past without an answer, and which kind of silence it was. */
  silence?: PortSilence;
}

/** A normalized observed connection, before mapping to a full Conduit. */
export interface ImportedFlow {
  sourceIp: string;
  targetIp: string;
  port?: number;
  transport?: string;
  service?: string;
}

export interface ParsedImport {
  format: ImportFormat;
  hosts: ImportedHost[];
  flows: ImportedFlow[];
  warnings: string[];
  /**
   * When the scan started, if the file said so. Absent means the file did not record it — never
   * the time of import, which would be indistinguishable from the real thing once written down.
   */
  startedAt?: ScanTime;
  /**
   * Traceroutes, when the source carried them. Deliberately separate from `flows`: the OT
   * assembler turns every flow into a conduit, and a hop is a router on the path rather than
   * an observed host-to-host connection. Optional so the other parsers need no changes.
   */
  traces?: ImportedTrace[];
}

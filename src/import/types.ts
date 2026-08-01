import type { AssetTypeId } from "../models/types";

export type ImportFormat = "nmap-xml" | "nmap-normal" | "nmap-grep" | "zeek-conn" | "graphml" | "csv-inventory";

export const importFormatLabels: Record<ImportFormat, string> = {
  "nmap-xml": "Nmap XML",
  "nmap-normal": "Nmap normal output",
  "nmap-grep": "Nmap greppable",
  "zeek-conn": "Zeek conn.log",
  graphml: "Grassmarlin / GraphML",
  "csv-inventory": "CSV inventory"
};

export interface ImportedPort {
  port: number;
  transport?: string;
  service?: string;
  product?: string;
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

/** A normalized host extracted from any source format, before mapping to a full Asset. */
export interface ImportedHost {
  ip?: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  os?: string;
  vlan?: string;
  ports: ImportedPort[];
  /** Router hops between the scanner and this host, when the scan reported one. */
  distance?: number;
  /** Explicit overrides carried from a CSV inventory (column values). */
  typeHint?: AssetTypeId;
  zoneHint?: string;
  criticalityHint?: string;
  protocolsHint?: string[];
  notes?: string;
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
   * Traceroutes, when the source carried them. Deliberately separate from `flows`: the OT
   * assembler turns every flow into a conduit, and a hop is a router on the path rather than
   * an observed host-to-host connection. Optional so the other parsers need no changes.
   */
  traces?: ImportedTrace[];
}

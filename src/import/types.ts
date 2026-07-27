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

/** A normalized host extracted from any source format, before mapping to a full Asset. */
export interface ImportedHost {
  ip?: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  os?: string;
  vlan?: string;
  ports: ImportedPort[];
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
}

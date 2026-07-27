import { assembleTopology, type AssembledTopology } from "./assemble";
import { parseInventoryCsv } from "./csvImport";
import { parseGraphml } from "./graphml";
import { parseNmapXml } from "./nmap";
import { parseNmapGreppable, parseNmapNormal } from "./nmapText";
import type { ImportFormat, ParsedImport } from "./types";
import { parseZeekConn } from "./zeek";

export type { ImportFormat } from "./types";
export { importFormatLabels } from "./types";
export type { AssembledTopology } from "./assemble";

export function parseByFormat(text: string, format: ImportFormat): ParsedImport {
  switch (format) {
    case "nmap-xml":
      return parseNmapXml(text);
    case "nmap-normal":
      return parseNmapNormal(text);
    case "nmap-grep":
      return parseNmapGreppable(text);
    case "zeek-conn":
      return parseZeekConn(text);
    case "graphml":
      return parseGraphml(text);
    case "csv-inventory":
      return parseInventoryCsv(text);
  }
}

/** Parses raw scan output and assembles it into Alchemist assets, conduits and subnets. */
export function importTopology(text: string, format: ImportFormat): AssembledTopology {
  return assembleTopology(parseByFormat(text, format));
}

/** Best-effort format guess from a file name and the first chunk of its contents. */
export function detectFormat(filename: string, text: string): ImportFormat | null {
  const name = filename.toLowerCase();
  const head = text.slice(0, 4000);

  if (/<nmaprun|nmaprun/i.test(head)) {
    return "nmap-xml";
  }
  if (/^Host:\s+\S+.*\b(Status|Ports):/m.test(head) || /# Nmap .* -oG/i.test(head)) {
    return "nmap-grep";
  }
  if (/^Nmap scan report for /m.test(head)) {
    return "nmap-normal";
  }
  if (/<graphml|graphml/i.test(head) || name.endsWith(".graphml")) {
    return "graphml";
  }
  if (/#fields|#separator|id\.orig_h|orig_h/.test(head)) {
    return "zeek-conn";
  }
  if (head.trim().startsWith("{") && /orig_h|resp_h/.test(head)) {
    return "zeek-conn";
  }
  if (name.endsWith(".csv") || (head.includes(",") && /\n/.test(head))) {
    return "csv-inventory";
  }
  if (name.endsWith(".xml")) {
    return "nmap-xml";
  }
  return null;
}

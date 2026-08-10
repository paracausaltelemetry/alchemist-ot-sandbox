import type { ItNodeKind } from "../models/itMap";
import type { ImportedHost } from "./types";

/**
 * IT device classification, kept separate from the OT `inferAssetType` in `inference.ts`.
 * The OT classifier answers "which Purdue asset type is this" and funnels every ordinary IT
 * host into `enterprise-it`; this one answers "which standard network-map symbol is this",
 * which is the question the IT map actually asks. Neither should learn the other's vocabulary.
 */

const FIREWALL_NAME = /\b(fw|asa|palo|panos|forti|fortigate|sonicwall|checkpoint|pfsense|opnsense)\b/i;
const ROUTER_NAME = /\b(rtr|router|gw|gateway|edge|border|core)\b/i;
const SWITCH_NAME = /\b(sw|switch|access|dist)\d*\b/i;
const PRINTER_NAME = /\b(print|printer|mfp|copier)\b/i;
const AP_NAME = /\b(ap|wap|wifi|wlan)\d*\b/i;
const LB_NAME = /\b(lb|vip|balancer)\d*\b/i;

const NETWORK_VENDOR = /cisco|juniper|aruba|hewlett|procurve|extreme|brocade|mikrotik|ubiquiti|netgear|d-link|tp-link|huawei/i;
const FIREWALL_VENDOR = /palo alto|fortinet|sonicwall|check ?point|watchguard|sophos/i;
const AP_VENDOR = /ubiquiti|ruckus|meraki|aruba|mist/i;
const LB_VENDOR = /f5 networks|citrix|kemp|a10 networks/i;
const PRINTER_VENDOR = /hewlett|lexmark|xerox|brother|kyocera|ricoh|canon|epson/i;

const DATABASE_PORTS = new Set([1433, 3306, 5432, 1521, 27017, 6379, 9200, 5984, 11211]);
const PRINTER_PORTS = new Set([515, 631, 9100]);
const DIRECTORY_PORTS = new Set([88, 389, 636, 3268]);
const WEB_PORTS = new Set([80, 443, 8080, 8443]);
const MAIL_PORTS = new Set([25, 110, 143, 465, 587, 993, 995]);
const FILE_PORTS = new Set([139, 445, 2049]);
const REMOTE_DESKTOP_PORTS = new Set([3389, 5900, 5901]);
/** Ports a router or managed switch plausibly exposes for its own management, and nothing else. */
const MANAGEMENT_PORTS = new Set([22, 23, 80, 161, 443, 8291]);

export interface ItClassificationHints {
  /** The host was seen as an intermediate hop in a traceroute, so it routes packets. */
  isTracerouteHop?: boolean;
  /** The host holds the .1/.254 address of its subnet. A hint only — never decisive on its own. */
  isGatewayAddress?: boolean;
}

function nameOf(host: ImportedHost): string {
  return `${host.hostname ?? ""} ${host.ip ?? ""}`;
}

function hasAny(host: ImportedHost, ports: Set<number>): boolean {
  return host.ports.some((port) => ports.has(port.port));
}

function serviceMatches(host: ImportedHost, pattern: RegExp): boolean {
  return host.ports.some((port) => pattern.test(`${port.service ?? ""} ${port.product ?? ""}`));
}

/**
 * True when a host exposes nothing but management services. Used to gate gateway promotion:
 * a .1 address running SMB and RDP is a server someone parked there, not the router.
 */
export function isRouterLike(host: ImportedHost): boolean {
  return host.ports.every((port) => MANAGEMENT_PORTS.has(port.port));
}

/**
 * Nmap's own word for the kind of device, mapped onto our symbols.
 *
 * The fingerprint database knows a Cisco ASA from a Windows box by its TCP/IP stack. Everything
 * below this function is inference from open ports and a hostname, so where the database has
 * spoken it is the better evidence — and `<osclass type>` has been in every `-O` scan we have ever
 * parsed, unread.
 */
const OS_CLASS_KINDS: Array<[RegExp, ItNodeKind]> = [
  [/^firewall$/i, "firewall"],
  [/^(router|broadband router)$/i, "router"],
  [/^switch$/i, "switch"],
  [/^(printer|print server)$/i, "printer"],
  [/^(wap|wireless access point)$/i, "wireless-ap"],
  [/^load balancer$/i, "load-balancer"],
  [/^storage-misc$/i, "server"]
];

function kindFromDeviceType(hint: string | undefined): ItNodeKind | null {
  if (!hint) {
    return null;
  }
  return OS_CLASS_KINDS.find(([pattern]) => pattern.test(hint.trim()))?.[1] ?? null;
}

/** Maps a scanned host onto the standard network-map symbol that best describes it. */
export function classifyItDevice(host: ImportedHost, hints: ItClassificationHints = {}): ItNodeKind {
  const name = nameOf(host);
  const vendor = host.vendor ?? "";
  const os = (host.os ?? "").toLowerCase();

  if (FIREWALL_NAME.test(name) || FIREWALL_VENDOR.test(vendor) || serviceMatches(host, /fortinet|palo ?alto|checkpoint/i)) {
    return "firewall";
  }

  // Below the name checks, above everything derived from ports: a hostname is what somebody called
  // the box, which beats a fingerprint, but an open port on a printer is not evidence of a printer.
  // Routing seen in a traceroute still wins — that is observed behaviour, not a database lookup.
  const fingerprinted = kindFromDeviceType(host.deviceTypeHint);
  if (fingerprinted && !hints.isTracerouteHop) {
    return fingerprinted;
  }

  // Routing is observed behaviour, so it outranks every name or address heuristic below.
  if (hints.isTracerouteHop) {
    return "router";
  }

  if (ROUTER_NAME.test(name) && isRouterLike(host)) {
    return "router";
  }

  if (PRINTER_NAME.test(name) || hasAny(host, PRINTER_PORTS) || (PRINTER_VENDOR.test(vendor) && hasAny(host, PRINTER_PORTS))) {
    return "printer";
  }

  if (AP_NAME.test(name) || AP_VENDOR.test(vendor)) {
    return "wireless-ap";
  }

  if (LB_NAME.test(name) || LB_VENDOR.test(vendor)) {
    return "load-balancer";
  }

  if (SWITCH_NAME.test(name) || (NETWORK_VENDOR.test(vendor) && isRouterLike(host) && host.ports.length > 0)) {
    return "switch";
  }

  if (hasAny(host, DATABASE_PORTS)) {
    return "database";
  }

  if (hasAny(host, DIRECTORY_PORTS) || hasAny(host, WEB_PORTS) || hasAny(host, MAIL_PORTS) || os.includes("server")) {
    return "server";
  }

  if (hasAny(host, FILE_PORTS)) {
    // SMB alone is ambiguous: a Windows desktop shares it with a file server. Remote desktop
    // or a workstation OS tips it towards a client machine.
    return hasAny(host, REMOTE_DESKTOP_PORTS) && !os.includes("server") ? "workstation" : "server";
  }

  if (hasAny(host, REMOTE_DESKTOP_PORTS) || /windows (7|8|10|11)/.test(os)) {
    return "workstation";
  }

  // A gateway address with nothing but management services and no better signal is a router.
  if (hints.isGatewayAddress && isRouterLike(host)) {
    return "router";
  }

  return "unknown";
}

import { portRisk } from "../../engine/itAnalysis";
import type { ImportedPort } from "../../import/types";

/**
 * How a scanned port is written down, in one place.
 *
 * It lives outside the canvas component because the inspector, the tooltips and the dots all have
 * to agree what a port is called — and because a module exporting both a component and plain
 * functions loses fast refresh.
 */

/**
 * The order a reader expects: by port number, ascending.
 *
 * Scan order is arrival order, which differs between two runs of the same scan and between two
 * hosts running the same services. Sorted, the same stack of services makes the same shape on every
 * device, and a reader recognises "that is a Windows box" without reading a word.
 */
export const orderedServices = (ports: ImportedPort[]) => [...ports].sort((a, b) => a.port - b.port);

/**
 * One port, written out in full: what answered, and what it said it was running.
 *
 * The version is the finding. "ssh" is a fact about the port; "OpenSSH 8.9" is something an
 * operator can go and look up — and Nmap has been handing it to us in `product` since the first
 * parser, with nothing in the interface ever showing it.
 */
export const describePort = (port: ImportedPort) => {
  const risk = portRisk(port.port);
  return (
    `${port.port}/${port.transport ?? "tcp"} ${port.service ?? ""}`.trim() +
    (port.product ? `  ${port.product}` : "") +
    (risk ? `  — ${risk.reason}` : "")
  );
};

/** Everything the scan found, for the tooltip: the canvas shows a few, the truth is all of them. */
export const serviceSummary = (ports: ImportedPort[]) =>
  ports.length === 0 ? "No open services recorded" : orderedServices(ports).map(describePort).join("\n");

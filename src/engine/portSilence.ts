import type { ImportedPort, PortSilence } from "../import/types";

/**
 * What the ports that said nothing are telling you.
 *
 * A scan report is mostly silence, and the two kinds of silence mean opposite things. `closed` is
 * the host itself answering with a refusal: it is reachable, the packet got there and came back,
 * and nothing is listening on that port. `filtered` is no answer at all, which means something
 * between the scanner and the host swallowed it.
 *
 * That distinction is segmentation evidence and it is free — every scan already reports it, and
 * this app has been discarding it since the first importer. A subnet of hosts answering "closed"
 * is flat and reachable. The same subnet answering "filtered" has a firewall in front of it.
 */

export type SilenceVerdict = "filtered" | "reachable" | "mixed" | "unknown";

export interface SilenceReading {
  verdict: SilenceVerdict;
  /** What to put in front of a reader, in their words rather than Nmap's. */
  summary: string;
}

/** Filtered has to be the clear majority before the map says a firewall is in the way. */
const DOMINANT = 0.8;

export function readSilence(silence: PortSilence | undefined, filteredPorts: ImportedPort[] = []): SilenceReading {
  const filtered = (silence?.filtered ?? 0) + filteredPorts.length;
  const closed = silence?.closed ?? 0;
  const total = filtered + closed;

  if (total === 0) {
    // Not "nothing was filtered" — a greppable export, or a scan of a handful of named ports,
    // never says. Claiming an open path from a file that did not report one would be inventing it.
    return { verdict: "unknown", summary: "This scan did not say what happened to the ports that were not open." };
  }

  if (filtered === 0) {
    return {
      verdict: "reachable",
      summary: `${closed} ports answered as closed. The host is reachable and nothing is listening on them — no filtering between here and it.`
    };
  }

  if (filtered / total >= DOMINANT) {
    return {
      verdict: "filtered",
      summary: `${filtered} ports gave no answer at all. Something in the path is dropping traffic to this host, which is a firewall or an ACL rather than a quiet host.`
    };
  }

  return {
    verdict: "mixed",
    summary: `${closed} ports answered as closed and ${filtered} gave no answer. The host is reachable, and a rule is dropping part of the range.`
  };
}

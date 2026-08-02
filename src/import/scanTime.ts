/**
 * When a scan ran, read out of the scan file itself.
 *
 * Nmap records its start time in all three output formats and in three different shapes, each with
 * a different amount of truth in it. What matters downstream is not just the instant but how much
 * of it can be trusted, so `precision` and `tzAssumed` travel with the value and end up stated in
 * the engagement report rather than quietly rounded away.
 *
 * Nothing here is ever synthesised. A scan with no recorded time has none — `ItMap.createdAt`
 * already demonstrates the failure mode, being synthesis time that nothing reads and nobody could
 * distinguish from scan time.
 */

export interface ScanTime {
  iso: string;
  /** `file` means the scan said so. `operator` means a person typed it in. */
  source: "file" | "operator";
  precision: "second" | "minute" | "day";
  /** True when the file named a timezone that had to be ignored, so the instant is local-assumed. */
  tzAssumed?: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function iso(date: Date): string | null {
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * XML: `<nmaprun start="1712224800" startstr="Thu Apr  4 10:00:00 2024">`.
 *
 * `start` is a Unix timestamp, which is unambiguous, so it is preferred over `startstr` and needs
 * no timezone assumption.
 */
export function scanTimeFromXmlAttrs(attrs: Record<string, string | undefined>): ScanTime | null {
  const epoch = Number(attrs.start);
  if (Number.isFinite(epoch) && epoch > 0) {
    const at = iso(new Date(epoch * 1000));
    if (at) {
      return { iso: at, source: "file", precision: "second" };
    }
  }
  return attrs.startstr ? scanTimeFromCtime(attrs.startstr) : null;
}

/**
 * The C `ctime` form Nmap prints in `startstr` and in the greppable header:
 * `Thu Apr  4 10:00:00 2024`. No timezone at all, so it is read as local time and said to be.
 */
export function scanTimeFromCtime(value: string): ScanTime | null {
  const match = value
    .trim()
    .match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) {
    return null;
  }
  const at = iso(new Date(Number(match[6]), month, Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])));
  return at ? { iso: at, source: "file", precision: "second", tzAssumed: true } : null;
}

/** Greppable header: `# Nmap 7.94 scan initiated Thu Apr  4 10:00:00 2024 as: nmap -oG …`. */
export function scanTimeFromGreppable(text: string): ScanTime | null {
  const match = text.match(/^#\s*Nmap\s+\S+\s+scan initiated\s+(.+?)\s+as:/m);
  return match ? scanTimeFromCtime(match[1]) : null;
}

/**
 * Normal output header: `Starting Nmap 7.94 ( https://nmap.org ) at 2024-04-04 10:00 BST`.
 *
 * This is the real `-oN` banner, and it is the least informative of the three: no seconds, and a
 * timezone *abbreviation* that `Date.parse` handles inconsistently across engines and cannot
 * disambiguate anyway (CST is three different offsets). The date and local time are parsed, the
 * abbreviation is deliberately ignored, and both facts are recorded.
 */
export function scanTimeFromNormal(text: string): ScanTime | null {
  const match = text.match(/^Starting Nmap\b.*?\bat\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/m);
  if (!match) {
    return null;
  }
  const seconds = match[6] ? Number(match[6]) : 0;
  const at = iso(
    new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), seconds)
  );
  if (!at) {
    return null;
  }
  return { iso: at, source: "file", precision: match[6] ? "second" : "minute", tzAssumed: true };
}

const DATE_STYLE: Record<ScanTime["precision"], Intl.DateTimeFormatOptions> = {
  second: { dateStyle: "medium", timeStyle: "medium" },
  minute: { dateStyle: "medium", timeStyle: "short" },
  day: { dateStyle: "medium" }
};

/** Renders a scan time at no more precision than it actually has. */
export function formatScanTime(time: ScanTime): string {
  return new Intl.DateTimeFormat(undefined, DATE_STYLE[time.precision]).format(new Date(time.iso));
}

/** The caveat to print beside a time, or empty when there is nothing to caveat. */
export function scanTimeCaveat(time: ScanTime): string {
  const parts: string[] = [];
  if (time.source === "operator") {
    parts.push("entered by hand");
  }
  if (time.tzAssumed) {
    parts.push("timezone assumed local");
  }
  return parts.join(", ");
}

import type { ImportedHost, ImportedScript } from "./types";

/**
 * What `-sC` tells us that the port table does not.
 *
 * NSE output is the richest and least structured part of an Nmap run. Rather than write a reader
 * per script — there are hundreds, and one we have not written silently vanishes — the text is kept
 * whole for the operator and only the handful of scripts that answer a question the map already
 * asks are interpreted here.
 */

/**
 * Two sets of script results for the same thing, folded into one.
 *
 * Keyed on the script name *and* its output: re-running `--script vuln` against a host that has
 * since been patched should leave both results visible, because the difference between them is the
 * finding. Only a byte-identical repeat is a duplicate.
 */
export function mergeScripts(
  existing: ImportedScript[] | undefined,
  incoming: ImportedScript[] | undefined
): ImportedScript[] | undefined {
  if (!incoming) {
    return existing;
  }
  const merged = [...(existing ?? [])];
  for (const script of incoming) {
    if (!merged.some((seen) => seen.id === script.id && seen.output === script.output)) {
      merged.push(script);
    }
  }
  return merged.length > 0 ? merged : undefined;
}

/**
 * The value of a labelled line in a script's output, e.g. `OS: Windows Server 2012 R2`.
 *
 * Line-by-line rather than a built regular expression: the label is data, and interpolating data
 * into a pattern is how a stray `(` in a script's field name turns a parse into a throw.
 */
function smbField(output: string, label: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(`${label.toLowerCase()}:`)) {
      const value = trimmed.slice(label.length + 1).trim();
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Fills in what a script knows and the scan itself did not.
 *
 * `smb-os-discovery` is the one worth doing: it answers over SMB with the OS string and the
 * machine's own name, both of which are first-hand — the host saying what it is — where `osmatch`
 * is a fingerprint guess and a PTR record is whatever DNS was told years ago. It only ever fills a
 * gap; a value the scan reported directly is never overwritten, because a script result arriving
 * later must not quietly rewrite an earlier finding.
 */
export function enrichFromScripts(host: ImportedHost): ImportedHost {
  const all: ImportedScript[] = [...(host.scripts ?? []), ...host.ports.flatMap((port) => port.scripts ?? [])];
  const smb = all.find((script) => script.id === "smb-os-discovery");
  if (!smb) {
    return host;
  }

  const enriched = { ...host };
  const os = smbField(smb.output, "OS");
  if (os && !enriched.os) {
    enriched.os = os;
  }
  const name = smbField(smb.output, "Computer name") ?? smbField(smb.output, "NetBIOS computer name");
  if (name && !enriched.hostname) {
    // Nmap writes the NetBIOS name with its padding spelled out — `WIN-BUILD01\x00`, four literal
    // characters. That is an artefact of the 16-byte name field, not part of what the box is called.
    const padding = "\\x00";
    enriched.hostname = (name.endsWith(padding) ? name.slice(0, -padding.length) : name).trim();
  }
  return enriched;
}

/**
 * Every CVE the scripts named, deduplicated, newest identifier first.
 *
 * `vulners` and the `vuln-*` family report findings as free text with the identifier embedded, so
 * a regex over the output is the whole extraction. This is not a vulnerability model — no CVSS,
 * no state, no lifecycle — it is the list of identifiers a reader would otherwise have to find by
 * eye in a wall of script output, and it stays a derived view for exactly that reason.
 */
export function cvesFromScripts(scripts: ImportedScript[]): string[] {
  const found = new Set<string>();
  for (const script of scripts) {
    for (const match of script.output.matchAll(/\bCVE-\d{4}-\d{4,7}\b/gi)) {
      found.add(match[0].toUpperCase());
    }
  }
  return [...found].sort().reverse();
}

import { ACCESS_LABELS } from "../models/itEngagement";
import { MAX_SL } from "./securityLevels";
import type { MapReport } from "./mapReport";

/**
 * The engagement report as Markdown.
 *
 * Paths are written out as text rather than drawn: `external → edge-fw → hmi-legacy` carries the
 * same information as a diagram in a form that survives being pasted into a ticket. ASCII-art
 * network diagrams were considered and rejected on the IT report for the same reason they are
 * rejected here — they read as a toy, which is the one thing a document going to a client must not
 * do.
 */
export function mapReportMarkdown(report: MapReport): string {
  const lines: string[] = [`# ${report.name}`, ""];
  const { summary } = report;

  lines.push("## Summary", "");
  lines.push(
    `- ${summary.assets} asset${summary.assets === 1 ? "" : "s"} across ${summary.zonesInUse} Purdue level${
      summary.zonesInUse === 1 ? "" : "s"
    }, from ${summary.sources} import${summary.sources === 1 ? "" : "s"}: ${summary.vantages.join(", ")}`
  );
  lines.push(`- Highest access reached: ${ACCESS_LABELS[summary.highestAccess]}`);
  if (summary.deepestZoneReached) {
    lines.push(`- Deepest level reached: ${summary.deepestZoneReached}`);
  }
  if (summary.reachedButNotExternallyVisible.length > 0) {
    lines.push(
      `- ${summary.reachedButNotExternallyVisible.length} asset${
        summary.reachedButNotExternallyVisible.length === 1 ? "" : "s"
      } reached that nothing untrusted could route to directly: ${summary.reachedButNotExternallyVisible.join(", ")}`
    );
  }
  if (summary.chain.length > 0) {
    lines.push(`- Longest chain: external → ${summary.chain.join(" → ")}`);
  }

  lines.push("", "## Timeline", "");
  if (report.stages.length === 0) {
    lines.push("Nothing recorded.");
  }
  for (const stage of report.stages) {
    lines.push(`### Stage ${stage.sequence} — ${stage.title}`, "");
    lines.push(`*${stage.when}*`, "");
    for (const detail of stage.detail) {
      lines.push(`- ${detail}`);
    }
    if (stage.revealed.length > 0) {
      lines.push(`- First seen here: ${stage.revealed.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Access held", "");
  if (report.access.length === 0) {
    lines.push("No asset was accessed.", "");
  } else {
    lines.push("| Asset | Address | Level | Access | Won at |", "| --- | --- | --- | --- | --- |");
    for (const row of report.access) {
      lines.push(
        `| ${row.name} | ${row.address || "—"} | ${row.zone} | ${ACCESS_LABELS[row.access]} | Stage ${
          row.grantedAtSequence
        }: ${row.grantedBy} |`
      );
    }
    lines.push("");
  }

  lines.push("## Purdue levels", "");
  lines.push("| Level | Assets | SL-T | Signal | Accessed |", "| --- | --- | --- | --- | --- |");
  for (const zone of report.zones) {
    // An unmodelled level prints as such rather than as a signal of 0, which would read as a
    // measurement rather than as an absence of one.
    const signal = zone.modelled ? `${zone.achieved} / ${MAX_SL}` : "not modelled";
    lines.push(
      `| ${zone.name} | ${zone.assets} | ${zone.target} | ${signal} | ${zone.accessed.join(", ") || "—"} |`
    );
  }

  lines.push("", "## Level crossings", "");
  if (report.crossings.length === 0) {
    lines.push("No connection crosses a Purdue level.", "");
  } else {
    lines.push("| From | To | Permit rule | Evidence |", "| --- | --- | --- | --- |");
    for (const crossing of report.crossings) {
      lines.push(
        `| ${crossing.from} (${crossing.fromZone}) | ${crossing.to} (${crossing.toZone}) | ${crossing.firewallRule} | ${crossing.evidence} |`
      );
    }
    lines.push("");
  }

  lines.push("## Findings", "");
  if (report.findings.length === 0) {
    lines.push("No rule fired.", "");
  } else {
    lines.push("| Severity | Finding | Affects |", "| --- | --- | --- |");
    for (const finding of report.findings) {
      lines.push(`| ${finding.severity} | ${finding.title} | ${finding.affectedAssetIds.length} |`);
    }
    lines.push("");
  }

  lines.push("## What this does not cover", "");
  for (const item of report.negativeSpace) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Provenance", "");
  lines.push("| Stage | File | Format | Hosts | Collected from | When | Time |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const entry of report.provenance) {
    lines.push(
      `| ${entry.sequence} | ${entry.name} | ${entry.format} | ${entry.assetCount} | ${entry.vantage} | ${entry.when} | ${entry.timeSource} |`
    );
  }
  lines.push("", "Every claim in this document traces to a named import or a recorded action.", "");

  return lines.join("\n");
}

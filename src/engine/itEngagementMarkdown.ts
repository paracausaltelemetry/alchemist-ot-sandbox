import { ACCESS_LABELS } from "../models/itEngagement";
import type { ItEngagementReport } from "./itEngagementReport";

/**
 * The engagement report as Markdown.
 *
 * Paths are written out as text rather than drawn: `external → edge-fw → hmi-legacy` carries the
 * same information as a diagram in a form that survives being pasted into a ticket. ASCII-art
 * network diagrams were considered and rejected — they read as a toy, which is the one thing a
 * document going to a client must not do. The SVG stage maps are offered as a separate download.
 */
export function itEngagementMarkdown(report: ItEngagementReport): string {
  const lines: string[] = [`# ${report.name}`, ""];
  const { summary } = report;

  lines.push("## Summary", "");
  lines.push(
    `- ${summary.hosts} host${summary.hosts === 1 ? "" : "s"} mapped across ${summary.scans} scan${
      summary.scans === 1 ? "" : "s"
    } from ${summary.vantages.length} vantage${summary.vantages.length === 1 ? "" : "s"}: ${summary.vantages.join(", ")}`
  );
  lines.push(`- Highest access reached: ${ACCESS_LABELS[summary.highestAccess]}`);
  if (summary.reachedButNotExternallyVisible.length > 0) {
    lines.push(
      `- ${summary.reachedButNotExternallyVisible.length} host${
        summary.reachedButNotExternallyVisible.length === 1 ? "" : "s"
      } reached that no externally routable address would have exposed: ${summary.reachedButNotExternallyVisible.join(", ")}`
    );
  }
  if (summary.chain.length > 0) {
    lines.push(`- Longest chain: external → ${summary.chain.join(" → ")}`);
  }

  lines.push("", "## Engagement timeline", "");
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
    lines.push("No host was accessed.");
  } else {
    lines.push("| Host | Address | Access | Won at |", "| --- | --- | --- | --- |");
    for (const row of report.access) {
      lines.push(
        `| ${row.name} | ${row.address || "—"} | ${ACCESS_LABELS[row.access]} | Stage ${row.grantedAtSequence}: ${row.grantedBy} |`
      );
    }
  }

  lines.push("", "## Findings", "");
  if (report.findings.length === 0) {
    lines.push("No risky services were flagged.");
  } else {
    // The cross-reference is the point: a flagged service on a host that was compromised reads
    // very differently from one nobody touched. It is host-level, and the column says so — naming
    // a port as "exploited" would claim a route the journal never recorded.
    lines.push("| Severity | Host | Service | Why | Acted on at |", "| --- | --- | --- | --- | --- |");
    for (const finding of report.findings) {
      lines.push(
        `| ${finding.severity} | ${finding.host} | ${finding.service} | ${finding.reason} | ${
          finding.actedOnAt.length > 0 ? finding.actedOnAt.join("; ") : "No action recorded"
        } |`
      );
    }
  }

  lines.push("", "## What this does not cover", "");
  for (const item of report.negativeSpace) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Provenance", "");
  lines.push("| Stage | File | Format | Hosts | Run from | When | Time |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const entry of report.provenance) {
    lines.push(
      `| ${entry.sequence} | ${entry.name} | ${entry.format} | ${entry.hostCount} | ${entry.vantage} | ${entry.when} | ${entry.timeSource} |`
    );
  }

  lines.push("", `*Generated ${new Date(report.generatedAt).toLocaleString()} by Alchemist. Every claim above traces to a named scan file or a recorded action.*`);
  return lines.join("\n");
}

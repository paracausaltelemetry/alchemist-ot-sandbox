import { useMemo } from "react";
import { buildItEngagementReport } from "../engine/itEngagementReport";
import { buildItStageMaps } from "../engine/itStageMaps";
import { ACCESS_LABELS, type ItEngagement } from "../models/itEngagement";
import { ItMapSvg } from "./ItMapSvg";

interface ItPrintableReportProps {
  engagement: ItEngagement | null;
}

/**
 * The engagement report as a print document.
 *
 * Mounted hidden so Ctrl+P works without a round trip through state, and memoised for the same
 * reason `PrintableReport` is: unmemoised, the builder would re-run on every render of the map,
 * including every selection click.
 *
 * No advisory score. A 0-100 posture number is an OT architecture judgement and says nothing about
 * an offensive engagement; printing one here would invite a comparison it cannot support.
 */
export function ItPrintableReport({ engagement }: ItPrintableReportProps) {
  const report = useMemo(() => (engagement ? buildItEngagementReport(engagement) : null), [engagement]);
  const stageMaps = useMemo(() => (engagement ? buildItStageMaps(engagement) : []), [engagement]);

  if (!report) {
    return null;
  }

  const { summary } = report;

  return (
    <article className="print-document it-print-document">
      <header>
        <p>Alchemist</p>
        <h1>{report.name}</h1>
        <strong>Engagement record</strong>
      </header>

      <section>
        <h2>Summary</h2>
        <ul>
          <li>
            {summary.hosts} host{summary.hosts === 1 ? "" : "s"} mapped across {summary.scans} scan
            {summary.scans === 1 ? "" : "s"} from {summary.vantages.length} vantage
            {summary.vantages.length === 1 ? "" : "s"}: {summary.vantages.join(", ")}
          </li>
          <li>Highest access reached: {ACCESS_LABELS[summary.highestAccess]}</li>
          {summary.reachedButNotExternallyVisible.length > 0 ? (
            <li>
              {summary.reachedButNotExternallyVisible.length} host
              {summary.reachedButNotExternallyVisible.length === 1 ? "" : "s"} reached that no externally routable
              address would have exposed: {summary.reachedButNotExternallyVisible.join(", ")}
            </li>
          ) : null}
          {summary.chain.length > 0 ? <li>Longest chain: external &rarr; {summary.chain.join(" → ")}</li> : null}
        </ul>
      </section>

      <section>
        <h2>Engagement timeline</h2>
        {report.stages.map((stage) => {
          const stageMap = stageMaps.find((entry) => entry.sequence === stage.sequence);
          return (
            <div className="it-print-stage" key={`${stage.sequence}-${stage.title}`}>
              <h3>
                Stage {stage.sequence} — {stage.title}
              </h3>
              <p className="it-print-when">{stage.when}</p>
              <ul>
                {stage.detail.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
                {stage.revealed.length > 0 ? <li>First seen here: {stage.revealed.join(", ")}</li> : null}
              </ul>
              {stageMap ? (
                <div className="it-print-map">
                  <ItMapSvg map={stageMap.map} subtitle={stageMap.subtitle} emphasise={stageMap.emphasise} />
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      <section>
        <h2>Access held</h2>
        {report.access.length === 0 ? (
          <p>No host was accessed.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Host</th>
                <th>Address</th>
                <th>Access</th>
                <th>Won at</th>
              </tr>
            </thead>
            <tbody>
              {report.access.map((row) => (
                <tr key={row.nodeId}>
                  <td>{row.name}</td>
                  <td>{row.address || "—"}</td>
                  <td>{ACCESS_LABELS[row.access]}</td>
                  <td>
                    Stage {row.grantedAtSequence}: {row.grantedBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Findings</h2>
        {report.findings.length === 0 ? (
          <p>No risky services were flagged.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Host</th>
                <th>Service</th>
                <th>Why</th>
                <th>Acted on at</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding) => (
                <tr key={`${finding.host}-${finding.service}`}>
                  <td>{finding.severity}</td>
                  <td>{finding.host}</td>
                  <td>{finding.service}</td>
                  <td>{finding.reason}</td>
                  <td>{finding.actedOnAt.length > 0 ? finding.actedOnAt.join("; ") : "No action recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>What this does not cover</h2>
        <ul>
          {report.negativeSpace.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Provenance</h2>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>File</th>
              <th>Format</th>
              <th>Hosts</th>
              <th>Run from</th>
              <th>When</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {report.provenance.map((entry) => (
              <tr key={entry.sequence}>
                <td>{entry.sequence}</td>
                <td>{entry.name}</td>
                <td>{entry.format}</td>
                <td>{entry.hostCount}</td>
                <td>{entry.vantage}</td>
                <td>{entry.when}</td>
                <td>{entry.timeSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Every claim in this document traces to a named scan file or a recorded action.</p>
      </section>
    </article>
  );
}

import { useMemo } from "react";
import { buildMapReport } from "../engine/mapReport";
import { buildMapStageMaps } from "../engine/mapStageMaps";
import { MAX_SL } from "../engine/securityLevels";
import { ACCESS_LABELS } from "../models/itEngagement";
import { MapSvg } from "./MapSvg";
import type { CyberMapDocument } from "../models/cyberMap";

/**
 * The engagement report as a print document.
 *
 * Mounted hidden so Ctrl+P works without a round trip through state, and memoised because the
 * builder re-projects the document once per import to work out what each one revealed — unmemoised
 * that would re-run on every render of the map, including every selection click.
 *
 * A sibling of the workspace, never a child of it. The print rule that hides the live UI is keyed
 * on the workspace, so a report mounted inside it would be hidden by the very rule that exists to
 * make it printable.
 */
export function MapPrintableReport({ doc }: { doc: CyberMapDocument }) {
  const report = useMemo(() => buildMapReport(doc), [doc]);
  const stageMaps = useMemo(() => buildMapStageMaps(doc), [doc]);

  if (doc.sources.length === 0) {
    return null;
  }

  const { summary } = report;

  return (
    <article className="print-document map-print-document">
      <header>
        <p>Alchemist</p>
        <h1>{report.name}</h1>
        <strong>Converged estate — engagement record</strong>
      </header>

      <section>
        <h2>Summary</h2>
        <ul>
          <li>
            {summary.assets} asset{summary.assets === 1 ? "" : "s"} across {summary.zonesInUse} Purdue level
            {summary.zonesInUse === 1 ? "" : "s"}, from {summary.sources} import
            {summary.sources === 1 ? "" : "s"}: {summary.vantages.join(", ")}
          </li>
          <li>Highest access reached: {ACCESS_LABELS[summary.highestAccess]}</li>
          {summary.deepestZoneReached ? <li>Deepest level reached: {summary.deepestZoneReached}</li> : null}
          {summary.reachedButNotExternallyVisible.length > 0 ? (
            <li>
              {summary.reachedButNotExternallyVisible.length} asset
              {summary.reachedButNotExternallyVisible.length === 1 ? "" : "s"} reached that nothing untrusted could route
              to directly: {summary.reachedButNotExternallyVisible.join(", ")}
            </li>
          ) : null}
          {summary.chain.length > 0 ? <li>Longest chain: external &rarr; {summary.chain.join(" → ")}</li> : null}
        </ul>
      </section>

      <section>
        <h2>Timeline</h2>
        {report.stages.map((stage) => {
          const picture = stageMaps.find((entry) => entry.sequence === stage.sequence);
          return (
            <div className="map-print-stage" key={`${stage.sequence}-${stage.title}`}>
              <h3>
                Stage {stage.sequence} — {stage.title}
              </h3>
              <p className="map-print-when">{stage.when}</p>
              <ul>
                {stage.detail.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
                {stage.revealed.length > 0 ? <li>First seen here: {stage.revealed.join(", ")}</li> : null}
              </ul>
              {picture ? (
                <div className="map-print-map">
                  <MapSvg stage={picture} />
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      <section>
        <h2>Access held</h2>
        {report.access.length === 0 ? (
          <p>No asset was accessed.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Address</th>
                <th>Level</th>
                <th>Access</th>
                <th>Won at</th>
              </tr>
            </thead>
            <tbody>
              {report.access.map((row) => (
                <tr key={row.assetId}>
                  <td>{row.name}</td>
                  <td>{row.address || "—"}</td>
                  <td>{row.zone}</td>
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
        <h2>Purdue levels</h2>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Assets</th>
              <th>SL-T</th>
              <th>Signal</th>
              <th>Accessed</th>
            </tr>
          </thead>
          <tbody>
            {report.zones.map((zone) => (
              <tr key={zone.zone}>
                <td>{zone.name}</td>
                <td>{zone.assets}</td>
                <td>{zone.target}</td>
                {/* An unmodelled level says so rather than printing a signal of 0, which would read
                    as a measurement rather than as the absence of one. */}
                <td>{zone.modelled ? `${zone.achieved} / ${MAX_SL}` : "not modelled"}</td>
                <td>{zone.accessed.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Level crossings</h2>
        {report.crossings.length === 0 ? (
          <p>No connection crosses a Purdue level.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Permit rule</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {report.crossings.map((crossing) => (
                <tr key={`${crossing.from}-${crossing.to}`}>
                  <td>
                    {crossing.from} ({crossing.fromZone})
                  </td>
                  <td>
                    {crossing.to} ({crossing.toZone})
                  </td>
                  <td>{crossing.firewallRule}</td>
                  <td>{crossing.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Findings</h2>
        {report.findings.length === 0 ? (
          <p>No rule fired.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Finding</th>
                <th>What to do</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding) => (
                <tr key={finding.id}>
                  <td>{finding.severity}</td>
                  <td>{finding.title}</td>
                  <td>{finding.remediation}</td>
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
              <th>Collected from</th>
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
                <td>{entry.assetCount}</td>
                <td>{entry.vantage}</td>
                <td>{entry.when}</td>
                <td>{entry.timeSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Every claim in this document traces to a named import or a recorded action.</p>
      </section>
    </article>
  );
}

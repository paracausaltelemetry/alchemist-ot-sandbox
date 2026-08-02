import { useMemo } from "react";
import { getAssetType, getZone, standardReferences } from "../data/catalog";
import { cafPrinciple } from "../data/caf";
import type { CafStatus, OtProject, ReachabilityResult, SecurityAssessment } from "../models/types";
import { assessSecurityLevels } from "../engine/securityLevels";
import { assessRisk } from "../engine/risk";
import { assessCaf } from "../engine/caf";
import { analyzeAttackPath, suggestEntry, suggestTarget } from "../engine/attackPath";

interface PrintableReportProps {
  project: OtProject;
  assessment: SecurityAssessment;
  reachability: ReachabilityResult;
}

const CAF_STATUS_LABEL: Record<CafStatus, string> = {
  achieved: "Achieved",
  partial: "Partially",
  "not-achieved": "Not Achieved",
  "not-assessed": "Not Assessed"
};

export function PrintableReport({ project, assessment, reachability }: PrintableReportProps) {
  const assetName = (id: string) => project.assets.find((asset) => asset.id === id)?.name ?? id;
  const engagement = project.engagement;
  // This document stays mounted and hidden so Ctrl+P works without a round trip through state.
  // That is only affordable if it does no work: unmemoised, these four engines re-ran on every
  // render of the workbench, including every selection click, alongside the analysis panel's copy.
  const securityLevels = useMemo(() => assessSecurityLevels(project, project.zoneTargets), [project]);
  const risk = useMemo(() => assessRisk(project), [project]);
  const caf = useMemo(() => assessCaf(project, assessment, securityLevels, risk), [project, assessment, securityLevels, risk]);
  const attackEntry = useMemo(() => suggestEntry(project), [project]);
  const attackTarget = useMemo(() => suggestTarget(project, attackEntry), [project, attackEntry]);
  const attackPath = useMemo(
    () => analyzeAttackPath(project, attackEntry, attackTarget, assessment.findings),
    [project, attackEntry, attackTarget, assessment.findings]
  );
  const limitingFr = (frIds: string[]) => (frIds.length > 0 ? frIds.join(", ") : "None");

  return (
    <article className="print-document">
      <header>
        <p>Alchemist OT Sandbox</p>
        <h1>{project.name}</h1>
        <strong>Advisory score: {assessment.overallScore}/100</strong>
        <span>Generated {new Date(project.updatedAt).toLocaleString()}</span>
      </header>

      {engagement ? (
        <section>
          <h2>Governance &amp; Scope</h2>
          <table>
            <tbody>
              <tr>
                <th>Organisation</th>
                <td>{engagement.organisation || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Sector</th>
                <td>{engagement.sector || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Regulatory regime</th>
                <td>{engagement.regime || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Assessor</th>
                <td>{engagement.assessor || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Assessment date</th>
                <td>{engagement.assessmentDate || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Scope</th>
                <td>{engagement.scope || "Not recorded"}</td>
              </tr>
              <tr>
                <th>Limitations</th>
                <td>{engagement.limitations || "Not recorded"}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <section>
        <h2>Executive Summary</h2>
        <p>
          This browser-local assessment reviews the declared OT topology, Purdue zones, conduits, and controls. It is an architectural advisory score
          and is not certification against ISA/IEC 62443 or any other standard.
        </p>
        <div className="print-metrics">
          <span>{project.assets.length} assets</span>
          <span>{project.conduits.length} conduits</span>
          <span>{assessment.findings.length} findings</span>
          <span>{assessment.band} posture</span>
        </div>
      </section>

      <section>
        <h2>Reachability Query</h2>
        <p>
          {assetName(reachability.sourceId)} to {assetName(reachability.targetId)}:{" "}
          <strong>{reachability.reachable ? "reachable" : "blocked"}</strong>
        </p>
        <p>{reachability.explanation}</p>
        {reachability.pathAssetIds.length > 0 ? <p>Path: {reachability.pathAssetIds.map(assetName).join(" -> ")}</p> : null}
      </section>

      <section>
        <h2>Attack Path</h2>
        <p>
          {assetName(attackPath.entryId)} to {assetName(attackPath.targetId)}:{" "}
          <strong>{attackPath.reachable ? "path found" : "no path"}</strong>. Consequence {attackPath.consequence.value}/5.
        </p>
        <p>{attackPath.explanation}</p>
        {attackPath.reachable ? <p>Chain: {attackPath.hops.map((hop) => hop.name).join(" -> ")}</p> : null}
        {attackPath.tactics.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Tactic</th>
                <th>ATT&amp;CK for ICS techniques</th>
              </tr>
            </thead>
            <tbody>
              {attackPath.tactics.map((tactic) => (
                <tr key={tactic.id}>
                  <td>{tactic.name}</td>
                  <td>{tactic.techniques.map((technique) => `${technique.id} ${technique.name}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {attackPath.breakers.length > 0 ? (
          <>
            <p>
              <strong>Controls that break the chain</strong>
            </p>
            <ul>
              {attackPath.breakers.map((breaker, index) => (
                <li key={index}>{breaker}</li>
              ))}
            </ul>
          </>
        ) : null}
        {attackPath.protectedAssets.length > 0 ? (
          <p>Protected (unreachable from the entry): {attackPath.protectedAssets.join(", ")}.</p>
        ) : null}
      </section>

      <section>
        <h2>Rating Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Score</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {assessment.categoryScores.map((category) => (
              <tr key={category.category}>
                <td>{category.label}</td>
                <td>{category.score}</td>
                <td>{category.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>IEC 62443 architecture signals</h2>
        <p>
          Target (SL-T) versus an architecture-derived FR signal per zone. This is not a formal SL-A; confirm applicable
          62443-3-3 requirements, enhancements and evidence before claiming an achieved Security Level.
        </p>
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th>SL-T</th>
              <th>Model signal</th>
              <th>Gap</th>
              <th>Limiting FR</th>
            </tr>
          </thead>
          <tbody>
            {securityLevels.zones.map((zoneSL) => (
              <tr key={zoneSL.zone}>
                <td>{getZone(zoneSL.zone).levelLabel}</td>
                <td>{zoneSL.target}</td>
                <td>{zoneSL.achieved}</td>
                <td>{Math.max(0, zoneSL.target - zoneSL.achieved)}</td>
                <td>{limitingFr(zoneSL.limiting)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>NCSC CAF evidence mapping</h2>
        <p>
          CAF evidence signal across assessed principles: <strong>{caf.postureScore}%</strong>. Governance and people outcomes
          are marked Not Assessed and require assessor attestation. This is not organisational readiness or a formal CAF
          return.
        </p>
        <table>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Principle</th>
              <th>Status</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {caf.principles.map((principle) => (
              <tr key={principle.id}>
                <td>{principle.id}</td>
                <td>{cafPrinciple(principle.id).title}</td>
                <td>{CAF_STATUS_LABEL[principle.status]}</td>
                <td>{principle.gap || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Risk Register &amp; Treatment</h2>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Cons.</th>
              <th>Like.</th>
              <th>Score</th>
              <th>Band</th>
              <th>Treatment</th>
              <th>Owner</th>
              <th>Target</th>
              <th>Residual</th>
            </tr>
          </thead>
          <tbody>
            {risk.assets.slice(0, 20).map((item) => {
              const treatment = project.riskTreatments?.[item.assetId];
              return (
                <tr key={item.assetId}>
                  <td>{assetName(item.assetId)}</td>
                  <td>{item.consequence}</td>
                  <td>{item.likelihood}</td>
                  <td>{item.score}</td>
                  <td>{item.band}</td>
                  <td>{treatment?.decision ?? "–"}</td>
                  <td>{treatment?.owner || "–"}</td>
                  <td>{treatment?.targetDate || "–"}</td>
                  <td>{treatment?.residual ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Top Remediation Actions</h2>
        {assessment.findings.slice(0, 10).map((finding) => (
          <div className="print-finding" key={finding.id}>
            <strong>
              {finding.severity.toUpperCase()} - {finding.title}
            </strong>
            <p>{finding.detail}</p>
            <p>{finding.remediation}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Asset Inventory</h2>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Zone</th>
              <th>Criticality</th>
              <th>Protocols</th>
            </tr>
          </thead>
          <tbody>
            {project.assets.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{getAssetType(asset.type).label}</td>
                <td>{getZone(asset.zone).levelLabel}</td>
                <td>{asset.criticality}</td>
                <td>{asset.protocols.join(", ") || "Not documented"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Assumptions and References</h2>
        <ul>
          {project.assumptions.map((assumption) => (
            <li key={assumption.id}>{assumption.label}</li>
          ))}
          {Object.values(standardReferences).map((reference) => (
            <li key={reference}>{reference}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}

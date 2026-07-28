import { Globe, Network, ServerCrash, Split } from "lucide-react";
import type { ItAnalysis, ItSeverity } from "../engine/itAnalysis";

interface ItFindingsPanelProps {
  analysis: ItAnalysis;
}

const SEVERITY_LABEL: Record<ItSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

function Tallies({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="it-inv-group">
      <h4>{title}</h4>
      <ul>
        {rows.slice(0, 8).map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <b>{row.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ItFindingsPanel({ analysis }: ItFindingsPanelProps) {
  const highCount = analysis.riskyServices.filter((service) => service.severity === "high").length;

  return (
    <div className="it-findings">
      <div className="it-stat-row">
        <div className="it-stat"><b>{analysis.totalHosts}</b><span>Hosts</span></div>
        <div className="it-stat"><b>{analysis.totalOpenPorts}</b><span>Open ports</span></div>
        <div className="it-stat"><b>{analysis.subnets.length}</b><span>Subnets</span></div>
        <div className="it-stat" data-alert={highCount > 0 ? "true" : undefined}><b>{highCount}</b><span>High risk</span></div>
      </div>

      {analysis.flatNetwork ? (
        <div className="it-warn">
          <Split size={15} aria-hidden="true" />
          <p>Flat network: all {analysis.totalHosts} hosts sit in a single subnet ({analysis.largestSubnet?.cidr}). No segmentation was observed, so one compromised host can reach everything.</p>
        </div>
      ) : null}

      <section className="it-section" aria-labelledby="it-risky-title">
        <h3 id="it-risky-title"><ServerCrash size={15} aria-hidden="true" /> Risky exposed services</h3>
        {analysis.riskyServices.length === 0 ? (
          <p className="it-empty">No high-risk services flagged.</p>
        ) : (
          <ul className="it-risk-list">
            {analysis.riskyServices.slice(0, 40).map((service, index) => (
              <li key={`${service.ip}-${service.port}-${index}`} data-severity={service.severity}>
                <span className="it-sev">{SEVERITY_LABEL[service.severity]}</span>
                <span className="it-risk-host">
                  <b>{service.ip}</b>
                  {service.hostname ? <em>{service.hostname}</em> : null}
                </span>
                <span className="it-risk-port">{service.port}/{service.transport ?? "tcp"} {service.service}</span>
                <span className="it-risk-reason">{service.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="it-section" aria-labelledby="it-exposed-title">
        <h3 id="it-exposed-title"><Globe size={15} aria-hidden="true" /> Internet-facing hosts</h3>
        {analysis.internetFacing.length === 0 ? (
          <p className="it-empty">No hosts on public addresses.</p>
        ) : (
          <ul className="it-exposed-list">
            {analysis.internetFacing.map((host) => (
              <li key={host.ip}>
                <b>{host.ip}</b>
                {host.hostname ? <em>{host.hostname}</em> : null}
                <span>{host.openPorts} open</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="it-section" aria-labelledby="it-inv-title">
        <h3 id="it-inv-title"><Network size={15} aria-hidden="true" /> Inventory</h3>
        <div className="it-inventory">
          <Tallies title="By subnet" rows={analysis.subnets.map((subnet) => ({ label: subnet.cidr, count: subnet.hostCount }))} />
          <Tallies title="By device type" rows={analysis.byAssetType} />
          <Tallies title="By OS" rows={analysis.byOs} />
          <Tallies title="By vendor" rows={analysis.byVendor} />
        </div>
      </section>
    </div>
  );
}

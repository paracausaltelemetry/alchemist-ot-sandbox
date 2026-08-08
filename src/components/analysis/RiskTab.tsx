import { RISK_SCALE, riskBand, type RiskAssessment } from "../../engine/risk";
import type { OtProject, RiskTreatment, RiskTreatmentDecision } from "../../models/types";

const TREATMENT_LABEL: Record<RiskTreatmentDecision, string> = {
  mitigate: "Mitigate",
  accept: "Accept",
  transfer: "Transfer",
  avoid: "Avoid"
};

interface RiskTabProps {
  project: OtProject;
  risk: RiskAssessment;
  onRiskTreatmentChange: (assetId: string, patch: Partial<RiskTreatment>) => void;
}

export function RiskTab({ project, risk, onRiskTreatmentChange }: RiskTabProps) {
  const assetName = (id: string) => project.assets.find((asset) => asset.id === id)?.name ?? id;

  return (
    <div className="analysis-content risk-view">
      <div className="risk-heatmap">
        <div className="risk-grid">
          {Array.from({ length: RISK_SCALE * RISK_SCALE }, (_, index) => {
            const consequence = RISK_SCALE - Math.floor(index / RISK_SCALE);
            const likelihood = (index % RISK_SCALE) + 1;
            const count = risk.matrix[consequence - 1][likelihood - 1];
            const band = riskBand(consequence * likelihood);
            return (
              <div
                className={`risk-cell risk-cell-${band}`}
                key={index}
                title={`Consequence ${consequence} × Likelihood ${likelihood} = ${consequence * likelihood} (${band})`}
              >
                {count > 0 ? count : ""}
              </div>
            );
          })}
        </div>
        <p className="muted risk-axes">Rows: consequence (top = severe) · Columns: likelihood (right = likely)</p>
      </div>
      <div className="risk-register">
        <h3>Risk register &amp; treatment</h3>
        <table className="risk-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th title="Consequence">C</th>
              <th title="Likelihood">L</th>
              <th>Score</th>
              <th>Band</th>
              <th>Treatment</th>
              <th>Owner</th>
              <th>Target</th>
              <th title="Residual score after treatment">Resid.</th>
            </tr>
          </thead>
          <tbody>
            {risk.assets.slice(0, 12).map((item) => {
              const treatment = project.riskTreatments?.[item.assetId];
              return (
                <tr key={item.assetId}>
                  <th>{assetName(item.assetId)}</th>
                  {/* Marked when a person set it, so the register does not present a judgement and
                      a lookup as the same kind of number. */}
                  <td
                    title={
                      item.consequenceSource === "assessor"
                        ? "Set by the assessor"
                        : "Derived from the asset's class and criticality"
                    }
                  >
                    {item.consequence}
                    {item.consequenceSource === "assessor" ? <abbr className="risk-assessor-set"> set</abbr> : null}
                  </td>
                  <td title={item.reason}>{item.likelihood}</td>
                  <td>{item.score}</td>
                  <td>
                    <span className={`risk-band-chip risk-chip-${item.band}`}>{item.band}</span>
                  </td>
                  <td>
                    <select
                      className="treatment-select"
                      aria-label={`Treatment for ${assetName(item.assetId)}`}
                      value={treatment?.decision ?? ""}
                      onChange={(event) => {
                        if (event.target.value) {
                          onRiskTreatmentChange(item.assetId, { decision: event.target.value as RiskTreatmentDecision });
                        }
                      }}
                    >
                      <option value="" disabled>
                        Set…
                      </option>
                      {(Object.keys(TREATMENT_LABEL) as RiskTreatmentDecision[]).map((decision) => (
                        <option key={decision} value={decision}>
                          {TREATMENT_LABEL[decision]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="treatment-input"
                      aria-label={`Risk owner for ${assetName(item.assetId)}`}
                      value={treatment?.owner ?? ""}
                      placeholder="Owner"
                      onChange={(event) => onRiskTreatmentChange(item.assetId, { owner: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="treatment-input"
                      type="date"
                      aria-label={`Target date for ${assetName(item.assetId)}`}
                      value={treatment?.targetDate ?? ""}
                      onChange={(event) => onRiskTreatmentChange(item.assetId, { targetDate: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="treatment-input treatment-residual"
                      type="number"
                      min={1}
                      max={25}
                      aria-label={`Residual score for ${assetName(item.assetId)}`}
                      value={treatment?.residual ?? ""}
                      onChange={(event) =>
                        onRiskTreatmentChange(item.assetId, {
                          residual: event.target.value === "" ? undefined : Number(event.target.value)
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Printer } from "lucide-react";
import { getAssetType } from "../../data/catalog";
import type { OtProject, SecurityAssessment } from "../../models/types";

interface ReportTabProps {
  project: OtProject;
  assessment: SecurityAssessment;
  onPrintReport: () => void;
}

export function ReportTab({ project, assessment, onPrintReport }: ReportTabProps) {
  return (
    <div className="analysis-content report-preview">
      <div>
        <h3>Report preview</h3>
        <p>
          Includes the current advisory score, assumptions, top risks, reachability query, and remediation roadmap. Use the browser print dialog to
          save as PDF.
        </p>
      </div>
      <button type="button" className="text-button primary" onClick={onPrintReport}>
        <Printer size={16} />
        Print / save PDF
      </button>
      <div className="report-summary-grid">
        <span>
          <strong>{project.assets.length}</strong>
          Assets
        </span>
        <span>
          <strong>{project.conduits.length}</strong>
          Conduits
        </span>
        <span>
          <strong>{assessment.findings.length}</strong>
          Findings
        </span>
        <span>
          <strong>{project.assets.filter((asset) => getAssetType(asset.type).defaultZone === "level1").length}</strong>
          Controller types
        </span>
      </div>
    </div>
  );
}

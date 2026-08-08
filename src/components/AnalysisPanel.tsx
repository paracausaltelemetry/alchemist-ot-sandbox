import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CafPrincipleId,
  CafStatus,
  CanvasMode,
  Finding,
  OtProject,
  ReachabilityResult,
  RiskTreatment,
  SecurityAssessment,
  Severity,
  ZoneId
} from "../models/types";
import { assessSecurityLevels } from "../engine/securityLevels";
import { assessCaf } from "../engine/caf";
import { assessRisk, countHighRisk } from "../engine/risk";
import { analyzeAttackPath, suggestEntry, suggestTarget } from "../engine/attackPath";
import { diffAssessments } from "../engine/baselineDiff";
import { assessProject } from "../engine/scoring";
import { applyRemediations } from "../engine/remediations";
import { clearBaseline, getBaseline, setBaseline } from "../lib/projectStore";
import { TAB_GROUPS, TABS, type TabId } from "./analysis/perspectives";
import { AttackMatrixTab } from "./analysis/AttackMatrixTab";
import { AttackPathTab } from "./analysis/AttackPathTab";
import { BaselineTab } from "./analysis/BaselineTab";
import { ComplianceTab } from "./analysis/ComplianceTab";
import { FindingsTab } from "./analysis/FindingsTab";
import { FlowTableTab } from "./analysis/FlowTableTab";
import { LevelsTab } from "./analysis/LevelsTab";
import { RatingTab } from "./analysis/RatingTab";
import { ReachabilityTab } from "./analysis/ReachabilityTab";
import { ReportTab } from "./analysis/ReportTab";
import { RiskTab } from "./analysis/RiskTab";
import { WhatIfTab } from "./analysis/WhatIfTab";
import { ZoneMatrixTab } from "./analysis/ZoneMatrixTab";

interface AnalysisPanelProps {
  project: OtProject;
  assessment: SecurityAssessment;
  reachability: ReachabilityResult;
  sourceId: string;
  targetId: string;
  canvasMode: CanvasMode;
  activeFindingId: string | null;
  onSourceChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onCanvasModeChange: (mode: CanvasMode) => void;
  onFindingSelect: (finding: Finding) => void;
  onPrintReport: () => void;
  dockHeight: number;
  onDockResize: (height: number) => void;
  dockOpen: boolean;
  onToggleDock: () => void;
  onZoneTargetChange: (zone: ZoneId, target: number) => void;
  onCafOverrideChange: (principle: CafPrincipleId, status: CafStatus | null) => void;
  onRiskTreatmentChange: (assetId: string, patch: Partial<RiskTreatment>) => void;
  onEditGovernance: () => void;
  onApplyProject: (project: OtProject) => void;
}

const DOCK_MIN = 7;
const DOCK_MAX = 42;

export function AnalysisPanel({
  project,
  assessment,
  reachability,
  sourceId,
  targetId,
  canvasMode,
  activeFindingId,
  onSourceChange,
  onTargetChange,
  onCanvasModeChange,
  onFindingSelect,
  onPrintReport,
  dockHeight,
  onDockResize,
  dockOpen,
  onToggleDock,
  onZoneTargetChange,
  onCafOverrideChange,
  onRiskTreatmentChange,
  onEditGovernance,
  onApplyProject
}: AnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("rating");
  const [includeDocs, setIncludeDocs] = useState(false);
  const [severityOn, setSeverityOn] = useState<Record<Severity, boolean>>({
    critical: true,
    high: true,
    medium: true,
    low: true
  });
  const [attackEntryOverride, setAttackEntryOverride] = useState<string | null>(null);
  const [attackTargetOverride, setAttackTargetOverride] = useState<string | null>(null);
  const [baselineProject, setBaselineProject] = useState(() => getBaseline());
  const [activeRemediations, setActiveRemediations] = useState<Set<string>>(() => new Set());

  // Re-read the baseline when the active assessment changes (e.g. switching projects).
  useEffect(() => {
    setBaselineProject(getBaseline());
  }, [project.id]);
  const visibleFindings = assessment.findings.filter(
    (finding) => (includeDocs || finding.category !== "documentation") && severityOn[finding.severity]
  );
  const hiddenFindingCount = assessment.findings.length - visibleFindings.length;
  // Four engines, previously re-run on every render of the workbench — including every selection
  // click — and then a second time by the print document mounted alongside.
  const securityLevels = useMemo(() => assessSecurityLevels(project, project.zoneTargets), [project]);
  const risk = useMemo(() => assessRisk(project), [project]);
  const caf = useMemo(() => assessCaf(project, assessment, securityLevels, risk), [project, assessment, securityLevels, risk]);
  const exposedTechniques = useMemo(
    () => new Set(assessment.findings.flatMap((finding) => finding.techniques ?? [])),
    [assessment.findings]
  );
  const findingById = useMemo(() => new Map(assessment.findings.map((finding) => [finding.id, finding])), [assessment.findings]);
  const assetExists = (id: string | null): id is string => Boolean(id) && project.assets.some((asset) => asset.id === id);
  const attackEntryId = assetExists(attackEntryOverride) ? attackEntryOverride : suggestEntry(project);
  const attackTargetId = assetExists(attackTargetOverride) ? attackTargetOverride : suggestTarget(project, attackEntryId);
  const attackPath = useMemo(
    () => analyzeAttackPath(project, attackEntryId, attackTargetId, assessment.findings),
    [project, attackEntryId, attackTargetId, assessment.findings]
  );

  const captureBaseline = () => {
    setBaseline(project);
    setBaselineProject(getBaseline());
  };
  const dropBaseline = () => {
    clearBaseline();
    setBaselineProject(null);
  };
  const baselineDiff = baselineProject && activeTab === "baseline" ? diffAssessments(baselineProject, project) : null;

  const simulated = activeTab === "whatif" ? applyRemediations(project, activeRemediations) : project;
  const simAssessment = activeTab === "whatif" ? assessProject(simulated) : assessment;
  const simRisk = activeTab === "whatif" ? assessRisk(simulated) : risk;
  const currentHighRisk = countHighRisk(risk);
  const simHighRisk = countHighRisk(simRisk);
  const simScoreDelta = simAssessment.overallScore - assessment.overallScore;
  const toggleRemediation = (id: string) => {
    setActiveRemediations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const applySimulated = () => {
    onApplyProject(simulated);
    setActiveRemediations(new Set());
  };
  const showAttackOnCanvas = () => {
    onSourceChange(attackEntryId);
    onTargetChange(attackTargetId);
    onCanvasModeChange("reachability");
  };
  const resizeState = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeState.current = { startY: event.clientY, startHeight: dockHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (!state) {
      return;
    }
    onDockResize(state.startHeight + (state.startY - event.clientY) / 16);
  };
  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeState.current) {
      resizeState.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onDockResize(dockHeight + 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onDockResize(dockHeight - 1);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = TABS[nextIndex];
    setActiveTab(next.id);
    requestAnimationFrame(() => document.getElementById(`analysis-tab-${next.id}`)?.focus());
  };

  return (
    <section className={`analysis-panel${dockOpen ? "" : " is-collapsed"}`} aria-label="Analysis">
      {dockOpen ? (
        // WAI-ARIA window-splitter: a focusable separator with keyboard resize.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className="dock-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize analysis panel height"
          aria-valuenow={Math.round(dockHeight)}
          aria-valuemin={DOCK_MIN}
          aria-valuemax={DOCK_MAX}
          // WAI-ARIA window-splitter pattern: a focusable separator with
          // keyboard resize (handleResizeKeyDown). The rule treats separator as
          // non-interactive, but a resizable splitter is meant to be focusable.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onKeyDown={handleResizeKeyDown}
        />
      ) : null}
      <div className="dock-tabs-row">
        <button
          type="button"
          className="dock-toggle"
          onClick={onToggleDock}
          aria-expanded={dockOpen}
          title={dockOpen ? "Collapse analysis" : "Expand analysis"}
        >
          {dockOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
        </button>
        {/* ARIA tablist roving-tabindex pattern: the container handles arrow-key
            navigation; the individual tabs carry tabIndex. */}
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
        <div className="tabs" role="tablist" aria-label="Analysis views" onKeyDown={handleTabKeyDown}>
          {TAB_GROUPS.map((group) => (
            <div className="tab-group" key={group.label}>
              <span className="tab-group-label" aria-hidden="true">
                {group.label}
              </span>
              {group.tabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`analysis-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="analysis-tabpanel"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (!dockOpen) {
                      onToggleDock();
                    }
                  }}
                >
                  <tab.Icon size={16} aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {dockOpen ? (
        <div
          className="analysis-panel-body"
          role="tabpanel"
          id="analysis-tabpanel"
          aria-labelledby={`analysis-tab-${activeTab}`}
          // WAI-ARIA recommends a focusable tabpanel (tabIndex 0) so keyboard
          // users can reach scrollable panel content.
           
          tabIndex={0}
        >
          {activeTab === "reachability" ? (
            <ReachabilityTab
              project={project}
              reachability={reachability}
              sourceId={sourceId}
              targetId={targetId}
              canvasMode={canvasMode}
              onSourceChange={onSourceChange}
              onTargetChange={onTargetChange}
              onCanvasModeChange={onCanvasModeChange}
            />
          ) : null}

          {activeTab === "attackpath" ? (
            <AttackPathTab
              project={project}
              attackPath={attackPath}
              attackEntryId={attackEntryId}
              attackTargetId={attackTargetId}
              onEntryChange={setAttackEntryOverride}
              onTargetChange={setAttackTargetOverride}
              onShowOnCanvas={showAttackOnCanvas}
            />
          ) : null}

          {activeTab === "baseline" ? (
            <BaselineTab baselineDiff={baselineDiff} onCaptureBaseline={captureBaseline} onClearBaseline={dropBaseline} />
          ) : null}

          {activeTab === "whatif" ? (
            <WhatIfTab
              nowScore={assessment.overallScore}
              simScore={simAssessment.overallScore}
              simScoreDelta={simScoreDelta}
              currentHighRisk={currentHighRisk}
              simHighRisk={simHighRisk}
              activeRemediations={activeRemediations}
              onToggleRemediation={toggleRemediation}
              onApply={applySimulated}
              onReset={() => setActiveRemediations(new Set())}
            />
          ) : null}

          {activeTab === "rating" ? <RatingTab assessment={assessment} onFindingSelect={onFindingSelect} /> : null}

          {activeTab === "levels" ? (
            <LevelsTab securityLevels={securityLevels} onZoneTargetChange={onZoneTargetChange} />
          ) : null}

          {activeTab === "findings" ? (
            <FindingsTab
              assessment={assessment}
              visibleFindings={visibleFindings}
              hiddenFindingCount={hiddenFindingCount}
              severityOn={severityOn}
              onToggleSeverity={(sev) => setSeverityOn((current) => ({ ...current, [sev]: !current[sev] }))}
              includeDocs={includeDocs}
              onIncludeDocsChange={setIncludeDocs}
              activeFindingId={activeFindingId}
              onFindingSelect={onFindingSelect}
            />
          ) : null}

          {activeTab === "compliance" ? (
            <ComplianceTab
              caf={caf}
              findingById={findingById}
              onFindingSelect={onFindingSelect}
              onCafOverrideChange={onCafOverrideChange}
              onEditGovernance={onEditGovernance}
            />
          ) : null}

          {activeTab === "attack" ? <AttackMatrixTab exposedTechniques={exposedTechniques} /> : null}

          {activeTab === "risk" ? (
            <RiskTab project={project} risk={risk} onRiskTreatmentChange={onRiskTreatmentChange} />
          ) : null}

          {activeTab === "flows" ? <FlowTableTab project={project} /> : null}

          {activeTab === "matrix" ? <ZoneMatrixTab project={project} /> : null}

          {activeTab === "report" ? (
            <ReportTab project={project} assessment={assessment} onPrintReport={onPrintReport} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

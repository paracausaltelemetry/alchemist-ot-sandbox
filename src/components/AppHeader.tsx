import { ArrowLeft, BookOpen, Download, Files, FolderOpen, ImageDown, LayoutGrid, Printer, Radar, Redo2, RotateCcw, ScrollText, Share2, Upload, Undo2 } from "lucide-react";
import { useRef } from "react";
import type { OtProject, SecurityAssessment } from "../models/types";
import type { SavedProjectMeta } from "../lib/projectStore";
import { Menu } from "./Menu";
import { ScoreGauge } from "./ScoreGauge";

interface AppHeaderProps {
  project: OtProject;
  score: number;
  band: SecurityAssessment["band"];
  canUndo: boolean;
  canRedo: boolean;
  onProjectNameChange: (name: string) => void;
  onGoHome: () => void;
  savedProjects: SavedProjectMeta[];
  currentProjectId: string;
  onSwitchProject: (id: string) => void;
  onImport: (file: File) => void;
  onImportScan: () => void;
  onExportJson: () => void;
  onExportSvg: () => void;
  onCopyShareLink: () => void;
  onPrintReport: () => void;
  onBrowseScenarios: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenMethodology: () => void;
  onNewBlank: () => void;
  onUndo: () => void;
  onRedo: () => void;
}


export function AppHeader({
  project,
  score,
  band,
  canUndo,
  canRedo,
  onProjectNameChange,
  onGoHome,
  savedProjects,
  currentProjectId,
  onSwitchProject,
  onImport,
  onImportScan,
  onExportJson,
  onExportSvg,
  onCopyShareLink,
  onPrintReport,
  onBrowseScenarios,
  onOpenKnowledgeBase,
  onOpenMethodology,
  onNewBlank,
  onUndo,
  onRedo
}: AppHeaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="app-header">
      {/* The masthead above carries the brand, so this row starts where the IT row does: a way
          back to the dashboard, then what this app is. */}
      <div className="app-header-title">
        <button type="button" className="text-button" onClick={onGoHome} title="Back to the dashboard">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div>
          <strong>OT Sandbox</strong>
          <span>Model the architecture and assess it against the standards</span>
        </div>
      </div>

      <div className="project-controls">
        <label className="project-name-field">
          <span>Project</span>
          <input value={project.name} onChange={(event) => onProjectNameChange(event.target.value)} />
        </label>

        {savedProjects.length > 1 ? (
          <Menu
            label="Switch"
            align="left"
            icon={<FolderOpen size={15} />}
            title="Switch saved assessment"
            items={savedProjects.map((meta) => ({
              label: meta.name,
              onSelect: () => onSwitchProject(meta.id),
              disabled: meta.id === currentProjectId,
              current: meta.id === currentProjectId
            }))}
          />
        ) : null}

        <div
          className="header-score"
          title={
            band === "insufficient"
              ? "Not enough model to rate — add at least two assets and one conduit"
              : `Advisory security rating ${score} / 100`
          }
        >
          <ScoreGauge score={score} band={band} size={40} thickness={9} />
        </div>
      </div>

      {/*
        No view switch and no theme toggle here: both live in the site masthead above, which is
        identical across the OT and IT apps. They used to sit in this row, so the control whose
        whole job is moving between the two apps moved itself every time you used it.
      */}
      <nav className="toolbar" aria-label="Project actions">
        <button type="button" className="icon-button" title="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={18} />
        </button>
        <button type="button" className="icon-button" title="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={18} />
        </button>
        <button type="button" className="text-button" onClick={onBrowseScenarios} title="Browse sector scenarios">
          <LayoutGrid size={16} />
          Scenarios
        </button>
        <button type="button" className="text-button" onClick={onOpenKnowledgeBase} title="OT knowledge base & reference">
          <BookOpen size={16} />
          Reference
        </button>
        <button type="button" className="text-button" onClick={onOpenMethodology} title="How Alchemist scores and assesses">
          <ScrollText size={16} />
          Method
        </button>
        <Menu
          label="File"
          title="New, import, export and share"
          icon={<Files size={16} />}
          items={[
            { label: "New blank project", icon: <RotateCcw size={15} />, onSelect: onNewBlank },
            { label: "Import project JSON", icon: <Upload size={15} />, onSelect: () => inputRef.current?.click() },
            { label: "Import a scan", icon: <Radar size={15} />, onSelect: onImportScan },
            { label: "Export project JSON", icon: <Download size={15} />, onSelect: onExportJson },
            { label: "Export topology SVG", icon: <ImageDown size={15} />, onSelect: onExportSvg },
            { label: "Copy share link", icon: <Share2 size={15} />, onSelect: onCopyShareLink }
          ]}
        />
        <button type="button" className="text-button primary" onClick={onPrintReport}>
          <Printer size={16} />
          Report
        </button>
      </nav>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        aria-label="Import project JSON file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onImport(file);
            event.target.value = "";
          }
        }}
      />
    </header>
  );
}

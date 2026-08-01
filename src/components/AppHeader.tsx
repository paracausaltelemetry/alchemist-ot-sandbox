import { BookOpen, Download, Files, FolderOpen, ImageDown, LayoutGrid, Moon, Printer, Radar, Redo2, RotateCcw, ScrollText, Share2, Sun, Upload, Undo2 } from "lucide-react";
import { useRef } from "react";
import type { OtProject, SecurityAssessment } from "../models/types";
import type { SavedProjectMeta } from "../lib/projectStore";
import { BrandMark } from "./BrandMark";
import { Menu } from "./Menu";
import { ScoreGauge } from "./ScoreGauge";
import { ViewSwitch } from "./ViewSwitch";
import type { AppView } from "../lib/appView";

interface AppHeaderProps {
  project: OtProject;
  score: number;
  band: SecurityAssessment["band"];
  theme: "dark" | "light";
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
  onToggleTheme: () => void;
  onSwitchView: (view: AppView) => void;
}


export function AppHeader({
  project,
  score,
  band,
  theme,
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
  onRedo,
  onToggleTheme,
  onSwitchView
}: AppHeaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="app-header">
      <button
        type="button"
        className="brand-block"
        onClick={onGoHome}
        title="Back to the dashboard"
        aria-label="Alchemist, back to the dashboard"
      >
        <BrandMark />
        <div>
          <p className="brand-wordmark">Welbourne Security</p>
          <h1 className="brand-subtitle">Alchemist OT Sandbox</h1>
        </div>
      </button>

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

      <nav className="toolbar" aria-label="Project actions">
        <ViewSwitch current="app" onSwitch={onSwitchView} />
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
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle light and dark mode"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
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

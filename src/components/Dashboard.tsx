import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Copy,
  FilePlus2,
  Flame,
  Layers,
  LayoutGrid,
  Pencil,
  Scale,
  ScrollText,
  Trash2,
  Waypoints,
  X
} from "lucide-react";
import { SiteMasthead } from "./SiteMasthead";
import { VerdictBanner } from "./VerdictBanner";
import { initHeroDither } from "../lib/heroDither";
import { assessProject } from "../engine/scoring";
import { assessSecurityLevels } from "../engine/securityLevels";
import { assessRisk, countHighRisk } from "../engine/risk";
import { assessCaf } from "../engine/caf";
import { analyzeAttackPath, suggestEntry, suggestTarget } from "../engine/attackPath";
import { loadStoredProject } from "../lib/projectStorage";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getCurrentProjectId,
  listProjects,
  openProject,
  renameProject
} from "../lib/projectStore";
import { blankProject } from "../data/sampleProject";
import { scenarios } from "../data/scenarios";
import type { OtProject } from "../models/types";
import type { AppView } from "../lib/appView";

export type DashboardIntent = "reference" | "methodology" | "tour";

interface DashboardProps {
  onEnter: (intent?: DashboardIntent) => void;
  /** Opens the IT-side network mapper (a separate view). */
  onOpenIt?: () => void;
  /** Drives the masthead's OT/IT switch. Neither side is current while on the dashboard. */
  onSwitchView?: (view: AppView) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /** On phone/tablet the workbench is unavailable; the dashboard renders a hero-only gate. */
  isMobile?: boolean;
}

/**
 * The home view and front door: a read-only posture overview of the current stored project, reusing
 * the assessment engines and the VerdictBanner hero, with a scenario picker and entry CTAs into the
 * workbench. Loading a scenario writes it to storage; the workbench reads the same slot on entry.
 */
export function Dashboard({ onEnter, onOpenIt, onSwitchView, theme, onToggleTheme, isMobile = false }: DashboardProps) {
  const [project, setProject] = useState<OtProject>(() => loadStoredProject());
  const [projects, setProjects] = useState(() => listProjects());
  const [currentId, setCurrentId] = useState(() => getCurrentProjectId());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const assessment = assessProject(project);
  const securityLevels = assessSecurityLevels(project, project.zoneTargets);
  const risk = assessRisk(project, assessment.findings);
  const caf = assessCaf(project, assessment, securityLevels, risk);
  const entryId = suggestEntry(project);
  const attackPath = analyzeAttackPath(project, entryId, suggestTarget(project, entryId), assessment.findings);

  const assetName = (id: string) => project.assets.find((asset) => asset.id === id)?.name ?? id;
  const slGaps = securityLevels.zones.filter((zone) => zone.achieved < zone.target).length;
  const highRisk = countHighRisk(risk);

  const refresh = () => {
    setProjects(listProjects());
    setProject(loadStoredProject());
    setCurrentId(getCurrentProjectId());
  };

  const load = (next: OtProject) => {
    createProject(next);
    onEnter();
  };

  const selectProject = (id: string) => {
    openProject(id);
    refresh();
  };

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setDraftName(name);
  };

  const cancelRename = () => setRenamingId(null);

  const commitRename = () => {
    if (renamingId) {
      renameProject(renamingId, draftName);
    }
    setRenamingId(null);
    refresh();
  };

  const duplicate = (id: string) => {
    duplicateProject(id);
    refresh();
  };

  const remove = (id: string) => {
    deleteProject(id);
    refresh();
  };

  // Start the shared WebGL dither field behind the hero (matches the main site).
  useEffect(() => {
    initHeroDither();
  }, []);

  return (
    <div className="dashboard site-frame">
      <SiteMasthead
        theme={theme}
        onToggleTheme={onToggleTheme}
        isMobile={isMobile}
        view="home"
        onSwitchView={onSwitchView}
      />

      <section className="page-hero hero-cta">
        <div className="hero-card">
          <canvas className="hero-dither" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow">OT and IT network sandbox</p>
            <h1>Model, assess and harden network architecture.</h1>
            <p className="page-hero-lede">
              Build Purdue-zoned OT topologies and map architecture signals to IEC 62443 and the NCSC CAF, or upload an
              Nmap scan and see the IT network it describes. Entirely in the browser.
            </p>
            <div className="dashboard-cta">
              <button type="button" className="text-button primary" onClick={() => onEnter()}>
                {isMobile ? "Open assessment" : "Open workbench"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button type="button" className="text-button" onClick={() => load(blankProject)}>
                <FilePlus2 size={15} aria-hidden="true" />
                New blank
              </button>
              {onOpenIt ? (
                <button type="button" className="text-button" onClick={onOpenIt}>
                  <Waypoints size={15} aria-hidden="true" />
                  IT network mapper
                </button>
              ) : null}
            </div>
            {isMobile ? (
              <p className="mobile-gate-note">Topology editing is desktop-only; the assessment and report are available here.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <p className="dashboard-eyebrow">Current assessment</p>
          <h2>{project.name}</h2>
          <VerdictBanner assessment={assessment} />
        </div>
        <aside className="dashboard-stats" aria-label="Model size">
          <div className="dash-stat">
            <span>Assets</span>
            <strong>{project.assets.length}</strong>
          </div>
          <div className="dash-stat">
            <span>Conduits</span>
            <strong>{project.conduits.length}</strong>
          </div>
          <div className="dash-stat">
            <span>Findings</span>
            <strong>{assessment.findings.length}</strong>
          </div>
        </aside>
      </section>

      <section className="dashboard-tiles" aria-label="Posture overview">
        <article className="dash-tile">
          <Layers size={18} aria-hidden="true" />
          <span>IEC 62443 FR signal</span>
          <strong>{slGaps}</strong>
          <small>{slGaps === 1 ? "zone below target" : "zones below target"}</small>
        </article>
        <article className="dash-tile">
          <Scale size={18} aria-hidden="true" />
          <span>CAF evidence signal</span>
          <strong>{caf.postureScore}%</strong>
          <small>assessed principles only</small>
        </article>
        <article className="dash-tile">
          <Flame size={18} aria-hidden="true" />
          <span>High / critical risk</span>
          <strong>{highRisk}</strong>
          <small>{highRisk === 1 ? "asset" : "assets"}</small>
        </article>
        <article className="dash-tile dash-tile-wide">
          <Waypoints size={18} aria-hidden="true" />
          <span>Attack path</span>
          <strong>
            {attackPath.reachable ? `${assetName(attackPath.entryId)} to ${assetName(attackPath.targetId)}` : "Contained"}
          </strong>
          <small>
            {attackPath.reachable
              ? `crown-jewel consequence ${attackPath.consequence.value}/5`
              : "no path to a crown jewel"}
          </small>
        </article>
      </section>

      <section className="dashboard-saved">
        <h2>Saved assessments</h2>
        <div className="saved-list">
          {projects.map((meta) => (
            <div className={`saved-row${meta.id === currentId ? " saved-current" : ""}`} key={meta.id}>
              {renamingId === meta.id ? (
                <input
                  className="saved-rename"
                  value={draftName}
                  ref={(el) => el?.focus()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitRename();
                    } else if (event.key === "Escape") {
                      cancelRename();
                    }
                  }}
                  aria-label="Rename assessment"
                />
              ) : (
                <button type="button" className="saved-select" onClick={() => selectProject(meta.id)} title="Make current">
                  <span className="saved-name">{meta.name}</span>
                  <small>
                    {meta.id === currentId ? "Current · " : ""}updated {new Date(meta.updatedAt).toLocaleDateString()}
                  </small>
                </button>
              )}
              <div className="saved-actions">
                {renamingId === meta.id ? (
                  <>
                    <button type="button" className="icon-button" onClick={commitRename} title="Save name" aria-label="Save name">
                      <Check size={15} />
                    </button>
                    <button type="button" className="icon-button" onClick={cancelRename} title="Cancel" aria-label="Cancel rename">
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => startRename(meta.id, meta.name)}
                      title="Rename"
                      aria-label="Rename"
                    >
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => duplicate(meta.id)} title="Duplicate" aria-label="Duplicate">
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => remove(meta.id)}
                      disabled={projects.length <= 1}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-scenarios">
        <h2>Load a sector scenario</h2>
        <div className="dashboard-scenario-grid">
          {scenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.id}
              className="dashboard-scenario"
              onClick={() => load(scenario.project)}
            >
              <strong>{scenario.sector}</strong>
              <span>{scenario.name}</span>
              <p>{scenario.summary}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-links" aria-label="Learn">
        <button type="button" className="text-button" onClick={() => onEnter("reference")}>
          <BookOpen size={15} aria-hidden="true" />
          Reference library
        </button>
        <button type="button" className="text-button" onClick={() => onEnter("methodology")}>
          <ScrollText size={15} aria-hidden="true" />
          How it assesses
        </button>
        <button type="button" className="text-button" onClick={() => onEnter("tour")}>
          <Compass size={15} aria-hidden="true" />
          Take a tour
        </button>
        <button type="button" className="text-button" onClick={() => onEnter()}>
          <LayoutGrid size={15} aria-hidden="true" />
          Open workbench
        </button>
      </section>

      <footer className="dashboard-footer">
        <span>Browser-local · advisory only · not a substitute for a formal assessment.</span>
        <a href="https://welbournesecurity.com" target="_blank" rel="noopener noreferrer">
          welbournesecurity.com
        </a>
      </footer>
    </div>
  );
}

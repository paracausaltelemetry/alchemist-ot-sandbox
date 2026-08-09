import { useEffect, useMemo } from "react";
import { ArrowRight, Flame, Layers, LayoutGrid, Scale, Waypoints } from "lucide-react";
import { SiteMasthead } from "./SiteMasthead";
import { VerdictBanner } from "./VerdictBanner";
import { initHeroDither } from "../lib/heroDither";
import { assessProject } from "../engine/scoring";
import { assessSecurityLevels } from "../engine/securityLevels";
import { assessRisk, countHighRisk } from "../engine/risk";
import { assessCaf } from "../engine/caf";
import { analyzeAttackPath, suggestEntry, suggestTarget } from "../engine/attackPath";
import { asOtProject, projectMap } from "../engine/mapProjection";
import { loadCyberMap } from "../lib/mapStore";
import { newCyberMap } from "../models/cyberMap";

interface DashboardProps {
  onEnter: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /** On phone/tablet the map is unavailable; the dashboard renders a hero-only gate. */
  isMobile?: boolean;
}

/**
 * The front door: a read-only posture overview of the estate, reusing the assessment engines.
 *
 * Reads the converged document rather than a project store. There used to be a saved-assessment
 * list and a scenario gallery here, both of which managed `OtProject` files — a concept that ended
 * when the estate became one document assembled from imports. What replaced them lives in the
 * workspace: the sources panel is where an estate comes from now.
 */
export function Dashboard({ onEnter, theme, onToggleTheme, isMobile = false }: DashboardProps) {
  // Read once. The dashboard is a read-only view and the workspace owns every mutation, so
  // re-reading storage on each render would be work in service of a change that cannot happen here.
  const project = useMemo(() => {
    const doc = loadCyberMap() ?? newCyberMap("Estate");
    return asOtProject(doc, projectMap(doc));
  }, []);

  // Five engines behind the posture tiles, memoised: unmemoised they re-ran on every render.
  const assessment = useMemo(() => assessProject(project), [project]);
  const securityLevels = useMemo(() => assessSecurityLevels(project, project.zoneTargets), [project]);
  const risk = useMemo(() => assessRisk(project), [project]);
  const caf = useMemo(
    () => assessCaf(project, assessment, securityLevels, risk),
    [project, assessment, securityLevels, risk]
  );
  const entryId = useMemo(() => suggestEntry(project), [project]);
  const attackPath = useMemo(
    () => analyzeAttackPath(project, entryId, suggestTarget(project, entryId), assessment.findings),
    [project, entryId, assessment.findings]
  );

  const assetName = (id: string) => project.assets.find((asset) => asset.id === id)?.name ?? id;
  const slGaps = securityLevels.zones.filter((zone) => zone.modelled && zone.achieved < zone.target).length;
  const highRisk = countHighRisk(risk);
  const empty = project.assets.length === 0;

  // Start the shared WebGL dither field behind the hero (matches the main site).
  useEffect(() => {
    initHeroDither();
  }, []);

  return (
    <div className="dashboard site-frame">
      <SiteMasthead theme={theme} onToggleTheme={onToggleTheme} isMobile={isMobile} />

      <section className="page-hero hero-cta">
        <div className="hero-card">
          <canvas className="hero-dither" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow">Converged cyber asset mapping</p>
            <h1>One map, from the internet edge to Level 0.</h1>
            <p className="page-hero-lede">
              Import scans and inventories, merge them into one asset estate, and read it against IEC 62443 and the
              NCSC CAF — corporate network and process network on the same canvas. Entirely in the browser.
            </p>
            <div className="dashboard-cta">
              <button type="button" className="text-button primary" onClick={onEnter}>
                {empty ? "Start a map" : "Open the map"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            {isMobile ? (
              <p className="mobile-gate-note">
                The canvas is desktop-only; the assessment and report are available here.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {empty ? null : (
        <>
          <section className="dashboard-hero">
            <div className="dashboard-hero-main">
              <p className="dashboard-eyebrow">Current estate</p>
              <h2>{project.name}</h2>
              <VerdictBanner assessment={assessment} />
            </div>
            <aside className="dashboard-stats" aria-label="Estate size">
              <div className="dash-stat">
                <span>Assets</span>
                <strong>{project.assets.length}</strong>
              </div>
              <div className="dash-stat">
                <span>Connections</span>
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
              {/* Modelled levels only. An empty zone satisfies every ladder rung vacuously, and
                  counting it as a gap would be a finding against a part of the estate nobody has
                  described yet. */}
              <small>{slGaps === 1 ? "modelled level below target" : "modelled levels below target"}</small>
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
                {attackPath.reachable
                  ? `${assetName(attackPath.entryId)} to ${assetName(attackPath.targetId)}`
                  : "Contained"}
              </strong>
              <small>
                {attackPath.reachable
                  ? `crown-jewel consequence ${attackPath.consequence.value}/5`
                  : "no path to a crown jewel"}
              </small>
            </article>
          </section>
        </>
      )}

      <section className="dashboard-links" aria-label="Open">
        <button type="button" className="text-button" onClick={onEnter}>
          <LayoutGrid size={15} aria-hidden="true" />
          Open the map
        </button>
      </section>

      <footer className="dashboard-footer">
        <span>Browser-local · advisory only · not a substitute for a formal assessment.</span>
        <a href="https://paracausaltelemetry.com" target="_blank" rel="noopener noreferrer">
          paracausaltelemetry.com
        </a>
      </footer>
    </div>
  );
}

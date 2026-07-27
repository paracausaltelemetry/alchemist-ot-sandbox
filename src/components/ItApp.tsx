import { ArrowLeft, FileUp, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import { assembleTopology } from "../import/assemble";
import { analyseItNetwork, type ItAnalysis } from "../engine/itAnalysis";
import { assessProject } from "../engine/scoring";
import { blankProject } from "../data/sampleProject";
import { layoutTiered } from "../data/canvasLayout";
import { makeId } from "../models/factory";
import type { CanvasMode, OtProject } from "../models/types";
import { SiteMasthead } from "./SiteMasthead";
import { TopologyCanvas } from "./TopologyCanvas";
import { ItFindingsPanel } from "./ItFindingsPanel";

interface ItAppProps {
  onGoHome: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  isMobile: boolean;
}

function buildProject(topology: ReturnType<typeof assembleTopology>): OtProject {
  const positions = layoutTiered(topology.assets, topology.subnets, topology.conduits);
  return {
    ...structuredClone(blankProject),
    id: makeId("project"),
    name: "Imported network",
    assets: topology.assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position })),
    conduits: topology.conduits,
    subnets: topology.subnets,
    updatedAt: new Date().toISOString()
  };
}

/**
 * The IT-side network mapper: upload an Nmap scan, get an interactive network map plus an IT
 * analysis lens (exposed services, internet-facing hosts, segmentation, inventory). Reuses the
 * import parsers, the topology canvas and the OT project model, but drops Purdue zones and the
 * OT scoring panels. Entirely client-side, like the rest of Alchemist.
 */
export function ItApp({ onGoHome, theme, onToggleTheme, isMobile }: ItAppProps) {
  const [project, setProject] = useState<OtProject | null>(null);
  const [analysis, setAnalysis] = useState<ItAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("clean");
  const [fitSignal, setFitSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assessment = useMemo(() => (project ? assessProject(project) : null), [project]);

  const ingest = useCallback((text: string, filename: string) => {
    const format = detectFormat(filename, text);
    if (!format) {
      setError("Could not recognise this file. Export an Nmap scan with -oX, -oN or -oG.");
      return;
    }
    const parsed = parseByFormat(text, format);
    if (parsed.hosts.length === 0) {
      setError(parsed.warnings[0] ?? "No hosts were found in that scan.");
      return;
    }
    const topology = assembleTopology(parsed);
    setProject(buildProject(topology));
    setAnalysis(analyseItNetwork(parsed));
    setSelectedId(null);
    setFitSignal((value) => value + 1);
    setError(null);
  }, []);

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => ingest(String(reader.result ?? ""), file.name);
      reader.onerror = () => setError("Could not read that file.");
      reader.readAsText(file);
    },
    [ingest]
  );

  const clear = useCallback(() => {
    setProject(null);
    setAnalysis(null);
    setSelectedId(null);
    setError(null);
  }, []);

  const commitProject = useCallback((updater: OtProject | ((current: OtProject) => OtProject)) => {
    setProject((current) => (current ? (typeof updater === "function" ? updater(current) : updater) : current));
  }, []);

  const noop = useCallback(() => {}, []);

  return (
    <div className="it-app site-frame">
      <SiteMasthead theme={theme} onToggleTheme={onToggleTheme} isMobile={isMobile} />

      <div className="it-toolbar">
        <button type="button" className="text-button" onClick={onGoHome}>
          <ArrowLeft size={15} aria-hidden="true" /> Dashboard
        </button>
        <div className="it-toolbar-title">
          <strong>IT Network Mapper</strong>
          <span>Upload an Nmap scan to map and assess the network</span>
        </div>
        <div className="it-toolbar-actions">
          {project ? (
            <button type="button" className="text-button" onClick={clear}>
              <Trash2 size={15} aria-hidden="true" /> Clear
            </button>
          ) : null}
          <button type="button" className="text-button primary" onClick={() => inputRef.current?.click()}>
            <FileUp size={15} aria-hidden="true" /> Import Nmap scan
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xml,.txt,.nmap,.gnmap,.grep,text/plain,text/xml"
            hidden
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {error ? <p className="it-error" role="alert">{error}</p> : null}

      {!project || !analysis ? (
        <section className="it-empty-state">
          <h1>Map a network from an Nmap scan</h1>
          <p>
            Scan a network with Nmap, then upload the output here. Alchemist parses the hosts, ports and
            services, lays them out by subnet, and shows an IT view: what is exposed, what is reachable from
            the internet, whether the network is flat, and a plain inventory.
          </p>
          <pre className="it-cmd">nmap -sV -oX scan.xml 10.0.0.0/24</pre>
          <p className="it-note">Nmap XML (-oX), normal (-oN) and greppable (-oG) are all accepted. Everything runs in your browser; the scan never leaves this page.</p>
          <button type="button" className="text-button primary" onClick={() => inputRef.current?.click()}>
            <FileUp size={16} aria-hidden="true" /> Import Nmap scan
          </button>
        </section>
      ) : (
        <div className="it-workspace">
          {isMobile ? (
            <p className="it-mobile-note">The interactive map needs a larger screen. The analysis below still works.</p>
          ) : (
            <div className="it-canvas-wrap">
              {assessment ? (
                <TopologyCanvas
                  project={project}
                  assessment={assessment}
                  selectedId={selectedId}
                  highlightedConduitIds={[]}
                  canvasMode={canvasMode}
                  layoutMode="network"
                  connectMode={false}
                  connectSourceId={null}
                  canUndo={false}
                  canRedo={false}
                  onSelect={setSelectedId}
                  onAssetClick={setSelectedId}
                  onCreateAsset={noop}
                  onCreateConduit={noop}
                  onProjectChange={commitProject}
                  onCanvasModeChange={setCanvasMode}
                  onLayoutModeChange={noop}
                  onManageSubnets={noop}
                  onAutoArrange={noop}
                  fitSignal={fitSignal}
                  onToggleConnectMode={noop}
                  onFindingSelect={noop}
                  onRenameAsset={(id, name) =>
                    commitProject((current) => ({
                      ...current,
                      assets: current.assets.map((asset) => (asset.id === id ? { ...asset, name } : asset))
                    }))
                  }
                  onSelectionChange={noop}
                  onUndo={noop}
                  onRedo={noop}
                />
              ) : null}
            </div>
          )}
          <aside className="it-panel" aria-label="IT network analysis">
            <ItFindingsPanel analysis={analysis} />
          </aside>
        </div>
      )}
    </div>
  );
}

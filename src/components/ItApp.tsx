import { ArrowLeft, Download, FileUp, PlayCircle, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import { assembleTopology } from "../import/assemble";
import type { ImportedHost, ParsedImport } from "../import/types";
import { analyseItNetwork, itReportMarkdown, type ItAnalysis } from "../engine/itAnalysis";
import { assessProject } from "../engine/scoring";
import { downloadJson, downloadMarkdown, downloadTopologySvg } from "../lib/exporters";
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

/** A small illustrative scan so the mapper can be tried without running Nmap. */
const SAMPLE_SCAN = `Nmap scan report for edge-fw (198.51.100.4)
Host is up.
PORT     STATE SERVICE
443/tcp  open  https
22/tcp   open  ssh

Nmap scan report for web-1 (198.51.100.10)
Host is up.
PORT     STATE SERVICE
80/tcp   open  http
443/tcp  open  https
3389/tcp open  ms-wbt-server

Nmap scan report for dc-1 (10.10.1.10)
Host is up.
PORT     STATE SERVICE
53/tcp   open  domain
389/tcp  open  ldap
445/tcp  open  microsoft-ds
88/tcp   open  kerberos-sec
MAC Address: 00:15:5D:00:11:22 (Microsoft)
OS details: Windows Server 2019

Nmap scan report for file-1 (10.10.1.20)
Host is up.
PORT     STATE SERVICE
445/tcp  open  microsoft-ds
139/tcp  open  netbios-ssn

Nmap scan report for db-1 (10.10.2.30)
Host is up.
PORT     STATE SERVICE
3306/tcp open  mysql
22/tcp   open  ssh

Nmap scan report for hmi-legacy (10.10.2.40)
Host is up.
PORT     STATE SERVICE
23/tcp   open  telnet
5900/tcp open  vnc

Nmap scan report for print-1 (10.10.1.55)
Host is up.
PORT    STATE SERVICE
161/tcp open  snmp
9100/tcp open jetdirect
`;

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
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("clean");
  const [fitSignal, setFitSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assessment = useMemo(() => (project ? assessProject(project) : null), [project]);

  // Colour the map by IT risk: internet-facing or high-severity services are high,
  // other flagged services medium. Keyed by asset id for the canvas.
  const riskByAssetId = useMemo(() => {
    const map = new Map<string, "high" | "medium">();
    if (!project || !analysis) {
      return map;
    }
    const high = new Set<string>(analysis.internetFacing.map((host) => host.ip));
    const medium = new Set<string>();
    for (const service of analysis.riskyServices) {
      if (service.severity === "high") {
        high.add(service.ip);
      } else if (service.severity === "medium") {
        medium.add(service.ip);
      }
    }
    for (const asset of project.assets) {
      const ip = asset.ipAddress;
      if (!ip) {
        continue;
      }
      if (high.has(ip)) {
        map.set(asset.id, "high");
      } else if (medium.has(ip)) {
        map.set(asset.id, "medium");
      }
    }
    return map;
  }, [project, analysis]);

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
    setParsed(parsed);
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
    setParsed(null);
    setSelectedId(null);
    setPasteText("");
    setError(null);
  }, []);

  const selectedHost = useMemo<ImportedHost | null>(() => {
    if (!selectedId || !project || !parsed) {
      return null;
    }
    const asset = project.assets.find((item) => item.id === selectedId);
    if (!asset?.ipAddress) {
      return null;
    }
    return parsed.hosts.find((host) => host.ip === asset.ipAddress) ?? null;
  }, [selectedId, project, parsed]);

  const commitProject = useCallback((updater: OtProject | ((current: OtProject) => OtProject)) => {
    setProject((current) => (current ? (typeof updater === "function" ? updater(current) : updater) : current));
  }, []);

  const exportJson = useCallback(() => {
    if (analysis) {
      downloadJson("it-network", JSON.stringify({ analysis, hosts: parsed?.hosts ?? [] }, null, 2));
    }
  }, [analysis, parsed]);
  const exportReport = useCallback(() => {
    if (analysis) {
      downloadMarkdown("it-network", itReportMarkdown(analysis));
    }
  }, [analysis]);
  const exportMap = useCallback(() => {
    if (project && assessment) {
      downloadTopologySvg(project, assessment);
    }
  }, [project, assessment]);

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
          {project && analysis ? (
            <div className="it-export" role="group" aria-label="Export">
              <Download size={14} aria-hidden="true" />
              <button type="button" className="text-button" onClick={exportJson} title="Download analysis as JSON">JSON</button>
              <button type="button" className="text-button" onClick={exportReport} title="Download a Markdown report">Report</button>
              <button type="button" className="text-button" onClick={exportMap} title="Download the map as SVG">Map</button>
            </div>
          ) : null}
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
          <div className="it-empty-actions">
            <button type="button" className="text-button primary" onClick={() => inputRef.current?.click()}>
              <FileUp size={16} aria-hidden="true" /> Import Nmap scan
            </button>
            <button type="button" className="text-button" onClick={() => ingest(SAMPLE_SCAN, "sample.txt")}>
              <PlayCircle size={16} aria-hidden="true" /> Load sample
            </button>
          </div>
          <details className="it-paste">
            <summary>Or paste Nmap output</summary>
            <textarea
              className="it-paste-area"
              value={pasteText}
              placeholder="Paste the output of nmap -oN / -oG / -oX here"
              spellCheck={false}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <button type="button" className="text-button" disabled={!pasteText.trim()} onClick={() => ingest(pasteText, "pasted.txt")}>
              Map pasted output
            </button>
          </details>
        </section>
      ) : (
        <div className="it-workspace">
          {isMobile ? (
            <p className="it-mobile-note">The interactive map needs a larger screen. The analysis below still works.</p>
          ) : (
            <div className="it-canvas-wrap">
              <div className="it-legend" aria-hidden="true">
                <span><i data-risk="high" /> Exposed / high</span>
                <span><i data-risk="medium" /> Risky service</span>
                <span><i /> No flag</span>
              </div>
              {assessment ? (
                <TopologyCanvas
                  project={project}
                  assessment={assessment}
                  selectedId={selectedId}
                  highlightedConduitIds={[]}
                  canvasMode={canvasMode}
                  layoutMode="network"
                  riskByAssetId={riskByAssetId}
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
            {selectedHost ? (
              <div className="it-host-detail">
                <div className="it-host-detail-head">
                  <h3>{selectedHost.hostname || selectedHost.ip}</h3>
                  <button type="button" className="text-button" onClick={() => setSelectedId(null)} aria-label="Clear selection">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <dl className="it-host-meta">
                  <div><dt>IP</dt><dd>{selectedHost.ip || "-"}</dd></div>
                  {selectedHost.os ? <div><dt>OS</dt><dd>{selectedHost.os}</dd></div> : null}
                  {selectedHost.vendor ? <div><dt>Vendor</dt><dd>{selectedHost.vendor}</dd></div> : null}
                </dl>
                <h4>Open ports ({selectedHost.ports.length})</h4>
                <ul className="it-host-ports">
                  {selectedHost.ports.map((port) => (
                    <li key={`${port.port}-${port.transport ?? "tcp"}`}>
                      <b>{port.port}/{port.transport ?? "tcp"}</b>
                      <span>{port.service ?? ""}{port.product ? ` · ${port.product}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ItFindingsPanel analysis={analysis} />
          </aside>
        </div>
      )}
    </div>
  );
}

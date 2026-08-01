import { ArrowLeft, Download, FileUp, PlayCircle, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import type { ImportedHost, ParsedImport } from "../import/types";
import { analyseItNetwork, itReportMarkdown, type ItAnalysis } from "../engine/itAnalysis";
import { synthesiseItTopology } from "../engine/itTopology";
import { layoutItMap } from "../data/itLayout";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { downloadJson, downloadMarkdown } from "../lib/exporters";
import { downloadItMapSvg } from "../lib/itExporters";
import { itKindLabel, type ItMap } from "../models/itMap";
import type { Point } from "../models/types";
import type { AppView } from "../lib/appView";
import { SiteMasthead } from "./SiteMasthead";
import { ItNetworkCanvas, type ItCanvasMode, type ItRisk } from "./ItNetworkCanvas";
import { ItFindingsPanel } from "./ItFindingsPanel";

interface ItAppProps {
  onGoHome: () => void;
  onSwitchView: (view: AppView) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  isMobile: boolean;
}

/** Runs the layout and returns a positioned copy of the map. */
function positioned(map: ItMap): ItMap {
  const positions = layoutItMap(map.nodes, map.links, map.subnets);
  return { ...map, nodes: map.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })) };
}

/**
 * The IT-side network mapper: upload an Nmap scan, get a network map drawn with the standard
 * network-map symbols, plus an IT analysis lens (exposed services, internet-facing hosts,
 * segmentation, inventory). Entirely client-side, like the rest of Alchemist.
 */
export function ItApp({ onGoHome, onSwitchView, theme, onToggleTheme, isMobile }: ItAppProps) {
  const [map, setMap] = useState<ItMap | null>(null);
  const [analysis, setAnalysis] = useState<ItAnalysis | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<ItCanvasMode>("topology");
  const [fitSignal, setFitSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Colour the map by IT risk: internet-facing or high-severity services are high, other
  // flagged services medium. Matched on address, then keyed by node id for the canvas.
  const riskByNodeId = useMemo(() => {
    const risks = new Map<string, ItRisk>();
    if (!map || !analysis) {
      return risks;
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
    for (const node of map.nodes) {
      const address = node.ip ?? node.hostname;
      if (!address) {
        continue;
      }
      if (high.has(address)) {
        risks.set(node.id, "high");
      } else if (medium.has(address)) {
        risks.set(node.id, "medium");
      }
    }
    return risks;
  }, [map, analysis]);

  const ingest = useCallback((text: string, filename: string) => {
    const format = detectFormat(filename, text);
    if (!format) {
      setError("Could not recognise this file. Export an Nmap scan with -oX, -oN or -oG.");
      return;
    }
    const result = parseByFormat(text, format);
    if (result.hosts.length === 0) {
      setError(result.warnings[0] ?? "No hosts were found in that scan.");
      return;
    }
    setMap(positioned(synthesiseItTopology(result)));
    setAnalysis(analyseItNetwork(result));
    setParsed(result);
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
    setMap(null);
    setAnalysis(null);
    setParsed(null);
    setSelectedId(null);
    setPasteText("");
    setError(null);
  }, []);

  const moveNode = useCallback((id: string, position: Point) => {
    setMap((current) =>
      current
        ? { ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, position } : node)) }
        : current
    );
  }, []);

  const rearrange = useCallback(() => {
    setMap((current) => (current ? positioned(current) : current));
    setFitSignal((value) => value + 1);
  }, []);

  const selectedNode = useMemo(() => map?.nodes.find((node) => node.id === selectedId) ?? null, [map, selectedId]);

  const selectedHost = useMemo<ImportedHost | null>(() => {
    if (!selectedNode || !parsed) {
      return null;
    }
    return parsed.hosts.find((host) => host.ip === selectedNode.ip || host.hostname === selectedNode.name) ?? null;
  }, [selectedNode, parsed]);

  const exportJson = useCallback(() => {
    if (analysis) {
      downloadJson("it-network", JSON.stringify({ analysis, map, hosts: parsed?.hosts ?? [] }, null, 2));
    }
  }, [analysis, map, parsed]);
  const exportReport = useCallback(() => {
    if (analysis) {
      downloadMarkdown("it-network", itReportMarkdown(analysis));
    }
  }, [analysis]);
  const exportMap = useCallback(() => {
    if (map) {
      downloadItMapSvg(map);
    }
  }, [map]);

  return (
    <div className="it-app site-frame">
      <SiteMasthead
        theme={theme}
        onToggleTheme={onToggleTheme}
        isMobile={isMobile}
        view="it"
        onSwitchView={onSwitchView}
      />

      <div className="it-toolbar">
        <button type="button" className="text-button" onClick={onGoHome}>
          <ArrowLeft size={15} aria-hidden="true" /> Dashboard
        </button>
        <div className="it-toolbar-title">
          <strong>IT Network Mapper</strong>
          <span>Upload an Nmap scan to map and assess the network</span>
        </div>
        <div className="it-toolbar-actions">
          {map && analysis ? (
            <div className="it-export" role="group" aria-label="Export">
              <Download size={14} aria-hidden="true" />
              <button type="button" className="text-button" onClick={exportJson} title="Download analysis as JSON">JSON</button>
              <button type="button" className="text-button" onClick={exportReport} title="Download a Markdown report">Report</button>
              <button type="button" className="text-button" onClick={exportMap} title="Download the map as SVG">Map</button>
            </div>
          ) : null}
          {map ? (
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

      {!map || !analysis ? (
        <section className="it-empty-state">
          <h1>Map a network from an Nmap scan</h1>
          <p>
            Scan a network with Nmap, then upload the output here. Alchemist parses the hosts, ports and
            services, works out how the network is put together, and draws it: what is exposed, what is
            reachable from the internet, whether the network is flat, and a plain inventory.
          </p>
          <pre className="it-cmd">nmap -sV --traceroute -oX scan.xml 10.0.0.0/24</pre>
          <p className="it-note">
            Nmap XML (-oX), normal (-oN) and greppable (-oG) are all accepted. Add --traceroute and the map
            draws the real paths between segments instead of inferring them. Everything runs in your browser;
            the scan never leaves this page.
          </p>
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
              <ItNetworkCanvas
                map={map}
                selectedId={selectedId}
                canvasMode={canvasMode}
                riskByNodeId={riskByNodeId}
                fitSignal={fitSignal}
                onSelect={setSelectedId}
                onCanvasModeChange={setCanvasMode}
                onMoveNode={moveNode}
                onRearrange={rearrange}
              />
            </div>
          )}
          <aside className="it-panel" aria-label="IT network analysis">
            {selectedNode ? (
              <div className="it-host-detail">
                <div className="it-host-detail-head">
                  <h3>{selectedNode.name}</h3>
                  <button type="button" className="text-button" onClick={() => setSelectedId(null)} aria-label="Clear selection">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <dl className="it-host-meta">
                  <div><dt>Type</dt><dd>{itKindLabel(selectedNode.kind)}</dd></div>
                  <div><dt>IP</dt><dd>{selectedNode.ip || "-"}</dd></div>
                  {selectedHost?.os ? <div><dt>OS</dt><dd>{selectedHost.os}</dd></div> : null}
                  {selectedHost?.vendor ? <div><dt>Vendor</dt><dd>{selectedHost.vendor}</dd></div> : null}
                </dl>
                <p className="it-host-rationale">
                  {selectedNode.rationale}
                  {selectedNode.confidence < 1 ? <em> Confidence {Math.round(selectedNode.confidence * 100)}%.</em> : null}
                </p>
                {selectedHost ? (
                  <>
                    <h4>Open ports ({selectedHost.ports.length})</h4>
                    <ul className="it-host-ports">
                      {selectedHost.ports.map((port) => (
                        <li key={`${port.port}-${port.transport ?? "tcp"}`}>
                          <b>{port.port}/{port.transport ?? "tcp"}</b>
                          <span>{port.service ?? ""}{port.product ? ` · ${port.product}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
            <ItFindingsPanel analysis={analysis} />
          </aside>
        </div>
      )}
    </div>
  );
}

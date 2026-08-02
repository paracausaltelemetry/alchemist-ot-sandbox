import { ArrowLeft, Download, FileUp, PlayCircle, Share2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import type { ImportedHost, ParsedImport } from "../import/types";
import { formatScanTime, scanTimeCaveat } from "../import/scanTime";
import { itReportMarkdown } from "../engine/itAnalysis";
import { projectEngagement } from "../engine/itProjection";
import { promoteToOtProject } from "../engine/itToOt";
import { clearEngagement, loadEngagement, saveEngagement } from "../lib/itEngagementStore";
import {
  DEFAULT_VANTAGE,
  newItEngagement,
  newItEvent,
  newItScan,
  newItUserLink,
  nextSequence,
  vantageLabel,
  ACCESS_LABELS,
  EVENT_KIND_LABELS,
  EXTERNAL_ORIGIN,
  type ItEngagement,
  type ItVantage
} from "../models/itEngagement";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { downloadJson, downloadMarkdown } from "../lib/exporters";
import { buildItEngagementReport } from "../engine/itEngagementReport";
import { itEngagementMarkdown } from "../engine/itEngagementMarkdown";
import { buildItStageMaps } from "../engine/itStageMaps";
import { ItPrintableReport } from "./ItPrintableReport";
import { downloadItMapSvg } from "../lib/itExporters";
import { isItLinkId, isScanEvidence, itEvidenceLabel, itKindLabel, type ItMap } from "../models/itMap";
import type { Point } from "../models/types";
import type { AppView } from "../lib/appView";
import { SiteMasthead } from "./SiteMasthead";
import { ItNetworkCanvas, type ItCanvasMode, type ItRisk } from "./ItNetworkCanvas";
import { ItFindingsPanel } from "./ItFindingsPanel";
import { ItMapOutline } from "./ItMapOutline";
import { ConfirmDialog } from "./ConfirmDialog";
import { ItScanDialog, type ItImportMode } from "./ItScanDialog";
import { ItLinkDialog } from "./ItLinkDialog";
import { ItEventDialog, type ItEventDraft } from "./ItEventDialog";
import { CommandPalette, type Command } from "./CommandPalette";
import { createProject } from "../lib/projectStore";
import { oversizeFileError, oversizeWarning } from "../lib/modelLimits";

interface ItAppProps {
  onGoHome: () => void;
  onSwitchView: (view: AppView) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  isMobile: boolean;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Long enough that dragging a run of nodes costs one write rather than one per node. */
const POSITION_SAVE_DEBOUNCE_MS = 400;

/**
 * The IT-side network mapper: upload an Nmap scan, get a network map drawn with the standard
 * network-map symbols, plus an IT analysis lens (exposed services, internet-facing hosts,
 * segmentation, inventory). Entirely client-side, like the rest of Alchemist.
 */
export function ItApp({ onGoHome, onSwitchView, theme, onToggleTheme, isMobile }: ItAppProps) {
  // `engagement` changes only on load, import, clear and re-arrange — never on a drag. That is what
  // keeps the projection memo from rebuilding `map.nodes` while the operator is moving a node.
  const [engagement, setEngagement] = useState<ItEngagement | null>(() => loadEngagement());
  const [saveFailed, setSaveFailed] = useState(false);
  /** A parsed scan waiting on the add-or-replace question. */
  const [pending, setPending] = useState<{ parsed: ParsedImport; filename: string } | null>(null);
  /** A drawn link waiting to be described. */
  const [pendingLink, setPendingLink] = useState<{ source: string; target: string } | null>(null);
  /** An open journal entry, optionally pre-filled from a line the operator just drew. */
  const [pendingEvent, setPendingEvent] = useState<{ sourceNodeId?: string; targetNodeId?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<ItCanvasMode>("topology");
  const [fitSignal, setFitSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showInferred, setShowInferred] = useState(true);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Dragged positions are deliberately kept out of React state. Feeding them back into `map`
  // rebuilds the node array, which makes React Flow reset its whole store — measured at ~127ms
  // per move on a 300-host map. React Flow already owns the live position while you drag, so
  // the only thing that needs them is an export, and that can read them on demand.
  const draggedPositions = useRef(new Map<string, Point>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { map, analysis, parsed, access } = useMemo(
    () => (engagement ? projectEngagement(engagement) : { map: null, analysis: null, parsed: null, access: new Map() }),
    [engagement]
  );

  /**
   * The engagement as it stands right now, including positions that only exist in the ref.
   *
   * Every persist path goes through here. `moveNode` writes to a ref and triggers no render, so an
   * effect-based autosave would either never fire on a drag or fire for some unrelated reason and
   * save whatever the ref happened to hold.
   */
  const snapshot = useCallback((): ItEngagement | null => {
    if (!engagement) {
      return null;
    }
    if (draggedPositions.current.size === 0) {
      return engagement;
    }
    return { ...engagement, positions: { ...engagement.positions, ...Object.fromEntries(draggedPositions.current) } };
  }, [engagement]);

  const persist = useCallback((next: ItEngagement | null) => {
    if (!next) {
      clearEngagement();
      setSaveFailed(false);
      return;
    }
    setSaveFailed(!saveEngagement(next));
  }, []);

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

  /**
   * Commits a parsed scan into the engagement.
   *
   * "add" keeps every earlier scan and appends this one, so the map is re-derived from all of them
   * together — a host only the new scan could reach appears, and one both saw keeps what each
   * knew. "replace" starts over. Authored positions survive "add" because they are keyed by node
   * id, and are dropped by "replace" because the nodes they referred to are gone.
   */
  const applyScan = useCallback(
    (result: ParsedImport, filename: string, mode: ItImportMode, vantage: ItVantage) => {
      const base = mode === "add" && engagement ? engagement : newItEngagement(filename);
      const next: ItEngagement = {
        ...base,
        scans: [...(mode === "add" ? base.scans : []), newItScan(result, filename, nextSequence(base), vantage)]
      };
      if (mode === "replace") {
        draggedPositions.current.clear();
      }
      setEngagement(next);
      persist(next);
      setPending(null);
      setSelectedId(null);
      setFitSignal((value) => value + 1);
      // A /24 is the size this view is built for, so say when a scan is past what the canvas
      // handles comfortably rather than letting it just feel slow.
      const preview = projectEngagement(next).map;
      setNotice(
        preview ? oversizeWarning(preview.nodes.length, preview.links.length, { node: "devices", link: "links" }) : null
      );
      setError(null);
    },
    [engagement, persist]
  );

  /**
   * Commits a drawn link into the authored layer.
   *
   * The id is derived from the endpoints, so drawing the same pair twice updates the description
   * rather than stacking two identical lines on top of each other.
   */
  const addUserLink = useCallback(
    (source: string, target: string, label: string, note: string) => {
      setEngagement((current) => {
        if (!current) {
          return current;
        }
        const link = newItUserLink(source, target, label, note || undefined);
        const next = {
          ...current,
          userLinks: [...current.userLinks.filter((entry) => entry.id !== link.id), link]
        };
        persist(next);
        return next;
      });
      setPendingLink(null);
    },
    [persist]
  );

  /**
   * Removes a drawn link.
   *
   * Only ever an authored one. A derived link is what the scan says, so deleting it would leave the
   * map no longer reflecting the evidence it was built from — the inspector says so instead.
   */
  const removeUserLink = useCallback(
    (linkId: string) => {
      setEngagement((current) => {
        if (!current) {
          return current;
        }
        const next = { ...current, userLinks: current.userLinks.filter((entry) => entry.id !== linkId) };
        persist(next);
        return next;
      });
      setSelectedId(null);
    },
    [persist]
  );

  const addEvent = useCallback(
    (draft: ItEventDraft) => {
      setEngagement((current) => {
        if (!current) {
          return current;
        }
        const next = { ...current, events: [...current.events, newItEvent(draft.kind, draft.title, nextSequence(current), draft)] };
        persist(next);
        return next;
      });
      setPendingEvent(null);
    },
    [persist]
  );

  const removeEvent = useCallback(
    (eventId: string) => {
      setEngagement((current) => {
        if (!current) {
          return current;
        }
        const next = { ...current, events: current.events.filter((entry) => entry.id !== eventId) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  /**
   * Records a scan time the operator supplied because the file carried none.
   *
   * Marked `source: "operator"` and surfaced as such in the report — a time somebody remembered is
   * evidence of a different kind from a time the tool wrote down, and the reader gets to know which.
   * Ordering is unaffected: that is always by `sequence`.
   */
  const setScanTime = useCallback(
    (scanId: string, local: string) => {
      const at = local ? new Date(local) : null;
      setEngagement((current) => {
        if (!current || !at || !Number.isFinite(at.getTime())) {
          return current;
        }
        const next = {
          ...current,
          scans: current.scans.map((scan) =>
            scan.id === scanId
              ? { ...scan, time: { iso: at.toISOString(), source: "operator" as const, precision: "minute" as const } }
              : scan
          )
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

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
    // The first scan starts an engagement outright; every later one asks, because silently
    // replacing what came before is exactly what a record of an engagement must not do.
    if (!engagement || engagement.scans.length === 0) {
      applyScan(result, filename, "replace", DEFAULT_VANTAGE);
      return;
    }
    setPending({ parsed: result, filename });
    setError(null);
  }, [engagement, applyScan]);

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }
      const tooLarge = oversizeFileError(file);
      if (tooLarge) {
        setError(tooLarge);
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
    setNotice(null);
    draggedPositions.current.clear();
    setEngagement(null);
    persist(null);
    setSelectedId(null);
    setPasteText("");
    setError(null);
  }, [persist]);

  /**
   * A drag ended. This is the only place that knows one did, so it schedules the positions-only
   * save — debounced, because dragging a run of nodes should cost one write, not one per node.
   */
  const moveNode = useCallback(
    (id: string, position: Point) => {
      draggedPositions.current.set(id, position);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => persist(snapshot()), POSITION_SAVE_DEBOUNCE_MS);
    },
    [persist, snapshot]
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  /** The map as it is currently arranged on screen, for anything that leaves the canvas. */
  const withLivePositions = useCallback((source: ItMap): ItMap => {
    const moved = draggedPositions.current;
    if (moved.size === 0) {
      return source;
    }
    return { ...source, nodes: source.nodes.map((node) => ({ ...node, position: moved.get(node.id) ?? node.position })) };
  }, []);

  /** Drops every authored position, so the computed layout takes over again. */
  const rearrange = useCallback(() => {
    draggedPositions.current.clear();
    setEngagement((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, positions: {} };
      persist(next);
      return next;
    });
    setFitSignal((value) => value + 1);
  }, [persist]);

  // One selection id addresses either a node or a link: the two id namespaces are disjoint by
  // construction. Clicking a link already highlighted it on the canvas, but only `map.nodes` was
  // searched here, so the panel silently showed nothing and the link looked unselectable.
  const selectedNode = useMemo(
    () => (selectedId && !isItLinkId(selectedId) ? (map?.nodes.find((node) => node.id === selectedId) ?? null) : null),
    [map, selectedId]
  );

  const selectedLink = useMemo(() => {
    if (!map || !selectedId || !isItLinkId(selectedId)) {
      return null;
    }
    const link = map.links.find((entry) => entry.id === selectedId);
    if (!link) {
      return null;
    }
    const nameOf = (id: string) => map.nodes.find((node) => node.id === id)?.name ?? id;
    // The note lives on the authored link, not the derived one: only what is needed to draw a link
    // is projected onto `ItLink`, so the operator's own words are read back from the engagement.
    const note = engagement?.userLinks.find((entry) => entry.id === link.id)?.note;
    return { link, note, sourceName: nameOf(link.source), targetName: nameOf(link.target) };
  }, [engagement, map, selectedId]);

  const selectedHost = useMemo<ImportedHost | null>(() => {
    if (!selectedNode || !parsed) {
      return null;
    }
    return parsed.hosts.find((host) => host.ip === selectedNode.ip || host.hostname === selectedNode.name) ?? null;
  }, [selectedNode, parsed]);

  // Hand the scanned network to the OT workbench as a new saved assessment. Additive: the
  // existing assessments are untouched, and the conversion is explicit about what it guessed.
  const promotion = useMemo(() => (map ? promoteToOtProject(map) : null), [map]);

  const promote = useCallback(() => {
    if (!map) {
      return;
    }
    createProject(promoteToOtProject(withLivePositions(map)).project);
    setPromoteOpen(false);
    onSwitchView("app");
  }, [map, withLivePositions, onSwitchView]);

  const exportJson = useCallback(() => {
    if (analysis) {
      downloadJson(
        "it-network",
        JSON.stringify({ analysis, map: map ? withLivePositions(map) : null, hosts: parsed?.hosts ?? [] }, null, 2)
      );
    }
  }, [analysis, map, parsed, withLivePositions]);
  /**
   * The engagement report: the deliverable, not a dump of the analysis.
   *
   * `itReportMarkdown` still exists and still describes what a scan found; this describes what the
   * operator did with it, which is the document that goes to a client.
   */
  const exportReport = useCallback(() => {
    if (engagement) {
      downloadMarkdown("engagement-report", itEngagementMarkdown(buildItEngagementReport(engagement)));
    }
  }, [engagement]);

  const exportScanFindings = useCallback(() => {
    if (analysis) {
      downloadMarkdown("it-network", itReportMarkdown(analysis));
    }
  }, [analysis]);

  const exportStageMaps = useCallback(() => {
    if (!engagement) {
      return;
    }
    // One file per stage rather than a combined sheet: they are read one at a time, beside the
    // stage they belong to, and a reader who wants stage 4 should not have to crop it out.
    for (const stage of buildItStageMaps(engagement)) {
      downloadItMapSvg(stage.map);
    }
  }, [engagement]);
  const exportMap = useCallback(() => {
    if (map) {
      downloadItMapSvg(withLivePositions(map));
    }
  }, [map, withLivePositions]);

  // The workbench has had Ctrl/Cmd+K since the beginning; the IT side had no keyboard route to
  // anything. Same shortcut, same component, commands that make sense on this side.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "import", label: "Import an Nmap scan…", hint: "File", run: () => inputRef.current?.click() },
      { id: "sample", label: "Load the sample scan", hint: "File", run: () => ingest(SAMPLE_SCAN, "sample.txt") }
    ];
    if (map) {
      list.push(
        { id: "mode-topology", label: "Map: topology view", run: () => setCanvasMode("topology") },
        { id: "mode-exposure", label: "Map: exposure view", run: () => setCanvasMode("exposure") },
        { id: "mode-services", label: "Map: services view", run: () => setCanvasMode("services") },
        {
          id: "inferred",
          label: showInferred ? "Hide inferred links" : "Show inferred links",
          run: () => setShowInferred((value) => !value)
        },
        { id: "arrange", label: "Re-run the map layout", run: rearrange },
        { id: "promote", label: "Assess this network in the OT workbench…", hint: "OT", run: () => setPromoteOpen(true) },
        { id: "export-json", label: "Export the analysis as JSON", hint: "Export", run: exportJson },
        { id: "export-report", label: "Export the engagement report", hint: "Export", run: exportReport },
        { id: "export-findings", label: "Export the scan findings", hint: "Export", run: exportScanFindings },
        { id: "export-stage-maps", label: "Download a map for every stage", hint: "Export", run: exportStageMaps },
        { id: "print", label: "Print the engagement report", hint: "Export", run: () => window.print() },
        { id: "export-map", label: "Export the map as SVG", hint: "Export", run: exportMap },
        { id: "clear", label: "Clear the map", run: clear }
      );
    }
    list.push(
      { id: "switch-ot", label: "Switch to the OT workbench", hint: "OT", run: () => onSwitchView("app") },
      { id: "home", label: "Back to dashboard", hint: "Home", run: onGoHome },
      { id: "theme", label: "Toggle light / dark theme", run: onToggleTheme }
    );
    return list;
  }, [
    clear,
    exportJson,
    exportMap,
    exportReport,
    exportScanFindings,
    exportStageMaps,
    ingest,
    map,
    onGoHome,
    onSwitchView,
    onToggleTheme,
    rearrange,
    showInferred
  ]);

  return (
    <>
      {/*
        A sibling of `.it-app`, not a child. The print stylesheet hides the whole live view, so a
        report nested inside it would be hidden along with everything else and Ctrl+P would produce
        a blank page. `PrintableReport` sits outside `.app-shell` for the same reason.
      */}
      <ItPrintableReport engagement={engagement} />

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
              <button type="button" className="text-button" onClick={exportReport} title="Download the engagement report as Markdown">Report</button>
              <button type="button" className="text-button" onClick={() => window.print()} title="Print the engagement report">Print</button>
              <button type="button" className="text-button" onClick={exportMap} title="Download the map as SVG">Map</button>
            </div>
          ) : null}
          {map ? (
            <button
              type="button"
              className="text-button"
              onClick={() => setPromoteOpen(true)}
              title="Create an OT assessment from this scan and open it in the workbench"
            >
              <Share2 size={15} aria-hidden="true" /> Assess in OT
            </button>
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
      {/*
        Persistent, not a toast. An engagement too large for localStorage cannot be saved at all,
        and the operator needs to know that for as long as it is true — a message that fades leaves
        them believing their work is stored. The export is the way out, so it is offered here.
      */}
      {saveFailed ? (
        <p className="it-error" role="alert">
          This engagement is too large to save in the browser, so it will be lost when you close the tab.{" "}
          <button type="button" className="text-button" onClick={exportJson}>
            Export it as JSON
          </button>{" "}
          to keep it.
        </p>
      ) : null}
      {notice ? <p className="it-notice" role="status">{notice}</p> : null}
      {/*
        `map.warnings` had no renderer at all, so everything the synthesis wanted to tell the
        operator — including a link of theirs that no longer has both endpoints — went nowhere.
      */}
      {map?.warnings.map((warning) => (
        <p className="it-notice" role="status" key={warning}>
          {warning}
        </p>
      ))}

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
            <div className="it-canvas-wrap is-outline">
              <p className="it-mobile-note">
                The map is shown as an outline here — a network map wants a pointer and a wide screen. Everything the
                map knows is below, and the analysis is unchanged.
              </p>
              <ItMapOutline map={map} riskByNodeId={riskByNodeId} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
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
                showInferred={showInferred}
                onToggleInferred={() => setShowInferred((value) => !value)}
                accessByNodeId={access}
                onConnect={(source, target) => setPendingLink({ source, target })}
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
            {selectedLink ? (
              <div className="it-host-detail">
                <div className="it-host-detail-head">
                  <h3>Link</h3>
                  <button type="button" className="text-button" onClick={() => setSelectedId(null)} aria-label="Clear selection">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <dl className="it-host-meta">
                  <div><dt>From</dt><dd>{selectedLink.sourceName}</dd></div>
                  <div><dt>To</dt><dd>{selectedLink.targetName}</dd></div>
                  <div><dt>Evidence</dt><dd>{itEvidenceLabel(selectedLink.link.evidence)}</dd></div>
                  {selectedLink.link.hopIndex !== undefined ? (
                    <div><dt>Hop</dt><dd>{selectedLink.link.hopIndex}</dd></div>
                  ) : null}
                  {selectedLink.link.rttMs !== undefined ? (
                    <div><dt>Round trip</dt><dd>{selectedLink.link.rttMs} ms</dd></div>
                  ) : null}
                </dl>
                {selectedLink.note ? <p className="it-host-rationale">{selectedLink.note}</p> : null}
                <p className="it-host-rationale">
                  {selectedLink.link.evidence === "asserted"
                    ? "You drew this link. It is yours to remove."
                    : isScanEvidence(selectedLink.link.evidence)
                      ? "This link came from the scan output."
                      : "This link is our reasoning about the addressing, not something the scan saw. Confirm it before relying on it."}
                </p>
                {selectedLink.link.evidence === "asserted" ? (
                  <button type="button" className="text-button" onClick={() => removeUserLink(selectedLink.link.id)}>
                    <Trash2 size={14} aria-hidden="true" /> Remove this link
                  </button>
                ) : (
                  // Deleting a derived link would leave the map no longer reflecting its evidence,
                  // so the inspector explains rather than offering a control that must refuse.
                  <p className="muted">
                    Links from a scan cannot be removed — the map would stop matching the evidence it was built from.
                  </p>
                )}
              </div>
            ) : null}
            {engagement && engagement.scans.length > 0 ? (
              <div className="it-journal">
                <div className="it-journal-head">
                  <h4>Journal ({engagement.events.length})</h4>
                  <button type="button" className="text-button" onClick={() => setPendingEvent({})}>
                    Record what you did
                  </button>
                </div>
                {engagement.events.length === 0 ? (
                  <p className="muted">
                    Nothing recorded yet. A map of what is on the network is a scan result; a map of what you did to it
                    is a report.
                  </p>
                ) : (
                  <ol className="it-journal-list">
                    {[...engagement.events]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((entry) => {
                        const nameOf = (id?: string) =>
                          id === EXTERNAL_ORIGIN
                            ? "outside"
                            : (map?.nodes.find((node) => node.id === id)?.name ?? id);
                        return (
                          <li key={entry.id}>
                            <b>{entry.title}</b>
                            <span>
                              {EVENT_KIND_LABELS[entry.kind]}
                              {entry.targetNodeId ? ` · ${nameOf(entry.sourceNodeId)} → ${nameOf(entry.targetNodeId)}` : ""}
                              {entry.grants ? ` · ${ACCESS_LABELS[entry.grants]}` : ""}
                            </span>
                            {entry.cve || entry.attackTechnique ? (
                              <span>{[entry.cve, entry.attackTechnique].filter(Boolean).join(" · ")}</span>
                            ) : null}
                            {entry.note ? <span>{entry.note}</span> : null}
                            <button type="button" className="text-button compact" onClick={() => removeEvent(entry.id)}>
                              Remove
                            </button>
                          </li>
                        );
                      })}
                  </ol>
                )}
              </div>
            ) : null}
            {engagement && engagement.scans.length > 0 ? (
              <div className="it-scan-list">
                <h4>Scans ({engagement.scans.length})</h4>
                <ol>
                  {[...engagement.scans]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((scan) => (
                      <li key={scan.id}>
                        <b>{scan.name}</b>
                        <span>
                          {plural(scan.hostCount, "host")} · from{" "}
                          {vantageLabel(scan.vantage, (id) => map?.nodes.find((node) => node.id === id)?.name)}
                        </span>
                        <span>
                          {scan.time ? (
                            <>
                              {formatScanTime(scan.time)}
                              {scanTimeCaveat(scan.time) ? ` (${scanTimeCaveat(scan.time)})` : ""}
                            </>
                          ) : (
                            "Time not recorded"
                          )}
                        </span>
                        {scan.time === null ? (
                          <label className="it-scan-time-entry">
                            <span className="visually-hidden">Scan time for {scan.name}</span>
                            <input
                              type="datetime-local"
                              onChange={(event) => setScanTime(scan.id, event.target.value)}
                              title="The scan file did not record when it ran. Enter it if you know it."
                            />
                          </label>
                        ) : null}
                      </li>
                    ))}
                </ol>
                {engagement.scans.length > 1 ? (
                  <p className="muted">
                    The map is drawn from every scan together. A host seen by more than one keeps what each of them
                    knew, so a port that closed partway through the engagement still shows.
                  </p>
                ) : null}
              </div>
            ) : null}
            <ItFindingsPanel analysis={analysis} />
          </aside>
        </div>
      )}

      <ItScanDialog
        open={pending !== null}
        filename={pending?.filename ?? ""}
        hostCount={pending?.parsed.hosts.length ?? 0}
        scanCount={engagement?.scans.length ?? 0}
        nodes={map?.nodes.filter((node) => node.origin === "scanned") ?? []}
        onConfirm={(mode, vantage) => {
          if (pending) {
            applyScan(pending.parsed, pending.filename, mode, vantage);
          }
        }}
        onCancel={() => setPending(null)}
      />

      <ItLinkDialog
        open={pendingLink !== null}
        sourceName={map?.nodes.find((node) => node.id === pendingLink?.source)?.name ?? ""}
        targetName={map?.nodes.find((node) => node.id === pendingLink?.target)?.name ?? ""}
        onConfirm={(label, note) => {
          if (pendingLink) {
            addUserLink(pendingLink.source, pendingLink.target, label, note);
          }
        }}
        onRecordAction={() => {
          setPendingEvent({ sourceNodeId: pendingLink?.source, targetNodeId: pendingLink?.target });
          setPendingLink(null);
        }}
        onCancel={() => setPendingLink(null)}
      />

      <ItEventDialog
        open={pendingEvent !== null}
        nodes={map?.nodes.filter((node) => node.origin === "scanned") ?? []}
        initial={pendingEvent ?? undefined}
        onConfirm={addEvent}
        onCancel={() => setPendingEvent(null)}
      />

      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />

      <ConfirmDialog
        open={promoteOpen}
        title="Assess this network in the OT workbench"
        message={
          promotion
            ? `Creates a new assessment with ${promotion.project.assets.length} assets and ${promotion.project.conduits.length} conduits. ` +
              `A scan cannot tell what a device does in a process or what controls it has, so every asset lands in an ` +
              `enterprise or operations zone with its controls unset — review both before reading the score. ` +
              (promotion.dropped.syntheticNodes > 0
                ? `${plural(promotion.dropped.syntheticNodes, "inferred device")} and ${plural(
                    promotion.dropped.links,
                    "link"
                  )} are not carried over. `
                : "") +
              "Your existing assessments are untouched."
            : ""
        }
        confirmLabel="Create and open"
        onConfirm={promote}
        onCancel={() => setPromoteOpen(false)}
      />
    </div>
    </>
  );
}

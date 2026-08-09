import { useCallback, useMemo, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { asOtProject, projectMap } from "../engine/mapProjection";
import { buildOverlayContext, type OverlayId } from "../engine/overlays";
import { applyOverrideDiff, diffToOverrides } from "../engine/mapOverrides";
import { findReachability } from "../engine/reachability";
import {
  newCyberMap,
  newImportSource,
  newUserConnection,
  nextMapSequence,
  type AssetOverride,
  type ConnectionOverride,
  type CyberMapDocument
} from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";
import { buildMapReport } from "../engine/mapReport";
import { mapReportMarkdown } from "../engine/mapReportMarkdown";
import { downloadMarkdown } from "../lib/exporters";
import { loadCyberMap, saveCyberMap } from "../lib/mapStore";
import type {
  CafPrincipleId,
  CafStatus,
  EngagementContext,
  Finding,
  OtProject,
  Point,
  RiskTreatment,
  ZoneId
} from "../models/types";
import { ItEventDialog, type ItEventDraft } from "./ItEventDialog";
import { ItLinkDialog } from "./ItLinkDialog";
import { AnalysisPanel } from "./AnalysisPanel";
import { GovernanceEditor } from "./GovernanceEditor";
import { MapBottomPanel } from "./MapBottomPanel";
import { MapCanvas } from "./MapCanvas";
import { MapInspector } from "./MapInspector";
import { MapPrintableReport } from "./MapPrintableReport";
import { MapSidebar } from "./MapSidebar";
import { SiteMasthead } from "./SiteMasthead";

/**
 * The converged workspace: one document, one canvas, and the three panels around it.
 *
 * Owns every piece of state the shell shares — the document, the selection, the active overlay —
 * because they are one conversation. Selecting a finding in the bottom panel selects the asset on
 * the canvas and fills the inspector, and that only works if one component knows all three.
 *
 * Still reached at `#map` alongside the two existing apps. Phase 5b removes the toggle and deletes
 * them; until then nothing is taken away from anyone.
 */
export function MapWorkspace({
  theme,
  onToggleTheme,
  isMobile
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  isMobile: boolean;
}) {
  const [doc, setDoc] = useState<CyberMapDocument>(() => loadCyberMap() ?? newCyberMap("Estate"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInferred, setShowInferred] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [overlayId, setOverlayId] = useState<OverlayId>("purdue");
  const [importError, setImportError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  /** The pair being joined, held while the operator says what the line means. */
  const [pendingLink, setPendingLink] = useState<{ source: string; target: string } | null>(null);
  const [eventDraft, setEventDraft] = useState<{ sourceNodeId?: string; targetNodeId?: string } | null>(null);
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(22);
  const [dockOpen, setDockOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);

  const map = useMemo(() => projectMap(doc), [doc]);
  const project = useMemo(() => asOtProject(doc, map), [doc, map]);
  // Built once per document, not per overlay switch: three overlays want assessment output and two
  // want a graph walk, so rebuilding on click would put a full `assessProject` on every change.
  const overlayContext = useMemo(() => buildOverlayContext(map, project), [map, project]);

  const commit = useCallback((next: CyberMapDocument) => {
    setDoc(next);
    // A refused write used to be swallowed here. An accepted import is up to 24MB against roughly
    // 5MB of localStorage, so this genuinely fails — and silently losing an operator's afternoon
    // is the worst thing this application could do. Surfaced as a warning, and the estate stays on
    // screen so the report can still be exported.
    setSaveFailed(!saveCyberMap(next));
  }, []);

  const addSource = useCallback(
    (text: string, filename: string) => {
      const format = detectFormat(filename, text);
      if (!format) {
        setImportError(`${filename} is not a format this reads.`);
        return;
      }
      const parsed = parseByFormat(text, format);
      if (parsed.hosts.length === 0) {
        // Refused rather than added: an empty source contributes nothing and is indistinguishable
        // afterwards from one whose hosts were merged away, so the operator would never learn the
        // file was wrong.
        setImportError(`${filename} parsed as ${format} but described no hosts.`);
        return;
      }
      setImportError(null);
      commit({
        ...doc,
        sources: [
          ...doc.sources,
          newImportSource(parsed, filename, nextMapSequence(doc), { kind: "external", label: "External" })
        ]
      });
      setFitSignal((signal) => signal + 1);
    },
    [commit, doc]
  );

  const importFile = useCallback(
    (file: File) => {
      void file.text().then((text) => addSource(text, file.name));
    },
    [addSource]
  );

  const loadSample = useCallback(() => {
    const base = newCyberMap("Sample estate");
    commit({
      ...base,
      sources: [
        newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
          kind: "external",
          label: "External"
        })
      ]
    });
    setImportError(null);
    setFitSignal((signal) => signal + 1);
  }, [commit]);

  const removeSource = useCallback(
    (sourceId: string) => {
      // The authored layer is deliberately left alone. Its keys are stable, so re-importing the
      // same file brings every decision back; pruning it here would make removal destructive in a
      // way the operator has no reason to expect from a list with a Remove button.
      commit({ ...doc, sources: doc.sources.filter((source) => source.id !== sourceId) });
      setFitSignal((signal) => signal + 1);
    },
    [commit, doc]
  );

  const placeAsset = useCallback(
    (id: string, position: Point, zone: AssetOverride["zone"]) =>
      commit({
        ...doc,
        positions: { ...doc.positions, [id]: position },
        assetOverrides: { ...doc.assetOverrides, [id]: { ...doc.assetOverrides[id], zone } }
      }),
    [commit, doc]
  );

  const override = useCallback(
    (assetId: string, patch: AssetOverride) =>
      commit({
        ...doc,
        assetOverrides: { ...doc.assetOverrides, [assetId]: { ...doc.assetOverrides[assetId], ...patch } }
      }),
    [commit, doc]
  );

  const clearOverride = useCallback(
    (assetId: string) => {
      const { [assetId]: _removed, ...rest } = doc.assetOverrides;
      commit({ ...doc, assetOverrides: rest });
    },
    [commit, doc]
  );

  const overrideConnection = useCallback(
    (connectionId: string, patch: ConnectionOverride) =>
      commit({
        ...doc,
        connectionOverrides: {
          ...doc.connectionOverrides,
          [connectionId]: { ...doc.connectionOverrides[connectionId], ...patch }
        }
      }),
    [commit, doc]
  );

  const clearConnectionOverride = useCallback(
    (connectionId: string) => {
      const { [connectionId]: _removed, ...rest } = doc.connectionOverrides;
      commit({ ...doc, connectionOverrides: rest });
    },
    [commit, doc]
  );

  // --- The engagement record ------------------------------------------------

  const beginConnection = useCallback((source: string, target: string) => {
    if (source !== target) {
      setPendingLink({ source, target });
    }
    setConnectSourceId(null);
  }, []);

  /**
   * Click-to-connect, as an alternative to dragging a handle.
   *
   * Two ways to draw one line because the handles are small and the estate is dense: dragging from
   * a 14px target across a scrolling canvas is a fiddly action to ask of someone mid-assessment.
   */
  const selectOnCanvas = useCallback(
    (id: string | null) => {
      if (!connectMode || !id) {
        setSelectedId(id);
        return;
      }
      if (!connectSourceId) {
        setConnectSourceId(id);
        return;
      }
      beginConnection(connectSourceId, id);
    },
    [beginConnection, connectMode, connectSourceId]
  );

  const confirmLink = useCallback(
    (label: string, note: string) => {
      if (!pendingLink) {
        return;
      }
      commit({
        ...doc,
        connections: [
          ...doc.connections,
          newUserConnection(pendingLink.source, pendingLink.target, { label, note })
        ]
      });
      setPendingLink(null);
      setConnectMode(false);
    },
    [commit, doc, pendingLink]
  );

  /**
   * A drawn line that turns out to be an action, not a cable.
   *
   * Handing the endpoints straight to the journal form is the whole reason the link dialog asks:
   * an operator who has just dragged from the host they came from to the host they landed on has
   * already said the interesting part, and making them retype it is how a journal stops being kept.
   */
  const escalateToEvent = useCallback(() => {
    if (pendingLink) {
      setEventDraft({ sourceNodeId: pendingLink.source, targetNodeId: pendingLink.target });
    }
    setPendingLink(null);
    setConnectMode(false);
  }, [pendingLink]);

  const recordEvent = useCallback(
    (draft: ItEventDraft) => {
      const { kind, title, ...rest } = draft;
      commit({ ...doc, events: [...doc.events, newItEvent(kind, title, nextMapSequence(doc), rest)] });
      setEventDraft(null);
    },
    [commit, doc]
  );

  const deleteEvent = useCallback(
    (eventId: string) => {
      // Access and attack edges are folded from the journal rather than stored, so deleting an
      // entry withdraws both. That is the point of not storing them.
      commit({ ...doc, events: doc.events.filter((entry) => entry.id !== eventId) });
    },
    [commit, doc]
  );

  // --- Analysis over the converged estate -----------------------------------

  const reachability = useMemo(
    () => findReachability(project, pathSource, pathTarget),
    [project, pathSource, pathTarget]
  );

  const setGovernance = useCallback(
    (patch: Partial<CyberMapDocument["governance"]>) =>
      commit({ ...doc, governance: { ...doc.governance, ...patch } }),
    [commit, doc]
  );

  /**
   * The what-if tab hands back a whole modified project, which is the right shape for a model where
   * every field was typed. Here it becomes a set of authored decisions instead — storing the
   * simulation itself would mean abandoning re-derivation, which is the property the document is
   * built around.
   */
  const applySimulation = useCallback(
    (simulated: OtProject) => {
      const diff = diffToOverrides(map, simulated);
      commit(applyOverrideDiff(doc, diff));
      // Named rather than dropped: a remediation that silently fails to apply is worse than one
      // that refuses.
      setImportError(diff.unapplied.length > 0 ? diff.unapplied.join(" ") : null);
    },
    [commit, doc, map]
  );

  const selectFinding = useCallback((finding: Finding) => {
    setActiveFindingId(finding.id);
    const [first] = finding.affectedAssetIds;
    if (first) {
      setSelectedId(first);
    }
  }, []);

  const exportReport = useCallback(() => {
    downloadMarkdown(`${doc.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-engagement.md`, mapReportMarkdown(buildMapReport(doc)));
  }, [doc]);

  const selectedAsset = selectedId ? map.assets.find((asset) => asset.id === selectedId) : undefined;
  const selectedConnection = selectedId ? map.connections.find((entry) => entry.id === selectedId) : undefined;
  const selectedFindings = selectedId ? (overlayContext.findingsByAsset.get(selectedId) ?? []) : [];

  const nameOf = useCallback(
    (assetId: string) => map.assets.find((asset) => asset.id === assetId)?.name ?? assetId,
    [map.assets]
  );

  return (
    <>
      <div className="site-frame map-workspace">
      <SiteMasthead theme={theme} onToggleTheme={onToggleTheme} isMobile={isMobile} />
      <main className="map-workspace-grid">
        <MapSidebar
          doc={doc}
          assets={map.assets}
          selectedId={selectedId}
          showInferred={showInferred}
          onSelect={setSelectedId}
          nameOf={nameOf}
          onToggleInferred={() => setShowInferred((shown) => !shown)}
          onLoadSample={loadSample}
          onImportFile={importFile}
          onRemoveSource={removeSource}
          onExportReport={doc.sources.length > 0 ? exportReport : undefined}
        />

        <div className="map-workspace-canvas">
          {map.assets.length === 0 ? (
            <div className="canvas-empty">
              <strong>Nothing imported yet</strong>
              <p>Import a scan, or load the sample, to see the converged map.</p>
            </div>
          ) : (
            <MapCanvas
              map={map}
              selectedId={selectedId}
              positions={doc.positions}
              fitSignal={fitSignal}
              showInferred={showInferred}
              overlayId={overlayId}
              overlayContext={overlayContext}
              onOverlayChange={setOverlayId}
              onSelect={selectOnCanvas}
              onPlaceAsset={placeAsset}
              onToggleInferred={() => setShowInferred((shown) => !shown)}
              onConnect={beginConnection}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              onToggleConnect={() => {
                setConnectMode((on) => !on);
                setConnectSourceId(null);
              }}
            />
          )}
        </div>

        <MapInspector
          doc={doc}
          asset={selectedAsset}
          connection={selectedConnection}
          findings={selectedFindings}
          nameOf={nameOf}
          onOverride={override}
          onClearOverride={clearOverride}
          onConnectionOverride={overrideConnection}
          onClearConnectionOverride={clearConnectionOverride}
        />

        <MapBottomPanel
          warnings={[
            ...(saveFailed
              ? [
                  "This map could not be saved — the browser refused the write, most likely because storage is full. Export the report before closing the tab."
                ]
              : []),
            ...(importError ? [importError] : []),
            ...map.warnings
          ]}
          events={doc.events}
          nameOf={nameOf}
          onSelect={setSelectedId}
          onRecordEvent={() => setEventDraft({})}
          onDeleteEvent={deleteEvent}
        />

        {/* The twelve analysis tabs, over the converged estate rather than a separate OT document.
            `asOtProject` is a shape adapter, not a conversion, so the panel and every engine behind
            it run unchanged — which is the acceptance criterion the whole unification was aiming at. */}
        <AnalysisPanel
          project={project}
          assessment={overlayContext.assessment}
          reachability={reachability}
          sourceId={pathSource}
          targetId={pathTarget}
          activeFindingId={activeFindingId}
          onSourceChange={setPathSource}
          onTargetChange={setPathTarget}
          onHighlightPath={() => setOverlayId("exposure")}
          onFindingSelect={selectFinding}
          onPrintReport={() => window.print()}
          dockHeight={dockHeight}
          onDockResize={setDockHeight}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((open) => !open)}
          onZoneTargetChange={(zone: ZoneId, target: number) =>
            setGovernance({ zoneTargets: { ...doc.governance.zoneTargets, [zone]: target } })
          }
          onCafOverrideChange={(principle: CafPrincipleId, status: CafStatus | null) => {
            const next = { ...doc.governance.cafOverrides };
            if (status) {
              next[principle] = { status };
            } else {
              delete next[principle];
            }
            setGovernance({ cafOverrides: next });
          }}
          onRiskTreatmentChange={(assetId: string, patch: Partial<RiskTreatment>) =>
            setGovernance({
              riskTreatments: {
                ...doc.governance.riskTreatments,
                [assetId]: {
                  decision: "mitigate",
                  owner: "",
                  targetDate: "",
                  notes: "",
                  ...doc.governance.riskTreatments?.[assetId],
                  ...patch
                }
              }
            })
          }
          onEditGovernance={() => setGovernanceOpen(true)}
          onApplyProject={applySimulation}
        />
      </main>

      <ItLinkDialog
        open={pendingLink !== null}
        sourceName={pendingLink ? nameOf(pendingLink.source) : ""}
        targetName={pendingLink ? nameOf(pendingLink.target) : ""}
        onConfirm={confirmLink}
        onRecordAction={escalateToEvent}
        onCancel={() => {
          setPendingLink(null);
          setConnectMode(false);
        }}
      />

        <GovernanceEditor
          open={governanceOpen}
          engagement={doc.governance.engagement}
          onClose={() => setGovernanceOpen(false)}
          onSave={(engagement: EngagementContext) => {
            setGovernance({ engagement });
            setGovernanceOpen(false);
          }}
        />

        <ItEventDialog
          open={eventDraft !== null}
          nodes={map.assets}
          initial={eventDraft ?? undefined}
          onConfirm={recordEvent}
          onCancel={() => setEventDraft(null)}
        />
      </div>

      {/*
        Outside `.map-workspace`, not merely after it.
        The print rule hides `.map-workspace` so the running UI does not print above the report;
        anywhere inside that element — including "after the main, still in the div" — the report is
        hidden by the very rule that exists to make it printable, and Ctrl+P yields a blank page.
        The IT report shipped with exactly this bug once already.
      */}
      <MapPrintableReport doc={doc} />
    </>
  );
}

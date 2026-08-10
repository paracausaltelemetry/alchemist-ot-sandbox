import { useCallback, useEffect, useMemo, useState } from "react";
import { detectFormat, parseByFormat } from "../import";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { asOtProject, projectMap } from "../engine/mapProjection";
import { buildOverlayContext, type OverlayId } from "../engine/overlays";
import type { MapGrouping } from "../data/mapLayout";
import { applyOverrideDiff, diffToOverrides } from "../engine/mapOverrides";
import { findReachability } from "../engine/reachability";
import {
  newCyberMap,
  newImportSource,
  newAuthoredAsset,
  newUserConnection,
  nextMapSequence,
  type AssetOverride,
  type ConnectionOverride,
  type CyberMapDocument
} from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";
import { readPanelLayout, writePanelLayout, type PanelLayout } from "../lib/panelLayout";
import { PanelRail } from "./PanelRail";
import { buildMapReport } from "../engine/mapReport";
import { mapReportMarkdown } from "../engine/mapReportMarkdown";
import { downloadMarkdown } from "../lib/exporters";
import { loadCyberMap, saveCyberMap } from "../lib/mapStore";
import type {
  CafPrincipleId,
  CafStatus,
  AssetTypeId,
  EngagementContext,
  Finding,
  OtProject,
  Point,
  RiskTreatment,
  ZoneId
} from "../models/types";
import { ItEventDialog, type ItEventDraft } from "./ItEventDialog";
import { ItLinkDialog } from "./ItLinkDialog";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { ToastViewport } from "./ToastViewport";
import { useToasts } from "../hooks/useToasts";
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
  const [showServices, setShowServices] = useState(false);
  const [showEveryLink, setShowEveryLink] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [overlayId, setOverlayId] = useState<OverlayId>("assetClass");
  const [grouping, setGrouping] = useState<MapGrouping>("topology");
  /** The asset the operator is working from. Nothing defaults it — see the movement overlay. */
  const [footholdId, setFootholdId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Which panels are open, remembered between sessions. Not in the document: how somebody likes
  // their sidebar is not part of the estate they are describing, and it would travel with an export.
  const [panels, setPanels] = useState<PanelLayout>(readPanelLayout);
  const togglePanel = useCallback((panel: keyof PanelLayout) => {
    setPanels((open) => {
      const next = { ...open, [panel]: !open[panel] };
      writePanelLayout(next);
      return next;
    });
  }, []);

  const [addingDevice, setAddingDevice] = useState(false);
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
  const overlayContext = useMemo(
    () => buildOverlayContext(map, project, footholdId, doc.events),
    [doc.events, footholdId, map, project]
  );

  const { toasts, push: notify, dismiss: dismissToast } = useToasts();

  const commit = useCallback((next: CyberMapDocument) => {
    setDoc(next);
    // A refused write used to be swallowed here. An accepted import is up to 24MB against roughly
    // 5MB of localStorage, so this genuinely fails — and silently losing an operator's afternoon
    // is the worst thing this application could do. Surfaced as a warning, and the estate stays on
    // screen so the report can still be exported.
    const saved = saveCyberMap(next);
    setSaveFailed((failedBefore) => {
      // Announced on the edge, not on every commit: a failing store fails on all of them, and a
      // toast per keystroke would bury the one message that matters under itself.
      if (!saved && !failedBefore) {
        notify("This map could not be saved. Export the report before closing the tab.", "danger");
      }
      return !saved;
    });
  }, [notify]);

  const addSource = useCallback(
    (text: string, filename: string) => {
      const format = detectFormat(filename, text);
      if (!format) {
        const message = `${filename} is not a format this reads.`;
        setImportError(message);
        notify(message, "danger");
        return;
      }
      const parsed = parseByFormat(text, format);
      if (parsed.hosts.length === 0) {
        // Refused rather than added: an empty source contributes nothing and is indistinguishable
        // afterwards from one whose hosts were merged away, so the operator would never learn the
        // file was wrong.
        const message = `${filename} parsed as ${format} but described no hosts.`;
        setImportError(message);
        notify(message, "danger");
        return;
      }
      setImportError(null);
      const next = {
        ...doc,
        sources: [
          ...doc.sources,
          newImportSource(parsed, filename, nextMapSequence(doc), { kind: "external", label: "External" })
        ]
      };
      commit(next);
      // What the import *added*, not what the file contained: re-scanning a subnet reads fifty
      // hosts and adds none, and "50 hosts read" reports that as progress.
      //
      // "devices", not "hosts". The count is of what appeared on the map, and a first scan of a new
      // segment also puts a gateway there that no host record in the file describes — reporting
      // that as a host would be claiming the file said something it did not.
      const added = projectMap(next).assets.length - map.assets.length;
      notify(
        `${filename}: ${parsed.hosts.length} host${parsed.hosts.length === 1 ? "" : "s"} read, ${
          added === 0 ? "nothing new on the map" : `${added} new device${added === 1 ? "" : "s"} on the map`
        }.`,
        "success"
      );
      setFitSignal((signal) => signal + 1);
    },
    [commit, doc, map.assets.length, notify]
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
      const removed = doc.sources.find((source) => source.id === sourceId);
      commit({ ...doc, sources: doc.sources.filter((source) => source.id !== sourceId) });
      notify(`Removed ${removed?.name ?? "that source"}. Anything you decided about its assets is kept.`);
      setFitSignal((signal) => signal + 1);
    },
    [commit, doc, notify]
  );

  const placeAsset = useCallback(
    (id: string, position: Point, zone?: AssetOverride["zone"]) =>
      commit({
        ...doc,
        // Recorded against the arrangement it was dragged in. The same device has a sensible place
        // in a topology diagram and a different sensible place in a Purdue lane, and one slot
        // cannot hold both without one of them being wrong.
        layouts: { ...doc.layouts, [grouping]: { ...doc.layouts[grouping], [id]: position } },
        // Only the Purdue arrangement's bands mean a zone; a topology drag says nothing about one.
        ...(zone ? { assetOverrides: { ...doc.assetOverrides, [id]: { ...doc.assetOverrides[id], zone } } } : {})
      }),
    [commit, doc, grouping]
  );

  /**
   * Throws away what was dragged in this arrangement and lets the layout decide again.
   *
   * The recovery path, and the reason it is needed: a device dragged somewhere that later stops
   * making sense — because a re-import moved its subnet, or because the arrangement changed under
   * it — is otherwise stuck there with no way back.
   */
  const rearrange = useCallback(() => {
    const { [grouping]: _dropped, ...rest } = doc.layouts;
    commit({ ...doc, layouts: rest });
    setFitSignal((signal) => signal + 1);
  }, [commit, doc, grouping]);

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

  /**
   * Adds a device nobody scanned.
   *
   * Selected on the way in, because the operator has just described a thing and the next question
   * is always what else is known about it — and because a device that appears somewhere on a map of
   * twenty others, unannounced, is a device they now have to hunt for.
   */
  const addDevice = useCallback(
    (device: { name: string; ipAddress: string; type: AssetTypeId; note: string }) => {
      const authored = newAuthoredAsset({
        name: device.name,
        type: device.type,
        ...(device.ipAddress ? { ipAddress: device.ipAddress } : {}),
        ...(device.note ? { note: device.note } : {})
      });
      commit({ ...doc, authoredAssets: [...doc.authoredAssets, authored] });
      setAddingDevice(false);
      setSelectedId(authored.id);
      notify(`Added ${authored.name}. It is yours, not something a scan found.`, "success");
    },
    [commit, doc, notify]
  );

  /**
   * Removes one, and everything keyed to it.
   *
   * Its lines go with it: a connection to a device that is no longer on the map is the dangling
   * case the projection already warns about, and leaving a warning behind as the result of a
   * deliberate delete would be reporting the operator's own decision back to them as a problem.
   */
  const deleteDevice = useCallback(
    (assetId: string) => {
      const { [assetId]: _removed, ...assetOverrides } = doc.assetOverrides;
      commit({
        ...doc,
        authoredAssets: doc.authoredAssets.filter((asset) => asset.id !== assetId),
        connections: doc.connections.filter(
          (connection) => connection.source !== assetId && connection.target !== assetId
        ),
        assetOverrides
      });
      setSelectedId(null);
      notify(`Removed ${doc.authoredAssets.find((asset) => asset.id === assetId)?.name ?? "that device"}.`);
    },
    [commit, doc, notify]
  );

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
      // Clicking the armed device again releases it rather than doing nothing. `beginConnection`
      // silently refused a self-link, which read as the mode being broken.
      if (connectSourceId === id) {
        setConnectSourceId(null);
        return;
      }
      beginConnection(connectSourceId, id);
    },
    [beginConnection, connectMode, connectSourceId]
  );

  /**
   * Escape leaves wiring from anywhere on the page.
   *
   * The canvas had this on its own key handler, which meant it worked only while the canvas held
   * focus — click a device in the sidebar list, press Escape, and you were still armed. A mode you
   * can only leave by finding the button that started it is a mode people stop using. On `window`
   * it is reachable wherever the operator's focus has drifted to.
   *
   * Not while the link dialog is up: there, Escape belongs to the dialog, and stealing it would
   * dismiss the mode and leave the form open over a canvas that no longer explains it.
   */
  useEffect(() => {
    if (!connectMode || pendingLink) {
      return;
    }
    const leave = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setConnectMode(false);
      setConnectSourceId(null);
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [connectMode, pendingLink]);

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
      // Stays on so the next line can be drawn straight away. Somebody documenting what they found
      // draws several in a row, and dropping out of the mode after each one made them re-arm it
      // every time. Escape, or the button, ends it.
      setConnectSourceId(null);
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
    // Recording an action is a change of task, not another line, so wiring ends here.
    setConnectMode(false);
    setConnectSourceId(null);
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
      <main
        className="map-workspace-grid"
        data-sidebar={panels.sidebar ? "open" : "shut"}
        data-inspector={panels.inspector ? "open" : "shut"}
      >
        {panels.sidebar ? (
          <MapSidebar
          doc={doc}
          assets={map.assets}
          selectedId={selectedId}
          showInferred={showInferred}
          onSelect={setSelectedId}
          nameOf={nameOf}
          onToggleInferred={() => setShowInferred((shown) => !shown)}
          onLoadSample={loadSample}
          onAddDevice={() => setAddingDevice(true)}
          onImportFile={importFile}
          onRemoveSource={removeSource}
          onExportReport={doc.sources.length > 0 ? exportReport : undefined}
          onCollapse={() => togglePanel("sidebar")}
        />
        ) : (
          <PanelRail side="left" label="Sources and assets" onExpand={() => togglePanel("sidebar")} />
        )}

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
              positions={doc.layouts[grouping] ?? {}}
              onRearrange={rearrange}
              fitSignal={fitSignal}
              showInferred={showInferred}
              showServices={showServices}
              onToggleServices={() => setShowServices((shown) => !shown)}
              showEveryLink={showEveryLink}
              onToggleEveryLink={() => setShowEveryLink((shown) => !shown)}
              overlayId={overlayId}
              grouping={grouping}
              onGroupingChange={setGrouping}
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

        {panels.inspector ? (
          <MapInspector
          doc={doc}
          asset={selectedAsset}
          connection={selectedConnection}
          findings={selectedFindings}
          nameOf={nameOf}
          foothold={footholdId}
          onSetFoothold={(id) => {
            setFootholdId(id);
            // Switching to the movement overlay on the same click, because naming a foothold and
            // then not seeing it is a step nobody would choose to take separately.
            if (id) {
              setOverlayId("movement");
            }
          }}
          onOverride={override}
          onClearOverride={clearOverride}
          onConnectionOverride={overrideConnection}
          onDeleteAsset={deleteDevice}
          onClearConnectionOverride={clearConnectionOverride}
          onCollapse={() => togglePanel("inspector")}
        />
        ) : (
          <PanelRail side="right" label="Inspector" onExpand={() => togglePanel("inspector")} />
        )}

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
          movement={overlayContext.movement}
          footholdName={footholdId ? nameOf(footholdId) : null}
          open={panels.bottom}
          onToggleOpen={() => togglePanel("bottom")}
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

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <AddDeviceDialog open={addingDevice} onConfirm={addDevice} onCancel={() => setAddingDevice(false)} />

      <ItLinkDialog
        open={pendingLink !== null}
        sourceName={pendingLink ? nameOf(pendingLink.source) : ""}
        targetName={pendingLink ? nameOf(pendingLink.target) : ""}
        onConfirm={confirmLink}
        onRecordAction={escalateToEvent}
        onCancel={() => {
          setPendingLink(null);
          setConnectSourceId(null);
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

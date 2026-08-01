import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { blankProject } from "./data/sampleProject";
import type { AppView } from "./lib/appView";
import { scenarios } from "./data/scenarios";
import { getAssetType } from "./data/catalog";
import {
  ASSET_NODE_HEIGHT,
  ASSET_NODE_WIDTH,
  assetYForZone,
  inferZoneFromY,
  layoutTiered,
  resolveFreePosition,
  snapToGrid
} from "./data/canvasLayout";
import { findReachability } from "./engine/reachability";
import { assessProject } from "./engine/scoring";
import { parseProjectJson, serializeProject } from "./engine/serialization";
import { loadStoredProject, writeStoredProject } from "./lib/projectStorage";
import { getCurrentProjectId, listProjects, openProject } from "./lib/projectStore";
import { downloadJson, downloadTopologySvg } from "./lib/exporters";
import type {
  Asset,
  AssetTypeId,
  CafPrincipleId,
  CafStatus,
  CanvasMode,
  Conduit,
  EngagementContext,
  Finding,
  OtProject,
  Point,
  RiskTreatment,
  Subnet,
  ZoneId
} from "./models/types";
import { createAsset, createConduit, makeId } from "./models/factory";
import type { AssembledTopology } from "./import";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { AppHeader } from "./components/AppHeader";
import { AssetPalette } from "./components/AssetPalette";
import { CollapsedRail } from "./components/CollapsedRail";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { InspectorPanel } from "./components/InspectorPanel";
import { GovernanceEditor } from "./components/GovernanceEditor";
import { KnowledgeBase } from "./components/KnowledgeBase";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { Tour, TOUR_SEEN_KEY } from "./components/Tour";
import { MAX_SHARE_PAYLOAD, buildShareUrl, decodeProjectFromShare, sharePayloadFromHash } from "./engine/shareLink";
import { SubnetManager } from "./components/SubnetManager";
import { ImportWizard } from "./components/ImportWizard";
import { ScenarioGallery } from "./components/ScenarioGallery";
import { PrintableReport } from "./components/PrintableReport";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { ToastViewport } from "./components/ToastViewport";
import { onStorageFailure, safeGetItem } from "./lib/safeStorage";
import { oversizeFileError } from "./lib/modelLimits";
import { TopologyCanvas } from "./components/TopologyCanvas";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePanelLayout } from "./hooks/usePanelLayout";
import { useToasts } from "./hooks/useToasts";

const HISTORY_LIMIT = 30;

function cloneProject(project: OtProject): OtProject {
  return JSON.parse(JSON.stringify(project)) as OtProject;
}

interface AppProps {
  onGoHome: () => void;
  onSwitchView: (view: AppView) => void;
  initialIntent?: "reference" | "methodology" | "tour";
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /** Phone/tablet: the topology canvas is desktop-only, so the workspace renders read-only. */
  isMobile?: boolean;
}

export function App({ onGoHome, onSwitchView, initialIntent, theme, onToggleTheme, isMobile = false }: AppProps) {
  const [project, setProject] = useState<OtProject>(() => loadStoredProject());
  const [history, setHistory] = useState<OtProject[]>([]);
  const [future, setFuture] = useState<OtProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reachSourceId, setReachSourceId] = useState(project.assets[2]?.id ?? project.assets[0]?.id ?? "");
  const [reachTargetId, setReachTargetId] = useState(project.assets.find((asset) => asset.type === "plc-rtu")?.id ?? "");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("clean");
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [subnetManagerOpen, setSubnetManagerOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState(() => listProjects());
  const [currentProjectId, setCurrentProjectId] = useState(() => getCurrentProjectId());
  const [scenarioGalleryOpen, setScenarioGalleryOpen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const { layout, togglePalette, toggleDock, setDockHeight, setLayoutMode } = usePanelLayout();

  const assessment = useMemo(() => assessProject(project), [project]);
  const reachability = useMemo(
    () => findReachability(project, reachSourceId, reachTargetId),
    [project, reachSourceId, reachTargetId]
  );

  const selectedAsset = selectedId ? project.assets.find((asset) => asset.id === selectedId) : undefined;
  const selectedConduit = selectedId ? project.conduits.find((conduit) => conduit.id === selectedId) : undefined;
  const activeFinding = activeFindingId ? assessment.findings.find((finding) => finding.id === activeFindingId) : undefined;
  const highlightedConduitIds = activeFinding?.affectedConduitIds.length ? activeFinding.affectedConduitIds : reachability.pathConduitIds;

  useEffect(() => {
    writeStoredProject(project);
  }, [project]);

  // Storage problems used to be a single console warning. Someone whose browser blocks site data,
  // or whose quota is full, would keep working on an assessment that had quietly stopped saving.
  useEffect(() => onStorageFailure((_, detail) => pushToast(`Alchemist ${detail}`, "danger")), [pushToast]);

  // Open the requested surface when the dashboard launches into a specific intent, and run the
  // guided tour on a first-time visit to the workbench.
  useEffect(() => {
    if (initialIntent === "reference") {
      setKnowledgeBaseOpen(true);
    } else if (initialIntent === "methodology") {
      setMethodologyOpen(true);
    } else if (initialIntent === "tour") {
      setTourOpen(true);
    } else if (!safeGetItem(TOUR_SEEN_KEY)) {
      setTourOpen(true);
    }
    // Run once on mount for the entry intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!project.assets.some((asset) => asset.id === reachSourceId)) {
      setReachSourceId(project.assets[0]?.id ?? "");
    }
    if (!project.assets.some((asset) => asset.id === reachTargetId)) {
      setReachTargetId(project.assets.find((asset) => asset.type === "plc-rtu")?.id ?? project.assets[1]?.id ?? "");
    }
  }, [project.assets, reachSourceId, reachTargetId]);

  const commitProject = useCallback((updater: OtProject | ((current: OtProject) => OtProject), recordHistory = true) => {
    setProject((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const touched = { ...next, updatedAt: new Date().toISOString() };
      if (recordHistory) {
        setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), cloneProject(current)]);
        setFuture([]);
      }
      return touched;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (!previous) {
        return items;
      }
      setProject((current) => {
        setFuture((futureItems) => [cloneProject(current), ...futureItems].slice(0, HISTORY_LIMIT));
        return cloneProject(previous);
      });
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0];
      if (!next) {
        return items;
      }
      setProject((current) => {
        setHistory((historyItems) => [...historyItems.slice(-(HISTORY_LIMIT - 1)), cloneProject(current)]);
        return cloneProject(next);
      });
      return items.slice(1);
    });
  }, []);

  const updateAsset = useCallback(
    (assetId: string, patch: Partial<Asset>) => {
      commitProject((current) => ({
        ...current,
        assets: current.assets.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset))
      }));
    },
    [commitProject]
  );

  const updateConduit = useCallback(
    (conduitId: string, patch: Partial<Conduit>) => {
      commitProject((current) => ({
        ...current,
        conduits: current.conduits.map((conduit) => (conduit.id === conduitId ? { ...conduit, ...patch } : conduit))
      }));
    },
    [commitProject]
  );

  const addAsset = useCallback(
    (typeId: AssetTypeId, position?: Point) => {
      const type = getAssetType(typeId);
      // In the Purdue view a drop's lane sets the zone; in the free network view the zone
      // comes from the asset type. Either way the asset gets a free position the network
      // layout owns (collision-nudged so it never lands on top of an existing node).
      const zone = position && layout.layoutMode === "purdue" ? inferZoneFromY(position.y) : type.defaultZone;
      const desired = position
        ? { x: position.x - ASSET_NODE_WIDTH / 2, y: position.y - ASSET_NODE_HEIGHT / 2 }
        : { x: 96, y: assetYForZone(zone) };
      const point = resolveFreePosition(desired, null, project.assets);
      const asset = createAsset(typeId, point, zone);
      commitProject((current) => ({ ...current, assets: [...current.assets, asset] }));
      setSelectedId(asset.id);
    },
    [commitProject, layout.layoutMode, project.assets]
  );

  const addConduit = useCallback(
    (source: string, target: string) => {
      if (source === target) {
        return null;
      }
      const conduit = createConduit(source, target);
      commitProject((current) => ({ ...current, conduits: [...current.conduits, conduit] }));
      setSelectedId(conduit.id);
      return conduit.id;
    },
    [commitProject]
  );

  const handleAssetClick = useCallback(
    (assetId: string) => {
      if (!connectMode) {
        setSelectedId(assetId);
        return;
      }

      if (!connectSourceId) {
        setConnectSourceId(assetId);
        setSelectedId(assetId);
        return;
      }

      if (connectSourceId === assetId) {
        setConnectSourceId(null);
        return;
      }

      addConduit(connectSourceId, assetId);
      // Stay in connect mode so several conduits can be wired in a row; clear
      // the source so the next click picks a fresh one. Esc or toggling Connect
      // off exits (see the keydown handler / toolbar).
      setConnectSourceId(null);
    },
    [addConduit, connectMode, connectSourceId]
  );

  const handleToggleConnectMode = useCallback(() => {
    setConnectMode((current) => {
      if (current) {
        setConnectSourceId(null);
      }
      return !current;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConnectSourceId(null);
        setConnectMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const renameAsset = useCallback((id: string, name: string) => updateAsset(id, { name }), [updateAsset]);

  const setZoneTarget = useCallback(
    (zone: ZoneId, target: number) => {
      commitProject((current) => ({ ...current, zoneTargets: { ...current.zoneTargets, [zone]: target } }));
    },
    [commitProject]
  );

  const setEngagement = useCallback(
    (engagement: EngagementContext) => {
      commitProject((current) => ({ ...current, engagement }));
      pushToast("Engagement context saved", "success");
    },
    [commitProject, pushToast]
  );

  const setCafOverride = useCallback(
    (principle: CafPrincipleId, status: CafStatus | null) => {
      commitProject((current) => {
        const overrides = { ...(current.cafOverrides ?? {}) };
        if (status === null) {
          delete overrides[principle];
        } else {
          overrides[principle] = { status };
        }
        return { ...current, cafOverrides: overrides };
      });
    },
    [commitProject]
  );

  const setRiskTreatment = useCallback(
    (assetId: string, patch: Partial<RiskTreatment>) => {
      commitProject((current) => {
        const existing = current.riskTreatments?.[assetId];
        const next: RiskTreatment = {
          decision: existing?.decision ?? "mitigate",
          owner: existing?.owner ?? "",
          targetDate: existing?.targetDate ?? "",
          notes: existing?.notes ?? "",
          residual: existing?.residual,
          ...patch
        };
        return { ...current, riskTreatments: { ...(current.riskTreatments ?? {}), [assetId]: next } };
      });
    },
    [commitProject]
  );

  const addSubnet = useCallback(() => {
    const subnet: Subnet = {
      id: makeId("subnet"),
      name: `Subnet ${(project.subnets?.length ?? 0) + 1}`,
      cidr: "",
      vlan: ""
    };
    commitProject((current) => ({ ...current, subnets: [...(current.subnets ?? []), subnet] }));
    return subnet.id;
  }, [commitProject, project.subnets]);

  const updateSubnet = useCallback(
    (subnetId: string, patch: Partial<Subnet>) => {
      commitProject((current) => ({
        ...current,
        subnets: (current.subnets ?? []).map((subnet) => (subnet.id === subnetId ? { ...subnet, ...patch } : subnet))
      }));
    },
    [commitProject]
  );

  const removeSubnet = useCallback(
    (subnetId: string) => {
      commitProject((current) => ({
        ...current,
        subnets: (current.subnets ?? []).filter((subnet) => subnet.id !== subnetId),
        assets: current.assets.map((asset) => (asset.subnetId === subnetId ? { ...asset, subnetId: undefined } : asset))
      }));
    },
    [commitProject]
  );

  const openSubnetManager = useCallback(() => {
    setLayoutMode("network");
    setSubnetManagerOpen(true);
  }, [setLayoutMode]);

  const autoArrangeLayout = useCallback(() => {
    commitProject((current) => {
      const positions = layoutTiered(current.assets, current.subnets ?? [], current.conduits);
      return {
        ...current,
        assets: current.assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position }))
      };
    });
    setLayoutMode("network");
    setFitSignal((value) => value + 1);
    pushToast("Auto-arranged the topology", "info");
  }, [commitProject, pushToast, setLayoutMode]);

  const applyImport = useCallback(
    (result: AssembledTopology, mode: "replace" | "merge") => {
      commitProject((current) => {
        if (mode === "replace") {
          const positions = layoutTiered(result.assets, result.subnets, result.conduits);
          return {
            ...cloneProject(blankProject),
            id: makeId("project"),
            name: "Imported topology",
            assets: result.assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position })),
            conduits: result.conduits,
            subnets: result.subnets,
            updatedAt: new Date().toISOString()
          };
        }
        // Drop the imported block below existing content so the two don't overlap on the canvas.
        const maxY = current.assets.reduce((max, asset) => Math.max(max, asset.position.y), 0);
        const shift = current.assets.length > 0 ? maxY + 220 : 0;
        const shifted = result.assets.map((asset) => ({ ...asset, position: { x: asset.position.x, y: asset.position.y + shift } }));
        return {
          ...current,
          assets: [...current.assets, ...shifted],
          conduits: [...current.conduits, ...result.conduits],
          subnets: [...(current.subnets ?? []), ...result.subnets]
        };
      });
      setLayoutMode("network");
      setSelectedId(null);
      setFitSignal((value) => value + 1);
      pushToast(`Imported ${result.assets.length} assets and ${result.conduits.length} conduits`, "success");
    },
    [commitProject, pushToast, setLayoutMode]
  );

  const confirmSelection = useCallback(() => {
    setSelectedId(null);
    setConnectSourceId(null);
    setConnectMode(false);
  }, []);

  const handleFindingSelect = useCallback((finding: Finding) => {
    setActiveFindingId(finding.id);
    setCanvasMode("risk");
    setSelectedId(finding.affectedConduitIds[0] ?? finding.affectedAssetIds[0] ?? null);
  }, []);

  const importProject = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = parseProjectJson(String(reader.result ?? ""));
        if (!result.ok) {
          pushToast(`Import failed: ${result.errors.join("; ")}`, "danger");
          return;
        }
        commitProject(result.project);
        setSelectedId(null);
        pushToast("Project imported", "success");
      };
      reader.onerror = () => pushToast("Could not read that file", "danger");
      const tooLarge = oversizeFileError(file);
      if (tooLarge) {
        pushToast(tooLarge, "danger");
        return;
      }
      reader.readAsText(file);
    },
    [commitProject, pushToast]
  );

  const handleSwitchProject = useCallback(
    (id: string) => {
      openProject(id);
      commitProject(loadStoredProject(), false);
      setSelectedId(null);
      setSavedProjects(listProjects());
      setCurrentProjectId(getCurrentProjectId());
      pushToast("Switched assessment", "info");
    },
    [commitProject, pushToast]
  );

  // Load a shared model from a #share= link on first mount (overrides the stored project).
  useEffect(() => {
    const payload = sharePayloadFromHash(window.location.hash);
    if (!payload) {
      return;
    }
    let cancelled = false;
    decodeProjectFromShare(payload).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        commitProject(result.project, false);
        setSelectedId(null);
        pushToast("Loaded shared project", "success");
      } else {
        pushToast("Could not load the shared link", "danger");
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount for the incoming share link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    try {
      const url = await buildShareUrl(project);
      await navigator.clipboard.writeText(url);
      pushToast(
        url.length > MAX_SHARE_PAYLOAD
          ? "Share link copied (large model; the link may be too long for some browsers)"
          : "Share link copied to clipboard",
        url.length > MAX_SHARE_PAYLOAD ? "info" : "success"
      );
    } catch {
      pushToast("Could not create a share link", "danger");
    }
  }, [project, pushToast]);

  const handleExportJson = useCallback(() => {
    downloadJson(project.name, serializeProject(project));
    pushToast("Exported project JSON", "success");
  }, [project, pushToast]);

  const handleExportSvg = useCallback(() => {
    downloadTopologySvg(project, assessment);
    pushToast("Exported topology SVG", "success");
  }, [project, assessment, pushToast]);

  const loadScenario = useCallback(
    (scenarioProject: OtProject) => {
      // Scenarios land pre-arranged by the conduit-aware layout so the first
      // impression is a tidy architecture diagram, not the authored scatter.
      const arranged = cloneProject(scenarioProject);
      const positions = layoutTiered(arranged.assets, arranged.subnets ?? [], arranged.conduits);
      arranged.assets = arranged.assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position }));
      commitProject(arranged);
      setSelectedId(null);
      setLayoutMode("network");
      setFitSignal((value) => value + 1);
      pushToast(`Loaded ${scenarioProject.name}`, "info");
    },
    [commitProject, pushToast, setLayoutMode]
  );

  const handleNewBlank = useCallback(() => {
    commitProject(cloneProject(blankProject));
    setSelectedId(null);
    pushToast("Blank project created", "info");
  }, [commitProject, pushToast]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) {
      return;
    }
    const ids = new Set(pendingDelete.ids);
    commitProject((current) => ({
      ...current,
      assets: current.assets.filter((asset) => !ids.has(asset.id)),
      conduits: current.conduits.filter(
        (conduit) => !ids.has(conduit.id) && !ids.has(conduit.source) && !ids.has(conduit.target)
      )
    }));
    pushToast(`Deleted ${pendingDelete.label}`, "info");
    setSelectedId(null);
    setMultiSelectedIds([]);
    setPendingDelete(null);
  }, [pendingDelete, commitProject, pushToast]);

  const requestDelete = useCallback(() => {
    if (multiSelectedIds.length > 1) {
      setPendingDelete({ ids: multiSelectedIds, label: `${multiSelectedIds.length} assets` });
      return;
    }
    if (!selectedId) {
      return;
    }
    setPendingDelete({ ids: [selectedId], label: selectedAsset?.name || selectedConduit?.name || "this item" });
  }, [multiSelectedIds, selectedId, selectedAsset, selectedConduit]);

  const duplicateSelected = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    const clone: Asset = {
      ...selectedAsset,
      id: makeId("asset"),
      name: `${selectedAsset.name} copy`,
      position: resolveFreePosition(
        snapToGrid({ x: selectedAsset.position.x + 48, y: selectedAsset.position.y + 48 }),
        null,
        project.assets
      ),
      protocols: [...selectedAsset.protocols],
      controls: { ...selectedAsset.controls }
    };
    commitProject((current) => ({ ...current, assets: [...current.assets, clone] }));
    setSelectedId(clone.id);
    pushToast("Asset duplicated", "info");
  }, [selectedAsset, commitProject, project.assets, pushToast]);

  useKeyboardShortcuts({
    onCommandPalette: () => setCommandOpen(true),
    onUndo: undo,
    onRedo: redo,
    onDelete: requestDelete,
    onToggleConnect: handleToggleConnectMode,
    onShowShortcuts: () => setShortcutsOpen((open) => !open),
    onDuplicate: duplicateSelected
  });

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "scenarios", label: "Browse sector scenarios…", run: () => setScenarioGalleryOpen(true) },
      ...scenarios.map((scenario) => ({
        id: `scenario-${scenario.id}`,
        label: `Load scenario: ${scenario.name}`,
        hint: scenario.sector,
        run: () => loadScenario(scenario.project)
      })),
      { id: "blank", label: "New blank project", run: handleNewBlank },
      { id: "import", label: "Import project…", hint: "JSON", run: () => importInputRef.current?.click() },
      { id: "import-scan", label: "Import network scan…", hint: "Nmap/Zeek/CSV", run: () => setImportWizardOpen(true) },
      { id: "export-json", label: "Export project JSON", run: handleExportJson },
      { id: "export-svg", label: "Export topology SVG", run: handleExportSvg },
      { id: "print", label: "Print / save PDF report", run: () => window.print() },
      { id: "connect", label: "Toggle connect mode", hint: "C", run: handleToggleConnectMode },
      {
        id: "layout-network",
        label: "Layout: network (free)",
        hint: layout.layoutMode === "network" ? "active" : undefined,
        run: () => setLayoutMode("network")
      },
      {
        id: "layout-purdue",
        label: "Layout: Purdue levels",
        hint: layout.layoutMode === "purdue" ? "active" : undefined,
        run: () => setLayoutMode("purdue")
      },
      { id: "subnets", label: "Manage subnets…", run: openSubnetManager },
      { id: "governance", label: "Edit engagement context…", hint: "GRC", run: () => setGovernanceOpen(true) },
      { id: "knowledge", label: "Open knowledge base…", hint: "Reference", run: () => setKnowledgeBaseOpen(true) },
      { id: "methodology", label: "How Alchemist assesses…", hint: "Method", run: () => setMethodologyOpen(true) },
      { id: "tour", label: "Take the guided tour", hint: "Help", run: () => setTourOpen(true) },
      { id: "arrange", label: "Auto-arrange topology", run: autoArrangeLayout },
      { id: "theme", label: "Toggle light / dark theme", run: onToggleTheme },
      { id: "home", label: "Back to dashboard", hint: "Home", run: onGoHome },
      { id: "open-it", label: "Switch to the IT network mapper", hint: "IT", run: () => onSwitchView("it") },
      { id: "palette", label: layout.paletteOpen ? "Collapse asset palette" : "Expand asset palette", run: togglePalette },
      { id: "dock", label: layout.dockOpen ? "Collapse analysis dock" : "Expand analysis dock", run: toggleDock },
      { id: "shortcuts", label: "Show keyboard shortcuts", hint: "?", run: () => setShortcutsOpen(true) },
      { id: "mode-clean", label: "Canvas: clean view", run: () => setCanvasMode("clean") },
      { id: "mode-protocol", label: "Canvas: protocol view", run: () => setCanvasMode("protocol") },
      { id: "mode-risk", label: "Canvas: risk view", run: () => setCanvasMode("risk") },
      { id: "mode-boundary", label: "Canvas: boundary view", run: () => setCanvasMode("boundary") },
      { id: "mode-path", label: "Canvas: attacker path view", run: () => setCanvasMode("reachability") }
    ];
    if (selectedAsset) {
      list.push({ id: "duplicate", label: "Duplicate selected asset", hint: "Ctrl+D", run: duplicateSelected });
    }
    if (assessment.findings.length > 0) {
      list.push({
        id: "top-finding",
        label: "Go to top finding",
        hint: assessment.findings[0].severity,
        run: () => handleFindingSelect(assessment.findings[0])
      });
    }
    if (history.length > 0) {
      list.push({ id: "undo", label: "Undo", hint: "Ctrl+Z", run: undo });
    }
    if (future.length > 0) {
      list.push({ id: "redo", label: "Redo", hint: "Ctrl+Shift+Z", run: redo });
    }
    return list;
  }, [
    loadScenario,
    handleNewBlank,
    handleExportJson,
    handleExportSvg,
    handleToggleConnectMode,
    togglePalette,
    toggleDock,
    setLayoutMode,
    openSubnetManager,
    autoArrangeLayout,
    layout.paletteOpen,
    layout.dockOpen,
    layout.layoutMode,
    assessment.findings,
    handleFindingSelect,
    history.length,
    future.length,
    undo,
    redo,
    duplicateSelected,
    selectedAsset,
    onToggleTheme,
    onGoHome,
    onSwitchView
  ]);

  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <main className="app-shell">
        <AppHeader
          project={project}
          score={assessment.overallScore}
          theme={theme}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onProjectNameChange={(name) => commitProject((current) => ({ ...current, name }))}
          savedProjects={savedProjects}
          currentProjectId={currentProjectId}
          onSwitchProject={handleSwitchProject}
          onImport={importProject}
          onImportScan={() => setImportWizardOpen(true)}
          onExportJson={handleExportJson}
          onExportSvg={handleExportSvg}
          onCopyShareLink={() => void handleCopyShareLink()}
          onPrintReport={() => window.print()}
          onBrowseScenarios={() => setScenarioGalleryOpen(true)}
          onOpenKnowledgeBase={() => setKnowledgeBaseOpen(true)}
          onOpenMethodology={() => setMethodologyOpen(true)}
          onNewBlank={handleNewBlank}
          onUndo={undo}
          onRedo={redo}
          onToggleTheme={onToggleTheme}
          onGoHome={onGoHome}
          onSwitchView={onSwitchView}
        />

        <section
          id="workspace"
          tabIndex={-1}
          className={`workspace-grid${layout.paletteOpen ? "" : " palette-collapsed"}${
            selectedAsset || selectedConduit ? "" : " inspector-hidden"
          }${isMobile ? " mobile-readonly" : ""}`}
          style={{ "--dock-height": layout.dockOpen ? `${layout.dockHeight}rem` : "auto" } as CSSProperties}
          aria-label="OT network sandbox workspace"
        >
          {isMobile ? null : layout.paletteOpen ? (
            <AssetPalette onAddAsset={addAsset} onCollapse={togglePalette} />
          ) : (
            <CollapsedRail panelClassName="asset-palette" label="Assets" side="left" onExpand={togglePalette} />
          )}
          {isMobile ? (
            <div className="canvas-mobile-notice" role="note">
              <h2>Topology editing is desktop-only</h2>
              <p>
                Building and rearranging the network needs a larger screen and a pointer. Open Alchemist on a desktop to
                edit the topology. Everything below is fully available here: the assessment, findings, standards mapping
                and report.
              </p>
              <p className="canvas-mobile-stats">
                {project.assets.length} assets · {project.conduits.length} conduits · {assessment.findings.length} findings
              </p>
            </div>
          ) : (
            <TopologyCanvas
              project={project}
              assessment={assessment}
              selectedId={selectedId}
              highlightedConduitIds={highlightedConduitIds}
              canvasMode={canvasMode}
              layoutMode={layout.layoutMode}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              canUndo={history.length > 0}
              canRedo={future.length > 0}
              onSelect={setSelectedId}
              onAssetClick={handleAssetClick}
              onCreateAsset={addAsset}
              onCreateConduit={addConduit}
              onProjectChange={commitProject}
              onCanvasModeChange={(mode) => {
                setCanvasMode(mode);
                if (mode !== "risk") {
                  setActiveFindingId(null);
                }
              }}
              onLayoutModeChange={setLayoutMode}
              onManageSubnets={openSubnetManager}
              onAutoArrange={autoArrangeLayout}
              fitSignal={fitSignal}
              onToggleConnectMode={handleToggleConnectMode}
              onFindingSelect={handleFindingSelect}
              onRenameAsset={renameAsset}
              onSelectionChange={setMultiSelectedIds}
              onUndo={undo}
              onRedo={redo}
            />
          )}
          {!isMobile && (selectedAsset || selectedConduit) ? (
            <InspectorPanel
              project={project}
              asset={selectedAsset}
              conduit={selectedConduit}
              onAssetChange={updateAsset}
              onConduitChange={updateConduit}
              onDeleteSelected={requestDelete}
              onConfirmSelected={confirmSelection}
              onCollapse={() => setSelectedId(null)}
            />
          ) : null}
          <AnalysisPanel
            project={project}
            assessment={assessment}
            reachability={reachability}
            sourceId={reachSourceId}
            targetId={reachTargetId}
            canvasMode={canvasMode}
            activeFindingId={activeFindingId}
            onSourceChange={setReachSourceId}
            onTargetChange={setReachTargetId}
            onCanvasModeChange={setCanvasMode}
            onFindingSelect={handleFindingSelect}
            onPrintReport={() => window.print()}
            dockHeight={layout.dockHeight}
            onDockResize={setDockHeight}
            dockOpen={layout.dockOpen}
            onToggleDock={toggleDock}
            onZoneTargetChange={setZoneTarget}
            onCafOverrideChange={setCafOverride}
            onRiskTreatmentChange={setRiskTreatment}
            onEditGovernance={() => setGovernanceOpen(true)}
            onApplyProject={(next) => commitProject(next)}
          />
        </section>
      </main>

      <PrintableReport project={project} assessment={assessment} reachability={reachability} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete from topology"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.label}? Any connected conduits are removed too. You can undo this.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SubnetManager
        open={subnetManagerOpen}
        subnets={project.subnets ?? []}
        assets={project.assets}
        onClose={() => setSubnetManagerOpen(false)}
        onAdd={addSubnet}
        onUpdate={updateSubnet}
        onRemove={removeSubnet}
      />
      <ImportWizard open={importWizardOpen} onClose={() => setImportWizardOpen(false)} onApply={applyImport} />
      <GovernanceEditor
        open={governanceOpen}
        engagement={project.engagement}
        onClose={() => setGovernanceOpen(false)}
        onSave={setEngagement}
      />
      <KnowledgeBase open={knowledgeBaseOpen} onClose={() => setKnowledgeBaseOpen(false)} />
      <MethodologyPanel open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <ScenarioGallery
        open={scenarioGalleryOpen}
        scenarios={scenarios}
        onClose={() => setScenarioGalleryOpen(false)}
        onLoad={loadScenario}
      />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        aria-label="Import project or scan JSON file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            importProject(file);
            event.target.value = "";
          }
        }}
      />
    </>
  );
}

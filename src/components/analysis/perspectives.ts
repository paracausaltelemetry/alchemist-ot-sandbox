import {
  AlertTriangle,
  Crosshair,
  FileText,
  Flame,
  Grid2X2,
  Layers,
  ListFilter,
  Route,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Waypoints,
  type LucideIcon
} from "lucide-react";

export type TabId =
  | "reachability"
  | "attackpath"
  | "rating"
  | "levels"
  | "compliance"
  | "findings"
  | "baseline"
  | "whatif"
  | "attack"
  | "risk"
  | "flows"
  | "matrix"
  | "report";

export interface AnalysisTab {
  id: TabId;
  label: string;
  Icon: LucideIcon;
}

export interface AnalysisTabGroup {
  label: string;
  tabs: AnalysisTab[];
}

export const TAB_GROUPS: AnalysisTabGroup[] = [
  {
    label: "Posture",
    tabs: [
      { id: "rating", label: "Security Rating", Icon: ShieldCheck },
      { id: "levels", label: "62443 FR Signals", Icon: Layers },
      { id: "compliance", label: "CAF Evidence", Icon: Scale },
      { id: "risk", label: "Risk", Icon: Flame },
      { id: "findings", label: "Findings", Icon: AlertTriangle }
    ]
  },
  {
    label: "Improve",
    tabs: [
      { id: "baseline", label: "Baseline", Icon: TrendingUp },
      { id: "whatif", label: "What-if", Icon: SlidersHorizontal }
    ]
  },
  {
    label: "Threat",
    tabs: [
      { id: "attackpath", label: "Attack Path", Icon: Waypoints },
      { id: "attack", label: "ATT&CK Exposure", Icon: Crosshair }
    ]
  },
  {
    label: "Network",
    tabs: [
      { id: "reachability", label: "Reachability", Icon: Route },
      { id: "flows", label: "Flow Table", Icon: ListFilter },
      { id: "matrix", label: "Zone Matrix", Icon: Grid2X2 }
    ]
  },
  {
    label: "Report",
    tabs: [{ id: "report", label: "Report", Icon: FileText }]
  }
];

export const TABS = TAB_GROUPS.flatMap((group) => group.tabs);

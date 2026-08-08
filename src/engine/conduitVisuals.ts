import { resolveProtocolFamily } from "../data/protocols";
import type { CanvasMode, Conduit, Finding, Severity } from "../models/types";

export const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

export const severityColors: Record<Severity, string> = {
  critical: "#e5484d",
  high: "#ff7a45",
  medium: "#d6a617",
  low: "#8e979c"
};

export function conduitPairKey(conduit: Pick<Conduit, "source" | "target">) {
  return [conduit.source, conduit.target].sort().join("::");
}

export function conduitSeverity(conduitId: string, findings: Finding[]): Severity | null {
  let highest: Severity | null = null;
  for (const finding of findings) {
    if (!finding.affectedConduitIds.includes(conduitId)) {
      continue;
    }
    if (!highest || severityRank[finding.severity] > severityRank[highest]) {
      highest = finding.severity;
    }
  }
  return highest;
}

export function conduitParallelOffsets(conduits: Conduit[], spacing = 14): Map<string, number> {
  const grouped = new Map<string, Conduit[]>();

  for (const conduit of conduits) {
    const key = conduitPairKey(conduit);
    grouped.set(key, [...(grouped.get(key) ?? []), conduit]);
  }

  const offsets = new Map<string, number>();
  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => {
      const aFamily = resolveProtocolFamily(a).label;
      const bFamily = resolveProtocolFamily(b).label;
      return `${aFamily}-${a.protocol}-${a.port}-${a.id}`.localeCompare(`${bFamily}-${b.protocol}-${b.port}-${b.id}`);
    });

    const center = (sorted.length - 1) / 2;
    sorted.forEach((conduit, index) => {
      offsets.set(conduit.id, (index - center) * spacing);
    });
  }

  return offsets;
}

export function conduitColor(conduit: Conduit, mode: CanvasMode, findings: Finding[], highlighted: boolean) {
  if (highlighted) {
    return "#e5484d";
  }

  if (mode === "risk") {
    const severity = conduitSeverity(conduit.id, findings);
    return severity ? severityColors[severity] : "#8e979c";
  }

  if (mode === "boundary") {
    return conduit.trustBoundary ? "#e5484d" : "#5d6469";
  }

  return resolveProtocolFamily(conduit).color;
}

export function conduitOpacity(conduit: Conduit, mode: CanvasMode, highlighted: boolean) {
  if (highlighted) {
    return 1;
  }
  if (mode === "reachability") {
    return 0.28;
  }
  if (mode === "boundary" && !conduit.trustBoundary) {
    return 0.22;
  }
  if (mode === "risk") {
    return 0.82;
  }
  if (mode === "clean") {
    return 0.78;
  }
  return 0.92;
}

import type { Finding } from "../models/types";

export interface FindingGroup {
  key: string;
  findings: Finding[];
  representative: Finding;
  affectedAssetIds: string[];
  affectedConduitIds: string[];
}

const unique = (values: string[]) => [...new Set(values)];

/** Groups repeated rule hits for review without changing scoring or finding identity. */
export function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const key = [finding.category, finding.severity, finding.title, finding.remediation].join("|");
    const current = groups.get(key) ?? [];
    current.push(finding);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, grouped]) => ({
    key,
    findings: grouped,
    representative: grouped[0],
    affectedAssetIds: unique(grouped.flatMap((finding) => finding.affectedAssetIds)),
    affectedConduitIds: unique(grouped.flatMap((finding) => finding.affectedConduitIds))
  }));
}

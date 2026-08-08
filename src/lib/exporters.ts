import { getAssetType, getZone, zones } from "../data/catalog";
import { protocolLabel, resolveProtocolFamily } from "../data/protocols";
import { conduitParallelOffsets } from "../engine/conduitVisuals";
import type { OtProject, SecurityAssessment } from "../models/types";

/** Triggers a browser download of `contents`. Shared with the IT exporters. */
export function download(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Escapes text for inclusion in generated SVG. Shared with the IT exporters. */
export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function downloadJson(name: string, contents: string) {
  download(`${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "ot-project"}.json`, contents, "application/json");
}

export function downloadMarkdown(name: string, contents: string) {
  download(`${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "it-network"}.md`, contents, "text/markdown");
}

export function downloadTopologySvg(project: OtProject, assessment: SecurityAssessment) {
  const minX = -40;
  const maxX = Math.max(1180, ...project.assets.map((asset) => asset.position.x + 220));
  const rowHeight = 116;
  const width = maxX - minX + 80;
  const height = zones.length * rowHeight + 96;
  const yByZone = new Map(zones.map((zone, index) => [zone.id, index * rowHeight + 62]));
  const nodeCenters = new Map(
    project.assets.map((asset) => [asset.id, { x: asset.position.x + 86, y: asset.position.y + 36 }])
  );
  const offsets = conduitParallelOffsets(project.conduits, 10);

  const conduitLines = project.conduits
    .map((conduit) => {
      const source = nodeCenters.get(conduit.source);
      const target = nodeCenters.get(conduit.target);
      if (!source || !target) {
        return "";
      }
      const offset = offsets.get(conduit.id) ?? 0;
      const line = offsetLine(source.x, source.y, target.x, target.y, offset);
      const family = resolveProtocolFamily(conduit);
      const label = protocolLabel(conduit);
      const dash = conduit.firewallRule === "unknown" ? ' stroke-dasharray="10 8"' : conduit.firewallRule === "any-any" ? ' stroke-dasharray="2 7"' : "";
      return `<g>
        <line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${family.color}" stroke-width="4" stroke-linecap="round" opacity="0.9"${dash} />
        <text x="${line.labelX + 6}" y="${line.labelY - 6}" font-family="Consolas, monospace" font-size="10" font-weight="700" fill="${family.color}">${escapeXml(label)}</text>
      </g>`;
    })
    .join("");

  const assetNodes = project.assets
    .map((asset) => {
      const type = getAssetType(asset.type);
      const zone = getZone(asset.zone);
      return `<g transform="translate(${asset.position.x}, ${asset.position.y})">
        <rect width="172" height="72" rx="8" fill="#ffffff" stroke="#b7c4d3" stroke-width="1.5" />
        <rect width="6" height="72" rx="3" fill="${zone.riskRank <= 2 ? "#ef4444" : zone.riskRank <= 4 ? "#f59e0b" : "#0f766e"}" />
        <text x="18" y="25" font-family="Inter, Arial" font-size="14" font-weight="700" fill="#182230">${escapeXml(asset.name)}</text>
        <text x="18" y="47" font-family="Inter, Arial" font-size="11" fill="#516074">${escapeXml(type.label)}</text>
        <text x="18" y="63" font-family="Inter, Arial" font-size="10" fill="#667085">${escapeXml(asset.ipAddress || asset.vlan || "metadata incomplete")}</text>
      </g>`;
    })
    .join("");

  const zoneBands = zones
    .map((zone) => {
      const y = yByZone.get(zone.id) ?? 0;
      return `<g>
        <rect x="${minX}" y="${y - 48}" width="${width}" height="${rowHeight - 8}" fill="${zone.color}" opacity="0.78" />
        <text x="${minX + 16}" y="${y - 15}" font-family="Inter, Arial" font-size="18" font-weight="700" fill="#1e293b">${zone.levelLabel}</text>
        <text x="${minX + 16}" y="${y + 9}" font-family="Inter, Arial" font-size="12" fill="#475569">${escapeXml(zone.name)}</text>
      </g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} 0 ${width} ${height}">
    <rect x="${minX}" y="0" width="${width}" height="${height}" fill="#f8fafc" />
    <text x="${minX + 16}" y="34" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#0f172a">${escapeXml(project.name)}</text>
    <text x="${minX + 16}" y="58" font-family="Inter, Arial" font-size="12" fill="#475569">Alchemist OT Sandbox - advisory score ${assessment.overallScore}/100, not certification</text>
    ${zoneBands}
    ${conduitLines}
    ${assetNodes}
  </svg>`;

  download(`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "ot-topology"}.svg`, svg, "image/svg+xml");
}

function offsetLine(sourceX: number, sourceY: number, targetX: number, targetY: number, offset: number) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = (-dy / length) * offset;
  const normalY = (dx / length) * offset;
  const x1 = sourceX + normalX;
  const y1 = sourceY + normalY;
  const x2 = targetX + normalX;
  const y2 = targetY + normalY;
  return {
    x1,
    y1,
    x2,
    y2,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2
  };
}

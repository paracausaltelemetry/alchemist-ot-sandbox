import { IT_NODE_HEIGHT, IT_NODE_WIDTH } from "../data/itLayout";
import { itKindLabel, type ItMap } from "../models/itMap";

/**
 * SVG export for the IT map. Separate from `downloadTopologySvg`, which paints Purdue zone
 * bands and an advisory score across whatever it is given — neither of which means anything
 * for a scanned IT network.
 *
 * `buildItMapSvg` is pure so it can be tested without a DOM; only the download wrapper touches
 * the document.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const MARGIN = 48;
const TITLE_HEIGHT = 72;

export function buildItMapSvg(map: ItMap): string {
  const positions = map.nodes.map((node) => node.position);
  const maxX = Math.max(600, ...positions.map((position) => position.x + IT_NODE_WIDTH));
  const maxY = Math.max(300, ...positions.map((position) => position.y + IT_NODE_HEIGHT));
  const width = maxX + MARGIN * 2;
  const height = maxY + MARGIN * 2 + TITLE_HEIGHT;

  const centre = (id: string) => {
    const node = map.nodes.find((candidate) => candidate.id === id);
    return node ? { x: node.position.x + IT_NODE_WIDTH / 2, y: node.position.y + IT_NODE_HEIGHT / 2 } : null;
  };

  const links = map.links
    .map((link) => {
      const source = centre(link.source);
      const target = centre(link.target);
      if (!source || !target) {
        return "";
      }
      const observed = link.evidence === "traceroute" || link.evidence === "observed-flow";
      const dash = observed ? "" : link.evidence === "same-subnet" ? ' stroke-dasharray="2 6"' : ' stroke-dasharray="9 7"';
      return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="${
        observed ? "#334155" : "#94a3b8"
      }" stroke-width="${observed ? 2 : 1.4}"${dash} />`;
    })
    .join("");

  const nodes = map.nodes
    .map((node) => {
      const ghost = node.origin === "synthetic";
      const subtitle = node.ip || (ghost ? "inferred" : "");
      return `<g class="it-map-node" transform="translate(${node.position.x}, ${node.position.y})">
        <rect width="${IT_NODE_WIDTH}" height="${IT_NODE_HEIGHT}" fill="#ffffff" stroke="${
          ghost ? "#94a3b8" : "#334155"
        }" stroke-width="1.5"${ghost ? ' stroke-dasharray="6 5"' : ""} />
        <text x="14" y="30" font-family="Inter, Arial" font-size="14" font-weight="700" fill="#0f172a">${escapeXml(
          node.name
        )}</text>
        <text x="14" y="52" font-family="Inter, Arial" font-size="11" fill="#475569">${escapeXml(
          itKindLabel(node.kind)
        )}</text>
        <text x="14" y="72" font-family="Consolas, monospace" font-size="10" fill="#64748b">${escapeXml(subtitle)}</text>
      </g>`;
    })
    .join("");

  const traced = map.links.filter((link) => link.evidence === "traceroute").length;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f8fafc" />
    <text x="${MARGIN}" y="40" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#0f172a">${escapeXml(
      map.name
    )}</text>
    <text x="${MARGIN}" y="62" font-family="Inter, Arial" font-size="12" fill="#475569">Alchemist IT network map - ${
      map.nodes.length
    } devices, ${traced} traced link${traced === 1 ? "" : "s"}; dashed links are inferred</text>
    <g transform="translate(0, ${TITLE_HEIGHT})">
      ${links}
      ${nodes}
    </g>
  </svg>`;
}

export function downloadItMapSvg(map: ItMap): void {
  const blob = new Blob([buildItMapSvg(map)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${map.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "it-network-map"}.svg`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

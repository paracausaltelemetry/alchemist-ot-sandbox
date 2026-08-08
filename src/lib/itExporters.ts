import { IT_NODE_HEIGHT, IT_NODE_WIDTH } from "../data/itLayout";
import { download, escapeXml } from "./exporters";
import { isScanEvidence, itKindLabel, type ItMap } from "../models/itMap";

/**
 * SVG export for the IT map. Separate from `downloadTopologySvg`, which paints Purdue zone
 * bands and an advisory score across whatever it is given — neither of which means anything
 * for a scanned IT network.
 *
 * `buildItMapSvg` is pure so it can be tested without a DOM; only the download wrapper touches
 * the document.
 */

const MARGIN = 48;
const TITLE_HEIGHT = 72;

/**
 * Restricts and emphasises a stage map.
 *
 * A per-stage map is the whole map *up to* that stage, not a redraw of a different graph: the
 * reader is following one network changing, and N unrelated pictures would make them re-orient at
 * every section. So everything discovered later is omitted and everything discovered *at* this
 * stage is emphasised, which is the difference between a sequence and a slideshow.
 */
export interface ItMapSvgOptions {
  /** Node ids to draw at full strength; everything else recedes. Omit to emphasise nothing. */
  emphasise?: Set<string>;
  /** Overrides the caption under the title. */
  subtitle?: string;
}

export function buildItMapSvg(map: ItMap, options: ItMapSvgOptions = {}): string {
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
      const observed = isScanEvidence(link.evidence);
      const asserted = link.evidence === "asserted";
      // Solid for anything asserted or observed; weight is what separates the operator's line
      // from the scan's, because the export is monochrome too.
      const dash =
        observed || asserted ? "" : link.evidence === "same-subnet" ? ' stroke-dasharray="2 6"' : ' stroke-dasharray="9 7"';
      return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="${
        observed || asserted ? "#334155" : "#94a3b8"
      }" stroke-width="${asserted ? 3.2 : observed ? 2 : 1.4}"${dash} />`;
    })
    .join("");

  const nodes = map.nodes
    .map((node) => {
      const ghost = node.origin === "synthetic";
      const subtitle = node.ip || (ghost ? "inferred" : "");
      // Emphasis is opacity plus weight, never colour: these documents are printed, and a reader
      // with a monochrome printer must still be able to see which hosts a stage revealed.
      const emphasised = !options.emphasise || options.emphasise.has(node.id);
      return `<g class="it-map-node" transform="translate(${node.position.x}, ${node.position.y})"${
        emphasised ? "" : ' opacity="0.35"'
      }>
        <rect width="${IT_NODE_WIDTH}" height="${IT_NODE_HEIGHT}" fill="#ffffff" stroke="${
          ghost ? "#94a3b8" : "#334155"
        }" stroke-width="${emphasised && options.emphasise ? 3 : 1.5}"${ghost ? ' stroke-dasharray="6 5"' : ""} />
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
    <text x="${MARGIN}" y="62" font-family="Inter, Arial" font-size="12" fill="#475569">${escapeXml(
      options.subtitle ??
        `Alchemist IT network map - ${map.nodes.length} devices, ${traced} traced link${
          traced === 1 ? "" : "s"
        }; dashed links are inferred`
    )}</text>
    <g transform="translate(0, ${TITLE_HEIGHT})">
      ${links}
      ${nodes}
    </g>
  </svg>`;
}

export function downloadItMapSvg(map: ItMap): void {
  const name = `${map.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "it-network-map"}.svg`;
  download(name, buildItMapSvg(map), "image/svg+xml");
}

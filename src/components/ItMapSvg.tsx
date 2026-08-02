import { IT_NODE_HEIGHT, IT_NODE_WIDTH } from "../data/itLayout";
import { isScanEvidence, itKindLabel, type ItMap } from "../models/itMap";

interface ItMapSvgProps {
  map: ItMap;
  subtitle: string;
  /** Node ids drawn at full strength; everything else recedes. Omit to emphasise nothing. */
  emphasise?: Set<string>;
}

/**
 * A stage map, rendered as React rather than as an HTML string.
 *
 * The download path builds the same picture as SVG text in `itExporters`, and it would have been
 * less code to reuse that string here. It would also have meant injecting markup built by
 * concatenation from hostnames that came straight out of a scan file — untrusted input reaching an
 * innerHTML sink, for the sake of avoiding forty lines of JSX. React escapes every value here by
 * construction, so there is nothing left to get wrong.
 *
 * Inline SVG rather than an `<img>` or a data URL because printing must not wait on anything to
 * load: a diagram that has not resolved when the print dialog opens is a blank box in a client
 * deliverable.
 */
const MARGIN = 48;
const TITLE_HEIGHT = 72;

export function ItMapSvg({ map, subtitle, emphasise }: ItMapSvgProps) {
  const positions = map.nodes.map((node) => node.position);
  const width = Math.max(600, ...positions.map((p) => p.x + IT_NODE_WIDTH)) + MARGIN * 2;
  const height = Math.max(300, ...positions.map((p) => p.y + IT_NODE_HEIGHT)) + MARGIN * 2 + TITLE_HEIGHT;

  const centre = (id: string) => {
    const node = map.nodes.find((candidate) => candidate.id === id);
    return node ? { x: node.position.x + IT_NODE_WIDTH / 2, y: node.position.y + IT_NODE_HEIGHT / 2 } : null;
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${map.name}. ${subtitle}`}
    >
      <rect width={width} height={height} fill="#f8fafc" />
      <text x={MARGIN} y={40} fontFamily="Inter, Arial" fontSize={22} fontWeight={800} fill="#0f172a">
        {map.name}
      </text>
      <text x={MARGIN} y={62} fontFamily="Inter, Arial" fontSize={12} fill="#475569">
        {subtitle}
      </text>
      <g transform={`translate(0, ${TITLE_HEIGHT})`}>
        {map.links.map((link) => {
          const source = centre(link.source);
          const target = centre(link.target);
          if (!source || !target) {
            return null;
          }
          const observed = isScanEvidence(link.evidence);
          const asserted = link.evidence === "asserted";
          const attack = link.evidence === "attack";
          return (
            <line
              key={link.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={observed || asserted || attack ? "#334155" : "#94a3b8"}
              strokeWidth={asserted ? 3.2 : attack ? 2.6 : observed ? 2 : 1.4}
              strokeDasharray={
                attack ? "12 4" : observed || asserted ? undefined : link.evidence === "same-subnet" ? "2 6" : "9 7"
              }
            />
          );
        })}
        {map.nodes.map((node) => {
          const ghost = node.origin === "synthetic";
          // Opacity and weight, never colour: these print, and a monochrome printer must still show
          // which hosts a stage revealed.
          const lit = !emphasise || emphasise.has(node.id);
          return (
            <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`} opacity={lit ? 1 : 0.35}>
              <rect
                width={IT_NODE_WIDTH}
                height={IT_NODE_HEIGHT}
                fill="#ffffff"
                stroke={ghost ? "#94a3b8" : "#334155"}
                strokeWidth={lit && emphasise ? 3 : 1.5}
                strokeDasharray={ghost ? "6 5" : undefined}
              />
              <text x={14} y={30} fontFamily="Inter, Arial" fontSize={14} fontWeight={700} fill="#0f172a">
                {node.name}
              </text>
              <text x={14} y={52} fontFamily="Inter, Arial" fontSize={11} fill="#475569">
                {itKindLabel(node.kind)}
              </text>
              <text x={14} y={72} fontFamily="Consolas, monospace" fontSize={10} fill="#64748b">
                {node.ip || (ghost ? "inferred" : "")}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

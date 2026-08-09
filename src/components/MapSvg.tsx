import { DEVICE_HEIGHT, DEVICE_WIDTH } from "../data/mapLayout";
import { getAssetType } from "../data/catalog";
import { isScanEvidence, itKindLabel } from "../models/itMap";
import type { MapStageMap } from "../engine/mapStageMaps";

/**
 * A stage map, rendered as React rather than as an HTML string.
 *
 * Its IT ancestor made the same call and the reason has not changed: these documents interpolate
 * hostnames straight out of a scan file, and building the picture by string concatenation means
 * untrusted input reaching an innerHTML sink. React escapes every value here by construction.
 *
 * Inline SVG rather than an `<img>` or a data URL because printing must not wait on anything to
 * load: a diagram that has not resolved when the print dialog opens is a blank box in a client
 * deliverable.
 *
 * What the IT stage maps could not draw is the Purdue bands, and they are the point. A sequence of
 * pictures showing an attacker arriving at the internet edge and finishing in Supervisory Control
 * says something no list of hostnames does.
 */

const MARGIN = 48;
const TITLE_HEIGHT = 72;
const LABEL_GUTTER = 92;

/** Print colours, fixed rather than themed: this renders onto paper, which has no dark mode. */
const INK = "#0f172a";
const MUTED = "#475569";
const FAINT = "#94a3b8";

export function MapSvg({ stage }: { stage: MapStageMap }) {
  const drawn = stage.assets
    .map((asset) => ({ asset, position: stage.positions.get(asset.id) ?? asset.position }))
    .filter((entry) => Boolean(entry.position));

  const xs = drawn.map((entry) => entry.position.x + DEVICE_WIDTH);
  const ys = drawn.map((entry) => entry.position.y + DEVICE_HEIGHT);
  const width = Math.max(720, ...xs) + MARGIN * 2 + LABEL_GUTTER;
  const height = Math.max(320, ...ys) + MARGIN * 2 + TITLE_HEIGHT;

  const centre = (id: string) => {
    const entry = drawn.find((candidate) => candidate.asset.id === id);
    return entry
      ? { x: entry.position.x + LABEL_GUTTER + DEVICE_WIDTH / 2, y: entry.position.y + DEVICE_HEIGHT / 2 }
      : null;
  };

  // Only the segments that hold something at this stage. A stage-one picture with every later
  // segment drawn empty is mostly whitespace.
  const occupied = new Set(stage.assets.map((asset) => asset.subnetId ?? "unsegmented"));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${stage.name}. ${stage.subtitle}`}
    >
      <rect width={width} height={height} fill="#f8fafc" />
      <text x={MARGIN} y={40} fontFamily="Inter, Arial" fontSize={22} fontWeight={800} fill={INK}>
        {stage.name}
      </text>
      <text x={MARGIN} y={62} fontFamily="Inter, Arial" fontSize={12} fill={MUTED}>
        {stage.subtitle}
      </text>

      <g transform={`translate(0, ${TITLE_HEIGHT})`}>
        {stage.enclosures.map((box) =>
          occupied.has(box.id) ? (
            <g key={box.id}>
              <rect
                x={box.x + LABEL_GUTTER}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="#ffffff"
                stroke={FAINT}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={box.x + LABEL_GUTTER + 14}
                y={box.y + 22}
                fontFamily="Inter, Arial"
                fontSize={11}
                fontWeight={700}
                fill={MUTED}
              >
                {box.label}
              </text>
            </g>
          ) : null
        )}

        {stage.connections.map((connection) => {
          const source = centre(connection.source);
          const target = centre(connection.target);
          if (!source || !target) {
            return null;
          }
          const observed = isScanEvidence(connection.evidence);
          const asserted = connection.evidence === "asserted";
          const attack = connection.evidence === "attack";
          return (
            <line
              key={connection.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={observed || asserted || attack ? "#334155" : FAINT}
              strokeWidth={asserted ? 3.2 : attack ? 2.6 : observed ? 2 : 1.4}
              strokeDasharray={
                attack
                  ? "12 4"
                  : observed || asserted
                    ? undefined
                    : connection.evidence === "same-subnet"
                      ? "2 6"
                      : "9 7"
              }
            />
          );
        })}

        {drawn.map(({ asset, position }) => {
          const inferred = asset.confidence < 1;
          // Opacity and weight, never colour: these print, and a monochrome printer must still show
          // which assets a stage revealed.
          const lit = !stage.emphasise || stage.emphasise.has(asset.id);
          return (
            <g
              key={asset.id}
              transform={`translate(${position.x + LABEL_GUTTER}, ${position.y})`}
              opacity={lit ? 1 : 0.35}
            >
              <rect
                width={DEVICE_WIDTH}
                height={DEVICE_HEIGHT}
                fill="#ffffff"
                stroke={inferred ? FAINT : "#334155"}
                strokeWidth={lit && stage.emphasise ? 3 : 1.5}
                strokeDasharray={inferred ? "6 5" : undefined}
              />
              <text x={14} y={30} fontFamily="Inter, Arial" fontSize={14} fontWeight={700} fill={INK}>
                {asset.name}
              </text>
              <text x={14} y={52} fontFamily="Inter, Arial" fontSize={11} fill={MUTED}>
                {/* Both vocabularies, the same as on the canvas: what the scan saw it as, and what
                    it is to the process. */}
                {asset.deviceKind ? `${itKindLabel(asset.deviceKind)} · ` : ""}
                {getAssetType(asset.type).label}
              </text>
              <text x={14} y={72} fontFamily="Consolas, monospace" fontSize={10} fill="#64748b">
                {asset.ipAddress || (inferred ? "inferred" : "")}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

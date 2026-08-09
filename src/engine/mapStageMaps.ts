import { layoutMap, type MapEnclosure } from "../data/mapLayout";
import { accessByNode, attackLinks, orderedEvents } from "./itAccess";
import { blankConnection, projectMap } from "./mapProjection";
import { stageNodesBySource } from "./mapStageNodes";
import type { CyberMapDocument, MapAsset, MapConnection } from "../models/cyberMap";
import type { Point } from "../models/types";

/**
 * One picture per stage: the estate as it stood then, cumulative and emphasised.
 *
 * Cumulative rather than N independent redraws, because the reader is following one estate
 * changing over time. Everything discovered after the stage is omitted, everything discovered *at*
 * it is emphasised, and the attack edges drawn are only the ones that had happened by then.
 *
 * Positions come from `layoutMapAssets` over the *whole* estate, not from re-laying out each
 * stage's subset. A card that moves between stage two and stage three because a later import
 * changed how a lane packs makes the reader hunt for it, and the sequence stops reading as one
 * network changing.
 */

/**
 * A stage as data, not as markup.
 *
 * Its IT ancestor returned data for the same reason and it still holds: these documents
 * interpolate hostnames straight out of a scan file, and a pre-built HTML string would have to be
 * injected — untrusted input reaching an innerHTML sink. A renderer that takes data escapes every
 * value by construction.
 */
export interface MapStageMap {
  sequence: number;
  title: string;
  subtitle: string;
  name: string;
  assets: MapAsset[];
  connections: MapConnection[];
  positions: Map<string, Point>;
  /** The subnet boxes the picture is drawn in, so the renderer does not re-derive them. */
  enclosures: MapEnclosure[];
  /** Asset ids to draw at full strength; everything else recedes. */
  emphasise?: Set<string>;
}

export function buildMapStageMaps(doc: CyberMapDocument): MapStageMap[] {
  const projected = projectMap(doc);
  if (projected.assets.length === 0) {
    return [];
  }

  const { positions, enclosures } = layoutMap(projected.assets, doc.layouts.topology ?? {}, "topology", projected.subnets);
  const stageNodes = stageNodesBySource(doc);
  const events = orderedEvents(doc.events);

  const stages = [
    ...doc.sources.map((source) => ({
      sequence: source.sequence,
      title: `Import: ${source.name}`,
      isImport: true
    })),
    ...events.map((event) => ({ sequence: event.sequence, title: event.title, isImport: false }))
  ].sort((a, b) => a.sequence - b.sequence);

  const cumulative = new Set<string>();
  return stages.map((stage) => {
    for (const [sequence, nodes] of stageNodes) {
      if (sequence <= stage.sequence) {
        nodes.present.forEach((id) => cumulative.add(id));
      }
    }
    const present = new Set(projected.assets.filter((asset) => cumulative.has(asset.id)).map((asset) => asset.id));
    const access = accessByNode(doc.events, stage.sequence);

    const emphasise = stage.isImport
      ? (stageNodes.get(stage.sequence)?.revealed ?? new Set<string>())
      : new Set([...access.keys()].filter((id) => present.has(id)));

    return {
      sequence: stage.sequence,
      title: stage.title,
      name: `Stage ${stage.sequence} — ${stage.title}`,
      assets: projected.assets.filter((asset) => present.has(asset.id)),
      connections: [
        ...projected.connections.filter(
          (connection) =>
            connection.evidence !== "attack" && present.has(connection.source) && present.has(connection.target)
        ),
        // Re-derived at this sequence rather than filtered from the finished map, so a stage never
        // shows an arrow for something that had not happened yet.
        ...attackLinks(doc.events, present, stage.sequence).map(
          (link): MapConnection => ({
            ...blankConnection(link.id, link.source, link.target),
            name: link.label ?? "",
            provenance: "authored",
            evidence: "attack"
          })
        )
      ],
      positions,
      enclosures,
      emphasise: emphasise.size > 0 ? emphasise : undefined,
      subtitle: stage.isImport
        ? `${emphasise.size} asset${emphasise.size === 1 ? "" : "s"} first seen at this stage`
        : `Access held after this stage: ${access.size} asset${access.size === 1 ? "" : "s"}`
    };
  });
}

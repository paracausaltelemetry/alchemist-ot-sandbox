import { accessByNode, attackLinks, orderedEvents } from "./itAccess";
import { projectEngagement } from "./itProjection";
import { stageNodesByScan } from "./itStageNodes";
import type { ItEngagement } from "../models/itEngagement";
import type { ItMap } from "../models/itMap";

/**
 * One SVG per stage: the map as it stood then, cumulative and emphasised.
 *
 * Cumulative rather than N independent redraws, because the reader is following one network
 * changing over time. Everything discovered after the stage is omitted, everything discovered *at*
 * it is emphasised, and the attack edges drawn are only the ones that had happened by then.
 */

/**
 * A stage as data, not as markup.
 *
 * Two renderers consume this: a React `<svg>` for the print document and the string builder in
 * `itExporters` for the download. Returning a pre-built HTML string instead would mean the print
 * path had to inject it, and these documents interpolate hostnames straight out of a scan file —
 * untrusted input that should never reach an innerHTML sink at all.
 */
export interface ItStageMap {
  sequence: number;
  title: string;
  subtitle: string;
  map: ItMap;
  /** Node ids to draw at full strength; everything else recedes. */
  emphasise?: Set<string>;
}

export function buildItStageMaps(engagement: ItEngagement): ItStageMap[] {
  const { map } = projectEngagement(engagement);
  if (!map) {
    return [];
  }

  const stageNodes = stageNodesByScan(engagement);
  const events = orderedEvents(engagement.events);
  const stages = [
    ...engagement.scans.map((scan) => ({ sequence: scan.sequence, title: `Scan: ${scan.name}`, isScan: true })),
    ...events.map((event) => ({ sequence: event.sequence, title: event.title, isScan: false }))
  ].sort((a, b) => a.sequence - b.sequence);

  const cumulative = new Set<string>();
  return stages.map((stage) => {
    for (const [sequence, nodes] of stageNodes) {
      if (sequence <= stage.sequence) {
        nodes.present.forEach((id) => cumulative.add(id));
      }
    }
    const present = new Set(map.nodes.filter((node) => cumulative.has(node.id)).map((node) => node.id));
    const access = accessByNode(engagement.events, stage.sequence);

    const stageMap: ItMap = {
      ...map,
      name: `Stage ${stage.sequence} — ${stage.title}`,
      nodes: map.nodes.filter((node) => present.has(node.id)),
      links: [
        ...map.links.filter(
          (link) => link.evidence !== "attack" && present.has(link.source) && present.has(link.target)
        ),
        ...attackLinks(engagement.events, present, stage.sequence)
      ]
    };

    const emphasise = stage.isScan
      ? (stageNodes.get(stage.sequence)?.revealed ?? new Set<string>())
      : new Set([...access.keys()].filter((id) => present.has(id)));

    return {
      sequence: stage.sequence,
      title: stage.title,
      map: stageMap,
      emphasise: emphasise.size > 0 ? emphasise : undefined,
      subtitle: stage.isScan
        ? `${emphasise.size} host${emphasise.size === 1 ? "" : "s"} first seen at this stage`
        : `Access held after this stage: ${access.size} host${access.size === 1 ? "" : "s"}`
    };
  });
}

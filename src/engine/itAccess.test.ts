import { describe, expect, it } from "vitest";
import { accessByNode, attackLinks, highestAccess, longestAttackChain } from "./itAccess";
import { projectEngagement } from "./itProjection";
import { parseItEngagementJson, serializeItEngagement } from "./itSerialization";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { EXTERNAL_ORIGIN, newItEngagement, newItEvent, newItScan, type ItEngagement, type ItEvent } from "../models/itEngagement";

const A = "it:198.51.100.10";
const B = "it:10.10.2.40";
const C = "it:10.10.1.10";

function event(sequence: number, rest: Partial<ItEvent>): ItEvent {
  return { ...newItEvent("exploit", `stage ${sequence}`, sequence), ...rest };
}

function engagementWith(events: ItEvent[]): ItEngagement {
  return {
    ...newItEngagement("Test"),
    scans: [newItScan(parseNmapNormal(SAMPLE_SCAN), "sample.txt", 1)],
    events
  };
}

describe("access folded from the journal", () => {
  it("is empty until something is recorded", () => {
    expect(accessByNode([]).size).toBe(0);
  });

  it("takes the highest rung any event reached", () => {
    const access = accessByNode([
      event(2, { targetNodeId: A, grants: "user" }),
      event(3, { targetNodeId: A, grants: "admin" })
    ]);
    expect(access.get(A)).toBe("admin");
  });

  it("never goes backwards, whatever order the events are stored in", () => {
    // Monotone by construction: access is reached and not un-reached. A later event recording a
    // lesser foothold must not downgrade what an earlier one already established.
    const access = accessByNode([
      event(3, { targetNodeId: A, grants: "admin" }),
      event(2, { targetNodeId: A, grants: "credentialed" })
    ]);
    expect(access.get(A)).toBe("admin");
  });

  it("gives the map as it stood at an earlier stage", () => {
    // The reason access is never stored: a stored value renders the end and nothing else.
    const events = [
      event(2, { targetNodeId: A, grants: "user" }),
      event(4, { targetNodeId: B, grants: "admin" })
    ];
    expect(accessByNode(events, 2).get(B)).toBeUndefined();
    expect(accessByNode(events, 4).get(B)).toBe("admin");
  });

  it("ignores an event that reached nothing", () => {
    expect(accessByNode([event(2, { targetNodeId: A })]).get(A)).toBeUndefined();
  });

  it("compares rungs by the ladder, not alphabetically", () => {
    expect(highestAccess("admin", "credentialed")).toBe("admin");
    expect(highestAccess("identified", "user")).toBe("user");
  });
});

describe("attack edges derived from the journal", () => {
  const nodeIds = new Set([A, B, C]);

  it("draws one line per action that has both ends", () => {
    const links = attackLinks([event(2, { sourceNodeId: A, targetNodeId: B, title: "Exploited SMB" })], nodeIds);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source: A, target: B, evidence: "attack", label: "Exploited SMB" });
  });

  it("draws nothing for an action from outside the map", () => {
    // The stage still appears in the journal and the report; there is simply no node to start from.
    expect(attackLinks([event(2, { sourceNodeId: EXTERNAL_ORIGIN, targetNodeId: A })], nodeIds)).toEqual([]);
  });

  it("draws nothing for an action against no single host", () => {
    expect(attackLinks([event(2, { sourceNodeId: A })], nodeIds)).toEqual([]);
  });

  it("skips an event naming a host no scan produced", () => {
    expect(attackLinks([event(2, { sourceNodeId: A, targetNodeId: "it:203.0.113.99" })], nodeIds)).toEqual([]);
  });

  it("disappears when its event is deleted, because it was never stored", () => {
    const engagement = engagementWith([event(2, { sourceNodeId: A, targetNodeId: B, title: "Exploited SMB" })]);
    expect(projectEngagement(engagement).map!.links.some((link) => link.evidence === "attack")).toBe(true);

    const pruned = { ...engagement, events: [] };
    expect(projectEngagement(pruned).map!.links.some((link) => link.evidence === "attack")).toBe(false);
  });
});

describe("the attack chain", () => {
  it("follows the pivot from outside inwards", () => {
    const chain = longestAttackChain([
      event(2, { sourceNodeId: EXTERNAL_ORIGIN, targetNodeId: A, grants: "user" }),
      event(3, { sourceNodeId: A, targetNodeId: B, grants: "admin" }),
      event(4, { sourceNodeId: B, targetNodeId: C, grants: "user" })
    ]);
    expect(chain).toEqual([A, B, C]);
  });

  it("does not count a step that reached nothing", () => {
    const chain = longestAttackChain([
      event(2, { sourceNodeId: EXTERNAL_ORIGIN, targetNodeId: A, grants: "user" }),
      event(3, { sourceNodeId: A, targetNodeId: B })
    ]);
    expect(chain).toEqual([A]);
  });
});

describe("journal persistence", () => {
  it("round-trips an event with everything on it", () => {
    const full = event(2, {
      kind: "exploit",
      sourceNodeId: A,
      targetNodeId: B,
      grants: "admin",
      cve: "CVE-2017-0144",
      attackTechnique: "Pass-the-hash",
      note: "SYSTEM on the first try."
    });
    const parsed = parseItEngagementJson(serializeItEngagement(engagementWith([full])));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.engagement.events[0]).toMatchObject({
        kind: "exploit",
        grants: "admin",
        cve: "CVE-2017-0144",
        attackTechnique: "Pass-the-hash"
      });
    }
  });

  it("drops an event with an unrecognised kind rather than relabelling it", () => {
    const raw = JSON.parse(serializeItEngagement(engagementWith([event(2, { targetNodeId: A })])));
    raw.events[0].kind = "sorcery";
    const parsed = parseItEngagementJson(JSON.stringify(raw));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.engagement.events).toEqual([]);
    }
  });

  it("drops an event with no title, which would print blank in the report", () => {
    const raw = JSON.parse(serializeItEngagement(engagementWith([event(2, { targetNodeId: A })])));
    delete raw.events[0].title;
    const parsed = parseItEngagementJson(JSON.stringify(raw));

    expect(parsed.ok && parsed.engagement.events).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { projectEngagement } from "./itProjection";
import { promoteToOtProject } from "./itToOt";
import { parseItEngagementJson, serializeItEngagement } from "./itSerialization";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { isItLinkId, itEvidenceLabel, type ItLinkEvidence } from "../models/itMap";
import { newItEngagement, newItScan, newItUserLink, type ItEngagement } from "../models/itEngagement";

function sampleEngagement(): ItEngagement {
  return { ...newItEngagement("Sample"), scans: [newItScan(parseNmapNormal(SAMPLE_SCAN), "sample.txt", 1)] };
}

/** Two hosts that are on the sample map but not linked to each other by any scan evidence. */
const A = "it:10.10.1.10";
const B = "it:10.10.2.40";

describe("links the operator draws", () => {
  it("appears on the map as its own kind of evidence", () => {
    const engagement = { ...sampleEngagement(), userLinks: [newItUserLink(A, B, "Management trunk")] };
    const link = projectEngagement(engagement).map!.links.find((entry) => entry.source === A && entry.target === B);

    expect(link?.evidence).toBe("asserted");
    expect(link?.label).toBe("Management trunk");
  });

  it("outranks our reasoning but not the scan's own evidence", () => {
    // The map should never present an operator's assertion as something the scan traced, nor let
    // an inference override what they said they saw.
    const rank = (evidence: ItLinkEvidence) => ["traceroute", "observed-flow", "asserted", "same-subnet", "inferred"].indexOf(evidence);
    expect(rank("asserted")).toBeGreaterThan(rank("traceroute"));
    expect(rank("asserted")).toBeLessThan(rank("inferred"));
  });

  it("is described in its own words rather than as an inference", () => {
    // The label lookup used to have a `default` branch, which would have read "Inferred from
    // addressing" for a link the operator drew — on the map and on every promoted OT conduit.
    expect(itEvidenceLabel("asserted")).toBe("Drawn by the operator");
  });

  it("survives a save and reload", () => {
    const engagement = { ...sampleEngagement(), userLinks: [newItUserLink(A, B, "Management trunk", "Seen in the config.")] };
    const parsed = parseItEngagementJson(serializeItEngagement(engagement));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.engagement.userLinks).toEqual([
        { id: `link:user:${A}->${B}`, source: A, target: B, label: "Management trunk", note: "Seen in the config." }
      ]);
    }
  });

  it("is recognisable as a link id, so the inspector can find it", () => {
    // Selection carries one id for nodes and links alike, and `isItLinkId` is what separates them.
    // An authored id outside that convention selects on the canvas and shows nothing in the panel —
    // the same defect the derived links had, reintroduced for the ones the operator cares most about.
    expect(isItLinkId(newItUserLink(A, B).id)).toBe(true);
  });

  it("does not stack when the same pair is drawn twice", () => {
    const first = newItUserLink(A, B, "Guess");
    const second = newItUserLink(A, B, "Management trunk");
    expect(second.id).toBe(first.id);
  });

  it("is dropped with a warning when a scan removal takes its endpoints away", () => {
    // Not corruption — the ordinary consequence of editing the evidence. Rejecting the whole
    // engagement would make removing a scan unrecoverable.
    const engagement = { ...sampleEngagement(), userLinks: [newItUserLink(A, "it:203.0.113.99", "Pivot path")] };
    const { map } = projectEngagement(engagement);

    expect(map!.links.some((link) => link.evidence === "asserted")).toBe(false);
    expect(map!.warnings.some((warning) => /link you drew is not shown/i.test(warning))).toBe(true);
  });

  it("becomes a conduit when the map is promoted to an OT assessment", () => {
    const engagement = { ...sampleEngagement(), userLinks: [newItUserLink(A, B, "Management trunk")] };
    const { project } = promoteToOtProject(projectEngagement(engagement).map!);

    expect(project.conduits.some((conduit) => conduit.name === "Drawn by the operator")).toBe(true);
  });

  it("is not hidden by the inferred toggle, which hides our reasoning and not theirs", () => {
    const engagement = { ...sampleEngagement(), userLinks: [newItUserLink(A, B, "Management trunk")] };
    const link = projectEngagement(engagement).map!.links.find((entry) => entry.source === A);
    expect(link?.evidence).not.toBe("inferred");
  });
});

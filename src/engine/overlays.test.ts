import { describe, expect, it } from "vitest";
import { bucketsFor, buildOverlayContext, getOverlay, overlays } from "./overlays";
import { asOtProject, projectMap } from "./mapProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newCyberMap, newImportSource, nextMapSequence } from "../models/cyberMap";
import type { MapAsset, MapConnection } from "../models/cyberMap";
import type { OverlayContext } from "./overlays";

function sampleEstate() {
  const base = newCyberMap("Overlay test");
  const doc = {
    ...base,
    sources: [
      newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
        kind: "external" as const,
        label: "External"
      })
    ]
  };
  const map = projectMap(doc);
  const project = asOtProject(doc, map);
  return { doc, map, project, context: buildOverlayContext(map, project) };
}

const { map, context } = sampleEstate();
const subjects: Array<MapAsset | MapConnection> = [...map.assets, ...map.connections];

describe("the overlay registry", () => {
  it("offers the nine overlays the canvas switches between", () => {
    expect(overlays).toHaveLength(9);
    expect(new Set(overlays.map((overlay) => overlay.id)).size).toBe(9);
  });

  it("can only return a bucket it publishes, so the legend cannot drift from the canvas", () => {
    // The reason the registry exists. Under the old mode unions the legend was written out by hand
    // beside the switch that coloured the canvas, and the two could disagree silently.
    for (const overlay of overlays) {
      for (const subject of subjects) {
        const bucket = overlay.bucketFor(subject, context);
        if (bucket) {
          expect(overlay.buckets).toContain(bucket);
        }
      }
    }
  });

  it("gives every overlay a legend and every bucket a distinct label", () => {
    for (const overlay of overlays) {
      expect(overlay.buckets.length).toBeGreaterThan(1);
      expect(new Set(overlay.buckets.map((bucket) => bucket.label)).size).toBe(overlay.buckets.length);
    }
  });
});

describe("encoding rather than palette", () => {
  it("ramps ordinal overlays from faintest to strongest", () => {
    for (const overlay of overlays.filter((entry) => entry.buckets.every((bucket) => !bucket.pattern))) {
      const weights = overlay.buckets.map((bucket) => bucket.weight);
      expect(weights[0]).toBe(0);
      expect(weights[weights.length - 1]).toBe(1);
      expect([...weights].sort((a, b) => a - b)).toEqual(weights);
    }
  });

  it("spends the one colour only where the top band means danger", () => {
    // `--signal` is the brand's only colour and it means danger. A red top band on "Purdue level"
    // or "operating system" would be the canvas asserting a judgement the data does not contain.
    const withSignal = overlays.filter((overlay) => overlay.buckets.some((bucket) => bucket.signal));
    expect(withSignal.map((overlay) => overlay.id).sort()).toEqual([
      "boundary",
      "criticality",
      "exposure",
      "sl62443",
      "vulnerability"
    ]);
  });

  it("never signals more than the single top band", () => {
    for (const overlay of overlays) {
      expect(overlay.buckets.filter((bucket) => bucket.signal).length).toBeLessThanOrEqual(1);
      const signalled = overlay.buckets.findIndex((bucket) => bucket.signal);
      if (signalled >= 0) {
        expect(signalled).toBe(overlay.buckets.length - 1);
      }
    }
  });

  it("encodes categorical overlays with a pattern and never with a position on the ramp", () => {
    for (const overlay of overlays.filter((entry) => entry.buckets.some((bucket) => bucket.pattern))) {
      for (const bucket of overlay.buckets) {
        expect(bucket.pattern).toBeDefined();
        expect(bucket.weight).toBe(0);
        expect(bucket.signal).toBe(false);
      }
      expect(new Set(overlay.buckets.map((bucket) => bucket.pattern)).size).toBe(overlay.buckets.length);
    }
  });
});

describe("what each overlay says about the sample estate", () => {
  it("puts the internet at the strong end of the Purdue ramp and the process at the faint end", () => {
    const purdue = getOverlay("purdue");
    expect(purdue.buckets[purdue.buckets.length - 1].id).toBe("internet");
    expect(purdue.buckets[0].id).toBe("level0");
  });

  it("has nothing to say about the internet under 62443, rather than something flattering", () => {
    // An empty population satisfies every `Array.every` rung vacuously. The internet is not a zone
    // of the system under consideration, so the honest answer is no bucket at all.
    const internet = map.assets.find((asset) => asset.zone === "internet")!;
    expect(getOverlay("sl62443").bucketFor(internet, context)).toBeNull();
  });

  it("flags the externally reachable hosts under exposure", () => {
    const buckets = bucketsFor(getOverlay("exposure"), map.assets, context);
    const external = map.assets.filter((asset) => /^198\.51\.100\./.test(asset.ipAddress));

    expect(external.length).toBeGreaterThan(0);
    for (const asset of external) {
      expect(buckets.get(asset.id)?.id).not.toBe("none");
    }
  });

  it("gives an asset nothing was found on its own faint band rather than dropping it", () => {
    // Every asset in this fixture is named by at least one finding, so the case is made rather
    // than found: an asset nothing has been said about must not vanish from the overlay whose
    // whole subject is what is wrong with the estate.
    const vulnerability = getOverlay("vulnerability");
    const clean = { ...map.assets[0], id: "asset-nobody-has-assessed" };

    expect(context.findingsByAsset.has(clean.id)).toBe(false);
    expect(vulnerability.bucketFor(clean, context)?.id).toBe("none");
    expect(vulnerability.buckets[0].id).toBe("none");
  });

  it("buckets a connection under the boundary overlay and an asset not at all", () => {
    const boundary = getOverlay("boundary");
    expect(boundary.bucketFor(map.connections[0], context)).not.toBeNull();
    expect(boundary.bucketFor(map.assets[0], context)).toBeNull();
  });

  it("buckets an asset under the asset overlays and a connection not at all", () => {
    for (const overlay of overlays.filter((entry) => entry.appliesTo === "asset")) {
      expect(overlay.bucketFor(map.connections[0], context)).toBeNull();
    }
  });

  it("reads the operating system off the asset rather than out of a note", () => {
    const windows = map.assets.find((asset) => /windows/i.test(asset.os ?? ""));
    if (windows) {
      expect(getOverlay("os").bucketFor(windows, context)?.id).toBe("windows");
    }
    const unknown = map.assets.find((asset) => !asset.os);
    expect(getOverlay("os").bucketFor(unknown!, context)?.id).toBe("unknown");
  });
});

describe("the overlay context", () => {
  it("is built once and shared, so switching overlay is not a re-assessment", () => {
    const built: OverlayContext = context;
    expect(built.assessment.findings.length).toBeGreaterThan(0);
    expect(built.exposure.size).toBe(map.assets.length);
    expect(built.securityLevels.zones.some((zone) => zone.modelled)).toBe(true);
  });
});

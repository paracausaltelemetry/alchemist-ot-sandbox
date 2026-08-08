import { describe, expect, it } from "vitest";
import { decodeProjectFromShare, encodeProjectToShare, sharePayloadFromHash, SHARE_HASH_PREFIX } from "./shareLink";
import { sampleProject } from "../data/sampleProject";

describe("shareLink", () => {
  it("round-trips a project through encode and decode", async () => {
    const payload = await encodeProjectToShare(sampleProject);
    expect(payload).not.toContain("=");
    const result = await decodeProjectFromShare(payload);
    expect(result.ok).toBe(true);
    expect(result.project?.assets.length).toBe(sampleProject.assets.length);
    expect(result.project?.conduits.length).toBe(sampleProject.conduits.length);
    expect(result.project?.name).toBe(sampleProject.name);
  });

  it("compresses well below the raw JSON size", async () => {
    const payload = await encodeProjectToShare(sampleProject);
    const rawLength = JSON.stringify(sampleProject).length;
    expect(payload.length).toBeLessThan(rawLength);
  });

  it("returns an error for a malformed payload instead of throwing", async () => {
    const result = await decodeProjectFromShare("not-a-valid-payload");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("extracts the payload from a share hash", () => {
    expect(sharePayloadFromHash(`${SHARE_HASH_PREFIX}abc123`)).toBe("abc123");
    expect(sharePayloadFromHash("#app")).toBeNull();
  });
});

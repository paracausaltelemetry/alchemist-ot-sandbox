import { describe, expect, it } from "vitest";
import { SOFT_ASSET_LIMIT, SOFT_CONDUIT_LIMIT, oversizeWarning } from "./modelLimits";

describe("oversizeWarning", () => {
  it("returns null within the soft limits", () => {
    expect(oversizeWarning(SOFT_ASSET_LIMIT, SOFT_CONDUIT_LIMIT)).toBeNull();
    expect(oversizeWarning(0, 0)).toBeNull();
  });

  it("names assets when the asset limit is exceeded", () => {
    const warning = oversizeWarning(SOFT_ASSET_LIMIT + 1, 0);
    expect(warning).toContain("assets");
    expect(warning).not.toContain("conduits");
  });

  it("names both when both are exceeded", () => {
    const warning = oversizeWarning(SOFT_ASSET_LIMIT + 1, SOFT_CONDUIT_LIMIT + 1);
    expect(warning).toContain("assets");
    expect(warning).toContain("conduits");
  });
});

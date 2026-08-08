import { describe, expect, it } from "vitest";
import type { Asset } from "../models/types";
import { assetBadges } from "./assetBadges";

const baseControls: Asset["controls"] = {
  mfa: true,
  allowListing: true,
  endpointProtection: true,
  patchingProgram: true,
  backups: true,
  defaultCredentialsDisabled: true,
  networkMonitoring: true,
  centralLogging: true,
  remoteAccessApproved: true,
  safetyValidated: true
};

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a",
    name: "A",
    type: "plc-rtu",
    zone: "level1",
    ipAddress: "",
    vlan: "",
    protocols: [],
    criticality: "medium",
    owner: "",
    notes: "",
    position: { x: 0, y: 0 },
    controls: { ...baseControls },
    manufacturer: "",
    model: "",
    firmwareVersion: "",
    lifecycleStatus: "supported",
    siteArea: "",
    patchWindow: "",
    backupStatus: "unknown",
    criticalProcessTag: "",
    ...overrides
  };
}

describe("assetBadges", () => {
  it("returns no badges for a healthy supported asset", () => {
    expect(assetBadges(makeAsset())).toEqual([]);
  });

  it("flags obsolete lifecycle as EOL (danger), limited as LTD", () => {
    expect(assetBadges(makeAsset({ lifecycleStatus: "obsolete" }))).toContainEqual(
      expect.objectContaining({ key: "eol", tone: "danger" })
    );
    const limited = assetBadges(makeAsset({ lifecycleStatus: "limited" })).map((badge) => badge.key);
    expect(limited).toContain("ltd");
    expect(limited).not.toContain("eol");
  });

  it("flags remote/jump hosts without MFA, but not other asset types", () => {
    const remote = makeAsset({ type: "vendor-remote", controls: { ...baseControls, mfa: false } });
    expect(assetBadges(remote).map((badge) => badge.key)).toContain("nomfa");
    const plc = makeAsset({ type: "plc-rtu", controls: { ...baseControls, mfa: false } });
    expect(assetBadges(plc).map((badge) => badge.key)).not.toContain("nomfa");
  });

  it("flags default credentials not disabled", () => {
    expect(
      assetBadges(makeAsset({ controls: { ...baseControls, defaultCredentialsDisabled: false } })).map((badge) => badge.key)
    ).toContain("defcred");
  });

  it("always surfaces SIS for safety systems and caps at three badges", () => {
    const worst = makeAsset({
      type: "safety-system",
      lifecycleStatus: "obsolete",
      controls: { ...baseControls, defaultCredentialsDisabled: false }
    });
    const badges = assetBadges(worst);
    expect(badges).toHaveLength(3);
    expect(badges.map((badge) => badge.key)).toContain("sis");
  });
});

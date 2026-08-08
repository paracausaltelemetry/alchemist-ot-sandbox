import type { Asset } from "../models/types";

export interface AssetBadge {
  key: string;
  label: string;
  tone: "danger" | "warn" | "neutral";
  title: string;
}

const MAX_BADGES = 3;

/**
 * Derives the at-a-glance risk chips shown on an asset node. Ordered by importance and capped so
 * a node never gets crowded: safety context first, then the high-signal weaknesses (end-of-life,
 * remote access without MFA), then softer hygiene flags. Pure — covered by unit tests.
 */
export function assetBadges(asset: Asset): AssetBadge[] {
  const badges: AssetBadge[] = [];

  if (asset.type === "safety-system") {
    badges.push({ key: "sis", label: "SIS", tone: "neutral", title: "Safety instrumented system" });
  }

  if (asset.lifecycleStatus === "obsolete") {
    badges.push({ key: "eol", label: "EOL", tone: "danger", title: "Obsolete / end-of-life (unsupported)" });
  } else if (asset.lifecycleStatus === "limited") {
    badges.push({ key: "ltd", label: "LTD", tone: "warn", title: "Limited vendor support" });
  }

  const remoteFacing = asset.type === "vendor-remote" || asset.type === "jump-host";
  if (remoteFacing && !asset.controls.mfa) {
    badges.push({ key: "nomfa", label: "NO MFA", tone: "danger", title: "Remote access without multi-factor authentication" });
  }

  if (!asset.controls.defaultCredentialsDisabled) {
    badges.push({ key: "defcred", label: "DEF", tone: "warn", title: "Default credentials not confirmed disabled" });
  }

  return badges.slice(0, MAX_BADGES);
}

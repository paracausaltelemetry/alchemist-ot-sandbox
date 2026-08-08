import type { CSSProperties } from "react";
import type { OverlayBucket } from "../../engine/overlays";

/**
 * The one bridge between a bucket and CSS.
 *
 * The registry deals in a `0..1` weight and knows nothing about ink, which is what lets it be
 * tested without a DOM. This is where that weight becomes a custom property, and it lives in its
 * own module so the card and the legend swatch cannot end up reading the bucket differently.
 */
export function bucketStyle(bucket: OverlayBucket): CSSProperties {
  return { "--overlay-ink": bucket.weight } as CSSProperties;
}

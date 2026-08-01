import type { ItNodeKind } from "../models/itMap";

/**
 * The standard network-map symbol vocabulary — the shapes network engineers already read
 * without a legend: a cylinder with four arrows is a router, a box with crossed arrows is a
 * switch, a brick wall is a firewall, and so on.
 *
 * Drawn by hand rather than pulled from an icon set. Lucide has no router/switch/firewall
 * glyphs that read as network symbols, and an icon dependency would bring colours and corner
 * radii that fight the flat monochrome brand. These are stroke-only on `currentColor`, so they
 * inherit the node's text colour and work in both themes with no per-symbol styling.
 *
 * There is deliberately no subnet symbol — a subnet is a labelled container, and giving it a
 * node symbol invites drawing it as one — and no separate gateway symbol: an inferred gateway
 * is the router symbol with the shared ghost treatment.
 */

interface NetworkSymbolProps {
  kind: ItNodeKind;
  size?: number;
}

/** Four arrows on the router: two out, two in, the conventional "it forwards packets" mark. */
const ROUTER_ARROWS = (
  <>
    <path d="M8 10.5h8M13 8l3 2.5-3 2.5" />
    <path d="M16 15.5H8m5-2.5-3 2.5 3 2.5" />
  </>
);

function Symbol({ kind }: { kind: ItNodeKind }) {
  switch (kind) {
    case "router":
      // A squared cylinder, not a circle: a circle reads as a hub, and it would be the only
      // round object on a canvas with no rounded corners anywhere else.
      return (
        <>
          <path d="M3 7h18v10H3z" />
          <path d="M3 7c0-1.1 4-2 9-2s9 .9 9 2M3 17c0 1.1 4 2 9 2s9-.9 9-2" />
          {ROUTER_ARROWS}
        </>
      );

    case "switch":
      return (
        <>
          <path d="M2 6h20v12H2z" />
          <path d="M6 14.5h12M15 12l3 2.5-3 2.5" />
          <path d="M18 9.5H6m3-2.5-3 2.5 3 2.5" />
        </>
      );

    case "firewall":
      return (
        <>
          <path d="M2 5h20v14H2z" />
          <path d="M2 9.7h20M2 14.3h20" />
          <path d="M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" />
        </>
      );

    case "load-balancer":
      return (
        <>
          <path d="M3 6h18v12H3z" />
          <path d="M7 12h4" />
          <path d="M11 12h2.5M13.5 12l3.5-3.5M13.5 12l3.5 3.5" />
          <path d="M17 7.2h2M17 12h2M17 16.8h2" />
        </>
      );

    case "server":
      return (
        <>
          <path d="M5 3h14v18H5z" />
          <path d="M5 9h14M5 15h14" />
          <path d="M8 6h5M8 12h5M8 18h5" />
          <path d="M16 6h.01M16 12h.01M16 18h.01" />
        </>
      );

    case "database":
      return (
        <>
          <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" />
          <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
          <path d="M20 12c0 1.7-3.6 3-8 3s-8-1.3-8-3" />
        </>
      );

    case "workstation":
      return (
        <>
          <path d="M3 4h18v11H3z" />
          <path d="M10 15v3M14 15v3M7 18h10" />
        </>
      );

    case "printer":
      return (
        <>
          <path d="M7 3h10v5H7z" />
          <path d="M4 8h16v8h-3M7 16H4V8" />
          <path d="M7 13h10v8H7z" />
        </>
      );

    case "wireless-ap":
      return (
        <>
          <path d="M4 14h16v6H4z" />
          <path d="M8 17h3" />
          <path d="M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9 9 0 0 1 13 0" />
        </>
      );

    case "internet":
      return (
        <path d="M6.5 19a4 4 0 0 1-.4-8 6 6 0 0 1 11.3-1.4A3.8 3.8 0 0 1 18 19H6.5z" />
      );

    case "unknown":
    default:
      return (
        <>
          <path d="M3 4h18v16H3z" />
          <path d="M9.7 9.3a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2.1-2.3 3.4" />
          <path d="M12 16.6h.01" />
        </>
      );
  }
}

export function NetworkSymbol({ kind, size = 26 }: NetworkSymbolProps) {
  return (
    <svg
      className="network-symbol"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <Symbol kind={kind} />
    </svg>
  );
}

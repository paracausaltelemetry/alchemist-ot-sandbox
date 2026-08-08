import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ViewSwitch } from "./ViewSwitch";
import type { AppView } from "../lib/appView";

const SITE = "https://paracausaltelemetry.com";

/**
 * The shared Paracausal Telemetry site header, mirrored from the main site so the Alchemist
 * subdomain opens inside the same familiar frame: radar brand-mark, primary nav (absolute
 * links back to the main site, with Alchemist marked current), and the theme toggle.
 */
const NAV_LINKS: Array<{ label: string; href: string; current?: boolean }> = [
  { label: "Home", href: `${SITE}/` },
  { label: "Projects", href: `${SITE}/projects/` },
  { label: "Writeups", href: `${SITE}/writeups/` },
  { label: "Alchemist", href: "https://alchemist.paracausaltelemetry.com/", current: true },
  { label: "Observer", href: `${SITE}/observer/` },
  { label: "Threat Actors", href: `${SITE}/threat-actors/` }
];

interface SiteMastheadProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /** Mirrors body.mobile-lite (Root's 960px query) so the collapsed menu only arms on mobile. */
  isMobile: boolean;
  /** Which top-level view is showing, when the OT/IT switch should be offered. */
  view?: AppView;
  onSwitchView?: (view: AppView) => void;
}

export function SiteMasthead({ theme, onToggleTheme, isMobile, view, onSwitchView }: SiteMastheadProps) {
  // React port of the main site's js/site-header.js: a Menu button that
  // collapses the primary nav under the sticky top header on mobile.
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const open = isMobile && menuOpen;

  // The ported main-site CSS keys off body.site-menu-open.
  useEffect(() => {
    document.body.classList.toggle("site-menu-open", open);
    return () => document.body.classList.remove("site-menu-open");
  }, [open]);

  // Close when leaving mobile, on Escape, and on outside pointerdown.
  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header className="site-header" ref={headerRef}>
      <a className="brand" href={`${SITE}/`} aria-label="Back to Paracausal Telemetry home">
        <BrandMark />
        <span className="brand-copy">
          <strong>Paracausal Telemetry</strong>
          <small>Alchemist</small>
        </span>
      </a>
      <button
        type="button"
        className="site-menu-toggle"
        aria-controls="site-menu"
        aria-expanded={open}
        aria-label={open ? "Close site menu" : "Open site menu"}
        hidden={!isMobile}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span>Menu</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div
        className="header-actions"
        id="site-menu"
        aria-hidden={isMobile && !open ? true : undefined}
        inert={isMobile && !open}
      >
        <nav className="site-nav" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={link.current ? "is-current" : undefined}
              aria-current={link.current ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {view && onSwitchView ? <ViewSwitch current={view} onSwitch={onSwitchView} /> : null}
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle light and dark mode"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Dashboard } from "./Dashboard";
import { MapWorkspace } from "./MapWorkspace";
import { initialView, LAST_VIEW_STORAGE_KEY, type AppView } from "../lib/appView";
import { safeGetItem, safeSetItem } from "../lib/safeStorage";

const THEME_KEY = "ot-sandbox-theme";

// Shared with the main site and the ctf subdomain: the light/dark choice is
// mirrored to a cookie scoped to .paracausaltelemetry.com so it carries across
// origins (localStorage is per-origin and can't). Cookie wins on load; the
// legacy ot-sandbox-theme localStorage key stays as a same-origin fallback.
const THEME_COOKIE = "pt_theme";

function readThemeCookie(): "dark" | "light" | null {
  const match = document.cookie.match(/(?:^|;\s*)pt_theme=(light|dark)/);
  return match ? (match[1] as "dark" | "light") : null;
}

function writeThemeCookie(theme: "dark" | "light"): void {
  const onSiteDomain = /(^|\.)paracausaltelemetry\.com$/.test(location.hostname);
  const domain = onSiteDomain ? "; domain=.paracausaltelemetry.com" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${domain}`;
}

function initialTheme(): "dark" | "light" {
  const shared = readThemeCookie();
  if (shared) {
    return shared;
  }
  const stored = safeGetItem(THEME_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readLastView(): AppView | null {
  const stored = safeGetItem(LAST_VIEW_STORAGE_KEY);
  return stored === "home" || stored === "map" ? stored : null;
}

/** Tracks whether the viewport is phone/tablet-sized. The workspace is desktop-only. */
function useIsMobile(query = "(max-width: 960px)"): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return isMobile;
}

/**
 * Top-level shell: the home dashboard, or the estate map.
 *
 * There used to be a third branch and a switch in the masthead to reach it. Alchemist shipped an OT
 * workbench over a hand-authored `OtProject` and an IT view over scan output, and making the
 * operator pick a side before they could look at anything was the wrong question — a converged
 * plant is one estate, and the findings that matter live exactly where the corporate network and
 * the process network touch, which was the one place neither view could draw.
 *
 * One document now, one canvas, one analysis suite over it.
 */
export function Root() {
  const [view, setView] = useState<AppView>(() => initialView(window.location.hash, readLastView()));
  const [theme, setTheme] = useState<"dark" | "light">(() => initialTheme());
  const isMobile = useIsMobile();

  useEffect(() => {
    document.body.classList.toggle("light-mode", theme === "light");
    safeSetItem(THEME_KEY, theme);
    writeThemeCookie(theme);
  }, [theme]);

  // Mirror the main site's mobile chrome: body.mobile-lite drives the fixed
  // bottom nav bar in the site-frame styles.
  useEffect(() => {
    document.body.classList.toggle("mobile-lite", isMobile);
  }, [isMobile]);

  useEffect(() => {
    safeSetItem(LAST_VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    const onHashChange = () => setView(initialView(window.location.hash, readLastView()));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const toggleTheme = useCallback(() => setTheme((current) => (current === "dark" ? "light" : "dark")), []);

  // Hash is the source of truth; setView covers the case where the hash already matches
  // (a hashchange would not fire, so nothing would re-render).
  const open = useCallback((next: AppView) => {
    if (window.location.hash === `#${next}`) {
      setView(next);
    } else {
      window.location.hash = next;
    }
  }, []);

  if (view === "home") {
    return (
      <Dashboard
        onEnter={() => open("map")}
        theme={theme}
        onToggleTheme={toggleTheme}
        isMobile={isMobile}
      />
    );
  }

  return <MapWorkspace theme={theme} onToggleTheme={toggleTheme} isMobile={isMobile} />;
}

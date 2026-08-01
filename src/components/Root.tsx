import { useCallback, useEffect, useState } from "react";
import { App } from "../App";
import { Dashboard, type DashboardIntent } from "./Dashboard";
import { ItApp } from "./ItApp";
import { initialView, LAST_VIEW_STORAGE_KEY, type AppView } from "../lib/appView";
import { safeGetItem, safeSetItem } from "../lib/safeStorage";

const THEME_KEY = "ot-sandbox-theme";

// Shared with the main site and the ctf subdomain: the light/dark choice is
// mirrored to a cookie scoped to .welbournesecurity.com so it carries across
// origins (localStorage is per-origin and can't). Cookie wins on load; the
// legacy ot-sandbox-theme localStorage key stays as a same-origin fallback.
const THEME_COOKIE = "ws_theme";

function readThemeCookie(): "dark" | "light" | null {
  const match = document.cookie.match(/(?:^|;\s*)ws_theme=(light|dark)/);
  return match ? (match[1] as "dark" | "light") : null;
}

function writeThemeCookie(theme: "dark" | "light"): void {
  const onSiteDomain = /(^|\.)welbournesecurity\.com$/.test(location.hostname);
  const domain = onSiteDomain ? "; domain=.welbournesecurity.com" : "";
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
  return stored === "home" || stored === "app" || stored === "it" ? stored : null;
}

/** Tracks whether the viewport is phone/tablet-sized. The workbench is desktop-only. */
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
 * Top-level shell: the home dashboard or the workbench. The hash deep-links each (`#home` / `#app`),
 * a reload returns to the last view, and the dashboard is the default front door. Owns the theme so
 * both views match before the heavy workbench mounts.
 */
export function Root() {
  const [view, setView] = useState<AppView>(() => initialView(window.location.hash, readLastView()));
  const [intent, setIntent] = useState<DashboardIntent | undefined>(undefined);
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

  const enter = useCallback((nextIntent?: DashboardIntent) => {
    setIntent(nextIntent);
    if (window.location.hash === "#app") {
      setView("app");
    } else {
      window.location.hash = "app";
    }
  }, []);

  // Hash is the source of truth; setView covers the case where the hash already matches
  // (a hashchange would not fire, so nothing would re-render).
  const switchView = useCallback((next: AppView) => {
    setIntent(undefined);
    if (window.location.hash === `#${next}`) {
      setView(next);
    } else {
      window.location.hash = next;
    }
  }, []);

  const goHome = useCallback(() => {
    setIntent(undefined);
    if (window.location.hash === "#home") {
      setView("home");
    } else {
      window.location.hash = "home";
    }
  }, []);

  const openIt = useCallback(() => switchView("it"), [switchView]);

  if (view === "home") {
    return (
      <Dashboard
        onEnter={enter}
        onOpenIt={openIt}
        onSwitchView={switchView}
        theme={theme}
        onToggleTheme={toggleTheme}
        isMobile={isMobile}
      />
    );
  }

  if (view === "it") {
    return (
      <ItApp
        onGoHome={goHome}
        onSwitchView={switchView}
        theme={theme}
        onToggleTheme={toggleTheme}
        isMobile={isMobile}
      />
    );
  }

  // On phone/tablet App renders read-only (the topology canvas is desktop-only);
  // the assessment, findings, standards mapping and report all work.
  return (
    <App
      onGoHome={goHome}
      onSwitchView={switchView}
      initialIntent={intent}
      theme={theme}
      onToggleTheme={toggleTheme}
      isMobile={isMobile}
    />
  );
}

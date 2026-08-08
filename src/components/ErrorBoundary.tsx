import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level boundary so a runtime error degrades to a recoverable message instead of a
 * blank page. Catches render/lifecycle errors (including React's "maximum update depth"
 * loop) and offers reload / reset-local-state recovery.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Alchemist crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="app-error" role="alert">
        <div className="app-error-card">
          <strong>Something went wrong</strong>
          <p>
            The app hit an unexpected error and stopped. Reloading usually fixes it. If it keeps happening, a saved
            project in this browser may be the cause; reset it below.
          </p>
          <pre>{this.state.error.message}</pre>
          <div className="app-error-actions">
            <button type="button" className="text-button primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                try {
                  window.localStorage.clear();
                } catch {
                  // Storage being unreachable is *why* recovery is needed in some cases, so
                  // reloading into the same state without saying so is a dead end. Say it.
                  window.alert(
                    "This browser is blocking site data, so there is nothing stored to reset. Allow site data for this page, or try a different browser."
                  );
                  return;
                }
                window.location.reload();
              }}
            >
              Reset local data &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

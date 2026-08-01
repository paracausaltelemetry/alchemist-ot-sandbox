import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Runs for every test file, including the node-environment engine tests, so
// everything that touches the DOM is guarded behind a window check.
if (typeof window !== "undefined") {
  // jsdom has no layout engine; matchMedia is undefined. Stub it so components
  // that read viewport size (the mobile gate) render in tests.
  if (!window.matchMedia) {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  // React Flow measures the DOM before it will render anything. jsdom reports zero-sized
  // elements and has neither ResizeObserver nor DOMMatrix, so without all three of these the
  // canvas mounts empty and every assertion about it passes vacuously.
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!window.DOMMatrixReadOnly) {
    window.DOMMatrixReadOnly = class {
      m22: number;
      constructor(transform?: string) {
        const scale = transform?.match(/scale\(([\d.]+)\)/);
        this.m22 = scale ? Number(scale[1]) : 1;
      }
    } as unknown as typeof DOMMatrixReadOnly;
  }

  const { height, width } = { height: 800, width: 1200 };
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetHeight: { get: () => height, configurable: true },
    offsetWidth: { get: () => width, configurable: true }
  });
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
  };

  afterEach(() => cleanup());
}

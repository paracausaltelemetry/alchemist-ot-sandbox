import { useEffect, type RefObject } from "react";

/**
 * Keeps keyboard focus inside an open dialog, and gives it back when the dialog closes.
 *
 * Every modal in Alchemist declared `aria-modal="true"`, which tells a screen reader that the rest
 * of the page is inert — while Tab walked straight out of the dialog into the workbench behind it.
 * The promise and the behaviour disagreed, and a keyboard user got the worse half of both: content
 * announced as unavailable that they could still reach, and no way back to where they started.
 *
 * Deliberately does not handle Escape. Each dialog already closes on its own terms, and some have
 * more to do than dismiss.
 */

/**
 * Focusable descendants in document order.
 *
 * `disabled` is excluded because a disabled control cannot take focus, and `[hidden]` because the
 * dialogs use it for the file inputs they trigger programmatically. Anything with a negative
 * tabindex is excluded too: it is reachable by script, not by Tab, which is exactly the
 * distinction this cycle needs to respect.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function focusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.hasAttribute("hidden")) {
      return false;
    }
    // `checkVisibility` where the browser has it, and nothing where it does not. Not `offsetParent`:
    // it is null for anything inside a `position: fixed` subtree, which every one of these dialogs
    // is, so filtering on it emptied the list and the trap silently did nothing at all.
    return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
  });
}

export function useFocusTrap(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const container = ref.current;
    if (!container) {
      return;
    }

    // Captured before anything moves, so closing returns the operator to the control they opened
    // the dialog from rather than to the top of the document.
    const previous = document.activeElement as HTMLElement | null;

    // Only if focus is not already inside: several dialogs focus a specific field of their own, and
    // this must not fight them whichever order the effects happen to run in.
    if (!container.contains(document.activeElement)) {
      (focusable(container)[0] ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const items = focusable(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Focus outside the dialog entirely — a click on the page behind, or a browser control
      // handing it back — is pulled to the appropriate end rather than left where it landed.
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only if the dialog still holds focus. If something else has deliberately taken it — a
      // dialog opening another dialog, say — stealing it back would undo that.
      if (!previous || !previous.isConnected) {
        return;
      }
      if (!container.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }
      previous.focus();
    };
  }, [open, ref]);
}

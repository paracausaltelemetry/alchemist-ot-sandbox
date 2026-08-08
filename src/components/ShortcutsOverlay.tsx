import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "Ctrl / ⌘ + K", action: "Open command palette" },
  { keys: "Ctrl / ⌘ + Z", action: "Undo" },
  { keys: "Ctrl / ⌘ + Shift + Z  ·  Ctrl / ⌘ + Y", action: "Redo" },
  { keys: "C", action: "Toggle connect mode" },
  { keys: "Ctrl / ⌘ + D", action: "Duplicate selected asset" },
  { keys: "Delete / Backspace", action: "Delete selected (or box-selected) items" },
  { keys: "Shift + drag", action: "Box-select multiple assets" },
  { keys: "Double-click asset", action: "Rename it on the canvas" },
  { keys: "Esc", action: "Cancel connect mode / deselect" },
  { keys: "?", action: "Show this shortcut reference" }
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="shortcuts-overlay"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <strong id="shortcuts-title">Keyboard shortcuts</strong>
        <dl className="shortcuts-list">
          {SHORTCUTS.map((shortcut) => (
            <div className="shortcut-row" key={shortcut.action}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

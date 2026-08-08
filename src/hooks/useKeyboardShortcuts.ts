import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  onCommandPalette: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onToggleConnect: () => void;
  onShowShortcuts: () => void;
  onDuplicate: () => void;
}

function isTypingTarget(target: EventTarget | null) {
  const node = target as HTMLElement | null;
  if (!node) {
    return false;
  }
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT" || node.isContentEditable;
}

/**
 * Global power-user shortcuts. Command palette (Ctrl/Cmd+K) works everywhere;
 * the rest only fire when focus is not in a text field so native editing
 * (including input undo) is preserved.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const current = handlersRef.current;

      if (mod && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        current.onCommandPalette();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (mod && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          current.onRedo();
        } else {
          current.onUndo();
        }
        return;
      }
      if (mod && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        current.onRedo();
        return;
      }
      if (mod && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        current.onDuplicate();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        current.onDelete();
        return;
      }
      if (event.key === "c" || event.key === "C") {
        current.onToggleConnect();
        return;
      }
      if (event.key === "?") {
        current.onShowShortcuts();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

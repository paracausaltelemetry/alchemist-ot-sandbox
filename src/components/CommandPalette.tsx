import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/**
 * Keyboard-first command palette (Ctrl/Cmd+K). Filter as you type, move with
 * the arrow keys, Enter to run, Escape to close. Implemented as an ARIA
 * combobox driving a listbox.
 */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return commands;
    }
    return commands.filter((command) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const run = (command: Command | undefined) => {
    if (!command) {
      return;
    }
    onClose();
    command.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="modal-overlay command-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="command-palette"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          type="text"
          className="command-input"
          placeholder="Search commands…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="command-list"
          aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined}
        />
        <ul className="command-list" id="command-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <li className="command-empty">No matching commands</li>
          ) : (
            filtered.map((command, index) => (
              // Keyboard selection is the combobox pattern: the input's onKeyDown
              // drives activedescendant + Enter to run; this click is the mouse
              // equivalent, so the option needs no key handler of its own.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={command.id}
                id={`command-${command.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`command-item${index === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(command)}
              >
                <span>{command.label}</span>
                {command.hint ? <small>{command.hint}</small> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

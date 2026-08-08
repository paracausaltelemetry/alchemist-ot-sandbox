import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  current?: boolean;
}

interface MenuProps {
  label: string;
  items: MenuItem[];
  icon?: ReactNode;
  align?: "left" | "right";
  title?: string;
}

/**
 * A sharp, monochrome dropdown for grouping header actions. Closes on outside click or Escape; items
 * run their action and close. Keyboard accessible: opens focused on the first item, Arrow Up/Down move
 * between items, and focus returns to the trigger on close. No radius or shadow, in keeping with the brand.
 */
export function Menu({ label, items, icon, align = "right", title }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`menu${open ? " menu-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="text-button menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={`menu-panel menu-panel-${align}`}
          role="menu"
          tabIndex={-1}
          ref={panelRef}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
              return;
            }
            event.preventDefault();
            const focusables = Array.from(
              panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []
            );
            if (focusables.length === 0) {
              return;
            }
            const index = focusables.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex =
              event.key === "ArrowDown"
                ? (index + 1) % focusables.length
                : (index - 1 + focusables.length) % focusables.length;
            focusables[nextIndex]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              className="menu-item"
              role="menuitem"
              aria-current={item.current ? "true" : undefined}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

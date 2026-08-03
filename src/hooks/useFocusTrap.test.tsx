// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFocusTrap } from "./useFocusTrap";
import { ConfirmDialog } from "../components/ConfirmDialog";

/** A page with a button behind a dialog, which is what Tab used to escape into. */
function Harness({ startOpen = true }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, ref);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        behind
      </button>
      {open ? (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
          <button type="button">first</button>
          <button type="button">middle</button>
          <button type="button" onClick={() => setOpen(false)}>
            last
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves focus into the dialog when it opens", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("wraps forwards from the last control to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("button", { name: "last" }).focus();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("wraps backwards from the first control to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("button", { name: "first" }).focus();

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });

  it("never lands on the page behind, which aria-modal already claims is unavailable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const behind = screen.getByRole("button", { name: "behind" });

    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(behind);
    }
  });

  it("pulls focus back in if something outside took it", () => {
    render(<Harness />);
    screen.getByRole("button", { name: "behind" }).focus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("gives focus back to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness startOpen={false} />);
    const opener = screen.getByRole("button", { name: "behind" });

    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));

    await user.click(screen.getByRole("button", { name: "last" }));
    expect(document.activeElement).toBe(opener);
  });
});

describe("the dialogs that declare aria-modal", () => {
  it("traps focus in ConfirmDialog without disturbing the control it focuses itself", async () => {
    // ConfirmDialog focuses its confirm button on open, and the trap must not fight that whichever
    // order the two effects happen to run in.
    const user = userEvent.setup();
    render(
      <ConfirmDialog open title="Delete" message="Sure?" onConfirm={() => {}} onCancel={() => {}} />
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(document.activeElement).toBe(confirm);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });
});

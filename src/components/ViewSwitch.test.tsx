// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewSwitch } from "./ViewSwitch";

describe("ViewSwitch", () => {
  it("offers both sides and marks the current one", () => {
    render(<ViewSwitch current="it" onSwitch={() => {}} />);

    const ot = screen.getByRole("button", { name: /OT/ });
    const it = screen.getByRole("button", { name: /IT/ });
    expect(ot).not.toHaveAttribute("aria-current");
    expect(it).toHaveAttribute("aria-current", "page");
  });

  it("marks neither side on the dashboard, where both are entry points", () => {
    render(<ViewSwitch current="home" onSwitch={() => {}} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-current");
    }
  });

  it("switches to the side that was clicked", async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<ViewSwitch current="app" onSwitch={onSwitch} />);

    await user.click(screen.getByRole("button", { name: /IT/ }));
    expect(onSwitch).toHaveBeenCalledWith("it");
  });

  it("warns that undo history does not carry over, but only on the side you would leave for", () => {
    render(<ViewSwitch current="app" onSwitch={() => {}} />);
    expect(screen.getByRole("button", { name: /IT/ })).toHaveAttribute("title", expect.stringContaining("undo history"));
    expect(screen.getByRole("button", { name: /OT/ }).getAttribute("title")).not.toContain("undo history");
  });
});

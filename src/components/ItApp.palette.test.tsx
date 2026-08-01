// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItApp } from "./ItApp";

function renderIt() {
  render(<ItApp onGoHome={() => {}} onSwitchView={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);
  return userEvent.setup();
}

const options = () => screen.queryAllByRole("option").map((option) => option.textContent ?? "");

describe("ItApp command palette", () => {
  it("opens on Ctrl+K", async () => {
    const user = renderIt();
    expect(screen.queryByRole("combobox")).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("offers only what you can actually do before a scan is loaded", async () => {
    const user = renderIt();
    await user.keyboard("{Control>}k{/Control}");

    const labels = options().join(" ");
    expect(labels).toMatch(/load the sample scan/i);
    // Nothing map-shaped: there is no map yet.
    expect(labels).not.toMatch(/export|exposure|inferred|clear the map/i);
  });

  it("offers the map commands once a scan is mapped", async () => {
    const user = renderIt();
    await user.click(screen.getByRole("button", { name: /load sample/i }));
    await user.keyboard("{Control>}k{/Control}");

    const labels = options().join(" ");
    expect(labels).toMatch(/exposure view/i);
    expect(labels).toMatch(/hide inferred links/i);
    expect(labels).toMatch(/assess this network in the OT workbench/i);
    expect(labels).toMatch(/export the map as SVG/i);
  });

  it("filters as you type", async () => {
    const user = renderIt();
    await user.click(screen.getByRole("button", { name: /load sample/i }));
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "export");

    expect(options().length).toBeGreaterThan(0);
    expect(options().every((label) => /export/i.test(label))).toBe(true);
  });
});

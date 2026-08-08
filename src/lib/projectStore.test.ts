import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getCurrentProject,
  listProjects,
  openProject,
  renameProject,
  saveCurrentProject
} from "./projectStore";
import { sampleProject } from "../data/sampleProject";

function mockLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear()
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: mockLocalStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("projectStore", () => {
  it("seeds a single current project from the sample on first use", () => {
    expect(listProjects()).toHaveLength(1);
    expect(getCurrentProject().assets.length).toBe(sampleProject.assets.length);
  });

  it("creates a new assessment and makes it current", () => {
    getCurrentProject(); // seed the first one
    const id = createProject({ ...sampleProject, name: "Second site" });
    expect(listProjects()).toHaveLength(2);
    expect(getCurrentProject().name).toBe("Second site");
    expect(listProjects()[0].id).toBe(id);
  });

  it("persists working edits and keeps the index name in sync", () => {
    getCurrentProject();
    saveCurrentProject({ ...getCurrentProject(), name: "Renamed live" });
    expect(getCurrentProject().name).toBe("Renamed live");
    expect(listProjects()[0].name).toBe("Renamed live");
  });

  it("switches the current project with openProject", () => {
    const first = listProjects()[0].id;
    const second = createProject({ ...sampleProject, name: "Other" });
    openProject(first);
    expect(getCurrentProject().name).toBe(sampleProject.name);
    openProject(second);
    expect(getCurrentProject().name).toBe("Other");
  });

  it("duplicates and renames entries", () => {
    const id = listProjects()[0].id;
    const copyId = duplicateProject(id);
    expect(copyId).not.toBeNull();
    expect(listProjects()).toHaveLength(2);
    renameProject(id, "Primary");
    expect(listProjects().find((meta) => meta.id === id)?.name).toBe("Primary");
  });

  it("deletes an entry and repoints the current pointer", () => {
    const first = listProjects()[0].id;
    const second = createProject({ ...sampleProject, name: "Keep me" });
    deleteProject(second);
    expect(listProjects().some((meta) => meta.id === second)).toBe(false);
    // Current falls back to a remaining entry, never to nothing.
    expect(listProjects().some((meta) => meta.id === first)).toBe(true);
    expect(getCurrentProject()).toBeTruthy();
  });
});

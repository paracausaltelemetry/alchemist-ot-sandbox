import { getCurrentProject, saveCurrentProject } from "./projectStore";
import type { OtProject } from "../models/types";

/**
 * The current-project facade used by the workbench and dashboard. It delegates to the saved-assessment
 * registry so "the current project" is always the active saved entry (migrated from the old single slot).
 */
export function loadStoredProject(): OtProject {
  return getCurrentProject();
}

export function writeStoredProject(project: OtProject): boolean {
  return saveCurrentProject(project);
}

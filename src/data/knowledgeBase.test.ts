import { describe, expect, it } from "vitest";
import { kbCategories, kbKindGroups, knowledgeBase, topicKind } from "./knowledgeBase";

const KINDS = kbKindGroups.map((group) => group.kind);

describe("knowledgeBase", () => {
  it("has unique topic ids", () => {
    const ids = knowledgeBase.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every topic has a title, summary, known category, valid kind and some content", () => {
    for (const topic of knowledgeBase) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeGreaterThan(0);
      expect(kbCategories).toContain(topic.category);
      expect(KINDS).toContain(topicKind(topic));
      const hasContent = topic.sections.length > 0 || Boolean(topic.table) || (topic.links?.length ?? 0) > 0;
      expect(hasContent).toBe(true);
      for (const section of topic.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.points.length).toBeGreaterThan(0);
      }
    }
  });

  it("cheat-sheet tables are rectangular", () => {
    for (const topic of knowledgeBase) {
      if (!topic.table) {
        continue;
      }
      expect(topic.table.columns.length).toBeGreaterThan(0);
      for (const row of topic.table.rows) {
        expect(row.length).toBe(topic.table.columns.length);
      }
    }
  });

  it("resource links have a label and an http(s) url", () => {
    for (const topic of knowledgeBase) {
      for (const link of topic.links ?? []) {
        expect(link.label.length).toBeGreaterThan(0);
        expect(link.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("includes at least one topic of each kind", () => {
    for (const kind of KINDS) {
      expect(knowledgeBase.some((topic) => topicKind(topic) === kind)).toBe(true);
    }
  });

  it("covers the requested core and practical topics", () => {
    const ids = new Set(knowledgeBase.map((topic) => topic.id));
    for (const id of [
      "asset-registers",
      "iec-62443",
      "nist-csf-2",
      "nist-800-82",
      "guide-asset-inventory",
      "checklist-ir-runbook",
      "cheatsheet-protocols-ports",
      "cheatsheet-crosswalk",
      "resource-standards"
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

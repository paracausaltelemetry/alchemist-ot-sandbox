import { describe, expect, it } from "vitest";
import { childrenNamed, findAll, firstChild, parseXml } from "./xml";

describe("parseXml", () => {
  it("parses elements, attributes, nesting and text while skipping prolog/doctype/comments", () => {
    const doc = parseXml(
      `<?xml version="1.0"?><!DOCTYPE root><!-- note --><root a="1"><child name="x">hi</child><child name="y"/></root>`
    );
    const root = firstChild(doc, "root");
    expect(root).toBeDefined();
    expect(root?.attrs.a).toBe("1");
    const kids = childrenNamed(root!, "child");
    expect(kids).toHaveLength(2);
    expect(kids[0].attrs.name).toBe("x");
    expect(kids[0].text).toBe("hi");
  });

  it("decodes entities and handles single-quoted attributes", () => {
    const doc = parseXml(`<r><v label='a&amp;b'>1 &lt; 2</v></r>`);
    const v = findAll(doc, "v")[0];
    expect(v.attrs.label).toBe("a&b");
    expect(v.text).toBe("1 < 2");
  });

  it("treats self-closing tags as childless and finds descendants at any depth", () => {
    const doc = parseXml(`<a><b><c id="deep"/></b></a>`);
    const c = findAll(doc, "c");
    expect(c).toHaveLength(1);
    expect(c[0].attrs.id).toBe("deep");
  });
});

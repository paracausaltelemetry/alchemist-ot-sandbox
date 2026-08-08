import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields with embedded commas, quotes and newlines", () => {
    const rows = parseCsv('a,b,c\n"1,2","he said ""hi""","line1\nline2"\n');
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["1,2", 'he said "hi"', "line1\nline2"]);
  });

  it("ignores blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("keys rows by lower-cased headers", () => {
    const { headers, records } = parseCsvRecords("Name,IP Address\nPLC,10.0.0.1\n");
    expect(headers).toEqual(["name", "ip address"]);
    expect(records[0]).toEqual({ name: "PLC", "ip address": "10.0.0.1" });
  });
});

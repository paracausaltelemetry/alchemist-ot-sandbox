/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes (""), embedded
 * commas/newlines, and CRLF or LF line endings. Dependency-free so it runs in the browser
 * and the node test runner alike.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((fields) => fields.some((field) => field.trim() !== ""));
}

export interface CsvRecords {
  headers: string[];
  records: Array<Record<string, string>>;
}

/** Parses CSV with a header row into keyed records (header names lower-cased and trimmed). */
export function parseCsvRecords(input: string): CsvRecords {
  const rows = parseCsv(input);
  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const records = rows.slice(1).map((fields) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (fields[index] ?? "").trim();
    });
    return record;
  });
  return { headers, records };
}

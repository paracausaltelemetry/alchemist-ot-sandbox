import type { ImportedFlow, ImportedHost, ParsedImport } from "./types";

interface ConnRow {
  origH?: string;
  respH?: string;
  respP?: number;
  proto?: string;
  service?: string;
}

function toPort(value: unknown): number | undefined {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : undefined;
}

function clean(value: string | undefined): string | undefined {
  if (value === undefined || value === "" || value === "-" || value === "(empty)") {
    return undefined;
  }
  return value;
}

/** Parses a Zeek/Bro conn.log in either JSON-lines or the classic TSV (`#fields`) format. */
export function parseZeekConn(text: string): ParsedImport {
  const lines = text.split(/\r?\n/);
  const rows: ConnRow[] = [];
  const warnings: string[] = [];

  const firstData = lines.find((line) => line.trim() !== "" && !line.startsWith("#"));
  const isJson = firstData?.trim().startsWith("{") ?? false;

  if (isJson) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] !== "{") {
        continue;
      }
      try {
        const record = JSON.parse(trimmed) as Record<string, unknown>;
        rows.push({
          origH: clean(String(record["id.orig_h"] ?? "")),
          respH: clean(String(record["id.resp_h"] ?? "")),
          respP: toPort(record["id.resp_p"]),
          proto: clean(String(record.proto ?? "")),
          service: clean(String(record.service ?? ""))
        });
      } catch {
        warnings.push("Skipped a malformed JSON line.");
      }
    }
  } else {
    const fieldLine = lines.find((line) => line.startsWith("#fields"));
    const fields = fieldLine
      ? fieldLine.split("\t").slice(1)
      : ["ts", "uid", "id.orig_h", "id.orig_p", "id.resp_h", "id.resp_p", "proto", "service"];
    const index = (name: string) => fields.indexOf(name);
    const iOrig = index("id.orig_h");
    const iResp = index("id.resp_h");
    const iRespP = index("id.resp_p");
    const iProto = index("proto");
    const iService = index("service");

    for (const line of lines) {
      if (!line.trim() || line.startsWith("#")) {
        continue;
      }
      const cells = line.split("\t");
      rows.push({
        origH: clean(cells[iOrig]),
        respH: clean(cells[iResp]),
        respP: toPort(cells[iRespP]),
        proto: clean(cells[iProto]),
        service: clean(cells[iService])
      });
    }
  }

  const hostMap = new Map<string, ImportedHost>();
  const ensureHost = (ip: string): ImportedHost => {
    const existing = hostMap.get(ip);
    if (existing) {
      return existing;
    }
    const host: ImportedHost = { ip, ports: [] };
    hostMap.set(ip, host);
    return host;
  };

  const flows: ImportedFlow[] = [];
  for (const row of rows) {
    if (!row.origH || !row.respH) {
      continue;
    }
    ensureHost(row.origH);
    const responder = ensureHost(row.respH);
    // The responder's port is a service it offers — record it so the responder can be typed
    // (e.g. a host answering on 502 is a Modbus PLC). Initiators use ephemeral ports, so none.
    if (row.respP && !responder.ports.some((port) => port.port === row.respP)) {
      responder.ports.push({ port: row.respP, transport: row.proto, service: row.service });
    }
    flows.push({
      sourceIp: row.origH,
      targetIp: row.respH,
      port: row.respP,
      transport: row.proto,
      service: row.service
    });
  }

  if (hostMap.size === 0) {
    warnings.push("No connections parsed; expected a Zeek conn.log (JSON lines or TSV).");
  }

  return { format: "zeek-conn", hosts: [...hostMap.values()], flows, warnings };
}

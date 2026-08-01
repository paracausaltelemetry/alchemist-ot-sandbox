import { FileUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectFormat, importFormatLabels, importTopology, type AssembledTopology, type ImportFormat } from "../import";
import { oversizeFileError, oversizeWarning } from "../lib/modelLimits";

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (result: AssembledTopology, mode: "replace" | "merge") => void;
}

const FORMAT_ORDER: ImportFormat[] = ["nmap-xml", "nmap-normal", "nmap-grep", "zeek-conn", "graphml", "csv-inventory"];

const FORMAT_HINTS: Record<ImportFormat, string> = {
  "nmap-xml": "nmap -oX scan.xml: discovered hosts, open ports, OS and MAC vendor.",
  "nmap-normal": "nmap -oN scan.txt: the default human-readable report, pasted or uploaded.",
  "nmap-grep": "nmap -oG scan.gnmap: one line per host, ports in a single field.",
  "zeek-conn": "Zeek/Bro conn.log (JSON lines or TSV): observed flows become assets and conduits.",
  graphml: "GraphML from Grassmarlin, Gephi or yEd: nodes and edges become assets and conduits.",
  "csv-inventory": "CSV with name/ip/type/vlan/protocols columns, or a source,target connections list."
};

export function ImportWizard({ open, onClose, onApply }: ImportWizardProps) {
  const [format, setFormat] = useState<ImportFormat>("nmap-xml");
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<AssembledTopology | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setFileName("");
    setRawText("");
    setResult(null);
    setError(null);
  }, []);

  const runParse = useCallback((text: string, chosen: ImportFormat) => {
    try {
      setResult(importTopology(text, chosen));
      setError(null);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Could not parse that file.");
    }
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const detected = detectFormat(file.name, text) ?? format;
        setFileName(file.name);
        setRawText(text);
        setFormat(detected);
        runParse(text, detected);
      };
      reader.onerror = () => setError("Could not read that file.");
      const tooLarge = oversizeFileError(file);
      if (tooLarge) {
        setError(tooLarge);
        return;
      }
      reader.readAsText(file);
    },
    [format, runParse]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const close = () => {
    reset();
    onClose();
  };

  const apply = () => {
    if (result) {
      onApply(result, mode);
      reset();
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="import-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Import network scan"
      >
        <div className="import-wizard-head">
          <div>
            <strong>Import network scan</strong>
            <p>Turn a discovery export into assets and conduits, then refine and export as JSON.</p>
          </div>
          <button type="button" className="rail-collapse" onClick={close} title="Close" aria-label="Close import wizard">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label className="field">
          <span>Source format</span>
          <select
            value={format}
            onChange={(event) => {
              const next = event.target.value as ImportFormat;
              setFormat(next);
              if (rawText) {
                runParse(rawText, next);
              }
            }}
          >
            {FORMAT_ORDER.map((value) => (
              <option key={value} value={value}>
                {importFormatLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <p className="import-wizard-hint">{FORMAT_HINTS[format]}</p>

        {/* Drag-and-drop is inherently pointer-only; the "Choose file" button
            inside is the keyboard/AT path to the same file input. */}
        <div
          className="import-dropzone"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              loadFile(file);
            }
          }}
        >
          <FileUp size={20} aria-hidden="true" />
          <span>{fileName ? fileName : "Drop a scan file here, or"}</span>
          <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".xml,.csv,.log,.json,.txt,.graphml,.tsv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                loadFile(file);
                event.target.value = "";
              }
            }}
          />
        </div>

        {error ? <p className="import-wizard-error">{error}</p> : null}

        {result ? (
          <div className="import-preview">
            <div className="import-preview-counts">
              <span>
                <strong>{result.assets.length}</strong> assets
              </span>
              <span>
                <strong>{result.conduits.length}</strong> conduits
              </span>
              <span>
                <strong>{result.subnets.length}</strong> subnets
              </span>
            </div>
            {result.warnings.length > 0 ? (
              <ul className="import-preview-warnings">
                {result.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {result.assets.length === 0 ? (
              <p className="muted">No assets were parsed; check the format selector matches the file.</p>
            ) : null}
            {oversizeWarning(result.assets.length, result.conduits.length) ? (
              <p className="import-preview-oversize" role="status">{oversizeWarning(result.assets.length, result.conduits.length)}</p>
            ) : null}

            <fieldset className="import-mode">
              <label className="toggle-row">
                <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <span>Replace current project</span>
              </label>
              <label className="toggle-row">
                <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
                <span>Merge into current project</span>
              </label>
            </fieldset>
          </div>
        ) : null}

        <div className="import-wizard-actions">
          <button type="button" className="text-button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="text-button primary" onClick={apply} disabled={!result || result.assets.length === 0}>
            Import {result && result.assets.length > 0 ? `${result.assets.length} assets` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

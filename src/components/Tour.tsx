import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { X } from "lucide-react";
import { safeSetItem } from "../lib/safeStorage";

interface TourStep {
  /** A CSS selector for the element to spotlight; omitted steps show a centred card. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to the workbench",
    body: "A quick tour of how Alchemist models and assesses an OT network. Use Next, or skip any time."
  },
  {
    target: ".asset-palette",
    title: "Asset palette",
    body: "Drag OT assets onto the canvas: PLCs, HMIs, firewalls, historians, safety systems and more."
  },
  {
    target: ".canvas-shell",
    title: "The network canvas",
    body: "Lay assets out across the Purdue zones, draw conduits between them, and watch the live security rating respond."
  },
  {
    target: ".dock-tabs-row",
    title: "Analysis dock",
    body: "Assess the model across Posture, Threat and Network, plus Improve tools: the baseline diff and the what-if simulator."
  },
  {
    target: ".toolbar",
    title: "Scenarios, learning and export",
    body: "Load a sector scenario, open the reference library or the scoring methodology, switch saved assessments, and export a report or share link."
  },
  {
    title: "You are set",
    body: "Press Ctrl or Cmd + K any time for the command palette. The logo returns to the dashboard. Press Escape to close this tour."
  }
];

export const TOUR_SEEN_KEY = "alchemist-tour-seen";

interface TourProps {
  open: boolean;
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function cardStyle(box: Box | null): CSSProperties {
  if (!box) {
    return {};
  }
  const width = 300;
  const left = Math.min(Math.max(12, box.left), window.innerWidth - width - 12);
  const spaceBelow = window.innerHeight - (box.top + box.height);
  const top = spaceBelow > 210 ? box.top + box.height + 12 : Math.max(12, box.top - 172);
  return { position: "fixed", top, left, width };
}

/**
 * A guided coachmark tour of the workbench. Spotlights real UI by dimming around the target with four
 * panels (no shadow, keeping the flat brand) and a highlight ring, with a positioned card. Dismissible,
 * remembered in localStorage, keyboard navigable, and static (reduced-motion safe).
 */
export function Tour({ open, onClose }: TourProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const current = STEPS[step];

  useEffect(() => {
    if (open) {
      setStep(0);
      cardRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const measure = () => {
      const element = current.target ? document.querySelector(current.target) : null;
      if (!element) {
        setBox(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      const pad = 6;
      setBox({ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step, current.target]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish();
      } else if (event.key === "ArrowRight") {
        next();
      } else if (event.key === "ArrowLeft") {
        setStep((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) {
    return null;
  }

  function finish() {
    safeSetItem(TOUR_SEEN_KEY, "1");
    onClose();
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
    } else {
      setStep(step + 1);
    }
  }

  return (
    <div className="tour" ref={focusTrapRef} role="dialog" aria-modal="true" aria-label="Guided tour">
      {box ? (
        <>
          <div className="tour-dim" style={{ top: 0, left: 0, width: "100%", height: Math.max(0, box.top) }} />
          <div className="tour-dim" style={{ top: box.top + box.height, left: 0, width: "100%", bottom: 0 }} />
          <div className="tour-dim" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div className="tour-dim" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div className="tour-ring" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
        </>
      ) : (
        <div className="tour-dim tour-dim-full" />
      )}

      <div className={`tour-card${box ? "" : " tour-card-center"}`} style={cardStyle(box)} ref={cardRef} tabIndex={-1}>
        <div className="tour-card-head">
          <strong>{current.title}</strong>
          <button type="button" className="rail-collapse" onClick={finish} aria-label="Close tour">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <p>{current.body}</p>
        <div className="tour-card-foot">
          <span className="tour-progress">
            {step + 1} / {STEPS.length}
          </span>
          <div className="tour-card-actions">
            {step > 0 ? (
              <button type="button" className="text-button" onClick={() => setStep((value) => Math.max(0, value - 1))}>
                Back
              </button>
            ) : null}
            <button type="button" className="text-button primary" onClick={next}>
              {step >= STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

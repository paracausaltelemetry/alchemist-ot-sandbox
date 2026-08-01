import { Network, Waypoints } from "lucide-react";
import type { AppView } from "../lib/appView";

/**
 * The top-level OT / IT switch. Alchemist has two halves now, and until this existed the only
 * route between them was a single button on the dashboard — the workbench had no link to the
 * IT mapper at all. Rendered by both headers so it is present wherever you are.
 *
 * Switching loses no work: the OT project autosaves on every change and the IT map is rebuilt
 * from the scan. It does drop the undo stack and the current selection, which the title says.
 */

interface ViewSwitchProps {
  current: AppView;
  onSwitch: (view: AppView) => void;
}

const OPTIONS: Array<{ view: Exclude<AppView, "home">; label: string; Icon: typeof Network; title: string }> = [
  { view: "app", label: "OT", Icon: Network, title: "OT workbench: model and assess a Purdue-zoned architecture" },
  { view: "it", label: "IT", Icon: Waypoints, title: "IT mapper: draw a network from an Nmap scan" }
];

export function ViewSwitch({ current, onSwitch }: ViewSwitchProps) {
  return (
    <div className="segmented-control view-switch" role="group" aria-label="Switch between the OT and IT sides">
      {OPTIONS.map(({ view, label, Icon, title }) => {
        const active = current === view;
        return (
          <button
            key={view}
            type="button"
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={() => onSwitch(view)}
            title={active ? title : `${title}. Your work is saved; undo history is not carried over.`}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

import { sampleProject } from "../sampleProject";
import type { ScenarioMeta } from "./builders";
import { buildingAutomationScenario } from "./buildingAutomation";
import { chemicalScenario } from "./chemical";
import { dataCentreScenario } from "./dataCentre";
import { nuclearScenario } from "./nuclear";
import { oilGasScenario } from "./oilGas";
import { pharmaScenario } from "./pharma";
import { railScenario } from "./rail";
import { substationScenario } from "./substation";
import { waterScenario } from "./water";
import { windScenario } from "./wind";

export type { ScenarioMeta } from "./builders";

/** The default sample (packaging line) re-exposed as a gallery scenario. */
const manufacturingScenario: ScenarioMeta = {
  id: sampleProject.id,
  name: sampleProject.name,
  sector: "Discrete Manufacturing",
  summary:
    "Packaging line with an IT/OT firewall, OT jump host, SCADA-to-PLC control, wireless telemetry, and a safety controller. The default starting sample.",
  standards: ["ISA/IEC 62443", "NIST SP 800-82", "MITRE ATT&CK for ICS"],
  project: sampleProject
};

export const scenarios: ScenarioMeta[] = [
  manufacturingScenario,
  waterScenario,
  substationScenario,
  chemicalScenario,
  buildingAutomationScenario,
  oilGasScenario,
  railScenario,
  pharmaScenario,
  dataCentreScenario,
  windScenario,
  nuclearScenario
];

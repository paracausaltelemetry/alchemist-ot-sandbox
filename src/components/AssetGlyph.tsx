import {
  Activity,
  AlertTriangle,
  Building2,
  Cloud,
  Cpu,
  Database,
  Gauge,
  KeyRound,
  Monitor,
  Radio,
  Router,
  Shield,
  Users,
  Wifi
} from "lucide-react";

interface AssetGlyphProps {
  icon: string;
  size?: number;
}

export function AssetGlyph({ icon, size = 18 }: AssetGlyphProps) {
  const props = { size, strokeWidth: 2 };
  switch (icon) {
    case "building":
      return <Building2 {...props} />;
    case "shield":
      return <Shield {...props} />;
    case "key":
      return <KeyRound {...props} />;
    case "database":
      return <Database {...props} />;
    case "monitor":
    case "panel":
      return <Monitor {...props} />;
    case "activity":
      return <Activity {...props} />;
    case "cpu":
      return <Cpu {...props} />;
    case "siren":
      return <AlertTriangle {...props} />;
    case "gauge":
      return <Gauge {...props} />;
    case "wifi":
      return <Wifi {...props} />;
    case "users":
      return <Users {...props} />;
    case "cloud":
      return <Cloud {...props} />;
    case "radio":
      return <Radio {...props} />;
    default:
      return <Router {...props} />;
  }
}

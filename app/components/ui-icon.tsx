import {
  AirVent,
  ArrowUpRight,
  ChartLine,
  ChevronDown,
  Coffee,
  CookingPot,
  FileText,
  Heater,
  Info,
  Microwave,
  Monitor,
  Settings,
  Tv,
  WashingMachine,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SVGProps } from "react";

export type IconName =
  | "arrow-up-right"
  | "chart"
  | "chevron-down"
  | "close"
  | "coffee"
  | "computer"
  | "info"
  | "dishwasher"
  | "dryer"
  | "heat-pump"
  | "kettle"
  | "oven"
  | "sauna"
  | "settings"
  | "source"
  | "television"
  | "washing";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const iconComponents: Record<IconName, LucideIcon> = {
  "arrow-up-right": ArrowUpRight,
  chart: ChartLine,
  "chevron-down": ChevronDown,
  close: X,
  coffee: Coffee,
  computer: Monitor,
  info: Info,
  dishwasher: WashingMachine,
  dryer: Wind,
  "heat-pump": AirVent,
  kettle: CookingPot,
  oven: Microwave,
  sauna: Heater,
  settings: Settings,
  source: FileText,
  television: Tv,
  washing: WashingMachine,
};

export function Icon({ name, ...props }: IconProps) {
  const IconComponent = iconComponents[name];

  return <IconComponent aria-hidden={true} focusable={false} {...props} />;
}

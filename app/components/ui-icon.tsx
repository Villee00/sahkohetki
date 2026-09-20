import {
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

type IconProps = ComponentProps<LucideIcon> & {
  icon: LucideIcon;
};

export function Icon({ icon: IconComponent, ...props }: IconProps) {

  return <IconComponent aria-hidden={true} focusable={false} {...props} />;
}

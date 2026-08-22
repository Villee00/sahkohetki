import type { SVGProps } from "react";

export type IconName =
  | "arrow-up-right"
  | "chart"
  | "close"
  | "info"
  | "spark"
  | "source";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };

  switch (name) {
    case "arrow-up-right":
      return (
        <svg {...commonProps}>
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      );
    case "chart":
      return (
        <svg {...commonProps}>
          <path d="M4 19V5M4 19h16" />
          <path d="m7 15 3-4 3 2 4-6" />
          <circle cx="7" cy="15" r=".75" fill="currentColor" stroke="none" />
          <circle cx="10" cy="11" r=".75" fill="currentColor" stroke="none" />
          <circle cx="13" cy="13" r=".75" fill="currentColor" stroke="none" />
          <circle cx="17" cy="7" r=".75" fill="currentColor" stroke="none" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10.5v5M12 7.5h.01" />
        </svg>
      );
    case "spark":
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.35 5.65L19 10l-5.65 1.35L12 17l-1.35-5.65L5 10l5.65-1.35L12 3Z" />
          <path d="m19 15 .55 2.45L22 18l-2.45.55L19 21l-.55-2.45L16 18l2.45-.55L19 15Z" />
        </svg>
      );
    case "source":
      return (
        <svg {...commonProps}>
          <path d="M7 4.5h8l3 3V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
          <path d="M14.5 4.5V8H18M9 12h6M9 15.5h6" />
        </svg>
      );
  }
}

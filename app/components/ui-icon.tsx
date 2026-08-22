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
  | "kettle"
  | "oven"
  | "sauna"
  | "source"
  | "television"
  | "washing";

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
    case "chevron-down":
      return (
        <svg {...commonProps}>
          <path d="m6.5 9 5.5 5.5L17.5 9" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "coffee":
      return (
        <svg {...commonProps}>
          <path d="M6 5h10v7.5a3.5 3.5 0 0 1-3.5 3.5h-3A3.5 3.5 0 0 1 6 12.5V5Z" />
          <path d="M16 7h1.5a2.5 2.5 0 0 1 0 5H16M8 19h8M10 16v3M14 16v3" />
        </svg>
      );
    case "computer":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
          <path d="M8 19.5h8M12 15.5v4M9 19.5h6" />
        </svg>
      );
    case "dishwasher":
      return (
        <svg {...commonProps}>
          <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
          <path d="M8 7h8M8 10.5h8M8 17h8" />
          <circle cx="8" cy="5.5" r=".65" fill="currentColor" stroke="none" />
          <circle cx="11" cy="5.5" r=".65" fill="currentColor" stroke="none" />
        </svg>
      );
    case "dryer":
      return (
        <svg {...commonProps}>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <circle cx="12" cy="13" r="4.4" />
          <path d="M8 6.5h.01M11 6.5h.01" />
        </svg>
      );
    case "kettle":
      return (
        <svg {...commonProps}>
          <path d="M7 9.5a5 5 0 0 1 10 0v5a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-5Z" />
          <path d="M17 10h2.5l1.5 2.5M8 8c0-3 1.8-4.5 4-4.5S16 5 16 8M9 20h6" />
        </svg>
      );
    case "oven":
      return (
        <svg {...commonProps}>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <path d="M7 8h10M7 11.5h10M7 15h10M8 6h.01M11 6h.01M14 6h.01" />
        </svg>
      );
    case "sauna":
      return (
        <svg {...commonProps}>
          <path d="M5 17.5h14M7 14h10M8 14v3.5M16 14v3.5M9 10.5c0-1.7 1.3-1.7 1.3-3.4M13 10.5c0-1.7 1.3-1.7 1.3-3.4M17 10.5c0-1.7 1.3-1.7 1.3-3.4" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10.5v5M12 7.5h.01" />
        </svg>
      );
    case "source":
      return (
        <svg {...commonProps}>
          <path d="M7 4.5h8l3 3V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
          <path d="M14.5 4.5V8H18M9 12h6M9 15.5h6" />
        </svg>
      );
    case "television":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="12" rx="1.5" />
          <path d="m9 21 3-4 3 4M7 3l5 2 5-2" />
        </svg>
      );
    case "washing":
      return (
        <svg {...commonProps}>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <circle cx="12" cy="13" r="4.4" />
          <path d="M8 6.5h.01M11 6.5h.01" />
        </svg>
      );
  }
}

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export type SiteRoute = "price" | "forecast";

type SiteHeaderProps = {
  activeRoute: SiteRoute;
  context?: ReactNode;
  utilityActions?: ReactNode;
  utilityLabel?: string;
};

const routes: readonly {
  id: SiteRoute;
  href: string;
  label: string;
}[] = [
  { id: "price", href: "/", label: "Hinta" },
  { id: "forecast", href: "/ennuste", label: "Sähköennuste" },
];

export function SiteHeader({
  activeRoute,
  context,
  utilityActions,
  utilityLabel = "Sivun työkalut",
}: SiteHeaderProps) {
  return (
    <header className="site-header sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <div className="site-header__inner mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:gap-x-5 sm:px-6 lg:flex-nowrap lg:px-8">
        <Link
          href="/"
          aria-label="Sähköhetki – etusivu"
          className="site-header__brand group inline-flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
        >
          <Image
            src="/icon.ico"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
            aria-hidden="true"
            unoptimized
          />
          <span className="site-brand-text">
            <span className="block text-sm font-semibold tracking-tight text-white">
              Sähköhetki
            </span>
            <span className="block text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">
              Hinta ja tuotanto
            </span>
          </span>
        </Link>

        <nav
          aria-label="Päänavigaatio"
          className="site-route-nav order-3 flex w-full items-center gap-1 lg:order-none lg:w-auto"
        >
          {routes.map((route) => {
            const active = route.id === activeRoute;
            return (
              <Link
                key={route.id}
                href={route.href}
                aria-current={active ? "page" : undefined}
                className={`site-route-link ${active ? "site-route-link--active" : ""}`}
              >
                {route.label}
              </Link>
            );
          })}
        </nav>

        <div className="site-header__tools ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          {context ? (
            <div className="site-header__context min-w-0">{context}</div>
          ) : null}
          {utilityActions ? (
            <nav
              aria-label={utilityLabel}
              className="site-header__utility flex items-center gap-0.5 sm:gap-1"
            >
              {utilityActions}
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  );
}

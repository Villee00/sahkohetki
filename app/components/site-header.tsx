import Image from "next/image";
import type { ReactNode } from "react";

type SiteHeaderProps = {
  brandHref: string;
  navigation: ReactNode;
  children?: ReactNode;
};

/**
 * Shared site chrome for the live explorer and history views.
 *
 * The page-specific controls stay in the caller so this component only owns
 * the stable header layout, branding, and responsive spacing.
 */
export function SiteHeader({
  brandHref,
  navigation,
  children,
}: SiteHeaderProps) {
  return (
    <header className="site-header sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <div className="site-header__inner mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-5 sm:px-6 lg:px-8">
        <div className="site-header__brand-group flex shrink-0 items-center gap-2 sm:gap-4">
          <a
            href={brandHref}
            className="group inline-flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
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
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                Pörssisähkön hinta
              </span>
            </span>
          </a>
          <div className="site-header__brand-nav flex shrink-0 items-center gap-0.5 sm:gap-1">
            {navigation}
          </div>
        </div>
        <div className="site-header__tools flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
          {children}
        </div>
      </div>
    </header>
  );
}

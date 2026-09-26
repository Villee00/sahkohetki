import { SiteHeader } from "../components/site-header";

export default function Loading() {
  return (
    <main className="site-shell forecast-page min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader activeRoute="forecast" />
      <div
        id="main-content"
        tabIndex={-1}
        className="page-content mx-auto max-w-7xl space-y-5 px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-10"
        aria-busy="true"
      >
        <section className="forecast-hero" aria-labelledby="forecast-loading-heading">
          <p className="forecast-eyebrow">Seuraavat 72 tuntia</p>
          <h1 id="forecast-loading-heading" className="forecast-title">
            Sähköennuste
          </h1>
        </section>
        <section className="forecast-panel glass-panel p-5 sm:p-6">
          <p role="status" aria-live="polite" className="text-sm text-slate-300">
            Ladataan sähköennustetta…
          </p>
          <div aria-hidden="true" className="mt-5 space-y-3">
            <span className="site-loading__block block h-3 w-48 rounded-full" />
            <span className="site-loading__block block h-40 w-full rounded-xl" />
          </div>
        </section>
      </div>
    </main>
  );
}

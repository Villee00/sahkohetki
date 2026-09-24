import { SiteHeader } from "./site-header";

type SiteLoadingShellProps = {
  destination: "now" | "history";
};

const chartBarHeights = [34, 48, 39, 62, 53, 72, 46, 58, 83, 67, 91, 56];

function LoadingBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`site-loading__block ${className}`}
    />
  );
}

function NowLoadingContent() {
  return (
    <div className="page-content mx-auto max-w-7xl space-y-7 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <section className="hero-panel overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="space-y-3">
            <LoadingBlock className="h-3 w-28 rounded-full" />
            <LoadingBlock className="h-3 w-20 rounded-full" />
            <LoadingBlock className="h-12 w-44 rounded-xl sm:h-14 sm:w-56" />
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-3">
            {chartBarHeights.slice(0, 3).map((height, index) => (
              <div
                key={index}
                className="flex min-w-20 flex-col items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-950/25 px-3 py-3"
              >
                <LoadingBlock className="h-2 w-12 rounded-full" />
                <LoadingBlock className="h-5 w-14 rounded-md" />
                <LoadingBlock className="h-2 w-10 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <LoadingBlock className="mt-6 h-2 w-full rounded-full" />
      </section>

      <section className="price-chart__frame glass-panel rounded-3xl border p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <LoadingBlock className="h-4 w-36 rounded-full" />
            <LoadingBlock className="h-3 w-52 rounded-full" />
          </div>
          <div className="flex gap-2">
            <LoadingBlock className="h-9 w-24 rounded-xl" />
            <LoadingBlock className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div className="mt-7 flex h-52 items-end gap-2 sm:h-64 sm:gap-3">
          {chartBarHeights.map((height, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="site-loading__bar site-loading__block flex-1 rounded-t-lg"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          <LoadingBlock className="h-2 w-8 rounded-full" />
          <LoadingBlock className="h-2 w-8 rounded-full" />
          <LoadingBlock className="h-2 w-8 rounded-full" />
          <LoadingBlock className="h-2 w-8 rounded-full" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="glass-panel rounded-2xl border border-slate-700/70 p-5"
          >
            <LoadingBlock className="h-3 w-28 rounded-full" />
            <LoadingBlock className="mt-4 h-6 w-40 rounded-lg" />
            <LoadingBlock className="mt-3 h-3 w-full rounded-full" />
            <LoadingBlock className="mt-2 h-3 w-3/4 rounded-full" />
          </div>
        ))}
      </section>
    </div>
  );
}

function HistoryLoadingContent() {
  return (
    <div className="page-content mx-auto space-y-6 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
      <section className="history-intro">
        <LoadingBlock className="h-3 w-48 rounded-full" />
        <LoadingBlock className="mt-4 h-11 w-60 max-w-full rounded-xl sm:h-14 sm:w-80" />
        <div className="mt-3 space-y-2">
          <LoadingBlock className="h-3 w-full max-w-2xl rounded-full" />
          <LoadingBlock className="h-3 w-4/5 max-w-xl rounded-full" />
        </div>
      </section>

      <section className="history-summary history-summary--compact hero-panel">
        <div className="history-summary__primary space-y-4">
          <LoadingBlock className="h-3 w-32 rounded-full" />
          <LoadingBlock className="h-6 w-44 rounded-lg" />
          <LoadingBlock className="h-10 w-32 rounded-xl" />
          <LoadingBlock className="h-3 w-40 rounded-full" />
        </div>
        <div className="history-metrics">
          {[0, 1, 2, 3].map((item) => (
            <article key={item}>
              <LoadingBlock className="h-3 w-24 max-w-full rounded-full" />
              <LoadingBlock className="mt-3 h-6 w-20 max-w-full rounded-lg" />
              <LoadingBlock className="mt-2 h-3 w-28 max-w-full rounded-full" />
            </article>
          ))}
        </div>
        <div className="history-percentile">
          <LoadingBlock className="h-2 w-full rounded-full" />
          <div className="mt-3 flex justify-between">
            {[0, 1, 2, 3, 4].map((item) => (
              <LoadingBlock key={item} className="h-2 w-8 rounded-full" />
            ))}
          </div>
        </div>
      </section>

      <section className="history-toolbar glass-panel" aria-hidden="true">
        <div className="flex gap-1 rounded-xl bg-slate-950/30 p-1">
          <LoadingBlock className="h-9 w-16 rounded-lg" />
          <LoadingBlock className="h-9 w-16 rounded-lg" />
          <LoadingBlock className="h-9 w-16 rounded-lg" />
        </div>
        <div className="ml-auto flex gap-2">
          <LoadingBlock className="h-10 w-10 rounded-xl" />
          <LoadingBlock className="h-10 w-10 rounded-xl" />
        </div>
      </section>

      <section className="price-chart__frame glass-panel rounded-3xl border p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <LoadingBlock className="h-4 w-40 rounded-full" />
          <LoadingBlock className="h-9 w-28 rounded-xl" />
        </div>
        <div className="mt-7 flex h-56 items-end gap-2 sm:h-72 sm:gap-3">
          {chartBarHeights.map((height, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="site-loading__bar site-loading__block flex-1 rounded-t-lg"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function SiteLoadingShell({ destination }: SiteLoadingShellProps) {
  const isHistory = destination === "history";

  return (
    <main
      className={`site-shell min-h-screen text-slate-100${
        isHistory ? " history-shell" : ""
      }`}
    >
      <SiteHeader
        activeRoute={isHistory ? "history" : "price"}
        brandHref="/"
      />
      <p role="status" aria-live="polite" className="sr-only">
        {isHistory ? "Ladataan hintahistoriaa" : "Ladataan sähkön hintatietoja"}
      </p>
      <div id="main-content" aria-busy="true">
        <div aria-hidden="true">
          {isHistory ? <HistoryLoadingContent /> : <NowLoadingContent />}
        </div>
      </div>
    </main>
  );
}

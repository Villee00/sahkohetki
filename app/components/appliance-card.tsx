import type { EverydayUse } from "@/lib/appliances";
import type { CostEstimate } from "@/lib/price-types";

type ApplianceCardProps = {
  use: EverydayUse;
  estimate: CostEstimate;
};

const numberFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatReviewedOn(reviewedOn: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reviewedOn);
  if (!match) return reviewedOn;
  return `${Number(match[3])}.${Number(match[2])}.${match[1]}`;
}

export function ApplianceCard({ use, estimate }: ApplianceCardProps) {
  return (
    <article className="appliance-card flex h-full flex-col rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="appliance-card__name text-lg font-semibold text-white">{use.name}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{use.standardUse}</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-300">
          {numberFormatter.format(use.consumptionKwh)} kWh
        </span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Arvioitu spot-kustannus</p>
          <p className="appliance-card__cost mt-1 font-mono text-3xl font-semibold tracking-tight text-white">
            {estimate.centsLabel} <span className="text-base font-normal text-slate-400">snt</span>
          </p>
        </div>
        <p className="font-mono text-sm text-slate-400">{estimate.eurosLabel} €</p>
      </div>

      {estimate.comparison ? (
        <div className="mt-5 border-t border-slate-800 pt-4 text-sm">
          <p className="font-medium text-emerald-300">{estimate.comparison.title}</p>
          <p className="mt-1 leading-5 text-slate-400">{estimate.comparison.detail}</p>
        </div>
      ) : null}

      <details className="appliance-card__assumption mt-auto border-t border-transparent pt-5 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
          Oletus ja rajaus
        </summary>
        <p className="mt-2 leading-5">
          {use.assumption} Ulkoinen varmistus on vielä kesken. Päivätty {formatReviewedOn(use.reviewedOn)}.
        </p>
      </details>
    </article>
  );
}

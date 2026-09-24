import { useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotionConfig,
} from "motion/react";
import type { EverydayUse } from "@/lib/appliances";
import type { CostEstimate } from "@/lib/price-types";
import { Icon } from "./ui-icon";
import type { IconName } from "./ui-icon";

type ApplianceCardProps = {
  use: EverydayUse;
  estimate: CostEstimate | null;
  costLabel?: string;
  emptyMessage?: string;
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

const applianceIcons: Record<EverydayUse["id"], IconName> = {
  coffee: "coffee",
  sauna: "sauna",
  kettle: "kettle",
  oven: "oven",
  washing: "washing",
  dryer: "dryer",
  dishwasher: "dishwasher",
  "heat-pump": "heat-pump",
  television: "television",
  computer: "computer",
};

const compactUseLabels: Record<EverydayUse["id"], string> = {
  coffee: "1 pannullinen",
  sauna: "1 saunakerta",
  kettle: "1 l vettä",
  oven: "1 h ruoanlaittoa",
  washing: "1 pesu",
  dryer: "1 kuivaus",
  dishwasher: "1 pesu",
  "heat-pump": "1 h lämmitystä",
  television: "1 h katselua",
  computer: "1 h käyttöä",
};

export function ApplianceCard({
  use,
  estimate,
  costLabel,
  emptyMessage,
}: ApplianceCardProps) {
  const [assumptionOpen, setAssumptionOpen] = useState(false);
  const reducedMotion = useReducedMotionConfig();
  const assumptionPanelTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <article className="appliance-card appliance-card--row rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 sm:p-5">
      <div className="appliance-card__icon-frame" aria-hidden="true">
        <Icon
          name={applianceIcons[use.id]}
          className="appliance-card__icon"
          strokeWidth={1.5}
        />
      </div>

      <div className="appliance-card__identity min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="appliance-card__name text-lg font-semibold text-white">
            {use.name}
          </h3>
          <span className="appliance-card__consumption rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-300">
            {numberFormatter.format(use.consumptionKwh)} kWh
          </span>
        </div>
        <p className="appliance-card__standard-use mt-1 text-sm leading-5 text-slate-400">
          {use.standardUse}
        </p>
        <p className="appliance-card__compact-use text-xs text-slate-400">
          {compactUseLabels[use.id]}
        </p>
      </div>

      <div
        className="appliance-card__metrics"
        aria-label={`${use.name} kustannustiedot`}
      >
        {estimate ? (
          <>
            <div className="appliance-card__metric appliance-card__metric--cost">
              <p className="appliance-card__metric-label">
                {costLabel ?? "ARVIOITU KUSTANNUS SPOT-HINNALLA"}
              </p>
              <p className="appliance-card__cost mt-1 font-mono text-2xl font-semibold tracking-tight text-white">
                {estimate.centsLabel}{" "}
                <span className="text-sm font-normal text-slate-400">snt</span>
              </p>
              <p className="appliance-card__euro-value font-mono text-xs text-slate-500">
                {estimate.eurosLabel} €
              </p>
            </div>

            {estimate.comparison ? (
              <div className="appliance-card__metric appliance-card__metric--saving">
                <p className="appliance-card__metric-label appliance-card__metric-label--saving">
                  Säästät
                </p>
                <p className="appliance-card__saving mt-1 font-mono text-base font-semibold text-emerald-300">
                  {estimate.comparison.title.replace(/^Säästät\s+/, "")}
                </p>
                <p className="appliance-card__metric-detail mt-1 text-xs leading-4 text-slate-500">
                  {estimate.comparison.detail}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="appliance-card__metric appliance-card__metric--cost">
            <p className="appliance-card__metric-label">
              {costLabel ?? "ARVIOITU KUSTANNUS SPOT-HINNALLA"}
            </p>
            <p className="appliance-card__cost mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-500">
              —
            </p>
            <p className="appliance-card__metric-detail mt-1 text-xs leading-4 text-slate-500">
              {emptyMessage ?? "Valitse kunta ja verkkoyhtiö"}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="appliance-card__assumption-trigger cursor-pointer font-medium text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        aria-label={`${use.name}: lisätiedot`}
        aria-expanded={assumptionOpen}
        aria-controls={`appliance-${use.id}-assumption`}
        title="Lisätiedot"
        onClick={() => setAssumptionOpen((open) => !open)}
      >
        <Icon
          name="chevron-down"
          className="appliance-card__assumption-chevron"
          strokeWidth={1.5}
        />
      </button>
      <AnimatePresence initial={false}>
        {assumptionOpen ? (
          <motion.div
            key="assumption-panel"
            id={`appliance-${use.id}-assumption`}
            className="appliance-card__assumption-panel text-xs text-slate-500"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={assumptionPanelTransition}
          >
            <div className="appliance-card__mobile-details">
              <p className="font-semibold text-slate-300">Käyttö ja vertailu</p>
              <p className="mt-2 leading-5">
                {use.standardUse} · {numberFormatter.format(use.consumptionKwh)} kWh
              </p>
              {estimate ? (
                <>
                  <p className="mt-2 leading-5">
                    Euroina: {estimate.eurosLabel} €
                  </p>
                  {estimate.comparison ? (
                    <p className="mt-2 leading-5 text-emerald-300">
                      {estimate.comparison.title} {estimate.comparison.detail}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 leading-5">
                  {emptyMessage ?? "Valitse kunta ja verkkoyhtiö"}
                </p>
              )}
            </div>
            <p className="appliance-card__assumption-copy leading-5">
              {use.assumption} Lähde:{" "}
              <a
                href={use.source.url}
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              >
                {use.source.label}
              </a>
              . Tarkistettu {formatReviewedOn(use.reviewedOn)}.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

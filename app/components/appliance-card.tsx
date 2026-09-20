import { useState } from "react";
import {
  AirVent,
  ChevronDown,
  Coffee,
  CookingPot,
  Heater,
  Microwave,
  Monitor,
  Tv,
  WashingMachine,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { EverydayUse } from "@/lib/appliances";
import type { CostEstimate } from "@/lib/price-types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "./ui-icon";

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

const applianceIcons: Record<EverydayUse["id"], LucideIcon> = {
  coffee: Coffee,
  sauna: Heater,
  kettle: CookingPot,
  oven: Microwave,
  washing: WashingMachine,
  dryer: Wind,
  dishwasher: WashingMachine,
  "heat-pump": AirVent,
  television: Tv,
  computer: Monitor,
};

export function ApplianceCard({
  use,
  estimate,
  costLabel,
  emptyMessage,
}: ApplianceCardProps) {
  const [assumptionOpen, setAssumptionOpen] = useState(false);

  return (
    <article aria-labelledby={`appliance-${use.id}-name`}>
      <Card className="appliance-card appliance-card--row p-4 sm:p-5">
        <CardHeader className="contents">
          <div className="appliance-card__icon-frame" aria-hidden="true">
            <Icon
              icon={applianceIcons[use.id]}
              className="appliance-card__icon"
              strokeWidth={1.5}
            />
          </div>

          <div className="appliance-card__identity min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="appliance-card__name">
                <h3
                  id={`appliance-${use.id}-name`}
                  className="text-lg font-semibold tracking-tight"
                >
                  {use.name}
                </h3>
              </CardTitle>
              <Badge
                variant="secondary"
                className="appliance-card__consumption font-mono"
              >
                {numberFormatter.format(use.consumptionKwh)} kWh
              </Badge>
            </div>
            <CardDescription className="appliance-card__standard-use mt-1 text-sm leading-5">
              {use.standardUse}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="contents">
          <div
            className="appliance-card__metrics"
            aria-label={`${use.name} kustannustiedot`}
          >
            {estimate ? (
              <>
                <div className="appliance-card__metric appliance-card__metric--cost">
                  <p className="appliance-card__metric-label text-muted-foreground">
                    {costLabel ?? "ARVIOITU KUSTANNUS SPOT-HINNALLA"}
                  </p>
                  <p className="appliance-card__cost mt-1 font-mono text-2xl font-semibold tracking-tight text-card-foreground">
                    {estimate.centsLabel}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      snt
                    </span>
                  </p>
                  <p className="appliance-card__euro-value font-mono text-xs text-muted-foreground">
                    {estimate.eurosLabel} €
                  </p>
                </div>

                {estimate.comparison ? (
                  <div className="appliance-card__metric appliance-card__metric--saving">
                    <p className="appliance-card__metric-label text-muted-foreground">
                      Säästät
                    </p>
                    <Badge
                      variant="secondary"
                      className="appliance-card__saving mt-1 font-mono text-base font-semibold"
                    >
                      {estimate.comparison.title.replace(/^Säästät\s+/, "")}
                    </Badge>
                    <p className="appliance-card__metric-detail mt-1 text-xs leading-4 text-muted-foreground">
                      {estimate.comparison.detail}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="appliance-card__metric appliance-card__metric--cost">
                <p className="appliance-card__metric-label text-muted-foreground">
                  {costLabel ?? "ARVIOITU KUSTANNUS SPOT-HINNALLA"}
                </p>
                <p className="appliance-card__cost mt-1 font-mono text-2xl font-semibold tracking-tight text-muted-foreground">
                  —
                </p>
                <p className="appliance-card__metric-detail mt-1 text-xs leading-4 text-muted-foreground">
                  {emptyMessage ?? "Valitse kunta ja verkkoyhtiö"}
                </p>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="contents">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="appliance-card__assumption-trigger"
            aria-label={`${use.name}: näytä oletus ja rajaus`}
            aria-expanded={assumptionOpen}
            aria-controls={`appliance-${use.id}-assumption`}
            title="Näytä oletus ja rajaus"
            onClick={() => setAssumptionOpen((open) => !open)}
          >
            <span className="sr-only">Oletus ja rajaus</span>
            <Icon
              icon={ChevronDown}
              className="appliance-card__assumption-chevron"
              strokeWidth={1.5}
            />
          </Button>
        </CardFooter>

        {assumptionOpen ? (
          <div
            id={`appliance-${use.id}-assumption`}
            className="appliance-card__assumption-panel text-xs text-muted-foreground"
          >
            <p className="appliance-card__assumption-copy leading-5">
              {use.assumption} Lähde:{" "}
              <a
                href={use.source.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {use.source.label}
              </a>
              . Tarkistettu {formatReviewedOn(use.reviewedOn)}.
            </p>
          </div>
        ) : null}
      </Card>
    </article>
  );
}

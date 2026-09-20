import { LocateFixed } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type {
  MunicipalityTransfer,
  TransferData,
  TransferTariff,
} from "@/lib/price-types";

type TransferCostPanelProps = {
  data: TransferData;
  selectedMunicipalityCode: string;
  selectedOperatorId: string;
  selectedMunicipality: MunicipalityTransfer | null;
  selectedTariff: TransferTariff | null;
  onMunicipalityChange: (municipalityCode: string) => void;
  onOperatorChange: (operatorId: string) => void;
  onLocate: () => void;
  locationStatus: "idle" | "locating" | "success" | "error";
  locationMessage: string | null;
};

const rateFormatter = new Intl.NumberFormat("fi-FI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const euroFormatter = new Intl.NumberFormat("fi-FI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatSnapshotDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? Number(match[3]) + "." + Number(match[2]) + "." + match[1] : value;
}

function formatRate(value: number): string {
  return rateFormatter.format(value) + " snt/kWh";
}

function formatEuro(value: number): string {
  return euroFormatter.format(value) + " €/kk";
}

export function TransferCostPanel({
  data,
  selectedMunicipalityCode,
  selectedOperatorId,
  selectedMunicipality,
  selectedTariff,
  onMunicipalityChange,
  onOperatorChange,
  onLocate,
  locationStatus,
  locationMessage,
}: TransferCostPanelProps) {
  const operators = selectedMunicipality?.operators ?? [];
  const operatorDisabled = !selectedMunicipality || operators.length <= 1;
  const municipalityItems = [
    { label: "Valitse kunta", value: null },
    ...data.municipalities.map((municipality) => ({
      label: municipality.city,
      value: municipality.municipalityCode,
    })),
  ];
  const operatorPlaceholder = !selectedMunicipality
    ? "Valitse kunta ensin"
    : operators.length === 0
      ? "Verkkoyhtiötä ei löytynyt"
      : operators.length > 1
        ? "Valitse verkkoyhtiö"
        : null;
  const operatorItems = [
    ...(operatorPlaceholder
      ? [{ label: operatorPlaceholder, value: null }]
      : []),
    ...operators.map((operator) => ({
      label:
        operator.operatorName +
        (!operator.priceAvailable ? " (hinta ei saatavilla)" : ""),
      value: operator.id,
    })),
  ];
  const selectedEnergyCharge = selectedTariff?.priceAvailable
    ? selectedTariff.energyChargeCentsPerKwh
    : null;
  const combinedRate =
    selectedEnergyCharge !== null
      ? selectedEnergyCharge + data.electricityTax.centsPerKwhVatIncluded
      : null;
  const tariffMessage =
    selectedTariff?.priceAvailable && combinedRate !== null
      ? null
      : selectedMunicipality && selectedOperatorId
        ? "Tämän verkkoyhtiön siirtohinta ei ole saatavilla CSV-aineistossa. Esimerkkien kustannuksia ei arvioida."
        : selectedMunicipality && operators.length > 1
          ? "Valitse verkkoyhtiö, jotta esimerkkien kustannukset voidaan laskea."
          : selectedMunicipality
            ? "Tälle kunnalle ei löytynyt verkkoyhtiötä CSV-aineistosta."
            : null;
  const tariffMessageIsError = Boolean(
    selectedMunicipality && selectedOperatorId,
  );

  return (
    <section aria-labelledby="transfer-cost-heading" className="pt-5">
      <Separator className="mb-5" />
      <div className="flex flex-col gap-1">
        <h3
          id="transfer-cost-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Siirto + sähkövero
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Lisää siirtomaksu ja sähkövero käyttökustannusarvioihin.
        </p>
      </div>

      <FieldGroup className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="transfer-municipality">Kunta</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              items={municipalityItems}
              value={selectedMunicipalityCode || null}
              onValueChange={(value) => onMunicipalityChange(value ?? "")}
            >
              <SelectTrigger
                id="transfer-municipality"
                className="min-h-11 min-w-0 w-full flex-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {municipalityItems.map((item) => (
                    <SelectItem key={item.value ?? "empty"} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={onLocate}
              disabled={locationStatus === "locating"}
              aria-label="Paikanna minut"
              title="Paikanna minut"
              className="shrink-0"
            >
              <LocateFixed aria-hidden="true" />
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Sijainti haetaan vain painikkeella. Karttatieto:{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              OpenStreetMap
            </a>
            .
          </p>
        </Field>

        <Field data-disabled={operatorDisabled ? "true" : undefined}>
          <FieldLabel htmlFor="transfer-operator">
            Sähköverkkoyhtiö
          </FieldLabel>
          <Select
            items={operatorItems}
            value={selectedOperatorId || null}
            onValueChange={(value) => onOperatorChange(value ?? "")}
            disabled={operatorDisabled}
          >
            <SelectTrigger
              id="transfer-operator"
              className="min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {operatorItems.map((item) => (
                  <SelectItem key={item.value ?? "empty"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      {locationMessage ? (
        <div className="mt-5 flex flex-col gap-5">
          <Separator />
          <Alert
            variant={locationStatus === "error" ? "destructive" : "default"}
            role={locationStatus === "error" ? "alert" : "status"}
          >
            <AlertDescription>{locationMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {selectedTariff?.priceAvailable && selectedEnergyCharge !== null && combinedRate !== null ? (
        <div
          className="mt-4 grid grid-cols-2 gap-3 border border-border bg-muted p-4 sm:grid-cols-4"
          aria-label="Valitun siirtotariffin tiedot"
          role="group"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Siirtomaksu
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {formatRate(selectedEnergyCharge)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Sähkövero
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {formatRate(data.electricityTax.centsPerKwhVatIncluded)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Siirto + vero
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-primary">
              {formatRate(combinedRate)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Perusmaksu
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {selectedTariff.monthlyFixedFeeEur === null
                ? "—"
                : formatEuro(selectedTariff.monthlyFixedFeeEur)}
            </p>
          </div>
        </div>
      ) : null}

      {tariffMessage ? (
        <div className="mt-5 flex flex-col gap-5">
          <Separator />
          <Alert
            variant={tariffMessageIsError ? "destructive" : "default"}
            role={tariffMessageIsError ? "alert" : "status"}
          >
            <AlertDescription>{tariffMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {selectedTariff?.priceAvailable ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            {selectedTariff.tariffName} · tariffin snapshot{" "}
            {formatSnapshotDate(selectedTariff.tariffSnapshotCreatedAt)}
          </span>
          {selectedTariff.tariffSourceUrl ? (
            <a
              href={selectedTariff.tariffSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Tariffin lähde
            </a>
          ) : null}
          <span>
            Sähkövero voimassa{" "}
            {formatSnapshotDate(data.electricityTax.effectiveFrom)} alkaen
          </span>
          <a
            href={data.electricityTax.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Verohallinnon verotaulukko
          </a>
        </div>
      ) : null}
    </section>
  );
}

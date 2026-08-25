"use client";

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
}: TransferCostPanelProps) {
  const operators = selectedMunicipality?.operators ?? [];
  const combinedRate =
    selectedTariff?.priceAvailable &&
    selectedTariff.energyChargeCentsPerKwh !== null
      ? selectedTariff.energyChargeCentsPerKwh +
        data.electricityTax.centsPerKwhVatIncluded
      : null;

  return (
    <section
      aria-labelledby="transfer-cost-heading"
      className="transfer-cost-panel rounded-3xl border border-slate-700/70 bg-slate-900/75 p-5 shadow-xl shadow-slate-950/20 sm:p-6"
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Siirto + sähkövero
          </p>
          <h2
            id="transfer-cost-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Näytä käyttökustannus omalla verkkoyhtiölläsi
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Valitse kunta ja verkkoyhtiö. Esimerkkien hintoihin lisätään
            valitun aikavälin spot-hinta, siirtomaksu ja kotitalouden sähkövero.
            Kuukausittainen perusmaksu näytetään erikseen.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
          <div>
            <label
              htmlFor="transfer-municipality"
              className="text-sm font-semibold text-white"
            >
              Kunta
            </label>
            <select
              id="transfer-municipality"
              value={selectedMunicipalityCode}
              onChange={(event) => onMunicipalityChange(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20"
            >
              <option value="">Valitse kunta</option>
              {data.municipalities.map((municipality) => (
                <option
                  key={municipality.municipalityCode}
                  value={municipality.municipalityCode}
                >
                  {municipality.city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="transfer-operator"
              className="text-sm font-semibold text-white"
            >
              Sähköverkkoyhtiö
            </label>
            <select
              id="transfer-operator"
              value={selectedOperatorId}
              disabled={!selectedMunicipality || operators.length <= 1}
              onChange={(event) => onOperatorChange(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {!selectedMunicipality ? (
                <option value="">Valitse kunta ensin</option>
              ) : operators.length === 0 ? (
                <option value="">Verkkoyhtiötä ei löytynyt</option>
              ) : operators.length > 1 ? (
                <option value="">Valitse verkkoyhtiö</option>
              ) : null}
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.operatorName}
                  {!operator.priceAvailable ? " (hinta ei saatavilla)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedTariff?.priceAvailable && combinedRate !== null ? (
        <div
          className="mt-5 grid gap-3 border-t border-slate-800 pt-5 sm:grid-cols-4"
          aria-label="Valitun siirtotariffin tiedot"
          role="group"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Siirtomaksu
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {formatRate(selectedTariff.energyChargeCentsPerKwh!)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Sähkövero
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {formatRate(data.electricityTax.centsPerKwhVatIncluded)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Siirto + vero
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-sky-200">
              {formatRate(combinedRate)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Perusmaksu
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {selectedTariff.monthlyFixedFeeEur === null
                ? "—"
                : formatEuro(selectedTariff.monthlyFixedFeeEur)}
            </p>
          </div>
        </div>
      ) : selectedMunicipality && selectedOperatorId ? (
        <p
          role="alert"
          className="mt-5 border-t border-amber-300/20 pt-5 text-sm leading-6 text-amber-100"
        >
          Tämän verkkoyhtiön siirtohinta ei ole saatavilla CSV-aineistossa.
          Esimerkkien kustannuksia ei arvioida.
        </p>
      ) : selectedMunicipality && operators.length > 1 ? (
        <p className="mt-5 border-t border-slate-800 pt-5 text-sm leading-6 text-slate-400">
          Valitse verkkoyhtiö, jotta esimerkkien kustannukset voidaan laskea.
        </p>
      ) : selectedMunicipality ? (
        <p className="mt-5 border-t border-slate-800 pt-5 text-sm leading-6 text-slate-400">
          Tälle kunnalle ei löytynyt verkkoyhtiötä CSV-aineistosta.
        </p>
      ) : null}

      {selectedTariff?.priceAvailable ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <span>
            {selectedTariff.tariffName} · tariffin snapshot{" "}
            {formatSnapshotDate(selectedTariff.tariffSnapshotCreatedAt)}
          </span>
          {selectedTariff.tariffSourceUrl ? (
            <a
              href={selectedTariff.tariffSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Tariffin lähde
            </a>
          ) : null}
          <span>
            Sähkövero voimassa {formatSnapshotDate(data.electricityTax.effectiveFrom)}{" "}
            alkaen
          </span>
          <a
            href={data.electricityTax.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          >
            Verohallinnon verotaulukko
          </a>
        </div>
      ) : null}
    </section>
  );
}

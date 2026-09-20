import type {
  MunicipalityTransfer,
  TransferData,
  TransferTariff,
} from "@/lib/price-types";
import { Icon } from "./ui-icon";

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
  const combinedRate =
    selectedTariff?.priceAvailable &&
    selectedTariff.energyChargeCentsPerKwh !== null
      ? selectedTariff.energyChargeCentsPerKwh +
        data.electricityTax.centsPerKwhVatIncluded
      : null;
  return (
    <section
      aria-labelledby="transfer-cost-heading"
      className="border-t border-slate-700/70 pt-5"
    >
      <div>
        <h3
          id="transfer-cost-heading"
          className="text-base font-semibold text-white"
        >
          Siirto + sähkövero
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Lisää siirtomaksu ja sähkövero käyttökustannusarvioihin.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="transfer-municipality"
                className="text-sm font-semibold text-white"
              >
                Kunta
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <select
                  id="transfer-municipality"
                  value={selectedMunicipalityCode}
                  onChange={(event) => onMunicipalityChange(event.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20"
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
                <button
                  type="button"
                  onClick={onLocate}
                  disabled={locationStatus === "locating"}
                  aria-label="Paikanna minut"
                  title="Paikanna minut"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-300/10 p-2.5 text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-wait disabled:opacity-60"
                >
                  <Icon name="locate" className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Sijainti haetaan vain painikkeella. Karttatieto: {" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                >
                  OpenStreetMap
                </a>
                .
              </p>
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

      {locationMessage ? (
        <p
          role={locationStatus === "error" ? "alert" : "status"}
          className={`mt-5 border-t pt-5 text-sm leading-6 ${
            locationStatus === "error"
              ? "border-amber-300/20 text-amber-100"
              : "border-slate-800 text-slate-300"
          }`}
        >
          {locationMessage}
        </p>
      ) : null}

      {selectedTariff?.priceAvailable && combinedRate !== null ? (
        <div
          className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-950/45 p-4 sm:grid-cols-4"
          aria-label="Valitun siirtotariffin tiedot"
          role="group"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Siirtomaksu
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {formatRate(selectedTariff.energyChargeCentsPerKwh!)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Sähkövero
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {formatRate(data.electricityTax.centsPerKwhVatIncluded)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Siirto + vero
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-sky-200">
              {formatRate(combinedRate)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Perusmaksu
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
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

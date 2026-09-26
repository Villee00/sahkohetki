import type { Metadata } from "next";
import { ForecastExplorer } from "@/app/components/forecast-explorer";
import { getElectricityForecast } from "@/lib/fingrid-source";
import { getExplorerData } from "@/lib/price-source";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sähköennuste – tuotanto ja kulutus 72 h | Sähköhetki",
  description:
    "Katso Suomen sähkön tuotanto- ja kulutusennuste, laskennallinen kotimainen tasapaino sekä vertaa tuuli- ja aurinkoennusteita julkaistuun spot-hintaan.",
  alternates: { canonical: "/ennuste" },
};

export default async function ForecastPage() {
  const [result, priceData] = await Promise.all([
    getElectricityForecast(),
    getExplorerData(),
  ]);
  const prices =
    priceData.status === "ready"
      ? [...priceData.today.hourly, ...priceData.tomorrow.hourly].map(
          ({ startAt, priceCentsPerKwh }) => ({ startAt, priceCentsPerKwh }),
        )
      : [];
  return <ForecastExplorer result={result} prices={prices} />;
}

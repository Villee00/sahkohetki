import type { Metadata } from "next";
import { ForecastExplorer } from "@/app/components/forecast-explorer";
import { getElectricityForecast } from "@/lib/fingrid-source";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sähköennuste – tuotanto ja kulutus 72 h | Sähköhetki",
  description:
    "Katso Suomen sähkön tuotanto- ja kulutusennuste, laskennallinen kotimainen tasapaino sekä tuuli- ja aurinkoennuste seuraaville 72 tunnille.",
  alternates: { canonical: "/ennuste" },
};

export default async function ForecastPage() {
  const result = await getElectricityForecast();
  return <ForecastExplorer result={result} />;
}

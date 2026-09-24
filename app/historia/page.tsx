import type { Metadata } from "next";
import { HistoryExplorer } from "../components/history-explorer";
import { getHistoryPageData } from "../../lib/history-source";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sähkön hintahistoria Suomessa | Sähköhetki",
  description:
    "Tutki Suomen pörssisähkön hintahistoriaa päivä-, viikko- ja kuukausitasolla. Katso hintojen vaihtelu, negatiiviset hinnat ja vertailu aiempaan jaksoon.",
  alternates: { canonical: "/historia" },
};

export default async function HistoryPage() {
  const data = await getHistoryPageData();
  return <HistoryExplorer data={data} />;
}

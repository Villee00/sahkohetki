import { PriceExplorer } from "@/app/components/price-explorer";
import { getExplorerData } from "@/lib/price-source";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getExplorerData();
  return <PriceExplorer data={data} />;
}

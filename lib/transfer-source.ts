import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTransferCsv } from "./transfer-prices";
import type { TransferData } from "./price-types";

const SNAPSHOT_PATH = join(
  process.cwd(),
  "data",
  "sahkon-siirtohinnat-kaupungit-2026.csv",
);

let cachedTransferData: TransferData | undefined;

export function getTransferData(): TransferData {
  if (cachedTransferData) return cachedTransferData;
  cachedTransferData = parseTransferCsv(readFileSync(SNAPSHOT_PATH, "utf8"));
  return cachedTransferData;
}

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const nextProcess = spawn(
  process.execPath,
  [nextCli, "build", ...process.argv.slice(2)],
  {
    env: { ...process.env, SAHKO_MOCK_DATA: "1" },
    stdio: "inherit",
  },
);

nextProcess.on("error", (error) => {
  console.error("Could not build the Next.js project with mock data:", error);
  process.exitCode = 1;
});

nextProcess.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

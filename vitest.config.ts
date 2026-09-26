import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SAHKO_MOCK_DATA: "0",
    },
  },
});

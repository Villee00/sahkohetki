import { expect, it, vi } from "vitest";

vi.mock("../../lib/history-source", () => ({
  getHistoryPageData: vi.fn(),
}));

import sitemap from "../sitemap";
import { metadata } from "./page";

it("publishes route-specific Finnish metadata and the canonical history URL", () => {
  expect(metadata).toMatchObject({
    title: expect.stringMatching(/hintahistoria/i),
    description: expect.stringMatching(/historia/i),
    alternates: { canonical: "/historia" },
  });
});

it("includes the history page in the public sitemap", () => {
  expect(sitemap()).toContainEqual({ url: "https://sahkohetki.fi/historia" });
});

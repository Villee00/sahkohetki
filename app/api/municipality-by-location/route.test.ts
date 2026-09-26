import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("maps a reverse-geocoded municipality to the local CSV code", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        address: { municipality: "Kemi" },
        display_name: "Kemi, Finland",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const response = await POST(
    new Request("http://localhost/api/municipality-by-location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ latitude: 65.736, longitude: 24.563 }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    municipalityCode: "240",
    municipalityName: "Kemi",
  });
  const [geocoderUrl, geocoderOptions] = fetchMock.mock.calls[0] ?? [];
  expect(String(geocoderUrl)).toContain(
    "https://nominatim.openstreetmap.org/reverse",
  );
  expect(geocoderOptions).toEqual(
    expect.objectContaining({
      headers: expect.objectContaining({
        "user-agent": expect.stringContaining("Sahkohetki"),
      }),
    }),
  );
});

it("rejects invalid coordinates without calling the geocoder", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  const response = await POST(
    new Request("http://localhost/api/municipality-by-location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ latitude: 95, longitude: 24.563 }),
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    message: "Sijaintikoordinaatit eivät ole kelvolliset.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("serves mock municipality location when mock data is enabled without calling fetch", async () => {
  vi.stubEnv("SAHKO_MOCK_DATA", "1");
  const fetchMock = vi.spyOn(globalThis, "fetch");

  const response = await POST(
    new Request("http://localhost/api/municipality-by-location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ latitude: 60.1699, longitude: 24.9384 }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    municipalityCode: "091",
    municipalityName: "Helsinki",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns 404 in mock mode when coordinates are outside Finland", async () => {
  vi.stubEnv("SAHKO_MOCK_DATA", "1");
  const fetchMock = vi.spyOn(globalThis, "fetch");

  const response = await POST(
    new Request("http://localhost/api/municipality-by-location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ latitude: 12.34, longitude: 56.78 }),
    }),
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({
    message:
      "Sijaintikuntaa ei löytynyt tämänhetkisestä kaupunkien CSV-aineistosta. Valitse kunta käsin.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

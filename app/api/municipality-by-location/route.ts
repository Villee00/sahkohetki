import {
  findMunicipalityByAddress,
  type ReverseGeocodeAddress,
} from "../../../lib/municipality-location";
import { getTransferData } from "../../../lib/transfer-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_USER_AGENT =
  "Sahkohetki/0.1 (+https://github.com/Villee00/sahkohetki)";

type Coordinates = {
  latitude: number;
  longitude: number;
};

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseCoordinates(value: unknown): Coordinates | null {
  if (typeof value !== "object" || value === null) return null;

  const latitude = (value as { latitude?: unknown }).latitude;
  const longitude = (value as { longitude?: unknown }).longitude;
  if (
    !isFiniteCoordinate(latitude) ||
    !isFiniteCoordinate(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function readAddress(value: unknown): ReverseGeocodeAddress | null {
  if (typeof value !== "object" || value === null) return null;
  const address = (value as { address?: unknown }).address;
  if (typeof address !== "object" || address === null) return null;

  const fields = address as Record<string, unknown>;
  return {
    municipality: stringField(fields, "municipality"),
    city: stringField(fields, "city"),
    town: stringField(fields, "town"),
    village: stringField(fields, "village"),
    hamlet: stringField(fields, "hamlet"),
  };
}

function messageResponse(message: string, status: number): Response {
  return Response.json({ message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return messageResponse("Sijaintikoordinaatit eivät ole kelvolliset.", 400);
  }

  const coordinates = parseCoordinates(body);
  if (!coordinates) {
    return messageResponse("Sijaintikoordinaatit eivät ole kelvolliset.", 400);
  }

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("accept-language", "fi");

  try {
    const geocoderResponse = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": NOMINATIM_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!geocoderResponse.ok) {
      return messageResponse("Paikannuspalvelu ei vastannut.", 502);
    }

    const address = readAddress(await geocoderResponse.json());
    const municipality = address
      ? findMunicipalityByAddress(address, getTransferData().municipalities)
      : null;
    if (!municipality) {
      return messageResponse(
        "Sijaintikuntaa ei löytynyt tämänhetkisestä kaupunkien CSV-aineistosta. Valitse kunta käsin.",
        404,
      );
    }

    return Response.json({
      municipalityCode: municipality.municipalityCode,
      municipalityName: municipality.city,
    });
  } catch {
    return messageResponse(
      "Sijaintia ei voitu selvittää juuri nyt. Yritä uudelleen.",
      502,
    );
  }
}

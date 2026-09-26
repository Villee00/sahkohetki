import { buildElectricityForecastApiResponse } from "../../../../lib/forecast-api";
import { getElectricityForecast } from "../../../../lib/fingrid-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FRESH_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=120";

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function GET(): Promise<Response> {
  try {
    const result = await getElectricityForecast(new Date());
    if (result.status === "unavailable") {
      return errorResponse(
        503,
        "source_unavailable",
        "Electricity forecast data is currently unavailable.",
      );
    }

    return Response.json(buildElectricityForecastApiResponse(result), {
      headers: {
        "cache-control":
          result.freshness.state === "stale"
            ? "no-store"
            : FRESH_CACHE_CONTROL,
      },
    });
  } catch {
    return errorResponse(
      500,
      "internal_error",
      "The electricity forecast service failed unexpectedly.",
    );
  }
}

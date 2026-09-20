import {
  PRICE_API_HORIZONS,
  type PriceApiHorizon,
} from "../../../../lib/price-api";
import { getPriceApiData } from "../../../../lib/price-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUCCESS_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=300";

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

function isPriceApiHorizon(value: string): value is PriceApiHorizon {
  return PRICE_API_HORIZONS.includes(value as PriceApiHorizon);
}

export async function GET(request: Request): Promise<Response> {
  const horizon = new URL(request.url).searchParams.get("horizon") ?? "today";
  if (!isPriceApiHorizon(horizon)) {
    return errorResponse(
      400,
      "invalid_horizon",
      "The horizon must be today or tomorrow.",
    );
  }

  try {
    const result = await getPriceApiData(horizon, new Date());
    if (result.status === "unavailable") {
      return errorResponse(
        503,
        "source_unavailable",
        "Price data is currently unavailable.",
      );
    }

    return Response.json(result.data, {
      headers: { "cache-control": SUCCESS_CACHE_CONTROL },
    });
  } catch {
    return errorResponse(
      500,
      "internal_error",
      "The price service failed unexpectedly.",
    );
  }
}

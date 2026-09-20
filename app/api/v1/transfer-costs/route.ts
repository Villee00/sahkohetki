import { getTransferCostApiData } from "../../../../lib/transfer-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUCCESS_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

function errorResponse(): Response {
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Transfer cost data is currently unavailable.",
      },
    },
    {
      status: 500,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function GET(): Response {
  try {
    return Response.json(getTransferCostApiData(), {
      headers: { "cache-control": SUCCESS_CACHE_CONTROL },
    });
  } catch {
    return errorResponse();
  }
}

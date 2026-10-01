import { retrieveKnowledge } from "@/lib/knowledge-base";
import {
  checkRateLimit,
  isSameOriginRequest,
  NO_STORE_HEADERS,
} from "@/lib/request-guards";

export const runtime = "nodejs";

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "This request is not allowed." }, 403);
  }

  const rateLimit = checkRateLimit(request, "knowledge-search", 60, 60_000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Please slow down and try again shortly." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "A JSON query is required." }, 400);
  }

  const query =
    typeof body === "object" && body !== null && "query" in body
      ? body.query
      : undefined;

  if (typeof query !== "string" || query.trim().length === 0) {
    return jsonResponse({ error: "A non-empty search query is required." }, 400);
  }

  if (query.length > 300) {
    return jsonResponse({ error: "Search queries must be 300 characters or less." }, 413);
  }

  // Retrieval stays in-process: no extra embedding request or vector database
  // needs to sit between a caller's question and the Live API response.
  const matches = retrieveKnowledge(query.trim(), 3);

  return jsonResponse({
    matches,
    noApprovedMatch: matches.length === 0,
    instruction: matches.length
      ? "Answer only from these approved snippets. Be transparent if they do not answer the full question."
      : "No approved snippet matches this query. Do not guess; say you do not have verified information.",
  });
}

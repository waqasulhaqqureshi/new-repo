import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_LIVE_MODEL,
  LIVE_AGENT_CONFIG,
} from "@/lib/live-config";
import {
  checkRateLimit,
  isSameOriginRequest,
  NO_STORE_HEADERS,
} from "@/lib/request-guards";

export const runtime = "nodejs";

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "This request is not allowed." }, 403);
  }

  const minuteLimit = checkRateLimit(request, "live-token-minute", 8, 60_000);
  const hourlyLimit = checkRateLimit(
    request,
    "live-token-hour",
    32,
    60 * 60_000,
  );
  const rateLimit = !minuteLimit.allowed ? minuteLimit : hourlyLimit;

  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Too many demo sessions. Please try again shortly." },
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      { error: "The Raqmiva voice demo is not configured yet." },
      503,
    );
  }

  const model = process.env.GEMINI_LIVE_MODEL?.trim() || DEFAULT_LIVE_MODEL;
  const now = Date.now();
  const newSessionExpireTime = new Date(now + 5 * 60_000);
  const expireTime = new Date(now + 20 * 60_000);

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1beta" },
    });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: expireTime.toISOString(),
        newSessionExpireTime: newSessionExpireTime.toISOString(),
        liveConnectConstraints: {
          model,
          config: LIVE_AGENT_CONFIG,
        },
      },
    });

    if (!token.name) {
      return jsonResponse(
        { error: "Raqmiva could not prepare a voice session. Please retry." },
        502,
      );
    }

    return jsonResponse({
      accessToken: token.name,
      model,
      newSessionExpiresAt: newSessionExpireTime.getTime(),
    });
  } catch {
    // Do not log provider error bodies or credential-bearing request details.
    return jsonResponse(
      { error: "Raqmiva voice is temporarily unavailable. Please try again." },
      502,
    );
  }
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function pruneBuckets(now: number) {
  if (buckets.size < 1_000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size > 5_000) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

function getRequestAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedAddress = forwardedFor?.split(",")[0]?.trim();
  return (
    firstForwardedAddress ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Lightweight per-process throttling for this single-instance public demo. */
export function checkRateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const key = `${namespace}:${getRequestAddress(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneBuckets(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Allow same-origin browser requests, including trusted HTTPS tunnel domains. */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    const host = request.headers.get("host")?.toLowerCase();
    const urlHost = new URL(request.url).host.toLowerCase();

    return [forwardedHost, host, urlHost].some(
      (candidate) => candidate === originHost,
    );
  } catch {
    return false;
  }
}

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export interface WsCorsOptions {
  origin: string[] | false;
  credentials: boolean;
}

/**
 * Split ALLOWED_ORIGINS on commas, trim whitespace, and drop empty entries —
 * matching the HTTP CORS parsing in src/main.ts.
 */
export function parseAllowedOrigins(
  raw: string | undefined = process.env.ALLOWED_ORIGINS,
): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Shared WebSocket CORS configuration used by all Socket.IO gateways so WS
 * origin checks stay consistent with HTTP CORS.
 */
export function buildWsCorsOptions(
  raw: string | undefined = process.env.ALLOWED_ORIGINS,
): WsCorsOptions {
  const origins = parseAllowedOrigins(raw);
  return {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  };
}

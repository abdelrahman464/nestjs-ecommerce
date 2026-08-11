import { Request } from 'express';

export type ClientRequestMeta = {
  ip: string;
  userAgent: string;
  device: string;
  country: string;
};

/** Best-effort client fingerprint from the HTTP request (no GeoIP DB). */
export function extractClientMeta(req: Request): ClientRequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;

  const ip =
    forwardedIp ||
    req.ip ||
    req.socket?.remoteAddress || 
    'unknown';

  const userAgentHeader = req.headers['user-agent'];
  const userAgent =
    (Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader) || '';

  const countryHeader =
    req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'];
  const countryRaw = Array.isArray(countryHeader)
    ? countryHeader[0]
    : countryHeader;
    // "XX" is the default country code for unknown countries 
  const country =
    countryRaw && countryRaw !== 'XX' ? String(countryRaw) : '';

  return {
    ip,
    userAgent: userAgent.slice(0, 512),
    device: classifyDevice(userAgent),
    country,
  };
}

function classifyDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/.test(ua)) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

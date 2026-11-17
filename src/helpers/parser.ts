import crypto from 'node:crypto';
import type { Context } from 'hono';

export interface ParsedClientInfo {
  ipHash: string;
  country: string;
  city: string;
  browser: string;
  os: string;
  deviceType: string;
  referrer: string;
}

/**
 * Creates a GDPR-compliant, irreversible pseudonymized hash of the IP address using HMAC-SHA256.
 */
export function hashIp(ip: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(ip.trim()).digest('hex');
}

/**
 * Parses a User-Agent header into structured browser, OS, and device categories.
 */
export function parseUserAgent(ua: string | undefined): { browser: string; os: string; deviceType: string } {
  if (!ua || ua.trim() === '') {
    return { browser: 'Unknown', os: 'Unknown', deviceType: 'desktop' };
  }

  const uaLower = ua.toLowerCase();

  // Check for common bots / crawlers
  if (
    uaLower.includes('bot') ||
    uaLower.includes('crawl') ||
    uaLower.includes('spider') ||
    uaLower.includes('slurp') ||
    uaLower.includes('curl') ||
    uaLower.includes('wget')
  ) {
    return { browser: 'Bot', os: 'Bot', deviceType: 'bot' };
  }

  // Device detection
  let deviceType = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = 'mobile';
  }

  // OS detection
  let os = 'Unknown';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('CrOS')) os = 'ChromeOS';

  // Browser detection (order matters for matching)
  let browser = 'Unknown';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('OPR/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  return { browser, os, deviceType };
}

/**
 * Extracts client telemetry information from Hono Request context.
 */
export function extractClientInfo(c: Context, salt: string): ParsedClientInfo {
  // Extract client IP address across reverse proxies
  const forwardedFor = c.req.header('x-forwarded-for');
  const cfConnectingIp = c.req.header('cf-connecting-ip');
  const realIp = c.req.header('x-real-ip');

  let rawIp = '127.0.0.1';
  if (cfConnectingIp) {
    rawIp = cfConnectingIp;
  } else if (forwardedFor) {
    rawIp = forwardedFor.split(',')[0].trim();
  } else if (realIp) {
    rawIp = realIp;
  }

  const ipHash = hashIp(rawIp, salt);

  // Geo headers (Cloudflare, AWS CloudFront, etc.)
  const country = c.req.header('cf-ipcountry') || c.req.header('x-country-code') || 'Unknown';
  const city = c.req.header('cf-ipcity') || 'Unknown';

  // User-Agent info
  const userAgent = c.req.header('user-agent');
  const { browser, os, deviceType } = parseUserAgent(userAgent);

  // Referrer header
  const referrerRaw = c.req.header('referer') || c.req.header('referrer');
  let referrer = 'direct';
  if (referrerRaw) {
    try {
      const parsedUrl = new URL(referrerRaw);
      referrer = parsedUrl.hostname;
    } catch {
      referrer = referrerRaw.slice(0, 100);
    }
  }

  return {
    ipHash,
    country,
    city,
    browser,
    os,
    deviceType,
    referrer,
  };
}

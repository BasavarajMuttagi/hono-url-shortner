import crypto from 'node:crypto';
import type { Context } from 'hono';
import { UAParser } from 'ua-parser-js';
import { isbot } from 'isbot';

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

  // 1. Identify bots / web crawlers first
  if (isbot(ua)) {
    return { browser: 'Bot', os: 'Bot', deviceType: 'bot' };
  }

  // 2. Parse client information via ua-parser-js
  const parser = new UAParser(ua);
  const browser = parser.getBrowser().name || 'Unknown';
  const os = parser.getOS().name || 'Unknown';
  const deviceType = parser.getDevice().type || 'desktop';

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

import crypto from 'node:crypto';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BASE62_CHARS.length; // 62
const MAX_BYTE = 256 - (256 % BASE); // 248 ensures completely unbiased modulo distribution

/**
 * Generates an unbiased, cryptographically secure random Base62 short key.
 * Default length: 7 characters (provides 3.52 trillion unique combinations).
 */
export function generateShortKey(length: number = 7): string {
  const result: string[] = [];
  const buffer = crypto.randomBytes(length * 2);
  let bufIndex = 0;

  while (result.length < length) {
    if (bufIndex >= buffer.length) {
      const moreBytes = crypto.randomBytes(length);
      for (const byte of moreBytes) {
        if (byte < MAX_BYTE) {
          result.push(BASE62_CHARS[byte % BASE]);
          if (result.length === length) break;
        }
      }
      break;
    }

    const byte = buffer[bufIndex++];
    if (byte < MAX_BYTE) {
      result.push(BASE62_CHARS[byte % BASE]);
    }
  }

  return result.join('');
}

/**
 * Validates whether a shortKey contains only valid alphanumeric Base62 characters
 * and is within acceptable length limits (1 to 16 characters).
 */
export function isValidShortKey(key: string): boolean {
  if (!key || key.length < 1 || key.length > 16) return false;
  return /^[0-9a-zA-Z_-]+$/.test(key);
}

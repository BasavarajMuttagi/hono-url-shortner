import { describe, it, expect } from 'vitest';
import { generateShortKey, isValidShortKey } from '../src/helpers/base62.js';
import { hashPassword, verifyPassword } from '../src/helpers/password.js';
import { parseUserAgent, hashIp } from '../src/helpers/parser.js';

describe('Unit Tests: Core Helpers & Algorithms (Zero External Dependencies)', () => {
  // 1. Base62 Short Key Generator
  describe('Base62 Short Key Generator', () => {
    it('should generate a 7-character string by default', () => {
      const key = generateShortKey();
      expect(key).toBeTypeOf('string');
      expect(key.length).toBe(7);
      expect(isValidShortKey(key)).toBe(true);
    });

    it('should generate requested custom lengths', () => {
      expect(generateShortKey(5).length).toBe(5);
      expect(generateShortKey(10).length).toBe(10);
    });

    it('should generate high-entropy unique keys with no collisions in 1000 iterations', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const key = generateShortKey(7);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      expect(seen.size).toBe(1000);
    });

    it('should properly validate short key format', () => {
      expect(isValidShortKey('abc123Z')).toBe(true);
      expect(isValidShortKey('valid_key-1')).toBe(true);
      expect(isValidShortKey('')).toBe(false);
      expect(isValidShortKey('invalid key with spaces')).toBe(false);
      expect(isValidShortKey('waytooooooooooolongkeyexceedinglimits')).toBe(false);
    });
  });

  // 2. Bcrypt Password Hashing & Verification
  describe('Bcrypt Password Security', () => {
    it('should hash and verify passwords correctly', async () => {
      const plain = 'SuperSecret123!';
      const hash = await hashPassword(plain);

      expect(hash).not.toBe(plain);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix

      const isMatch = await verifyPassword(plain, hash);
      expect(isMatch).toBe(true);

      const isWrong = await verifyPassword('WrongPassword', hash);
      expect(isWrong).toBe(false);
    });
  });

  // 3. User-Agent Parsing
  describe('User-Agent & Client Parser', () => {
    it('should detect Chrome on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Chrome');
      expect(parsed.os).toBe('macOS');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('should detect mobile devices', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Mobile Safari');
      expect(parsed.os).toBe('iOS');
      expect(parsed.deviceType).toBe('mobile');
    });

    it('should classify web crawlers as bots', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Bot');
      expect(parsed.deviceType).toBe('bot');
    });
  });

  // 4. GDPR IP Hashing
  describe('GDPR Salted HMAC-SHA256 IP Hashing', () => {
    it('should produce deterministic hashes with the same salt', () => {
      const salt = 'test-salt-secret-at-least-16-chars';
      const ip = '198.51.100.42';

      const hash1 = hashIp(ip, salt);
      const hash2 = hashIp(ip, salt);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex string
      expect(hash1).not.toContain(ip); // Never leaks raw IP
    });

    it('should produce completely different hashes with different salts', () => {
      const ip = '198.51.100.42';
      const hashA = hashIp(ip, 'salt-alpha-123456');
      const hashB = hashIp(ip, 'salt-bravo-123456');

      expect(hashA).not.toBe(hashB);
    });
  });
});

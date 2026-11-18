import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/app.js';
import { db, closeDb, users } from '../src/db/index.js';
import { closeRedis } from '../src/cache/redis.js';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('JWT & Cookie Authentication Integration Tests', () => {
  const testEmail = `user_${crypto.randomBytes(4).toString('hex')}@shortener.local`;
  const testPassword = 'Password123!';
  let jwtToken = '';
  let authCookie = '';

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testEmail));
    await closeDb();
    await closeRedis();
  });

  it('should register a new user and set HttpOnly auth_token cookie', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(testEmail);
    expect(body.token).toBeDefined();

    jwtToken = body.token;

    // Check Set-Cookie header
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('HttpOnly');

    // Extract cookie value for subsequent tests
    const match = setCookie?.match(/auth_token=([^;]+)/);
    if (match) {
      authCookie = `auth_token=${match[1]}`;
    }
  });

  it('should return a non-revealing generic error if registering an existing email (prevent enumeration)', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'DifferentPassword123!' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unable to complete registration');
    // Ensure it does NOT leak user enumeration keywords like "already exists"
    expect(body.error).not.toContain('already exists');
  });

  it('should log in existing user and return signed JWT + cookie', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(testEmail);
    expect(body.token).toBeDefined();
    expect(res.headers.get('set-cookie')).toContain('auth_token=');
  });

  it('should reject login with wrong password (401)', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword' }),
    });

    expect(res.status).toBe(401);
  });

  it('should access /api/v1/auth/me using Cookie authentication', async () => {
    const res = await app.request('/api/v1/auth/me', {
      method: 'GET',
      headers: {
        Cookie: authCookie,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(testEmail);
  });

  it('should create a short URL using Cookie authentication (no Bearer header needed)', async () => {
    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        original_url: 'https://jwt.io',
        title: 'JWT io',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.original_url).toBe('https://jwt.io');

    // Clean up created link
    await app.request(`/api/v1/urls/${body.id}`, {
      method: 'DELETE',
      headers: { Cookie: authCookie },
    });
  });

  it('should log out and clear the auth_token cookie', async () => {
    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: authCookie },
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    // Cookie deletion is signaled by Max-Age=0 or empty value / past expiration
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/auth_token=;|(Max-Age=0)/i);
  });
});

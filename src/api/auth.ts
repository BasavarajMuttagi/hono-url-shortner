import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import crypto from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { db, users } from '../db/index.js';
import { hashPassword, verifyPassword } from '../helpers/password.js';
import { env } from '../config/env.js';
import { authGuard } from '../middleware/auth.js';
import type { AppEnv } from '../types/env.js';

export const authApp = new Hono<AppEnv>();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const COOKIE_NAME = 'auth_token';
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

// 1. User Registration
authApp.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  // Check if user already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'User with this email already exists' }, 409);
  }

  const userId = uuidv7();
  const apiKey = `key_${crypto.randomBytes(24).toString('hex')}`;
  const passwordHash = await hashPassword(password);
  const now = new Date();

  const [newUser] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      apiKey,
      passwordHash,
      createdAt: now,
    })
    .returning();

  // Generate JWT token (expires in 7 days)
  const token = await sign(
    {
      sub: newUser.id,
      email: newUser.email,
      exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS,
    },
    env.JWT_SECRET,
    'HS256'
  );

  // Set HTTP-Only Cookie
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SEVEN_DAYS_SECONDS,
  });

  return c.json(
    {
      user: {
        id: newUser.id,
        email: newUser.email,
        api_key: newUser.apiKey,
      },
      token,
    },
    201
  );
});

// 2. User Login
authApp.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (rows.length === 0 || !rows[0].passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const user = rows[0];
  if (!user.passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Generate JWT token
  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS,
    },
    env.JWT_SECRET,
    'HS256'
  );

  // Set HTTP-Only Cookie
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SEVEN_DAYS_SECONDS,
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      api_key: user.apiKey,
    },
    token,
  });
});

// 3. User Logout
authApp.post('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
  });
  return c.json({ status: 'logged_out' });
});

// 4. Current User Session Check
authApp.get('/me', authGuard, async (c) => {
  const userId = c.get('userId');

  const rows = await db
    .select({ id: users.id, email: users.email, apiKey: users.apiKey, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user: rows[0] });
});

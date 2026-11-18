import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verify, sign } from 'hono/jwt';
import { eq, desc } from 'drizzle-orm';
import { raw } from 'hono/html';
import type { FC } from 'hono/jsx';
import crypto from 'node:crypto';
import { renderer } from './layout.js';
import { AuthPage } from './auth.js';
import { Navbar } from './components/Navbar.js';
import { CreateLinkForm } from './components/CreateLinkForm.js';
import { LinkTable } from './components/LinkTable.js';
import { AnalyticsDrawer } from './components/AnalyticsDrawer.js';
import { db, users, urls } from '../db/index.js';
import { env } from '../config/env.js';
import { v7 as uuidv7 } from 'uuid';
import { generateShortKey } from '../helpers/base62.js';
import { hashPassword, verifyPassword } from '../helpers/password.js';
import { purgeCacheKey } from '../cache/redis.js';
import type { AppEnv } from '../types/env.js';

export const dashboardApp = new Hono<AppEnv>();

// Register Hono JSX renderer middleware (official Hono JSX guide pattern)
dashboardApp.use('*', renderer);

const COOKIE_NAME = 'auth_token';

// Helper to resolve currently authenticated user from cookie
async function resolveUserFromCookie(c: any) {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;

  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub) {
      const rows = await db
        .select({ id: users.id, email: users.email, apiKey: users.apiKey })
        .from(users)
        .where(eq(users.id, String(payload.sub)))
        .limit(1);
      return rows[0] || null;
    }
  } catch (_err: unknown) {
    // If not valid JWT, check if it's an API key
  }

  try {
    const rows = await db
      .select({ id: users.id, email: users.email, apiKey: users.apiKey })
      .from(users)
      .where(eq(users.apiKey, token))
      .limit(1);
    return rows[0] || null;
  } catch (err: unknown) {
    console.error('❌ [resolveUserFromCookie] Database query error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ==========================================
// 1. Navigation & Authentication View Routes
// ==========================================

// Root route: Navigate based on authentication state
dashboardApp.get('/', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (user) return c.redirect('/dashboard');
  return c.redirect('/login');
});

// GET /login — Render Login Page
dashboardApp.get('/login', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (user) return c.redirect('/dashboard');
  return c.render(<AuthPage mode="login" />, { title: 'Sign In — Hono URL Engine' });
});

// POST /login — Handle native form login submission
dashboardApp.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!email || !password) {
    return c.render(
      <AuthPage mode="login" error="Please fill out all fields." email={email} />,
      { title: 'Sign In — Hono URL Engine' }
    );
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (rows.length === 0 || !rows[0].passwordHash) {
    return c.render(
      <AuthPage mode="login" error="Invalid email or password." email={email} />,
      { title: 'Sign In — Hono URL Engine' }
    );
  }

  const isMatch = await verifyPassword(password, rows[0].passwordHash);
  if (!isMatch) {
    return c.render(
      <AuthPage mode="login" error="Invalid email or password." email={email} />,
      { title: 'Sign In — Hono URL Engine' }
    );
  }

  // Sign JWT and set HttpOnly cookie
  const token = await sign(
    { sub: rows[0].id, email: rows[0].email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    env.JWT_SECRET,
    'HS256'
  );

  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });

  return c.redirect('/dashboard');
});

// GET /register — Render Register Page
dashboardApp.get('/register', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (user) return c.redirect('/dashboard');
  return c.render(<AuthPage mode="register" />, { title: 'Create Account — Hono URL Engine' });
});

// POST /register — Handle native form registration
dashboardApp.post('/register', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!email || !password || password.length < 6) {
    return c.render(
      <AuthPage mode="register" error="Password must be at least 6 characters long." email={email} />,
      { title: 'Create Account — Hono URL Engine' }
    );
  }

  // Check existing without enumeration
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.render(
      <AuthPage
        mode="register"
        error="Unable to complete registration. If you already have an account, please sign in."
        email={email}
      />,
      { title: 'Create Account — Hono URL Engine' }
    );
  }

  const userId = uuidv7();
  const apiKey = `key_${crypto.randomBytes(24).toString('hex')}`;
  const passwordHash = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      apiKey,
      passwordHash,
      createdAt: new Date(),
    })
    .returning();

  const token = await sign(
    { sub: newUser.id, email: newUser.email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    env.JWT_SECRET,
    'HS256'
  );

  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });

  return c.redirect('/dashboard');
});

// Sign Out (supports both GET and POST for native navigation)
dashboardApp.get('/logout', async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.redirect('/login');
});

dashboardApp.post('/logout', async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.redirect('/login');
});

// ==========================================
// 2. Authenticated Dashboard Page Component
// ==========================================

export interface DashboardPageProps {
  user: {
    id: string;
    email: string;
    apiKey: string;
  };
  urls: any[];
  baseUrl: string;
}

export const DashboardPage: FC<DashboardPageProps> = ({ user, urls, baseUrl }) => {
  return (
    <div class="min-h-screen flex flex-col">
      {/* Toast Notification Container */}
      <div
        id="toast"
        class="fixed bottom-5 right-5 z-50 transform translate-y-12 opacity-0 pointer-events-none transition-all duration-300 bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs px-4 py-2.5 rounded-lg shadow-xl font-mono flex items-center gap-2"
      >
        <span id="toastDot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span id="toastMsg">Action completed</span>
      </div>

      {/* Top Navbar */}
      <Navbar user={user} />

      {/* Main Content Area */}
      <main class="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {/* Create Link Form */}
        <CreateLinkForm />

        {/* Links Table */}
        <LinkTable urls={urls} baseUrl={baseUrl} />
      </main>

      {/* Footer */}
      <footer class="border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
        Headless API Engine · Tailwind CSS · Pure Hono JSX SSR
      </footer>

      {/* Telemetry Slide-over Drawer */}
      <AnalyticsDrawer />

      {/* Client-Side Progressive Enhancement Script (Copy & Analytics Drawer) */}
      <script>
        {raw(`
          const toast = document.getElementById('toast');
          const toastMsg = document.getElementById('toastMsg');
          const toastDot = document.getElementById('toastDot');
          let toastTimer;

          function showToast(message, isError = false) {
            if (!toast) return;
            toastMsg.textContent = message;
            toastDot.className = isError ? 'w-2 h-2 rounded-full bg-red-400' : 'w-2 h-2 rounded-full bg-emerald-400';
            toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-12');
            toast.classList.add('opacity-100', 'translate-y-0');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
              toast.classList.remove('opacity-100', 'translate-y-0');
              toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-12');
            }, 2500);
          }

          function copyToClipboard(text, msg = 'Copied to clipboard') {
            navigator.clipboard.writeText(text).then(() => {
              showToast(msg);
            }).catch(() => {
              showToast('Failed to copy', true);
            });
          }

          // Slide-over Drawer Handlers
          const drawer = document.getElementById('telemetryDrawer');
          const backdrop = document.getElementById('drawerBackdrop');
          const drawerTitle = document.getElementById('drawerTitle');
          const drawerContent = document.getElementById('drawerContent');

          function openTelemetryDrawer(urlId, shortKey) {
            if (!drawer || !backdrop) return;
            drawerTitle.textContent = '/' + shortKey;
            drawerContent.innerHTML = '<div class="text-center py-16 text-zinc-500 font-mono text-xs">Querying ClickHouse cluster...</div>';
            
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
            backdrop.classList.add('opacity-100', 'pointer-events-auto');
            drawer.classList.remove('translate-x-full');
            drawer.classList.add('translate-x-0');

            fetch('/api/v1/urls/' + urlId + '/analytics')
              .then(res => res.json())
              .then(data => {
                let countriesHtml = '';
                if (data.topCountries && data.topCountries.length > 0) {
                  countriesHtml = data.topCountries.map(c => 
                    '<div class="flex items-center justify-between text-xs py-1 border-b border-zinc-800/40">' +
                      '<span class="text-zinc-300 font-mono">' + c.name + '</span>' +
                      '<span class="text-zinc-500 font-mono font-medium">' + c.count + '</span>' +
                    '</div>'
                  ).join('');
                } else {
                  countriesHtml = '<div class="text-zinc-600 text-xs font-mono py-2">No geographic hits yet</div>';
                }

                let referrersHtml = '';
                if (data.topReferrers && data.topReferrers.length > 0) {
                  referrersHtml = data.topReferrers.map(r => 
                    '<div class="flex items-center justify-between text-xs py-1 border-b border-zinc-800/40">' +
                      '<span class="text-zinc-300 truncate max-w-[200px] font-mono">' + (r.name || 'Direct') + '</span>' +
                      '<span class="text-zinc-500 font-mono font-medium">' + r.count + '</span>' +
                    '</div>'
                  ).join('');
                } else {
                  referrersHtml = '<div class="text-zinc-600 text-xs font-mono py-2">No referrer data yet</div>';
                }

                drawerContent.innerHTML = 
                  '<div class="space-y-6">' +
                    '<div class="grid grid-cols-2 gap-3">' +
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">' +
                        '<div class="text-2xl font-bold font-mono text-zinc-100">' + (data.totalClicks || 0) + '</div>' +
                        '<div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Total Clicks</div>' +
                      '</div>' +
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">' +
                        '<div class="text-2xl font-bold font-mono text-zinc-100">' + (data.uniqueVisitors || 0) + '</div>' +
                        '<div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Unique Visitors</div>' +
                      '</div>' +
                    '</div>' +
                    '<div>' +
                      '<h4 class="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider text-[10px]">Top Countries</h4>' +
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3">' + countriesHtml + '</div>' +
                    '</div>' +
                    '<div>' +
                      '<h4 class="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider text-[10px]">Referrers</h4>' +
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3">' + referrersHtml + '</div>' +
                    '</div>' +
                  '</div>';
              })
              .catch(() => {
                drawerContent.innerHTML = '<div class="text-center py-16 text-red-400 font-mono text-xs">Failed to load analytics from ClickHouse.</div>';
              });
          }

          function closeTelemetryDrawer() {
            if (!drawer || !backdrop) return;
            drawer.classList.remove('translate-x-0');
            drawer.classList.add('translate-x-full');
            backdrop.classList.remove('opacity-100', 'pointer-events-auto');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
          }
        `)}
      </script>
    </div>
  );
};

// ==========================================
// 3. Dashboard View Route
// ==========================================

dashboardApp.get('/dashboard', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (!user) return c.redirect('/login');

  const userUrls = await db
    .select()
    .from(urls)
    .where(eq(urls.userId, user.id))
    .orderBy(desc(urls.createdAt));

  const baseUrl = env.BASE_URL.replace(/\/+$/, '');

  return c.render(
    <DashboardPage user={user} urls={userUrls} baseUrl={baseUrl} />,
    { title: 'Dashboard — Hono Shortener' }
  );
});

// ==========================================
// 4. Form Actions (Native Form Submissions)
// ==========================================

// Create Link Action
dashboardApp.post('/dashboard/links', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (!user) return c.redirect('/login');

  const body = await c.req.parseBody();
  const originalUrl = String(body.original_url || '').trim();
  const title = String(body.title || '').trim();

  if (!originalUrl || (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://'))) {
    return c.redirect('/dashboard');
  }

  // Scalable, collision-resistant 7-character Base62 key generation
  let shortKey = '';
  let attempts = 0;
  while (!shortKey && attempts < 5) {
    attempts++;
    const candidate = generateShortKey(7);
    const existing = await db
      .select({ id: urls.id })
      .from(urls)
      .where(eq(urls.shortKey, candidate))
      .limit(1);

    if (existing.length === 0) {
      shortKey = candidate;
      break;
    }
  }

  if (shortKey) {
    const newId = uuidv7();
    await db.insert(urls).values({
      id: newId,
      userId: user.id,
      shortKey,
      originalUrl,
      title: title || '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return c.redirect('/dashboard');
});

// Delete Link Action
dashboardApp.post('/dashboard/links/:id/delete', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (!user) return c.redirect('/login');

  const id = c.req.param('id');
  const [existing] = await db
    .select({ shortKey: urls.shortKey })
    .from(urls)
    .where(eq(urls.id, id))
    .limit(1);

  if (existing) {
    await db.delete(urls).where(eq(urls.id, id));
    await purgeCacheKey(existing.shortKey);
  }

  return c.redirect('/dashboard');
});

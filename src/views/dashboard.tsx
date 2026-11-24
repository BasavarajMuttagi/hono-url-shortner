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
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { db, users, urls } from '../db/index.js';
import { env } from '../config/env.js';
import { v7 as uuidv7 } from 'uuid';
import { generateShortKey } from '../helpers/base62.js';
import { hashPassword, verifyPassword } from '../helpers/password.js';
import { purgeCacheKey } from '../cache/redis.js';
import type { AppEnv } from '../types/env.js';

export const dashboardRouter = new Hono<AppEnv>();

// Register Hono JSX renderer middleware (official Hono JSX guide pattern)
dashboardRouter.use('*', renderer);

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
dashboardRouter.get('/', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (user) return c.redirect('/dashboard');
  return c.redirect('/login');
});

// GET /login — Render Login Page
dashboardRouter.get('/login', async (c) => {
  const user = await resolveUserFromCookie(c);
  const returnTo = c.req.query('return_to');
  if (user) {
    const target = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard';
    return c.redirect(target);
  }
  return c.render(<AuthPage mode="login" returnTo={returnTo} />, { title: 'Sign In — Hono URL Engine' });
});

// POST /login — Handle native form login submission
dashboardRouter.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const returnTo = String(body.return_to || c.req.query('return_to') || '');

  if (!email || !password) {
    return c.render(
      <AuthPage mode="login" error="Please fill out all fields." email={email} returnTo={returnTo} />,
      { title: 'Sign In — Hono URL Engine' }
    );
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (rows.length === 0 || !rows[0].passwordHash) {
    return c.render(
      <AuthPage mode="login" error="Invalid email or password." email={email} returnTo={returnTo} />,
      { title: 'Sign In — Hono URL Engine' }
    );
  }

  const isMatch = await verifyPassword(password, rows[0].passwordHash);
  if (!isMatch) {
    return c.render(
      <AuthPage mode="login" error="Invalid email or password." email={email} returnTo={returnTo} />,
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

  const target = returnTo && (returnTo.startsWith('/') || returnTo.startsWith('http')) ? returnTo : '/dashboard';
  return c.redirect(target);
});

// GET /register — Render Register Page
dashboardRouter.get('/register', async (c) => {
  const user = await resolveUserFromCookie(c);
  const returnTo = c.req.query('return_to');
  if (user) {
    const target = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard';
    return c.redirect(target);
  }
  return c.render(<AuthPage mode="register" returnTo={returnTo} />, { title: 'Create Account — Hono URL Engine' });
});

// POST /register — Handle native form registration
dashboardRouter.post('/register', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const returnTo = String(body.return_to || c.req.query('return_to') || '');

  if (!email || !password || password.length < 6) {
    return c.render(
      <AuthPage mode="register" error="Password must be at least 6 characters long." email={email} returnTo={returnTo} />,
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
        returnTo={returnTo}
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

  const target = returnTo && (returnTo.startsWith('/') || returnTo.startsWith('http')) ? returnTo : '/dashboard';
  return c.redirect(target);
});

// Sign Out (supports both GET and POST for native navigation)
dashboardRouter.get('/logout', async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.redirect('/login');
});

dashboardRouter.post('/logout', async (c) => {
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
      {/* Toast Notification Container (Town Pill) */}
      <div
        id="toast"
        class="fixed bottom-6 right-6 z-50 transform translate-y-12 opacity-0 pointer-events-none transition-all duration-300 bg-stone-900 border border-stone-800 text-stone-100 text-xs px-4 py-2.5 rounded-full shadow-xl font-sans flex items-center gap-2.5"
      >
        <span id="toastDot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span id="toastMsg" class="font-medium">Action completed</span>
      </div>

      {/* Top Navbar */}
      <Navbar user={user} />

      {/* Main Content Area */}
      <main class="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        {/* Create Link Form */}
        <CreateLinkForm />

        {/* Links Table */}
        <LinkTable urls={urls} baseUrl={baseUrl} />
      </main>

      {/* Footer */}
      <footer class="border-t border-stone-200/80 py-8 text-center text-xs text-stone-400 font-sans">
        Hono URL Shortener &middot; Clean, scalable links with AI integration
      </footer>

      {/* Analytics Slide-over Drawer */}
      <AnalyticsDrawer />

      {/* Settings Slide-over Drawer */}
      <SettingsDrawer user={user} />

      {/* Client-Side Progressive Enhancement Script (Copy & Drawers & Local Search) */}
      <script>
        {raw(`
          const toast = document.getElementById('toast');
          const toastMsg = document.getElementById('toastMsg');
          const toastDot = document.getElementById('toastDot');
          let toastTimer;

          function filterLinksLocally(query) {
            const q = (query || '').toLowerCase().trim();
            const rows = document.querySelectorAll('.link-row');
            let visible = 0;
            rows.forEach(row => {
              const text = row.getAttribute('data-search') || '';
              if (!q || text.includes(q)) {
                row.style.display = '';
                visible++;
              } else {
                row.style.display = 'none';
              }
            });
            const countEl = document.getElementById('visibleLinkCount');
            if (countEl) countEl.textContent = visible;
          }

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

          function copyCurrentApiKey() {
            const el = document.getElementById('navApiKeyText') || document.getElementById('settingsApiKeyText');
            const key = el ? (el.getAttribute('data-key') || el.textContent) : '';
            if (key) copyToClipboard(key, 'API Key copied');
          }

          function copySettingsApiKey() {
            const el = document.getElementById('settingsApiKeyText');
            const key = el ? (el.getAttribute('data-key') || el.textContent) : '';
            if (key) copyToClipboard(key, 'API Key copied');
          }

          function rotateApiKey() {
            if (!confirm('Rotate your API key? Any active REST API connection using this key will immediately be disconnected.')) {
              return;
            }
            fetch('/api/v1/auth/rotate-key', { method: 'POST' })
              .then(res => {
                if (!res.ok) throw new Error('Rotation failed');
                return res.json();
              })
              .then(data => {
                const navKeyEl = document.getElementById('navApiKeyText');
                if (navKeyEl && data.api_key) {
                  navKeyEl.textContent = data.api_key;
                  navKeyEl.setAttribute('data-key', data.api_key);
                  navKeyEl.title = data.api_key;
                }
                const settingsKeyEl = document.getElementById('settingsApiKeyText');
                if (settingsKeyEl && data.api_key) {
                  settingsKeyEl.textContent = data.api_key;
                  settingsKeyEl.setAttribute('data-key', data.api_key);
                  settingsKeyEl.title = data.api_key;
                }
                showToast('API key rotated successfully');
              })
              .catch(err => {
                console.error(err);
                showToast('Failed to rotate API key', true);
              });
          }

          // ==========================================
          // Settings Drawer & Connected Apps
          // ==========================================
          function openSettingsDrawer() {
            const drawer = document.getElementById('settingsDrawer');
            const backdrop = document.getElementById('settingsDrawerBackdrop');
            if (!drawer || !backdrop) return;
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
            backdrop.classList.add('opacity-100', 'pointer-events-auto');
            drawer.classList.remove('translate-x-full');
            drawer.classList.add('translate-x-0');
            loadConnectedApps();
          }

          function closeSettingsDrawer() {
            const drawer = document.getElementById('settingsDrawer');
            const backdrop = document.getElementById('settingsDrawerBackdrop');
            if (!drawer || !backdrop) return;
            drawer.classList.remove('translate-x-0');
            drawer.classList.add('translate-x-full');
            backdrop.classList.remove('opacity-100', 'pointer-events-auto');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
          }

          function loadConnectedApps() {
            const listEl = document.getElementById('connectedAppsList');
            if (!listEl) return;
            listEl.innerHTML = '<div class="text-center py-6 text-stone-400 text-xs font-sans">Loading connected applications...</div>';

            fetch('/api/v1/oauth/connected-apps')
              .then(res => res.json())
              .then(data => {
                if (!data.apps || data.apps.length === 0) {
                  listEl.innerHTML = 
                    '<div class="text-center py-8 px-4 bg-stone-50 border border-stone-200/80 rounded-xl text-stone-500 text-xs font-sans">' +
                      '<p class="font-medium text-stone-700">No applications connected</p>' +
                      '<p class="text-stone-400 text-[11px] mt-1">When an AI agent (like ChatGPT or Claude) connects via OAuth 2.1, it will appear here.</p>' +
                    '</div>';
                  return;
                }

                listEl.innerHTML = data.apps.map(app => {
                  const createdStr = app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Authorized';
                  const shortId = (app.clientId || '').substring(0, 16);
                  return (
                    '<div class="bg-stone-50 border border-stone-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">' +
                      '<div class="min-w-0 flex-1">' +
                        '<div class="flex items-center gap-2">' +
                          '<span class="font-medium text-xs text-stone-900 truncate">' + (app.clientName || 'Remote MCP Client') + '</span>' +
                          '<span class="text-[9px] font-mono text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">mcp:tools</span>' +
                        '</div>' +
                        '<div class="text-[10px] text-stone-400 font-sans mt-0.5">' +
                          'Connected ' + createdStr + ' &middot; <span class="font-mono">' + shortId + '...</span>' +
                        '</div>' +
                      '</div>' +
                      '<button type="button" data-client-id="' + app.clientId + '" onclick="disconnectApp(this.dataset.clientId)" class="bg-white hover:bg-red-50 border border-stone-200 hover:border-red-200 text-stone-600 hover:text-red-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition shadow-2xs shrink-0">' +
                        'Disconnect' +
                      '</button>' +
                    '</div>'
                  );
                }).join('');
              })
              .catch(() => {
                listEl.innerHTML = '<div class="text-center py-6 text-red-500 text-xs font-sans">Failed to load connected applications.</div>';
              });
          }

          function disconnectApp(clientId) {
            if (!confirm('Disconnect this application? It will immediately lose access to your shortened URLs and MCP tools.')) {
              return;
            }
            fetch('/api/v1/oauth/disconnect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_id: clientId })
            })
            .then(res => res.json())
            .then(data => {
              if (data.status === 'disconnected') {
                showToast('Application disconnected');
                loadConnectedApps();
              } else {
                showToast('Failed to disconnect application', true);
              }
            })
            .catch(err => {
              console.error(err);
              showToast('Failed to disconnect application', true);
            });
          }

          // ==========================================
          // Analytics Slide-over Drawer Handlers
          // ==========================================
          function openAnalyticsDrawer(urlId, shortKey) {
            const drawer = document.getElementById('analyticsDrawer') || document.getElementById('telemetryDrawer');
            const backdrop = document.getElementById('analyticsDrawerBackdrop') || document.getElementById('drawerBackdrop');
            const drawerTitle = document.getElementById('drawerTitle');
            const drawerContent = document.getElementById('drawerContent');

            if (!drawer || !backdrop) return;
            if (drawerTitle) drawerTitle.textContent = '/' + shortKey;
            if (drawerContent) drawerContent.innerHTML = '<div class="text-center py-20 text-stone-400 font-sans text-xs">Querying ClickHouse cluster...</div>';
            
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
                    '<div class="flex items-center justify-between text-xs py-2 border-b border-stone-100">' +
                      '<span class="text-stone-700 font-mono">' + c.name + '</span>' +
                      '<span class="text-stone-900 font-mono font-semibold">' + c.count + '</span>' +
                    '</div>'
                  ).join('');
                } else {
                  countriesHtml = '<div class="text-stone-400 text-xs py-2">No geographic hits yet</div>';
                }

                let referrersHtml = '';
                if (data.topReferrers && data.topReferrers.length > 0) {
                  referrersHtml = data.topReferrers.map(r => 
                    '<div class="flex items-center justify-between text-xs py-2 border-b border-stone-100">' +
                      '<span class="text-stone-700 truncate max-w-[200px] font-mono">' + (r.name || 'Direct') + '</span>' +
                      '<span class="text-stone-900 font-mono font-semibold">' + r.count + '</span>' +
                    '</div>'
                  ).join('');
                } else {
                  referrersHtml = '<div class="text-stone-400 text-xs py-2">No referrer data yet</div>';
                }

                if (drawerContent) {
                  drawerContent.innerHTML = 
                    '<div class="space-y-6 font-sans">' +
                      '<div class="grid grid-cols-2 gap-3">' +
                        '<div class="bg-stone-50 border border-stone-200/90 rounded-xl p-4 text-center">' +
                          '<div class="text-3xl font-serif text-stone-950 font-normal">' + (data.totalClicks || 0) + '</div>' +
                          '<div class="text-[10px] font-medium text-stone-500 uppercase tracking-wider mt-1">Total Clicks</div>' +
                        '</div>' +
                        '<div class="bg-stone-50 border border-stone-200/90 rounded-xl p-4 text-center">' +
                          '<div class="text-3xl font-serif text-stone-950 font-normal">' + (data.uniqueVisitors || 0) + '</div>' +
                          '<div class="text-[10px] font-medium text-stone-500 uppercase tracking-wider mt-1">Unique Visitors</div>' +
                        '</div>' +
                      '</div>' +
                      '<div>' +
                        '<h4 class="text-xs font-semibold text-stone-900 mb-2 uppercase tracking-wider text-[10px]">Top Countries</h4>' +
                        '<div class="bg-stone-50 border border-stone-200/90 rounded-xl p-4">' + countriesHtml + '</div>' +
                      '</div>' +
                      '<div>' +
                        '<h4 class="text-xs font-semibold text-stone-900 mb-2 uppercase tracking-wider text-[10px]">Referrers</h4>' +
                        '<div class="bg-stone-50 border border-stone-200/90 rounded-xl p-4">' + referrersHtml + '</div>' +
                      '</div>' +
                    '</div>';
                }
              })
              .catch(() => {
                if (drawerContent) {
                  drawerContent.innerHTML = '<div class="text-center py-20 text-red-500 font-sans text-xs">Failed to load analytics from ClickHouse.</div>';
                }
              });
          }

          function closeAnalyticsDrawer() {
            const drawer = document.getElementById('analyticsDrawer') || document.getElementById('telemetryDrawer');
            const backdrop = document.getElementById('analyticsDrawerBackdrop') || document.getElementById('drawerBackdrop');
            if (!drawer || !backdrop) return;
            drawer.classList.remove('translate-x-0');
            drawer.classList.add('translate-x-full');
            backdrop.classList.remove('opacity-100', 'pointer-events-auto');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
          }

          // Alias for backward compatibility
          const openTelemetryDrawer = openAnalyticsDrawer;
          const closeTelemetryDrawer = closeAnalyticsDrawer;
        `)}
      </script>
    </div>
  );
};

// ==========================================
// 3. Dashboard View Route
// ==========================================

dashboardRouter.get('/dashboard', async (c) => {
  const user = await resolveUserFromCookie(c);
  if (!user) return c.redirect('/login');

  const userUrls = await db
    .select()
    .from(urls)
    .where(eq(urls.userId, user.id))
    .orderBy(desc(urls.createdAt));

  const baseUrl = new URL(c.req.url).origin;

  return c.render(
    <DashboardPage user={user} urls={userUrls} baseUrl={baseUrl} />,
    { title: 'Dashboard — Hono Shortener' }
  );
});

// ==========================================
// 4. Form Actions (Native Form Submissions)
// ==========================================

// Create Link Action
dashboardRouter.post('/dashboard/links', async (c) => {
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
dashboardRouter.post('/dashboard/links/:id/delete', async (c) => {
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

// Alias for backward compatibility
export const dashboardApp = dashboardRouter;

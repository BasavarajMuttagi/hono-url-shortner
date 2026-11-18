import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { eq, desc } from 'drizzle-orm';
import { raw } from 'hono/html';
import { Layout } from './layout.js';
import { db, users, urls } from '../db/index.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const dashboardApp = new Hono<AppEnv>();

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
  } catch {
    // If not valid JWT, check if it's an API key
    const rows = await db
      .select({ id: users.id, email: users.email, apiKey: users.apiKey })
      .from(users)
      .where(eq(users.apiKey, token))
      .limit(1);
    return rows[0] || null;
  }
  return null;
}

// 1. Dashboard View (GET / and GET /dashboard)
dashboardApp.get('/dashboard', async (c) => renderDashboard(c));
dashboardApp.get('/', async (c) => renderDashboard(c));

async function renderDashboard(c: any) {
  const user = await resolveUserFromCookie(c);

  // If unauthenticated, render the clean login view
  if (!user) {
    return c.html(
      <Layout title="Sign In — Hono URL Engine">
        <div class="min-h-screen flex items-center justify-center p-4">
          <div class="w-full max-w-sm bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-6 shadow-2xl backdrop-blur">
            <div class="flex items-center gap-2 mb-6">
              <div class="h-6 w-6 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono text-xs font-bold">
                H
              </div>
              <h1 class="font-semibold text-sm text-zinc-100">Hono URL Shortener</h1>
            </div>

            <h2 class="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-4">Account Access</h2>

            <form id="authForm" class="space-y-3.5">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Email</label>
                <input
                  id="authEmail"
                  type="email"
                  required
                  placeholder="user@example.com"
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 transition placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Password</label>
                <input
                  id="authPassword"
                  type="password"
                  required
                  placeholder="••••••••"
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 transition placeholder:text-zinc-600"
                />
              </div>

              <div id="authError" class="text-xs text-red-400 font-mono hidden"></div>

              <div class="flex gap-2 pt-2">
                <button
                  type="button"
                  id="loginBtn"
                  class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-xs transition"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  id="registerBtn"
                  class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2 rounded-lg text-xs transition"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Client Auth Script (Pure SSR helper, zero build step) */}
        <script>
          {raw(`
            const emailInput = document.getElementById('authEmail');
            const passInput = document.getElementById('authPassword');
            const errBox = document.getElementById('authError');

            async function submitAuth(endpoint) {
              errBox.classList.add('hidden');
              const email = emailInput.value.trim();
              const password = passInput.value;
              if (!email || !password) {
                errBox.textContent = 'Please fill out all fields';
                errBox.classList.remove('hidden');
                return;
              }

              try {
                const res = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                  errBox.textContent = data.error || 'Authentication failed';
                  errBox.classList.remove('hidden');
                  return;
                }
                window.location.reload();
              } catch (e) {
                errBox.textContent = 'Network error';
                errBox.classList.remove('hidden');
              }
            }

            document.getElementById('loginBtn').addEventListener('click', () => submitAuth('/api/v1/auth/login'));
            document.getElementById('registerBtn').addEventListener('click', () => submitAuth('/api/v1/auth/register'));
          `)}
        </script>
      </Layout>
    );
  }

  // 2. Authenticated Dashboard: Fetch URLs directly from PostgreSQL via Drizzle ORM
  const userUrls = await db
    .select()
    .from(urls)
    .where(eq(urls.userId, user.id))
    .orderBy(desc(urls.createdAt));

  const totalLinks = userUrls.length;
  const baseUrl = env.BASE_URL.replace(/\/+$/, '');

  return c.html(
    <Layout title="Dashboard — Hono Shortener">
      {/* Toast Notification Container */}
      <div id="toast" class="fixed bottom-5 right-5 z-50 transform translate-y-12 opacity-0 pointer-events-none transition-all duration-300 bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs px-4 py-2.5 rounded-lg shadow-xl font-mono flex items-center gap-2">
        <span id="toastDot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span id="toastMsg">Action completed</span>
      </div>

      <div class="min-h-screen flex flex-col">
        {/* Navigation Bar */}
        <header class="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
          <div class="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="h-6 w-6 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono text-xs font-bold">
                H
              </div>
              <span class="font-semibold text-sm tracking-tight text-zinc-100">Hono Shortener</span>
              <span class="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                Sub-3ms
              </span>
            </div>

            <div class="flex items-center gap-4">
              <div class="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs">
                <span class="text-zinc-500 font-mono">Key:</span>
                <span class="font-mono text-zinc-300 text-[11px] truncate max-w-[120px]">{user.apiKey}</span>
                <button
                  type="button"
                  onclick={`copyToClipboard('${user.apiKey}', 'API Key copied')`}
                  class="text-zinc-500 hover:text-zinc-200 p-0.5 rounded transition"
                  title="Copy API Key"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>

              <div class="text-xs text-zinc-400">{user.email}</div>

              <button
                type="button"
                id="logoutBtn"
                class="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-lg transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main class="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {/* Top Form: Shorten URL (Pure Base62, Zero Alias Input) */}
          <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 mb-8 shadow-sm">
            <div class="text-xs font-semibold text-zinc-300 mb-3 flex items-center justify-between">
              <span>Create Short Link</span>
              <span class="text-[11px] text-zinc-500 font-normal">Collision-free Base62 auto-generation</span>
            </div>

            <form id="createUrlForm" class="space-y-3">
              <div class="flex flex-col sm:flex-row gap-3">
                <div class="flex-1">
                  <input
                    id="destinationUrl"
                    type="url"
                    required
                    placeholder="https://your-long-destination-url.com/path/to/resource"
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition font-mono"
                  />
                </div>
                <div class="sm:w-56">
                  <input
                    id="linkTitle"
                    type="text"
                    placeholder="Optional label (e.g. Docs)"
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <button
                  type="submit"
                  id="submitLinkBtn"
                  class="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  <span>Shorten URL</span>
                </button>
              </div>
            </form>
          </div>

          {/* Table Container */}
          <div class="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
            <div class="p-4 border-b border-zinc-800/80 flex items-center justify-between">
              <div>
                <h2 class="font-semibold text-sm text-zinc-100">Shortened Links</h2>
                <p class="text-xs text-zinc-500 mt-0.5">High-speed Valkey-cached redirect records</p>
              </div>
              <span class="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded">
                {totalLinks} link{totalLinks === 1 ? '' : 's'}
              </span>
            </div>

            {totalLinks === 0 ? (
              <div class="py-16 text-center text-zinc-500 font-mono text-xs">
                No URLs created yet. Create your first short link above.
              </div>
            ) : (
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-zinc-800/80 bg-zinc-900/80 text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                      <th class="py-3 px-4 w-44">Short Link</th>
                      <th class="py-3 px-4">Destination</th>
                      <th class="py-3 px-4 w-28">Created</th>
                      <th class="py-3 px-4 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-800/50">
                    {userUrls.map((item) => {
                      const shortUrl = `${baseUrl}/${item.shortKey}`;
                      const createdDate = item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—';
                      return (
                        <tr key={item.id} class="hover:bg-zinc-900/40 transition-colors">
                          <td class="py-3 px-4">
                            <div class="flex items-center gap-2">
                              <a
                                href={shortUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="font-mono text-indigo-400 hover:text-indigo-300 hover:underline font-medium text-xs"
                              >
                                /{item.shortKey}
                              </a>
                              <button
                                type="button"
                                onclick={`copyToClipboard('${shortUrl}', 'Short link copied')`}
                                class="text-zinc-500 hover:text-zinc-300 p-1 rounded"
                                title="Copy Short Link"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              </button>
                            </div>
                            {item.title ? (
                              <div class="text-[11px] text-zinc-500 truncate mt-0.5 max-w-[180px]">
                                {item.title}
                              </div>
                            ) : null}
                          </td>
                          <td class="py-3 px-4">
                            <div class="max-w-md truncate text-zinc-400 font-mono text-[11px]" title={item.originalUrl}>
                              {item.originalUrl}
                            </div>
                          </td>
                          <td class="py-3 px-4 font-mono text-zinc-500 text-[11px] whitespace-nowrap">
                            {createdDate}
                          </td>
                          <td class="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onclick={`openTelemetryDrawer('${item.id}', '${item.shortKey}')`}
                              class="text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 px-2.5 py-1 rounded text-xs font-medium mr-2 transition"
                            >
                              Analytics
                            </button>
                            <button
                              type="button"
                              onclick={`deleteUrl('${item.id}')`}
                              class="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                              title="Delete Link"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer class="border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
          Sub-3ms Headless API Engine · Tailwind CSS · Pure Hono JSX SSR
        </footer>
      </div>

      {/* Slide-over Aside Overlay (Z-INDEX 50 — Does NOT push page layout) */}
      <div
        id="drawerBackdrop"
        onclick="closeTelemetryDrawer()"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 opacity-0 pointer-events-none"
      ></div>

      <aside
        id="telemetryDrawer"
        class="fixed top-0 right-0 bottom-0 w-full max-w-md bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out"
        aria-label="ClickHouse telemetry panel"
      >
        <div class="p-5 border-b border-zinc-800 flex items-start justify-between bg-zinc-900/90 backdrop-blur sticky top-0 z-10">
          <div>
            <div class="flex items-center gap-2">
              <h3 id="drawerTitle" class="font-semibold text-sm text-zinc-100 font-mono">
                /telemetry
              </h3>
              <span class="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-1.5 py-0.5 rounded">
                ClickHouse
              </span>
            </div>
            <p class="text-xs text-zinc-400 mt-1">Vectorized OLAP metrics</p>
          </div>
          <button
            type="button"
            onclick="closeTelemetryDrawer()"
            class="text-zinc-500 hover:text-zinc-200 p-1 rounded-md text-sm transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div id="drawerContent" class="p-6 overflow-y-auto flex-1">
          <div class="text-center py-16 text-zinc-500 font-mono text-xs">
            Querying ClickHouse cluster...
          </div>
        </div>
      </aside>

      {/* Vanilla Browser Client Script (Zero external bundles, pure SSR support) */}
      <script>
        {raw(`
          const toast = document.getElementById('toast');
          const toastMsg = document.getElementById('toastMsg');
          const toastDot = document.getElementById('toastDot');
          let toastTimer;

          function showToast(message, isError = false) {
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

          // Create Short Link Form Handler
          const createForm = document.getElementById('createUrlForm');
          if (createForm) {
            createForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const originalUrl = document.getElementById('destinationUrl').value.trim();
              const title = document.getElementById('linkTitle').value.trim();
              const btn = document.getElementById('submitLinkBtn');
              if (!originalUrl) return;

              btn.disabled = true;
              btn.textContent = 'Generating...';

              try {
                const res = await fetch('/api/v1/urls', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ original_url: originalUrl, title: title || undefined })
                });
                const data = await res.json();
                if (!res.ok) {
                  showToast(data.error || 'Failed to create link', true);
                  btn.disabled = false;
                  btn.textContent = 'Shorten URL';
                  return;
                }
                showToast('Short URL generated');
                window.location.reload();
              } catch (err) {
                showToast('Network error creating URL', true);
                btn.disabled = false;
                btn.textContent = 'Shorten URL';
              }
            });
          }

          // Delete Link Handler
          async function deleteUrl(id) {
            if (!confirm('Are you sure you want to delete this short URL?')) return;
            try {
              const res = await fetch('/api/v1/urls/' + id, { method: 'DELETE' });
              if (!res.ok) {
                const data = await res.json();
                showToast(data.error || 'Failed to delete', true);
                return;
              }
              showToast('Link deleted');
              window.location.reload();
            } catch (err) {
              showToast('Network error deleting link', true);
            }
          }

          // Slide-over Aside Drawer Handlers
          const drawer = document.getElementById('telemetryDrawer');
          const backdrop = document.getElementById('drawerBackdrop');
          const drawerTitle = document.getElementById('drawerTitle');
          const drawerContent = document.getElementById('drawerContent');

          function openTelemetryDrawer(urlId, shortKey) {
            drawerTitle.textContent = '/' + shortKey;
            drawerContent.innerHTML = '<div class="text-center py-16 text-zinc-500 font-mono text-xs">Querying ClickHouse cluster...</div>';
            
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
            backdrop.classList.add('opacity-100', 'pointer-events-auto');
            drawer.classList.remove('translate-x-full');
            drawer.classList.add('translate-x-0');

            fetch('/api/v1/urls/' + urlId + '/analytics')
              .then(res => res.json())
              .then(data => {
                const topCountry = data.topCountries && data.topCountries[0] ? (data.topCountries[0].name + ' (' + data.topCountries[0].count + ')') : '—';
                const topDevice = data.devices && data.devices[0] ? (data.devices[0].name + ' (' + data.devices[0].count + ')') : '—';
                
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
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">' +
                        '<div class="text-sm font-bold font-mono text-indigo-400 truncate pt-1">' + topCountry + '</div>' +
                        '<div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Top Country</div>' +
                      '</div>' +
                      '<div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">' +
                        '<div class="text-sm font-bold font-mono text-indigo-400 truncate pt-1">' + topDevice + '</div>' +
                        '<div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Top Device</div>' +
                      '</div>' +
                    '</div>' +

                    '<div>' +
                      '<h4 class="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">Top Geographies</h4>' +
                      '<div class="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">' + countriesHtml + '</div>' +
                    '</div>' +

                    '<div>' +
                      '<h4 class="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">Referrers</h4>' +
                      '<div class="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">' + referrersHtml + '</div>' +
                    '</div>' +
                  '</div>';
              })
              .catch(err => {
                drawerContent.innerHTML = '<div class="text-red-400 text-xs font-mono py-8 text-center">Failed to load ClickHouse telemetry</div>';
              });
          }

          function closeTelemetryDrawer() {
            backdrop.classList.remove('opacity-100', 'pointer-events-auto');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
            drawer.classList.remove('translate-x-0');
            drawer.classList.add('translate-x-full');
          }

          // Dismiss on Escape key
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTelemetryDrawer();
          });

          // Sign Out Handler
          const logoutBtn = document.getElementById('logoutBtn');
          if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
              await fetch('/api/v1/auth/logout', { method: 'POST' });
              window.location.reload();
            });
          }
        `)}
      </script>
    </Layout>
  );
}

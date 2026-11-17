import { useState, useEffect } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

interface URLItem {
  id: string;
  shortKey: string;
  originalUrl: string;
  title: string | null;
  createdAt: string;
}

interface AnalyticsData {
  urlId: string;
  shortKey: string;
  totalClicks: number;
  uniqueVisitors: number;
  timeseries: { date: string; clicks: number }[];
  topCountries: { name: string; count: number }[];
  topReferrers: { name: string; count: number }[];
  devices: { name: string; count: number }[];
  browsers: { name: string; count: number }[];
  operatingSystems: { name: string; count: number }[];
}

export function App() {
  const [urls, setUrls] = useState<URLItem[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  // Form states (No custom alias! Auto-generated Base62)
  const [originalUrl, setOriginalUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Analytics Slide-over Aside Drawer State
  const [activeUrl, setActiveUrl] = useState<URLItem | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 2500);
  };

  const copyText = (text: string, msg = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(msg);
    }).catch(() => {
      showToast('Failed to copy', true);
    });
  };

  // Check auth and load initial links
  const loadData = async () => {
    try {
      const meRes = await fetch('/api/v1/auth/me');
      if (!meRes.ok) {
        setAuthenticated(false);
        return;
      }
      const meData = await meRes.json();
      setUserEmail(meData.user?.email || '');
      setApiKey(meData.user?.apiKey || '');
      setAuthenticated(true);

      const urlsRes = await fetch('/api/v1/urls');
      if (urlsRes.ok) {
        const uData = await urlsRes.json();
        setUrls(uData.data || []);
      }
    } catch {
      setAuthenticated(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Escape key handler to dismiss slide-over aside
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveUrl(null);
        setAnalytics(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Handle URL creation (Zero alias input — pure Base62)
  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!originalUrl) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_url: originalUrl.trim(),
          title: title.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to create link', true);
        return;
      }

      showToast('Short URL generated');
      setOriginalUrl('');
      setTitle('');
      await loadData();
    } catch {
      showToast('Network error creating URL', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle URL deletion
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this short URL?')) return;
    try {
      const res = await fetch(`/api/v1/urls/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to delete', true);
        return;
      }
      showToast('URL deleted');
      setUrls((prev) => prev.filter((u) => u.id !== id));
      if (activeUrl?.id === id) {
        setActiveUrl(null);
      }
    } catch {
      showToast('Network error deleting link', true);
    }
  };

  // Open slide-over aside and fetch ClickHouse analytics
  const openAnalyticsDrawer = async (item: URLItem) => {
    setActiveUrl(item);
    setAnalytics(null);
    setAnalyticsLoading(true);

    try {
      const res = await fetch(`/api/v1/urls/${item.id}/analytics`);
      if (!res.ok) {
        showToast('Failed to load telemetry', true);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch {
      showToast('Error querying analytics', true);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    setAuthenticated(false);
    window.location.reload();
  };

  if (authenticated === null) {
    return (
      <div class="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">
        Initializing Hono Shortener...
      </div>
    );
  }

  if (!authenticated) {
    return <AuthScreen onLoginSuccess={loadData} showToast={showToast} />;
  }

  const origin = window.location.origin;

  return (
    <div class="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-indigo-500/20 selection:text-indigo-300">
      {/* Top Navigation */}
      <header class="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
        <div class="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-md bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </span>
            <span class="font-semibold text-sm tracking-tight text-zinc-200">Hono Shortener</span>
            <span class="text-[11px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              v1.0
            </span>
          </div>

          <div class="flex items-center gap-4">
            <div class="hidden sm:flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              &lt;3ms Hot Path
            </div>

            <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full pl-3 pr-1.5 py-1 text-xs">
              <span class="text-zinc-400 font-medium max-w-[140px] truncate" title={userEmail}>
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                class="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-0.5 rounded-full text-xs transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main class="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {/* Header Bar with API Key */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/60 mb-6">
          <div>
            <h1 class="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2.5">
              Links
              <span class="text-xs font-mono bg-zinc-900 text-zinc-400 px-2.5 py-0.5 rounded-full border border-zinc-800">
                {urls.length}
              </span>
            </h1>
            <p class="text-xs text-zinc-400 mt-1">
              Deterministic routing with Aiven Valkey cache and ClickHouse OLAP events.
            </p>
          </div>

          <div class="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-1.5 self-start sm:self-auto">
            <span class="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">API Key</span>
            <code class="text-xs font-mono text-indigo-400">
              {apiKey ? `${apiKey.substring(0, 14)}...` : 'None'}
            </code>
            <button
              onClick={() => copyText(apiKey, 'API key copied')}
              class="text-zinc-500 hover:text-zinc-300 p-1 rounded transition"
              title="Copy API Key"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Link Creation Bar (NO custom alias — single destination input) */}
        <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 shadow-sm mb-8">
          <form onSubmit={handleCreate} class="flex flex-col md:flex-row gap-3">
            <div class="flex-1">
              <input
                type="url"
                required
                value={originalUrl}
                onInput={(e: any) => setOriginalUrl(e.target.value)}
                placeholder="Paste destination URL (e.g. https://engineering.atspotify.com)..."
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>

            <div class="md:w-64">
              <input
                type="text"
                value={title}
                onInput={(e: any) => setTitle(e.target.value)}
                placeholder="Title / Note (Optional)"
                maxlength={255}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Shortening...' : '⚡ Create Link'}
            </button>
          </form>
        </div>

        {/* Links Directory Table */}
        <div class="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
          {urls.length === 0 ? (
            <div class="text-center py-16 px-4">
              <div class="text-zinc-600 text-3xl mb-2 font-mono">∅</div>
              <p class="text-sm text-zinc-400">No short links created yet</p>
              <p class="text-xs text-zinc-600 mt-1">Paste a destination URL above to generate your first link.</p>
            </div>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-zinc-800/80 bg-zinc-900/80 text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                    <th class="py-3 px-4 w-44">Short Link</th>
                    <th class="py-3 px-4">Destination</th>
                    <th class="py-3 px-4 w-28">Created</th>
                    <th class="py-3 px-4 w-32 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800/50">
                  {urls.map((item) => {
                    const shortUrl = `${origin}/${item.shortKey}`;
                    const createdDate = item.createdAt ? item.createdAt.split('T')[0] : '';
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
                              onClick={() => copyText(shortUrl, 'Short link copied')}
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
                            onClick={() => openAnalyticsDrawer(item)}
                            class="text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 px-2.5 py-1 rounded text-xs font-medium mr-2 transition"
                          >
                            Analytics
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            class="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                            title="Delete"
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
        Sub-3ms Headless API Engine · Tailwind CSS · Hono JSX Client Components
      </footer>

      {/* Slide-over Aside Overlay (Z-INDEX 50 — Does NOT push page layout) */}
      <div
        onClick={() => { setActiveUrl(null); setAnalytics(null); }}
        class={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${activeUrl ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      ></div>

      <aside
        class={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${activeUrl ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="ClickHouse telemetry panel"
      >
        <div class="p-5 border-b border-zinc-800 flex items-start justify-between bg-zinc-900/90 backdrop-blur sticky top-0 z-10">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-sm text-zinc-100 font-mono">
                {activeUrl ? `/${activeUrl.shortKey}` : 'Telemetry'}
              </h3>
              <span class="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-1.5 py-0.5 rounded">
                ClickHouse
              </span>
            </div>
            <p class="text-xs text-zinc-400 mt-1">Vectorized OLAP metrics</p>
          </div>
          <button
            onClick={() => { setActiveUrl(null); setAnalytics(null); }}
            class="text-zinc-500 hover:text-zinc-200 p-1 rounded-md text-sm transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="p-6 overflow-y-auto flex-1">
          {analyticsLoading ? (
            <div class="text-center py-16 text-zinc-500 font-mono text-xs">
              Querying ClickHouse cluster...
            </div>
          ) : analytics ? (
            <div class="space-y-6">
              {/* 4 Metric Cards */}
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">
                  <div class="text-2xl font-bold font-mono text-zinc-100">{analytics.totalClicks}</div>
                  <div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Total Clicks</div>
                </div>
                <div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">
                  <div class="text-2xl font-bold font-mono text-zinc-100">{analytics.uniqueVisitors}</div>
                  <div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Unique Visitors</div>
                </div>
                <div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">
                  <div class="text-sm font-bold font-mono text-indigo-400 truncate pt-1">
                    {analytics.topCountries?.[0]?.name ? `${analytics.topCountries[0].name} (${analytics.topCountries[0].count})` : '—'}
                  </div>
                  <div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Top Country</div>
                </div>
                <div class="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3.5 text-center">
                  <div class="text-sm font-bold font-mono text-indigo-400 truncate pt-1">
                    {analytics.devices?.[0]?.name ? `${analytics.devices[0].name} (${analytics.devices[0].count})` : '—'}
                  </div>
                  <div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-1">Top Device</div>
                </div>
              </div>

              {/* Daily Timeseries */}
              <div>
                <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Daily Timeseries
                </h4>
                <div class="bg-zinc-950 border border-zinc-800/80 rounded-lg divide-y divide-zinc-800/50 p-2 text-xs font-mono">
                  {analytics.timeseries?.length ? (
                    analytics.timeseries.map((t) => (
                      <div key={t.date} class="py-1.5 px-2 flex justify-between">
                        <span class="text-zinc-400">{t.date}</span>
                        <span class="text-zinc-200 font-semibold">{t.clicks} clicks</span>
                      </div>
                    ))
                  ) : (
                    <div class="py-2 px-2 text-zinc-500 text-center">No timeseries events yet</div>
                  )}
                </div>
              </div>

              {/* Platforms & Browsers */}
              <div>
                <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Platforms &amp; Browsers
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  {(analytics.browsers || []).map((b) => (
                    <span key={b.name} class="text-xs font-mono bg-zinc-950 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded">
                      {b.name}: {b.count}
                    </span>
                  ))}
                  {(analytics.operatingSystems || []).map((o) => (
                    <span key={o.name} class="text-xs font-mono bg-zinc-950 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded">
                      {o.name}: {o.count}
                    </span>
                  ))}
                </div>
              </div>

              {/* Top Referrers */}
              <div>
                <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Top Referrers
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  {(analytics.topReferrers || []).map((r) => (
                    <span key={r.name} class="text-xs font-mono bg-zinc-950 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded">
                      {r.name}: {r.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div class="text-center py-16 text-zinc-500 text-xs">
              Select a short link to inspect telemetry.
            </div>
          )}
        </div>
      </aside>

      {/* Global Toast */}
      {toast && (
        <div
          class={`fixed bottom-6 right-6 text-xs font-medium px-4 py-2.5 rounded-lg border shadow-xl z-50 transition-all ${toast.isError ? 'bg-red-950 text-red-200 border-red-800' : 'bg-zinc-900 text-zinc-100 border-zinc-700'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Component: Auth Screen with Tailwind
// -------------------------------------------------------------
function AuthScreen({ onLoginSuccess, showToast }: { onLoginSuccess: () => void; showToast: (m: string, err?: boolean) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSubmitting(true);
    const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Authentication failed', true);
        return;
      }
      showToast(isLogin ? 'Signed in' : 'Account created');
      onLoginSuccess();
    } catch {
      showToast('Network error during authentication', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevLogin = async () => {
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'developer@local.dev', password: 'Password123!' }),
      });
      if (res.status === 409) {
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'developer@local.dev', password: 'Password123!' }),
        });
      }
      onLoginSuccess();
    } catch {
      showToast('Dev login error', true);
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div class="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
        <div class="text-center mb-6">
          <div class="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <h2 class="text-base font-semibold text-zinc-100">Access Infrastructure</h2>
          <p class="text-xs text-zinc-400 mt-0.5">Sub-3ms URL shortener with ClickHouse telemetry</p>
        </div>

        {/* Tab switch */}
        <div class="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 mb-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            class={`flex-1 py-1 rounded transition-colors ${isLogin ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            class={`flex-1 py-1 rounded transition-colors ${!isLogin ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} class="space-y-3.5 text-xs">
          <div>
            <label class="block text-zinc-400 mb-1 font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onInput={(e: any) => setEmail(e.target.value)}
              placeholder="user@example.com"
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-zinc-400 mb-1 font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onInput={(e: any) => setPassword(e.target.value)}
              placeholder="••••••••"
              minlength={6}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-xs"
          >
            {submitting ? 'Please wait...' : isLogin ? 'Continue' : 'Create Account'}
          </button>
        </form>

        <div class="mt-6 pt-4 border-t border-zinc-800/80 text-center">
          <button
            onClick={handleDevLogin}
            class="w-full text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 py-1.5 rounded-lg transition-colors"
          >
            Auto-login as Dev User
          </button>
        </div>
      </div>
    </div>
  );
}

// Mount Client App with hono/jsx/dom
const container = document.getElementById('root');
if (container) {
  render(<App />, container);
}

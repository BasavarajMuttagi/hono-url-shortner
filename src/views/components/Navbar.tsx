import type { FC } from 'hono/jsx';

interface NavbarProps {
  user: {
    email: string;
    apiKey: string;
  };
}

export const Navbar: FC<NavbarProps> = ({ user }) => {
  return (
    <header class="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="h-6 w-6 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono text-xs font-bold">
            H
          </div>
          <span class="font-semibold text-sm tracking-tight text-zinc-100">Hono Shortener</span>
          <span class="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
            Online
          </span>
        </div>

        <div class="flex items-center gap-4">
          {/* API Key Copy Pill */}
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

          {/* Semantic Native Sign Out Form */}
          <form method="post" action="/logout" class="inline">
            <button
              type="submit"
              class="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-lg transition"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
};

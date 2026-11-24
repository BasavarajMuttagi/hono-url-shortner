import type { FC } from 'hono/jsx';

interface SettingsDrawerProps {
  user: {
    email: string;
    apiKey: string;
  };
}

export const SettingsDrawer: FC<SettingsDrawerProps> = ({ user }) => {
  return (
    <>
      {/* Slide-over Aside Overlay */}
      <div
        id="settingsDrawerBackdrop"
        onclick="closeSettingsDrawer()"
        class="fixed inset-0 bg-stone-900/30 backdrop-blur-xs z-40 transition-opacity duration-300 opacity-0 pointer-events-none"
      ></div>

      <aside
        id="settingsDrawer"
        class="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out font-sans"
        aria-label="Settings panel"
      >
        {/* Header */}
        <div class="p-6 border-b border-stone-100 flex items-start justify-between bg-white/95 backdrop-blur sticky top-0 z-10">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-serif text-2xl font-normal text-stone-950">Settings</h3>
              <span class="text-[10px] font-mono text-stone-700 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium">
                Workspace
              </span>
            </div>
            <p class="text-xs text-stone-500 mt-1 font-sans">
              API credentials & connected applications for <span class="text-stone-800 font-medium">{user.email}</span>
            </p>
          </div>
          <button
            type="button"
            onclick="closeSettingsDrawer()"
            class="w-8 h-8 rounded-full border border-stone-200 hover:border-stone-400 text-stone-500 hover:text-stone-900 flex items-center justify-center text-xs transition"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div class="p-6 overflow-y-auto flex-1 font-sans space-y-8">
          {/* Section 1: REST API Key */}
          <div>
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                Developer API Key
              </h4>
              <span class="text-[10px] font-mono text-stone-500 bg-stone-50 border border-stone-200/80 px-2 py-0.5 rounded">
                REST API
              </span>
            </div>
            <p class="text-xs text-stone-600 mb-3 leading-relaxed">
              Use this secret key to authenticate direct REST API requests via curl, scripts, or Postman.
            </p>

            <div class="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
              <div class="flex-1 min-w-0">
                <div class="text-[10px] text-stone-400 font-mono uppercase tracking-wider mb-0.5">Key</div>
                <div
                  id="settingsApiKeyText"
                  data-key={user.apiKey}
                  title={user.apiKey}
                  class="font-mono text-xs text-stone-800 truncate"
                >
                  {user.apiKey}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onclick="copySettingsApiKey()"
                  class="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1"
                  title="Copy Key"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onclick="rotateApiKey()"
                  class="bg-white hover:bg-amber-50 border border-stone-200 hover:border-amber-300 text-stone-700 hover:text-amber-800 px-2.5 py-1.5 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1"
                  title="Rotate Key"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 4v6h6"></path>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                  </svg>
                  <span>Rotate</span>
                </button>
              </div>
            </div>
            <p class="text-[11px] text-stone-400 mt-2 font-sans">
              Rotating this key takes effect immediately. It will not disrupt your active OAuth 2.1 connections.
            </p>
          </div>

          {/* Section 2: Connected Applications (OAuth 2.1 / MCP) */}
          <div class="border-t border-stone-100 pt-6">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                Connected Applications
              </h4>
              <span class="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                OAuth 2.1
              </span>
            </div>
            <p class="text-xs text-stone-600 mb-4 leading-relaxed">
              External AI assistants and tools that hold authorized access to your URL shortener workspace.
            </p>

            {/* Container populated dynamically */}
            <div id="connectedAppsList" class="space-y-3">
              <div class="text-center py-10 text-stone-400 text-xs font-sans">
                Loading connected applications...
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';

export interface OAuthConsentProps {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  userEmail: string;
}

export const OAuthConsentPage: FC<OAuthConsentProps> = ({
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
  userEmail,
}) => {
  return (
    <html lang="en" class="h-full">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Authorize Connection — Hono URL Engine</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          {raw(`
            tailwind.config = {
              theme: {
                extend: {
                  fontFamily: {
                    serif: ['"Instrument Serif"', 'Georgia', 'serif'],
                    sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                    mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
                  },
                  colors: {
                    canvas: '#FAF8F5',
                  }
                }
              }
            };
          `)}
        </script>
      </head>
      <body class="bg-[#FAF8F5] text-stone-900 min-h-screen antialiased selection:bg-amber-200 selection:text-stone-900 font-sans">
        <div class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
          <div class="w-full max-w-md">
            {/* Brand Header (Town Editorial Style) */}
            <div class="text-center mb-6">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-stone-200 bg-white text-stone-700 text-xs font-medium shadow-2xs mb-3">
                <svg class="w-3.5 h-3.5 text-stone-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a1 1 0 0 1 1 1v6.586l4.657-4.657a1 1 0 1 1 1.414 1.414L14.414 11H21a1 1 0 1 1 0 2h-6.586l4.657 4.657a1 1 0 0 1-1.414 1.414L13 14.414V21a1 1 0 1 1-2 0v-6.586l-4.657 4.657a1 1 0 0 1-1.414-1.414L9.586 13H3a1 1 0 1 1 0-2h6.586L4.929 6.343a1 1 0 0 1 1.414-1.414L11 9.586V3a1 1 0 0 1 1-1z" />
                </svg>
                <span>HONO</span>
              </div>
              <h1 class="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-stone-950 mb-1.5">
                Authorize Connection
              </h1>
              <p class="text-xs sm:text-sm text-stone-500 font-sans">
                An external application is requesting access to your workspace.
              </p>
            </div>

            {/* Consent Card (Town White Card Style) */}
            <div class="bg-white border border-stone-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
              {/* Client Info Banner */}
              <div class="flex items-center gap-3.5 p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl mb-5">
                <div class="w-10 h-10 rounded-lg bg-stone-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-stone-900 truncate">{clientName}</div>
                  <div class="text-[11px] font-mono text-stone-500 truncate">{redirectUri}</div>
                </div>
              </div>

              <div class="text-xs text-stone-600 mb-5 font-sans">
                Signed in as <span class="font-semibold text-stone-900">{userEmail}</span>
              </div>

              <div class="border-t border-stone-100 pt-5 mb-6">
                <h2 class="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3 text-[10px]">
                  Requested Permissions
                </h2>
                <ul class="space-y-3 text-xs text-stone-700">
                  <li class="flex items-start gap-2.5">
                    <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Shorten destination URLs & manage your links</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Read real-time ClickHouse click & geographic analytics</span>
                  </li>
                  <li class="flex items-start gap-2.5">
                    <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Access Model Context Protocol (MCP) tool catalogue</span>
                  </li>
                </ul>
              </div>

              {/* Decision Form */}
              <form method="post" action="/oauth/authorize" class="space-y-3">
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="redirect_uri" value={redirectUri} />
                <input type="hidden" name="code_challenge" value={codeChallenge} />
                <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
                <input type="hidden" name="state" value={state} />
                <input type="hidden" name="scope" value={scope} />

                <div class="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    name="decision"
                    value="deny"
                    class="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold transition"
                  >
                    Deny
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="authorize"
                    class="flex-1 py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition"
                  >
                    Authorize
                  </button>
                </div>
              </form>
            </div>

            <p class="text-center text-[11px] text-stone-400 mt-5 font-sans">
              OAuth 2.1 with PKCE &middot; Strict Scoped Session Delegation
            </p>
          </div>
        </div>
      </body>
    </html>
  );
};

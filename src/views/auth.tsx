import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';

export interface AuthPageProps {
  mode: 'login' | 'register';
  error?: string;
  email?: string;
  returnTo?: string;
}

export const AuthPage: FC<AuthPageProps> = ({ mode, error, email = '', returnTo = '' }) => {
  const isRegister = mode === 'register';

  return (
    <div class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#FAF8F5] text-stone-900 font-sans">
      <div class="w-full max-w-md">
        {/* Brand Header (Town Editorial Style) */}
        <div class="text-center mb-8">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-stone-200 bg-white text-stone-700 text-xs font-medium shadow-2xs mb-4">
            <svg class="w-3.5 h-3.5 text-stone-900" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a1 1 0 0 1 1 1v6.586l4.657-4.657a1 1 0 1 1 1.414 1.414L14.414 11H21a1 1 0 1 1 0 2h-6.586l4.657 4.657a1 1 0 0 1-1.414 1.414L13 14.414V21a1 1 0 1 1-2 0v-6.586l-4.657 4.657a1 1 0 0 1-1.414-1.414L9.586 13H3a1 1 0 1 1 0-2h6.586L4.929 6.343a1 1 0 0 1 1.414-1.414L11 9.586V3a1 1 0 0 1 1-1z" />
            </svg>
            <span>HONO</span>
          </div>
          <h1 class="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-stone-950 mb-2">
            {isRegister ? 'Start with Hono.' : 'Welcome back.'}
          </h1>
          <p class="text-xs sm:text-sm text-stone-500 font-sans">
            The{' '}
            <span class="bg-[#FED7AA] text-stone-900 px-1.5 py-0.5 rounded font-medium">
              unusually helpful
            </span>{' '}
            link shortener and work assistant.
          </p>
        </div>

        {/* Main Auth Card (Town White Card Style) */}
        <div class="bg-white border border-stone-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* Navigation Tabs (Town Segmented Capsule) */}
          <nav aria-label="Authentication tabs" class="flex p-1 bg-stone-100 border border-stone-200/80 rounded-xl mb-6">
            <a
              href={returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'}
              class={`flex-1 py-2 text-center text-xs font-medium rounded-lg transition ${
                !isRegister
                  ? 'bg-white text-stone-950 shadow-2xs border border-stone-200/60 font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Sign In
            </a>
            <a
              href={returnTo ? `/register?return_to=${encodeURIComponent(returnTo)}` : '/register'}
              class={`flex-1 py-2 text-center text-xs font-medium rounded-lg transition ${
                isRegister
                  ? 'bg-white text-stone-950 shadow-2xs border border-stone-200/60 font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Create Account
            </a>
          </nav>

          {/* Server-Side Error Alert Banner */}
          {error ? (
            <div
              role="alert"
              aria-live="polite"
              class="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5"
            >
              <svg class="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span class="leading-relaxed">{error}</span>
            </div>
          ) : null}

          {/* Native Semantic Form */}
          <form method="post" action={isRegister ? '/register' : '/login'} class="space-y-4">
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

            {/* Email Field */}
            <div>
              <label for="email" class="block text-xs font-medium text-stone-700 mb-1.5">
                Email Address
              </label>
              <div class="relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  required
                  autocomplete="username"
                  autocorrect="off"
                  autocapitalize="none"
                  spellcheck={false}
                  placeholder="you@example.com"
                  class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-950/10 focus:border-stone-950 transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="password" class="block text-xs font-medium text-stone-700">
                  Password
                </label>
                {isRegister ? (
                  <span class="text-[11px] text-stone-400">Min. 6 characters</span>
                ) : null}
              </div>
              <div class="relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autocomplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 6 : undefined}
                  placeholder="••••••••"
                  class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 pr-10 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-950/10 focus:border-stone-950 transition"
                />
                <button
                  type="button"
                  id="togglePasswordBtn"
                  aria-label="Toggle password visibility"
                  class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-700 transition"
                >
                  <svg id="eyeOpen" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg id="eyeClosed" class="w-4 h-4 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Submit Button (Solid Black Town Button) */}
            <div class="pt-2">
              <button
                type="submit"
                class="w-full bg-stone-900 hover:bg-black active:bg-stone-950 text-white font-medium py-3 px-4 rounded-xl text-xs shadow-xs transition"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </form>

          {/* Bottom Helper */}
          <div class="mt-6 pt-5 border-t border-stone-100 text-center text-xs text-stone-500">
            {isRegister ? (
              <span>
                Already have an account?{' '}
                <a
                  href={returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'}
                  class="font-semibold text-stone-900 underline underline-offset-4 transition"
                >
                  Sign in
                </a>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <a
                  href={returnTo ? `/register?return_to=${encodeURIComponent(returnTo)}` : '/register'}
                  class="font-semibold text-stone-900 underline underline-offset-4 transition"
                >
                  Create an account
                </a>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lightweight progressive enhancement script for password toggle */}
      <script>
        {raw(`
          const pass = document.getElementById('password');
          const toggle = document.getElementById('togglePasswordBtn');
          const openIcon = document.getElementById('eyeOpen');
          const closedIcon = document.getElementById('eyeClosed');

          if (toggle && pass) {
            toggle.addEventListener('click', () => {
              const isText = pass.type === 'text';
              pass.type = isText ? 'password' : 'text';
              if (openIcon && closedIcon) {
                openIcon.classList.toggle('hidden', !isText);
                closedIcon.classList.toggle('hidden', isText);
              }
            });
          }
        `)}
      </script>
    </div>
  );
};

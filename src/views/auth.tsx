import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';

export interface AuthPageProps {
  mode: 'login' | 'register';
  error?: string;
  email?: string;
}

export const AuthPage: FC<AuthPageProps> = ({ mode, error, email = '' }) => {
  const isRegister = mode === 'register';

  return (
    <div class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-zinc-950 text-zinc-100">
      {/* Background glow effect */}
      <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-indigo-500/10 blur-[120px] rounded-full"></div>
      </div>

      <div class="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-4 border border-indigo-400/20">
            <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-zinc-100">
            Hono URL Engine
          </h1>
          <p class="text-xs text-zinc-400 mt-1">
            Distributed URL Shortener & OLAP Analytics
          </p>
        </div>

        {/* Main Auth Card */}
        <div class="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Navigation Tabs (Standard Hono links) */}
          <nav aria-label="Authentication tabs" class="flex p-1 bg-zinc-950/80 border border-zinc-800/80 rounded-xl mb-6">
            <a
              href="/login"
              class={`flex-1 py-2 text-center text-xs font-medium rounded-lg transition-all duration-150 ${
                !isRegister
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              Sign In
            </a>
            <a
              href="/register"
              class={`flex-1 py-2 text-center text-xs font-medium rounded-lg transition-all duration-150 ${
                isRegister
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
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
              class="mb-5 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5"
            >
              <svg class="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span class="leading-relaxed">{error}</span>
            </div>
          ) : null}

          {/* Native Semantic Form */}
          <form method="post" action={isRegister ? '/register' : '/login'} class="space-y-4">
            {/* Email Field */}
            <div>
              <label for="email" class="block text-xs font-medium text-zinc-300 mb-1.5">
                Email Address
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  required
                  autocomplete="username"
                  spellcheck={false}
                  placeholder="you@example.com"
                  class="w-full bg-zinc-950/90 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="password" class="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                {isRegister ? (
                  <span class="text-[11px] text-zinc-500">Minimum 6 characters</span>
                ) : null}
              </div>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autocomplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 6 : undefined}
                  placeholder="••••••••"
                  class="w-full bg-zinc-950/90 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  id="togglePasswordBtn"
                  aria-label="Toggle password visibility"
                  class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition"
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

            {/* Submit Button */}
            <div class="pt-2">
              <button
                type="submit"
                class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </form>

          {/* Bottom Navigation Helper */}
          <div class="mt-6 pt-5 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
            {isRegister ? (
              <span>
                Already have an account?{' '}
                <a
                  href="/login"
                  class="font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
                >
                  Sign in
                </a>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <a
                  href="/register"
                  class="font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
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

import type { FC } from 'hono/jsx';

interface NavbarProps {
  user: {
    email: string;
    apiKey: string;
  };
}

export const Navbar: FC<NavbarProps> = ({ user }) => {
  return (
    <header class="border-b border-stone-200/80 bg-[#FAF8F5]/90 backdrop-blur sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Town-style Asterisk + Wordmark Logo */}
        <div class="flex items-center gap-3">
          <a href="/dashboard" class="flex items-center gap-2 hover:opacity-80 transition group">
            <svg class="w-4 h-4 text-stone-950 transform group-hover:rotate-45 transition-transform duration-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a1 1 0 0 1 1 1v6.586l4.657-4.657a1 1 0 1 1 1.414 1.414L14.414 11H21a1 1 0 1 1 0 2h-6.586l4.657 4.657a1 1 0 0 1-1.414 1.414L13 14.414V21a1 1 0 1 1-2 0v-6.586l-4.657 4.657a1 1 0 0 1-1.414-1.414L9.586 13H3a1 1 0 1 1 0-2h6.586L4.929 6.343a1 1 0 0 1 1.414-1.414L11 9.586V3a1 1 0 0 1 1-1z" />
            </svg>
            <span class="font-sans font-bold tracking-widest text-sm text-stone-950 uppercase">HONO</span>
          </a>
        </div>

        {/* Right User Actions */}
        <div class="flex items-center gap-3">
          {/* Settings Drawer Trigger Button */}
          <button
            type="button"
            onclick="openSettingsDrawer()"
            class="flex items-center gap-1.5 text-xs text-stone-700 hover:text-stone-950 bg-white hover:bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-full font-medium transition shadow-2xs"
            title="Open Workspace Settings & API Keys"
          >
            <svg class="w-3.5 h-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </button>

          <div class="text-xs text-stone-500 hidden lg:block font-sans">{user.email}</div>

          {/* Semantic Native Sign Out Form (Solid Dark Pill) */}
          <form method="post" action="/logout" class="inline">
            <button
              type="submit"
              class="text-xs text-white bg-stone-900 hover:bg-black font-medium px-4 py-1.5 rounded-full shadow-xs transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
};

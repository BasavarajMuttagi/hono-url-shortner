import type { FC } from 'hono/jsx';

export const AnalyticsDrawer: FC = () => {
  return (
    <>
      {/* Slide-over Aside Overlay (Z-INDEX 40) */}
      <div
        id="analyticsDrawerBackdrop"
        onclick="closeAnalyticsDrawer()"
        class="fixed inset-0 bg-stone-900/30 backdrop-blur-xs z-40 transition-opacity duration-300 opacity-0 pointer-events-none"
      ></div>

      <aside
        id="analyticsDrawer"
        class="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out font-sans"
        aria-label="ClickHouse analytics panel"
      >
        <div class="p-6 border-b border-stone-100 flex items-start justify-between bg-white/95 backdrop-blur sticky top-0 z-10">
          <div>
            <div class="flex items-center gap-2">
              <h3 id="drawerTitle" class="font-serif text-2xl font-normal text-stone-950">
                Analytics
              </h3>
              <span class="text-[10px] font-mono text-stone-700 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full font-medium">
                ClickHouse OLAP
              </span>
            </div>
            <p class="text-xs text-stone-500 mt-1 font-sans">Real-time columnar visitor metrics</p>
          </div>
          <button
            type="button"
            onclick="closeAnalyticsDrawer()"
            class="w-8 h-8 rounded-full border border-stone-200 hover:border-stone-400 text-stone-500 hover:text-stone-900 flex items-center justify-center text-xs transition"
            aria-label="Close analytics"
          >
            ✕
          </button>
        </div>

        <div id="drawerContent" class="p-6 overflow-y-auto flex-1 font-sans">
          <div class="text-center py-20 text-stone-400 font-sans text-xs">
            Querying ClickHouse cluster...
          </div>
        </div>
      </aside>
    </>
  );
};

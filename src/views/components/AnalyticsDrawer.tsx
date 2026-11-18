import type { FC } from 'hono/jsx';

export const AnalyticsDrawer: FC = () => {
  return (
    <>
      {/* Slide-over Aside Overlay (Z-INDEX 40) */}
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
    </>
  );
};

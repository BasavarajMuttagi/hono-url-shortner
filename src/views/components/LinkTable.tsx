import type { FC } from 'hono/jsx';

interface URLRecord {
  id: string;
  userId: string;
  shortKey: string;
  originalUrl: string;
  title: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface LinkTableProps {
  urls: URLRecord[];
  baseUrl: string;
}

export const LinkTable: FC<LinkTableProps> = ({ urls, baseUrl }) => {
  const totalLinks = urls.length;

  return (
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
              {urls.map((item) => {
                const shortUrl = `${baseUrl}/${item.shortKey}`;
                const createdDate = item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
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
                      <form method="post" action={`/dashboard/links/${item.id}/delete`} class="inline" onsubmit="return confirm('Delete this link?');">
                        <button
                          type="submit"
                          class="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                          title="Delete Link"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

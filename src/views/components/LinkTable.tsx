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
    <div class="mt-8 mb-16">
      {/* Town-style Section Header (Image 2) */}
      <div class="mb-6">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-stone-200 bg-white text-stone-700 text-xs font-medium shadow-2xs mb-3">
          <span>Directory</span>
        </div>
        <h2 id="linkTableHeading" class="font-serif text-3xl sm:text-4xl text-stone-950 font-normal tracking-tight">
          Hand off the links you share over and over.
        </h2>
        <p class="text-xs sm:text-sm text-stone-500 mt-1.5 font-sans">
          View, search, and manage your shortened links.
        </p>

        {/* Local Search & Counter Row */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6">
          <div class="relative w-full sm:w-80">
            <input
              id="localLinkSearch"
              type="search"
              placeholder="Search links by slug, label, or URL..."
              class="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-950 focus:ring-2 focus:ring-stone-950/5 shadow-2xs font-sans transition"
              oninput="filterLinksLocally(this.value)"
            />
            <svg class="w-4 h-4 text-stone-400 absolute left-3 top-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div class="text-xs text-stone-500 font-sans">
            Showing <span id="visibleLinkCount" class="font-semibold text-stone-900">{totalLinks}</span> of {totalLinks} links
          </div>
        </div>
      </div>

      {/* Main Table Card (Town Card Style) */}
      <div class="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
        {totalLinks === 0 ? (
          <div class="py-20 text-center text-stone-500 font-sans text-xs">
            <div class="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto mb-3 text-stone-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </div>
            <p class="font-medium text-stone-700">No shortened URLs yet</p>
            <p class="text-stone-400 mt-1">Paste a destination URL in the prompt bar above to create your first link.</p>
          </div>
        ) : (
          <div
            tabindex={0}
            role="region"
            aria-labelledby="linkTableHeading"
            class="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-stone-200/80 bg-stone-50/70 text-stone-500 font-semibold tracking-wider uppercase text-[10px]">
                  <th class="py-3 px-5 w-44">Short Link</th>
                  <th class="py-3 px-5">Destination Target</th>
                  <th class="py-3 px-5 w-40">Label</th>
                  <th class="py-3 px-5 w-32">Created</th>
                  <th class="py-3 px-5 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="linksTableBody" class="divide-y divide-stone-100">
                {urls.map((item) => {
                  const shortUrl = `${baseUrl}/${item.shortKey}`;
                  const createdDate = item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—';
                  const searchData = (item.shortKey + ' ' + (item.title || '') + ' ' + item.originalUrl).toLowerCase();
                  return (
                    <tr
                      key={item.id}
                      class="link-row hover:bg-stone-50/50 transition-colors"
                      data-search={searchData}
                    >
                      <td class="py-3.5 px-5">
                        <div class="flex items-center gap-2">
                          <a
                            href={shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="font-mono text-stone-900 hover:text-amber-700 font-semibold text-xs hover:underline"
                          >
                            /{item.shortKey}
                          </a>
                          <button
                            type="button"
                            onclick={`copyToClipboard('${shortUrl}', 'Short link copied')`}
                            class="text-stone-400 hover:text-stone-700 p-1 rounded transition"
                            title="Copy Short Link"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td class="py-3.5 px-5">
                        <div class="max-w-md truncate text-stone-600 font-mono text-[11px]" title={item.originalUrl}>
                          {item.originalUrl}
                        </div>
                      </td>
                      <td class="py-3.5 px-5">
                        {item.title ? (
                          <span class="inline-block px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80 text-[11px] font-medium max-w-[150px] truncate" title={item.title}>
                            {item.title}
                          </span>
                        ) : (
                          <span class="text-stone-300 font-mono text-[11px]">—</span>
                        )}
                      </td>
                      <td class="py-3.5 px-5 font-mono text-stone-500 text-[11px] whitespace-nowrap">
                        {createdDate}
                      </td>
                      <td class="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onclick={`openAnalyticsDrawer('${item.id}', '${item.shortKey}')`}
                          class="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 hover:text-stone-950 px-2.5 py-1.5 rounded-lg text-xs font-medium mr-2 transition shadow-2xs group"
                          title="View Analytics"
                          aria-label="View Analytics"
                        >
                          {/* Bar Chart Icon */}
                          <svg class="w-3.5 h-3.5 text-stone-500 group-hover:text-stone-800 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <span class="hidden sm:inline">Analytics</span>
                        </button>
                        <form
                          method="post"
                          action={`/dashboard/links/${item.id}/delete`}
                          class="inline"
                          onsubmit="return confirm('Delete this link?');"
                        >
                          <button
                            type="submit"
                            class="text-stone-400 hover:text-red-600 p-1 rounded transition"
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
    </div>
  );
};

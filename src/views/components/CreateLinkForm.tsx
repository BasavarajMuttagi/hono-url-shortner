import type { FC } from 'hono/jsx';

interface CreateLinkFormProps {
  error?: string;
}

export const CreateLinkForm: FC<CreateLinkFormProps> = ({ error }) => {
  return (
    <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 mb-8 shadow-sm">
      <div class="text-xs font-semibold text-zinc-300 mb-3 flex items-center justify-between">
        <span>Create Short Link</span>
        <span class="text-[11px] text-zinc-500 font-normal">Collision-free Base62 auto-generation</span>
      </div>

      {error ? (
        <div class="mb-3 text-xs text-red-400 bg-red-950/40 border border-red-800/50 p-2.5 rounded-lg">
          {error}
        </div>
      ) : null}

      <form id="createUrlForm" method="post" action="/dashboard/links" class="space-y-3">
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <input
              id="destinationUrl"
              name="original_url"
              type="url"
              required
              placeholder="https://your-long-destination-url.com/path/to/resource"
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition font-mono"
            />
          </div>
          <div class="sm:w-56">
            <input
              id="linkTitle"
              name="title"
              type="text"
              placeholder="Optional label (e.g. Docs)"
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            type="submit"
            id="submitLinkBtn"
            class="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 shrink-0"
          >
            <span>Shorten URL</span>
          </button>
        </div>
      </form>
    </div>
  );
};

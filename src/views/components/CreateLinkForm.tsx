import type { FC } from 'hono/jsx';

interface CreateLinkFormProps {
  error?: string;
}

export const CreateLinkForm: FC<CreateLinkFormProps> = ({ error }) => {
  return (
    <div class="mb-14 text-center">
      {/* Top Section Pill Tag (Town Style) */}
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-stone-200 bg-white text-stone-700 text-xs font-medium shadow-2xs mb-6">
        <svg class="w-3.5 h-3.5 text-stone-900" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a1 1 0 0 1 1 1v6.586l4.657-4.657a1 1 0 1 1 1.414 1.414L14.414 11H21a1 1 0 1 1 0 2h-6.586l4.657 4.657a1 1 0 0 1-1.414 1.414L13 14.414V21a1 1 0 1 1-2 0v-6.586l-4.657 4.657a1 1 0 0 1-1.414-1.414L9.586 13H3a1 1 0 1 1 0-2h6.586L4.929 6.343a1 1 0 0 1 1.414-1.414L11 9.586V3a1 1 0 0 1 1-1z" />
        </svg>
        <span>URL Engine</span>
      </div>

      {/* Large Editorial Serif Headline (Town Style) */}
      <h1 class="font-serif text-4xl sm:text-6xl text-stone-950 font-normal tracking-tight leading-[1.1] mb-4">
        Shortens how you work,<br class="hidden sm:inline" />
        then gets to work.
      </h1>

      {/* Town-style Accent Highlight Pill */}
      <p class="text-sm sm:text-base text-stone-600 mb-8 max-w-lg mx-auto font-sans leading-relaxed">
        The{' '}
        <span class="bg-[#FED7AA] text-stone-900 px-2 py-0.5 rounded font-medium">
          unusually helpful
        </span>{' '}
        link shortener and work assistant.
      </p>

      {/* Error Banner */}
      {error ? (
        <div class="max-w-xl mx-auto mb-4 text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-xl">
          {error}
        </div>
      ) : null}

      {/* Town-style Prompt Input Bar */}
      <div class="max-w-2xl mx-auto">
        <div class="text-xs text-stone-500 font-sans mb-2 text-center">
          Paste any link to shorten
        </div>

        <form
          id="createUrlForm"
          method="post"
          action="/dashboard/links"
          class="bg-white border border-stone-300 hover:border-stone-400 focus-within:border-stone-900 focus-within:ring-4 focus-within:ring-stone-950/5 rounded-2xl p-2 shadow-xs transition flex flex-col sm:flex-row items-center gap-2"
        >
          <div class="flex-1 w-full pl-3 pr-2 py-1">
            <input
              id="destinationUrl"
              name="original_url"
              type="url"
              required
              autocomplete="url"
              autocorrect="off"
              autocapitalize="none"
              spellcheck={false}
              placeholder="https://github.com/honojs/hono/tree/main..."
              class="w-full bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none font-mono"
            />
          </div>

          <div class="w-full sm:w-44 px-3 py-1 border-t sm:border-t-0 sm:border-l border-stone-200">
            <input
              id="linkTitle"
              name="title"
              type="text"
              placeholder="Label (optional)"
              class="w-full bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
          </div>

          {/* Prompt Bar Circular Action Button matching Town style */}
          <button
            type="submit"
            id="submitLinkBtn"
            class="w-full sm:w-10 h-10 rounded-xl sm:rounded-full border border-amber-600/70 bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 transition shadow-2xs group"
            title="Shorten URL"
            aria-label="Shorten URL"
          >
            {/* Elegant Arrow-up Icon */}
            <svg
              class="w-4 h-4 transform group-hover:-translate-y-0.5 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

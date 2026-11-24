import { jsxRenderer } from 'hono/jsx-renderer';
import { raw } from 'hono/html';

// Extend Hono's ContextRenderer interface for type-safe props in c.render()
declare module 'hono' {
  interface ContextRenderer {
    (content: any, props?: { title?: string }): Response;
  }
}

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en" class="h-full">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'Hono URL Engine'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
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
        {children}
      </body>
    </html>
  );
});

import { jsxRenderer } from 'hono/jsx-renderer';

// Extend Hono's ContextRenderer interface for type-safe props in c.render()
declare module 'hono' {
  interface ContextRenderer {
    (content: any, props?: { title?: string }): Response;
  }
}

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <title>{title ?? 'Hono URL Engine'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-indigo-500/20 selection:text-indigo-300 font-sans">
        {children}
      </body>
    </html>
  );
});

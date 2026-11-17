import type { FC, PropsWithChildren } from 'hono/jsx';

interface LayoutProps extends PropsWithChildren {
  title?: string;
}

export const Layout: FC<LayoutProps> = ({ title = 'Hono — Sub-3ms URL Infrastructure', children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Tailwind CSS CDN (removes all CSS bloat, zero handwritten CSS strings) */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-indigo-500/20 selection:text-indigo-300 font-sans">
        <div id="root">{children}</div>
        {/* Official Client Component powered by hono/jsx/dom and React-compatible hooks */}
        <script type="module" src="/static/app.js"></script>
      </body>
    </html>
  );
};

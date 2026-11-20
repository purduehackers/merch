import type { APIRoute } from 'astro';

export const prerender = false;

/** the pages worth finding in search; /preorder is a checkout step and is noindex */
const PAGES = ['/', '/archive'];

export const GET: APIRoute = ({ url }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((path) => `  <url><loc>${new URL(path, url.origin).href}</loc></url>`).join('\n')}
</urlset>
`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );

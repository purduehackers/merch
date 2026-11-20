import type { APIRoute } from 'astro';

export const prerender = false;

// The sitemap needs an absolute URL; taking it from the request keeps it right on any domain.
// /preorder stays crawlable so search engines can read its noindex tag.
export const GET: APIRoute = ({ url }) =>
  new Response(
    ['User-agent: *', 'Disallow: /api/', 'Disallow: /preorder-lab', 'Disallow: /preorder-items', '', `Sitemap: ${url.origin}/sitemap.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

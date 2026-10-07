import type { APIRoute } from "astro";

// Only public editorial routes; query strings and internal experiments are omitted.
export const GET: APIRoute = ({ site }) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/slack-backup/"].map(path => `<url><loc>${new URL(path, site!).href}</loc></url>`).join("\n")}
</urlset>`,
  { headers: { "Content-Type": "application/xml; charset=utf-8" } },
);

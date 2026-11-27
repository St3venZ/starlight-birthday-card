/**
 * Cloudflare Pages Function for `/c/:shortId`
 *
 * Dynamically injects per-card Open Graph, QQ/WeChat `itemprop`, and `<title>`
 * metadata from KV (`CARD_META`) so links forwarded into WeChat / QQ / iMessage
 * display the personalized recipient name, age, and square cover thumbnail.
 */

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
}

interface AssetsFetcher {
  fetch(request: Request | URL | string): Promise<Response>;
}

interface Env {
  CARD_META?: KVNamespaceLike;
  ASSETS: AssetsFetcher;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
}

interface CardMetaPreview {
  recipientHint?: string;
  ageHint?: number;
  config?: {
    recipientName?: string;
    age?: number;
    coverSubtitle?: string;
  };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceMetaContent(html: string, pattern: RegExp, replacement: string): string {
  return html.replace(pattern, replacement);
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const rawPath = context.params.path;
  const segments = Array.isArray(rawPath)
    ? rawPath.filter(Boolean)
    : typeof rawPath === 'string'
      ? rawPath.split('/').filter(Boolean)
      : [];
  const shortId = segments[0]?.trim() ?? '';

  // Serve SPA index.html from Pages static assets
  const assetRes = await context.env.ASSETS.fetch(new URL('/', url.origin));
  if (!assetRes.ok) {
    return assetRes;
  }

  let html = await assetRes.text();
  if (!shortId || !context.env.CARD_META) {
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  try {
    const rawMeta = await context.env.CARD_META.get(`card:${shortId}`);
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as CardMetaPreview;
      const recipient = (parsed.recipientHint || parsed.config?.recipientName || '').trim();
      const age = Math.max(1, Math.min(999, Math.round(parsed.ageHint || parsed.config?.age || 22)));
      const subtitle = (parsed.config?.coverSubtitle || '').trim();

      const title =
        recipient && recipient !== '你'
          ? `送给 ${recipient} 的 ${age} 岁 3D 生日贺卡`
          : `送你一份 ${age} 岁 3D 生日贺卡`;
      const desc =
        subtitle ||
        `点开纯白立体贺卡，翻阅专属 ${age} 岁星空照片墙、背面悄悄话与 3D 烟花。`;
      const canonicalUrl = `${url.origin}/c/${encodeURIComponent(shortId)}`;
      const ogImage = `${url.origin}/og-card.jpg`;

      const safeTitle = escapeAttr(title);
      const safeDesc = escapeAttr(desc);
      const safeUrl = escapeAttr(canonicalUrl);
      const safeImage = escapeAttr(ogImage);

      html = replaceMetaContent(html, /<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
      html = replaceMetaContent(
        html,
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="description" content="${safeDesc}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+itemprop="name"\s+content="[^"]*"\s*\/?>/i,
        `<meta itemprop="name" content="${safeTitle}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+itemprop="description"\s+content="[^"]*"\s*\/?>/i,
        `<meta itemprop="description" content="${safeDesc}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+itemprop="image"\s+content="[^"]*"\s*\/?>/i,
        `<meta itemprop="image" content="${safeImage}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:title" content="${safeTitle}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:description" content="${safeDesc}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:url" content="${safeUrl}" />`
      );
      html = replaceMetaContent(
        html,
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:image" content="${safeImage}" />`
      );
      html = replaceMetaContent(
        html,
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
        `<link rel="canonical" href="${safeUrl}" />`
      );
    }
  } catch {
    // Fallback cleanly to default index.html if KV lookup fails
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

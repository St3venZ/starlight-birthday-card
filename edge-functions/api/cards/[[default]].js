/**
 * Tencent EdgeOne Pages Edge Function — Same-Origin Proxy for /api/cards/*
 *
 * Allows Mainland China visitors to access the entire 3D birthday card, Creator Studio,
 * short links, and compressed photo assets directly via EdgeOne's China-direct domain
 * with ZERO VPN and ZERO browser CORS errors.
 *
 * Environment variable (optional, configured in EdgeOne Pages Console):
 *   UPSTREAM_API_ORIGIN = "https://starlight-birthday-card.pages.dev"
 */

const DEFAULT_UPSTREAM_ORIGIN = 'https://starlight-birthday-card.pages.dev';

const FORWARD_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'x-card-passcode',
  'x-edit-token',
];

const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'x-robots-tag',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Card-Passcode, X-Edit-Token',
  'Access-Control-Max-Age': '86400',
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const rawOrigin =
    (env && typeof env.UPSTREAM_API_ORIGIN === 'string' && env.UPSTREAM_API_ORIGIN.trim()) ||
    DEFAULT_UPSTREAM_ORIGIN;
  const upstreamOrigin = rawOrigin.replace(/\/+$/, '');

  const incomingUrl = new URL(request.url);
  const targetUrl = `${upstreamOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const upstreamHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const val = request.headers.get(name);
    if (val !== null) {
      upstreamHeaders.set(name, val);
    }
  }
  // Tell upstream to build shareUrl using this EdgeOne domain instead of *.pages.dev
  upstreamHeaders.set('X-Forwarded-Origin', incomingUrl.origin);

  try {
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(CORS_HEADERS);
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const val = upstreamResponse.headers.get(name);
      if (val !== null) {
        responseHeaders.set(name, val);
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: '云端贺卡服务暂时连接超时，请稍后再试。',
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      }
    );
  }
}

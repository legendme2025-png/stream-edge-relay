export const config = {
  runtime: 'edge',
  regions: ['iad1'], // 100% United States Edge Node
};

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Edge Relay Active. Usage: ?url=https://doodstream.com/e/...', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const origin = `${parsedTarget.protocol}//${parsedTarget.host}`;

    // Prepare forward headers (simulating a clean US Chrome browser)
    const forwardHeaders = new Headers();
    forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    forwardHeaders.set('Accept', req.headers.get('accept') || '*/*');
    forwardHeaders.set('Accept-Language', 'en-US,en;q=0.9');
    forwardHeaders.set('Referer', origin + '/');
    forwardHeaders.set('Origin', origin);

    // Forward range headers so video seeking works
    if (req.headers.has('range')) {
      forwardHeaders.set('range', req.headers.get('range'));
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || '';
    const respHeaders = new Headers();

    // Pass through essential streaming headers
    for (const [k, v] of upstream.headers.entries()) {
      if (!['content-security-policy', 'x-frame-options', 'access-control-allow-origin'].includes(k.toLowerCase())) {
        respHeaders.set(k, v);
      }
    }

    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    // If HTML: Inject <base> tag so internal links, players, and tokens load properly
    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      const baseTag = `<base href="${origin}/"><script>window.__IS_EDGE_PROXY__=true;</script>`;
      
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else {
        html = baseTag + html;
      }
      return new Response(html, { status: upstream.status, headers: respHeaders });
    }

    // Binary Video Streams: Stream directly to player with zero buffering
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });

  } catch (err) {
    return new Response('Edge Relay Error: ' + err.message, { status: 502 });
  }
}

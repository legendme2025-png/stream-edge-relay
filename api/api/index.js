export const config = {
  runtime: 'edge',
  regions: ['iad1'], // 100% Washington D.C., USA
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

  // If visiting the root link without ?url=, show an instant web player interface
  if (!targetUrl) {
    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>⚡ US Edge Relay (Washington D.C.)</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: system-ui, sans-serif; background: #0b0f19; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 85vh; margin: 0; padding: 20px; }
        .card { background: #151a28; border: 1px solid #00e5ff44; padding: 30px; border-radius: 12px; width: 100%; max-width: 540px; box-shadow: 0 10px 30px #000; text-align: center; }
        h2 { color: #00e5ff; margin-top: 0; }
        p { color: #94a3b8; font-size: 14px; }
        input { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #334155; background: #0b0f19; color: #fff; font-size: 14px; box-sizing: border-box; margin-bottom: 12px; }
        button { width: 100%; background: #00e5ff; color: #000; font-weight: bold; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-size: 15px; }
        button:hover { background: #00b8cc; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚡ US Edge Relay Active</h2>
        <p>Connected to <b>Washington D.C. (iad1)</b>. Enter your Doodstream or blocked video link:</p>
        <form action="/" method="GET">
          <input type="text" name="url" placeholder="https://doodstream.com/e/..." required>
          <button type="submit">▶ Unblock & Stream Video</button>
        </form>
      </div>
    </body>
    </html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const origin = `${parsedTarget.protocol}//${parsedTarget.host}`;

    const forwardHeaders = new Headers();
    forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    forwardHeaders.set('Accept', '*/*');
    forwardHeaders.set('Accept-Language', 'en-US,en;q=0.9');
    forwardHeaders.set('Referer', origin + '/');
    forwardHeaders.set('Origin', origin);

    // Forward range headers so video seeking works smoothly
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

    for (const [k, v] of upstream.headers.entries()) {
      if (!['content-security-policy', 'x-frame-options', 'access-control-allow-origin'].includes(k.toLowerCase())) {
        respHeaders.set(k, v);
      }
    }

    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    // If HTML: Inject <base> so all internal scripts, tokens, and players load correctly
    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      const baseTag = `<base href="${origin}/">`;
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

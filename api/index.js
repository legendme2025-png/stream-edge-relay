export const config = {
  runtime: 'edge',
  regions: ['iad1'], // 100% Washington D.C., USA
};

// Helper: Generates random token string required by streaming CDNs
function makeId(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 1. SMART RESOLVER FOR DOODSTREAM (Bypasses Client-Side CORS & Token Loop)
async function resolveDoodstream(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;

    // Step A: Fetch embed HTML from Washington D.C.
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': origin + '/',
      },
    });
    const html = await res.text();

    // Step B: Extract pass_md5 token path
    const passMatch = html.match(/\/pass_md5\/([a-zA-Z0-9\-_]+)/);
    if (!passMatch) return null;

    const passToken = passMatch[1];
    const passUrl = `${origin}/pass_md5/${passToken}`;

    // Step C: Fetch the CDN base URL from Washington D.C. (Zero CORS)
    const passRes = await fetch(passUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': targetUrl,
      },
    });
    const baseVideoUrl = (await passRes.text()).trim();
    if (!baseVideoUrl.startsWith('http')) return null;

    // Step D: Build final direct MP4 streaming link
    const finalMp4 = `${baseVideoUrl}${makeId(10)}?token=${passToken}&expiry=${Date.now()}`;
    return { finalMp4, origin };
  } catch (err) {
    return null;
  }
}

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
  const customRef = url.searchParams.get('ref');

  // Homepage: If no ?url= provided
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
        <h2>⚡ US Edge Cinema Relay Active</h2>
        <p>Connected to <b>Washington D.C. (iad1)</b>. Enter your video link:</p>
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

  // 2. CHECK IF THIS IS A DOODSTREAM LINK (Auto-activate Smart Resolver)
  const isDood = /dood|ds2play|doodstream|doodcdn/i.test(targetUrl);
  if (isDood && (targetUrl.includes('/e/') || targetUrl.includes('/d/'))) {
    const resolved = await resolveDoodstream(targetUrl);
    if (resolved) {
      // Serve clean, ad-free Cinema Player that never loops
      const cinemaPlayerHtml = `<!DOCTYPE html>
      <html>
      <head>
        <title>🎬 Cinema Player</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin:0; background:#000; display:flex; align-items:center; justify-content:center; height:100vh; overflow:hidden; }
          video { width:100%; height:100%; max-height:100vh; outline:none; }
        </style>
      </head>
      <body>
        <video controls autoplay playsinline preload="auto">
          <source src="/?url=${encodeURIComponent(resolved.finalMp4)}&ref=${encodeURIComponent(resolved.origin)}" type="video/mp4">
        </video>
      </body>
      </html>`;

      return new Response(cinemaPlayerHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // 3. GENERAL PROXY FOR DIRECT MP4 / VIDEO STREAMS & OTHER WEBSITES
  try {
    const parsedTarget = new URL(targetUrl);
    const origin = customRef || `${parsedTarget.protocol}//${parsedTarget.host}`;

    const forwardHeaders = new Headers();
    forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    forwardHeaders.set('Accept', '*/*');
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

    for (const [k, v] of upstream.headers.entries()) {
      if (!['content-security-policy', 'x-frame-options', 'access-control-allow-origin'].includes(k.toLowerCase())) {
        respHeaders.set(k, v);
      }
    }

    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    // For general websites
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

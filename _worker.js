const CLOUD_NAME  = 'dpr7dmhgo';
const CONFIG_KEYS = ['strength','softness','extraBlur','tinting','contrast','brightness','invert','edgeSpecularity'];

// --- GitHub helpers ---
function ghHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'glas-worker/1.0',
    };
}

async function ghGet(repo, file, token) {
    return fetch(`https://api.github.com/repos/${repo}/contents/${file}`, {
        headers: ghHeaders(token),
    });
}

async function ghPut(repo, file, token, content, sha, message) {
    const body = { message, content };
    if (sha) body.sha = sha;
    return fetch(`https://api.github.com/repos/${repo}/contents/${file}`, {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify(body),
    });
}

function enc(str) { return btoa(unescape(encodeURIComponent(str))); }
function dec(str) { return atob(str.replace(/\n/g, '')); }

// --- Route handlers ---
async function updateManifest(request, env) {
    let url, type;
    try {
        ({ url, type } = await request.json());
        if (!url || !type) throw new Error('Missing url or type');
    } catch (e) { return new Response('Bad request: ' + e.message, { status: 400 }); }

    const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = env;
    if (!token || !repo) return new Response('Missing env vars', { status: 500 });

    let sha = null, manifest = [];
    const res = await ghGet(repo, 'manifest.json', token);
    if (res.ok) {
        const data = await res.json();
        sha = data.sha;
        manifest = JSON.parse(dec(data.content));
    } else if (res.status !== 404) {
        return new Response('GitHub error: ' + await res.text(), { status: 500 });
    }

    manifest.push({ url, type });
    const put = await ghPut(repo, 'manifest.json', token, enc(JSON.stringify(manifest, null, 2) + '\n'), sha, `Add ${type}: ${url.split('/').pop()}`);
    if (!put.ok) return new Response('GitHub commit error: ' + await put.text(), { status: 500 });

    return new Response(JSON.stringify({ ok: true, url, type }), { headers: { 'Content-Type': 'application/json' } });
}

async function deleteMedia(request, env) {
    let url;
    try {
        ({ url } = await request.json());
        if (!url) throw new Error('Missing url');
    } catch (e) { return new Response('Bad request: ' + e.message, { status: 400 }); }

    const { GITHUB_TOKEN: token, GITHUB_REPO: repo, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
    if (!token || !repo) return new Response('Missing env vars', { status: 500 });

    const res = await ghGet(repo, 'manifest.json', token);
    if (!res.ok) return new Response('GitHub error: ' + await res.text(), { status: 500 });
    const data = await res.json();
    const updated = JSON.parse(dec(data.content)).filter(item => item.url !== url);
    const put = await ghPut(repo, 'manifest.json', token, enc(JSON.stringify(updated, null, 2) + '\n'), data.sha, `Remove media: ${url.split('/').pop()}`);
    if (!put.ok) return new Response('GitHub commit error: ' + await put.text(), { status: 500 });

    if (apiKey && apiSecret) {
        try {
            const match = url.match(/\/(?:image|video)\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
            if (match) {
                const publicId = match[1];
                const resType  = url.includes('/video/') ? 'video' : 'image';
                const timestamp = Math.floor(Date.now() / 1000);
                const sigStr    = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
                const hashBuf   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sigStr));
                const signature = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
                await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resType}/destroy`, {
                    method: 'POST',
                    body: new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature }),
                });
            }
        } catch (e) { /* non-fatal */ }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function saveConfig(request, env) {
    let cfg;
    try {
        cfg = await request.json();
        for (const k of CONFIG_KEYS) {
            if (typeof cfg[k] !== 'number') throw new Error(`Invalid key: ${k}`);
        }
    } catch (e) { return new Response('Bad request: ' + e.message, { status: 400 }); }

    const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = env;
    if (!token || !repo) return new Response('Missing env vars', { status: 500 });

    let sha = null;
    const res = await ghGet(repo, 'config.json', token);
    if (res.ok) sha = (await res.json()).sha;

    const put = await ghPut(repo, 'config.json', token, enc(JSON.stringify(cfg, null, 2) + '\n'), sha, 'Update glass config');
    if (!put.ok) return new Response('GitHub error: ' + await put.text(), { status: 500 });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

// --- Main Worker ---
export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);

        if (request.method === 'POST') {
            if (pathname === '/functions/update-manifest') return updateManifest(request, env);
            if (pathname === '/functions/delete-media')    return deleteMedia(request, env);
            if (pathname === '/functions/save-config')     return saveConfig(request, env);
        }

        // Serve static assets (HTML, JSON, images, etc.)
        return env.ASSETS.fetch(request);
    },
};

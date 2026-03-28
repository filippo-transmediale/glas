export async function onRequestPost(context) {
    let url;
    try {
        ({ url } = await context.request.json());
        if (!url) throw new Error('Missing url');
    } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400 });
    }

    const token     = context.env.GITHUB_TOKEN;
    const repo      = context.env.GITHUB_REPO;
    const apiKey    = context.env.CLOUDINARY_API_KEY;
    const apiSecret = context.env.CLOUDINARY_API_SECRET;
    const cloudName = 'dpr7dmhgo';

    if (!token || !repo) {
        return new Response('Missing GitHub env vars', { status: 500 });
    }

    const apiBase = `https://api.github.com/repos/${repo}/contents/manifest.json`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    // Fetch current manifest
    let sha, manifest;
    try {
        const res = await fetch(apiBase, { headers });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        sha = data.sha;
        manifest = JSON.parse(atob(data.content.replace(/\n/g, '')));
    } catch (e) {
        return new Response('Error reading manifest: ' + e.message, { status: 500 });
    }

    const updated = manifest.filter(item => item.url !== url);
    const jsonStr  = JSON.stringify(updated, null, 2) + '\n';
    const encoded  = btoa(unescape(encodeURIComponent(jsonStr)));

    try {
        const res = await fetch(apiBase, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: `Remove media: ${url.split('/').pop()}`,
                content: encoded,
                sha,
            }),
        });
        if (!res.ok) throw new Error(await res.text());
    } catch (e) {
        return new Response('Error updating manifest: ' + e.message, { status: 500 });
    }

    // Delete from Cloudinary using Web Crypto API
    if (apiKey && apiSecret) {
        try {
            const match = url.match(/\/(?:image|video)\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
            if (match) {
                const publicId  = match[1];
                const resType   = url.includes('/video/') ? 'video' : 'image';
                const timestamp = Math.floor(Date.now() / 1000);
                const sigStr    = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

                // SHA-256 via Web Crypto API
                const encoder   = new TextEncoder();
                const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(sigStr));
                const signature  = Array.from(new Uint8Array(hashBuffer))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resType}/destroy`, {
                    method: 'POST',
                    body: new URLSearchParams({
                        public_id: publicId,
                        timestamp: timestamp.toString(),
                        api_key: apiKey,
                        signature,
                    }),
                });
            }
        } catch (e) {
            // Non-fatal
            console.error('Cloudinary delete error:', e.message);
        }
    }

    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

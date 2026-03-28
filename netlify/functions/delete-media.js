const crypto = require('crypto');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    let url;
    try {
        ({ url } = JSON.parse(event.body));
        if (!url) throw new Error('Missing url');
    } catch (e) {
        return { statusCode: 400, body: 'Bad request: ' + e.message };
    }

    const token     = process.env.GITHUB_TOKEN;
    const repo      = process.env.GITHUB_REPO;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const cloudName = 'dpr7dmhgo';

    if (!token || !repo) {
        return { statusCode: 500, body: 'Missing GitHub env vars' };
    }

    // 1. Remove from manifest.json via GitHub API
    const apiBase = `https://api.github.com/repos/${repo}/contents/manifest.json`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    let sha, manifest;
    try {
        const res = await fetch(apiBase, { headers });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        sha = data.sha;
        manifest = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    } catch (e) {
        return { statusCode: 500, body: 'Error reading manifest: ' + e.message };
    }

    const updated = manifest.filter(item => item.url !== url);

    try {
        const res = await fetch(apiBase, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: `Remove media: ${url.split('/').pop()}`,
                content: Buffer.from(JSON.stringify(updated, null, 2) + '\n').toString('base64'),
                sha,
            }),
        });
        if (!res.ok) throw new Error(await res.text());
    } catch (e) {
        return { statusCode: 500, body: 'Error updating manifest: ' + e.message };
    }

    // 2. Delete from Cloudinary (if credentials are available)
    if (apiKey && apiSecret) {
        try {
            // Extract public_id from Cloudinary URL
            // URL format: https://res.cloudinary.com/{cloud}/{type}/upload/v{ver}/{public_id}.{ext}
            const match = url.match(/\/(?:image|video)\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
            if (match) {
                const publicId  = match[1];
                const resType   = url.includes('/video/') ? 'video' : 'image';
                const timestamp = Math.floor(Date.now() / 1000);
                const sigStr    = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
                const signature = crypto.createHash('sha256').update(sigStr).digest('hex');

                const form = new URLSearchParams({
                    public_id: publicId,
                    timestamp: timestamp.toString(),
                    api_key: apiKey,
                    signature,
                });

                await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resType}/destroy`, {
                    method: 'POST',
                    body: form,
                });
            }
        } catch (e) {
            // Non-fatal: manifest is already updated
            console.error('Cloudinary delete error:', e.message);
        }
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
    };
};

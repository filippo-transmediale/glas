const EXPECTED_KEYS = ['strength', 'softness', 'extraBlur', 'tinting', 'contrast', 'brightness', 'invert', 'edgeSpecularity'];

export async function onRequestPost(context) {
    let cfg;
    try {
        cfg = await context.request.json();
        for (const key of EXPECTED_KEYS) {
            if (cfg[key] === undefined || typeof cfg[key] !== 'number') {
                throw new Error(`Invalid or missing key: ${key}`);
            }
        }
    } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400 });
    }

    const token = context.env.GITHUB_TOKEN;
    const repo  = context.env.GITHUB_REPO;

    if (!token || !repo) {
        return new Response('Missing GITHUB_TOKEN or GITHUB_REPO env vars', { status: 500 });
    }

    const apiBase = `https://api.github.com/repos/${repo}/contents/config.json`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    // Get current SHA (needed for update)
    let sha = null;
    try {
        const res = await fetch(apiBase, { headers });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }
    } catch (e) { /* file may not exist yet */ }

    const jsonStr = JSON.stringify(cfg, null, 2) + '\n';
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    const body = { message: 'Update glass config', content: encoded };
    if (sha) body.sha = sha;

    try {
        const res = await fetch(apiBase, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            return new Response('GitHub commit error: ' + await res.text(), { status: 500 });
        }
    } catch (e) {
        return new Response('Error saving config: ' + e.message, { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

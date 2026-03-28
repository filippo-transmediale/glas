export async function onRequestPost(context) {
    let url, type;
    try {
        ({ url, type } = await context.request.json());
        if (!url || !type) throw new Error('Missing url or type');
    } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400 });
    }

    const token = context.env.GITHUB_TOKEN;
    const repo  = context.env.GITHUB_REPO;

    if (!token || !repo) {
        return new Response('Missing GITHUB_TOKEN or GITHUB_REPO env vars', { status: 500 });
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
        if (res.status === 404) {
            sha = null;
            manifest = [];
        } else if (!res.ok) {
            return new Response('GitHub fetch error: ' + await res.text(), { status: 500 });
        } else {
            const data = await res.json();
            sha = data.sha;
            manifest = JSON.parse(atob(data.content.replace(/\n/g, '')));
        }
    } catch (e) {
        return new Response('Error reading manifest: ' + e.message, { status: 500 });
    }

    // Append new entry
    manifest.push({ url, type });

    const jsonStr = JSON.stringify(manifest, null, 2) + '\n';
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    const body = {
        message: `Add ${type}: ${url.split('/').pop()}`,
        content: encoded,
    };
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
        return new Response('Error committing manifest: ' + e.message, { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, url, type }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

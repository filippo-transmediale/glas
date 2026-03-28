exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    let url, type;
    try {
        ({ url, type } = JSON.parse(event.body));
        if (!url || !type) throw new Error('Missing url or type');
    } catch (e) {
        return { statusCode: 400, body: 'Bad request: ' + e.message };
    }

    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPO; // e.g. "filippo-transmediale/glas"

    if (!token || !repo) {
        return { statusCode: 500, body: 'Missing GITHUB_TOKEN or GITHUB_REPO env vars' };
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
            const err = await res.text();
            return { statusCode: 500, body: 'GitHub fetch error: ' + err };
        } else {
            const data = await res.json();
            sha = data.sha;
            manifest = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
        }
    } catch (e) {
        return { statusCode: 500, body: 'Error reading manifest: ' + e.message };
    }

    // Append new entry
    manifest.push({ url, type });

    // Commit updated manifest
    const body = {
        message: `Add ${type}: ${url.split('/').pop()}`,
        content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n').toString('base64'),
    };
    if (sha) body.sha = sha;

    try {
        const res = await fetch(apiBase, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            return { statusCode: 500, body: 'GitHub commit error: ' + err };
        }
    } catch (e) {
        return { statusCode: 500, body: 'Error committing manifest: ' + e.message };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, url, type }),
    };
};

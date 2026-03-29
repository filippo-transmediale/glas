# GLAS — Manual

## What this is

**glas.works** — a full-screen media loop with a liquid glass text effect.
Every page load picks a random image or video from a list and shows it behind the word GLAS.

---

## Architecture — the moving parts

| What | Where | Purpose |
|------|-------|---------|
| Code | GitHub — `filippo-transmediale/glas` | Source of truth for all files |
| Hosting | Cloudflare Worker (`glas`) | Serves the website + handles API calls |
| Media files | Cloudinary (`dpr7dmhgo`) | Stores and delivers images/videos |
| Media list | `manifest.json` in GitHub repo | List of Cloudinary URLs shown on the site |
| Glass config | `config.json` in GitHub repo | Saved slider values for the glass effect |
| Domain | `glas.works` — registered at Gandi, DNS at Cloudflare | Points to the Worker |

### How it flows
1. Visitor opens `glas.works` → Cloudflare Worker serves `index.html`
2. `index.html` fetches `manifest.json` → picks a random item → loads it as background
3. `index.html` fetches `config.json` → applies glass effect parameters

---

## Services & credentials

### Cloudflare
- **URL**: cloudflare.com → Workers & Pages → `glas`
- **What lives here**: the deployed Worker, env vars, custom domain
- **Env vars** (set under Settings → Variables and Secrets):
  - `GITHUB_TOKEN` — Secret
  - `GITHUB_REPO` — Text: `filippo-transmediale/glas`
  - `CLOUDINARY_API_KEY` — Secret
  - `CLOUDINARY_API_SECRET` — Secret

### GitHub
- **Repo**: github.com/filippo-transmediale/glas
- **Token**: Personal access token with `repo` scope (stored as Cloudflare secret)
- ⚠️ If the token is ever exposed (e.g. visible in a screenshot), regenerate it immediately at:
  github.com → Settings → Developer settings → Personal access tokens

### Cloudinary
- **Cloud name**: `dpr7dmhgo`
- **Upload preset**: `glas_upload` (unsigned, for the upload widget)
- **API key + secret**: stored as Cloudflare secrets (used for delete)

### Gandi
- Domain `glas.works` is registered here
- DNS is managed by Cloudflare (nameservers point to Cloudflare)
- You still pay for the domain renewal at Gandi

---

## Day-to-day use

### Upload or remove media
1. Go to `glas.works/furnace.html`
2. Password: `glas2025`
   (session lasts 15 minutes — no need to re-enter during that time)
3. Click **+ Upload image or video** to add media
4. Hover over a thumbnail and click **Remove** to delete it

Uploads go to Cloudinary. The manifest.json in GitHub is updated automatically.

### Adjust the glass effect
1. Go to `glas.works/furnace.html` and log in
2. Scroll down to **Glass settings**
3. Move the sliders — preview by opening `glas.works` in another tab and refreshing
4. Click **Save glass settings** — this writes `config.json` to GitHub
5. Refresh `glas.works` to see the result

| Slider | What it does |
|--------|-------------|
| Strength | How much the glass distorts the image behind it |
| Softness | Blur of the distortion edges |
| Extra blur | Additional overall blur |
| Tinting | White fill opacity of the letters |
| Contrast | Contrast of the glass area |
| Brightness | Brightness of the glass area |
| Invert | Inverts colours inside the letters |
| Edge specularity | Brightness of the iridescent outline around the letters |

---

## Making code changes

### Changing HTML/CSS/JS (index.html, furnace.html, etc.)
Edit the file, then:
```bash
cd ~/glas
git add <filename>
git commit -m "description of change"
git push origin main
```
Cloudflare picks up static file changes automatically. No deploy needed.

### Changing the Worker (_worker.js)
Edit the file, commit and push as above, then also run:
```bash
cd ~/glas
npx wrangler deploy
```
This is the extra step — Worker code doesn't auto-deploy from GitHub, you have to push it manually with wrangler.

---

## File map

```
glas/
├── index.html          — public site (glass effect, random background)
├── furnace.html        — admin page (upload, delete, glass controls)
├── manifest.json       — list of media URLs (auto-updated by furnace)
├── config.json         — glass effect parameters (auto-updated by furnace)
├── _worker.js          — Cloudflare Worker: handles API routes + serves static files
├── wrangler.toml       — Worker configuration (name, routes, vars)
└── .assetsignore       — tells Cloudflare not to serve _worker.js publicly
```

---

## Troubleshooting

**Site shows "Hello world"**
The Worker script hasn't been deployed. Run `npx wrangler deploy` from `~/glas`.

**furnace.html shows a blank white page**
Same as above — Worker not deployed.

**Upload works but image doesn't appear on the site**
Check that the manifest update succeeded (green status message in furnace). If not, the GitHub token may have expired — regenerate it and update the Cloudflare secret.

**Delete gives a GitHub error**
Same — likely an expired GitHub token.

**glas.works stops working entirely**
Check Cloudflare dashboard — the Worker may have been accidentally deleted or the domain unlinked. The domain should point to the `glas` Worker under Workers & Pages → `glas` → Settings → Triggers.

**Changes to index.html not showing up**
Hard refresh the browser (Cmd+Shift+R) — Cloudflare caches aggressively.

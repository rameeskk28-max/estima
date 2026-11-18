# Deploying to Netlify

The site is a static Vite build; settings are in `netlify.toml` (build `npm run build`, publish `dist`, Node 22).
There is no login – anyone with the link can open the site.

## First time
1. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick `estima`.
2. Branch to deploy: `main`. Leave the other settings empty (read from `netlify.toml`). Click **Deploy**.
3. Optional: **Site configuration → Change site name** (e.g. `greenland-pumps`).

## Updates
Every push to `main` redeploys automatically (watch **Deploys** in Netlify).

## Already deployed with the old login version?
Environment variables `AUTH_SECRET` and `APP_USERS` are no longer used – you can delete them in
**Site configuration → Environment variables**.

## Notes
- Data (projects, calculator inputs, schedule, uploaded PDFs) is stored in each user's own browser.
- Drag-and-drop deploy (Netlify Drop) of the `dist` folder also works now.

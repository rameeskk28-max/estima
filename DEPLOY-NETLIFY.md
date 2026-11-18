# Deploying Greenland Pump Suite to Netlify (with login)

The sign-in protection is a **Netlify Edge Function** (`netlify/edge-functions/auth.js`).
Netlify only runs it when the site is deployed **from GitHub** (or the Netlify CLI).
**Do not use drag-and-drop (Netlify Drop)**: it ignores the edge function, so the site
would be public and the login page would not work.

---

## Part A: Put the project on GitHub (once, about 5 minutes)

1. Create a free account at https://github.com and sign in.
2. Click **+ → New repository**. Name it `greenland-pump-suite`, choose **Private**, and click **Create repository**.
3. On the empty repository page, click **"uploading an existing file"**.
4. Unzip `greenland-pump-suite-source.zip` on your computer. Open the `mep-pump-submittal` folder,
   select **everything inside it** (`src`, `public`, `netlify`, `scripts`, `tools`, `index.html`,
   `package.json`, `package-lock.json`, `netlify.toml`, `vite.config.js`, `README.md` …) and drag it into the GitHub page.
5. Click **Commit changes**.

## Part B: Create the Netlify site (once)

1. Go to https://app.netlify.com → **Add new site → Import an existing project → GitHub**.
2. Authorise Netlify, then pick `greenland-pump-suite`.
3. Leave the settings as they are (they come from `netlify.toml`: build `npm run build`, publish `dist`).
   Click **Deploy**.
4. Optional: **Site configuration → Change site name**, e.g. `greenland-pumps`, which gives `https://greenland-pumps.netlify.app`.

## Part C: Create the user accounts

1. On your computer, double-click `tools/user-manager.html` (it opens in your browser and works offline).
2. **Step 1:** click **Generate** and copy the secret.
3. In Netlify: **Site configuration → Environment variables → Add a variable**
   - Key `AUTH_SECRET`, value = the copied secret → **Create variable**.
4. Back in the tool, **Step 3:** add each user (username, full name, password).
5. **Step 4:** click **Copy APP_USERS**. In Netlify add a variable with key `APP_USERS` and paste the value.
6. Netlify: **Deploys → Trigger deploy → Deploy site** so the new settings take effect.

Open your site. You will see the Greenland sign-in page. Log in with one of the users you created.

## Day-to-day

| Task | How |
|---|---|
| Add a user / reset a password | Open `tools/user-manager.html` → paste the current `APP_USERS` from Netlify in Step 2 → **Load** → add the user (adding an existing username replaces its password) → copy the new value into Netlify → **Trigger deploy** |
| Remove a user | Same as above, click **Remove** next to the user. They lose access on their next request. |
| Sign everybody out | Generate a new `AUTH_SECRET`, save it in Netlify, then **Trigger deploy** |
| Update the app | Upload the changed files to GitHub (**Add file → Upload files**). Netlify redeploys automatically. |

## How the protection works
- Every request (pages, JavaScript, images) goes through the edge function first. Without a valid session
  the visitor is sent to `/login/`, so none of the app is downloadable before signing in.
- Passwords are stored only as PBKDF2-SHA256 salted hashes. The session is an HttpOnly, Secure, signed
  cookie that lasts 12 hours, or 30 days with "Keep me signed in".
- If `AUTH_SECRET` or `APP_USERS` is missing, nobody can sign in. The site stays locked rather than opening up.
- Wrong passwords get a deliberate delay. For heavy brute-force protection, add Netlify's rate-limiting
  rules (paid plans) or use long passwords.

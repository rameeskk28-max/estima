# Greenland Pump Engineering Suite

Greenland Equipment & Machinery Est. L.L.C – MEP & HVAC pump calculators + technical submittal PDF builder.

React 19 · Vite 8 · Tailwind CSS 4 · Lucide React · pdf-lib. Runs 100% in the browser; no server, no data leaves the machine.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/ (static – host anywhere)
npm test           # engine self-test (calcs + PDF compile) → selftest-output/
```

## Module 1 – Hydraulic calculators (`src/lib/calcs/*`)
| Calculator | Method |
|---|---|
| Booster set | TDH = (static + residual + Hazen-Williams hf + ΣK·v²/2g + equipment − suction) × (1+SF); motor = ρgQH/η × margin → next IEC frame |
| Transfer | Q = V/t; static = roof inlet − lower-tank LWL; suction + discharge losses; NPSHa = Ha(altitude) + hs − hfs − Hvp(T, Antoine) |
| Sump / drainage | Qin = drainage + seepage + C·i·A/3600, × SF; static = discharge − stop level; Veff = Tmin·Qp/4; float/level schedule |
| Pressure vessel | Vt = Va·(Pmax+1)/(Pmax−Pmin); Ppre = Pmin − 0.2 bar; standard 24/60/100/200/300/500 L |
| Chilled water | Q = kW/(4.186·ΔT) (TR × 3.517); closed-loop head = chiller + coil + valve + other + pipe + fittings |

Inputs use live unit conversion (L/s ⇄ m³/h ⇄ L/min, m ⇄ bar ⇄ kPa, m³ ⇄ L, kW ⇄ TR). Pipe data: PPR SDR6, HDPE SDR11, GI/MS Sch 40, SS Sch 10S with C-factors 150/150/120/120/140; internal Ø can be overridden.

Each calculator: **Generate A4 Calculation Sheet** (HTML A4 preview → Print, or Download PDF) and **Save to Pump Schedule** (re-saving the same tag updates it).

## Module 2 – Submittal builder (`src/lib/pdf/compile.js`)
- Project header (+ optional logo), editable/reorderable 14-point UAE index (rename, include/exclude, add/delete, type & equipment category).
- PDF upload slots per section (multi-file, drag & drop, reorder). Files persist in IndexedDB; everything else in localStorage.
- Compile builds: cover page (review stamp + action codes) → TOC with page numbers incl. sub-items → divider per section → pump/vessel schedule (A4 landscape) → calculation sheets auto-inserted into the technical section matching each duty's category → merged uploads.
- Every uploaded page is scaled onto an A4 sheet (landscape sources → A4 landscape; /Rotate respected; CropBox used), with a footer stamped on every page: project, ref/rev, section, "Page X of Y".
- Unreadable PDFs get a placeholder page and a warning; password-protected PDFs are flagged.

Note: the standard PDF fonts are WinAnsi, so Greek symbols in PDFs are written out (Σ → "Sum", η → "eta"); the HTML preview shows the real symbols.

## Branding
All supplier branding lives in `src/brand.js` and `src/assets/greenland-logo.png` (navy `#153963`, green `#06AF4B`). The logo appears in the sidebar, on the cover page, on section dividers and in the header of every calculation sheet. A different logo can be uploaded per submittal from the Project Header.

## Login / user accounts
Server-side sign-in via a Netlify Edge Function (`netlify/edge-functions/auth.js`): branded login page at `/login/`,
PBKDF2-hashed passwords in the `APP_USERS` env var, HMAC-signed HttpOnly session cookie (`AUTH_SECRET`),
signed-in user badge + Sign out in the app. Create users with `tools/user-manager.html` (opens in any browser, offline)
or `npm run add-user`; `npm run gen-secret` makes a secret.

- `npm run test:auth`: 16 security tests (redirects, wrong password, forged/expired cookies, removed users, fail-closed config)
- `npm run build && AUTH_SECRET=... APP_USERS='[...]' npm run preview:auth`: local preview with login at http://localhost:8888
- `npm run dev`: plain Vite dev server (no login layer)

## Deploy to Netlify
See **DEPLOY-NETLIFY.md**. Deploy from GitHub (or `npx netlify-cli deploy --prod`). Netlify Drop (drag-and-drop) does
not run Edge Functions, so it must not be used once login is required.

# Greenland Pump Engineering Suite – project guide for Claude

Read this first in every new session. It describes what the site is, how it is built, where things
live and the rules the owner (Ramees, Greenland Equipment & Machinery Est. L.L.C) has set.

## What it is
An open (no site login) web app for Greenland's pump sales/engineering team (Franklin Electric pumps, UAE):
MEP/HVAC pump calculators, pump schedules, technical literature, consultant comment replies,
engineering tools, and an automatic **quotation → technical submittal PDF** builder with a
technical compliance statement and a cloud document library.

- Live site: https://glestima.netlify.app (Netlify auto-deploys every push to `main`)
- Repo: GitHub `rameeskk28-max/estima`, branch `main`
- Supabase project: `glestima` (ref `ryphntbfbuxmugqzkmlg`, region ap-southeast-1)

## Stack
React 19 + Vite 8, Tailwind CSS v4 (`src/index.css`: `@theme`, `@utility`, CSS-variable theming,
`.theme-light`; dark is default), lucide-react icons, pdf-lib (all PDF output), pdfjs-dist 4.10.38
(reading PDFs), tesseract.js (OCR of scanned specs, lazy-loaded), @supabase/supabase-js (login +
cloud library), pako (PDF compression), @mlightcad/libredwg-web (DWG reading, wasm referenced by path in `readDwg.js` because the package does not export it).

Commands: `npm run dev` · `npm run build` · `npm test` (= `node scripts/selftest.mjs`, synthetic
data only). Browser checks: Playwright with the preinstalled Chromium against `npx vite preview`.

## Routing (hash based, `src/App.jsx`)
`#/` home folders (`src/modules/home/Home.jsx` → `FOLDERS`) · `#/quote/generate|compliance|library`
· `#/calc/<booster|transfer|sump|vessel|chw>` · `#/schedule` · `#/literature` · `#/submittal`
· `#/replies` · `#/tools/<key>`. The site is open – no login page (owner's choice).

## Main files
| Area | Files |
|---|---|
| App state (localStorage `pump-submittal-v2`, PDFs in IndexedDB) | `src/store.jsx`, `src/lib/fileStore.js`, `src/lib/backup.js` |
| Cloud library (optional sign-in in Document Library) | `src/lib/cloud.js`, `supabase/migrations/*.sql` |
| Calculators + Excel-style calc sheets (Reference/Basis column) | `src/lib/calcs/*`, `src/lib/hydraulics.js`, `src/lib/ipc.js`, `src/modules/calculators/*` |
| Calc-sheet PDF engine (used by sheets, literature, replies, tools, warranty) | `src/lib/pdf/calcSheet.js`, HTML mirror `src/components/SheetPreview.jsx` |
| Pump schedule (SOM format) | `src/lib/pdf/schedulePdf.js`, `src/modules/schedule/PumpScheduleTab.jsx` |
| Technical literature (transfer, booster ± VFD, circulation, sump) | `src/lib/literature.js`, `src/lib/pdf/literaturePdf.js`, `src/modules/literature/LiteratureTab.jsx` |
| Submittal compile (cover, TOC, dividers, merge, footers) | `src/lib/pdf/compile.js` (`buildPlan`, `compileSubmittal`), `src/modules/submittal/SubmittalBuilder.jsx` |
| Final PDF compression (metadata strip, dedupe, image re-encode) | `src/lib/pdf/compress.js` |
| Quote → submittal (rule-based quote reader, generator, warranty, document library UI) | `src/lib/quote/parse.js`, `src/lib/quote/generate.js`, `src/modules/quote/QuoteTab.jsx` |
| Technical compliance statement (spec → clause rows, GL TCS layout) | `src/lib/compliance/{spec,readSpec,compliancePdf}.js`, `src/modules/quote/ComplianceTab.jsx` |
| Consultant comment replies (4 columns + annexures, stamp) | `src/lib/replies.js`, `src/lib/pdf/replyPdf.js`, `src/modules/replies/RepliesTab.jsx` |
| Calculation from drawing (DWG → network → critical route → calculator) | `src/lib/drawing/{flatten,network,ppr,building,draw,readDwg,readPdf}.js`, `src/modules/drawing/DrawingTab.jsx` (route `#/calc/drawing`) |
| Engineering tools (metric + imperial, A4 sheets) | `src/lib/tools.js`, `src/lib/units.js`, `src/modules/tools/ToolsTab.jsx` |
| Branding / credit | `src/brand.js` (logo, company details, "Designed & developed by Ramees" → LinkedIn) |

File-slot keys in IndexedDB: entry ids, `lit-<id>-datasheet|drawing`, `reply-<id>-ann-<annId>`,
`reply-<id>-prev`, library `lib-*`, pump models `libm-<modelId>-datasheet|drawing|catalogue`.
Only `lib-*`/`libm-*` slots sync to the cloud.

## Cloud library (Supabase)
- The site itself is open. Signing in (Document Library → Cloud library) is only needed to save/share
  library documents online; without it the library stays in the browser.
- Users sign in with a **username**; it maps to `<username>@glestima.netlify.app` (no mail sent).
  Public sign-ups are disabled; accounts are created by the admin (existing user: `greenland`).
  Never write passwords into the repo or chat.
- Public config is committed in `.env.production` (`VITE_SUPABASE_URL`, publishable key – safe,
  access is enforced by RLS). Never commit the secret / service-role key.
- Tables `library_state` (one row `main`: models + defaults) and `library_files`; private storage
  bucket `library`. Signed-in users only (see migration). Free plan: 1 GB storage, project pauses
  after ~7 days without use (restore in the Supabase dashboard).
- To manage Supabase from a Claude session: the owner provides a Supabase access token through the
  secure credential form for `api.supabase.com` (Management API: `/v1/projects/<ref>/database/query`,
  `/config/auth`). Create users via SQL into `auth.users` + `auth.identities` with bcrypt
  (`extensions.crypt`), `email_confirmed_at = now()`.

## PDF conventions
- Standard fonts only → sanitize text with `clean()` (WinAnsi); A4 everywhere.
- Calc-sheet sections: `info`, `steps`, `grid`, `result`, `note`, `image`, `para`; sheet options
  `sheetLabel`, `ref/rev/date`, `signatures:false`, `watermark`, row `tone` colours.
- Compliance statement follows Greenland's existing TCS layout (logo header, project table, green
  PART bars, CLAUSE | SPECIFICATION REQUIREMENT | COMPLIANCE / REMARKS | STATUS, key items,
  signatory + stamp, italic office footer).

## Owner's rules
- Ask before proceeding when a requirement is unclear; offer options.
- Push finished work to `main` (that deploys the site). Commit author `Claude <noreply@anthropic.com>`.
- Don't commit customer quotations, specifications or submittals; tests use synthetic data.
- Keep the Greenland green/navy glass theme, dark default with light switch, and the developer credit.
- Don't put the owner's email or other personal details into code, commits or outside services.

## History (most recent last)
Calculators + submittal builder → Netlify deploy → Excel-format calc sheets, pump schedule tab,
animations, themes → technical literature builder → home page folders + credit → comment replies →
engineering tools → quote → submittal + document library + warranty → compliance statement,
manual schedule fields, calc-sheet linking → Supabase cloud library → final PDF compression →
site-wide login page → login page removed again (site open; cloud sign-in only in Document Library) →
calculation from DWG drawings (booster/transfer/sump/CHW; tested on Revit-exported plans with layers P-PIPE,
P-SANR-FIXT, P-PIPE-IDEN; double-line pipes, fittings as blocks, xref background block with sanitary ware) → PDF drawings (vector CAD PDFs: OCG layers, sheet scale,
view transform for orientation; fixtures typed/marked by the user) → trained on villa DWGs (AutoCAD, metres,
single-line pipes, bound xrefs): symbol dictionary (DEFAULT_SYMBOLS + user mapping in `drawing.symbols`),
pipe-layer picker, multi-plan sheets split by floor titles / plan areas, DN vs OD size labels, velocity sizing
of unlabelled pipes.

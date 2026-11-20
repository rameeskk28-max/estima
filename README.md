# Greenland Pump Engineering Suite

Greenland Equipment & Machinery Est. L.L.C – MEP & HVAC pump hydraulic calculations, pump schedule and
technical submittal PDF builder. React 19 · Vite · Tailwind CSS 4 · Lucide · pdf-lib. Runs fully in the browser.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm test           # calculation + PDF self-test
```

## Module 1 – Hydraulic calculators (Greenland calculation-sheet format)
Every sheet follows the company template: **1. Project / Design Information → 2. Flow calculation →
3. Head-loss table (fittings & pipe friction) → 4. Final head calculation → Selected pump**, and every step
carries a **Reference / Basis** column so the consultant can see where each value comes from.

| Calculator | Flow basis | Head basis |
|---|---|---|
| Booster pump set | Fixture units (IPC 2009 App. E) → IPC Table E103.3(3) demand (or manual GPM) | Equivalent length + Hazen-Williams, residual + static, FOS |
| Transfer pump set | Overhead tank volume × effective factor ÷ filling time | same |
| Sump / sewage pump set | Pit L×W×D × effective factor ÷ emptying time | same |
| Chilled water pump set | kW ÷ (4.186 × ΔT) | same + chiller / coil / valve drops (closed loop) |
| Pressure vessel | Pump flow & starts/hr (or direct drawdown) | Boyle's law Vt = Va (Pmax+1)/(Pmax−Pmin), pre-charge Pmin − 0.2 bar |

- Fittings equivalent lengths: IPC 2009 Table E103.3(5) (½"–3"), Crane TP-410 L/D for larger sizes, manual override per row.
- Hazen-Williams (imperial, as the Excel template): psi/100 ft = 4.52·Q^1.852 / (C^1.852·d^4.87) × 100.
- Pipe ID basis: nominal size (as the template) or actual ID of the selected material.
- Each calculator: live animated pump scene, A4 calculation sheet (preview / print / PDF), save to submittal.

## Pump Schedule tab
Manual pump schedule in the SOM format (specified vs proposed duty, brand, model, MOC, certificates,
efficiency, kW, rpm, IE class, vessel, header, phase, starter). Import from calculators, A4 landscape PDF,
CSV for Excel. Used for the “Pump Schedule” section of the submittal.

## Technical Literature tab
Technical literature in the Greenland layout (cover with title & duty, TECHNICAL LITERATURE page: system,
configuration, pump model, motor, certification, requested / proposed duty, material of construction,
control & mechanical features, logic of operation, scope of supply) for:
Transfer · Booster with VFD · Booster without VFD · Circulation · Sump pump systems.
Wording is pre-filled and editable; placeholders `{brand} {model} {type} {n} {configText} {header} {vessel}`
update automatically. Quick-fill from a calculator duty or the pump schedule, optional product photo
(faded background), upload slots for **pump datasheet & curves** and **drawing / skid layout** on each
literature. The PDF uses exactly the same header, title bar, section bars, tables and signature block as the
hydraulic calculation sheets. Download as PDF, or let the submittal insert it in the matching Technical Literature section
(order: literature → datasheet → hydraulic calculation → drawing).

## Module 2 – Submittal builder
Project header, editable 14-point UAE index, PDF uploads per section, compile to a single A4 PDF with
cover, mapped TOC, section dividers, pump schedule, calculation sheets and merged uploads.

## Comment Replies (submittal revisions)
Reply to the consultant's comments on a returned submittal, in the same calculation-sheet layout:
project / MAR information (MAR No., Rev., MAR date, consultant's engineers, approval-status annotation),
comments table **No. | Consultant comment | Greenland reply / action | Annexure reference** where the last
column shows the status (Comply / Partially Comply / Deviation / Noted, colour-coded) and the annexure,
an annexure index, and the company stamp. Paste comments in bulk, add annexures with PDF uploads, attach
the previous submittal, create the next revision with one click, and download everything as one A4 PDF
(reply sheet → Annexure dividers + PDFs → Previous submittal).

## Quote to Submittal
Upload a Greenland quotation PDF (read in the browser with pdf.js – nothing is uploaded). Each quoted pump item
(title, make, model, kW, rpm, phase, type, arrangement, flow, head, housing, impeller, electrical & mechanical
accessories, quantity) becomes a pump-schedule row and a technical literature section; the warranty clause feeds the
draft warranty certificate. Constant documents (company profile, licence, authorization, manufacturer profile,
references, approvals, ISO, country of origin) and per-model datasheets / drawings / catalogues are saved once in the
**Document Library** and inserted automatically. Export / import a backup file to use the library on another computer.

## Engineering Tools
Eight quick calculators, every input in metric or imperial units (unit dropdown converts in place), live
results with calculation steps and references, copy-to-clipboard and A4 sheet / PDF in the Greenland format:
Unit Converter (flow, pressure/head, length, velocity, power, volume, area, time, temperature, friction rate) ·
Velocity (with table for all sizes) · Pipe Sizer (velocity + friction-rate limits, Hazen-Williams or
Darcy-Weisbach) · Friction Loss (HW or Darcy-Weisbach with Swamee-Jain, fittings ΣK) · Pump Power (hydraulic /
shaft / input kW, IEC motor, current) · Affinity Laws (speed or impeller trim) · NPSH available · Tank & Sump.

## Layout & themes
Home page with a short intro and seven folders – **Hydraulic Calculations**, **Pump Schedule**, **Technical
Literature**, **Submittal Package**, **Comment Replies**, **Engineering Tools**, **Quote to Submittal** – reachable from the top navigation (calculators as tabs inside their folder).
Dark "glass" design (grid background, glow orbs, frosted cards, Space Grotesk headings) in Greenland green & navy,
with a light version – toggle with the sun / moon button.

## Deploy
See **DEPLOY-NETLIFY.md** – Netlify builds from the GitHub `main` branch automatically.

---
Designed & developed by [Ramees](https://www.linkedin.com/in/rameeskk)

## Technical Compliance Statement (Quote to Submittal → Compliance Statement)

Upload the project specification (text PDF or scanned PDF – scanned pages are read with in-browser OCR).
Each numbered/lettered clause (1.1.1, 2.3 A, …) becomes one row with the specification text filled in;
PART 1/2/3 and sub-headings become green bars. Enter the Greenland remarks and status per row
(quick-fill chips, "From margin notes", "Pending → Complied"), then Preview / Download. The statement is
also inserted automatically in the submittal section **TECHNICAL COMPLIANCE STATEMENT**.

## Cloud Document Library (Supabase)

Library documents (company documents, pump datasheets, drawings, catalogues, models and defaults) can be
saved online and shared by every signed-in team member.

1. In the Supabase dashboard → **SQL Editor**, run `supabase/migrations/20261119000000_document_library.sql`
   (or `supabase db push` if the project is linked through the GitHub integration). It creates the
   `library_state` and `library_files` tables, a private `library` storage bucket and the access policies
   (signed-in users only).
2. **Authentication → Users → Add user** for each team member. People sign in with a **username**:
   create the user as `<username>@glestima.netlify.app` (tick "Auto confirm"; no mail is sent) with a
   temporary password – they change it under Document Library → Change password. Under
   **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up".
3. Netlify → **Site configuration → Environment variables**, add
   `VITE_SUPABASE_URL` (Project URL) and `VITE_SUPABASE_ANON_KEY` (anon / publishable key) from
   Supabase → Project Settings → API, then **Deploys → Trigger deploy**.
4. Open **Quote to Submittal → Document Library** and sign in. The first sign-in on a computer uploads
   what is already in that browser; after that the cloud copy is the master and every change is saved
   automatically.

Without these variables the site still works and keeps the library in the browser (backup export/import).


## Calculation from Drawing (Calculations → From Drawing (DWG))

Upload the riser diagram and floor plans as AutoCAD/Revit **.dwg** files. Everything runs in the browser
(LibreDWG WebAssembly, loaded on first use, ~11 MB):

- **Levels** are read from the riser (ROOF, 9th FLOOR, PODIUM-2…); heights use the typical floor height
  (default 4 m) and every level is editable.
- **Pipes**: double-line pipes are paired into centre-lines – the gap is the outside diameter (snapped to
  PPR sizes); single-line drawings use the size labels. Fittings/valves/meters (blocks) join the pipes.
- **Fixtures** are counted from plumbing blocks at pipe ends (WC, shattaf, basin, sink, shower, bib tap…),
  once per outlet; each plan asks which floors it covers.
- The **supply** is found where pipe sizes only step down; the **critical route** is the outlet with the
  highest loss (flows per section from IPC fixture units). Both can be picked by hand in the Route view.
- **Head per floor** = riser + floor route + static; the worst floor is sent to the Booster / Transfer /
  Sump / Chilled-water calculator with head-loss rows (PPR actual internal diameters), fixtures × floors,
  static height and a drawing page with the highlighted route – review and edit there.
- **PDF drawings** exported from AutoCAD / Revit (vector, ideally with layers) are read too: lines keep
  their layer names, the scale comes from the sheet ("1 : 100"), tiny fitting outlines join the pipes.
  PDFs have no named symbols, so fixture types are typed per plan ("Type / correct fixture counts") or
  marked by clicking outlets in the Route view; unmarked outlets share the remaining fixture units.
  Scanned PDFs (pictures) cannot be traced.

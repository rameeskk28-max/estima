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

## Module 2 – Submittal builder
Project header, editable 14-point UAE index, PDF uploads per section, compile to a single A4 PDF with
cover, mapped TOC, section dividers, pump schedule, calculation sheets and merged uploads.

## Themes
Light (default) and Dark – switch at the bottom of the sidebar.

## Deploy
See **DEPLOY-NETLIFY.md** – Netlify builds from the GitHub `main` branch automatically.

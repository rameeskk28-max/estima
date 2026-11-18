import { Building2, ArrowUpDown, Waves, Cylinder, Snowflake, Droplets, Thermometer, Gauge } from 'lucide-react';
import { CalcShell } from './CalcShell.jsx';
import { HeadLossEditor, FixtureEditor } from './Editors.jsx';
import { Card, NumField, SelectField } from '../../components/ui.jsx';
import { fmtN, KW_PER_TR } from '../../lib/ipc.js';
import { STANDARD_VESSELS } from '../../lib/calcs/index.js';

const grid = 'grid grid-cols-2 gap-3 md:grid-cols-4';

/* ------------------------------------------------------------------ */
export function BoosterCalc() {
  return (
    <CalcShell calcKey="booster" icon={Building2} description="Fixture unit method (IPC 2009) for the design flow, equivalent-length head-loss table (Hazen-Williams) and final head with factor of safety – same format as the Greenland calculation template.">
      {(i, set, r) => (
        <>
          <FixtureEditor i={i} set={set} />
          <Card title="2.1 Design Flow Calculation" icon={Droplets}>
            <div className={grid}>
              <SelectField
                label="Demand basis"
                value={i.demandMode}
                onChange={(v) => set({ demandMode: v })}
                options={[
                  { value: 'auto', label: 'IPC Table E103.3(3) (auto)' },
                  { value: 'manual', label: 'Manual GPM' },
                ]}
              />
              {i.demandMode === 'manual' ? (
                <NumField label="Design demand" unit="GPM" value={i.manualGpm} onChange={(v) => set({ manualGpm: v })} min={0} />
              ) : (
                <SelectField
                  label="System predominantly"
                  value={i.supplyType}
                  onChange={(v) => set({ supplyType: v })}
                  options={[
                    { value: 'tank', label: 'Flush tanks' },
                    { value: 'valve', label: 'Flush valves' },
                  ]}
                />
              )}
              <Stat label="Demand" value={`${fmtN(r?.gpm, 1)} GPM`} sub={`${fmtN(r?.wsfu, 1)} WSFU`} />
              <Stat label="Flow per duty pump" value={`${fmtN(r?.duty?.flowLps, 2)} L/s`} sub={`Total ${fmtN(r?.duty?.totalFlowLps, 2)} L/s`} />
            </div>
          </Card>
          <HeadLossEditor i={i} set={set} result={r} />
        </>
      )}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function TransferCalc() {
  return (
    <CalcShell calcKey="transfer" icon={ArrowUpDown} description="Flow from overhead-tank effective volume and filling time, equivalent-length head-loss table (Hazen-Williams) and final head with factor of safety – same format as the Greenland calculation template.">
      {(i, set, r) => (
        <>
          <Card title="2. Transfer Pump Flow Calculation" icon={Droplets}>
            <div className={grid}>
              <NumField label="Total volume of overhead tank" unit="m³" value={i.tankVolume} onChange={(v) => set({ tankVolume: v })} min={0} />
              <NumField label="Effective volume factor" unit="%" value={i.effFactor} onChange={(v) => set({ effFactor: v })} min={0} max={100} hint={`Effective volume ${fmtN((Number(i.tankVolume) || 0) * (Number(i.effFactor) || 0) / 100, 2)} m³`} />
              <NumField label="Time required for filling" unit="hr" value={i.fillTime} onChange={(v) => set({ fillTime: v })} min={0.01} step={0.1} />
              <Stat label="Flow rate" value={`${fmtN(r?.duty?.totalFlowLps * 3.6, 2)} m³/hr`} sub={`${fmtN(r?.duty?.totalFlowLps, 2)} L/s · per pump ${fmtN(r?.duty?.flowLps, 2)} L/s`} />
            </div>
          </Card>
          <HeadLossEditor i={i} set={set} result={r} />
        </>
      )}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function SumpCalc() {
  return (
    <CalcShell calcKey="sump" icon={Waves} description="Flow from sump-pit effective volume and emptying time, equivalent-length head-loss table (Hazen-Williams) and final head with factor of safety – same format as the Greenland calculation template.">
      {(i, set, r) => (
        <>
          <Card title="2. Submersible Pump Flow Calculation" icon={Droplets}>
            <div className={grid}>
              <NumField label="Pit length" unit="m" value={i.pitL} onChange={(v) => set({ pitL: v })} min={0} />
              <NumField label="Pit width" unit="m" value={i.pitW} onChange={(v) => set({ pitW: v })} min={0} />
              <NumField label="Pit effective depth" unit="m" value={i.pitD} onChange={(v) => set({ pitD: v })} min={0} hint={`Volume ${fmtN((Number(i.pitL) || 0) * (Number(i.pitW) || 0) * (Number(i.pitD) || 0), 2)} m³`} />
              <NumField label="Effective volume factor" unit="%" value={i.effFactor} onChange={(v) => set({ effFactor: v })} min={0} max={100} />
              <NumField label="Time required for emptying" unit="hr" value={i.emptyTime} onChange={(v) => set({ emptyTime: v })} min={0.001} step={0.01} hint={`= ${fmtN((Number(i.emptyTime) || 0) * 60, 1)} min`} />
              <Stat label="Flow rate" value={`${fmtN(r?.duty?.totalFlowLps * 3.6, 2)} m³/hr`} sub={`${fmtN(r?.duty?.totalFlowLps, 2)} L/s · per pump ${fmtN(r?.duty?.flowLps, 2)} L/s`} />
            </div>
          </Card>
          <HeadLossEditor i={i} set={set} result={r} />
        </>
      )}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function ChwCalc() {
  return (
    <CalcShell calcKey="chw" icon={Snowflake} description="Chilled-water flow from cooling load and ΔT, equivalent-length head-loss table for the index circuit plus chiller / coil / valve pressure drops (closed loop) – same format as the Greenland calculation template.">
      {(i, set, r) => (
        <>
          <Card title="2. Chilled Water Flow Calculation" icon={Thermometer}>
            <div className={grid}>
              <NumField label="Cooling load" unit={i.loadUnit} value={i.load} onChange={(v) => set({ load: v })} min={0} hint={i.loadUnit === 'TR' ? `= ${fmtN((Number(i.load) || 0) * KW_PER_TR, 1)} kW` : ''} />
              <SelectField
                label="Load unit"
                value={i.loadUnit}
                onChange={(v) => set({ loadUnit: v, load: v === i.loadUnit ? i.load : v === 'kW' ? Number(((Number(i.load) || 0) * KW_PER_TR).toFixed(1)) : Number(((Number(i.load) || 0) / KW_PER_TR).toFixed(1)) })}
                options={[
                  { value: 'TR', label: 'TR' },
                  { value: 'kW', label: 'kW' },
                ]}
              />
              <NumField label="ΔT (return − supply)" unit="°C" value={i.deltaT} onChange={(v) => set({ deltaT: v })} min={0.1} step={0.1} />
              <Stat label="Flow" value={`${fmtN(r?.duty?.totalFlowLps, 2)} L/s`} sub={`per pump ${fmtN(r?.duty?.flowLps, 2)} L/s`} />
            </div>
          </Card>
          <Card title="Component Pressure Drops (manufacturer data)" icon={Gauge}>
            <div className={grid}>
              <NumField label="Chiller evaporator" unit="kPa" value={i.chillerKpa} onChange={(v) => set({ chillerKpa: v })} min={0} />
              <NumField label="AHU / FCU coil" unit="kPa" value={i.coilKpa} onChange={(v) => set({ coilKpa: v })} min={0} />
              <NumField label="Control valve" unit="kPa" value={i.valveKpa} onChange={(v) => set({ valveKpa: v })} min={0} />
              <NumField label="Other components" unit="kPa" value={i.otherKpa} onChange={(v) => set({ otherKpa: v })} min={0} />
            </div>
          </Card>
          <HeadLossEditor i={i} set={set} result={r} designLabel="total system flow" />
        </>
      )}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function VesselCalc() {
  return (
    <CalcShell pump={false} calcKey="vessel" icon={Cylinder} description="Diaphragm vessel sizing by Boyle's law Vt = Va × (Pmax + 1) ÷ (Pmax − Pmin), pre-charge Pmin − 0.2 bar, with selection from the standard range – each step referenced.">
      {(i, set, r) => (
        <>
          <Card title="2. Vessel Sizing Inputs" icon={Gauge}>
            <div className={grid}>
              <NumField label="Cut-in pressure Pmin" unit="bar g" value={i.pmin} onChange={(v) => set({ pmin: v })} step={0.1} />
              <NumField label="Cut-out pressure Pmax" unit="bar g" value={i.pmax} onChange={(v) => set({ pmax: v })} step={0.1} />
              <SelectField
                label="Drawdown basis"
                value={i.mode}
                onChange={(v) => set({ mode: v })}
                options={[
                  { value: 'pump', label: 'Pump flow & starts/hr' },
                  { value: 'direct', label: 'Direct drawdown volume' },
                ]}
              />
              {i.mode === 'pump' ? (
                <>
                  <NumField label="Largest pump flow" unit="L/s" value={i.pumpFlow} onChange={(v) => set({ pumpFlow: v })} min={0} />
                  <NumField label="Max. starts per hour" value={i.starts} onChange={(v) => set({ starts: v })} min={1} step={1} />
                </>
              ) : (
                <NumField label="Drawdown volume Va" unit="L" value={i.va} onChange={(v) => set({ va: v })} min={0} />
              )}
              <NumField label="Number of vessels" value={i.vessels} onChange={(v) => set({ vessels: v })} min={1} step={1} />
            </div>
          </Card>
          <Card title="Standard Vessel Range" icon={Cylinder}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STANDARD_VESSELS.map((s, k) => {
                const sel = r?.selection?.size === s;
                return (
                  <div key={s} className={`rounded-lg border p-3 text-center transition ${sel ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10' : 'border-line bg-ink-900/40'}`}>
                    <Cylinder className={`mx-auto ${sel ? 'text-brand-400' : 'text-slate-500'}`} size={20 + k * 3} />
                    <div className="mt-1 text-sm font-semibold text-slate-50">{s} L</div>
                    <div className="text-[10px] font-semibold text-brand-300">{sel ? `SELECTED × ${r.selection.n}` : ' '}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </CalcShell>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-50">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

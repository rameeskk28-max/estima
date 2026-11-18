import { Building2, ArrowUpDown, Waves, Cylinder, Snowflake, Ruler, Thermometer, Droplets, Gauge } from 'lucide-react';
import { CalcShell } from './CalcShell.jsx';
import { Card, NumField, UnitField, SelectField } from '../../components/ui.jsx';
import { PipeEditor } from '../../components/PipeEditor.jsx';
import { FLOW_UNITS, PRESSURE_UNITS, VOLUME_UNITS, POWER_UNITS, WATER_MATERIALS, CHW_MATERIALS, toLps, toKW, fmt } from '../../lib/hydraulics.js';
import { STANDARD_VESSELS } from '../../lib/calcs/vessel.js';

const grid = 'grid grid-cols-2 gap-3 md:grid-cols-3';

function DesignFactors({ i, set }) {
  return (
    <Card title="Design Factors & Motor Sizing" icon={Gauge}>
      <div className={grid}>
        <NumField label="Safety margin on head" unit="%" value={i.safetyPct} onChange={(v) => set({ safetyPct: v })} min={0} />
        <NumField label="Pump efficiency ηp" unit="%" value={i.pumpEff} onChange={(v) => set({ pumpEff: v })} min={1} max={100} />
        <NumField label="Motor margin" unit="%" value={i.motorMargin} onChange={(v) => set({ motorMargin: v })} min={0} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
export function BoosterCalc() {
  return (
    <CalcShell calcKey="booster" icon={Building2} description="Total dynamic head for a domestic water booster set: static lift + residual pressure at the critical fixture + Hazen-Williams pipe friction + fitting losses, with motor sizing per duty pump.">
      {(i, set) => (
        <>
          <Card title="Flow & Static Conditions" icon={Ruler}>
            <div className={grid}>
              <UnitField label="Total peak demand flow" value={i.flow} table={FLOW_UNITS} onChange={(v) => set({ flow: v })} hint={`Per duty pump: ${fmt(toLps(i.flow.value, i.flow.unit) / Math.max(1, i.duty || 1), 2)} L/s`} />
              <NumField label="Static lift to critical fixture" unit="m" value={i.staticLift} onChange={(v) => set({ staticLift: v })} hint="Pump C/L to highest outlet" />
              <NumField label="Positive suction head" unit="m" value={i.suctionHead} onChange={(v) => set({ suctionHead: v })} hint="Tank min. level above pump C/L (credit)" />
              <UnitField label="Residual pressure at fixture" value={i.residual} table={PRESSURE_UNITS} onChange={(v) => set({ residual: v })} />
              <UnitField label="Equipment losses (meter / filter)" value={i.equipmentLoss} table={PRESSURE_UNITS} onChange={(v) => set({ equipmentLoss: v })} />
            </div>
          </Card>
          <PipeEditor title="Discharge header – index run (critical path)" pipe={i.pipe} materials={WATER_MATERIALS} qLps={toLps(i.flow.value, i.flow.unit)} onChange={(pipe) => set({ pipe })} />
          <DesignFactors i={i} set={set} />
        </>
      )}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function TransferCalc() {
  return (
    <CalcShell calcKey="transfer" icon={ArrowUpDown} description="Flow from roof tank volume and filling time, static elevation between lower (underground/ground) tank and roof tank, suction & discharge friction, and NPSHa verification at the site water temperature.">
      {(i, set) => {
        const qTotal = (Number(i.volume.value) * (i.volume.unit === 'L' ? 1 : 1000)) / (Math.max(Number(i.fillTime) || 0, 0.01) * 3600);
        return (
          <>
            <Card title="Filling Duty" icon={Droplets}>
              <div className={grid}>
                <UnitField label="Roof tank volume to fill" value={i.volume} table={VOLUME_UNITS} onChange={(v) => set({ volume: v })} />
                <NumField label="Filling time" unit="h" value={i.fillTime} onChange={(v) => set({ fillTime: v })} min={0.01} hint={`Q = ${fmt(qTotal, 2)} L/s · ${fmt(qTotal * 3.6, 2)} m³/h`} />
                <UnitField label="Residual at outlet / float valve" value={i.residual} table={PRESSURE_UNITS} onChange={(v) => set({ residual: v })} />
              </div>
            </Card>
            <Card title="Elevations (common datum, e.g. ground floor FFL = 0.00)" icon={Ruler}>
              <div className={grid}>
                <NumField label="Lower tank min. water level" unit="m" value={i.lwlLevel} onChange={(v) => set({ lwlLevel: v })} />
                <NumField label="Pump centre-line" unit="m" value={i.pumpLevel} onChange={(v) => set({ pumpLevel: v })} />
                <NumField label="Roof tank inlet" unit="m" value={i.dischargeLevel} onChange={(v) => set({ dischargeLevel: v })} hint={`Static head = ${fmt((Number(i.dischargeLevel) || 0) - (Number(i.lwlLevel) || 0), 2)} m`} />
              </div>
            </Card>
            <PipeEditor title="Suction pipe (per pump)" pipe={i.suctionPipe} materials={WATER_MATERIALS} qLps={qTotal / Math.max(1, i.duty || 1)} onChange={(p) => set({ suctionPipe: p })} />
            <PipeEditor title="Discharge / rising main" pipe={i.dischargePipe} materials={WATER_MATERIALS} qLps={qTotal} onChange={(p) => set({ dischargePipe: p })} />
            <Card title="NPSH Verification" icon={Thermometer}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <NumField label="Water temperature" unit="°C" value={i.waterTemp} onChange={(v) => set({ waterTemp: v })} min={1} max={99} />
                <NumField label="Site altitude" unit="m" value={i.altitude} onChange={(v) => set({ altitude: v })} />
                <NumField label="Pump NPSHr" unit="m" value={i.npshr} onChange={(v) => set({ npshr: v })} hint="From manufacturer curve" />
                <NumField label="NPSH margin" unit="m" value={i.npshMargin} onChange={(v) => set({ npshMargin: v })} />
              </div>
            </Card>
            <DesignFactors i={i} set={set} />
          </>
        );
      }}
    </CalcShell>
  );
}

/* ------------------------------------------------------------------ */
export function SumpCalc() {
  return (
    <CalcShell calcKey="sump" icon={Waves} description="Peak inflow (drainage + seepage + rainwater by the Rational method), static head from pump stop level to the manhole invert, rising-main friction, and wet-well sizing from the maximum permissible starts per hour.">
      {(i, set, r) => (
        <>
          <Card title="Inflow Rates" icon={Droplets}>
            <div className={grid}>
              <UnitField label="Drainage / fixture inflow" value={i.drainageFlow} table={FLOW_UNITS} onChange={(v) => set({ drainageFlow: v })} />
              <UnitField label="Groundwater seepage" value={i.seepageFlow} table={FLOW_UNITS} onChange={(v) => set({ seepageFlow: v })} />
              <NumField label="Peak inflow safety factor" value={i.inflowFactor} onChange={(v) => set({ inflowFactor: v })} min={1} step={0.05} />
              <NumField label="Rain catchment area" unit="m²" value={i.rainArea} onChange={(v) => set({ rainArea: v })} min={0} />
              <NumField label="Rainfall intensity" unit="mm/h" value={i.rainIntensity} onChange={(v) => set({ rainIntensity: v })} min={0} />
              <NumField label="Run-off coefficient C" value={i.runoffC} onChange={(v) => set({ runoffC: v })} min={0} max={1} step={0.05} />
            </div>
          </Card>
          <Card title="Levels" icon={Ruler}>
            <div className={grid}>
              <NumField label="Sump pit bottom elevation" unit="m" value={i.pitBottom} onChange={(v) => set({ pitBottom: v })} />
              <NumField label="Stop level above pit bottom" unit="m" value={i.stopHeight} onChange={(v) => set({ stopHeight: v })} hint="Min. pump submergence" />
              <NumField label="Manhole invert / discharge high point" unit="m" value={i.dischargeLevel} onChange={(v) => set({ dischargeLevel: v })} />
            </div>
          </Card>
          <PipeEditor title="Rising main to manhole" pipe={i.pipe} materials={WATER_MATERIALS} qLps={r?.duty?.totalFlowLps || 0} onChange={(p) => set({ pipe: p })} />
          <Card title="Wet Well / Sump Pit Sizing" icon={Cylinder}>
            <div className="grid gap-4 lg:grid-cols-[1fr_230px]">
              <div className={grid}>
                <NumField label="Max. starts per hour" value={i.starts} onChange={(v) => set({ starts: v })} min={1} step={1} />
                <NumField label="Pit internal length" unit="m" value={i.pitL} onChange={(v) => set({ pitL: v })} min={0.1} />
                <NumField label="Pit internal width" unit="m" value={i.pitW} onChange={(v) => set({ pitW: v })} min={0.1} />
                <NumField label="Standby start above duty" unit="m" value={i.standbyGap} onChange={(v) => set({ standbyGap: v })} />
                <NumField label="Alarm above standby start" unit="m" value={i.alarmGap} onChange={(v) => set({ alarmGap: v })} />
                <NumField label="Freeboard to inlet invert" unit="m" value={i.freeboard} onChange={(v) => set({ freeboard: v })} />
              </div>
              {r?.levels && <SumpDiagram lv={r.levels} />}
            </div>
          </Card>
          <DesignFactors i={i} set={set} />
        </>
      )}
    </CalcShell>
  );
}

function SumpDiagram({ lv }) {
  const span = Math.max(lv.inletInvert - lv.bottom, 0.1);
  const H = 220;
  const y = (z) => 12 + (1 - (z - lv.bottom) / span) * (H - 24);
  const rows = [
    ['Inlet invert', lv.inletInvert, '#94a3b8'],
    ['High alarm', lv.highAlarm, '#f87171'],
    ['Standby start', lv.startStandby, '#fbbf24'],
    ['Duty start', lv.startDuty, '#34d399'],
    ['Stop', lv.stopLevel, '#38bdf8'],
  ];
  return (
    <svg viewBox={`0 0 230 ${H}`} className="w-full rounded-lg bg-ink-950/60" role="img" aria-label="Sump level diagram">
      <rect x="18" y={y(lv.startDuty)} width="70" height={y(lv.stopLevel) - y(lv.startDuty)} fill="#0ea5e9" opacity="0.25" />
      <rect x="18" y={y(lv.stopLevel)} width="70" height={y(lv.bottom) - y(lv.stopLevel)} fill="#0ea5e9" opacity="0.45" />
      <path d={`M18 6 V${y(lv.bottom)} H88 V6`} fill="none" stroke="#64748b" strokeWidth="2" />
      {rows.map(([label, z, c]) => (
        <g key={label}>
          <line x1="14" x2="96" y1={y(z)} y2={y(z)} stroke={c} strokeDasharray="3 2" />
          <text x="102" y={y(z) + 3} fontSize="9" fill={c}>
            {label} {fmt(z - lv.bottom, 2)} m
          </text>
        </g>
      ))}
      <text x="22" y={y(lv.bottom) - 4} fontSize="8" fill="#cbd5e1">
        Pit bottom {fmt(lv.bottom, 2)}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
export function VesselCalc() {
  return (
    <CalcShell calcKey="vessel" icon={Cylinder} description="Diaphragm tank sizing by Boyle's law: Vt = Va · (Pmax + 1) / (Pmax − Pmin), pre-charge Ppre = Pmin − 0.2 bar, with selection from the standard range (24 – 500 L).">
      {(i, set, r) => (
        <>
          <Card title="Pressure Settings" icon={Gauge}>
            <div className={grid}>
              <NumField label="Cut-in pressure Pmin" unit="bar g" value={i.pmin} onChange={(v) => set({ pmin: v })} step={0.1} />
              <NumField label="Cut-out pressure Pmax" unit="bar g" value={i.pmax} onChange={(v) => set({ pmax: v })} step={0.1} />
              <NumField label="Vessel PN rating" unit="bar" value={i.maxWorkingPressure} onChange={(v) => set({ maxWorkingPressure: v })} />
            </div>
          </Card>
          <Card title="Drawdown (Acceptance) Volume" icon={Droplets}>
            <div className={grid}>
              <SelectField
                label="Basis"
                value={i.mode}
                onChange={(v) => set({ mode: v })}
                options={[
                  { value: 'pump', label: 'From pump flow & starts/hour' },
                  { value: 'direct', label: 'Direct drawdown volume' },
                ]}
              />
              {i.mode === 'pump' ? (
                <>
                  <UnitField label="Largest single pump flow" value={i.pumpFlow} table={FLOW_UNITS} onChange={(v) => set({ pumpFlow: v })} />
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
              {STANDARD_VESSELS.map((s) => {
                const sel = r?.selection?.size === s;
                return (
                  <div key={s} className={`rounded-lg border p-3 text-center ${sel ? 'border-emerald-400 bg-emerald-500/10' : 'border-line bg-ink-900/60'}`}>
                    <Cylinder className={`mx-auto ${sel ? 'text-emerald-300' : 'text-slate-500'}`} size={20 + STANDARD_VESSELS.indexOf(s) * 3} />
                    <div className="mt-1 text-sm font-semibold text-white">{s} L</div>
                    <div className="text-[10px] text-slate-400">{sel ? `SELECTED × ${r.selection.n}` : ' '}</div>
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

/* ------------------------------------------------------------------ */
export function ChwCalc() {
  return (
    <CalcShell calcKey="chw" icon={Snowflake} description="Chilled water flow from cooling load and ΔT using Q (L/s) = kW / (4.186 · ΔT), plus closed-loop head across chiller evaporator, index AHU/FCU coil, control valve, accessories and index-circuit piping.">
      {(i, set) => {
        const q = toKW(i.load.value, i.load.unit) / (4.186 * Math.max(Number(i.deltaT) || 0, 0.1));
        return (
          <>
            <Card title="Cooling Load" icon={Thermometer}>
              <div className={grid}>
                <UnitField label="Design cooling load" value={i.load} table={POWER_UNITS} onChange={(v) => set({ load: v })} hint={`= ${fmt(toKW(i.load.value, i.load.unit), 1)} kW`} />
                <NumField label="ΔT (return − supply)" unit="°C" value={i.deltaT} onChange={(v) => set({ deltaT: v })} min={0.1} step={0.1} hint={`Q = ${fmt(q, 2)} L/s · ${fmt(q * 3.6, 1)} m³/h`} />
              </div>
            </Card>
            <Card title="Component Pressure Drops (index circuit)" icon={Gauge}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <UnitField label="Chiller evaporator" value={i.chillerDrop} table={PRESSURE_UNITS} onChange={(v) => set({ chillerDrop: v })} />
                <UnitField label="AHU / FCU coil" value={i.coilDrop} table={PRESSURE_UNITS} onChange={(v) => set({ coilDrop: v })} />
                <UnitField label="Control valve / PICV" value={i.valveDrop} table={PRESSURE_UNITS} onChange={(v) => set({ valveDrop: v })} />
                <UnitField label="Other (DRV, strainer, HX)" value={i.otherDrop} table={PRESSURE_UNITS} onChange={(v) => set({ otherDrop: v })} />
              </div>
            </Card>
            <PipeEditor title="Index circuit piping (supply + return)" pipe={i.pipe} materials={CHW_MATERIALS} qLps={q} onChange={(p) => set({ pipe: p })} />
            <DesignFactors i={i} set={set} />
          </>
        );
      }}
    </CalcShell>
  );
}

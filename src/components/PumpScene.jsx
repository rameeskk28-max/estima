import { useEffect, useId, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { fmtN } from '../lib/ipc.js';

/* Animated SVG pump scenes. Speed follows the calculated flow. */

const WATER = '#38bdf8';
const WATER_D = '#0284c7';
const PIPE = '#94a3b8';
const STEEL = '#cbd5e1';
const GREEN = '#06af4b';
const NAVY = '#153963';

function speeds(flow = 1) {
  const q = Math.max(Number(flow) || 0.1, 0.1);
  return { spin: `${Math.max(0.18, Math.min(1.6, 1.4 / Math.sqrt(q))).toFixed(2)}s`, flow: `${Math.max(0.35, Math.min(2.2, 2.4 / Math.sqrt(q))).toFixed(2)}s` };
}

/** Pump: motor + volute + spinning impeller. */
function Pump({ x, y, running = true, scale = 1, label, spin }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-14} y={-50} width={28} height={30} rx={4} fill={running ? NAVY : '#64748b'} />
      {[...Array(5)].map((_, k) => (
        <line key={k} x1={-14} x2={14} y1={-46 + k * 6} y2={-46 + k * 6} stroke="#ffffff22" />
      ))}
      <rect x={-6} y={-20} width={12} height={6} fill={STEEL} />
      <circle r={17} cy={0} fill="#e2e8f0" stroke={running ? GREEN : '#94a3b8'} strokeWidth={3} />
      <g className={running ? 'anim-spin' : ''} style={{ '--spin': spin }}>
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <path key={a} d="M0 0 C 4 -6, 10 -9, 12 -10" stroke={running ? GREEN : '#94a3b8'} strokeWidth={3} fill="none" strokeLinecap="round" transform={`rotate(${a})`} />
        ))}
        <circle r={3.5} fill={NAVY} />
      </g>
      <rect x={-22} y={14} width={44} height={6} rx={2} fill="#475569" />
      {label && (
        <text y={33} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={running ? GREEN : '#94a3b8'}>
          {label}
        </text>
      )}
    </g>
  );
}

const Pipe = ({ d, flow, color = WATER, width = 7, reverse }) => (
  <>
    <path d={d} stroke={PIPE} strokeWidth={width + 4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    <path d={d} stroke="#e2e8f0" strokeWidth={width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    <path d={d} stroke={color} strokeWidth={width - 3} fill="none" strokeLinejoin="round" strokeLinecap="round" className={reverse ? 'anim-flow-rev' : 'anim-flow'} style={{ '--flow': flow }} />
  </>
);

function Tank({ x, y, w, h, cls, label, delay }) {
  const id = useId().replace(/:/g, '');
  return (
    <g>
      <defs>
        <clipPath id={`t${id}`}>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={4} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={WATER} />
          <stop offset="1" stopColor={WATER_D} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#f8fafc" stroke="#64748b" strokeWidth={2.5} />
      <g clipPath={`url(#t${id})`}>
        <g className={cls} style={{ animationDelay: delay }}>
          <rect x={x} y={y + 3} width={w} height={h} fill={`url(#g${id})`} />
          <path className="anim-wave" d={`M${x - 40} ${y + 6} q 10 -5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0`} stroke="#bae6fd" strokeWidth={2} fill="none" />
        </g>
      </g>
      {label && (
        <text x={x + w / 2} y={y + h + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.75}>
          {label}
        </text>
      )}
    </g>
  );
}

const Badge = ({ x, y, lines }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={158} height={14 + lines.length * 17} rx={9} fill={NAVY} opacity={0.94} />
    {lines.map((l, i) => (
      <text key={i} x={11} y={21 + i * 17} fontSize="13.5" fontWeight={i === 0 ? 700 : 500} fill={i === 0 ? '#5fdc90' : '#e2e8f0'}>
        {l}
      </text>
    ))}
  </g>
);

const Drop = ({ x, y, delay }) => <path className="anim-drop" style={{ animationDelay: delay }} d={`M${x} ${y} q 3 5 0 7 q -3 -2 0 -7`} fill={WATER} />;

/* ------------------------------ scenes ------------------------------ */

function TransferScene({ a, s }) {
  return (
    <>
      <rect x={300} y={40} width={150} height={185} fill="currentColor" opacity={0.05} />
      {[70, 100, 130, 160, 190].map((yy) => (
        <line key={yy} x1={300} x2={450} y1={yy} y2={yy} stroke="currentColor" opacity={0.1} />
      ))}
      <line x1={0} x2={640} y1={225} y2={225} stroke="currentColor" opacity={0.25} strokeWidth={2} />
      <Tank x={24} y={130} w={130} h={90} cls="anim-drain" label="LOWER TANK" />
      <Tank x={480} y={22} w={130} h={70} cls="anim-fill" label="ROOF TANK" />
      <Pipe d="M154 205 H 230" flow={s.flow} />
      <Pipe d="M266 205 H 300 V 12 H 545 V 22" flow={s.flow} />
      <Pump x={248} y={205} spin={s.spin} label="DUTY" />
      <Badge x={318} y={140} lines={[`${fmtN(a.flow, 2)} L/s`, `H = ${fmtN(a.head, 1)} m`]} />
    </>
  );
}

function BoosterScene({ a, s }) {
  const duty = Math.min(Math.max(a.pumps || 1, 1), 3);
  const sb = Math.min(a.standby ?? 1, 2);
  const n = duty + sb;
  const xs = [...Array(n)].map((_, k) => 200 + k * 58);
  const hx = xs[xs.length - 1] + 40;
  return (
    <>
      <line x1={0} x2={640} y1={225} y2={225} stroke="currentColor" opacity={0.25} strokeWidth={2} />
      <Tank x={20} y={120} w={110} h={100} cls="anim-drain" label="WATER TANK" />
      <Pipe d={`M130 205 H ${xs[xs.length - 1]}`} flow={s.flow} width={6} />
      {xs.map((x, k) => (
        <Pipe key={k} d={`M${x} 190 V 150`} flow={s.flow} width={5} />
      ))}
      <Pipe d={`M${xs[0]} 150 H ${hx + 30} V 30 H 610`} flow={s.flow} />
      {xs.map((x, k) => (
        <Pump key={k} x={x} y={205} spin={s.spin} running={k < duty} label={k < duty ? `DUTY ${k + 1}` : 'STANDBY'} scale={0.8} />
      ))}
      <g transform={`translate(${hx} 150)`}>
        <circle r={13} fill="#fff" stroke={NAVY} strokeWidth={2.5} />
        <line className="anim-needle" x1={0} y1={0} x2={0} y2={-9} stroke="#dc2626" strokeWidth={2} strokeLinecap="round" />
        <circle r={2} fill={NAVY} />
      </g>
      <g>
        <rect x={hx + 50} y={30} width={150} height={195} fill="currentColor" opacity={0.06} stroke="currentColor" strokeOpacity={0.25} />
        {[60, 100, 140, 180].map((yy, k) => (
          <g key={yy}>
            <line x1={hx + 50} x2={hx + 200} y1={yy + 30} y2={yy + 30} stroke="currentColor" opacity={0.15} />
            <Pipe d={`M${hx + 30} ${yy - 20} H ${hx + 110} V ${yy - 8}`} flow={s.flow} width={4} />
            <Drop x={hx + 110} y={yy - 4} delay={`${k * 0.3}s`} />
            <rect x={hx + 135} y={yy - 2} width={22} height={22} rx={2} fill={WATER} opacity={0.25} />
          </g>
        ))}
      </g>
      <Badge x={20} y={20} lines={[`${fmtN(a.flow, 2)} L/s per pump`, `H = ${fmtN(a.head, 1)} m`]} />
    </>
  );
}

function SumpScene({ a, s }) {
  return (
    <>
      <rect x={0} y={95} width={640} height={145} fill="currentColor" opacity={0.07} />
      <line x1={0} x2={640} y1={95} y2={95} stroke="currentColor" opacity={0.35} strokeWidth={2} />
      <text x={12} y={88} fontSize="9" fill="currentColor" opacity={0.6}>
        GROUND LEVEL
      </text>
      <Pipe d="M20 120 H 150" flow={s.flow} width={5} />
      <Drop x={152} y={124} delay="0s" />
      <Drop x={152} y={124} delay="0.5s" />
      <Tank x={150} y={108} w={170} h={110} cls="anim-sump" label="SUMP PIT" />
      <g className="anim-sump-float">
        <line x1={300} y1={160} x2={290} y2={150} stroke="#334155" strokeWidth={1.5} />
        <ellipse cx={300} cy={162} rx={7} ry={5} fill="#f59e0b" />
      </g>
      <Pump x={210} y={200} spin={s.spin} label="" scale={0.75} />
      <Pipe d="M210 168 V 60 H 520 V 90" flow={s.flow} />
      <g>
        <rect x={490} y={90} width={60} height={60} fill="currentColor" opacity={0.1} stroke="currentColor" strokeOpacity={0.4} />
        <text x={520} y={165} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.75}>
          MANHOLE
        </text>
      </g>
      <Badge x={322} y={150} lines={[`${fmtN(a.flow, 2)} L/s`, `H = ${fmtN(a.head, 1)} m`]} />
    </>
  );
}

function VesselScene({ a, s }) {
  return (
    <>
      <line x1={0} x2={640} y1={225} y2={225} stroke="currentColor" opacity={0.25} strokeWidth={2} />
      <Pump x={120} y={205} spin={s.spin} label="BOOSTER" />
      <Pipe d="M140 205 H 520" flow={s.flow} />
      <Pipe d="M340 205 V 190" flow={s.flow} width={6} />
      <g>
        <rect x={290} y={40} width={100} height={150} rx={46} fill="#f1f5f9" stroke={NAVY} strokeWidth={3} />
        <clipPath id="vclip">
          <rect x={293} y={43} width={94} height={144} rx={44} />
        </clipPath>
        <g clipPath="url(#vclip)">
          <rect x={290} y={40} width={100} height={150} fill="#fecaca" opacity={0.45} />
          <g className="anim-vessel">
            <rect x={290} y={110} width={100} height={90} fill={WATER} />
          </g>
        </g>
        <text x={340} y={70} textAnchor="middle" fontSize="10" fontWeight="700" fill="#b91c1c">
          AIR
        </text>
        <text x={340} y={178} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
          WATER
        </text>
      </g>
      <g transform="translate(470 120)">
        <circle r={34} fill="#fff" stroke={NAVY} strokeWidth={3} />
        {[-120, -60, 0, 60, 120].map((t) => (
          <line key={t} x1={0} y1={-27} x2={0} y2={-31} stroke={NAVY} strokeWidth={2} transform={`rotate(${t})`} />
        ))}
        <line className="anim-gauge" x1={0} y1={0} x2={0} y2={-25} stroke="#dc2626" strokeWidth={3} strokeLinecap="round" />
        <circle r={4} fill={NAVY} />
        <text y={20} textAnchor="middle" fontSize="9" fontWeight="700" fill={NAVY}>
          bar
        </text>
      </g>
      <Badge x={20} y={20} lines={[`Cut-in ${fmtN(a.pmin, 1)} bar`, `Cut-out ${fmtN(a.pmax, 1)} bar`]} />
    </>
  );
}

function ChwScene({ a, s }) {
  return (
    <>
      <g>
        <rect x={30} y={60} width={130} height={110} rx={8} fill={NAVY} />
        {[...Array(8)].map((_, k) => (
          <line key={k} x1={45} x2={145} y1={75 + k * 11} y2={75 + k * 11} stroke="#ffffff33" />
        ))}
        <text x={95} y={190} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.75}>
          CHILLER
        </text>
        <g className="anim-spin-slow" style={{ transformOrigin: '95px 115px' }}>
          {[0, 60, 120].map((r) => (
            <line key={r} x1={95} y1={98} x2={95} y2={132} stroke="#7dd3fc" strokeWidth={3} strokeLinecap="round" transform={`rotate(${r} 95 115)`} />
          ))}
        </g>
      </g>
      <Pipe d="M160 85 H 470" flow={s.flow} color="#38bdf8" />
      <Pipe d="M470 150 H 330 V 205 H 160 V 150" flow={s.flow} color="#f87171" reverse />
      <Pump x={250} y={205} spin={s.spin} label="CHW PUMP" scale={0.85} />
      <g>
        <rect x={470} y={55} width={140} height={120} rx={8} fill="#e2e8f0" stroke="#64748b" strokeWidth={2} />
        <g className="anim-spin" style={{ '--spin': '0.6s', transformOrigin: '540px 115px' }}>
          {[0, 90, 180, 270].map((r) => (
            <ellipse key={r} cx={540} cy={97} rx={6} ry={16} fill="#64748b" transform={`rotate(${r} 540 115)`} />
          ))}
        </g>
        <circle cx={540} cy={115} r={4} fill={NAVY} />
        <text x={540} y={190} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity={0.75}>
          AHU / FCU
        </text>
      </g>
      <text x={290} y={76} fontSize="11" fontWeight="700" fill="#0284c7">
        SUPPLY 6.7 °C
      </text>
      <text x={350} y={168} fontSize="11" fontWeight="700" fill="#dc2626">
        RETURN
      </text>
      <Badge x={20} y={8} lines={[`${fmtN(a.flow, 2)} L/s per pump`, `H = ${fmtN(a.head, 1)} m`]} />
    </>
  );
}

const SCENES = { transfer: TransferScene, booster: BoosterScene, sump: SumpScene, vessel: VesselScene, chw: ChwScene };

export function PumpScene({ type, anim = {}, className = '' }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [running, setRunning] = useState(!reduce);
  useEffect(() => {
    try {
      const v = localStorage.getItem('scene-running');
      if (v !== null) setRunning(v === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    setRunning((r) => {
      try {
        localStorage.setItem('scene-running', r ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !r;
    });
  };
  const Scene = SCENES[type];
  if (!Scene) return null;
  const s = speeds(anim.flow);
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-gradient-to-b from-ink-800/60 to-ink-950/40 text-slate-200 ${className}`}>
      <svg viewBox="0 0 640 240" className={`block w-full ${running ? '' : 'scene-paused'}`} role="img" aria-label={`${type} pump animation`}>
        <Scene a={anim} s={s} />
      </svg>
      <button onClick={toggle} className="btn-ghost absolute bottom-1.5 right-1.5 !bg-white/70 !p-1.5 !text-slate-700 hover:!bg-white" title={running ? 'Pause animation' : 'Play animation'} aria-label={running ? 'Pause animation' : 'Play animation'}>
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  );
}

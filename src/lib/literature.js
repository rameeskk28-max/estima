// Technical literature templates – wording follows the Greenland technical literature documents.
// Placeholders {brand} {model} {type} {n} {config} {header} {vessel} {title} are filled in when rendering.

export const LIT_TEMPLATES = {
  transfer: {
    label: 'Transfer Pump System',
    category: 'transfer',
    title: 'WATER TRANSFER PUMP SET',
    pumpType: 'Horizontal Multistage',
    motor: 'TEFC, IEC, 1.1 KW, 3 PHASE, 400V, 50HZ',
    header: '1.25"x1"',
    vessel: '',
    moc: [
      ['PUMP CHAMBER', 'SS 316L'],
      ['IMPELLER', 'SS 316L'],
      ['SHAFT', 'SS 316L'],
    ],
    control: ['IP55 Enclosure', 'DOL Starter', 'HOA selector switch', 'ELCB', 'Indicator lamps', 'MCB, Thermal Overload relay', 'VFC for BMS', 'Door Interlock Isolator'],
    mechanical: [
      '{header} Copper suction and discharge manifold',
      'Isolation valves on suction and discharge port of each pump',
      'NRV on discharge port of each pump',
      'Pressure gauge on discharge manifold',
      'Strainer on suction port of each pump',
      'DRV on discharge port of each pump',
      'Assembled on common base frame',
      'Please refer the attached skid layout*',
    ],
    logicStyle: 'bullets',
    logic: [
      'Transfer pump set consisting of {n} Nos. of {brand} {model} {type} pump close coupled to the motor working as {configText}.',
      'The pumps shall be controlled by means of set of float switches, which shall be installed in the Roof & Ground water tanks.',
      'When the water level in the roof tank reaches the pre-set level of the float switch FS1, it will give signal to start the duty pump and it will continue till the float switch reaches the pre-set level to stop and cut-off the pump.',
      'The pumping sequence will be alternated in each cycle through cyclic changeover relay.',
      'One float switch in the ground water tank will protect the pump if the suction tank is empty.',
    ],
    scope: 'Transfer pump set with {n} nos of pumps with copper pipework and DOL starter panel.',
  },
  'booster-vfd': {
    label: 'Booster Pump System – with VFD',
    category: 'booster',
    title: 'WATER BOOSTER PUMP SET',
    pumpType: 'Horizontal Multistage',
    motor: 'TEFC, IEC, 1.1 KW, 3 PHASE, 400V, 50HZ',
    header: '2"x2"',
    vessel: '60',
    moc: [
      ['PUMP CHAMBER', 'SS 316L'],
      ['IMPELLER', 'SS 316L'],
      ['SHAFT', 'SS 316L'],
    ],
    control: ['Inbuilt VFD'],
    mechanical: [
      '{header} Copper suction and discharge header',
      '{vessel} Liter pressure vessel, pressure switch',
      'Isolating valves on suction and discharge of each pump',
      'NRV on discharge of each pump',
      'Pressure gauge on discharge header',
      'Strainer on suction of each pump',
      'DRV on discharge of each pump',
      'Assembled on common base frame',
      'Please refer the attached skid layout*',
    ],
    logicStyle: 'paragraphs',
    logic: [
      'Booster pump set consisting of {n} nos of {brand} {model}. The pumps shall be controlled by means of pressure transducer which shall be installed on the discharge header. Whenever pressure goes down below the set pressure, the duty pump will start and adapts its speed to the set point with VFD, and will function at 100% capacity. Second pump will be acting as standby, and third pump will be acting as assist. Adequate size of pressure vessel provided to maintain the pressure and avoid hunting. The pressure vessel can take care of minor leakage & small demand. When the request decreases, the pumps stop successively.',
      'In addition, the pumping sequence shall be alternated after each ON/OFF. All pumps will be working in cyclic order. Inbuilt dry run protection.',
    ],
    scope: 'Booster pump set with {n} nos of pumps with VFD, copper pipework, terminal panel and {vessel} Liter pressure vessel.',
  },
  'booster-fixed': {
    label: 'Booster Pump System – without VFD',
    category: 'booster',
    title: 'WATER BOOSTER PUMP SET',
    pumpType: 'Horizontal Multistage',
    motor: 'TEFC, IEC, 1.1 KW, 3 PHASE, 400V, 50HZ',
    header: '2"x2"',
    vessel: '60',
    moc: [
      ['PUMP CHAMBER', 'SS 316L'],
      ['IMPELLER', 'SS 316L'],
      ['SHAFT', 'SS 316L'],
    ],
    control: ['IP55 Enclosure', 'DOL Starter', 'HOA selector switch', 'Pressure switches', 'ELCB', 'Indicator lamps', 'MCB, Thermal Overload relay', 'Phase failure relay', 'VFC for BMS', 'Door Interlock Isolator'],
    mechanical: [
      '{header} Copper suction and discharge header',
      '{vessel} Liter pressure vessel',
      'Isolating valves on suction and discharge of each pump',
      'NRV on discharge of each pump',
      'Pressure gauge on discharge header',
      'Strainer on suction of each pump',
      'DRV on discharge of each pump',
      'Assembled on common base frame',
      'Please refer the attached skid layout*',
    ],
    logicStyle: 'paragraphs',
    logic: [
      'Booster pump set consisting of {n} nos of {brand} {model} working as {configText}, running at fixed speed. The pumps shall be controlled by means of pressure switches installed on the discharge header. When the system pressure drops below the cut-in setting of pressure switch PS-1, the duty pump will start and run at full speed. If the demand increases and the pressure continues to drop to the setting of pressure switch PS-2, the assist pump will start. When the demand decreases and the pressure rises to the cut-out setting, the pumps stop successively.',
      'Adequate size of pressure vessel ({vessel} L) is provided to maintain the pressure, avoid frequent starting of the pumps and take care of minor leakage & small demand.',
      'In addition, the pumping sequence shall be alternated after each ON/OFF. In case of duty pump failure, the standby pump shall start automatically. A float switch in the suction tank protects the pumps against dry running.',
    ],
    scope: 'Booster pump set with {n} nos of pumps with copper pipework, DOL starter panel and {vessel} Liter pressure vessel.',
  },
  circulation: {
    label: 'Circulation Pump System',
    category: 'circulation',
    title: 'WATER CIRCULATION PUMP SET',
    pumpType: 'Horizontal Multistage',
    motor: 'TEFC, IEC, 2.2 KW, 3 PHASE, 400V, 50HZ',
    header: '2"x1.5"',
    vessel: '',
    moc: [
      ['PUMP CHAMBER', 'SS 316L'],
      ['IMPELLER', 'SS 316L'],
      ['SHAFT', 'SS 316L'],
    ],
    control: ['IP55 Enclosure', 'DOL Starter', 'HOA selector switch', 'ELCB', 'Indicator lamps', 'MCB, Thermal Overload relay', 'VFC for BMS', 'Door Interlock Isolator'],
    mechanical: [
      '{header} Copper suction and discharge manifold',
      'Isolation valves on suction and discharge port of each pump',
      'NRV on discharge port of each pump',
      'Pressure gauge on discharge manifold',
      'Strainer on suction port of each pump',
      'DRV on discharge port of each pump',
      'Assembled on common base frame',
      'Please refer the attached skid layout*',
    ],
    logicStyle: 'bullets',
    logic: [
      'Circulation pump set consisting of {n} Nos. of {brand} {model} {type} pump close coupled to the motor working as {configText}.',
      'Duty pump will start as per the 24 hrs timer setting, that is every 30 minutes the pump starts for some minutes and stops, and vice versa.',
    ],
    scope: 'Circulation pump set with {n} nos of pumps with copper pipework and DOL starter panel.',
  },
  sump: {
    label: 'Sump Pump System',
    category: 'sump',
    title: 'SUMP PUMP SYSTEM',
    pumpType: 'Submersible Sewage Pump',
    motor: '1.6 KW, 3 PHASE, 400V, 50HZ',
    header: '',
    vessel: '',
    moc: [
      ['IMPELLER', 'Cast iron EN GJL200'],
      ['SHAFT', 'Stainless steel AISI416'],
    ],
    control: ['IP55 Enclosure', 'DOL Starter', 'HOA selector switch', 'ELR', 'CBCT', 'Indicator lamps', 'MCB, Thermal Overload relay', 'VFC for BMS'],
    mechanical: [],
    logicStyle: 'bullets',
    logic: [
      'The sump pump installation shall consist of {n} pumps of equal size.',
      'The pumps shall be connected in parallel arrangement.',
      'The pump station shall be equipped with an electrical control panel, which shall control and provide power to the pumps.',
      'The pumps are controlled by means of set of float switches, which shall be installed in the pump pit.',
      'The pump shall alternate after each on/off function to ensure equal running time.',
      'Float switch FS-2 shall activate the leading pump when the indicated level is reached.',
      'Should the level rise further to float switch FS-3, the assist pump will get activated.',
      'Both the pumps shall be de-activated when the level falls to float switch FS-1.',
      'In case of the level rising to high-level float switch FS-4, a high level alarm shall be automatically activated. The alarm shall only be de-activated by means of a reset button. In addition, the pumping sequence shall be altered after each on/off function.',
      'In the case of pump failure, the stand-by pump shall be activated automatically.',
    ],
    scope: 'Pump sets with {n} nos of pumps and control panel, loose supply with 4 nos of float switches.',
  },
};

export const newLiterature = (template = 'transfer', o = {}) => {
  const t = LIT_TEMPLATES[template];
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  return {
    template,
    tag: '',
    category: t.category,
    title: `${t.title}- (H2-A)`,
    config: template === 'booster-vfd' || template === 'booster-fixed' ? '1D+1S+1A' : '1D+1S',
    brand: 'FRANKLIN ELECTRIC',
    model: '',
    pumpType: t.pumpType,
    motor: t.motor,
    certification: template === 'sump' ? '' : 'WRAS, ACS',
    reqFlow: '',
    reqHead: '',
    propFlow: '',
    propHead: '',
    header: t.header,
    vessel: t.vessel,
    moc: t.moc.map(([k, v]) => ({ k, v })),
    control: t.control.join('\n'),
    mechanical: t.mechanical.join('\n'),
    logicStyle: t.logicStyle,
    logic: t.logic.join('\n'),
    scope: t.scope,
    cover: false,
    image: null,
    ...o,
    id,
  };
};

/** Total number of pumps from a configuration such as "1D+1S+1A". */
export const pumpCount = (config) => {
  const nums = String(config || '').match(/\d+/g);
  return nums ? nums.reduce((s, x) => s + Number(x), 0) : 1;
};

export function configText(config) {
  const parts = String(config || '')
    .toUpperCase()
    .match(/(\d+)\s*([DSA])/g);
  if (!parts) return config || '';
  const word = { D: 'Duty', S: 'Standby', A: 'Assist' };
  return parts.map((p) => `${p.match(/\d+/)[0]} ${word[p.slice(-1)]}`).join(' + ');
}

/** Replace {placeholders} in literature text. */
export function fillText(text, lit) {
  const map = {
    brand: titleCase(lit.brand),
    model: lit.model || '[model]',
    type: lit.pumpType || '',
    n: String(pumpCount(lit.config)),
    config: lit.config || '',
    configText: configText(lit.config),
    header: lit.header || '',
    vessel: lit.vessel || '',
    title: lit.title || '',
  };
  return String(text || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const lines = (s) =>
  String(s || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export const dutyText = (q, h) => (q || h ? `${q || '–'} (LPS) AT ${h || '–'} M` : '–');

export const literatureLabel = (lit) => `Technical Literature – ${lit.title || LIT_TEMPLATES[lit.template]?.label}`;

/** Parse "6.2 LPS @ 4 BAR" / "6.4 LPS @ 10 M" → { flow, head (m) }. */
export function parseDuty(text) {
  const m = String(text || '').match(/([\d.]+)\s*L\/?P?S.*?@\s*([\d.]+)\s*(BAR|M)/i);
  if (!m) return null;
  return { flow: m[1], head: m[3].toUpperCase() === 'BAR' ? (Number(m[2]) * 10.197).toFixed(1) : m[2] };
}

/**
 * Technical literature expressed as a calculation-sheet object, so it is rendered with the
 * same header, title bar, tables, fonts and alignment as the hydraulic calculation sheets.
 * @param {object} lit literature record
 * @param {{ imageSrc?: string, pdfImage?: any }} [img] product photo for HTML (src) / PDF (embedded image)
 */
export function literatureSheet(lit, img = {}) {
  const f = (t) => fillText(t, lit);
  const listRows = (items) => items.map((t, k) => ({ c: [String(k + 1), f(t)] }));
  const listCols = (label) => [
    { label: 'No.', w: 0.06, align: 'c' },
    { label, w: 0.94 },
  ];
  const sections = [
    {
      type: 'info',
      title: '1. PUMP SET INFORMATION',
      rows: [
        ['System', lit.title || '–'],
        ['Project', '@projectName'],
        ['Client', '@client'],
        ['Consultant', '@consultant'],
        ['Configuration', `${lit.config || '–'}${lit.config ? `  (${configText(lit.config)})` : ''}`],
        ['Brand', titleCase(lit.brand) || '–'],
        ['Pump Model (Type)', `${lit.model || '–'}${lit.pumpType ? ` (${lit.pumpType})` : ''}`],
        ...(lit.motor ? [['Motor', lit.motor]] : []),
        ...(lit.certification ? [['Certification', lit.certification]] : []),
      ],
    },
    {
      type: 'grid',
      title: '2. DUTY POINT',
      columns: [
        { label: 'Duty', w: 0.4 },
        { label: 'Flow (L/s)', w: 0.2, align: 'c' },
        { label: 'Head (m)', w: 0.2, align: 'c' },
        { label: 'Head (bar)', w: 0.2, align: 'c' },
      ],
      rows: [
        { c: ['Requested duty (consultant specification)', lit.reqFlow || '–', lit.reqHead || '–', lit.reqHead ? (Number(lit.reqHead) / 10.197).toFixed(2) : '–'] },
        { c: ['Proposed duty (selected pump)', lit.propFlow || '–', lit.propHead || '–', lit.propHead ? (Number(lit.propHead) / 10.197).toFixed(2) : '–'], bold: true },
      ],
    },
  ];
  let n = 3;
  const moc = (lit.moc || []).filter((m) => m.k || m.v);
  if (moc.length)
    sections.push({
      type: 'grid',
      title: `${n++}. MATERIAL OF CONSTRUCTION`,
      columns: [
        { label: 'No.', w: 0.06, align: 'c' },
        { label: 'Component', w: 0.34 },
        { label: 'Material', w: 0.6 },
      ],
      rows: moc.map((m, k) => ({ c: [String(k + 1), String(m.k || '').toUpperCase(), m.v] })),
    });
  const control = lines(lit.control);
  if (control.length) sections.push({ type: 'grid', title: `${n++}. CONTROL FEATURES`, columns: listCols('Feature'), rows: listRows(control) });
  const mech = lines(lit.mechanical);
  if (mech.length) sections.push({ type: 'grid', title: `${n++}. MECHANICAL FEATURES`, columns: listCols('Feature'), rows: listRows(mech) });
  const logic = lines(lit.logic);
  if (logic.length) sections.push({ type: 'grid', title: `${n++}. LOGIC OF OPERATION`, columns: listCols('Description'), rows: listRows(logic) });
  if (lit.image && (img.imageSrc || img.pdfImage)) sections.push({ type: 'image', title: `${n++}. PRODUCT IMAGE`, src: img.imageSrc, pdfImage: img.pdfImage });
  if (lit.scope) {
    sections.push({ type: 'result', text: `Scope of supply: ${f(lit.scope)}` });
  }
  return {
    docTitle: `TECHNICAL LITERATURE – ${String(lit.title || '').toUpperCase()}`,
    sheetLabel: 'TECHNICAL LITERATURE',
    calcType: 'Technical Literature',
    tag: lit.tag || '–',
    service: lit.title,
    sections,
  };
}

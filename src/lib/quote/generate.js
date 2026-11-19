// Quote → submittal generator: builds project header, pump schedule, technical literature
// and the submittal index from a reviewed quotation + the saved Document Library.
import { newLiterature, LIT_TEMPLATES } from '../literature.js';
import { emptyScheduleRow } from '../pdf/schedulePdf.js';

/** Constant documents kept in the library (slot key → index title). */
export const LIBRARY_DOCS = [
  { key: 'lib-company-profile', title: 'COMPANY PROFILE', desc: 'Greenland company profile' },
  { key: 'lib-commercial-license', title: 'COMMERCIAL LICENSE', desc: 'Trade licence, commercial register, chamber membership' },
  { key: 'lib-authorization', title: 'AUTHORIZATION LETTER', desc: 'Manufacturer authorization / distributorship letter' },
  { key: 'lib-manufacturer-profile', title: 'MANUFACTURER PROFILE', desc: 'Franklin Electric profile & product portfolio' },
  { key: 'lib-project-references', title: 'PREVIOUS PROJECT REFERENCES', desc: 'Reference list of supplied projects' },
  { key: 'lib-project-approvals', title: 'PREVIOUS PROJECT APPROVALS', desc: 'Approved submittals / approval letters' },
  { key: 'lib-iso', title: 'ISO CERTIFICATES', desc: 'ISO 9001 / 14001 / 45001 certificates' },
  { key: 'lib-country-origin', title: 'COUNTRY OF ORIGIN', desc: 'Country-of-origin certificate / declaration' },
];

export const DEFAULT_LIBRARY = () => ({
  models: [],
  settings: {
    material: 'WATER SUPPLY PUMPS',
    brand: 'FRANKLIN ELECTRIC PUMPS',
    supplierLine: 'M/S. GREENLAND EQUIPMENT & MACHINERY EST LLC',
    certs: { transfer: 'WRAS, ACS', 'booster-vfd': 'WRAS, ACS', 'booster-fixed': 'WRAS, ACS', circulation: 'WRAS, ACS', sump: '' },
    motorClass: 'IE3',
    warrantyCertify:
      'This is to certify that the {brand} {equipment} supplied vide our Invoice ________ dated ________ DO# ________ for the above project are covered under a warranty for {period}, against manufacturing defects under normal operating conditions.',
    warrantyFor: 'For: GREENLAND EQUIPMENT & MACHINERY EST. L.L.C',
    warrantyTerms: [
      'This warranty applies to any/all defects arising out of faulty design/manufacturing/workmanship/materials and shall be fit for the purposes for which they are purchased by written order and as per the agreed specifications.',
      "The products shall be used strictly in accordance with the manufacturer's guidelines and only for the specified purpose.",
      'The products shall be used within the specified limits/ratings.',
      'This warranty does not apply to any wearing parts or to any non-conformance/defect directly or indirectly caused by:',
      'Operation of the products beyond its rated/specified limits or capabilities;',
      'Abuse, misuse or negligent operation of the products;',
      "Non-observance of the manufacturer's guidelines like operation and installation manuals.",
      'Alteration/modification of original design.',
      'Use of spare parts other than genuine spares from authorized agency.',
      'Service, if any, should be referred only to the supplier or any agency authorized by the supplier; Our Service Department email, support@greenland.ae',
      'This warranty becomes null & void if the product is tampered with, adjusted or repaired by any unauthorized party.',
      'This warranty becomes null & void if the payment terms agreed between the buyer and supplier (Greenland Equipment & Machinery EST. LLC) is not honoured.',
    ].join('\n'),
  },
});

const norm = (s) => String(s || '').toUpperCase().replace(/[\s_]/g, '');
/** Find a library model for a quoted model code (exact, or one is a prefix of the other). */
export function matchModel(models, code) {
  const c = norm(code);
  if (!c) return null;
  return models.find((m) => norm(m.model) === c) || models.find((m) => norm(m.model).length >= 6 && (c.startsWith(norm(m.model)) || norm(m.model).startsWith(c))) || null;
}

const CATEGORY = { transfer: 'transfer', 'booster-vfd': 'booster', 'booster-fixed': 'booster', circulation: 'circulation', sump: 'sump' };
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const n2 = (x) => (x == null || x === '' ? '' : String(Math.round(Number(x) * 100) / 100));

/** Tag found in a title, e.g. "BP 02", "HWCP-01". */
export const tagFrom = (title) => (String(title).match(/\b([A-Z]{1,5}[- ]?\d{1,3})\b/) || [])[1] || '';

/** System name for schedule / literature from a quote title. */
export function systemName(it) {
  const tag = tagFrom(it.title);
  const t = String(it.title || '')
    .replace(tag ? new RegExp(`\\b${tag.replace(/[-\s]/g, '[-\\s]?')}\\b`) : /^$/, '')
    .replace(/\bWITH\s+INBUILD\s+VFD\b/i, '')
    .replace(/\bWITH\s+INBUILT\s+VFD\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.toUpperCase() || LIT_TEMPLATES[it.template]?.title || 'PUMP SET';
}

export const literatureTitle = (it) => `TECHNICAL LITERATURE – ${it.system || systemName(it)} – ${n2(it.flowLps)} LPS AT ${n2(it.headM)} M – ${it.arrangement || ''}`.replace(/\s+–\s*$/, '');

/** Plain-language equipment list for the warranty certificate. */
export function equipmentText(items) {
  const names = [...new Set(items.map((it) => ({ transfer: 'transfer pump sets', 'booster-vfd': 'booster pump sets', 'booster-fixed': 'booster pump sets', circulation: 'circulation pump sets', sump: 'sump / sewage pump sets' })[it.template] || 'pump sets'))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] || 'pump sets';
}

/**
 * @param {{header: object, items: object[]}} quote reviewed quote (items have include/system/template/tag fields)
 * @param {object} form project form
 * @param {{models: object[], settings: object}} library
 */
export function generateFromQuote(quote, form, library) {
  const items = quote.items.filter((it) => it.include !== false);
  const S = library.settings;
  const project = {
    projectName: form.projectName,
    client: form.client,
    consultant: form.consultant,
    contractor: form.contractor,
    refNo: form.refNo,
    revision: form.revision || '0',
    date: form.date,
    plot: form.plot,
    material: form.material,
    brand: form.brand,
    subject: `Material Submittal – ${titleCase(form.material || 'Pumps')}`,
    quoteNo: quote.header.quoteNo,
  };

  const literature = items.map((it) => {
    const tpl = it.template;
    const model = matchModel(library.models, it.model);
    const moc = [
      it.housing && { k: 'PUMP HOUSING', v: it.housing },
      it.impeller && { k: 'IMPELLER', v: it.impeller },
      it.shaft && { k: 'SHAFT', v: it.shaft },
    ].filter(Boolean);
    const phase = Number(it.phase) || 3;
    const base = newLiterature(tpl, {});
    return newLiterature(tpl, {
      title: it.system || systemName(it),
      tag: it.tag || tagFrom(it.title),
      category: CATEGORY[tpl] || 'booster',
      config: it.arrangement || base.config,
      brand: String(it.make || 'FRANKLIN ELECTRIC').toUpperCase(),
      model: it.model,
      pumpType: it.type || base.pumpType,
      motor: it.kw ? `TEFC, IEC, ${it.kw} KW, ${phase} PHASE, ${phase === 1 ? '230V' : '400V'}, 50HZ` : base.motor,
      certification: S.certs?.[tpl] ?? base.certification,
      reqFlow: n2(it.reqFlow),
      reqHead: n2(it.reqHead),
      propFlow: n2(it.flowLps),
      propHead: n2(it.headM),
      header: it.header || base.header,
      vessel: it.vessel || (tpl.startsWith('booster') ? base.vessel : ''),
      moc: moc.length ? moc : base.moc,
      control: it.electrical?.length ? it.electrical.join('\n') : base.control,
      mechanical: it.mechanical?.length ? [...it.mechanical.map((m) => m.replace(/\.$/, '')), 'Please refer the attached skid layout*'].join('\n') : base.mechanical,
      libModel: model?.id || null,
      fromQuote: quote.header.quoteNo || true,
    });
  });

  const schedule = {
    title: 'PUMP SCHEDULE',
    subtitle: `${String(form.brand || 'FRANKLIN ELECTRIC PUMPS').toUpperCase()} — ${String(form.material || '').toUpperCase()}`,
    notes: '',
    rows: items.map((it) =>
      emptyScheduleRow({
        tag: it.tag || tagFrom(it.title),
        system: it.system || systemName(it),
        config: it.arrangement,
        qty: String(it.qty ?? 1),
        specFlow: n2(it.reqFlow),
        specHead: n2(it.reqHead),
        propFlow: n2(it.flowLps),
        propHead: n2(it.headM),
        brand: titleCase(it.make || 'Franklin Electric'),
        model: it.model,
        type: it.type,
        moc: [it.housing && `Casing - ${it.housing}`, it.impeller && `Impeller - ${it.impeller}`, it.shaft && `Shaft - ${it.shaft}`].filter(Boolean).join(', '),
        certs: S.certs?.[it.template] || 'NA',
        eff: '',
        power: it.kw ? Number(it.kw).toFixed(2) : '',
        speed: it.rpm ? String(Math.round(it.rpm)) : '',
        motorClass: S.motorClass || '',
        vessel: it.vessel ? `${it.vessel}L` : 'NA',
        header: it.header || 'NA',
        phase: it.phase ? String(it.phase) : '',
        starter: it.vfd ? 'VFD' : 'DOL',
      }),
    ),
  };

  const uid = () => Math.random().toString(36).slice(2, 10);
  const lib = (doc) => ({ id: uid(), title: doc.title, kind: 'upload', libSlot: doc.key, include: true });
  const L = Object.fromEntries(LIBRARY_DOCS.map((d) => [d.key, d]));
  const entries = [
    lib(L['lib-company-profile']),
    lib(L['lib-commercial-license']),
    lib(L['lib-authorization']),
    lib(L['lib-manufacturer-profile']),
    { id: uid(), title: 'TECHNICAL COMPLIANCE STATEMENT', kind: 'upload', include: true },
    { id: uid(), title: 'PUMP SCHEDULE', kind: 'schedule', include: true },
    ...literature.map((lt, k) => ({ id: uid(), title: literatureTitle({ ...items[k], system: lt.title }), kind: 'technical', category: lt.category, litId: lt.id, include: true })),
    lib(L['lib-project-references']),
    lib(L['lib-project-approvals']),
    lib(L['lib-iso']),
    lib(L['lib-country-origin']),
    { id: uid(), title: 'WARRANTY CERTIFICATE - DRAFT', kind: 'warranty', include: true },
  ];

  const warranty = {
    period: form.warrantyPeriod || quote.header.warranty || 'THREE years from the date of Initial Start',
    equipment: form.warrantyEquipment || equipmentText(items),
  };

  return { project, literature, schedule, entries, warranty };
}

/**
 * Warranty certificate (draft) as a sheet – rendered with the calculation-sheet engine.
 */
export function warrantySheet(project = {}, warranty = {}, settings = DEFAULT_LIBRARY().settings) {
  const fill = (t) =>
    String(t || '')
      .replace(/\{brand\}/g, titleCase(project.brand || 'Franklin Electric'))
      .replace(/\{equipment\}/g, warranty.equipment || 'pump sets')
      .replace(/\{period\}/g, warranty.period || '________')
      .replace(/\{project\}/g, project.projectName || '');
  const terms = String(settings.warrantyTerms || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    docTitle: 'CERTIFICATE OF WARRANTY',
    sheetLabel: 'WARRANTY CERTIFICATE – DRAFT',
    calcType: 'Warranty Certificate',
    tag: project.quoteNo || '–',
    service: 'Warranty',
    watermark: 'DRAFT',
    signatures: false,
    sections: [
      {
        type: 'info',
        title: '1. PROJECT DETAILS',
        rows: [
          ['Project', '@projectName'],
          ...(project.plot ? [['Plot', project.plot]] : []),
          ['Client', '@client'],
          ['MEP Consultant', '@consultant'],
          ['Main Contractor', '@contractor'],
          ['Supplier', settings.supplierLine || '@supplier'],
          ['Material', project.material || '–'],
          ['Brand', project.brand || '–'],
        ],
      },
      { type: 'para', title: '2. WARRANTY', text: fill(settings.warrantyCertify) },
      { type: 'para', text: `${settings.warrantyFor || ''}\n\n\n______________________________\nAUTHORIZED SIGNATORY` },
      {
        type: 'grid',
        title: '3. WARRANTY TERMS AND CONDITIONS',
        columns: [
          { label: 'No.', w: 0.06, align: 'c' },
          { label: 'Term / condition', w: 0.94 },
        ],
        rows: terms.map((t, k) => ({ c: [String(k + 1), t] })),
      },
    ],
  };
}

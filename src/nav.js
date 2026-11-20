// One map of every page, grouped in workflow order: Design → Submittal → Replies.
// Used by the top menu, the mobile menu, the search (Ctrl+K) and the home page.
import { ArrowUpDown, Waves, TableProperties, BookOpen, Package, MessageSquareReply, FileInput, ClipboardCheck, Library, Calculator, FolderOpen, ClipboardList } from 'lucide-react';
import { CALC_ITEMS } from './modules/home/items.js';
import { TOOL_ITEMS } from './modules/tools/ToolsTab.jsx';

const calc = CALC_ITEMS.filter((c) => c.key !== 'drawing').map((c) => ({ ...c, route: `calc/${c.key}`, keys: 'calculation pump head flow sheet' }));
const drawing = CALC_ITEMS.filter((c) => c.key === 'drawing').flatMap((c) => [
  { ...c, key: 'drawing', label: 'Booster from Drawings', desc: 'Riser + floor plans → fixtures per floor, critical floor & head', route: 'calc/drawing', keys: 'dwg pdf plan riser route fixtures autocad revit booster' },
  { ...c, key: 'drawing-transfer', label: 'Transfer from Drawings', icon: ArrowUpDown, desc: 'Tank volumes & transfer main from the drawings → flow & head', route: 'calc/drawing-transfer', keys: 'dwg pdf transfer tank roof filling' },
  { ...c, key: 'drawing-sump', label: 'Sump from Drawings', icon: Waves, desc: 'Pit size & discharge main from the drawings → flow & head', route: 'calc/drawing-sump', keys: 'dwg pdf sump pit drainage sewage discharge' },
]);
const tools = TOOL_ITEMS.map((t) => ({ ...t, route: `tools/${t.key}`, keys: 'tool quick calculator' }));

export const NAV = [
  {
    key: 'design',
    label: 'Design',
    icon: Calculator,
    desc: 'Size pump sets – by hand, from drawings, or with quick tools',
    folders: ['calc', 'tools'],
    sections: [
      { title: 'Pump set calculations', items: calc },
      { title: 'From drawings', items: drawing },
      { title: 'Engineering tools', items: tools },
    ],
  },
  {
    key: 'submittal',
    label: 'Submittal',
    icon: FolderOpen,
    desc: 'Everything that goes into the technical submittal',
    folders: ['quote', 'schedule', 'literature', 'submittal'],
    sections: [
      { title: 'Start from a quotation', items: [{ key: 'quote', label: 'Quote → Submittal', icon: FileInput, desc: 'Read a quotation PDF and generate the whole submittal', route: 'quote/generate', keys: 'quotation generate auto' }] },
      {
        title: 'Documents',
        items: [
          { key: 'schedule', label: 'Pump Schedule', icon: TableProperties, desc: 'SOM-format schedule – specified vs proposed duty', route: 'schedule', keys: 'som table excel' },
          { key: 'literature', label: 'Technical Literature', icon: BookOpen, desc: 'Transfer / booster / circulation / sump write-ups', route: 'literature', keys: 'datasheet drawing description' },
          { key: 'compliance', label: 'Compliance Statement', icon: ClipboardCheck, desc: 'Specification clauses → compliance statement', route: 'quote/compliance', keys: 'spec specification tcs clause' },
          { key: 'library', label: 'Document Library', icon: Library, desc: 'Company documents, datasheets & drawings saved once', route: 'quote/library', keys: 'cloud upload certificates trade licence' },
        ],
      },
      { title: 'Compile', items: [{ key: 'submittal', label: 'Submittal Package', icon: Package, desc: 'Project header, index, uploads → one A4 PDF', route: 'submittal', keys: 'compile index cover toc compress' }] },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    icon: ClipboardList,
    desc: 'Order processing file – quote, LPO, costing, item codes, datasheets',
    folders: ['orders'],
    route: 'orders',
    sections: [{ title: 'Order processing', items: [{ key: 'orders', label: 'Order Processing', icon: ClipboardList, desc: 'Final quote, LPO, costing & margin, item codes, datasheets → one PDF', route: 'orders', keys: 'order lpo costing margin cost item code purchase' }] }],
  },
  {
    key: 'replies',
    label: 'Replies',
    icon: MessageSquareReply,
    desc: 'Reply to consultant comments with annexures',
    folders: ['replies'],
    route: 'replies',
    sections: [{ title: 'Consultant comments', items: [{ key: 'replies', label: 'Comment Replies', icon: MessageSquareReply, desc: 'Comments, replies, status & annexures → one PDF', route: 'replies', keys: 'consultant comment mar revision' }] }],
  },
];

/** Flat list for search. */
export const ALL_PAGES = NAV.flatMap((g) => g.sections.flatMap((s) => s.items.map((it) => ({ ...it, group: g.label, section: s.title }))));

export const groupOf = (folder) => NAV.find((g) => g.folders.includes(folder))?.key || null;

/** Score a page against a query (all words must match somewhere). */
export function searchPages(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ALL_PAGES;
  return ALL_PAGES.map((p) => {
    const hay = `${p.label} ${p.desc || ''} ${p.keys || ''} ${p.section} ${p.group}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return null;
    const score = words.reduce((s, w) => s + (p.label.toLowerCase().includes(w) ? 3 : 1), 0);
    return { ...p, score };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

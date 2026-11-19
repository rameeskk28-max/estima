// Consultant comment reply / submittal revision documents.

export const REPLY_STATUS = {
  comply: { label: 'COMPLY', tone: 'green' },
  partial: { label: 'PARTIALLY COMPLY', tone: 'amber' },
  deviation: { label: 'DEVIATION', tone: 'red' },
  noted: { label: 'NOTED', tone: 'blue' },
};

export const APPROVAL_STATUS = [
  'A – Approved',
  'B – Approved as Noted',
  'C – Revise & Resubmit',
  'D – Rejected',
  'Re-Submit as Noted',
];

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export const newComment = (o = {}) => ({ id: rid(), comment: '', reply: '', status: 'comply', annexure: '', ...o });
export const newAnnexure = (o = {}) => ({ id: rid(), desc: '', ...o });

export const newReply = (o = {}) => {
  const ann = newAnnexure({ desc: 'Revised drawings' });
  return {
    title: 'CONSULTANT COMMENT REPLY & DRAWING COMPLIANCE REVIEW',
    subject: '',
    tag: '',
    marNo: '',
    rev: '01',
    marDate: '',
    replyDate: new Date().toISOString().slice(0, 10),
    consultantEng: '',
    consultantMepEng: '',
    trade: '',
    consultantRep: '',
    approvalStatus: 'Re-Submit as Noted',
    comments: [newComment({ annexure: ann.id })],
    annexures: [ann],
    showStamp: true,
    ...o,
    id: rid(),
  };
};

/** "Annexure 01", "Annexure 02" … by position. */
export const annexureLabel = (reply, annId) => {
  const k = reply.annexures.findIndex((a) => a.id === annId);
  return k >= 0 ? `Annexure ${String(k + 1).padStart(2, '0')}` : '';
};

/** Text for the 4th column: status + annexure reference. */
export function annexureCell(reply, c) {
  const st = REPLY_STATUS[c.status]?.label || '';
  const ann = annexureLabel(reply, c.annexure);
  return [st, ann ? `Refer ${ann}` : ''].filter(Boolean).join('\n');
}

/** Slot ids for uploaded PDFs (IndexedDB). */
export const annexureSlot = (reply, a) => `reply-${reply.id}-ann-${a.id}`;
export const prevSlot = (reply) => `reply-${reply.id}-prev`;

/**
 * Reply document as a calculation-sheet object (same header, title bar, tables, signatures).
 * @param {object} reply
 * @param {object} project
 * @param {{ stampSrc?: string, stampPdf?: any, pageCounts?: Record<string, number>, prevPages?: number }} [extra]
 */
export function replySheet(reply, project = {}, extra = {}) {
  const counts = extra.pageCounts || {};
  const comments = reply.comments.filter((c) => c.comment || c.reply);
  const sections = [
    {
      type: 'info',
      title: '1. PROJECT / SUBMITTAL INFORMATION',
      rows: [
        ['Project Title', '@projectName'],
        ['Client', '@client'],
        ['Consultant', '@consultant'],
        ['Contractor', '@contractor'],
        ...(reply.subject ? [['Submittal / Subject', reply.subject]] : []),
        ...(reply.consultantEng ? [["Consultant's Eng.", reply.consultantEng]] : []),
        ...(reply.consultantMepEng ? [["Consultant's MEP Eng.", reply.consultantMepEng]] : []),
        ...(reply.trade ? [['Trade', reply.trade]] : []),
        ['MAR No.', reply.marNo || '–'],
        ['Rev.', reply.rev || '–'],
        ['MAR Date', fmtDay(reply.marDate) || '–'],
        ...(reply.consultantRep ? [["Name of Consultant's Representative", reply.consultantRep]] : []),
        ['Approval-status annotation', reply.approvalStatus || '–'],
      ],
    },
    {
      type: 'grid',
      title: '2. CONSULTANT COMMENTS & SUPPLIER REPLY',
      columns: [
        { label: 'No.', w: 0.055, align: 'c' },
        { label: 'Consultant comment', w: 0.375 },
        { label: `${shortSupplier(project)} reply / action`, w: 0.395 },
        { label: 'Annexure reference', w: 0.175, align: 'c' },
      ],
      rows: comments.length
        ? comments.map((c, k) => ({ c: [String(k + 1), c.comment, c.reply, annexureCell(reply, c)], tone: { col: 3, color: REPLY_STATUS[c.status]?.tone || 'blue' } }))
        : [{ c: ['–', 'No comments entered', '', ''] }],
    },
  ];
  const summary = Object.entries(REPLY_STATUS)
    .map(([k, s]) => [s.label, comments.filter((c) => c.status === k).length])
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${l}: ${n}`)
    .join('   ·   ');
  if (summary) sections.push({ type: 'note', text: `Summary of replies – ${summary}` });
  if (reply.annexures.length)
    sections.push({
      type: 'grid',
      title: '3. ANNEXURE INDEX',
      columns: [
        { label: 'Annexure', w: 0.18, align: 'c' },
        { label: 'Description', w: 0.52 },
        { label: 'Referred in comment(s)', w: 0.18, align: 'c' },
        { label: 'Pages', w: 0.12, align: 'c' },
      ],
      rows: reply.annexures.map((a, k) => {
        const refs = comments.map((c, i) => (c.annexure === a.id ? i + 1 : null)).filter(Boolean);
        return { c: [`Annexure ${String(k + 1).padStart(2, '0')}`, a.desc || '–', refs.length ? refs.join(', ') : '–', counts[a.id] != null ? String(counts[a.id]) : '–'] };
      }),
    });
  if (extra.prevPages) sections.push({ type: 'note', text: `Previous submittal attached at the end of this document (${extra.prevPages} page${extra.prevPages > 1 ? 's' : ''}).` });
  if (reply.showStamp !== false && (extra.stampSrc || extra.stampPdf)) sections.push({ type: 'image', src: extra.stampSrc, pdfImage: extra.stampPdf, height: 110, boxWidth: 0.34, align: 'right', caption: 'COMPANY STAMP' });
  return {
    docTitle: String(reply.title || 'CONSULTANT COMMENT REPLY').toUpperCase(),
    sheetLabel: 'CONSULTANT COMMENT REPLY',
    calcType: 'Consultant Comment Reply',
    tag: reply.tag || '–',
    ref: reply.marNo || undefined,
    rev: reply.rev || undefined,
    date: reply.replyDate || undefined,
    service: reply.subject,
    sections,
  };
}

const shortSupplier = (project) => {
  const s = String(project.supplier || 'Supplier').trim();
  return s.split(/\s+/)[0].replace(/[^\w&-]/g, '') || 'Supplier';
};

function fmtDay(d) {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

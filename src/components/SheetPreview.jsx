import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, LoaderCircle } from 'lucide-react';
import { Modal, downloadBytes, safeName } from './ui.jsx';
import { buildCalcSheetPdf, sectionTable } from '../lib/pdf/calcSheet.js';
import { fmtDate } from '../lib/pdf/theme.js';
import { useStore } from '../store.jsx';

const TONE_CSS = { green: ['#0f7a3d', '#e6f7eb'], amber: ['#a86105', '#fff2d9'], red: ['#bd1a1a', '#fdebeb'], blue: ['#153963', '#f1f5fb'] };

/** HTML A4 rendering of a calculation sheet – mirrors the pdf-lib layout. */
export function SheetHtml({ sheet, project }) {
  const { logoSrc } = useStore();
  return (
    <div className="a4 mx-auto" style={{ position: 'relative', overflow: 'hidden' }}>
      {sheet.watermark && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
          <span style={{ transform: 'rotate(-35deg)', fontSize: '120pt', fontWeight: 800, color: 'rgba(191,26,26,0.12)', letterSpacing: 4 }}>{sheet.watermark}</span>
        </div>
      )}
      <table className="hdr">
        <tbody>
          <tr>
            <td rowSpan={3} style={{ width: '36%' }}>
              <img src={logoSrc} alt={project.supplier || 'Supplier'} style={{ height: '8.5mm', maxWidth: '64mm', objectFit: 'contain', display: 'block' }} />
              <div style={{ fontSize: '6.4pt', fontWeight: 700, color: '#048c3c', marginTop: 2 }}>{sheet.sheetLabel || 'HYDRAULIC CALCULATION SHEET'}</div>
            </td>
            <HdrCell k="Project" v={project.projectName} />
            <HdrCell k="Ref No." v={sheet.ref || project.refNo} />
          </tr>
          <tr>
            <HdrCell k="Tag" v={sheet.tag} />
            <HdrCell k="Rev." v={sheet.rev || project.revision || '0'} />
          </tr>
          <tr>
            <HdrCell k="Date" v={fmtDate(sheet.date || project.date)} />
            <HdrCell k="Sheet" v="1" />
          </tr>
        </tbody>
      </table>
      <div style={{ background: '#06af4b', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: '10pt', padding: '4pt', marginBottom: 8 }}>{sheet.docTitle}</div>

      {sheet.sections.map((sec, si) => {
        if (sec.type === 'result')
          return (
            <div key={si} style={{ background: '#e6f7eb', border: '1pt solid #06af4b', borderLeft: '4pt solid #06af4b', padding: '5pt 8pt', fontWeight: 700, color: '#153963', fontSize: '9pt', margin: '6pt 0' }}>
              {sec.text}
            </div>
          );
        if (sec.type === 'para')
          return (
            <div key={si} style={{ marginBottom: 7 }}>
              {sec.title && <div className="sec-title">{sec.title}</div>}
              <div style={{ whiteSpace: 'pre-line', fontSize: '8.8pt', padding: '4pt 3pt', lineHeight: 1.45 }}>{sec.text}</div>
            </div>
          );
        if (sec.type === 'image')
          return sec.src ? (
            <div key={si} style={{ marginBottom: 7, display: 'flex', flexDirection: 'column', alignItems: sec.align === 'right' ? 'flex-end' : 'stretch' }}>
              {sec.title && <div className="sec-title" style={{ alignSelf: 'stretch' }}>{sec.title}</div>}
              <div style={{ border: '0.5pt solid #bcc9db', width: sec.boxWidth ? `${sec.boxWidth * 100}%` : '100%', height: sec.height ? `${(sec.height / 72) * 25.4}mm` : '60mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                <img src={sec.src} alt={sec.title || sec.caption || 'image'} style={{ maxHeight: sec.caption ? '82%' : '100%', maxWidth: '100%', objectFit: 'contain' }} />
                {sec.caption && <div style={{ fontSize: '6.6pt', fontWeight: 700, color: '#617086', marginTop: 2 }}>{sec.caption}</div>}
              </div>
            </div>
          ) : null;
        if (sec.type === 'note')
          return (
            <p key={si} style={{ fontStyle: 'italic', color: '#617086', fontSize: '7.4pt', margin: '4pt 0 8pt' }}>
              {sec.text}
            </p>
          );
        const t = sectionTable(sec, project);
        const dense = t.columns.length > 8;
        return (
          <div key={si} style={{ marginBottom: 7 }}>
            <div className="sec-title">{sec.title}</div>
            <table className="tbl" style={{ fontSize: dense ? '6.4pt' : '7pt' }}>
              {!t.noHead && (
                <thead>
                  <tr>
                    {t.columns.map((c, k) => (
                      <th key={k} style={{ width: `${c.w * 100}%`, textAlign: c.align === 'c' ? 'center' : 'left' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri} style={r.bold ? { background: '#e6f7eb', fontWeight: 700, color: '#153963' } : undefined}>
                    {r.c.map((cell, k) => (
                      <td
                        key={k}
                        style={{
                          width: t.noHead ? `${t.columns[k].w * 100}%` : undefined,
                          textAlign: t.columns[k].align === 'c' ? 'center' : 'left',
                          fontWeight: r.bold || (r.keyCol && k === 0) || r.valCol === k || r.tone?.col === k ? 700 : 400,
                          whiteSpace: 'pre-line',
                          fontStyle: r.refCol === k ? 'italic' : 'normal',
                          color: r.tone?.col === k ? TONE_CSS[r.tone.color][0] : r.flag === k ? '#bd1a1a' : r.refCol === k ? '#617086' : r.valCol === k ? '#153963' : undefined,
                          background: r.tone?.col === k ? TONE_CSS[r.tone.color][1] : r.flag === k ? '#fdebeb' : r.keyCol && k === 0 ? '#f1f5fb' : undefined,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {sec.legend?.map((l, k) => (
              <div key={k} style={{ fontStyle: 'italic', color: '#617086', fontSize: '6.4pt', marginTop: k ? 0 : 3 }}>
                {l}
              </div>
            ))}
          </div>
        );
      })}

      {sheet.signatures !== false && (
      <table className="sig" style={{ marginTop: 10, breakInside: 'avoid' }}>
        <tbody>
          <tr>
            {[
              ['PREPARED BY', project.preparedBy, project.date],
              ['CHECKED BY', project.checkedBy],
              ['APPROVED BY', project.approvedBy],
            ].map(([role, name, date]) => (
              <td key={role} style={{ width: '33.3%' }}>
                <div style={{ background: '#153963', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: '7.4pt', padding: '2pt' }}>{role}</div>
                {[
                  ['Name', name],
                  ['Signature', ''],
                  ['Date', date ? fmtDate(date) : ''],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 6, padding: '6pt 6pt 2pt', fontSize: '7pt' }}>
                    <span style={{ color: '#617086', width: 42 }}>{k}:</span>
                    <span style={{ flex: 1, borderBottom: '0.5pt solid #bcc9db', fontWeight: 700, minHeight: 10 }}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 4 }} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      )}
    </div>
  );
}

const HdrCell = ({ k, v }) => (
  <td>
    <span style={{ color: '#617086' }}>{k}: </span>
    <b>{v || '–'}</b>
  </td>
);

export function SheetPreviewModal({ open, onClose, sheet, project }) {
  const [busy, setBusy] = useState(false);
  const { getLogo } = useStore();
  const download = async () => {
    setBusy(true);
    try {
      const bytes = await buildCalcSheetPdf(sheet, project, await getLogo());
      downloadBytes(bytes, `${safeName(sheet.tag)}_Hydraulic_Calculation.pdf`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`A4 Calculation Sheet – ${sheet?.tag ?? ''}`}
      footer={
        <>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="btn-primary" onClick={download} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
          </button>
        </>
      }
    >
      <div className="bg-slate-700/40 p-4 sm:p-8">
        <div className="overflow-x-auto">{sheet && <SheetHtml sheet={sheet} project={project} />}</div>
      </div>
      {open && sheet && createPortal(<div className="print-portal"><SheetHtml sheet={sheet} project={project} /></div>, document.body)}
    </Modal>
  );
}

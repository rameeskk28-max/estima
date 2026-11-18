import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, LoaderCircle } from 'lucide-react';
import { Modal, downloadBytes, safeName } from './ui.jsx';
import { buildCalcSheetPdf } from '../lib/pdf/calcSheet.js';
import { fmtDate } from '../lib/pdf/theme.js';
import { useStore } from '../store.jsx';

/** HTML A4 rendering of a calculation sheet – mirrors the pdf-lib layout. */
export function SheetHtml({ sheet, project }) {
  const { logoSrc } = useStore();
  return (
    <div className="a4 mx-auto">
      <table className="hdr">
        <tbody>
          <tr>
            <td rowSpan={3} style={{ width: '42%' }}>
              <img src={logoSrc} alt={project.supplier || 'Supplier'} style={{ height: '8mm', maxWidth: '72mm', objectFit: 'contain', display: 'block' }} />
              <div style={{ fontSize: '6.8pt', fontWeight: 700, color: '#048c3c', marginTop: 2 }}>ENGINEERING CALCULATION SHEET · {sheet.calcType}</div>
            </td>
            <HdrCell k="Project" v={project.projectName} />
            <HdrCell k="Ref No." v={project.refNo} />
          </tr>
          <tr>
            <HdrCell k="Client" v={project.consultant} />
            <HdrCell k="Rev." v={project.revision || '0'} />
          </tr>
          <tr>
            <HdrCell k="Tag" v={sheet.tag} />
            <HdrCell k="Date" v={fmtDate(project.date)} />
          </tr>
        </tbody>
      </table>
      <div style={{ background: '#153963', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: '10.5pt', padding: '4pt' }}>{sheet.docTitle}</div>
      <div style={{ background: '#f1f5fb', border: '0.5pt solid #bcc9db', padding: '2pt 6pt', fontSize: '8pt' }}>
        <span style={{ color: '#617086' }}>Equipment Tag: </span>
        <b style={{ color: '#153963', marginRight: 24 }}>{sheet.tag}</b>
        <span style={{ color: '#617086' }}>Service: </span>
        <b style={{ color: '#153963' }}>{sheet.service}</b>
      </div>

      {sheet.sections.map((sec, si) => (
        <div key={si}>
          <div className="sec-title">{sec.title}</div>
          {sec.type === 'table' && (
            <table className="tbl">
              <thead>
                <tr>
                  {sec.columns.map((c, k) => (
                    <th key={k} style={{ width: sec.widths ? `${sec.widths[k] * 100}%` : sec.columns.length === 3 ? ['58%', '24%', '18%'][k] : undefined }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((r, ri) => (
                  <tr key={ri} style={/^TOTAL/.test(r[0]) ? { fontWeight: 700 } : undefined}>
                    {r.map((cell, k) => (
                      <td key={k} style={k === 1 && sec.title.startsWith('1.') ? { fontWeight: 700 } : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sec.type === 'steps' &&
            sec.steps.map((s, k) => (
              <div className="step" key={k}>
                <div style={{ fontWeight: 700, color: '#153963' }}>
                  <span style={{ color: '#048c3c', display: 'inline-block', width: 26 }}>
                    {sec.title.match(/^(\d+)/)?.[1]}.{k + 1}
                  </span>
                  {s.title}
                </div>
                <StepLine k="Formula" v={s.formula} style={{ fontStyle: 'italic' }} />
                <StepLine k="Substitution" v={s.subst} />
                <StepLine k="Result" v={s.result} style={{ fontWeight: 700, color: '#153963', background: '#f1f5fb' }} />
              </div>
            ))}
          {sec.type === 'results' && (
            <>
              <table style={{ border: '0.5pt solid #bcc9db' }}>
                <tbody>
                  {sec.rows.map(([a, b], k) => (
                    <tr key={k}>
                      <td style={{ width: '42%', background: '#f1f5fb', border: '0.5pt solid #bcc9db', padding: '3pt 5pt' }}>{a}</td>
                      <td style={{ border: '0.5pt solid #bcc9db', padding: '3pt 5pt', fontWeight: 700, color: '#153963' }}>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 6 }}>
                {(sec.checks || []).map((c, k) => (
                  <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: c.ok ? '#e6f7eb' : '#fdebeb', padding: '3pt 5pt', marginBottom: 3, fontSize: '8pt' }}>
                    <span style={{ background: c.ok ? '#0f7a3d' : '#bd1a1a', color: '#fff', fontWeight: 700, fontSize: '7pt', padding: '1pt 0', width: 42, textAlign: 'center', flexShrink: 0 }}>{c.ok ? 'PASS' : 'CHECK'}</span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {sec.type === 'notes' && (
            <ol style={{ paddingLeft: 18, color: '#617086', fontSize: '7.8pt', listStyle: 'decimal' }}>
              {sec.items.map((n, k) => (
                <li key={k} style={{ marginBottom: 2 }}>
                  {n}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}

      <table className="sig" style={{ marginTop: 14, breakInside: 'avoid' }}>
        <tbody>
          <tr>
            {[
              ['PREPARED BY', project.preparedBy, project.date],
              ['CHECKED BY', project.checkedBy],
              ['APPROVED BY', project.approvedBy],
            ].map(([role, name, date]) => (
              <td key={role} style={{ width: '33.3%' }}>
                <div style={{ background: '#153963', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: '8pt', padding: '2pt' }}>{role}</div>
                {[
                  ['Name', name],
                  ['Signature', ''],
                  ['Date', date ? fmtDate(date) : ''],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 6, padding: '7pt 6pt 2pt', fontSize: '7.5pt' }}>
                    <span style={{ color: '#617086', width: 44 }}>{k}:</span>
                    <span style={{ flex: 1, borderBottom: '0.5pt solid #bcc9db', fontWeight: 700, minHeight: 11 }}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 4 }} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const HdrCell = ({ k, v }) => (
  <td>
    <span style={{ color: '#617086' }}>{k}: </span>
    <b>{v || '–'}</b>
  </td>
);

const StepLine = ({ k, v, style }) => (
  <div style={{ display: 'flex', paddingLeft: 26, marginTop: 1 }}>
    <span style={{ width: 60, color: '#617086', fontSize: '7pt', flexShrink: 0, paddingTop: 1 }}>{k}</span>
    <span style={{ flex: 1, padding: '0 3pt', ...style }}>{v}</span>
  </div>
);

export function SheetPreviewModal({ open, onClose, sheet, project }) {
  const [busy, setBusy] = useState(false);
  const { getLogo } = useStore();
  const download = async () => {
    setBusy(true);
    try {
      const bytes = await buildCalcSheetPdf(sheet, project, await getLogo());
      downloadBytes(bytes, `${safeName(sheet.tag)}_Calculation_Sheet.pdf`);
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

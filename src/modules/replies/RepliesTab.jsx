import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareReply, Plus, Copy, Trash2, Download, LoaderCircle, ArrowUp, ArrowDown, ClipboardPaste, Paperclip, History, Stamp, Eye, FileText, X, ImagePlus } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Field, TextField, Modal, downloadBytes, safeName } from '../../components/ui.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';
import { SheetHtml } from '../../components/SheetPreview.jsx';
import { REPLY_STATUS, APPROVAL_STATUS, newComment, newAnnexure, annexureLabel, annexureSlot, prevSlot, replySheet } from '../../lib/replies.js';
import { buildReplyPdf } from '../../lib/pdf/replyPdf.js';

const TONE = { green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400', red: 'border-red-500/40 bg-red-500/10 text-red-400', blue: 'border-navy-400/40 bg-navy-500/10 text-navy-400' };

export function RepliesTab() {
  const { replies, addReply } = useStore();
  const [sel, setSel] = useState(() => replies[0]?.id || null);
  const current = replies.find((r) => r.id === sel) || replies[0] || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <MessageSquareReply className="text-brand-400" size={22} /> Consultant Comment Replies
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Answer the consultant's comments for a submittal revision – status and annexure reference per comment, attach the annexures and the previous submittal, and download one combined A4 PDF in the Greenland sheet format.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setSel(addReply())}>
          <Plus size={16} /> New comment reply
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Card title={`Replies (${replies.length})`} icon={History} bodyClass="p-2 space-y-1">
            {!replies.length && <p className="p-2 text-xs text-slate-500">No replies yet – click “New comment reply”.</p>}
            {replies.map((r) => {
              const n = r.comments.filter((c) => c.comment).length;
              return (
                <button key={r.id} onClick={() => setSel(r.id)} className={`w-full rounded-xl border px-3 py-2 text-left transition ${current?.id === r.id ? 'border-brand-500 bg-brand-500/10' : 'border-transparent hover:bg-ink-800'}`}>
                  <div className="truncate text-sm font-semibold text-slate-100">{r.marNo || 'MAR No. not set'}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    Rev. {r.rev || '–'} · {n} comment{n === 1 ? '' : 's'} · {r.annexures.length} annexure{r.annexures.length === 1 ? '' : 's'}
                  </div>
                </button>
              );
            })}
          </Card>
        </aside>
        {current ? <Editor key={current.id} reply={current} onSelect={setSel} /> : <Empty onNew={() => setSel(addReply())} />}
      </div>
    </div>
  );
}

function Empty({ onNew }) {
  return (
    <div className="card flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl p-8 text-center">
      <MessageSquareReply size={40} className="text-brand-400" />
      <div className="font-display text-xl font-bold text-slate-50">Reply to consultant comments</div>
      <p className="max-w-md text-sm text-slate-400">Create a reply for a returned submittal (e.g. “Revise & Resubmit”). Each comment gets your reply, a status (Comply / Partially Comply / Deviation / Noted) and an annexure reference.</p>
      <button className="btn-primary mt-2" onClick={onNew}>
        <Plus size={16} /> New comment reply
      </button>
    </div>
  );
}

function Editor({ reply, onSelect }) {
  const { updateReply, removeReply, addReply, project, getLogo, files, notify, stamp } = useStore();
  const set = (patch) => updateReply(reply.id, patch);
  const [busy, setBusy] = useState('');
  const [paste, setPaste] = useState(false);

  const setComments = (fn) => set((r) => ({ comments: fn(r.comments) }));
  const updComment = (id, patch) => setComments((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (list, k, d) => {
    const c = [...list];
    const j = k + d;
    if (j < 0 || j >= c.length) return list;
    [c[k], c[j]] = [c[j], c[k]];
    return c;
  };

  const download = async () => {
    setBusy('Preparing…');
    try {
      const { bytes, warnings, pageCount } = await buildReplyPdf(reply, project, { logo: await getLogo(), stamp, files, onProgress: setBusy });
      downloadBytes(bytes, `${safeName(reply.marNo || 'Comment_Reply')}_Rev${safeName(reply.rev || '')}_Comment_Reply.pdf`);
      notify(warnings.length ? warnings[0] : `Comment reply downloaded – ${pageCount} A4 pages`, warnings.length ? 'bad' : 'ok');
    } catch (e) {
      console.error(e);
      notify(`Could not create PDF: ${e.message}`, 'bad');
    } finally {
      setBusy('');
    }
  };

  const nextRevision = () => {
    const nextRev = String((parseInt(reply.rev, 10) || 0) + 1).padStart(String(reply.rev || '00').length, '0');
    const annMap = {};
    const annexures = reply.annexures.map((a) => {
      const na = newAnnexure({ desc: a.desc });
      annMap[a.id] = na.id;
      return na;
    });
    const id = addReply({ ...reply, rev: nextRev, replyDate: new Date().toISOString().slice(0, 10), annexures, comments: reply.comments.map((c) => newComment({ comment: c.comment, reply: c.reply, status: c.status, annexure: annMap[c.annexure] || '' })) });
    onSelect(id);
    notify(`Revision ${nextRev} created – attach the updated annexures`);
  };

  const counts = useMemo(() => Object.fromEntries(Object.keys(REPLY_STATUS).map((k) => [k, reply.comments.filter((c) => c.comment && c.status === k).length])), [reply.comments]);

  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0 space-y-4">
        <div className="card flex flex-wrap items-center gap-2 rounded-2xl p-3">
          {Object.entries(REPLY_STATUS).map(([k, s]) => (
            <span key={k} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${TONE[s.tone]}`}>
              {s.label}: {counts[k]}
            </span>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost !py-1.5 text-xs" onClick={nextRevision} title="Copy this reply as the next revision">
              <Copy size={14} /> Next revision
            </button>
            <button className="btn-ghost !py-1.5 text-xs hover:!text-red-400" onClick={async () => confirm('Delete this comment reply and its attached files?') && (await removeReply(reply.id))}>
              <Trash2 size={14} /> Delete
            </button>
            <button className="btn-primary !py-1.5" onClick={download} disabled={!!busy}>
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />} {busy || 'Download combined PDF'}
            </button>
          </div>
        </div>

        <Card title="1. Submittal / MAR Details" icon={FileText}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="Document title" value={reply.title} onChange={(v) => set({ title: v })} className="sm:col-span-2 lg:col-span-4" />
            <TextField label="Item / tag (header)" value={reply.tag} onChange={(v) => set({ tag: v })} placeholder="e.g. CONTROL PANEL" />
            <TextField label="Submittal / subject" value={reply.subject} onChange={(v) => set({ subject: v })} className="lg:col-span-3" placeholder="e.g. Pump control panels – booster, transfer & sump" />
            <TextField label="MAR No." value={reply.marNo} onChange={(v) => set({ marNo: v })} placeholder="DSBC-EAS-VH-MAR-MECH-002" className="sm:col-span-2" />
            <TextField label="Rev." value={reply.rev} onChange={(v) => set({ rev: v })} />
            <Field label="Approval-status annotation">
              <input list="approval-list" className="field" value={reply.approvalStatus} onChange={(e) => set({ approvalStatus: e.target.value })} />
              <datalist id="approval-list">
                {APPROVAL_STATUS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>
            <TextField label="MAR date" type="date" value={reply.marDate} onChange={(v) => set({ marDate: v })} />
            <TextField label="Reply date" type="date" value={reply.replyDate} onChange={(v) => set({ replyDate: v })} />
            <TextField label="Trade" value={reply.trade} onChange={(v) => set({ trade: v })} placeholder="e.g. Mechanical / Electrical" className="sm:col-span-2" />
            <TextField label="Consultant's Eng." value={reply.consultantEng} onChange={(v) => set({ consultantEng: v })} />
            <TextField label="Consultant's MEP Eng." value={reply.consultantMepEng} onChange={(v) => set({ consultantMepEng: v })} />
            <TextField label="Consultant's representative" value={reply.consultantRep} onChange={(v) => set({ consultantRep: v })} className="sm:col-span-2" />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Project, client, consultant and contractor come from Submittal Package → Project Header ({project.projectName || 'not set yet'}).
          </p>
        </Card>

        <Card
          title={`2. Consultant Comments & Replies (${reply.comments.length})`}
          icon={MessageSquareReply}
          bodyClass="p-3 space-y-3"
          actions={
            <>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setPaste(true)}>
                <ClipboardPaste size={14} /> Paste comments
              </button>
              <button className="btn-secondary !py-1 text-xs" onClick={() => setComments((cs) => [...cs, newComment({ annexure: reply.annexures[0]?.id || '' })])}>
                <Plus size={14} /> Add comment
              </button>
            </>
          }
        >
          {reply.comments.map((c, k) => {
            const tone = REPLY_STATUS[c.status]?.tone || 'blue';
            return (
              <div key={c.id} className="rounded-xl border border-line bg-ink-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-sm font-bold text-brand-400">{k + 1}</span>
                  <select className={`field !w-auto !py-1 text-xs font-semibold ${TONE[tone]}`} value={c.status} onChange={(e) => updComment(c.id, { status: e.target.value })} aria-label="Status">
                    {Object.entries(REPLY_STATUS).map(([v, s]) => (
                      <option key={v} value={v}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select className="field !w-auto !py-1 text-xs" value={c.annexure} onChange={(e) => updComment(c.id, { annexure: e.target.value })} aria-label="Annexure reference">
                    <option value="">No annexure</option>
                    {reply.annexures.map((a) => (
                      <option key={a.id} value={a.id}>
                        {annexureLabel(reply, a.id)}
                        {a.desc ? ` – ${a.desc.slice(0, 30)}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex">
                    <button className="btn-ghost !p-1" onClick={() => setComments((cs) => move(cs, k, -1))} disabled={k === 0} aria-label="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn-ghost !p-1" onClick={() => setComments((cs) => move(cs, k, 1))} disabled={k === reply.comments.length - 1} aria-label="Move down">
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => setComments((cs) => cs.filter((x) => x.id !== c.id))} aria-label="Delete comment">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Consultant comment">
                    <textarea className="field text-sm" rows={3} value={c.comment} onChange={(e) => updComment(c.id, { comment: e.target.value })} />
                  </Field>
                  <Field label="Greenland reply / action">
                    <textarea className="field text-sm" rows={3} value={c.reply} onChange={(e) => updComment(c.id, { reply: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Noted and complied.', 'Complied – revised drawing attached.', 'Complied – compliance statement attached.', 'Noted.'].map((q) => (
                    <button key={q} className="glass-pill rounded-full px-2.5 py-0.5 text-[11px] text-slate-400 hover:text-brand-400" onClick={() => updComment(c.id, { reply: c.reply ? `${c.reply} ${q}` : q })}>
                      + {q}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>

        <Card
          title={`3. Annexures (${reply.annexures.length})`}
          icon={Paperclip}
          bodyClass="p-3 space-y-3"
          actions={
            <button className="btn-secondary !py-1 text-xs" onClick={() => set((r) => ({ annexures: [...r.annexures, newAnnexure()] }))}>
              <Plus size={14} /> Add annexure
            </button>
          }
        >
          {!reply.annexures.length && <p className="text-xs text-slate-500">No annexures – add one for drawings, compliance statements, catalogues…</p>}
          {reply.annexures.map((a, k) => (
            <div key={a.id} className="rounded-xl border border-line bg-ink-950/40 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#7f0d0d]/15 px-2 py-1 text-xs font-bold text-red-400">{annexureLabel(reply, a.id)}</span>
                <input className="field min-w-[200px] flex-1 !py-1" value={a.desc} placeholder="Description – e.g. Revised control panel drawings" onChange={(e) => set((r) => ({ annexures: r.annexures.map((x) => (x.id === a.id ? { ...x, desc: e.target.value } : x)) }))} aria-label="Annexure description" />
                <button className="btn-ghost !p-1" onClick={() => set((r) => ({ annexures: move(r.annexures, k, -1) }))} disabled={k === 0} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button className="btn-ghost !p-1" onClick={() => set((r) => ({ annexures: move(r.annexures, k, 1) }))} disabled={k === reply.annexures.length - 1} aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button
                  className="btn-ghost !p-1 hover:!text-red-400"
                  aria-label="Delete annexure"
                  onClick={() => {
                    if (!confirm(`Remove ${annexureLabel(reply, a.id)}? Comments referring to it will show “No annexure”.`)) return;
                    set((r) => ({ annexures: r.annexures.filter((x) => x.id !== a.id), comments: r.comments.map((c) => (c.annexure === a.id ? { ...c, annexure: '' } : c)) }));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <FileSlot slotId={annexureSlot(reply, a)} label={`Attach PDF(s) for ${annexureLabel(reply, a.id)}`} />
            </div>
          ))}
          <p className="text-[11px] text-slate-500">Annexures are numbered automatically in this order. Each gets a divider page in the combined PDF.</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="4. Previous Submittal (attached at the end)" icon={History}>
            <FileSlot slotId={prevSlot(reply)} label="Attach previous submittal PDF" />
            <p className="mt-2 text-[11px] text-slate-500">Tip: compile it in Submittal Package → “Compile & Download”, then attach that PDF here.</p>
          </Card>
          <StampCard reply={reply} set={set} />
        </div>
      </div>

      <LivePreview reply={reply} project={project} stamp={stamp} files={files} />

      <PasteModal
        open={paste}
        onClose={() => setPaste(false)}
        onAdd={(list) => {
          setComments((cs) => [...cs.filter((c) => c.comment || c.reply), ...list.map((t) => newComment({ comment: t, annexure: reply.annexures[0]?.id || '' }))]);
          setPaste(false);
          notify(`${list.length} comment(s) added`);
        }}
      />
    </div>
  );
}

function StampCard({ reply, set }) {
  const { stamp, setStamp, notify } = useStore();
  const ref = useRef(null);
  const onFile = (f) => {
    if (!f || !/image\/(png|jpe?g)/.test(f.type)) return notify('Stamp must be PNG or JPG', 'bad');
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const sc = Math.min(1, 700 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc);
      c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setStamp(c.toDataURL('image/png'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  return (
    <Card title="5. Company Stamp" icon={Stamp}>
      <div className="flex items-center gap-3">
        <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-white">
          {stamp ? <img src={stamp} alt="Company stamp" className="h-full w-full object-contain p-1" /> : <Stamp className="text-slate-400" size={26} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => ref.current?.click()}>
            <ImagePlus size={14} /> {stamp ? 'Replace stamp' : 'Upload stamp'}
          </button>
          {stamp && (
            <button className="btn-ghost !py-1 text-xs hover:!text-red-400" onClick={() => setStamp(null)}>
              <X size={13} /> Remove
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" className="accent-brand-500" checked={reply.showStamp !== false} onChange={(e) => set({ showStamp: e.target.checked })} /> Print on this reply
          </label>
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Uploaded once – used on every reply. A PNG with transparent background looks best.</p>
    </Card>
  );
}

function LivePreview({ reply, project, stamp, files }) {
  const pageCounts = Object.fromEntries(reply.annexures.map((a) => [a.id, (files[annexureSlot(reply, a)] || []).reduce((s, f) => s + (f.pages || 0), 0)]));
  const prevPages = (files[prevSlot(reply)] || []).reduce((s, f) => s + (f.pages || 0), 0);
  const sheet = useMemo(() => replySheet(reply, project, { stampSrc: stamp, pageCounts, prevPages }), [reply, project, stamp, JSON.stringify(pageCounts), prevPages]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e.contentRect.width - 16) / 794)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <aside className="2xl:sticky 2xl:top-24 2xl:self-start">
      <Card title="Live preview – reply sheet" icon={Eye} bodyClass="p-0">
        <div ref={boxRef} className="max-h-[780px] overflow-auto rounded-b-2xl bg-slate-500/20 p-2">
          <div style={{ width: 794 * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}>
              <SheetHtml sheet={sheet} project={project} />
            </div>
          </div>
        </div>
        <p className="px-3 py-2 text-[11px] text-slate-500">The download adds annexure dividers, the annexure PDFs and the previous submittal after this sheet.</p>
      </Card>
    </aside>
  );
}

/** Paste a block of consultant comments – numbered lines or paragraphs become separate comments. */
function PasteModal({ open, onClose, onAdd }) {
  const [text, setText] = useState('');
  const items = useMemo(() => {
    const t = text.replace(/\r/g, '').trim();
    if (!t) return [];
    const numbered = t.split(/\n(?=\s*\d+[.)-]\s)/);
    const parts = numbered.length > 1 ? numbered : t.split(/\n\s*\n/);
    return parts.map((p) => p.replace(/^\s*\d+[.)-]\s*/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  }, [text]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paste consultant comments"
      footer={
        <button className="btn-primary" disabled={!items.length} onClick={() => (onAdd(items), setText(''))}>
          Add {items.length || ''} comment{items.length === 1 ? '' : 's'}
        </button>
      }
    >
      <div className="space-y-2 p-4">
        <p className="text-xs text-slate-400">Paste the comments from the consultant's MAR. Numbered items (1. 2. 3.) or paragraphs separated by a blank line become separate comments.</p>
        <textarea className="field text-sm" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. Revise the control panel enclosure to IP55 GRP…\n2. Submit compliance to specifications…'} />
        {items.length > 0 && <p className="text-xs text-brand-400">{items.length} comment(s) detected.</p>}
      </div>
    </Modal>
  );
}

import { useRef, useState } from 'react';
import { FileText, ArrowUp, ArrowDown, X, Upload, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useStore } from '../store.jsx';
import { countPdfPages } from '../lib/pdf/compile.js';

/** PDF upload slot (multi-file, drag & drop, reorder). Files are kept in IndexedDB under `slotId`. */
export function FileSlot({ slotId, label = 'Attach PDF documents', compact }) {
  const { files, addFiles, removeFile, moveFile, notify } = useStore();
  const list = files[slotId] || [];
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const ingest = async (fileList) => {
    const pdfs = [...fileList].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdfs.length < fileList.length) notify('Only PDF files are accepted', 'bad');
    if (!pdfs.length) return;
    setBusy(true);
    const recs = [];
    for (const f of pdfs) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      try {
        const { pages, encrypted } = await countPdfPages(bytes);
        recs.push({ name: f.name, size: f.size, pages, encrypted, bytes });
      } catch (err) {
        notify(`${f.name}: not a readable PDF (${err.message})`, 'bad');
      }
    }
    await addFiles(slotId, recs);
    setBusy(false);
  };

  return (
    <div>
      {list.map((f, k) => (
        <div key={f.id} className="mb-1.5 flex items-center gap-2 rounded-md border border-line bg-ink-850 px-2.5 py-1.5 text-xs">
          <FileText size={14} className="shrink-0 text-red-300" />
          <span className="truncate text-slate-200" title={f.name}>
            {f.name}
          </span>
          <span className="shrink-0 text-slate-500">
            {f.pages} p · {(f.size / 1024 / 1024).toFixed(2)} MB
          </span>
          {f.encrypted && (
            <span className="flex items-center gap-1 text-amber-300" title="Protected PDF – pages may render blank">
              <TriangleAlert size={12} /> protected
            </span>
          )}
          <div className="ml-auto flex shrink-0">
            <button className="btn-ghost !p-0.5" onClick={() => moveFile(slotId, f.id, -1)} disabled={k === 0} aria-label="Move file up">
              <ArrowUp size={13} />
            </button>
            <button className="btn-ghost !p-0.5" onClick={() => moveFile(slotId, f.id, 1)} disabled={k === list.length - 1} aria-label="Move file down">
              <ArrowDown size={13} />
            </button>
            <button className="btn-ghost !p-0.5 hover:!text-red-400" onClick={() => removeFile(slotId, f.id)} aria-label="Remove file">
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          ingest(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs transition ${drag ? 'border-brand-400 bg-brand-500/10 text-brand-200' : 'border-line text-slate-400 hover:border-brand-600 hover:text-slate-200'}`}
      >
        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
        {label} – click or drop
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            ingest(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}


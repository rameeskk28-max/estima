// Browser-side DWG reader (LibreDWG compiled to WebAssembly, loaded only when a drawing is opened).
import { flattenDwg } from './flatten.js';

let libPromise = null;
async function loadLib() {
  if (!libPromise)
    libPromise = (async () => {
      // the package does not export its .wasm path, so it is referenced directly
      const [{ LibreDwg, createModule }, wasm] = await Promise.all([
        import('@mlightcad/libredwg-web'),
        import('../../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm?url'),
      ]);
      const instance = await createModule({ locateFile: () => wasm.default });
      return LibreDwg.createByWasmInstance(instance);
    })();
  return libPromise;
}

/**
 * @param {File} file  .dwg
 * @returns {Promise<ReturnType<typeof flattenDwg>>}
 */
export async function readDwgFile(file) {
  if (!/\.dwg$/i.test(file.name)) throw new Error('Please upload an AutoCAD .dwg file (PDF reading is not supported yet).');
  const lib = await loadLib();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const dwg = lib.dwg_read_data(bytes, Dwg_File_Type.DWG);
  if (!dwg) throw new Error('This DWG could not be read. Save it as AutoCAD 2018 (or older) DWG and try again.');
  try {
    const db = lib.convert(dwg);
    return flattenDwg(db);
  } finally {
    try {
      lib.dwg_free(dwg);
    } catch {
      /* ignore */
    }
  }
}

/** Floor levels written on a riser diagram ("ROOF", "9th FLOOR", "PODIUM-2", "GROUND FLOOR", "BASEMENT"…), bottom → top. */
export function levelsFromTexts(texts) {
  const re = /^(ROOF|UPPER ROOF|LOWER ROOF|BASEMENT(\s*(FLOOR|\d+|-\s*\d+))?|B\d|GROUND(\s*FLOOR)?|G\.?F\.?|MEZZ\w*(\s*FLOOR)?|PODIUM[\s-]*\d+|P\d|\d+(ST|ND|RD|TH)\s*FLOOR|LEVEL[\s-]*\d+|L\d{1,2}|SERVICE FLOOR|TECHNICAL FLOOR)$/i;
  const byName = new Map();
  for (const t of texts) {
    const name = t.text.trim();
    if (!re.test(name)) continue;
    const k = name.toUpperCase().replace(/\s+/g, ' ');
    const prev = byName.get(k);
    if (!prev || t.x < prev.x) byName.set(k, { name: name.replace(/\s+/g, ' '), y: t.y });
  }
  return [...byName.values()].sort((a, b) => a.y - b.y).map((l) => l.name);
}

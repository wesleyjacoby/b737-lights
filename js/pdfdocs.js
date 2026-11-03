// Opens the stored PDFs with pdf.js and finds the page for a reference.
// A reference holds the bookmark title and the page it had when it was checked. The page is looked up
// by title in the PDF's own bookmarks, so links survive a revision as long as the title is unchanged.

import { files } from './store.js';

const loaded = {}; // id -> { pdf, outline: [{ title, dest }] }
let workerReady = null;

function initWorker() {
  if (!workerReady) {
    workerReady = Promise.resolve().then(function () {
      if (!window.pdfjsLib) throw new Error('pdf.js did not load');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    });
  }
  return workerReady;
}

function flatten(items, out) {
  (items || []).forEach(function (it) { out.push({ title: it.title || '', dest: it.dest }); flatten(it.items, out); });
  return out;
}

export function forget(id) { delete loaded[id]; }

export async function openDoc(id) {
  if (loaded[id]) return loaded[id];
  const f = files[id];
  if (!f) return null;
  await initWorker();
  const buf = await f.blob.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let outline = [];
  try { outline = flatten(await pdf.getOutline(), []); } catch (e) { outline = []; }
  loaded[id] = { pdf: pdf, outline: outline };
  return loaded[id];
}

function norm(s) { return String(s).replace(/\s+/g, ' ').trim().toLowerCase(); }

async function destPage(pdf, dest) {
  try {
    const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!d || !d[0]) return null;
    return (typeof d[0] === 'object') ? (await pdf.getPageIndex(d[0])) + 1 : d[0] + 1;
  } catch (e) { return null; }
}

export async function resolveRef(id, ref) {
  const d = await openDoc(id);
  const anchor = ref.anchorPage || ref.page;
  const offset = ref.page - anchor;
  const want = norm(ref.title);
  const cands = d.outline.filter(function (o) { return norm(o.title) === want; });
  let best = null;
  for (const c of cands) {
    const p = await destPage(d.pdf, c.dest);
    if (p && (best === null || Math.abs(p - anchor) < Math.abs(best - anchor))) best = p;
  }
  const n = d.pdf.numPages;
  if (best !== null) return { page: Math.min(n, Math.max(1, best + offset)), how: 'bookmark', n: n };
  return { page: Math.min(n, Math.max(1, ref.page)), how: 'hint', n: n };
}

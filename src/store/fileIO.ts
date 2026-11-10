import type { Doc } from '../engine/types';
import { parseDocFile, serializeDoc, suggestedFileName } from './docFile';

interface WritableHandle {
  name: string;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}
type SavePicker = (opts: unknown) => Promise<WritableHandle>;

let handle: WritableHandle | null = null;

export function forgetFileHandle() {
  handle = null;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Saves the document; returns the file name, or null if the user cancelled. */
export async function saveDocToFile(doc: Doc, saveAs = false): Promise<string | null> {
  const text = serializeDoc(doc);
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      if (!handle || saveAs) {
        handle = await picker({
          suggestedName: suggestedFileName(doc),
          types: [{ description: 'Ochiq Hisob fayli', accept: { 'application/json': ['.ohisob'] } }],
        });
      }
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return handle.name;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      handle = null;
    }
  }
  const name = suggestedFileName(doc);
  downloadBlob(new Blob([text], { type: 'application/json' }), name);
  return name;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function openDocFile(): Promise<{ doc: Doc; name: string } | null> {
  const f = await pickFile('.ohisob,.json');
  if (!f) return null;
  handle = null;
  return { doc: parseDocFile(await f.text()), name: f.name };
}

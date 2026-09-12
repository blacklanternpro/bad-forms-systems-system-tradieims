import { api } from "../api";

/** Capture outbox: when the yard has no signal, captures queue on the device and
    replay when the network returns. Files are held as data URLs — receipts and
    dockets are small; drawings never go through here. */

export interface QueuedCapture {
  id: string;
  capture_type: string;
  job_id: string;
  filename: string | null;
  data_url: string | null;
  queued_at: string;
}

const KEY = "bf_outbox";

export function pending(): QueuedCapture[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedCapture[];
  } catch {
    return [];
  }
}

function save(items: QueuedCapture[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export async function queueCapture(captureType: string, jobId: string, file: File | null): Promise<void> {
  const items = pending();
  items.push({
    id: crypto.randomUUID(),
    capture_type: captureType,
    job_id: jobId,
    filename: file?.name ?? null,
    data_url: file ? await fileToDataUrl(file) : null,
    queued_at: new Date().toISOString(),
  });
  save(items);
}

/** True when the failure is the network being down (queue it), not the server
    rejecting the request (surface it). */
export function isOffline(err: unknown): boolean {
  return err instanceof TypeError;
}

/** Replays the queue in order; stops at the first network failure so nothing is
    lost. Returns how many captures made it through. */
export async function flush(): Promise<number> {
  let sent = 0;
  let items = pending();
  while (items.length > 0) {
    const item = items[0];
    const form = new FormData();
    form.set("capture_type", item.capture_type);
    form.set("job_id", item.job_id);
    if (item.data_url && item.filename) {
      form.set("file", await dataUrlToFile(item.data_url, item.filename));
    }
    try {
      await api("/captures", { form });
    } catch (err) {
      if (isOffline(err)) break;
      // Server rejected it — drop rather than wedge the queue forever.
    }
    items = items.slice(1);
    save(items);
    sent += 1;
  }
  return sent;
}

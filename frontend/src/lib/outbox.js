const DB_NAME = "bf-outbox";
let dbp;

function idb() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("ops", { keyPath: "id" });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  return dbp;
}

export async function queueOp(op) {
  const d = await idb();
  op.id = op.id || crypto.randomUUID();
  op.token = localStorage.getItem("bf_field_token");
  await new Promise((res, rej) => {
    const tx = d.transaction("ops", "readwrite");
    tx.objectStore("ops").put(op);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return op.id;
}

export async function pendingCount() {
  const d = await idb();
  return new Promise((res) => {
    const req = d.transaction("ops").objectStore("ops").count();
    req.onsuccess = () => res(req.result);
  });
}

export async function flush(apiBase) {
  const d = await idb();
  const ops = await new Promise((res) => {
    const req = d.transaction("ops").objectStore("ops").getAll();
    req.onsuccess = () => res(req.result);
  });
  let done = 0;
  for (const op of ops) {
    try {
      const headers = { Authorization: `Bearer ${op.token}` };
      let body;
      if (op.form) {
        body = new FormData();
        for (const [k, v] of Object.entries(op.form)) body.append(k, v);
        if (op.blob) body.append("file", new Blob([op.blob], { type: op.blobType || "image/jpeg" }), "capture.jpg");
        body.append("client_id", op.id);
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ ...op.json, client_id: op.id });
      }
      const resp = await fetch(`${apiBase}${op.url}`, { method: "POST", headers, body });
      if (resp.ok || resp.status === 400 || resp.status === 404 || resp.status === 409) {
        await new Promise((res) => {
          const tx = d.transaction("ops", "readwrite");
          tx.objectStore("ops").delete(op.id);
          tx.oncomplete = res;
        });
        done++;
      }
    } catch (e) {
      break; // still offline
    }
  }
  return done;
}

export function compressImage(file, maxEdge = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
